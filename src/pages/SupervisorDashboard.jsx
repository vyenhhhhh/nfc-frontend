// SupervisorDashboard.jsx
// The HTE supervisor's workspace: sees only their own interns' attendance, confirms online workdays and
// overtime first (the OJT coordinator gives the final decision), decides time corrections and work
// arrangement requests (final — no coordinator step), and certifies DTRs.
import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Shell, {
  navWithTabs,
  Spinner, Badge, Table, Section, Avatar, Icon, PageHeader, Msg, Inbox,
  InternMonitor, AnnouncementBoard, todayManila, fmtTime, greeting, liveRefresh, fmtMinutes,
} from "../components/DashKit.jsx";
import {
  Records, DTR, AdminProfile, adminCss, adminMatch, GroupPage, grpCss, HomeCalendar,
} from "./AdminDashboard.jsx";
import { internCss, cardUnify } from "./InternDashboard.jsx";
import Evaluations from "../components/Evaluations.jsx";
import { DashLayout, Panel, DashRow, TodayPeople, NeedsAttention } from "../components/DashBoard.jsx";
import { formalLayout } from "../components/formalLayout.js";
import { mdCss } from "../components/materialTheme.js";
import { API, STORAGE } from "../config.js";

const NAV = [
  { path: "/supervisor",           label: "Dashboard",  icon: "dashboard" },
  { path: "/supervisor/approvals", label: "Approvals",  icon: "inbox" },
  { path: "/supervisor/interns",   label: "Interns",    icon: "users" },
  { path: "/supervisor/reports",   label: "Reports",    icon: "chart" },
  { path: "/supervisor/profile",   label: "My Profile", icon: "user" },
];

/* Pages that hold several tabs (same as the admin and coordinator). The open tab is in the address,
   e.g. /supervisor/reports?tab=dtr. The first tab is the default. */
const GROUPS = {
  "/supervisor/interns": {
    title: "Interns",
    live: true,
    tabs: [
      { key: "monitor", label: "Monitor Interns",    icon: "users", sub: "Real-time status of your interns." },
      { key: "records", label: "Attendance Records", icon: "list",  sub: "Complete attendance log of your interns." },
      { key: "evaluation", label: "Evaluation", icon: "pencil", sub: "Evaluate your interns in MYTRACK, or upload the signed paper evaluation form." },
    ],
  },
  "/supervisor/reports": {
    title: "Reports",
    tabs: [
      { key: "dtr",     label: "Generate DTR",        icon: "file",  sub: "View, print and certify your interns' Daily Time Records." },
    ],
  },
};

// The old addresses still work (bookmarks, links): they open the matching tab.
const OLD_PATHS = {
  "/supervisor/records": "/supervisor/interns?tab=records",
  "/supervisor/dtr":     "/supervisor/reports?tab=dtr",
};

