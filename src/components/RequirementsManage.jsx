// RequirementsManage.jsx
// The OJT coordinator's list of internship requirements (Requirements → Requirement list): add, rename, describe,
// reorder, move to another phase, remove (hidden from interns; files already sent are kept) and put back.
// The blank forms of each requirement are set in "Forms and templates" (a pop-up opened from this page).
// Same layout as "Due dates & reminders": search and buttons on top, the phase tabs, one table.
import { useEffect, useState } from "react";
import { Icon, Msg, Spinner, Modal, PHASE_LABEL, loadRequirements } from "./DashKit.jsx";
import RequirementForms from "../pages/RequirementForms.jsx";
import { API } from "../config.js";

const PH = ["pre", "during", "post"];
const J = { "Content-Type": "application/json", Accept: "application/json" };
const BLANK = { label: "", hint: "", repeat: false };

export default function RequirementsManage({ onChanged }) {
  const [data, setData] = useState(null);       // { pre: [...], during: [...], post: [...] } every requirement, removed ones too
  const [phase, setPhase] = useState("pre");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState(null);         // shown on the page
  const [formMsg, setFormMsg] = useState(null); // shown inside the pop-up
  const [busy, setBusy] = useState(null);
  const [form, setForm] = useState(null);       // the pop-up: { mode: "add" | "edit", id?, label, hint, repeat, phase }
  const [askDel, setAskDel] = useState(null);
  const [formsOpen, setFormsOpen] = useState(false);
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
  // inForm: show an error inside the pop-up (the page message stays as it is)
  const call = async (key, method, url, body, ok, inForm = false) => {
    setBusy(key); setMsg(null); setFormMsg(null);
    try {
      const res = await fetch(`${API}${url}`, { method, headers: J, body: body ? JSON.stringify(body) : undefined });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || (d.errors && Object.values(d.errors)[0]?.[0]) || "Something went wrong.");
      await changed(ok || d.message || "Saved.");
      return true;
    } catch (e) {
      const m = { type: "error", text: e instanceof TypeError ? "Couldn't reach the server." : e.message };
      if (inForm) setFormMsg(m); else setMsg(m);
      return false;
    } finally { setBusy(null); }
  };

  const list = (data?.[phase] || []);
  const active = list.filter((r) => r.active);
  const removed = list.filter((r) => !r.active);
  const query = q.trim().toLowerCase();
  const shown = query ? active.filter((r) => `${r.label} ${r.hint || ""}`.toLowerCase().includes(query)) : active;

  // save a new order: shown at once on the page, then saved (put back as it was if saving fails)
  const saveOrder = async (ids) => {
    const before = data;
    const byId = new Map(list.map((r) => [r.id, r]));
    setData({ ...data, [phase]: [...ids.map((id) => byId.get(id)), ...list.filter((r) => !r.active)] });
    if (!(await call(`o${ids[0]}`, "POST", "/coordinator/requirements/order", { ids }, "Order saved."))) setData(before);
  };
  const move = (i, d) => {
    const ids = active.map((r) => r.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    saveOrder(ids);
  };

  // drag a row to its new place (the line shows where it will go)
  const [drag, setDrag] = useState(null);   // { from, to, below }
  const canDrag = !query && !busy;
  const dragStart = (e, i) => {
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", String(active[i].id)); } catch { /* some browsers need data to drag */ }
    setDrag({ from: i, to: i, below: false });
  };
  const dragOver = (e, i) => {
    if (!drag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const box = e.currentTarget.getBoundingClientRect();
    const below = e.clientY > box.top + box.height / 2;
    if (drag.to !== i || drag.below !== below) setDrag({ ...drag, to: i, below });
  };
  const drop = (e) => {
    e.preventDefault();
    if (!drag) return;
    const ids = active.map((r) => r.id);
    const [moved] = ids.splice(drag.from, 1);
    let at = drag.to + (drag.below ? 1 : 0);
    if (drag.from < at) at -= 1;
    setDrag(null);
    if (at === drag.from) return;
    ids.splice(at, 0, moved);
    saveOrder(ids);
  };
  const lineOf = (i) => (!drag || drag.from === i || drag.to !== i ? ""
    : drag.below ? (i + 1 === drag.from ? "" : " drop-below") : (i - 1 === drag.from ? "" : " drop-above"));

  const openAdd = () => { setFormMsg(null); setForm({ mode: "add", ...BLANK, phase }); };
  const openEdit = (r) => { setFormMsg(null); setForm({ mode: "edit", id: r.id, label: r.label, hint: r.hint || "", repeat: !!r.repeat, phase }); };
  const saveForm = async (e) => {
    e.preventDefault();
    const label = form.label.trim();
    if (!label) return;
    if (form.mode === "add") {
      if (await call("form", "POST", "/coordinator/requirements", { phase: form.phase, label, hint: form.hint.trim(), repeat: form.repeat },
        `"${label}" added to ${PHASE_LABEL[form.phase]}.`, true)) { setForm(null); setPhase(form.phase); }
      return;
    }
    const moved = form.phase !== phase;
    const body = { label, hint: form.hint, repeat: form.repeat, ...(moved ? { phase: form.phase } : {}) };
    if (await call("form", "PUT", `/coordinator/requirements/${form.id}`, body,
      moved ? `"${label}" moved to ${PHASE_LABEL[form.phase]}.` : `"${label}" saved.`, true)) setForm(null);
  };

  return (
    <div className="dl-panel dl-flat rqm-panel">
      <style>{CSS}</style>
      <div className="dl-head">
        <div className="ix-search dl-search">
          <Icon name="search" size={16} />
          <input type="text" placeholder="Search requirement..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="rqm-tools">
          <button type="button" className="ix-b ghost" onClick={() => setFormsOpen(true)}><Icon name="file" size={14} /> Forms and templates</button>
          <button type="button" className="ix-b primary" onClick={openAdd}><Icon name="plus" size={14} /> Add requirement</button>
        </span>
      </div>

      <div className="dl-tabs" role="tablist" aria-label="Phase">
        {PH.map((p) => (
          <button key={p} type="button" role="tab" aria-selected={phase === p} className={phase === p ? "dl-tab on" : "dl-tab"} onClick={() => setPhase(p)}>
            {PHASE_LABEL[p]} <span className="rqm-n">{(data?.[p] || []).filter((r) => r.active).length}</span></button>
        ))}
      </div>

      <Msg msg={msg} />
      {setupErr && <div className="rqm-warn"><Icon name="warn" size={15} /> {setupErr}</div>}

      {data === null ? <Spinner /> : (
        <div className="dl-table">
          <div className="dl-tr dl-th rqm-tr">
            <span>Requirement</span><span>Files sent</span><span>Order</span><span />
          </div>
          {active.length === 0 ? (
            <div className="dl-empty">No requirements in {PHASE_LABEL[phase]} yet. Click Add requirement.</div>
          ) : shown.length === 0 ? (
            <div className="dl-empty">No requirement matches "{q}".</div>
          ) : shown.map((r) => {
            const i = active.indexOf(r);
            return (
              <div key={r.id} className={`dl-item rqm-item${canDrag ? " can-drag" : ""}${drag?.from === i ? " dragging" : ""}${lineOf(i)}`}
                draggable={canDrag} onDragStart={(e) => dragStart(e, i)} onDragOver={(e) => dragOver(e, i)} onDrop={drop} onDragEnd={() => setDrag(null)}>
                <div className="dl-tr rqm-tr">
                  <span className="rqm-what">
                    <span className="dl-name"><b>{i + 1}</b>{r.label}</span>
                    {r.hint && <small>{r.hint}</small>}
                    {r.repeat && <em className="rqm-tag">Can be sent many times</em>}
                  </span>
                  <span className="rqm-sent">{r.sent ? `${r.sent} file${r.sent === 1 ? "" : "s"}` : "None yet"}</span>
                  <span className="rqm-order">
                    {/* drag the row (or use the arrows). Turned off while searching: the numbers would not match the list */}
                    <span className="rqm-grip" title={canDrag ? "Drag to move" : "Clear the search to reorder"} aria-hidden="true">
                      <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor"><circle cx="3" cy="3" r="1.5" /><circle cx="9" cy="3" r="1.5" /><circle cx="3" cy="8" r="1.5" /><circle cx="9" cy="8" r="1.5" /><circle cx="3" cy="13" r="1.5" /><circle cx="9" cy="13" r="1.5" /></svg>
                    </span>
                    <button type="button" className="rqm-ic" aria-label="Move up" title="Move up" disabled={i === 0 || !!busy || !!query} onClick={() => move(i, -1)}><Icon name="chevronLeft" size={14} /></button>
                    <button type="button" className="rqm-ic" aria-label="Move down" title="Move down" disabled={i === active.length - 1 || !!busy || !!query} onClick={() => move(i, 1)}><Icon name="chevronRight" size={14} /></button>
                  </span>
                  <span className="rqm-acts">
                    <button type="button" className="ix-b ghost sm" onClick={() => openEdit(r)}><Icon name="pencil" size={13} /> Edit</button>
                    <button type="button" className="ix-b ghost sm rqm-del" onClick={() => { setMsg(null); setAskDel(r); }}><Icon name="trash" size={13} /> Remove</button>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data !== null && (phase === "pre" || removed.length > 0) && (
        <div className="rqm-foot">
          {phase === "pre" && <small className="rqm-note"><Icon name="info" size={13} /> Every pre-internship requirement must be approved before the intern can tap in at the kiosk.</small>}
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
        </div>
      )}

      {/* add or edit a requirement */}
      {form && (
        <Modal title={form.mode === "add" ? "Add a requirement" : "Edit requirement"}
          sub={form.mode === "add" ? "It shows right away in the interns' Submit MOV." : form.label || " "} onClose={() => setForm(null)}>
          <form className="rqm-form" onSubmit={saveForm}>
            <Msg msg={formMsg} />
            <div className="ix-field"><label>Name</label>
              <input type="text" className="ix-input" maxLength={150} required autoFocus value={form.label} placeholder="e.g. NBI Clearance"
                onChange={(e) => setForm({ ...form, label: e.target.value })} /></div>
            <div className="ix-field"><label>Short description <span className="rqm-opt">(optional, shown under the name)</span></label>
              <input type="text" className="ix-input" maxLength={300} value={form.hint} placeholder="e.g. Original copy, valid this year"
                onChange={(e) => setForm({ ...form, hint: e.target.value })} /></div>
            <div className="ix-field"><label>Phase</label>
              <select className="ix-select" value={form.phase} onChange={(e) => setForm({ ...form, phase: e.target.value })}>
                {PH.map((p) => <option key={p} value={p}>{PHASE_LABEL[p]}</option>)}
              </select></div>
            <label className="rqm-check"><input type="checkbox" checked={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.checked })} /> Can be sent many times (like weekly reports)</label>
            {form.phase === "pre" && form.mode === "add" && <small className="rqm-note"><Icon name="info" size={13} /> Interns must have it approved before they can tap in at the kiosk.</small>}
            <div className="rqm-btns">
              <button type="button" className="ix-b ghost" onClick={() => setForm(null)} disabled={busy === "form"}>Cancel</button>
              <button type="submit" className="ix-b primary" disabled={!form.label.trim() || busy === "form"}>
                {busy === "form" ? "Saving..." : form.mode === "add" ? "Add requirement" : "Save changes"}</button>
            </div>
          </form>
        </Modal>
      )}

      {askDel && (
        <Modal title="Remove this requirement?" sub={askDel.label} onClose={() => setAskDel(null)}>
          <div className="rqm-form">
            <p className="rqm-confirm">Interns will no longer see it in Submit MOV, and it no longer counts toward their progress.
              {askDel.sent ? ` The ${askDel.sent} file${askDel.sent === 1 ? "" : "s"} already sent ${askDel.sent === 1 ? "is" : "are"} kept.` : ""} You can put it back later.</p>
            <div className="rqm-btns">
              <button type="button" className="ix-b ghost" onClick={() => setAskDel(null)} disabled={busy === `d${askDel.id}`}>Keep it</button>
              <button type="button" className="ix-b danger" disabled={busy === `d${askDel.id}`}
                onClick={async () => { if (await call(`d${askDel.id}`, "DELETE", `/coordinator/requirements/${askDel.id}`, null, `"${askDel.label}" removed.`)) setAskDel(null); }}>
                {busy === `d${askDel.id}` ? "Removing..." : "Yes, remove"}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* the blank forms interns download, for each requirement */}
      {formsOpen && <RequirementForms manage onClose={() => setFormsOpen(false)} />}
    </div>
  );
}

const CSS = `
/* the table uses the "Due dates & reminders" look (dl-*); these are only the extra parts */
.rqm-tools { display: inline-flex; gap: 8px; margin-left: auto; flex-wrap: wrap; }
.dl-tr.rqm-tr { grid-template-columns: minmax(0, 1fr) 110px 110px 190px; }
/* drag to reorder: the row can be picked up anywhere (buttons still click), a line shows where it will drop */
.rqm-item { position: relative; }
.rqm-item.can-drag > .dl-tr { cursor: grab; user-select: none; }
.rqm-item.can-drag > .dl-tr :is(button, a) { cursor: pointer; }
.rqm-item.dragging > .dl-tr { opacity: .45; background: #fff7f2 !important; }
.rqm-item.drop-above::before, .rqm-item.drop-below::after { content: ""; position: absolute; left: 10px; right: 10px; height: 3px; border-radius: 3px; background: #e8582a; z-index: 3; pointer-events: none; }
.rqm-item.drop-above::before { top: -2px; } .rqm-item.drop-below::after { bottom: -2px; }
.rqm-grip { width: 22px; height: 30px; display: grid; place-items: center; color: #9ca3af; }
.rqm-item.can-drag:hover .rqm-grip { color: #c2410c; }
.rqm-what { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.rqm-what > small { padding-left: 32px; font-size: 12px; color: #6b7280; line-height: 1.4; }
.rqm-tag { margin-left: 32px; align-self: flex-start; font-style: normal; font-size: 11px; font-weight: 600; padding: 1px 8px; border-radius: 99px; background: #eef2ff; color: #4338ca; }
.rqm-sent { font-size: 12.5px; color: #4b5563; }
.rqm-order { display: inline-flex; align-items: center; gap: 4px; }
.rqm-acts { display: flex; gap: 6px; justify-content: flex-end; }
.rqm-ic { width: 30px; height: 30px; padding: 0 !important; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; color: #4b5563; display: grid; place-items: center; cursor: pointer; }
.rqm-ic svg { transform: rotate(90deg); }
.rqm-ic:hover:not(:disabled) { border-color: #f6c7b0; color: #c2410c; }
.rqm-ic:disabled { opacity: .35; cursor: default; }
.rqm-del { color: #b91c1c !important; }
.rqm-n { min-width: 18px; height: 18px; margin-left: 6px; padding: 0 5px; border-radius: 9px; background: #f1f2f4; color: #475569; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
.rqm-warn { display: flex; gap: 8px; align-items: center; padding: 9px 12px; border-radius: 10px; background: #fffbeb; color: #92400e; font-size: 13px; }
.rqm-foot { flex: none; display: flex; flex-direction: column; gap: 10px; }
.rqm-note { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #92400e; }
.rqm-removed { border: 1px solid #e8ebf0; border-radius: 12px; padding: 10px 14px; background: #fff; }
.rqm-removed summary { cursor: pointer; font-size: 13px; font-weight: 600; color: #4b5563; }
.rqm-removed ul { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.rqm-removed li { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.rqm-removed li span { display: flex; flex-direction: column; } .rqm-removed li b { font-size: 13px; color: #6b7280; text-decoration: line-through; } .rqm-removed li small { font-size: 12px; color: #9ca3af; }
/* the pop-ups: the same form layout as "New quarterly report" */
.rqm-form { display: flex; flex-direction: column; gap: 14px; }
.rqm-form .ix-input, .rqm-form .ix-select { width: 100%; box-sizing: border-box; }
.rqm-opt { font-weight: 400; color: #6b7280; }
.rqm-check { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: #374151; cursor: pointer; }
.rqm-check input { width: 16px; height: 16px; accent-color: #e8582a; }
.rqm-confirm { margin: 0; font-size: 13.5px; line-height: 1.55; color: #4b5563; }
.rqm-btns { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
@media (max-width: 760px) {
  .dl-tr.rqm-tr { grid-template-columns: minmax(0, 1fr) auto; }
  .dl-tr.rqm-tr.dl-th > span:nth-child(n+2) { display: none; }
  .rqm-sent { grid-column: 1; } .rqm-order { grid-column: 2; grid-row: 1; } .rqm-acts { grid-column: 1 / -1; justify-content: flex-start; }
}
`;