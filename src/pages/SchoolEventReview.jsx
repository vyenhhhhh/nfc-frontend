// SchoolEventReview.jsx — page for the HTE supervisor AND the OJT coordinator / admin.
// Supervisor: confirms (then it goes to the coordinator) or rejects.  Coordinator / admin: final decision.
import { useState, useEffect } from "react";
import { API } from "../config.js";
import { fileHref, openFile } from "../files.js";
import { Spinner, PageHeader, Badge, Msg, Icon, Avatar, liveRefresh, OA_CSS } from "../components/DashKit.jsx";


const day = (v) => v ? new Date(String(v).slice(0, 10) + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "—";

// is this request waiting for ME? (supervisor: pending · coordinator/admin: confirmed, or pending with no supervisor)
export const schoolEventIsMine = (r, role) =>
  role === "supervisor" ? r.status === "pending" : (r.status === "endorsed" || (r.status === "pending" && !r.supervisor_id));

export default function SchoolEventReview({ user, embedded = false }) {
  const isSup = user?.role === "supervisor";
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("waiting");
  const [sel, setSel] = useState(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [remarks, setRemarks] = useState({});

  const load = async () => {
    try {
      const res = await fetch(`${API}/supervisor/school-events`, { headers: { Accept: "application/json" } });
      const data = await res.json();
      if (Array.isArray(data)) setRows(data);
    } catch { /* keep what we have */ } finally { setLoading(false); }
  };
  useEffect(() => { load(); return liveRefresh(load); /* eslint-disable-next-line */ }, []);

  // is it my turn?
  const mine = (r) => schoolEventIsMine(r, user?.role);
  const group = (r) => mine(r) ? "waiting" : (r.status === "pending" || r.status === "endorsed") ? "passed" : r.status;
  const shown = rows.filter((r) => group(r) === tab || (tab === "done" && (r.status === "approved" || r.status === "rejected")));
  const count = (t) => rows.filter((r) => t === "done" ? (r.status === "approved" || r.status === "rejected") : group(r) === t).length;

  const decide = async (r, status) => {
    setBusy(r.id); setMsg(null);
    try {
      const res = await fetch(`${API}/supervisor/school-events/${r.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ status, remarks: (remarks[r.id] || "").trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.errors && Object.values(data.errors)[0]?.[0]) || data.message || "Couldn't save.");
      setMsg({ type: "success", text: data.message });
      load();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    } finally { setBusy(null); }
  };

  const tabs = [["waiting", "Waiting"], ["passed", isSup ? "Coordinator" : "Supervisor"], ["done", "Decided"]];
  const sq = q.trim().toLowerCase();
  const list = shown.filter((r) => !sq || String(r.intern_name || "").toLowerCase().includes(sq));
  const cur = list.find((r) => r.id === sel) || null;
  const pick = (k) => { setTab(k); setSel(null); setOpen(false); setQ(""); };
  const portionOf = (r) => r.portion === "am" ? "Morning only" : r.portion === "pm" ? "Afternoon only" : "Whole day";
  const badge = (r) => <Badge label={r.status === "approved" ? "Excused" : r.status === "rejected" ? "Rejected" : r.status === "endorsed" ? "Confirmed" : "Waiting"}
    type={r.status === "approved" ? "approved" : r.status === "rejected" ? "rejected" : "pending"} />;

  const steps = (r) => {
    const rej = r.status === "rejected";
    const hasSup = !!r.supervisor_id || r.status === "endorsed";
    const supOk = r.status === "endorsed" || r.status === "approved";
    const L = [
      { t: "Intern submitted", s: "done" },
      !hasSup ? { t: "No supervisor", s: "skip" } : { t: isSup ? "You confirm" : "Supervisor confirms", s: supOk ? "done" : rej && isSup ? "bad" : "now" },
      { t: isSup ? "OJT coordinator" : "You decide", s: r.status === "approved" ? "done" : rej && !isSup ? "bad" : r.status === "endorsed" || (!hasSup && r.status === "pending") ? "now" : "" },
      { t: "Day excused", s: r.status === "approved" ? "done" : "" },
    ];
    return (
      <ol className="oa-steps">
        {L.map((x, i) => (
          <li key={i} className={x.s}>
            <i>{x.s === "done" ? <Icon name="check" size={11} /> : x.s === "bad" ? <Icon name="x" size={11} /> : x.s === "skip" ? "–" : i + 1}</i>
            <span>{x.s === "bad" ? "Rejected" : x.t}</span>
          </li>
        ))}
      </ol>
    );
  };

  const empty = tab === "waiting" ? "No excuse requests waiting for you." : tab === "passed" ? "Nothing is with the " + (isSup ? "coordinator" : "supervisor") + " right now." : "Requests you approve or reject show here.";

  return (
    <>
      {!embedded && <PageHeader title="Excused Absences" sub={isSup
        ? "Interns attending a CSU event or excused for another reason. Confirm it and it goes to the OJT coordinator. The excused time gives no OJT hours."
        : "Sick days and school events. Approving makes the day excused: no hours counted and not absent."} live />}
      <Msg msg={msg} />
      <div className={open && cur ? "oa ev2 oa-open" : "oa ev2"}>
        <style>{OA_CSS}</style>
        <style>{EV2_CSS}</style>
        <div className="oa-list">
          <div className="oa-switch" role="tablist" aria-label="Show">
            {tabs.map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => pick(k)}>
                {l} <span className={k === "waiting" && count(k) ? "oa-n hot" : "oa-n"}>{count(k)}</span>
              </button>
            ))}
          </div>
          {shown.length > 6 && (
            <div className="oa-search"><Icon name="search" size={14} />
              <input type="search" placeholder="Search intern" value={q} onChange={(e) => { setQ(e.target.value); setSel(null); }} aria-label="Search intern" /></div>
          )}
          <div className="oa-items" role="list">
            {loading ? <Spinner /> : list.length === 0 ? (
              <div className="oa-none">
                <span className="oa-none-ic"><Icon name="check" size={18} /></span>
                <b>{sq ? "No match" : tab === "waiting" ? "All caught up" : "Nothing here"}</b>
                <small>{sq ? "Try another name." : empty}</small>
              </div>
            ) : list.map((r) => (
              <button key={r.id} type="button" role="listitem" className={cur && cur.id === r.id ? "oa-item on" : "oa-item"}
                onClick={() => { setSel(r.id); setOpen(true); }}>
                <Avatar name={r.intern_name} photo={r.intern_photo} size={34} />
                <span className="oa-who"><b>{r.intern_name}</b><small>{day(r.date)} · {r.event_name}</small></span>
                {tab === "waiting" ? <span className="ev-tag">{r.portion === "am" ? "AM" : r.portion === "pm" ? "PM" : "Whole day"}</span> : badge(r)}
              </button>
            ))}
          </div>
        </div>

        <div className="oa-detail">
          {!cur ? (
            <div className="oa-blank">
              <span className="oa-none-ic"><Icon name="calendar" size={20} /></span>
              <b>{list.length ? "Pick an excuse request" : "Nothing to show yet"}</b>
              <small>{list.length ? "Click an intern on the left to see the details." : "Excuse requests will show up here."}</small>
            </div>
          ) : (
            <>
              <button type="button" className="oa-back" onClick={() => setOpen(false)}><Icon name="menu" size={14} /> Back to the list</button>
              <div className="oa-head">
                <Avatar name={cur.intern_name} photo={cur.intern_photo} size={46} />
                <div className="oa-hn"><b>{cur.intern_name}</b><small>Excused absence · {day(cur.date)}</small></div>
                {badge(cur)}
              </div>
              <div className="oa-kv">
                <div><small>Reason</small><b>{cur.event_name}{cur.mandatory ? " · mandatory" : ""}</b></div>
                <div><small>Excused time</small><b>{portionOf(cur)}</b></div>
                <div><small>Day</small><b>{day(cur.date)}</b></div>
                <div><small>{cur.reviewer_name ? "Reviewed by" : "Supervisor"}</small><b>{cur.reviewer_name || (cur.supervisor_id ? "Assigned" : "None assigned")}</b></div>
              </div>
              {(cur.reason || cur.proof_path) && (
                <div className="ev-note">
                  {cur.reason && <p>{cur.reason}</p>}
                  {cur.proof_path && <a className="ix-link" href={fileHref(cur.proof_path)} onClick={(e) => openFile(cur.proof_path, e)} target="_blank" rel="noopener noreferrer"><Icon name="file" size={13} /> View proof{cur.proof_name ? ` (${cur.proof_name})` : ""}</a>}
                </div>
              )}
              {steps(cur)}
              {mine(cur) ? (
                <div className="oa-act">
                  <input type="text" className="ix-input" maxLength={300} placeholder="Remarks (optional)" aria-label="Remarks" value={remarks[cur.id] || ""}
                    onChange={(e) => setRemarks((m) => ({ ...m, [cur.id]: e.target.value }))} />
                  <button className="ix-b danger" disabled={busy === cur.id} onClick={() => decide(cur, "rejected")}>Reject</button>
                  <button className="ix-b ok" disabled={busy === cur.id} onClick={() => decide(cur, "approved")}>{isSup ? "Confirm" : "Approve"}</button>
                </div>
              ) : (
                <div className={cur.status === "rejected" ? "oa-done bad" : cur.status === "approved" ? "oa-done ok" : "oa-done"}>
                  <Icon name={cur.status === "rejected" ? "x" : cur.status === "approved" ? "check" : "clock"} size={14} />
                  <span>{cur.status === "rejected" ? "Rejected. The day is not excused." : cur.status === "approved" ? "Excused. No hours counted and not marked absent." : isSup ? "Confirmed. Waiting for the OJT coordinator." : "Waiting for the supervisor."}
                    {cur.remarks ? <> Remarks: <em>{cur.remarks}</em></> : null}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

const EV2_CSS = `
.ix-page.lay2 .ix-main:has(.ev2) .grp-body { flex: 1 1 auto !important; min-height: 0; display: flex; flex-direction: column; }
.ix-page.lay2 .ix-main:has(.ev2) .grp-body > * { flex: none; }
.ev-tag { flex: none; font-size: 11.5px; font-weight: 700; color: #b45309; background: #fff4e5; padding: 3px 8px; border-radius: 6px; white-space: nowrap; }
.ev-note { flex: none; border: 1px solid #e7e9ee; border-radius: 10px; background: #fafbfc; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #374151; }
.ev-note p { margin: 0; }
.ev-note .ix-link { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; }
@media (max-width: 760px) { .ix-page.lay2 .ix-main:has(.ev2) .grp-body, .ix-page.lay2 .ix-main:has(.ev2) .grp-body > .oa { flex: none !important; } }
`;