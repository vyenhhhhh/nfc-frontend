//CoordinatorTools.jsx
// Coordinator pages that put many interns or HTEs in one view:
//   ProjectsBoard        project-based interns: confirm the project the HTE supervisor marked complete
//   HteBoard             HTEs and MOAs: who is placed where, and which MOA is expired or expiring soon
//   RequirementsTracker  every intern x every requirement in one table (like the coordinator's spreadsheet)
//   downloadCsv          saves rows as a CSV file that opens in Excel or Google Sheets
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Icon, Avatar, Badge, Msg, PageHeader, Drawer, OA_CSS, calcHours, programKey, requiredHoursFor, modalityOf, scopeOf, MODALITIES, SCOPES,
  PRE_REQUIREMENTS, DURING_REQUIREMENTS, POST_REQUIREMENTS, outputRequired, ojtComplete, reportFor, liveRefresh, HTE_CATEGORIES,
} from "./DashKit.jsx";
import { API } from "../config.js";
import RequirementsManage from "./RequirementsManage.jsx";

/* ── CSV export (opens in Excel / Google Sheets) ── */
export function downloadCsv(filename, header, rows) {
  const cell = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });   // BOM: Excel reads the ñ and the dashes right
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
const fmtDate = (v) => {
  if (!v) return "";
  const d = new Date(String(v).slice(0, 10) + "T00:00:00");
  return isNaN(d) ? String(v) : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
const norm = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
const PROGS = ["BSIT", "BSCS", "BSIS"];

/* ─────────────────────────── Project-based interns ─────────────────────────── */
// same layout as the other Approvals tabs: the list on the left, the picked intern on the right
export function ProjectsBoard({ interns, records, onRefresh, role = "coordinator" }) {
  const sup = role === "supervisor";
  const hot = sup ? "progress" : "waiting";        // the group that needs this user's action
  const [view, setView] = useState(hot);           // waiting | progress | done
  const [sel, setSel] = useState(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [local, setLocal] = useState({});          // id -> { marked_at, confirmed_at } after an action, until the list reloads
  const all = interns.filter((u) => modalityOf(u) === "project").map((u) => {
    const s = { marked_at: u.project_marked_at, confirmed_at: u.project_confirmed_at, ...(local[u.id] || {}) };
    const hours = Math.round(calcHours(records.filter((r) => r.user_id === u.id)) * 10) / 10;
    const st = s.confirmed_at ? "done" : s.marked_at ? "waiting" : "progress";
    return { u, s, st, hours, required: requiredHoursFor(u.program, u.prior_hours) };
  });
  const n = { waiting: 0, progress: 0, done: 0 };
  all.forEach((x) => { n[x.st] += 1; });
  const sq = q.trim().toLowerCase();
  const list = all.filter((x) => x.st === view && (!sq || `${x.u.name} ${x.u.placement || ""}`.toLowerCase().includes(sq)))
    .sort((a, b) => String(a.u.name).localeCompare(String(b.u.name)));
  const cur = list.find((x) => x.u.id === sel) || list[0] || null;
  const pick = (v) => { setView(v); setSel(null); setOpen(false); };

  const call = async (x, method, path, ok) => {
    setBusy(path + method); setMsg(null);
    try {
      const res = await fetch(`${API}/interns/${x.u.id}/project/${path}`, { method, headers: { Accept: "application/json" } });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || "Couldn't save.");
      setLocal((m) => ({ ...m, [x.u.id]: { marked_at: d.marked_at, confirmed_at: d.confirmed_at } }));
      setMsg({ type: "success", text: ok });
      onRefresh?.();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    } finally { setBusy(null); }
  };
  const badge = (x) => x.st === "done" ? <Badge label="Complete" type="approved" />
    : x.st === "waiting" ? <Badge label={sup ? "With the coordinator" : "Marked complete"} type="online" /> : <Badge label="In progress" type="pending" />;
  const TABS = sup ? [["progress", "In progress"], ["waiting", "Coordinator"], ["done", "Complete"]]
    : [["waiting", "Waiting"], ["progress", "In progress"], ["done", "Complete"]];

  return (
    <>
      <style>{OA_CSS}</style>
      <style>{CT_CSS}</style>
      <Msg msg={msg} />
      <div className={open && cur ? "oa oa-open" : "oa"}>
        <div className="oa-list">
          <div className="oa-switch" role="tablist" aria-label="Show">
            {TABS.map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={view === k} className={view === k ? "on" : ""} onClick={() => pick(k)}>
                {l} <span className={k === hot && n[k] ? "oa-n hot" : "oa-n"}>{n[k]}</span>
              </button>
            ))}
          </div>
          {all.length > 6 && (
            <div className="oa-search">
              <Icon name="search" size={14} />
              <input type="search" placeholder="Search intern" value={q} onChange={(e) => { setQ(e.target.value); setSel(null); }} aria-label="Search intern" />
            </div>
          )}
          <div className="oa-items" role="list">
            {list.length === 0 ? (
              <div className="oa-none">
                <span className="oa-none-ic"><Icon name={all.length ? "check" : "briefcase"} size={18} /></span>
                <b>{!all.length ? "No project-based interns" : sq ? "No match" : view === hot ? "All caught up" : "None here"}</b>
                <small>{!all.length ? (sup ? "None of your interns is project-based." : "Set an intern's modality to Project-based on the intern's profile.")
                  : view === "waiting" && !sup ? "Projects the HTE supervisor marks as complete show here." : ""}</small>
              </div>
            ) : list.map((x) => (
              <button key={x.u.id} type="button" role="listitem" className={cur && cur.u.id === x.u.id ? "oa-item on" : "oa-item"}
                onClick={() => { setSel(x.u.id); setOpen(true); }}>
                <Avatar name={x.u.name} photo={x.u.photo} size={34} />
                <span className="oa-who"><b>{x.u.name}</b><small>{x.u.placement || "No placement yet"} · {x.hours}h</small></span>
                {view !== hot && badge(x)}
              </button>
            ))}
          </div>
        </div>

        <div className="oa-detail">
          {!cur ? (
            <div className="oa-blank">
              <span className="oa-none-ic"><Icon name="briefcase" size={20} /></span>
              <b>{all.length ? "Pick an intern" : "No project-based interns"}</b>
              <small>A project-based intern's OJT is complete when all the project tasks given by the HTE are done, even before the required hours.
                The HTE supervisor marks the project as complete, then the OJT coordinator confirms it.</small>
            </div>
          ) : (
            <>
              <button type="button" className="oa-back" onClick={() => setOpen(false)}><Icon name="menu" size={14} /> Back to the list</button>
              <div className="oa-head">
                <Avatar name={cur.u.name} photo={cur.u.photo} size={46} />
                <div className="oa-hn"><b>{cur.u.name}</b><small>{[cur.u.student_id, programKey(cur.u.program), "Project-based"].filter(Boolean).join(" · ")}</small></div>
                {badge(cur)}
              </div>
              <div className="oa-kv">
                <div><small>HTE</small><b>{cur.u.placement || "—"}</b></div>
                <div><small>HTE supervisor</small><b>{cur.u.supervisor_name || "—"}</b></div>
                <div><small>Hours so far</small><b>{cur.hours}h</b></div>
                <div><small>Program hours</small><b>{cur.required}h</b></div>
              </div>
              <ol className="ct-steps">
                <li className={cur.s.marked_at ? "ok" : "now"}>
                  <i>{cur.s.marked_at ? <Icon name="check" size={13} /> : 1}</i>
                  <span><b>HTE supervisor marks the project as complete</b>
                    <small>{cur.s.marked_at ? `Marked ${fmtDate(cur.s.marked_at)}` : "When all the tasks of the project are done"}</small></span>
                </li>
                <li className={cur.s.confirmed_at ? "ok" : cur.s.marked_at ? "now" : ""}>
                  <i>{cur.s.confirmed_at ? <Icon name="check" size={13} /> : 2}</i>
                  <span><b>OJT coordinator confirms it</b>
                    <small>{cur.s.confirmed_at ? `Confirmed ${fmtDate(cur.s.confirmed_at)} · post-internship requirements are open` : "This completes the OJT and opens the post-internship requirements"}</small></span>
                </li>
              </ol>
              <div className="oa-act ct-act">
                {sup ? (
                  <>
                    {cur.st === "progress" && <button type="button" className="ix-b ok" disabled={!!busy}
                      onClick={() => { if (window.confirm(`Mark ${cur.u.name}'s project as complete? Do this only when all the tasks you gave are done.`)) call(cur, "POST", "mark", `${cur.u.name}'s project is marked as complete. The OJT coordinator will confirm it.`); }}>
                      {busy ? "..." : "Mark project complete"}</button>}
                    {cur.st === "waiting" && <button type="button" className="ix-b ghost" disabled={!!busy} onClick={() => call(cur, "DELETE", "mark", "The project is no longer marked as complete.")}>{busy ? "..." : "Undo"}</button>}
                    {cur.st === "done" && <span className="ct-mut">Confirmed by the OJT coordinator.</span>}
                  </>
                ) : (
                  <>
                    {cur.st === "waiting" && <button type="button" className="ix-b ok" disabled={!!busy} onClick={() => call(cur, "POST", "confirm", `${cur.u.name}'s project is confirmed. Their post-internship requirements are open.`)}>{busy ? "..." : "Confirm complete"}</button>}
                    {cur.st === "done" && <button type="button" className="ix-b ghost" disabled={!!busy} onClick={() => call(cur, "DELETE", "confirm", "The confirmation was undone.")}>{busy ? "..." : "Undo confirmation"}</button>}
                    {cur.st === "progress" && <span className="ct-mut">Waiting for the HTE supervisor to mark the project as complete.</span>}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────── HTEs and MOAs ─────────────────────────── */
const MOA_ST = {
  expired: ["Expired", "rejected"],
  soon: ["Expiring soon", "pending"],
  valid: ["Valid", "approved"],
  none: ["No date", "none"],
};
const moaStatus = (until) => {
  if (!until) return "none";
  const d = new Date(String(until).slice(0, 10) + "T00:00:00");
  if (isNaN(d)) return "none";
  const days = Math.floor((d - new Date(today() + "T00:00:00")) / 86400000);
  return days < 0 ? "expired" : days <= 60 ? "soon" : "valid";
};

export function HteBoard({ supervisors, interns, onRefresh, monitorPath = "/coordinator/interns?tab=monitor", supervisorsPath = "/coordinator/htes?tab=supervisors" }) {
  const [q, setQ] = useState("");
  const [moa, setMoa] = useState("all");
  const [openKey, setOpenKey] = useState(null);   // the HTE whose information panel is open
  const navigate = useNavigate();

  // one row per HTE: from the supervisors' accounts (MOA, address) and the interns' placements
  const map = new Map();
  const row = (name) => {
    const k = norm(name);
    if (!map.has(k)) map.set(k, { key: k, name: String(name).trim(), address: "", sups: [], supUsers: [], until: null, output: null, interns: [] });
    return map.get(k);
  };
  supervisors.forEach((s) => {
    if (!String(s.placement || "").trim()) return;
    const r = row(s.placement);
    r.sups.push(s.name);
    r.supUsers.push(s);
    if (!r.address && s.hte_address) r.address = s.hte_address;
    const until = s.moa_valid_until ? String(s.moa_valid_until).slice(0, 10) : null;
    if (until && (!r.until || until > r.until)) r.until = until;          // the latest MOA date counts
    if (r.output === null && s.output_required !== undefined && s.output_required !== null) r.output = !!Number(s.output_required) || s.output_required === true;
  });
  interns.forEach((u) => { if (String(u.placement || "").trim()) row(u.placement).interns.push(u); });
  const all = [...map.values()].map((r) => {
    const by = {}; PROGS.forEach((p) => { by[p] = 0; });
    r.interns.forEach((u) => { const p = programKey(u.program); if (p) by[p] = (by[p] || 0) + 1; });
    const mods = [...new Set(r.interns.map((u) => MODALITIES[modalityOf(u)]))];
    const scopes = [...new Set(r.interns.map((u) => SCOPES[scopeOf(u)]))];
    // the HTE's own modality (set on its supervisor account) and the interns who have a different one
    const hteMod = r.supUsers.map((s) => s.hte_modality).find((m) => MODALITIES[m]) || null;
    const own = r.interns.filter((u) => u.modality_custom && Number(u.modality_custom) !== 0);
    const category = r.supUsers.map((s) => s.hte_category).find(Boolean) || null;   // the kind of HTE
    return { ...r, by, mods, scopes, hteMod, own, category, st: moaStatus(r.until) };
  }).sort((a, b) => b.interns.length - a.interns.length || a.name.localeCompare(b.name));

  const sq = q.trim().toLowerCase();
  const shown = all
    .filter((r) => moa === "all" || r.st === moa)
    .filter((r) => !sq || `${r.name} ${r.address} ${r.sups.join(" ")} ${r.category || ""}`.toLowerCase().includes(sq));
  const c = { expired: 0, soon: 0, none: 0 };
  all.forEach((r) => { if (c[r.st] !== undefined) c[r.st] += 1; });

  const exportCsv = () => downloadCsv(`HTEs_and_MOAs_${today()}.csv`,
    ["HTE", "Category", "Address", "HTE supervisor(s)", "MOA valid until", "MOA status", "Students deployed", "BSIT", "BSCS", "BSIS", "Internship modality", "Interns with their own modality", "Scope", "Output presentation"],
    shown.map((r) => [r.name, r.category || "", r.address, r.sups.join("; "), r.until || "", MOA_ST[r.st][0], r.interns.length, r.by.BSIT, r.by.BSCS, r.by.BSIS,
      r.hteMod ? MODALITIES[r.hteMod] : r.mods.join(", "), r.own.map((u) => `${u.name} (${MODALITIES[modalityOf(u)]})`).join("; "), r.scopes.join(", "), r.output === null ? "" : r.output ? "Required" : "Not required"]));

  return (
    <>
      <style>{CT_CSS}</style>
      <PageHeader title="HTEs & MOAs" sub="Every Host Training Establishment, its MOA and its interns. The MOA date is set on the HTE supervisor's account." />
      <div className="ct-strip">
        <button type="button" className={moa === "all" ? "ct-stat on" : "ct-stat"} onClick={() => setMoa("all")}><b>{all.length}</b><span>HTEs</span></button>
        <button type="button" className={moa === "expired" ? "ct-stat on red" : "ct-stat red"} onClick={() => setMoa("expired")}><b>{c.expired}</b><span>MOA expired</span></button>
        <button type="button" className={moa === "soon" ? "ct-stat on amber" : "ct-stat amber"} onClick={() => setMoa("soon")}><b>{c.soon}</b><span>Expiring in 60 days</span></button>
        <button type="button" className={moa === "none" ? "ct-stat on" : "ct-stat"} onClick={() => setMoa("none")}><b>{c.none}</b><span>No MOA date</span></button>
      </div>
      <div className="ct-bar">
        <div className="ix-search ct-search"><Icon name="search" size={15} />
          <input type="text" placeholder="Search HTE, address or supervisor..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="ix-select" value={moa} onChange={(e) => setMoa(e.target.value)} aria-label="MOA status">
          <option value="all">All MOA status</option>
          {Object.entries(MOA_ST).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button type="button" className="ix-b ghost sm ct-exp ix-exp" onClick={exportCsv} disabled={!shown.length}><Icon name="download" size={14} /> Export</button>
      </div>
      <div className="ix-card ct-card">
        {shown.length === 0 ? (
          <div className="ct-empty"><Icon name="briefcase" size={22} /><b>{all.length ? "No HTE matches" : "No HTEs yet"}</b>
            <small>{all.length ? "Try another filter." : "HTEs appear when an HTE supervisor account or an intern placement is added."}</small></div>
        ) : (
          <table className="ct-t ct-cards">
            <thead><tr><th>HTE</th><th>Category</th><th className="c">Students deployed</th><th>Internship modality</th><th>HTE supervisor</th><th>MOA valid until</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.key} className="ct-click" onClick={() => setOpenKey(r.key)} title="Open this HTE's information">
                  <td data-label="HTE"><b className="ct-sm">{r.name}</b>{r.address && <small className="ct-mut">{r.address}</small>}</td>
                  <td data-label="Category">{r.category || <span className="ct-mut">Not set</span>}</td>
                  <td data-label="Students deployed" className="c"><b>{r.interns.length}</b></td>
                  <td data-label="Modality">{r.hteMod ? <><span className="ct-chip">{MODALITIES[r.hteMod]}</span>{r.own.length > 0 && <small className="ct-mut">{r.own.length} with their own</small>}</>
                    : <span className="ct-mut">{r.mods.length ? `Not set · interns: ${r.mods.join(", ")}` : "Not set"}</span>}</td>
                  <td data-label="HTE supervisor">{r.sups.length ? r.sups.join(", ") : <span className="ct-mut">No supervisor account</span>}</td>
                  <td data-label="MOA valid until"><Badge label={r.until ? `${fmtDate(r.until)} · ${MOA_ST[r.st][0]}` : "No date"} type={MOA_ST[r.st][1]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {openKey && all.find((r) => r.key === openKey) && (
        <HteDetails hte={all.find((r) => r.key === openKey)} onClose={() => setOpenKey(null)} onRefresh={onRefresh}
          openInterns={(search) => navigate(monitorPath, { state: { search } })}
          openSupervisor={(id) => navigate(supervisorsPath, { state: { supervisorId: id } })} />
      )}
    </>
  );
}

/* The information panel of one HTE: its MOA, its supervisors and its interns. */
function HteDetails({ hte: r, onClose, openInterns, openSupervisor, onRefresh }) {
  // the HTE's modality: picked here, given to its supervisor and its interns
  const [mod, setMod] = useState(r.hteMod || "");
  const [ask, setAsk] = useState(null);      // the modality waiting for "everyone or keep their own?"
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const saveMod = async (m, skipCustom) => {
    setBusy(true); setNote(null); setAsk(null);
    try {
      const res = await fetch(`${API}/coordinator/htes/modality`, {
        method: "PATCH", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ hte: r.name, modality: m, skip_custom: skipCustom }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || "Couldn't save.");
      setMod(m); setNote({ type: "success", text: d.message });
      onRefresh && onRefresh();
    } catch (e) { setNote({ type: "error", text: e instanceof TypeError ? "Couldn't reach the server." : e.message }); }
    finally { setBusy(false); }
  };
  // System Output Presentation: required by this HTE or not (saved on its supervisor account(s) and its interns)
  const [out, setOut] = useState(r.output === null ? true : r.output);
  const saveOut = async (v) => {
    if (v === out) return;
    const prev = out; setOut(v); setBusy(true); setNote(null);
    try {
      const res = await fetch(`${API}/coordinator/htes/output`, {
        method: "PATCH", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ hte: r.name, required: v }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || "Couldn't save.");
      setNote({ type: "success", text: d.message });
      onRefresh && onRefresh();
    } catch (e) { setOut(prev); setNote({ type: "error", text: e instanceof TypeError ? "Couldn't reach the server." : e.message }); }
    finally { setBusy(false); }
  };
  // the kind of HTE, saved on its supervisor account(s)
  const [cat, setCat] = useState(r.category || "");
  const saveCat = async (c) => {
    const prev = cat; setCat(c); setBusy(true); setNote(null);
    try {
      const res = await fetch(`${API}/coordinator/htes/category`, {
        method: "PATCH", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ hte: r.name, category: c }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || "Couldn't save.");
      setNote({ type: "success", text: d.message });
      onRefresh && onRefresh();
    } catch (e) { setCat(prev); setNote({ type: "error", text: e instanceof TypeError ? "Couldn't reach the server." : e.message }); }
    finally { setBusy(false); }
  };
  const pickMod = (m) => { if (m === mod && !r.own.length) return; if (r.own.length) setAsk(m); else saveMod(m, true); };
  const days = r.until ? Math.floor((new Date(r.until + "T00:00:00") - new Date(today() + "T00:00:00")) / 86400000) : null;
  const moaNote = days === null ? "No MOA date yet. Set it on the HTE supervisor's account (Add Accounts)."
    : days < 0 ? `Expired ${-days} day${days === -1 ? "" : "s"} ago. Renew the MOA before placing new interns here.`
    : days === 0 ? "Expires today." : `${days} day${days === 1 ? "" : "s"} left.`;
  const supName = (id) => (r.supUsers.find((s) => String(s.id) === String(id)) || {}).name;
  const exportInterns = () => downloadCsv(`${r.name.replace(/[^\w]+/g, "_")}_interns_${today()}.csv`,
    ["Name", "Student ID", "Program", "Modality", "Scope", "HTE supervisor"],
    r.interns.map((u) => [u.name, u.student_id || "", programKey(u.program) || u.program || "", MODALITIES[modalityOf(u)], SCOPES[scopeOf(u)], supName(u.supervisor_id) || u.supervisor_name || ""]));
  return (
    <Drawer inPage icon="globe" kicker="Host Training Establishment" title={r.name} sub={r.address || "No address yet"} onClose={onClose}
      footer={(
        <>
          <button type="button" className="ix-b ghost" onClick={exportInterns} disabled={!r.interns.length}><Icon name="download" size={14} /> Export interns</button>
          <button type="button" className="ix-b primary" onClick={() => openInterns(r.name)} disabled={!r.interns.length}><Icon name="users" size={14} /> Open in All Interns</button>
        </>
      )}>
      <div className="hd">
        <section className={`hd-moa ${r.st}`}>
          <div><small>MOA valid until</small><b>{r.until ? fmtDate(r.until) : "No date"}</b></div>
          <Badge label={MOA_ST[r.st][0]} type={MOA_ST[r.st][1]} />
          <p>{moaNote}</p>
        </section>

        <div className="hd-tiles">
          <div><b>{r.interns.length}</b><span>Student{r.interns.length === 1 ? "" : "s"} deployed</span></div>
          {PROGS.map((p) => <div key={p}><b>{r.by[p] || 0}</b><span>{p}</span></div>)}
        </div>

        {/* the kind of HTE (also fills the Quarterly Report's Table 4) */}
        <section className="hd-mod hd-cat">
          <div className="hd-mod-h"><b>Category of this HTE</b><small>Industry, government agency, NGO, research institution, IT company, hospital, school…</small></div>
          <select className="ix-select" value={cat} disabled={busy} onChange={(e) => saveCat(e.target.value)} aria-label="Category of this HTE">
            <option value="">Not set</option>
            {HTE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            {cat && !HTE_CATEGORIES.includes(cat) && <option value={cat}>{cat}</option>}
          </select>
        </section>

        {/* does this HTE require a System Output Presentation? (post-internship requirement) */}
        <section className="hd-mod">
          <div className="hd-mod-h"><b>System Output Presentation</b><small>A post-internship requirement. Interns of an HTE that doesn't require it won't see it.</small></div>
          <div className="so-tabs" role="radiogroup" aria-label="System Output Presentation">
            {[[true, "Required"], [false, "Not required"]].map(([v, l]) => (
              <button key={l} type="button" role="radio" aria-checked={out === v} className={out === v ? "on" : ""} disabled={busy} onClick={() => saveOut(v)}>{l}</button>
            ))}
          </div>
        </section>

        {/* one modality for the whole HTE: its supervisor and its interns follow it */}
        <section className="hd-mod">
          <div className="hd-mod-h"><b>Modality of this HTE</b><small>Every intern placed here gets it automatically{r.own.length ? `, except ${r.own.length} with their own` : ""}.</small></div>
          <div className="so-tabs" role="radiogroup" aria-label="Modality of this HTE">
            {Object.entries(MODALITIES).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={mod === k} className={mod === k ? "on" : ""} disabled={busy} onClick={() => pickMod(k)}>{l}</button>
            ))}
          </div>
          {!mod && <small className="ct-mut">Not set yet. Pick one: the HTE supervisor and every intern here will get it.</small>}
          {ask && (
            <div className="hd-ask">
              <span>{r.own.length} intern{r.own.length === 1 ? " has" : "s have"} a modality of their own. Change them to {MODALITIES[ask]} too?</span>
              <span className="hd-ask-b">
                <button type="button" className="ix-b ghost sm" disabled={busy} onClick={() => saveMod(ask, true)}>Keep their own</button>
                <button type="button" className="ix-b primary sm" disabled={busy} onClick={() => saveMod(ask, false)}>Change everyone</button>
              </span>
            </div>
          )}
          {note && <Msg msg={note} />}
        </section>

        <dl className="hd-dl">
          <dt>Interns' modality</dt><dd>{r.mods.join(", ") || "—"}</dd>
          <dt>Scope</dt><dd>{r.scopes.join(", ") || "—"}</dd>
        </dl>

        <h4 className="hd-h">HTE supervisor{r.supUsers.length === 1 ? "" : "s"} ({r.supUsers.length})</h4>
        {r.supUsers.length === 0 ? <p className="ct-mut">No HTE supervisor account for this HTE yet.</p> : (
          <ul className="hd-list">
            {r.supUsers.map((s) => (
              <li key={s.id} className="ct-click" onClick={() => openSupervisor(s.id)} title="Open this supervisor's information">
                <Avatar name={s.name} photo={s.photo} size={34} />
                <div className="hd-txt"><b>{s.name}</b><small>{s.email || "No email"}</small></div>
                <span className="hd-go" aria-hidden="true">›</span>
              </li>
            ))}
          </ul>
        )}

        <h4 className="hd-h">Interns ({r.interns.length})</h4>
        {r.interns.length === 0 ? <p className="ct-mut">No intern is placed here yet.</p> : (
          <ul className="hd-list">
            {[...r.interns].sort((a, b) => a.name.localeCompare(b.name)).map((u) => (
              <li key={u.id} className="ct-click" onClick={() => openInterns(u.name)} title="Open in All Interns">
                <Avatar name={u.name} photo={u.photo} size={34} />
                <div className="hd-txt"><b>{u.name}</b><small>{[u.student_id, programKey(u.program) || u.program, supName(u.supervisor_id) || u.supervisor_name].filter(Boolean).join(" · ")}</small></div>
                <span className="ct-chip">{MODALITIES[modalityOf(u)]}</span>
                {u.modality_custom && Number(u.modality_custom) !== 0 && <span className="ct-chip own" title="Different from the HTE's modality">Own</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  );
}

/* ─────────────────────────── Requirements tracker ─────────────────────────── */
const PH = [["pre", "Pre-internship", PRE_REQUIREMENTS], ["during", "During internship", DURING_REQUIREMENTS], ["post", "Post-internship", POST_REQUIREMENTS]];
const CELL = {
  approved: ["✓", "ok", "Approved"],
  pending: ["•", "wait", "Waiting for review"],
  rejected: ["✗", "bad", "Returned"],
  missing: ["–", "miss", "Not submitted"],
  locked: ["🔒", "lock", "Opens after the hours (or the project) are done"],
  na: ["N/A", "na", "Not required by the HTE"],
  noask: ["–", "na", "No report asked yet"],
};
// short column titles (the full name shows when the mouse is on the column)
const SHORT = {
  capstone_summary: "Summary Sheet", letter_of_intent: "Letter of Intent", endorsement_letter: "Endorsement", moa: "MOA",
  internship_contract: "Contract", internship_plan: "Internship Plan", medical_certificate: "Medical", personal_history: "Personal History",
  parents_consent: "Parents' Consent", pledge: "Pledge", acceptance_form: "Acceptance", insurance: "Insurance", orientation: "Orientation",
  supervisor_feedback_form: "Feedback Form", weekly_report: "Weekly Reports", performance_appraisal: "Appraisal",
  certificate_of_completion: "Certificate", evaluation_forms: "Evaluation", narrative_report: "Narrative", dtr: "DTR", system_output: "Output Presentation",
};
const short = (r) => SHORT[r.key] || String(r.label).replace(/\s*\(.*?\)\s*/g, " ").trim();

// what each mark means, in words (the list view shows the words, the grid view the marks)
// not counted toward progress: not required, locked, or no report asked yet
const SKIP = ["na", "locked", "noask"];
const WORD = { approved: "Approved", pending: "Waiting for review", rejected: "Returned", missing: "Not submitted", locked: "Locked", na: "Not required", noask: "No report asked yet" };

// reviewPath: where "Review their files" goes (the coordinator's MOV Submissions); null hides it
// (the admin sees the statuses only and cannot open the coordinator's pages)
export function RequirementsTracker({ interns, movs, records, reviewPath = "/coordinator/approvals?tab=movs" }) {
  const [phase, setPhase] = useState("pre");
  const [q, setQ] = useState("");
  const [prog, setProg] = useState("all");
  const [hte, setHte] = useState("all");
  const [show, setShow] = useState("all");     // all | missing | waiting | complete
  const [view, setView] = useState("list");    // list (easy to read) | grid (every requirement at once)
  const [openId, setOpenId] = useState(null);  // the intern whose checklist is open
  const [manage, setManage] = useState(false);
  const [, setVer] = useState(0);              // re-draw after the coordinator changes the list
  const navigate = useNavigate();
  useEffect(() => { setShow("all"); }, [phase]);
  // the weekly / monthly reports the coordinator asked for: an intern's "Weekly / Monthly Report" follows them
  const [reports, setReports] = useState([]);
  useEffect(() => {
    const load = () => fetch(`${API}/reports`, { headers: { Accept: "application/json" } })
      .then((r) => r.json()).then((d) => setReports(Array.isArray(d) ? d : [])).catch(() => {});
    load();
    return liveRefresh(load);
  }, []);

  const list = PH.find((p) => p[0] === phase)[2];
  const htes = [...new Set(interns.map((u) => String(u.placement || "").trim()).filter(Boolean))].sort();
  const byKey = new Map();   // "userId:phase:req" -> newest submissions first
  [...movs].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))).forEach((m) => {
    const k = `${m.user_id}:${m.phase || "pre"}:${m.requirement}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(m);
  });
  const statusOf = (u, r, done, ph = phase) => {
    if (r.key === "system_output" && !outputRequired(u)) return { st: "na" };
    if (r.key === "weekly_report") {
      // one status for all the reports asked of this intern: approved when every one is approved
      const mine = reports.filter((rp) => reportFor(rp, u));
      if (!mine.length) return { st: "noask" };
      const latest = (rid) => movs.filter((m) => m.user_id === u.id && Number(m.report_id) === Number(rid))
        .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];
      const sts = mine.map((rp) => latest(rp.id)?.status || "none");
      const ok = sts.filter((s) => s === "approved").length;
      return { st: ok === mine.length ? "approved" : sts.includes("pending") ? "pending" : sts.includes("rejected") ? "rejected" : "missing", n: ok, of: mine.length };
    }
    const subs = byKey.get(`${u.id}:${ph}:${r.key}`) || [];
    if (ph === "post" && !done && !subs.length) return { st: "locked" };
    if (!subs.length) return { st: "missing" };
    if (r.repeat) {   // weekly / monthly reports: how many were approved
      const ok = subs.filter((m) => m.status === "approved").length;
      return { st: subs.some((m) => m.status === "pending") ? "pending" : ok ? "approved" : subs[0].status, n: ok, at: subs[0].created_at };
    }
    return { st: subs[0].status === "approved" ? "approved" : subs[0].status === "pending" ? "pending" : "rejected", at: subs[0].created_at, remarks: subs[0].remarks };
  };
  const doneOf = (u) => ojtComplete(u, calcHours(records.filter((r) => r.user_id === u.id)));
  const rows = interns.map((u) => {
    const done = doneOf(u);
    const cells = list.map((r) => statusOf(u, r, done));
    const need = cells.filter((c) => !SKIP.includes(c.st));
    const ok = need.filter((c) => c.st === "approved").length;
    return { u, cells, ok, total: need.length,
      nWait: cells.filter((c) => c.st === "pending").length,
      nMiss: cells.filter((c) => c.st === "missing" || c.st === "rejected").length,
      waiting: cells.some((c) => c.st === "pending"), missing: cells.some((c) => c.st === "missing" || c.st === "rejected") };
  });
  const sq = q.trim().toLowerCase();
  const shown = rows
    .filter((x) => prog === "all" || programKey(x.u.program) === prog)
    .filter((x) => hte === "all" || String(x.u.placement || "").trim() === hte)
    .filter((x) => show === "all" || (show === "missing" ? x.missing : show === "waiting" ? x.waiting : x.total > 0 && x.ok === x.total))
    .filter((x) => !sq || `${x.u.name} ${x.u.student_id || ""} ${x.u.placement || ""}`.toLowerCase().includes(sq))
    .sort((a, b) => (a.ok / (a.total || 1)) - (b.ok / (b.total || 1)) || String(a.u.name).localeCompare(String(b.u.name)));
  const review = (u) => reviewPath && navigate(reviewPath, { state: { movIntern: u.id } });

  const exportCsv = () => downloadCsv(`Requirements_${phase}_${today()}.csv`,
    ["Intern", "Student ID", "Program", "HTE", ...list.map((r) => r.label), "Approved"],
    shown.map((x) => [x.u.name, x.u.student_id || "", programKey(x.u.program) || x.u.program || "", x.u.placement || "",
      ...x.cells.map((c) => (c.n ? `${CELL[c.st][2]} (${c.n})` : CELL[c.st][2])), `${x.ok}/${x.total}`]));

  const open = openId != null ? interns.find((u) => u.id === openId) : null;

  return (
    <>
      <style>{CT_CSS}</style>
      <style>{RT_CSS}</style>
      {/* 1 · find interns */}
      <div className="ct-bar">
        <div className="ix-search ct-search"><Icon name="search" size={15} />
          <input type="text" placeholder="Search name, ID or HTE..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="ix-select" value={show} onChange={(e) => setShow(e.target.value)} aria-label="Show">
          <option value="all">All interns ({rows.length})</option>
          <option value="missing">Missing or returned ({rows.filter((x) => x.missing).length})</option>
          {reviewPath && <option value="waiting">Waiting for review ({rows.filter((x) => x.waiting).length})</option>}
          <option value="complete">Complete ({rows.filter((x) => x.total > 0 && x.ok === x.total).length})</option>
        </select>
        <select className="ix-select" value={prog} onChange={(e) => setProg(e.target.value)} aria-label="Program">
          <option value="all">All programs</option>
          {PROGS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className="ix-select" value={hte} onChange={(e) => setHte(e.target.value)} aria-label="HTE">
          <option value="all">All HTEs</option>
          {htes.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
        <div className="rt-view" role="tablist" aria-label="View">
          <button type="button" className={view === "list" ? "on" : ""} aria-selected={view === "list"} onClick={() => setView("list")}><Icon name="list" size={14} /> List</button>
          <button type="button" className={view === "grid" ? "on" : ""} aria-selected={view === "grid"} onClick={() => setView("grid")}><Icon name="dashboard" size={14} /> Grid</button>
        </div>
        <button type="button" className="ix-b ghost sm ix-exp" onClick={exportCsv} disabled={!shown.length}><Icon name="download" size={14} /> Export</button>
      </div>

      {/* 2 · the phase (under the search), and the list of requirements behind it */}
      <div className="rt-head">
        <div className="rt-tabs" role="tablist" aria-label="Phase">
          {PH.map(([k, l, reqs]) => (
            <button key={k} type="button" role="tab" aria-selected={phase === k} className={phase === k ? "on" : ""} onClick={() => setPhase(k)}>
              {l} <span className="rt-n">{reqs.length}</span></button>
          ))}
        </div>
        {/* only the OJT coordinator changes the list of requirements (the admin sees a read-only overview) */}
        {reviewPath && <button type="button" className="ix-b primary sm" onClick={() => setManage(true)}><Icon name="pencil" size={14} /> Manage requirements</button>}
      </div>

      {shown.length === 0 ? (
        <div className="ix-card ct-card"><div className="ct-empty"><Icon name="folder" size={22} /><b>{rows.length ? "No intern matches" : "No interns yet"}</b><small>{rows.length ? "Try another filter." : ""}</small></div></div>
      ) : view === "list" ? (
        /* 3a · one row per intern: how far they are, in words */
        <div className="ix-card ct-card">
          <table className="ct-t rt-list">
            <thead><tr><th>Intern</th><th>Progress</th>{reviewPath && <th className="c">Waiting for you</th>}<th className="c">Missing / returned</th><th /></tr></thead>
            <tbody>
              {shown.map((x) => (
                <tr key={x.u.id} className="ct-click" onClick={() => setOpenId(x.u.id)}>
                  <td><span className="ct-who"><Avatar name={x.u.name} photo={x.u.photo} size={30} /><span><b>{x.u.name}</b><small>{[programKey(x.u.program), x.u.placement].filter(Boolean).join(" · ")}</small></span></span></td>
                  <td data-label="Progress" className="rt-prog">
                    <span className="rt-bar"><i className={x.total && x.ok === x.total ? "full" : ""} style={{ width: `${x.total ? Math.round((x.ok / x.total) * 100) : 0}%` }} /></span>
                    <small>{x.total ? `${x.ok} of ${x.total} approved` : "Locked until the hours are done"}</small>
                  </td>
                  {reviewPath && <td data-label="Waiting for you" className="c">{x.nWait ? <span className="rt-pill wait">{x.nWait}</span> : <span className="rt-dash">–</span>}</td>}
                  <td data-label="Missing / returned" className="c">{x.nMiss ? <span className="rt-pill bad">{x.nMiss}</span> : <span className="rt-dash">–</span>}</td>
                  <td data-label="" className="r"><button type="button" className="ix-b ghost sm" onClick={(e) => { e.stopPropagation(); setOpenId(x.u.id); }}>See checklist <Icon name="chevronRight" size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* 3b · the grid: every requirement as a column (the marks are explained above it) */
        <>
          <div className="ct-key rt-key">
            {["approved", "pending", "rejected", "missing", ...(phase === "post" ? ["locked", "na"] : phase === "during" ? ["noask"] : [])].map((k) => (
              <span key={k}><i className={`ct-c ${CELL[k][1]}`}>{CELL[k][0]}</i>{WORD[k]}</span>
            ))}
          </div>
          {/* the card only frames it; the inner box scrolls sideways, so the Intern (left) and Approved (right) columns stay put */}
          <div className="ix-card ct-card ct-gridcard">
            <div className="ct-gridscroll">
            <table className="ct-t ct-grid">
              <thead>
                <tr>
                  <th className="ct-stick">Intern</th>
                  {list.map((r) => <th key={r.key} className="c ct-rq" title={r.label}><span>{short(r)}</span></th>)}
                  <th className="c ct-end">Approved</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((x) => (
                  <tr key={x.u.id} className="ct-click" onClick={() => setOpenId(x.u.id)}>
                    <td className="ct-stick"><span className="ct-who"><Avatar name={x.u.name} photo={x.u.photo} size={26} /><span><b>{x.u.name}</b><small>{[programKey(x.u.program), x.u.placement].filter(Boolean).join(" · ")}</small></span></span></td>
                    {x.cells.map((c, i) => (
                      <td key={list[i].key} className="c" title={`${list[i].label}: ${WORD[c.st]}${c.n ? ` (${c.n} approved)` : ""}`}>
                        <i className={`ct-c ${CELL[c.st][1]}`}>{c.n ? c.n : CELL[c.st][0]}</i>
                      </td>
                    ))}
                    {/* each intern's total, kept in view on the right while the columns scroll */}
                    <td className="c ct-end">
                      <span className={`ct-tot${x.total && x.ok === x.total ? " full" : ""}`}><b>{x.ok}</b>/{x.total}</span>
                      <span className="ct-tbar"><i style={{ width: `${x.total ? Math.round((x.ok / x.total) * 100) : 0}%` }} /></span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </>
      )}

      {/* one intern's checklist: every requirement of every phase, in words */}
      {open && (() => {
        const done = doneOf(open);
        return (
          <Drawer inPage icon="folder" kicker={[programKey(open.program), open.placement].filter(Boolean).join(" · ") || "Intern"} title={open.name} onClose={() => setOpenId(null)}
            footer={reviewPath ? <button type="button" className="ix-b primary" onClick={() => review(open)}><Icon name="eye" size={14} /> Review their files</button> : null}>
            <style>{RT_CSS}</style>
            {PH.map(([k, l, reqs]) => {
              const cs = reqs.map((r) => ({ r, c: statusOf(open, r, done, k) }));
              const need = cs.filter(({ c }) => !SKIP.includes(c.st));
              return (
                <section key={k} className="rt-sec">
                  <h4>{l} <small>{need.filter(({ c }) => c.st === "approved").length} of {need.length} approved</small></h4>
                  <ul>
                    {cs.map(({ r, c }) => (
                      <li key={r.key}>
                        <span className="rt-name">{r.label}{c.of ? <small>{c.n} of {c.of} reports approved</small> : c.n ? <small>{c.n} approved</small> : c.remarks && c.st === "rejected" ? <small>Remarks: {c.remarks}</small> : null}</span>
                        <span className={`rt-st ${c.st}`}>{WORD[c.st]}{c.at && c.st !== "approved" ? <small>{fmtDay(c.at)}</small> : null}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </Drawer>
        );
      })()}

      {manage && <RequirementsManage onClose={() => setManage(false)} onChanged={() => setVer((v) => v + 1)} />}
    </>
  );
}

const fmtDay = (v) => new Date(String(v).replace(" ", "T")).toLocaleDateString("en-PH", { month: "short", day: "numeric" });

const RT_CSS = `
.rt-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin: -2px 0 14px; }
.rt-tabs, .rt-view { display: inline-flex; gap: 4px; padding: 3px; background: #f3f4f6; border: 1px solid #e8ebf0; border-radius: 10px; flex-wrap: wrap; }
.rt-tabs button, .rt-view button { display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 12px; border: 0; border-radius: 8px; background: transparent; font: inherit; font-size: 13px; font-weight: 600; color: #4b5563; cursor: pointer; white-space: nowrap; }
.rt-view button { height: 30px; font-size: 12.5px; }
.rt-tabs button.on, .rt-view button.on { background: #fff; color: #c2410c; box-shadow: 0 1px 3px rgba(15,23,42,.12); }
.rt-n { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; background: #e5e7eb; color: #475569; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; }
.rt-list td { padding: 10px 14px; }
.rt-prog { min-width: 200px; }
.rt-bar { display: block; height: 8px; border-radius: 99px; background: #eef0f4; overflow: hidden; max-width: 260px; }
.rt-bar i { display: block; height: 100%; border-radius: inherit; background: #e8582a; }
.rt-bar i.full { background: #16a34a; }
.rt-prog small { display: block; margin-top: 4px; font-size: 12px; color: #4b5563; }
.rt-pill { display: inline-grid; place-items: center; min-width: 26px; height: 24px; padding: 0 8px; border-radius: 99px; font-size: 12px; font-weight: 700; }
.rt-pill.wait { background: #fef3c7; color: #b45309; } .rt-pill.bad { background: #fee2e2; color: #b91c1c; }
.rt-dash { color: #c4c8d0; }
.rt-key { justify-content: flex-start; margin: 0 0 10px; }
/* the intern's checklist (drawer) */
.rt-sec { margin-bottom: 16px; }
.rt-sec h4 { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin: 0 0 6px; font-size: 12px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #c2410c; }
.rt-sec h4 small { font-size: 12px; font-weight: 600; letter-spacing: 0; text-transform: none; color: #6b7280; }
.rt-sec ul { list-style: none; margin: 0; padding: 0; border: 1px solid #eef0f4; border-radius: 12px; overflow: hidden; }
.rt-sec li { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 12px; border-bottom: 1px solid #f3f4f6; }
.rt-sec li:last-child { border-bottom: 0; }
.rt-name { min-width: 0; display: flex; flex-direction: column; font-size: 13px; color: #111827; }
.rt-name small { font-size: 11.5px; color: #b45309; margin-top: 1px; }
.rt-st { flex: none; display: inline-flex; flex-direction: column; align-items: flex-end; padding: 3px 9px; border-radius: 8px; font-size: 12px; font-weight: 700; line-height: 1.3; }
.rt-st small { font-size: 10.5px; font-weight: 500; opacity: .85; }
.rt-st.approved { background: #dcfce7; color: #15803d; } .rt-st.pending { background: #fef3c7; color: #b45309; }
.rt-st.rejected { background: #fee2e2; color: #b91c1c; } .rt-st.missing { background: #f3f4f6; color: #6b7280; }
.rt-st.locked, .rt-st.na { background: transparent; color: #9ca3af; font-weight: 600; }
@media (min-width: 641px) and (max-width: 760px) { .rt-list th:nth-child(3), .rt-list td:nth-child(3), .rt-list th:nth-child(4), .rt-list td:nth-child(4) { display: none; } }
`;

// a table whose rows turn into cards below `px` wide: the first cell is the title,
// every other cell shows its data-label on the left and its value on the right
function cardRows(sel, px) {
  return `@media (max-width: ${px}px) {
  ${sel}, ${sel} tbody { display: block; width: 100%; }
  ${sel} thead { display: none; }
  ${sel} tr { display: block; padding: 12px 16px; border-bottom: 1px solid #f1f3f6; }
  ${sel} tbody tr:last-child { border-bottom: 0; }
  ${sel} td { display: block; padding: 5px 0; border: 0; text-align: right; white-space: normal; overflow-wrap: anywhere; }
  ${sel} td::before { content: attr(data-label); float: left; margin-right: 12px; padding-top: 2px; text-align: left;
    font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: #9ca3af; }
  ${sel} td[data-label=""]::before { content: none; }
  ${sel} td::after { content: ""; display: block; clear: both; }
  ${sel} td:first-child { text-align: left; padding-bottom: 8px; }
  ${sel} td:first-child::before { content: none; }
  ${sel} td small { display: block; }
}`;
}

const CT_CSS = `
.ct-pills { display: flex; gap: 8px; flex-wrap: wrap; margin: 4px 0 14px; }
.ct-steps { list-style: none; margin: 14px 0 0; padding: 0; display: grid; gap: 12px; }
.ct-steps li { display: flex; gap: 12px; align-items: flex-start; }
.ct-steps i { flex: none; width: 26px; height: 26px; border-radius: 50%; display: inline-grid; place-items: center; font-style: normal; font-size: 12px; font-weight: 800; background: #f3f4f6; color: #6b7280; }
.ct-steps li.ok i { background: #dcfce7; color: #15803d; } .ct-steps li.now i { background: #fff1ea; color: #e8582a; }
.ct-steps b { display: block; font-size: 13.5px; color: #1f2937; } .ct-steps small { font-size: 12.5px; color: #6b7280; }
.ct-act { justify-content: flex-end; } .ct-act .ct-mut { margin-right: auto; }
.ct-n { display: inline-grid; place-items: center; min-width: 20px; height: 20px; padding: 0 6px; margin-left: 6px; border-radius: 99px; font-size: 11px; font-weight: 700; background: #eef0f3; color: #4b5563; }
.ct-n.hot { background: #e8582a; color: #fff; }
.ct-card { padding: 0; overflow: hidden; }
.ct-scroll { overflow-x: auto; }
.ct-t { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.ct-t th { text-align: left; font-size: 11.5px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; color: #6b7280; background: #fafbfc; padding: 11px 14px; border-bottom: 1px solid #eceff3; white-space: nowrap; }
.ct-t td { padding: 11px 14px; border-bottom: 1px solid #f1f3f6; vertical-align: middle; }
.ct-t tbody tr:last-child td { border-bottom: 0; }
.ct-t tfoot td { background: #fafbfc; border-top: 1px solid #eceff3; padding: 9px 14px; white-space: nowrap; }
.ct-t .c { text-align: center; } .ct-t .r { text-align: right; white-space: nowrap; }
.ct-click { cursor: pointer; } .ct-click:hover td { background: #fff7f3; }
.ct-who { display: flex; align-items: center; gap: 10px; min-width: 0; }
.ct-who b { display: block; font-size: 13.5px; } .ct-who small, .ct-mut { display: block; font-size: 12px; color: #6b7280; }
.ct-sm { display: block; font-size: 13.5px; }
.ct-chip { display: inline-block; margin: 0 6px 4px 0; padding: 2px 8px; border-radius: 99px; font-size: 11.5px; font-weight: 700; background: #fff1ea; color: #c2410c; }
.ct-empty { display: grid; justify-items: center; gap: 6px; padding: 44px 20px; color: #6b7280; text-align: center; }
.ct-empty b { color: #1f2937; font-size: 15px; }
.ct-bar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 0 0 14px; }
/* like the other pages' filter bars: search, then the filters right next to it, Export on the far right */
.ix-page .ct-bar > .ct-search { flex: 0 1 420px !important; max-width: 420px; min-width: 220px; }
@media (max-width: 760px) { .ix-page .ct-bar > .ct-search { flex: 1 1 100% !important; max-width: none; } }
.ct-exp { margin-left: auto; }
.ct-strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 4px 0 14px; }
.ct-stat { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 14px 16px; border-radius: 14px; border: 1px solid #eceff3; background: #fff; cursor: pointer; font: inherit; text-align: left; }
.ct-stat b { font-size: 24px; color: #1f2937; } .ct-stat span { font-size: 12.5px; color: #6b7280; font-weight: 600; }
.ct-stat.red b { color: #b91c1c; } .ct-stat.amber b { color: #b45309; }
.ct-stat.on { border-color: #e8582a; box-shadow: 0 0 0 3px rgba(232,88,42,.12); }
.ct-row2 { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin: 0 0 12px; }
.ct-row2 .ct-pills { margin: 0; }
.ct-key { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: flex-end; font-size: 12.5px; color: #4b5563; margin: 0; }
.ct-key .ct-mut { display: inline; }
.ct-key span { display: inline-flex; align-items: center; gap: 6px; }
.ct-c { display: inline-grid; place-items: center; min-width: 24px; height: 24px; padding: 0 5px; border-radius: 7px; font-style: normal; font-size: 12px; font-weight: 800; }
.ct-c.ok { background: #dcfce7; color: #15803d; } .ct-c.wait { background: #fef3c7; color: #b45309; }
.ct-c.bad { background: #fee2e2; color: #b91c1c; } .ct-c.miss { background: #f3f4f6; color: #9ca3af; }
.ct-c.lock { background: #f3f4f6; font-size: 11px; } .ct-c.na { background: transparent; color: #9ca3af; font-size: 10.5px; }
/* grid: every requirement column the same width, names on one line, compact rows */
.ix-page .ix-content .ix-card.ct-gridcard { padding: 0 !important; overflow: hidden !important; height: auto !important; min-height: 0 !important; flex: none !important; display: block !important; }
/* always fits the card: no sideways scrolling. Intern and Approved keep their width, the requirements share the rest */
.ct-gridscroll { width: 100%; overflow: hidden; }
.ct-grid { border-collapse: separate; border-spacing: 0; width: 100% !important; table-layout: fixed; }
.ct-grid th.ct-rq, .ct-grid td.c { width: auto; min-width: 0; max-width: none; padding-left: 2px !important; padding-right: 2px !important; }
.ct-grid th.ct-rq span { overflow-wrap: anywhere; hyphens: auto; }
.ct-grid td.c .ct-c { min-width: 22px; height: 22px; }
.ct-grid th { background: #fff !important; border-bottom: 1px solid #eceff3; }
.ct-grid th.ct-rq { white-space: normal; font-size: 10.5px; line-height: 1.3; text-transform: none; letter-spacing: 0; vertical-align: bottom; padding: 10px 4px; color: #4b5563; }
.ct-grid th.ct-rq span { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.ct-grid td { padding: 9px 6px; border-bottom: 1px solid #f1f3f6; }
.ct-grid tbody tr:last-child td { border-bottom: 0; }
.ct-grid .ct-who b { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px; }
.ct-grid .ct-who small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px; }
.ct-stick { position: sticky; left: 0; background: #fff; z-index: 2; min-width: 220px; max-width: 240px; padding-left: 16px !important; box-shadow: 1px 0 0 #eceff3; }
.ct-grid .ct-stick { width: 220px; min-width: 0; max-width: none; }
.ct-grid .ct-who { min-width: 0; } .ct-grid .ct-who > span { min-width: 0; }
.ct-grid .ct-who b, .ct-grid .ct-who small { max-width: none !important; }
/* the total on the right stays in view too */
.ct-grid .ct-end { position: static; background: #fff; width: 96px; min-width: 0; max-width: none; box-shadow: -1px 0 0 #eceff3; padding: 9px 14px !important; }
.ct-click:hover .ct-stick, .ct-click:hover .ct-end { background: #fff7f3; }
.ct-tot { display: block; font-size: 12.5px; color: #6b7280; } .ct-tot b { font-size: 14px; color: #111827; }
.ct-tot.full b { color: #15803d; }
.ct-tbar { display: block; height: 5px; margin-top: 4px; border-radius: 99px; background: #eef0f4; overflow: hidden; }
.ct-tbar i { display: block; height: 100%; background: #e8582a; border-radius: inherit; }
.ct-tot.full + .ct-tbar i { background: #16a34a; }
.ct-okn { color: #15803d; }
.ct-of { font-size: 12px; color: #6b7280; }
.hd { display: grid; gap: 16px; }
.hd-moa { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 4px 12px; padding: 14px 16px; border-radius: 14px; border: 1px solid #eceff3; background: #fafbfc; }
.hd-moa small { display: block; font-size: 12px; color: #6b7280; } .hd-moa b { font-size: 17px; color: #1f2937; }
.hd-moa p { grid-column: 1 / -1; margin: 4px 0 0; font-size: 12.5px; color: #4b5563; }
.hd-moa.expired { background: #fef2f2; border-color: #fecaca; } .hd-moa.soon { background: #fffbeb; border-color: #fde68a; } .hd-moa.valid { background: #f0fdf4; border-color: #bbf7d0; }
.hd-tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.hd-tiles div { padding: 10px 12px; border-radius: 12px; border: 1px solid #eceff3; background: #fff; }
.hd-tiles b { display: block; font-size: 20px; color: #1f2937; } .hd-tiles span { font-size: 12px; color: #6b7280; font-weight: 600; }
.hd-dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 16px; margin: 0; font-size: 13.5px; }
/* the HTE's modality picker */
.hd-mod { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 1px solid #fde3d6; border-radius: 12px; background: #fffaf7; }
.hd-mod-h b { display: block; font-size: 13.5px; color: #9a3412; } .hd-mod-h small { font-size: 12px; color: #6b7280; }
.hd-cat .ix-select { width: 100%; height: 38px; }
.hd > .hd-mod + .hd-mod { margin-top: 0; }
.hd-ask { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border-radius: 10px; background: #fff; border: 1px solid #fbd5c3; font-size: 12.5px; color: #374151; }
.hd-ask-b { display: flex; gap: 8px; justify-content: flex-end; }
.ct-chip.own { background: #eef2ff; color: #4338ca; }
.hd-dl dt { color: #6b7280; } .hd-dl dd { margin: 0; color: #1f2937; font-weight: 600; }
.hd-h { margin: 4px 0 -6px; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #6b7280; }
.hd-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.hd-list li { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 12px; border: 1px solid #f1f3f6; }
.hd-list li > .hd-txt { flex: 1; min-width: 0; } .hd-list b { display: block; font-size: 13.5px; }
.hd-list small { display: block; font-size: 12px; color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hd-list .ct-chip { margin: 0; }
.hd-list li.ct-click:hover { background: #fff7f3; }
.hd-go { color: #9ca3af; font-size: 22px; line-height: 1; padding: 0 4px; } .hd-list li.ct-click:hover .hd-go { color: #e8582a; }
@media (max-width: 900px) { .ct-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); } .ct-exp { margin-left: 0; } }
/* small screens: each row becomes a card (label on the left, value on the right), like the other tables.
   HTEs & MOAs has six columns, so it switches already on tablets; the requirements list on phones. */
${cardRows(".ct-t.ct-cards", 900)}
${cardRows(".ct-t.rt-list", 640)}
/* smaller laptops: a narrower Intern column and smaller headings, so the grid still fits without sideways scrolling */
@media (max-width: 1440px) { .ct-grid .ct-stick { width: 180px; } .ct-grid th.ct-rq { font-size: 10px; } .ct-grid .ct-end { width: 84px; } .ct-grid td.c .ct-c { min-width: 20px; height: 20px; font-size: 11px; } }
`;