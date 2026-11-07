import { useState, useEffect, useRef } from "react";
import { API, STORAGE } from "../config.js";
import { Modal, Icon, Msg, Spinner, PRE_REQUIREMENTS, DURING_REQUIREMENTS, POST_REQUIREMENTS, liveRefresh, outputRequired } from "../components/DashKit.jsx";

/* Blank forms and templates.
   manage = false: the intern's list (open / print what the coordinator provided).
   manage = true : the OJT coordinator's list (upload a form for a requirement, add any other template or
                   document, write notes, remove files).
   One phase at a time (Pre · During · Post · Other files), one clear row per requirement:
   the requirement on the left, its files on the right. */

// the department's wording for each requirement (shown under its name)
const DESC = {
  capstone_summary: "Proof that you completed all course requirements, including the Thesis/Capstone (at least 70% of the curriculum, CHED CMO 25 s. 2015). Subject to the Department Chairperson's evaluation.",
  letter_of_intent: "Application letter submitted to the HTE. Attach your CV.",
  endorsement_letter: "Given to the HTE once you are accepted. Signed by the SIP Coordinator, noted by the Chairperson and the College Dean.",
  moa: "Signed by both parties before deployment. Long bond paper, 7 copies, notarized.",
  internship_contract: "Your obligations, the HTE's rules and the legal responsibilities. 3 copies, notarized, long bond paper.",
  pledge: "Signed in the presence of the SIP Coordinator.",
  acceptance_form: "Signed by your parent/guardian and the HTE representative.",
  parents_consent: "Long bond paper, notarized.",
  internship_plan: "Your objectives and activities. Signed by the Department Chairperson, SIP Coordinator and HTE Supervisor.",
  medical_certificate: "With CBC, signed by the university physician.",
  personal_history: "Personal History Statement.",
  insurance: "Scanned copy of any insurance.",
  orientation: "Internship Deployment Orientation.",
  supervisor_feedback_form: "Given to your supervisor at the start; used to monitor and grade you throughout the internship.",
  performance_appraisal: "Given in the last week; your HTE supervisor's final rating of your performance.",
  narrative_report: "Written in the 3rd person.",
};

// Pre-internship keeps the department's numbering: 1 to 5, then 6 is a group (a to g, done while the
// MOA and the contract are in progress, in any order), then 7.
// rows: [number, key] · [number, null, group heading] · [letter, key] for the items under a group
// the department's group "6": these can be done while the MOA and contract are in progress (shown as a to g)
const GROUP6 = ["pledge", "acceptance_form", "parents_consent", "internship_plan", "medical_certificate", "personal_history", "insurance"];
const LETTERS = "abcdefghijklmnopqrstuvwxyz";
// built each time from the current list (the coordinator can add, remove or reorder requirements):
// pre-internship numbers its items 1, 2, 3…; the group-6 items sit together under one number with letters
const preRows = () => {
  const rows = [];
  let n = 0;
  let groupShown = false;
  const group = GROUP6.filter((k) => PRE_REQUIREMENTS.some((r) => r.key === k));   // department order (a to g)
  PRE_REQUIREMENTS.forEach((r) => {
    if (!GROUP6.includes(r.key)) { rows.push([String(++n), r.key]); return; }
    if (groupShown) return;          // the whole group goes where its first item is
    groupShown = true;
    rows.push([String(++n), null, `While the MOA and the Student Internship Contract are in progress, do ${group.length > 1 ? `a to ${LETTERS[group.length - 1]}` : "a"} (any order):`]);
    group.forEach((k, i) => rows.push([LETTERS[i], k]));
  });
  return rows;
};
const numbered = (list) => list.map((r, i) => [String(i + 1), r.key]);
// skipOutput: the intern's HTE doesn't require a System Output Presentation (it is not listed for them)
const phases = (skipOutput = false) => [
  { key: "pre", label: "Pre-internship", rows: preRows() },
  { key: "during", label: "During internship", rows: numbered(DURING_REQUIREMENTS) },
  { key: "post", label: "Post-internship", rows: numbered(POST_REQUIREMENTS.filter((r) => !(skipOutput && r.key === "system_output"))) },
];
const REQ = (k) => [...PRE_REQUIREMENTS, ...DURING_REQUIREMENTS, ...POST_REQUIREMENTS].find((r) => r.key === k);

