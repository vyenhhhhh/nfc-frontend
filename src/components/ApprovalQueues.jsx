// ApprovalQueues.jsx
// The OJT coordinator's Approvals tabs in the shared layout (ReviewQueue):
// status tabs → a table (10 rows a page) → a drawer with the details and Approve / Reject.
//   OnlineQueue   Online Attendance (supervisor confirms first, then the coordinator)
//   OvertimeQueue Overtime (credit all or part of the time after 5:00 PM)
//   ExcusedQueue  Excused absences (sick days, school events; proof shown in the drawer)
//   NfcQueue      NFC card requests (approve → admin prints → intern claims)
//   ProjectQueue  Project-based interns (supervisor marks complete → coordinator confirms)
// The supervisor's own pages still use the older list + details layout.
import { useEffect, useState } from "react";
import ReviewQueue from "./ReviewQueue.jsx";
import { Avatar, Badge, Icon, Msg, Spinner, OA_CSS, fmtMinutes, liveRefresh, modalityOf, calcHours, requiredHoursFor, programKey } from "./DashKit.jsx";
import { useFileLinkState } from "../files.js";
import { API } from "../config.js";

/* ───────── small helpers ───────── */
const PH_TZ = { timeZone: "Asia/Manila" };
const day = (v, long) => {
  if (!v) return "—";
  const d = new Date(String(v).slice(0, 10) + "T00:00:00+08:00");
  return isNaN(d) ? String(v).slice(0, 10) : d.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", ...(long ? { year: "numeric" } : {}), ...PH_TZ });
};
const stamp = (v) => {
  if (!v) return "—";
  const s = String(v);
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? "" : "+08:00"));
  return isNaN(d) ? "—" : d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", ...PH_TZ });
};
const clock = (v) => {
  if (!v) return "—";
  const s = String(v);
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T") + "+08:00");
  return isNaN(d) ? "—" : d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", ...PH_TZ });
};
const mins = (v) => {
  if (!v) return null;
  const s = String(v);
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T") + "+08:00");
  if (isNaN(d)) return null;
  const [h, m] = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, ...PH_TZ }).split(":").map(Number);
  return h * 60 + m;
};
const errText = (e) => (e instanceof TypeError ? "Couldn't reach the server." : e.message);
const Who = ({ name, photo, sub }) => (
  <span className="rq2-who"><Avatar name={name} photo={photo} size={32} /><span><b>{name}</b>{sub ? <small>{sub}</small> : null}</span></span>
);
// the steps of one item: [label, state] where state is done | now | bad | skip | ""
const Steps = ({ list }) => (
  <ol className="oa-steps">
    {list.map(([t, s], i) => (
      <li key={i} className={s}>
        <i>{s === "done" ? <Icon name="check" size={11} /> : s === "bad" ? <Icon name="x" size={11} /> : s === "skip" ? "–" : i + 1}</i>
        <span>{s === "bad" ? "Rejected" : t}</span>
      </li>
    ))}
  </ol>
);
const Facts = ({ items }) => (
  <div className="aq-facts">{items.filter(Boolean).map(([k, v]) => <span key={k}><small>{k}</small><b>{v}</b></span>)}</div>
);
const Result = ({ tone, icon, children }) => (
  <span className={`rq2-result ${tone || ""}`}><Icon name={icon} size={14} /><span>{children}</span></span>
);
// remarks + Reject + Approve (the footer of a drawer)
function Decide({ id, remarks, setRemarks, busy, onReject, onApprove, approveLabel = "Approve", approveDisabled }) {
  return (
    <>
      <input type="text" className="ix-input" maxLength={300} placeholder="Remarks (optional)" aria-label="Remarks" value={remarks[id] || ""}
        onChange={(e) => setRemarks((r) => ({ ...r, [id]: e.target.value }))} />
      <button type="button" className="ix-b danger" disabled={!!busy} onClick={onReject}>{busy === id + "rejected" ? "..." : "Reject"}</button>
      <button type="button" className="ix-b ok" disabled={!!busy || approveDisabled} onClick={onApprove}>{busy === id + "approved" ? "..." : approveLabel}</button>
    </>
  );
}
// bulk Approve selected (one after another; stops at the first one that fails)
function BulkApprove({ picked, clear, run, label = "Approve selected" }) {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className="ix-b ok sm" disabled={busy}
      onClick={async () => { setBusy(true); for (const x of picked) { if ((await run(x)) === false) break; } setBusy(false); clear(); }}>
      {busy ? "Approving…" : label}</button>
  );
}
// a private file (proof) shown in the drawer; same as the MOV preview
function FileBox({ path, name }) {
  const { url, error, loading } = useFileLinkState(path);
  const ext = String(name || path || "").split(".").pop().toLowerCase();
  return (
    <div className="aq-file">
      <div className="aq-file-bar"><Icon name="file" size={15} /><span>{name || "Proof"}</span>
        {url && <a href={url} target="_blank" rel="noopener noreferrer"><Icon name="eye" size={13} /> Open in a new tab</a>}</div>
      <div className="aq-file-doc">
        {loading ? <div className="aq-nofile"><Spinner /><small>Loading the file…</small></div>
          : !url ? <div className="aq-nofile"><Icon name="warn" size={24} /><small>{error || "This file can't be opened."}</small></div>
          : ext === "pdf" ? <iframe key={url} aria-label={name || "Proof"} src={`${url}#toolbar=0&navpanes=0&view=FitH`} />
          : ["png", "jpg", "jpeg", "gif", "webp"].includes(ext) ? <img src={url} alt={name || "Proof"} />
          : <div className="aq-nofile"><Icon name="file" size={24} /><small>This file type can't be shown here.</small></div>}
      </div>
    </div>
  );
}

/* ═════════════════════ Online Attendance ═════════════════════ */
// an on-site intern's off-site day starts with "Reason: …" (see Submit Online)
const splitReason = (text) => {
  const m = /^Reason: (.+?)\n\n([\s\S]*)$/.exec(String(text || ""));
  return m ? { reason: m[1], tasks: m[2] } : { reason: null, tasks: String(text || "") };
};
// role "supervisor": the HTE supervisor confirms first (the day then goes to the coordinator for the final decision)
export function OnlineQueue({ mine = [], withSup = [], done = [], onReview, role = "coordinator" }) {
  const sup = role === "supervisor";
  const [remarks, setRemarks] = useState({});
  const [busy, setBusy] = useState(null);
  const decide = async (o, status, note) => {
    setBusy(o.id + status);
    const ok = await onReview(o, status, note ?? remarks[o.id] ?? "");
    setBusy(null);
    return ok;
  };
  const badge = (o) => o.status === "approved" ? <Badge label="Approved" type="approved" /> : o.status === "rejected" ? <Badge label="Rejected" type="rejected" />
    : o.status === "endorsed" ? <Badge label={sup ? "Sent to coordinator" : "Supervisor confirmed"} type="online" />
    : sup ? <Badge label="Waiting for you" type="pending" />
    : o.supervisor_id || o.supervisor_name ? <Badge label="With supervisor" type="pending" /> : <Badge label="No supervisor" type="pending" />;
  const steps = (o) => {
    const st = o.status, rej = st === "rejected";
    const hasSup = sup || st === "endorsed" || !!o.endorsed_by || !!o.endorser_name || !!o.supervisor_id;
    const supRej = rej && (o.rejected_by === "supervisor" || (sup && !o.endorsed_by && !o.endorser_name));
    const supDone = st === "endorsed" || ((st === "approved" || rej) && hasSup && !supRej);
    return [["Intern sent it", "done"], hasSup ? [sup ? "You confirm" : "Supervisor confirms", supDone ? "done" : supRej ? "bad" : "now"] : ["No supervisor", "skip"],
      [sup ? "OJT coordinator decides" : "You decide", st === "approved" ? "done" : rej && !supRej ? "bad" : st === "endorsed" || (!hasSup && st === "pending") ? "now" : ""],
      ["8 hours counted", st === "approved" ? "done" : ""]];
  };
  const all = [...mine, ...withSup, ...done];

  return (
    <ReviewQueue
      tabs={[
        { key: "mine", label: "Needs my review", items: mine, hot: true, empty: ["All caught up", sup ? "No online days waiting for you to confirm." : "No online days waiting for your decision."] },
        { key: "sup", label: sup ? "With the coordinator" : "Waiting for supervisor", items: withSup, empty: ["Nothing here", sup ? "Days you confirmed wait here for the OJT coordinator." : "Nothing is with the HTE supervisors right now."] },
        { key: "done", label: "Done", items: done, empty: ["Nothing decided yet", "Days that were approved or rejected show here."] },
      ]}
      rowKey={(o) => o.id}
      searchText={(o) => `${o.intern_name} ${o.description || ""} ${o.endorser_name || o.supervisor_name || ""}`}
      columns={[
        { label: "Intern", render: (o) => <Who name={o.intern_name} photo={o.intern_photo} sub={o.intern_email} /> },
        { label: "Date of work", render: (o) => <span className="rq2-muted">{day(o.date)}</span> },
        { label: "Type", render: (o) => { const r = splitReason(o.description).reason; return r ? <><span className="rq2-main">Off-site day</span><span className="rq2-sub">{r}</span></> : <span className="rq2-main">Online workday</span>; } },
        ...(sup ? [{ label: "Sent", className: "rq2-hide-sm", render: (o) => <span className="rq2-muted">{stamp(o.submitted_at || o.created_at)}</span> }]
          : [{ label: "Supervisor", className: "rq2-hide-sm", render: (o) => <span className="rq2-muted">{o.endorser_name || o.supervisor_name || "None assigned"}</span> }]),
        { label: "Status", render: badge },
      ]}
      bulk={(t) => (t !== "mine" ? null : (picked, clear) => <BulkApprove picked={picked} clear={clear} label={sup ? "Confirm selected" : "Approve selected"} run={(o) => decide(o, "approved", "")} />)}
      drawer={(o) => {
        const { reason, tasks } = splitReason(o.description);
        const others = all.filter((x) => x.id !== o.id && (x.user_id ? x.user_id === o.user_id : x.intern_name === o.intern_name))
          .sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 8);
        return {
          icon: "inbox", kicker: `${o.intern_name} · ${reason ? "Off-site day" : "Online workday"}`, title: day(o.date, true), actions: badge(o),
          body: (
            <>
              <style>{OA_CSS}</style><style>{AQ_CSS}</style>
              <Facts items={[["Counts as", "8 hours (8:00 AM – 5:00 PM)"], !sup && ["Supervisor", o.endorser_name || o.supervisor_name || "None assigned"], ["Sent", stamp(o.submitted_at || o.created_at)]]} />
              {reason && <div className="aq-note warn"><b>Why they weren't at the office</b><p>{reason}</p></div>}
              <div className="aq-note"><b>What they worked on</b><p>{tasks || "—"}</p></div>
              {o.endorse_remarks && <div className="aq-note ok"><b>Supervisor's note</b><p>{o.endorse_remarks}</p></div>}
              <Steps list={steps(o)} />
              {others.length > 0 && (
                <div className="aq-hist"><b>Earlier from {String(o.intern_name).split(" ")[0]}</b>
                  <ul>{others.map((x) => <li key={x.id}><span>{day(x.date)}</span><em>{splitReason(x.description).tasks || "Online day"}</em>{badge(x)}</li>)}</ul></div>
              )}
            </>
          ),
          footer: mine.some((x) => x.id === o.id)
            ? <Decide id={o.id} remarks={remarks} setRemarks={setRemarks} busy={busy} approveLabel={sup ? "Confirm" : "Approve"} onReject={() => decide(o, "rejected")} onApprove={() => decide(o, "approved")} />
            : <Result tone={o.status === "approved" ? "ok" : o.status === "rejected" ? "bad" : ""} icon={o.status === "approved" ? "check" : o.status === "rejected" ? "x" : "clock"}>
                {o.status === "approved" ? "Approved. The 8 hours are counted." : o.status === "rejected" ? "Rejected."
                  : sup ? "You confirmed it. Waiting for the OJT coordinator's final decision." : "Waiting for the HTE supervisor to confirm it first."}
                {o.remarks ? <> · <em>{o.remarks}</em></> : null}{o.reviewed_at ? ` · ${stamp(o.reviewed_at)}` : ""}
              </Result>,
        };
      }}
    />
  );
}

/* ═════════════════════ Overtime ═════════════════════ */
export function OvertimeQueue({ mine = [], withSup = [], done = [], all = [], capOf = (o) => o.ot_minutes, onReview, role = "coordinator" }) {
  const sup = role === "supervisor";
  const [remarks, setRemarks] = useState({});
  const [credit, setCredit] = useState({});      // id -> "" (all) | minutes | "other"
  const [busy, setBusy] = useState(null);
  const decide = async (o, status, minutes, note) => {
    setBusy(o.id + status);
    const ok = await onReview(o, status, minutes, note ?? remarks[o.id] ?? "");
    setBusy(null);
    return ok;
  };
  const badge = (o) => o.ot_status === "approved" ? <Badge label={`+${fmtMinutes(o.ot_approved_minutes)}`} type="approved" />
    : o.ot_status === "rejected" ? <Badge label="Rejected" type="rejected" />
    : o.ot_status === "endorsed" ? <Badge label={sup ? `${fmtMinutes(o.ot_endorsed_minutes)} sent to coordinator` : `${fmtMinutes(o.ot_endorsed_minutes)} confirmed`} type="online" />
    : sup ? <Badge label="Waiting for you" type="pending" />
    : o.supervisor_id ? <Badge label="With supervisor" type="pending" /> : <Badge label="No supervisor" type="pending" />;
  // the day: regular hours (green) and after 5:00 PM (orange)
  const bar = (o) => {
    const tin = mins(o.checked_in_at) ?? 480;
    const tout = mins(o.checked_out_at) ?? (1020 + (Number(o.ot_minutes) || 0));
    const from = Math.min(420, tin), to = Math.max(1140, tout + 30), span = to - from;
    const pct = (m) => `${((m - from) / span) * 100}%`;
    return (
      <div className="aq-day">
        <div className="aq-bar">
          <i className="reg" style={{ left: pct(tin), width: `calc(${pct(Math.min(tout, 1020))} - ${pct(tin)})` }} />
          {tout > 1020 && <i className="ot" style={{ left: pct(1020), width: `calc(${pct(tout)} - ${pct(1020)})` }} />}
          <span className="five" style={{ left: pct(1020) }} />
        </div>
        <div className="aq-ticks"><span>In {clock(o.checked_in_at)}</span><span>5:00 PM</span><span>Out {clock(o.checked_out_at)}</span></div>
      </div>
    );
  };

  return (
    <ReviewQueue
      tabs={[
        { key: "mine", label: "Needs my review", items: mine, hot: true, empty: ["All caught up", "No overtime waiting for your decision."] },
        { key: "sup", label: sup ? "With the coordinator" : "Waiting for supervisor", items: withSup, empty: ["Nothing here", sup ? "Overtime you approved waits here for the OJT coordinator." : "Nothing is with the HTE supervisors right now."] },
        { key: "done", label: "Done", items: done, empty: ["Nothing decided yet", "Overtime that was approved or rejected shows here."] },
      ]}
      rowKey={(o) => o.id}
      searchText={(o) => `${o.intern_name} ${o.endorser_name || o.supervisor_name || ""}`}
      columns={[
        { label: "Intern", render: (o) => <Who name={o.intern_name} photo={o.intern_photo} /> },
        { label: "Date", render: (o) => <span className="rq2-muted">{day(o.date)}</span> },
        { label: "Time out", render: (o) => <span className="rq2-muted">{clock(o.checked_out_at)}</span> },
        { label: "Overtime", render: (o) => <span className="rq2-main">{fmtMinutes(capOf(o))}</span> },
        ...(sup ? [] : [{ label: "Supervisor", className: "rq2-hide-sm", render: (o) => <span className="rq2-muted">{o.endorser_name || o.supervisor_name || "None assigned"}</span> }]),
        { label: "Status", render: badge },
      ]}
      bulk={(t) => (t !== "mine" ? null : (picked, clear) => <BulkApprove picked={picked} clear={clear} label="Approve all time" run={(o) => decide(o, "approved", capOf(o), "")} />)}
      drawer={(o) => {
        const cap = capOf(o);
        const isMine = mine.some((x) => x.id === o.id);
        const ch = credit[o.id];
        const minutes = ch === undefined || ch === "" ? cap : ch === "other" ? "" : Number(ch);
        const quick = [cap, 60, 30].filter((m, i, a) => m > 0 && m <= cap && a.indexOf(m) === i);
        const month = all.filter((x) => x.user_id === o.user_id && x.ot_status === "approved" && String(x.date).slice(0, 7) === String(o.date).slice(0, 7))
          .reduce((n, x) => n + (Number(x.ot_approved_minutes) || 0), 0);
        const st = o.ot_status, rej = st === "rejected";
        const supOk = st === "endorsed" || Number(o.ot_endorsed_minutes) > 0;
        const hasSup = supOk || !!o.supervisor_id || !!o.ot_endorsed_at;
        const other = ch === "other" || (ch !== undefined && ch !== "" && !quick.includes(Number(ch)));
        return {
          icon: "clock", kicker: `${o.intern_name} · Overtime`, title: day(o.date, true), actions: badge(o),
          body: (
            <>
              <style>{OA_CSS}</style><style>{AQ_CSS}</style>
              {bar(o)}
              <Facts items={[["After 5:00 PM", fmtMinutes(o.ot_minutes)], [sup ? "You approved" : "Supervisor confirmed", supOk ? fmtMinutes(o.ot_endorsed_minutes) : sup ? "Not yet" : o.supervisor_id ? "Not yet" : "No supervisor"],
                ["Approved this month", month ? fmtMinutes(month) : "None yet"]]} />
              {o.ot_endorse_remarks && <div className="aq-note ok"><b>Supervisor's note</b><p>{o.ot_endorse_remarks}</p></div>}
              <Steps list={[["Stayed after 5 PM", "done"], (hasSup || sup) ? [sup ? "You approve" : "Supervisor approves", supOk ? "done" : rej ? "bad" : "now"] : ["No supervisor", "skip"],
                [sup ? "OJT coordinator decides" : "You decide", st === "approved" ? "done" : rej && supOk ? "bad" : st === "endorsed" || (!hasSup && !sup && st === "pending") ? "now" : ""], ["Added to hours", st === "approved" ? "done" : ""]]} />
              {isMine && (
                <div className="aq-credit">
                  <b>How much to credit?</b>
                  <div>
                    {quick.map((m, i) => (
                      <button key={m} type="button" className={!other && minutes === m ? "on" : ""} onClick={() => setCredit((c) => ({ ...c, [o.id]: i === 0 ? "" : m }))}>
                        {i === 0 ? `All ${fmtMinutes(m)}` : fmtMinutes(m)}</button>
                    ))}
                    <button type="button" className={other ? "on" : ""} onClick={() => setCredit((c) => ({ ...c, [o.id]: "other" }))}>Other</button>
                    {other && <input type="number" className="ix-input" min={1} max={cap} placeholder="minutes" aria-label="Minutes to credit" autoFocus
                      value={ch === "other" ? "" : ch} onChange={(e) => setCredit((c) => ({ ...c, [o.id]: e.target.value === "" ? "other" : e.target.value }))} />}
                  </div>
                  <small>Up to {fmtMinutes(cap)}. {sup ? "The OJT coordinator gives the final decision." : "Added on top of the 8 official hours."}</small>
                </div>
              )}
            </>
          ),
          footer: isMine
            ? <Decide id={o.id} remarks={remarks} setRemarks={setRemarks} busy={busy} approveDisabled={!minutes}
                approveLabel={`Approve${minutes ? " " + fmtMinutes(minutes) : ""}`}
                onReject={() => decide(o, "rejected", null)} onApprove={() => decide(o, "approved", minutes)} />
            : <Result tone={st === "approved" ? "ok" : rej ? "bad" : ""} icon={st === "approved" ? "check" : rej ? "x" : "clock"}>
                {st === "approved" ? `Approved. ${fmtMinutes(o.ot_approved_minutes)} added to that day.` : rej ? "Rejected. No overtime added."
                  : sup ? `You approved ${fmtMinutes(o.ot_endorsed_minutes)}. Waiting for the OJT coordinator's final decision.` : "Waiting for the HTE supervisor to approve it first."}
                {o.ot_remarks ? <> · <em>{o.ot_remarks}</em></> : null}
              </Result>,
        };
      }}
    />
  );
}

/* ═════════════════════ Excused ═════════════════════ */
const portionOf = (r) => (r.portion === "am" ? "Morning" : r.portion === "pm" ? "Afternoon" : "Whole day");
export function ExcusedQueue({ role = "coordinator" }) {
  const sup = role === "supervisor";
  const [rows, setRows] = useState(null);
  const [msg, setMsg] = useState(null);
  const [remarks, setRemarks] = useState({});
  const [busy, setBusy] = useState(null);
  const load = async () => {
    try {
      const res = await fetch(`${API}/supervisor/school-events`, { headers: { Accept: "application/json" } });
      const d = await res.json();
      setRows(Array.isArray(d) ? d : []);
    } catch { setRows((r) => r || []); }
  };
  useEffect(() => { load(); return liveRefresh(load); }, []);
  const decide = async (r, status, note) => {
    setBusy(r.id + status); setMsg(null);
    try {
      const res = await fetch(`${API}/supervisor/school-events/${r.id}/review`, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ status, remarks: (note ?? remarks[r.id] ?? "").trim() || null }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d.errors && Object.values(d.errors)[0]?.[0]) || d.message || "Couldn't save.");
      setMsg({ type: "success", text: d.message || "Saved." });
      await load();
      return true;
    } catch (e) { setMsg({ type: "error", text: errText(e) }); return false; } finally { setBusy(null); }
  };
  if (!rows) return <Spinner />;
  // supervisor: their turn is "pending" (they confirm, then it goes to the coordinator)
  const isMine = (r) => (sup ? r.status === "pending" : r.status === "endorsed" || (r.status === "pending" && !r.supervisor_id));
  const mine = rows.filter(isMine).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const withSup = rows.filter((r) => (sup ? r.status === "endorsed" : r.status === "pending" && r.supervisor_id));
  const done = rows.filter((r) => r.status === "approved" || r.status === "rejected").sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const badge = (r) => <Badge label={r.status === "approved" ? "Excused" : r.status === "rejected" ? "Rejected"
    : r.status === "endorsed" ? (sup ? "Sent to coordinator" : "Supervisor confirmed") : sup ? "Waiting for you" : r.supervisor_id ? "With supervisor" : "No supervisor"}
    type={r.status === "approved" ? "approved" : r.status === "rejected" ? "rejected" : r.status === "endorsed" ? "online" : "pending"} />;

  return (
    <>
      <Msg msg={msg} />
      <ReviewQueue
        tabs={[
          { key: "mine", label: "Needs my review", items: mine, hot: true, empty: ["All caught up", sup ? "No excused absences waiting for you to confirm." : "No excused absences waiting for your decision."] },
          { key: "sup", label: sup ? "With the coordinator" : "Waiting for supervisor", items: withSup, empty: ["Nothing here", sup ? "Requests you confirmed wait here for the OJT coordinator." : "Nothing is with the HTE supervisors right now."] },
          { key: "done", label: "Done", items: done, empty: ["Nothing decided yet", "Requests you approve or reject show here."] },
        ]}
        rowKey={(r) => r.id}
        searchText={(r) => `${r.intern_name} ${r.event_name || ""}`}
        columns={[
          { label: "Intern", render: (r) => <Who name={r.intern_name} photo={r.intern_photo} /> },
          { label: "Day", render: (r) => <span className="rq2-muted">{day(r.date)}</span> },
          { label: "Time", render: (r) => <span className="rq2-muted">{portionOf(r)}</span> },
          { label: "Reason", render: (r) => <><span className="rq2-main">{r.event_name}</span>{r.mandatory ? <span className="rq2-sub">Mandatory school event</span> : null}</> },
          { label: "Status", render: badge },
        ]}
        bulk={(t) => (t !== "mine" ? null : (picked, clear) => <BulkApprove picked={picked} clear={clear} label={sup ? "Confirm selected" : "Approve selected"} run={(r) => decide(r, "approved", "")} />)}
        drawer={(r) => {
          const rej = r.status === "rejected", hasSup = sup || !!r.supervisor_id || r.status === "endorsed";
          return {
            icon: "calendar", kicker: `${r.intern_name} · Excused absence`, title: `${day(r.date, true)} · ${portionOf(r)}`, actions: badge(r),
            body: (
              <>
                <style>{OA_CSS}</style><style>{AQ_CSS}</style>
                <Facts items={[["Reason", `${r.event_name}${r.mandatory ? " (mandatory)" : ""}`], ["Supervisor", r.reviewer_name || (r.supervisor_id ? "Assigned" : "None assigned")], ["Sent", stamp(r.created_at)]]} />
                {r.reason && <div className="aq-note"><b>Intern's note</b><p>{r.reason}</p></div>}
                {r.proof_path ? <FileBox key={r.id} path={r.proof_path} name={r.proof_name} /> : <div className="aq-note warn"><b>No proof attached</b></div>}
                <Steps list={[["Intern sent it", "done"], hasSup ? [sup ? "You confirm" : "Supervisor confirms", r.status === "endorsed" || r.status === "approved" ? "done" : rej && sup ? "bad" : "now"] : ["No supervisor", "skip"],
                  [sup ? "OJT coordinator decides" : "You decide", r.status === "approved" ? "done" : rej && !sup ? "bad" : (sup ? r.status === "endorsed" : isMine(r)) ? "now" : ""], ["Day excused", r.status === "approved" ? "done" : ""]]} />
              </>
            ),
            footer: isMine(r)
              ? <Decide id={r.id} remarks={remarks} setRemarks={setRemarks} busy={busy} approveLabel={sup ? "Confirm" : "Approve"} onReject={() => decide(r, "rejected")} onApprove={() => decide(r, "approved")} />
              : <Result tone={r.status === "approved" ? "ok" : rej ? "bad" : ""} icon={r.status === "approved" ? "check" : rej ? "x" : "clock"}>
                  {r.status === "approved" ? "Excused. No hours counted and not marked absent." : rej ? "Rejected. The day is not excused."
                    : sup ? "You confirmed it. Waiting for the OJT coordinator's final decision." : "Waiting for the HTE supervisor."}
                  {r.remarks ? <> · <em>{r.remarks}</em></> : null}
                </Result>,
          };
        }}
      />
    </>
  );
}

/* ═════════════════════ NFC Cards ═════════════════════ */
export function NfcQueue({ user, onRefresh, preOf }) {
  const [rows, setRows] = useState(null);
  const [msg, setMsg] = useState(null);
  const [remarks, setRemarks] = useState({});
  const [busy, setBusy] = useState(null);
  const load = async () => {
    try {
      const res = await fetch(`${API}/supervisor/nfc-requests`, { headers: { Accept: "application/json" } });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || "Could not load card requests.");
      setRows(Array.isArray(d) ? d : []);
    } catch (e) { setRows((r) => r || []); setMsg({ type: "error", text: errText(e) }); }
  };
  useEffect(() => { load(); return liveRefresh(load); }, []);
  const decide = async (r, status) => {
    setBusy(r.id + status); setMsg(null);
    try {
      const res = await fetch(`${API}/supervisor/nfc-requests/${r.id}/review`, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ status, remarks: remarks[r.id] || "", reviewer_id: user?.id }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || "Something went wrong.");
      setMsg({ type: "success", text: d.message || "Request updated." });
      await load(); onRefresh && onRefresh();
      return true;
    } catch (e) { setMsg({ type: "error", text: errText(e) }); return false; } finally { setBusy(null); }
  };
  if (!rows) return <Spinner />;
  const newest = (a, b) => String(b.reviewed_at || b.updated_at || "").localeCompare(String(a.reviewed_at || a.updated_at || ""));
  const mine = rows.filter((r) => r.status === "pending").sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const toPrint = rows.filter((r) => r.status === "approved" && !r.printed_at).sort(newest);
  const toClaim = rows.filter((r) => r.status === "approved" && r.printed_at).sort(newest);
  const done = rows.filter((r) => r.status === "issued" || r.status === "rejected").sort(newest);
  const badge = (r) => r.status === "pending" ? <Badge label="Waiting for you" type="pending" /> : r.status === "rejected" ? <Badge label="Rejected" type="rejected" />
    : r.status === "issued" ? <Badge label="Card issued" type="approved" /> : <Badge label={r.printed_at ? "Printed · to claim" : "Approved · to print"} type="online" />;
  const step = (r) => (r.status === "rejected" ? -1 : r.status === "issued" ? 4 : r.status === "approved" ? (r.printed_at ? 3 : 2) : 1);

  return (
    <>
      <Msg msg={msg} />
      <ReviewQueue
        tabs={[
          { key: "mine", label: "Needs my review", items: mine, hot: true, empty: ["All caught up", "No card requests waiting for you."] },
          { key: "print", label: "Admin prints", items: toPrint, empty: ["Nothing to print", "Requests you approve wait here until the admin prints the card."] },
          { key: "claim", label: "Intern claims", items: toClaim, empty: ["Nothing to claim", "Printed cards wait here until the intern claims them."] },
          { key: "done", label: "Done", items: done, empty: ["Nothing finished yet", "Issued and rejected requests show here."] },
        ]}
        rowKey={(r) => r.id}
        searchText={(r) => `${r.intern_name} ${r.intern_email || ""} ${r.type || ""}`}
        columns={[
          { label: "Intern", render: (r) => <Who name={r.intern_name} photo={r.intern_photo} sub={r.intern_email} /> },
          { label: "Request", render: (r) => <span className="rq2-main">{r.type || "New card"}</span> },
          { label: "Applied", render: (r) => <span className="rq2-muted">{stamp(r.created_at)}</span> },
          { label: "Pre-internship", className: "rq2-hide-sm", render: (r) => { const p = preOf ? preOf(r) : null; return p ? <span className={p.started ? "aq-ok" : "aq-warn"}>{p.approved}/{p.total}{p.started ? " · done" : ""}</span> : "—"; } },
          { label: "Stage", render: badge },
        ]}
        drawer={(r) => {
          const p = preOf ? preOf(r) : null;
          const s = step(r);
          return {
            icon: "card", kicker: `${r.intern_name} · NFC card`, title: r.type || "New card", actions: badge(r),
            body: (
              <>
                <style>{OA_CSS}</style><style>{AQ_CSS}</style>
                <Facts items={[["Applied", stamp(r.created_at)], ["Card on file", r.uid ? "Has a card" : "None yet"],
                  ["Pre-internship", p ? `${p.approved} of ${p.total} approved` : "—"]]} />
                <div className="aq-note"><b>Intern's note</b><p>{r.notes || "—"}</p></div>
                {p && !p.started && r.status !== "rejected" && r.status !== "issued" && (
                  <div className="aq-note warn"><b>Pre-internship requirements aren't complete yet ({p.approved}/{p.total})</b><p>The card can be approved and printed, but the intern can claim it only when every requirement is approved.</p></div>
                )}
                <Steps list={["Intern applied", "You approve", "Admin prints", "Card claimed"].map((t, i) =>
                  [t, s < 0 ? (i === 0 ? "done" : i === 1 ? "bad" : "") : i < s ? "done" : i === s ? "now" : ""])} />
              </>
            ),
            footer: r.status === "pending"
              ? <Decide id={r.id} remarks={remarks} setRemarks={setRemarks} busy={busy} onReject={() => decide(r, "rejected")} onApprove={() => decide(r, "approved")} />
              : <Result tone={r.status === "issued" ? "ok" : r.status === "rejected" ? "bad" : ""} icon={r.status === "issued" ? "check" : r.status === "rejected" ? "x" : "clock"}>
                  {r.status === "rejected" ? "Rejected." : r.status === "issued" ? "Card issued. It is active." : r.printed_at ? "Approved and printed. Waiting for the intern to claim it." : "Approved. Waiting for the admin to print it."}
                  {r.remarks ? <> · <em>{r.remarks}</em></> : null}{r.reviewer_name ? ` · ${r.reviewer_name}` : ""}
                </Result>,
          };
        }}
      />
    </>
  );
}