export default function SupervisorDashboard() {
  const user = JSON.parse(sessionStorage.getItem("user") || "{}");
  const { pathname: path, search, state } = useLocation();
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [interns, setInterns] = useState([]);
  const [overtime, setOvertime] = useState([]);        // my interns' overtime
  const [corrections, setCorrections] = useState([]);  // my interns' forgotten time-outs
  const [online, setOnline] = useState([]);            // my interns' online workdays
  const [wfhReqs, setWfhReqs] = useState([]);          // my interns' work arrangement requests
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
    return liveRefresh(fetchAll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAll = async () => {
    try {
      const [r, u, ot, tc, on, wm] = await Promise.all([
        fetch(`${API}/admin/all-attendance`).then((r) => r.json()),
        fetch(`${API}/admin/users`).then((r) => r.json()),
        fetch(`${API}/supervisor/overtime`).then((r) => r.json()).catch(() => []),
        fetch(`${API}/supervisor/time-corrections`).then((r) => r.json()).catch(() => []),
        fetch(`${API}/supervisor/online`).then((r) => r.json()).catch(() => []),
        fetch(`${API}/supervisor/work-mode-requests`).then((r) => r.json()).catch(() => []),
      ]);
      if (Array.isArray(r)) setRecords([...r]);
      if (Array.isArray(u)) setInterns(u.filter((x) => x.role === "intern"));
      if (Array.isArray(ot)) setOvertime(ot);
      if (Array.isArray(tc)) setCorrections(tc);
      if (Array.isArray(on)) setOnline(on);
      if (Array.isArray(wm)) setWfhReqs(wm);
    } catch (err) {
      console.error("Poll error:", err);
    } finally {
      setLoading(false);
    }
  };

  // old address -> the new page + tab (keeps the "View all records" search, if any)
  useEffect(() => {
    if (OLD_PATHS[path]) navigate(OLD_PATHS[path], { replace: true, state });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // which tab is open on a grouped page
  const group = GROUPS[path];
  const asked = new URLSearchParams(search).get("tab");
  const tab = group ? (group.tabs.find((t) => t.key === asked) || group.tabs[0]) : null;
  const pickTab = (key) => navigate(`${path}?tab=${key}`, { replace: true });

  // what is waiting for me (shown on the dashboard and as a count on Approvals in the sidebar)
  const counts = {
    online: online.filter((o) => o.status === "pending").length,
    overtime: overtime.filter((o) => o.ot_status === "pending").length,
    fix: corrections.filter(fixIsMine).length,
    wfh: wfhReqs.filter((w) => w.status === "pending").length,
  };

  return (
    <Shell navItems={navWithTabs(NAV, GROUPS, { "/supervisor/approvals": [{ key: "online", label: "Online Attendance" }, { key: "overtime", label: "Overtime" }, { key: "fix", label: "Time Corrections" }, { key: "wfh", label: "Work Arrangement" }] }, { "/supervisor/approvals": counts })} user={user}>
      {/* same order as the admin dashboard so every page looks identical */}
      <style>{adminCss}</style>
      <style>{internCss}</style>
      <style>{formalLayout}</style>
      <style>{mdCss}</style>
      <style>{cardUnify}</style>
      <style>{adminMatch}</style>
      <style>{svCss}</style>
      {path === "/supervisor" && (
        <Home
          user={user} records={records} interns={interns} loading={loading} go={navigate}
          counts={counts}
        />
      )}
      {path === "/supervisor/approvals" && (
        <Approvals overtime={overtime} corrections={corrections} online={online} wfhReqs={wfhReqs} onRefresh={fetchAll} />
      )}
      {group && (
        <GroupPage group={group} tab={tab} onPick={pickTab}>
          {/* Interns */}
          {tab.key === "monitor" && (
            <InternMonitor
              interns={interns} records={records} loading={loading} onRefresh={fetchAll}
              recordsPath="/supervisor/interns?tab=records"
            />
          )}
          {tab.key === "records" && <Records records={records} loading={loading} />}
          {tab.key === "evaluation" && <Evaluations interns={interns} user={user} />}
          {/* Reports */}
          {tab.key === "dtr" && <DTR interns={interns} records={records} canCertify />}
        </GroupPage>
      )}
      {path === "/supervisor/profile" && <AdminProfile user={user} />}
    </Shell>
  );
}

/* ───────────────────────── Home ───────────────────────── */
function Home({ user, records, interns, loading, go, counts = {} }) {
  const today = todayManila();
  const todayRecs = records.filter((r) => r.date === today);
  const inNowAll = todayRecs.filter((r) => r.uid !== "ONLINE" && r.action === "CHECK_IN" && !r.checked_out_at);
  // one entry per person, in case someone has more than one open check-in
  const inNow = inNowAll.filter((r, i, a) => a.findIndex((x) => (x.user_id ?? x.name) === (r.user_id ?? r.name)) === i);
  const checkedIn = inNow.length;
  const seenToday = new Set(todayRecs.map((r) => r.user_id ?? r.name)).size;
  const first = user.name?.split(" ")[0] || "there";
  const dateLabel = new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" });

  const review = [
    { key: "online", icon: "inbox", tone: "blue", title: "Online attendance", sub: "Confirm remote workdays", n: counts.online || 0 },
    { key: "overtime", icon: "clock", tone: "amber", title: "Overtime", sub: "Time after 5:00 PM", n: counts.overtime || 0 },
    { key: "fix", icon: "pencil", tone: "purple", title: "Time corrections", sub: "Forgot to time in or out, or a missed day", n: counts.fix || 0 },
    { key: "wfh", icon: "globe", tone: "green", title: "Work arrangement", sub: "Onsite / work from home", n: counts.wfh || 0 },
  ];
  const toReview = review.reduce((s, r) => s + r.n, 0);

  return (
    <DashLayout
      title={`${greeting()}, ${first}`}
      sub={dateLabel}
      status={{ text: checkedIn > 0 ? `${checkedIn} on the clock now` : "Nobody timed in yet", tone: checkedIn > 0 ? "live" : "" }}
      actions={[
        { icon: "users", label: "Monitor", run: () => go("/supervisor/interns") },
        { icon: "file", label: "DTR", run: () => go("/supervisor/reports?tab=dtr") },
        { icon: "inbox", label: toReview > 0 ? `Approvals · ${toReview}` : "Approvals", run: () => go("/supervisor/approvals"), primary: true },
      ]}
      strip={[
        { icon: "users", tone: "t-orange", label: "Total interns", value: interns.length, sub: "under monitoring" },
        { icon: "tap", tone: "t-green", label: "Present now", value: checkedIn, sub: `of ${interns.length} interns` },
        { icon: "inbox", tone: "t-amber", label: "To review", value: toReview, sub: "requests waiting", onClick: () => go("/supervisor/approvals") },
        { icon: "clock", tone: "t-blue", label: "Not in yet", value: Math.max(interns.length - seenToday, 0), sub: "interns today" },
      ]}
      left={(
        <>
        <Panel title="Needs your review" count={toReview} link="Open approvals" onLink={() => go("/supervisor/approvals")}>
          {review.map((r) => (
            <DashRow key={r.key} icon={r.icon} tone={r.tone} title={r.title} sub={r.sub}
              tag={r.n > 0 ? String(r.n) : "None"} tagTone={r.n > 0 ? "orange" : ""} onClick={() => go(`/supervisor/approvals?tab=${r.key}`)} />
          ))}
        </Panel>
        {/* interns who need a follow-up */}
        <NeedsAttention interns={interns} records={records} monitorPath="/supervisor/interns" />
        </>
      )}
      right={<><HomeCalendar /><AnnouncementBoard limit={3} /></>}
    >
      <Panel title="Today's attendance" count={seenToday} link="Monitor" onLink={() => go("/supervisor/interns")} grow>
        {loading ? <Spinner /> : <TodayPeople records={todayRecs} limit={10} />}
      </Panel>
    </DashLayout>
  );
}

/* ───────────────────────── Approvals ─────────────────────────
   The supervisor sees the intern work.
   - Online workdays and overtime: approve = sent to the OJT coordinator for the final decision. Reject = final.
   - Time corrections and work arrangement: the supervisor's decision is final (approve = applied right away). */
const clock = (v) => (v ? new Date(v).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }) : "—");
const day = (v) => String(v || "").slice(0, 10);
const STATUS = {
  pending: ["Waiting for you", "pending"],
  endorsed: ["Sent to coordinator", "online"],
  approved: ["Approved", "approved"],
  rejected: ["Rejected", "rejected"],
};
// a time correction still open for the supervisor ("endorsed" = left over from the old two-step flow)
const fixIsMine = (c) => c.status === "pending" || c.status === "endorsed";
const modeLabel = (m) => (m === "offsite" ? "Work from home" : "Onsite");
const statusBadge = (st) => <Badge label={(STATUS[st] || [st])[0]} type={(STATUS[st] || [null, "none"])[1]} />;

function Approvals({ overtime, corrections, online = [], wfhReqs = [], onRefresh }) {
  // a notification can open a specific tab: /supervisor/approvals?tab=fix
  const { search: qs } = useLocation();
  const asked = new URLSearchParams(qs).get("tab");
  const [tab, setTab] = useState(["online", "overtime", "fix", "wfh"].includes(asked) ? asked : "online");
  useEffect(() => { if (["online", "overtime", "fix", "wfh"].includes(asked)) setTab(asked); }, [asked]);
  const [minutes, setMinutes] = useState({});
  const [remarks, setRemarks] = useState({});
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  const otPending = overtime.filter((o) => o.ot_status === "pending");
  const fixPending = corrections.filter(fixIsMine);
  const wfhPending = wfhReqs.filter((w) => w.status === "pending");
  const onPending = online.filter((o) => o.status === "pending");
  const reviewOnline = (o, status) =>
    send(`/supervisor/online/${o.id}/review`, { status, remarks: remarks["n" + o.id] || "" }, "n" + o.id + status);

  const send = async (url, body, key) => {
    setBusy(key); setMsg(null);
    try {
      const res = await fetch(`${API}${url}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Something went wrong.");
      setMsg({ type: "success", text: data.message });
      onRefresh();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    } finally {
      setBusy(null);
    }
  };

  const reviewOt = (o, status) => {
    const m = minutes[o.id] === undefined || minutes[o.id] === "" ? o.ot_minutes : Number(minutes[o.id]);
    if (status === "approved" && (!m || m < 1 || m > o.ot_minutes)) {
      setMsg({ type: "error", text: `Approve between 1 and ${o.ot_minutes} minutes.` });
      return;
    }
    send(`/supervisor/overtime/${o.id}/review`, { status, minutes: status === "approved" ? m : null, remarks: remarks["o" + o.id] || "" }, "o" + o.id + status);
  };
  const reviewFix = (c, status) =>
    send(`/supervisor/time-corrections/${c.id}/review`, { status, remarks: remarks["c" + c.id] || "" }, "c" + c.id + status);
  const reviewWfh = (w, status) =>
    send(`/supervisor/work-mode-requests/${w.id}/review`, { status, remarks: remarks["w" + w.id] || "" }, "w" + w.id + status);
  // the HTE letter (or why there is none)
  const proof = (w) => w.file_path
    ? <a className="ix-link sv-file" href={`${STORAGE}${w.file_path}`} target="_blank" rel="noopener noreferrer"><Icon name="clip" size={13} /> {w.original_name || "HTE letter"}</a>
    : w.in_moa ? <span className="sv-note">WFH is stated in the MOA / Student Contract</span>
    : <span className="sv-note muted">No letter (going back onsite)</span>;

  const remarkInput = (key) => (
    <input type="text" className="ix-input" placeholder="Remarks (optional)"
      value={remarks[key] || ""} onChange={(e) => setRemarks((r) => ({ ...r, [key]: e.target.value }))} />
  );
  const buttons = (onReject, onApprove, key) => (
    <>
      <button className="ix-b danger" onClick={onReject} disabled={!!busy}>{busy === key + "rejected" ? "..." : "Reject"}</button>
      <button className="ix-b ok" onClick={onApprove} disabled={!!busy}>{busy === key + "approved" ? "..." : "Approve"}</button>
    </>
  );
  const allGood = (text) => (
    <div className="ix-card ix-allgood">
      <div className="ix-empty-icon"><Icon name="check" size={30} /></div>
      <div className="ix-empty-title" style={{ fontSize: 17 }}>All caught up!</div>
      <div className="ix-empty-sub">{text}</div>
    </div>
  );

  return (
    <>
      <style>{grpCss}</style>
      {/* same tabs as the coordinator's Approvals page, inside the page header */}
      <PageHeader title="Approvals" sub="Online days and overtime go on to the OJT coordinator. Time corrections and work arrangement are your final decision." live tabs={(
      <div className="grp-tabs" role="tablist" aria-label="Approvals">
        {[
          { key: "online", label: "Online Attendance", icon: "inbox", n: onPending.length },
          { key: "overtime", label: "Overtime", icon: "clock", n: otPending.length },
          { key: "fix", label: "Time Corrections", icon: "pencil", n: fixPending.length },
          { key: "wfh", label: "Work Arrangement", icon: "globe", n: wfhPending.length },
        ].map((t) => (
          <button
            key={t.key} type="button" role="tab" aria-selected={tab === t.key}
            className={tab === t.key ? "grp-tab active" : "grp-tab"}
            onClick={() => setTab(t.key)}
          >
            <Icon name={t.icon} size={16} />
            <span>{t.label}</span>
            {t.n > 0 && <span className="grp-tab-n">{t.n > 99 ? "99+" : t.n}</span>}
          </button>
        ))}
      </div>
      )} />
      <Msg msg={msg} />

      {tab === "online" ? (
        <>
          {onPending.length === 0 ? allGood("No online workdays waiting for you.") : (
            <Inbox
              items={onPending}
              row={(o) => ({ name: o.intern_name, photo: o.intern_photo, sub: String(o.description || "").slice(0, 60), tag: <Badge label={day(o.date)} type="pending" />, meta: "Worked from home" })}
              detail={(o) => (
                <>
                  <div className="ibx-head"><Avatar name={o.intern_name} photo={o.intern_photo} size={48} />
                    <div><b>{o.intern_name}</b><small>{day(o.date)} · worked from home</small></div></div>
                  <div className="ibx-sec"><span>Tasks done</span><p>{o.description}</p></div>
                  <div className="ibx-act">{remarkInput("n" + o.id)}{buttons(() => reviewOnline(o, "rejected"), () => reviewOnline(o, "approved"), "n" + o.id)}</div>
                </>
              )}
            />
          )}
          <Section icon="inbox" title="Reviewed online workdays" count={online.length - onPending.length}>
            <Table
              headers={["Intern", "Date", "Tasks", "Status"]}
              rows={online.filter((o) => o.status !== "pending").map((o) => [
                <strong>{o.intern_name}</strong>,
                day(o.date),
                <span className="sv-reason" title={o.description}>{o.description}</span>,
                statusBadge(o.status),
              ])}
              empty="Nothing reviewed yet."
            />
          </Section>
        </>
      ) : tab === "overtime" ? (
        <>
          {otPending.length === 0 ? allGood("No overtime waiting for you.") : (
            <Inbox
              items={otPending}
              row={(o) => ({ name: o.intern_name, photo: o.intern_photo, sub: `${day(o.date)} · out ${clock(o.checked_out_at)}`, tag: <Badge label={fmtMinutes(o.ot_minutes)} type="pending" />, meta: "after 5:00 PM" })}
              detail={(o) => (
                <>
                  <div className="ibx-head"><Avatar name={o.intern_name} photo={o.intern_photo} size={48} />
                    <div><b>{o.intern_name}</b><small>{day(o.date)}</small></div></div>
                  <div className="ibx-kv ibx-sec">
                    <div><small>Time in</small><b>{clock(o.checked_in_at)}</b></div>
                    <div><small>Time out</small><b>{clock(o.checked_out_at)}</b></div>
                    <div><small>After 5:00 PM</small><b>{fmtMinutes(o.ot_minutes)}</b></div>
                  </div>
                  <div className="ibx-act">
                    <input type="number" className="ix-input ot-min" min={1} max={o.ot_minutes} placeholder={`${o.ot_minutes} min`}
                      aria-label="Minutes to approve" value={minutes[o.id] ?? ""}
                      onChange={(e) => setMinutes((m) => ({ ...m, [o.id]: e.target.value }))} />
                    {remarkInput("o" + o.id)}
                    {buttons(() => reviewOt(o, "rejected"), () => reviewOt(o, "approved"), "o" + o.id)}
                  </div>
                </>
              )}
            />
          )}
          <Section icon="clock" title="Reviewed overtime" count={overtime.length - otPending.length}>
            <Table
              headers={["Intern", "Date", "Overtime", "You approved", "Status", "Final credit"]}
              rows={overtime.filter((o) => o.ot_status !== "pending").map((o) => [
                <strong>{o.intern_name}</strong>,
                day(o.date),
                fmtMinutes(o.ot_minutes),
                o.ot_endorsed_minutes ? fmtMinutes(o.ot_endorsed_minutes) : "—",
                statusBadge(o.ot_status),
                o.ot_status === "approved" ? fmtMinutes(o.ot_approved_minutes) : "—",
              ])}
              empty="Nothing reviewed yet."
            />
          </Section>
        </>
      ) : tab === "fix" ? (
        <>
          {fixPending.length === 0 ? allGood("No time corrections waiting for you.") : (
            <Inbox
              items={fixPending}
              row={(c) => ({ name: c.intern_name, photo: c.intern_photo, sub: String(c.reason || "").slice(0, 60), tag: <Badge label={day(c.date)} type="pending" />, meta: c.kind === "day" ? `missed whole day · ${clock(c.requested_in)}–${clock(c.requested_out)}` : c.kind === "in" ? `forgot to time in · asks ${clock(c.requested_in)}` : `forgot to time out · asks ${clock(c.requested_out)}` })}
              detail={(c) => (
                <>
                  <div className="ibx-head"><Avatar name={c.intern_name} photo={c.intern_photo} size={48} />
                    <div><b>{c.intern_name}</b><small>{day(c.date)}</small></div></div>
                  {c.kind === "day" ? (
                    <div className="ibx-kv ibx-sec">
                      <div><small>Missed</small><b>The whole day</b></div>
                      <div><small>Recorded taps</small><b>None</b></div>
                      <div><small>Asks time in</small><b>{clock(c.requested_in)}</b></div>
                      <div><small>Asks time out</small><b>{clock(c.requested_out)}</b></div>
                    </div>
                  ) : c.kind === "in" ? (
                    <div className="ibx-kv ibx-sec">
                      <div><small>Forgot to</small><b>Time in</b></div>
                      <div><small>Recorded tap</small><b>{clock(c.checked_in_at)}</b></div>
                      <div><small>Asks time in</small><b>{clock(c.requested_in)}</b></div>
                      <div><small>Time out</small><b>{clock(c.requested_out)}</b></div>
                    </div>
                  ) : (
                    <div className="ibx-kv ibx-sec">
                      <div><small>Forgot to</small><b>Time out</b></div>
                      <div><small>Time in</small><b>{clock(c.checked_in_at)}</b></div>
                      <div><small>Asks time out</small><b>{clock(c.requested_out)}</b></div>
                    </div>
                  )}
                  <div className="ibx-sec"><span>Reason</span><p>{c.reason}</p></div>
                  <div className="ibx-act">{remarkInput("c" + c.id)}{buttons(() => reviewFix(c, "rejected"), () => reviewFix(c, "approved"), "c" + c.id)}</div>
                </>
              )}
            />
          )}
          <Section icon="pencil" title="Reviewed time corrections" count={corrections.length - fixPending.length}>
            <Table
              headers={["Intern", "Date", "Requested", "Reason", "Status"]}
              rows={corrections.filter((c) => !fixIsMine(c)).map((c) => [
                <strong>{c.intern_name}</strong>,
                day(c.date),
                c.kind === "in" || c.kind === "day" ? `${c.kind === "day" ? "Whole day · " : ""}In ${clock(c.requested_in)} · Out ${clock(c.requested_out)}` : `Out ${clock(c.requested_out)}`,
                <span className="sv-reason" title={c.reason}>{c.reason}</span>,
                statusBadge(c.status),
              ])}
              empty="Nothing reviewed yet."
            />
          </Section>
        </>
      ) : (
        <>
          {wfhPending.length === 0 ? allGood("No work arrangement requests waiting for you.") : (
            <Inbox
              items={wfhPending}
              row={(w) => ({ name: w.intern_name, photo: w.intern_photo, sub: `${modeLabel(w.current_mode)} → ${modeLabel(w.requested_mode)}`, tag: <Badge label={modeLabel(w.requested_mode)} type="pending" />, meta: w.file_path ? "Letter attached" : "" })}
              detail={(w) => (
                <>
                  <div className="ibx-head"><Avatar name={w.intern_name} photo={w.intern_photo} size={48} />
                    <div><b>{w.intern_name}</b><small>{modeLabel(w.current_mode)} → {modeLabel(w.requested_mode)}</small></div></div>
                  <div className="ibx-sec"><span>Reason</span><p>{w.reason}</p></div>
                  <div className="ibx-sec"><span>Proof</span>{proof(w)}</div>
                  <div className="ibx-act">{remarkInput("w" + w.id)}{buttons(() => reviewWfh(w, "rejected"), () => reviewWfh(w, "approved"), "w" + w.id)}</div>
                </>
              )}
            />
          )}
          <Section icon="globe" title="Reviewed work arrangement requests" count={wfhReqs.length - wfhPending.length}>
            <Table
              headers={["Intern", "Request", "Reason", "Proof", "Status", "Remarks"]}
              rows={wfhReqs.filter((w) => w.status !== "pending").map((w) => [
                <strong>{w.intern_name}</strong>,
                modeLabel(w.requested_mode),
                <span className="sv-reason" title={w.reason}>{w.reason}</span>,
                proof(w),
                statusBadge(w.status),
                w.remarks || "—",
              ])}
              empty="Nothing reviewed yet."
            />
          </Section>
        </>
      )}
    </>
  );
}

const svCss = `
.sv-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 18px; }
/* space between the "All caught up!" card and the reviewed table under it */
.ix-content .ix-card.ix-allgood { margin-bottom: 18px !important; }
.ix-content .ix-allgood + .ix-section { margin-top: 0; }
.ix-content .ix-card.sv-card { display: grid; grid-template-columns: 260px minmax(0, 1fr) minmax(320px, 440px); align-items: center; gap: 14px; padding: 12px 16px; }
.sv-who { display: flex; align-items: center; gap: 10px; min-width: 0; }
.sv-who > div { display: flex; flex-direction: column; min-width: 0; }
.sv-who strong { font-size: 13.5px; }
.sv-who span { font-size: 12px; color: #64748b; }
.sv-what { font-size: 13px; color: #334155; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sv-actions { display: flex; align-items: center; gap: 8px; }
.sv-actions .ix-input { flex: 1; min-width: 0; padding: 7px 10px; font-size: 12.5px; }
.sv-actions .sv-min { flex: 0 0 92px; }
.sv-actions .ix-b { padding: 7px 12px; font-size: 12.5px; }
.sv-what-col { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.sv-file { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sv-note { font-size: 12px; font-weight: 600; color: #047857; }
.sv-note.muted { color: #94a3b8; font-weight: 500; }
.sv-reason { display: inline-block; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 1200px) { .ix-content .ix-card.sv-card { grid-template-columns: 1fr; } .sv-actions { flex-wrap: wrap; } }
`;