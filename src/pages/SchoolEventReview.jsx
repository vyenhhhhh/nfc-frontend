// SchoolEventReview.jsx — page for the HTE supervisor AND the OJT coordinator / admin.
// Supervisor: confirms (then it goes to the coordinator) or rejects.  Coordinator / admin: final decision.
import { useState, useEffect } from "react";
import { API } from "../config.js";
import { Spinner, PageHeader, Badge, Msg, Icon, liveRefresh } from "../components/DashKit.jsx";


const day = (v) => v ? new Date(String(v).slice(0, 10) + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "—";

// is this request waiting for ME? (supervisor: pending · coordinator/admin: confirmed, or pending with no supervisor)
export const schoolEventIsMine = (r, role) =>
  role === "supervisor" ? r.status === "pending" : (r.status === "endorsed" || (r.status === "pending" && !r.supervisor_id));

export default function SchoolEventReview({ user, embedded = false }) {
  const isSup = user?.role === "supervisor";
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("waiting");
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

  const tabs = [["waiting", "Waiting for you"], ["passed", isSup ? "With the coordinator" : "With the supervisor"], ["done", "Decided"]];

  return (
    <>
      {!embedded && <PageHeader title="School Events" sub={isSup
        ? "Interns attending a CSU event. Confirm it and it goes to the OJT coordinator. The event time gives no OJT hours."
        : "Excused days for CSU events. Approving makes the day excused: no hours counted and not absent."} live />}
      <Msg msg={msg} />
      <div className="mon-bar rq-bar">
        {tabs.map(([k, l]) => (
          <button key={k} type="button" className={tab === k ? "mon-chip on" : "mon-chip"} onClick={() => setTab(k)}>{l} · {count(k)}</button>
        ))}
      </div>
      <div className="ix-card flush">
        {loading ? <Spinner /> : shown.length === 0 ? (
          <div className="rq-empty"><Icon name="calendar" size={22} /><b>Nothing here</b><small>School event requests will show up here.</small></div>
        ) : (
          <table>
            <thead><tr><th>Intern</th><th>Day</th><th>Event</th><th>Status</th>{tab === "waiting" && <th style={{ minWidth: 260 }}>Decision</th>}</tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.intern_name}</strong></td>
                  <td>{day(r.date)}</td>
                  <td>
                    <strong>{r.event_name}</strong>{r.mandatory ? <em> · mandatory</em> : null}
                    {r.reason && <small style={{ display: "block", opacity: .7 }}>{r.reason}</small>}
                    {r.remarks && r.status === "rejected" && <small style={{ display: "block" }}>“{r.remarks}”</small>}
                  </td>
                  <td><Badge label={r.status === "approved" ? "Excused" : r.status === "rejected" ? "Rejected" : r.status === "endorsed" ? "Confirmed" : "Waiting"}
                    type={r.status === "approved" ? "approved" : r.status === "rejected" ? "rejected" : "pending"} /></td>
                  {tab === "waiting" && (
                    <td>
                      <input type="text" maxLength={300} placeholder="Remarks (optional)" value={remarks[r.id] || ""} aria-label="Remarks"
                        onChange={(e) => setRemarks((m) => ({ ...m, [r.id]: e.target.value }))} style={{ width: "100%", marginBottom: 6 }} />
                      <div style={{ display: "flex", gap: 6 }}>
                        <button type="button" className="ix-b primary" disabled={busy === r.id} onClick={() => decide(r, "approved")}>{isSup ? "Confirm" : "Approve"}</button>
                        <button type="button" className="ix-b ghost" disabled={busy === r.id} onClick={() => decide(r, "rejected")}>Reject</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}