/* ═════════════════════ Projects ═════════════════════ */
// role "supervisor": the HTE supervisor marks the project complete; the coordinator then confirms it
export function ProjectQueue({ interns, records, onRefresh, role = "coordinator" }) {
  const sup = role === "supervisor";
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(null);
  const [local, setLocal] = useState({});     // id -> { marked_at, confirmed_at } after an action, until the list reloads
  const all = interns.filter((u) => modalityOf(u) === "project").map((u) => {
    const s = { marked_at: u.project_marked_at, confirmed_at: u.project_confirmed_at, ...(local[u.id] || {}) };
    return { id: u.id, u, s, st: s.confirmed_at ? "done" : s.marked_at ? "mine" : "progress",
      hours: Math.round(calcHours(records.filter((r) => r.user_id === u.id)) * 10) / 10, required: requiredHoursFor(u.program, u.prior_hours) };
  });
  const call = async (x, method, path, ok) => {
    setBusy(x.id + path + method); setMsg(null);
    try {
      const res = await fetch(`${API}/interns/${x.id}/project/${path}`, { method, headers: { Accept: "application/json" } });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || "Couldn't save.");
      setLocal((m) => ({ ...m, [x.id]: { marked_at: d.marked_at, confirmed_at: d.confirmed_at } }));
      setMsg({ type: "success", text: ok });
      onRefresh && onRefresh();
      return true;
    } catch (e) { setMsg({ type: "error", text: errText(e) }); return false; } finally { setBusy(null); }
  };
  const badge = (x) => x.st === "done" ? <Badge label="Confirmed" type="approved" /> : x.st === "mine" ? <Badge label={sup ? "With the coordinator" : "Marked complete"} type="online" /> : <Badge label="In progress" type="pending" />;
  const by = (k) => all.filter((x) => x.st === k).sort((a, b) => String(a.u.name).localeCompare(String(b.u.name)));

  return (
    <>
      <Msg msg={msg} />
      <ReviewQueue
        tabs={sup ? [
          { key: "progress", label: "In progress", items: by("progress"), hot: false, empty: ["Nothing here", all.length ? "Every project is marked complete." : "None of your interns is project-based."] },
          { key: "mine", label: "With the coordinator", items: by("mine"), empty: ["Nothing here", "Projects you mark complete wait here for the OJT coordinator."] },
          { key: "done", label: "Confirmed", items: by("done"), empty: ["Nothing confirmed yet", "Projects the coordinator confirms show here."] },
        ] : [
          { key: "mine", label: "Needs my review", items: by("mine"), hot: true, empty: ["All caught up", all.length ? "Projects the HTE supervisor marks as complete show here." : "No project-based interns. Set an intern's modality to Project-based on their profile."] },
          { key: "progress", label: "In progress", items: by("progress"), empty: ["Nothing here", "Project-based interns still working on their project show here."] },
          { key: "done", label: "Confirmed", items: by("done"), empty: ["Nothing confirmed yet", "Projects you confirm show here."] },
        ]}
        rowKey={(x) => x.id}
        searchText={(x) => `${x.u.name} ${x.u.placement || ""} ${x.u.supervisor_name || ""}`}
        columns={[
          { label: "Intern", render: (x) => <Who name={x.u.name} photo={x.u.photo} sub={programKey(x.u.program)} /> },
          { label: "HTE", render: (x) => <span className="rq2-muted">{x.u.placement || "—"}</span> },
          { label: "Supervisor", className: "rq2-hide-sm", render: (x) => <span className="rq2-muted">{x.u.supervisor_name || "—"}</span> },
          { label: "Hours so far", render: (x) => <span className="rq2-muted">{x.hours}h of {x.required}h</span> },
          { label: "Marked complete", render: (x) => (x.s.marked_at ? <span className="rq2-muted">{stamp(x.s.marked_at)}</span> : badge(x)) },
        ]}
        drawer={(x) => ({
          icon: "briefcase", kicker: `${x.u.name} · Project-based`, title: x.u.placement || "Project", actions: badge(x),
          body: (
            <>
              <style>{OA_CSS}</style><style>{AQ_CSS}</style>
              <Facts items={[["HTE supervisor", x.u.supervisor_name || "—"], ["Hours so far", `${x.hours}h`], ["Program hours", `${x.required}h`]]} />
              <div className="aq-note"><b>How a project-based OJT ends</b><p>{sup
                ? "The OJT is complete when all the project tasks you gave are done, even before the required hours. You mark it complete, then the OJT coordinator confirms it and the intern's post-internship requirements open."
                : "The OJT is complete when all the project tasks given by the HTE are done, even before the required hours. The HTE supervisor marks it complete, then you confirm it. Confirming opens the intern's post-internship requirements."}</p></div>
              <Steps list={[[sup ? "You mark it complete" : "Supervisor marks it complete", x.s.marked_at ? "done" : "now"], [sup ? "OJT coordinator confirms" : "You confirm", x.s.confirmed_at ? "done" : x.s.marked_at ? "now" : ""], ["Post-internship opens", x.s.confirmed_at ? "done" : ""]]} />
            </>
          ),
          footer: sup ? (
            x.st === "progress"
              ? <><span className="rq2-result">Mark it only when all the tasks you gave are done.</span>
                  <button type="button" className="ix-b ok" disabled={!!busy} onClick={() => { if (window.confirm(`Mark ${x.u.name}'s project as complete? Do this only when all the tasks you gave are done.`)) call(x, "POST", "mark", `${x.u.name}'s project is marked as complete. The OJT coordinator will confirm it.`); }}>{busy ? "..." : "Mark project complete"}</button></>
              : x.st === "mine"
                ? <><Result icon="clock">Marked complete {stamp(x.s.marked_at)}. Waiting for the OJT coordinator.</Result>
                    <button type="button" className="ix-b ghost" disabled={!!busy} onClick={() => call(x, "DELETE", "mark", "The project is no longer marked as complete.")}>{busy ? "..." : "Undo"}</button></>
                : <Result tone="ok" icon="check">Confirmed by the OJT coordinator {stamp(x.s.confirmed_at)}.</Result>
          ) : x.st === "mine"
            ? <><span className="rq2-result">Marked complete {stamp(x.s.marked_at)}.</span>
                <button type="button" className="ix-b ok" disabled={!!busy} onClick={() => call(x, "POST", "confirm", `${x.u.name}'s project is confirmed. Their post-internship requirements are open.`)}>{busy ? "..." : "Confirm complete"}</button></>
            : x.st === "done"
              ? <><Result tone="ok" icon="check">Confirmed {stamp(x.s.confirmed_at)}. Post-internship requirements are open.</Result>
                  <button type="button" className="ix-b ghost" disabled={!!busy} onClick={() => call(x, "DELETE", "confirm", "The confirmation was undone.")}>{busy ? "..." : "Undo"}</button></>
              : <Result icon="clock">Waiting for the HTE supervisor to mark the project as complete.</Result>,
        })}
      />
    </>
  );
}

