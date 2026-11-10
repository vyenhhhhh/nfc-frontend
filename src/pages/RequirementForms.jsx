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
const cleanTxt = (v) => { const t = String(v || "").trim(); return /^[-–—.\s]*$/.test(t) ? "" : t; };
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
  useEffect(() => {
    if (msg?.type !== "success") return undefined;
    const t = setTimeout(() => setMsg(null), 3500);
    return () => clearTimeout(t);
  }, [msg]);

  // one upload for both ways in: the "Upload" button on a requirement, and the "Add a template" window
  const send = async ({ file, title, requirement, desc }, busyKey) => {
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
      if (desc && desc.trim() && d.id) {
        await fetch(`${API}/coordinator/requirement-form-notes`, {
          method: "PUT", headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ requirement: `file:${d.id}`, note: desc.trim() }),
        }).catch(() => {});
      }
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
      if (notes[`file:${t.id}`]) await fetch(`${API}/coordinator/requirement-form-notes`, {
        method: "PUT", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ requirement: `file:${t.id}`, note: "" }),
      }).catch(() => {});
      setAskDel(null); load();
    } catch (e) {
      setMsg({ type: "error", text: e instanceof TypeError ? "Couldn't reach the server." : e.message });
    } finally { setBusy(null); }
  };

  const putNote = async (key, text, more = []) => {
    setBusy(`n${key}`); setMsg(null);
    try {
      for (const [k, t] of [[key, text], ...more]) {
        const res = await fetch(`${API}/coordinator/requirement-form-notes`, {
          method: "PUT", headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ requirement: k, note: t }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.message || (d.errors && Object.values(d.errors)[0]?.[0]) || "Could not save the note.");
      }
      setEdit(null); load();
    } catch (e) {
      setMsg({ type: "error", text: e instanceof TypeError ? "Couldn't reach the server." : e.message });
    } finally { setBusy(null); }
  };

  const baseDesc = (key) => DESC[key] || REQ(key)?.hint || "";
  const descOf = (key) => cleanTxt(notes[`desc:${key}`]) || baseDesc(key);
  const openEdit = (r) => setEdit({ key: r.key, label: r.label, req: true, text: cleanTxt(notes[r.key]),
    desc: descOf(r.key) });
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
  // a file for one part but not one requirement is saved with requirement "phase:pre" / "phase:during" / "phase:post"
  const GEN = (p) => `phase:${p}`;
  const others = (rows || []).filter((t) => !t.requirement || (!REQ(t.requirement) && !/^phase:(pre|during|post)$/.test(t.requirement)));
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
          {descOf(r.key) && <small>{descOf(r.key)}</small>}
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
              <button type="button" className="rf2-btn ghost" onClick={() => openEdit(r)}>
                <Icon name="pencil" size={12} /> {note ? "Edit note" : "Add note"}</button>
            </span>
          )}
        </div>
      </div>
    );
  };

  const PHASES = phases(!manage && !!user && !outputRequired(user));
  const cur = PHASES.find((p) => p.key === phase);
  const [q, setQ] = useState("");
  const [how, setHow] = useState(false);

  /* ── coordinator: one simple table per phase, the same look as "Due dates & reminders" ── */
  const manageView = () => {
    const ql = q.trim().toLowerCase();
    const keys = phase === "other" ? [] : cur.rows.filter(([, k]) => k).map(([, k]) => k);
    const list = keys.map((k, i) => ({ n: i + 1, r: REQ(k) })).filter((x) => x.r && (!ql || x.r.label.toLowerCase().includes(ql)));
    const otherList = others.filter((t) => !ql || `${t.title} ${t.original_name || ""}`.toLowerCase().includes(ql));
    const genList = phase === "other" ? [] : filesOf(GEN(phase)).filter((t) => !ql || `${t.title} ${t.original_name || ""}`.toLowerCase().includes(ql));
    const fileRow = (t, forTxt) => (
      <div key={t.id} className="rf3-tr">
        <span className="rf3-name"><span className={`rf2-ft ${kind(t.original_name || t.file_path)}`}>{kind(t.original_name || t.file_path).toUpperCase()}</span>
          <span>{t.title}
            {manage ? <button type="button" className={cleanTxt(notes[`file:${t.id}`]) ? "rf3-desc rf3-desc-btn" : "rf3-desc rf3-desc-btn none"}
                onClick={() => setEdit({ key: `file:${t.id}`, label: t.title, filedesc: true, text: cleanTxt(notes[`file:${t.id}`]) })}>
                {cleanTxt(notes[`file:${t.id}`]) || "+ Add a description"}</button>
              : cleanTxt(notes[`file:${t.id}`]) && <small className="rf3-desc">{cleanTxt(notes[`file:${t.id}`])}</small>}</span></span>
        <span className="rf3-form"><span className="rf3-file"><a href={`${STORAGE}${t.file_path}`} target="_blank" rel="noopener noreferrer" title={`Open: ${t.original_name || t.title}`}><span className="rf3-fn">{t.original_name || t.title}</span></a></span></span>
        {manage && <span className="rf3-note empty as-text">{forTxt}</span>}
        {manage && <span className="rf3-acts"><button type="button" className="ix-b ghost sm danger" onClick={() => setAskDel(t.id)}><Icon name="trash" size={13} /> Remove</button></span>}
      </div>
    );
    const upload = (r) => { pick.current = r; fileRef.current?.click(); };
    return (
      <div className={manage ? "rf3" : "rf3 ro"}>
        {/* one row: the tabs on the left, search and buttons on the right, so the table gets most of the space */}
        <div className="rf3-head">
          <div className="rf3-tabs" role="tablist">
            {PHASES.map((p) => (
              <button key={p.key} type="button" role="tab" aria-selected={phase === p.key} className={phase === p.key ? "on" : ""} onClick={() => setPhase(p.key)}>
                {p.label}</button>
            ))}
            <button type="button" role="tab" aria-selected={phase === "other"} className={phase === "other" ? "on" : ""} onClick={() => setPhase("other")}>
              Other files{others.length ? <span className="rf3-n">{others.length}</span> : null}</button>
          </div>
          <div className="rf3-tools">
            <div className="ix-search rf3-search"><Icon name="search" size={16} />
              <input type="text" placeholder="Search..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
            {manage && <button type="button" className={how ? "ix-b ghost rf3-help on" : "ix-b ghost rf3-help"} title="How it works" aria-label="How it works" aria-expanded={how}
              onClick={() => setHow(!how)}>?</button>}
            {manage && <button type="button" className="ix-b primary" onClick={() => setAdd({ title: "", phase: phase, requirement: "", file: null })}>
              <Icon name="plus" size={14} /> Add a file</button>}
          </div>
        </div>
        {manage && how && (
          <div className="rf3-how">
            <span><b>1</b> Each requirement: upload its blank form, or pick <i>No form needed</i>.</span>
            <span><b>2</b> Click a description or note to change what interns read.</span>
            <span><b>3</b> <i>Add a file</i> is for extra files (a guide, a sample). It doesn't add a new requirement.</span>
          </div>
        )}
        {manage ? (
          <div className="rf3-top">
            <Icon name="info" size={14} />
            <span><b>Note for interns{notes.__general ? "" : " (default)"}:</b> {notes.__general || DEFAULT_NOTE}</span>
            <button type="button" className="rf3-topbtn" onClick={() => setEdit({ key: "__general", label: "the top note", text: notes.__general || "" })}>
              <Icon name="pencil" size={13} /> {notes.__general ? "Change" : "Write one"}</button>
          </div>
        ) : <div className="rf3-top"><Icon name="info" size={14} /><span>{notes.__general || DEFAULT_NOTE}</span></div>}
        <div className="rf3-table">
          {phase !== "other" ? (<>
            <div className="rf3-tr rf3-th"><span>Requirement</span><span>Form</span>{manage && <><span>Note for interns</span><span /></>}</div>
            {list.length === 0 ? <div className="rf3-empty">No requirement matches "{q}".</div> : list.map(({ n, r }) => {
              const files = filesOf(r.key);
              const nf = noFormText(r.key);
              const note = notes[r.key];
              // a note that says nothing ("-", ".") or only repeats the requirement name is not shown
              const same = (x) => x && x.toLowerCase() !== r.label.toLowerCase() ? x : "";
              const cNote = same(cleanTxt(note));
              const cNf = files.length === 0 ? same(cleanTxt(nf)) : "";
              const desc = descOf(r.key);
              return (
                <div key={r.key} className="rf3-tr">
                  <span className="rf3-name" title={desc}><b>{n}</b>
                    <span>{r.label}{desc && (manage
                      ? <button type="button" className="rf3-desc rf3-desc-btn" title="Click to change the description" onClick={() => openEdit(r)}>{desc}</button>
                      : <small className="rf3-desc">{desc}</small>)}
                      {!manage && (cNote || cNf.replace(/^no form needed[.:,\-–—\s]*/i, "")) && <em className="rf3-cnote"><Icon name="info" size={12} /> {[cNote, cNf.replace(/^no form needed[.:,\-–—\s]*/i, "")].filter(Boolean).join(" ")}</em>}</span></span>
                  <span className="rf3-form">
                    {files.length > 0 ? files.map((t) => (
                      <span key={t.id} className="rf3-file">
                        <a href={`${STORAGE}${t.file_path}`} target="_blank" rel="noopener noreferrer" title={`Open: ${t.original_name || t.title}`}>
                          <span className={`rf2-ft ${kind(t.original_name || t.file_path)}`}>{kind(t.original_name || t.file_path).toUpperCase()}</span>
                          <span className="rf3-fn">{t.original_name || t.title}</span></a>
                        {manage && <button type="button" className="rf3-x" title="Remove this file" aria-label={`Remove ${t.original_name || t.title}`} onClick={() => setAskDel(t.id)}><Icon name="trash" size={13} /></button>}
                      </span>
                    )) : !manage ? (
                      <span className={nf ? "rf3-st none" : "rf3-st wait"}>{nf ? "No form needed" : "Not available yet"}</span>
                    ) : (
                      <select className="ix-select rf3-sel" value={formChoice(r.key)} disabled={busy === r.key || busy === `n${NF(r.key)}`}
                        onChange={(e) => choose(r, e.target.value)} aria-label={`Form of ${r.label}`}
                        title={nf || ""}>
                        <option value="wait">Not available yet</option>
                        <option value="none">No form needed</option>
                        <option value="form">Upload a form…</option>
                      </select>
                    )}
                    {busy === r.key && <small className="rf3-busy">Uploading…</small>}
                  </span>
                  {manage ? (
                  <button type="button" className={cNote || cNf ? "rf3-note" : "rf3-note empty"}
                    onClick={() => (cNf && !cNote ? choose(r, "none") : openEdit(r))}
                    title="Click to write or change the note">
                    {cNote || cNf || "Add a note"}</button>
                  ) : null}
                  {manage && <span className="rf3-acts">
                    <button type="button" className="ix-b ghost sm" disabled={busy === r.key} onClick={() => upload(r)}>
                      <Icon name="upload" size={13} /> {files.length ? "Add file" : "Upload"}</button>
                  </span>}
                </div>
              );
            })}
            {genList.length > 0 && <>
              <div className="rf3-sub">Extra files for {cur.label} <i>not requirements, just for interns to read or use</i></div>
              {genList.map((t) => fileRow(t, "Extra file, every intern"))}
            </>}
          </>) : (<>
            <div className="rf3-tr rf3-th"><span>Name</span><span>File</span>{manage && <><span>For</span><span /></>}</div>
            {otherList.length === 0 ? (
              <div className="rf3-empty">{q ? `No file matches "${q}".` : (manage ? "No other files yet. Use \u201cAdd a file\u201d for a guide, a sample or a schedule that isn't for one requirement." : "No other files from your OJT coordinator yet.")}</div>
            ) : otherList.map((t) => fileRow(t, "Every intern"))}
          </>)}
        </div>
      </div>
    );
  };

  return (
    <Modal wide title="Forms and templates" onClose={onClose}
      sub={manage ? "Pick a form for each requirement. Interns open and print them from Submit MOV."
        : "Blank forms from your OJT coordinator. Open or print them, fill them in, then submit the signed copy in Submit MOV."}>
      <style>{CSS}</style>
      <input ref={fileRef} type="file" hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={(e) => quickUpload(e.target.files?.[0])} />
      {!((add || edit) && msg?.type === "error") && <Msg msg={msg} />}

      {rows === null ? <Spinner /> : manageView()}
      {false && (<>
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
              <button type="button" className="rf2-btn solid" onClick={() => setAdd({ title: "", phase, requirement: "", file: null })}>
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
                {manage && <button type="button" className="rf2-btn solid" onClick={() => setAdd({ title: "", phase, requirement: "", file: null })}><Icon name="plus" size={14} /> Add a template or document</button>}
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
      </>)}

      {/* add any template or document: a name, optionally for one requirement, and the file */}
      {add && (
        <Modal title="Add a file" sub="Attach a blank form to a requirement, or add an extra file like a guide or a sample." onClose={() => setAdd(null)}>
          <form className="rf2-form" onSubmit={async (e) => {
            e.preventDefault();
            const r = REQ(add.requirement) || (add.requirement.startsWith("phase:") ? { label: `${PHASES.find((p) => p.key === add.phase)?.label} file` } : null);
            if (await send({ file: add.file, title: add.title.trim() || r?.label || add.file?.name, requirement: add.requirement || null, desc: (add.phase === "other" || !add.phase || (add.requirement || "").startsWith("phase:")) ? add.desc : "" }, "add")) {
              setAdd(null);
              setPhase(add.requirement ? (add.phase || "other") : "other");
            }
          }}>
            <label><span className="rf2-lb">Name <i>what interns see</i></span>
              <input type="text" required maxLength={150} value={add.title} placeholder="e.g. Narrative Report Template, Sample Weekly Report"
                onChange={(e) => setAdd({ ...add, title: e.target.value })} /></label>
            <div className="rf2-fl"><span className="rf2-lb">Where does it go?</span>
              <div className="rf2-seg" role="radiogroup">
                {[...PHASES.map((p) => [p.key, p.label]), ["other", "Other files"]].map(([k, l]) => (
                  <button key={k} type="button" role="radio" aria-checked={(add.phase || "other") === k} className={(add.phase || "other") === k ? "on" : ""}
                    onClick={() => setAdd({ ...add, phase: k, requirement: "" })}>{l}</button>
                ))}
              </div></div>
            {add.phase && add.phase !== "other" ? (
              <label><span className="rf2-lb">For which requirement?</span>
                <select required value={add.requirement} onChange={(e) => setAdd({ ...add, requirement: e.target.value })}>
                  <option value="" disabled>Pick a requirement, or None</option>
                  <option value={GEN(add.phase)}>None. An extra {PHASES.find((p) => p.key === add.phase)?.label} file (guide, sample)</option>
                  {(PHASES.find((p) => p.key === add.phase)?.rows || []).filter(([, k]) => k).map(([, k]) => <option key={k} value={k}>{REQ(k)?.label}</option>)}
                </select></label>
            ) : <small className="rf2-hint">For a guide, a sample or a schedule that isn't for one requirement. Interns see it under Other files.</small>}
            <label><span className="rf2-lb">File <i>PDF, Word, Excel or PowerPoint, up to 15 MB</i></span>
              <span className={`rf2-pick${add.file ? " has" : ""}`}>
                <Icon name="upload" size={15} /><span>{add.file ? add.file.name : "Choose a file"}</span>
                <input type="file" required accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={(e) => { setMsg(null); setAdd({ ...add, file: e.target.files?.[0] || null }); }} />
              </span></label>
            {(add.phase === "other" || !add.phase || (add.requirement || "").startsWith("phase:")) && (
              <label><span className="rf2-lb">Short description <i>optional, shown under the name</i></span>
                <textarea rows={2} maxLength={600} value={add.desc || ""} placeholder="e.g. Read this before your deployment orientation."
                  onChange={(e) => setAdd({ ...add, desc: e.target.value })} /></label>
            )}
            {msg?.type === "error" && <div className="rf2-err">{msg.text}</div>}
            <div className="rf2-btns">
              <button type="button" className="rf2-btn ghost" onClick={() => setAdd(null)}>Cancel</button>
              <button type="submit" className="rf2-btn solid" disabled={busy === "add" || !add.file || (add.phase && add.phase !== "other" && !add.requirement)}>{busy === "add" ? "Uploading…" : "Upload"}</button>
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

      {edit && edit.req && (
        <Modal title="Description and note" sub={edit.label} onClose={() => setEdit(null)}>
          <div className="rf2-form">
            <label><span className="rf2-lb">Description <i>shown under the name</i>
              {edit.desc !== baseDesc(edit.key) && <button type="button" className="rf2-reset" onClick={() => setEdit({ ...edit, desc: baseDesc(edit.key) })}>Use the original</button>}</span>
              <textarea rows={3} maxLength={600} value={edit.desc} placeholder="What this requirement is, e.g. Signed by your parent/guardian and the HTE representative."
                onChange={(e) => setEdit({ ...edit, desc: e.target.value })} /></label>
            <label><span className="rf2-lb">Note for interns <i>optional, shown in orange</i></span>
              <textarea rows={3} maxLength={600} autoFocus value={edit.text} placeholder="e.g. Bring 3 copies on long bond paper"
                onChange={(e) => setEdit({ ...edit, text: e.target.value })} /></label>
            {msg?.type === "error" && <div className="rf2-err">{msg.text}</div>}
            <div className="rf2-btns">
              <button type="button" className="rf2-btn ghost" onClick={() => setEdit(null)}>Cancel</button>
              <button type="button" className="rf2-btn solid" disabled={busy === `n${edit.key}`}
                onClick={() => {
                  const d = edit.desc.trim();
                  // the original description is not saved again; an empty box also goes back to the original
                  putNote(edit.key, edit.text, [[`desc:${edit.key}`, !d || d === baseDesc(edit.key) ? "" : d]]);
                }}>{busy === `n${edit.key}` ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </Modal>
      )}
      {edit && !edit.req && (
        <Modal title={edit.noform ? "No form needed" : edit.filedesc ? "Description" : "Note"}
          sub={edit.filedesc ? edit.label : edit.noform ? `For ${edit.label}. Tell interns what to do instead; they see it in place of a form.`
            : "Shown at the top of the list for every intern."}
          onClose={() => setEdit(null)}>
          <div className="rf2-form">
            <textarea rows={4} maxLength={600} autoFocus value={edit.text}
              placeholder={edit.noform ? "e.g. No form needed. Upload a scanned copy of your own insurance." : edit.filedesc ? "e.g. Read this before your deployment orientation." : "e.g. Bring 3 copies on long bond paper"}
              onChange={(e) => setEdit({ ...edit, text: e.target.value })} />
            <small className="rf2-hint">{edit.noform ? "Write what interns should submit instead." : edit.filedesc ? "Shown under the file's name. Leave it empty to remove it." : "Leave it empty to remove the note."}</small>
            {msg?.type === "error" && <div className="rf2-err">{msg.text}</div>}
            <div className="rf2-btns">
              <button type="button" className="rf2-btn ghost" onClick={() => setEdit(null)}>Cancel</button>
              <button type="button" className="rf2-btn solid" disabled={busy === `n${edit.key}` || (edit.noform && !edit.text.trim())}
                onClick={() => putNote(edit.key, edit.text)}>{busy === `n${edit.key}` ? "Saving…" : edit.noform || edit.filedesc ? "Save" : "Save note"}</button>
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
/* coordinator: one table per phase (the same look as "Due dates & reminders") */
.ix-modal:has(.rf3) { width: min(1180px, 96vw) !important; max-width: none !important; height: 94vh; max-height: 94vh !important; display: flex; flex-direction: column; overflow: hidden !important; }
.ix-modal:has(.rf3) > .ix-modal-body { flex: 1 1 auto; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
.rf3 { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
.rf3-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px 16px; flex-wrap: wrap; flex: none; border-bottom: 1px solid #eef0f3; }
.rf3-tools { display: flex; align-items: center; gap: 8px; padding-bottom: 8px; margin-left: auto; }
.rf3-search { width: 240px; }
.rf3-help { width: 38px; padding: 0 !important; justify-content: center; font-weight: 700; }
.rf3-help.on { border-color: #e8582a; color: #c2410c; background: #fff7f2; }
.rf3-tabs { display: flex; gap: 22px; flex: none; }
.rf3-tabs button { position: relative; display: inline-flex; align-items: center; gap: 6px; height: 46px; padding: 0 2px; border: 0; background: none; font: inherit; font-size: 14px; font-weight: 500; color: #6b7280; cursor: pointer; }
.rf3-tabs button.on { color: #e8582a; } .rf3-tabs button.on::after { content: ""; position: absolute; left: -6px; right: -6px; bottom: -1px; height: 2px; background: #e8582a; border-radius: 2px; }
.rf3-n { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: #f1f2f4; color: #475569; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
.rf3-table { flex: 1 1 0; min-height: 0; overflow-y: auto; border: 1px solid #e8ebf0; border-radius: 12px; background: #fff; }
.rf3-tr { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1.1fr) minmax(0, 1fr) 120px; gap: 14px; align-items: center; padding: 8px 18px; border-top: 1px solid #eef0f3; min-height: 44px; }
.rf3-th { position: sticky; top: 0; z-index: 2; background: #f8f9fb; border-top: 0; border-bottom: 1px solid #eef0f3; min-height: 0; padding: 9px 18px; font-size: 11.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #6b7280; }
.rf3-th + .rf3-tr { border-top: 0; }
.rf3-name { display: flex; align-items: center; gap: 10px; min-width: 0; font-size: 14px; font-weight: 600; color: #111827; }
.rf3-name > b { flex: none; width: 22px; height: 22px; border-radius: 6px; background: #fff1ea; color: #c2410c; display: grid; place-items: center; font-size: 11.5px; }
.rf3-form { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.rf3-file { display: flex; align-items: center; gap: 6px; min-width: 0; }
.rf3-file a { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 10px; border: 1px solid #e5e7eb; border-radius: 9px; color: #111827; text-decoration: none !important; }
.rf3-file a:hover { border-color: #f6c7b0; background: #fff8f4; }
.rf3-fn { flex: 1; min-width: 0; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rf3-x { flex: none; width: 34px; height: 34px; padding: 0 !important; border: 1px solid #f3d0d0; border-radius: 9px; background: #fff; color: #b91c1c; display: grid; place-items: center; cursor: pointer; }
.rf3-x:hover { background: #fef2f2; }
.rf3-sel { height: 34px !important; font-size: 13px; }
.rf3-busy { font-size: 12px; color: #c2410c; }
.rf3-note { min-width: 0; border: 0; background: none; padding: 0; text-align: left; font: inherit; font-size: 12.5px; color: #374151; line-height: 1.45; cursor: pointer; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.rf3-note:hover { color: #c2410c; } .rf3-note.empty { color: #9ca3af; } .rf3-note.as-text { cursor: default; }
.rf3-acts { display: flex; justify-content: flex-end; }
.rf3-acts .ix-b.danger { color: #b91c1c; border-color: #f3d0d0; }
.rf3-empty { padding: 28px 16px; text-align: center; font-size: 13px; color: #6b7280; }
.rf3.ro .rf3-tr { grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); }
.rf3-desc { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.rf3-cnote { display: flex; gap: 5px; align-items: flex-start; margin-top: 3px; font-style: normal; font-size: 12px; font-weight: 500; color: #c2410c; line-height: 1.4; }
.rf3-cnote svg { flex: none; margin-top: 2px; }
.rf2-form label { gap: 6px !important; margin: 0 !important; }
.rf3-sub { padding: 9px 18px; background: #fafbfc; border-top: 1px solid #eef0f3; font-size: 11.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #6b7280; }
.rf2-reset { margin-left: auto; border: 0; background: none; padding: 0; font: inherit; font-size: 12px; font-weight: 600; color: #c2410c; cursor: pointer; }
.rf2-reset:hover { text-decoration: underline; }
.rf2-form textarea { min-height: 76px; line-height: 1.5; }
.rf2-form :is(input[type="text"], textarea) { font-weight: 400 !important; font-size: 14px !important; }
.rf3-desc-btn { border: 0; background: none; padding: 0; text-align: left; font: inherit; font-size: 12px; font-weight: 400; color: #6b7280; line-height: 1.4; cursor: pointer; border-radius: 4px; }
.rf3-desc-btn:hover { color: #c2410c; background: #fff7f2; }
.rf3-how { display: flex; flex-wrap: wrap; gap: 6px 18px; flex: none; padding: 8px 12px; border: 1px solid #eef0f3; border-radius: 10px; background: #fafbfc; font-size: 12.5px; color: #4b5563; }
.rf3-how span { display: inline-block; line-height: 20px; }
.rf3-how b { display: inline-grid; place-items: center; width: 18px; height: 18px; margin-right: 6px; vertical-align: -4px; border-radius: 50%; background: #fff1ea; color: #c2410c; font-size: 11px; }
.rf3-how i, .rf3-sub i { font-style: normal; font-weight: 600; color: #111827; }
.rf3-sub i { font-weight: 400; text-transform: none; letter-spacing: 0; color: #9ca3af; margin-left: 6px; }
.rf3-desc-btn.none { color: #9ca3af; }
.rf2-fl { display: flex; flex-direction: column; gap: 6px; }
.rf2-seg { display: grid; grid-template-columns: repeat(4, auto); gap: 4px; padding: 4px; background: #f3f4f6; border-radius: 10px; }
.rf2-seg button { height: 34px; padding: 0 8px; white-space: nowrap; border: 0; border-radius: 7px; background: none; font: inherit; font-size: 12.5px; font-weight: 500; color: #4b5563; cursor: pointer; }
.rf2-seg button.on { background: #fff; color: #c2410c; font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,.08); }
.rf2-hint { font-size: 12px; color: #6b7280; margin-top: -4px; }
.rf2-err { padding: 9px 12px; border-radius: 9px; background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; font-size: 13px; }
.rf3-head .rf3-add { margin-left: auto; }
.rf3-top > span { flex: 1; min-width: 0; } .rf3-top b { font-weight: 600; }
.rf3-topbtn { flex: none; display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 10px; border: 1px solid #fed7aa; border-radius: 8px; background: #fff; color: #c2410c; font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
.rf3-topbtn:hover { background: #fff1e6; }
.rf2-lb { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; font-size: 13px; font-weight: 600; color: #374151; }
.rf2-lb i { font-style: normal; font-weight: 400; font-size: 12px; color: #9ca3af; }
.rf2-form select { appearance: auto; height: 42px; font-weight: 400 !important; font-size: 14px !important; font-family: inherit !important; }
.rf2-form input[type="text"] { height: 42px; }
.rf2-form .rf2-btns { align-items: center; } .rf2-form .rf2-btns .rf2-btn { height: 38px; padding: 0 16px; }
.rf3-name > span { display: flex; flex-direction: column; gap: 2px; min-width: 0; line-height: 1.35; }
.rf3-name small { font-size: 12px; font-weight: 400; color: #6b7280; line-height: 1.4; }
.rf3-top { display: flex; gap: 8px; align-items: center; padding: 6px 10px 6px 12px; border-radius: 10px; background: #fff7ed; border: 1px solid #fed7aa; color: #7c2d12; font-size: 13px; line-height: 1.45; flex: none; }
.rf3-top svg { flex: none; color: #e8582a; }
.rf3-st { display: inline-flex; width: fit-content; padding: 6px 10px; border-radius: 8px; font-size: 12.5px; font-weight: 600; }
.rf3-st.none { background: #eff6ff; color: #1e40af; } .rf3-st.wait { background: #fffbeb; color: #92400e; }
@media (max-width: 760px) {
  .rf3-th { display: none; }
  .rf3-tr { grid-template-columns: 1fr; gap: 8px; }
  .rf3-head { flex-direction: column-reverse; align-items: stretch; }
  .rf3-tools { margin-left: 0; width: 100%; } .rf3-search { flex: 1 1 auto; width: auto; min-width: 0; }
  .rf3-tools .ix-b.primary { padding: 0 12px; }
  .rf3-tabs { overflow-x: auto; gap: 18px; } .rf3-tabs button { white-space: nowrap; flex: none; }
  .rf3-acts { justify-content: flex-start; }
}
`;