// requirements that have no blank form: what the intern does instead
const NO_FORM = {
  insurance: "No form needed. Upload a scanned copy of your own insurance.",
  orientation: "No form needed. Your attendance at the orientation is the proof.",
};

const ext = (n) => String(n || "").split(".").pop().toUpperCase().slice(0, 4);
const kind = (n) => { const e = ext(n); return e.startsWith("DOC") ? "doc" : e.startsWith("XLS") ? "xls" : e.startsWith("PPT") ? "ppt" : "pdf"; };
const DEFAULT_NOTE = "Not every requirement has a form. Only the forms your OJT coordinator has provided can be opened and printed. For the others, follow the instructions under the requirement.";

export default function RequirementForms({ manage = false, onClose, user = null }) {
  const [rows, setRows] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(null);
  const [askDel, setAskDel] = useState(null);
  const [notes, setNotes] = useState({});             // coordinator notes: { requirement key | "__general": text }
  const [edit, setEdit] = useState(null);             // the note being written: { key, label, text }
  const [phase, setPhase] = useState("pre");
  const [add, setAdd] = useState(null);               // "Add a template" window: { title, requirement, file }
  const pick = useRef(null);          // which requirement the quick file picker is for
  const fileRef = useRef(null);

  const load = () => {
    fetch(`${API}/requirement-templates`, { headers: { Accept: "application/json" } })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) setMsg({ type: "error", text: (d && d.message) || "Could not load the forms. Run the latest migrations on the server." });
        const list = Array.isArray(d) ? d : (d && Array.isArray(d.templates) ? d.templates : []);
        setRows(list);
        setNotes(d && !Array.isArray(d) && d.notes && typeof d.notes === "object" ? d.notes : {});
      })
      .catch(() => setRows([]));
  };
  // live: a note, a "no form needed" text or a new file from the coordinator shows without refreshing
  useEffect(() => { load(); return liveRefresh(load); }, []);

  // one upload for both ways in: the "Upload" button on a requirement, and the "Add a template" window
  const send = async ({ file, title, requirement }, busyKey) => {
    if (!file) return false;
    setBusy(busyKey); setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", title);
      if (requirement) fd.append("requirement", requirement);
      const res = await fetch(`${API}/coordinator/requirement-templates`, { method: "POST", headers: { Accept: "application/json" }, body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || (d.errors && Object.values(d.errors)[0]?.[0]) || "Could not upload the file.");
      setMsg({ type: "success", text: `"${title}" uploaded. Interns can open it now.` });
      load();
      return true;
    } catch (e) {
      setMsg({ type: "error", text: e instanceof TypeError ? "Couldn't reach the server." : e.message });
      return false;
    } finally { setBusy(null); if (fileRef.current) fileRef.current.value = ""; }
  };
  const quickUpload = (file) => { const r = pick.current; if (r) send({ file, title: r.label, requirement: r.key }, r.key); };

  const remove = async (t) => {
    setBusy(`d${t.id}`); setMsg(null);
    try {
      const res = await fetch(`${API}/coordinator/requirement-templates/${t.id}`, { method: "DELETE", headers: { Accept: "application/json" } });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || "Could not remove it.");
      setAskDel(null); load();
    } catch (e) {
      setMsg({ type: "error", text: e instanceof TypeError ? "Couldn't reach the server." : e.message });
    } finally { setBusy(null); }
  };

  const putNote = async (key, text) => {
    setBusy(`n${key}`); setMsg(null);
    try {
      const res = await fetch(`${API}/coordinator/requirement-form-notes`, {
        method: "PUT", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ requirement: key, note: text }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || (d.errors && Object.values(d.errors)[0]?.[0]) || "Could not save the note.");
      setEdit(null); load();
    } catch (e) {
      setMsg({ type: "error", text: e instanceof TypeError ? "Couldn't reach the server." : e.message });
    } finally { setBusy(null); }
  };

  const filesOf = (key) => (rows || []).filter((t) => t.requirement === key);
  // "No form needed" and its instruction are kept with the notes, under "noform:<requirement>"
  // ("__off__" turns off the built-in "no form" text of Insurance / Orientation, so it shows "Not available yet")
  const NF = (key) => `noform:${key}`;
  const noFormText = (key) => {
    const v = notes[NF(key)];
    if (v === "__off__") return null;
    return v || NO_FORM[key] || null;
  };
  // what the coordinator picked for a requirement
  const formChoice = (key) => (filesOf(key).length ? "form" : noFormText(key) ? "none" : "wait");
  const choose = (r, v) => {
    if (v === "form") { pick.current = r; fileRef.current?.click(); return; }
    if (v === "none") { setEdit({ key: NF(r.key), label: r.label, noform: true, text: noFormText(r.key) || "No form needed. " }); return; }
    // not available yet: drop the instruction (and turn off a built-in one)
    putNote(NF(r.key), NO_FORM[r.key] ? "__off__" : "");
  };
  // files not tied to a listed requirement: the "Other files" tab
  const others = (rows || []).filter((t) => !t.requirement || !REQ(t.requirement));
  const countIn = (p) => p.rows.reduce((n, [, key]) => n + (key ? filesOf(key).length : 0), 0);

  const FileChip = ({ t }) => (
    <li className="rf2-file">
      <a href={`${STORAGE}${t.file_path}`} target="_blank" rel="noopener noreferrer" title={`Open or print: ${t.original_name || t.title}`}>
        <span className={`rf2-ft ${kind(t.original_name || t.file_path)}`}>{kind(t.original_name || t.file_path).toUpperCase()}</span>
        <span className="rf2-fn">{t.original_name || t.title}</span>
        <Icon name="download" size={13} />
      </a>
      {manage && <button type="button" className="rf2-x" aria-label={`Remove ${t.original_name || t.title}`} title="Remove" onClick={() => setAskDel(t.id)}><Icon name="trash" size={13} /></button>}
    </li>
  );

  const Row = ({ no, r, sub }) => {
    const files = filesOf(r.key);
    const note = notes[r.key];
    return (
      <div className={sub ? "rf2-row sub" : "rf2-row"}>
        <span className="rf2-no">{no}</span>
        <div className="rf2-what">
          <b>{r.label}</b>
          {(DESC[r.key] || r.hint) && <small>{DESC[r.key] || r.hint}</small>}
          {note && <p className="rf2-note"><Icon name="info" size={12} /> {note}</p>}
        </div>
        <div className="rf2-files">
          {/* coordinator: pick what interns see for this requirement */}
          {manage && files.length === 0 && (
            <label className="rf2-choice">
              <span>Form</span>
              <select value={formChoice(r.key)} disabled={busy === r.key || busy === `n${NF(r.key)}`} onChange={(e) => choose(r, e.target.value)}>
                <option value="form">Upload a form…</option>
                <option value="none">No form needed</option>
                <option value="wait">Not available yet</option>
              </select>
            </label>
          )}
          {files.length > 0 ? <ul>{files.map((t) => <FileChip key={t.id} t={t} />)}</ul>
            : noFormText(r.key) ? (
              <span className="rf2-st info">{noFormText(r.key)}
                {manage && <button type="button" className="rf2-link sm" onClick={() => choose(r, "none")}>Edit</button>}</span>
            ) : <span className="rf2-st wait">Not available yet. Ask your OJT coordinator.</span>}
          {manage && (
            <span className="rf2-acts">
              {files.length > 0 && (
                <button type="button" className="rf2-btn" disabled={busy === r.key} onClick={() => { pick.current = r; fileRef.current?.click(); }}>
                  <Icon name="upload" size={13} /> {busy === r.key ? "Uploading…" : "Add another"}</button>
              )}
              <button type="button" className="rf2-btn ghost" onClick={() => setEdit({ key: r.key, label: r.label, text: note || "" })}>
                <Icon name="pencil" size={12} /> {note ? "Edit note" : "Add note"}</button>
            </span>
          )}
        </div>
      </div>
    );
  };

  const PHASES = phases(!manage && !!user && !outputRequired(user));
  const cur = PHASES.find((p) => p.key === phase);

  return (
    <Modal wide title="Forms and templates" onClose={onClose}
      sub={manage ? "Upload the blank form for each requirement, or add any other template or document. Interns open and print them from Submit MOV."
        : "Blank forms from your OJT coordinator. Open or print them, fill them in, then submit the signed copy in Submit MOV."}>
      <style>{CSS}</style>
      <input ref={fileRef} type="file" hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={(e) => quickUpload(e.target.files?.[0])} />
      <Msg msg={msg} />

      <div className="rf2-info">
        <Icon name="info" size={16} />
        <span>{notes.__general || DEFAULT_NOTE}</span>
        {manage && <button type="button" className="rf2-link" onClick={() => setEdit({ key: "__general", label: "the top note", text: notes.__general || "" })}>Edit</button>}
      </div>

      {rows === null ? <Spinner /> : (
        <>
          <div className="rf2-top">
            <div className="rf2-tabs" role="tablist" aria-label="Phase">
              {PHASES.map((p) => (
                <button key={p.key} type="button" role="tab" aria-selected={phase === p.key} className={phase === p.key ? "on" : ""} onClick={() => setPhase(p.key)}>
                  {p.label} <span className="rf2-n">{countIn(p)}</span></button>
              ))}
              <button type="button" role="tab" aria-selected={phase === "other"} className={phase === "other" ? "on" : ""} onClick={() => setPhase("other")}>
                Other files <span className="rf2-n">{others.length}</span></button>
            </div>
            {manage && (
              <button type="button" className="rf2-btn solid" onClick={() => setAdd({ title: "", requirement: "", file: null })}>
                <Icon name="plus" size={14} /> Add a template or document</button>
            )}
          </div>

          <div className="rf2-list">
            {phase !== "other" ? cur.rows.map(([no, key, head]) => {
              // a group (6): its number and what it means; the lettered items under it are indented
              if (!key) return <div key={"g" + no} className="rf2-group"><span className="rf2-no">{no}</span><span>{head}</span></div>;
              const r = REQ(key);
              return r ? <Row key={key} no={no} r={r} sub={/^[a-z]$/.test(no)} /> : null;
            }) : others.length === 0 ? (
              <div className="rf2-empty">
                <span className="rf2-empty-ic"><Icon name="folder" size={20} /></span>
                <b>No other files yet</b>
                <small>{manage ? "Templates and documents that aren't for one requirement (a guide, a sample, a schedule) show here."
                  : "Extra templates or guides from your OJT coordinator will show here."}</small>
                {manage && <button type="button" className="rf2-btn solid" onClick={() => setAdd({ title: "", requirement: "", file: null })}><Icon name="plus" size={14} /> Add a template or document</button>}
              </div>
            ) : (
              <ul className="rf2-others">
                {others.map((t) => (
                  <li key={t.id} className="rf2-row">
                    <span className={`rf2-ft big ${kind(t.original_name || t.file_path)}`}>{kind(t.original_name || t.file_path).toUpperCase()}</span>
                    <div className="rf2-what"><b>{t.title}</b><small>{t.original_name}</small></div>
                    <div className="rf2-files">
                      <span className="rf2-acts">
                        <a className="rf2-btn" href={`${STORAGE}${t.file_path}`} target="_blank" rel="noopener noreferrer"><Icon name="download" size={13} /> Open</a>
                        {manage && <button type="button" className="rf2-btn ghost danger" onClick={() => setAskDel(t.id)}><Icon name="trash" size={13} /> Remove</button>}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {/* add any template or document: a name, optionally for one requirement, and the file */}
      {add && (
        <Modal title="Add a template or document" sub="Interns can open and print it from Submit MOV." onClose={() => setAdd(null)}>
          <form className="rf2-form" onSubmit={async (e) => {
            e.preventDefault();
            const r = REQ(add.requirement);
            if (await send({ file: add.file, title: add.title.trim() || r?.label || add.file?.name, requirement: add.requirement || null }, "add")) {
              setAdd(null);
              setPhase(add.requirement ? (PRE_REQUIREMENTS.some((x) => x.key === add.requirement) ? "pre" : DURING_REQUIREMENTS.some((x) => x.key === add.requirement) ? "during" : "post") : "other");
            }
          }}>
            <label>Name <small>(what interns see)</small>
              <input type="text" required maxLength={150} value={add.title} placeholder="e.g. Narrative Report Template, Sample Weekly Report"
                onChange={(e) => setAdd({ ...add, title: e.target.value })} /></label>
            <label>For which requirement? <small>(optional)</small>
              <select value={add.requirement} onChange={(e) => setAdd({ ...add, requirement: e.target.value })}>
                <option value="">Not for one requirement (shows under Other files)</option>
                {PHASES.map((p) => (
                  <optgroup key={p.key} label={p.label}>
                    {p.rows.filter(([, k]) => k).map(([, k]) => <option key={k} value={k}>{REQ(k)?.label}</option>)}
                  </optgroup>
                ))}
              </select></label>
            <label>File <small>(PDF, Word, Excel or PowerPoint, up to 15 MB)</small>
              <span className={`rf2-pick${add.file ? " has" : ""}`}>
                <Icon name="upload" size={15} /><span>{add.file ? add.file.name : "Choose a file"}</span>
                <input type="file" required accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={(e) => setAdd({ ...add, file: e.target.files?.[0] || null })} />
              </span></label>
            <div className="rf2-btns">
              <button type="button" className="rf2-btn ghost" onClick={() => setAdd(null)}>Cancel</button>
              <button type="submit" className="rf2-btn solid" disabled={busy === "add" || !add.file}>{busy === "add" ? "Uploading…" : "Upload"}</button>
            </div>
          </form>
        </Modal>
      )}

      {askDel && (() => {
        const t = (rows || []).find((x) => x.id === askDel);
        if (!t) return null;
        return (
          <Modal title="Remove this file?" sub="Interns will no longer be able to open it." onClose={() => setAskDel(null)}>
            <div className="rf2-form">
              <div className="rf2-rm"><span className={`rf2-ft ${kind(t.original_name || t.file_path)}`}>{kind(t.original_name || t.file_path).toUpperCase()}</span><span>{t.original_name || t.title}</span></div>
              <div className="rf2-btns">
                <button type="button" className="rf2-btn ghost" onClick={() => setAskDel(null)}>Cancel</button>
                <button type="button" className="rf2-btn solid danger" disabled={busy === `d${t.id}`} onClick={() => remove(t)}>{busy === `d${t.id}` ? "Removing…" : "Remove"}</button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {edit && (
        <Modal title={edit.noform ? "No form needed" : "Note"}
          sub={edit.noform ? `For ${edit.label}. Tell interns what to do instead; they see it in place of a form.`
            : edit.key === "__general" ? "Shown at the top of the list for every intern." : `For ${edit.label}. Interns see it under the requirement.`}
          onClose={() => setEdit(null)}>
          <div className="rf2-form">
            <textarea rows={4} maxLength={600} autoFocus value={edit.text}
              placeholder={edit.noform ? "e.g. No form needed. Upload a scanned copy of your own insurance." : "e.g. Bring 3 copies on long bond paper"}
              onChange={(e) => setEdit({ ...edit, text: e.target.value })} />
            <small>{edit.text.length}/600 · {edit.noform ? "write what interns should submit instead" : "leave it empty to remove the note"}</small>
            <div className="rf2-btns">
              <button type="button" className="rf2-btn ghost" onClick={() => setEdit(null)}>Cancel</button>
              <button type="button" className="rf2-btn solid" disabled={busy === `n${edit.key}` || (edit.noform && !edit.text.trim())}
                onClick={() => putNote(edit.key, edit.text)}>{busy === `n${edit.key}` ? "Saving…" : edit.noform ? "Save" : "Save note"}</button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}

const CSS = `
.ix-modal:has(.rf2-list) { width: min(1040px, 96vw) !important; max-width: none !important; }
.rf2-info { display: flex; gap: 10px; align-items: flex-start; background: #fff7ed; border: 1px solid #fed7aa; color: #7c2d12; border-radius: 12px; padding: 10px 14px; font-size: 13px; line-height: 1.5; margin-bottom: 14px; }
.rf2-info svg { flex: none; margin-top: 3px; color: #e8582a; }
.rf2-info span { flex: 1; }
.rf2-link { flex: none; border: 0; background: none; padding: 0; font: inherit; font-weight: 700; color: #c2410c; cursor: pointer; }
.rf2-link:hover { text-decoration: underline; }

.rf2-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.rf2-tabs { display: inline-flex; flex-wrap: wrap; gap: 4px; padding: 3px; background: #f3f4f6; border: 1px solid #e8ebf0; border-radius: 10px; }
.rf2-tabs button { display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 12px; border: 0; border-radius: 8px; background: transparent; font: inherit; font-size: 13px; font-weight: 600; color: #4b5563; cursor: pointer; white-space: nowrap; }
.rf2-tabs button:hover { color: #c2410c; }
.rf2-tabs button.on { background: #fff; color: #c2410c; box-shadow: 0 1px 3px rgba(15,23,42,.12); }
.rf2-n { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; background: #e5e7eb; color: #475569; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; }
.rf2-tabs button.on .rf2-n { background: #fde3d6; color: #c2410c; }

/* a simple numbered list: number · name and what it is · its form on the right */
.rf2-list { border: 1px solid #e8ebf0; border-radius: 14px; overflow: hidden; background: #fff; }
.rf2-row { display: grid; grid-template-columns: 30px minmax(0, 1fr) minmax(220px, 300px); gap: 14px; align-items: center; padding: 12px 18px; border-bottom: 1px solid #f1f3f6; }
.rf2-row:last-child { border-bottom: 0; }
.rf2-row:hover { background: #fcfcfd; }
.rf2-no { width: 28px; height: 28px; border-radius: 50%; background: #fff1ea; color: #c2410c; display: grid; place-items: center; font-size: 12.5px; font-weight: 700; }
.rf2-what { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.rf2-what b { font-size: 14px; font-weight: 600; color: #111827; line-height: 1.35; }
.rf2-what small { font-size: 12.5px; color: #6b7280; line-height: 1.45; }
.rf2-note { margin: 4px 0 0; display: flex; gap: 6px; align-items: flex-start; padding: 5px 9px; border-radius: 8px; background: #fffbeb; color: #92400e; font-size: 12.5px; line-height: 1.45; width: fit-content; max-width: 100%; box-sizing: border-box; }
.rf2-note svg { flex: none; margin-top: 2px; }
/* 6: a group row; its items a to g are indented under it with a line on the left, so they read as part of 6 */
.rf2-group { display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 14px; align-items: center; padding: 11px 18px; border-bottom: 1px solid #f1f3f6; background: #fafbfc; font-size: 13px; font-weight: 600; color: #374151; }
.rf2-row.sub { grid-template-columns: 26px minmax(0, 1fr) minmax(220px, 300px); margin-left: 32px; padding-left: 16px; border-left: 2px solid #f6c7b0; background: #fffdfb; }
.rf2-row.sub .rf2-no { width: 24px; height: 24px; font-size: 12px; background: #fff; color: #c2410c; border: 1px solid #f6c7b0; }

.rf2-files { min-width: 0; display: flex; flex-direction: column; gap: 6px; align-items: stretch; }
.rf2-files ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.rf2-file { display: flex; align-items: center; gap: 6px; }
.rf2-file a { flex: 1; min-width: 0; display: flex; align-items: center; gap: 9px; padding: 8px 10px; border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; color: #111827; text-decoration: none !important; }
.rf2-file a:hover { border-color: #f6c7b0; background: #fff8f4; }
.rf2-file a > svg { flex: none; color: #9ca3af; }
.rf2-file a:hover > svg { color: #c2410c; }
.rf2-fn { flex: 1; min-width: 0; font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rf2-ft { flex: none; width: 30px; height: 22px; border-radius: 5px; display: grid; place-items: center; font-size: 9px; font-weight: 800; color: #fff; background: #e53935; }
.rf2-ft.doc { background: #2b6cb0; } .rf2-ft.xls { background: #2e7d32; } .rf2-ft.ppt { background: #d9531e; }
.rf2-ft.big { width: 34px; height: 34px; border-radius: 8px; font-size: 10px; }
.rf2-x { flex: none; width: 34px; height: 34px; padding: 0 !important; border: 1px solid #f3d0d0; border-radius: 10px; background: #fff; color: #b91c1c; display: grid; place-items: center; cursor: pointer; }
.rf2-x:hover { background: #fef2f2; }
.rf2-st { display: block; padding: 7px 12px; border-radius: 10px; background: #f6f7f9; color: #6b7280; font-size: 12.5px; line-height: 1.45; }
.rf2-acts .rf2-btn { flex: 1; justify-content: center; }
.rf2-st.info { background: #eff6ff; color: #1e40af; }
.rf2-st.wait { background: #fffbeb; color: #92400e; }
.rf2-st .rf2-link.sm { margin-left: 8px; font-size: 12px; color: #1e40af; }
/* coordinator: Form [Upload a form… / No form needed / Not available yet] */
.rf2-choice { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: #64748b; }
.rf2-choice select { flex: 1; min-width: 0; height: 32px; padding: 0 28px 0 10px; border: 1px solid #e5e7eb; border-radius: 9px; background-color: #fff; font: inherit; font-size: 12.5px; font-weight: 600; color: #111827; cursor: pointer; }
.rf2-choice select:focus { outline: 2px solid #fbd5c3; border-color: #e8582a; }
.rf2-acts { display: flex; gap: 8px; flex-wrap: wrap; }

.rf2-btn { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border: 1px solid #f6c7b0; border-radius: 9px; background: #fff7f2; color: #c2410c !important; font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; text-decoration: none !important; white-space: nowrap; }
.rf2-btn:hover:not(:disabled) { background: #ffede3; }
.rf2-btn.ghost { background: #fff; border-color: #e5e7eb; color: #374151 !important; }
.rf2-btn.ghost:hover:not(:disabled) { background: #f9fafb; }
.rf2-btn.ghost.danger { color: #b91c1c !important; border-color: #f3d0d0; }
.rf2-btn.solid { background: #e8582a; border-color: #e8582a; color: #fff !important; height: 36px; padding: 0 14px; }
.rf2-btn.solid:hover:not(:disabled) { background: #d94d20; }
.rf2-btn.solid.danger { background: #dc2626; border-color: #dc2626; }
.rf2-btn:disabled { opacity: .55; cursor: default; }

.rf2-others { list-style: none; margin: 0; padding: 0; }
.rf2-others .rf2-row { grid-template-columns: 34px minmax(0, 1fr) auto; align-items: center; }
.rf2-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 40px 16px; text-align: center; }
.rf2-empty-ic { width: 44px; height: 44px; border-radius: 50%; background: #fff1ea; color: #ea580c; display: grid; place-items: center; margin-bottom: 4px; }
.rf2-empty b { font-size: 14.5px; color: #111827; } .rf2-empty small { font-size: 12.5px; color: #6b7280; max-width: 380px; margin-bottom: 6px; }

/* small windows: add a template, remove, note */
.rf2-form { display: flex; flex-direction: column; gap: 12px; min-width: min(440px, 80vw); }
.rf2-form label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; color: #374151; }
.rf2-form label small { font-weight: 400; color: #6b7280; }
.rf2-form input[type="text"], .rf2-form select, .rf2-form textarea { width: 100%; box-sizing: border-box; font: inherit; font-size: 14px; padding: 9px 12px; border: 1px solid #d6d9de; border-radius: 10px; background: #fff; color: #111827; }
.rf2-form textarea { resize: vertical; }
.rf2-form :is(input, select, textarea):focus { outline: 2px solid #fbd5c3; border-color: #e8582a; }
.rf2-form > small { color: #6b7280; font-size: 12px; }
.rf2-pick { position: relative; display: flex; align-items: center; gap: 8px; padding: 12px 14px; border: 1.5px dashed #e5c4b4; border-radius: 10px; background: #fffaf7; color: #9a3412; font-weight: 500; cursor: pointer; }
.rf2-pick.has { border-style: solid; border-color: #f6c7b0; }
.rf2-pick span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rf2-pick input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.rf2-btns { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.rf2-rm { display: flex; align-items: center; gap: 10px; background: #f6f7f9; border-radius: 10px; padding: 10px 12px; font-size: 13.5px; overflow-wrap: anywhere; }

@media (max-width: 760px) {
  .rf2-top { flex-direction: column; align-items: stretch; }
  .rf2-row, .rf2-row.sub { grid-template-columns: 28px minmax(0, 1fr); padding: 12px 14px; }
  .rf2-row.sub { margin-left: 18px; padding-left: 12px; }
  .rf2-group { padding: 11px 14px; }
  .rf2-row > .rf2-files { grid-column: 2; }
  .rf2-others .rf2-row { grid-template-columns: 34px minmax(0, 1fr); }
}
`;
