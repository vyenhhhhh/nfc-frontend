import { useState, useEffect, useRef } from "react";
import { API, STORAGE } from "../config.js";
import { Modal, Icon, Msg, Spinner, PRE_REQUIREMENTS, DURING_REQUIREMENTS, POST_REQUIREMENTS } from "../components/DashKit.jsx";

/* Blank forms for the internship requirements.
   manage = false: the intern's list (download / print what the coordinator provided).
   manage = true : the OJT coordinator's list (upload a form for a requirement, remove one). */
// the same list and wording as the department's "Internship Requirements" table
const RAW = [[
  ["Pre-Internship Requirements", [
    ["1", "capstone_summary", "Proof that the student has completed all the course requirements, including the Thesis/Capstone requirements. In line with CHED CMO 25 s. 2015, students are eligible to enroll in the internship program after completing 70% of the total units in the curriculum. This is still subject to evaluation by the Department Chairperson."],
    ["2", "letter_of_intent", "Application Letter / Letter of Intent submitted by the student to the HTE as part of the application. CV should be attached."],
    ["3", "endorsement_letter", "If the student is accepted for internship, the Endorsement Letter is submitted to the HTE, signed by the SIP Coordinator, noted by the Chairperson and the College Dean."],
    ["4", "moa", "A Memorandum of Agreement signed by both parties before the deployment of OJTs (long bond paper, 7 copies, notarized)."],
    ["5", "internship_contract", "Signed and notarized Student Internship Contract: the student's obligations, the HTE's rules and policies, and legal responsibilities between the HTE and the student intern (3 copies, notarized, long bond paper)."],
  ]],
  ["Other Requirements during the internship", [
    ["1", "supervisor_feedback_form", "Training Supervisor Feedback Form. The student provides it from the start of the internship; the supervisor uses it to monitor and grade the student intern throughout the internship."],
    ["2", "performance_appraisal", "Student Trainee Performance Appraisal. Provided during the last week of the internship, where the HTE supervisor gives the final rating of the student intern's overall performance."],
    ["3", "narrative_report", "Narrative Report. Note: the narrative report should be written in 3rd person perspective."],
  ]],
], [
  ["Pre-Internship Requirements (cont.)", [
    ["6", null, "Requirements the student can accomplish while the MOA and the Student Internship Contract are in progress:"],
    ["a", "pledge", "Student's Pledge. Signed in the presence of the SIP Coordinator."],
    ["b", "acceptance_form", "Acceptance Form. Signed by the Parent/Guardian and the HTE Representative."],
    ["c", "parents_consent", "Parent's Consent. Long bond paper and notarized."],
    ["d", "internship_plan", "Student Internship Plan: the objectives and activities the student intern aims to attain. Reviewed and signed by the Department Chairperson, SIP Coordinator and HTE Supervisor."],
    ["e", "medical_certificate", "Medical Certificate. CBC, signed by the university physician."],
    ["f", "personal_history", "Personal History Statement."],
    ["g", "insurance", "Scanned copy of any insurance."],
    ["7", "orientation", "Internship Deployment Orientation."],
  ]],
]];
// left: the whole Pre-Internship list in order (1 to 6, a to g, 7); right: the other requirements
const COLUMNS = (() => {
  const [[pre1, other], [pre2]] = RAW;
  // left: the whole Pre-Internship list in order (1 to 6, a to g, 7); right: only the other requirements
  return [[[pre1[0], [...pre1[1], ...pre2[1]]]], [other]];
})();
const ALL = [...PRE_REQUIREMENTS, ...DURING_REQUIREMENTS, ...POST_REQUIREMENTS];
const REQ = (k) => ALL.find((r) => r.key === k);

// requirements that have no blank form to print: what the intern does instead
const NO_FORM = {
  insurance: "No form. Scanned copy of your own insurance.",
  orientation: "No form. Attend the orientation; your attendance is the proof.",
};

