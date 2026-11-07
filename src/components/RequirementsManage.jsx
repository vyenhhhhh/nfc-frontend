// RequirementsManage.jsx
// The OJT coordinator's list of internship requirements: add, rename, describe, reorder, move to another
// phase, remove (hidden from interns; files already sent are kept) and put back.
// Opened from Interns → Requirements → "Manage requirements".
import { useEffect, useState } from "react";
import { Drawer, Icon, Msg, Spinner, PHASE_LABEL, loadRequirements } from "./DashKit.jsx";
import { API } from "../config.js";

const PH = ["pre", "during", "post"];
const J = { "Content-Type": "application/json", Accept: "application/json" };

export default function RequirementsManage({ onClose, onChanged }) {
  const [data, setData] = useState(null);       // { pre: [...], during: [...], post: [...] } every requirement, removed ones too
  const [phase, setPhase] = useState("pre");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(null);
  const [edit, setEdit] = useState(null);       // { id, label, hint, repeat, phase } being edited
  const [add, setAdd] = useState({ label: "", hint: "", repeat: false });
  const [askDel, setAskDel] = useState(null);
  const [setupErr, setSetupErr] = useState(null);

  const load = async () => {
    try {
      const res = await fetch(`${API}/coordinator/requirements`, { headers: { Accept: "application/json" }, cache: "no-store" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || "Could not load the requirements.");
      setData(d.requirements); setSetupErr(null);
    } catch (e) { setSetupErr(e instanceof TypeError ? "Couldn't reach the server." : e.message); setData({ pre: [], during: [], post: [] }); }
  };
  useEffect(() => { load(); }, []);

  // after every change: this list, the lists every page uses, and the page behind
  const changed = async (text) => {
    setMsg({ type: "success", text });
    await load();
    await loadRequirements(true);
    onChanged && onChanged();
  };
  const call = async (key, method, url, body, ok) => {
    setBusy(key); setMsg(null);
    try {
      const res = await fetch(`${API}${url}`, { method, headers: J, body: body ? JSON.stringify(body) : undefined });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || (d.errors && Object.values(d.errors)[0]?.[0]) || "Something went wrong.");
      await changed(ok || d.message || "Saved.");
      return true;
    } catch (e) {
      setMsg({ type: "error", text: e instanceof TypeError ? "Couldn't reach the server." : e.message });
      return false;
    } finally { setBusy(null); }
  };

  const list = (data?.[phase] || []);
  const active = list.filter((r) => r.active);
  const removed = list.filter((r) => !r.active);

  const move = (i, d) => {
    const ids = active.map((r) => r.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    call(`o${ids[j]}`, "POST", "/coordinator/requirements/order", { ids }, "Order saved.");
  };

  const saveEdit = async () => {
    const r = list.find((x) => x.id === edit.id);
    const body = { label: edit.label.trim(), hint: edit.hint, repeat: edit.repeat, ...(edit.phase !== phase ? { phase: edit.phase } : {}) };
    if (await call(`e${edit.id}`, "PUT", `/coordinator/requirements/${edit.id}`, body,
      edit.phase !== phase ? `"${body.label}" moved to ${PHASE_LABEL[edit.phase]}.` : `"${body.label || r?.label}" saved.`)) setEdit(null);
  };
  const addOne = async (e) => {
    e.preventDefault();
    if (!add.label.trim()) return;
    if (await call("add", "POST", "/coordinator/requirements", { phase, label: add.label.trim(), hint: add.hint.trim(), repeat: add.repeat })) setAdd({ label: "", hint: "", repeat: false });
  };

  return (
    <Drawer wide inPage icon="list" kicker="Interns → Requirements" title="Manage requirements" onClose={onClose}>
      <style>{CSS}</style>
      <p className="rqm-intro">This is the list interns see in <b>Submit MOV</b>. Changes show right away. Removing a requirement only hides it: files interns already sent for it are kept.</p>
      <Msg msg={msg} />
      {setupErr && <div className="rqm-warn"><Icon name="warn" size={15} /> {setupErr}</div>}

      <div className="rqm-tabs" role="tablist" aria-label="Phase">
        {PH.map((p) => (
          <button key={p} type="button" role="tab" aria-selected={phase === p} className={phase === p ? "on" : ""} onClick={() => { setPhase(p); setEdit(null); }}>
            {PHASE_LABEL[p]} <span className="rqm-n">{(data?.[p] || []).filter((r) => r.active).length}</span></button>
        ))}
      </div>

      {data === null ? <Spinner /> : (
        <>
          <ol className="rqm-list">
            {active.length === 0 && <li className="rqm-empty">No requirements in this phase yet. Add one below.</li>}
            {active.map((r, i) => edit?.id === r.id ? (
              <li key={r.id} className="rqm-row editing">
                <span className="rqm-no">{i + 1}</span>
                <div className="rqm-form">
                  <label>Name<input type="text" maxLength={150} value={edit.label} autoFocus onChange={(e) => setEdit({ ...edit, label: e.target.value })} /></label>
                  <label>Short description <small>(shown under the name)</small>
                    <input type="text" maxLength={300} value={edit.hint || ""} placeholder="e.g. Signed and notarized, 3 copies" onChange={(e) => setEdit({ ...edit, hint: e.target.value })} /></label>
                  <div className="rqm-line">
                    <label className="rqm-inline">Phase
                      <select value={edit.phase} onChange={(e) => setEdit({ ...edit, phase: e.target.value })}>
                        {PH.map((p) => <option key={p} value={p}>{PHASE_LABEL[p]}</option>)}
                      </select></label>
                    <label className="rqm-check"><input type="checkbox" checked={!!edit.repeat} onChange={(e) => setEdit({ ...edit, repeat: e.target.checked })} /> Can be sent many times (like weekly reports)</label>
                  </div>
                  <div className="rqm-btns">
                    <button type="button" className="ix-b ghost sm" onClick={() => setEdit(null)}>Cancel</button>
                    <button type="button" className="ix-b primary sm" disabled={!edit.label.trim() || busy === `e${r.id}`} onClick={saveEdit}>{busy === `e${r.id}` ? "Saving…" : "Save"}</button>
                  </div>
                </div>
              </li>
            ) : (
              <li key={r.id} className="rqm-row">
                <span className="rqm-no">{i + 1}</span>
                <div className="rqm-what">
                  <b>{r.label}</b>
                  {r.hint && <small>{r.hint}</small>}
                  <span className="rqm-tags">
                    {r.repeat && <em>Can be sent many times</em>}
                    <em className="mut">{r.sent ? `${r.sent} file${r.sent === 1 ? "" : "s"} sent` : "No files sent yet"}</em>
                  </span>
                </div>
                <div className="rqm-acts">
                  <button type="button" className="rqm-ic" aria-label="Move up" title="Move up" disabled={i === 0 || !!busy} onClick={() => move(i, -1)}><Icon name="chevronLeft" size={14} /></button>
                  <button type="button" className="rqm-ic" aria-label="Move down" title="Move down" disabled={i === active.length - 1 || !!busy} onClick={() => move(i, 1)}><Icon name="chevronRight" size={14} /></button>
                  <button type="button" className="ix-b ghost sm" onClick={() => setEdit({ id: r.id, label: r.label, hint: r.hint || "", repeat: !!r.repeat, phase })}><Icon name="pencil" size={13} /> Edit</button>
                  <button type="button" className="ix-b ghost sm rqm-del" onClick={() => setAskDel(r)}><Icon name="trash" size={13} /> Remove</button>
                </div>
              </li>
            ))}
          </ol>

          {/* add a new one to this phase */}
          <form className="rqm-add" onSubmit={addOne}>
            <b><Icon name="plus" size={14} /> Add a requirement to {PHASE_LABEL[phase]}</b>
            <div className="rqm-addrow">
              <input type="text" maxLength={150} required value={add.label} placeholder="Name, e.g. NBI Clearance" onChange={(e) => setAdd({ ...add, label: e.target.value })} />
              <input type="text" maxLength={300} value={add.hint} placeholder="Short description (optional), e.g. Original copy, valid this year" onChange={(e) => setAdd({ ...add, hint: e.target.value })} />
            </div>
            <div className="rqm-line">
              <label className="rqm-check"><input type="checkbox" checked={add.repeat} onChange={(e) => setAdd({ ...add, repeat: e.target.checked })} /> Can be sent many times (like weekly reports)</label>
              <button type="submit" className="ix-b primary sm" disabled={!add.label.trim() || busy === "add"}>{busy === "add" ? "Adding…" : "Add requirement"}</button>
            </div>
            {phase === "pre" && <small className="rqm-note">Every pre-internship requirement must be approved before the intern can tap in at the kiosk.</small>}
          </form>

          {removed.length > 0 && (
            <details className="rqm-removed">
              <summary>Removed ({removed.length})</summary>
              <ul>
                {removed.map((r) => (
                  <li key={r.id}>
                    <span><b>{r.label}</b><small>{r.sent ? `${r.sent} file${r.sent === 1 ? "" : "s"} kept` : "No files"}</small></span>
                    <button type="button" className="ix-b ghost sm" disabled={busy === `p${r.id}`} onClick={() => call(`p${r.id}`, "PUT", `/coordinator/requirements/${r.id}`, { active: true }, `"${r.label}" put back.`)}>
                      {busy === `p${r.id}` ? "…" : "Put back"}</button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {askDel && (
        <div className="rqm-ask" role="alertdialog" aria-label="Remove this requirement?">
          <div className="rqm-ask-box">
            <b>Remove "{askDel.label}"?</b>
            <p>Interns will no longer see it in Submit MOV, and it no longer counts toward their progress.
              {askDel.sent ? ` The ${askDel.sent} file${askDel.sent === 1 ? "" : "s"} already sent ${askDel.sent === 1 ? "is" : "are"} kept.` : ""} You can put it back later.</p>
            <div className="rqm-btns">
              <button type="button" className="ix-b ghost sm" onClick={() => setAskDel(null)}>Cancel</button>
              <button type="button" className="ix-b danger sm" disabled={busy === `d${askDel.id}`}
                onClick={async () => { if (await call(`d${askDel.id}`, "DELETE", `/coordinator/requirements/${askDel.id}`)) setAskDel(null); }}>
                {busy === `d${askDel.id}` ? "Removing…" : "Remove"}</button>
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}

const CSS = `
.rqm-intro { margin: 0 0 12px; font-size: 13px; line-height: 1.5; color: #4b5563; }
.rqm-warn { display: flex; gap: 8px; align-items: center; padding: 9px 12px; margin-bottom: 12px; border-radius: 10px; background: #fffbeb; color: #92400e; font-size: 13px; }
.rqm-tabs { display: inline-flex; gap: 4px; padding: 3px; background: #f3f4f6; border: 1px solid #e8ebf0; border-radius: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.rqm-tabs button { display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 12px; border: 0; border-radius: 8px; background: transparent; font: inherit; font-size: 12.5px; font-weight: 600; color: #4b5563; cursor: pointer; }
.rqm-tabs button.on { background: #fff; color: #c2410c; box-shadow: 0 1px 3px rgba(15,23,42,.12); }
.rqm-n { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; background: #e5e7eb; color: #475569; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; }
.rqm-list { list-style: none; margin: 0 0 14px; padding: 0; border: 1px solid #e8ebf0; border-radius: 12px; overflow: hidden; }
.rqm-row { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 11px 14px; border-bottom: 1px solid #f1f3f6; background: #fff; }
.rqm-row:last-child { border-bottom: 0; }
.rqm-row.editing { align-items: start; background: #fffaf7; }
.rqm-empty { padding: 18px; text-align: center; font-size: 13px; color: #6b7280; }
.rqm-no { width: 26px; height: 26px; border-radius: 50%; background: #fff1ea; color: #c2410c; display: grid; place-items: center; font-size: 12px; font-weight: 700; }
.rqm-what { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.rqm-what b { font-size: 13.5px; font-weight: 600; color: #111827; }
.rqm-what small { font-size: 12px; color: #6b7280; line-height: 1.4; }
.rqm-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 3px; }
.rqm-tags em { font-style: normal; font-size: 11px; font-weight: 600; padding: 1px 8px; border-radius: 99px; background: #eef2ff; color: #4338ca; }
.rqm-tags em.mut { background: #f3f4f6; color: #6b7280; }
.rqm-acts { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
.rqm-ic { width: 30px; height: 30px; padding: 0 !important; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; color: #4b5563; display: grid; place-items: center; cursor: pointer; }
.rqm-ic svg { transform: rotate(90deg); }
.rqm-ic:hover:not(:disabled) { border-color: #f6c7b0; color: #c2410c; }
.rqm-ic:disabled { opacity: .35; cursor: default; }
.rqm-del { color: #b91c1c !important; }
.rqm-form, .rqm-add { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.rqm-form label, .rqm-inline { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; font-weight: 600; color: #374151; }
.rqm-form label small { font-weight: 400; color: #6b7280; }
.rqm-form input[type="text"], .rqm-add input[type="text"], .rqm-inline select { width: 100%; box-sizing: border-box; height: 36px; padding: 0 11px; border: 1px solid #d6d9de; border-radius: 9px; font: inherit; font-size: 13px; background: #fff; }
.rqm-form input:focus, .rqm-add input:focus, .rqm-inline select:focus { outline: 2px solid #fbd5c3; border-color: #e8582a; }
.rqm-inline { flex-direction: row; align-items: center; gap: 8px; }
.rqm-inline select { width: auto; min-width: 170px; }
.rqm-line { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.rqm-check { display: inline-flex !important; flex-direction: row !important; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 500 !important; color: #374151; cursor: pointer; }
.rqm-check input { width: 15px; height: 15px; accent-color: #e8582a; }
.rqm-btns { display: flex; justify-content: flex-end; gap: 8px; }
.rqm-add { padding: 14px; border: 1.5px dashed #f2c9b4; border-radius: 12px; background: #fffaf7; }
.rqm-add > b { display: flex; align-items: center; gap: 6px; font-size: 13.5px; color: #9a3412; }
.rqm-addrow { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); gap: 8px; }
.rqm-note { font-size: 12px; color: #92400e; }
.rqm-removed { margin-top: 14px; border: 1px solid #e8ebf0; border-radius: 12px; padding: 10px 14px; }
.rqm-removed summary { cursor: pointer; font-size: 13px; font-weight: 600; color: #4b5563; }
.rqm-removed ul { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.rqm-removed li { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.rqm-removed li span { display: flex; flex-direction: column; } .rqm-removed li b { font-size: 13px; color: #6b7280; text-decoration: line-through; } .rqm-removed li small { font-size: 12px; color: #9ca3af; }
.rqm-ask { position: absolute; inset: 0; z-index: 5; display: grid; place-items: center; background: rgba(255,255,255,.75); }
.rqm-ask-box { width: min(420px, 90%); padding: 18px; border-radius: 14px; background: #fff; border: 1px solid #e5e7eb; box-shadow: 0 18px 40px rgba(15,23,42,.18); display: flex; flex-direction: column; gap: 8px; }
.rqm-ask-box b { font-size: 15px; color: #111827; } .rqm-ask-box p { margin: 0; font-size: 13px; line-height: 1.5; color: #4b5563; }
@media (max-width: 640px) { .rqm-row { grid-template-columns: 26px minmax(0, 1fr); } .rqm-acts { grid-column: 2; justify-content: flex-start; } .rqm-addrow { grid-template-columns: 1fr; } }
`;