const AQ_CSS = `
.aq-facts { flex: none; display: flex; flex-wrap: wrap; gap: 6px 22px; padding: 10px 14px; border: 1px solid #eef0f4; border-radius: 12px; background: #fafbfc; }
.aq-facts span { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
.aq-facts small { font-size: 12px; color: #64748b; } .aq-facts b { font-size: 13.5px; color: #0f172a; font-weight: 600; }
.aq-note { flex: none; border: 1px solid #eef0f4; border-radius: 12px; padding: 10px 14px; background: #fff; }
.aq-note b { display: block; font-size: 11.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #94a3b8; margin-bottom: 4px; }
.aq-note p { margin: 0; font-size: 13.5px; line-height: 1.55; color: #1e293b; white-space: pre-wrap; overflow-wrap: anywhere; }
.aq-note.warn { background: #fffbeb; border-color: #fde68a; } .aq-note.warn b { color: #b45309; text-transform: none; letter-spacing: 0; font-size: 13px; }
.aq-note.ok { background: #f0fdf4; border-color: #bbf7d0; } .aq-note.ok b { color: #15803d; }
.aq-hist { flex: none; } .aq-hist > b { display: block; font-size: 11.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #94a3b8; margin-bottom: 6px; }
.aq-hist ul { list-style: none; margin: 0; padding: 0; border: 1px solid #eef0f4; border-radius: 12px; overflow: hidden; }
.aq-hist li { display: flex; align-items: center; gap: 10px; padding: 7px 12px; border-bottom: 1px solid #f3f4f6; font-size: 12.5px; }
.aq-hist li:last-child { border-bottom: 0; }
.aq-hist li span { flex: none; width: 92px; font-weight: 600; color: #334155; }
.aq-hist li em { flex: 1; min-width: 0; font-style: normal; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* overtime: the day bar and the credit choice */
.aq-day { flex: none; padding: 4px 2px 0; }
.aq-bar { position: relative; height: 12px; border-radius: 99px; background: #f1f3f6; }
.aq-bar i { position: absolute; top: 0; bottom: 0; border-radius: 99px; }
.aq-bar i.reg { background: #86efac; } .aq-bar i.ot { background: #fb923c; }
.aq-bar .five { position: absolute; top: -4px; bottom: -4px; width: 2px; background: #334155; border-radius: 2px; }
.aq-ticks { display: flex; justify-content: space-between; margin-top: 6px; font-size: 12px; color: #64748b; }
.aq-credit { flex: none; display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 1px solid #fde3d6; border-radius: 12px; background: #fffaf7; }
.aq-credit > b { font-size: 13px; color: #9a3412; }
.aq-credit > div { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.aq-credit button { height: 32px; padding: 0 12px !important; border: 1px solid #e5e7eb; border-radius: 9px; background: #fff; font: inherit; font-size: 12.5px; font-weight: 600; color: #374151; cursor: pointer; }
.aq-credit button.on { background: #e8582a; border-color: #e8582a; color: #fff; }
.aq-credit input { width: 110px; height: 32px !important; }
.aq-credit small { font-size: 12px; color: #6b7280; }
/* excused: the proof file */
.aq-file { flex: 1 1 auto; min-height: 320px; display: flex; flex-direction: column; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; }
.aq-file-bar { flex: none; display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid #eef0f4; color: #64748b; }
.aq-file-bar span { flex: 1; min-width: 0; font-size: 12.5px; font-weight: 600; color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ix-page .aq-file-bar a { flex: none; display: inline-flex; align-items: center; gap: 5px; height: 30px; padding: 0 11px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 12.5px; font-weight: 600; color: #374151; text-decoration: none !important; }
.aq-file-doc { position: relative; flex: 1 1 auto; min-height: 0; background: #f3f4f6; display: flex; }
.aq-file-doc iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: #fff; }
.aq-file-doc img { margin: auto; max-width: 100%; max-height: 100%; object-fit: contain; }
.aq-nofile { margin: auto; display: flex; flex-direction: column; align-items: center; gap: 6px; color: #64748b; text-align: center; padding: 20px; font-size: 12.5px; }
.aq-ok { color: #15803d; font-weight: 600; } .aq-warn { color: #b45309; font-weight: 600; }
`;