const size = (n) => (!n ? "" : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const ext = (n) => String(n || "").split(".").pop().toUpperCase().slice(0, 4);
const kind = (n) => { const e = ext(n); return e.startsWith("DOC") ? "doc" : e.startsWith("XLS") ? "xls" : e.startsWith("PPT") ? "ppt" : "pdf"; };
const DEFAULT_NOTE = "Not every requirement has an attachment. Only the forms your OJT coordinator has provided can be opened and printed. For the others, follow the instructions in the requirement.";

export default function RequirementForms({ manage = false, onClose }) {
  const [rows, setRows] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(null);
  const [askDel, setAskDel] = useState(null);
  const [notes, setNotes] = useState({});             // coordinator notes: { requirement key | "__general": text }
  const [edit, setEdit] = useState(null);             // the note being written: { key, text }
  const pick = useRef(null);          // which requirement the file picker is for
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
  useEffect(load, []);

  const upload = async (file) => {
    const target = pick.current;
    if (!file || !target) return;
    setBusy(target.key); setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", target.label);
      if (target.key !== "__other") fd.append("requirement", target.key);
      const res = await fetch(`${API}/coordinator/requirement-templates`, { method: "POST", headers: { Accept: "application/json" }, body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || (d.errors && Object.values(d.errors)[0]?.[0]) || "Could not upload the form.");
      setMsg({ type: "success", text: "Form uploaded. Interns can download it now." });
      load();
    } catch (e) {
      setMsg({ type: "error", text: e instanceof TypeError ? "Couldn't reach the server." : e.message });
    } finally { setBusy(null); if (fileRef.current) fileRef.current.value = ""; }
  };

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

  const saveNote = async () => {
    if (!edit) return;
    setBusy(`n${edit.key}`); setMsg(null);
    try {
      const res = await fetch(`${API}/coordinator/requirement-form-notes`, {
        method: "PUT", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ requirement: edit.key, note: edit.text }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || (d.errors && Object.values(d.errors)[0]?.[0]) || "Could not save the note.");
      setEdit(null); load();
    } catch (e) {
      setMsg({ type: "error", text: e instanceof TypeError ? "Couldn't reach the server." : e.message });
    } finally { setBusy(null); }
  };
  const removeNote = async (key) => {
    setBusy(`n${key}`); setMsg(null);
    try {
      const res = await fetch(`${API}/coordinator/requirement-form-notes`, {
        method: "PUT", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ requirement: key, note: "" }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || "Could not remove the note.");
      load();
    } catch (e) {
      setMsg({ type: "error", text: e instanceof TypeError ? "Couldn't reach the server." : e.message });
    } finally { setBusy(null); }
  };
  const filesOf = (key) => (rows || []).filter((t) => t.requirement === key);

  const FileLine = ({ t }) => (
    <li className="rf-file">
      <a className="rf-link" href={`${STORAGE}${t.file_path}`} target="_blank" rel="noopener noreferrer" title={`Open or print: ${t.original_name || t.title}`}>
        <span className={`rf-ft ${kind(t.original_name || t.file_path)}`}>{kind(t.original_name || t.file_path).toUpperCase()}</span>
        <span className="rf-fn">{t.original_name || t.title}</span>
      </a>
      {manage && (
        <button type="button" className="rf-del" aria-label="Remove this form" title="Remove this form" onClick={() => setAskDel(t.id)}><Icon name="trash" size={13} /></button>
      )}
    </li>
  );

  const Attach = ({ r }) => {
    const files = filesOf(r.key);
    return (
      <div className="rf-att">
        {files.length > 0
          ? <ul className="rf-files">{files.map((t) => <FileLine key={t.id} t={t} />)}</ul>
          : manage
            ? <span className="rf-none">{NO_FORM[r.key] ? "No form needed" : "No form uploaded yet"}</span>
            : NO_FORM[r.key]
              ? <span className="rf-none info" title={NO_FORM[r.key]}>No form needed</span>
              : <span className="rf-none wait" title="Ask your OJT coordinator">Not available</span>}
        {manage && (
          <button type="button" className="rf-up" disabled={busy === r.key}
            onClick={() => { pick.current = r; fileRef.current?.click(); }}>
            <Icon name="upload" size={13} /> {busy === r.key ? "Uploading..." : files.length ? "Add file" : "Upload"}
          </button>
        )}
      </div>
    );
  };

  return (
    <Modal wide title={"Forms and templates"} onClose={onClose}
      sub={manage ? "Upload the blank form for each requirement. Interns can open and print them from Submit MOV."
        : "Blank forms from your OJT coordinator. Open or print them, fill them in, then submit the signed copy."}>
      <style>{CSS}</style>
      <input ref={fileRef} type="file" hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={(e) => upload(e.target.files?.[0])} />
      <Msg msg={msg} />
      <div className="rf-info">
        <Icon name="file" size={18} />
        <div className="rf-info-t">
          <b>Note</b>
          <span>{notes.__general || DEFAULT_NOTE}</span>
        </div>
      </div>
      {rows === null ? <Spinner /> : (
        <div className={`rf-board${manage ? " rf-manage" : ""}`}>
          {COLUMNS.map((tables) => tables.map(([title, list]) => {
            const other = title.startsWith("Other");
            // 6 and its a to g items become one wide card; every other requirement is its own card
            const blocks = [];
            list.forEach(([no, key, text]) => {
              const r = key && REQ(key);
              if (!r) blocks.push({ lead: { no, text }, subs: [] });
              else if (/^[a-z]$/.test(no) && blocks.length && blocks[blocks.length - 1].lead) blocks[blocks.length - 1].subs.push({ no, r, text });
              else blocks.push({ item: { no, r, text } });
            });
            const card = ({ no, r, text }, sub) => (
              <div key={r.key} className={`rf-card${sub ? " sub" : ""}`}>
                <div className="rf-top">
                  <span className="rf-n">{no}</span>
                  <div className="rf-t" title={text}>
                    <b>{r.label}</b>
                    {(other ? text : r.hint) && <small>{other ? text : r.hint}</small>}
                  </div>
                </div>
                <Attach r={r} />
                <div className="rf-nrow" title={notes[r.key] || undefined}>
                  {notes[r.key] && <span className="rf-nt"><b>Note:</b> {notes[r.key]}</span>}
                  {manage && (
                    <span className="rf-nact">
                      <button type="button" className="rf-up note" onClick={() => setEdit({ key: r.key, label: r.label, text: notes[r.key] || "", ph: "e.g. Bring 3 copies on long bond paper" })}>{notes[r.key] ? "Edit note" : "+ Add note"}</button>
                      {notes[r.key] && <button type="button" className="rf-up note del" disabled={busy === `n${r.key}`} onClick={() => removeNote(r.key)}>{busy === `n${r.key}` ? "Removing..." : "Remove note"}</button>}
                    </span>
                  )}
                </div>
              </div>
            );
            return (
              <section key={title} className="rf-sect">
                <h3 className="rf-h">{title}</h3>
                <div className="rf-grid">
                  {blocks.map((bl, i) => bl.item ? card(bl.item) : (
                    <div key={"g" + i} className="rf-card wide">
                      <div className="rf-top"><span className="rf-n">{bl.lead.no}</span><div className="rf-t"><b>{bl.lead.text}</b></div></div>
                      <div className="rf-subs">{bl.subs.map((x) => card(x, true))}</div>
                    </div>
                  ))}
                </div>
              </section>
            );
          }))}
          <div className="rf-legend">
            <span>Click a file name to open or print it</span>
            <span><i className="wait" /> Not available</span>
            <span><i className="info" /> No form needed</span>
          </div>
        </div>
      )}
      {askDel && (() => {
        const t = (rows || []).find((x) => x.id === askDel);
        if (!t) return null;
        return (
          <Modal title="Remove this form?" sub="Interns will no longer be able to open it." onClose={() => setAskDel(null)}>
            <div className="rf-nm">
              <div className="rf-rmfile"><span className={`rf-ft ${kind(t.original_name || t.file_path)}`}>{kind(t.original_name || t.file_path).toUpperCase()}</span><span>{t.original_name || t.title}</span></div>
              <div className="rf-nm-btns">
                <button type="button" className="rf-btn ghost" onClick={() => setAskDel(null)}>Cancel</button>
                <button type="button" className="rf-btn danger" disabled={busy === `d${t.id}`} onClick={() => remove(t)}>{busy === `d${t.id}` ? "Removing..." : "Remove"}</button>
              </div>
            </div>
          </Modal>
        );
      })()}
      {edit && (
        <Modal title="Note" sub={edit.key === "__general" ? "Shown at the top of the list for every intern." : `For ${edit.label}. Interns see it in the Note column.`} onClose={() => setEdit(null)}>
          <div className="rf-nm">
            <textarea rows={4} maxLength={600} autoFocus value={edit.text} placeholder={edit.ph}
              onChange={(e) => setEdit({ ...edit, text: e.target.value })} />
            <small>{edit.text.length}/600 · leave it empty to remove the note</small>
            <div className="rf-nm-btns">
              <button type="button" className="rf-btn ghost" onClick={() => setEdit(null)}>Cancel</button>
              <button type="button" className="rf-btn" disabled={busy === `n${edit.key}`} onClick={saveNote}>{busy === `n${edit.key}` ? "Saving..." : "Save note"}</button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}

const CSS = `
.rf-info { display: flex; gap: 10px; align-items: flex-start; background: #fff7ed; border: 1px solid #fed7aa; color: #7c2d12; border-radius: 10px; padding: 8px 12px; margin-bottom: 10px; font-size: 12.5px; line-height: 1.4; }
.rf-info svg { flex: none; margin-top: 2px; color: #e8582a; }
.rf-info b { display: inline; font-size: 12.5px; color: #431407; margin-right: 6px; }
.rf-info u { text-decoration: none; font-weight: 700; }
/* two lists side by side; text and row height scale with the window height so it fits on laptops, and it stacks on small screens */
.ix-modal:has(.rf-board) { width: min(1180px, 96vw) !important; max-width: none !important; }
.rf-two { --fs: clamp(11.5px, 1.6vh, 13.5px); --pad: clamp(3px, .85vh, 8px); display: grid; grid-template-columns: minmax(0, 1.75fr) minmax(0, 1fr); gap: 20px; align-items: start; }
.rf-wrap { min-width: 0; }
.rf-tbl { width: 100%; border-collapse: collapse; font-size: var(--fs); color: #111827; table-layout: fixed; }
.rf-tbl th, .rf-tbl td { border-bottom: 1px solid #e2e5ea; padding: var(--pad) 10px; vertical-align: middle; text-align: left; }
.rf-tbl tr:not(.rf-sec):hover td { background: #f6f7f9; }

.rf-sec th { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: transparent; color: #e8582a; font-size: calc(var(--fs) - 1.5px); font-weight: 700; letter-spacing: .06em; text-transform: uppercase; border-bottom: 2px solid #e8582a; padding: calc(var(--pad) + 1px) 10px; }
.rf-tbl tbody + tbody .rf-sec th { padding-top: 22px; }
.rf-tbl tr:not(.rf-sec):not(.rf-lead) td { height: clamp(32px, 4.6vh, 44px); }
/* the other requirements show their whole description */
.rf-full .rf-req b { white-space: normal; }
.rf-full .rf-req small { white-space: normal; overflow: visible; text-overflow: clip; }
.rf-full tr:not(.rf-sec) td { height: auto !important; }
/* the numbers and letters (1 to 7, a to g) all look the same */
.rf-no { width: 34px; text-align: center !important; font-weight: 700; font-size: var(--fs); line-height: 1.3; color: #6b7280; padding-left: 2px !important; padding-right: 2px !important; }
.rf-req b { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; font-weight: 700; font-size: var(--fs); color: #111827; line-height: 1.3; }
.rf-req small { display: block; color: #4b5563; font-size: calc(var(--fs) - 1.5px); line-height: 1.3; margin-top: 1px; }
/* a to g sit a little to the right of 1 to 7 */
.rf-sub .rf-no { padding-left: 18px !important; }
.rf-sub .rf-req { padding-left: 24px; }
.rf-sub .rf-req b { font-weight: 600; }
.rf-lead td { background: transparent; font-style: italic; }
.rf-lead .rf-req b { color: #6b7280; font-weight: 600; white-space: normal; }
.rf-att { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
.rf-files { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; width: 100%; }
.rf-file { display: flex; align-items: center; gap: 6px; min-width: 0; width: 100%; }
.rf-file .rf-link { flex: 1; min-width: 0; }
/* the attachment is just the file name with its type icon, like a file in a folder */
.rf-link { display: flex; align-items: center; gap: 7px; min-width: 0; color: #111827; text-decoration: none; padding: 2px 6px 2px 2px; border-radius: 6px; }
.rf-link:hover { background: #fff3ee; }
.rf-link:hover .rf-fn { text-decoration: underline; color: #b4421c; }
.rf-ft { flex: none; width: 24px; height: 20px; border-radius: 4px; display: grid; place-items: center; font-size: 8px; font-weight: 800; color: #fff; background: #e53935; }
.rf-ft.doc { background: #2b6cb0; } .rf-ft.xls { background: #2e7d32; } .rf-ft.ppt { background: #d9531e; }
.rf-fn { min-width: 0; font-size: calc(var(--fs) - .5px); overflow-wrap: anywhere; line-height: 1.3; }
.rf-up { white-space: nowrap; border: 0; background: none; color: #e8582a; font: inherit; font-size: calc(var(--fs) - 1px); font-weight: 700; cursor: pointer; padding: 2px 0; display: inline-flex; align-items: center; gap: 4px; }
.rf-up:hover { text-decoration: underline; }
.rf-up.note { color: #6b7280; font-weight: 600; }
.rf-nt { display: block; font-style: normal; font-size: calc(var(--fs) - 1px); color: #92400e; line-height: 1.35; }
.rf-dash { color: #c4c8d0; }
.rf-nc { vertical-align: middle; }
.rf-info-t { flex: 1; min-width: 0; }
.rf-rmfile { display: flex; align-items: center; gap: 10px; background: #f6f7f9; border-radius: 10px; padding: 10px 12px; font-size: 13.5px; overflow-wrap: anywhere; }
.rf-btn.danger { background: #dc2626; border-color: #dc2626; }
.rf-nm { display: flex; flex-direction: column; gap: 8px; min-width: min(420px, 80vw); }
.rf-nm textarea { width: 100%; font: inherit; font-size: 14px; padding: 10px 12px; border: 1px solid #d6d3d1; border-radius: 10px; resize: vertical; box-sizing: border-box; }
.rf-nm textarea:focus { outline: 2px solid #fbd5c3; border-color: #e8582a; }
.rf-nm small { color: #6b7280; font-size: 12px; }
.rf-nm-btns { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.rf-nm-btns .rf-btn { padding: 8px 18px; font-size: 13px; }
.rf-ne { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
.rf-ne textarea { width: 100%; font: inherit; font-size: 13px; padding: 7px 9px; border: 1px solid #d6d3d1; border-radius: 8px; resize: vertical; box-sizing: border-box; }
.rf-ne span { display: flex; gap: 6px; }
.rf-btn { display: inline-flex; align-items: center; gap: 5px; border: 1px solid #e8582a; background: #e8582a; color: #fff !important; font: inherit; font-size: 12px; font-weight: 700; line-height: 1; padding: 6px 12px; border-radius: 999px; cursor: pointer; }
.rf-btn.ghost { background: #fff; color: #e8582a !important; }
.rf-btn[disabled] { opacity: .5; cursor: default; }
.rf-legend { display: flex; flex-wrap: wrap; gap: 4px 18px; margin-top: 2px; padding-top: 8px; border-top: 1px solid #e2e5ea; color: #6b7280; font-size: 11.5px; }
.rf-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; background: #fffbeb; border: 1px solid #f5d28a; }
.rf-legend i.info { background: #eff6ff; border-color: #b9cdf5; }
.rf-none { font-size: calc(var(--fs) - 1px); color: #6b7280; line-height: 1.3; }
.rf-none.info { color: #1e40af; background: #eff6ff; border-radius: 6px; padding: 3px 8px; }
.rf-none.wait { color: #92400e; background: #fffbeb; border-radius: 6px; padding: 3px 8px; }
.rf-del { border: 1px solid #f3c9c9; background: #fff; color: #b91c1c; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; padding: 5px 7px; border-radius: 999px; line-height: 1; display: inline-flex; }
.rf-del:hover { background: #fef2f2; }
.rf-ask { display: inline-flex; gap: 4px; }

/* requirement cards: every card has the same parts in the same places, so they all line up */
.rf-board { --fs: 13px; display: flex; flex-direction: column; gap: 18px; }
.rf-sect { min-width: 0; }
.rf-h { margin: 0 0 8px; font-size: 11.5px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: #e8582a; }
.rf-grid, .rf-subs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); align-items: start; gap: 10px; }
.rf-card { min-width: 0; display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid #e7e9ee; border-radius: 12px; background: #fff; box-sizing: border-box; height: 188px; }
.rf-card.wide { grid-column: 1 / -1; background: #fafbfc; gap: 10px; height: auto; }
.rf-grid > .rf-card.wide { grid-row: auto; }
.rf-top { display: flex; gap: 10px; align-items: flex-start; min-width: 0; }
.rf-n { flex: none; width: 24px; height: 24px; border-radius: 50%; background: #eef0f4; color: #6b7280; display: grid; place-items: center; font-size: 11.5px; font-weight: 700; }
.rf-card.sub .rf-n { background: #fff; border: 1px solid #dfe2e8; }
.rf-t { min-width: 0; flex: 1; }
.rf-t b { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 13px; font-weight: 600; line-height: 17px; min-height: 34px; color: #111827; }
.rf-t small { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-top: 3px; font-size: 11.5px; line-height: 16px; min-height: 32px; color: #6b7280; }
.rf-card.wide > .rf-top .rf-t b { display: block; min-height: 0; -webkit-line-clamp: unset; color: #6b7280; font-weight: 600; line-height: 24px; }
/* the file: one button, same height everywhere (name up to two lines, full name on hover) */
.rf-card .rf-att { margin-top: auto; width: 100%; }
.rf-card .rf-files, .rf-card .rf-file { width: 100%; }
.rf-card .rf-link { width: 100%; box-sizing: border-box; min-height: 44px; border: 1px solid #e7e9ee; border-radius: 9px; padding: 5px 9px 5px 6px; background: #fff; }
.rf-card .rf-link:hover { border-color: #f6c9b3; background: #fff8f4; }
.rf-card .rf-fn { font-size: 12px; font-weight: 500; line-height: 16px; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.rf-card .rf-none { display: flex; align-items: center; box-sizing: border-box; width: 100%; min-height: 44px; padding: 5px 12px; border-radius: 9px; font-size: 12px; font-weight: 500; line-height: 16px; }
.rf-card .rf-none.info { background: #eff6ff; color: #1e40af; }
.rf-card .rf-none.wait { background: #fffbeb; color: #92400e; }
.rf-card .rf-none:not(.info):not(.wait) { background: #f6f7f9; color: #6b7280; }
/* the coordinator's note: always one block under the file, two lines at most */
.rf-nrow { flex: none; display: flex; flex-direction: column; gap: 2px; align-items: flex-start; min-height: 32px; }
.rf-nrow .rf-nt { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 11.5px; line-height: 16px; color: #92400e; }
.rf-nrow .rf-nt b { font-weight: 700; }
.rf-card .rf-up { font-size: 11.5px; }
.rf-nact { display: inline-flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.rf-up.note.del { color: #b91c1c; }
.rf-manage .rf-nrow { min-height: 54px; }
.rf-manage .rf-card { height: 244px; }
.rf-manage .rf-card.wide { height: auto; }
@media (max-width: 1100px) { .rf-grid, .rf-subs { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 820px) { .rf-grid, .rf-subs { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) { .rf-grid, .rf-subs { grid-template-columns: 1fr; } }
@media (max-width: 980px) { .rf-two { grid-template-columns: 1fr; --fs: 13px; --pad: 7px; } }
/* phones: each requirement becomes a small card, the attachment under its name */
@media (max-width: 640px) {
  .rf-tbl, .rf-tbl tbody { display: block; }
  .rf-tbl colgroup { display: none; }
  .rf-tbl tr { display: grid; grid-template-columns: 30px minmax(0, 1fr); border-bottom: 1px solid #e2e5ea; }
  .rf-tbl tr:last-child { border-bottom: 0; }
  .rf-tbl th, .rf-tbl td { display: block; border: 0 !important; }
  .rf-sec { display: block; }
  .rf-sec th + th { display: none; }
  .rf-lead .rf-req { grid-column: 2; }
  .rf-at, .rf-nc { grid-column: 2; padding-top: 0 !important; }
  .rf-sec th:nth-child(3), .rf-sec th:nth-child(2):not([colspan]) { display: none; }
  .rf-req small { white-space: normal; }
}
`;