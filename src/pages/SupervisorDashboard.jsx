// SupervisorDashboard.jsx
// The HTE supervisor's workspace: sees only their own interns' attendance, confirms online workdays and
// overtime first (the OJT coordinator gives the final decision), decides time corrections and work
// arrangement requests (final — no coordinator step), and certifies DTRs.
import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Shell, {
  navWithTabs,
  Spinner, Badge, Table, Section, Avatar, Icon, PageHeader, Msg, Inbox, confirmBox,
  InternMonitor, AnnouncementBoard, OnlineReview, OvertimeBoard, OaHistory, OA_CSS, todayManila, fmtTime, greeting, liveRefresh, fmtMinutes, calcHours, requiredHoursFor,
} from "../components/DashKit.jsx";
import {
  Records, DTR, AdminProfile, adminCss, adminMatch, GroupPage, grpCss, HomeCalendar, Calendar,
} from "./AdminDashboard.jsx";
import { internCss, cardUnify } from "./InternDashboard.jsx";
import Evaluations from "../components/Evaluations.jsx";
import ReviewQueue from "../components/ReviewQueue.jsx";
import { OnlineQueue, OvertimeQueue, ExcusedQueue, ProjectQueue } from "../components/ApprovalQueues.jsx";   // the same Approvals layout as the coordinator
import { ProjectsBoard } from "../components/CoordinatorTools.jsx";
import SchoolEventReview, { schoolEventIsMine } from "./SchoolEventReview.jsx";
import { DashLayout, Panel, DashRow, DashEmpty, TodayPeople } from "../components/DashBoard.jsx";
import { formalLayout } from "../components/formalLayout.js";
import { mdCss } from "../components/materialTheme.js";
import { API } from "../config.js";
import { fileHref, openFile } from "../files.js";

const NAV = [
  { path: "/supervisor",           label: "Dashboard",  icon: "dashboard" },
  { path: "/supervisor/approvals", label: "Approvals",  icon: "inbox" },
  { path: "/supervisor/interns",   label: "Interns",    icon: "users" },
  { path: "/supervisor/reports",   label: "Generate DTR", icon: "file" },   // the supervisor's only report
  { path: "/supervisor/calendar",  label: "HTE Calendar", icon: "calendar" },
  { path: "/supervisor/profile",   label: "My Profile", icon: "user" },
];

/* Pages that hold several tabs (same as the admin and coordinator). The open tab is in the address,
   e.g. /supervisor/reports?tab=dtr. The first tab is the default. */
const GROUPS = {
  "/supervisor/interns": {
    title: "Interns",
    live: true,
    tabs: [
      { key: "monitor", label: "All Interns", icon: "users", sub: "Your interns and their real-time status. Click a name to open their full information." },
      { key: "records", label: "Attendance",  icon: "list",  sub: "Complete attendance log of your interns." },
      { key: "evaluation", label: "Appraisal", icon: "pencil", sub: "Rate your interns' attendance, performance and attitude. This is 60% of their internship grade." },
    ],
  },
  "/supervisor/reports": {
    title: "Generate DTR",
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
  const [events, setEvents] = useState([]);            // my interns' school-event (excused) requests
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
    return liveRefresh(fetchAll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAll = async () => {
    try {
      const [r, u, ot, tc, on, se] = await Promise.all([
        fetch(`${API}/admin/all-attendance`).then((r) => r.json()),
        fetch(`${API}/admin/users`).then((r) => r.json()),
        fetch(`${API}/supervisor/overtime`).then((r) => r.json()).catch(() => []),
        fetch(`${API}/supervisor/time-corrections`).then((r) => r.json()).catch(() => []),
        fetch(`${API}/supervisor/online`).then((r) => r.json()).catch(() => []),
        fetch(`${API}/supervisor/school-events`).then((r) => r.json()).catch(() => []),
      ]);
      if (Array.isArray(se)) setEvents(se);
      // the server already sends only the interns assigned to me
      if (Array.isArray(r)) setRecords([...r]);
      if (Array.isArray(u)) setInterns(u.filter((x) => x.role === "intern"));
      if (Array.isArray(ot)) setOvertime(ot);
      if (Array.isArray(tc)) setCorrections(tc);
      if (Array.isArray(on)) setOnline(on);
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
    projects: interns.filter((u) => u.modality === "project" && !u.project_marked_at && !u.project_confirmed_at).length,
    event: events.filter((e) => schoolEventIsMine(e, "supervisor")).length,
  };

  return (
    <Shell navItems={navWithTabs(NAV, GROUPS, { "/supervisor/approvals": [{ key: "online", label: "Online Attendance" }, { key: "overtime", label: "Overtime" }, { key: "fix", label: "Time Corrections" }, { key: "event", label: "Excused" }, { key: "projects", label: "Projects" } ] }, { "/supervisor/approvals": counts })} user={user}>
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
        <Approvals overtime={overtime} corrections={corrections} online={online} events={events} onRefresh={fetchAll} interns={interns} records={records} />
      )}
      {group && (
        <GroupPage group={group} tab={tab} onPick={pickTab}>
          {/* Interns */}
          {tab.key === "monitor" && (
            <InternMonitor
              interns={interns} records={records} loading={loading} onRefresh={fetchAll} hideHte hideArr
              recordsPath="/supervisor/interns?tab=records"
            />
          )}
          {tab.key === "records" && <Records records={records} loading={loading} interns={interns} />}
          {tab.key === "evaluation" && <Evaluations user={user} />}
          {/* Reports */}
          {tab.key === "dtr" && <DTR interns={interns} records={records} canCertify />}
        </GroupPage>
      )}
      {path === "/supervisor/calendar" && <Calendar mode="supervisor" />}
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
    { key: "event", icon: "calendar", tone: "green", title: "Excused absences", sub: "Sick days and school events", n: counts.event || 0 },
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
        {/* every intern (same rows as before: name, hours, %); many interns scroll inside the card */}
        <Panel title="My interns" count={interns.length} link="Monitor" onLink={() => go("/supervisor/interns")} grow className="sv-all">
          <style>{`.ix-page .ix-content .dbx-card.sv-all { display: flex; flex-direction: column; min-height: 0; }
            .ix-page .ix-content .dbx-card.sv-all > .sv-all-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; display: block; }
            .ix-page .ix-content .dbx-card.sv-all > .sv-all-list > * { flex: none; }`}</style>
          {interns.length === 0 ? <DashEmpty title="No interns assigned yet" /> : (
            <div className="sv-all-list">
              {[...interns].map((u) => {
                const h = Math.round(calcHours(records.filter((r) => r.user_id === u.id)) * 10) / 10;
                const req = requiredHoursFor(u.program, u.prior_hours);
                return { u, h, req, pct: Math.min(Math.round((h / req) * 100), 100) };
              }).sort((a, b) => String(a.u.name).localeCompare(String(b.u.name))).map(({ u, h, req, pct }) => (
                <DashRow key={u.id} avatar={{ name: u.name, photo: u.photo }} title={u.name} sub={`${h}h of ${req}h`}
                  tag={`${pct}%`} tagTone={pct >= 100 ? "green" : pct >= 50 ? "blue" : ""} onClick={() => go("/supervisor/interns", { state: { search: u.name } })} />
              ))}
            </div>
          )}
        </Panel>
        </>
      )}
      right={<>
        <HomeCalendar />
        <Panel title="Needs your review" count={toReview} link="Open" onLink={() => go("/supervisor/approvals")}>
          <div className="dbx-fill">
            {review.map((r) => (
              <DashRow key={r.key} icon={r.icon} tone={r.tone} title={r.title} sub={r.sub}
                tag={r.n > 0 ? String(r.n) : "None"} tagTone={r.n > 0 ? "orange" : ""} onClick={() => go(`/supervisor/approvals?tab=${r.key}`)} />
            ))}
          </div>
        </Panel>
      </>}
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
const statusBadge = (st) => <Badge label={(STATUS[st] || [st])[0]} type={(STATUS[st] || [null, "none"])[1]} />;

function Approvals({ overtime, corrections, online = [], events = [], onRefresh, interns = [], records = [] }) {
  // a notification can open a specific tab: /supervisor/approvals?tab=fix
  const { search: qs } = useLocation();
  const asked = new URLSearchParams(qs).get("tab");
  const TABS = ["online", "overtime", "fix", "event", "projects"];
  const [tab, setTab] = useState(TABS.includes(asked) ? asked : "online");
  useEffect(() => { if (TABS.includes(asked)) setTab(asked); }, [asked]);
  const [remarks, setRemarks] = useState({});
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  const otPending = overtime.filter((o) => o.ot_status === "pending");
  const fixPending = corrections.filter(fixIsMine);
  const onPending = online.filter((o) => o.status === "pending");

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
      return true;
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const reviewOt = (o, status, m, rm) => {
    if (status === "approved" && (!m || m < 1 || m > o.ot_minutes)) {
      setMsg({ type: "error", text: `Approve between 1 and ${o.ot_minutes} minutes.` });
      return Promise.resolve(false);
    }
    return send(`/supervisor/overtime/${o.id}/review`, { status, minutes: status === "approved" ? m : null, remarks: rm || "" }, "o" + o.id + status);
  };
  const reviewFix = (c, status) =>
    send(`/supervisor/time-corrections/${c.id}/review`, { status, remarks: remarks["c" + c.id] || "" }, "c" + c.id + status);
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
      <PageHeader title="Approvals" sub="Online days and overtime go on to the OJT coordinator. Time corrections are your final decision." live tabs={(
      <div className="grp-tabs" role="tablist" aria-label="Approvals">
        {[
          { key: "online", label: "Online Attendance", icon: "inbox", n: onPending.length },
          { key: "overtime", label: "Overtime", icon: "clock", n: otPending.length },
          { key: "fix", label: "Time Corrections", icon: "pencil", n: fixPending.length },
          { key: "event", label: "Excused", icon: "calendar", n: events.filter((e) => schoolEventIsMine(e, "supervisor")).length },
          ...(interns.some((u) => u.modality === "project")
            ? [{ key: "projects", label: "Projects", icon: "briefcase", n: interns.filter((u) => u.modality === "project" && !u.project_marked_at).length }] : []),
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

      {/* the same layout as the coordinator's Approvals: tabs · a table · the review drawer */}
      {tab === "online" ? (
        <OnlineQueue role="supervisor" mine={onPending} withSup={online.filter((o) => o.status === "endorsed")}
          done={online.filter((o) => o.status === "approved" || o.status === "rejected")}
          onReview={(o, status, rm) => send(`/supervisor/online/${o.id}/review`, { status, remarks: rm || "" }, "n" + o.id + status)} />
      ) : tab === "overtime" ? (
        <OvertimeQueue role="supervisor" mine={otPending} withSup={overtime.filter((o) => o.ot_status === "endorsed")}
          done={overtime.filter((o) => o.ot_status === "approved" || o.ot_status === "rejected")} all={overtime}
          capOf={(o) => o.ot_minutes} onReview={reviewOt} />
      ) : tab === "event" ? (
        <ExcusedQueue role="supervisor" />
      ) : tab === "projects" ? (
        <ProjectQueue role="supervisor" interns={interns} records={records} onRefresh={onRefresh} />
      ) : (
        <FixQueue waiting={fixPending} reviewed={corrections.filter((c) => !fixIsMine(c))}
          onReview={(c, status, rm) => send(`/supervisor/time-corrections/${c.id}/review`, { status, remarks: rm || "" }, "c" + c.id + status)} />
      )}
    </>
  );
}

/* Time corrections: waiting / reviewed list on the left, the picked request on the right with what
   was recorded next to what the intern asks for. The supervisor's decision is final. */
const fxDay = (v, long) => {
  const d = new Date(String(v).slice(0, 10) + "T00:00:00+08:00");
  return isNaN(d) ? String(v).slice(0, 10) : d.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", ...(long ? { year: "numeric" } : {}), timeZone: "Asia/Manila" });
};
const fxWhen = (v) => {
  if (!v) return "—";
  const s = String(v);
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? "" : "+08:00"));
  return isNaN(d) ? "—" : d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
};
// a "2026-10-21 17:00:00" or "17:00:00" request time -> minutes of the day
const fxMin = (v) => {
  if (!v) return null;
  const s = String(v);
  if (s.includes("T") || /[+-]\d\d:?\d\d$/.test(s)) {
    const d = new Date(s);
    if (isNaN(d)) return null;
    const [h, m] = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Manila" }).split(":").map(Number);
    return h * 60 + m;
  }
  const m = s.match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const fxClock = (v) => {
  const m = fxMin(v);
  if (m == null) return "—";
  const h = Math.floor(m / 60), mm = m % 60;
  return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const FX_KIND = { out: "Forgot to time out", in: "Forgot to time in", day: "Missed the whole day" };

/* Time corrections in the same layout as the other Approvals tabs (ReviewQueue): a table, then a drawer with
   what was recorded next to what the intern asks for. The supervisor's decision is final. */
function FixQueue({ waiting = [], reviewed = [], onReview }) {
  const [remarks, setRemarks] = useState({});
  const [busy, setBusy] = useState(null);
  const kind = (c) => (c.kind === "in" || c.kind === "day" ? c.kind : "out");
  const decide = async (c, status, note) => {
    setBusy(c.id + status);
    const ok = await onReview(c, status, note ?? remarks[c.id] ?? "");
    setBusy(null);
    return ok;
  };
  const pairs = (c) => {
    const k = kind(c);
    if (k === "day") return { rec: ["No tap", "No tap"], ask: [fxClock(c.requested_in), fxClock(c.requested_out)], hl: [true, true] };
    if (k === "in") return { rec: ["No tap", fxClock(c.checked_in_at)], ask: [fxClock(c.requested_in), fxClock(c.requested_out || c.checked_in_at)], hl: [true, false] };
    return { rec: [fxClock(c.checked_in_at), "No tap"], ask: [fxClock(c.checked_in_at), fxClock(c.requested_out)], hl: [false, true] };
  };
  const span = (c) => {
    const k = kind(c);
    const a = fxMin(k === "out" ? c.checked_in_at : c.requested_in);
    const b = fxMin(k === "in" ? (c.requested_out || c.checked_in_at) : c.requested_out);
    if (a == null || b == null || b <= a) return "—";
    const m = b - a;
    return `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`;
  };
  const badge = (c) => c.status === "approved" ? <Badge label="Approved" type="approved" />
    : c.status === "rejected" ? <Badge label="Rejected" type="rejected" /> : <Badge label="Waiting for you" type="pending" />;
  const mine = (c) => waiting.some((x) => x.id === c.id);

  return (
    <ReviewQueue
      tabs={[
        { key: "mine", label: "Needs my review", items: waiting, hot: true, empty: ["All caught up", "No time corrections waiting for you."] },
        { key: "done", label: "Done", items: reviewed, empty: ["Nothing reviewed yet", "Corrections you approve or reject show here."] },
      ]}
      rowKey={(c) => c.id}
      searchText={(c) => `${c.intern_name} ${c.reason || ""}`}
      columns={[
        { label: "Intern", render: (c) => <span className="rq2-who"><Avatar name={c.intern_name} photo={c.intern_photo} size={32} /><span><b>{c.intern_name}</b></span></span> },
        { label: "Day", render: (c) => <span className="rq2-muted">{fxDay(c.date)}</span> },
        { label: "What happened", render: (c) => <span className="rq2-main">{FX_KIND[kind(c)]}</span> },
        { label: "Asks for", render: (c) => { const p = pairs(c); return <span className="rq2-muted">{p.ask[0]} – {p.ask[1]}</span>; } },
        { label: "Status", render: badge },
      ]}
      bulk={(t) => (t !== "mine" ? null : (picked, clear) => <FixBulk picked={picked} clear={clear} run={(c, status) => decide(c, status, "")} />)}
      drawer={(c) => {
        const p = pairs(c);
        return {
          icon: "pencil", kicker: `${c.intern_name} · ${FX_KIND[kind(c)]}`, title: fxDay(c.date, true), actions: badge(c),
          body: (
            <>
              <style>{FX_CSS}</style>
              <div className="fx-cmp">
                <div className="fx-side">
                  <span className="fx-lbl">Recorded</span>
                  <div className="fx-pair"><div><small>Time in</small><b className={p.rec[0] === "No tap" ? "none" : ""}>{p.rec[0]}</b></div>
                    <div><small>Time out</small><b className={p.rec[1] === "No tap" ? "none" : ""}>{p.rec[1]}</b></div></div>
                </div>
                <div className="fx-side ask">
                  <span className="fx-lbl">Asks for</span>
                  <div className="fx-pair"><div><small>Time in</small><b className={p.hl[0] ? "new" : ""}>{p.ask[0]}</b></div>
                    <div><small>Time out</small><b className={p.hl[1] ? "new" : ""}>{p.ask[1]}</b></div></div>
                </div>
              </div>
              <div className="aq-facts-lite"><span><small>Time between</small> <b>{span(c)}</b></span><span><small>{mine(c) ? "Sent" : "Reviewed"}</small> <b>{fxWhen(mine(c) ? c.created_at : (c.reviewed_at || c.updated_at))}</b></span></div>
              <div className="oa-tasks"><span>Reason</span><p>{c.reason || "—"}</p></div>
              {c.proof_path && (
                <div className="oa-tasks"><span>Proof</span><p><a className="ix-link" href={fileHref(c.proof_path)} onClick={(e) => openFile(c.proof_path, e)} target="_blank" rel="noopener noreferrer">
                  <Icon name="file" size={13} /> {c.proof_name || "View proof"}</a></p></div>
              )}
              <p className="fx-final">Your decision is final: an approved correction is applied to the intern's attendance right away.</p>
            </>
          ),
          footer: mine(c)
            ? <>
                <input type="text" className="ix-input" maxLength={300} placeholder="Remarks (optional)" aria-label="Remarks" value={remarks[c.id] || ""}
                  onChange={(e) => setRemarks((r) => ({ ...r, [c.id]: e.target.value }))} />
                <button type="button" className="ix-b danger" disabled={!!busy} onClick={() => decide(c, "rejected")}>{busy === c.id + "rejected" ? "..." : "Reject"}</button>
                <button type="button" className="ix-b ok" disabled={!!busy} onClick={() => decide(c, "approved")}>{busy === c.id + "approved" ? "..." : "Approve"}</button>
              </>
            : <span className={`rq2-result ${c.status === "approved" ? "ok" : "bad"}`}><Icon name={c.status === "approved" ? "check" : "x"} size={14} />
                <span>{c.status === "approved" ? "Approved. The attendance was corrected." : "Rejected."}{c.remarks ? <> · <em>{c.remarks}</em></> : null}</span></span>,
        };
      }}
    />
  );
}

// ticked time corrections: approve or reject them all at once (one after another; stops at the first one that fails)
function FixBulk({ picked, clear, run }) {
  const [busy, setBusy] = useState(null);
  const go = async (status) => {
    const n = picked.length, what = `${n} time correction${n === 1 ? "" : "s"}`;
    const ok = await confirmBox(status === "approved"
      ? { title: `Approve ${what}?`, message: "Each approved correction is applied to the intern's attendance right away.", ok: "Approve" }
      : { title: `Reject ${what}?`, message: "The interns are told their requests were rejected. To give a reason, reject them one by one instead.", ok: "Reject", danger: true });
    if (!ok) return;
    setBusy(status);
    for (const c of picked) { if ((await run(c, status)) === false) break; }
    setBusy(null); clear();
  };
  return (
    <>
      <button type="button" className="ix-b danger sm" disabled={!!busy} onClick={() => go("rejected")}>{busy === "rejected" ? "Rejecting…" : "Reject selected"}</button>
      <button type="button" className="ix-b ok sm" disabled={!!busy} onClick={() => go("approved")}>{busy === "approved" ? "Approving…" : "Approve selected"}</button>
    </>
  );
}

const FX_CSS = `
.fx-cmp { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: stretch; flex: none; }
/* the time-correction drawer (Approvals → Time Corrections) */
.aq-facts-lite { flex: none; display: flex; flex-wrap: wrap; gap: 6px 22px; padding: 10px 14px; border: 1px solid #eef0f4; border-radius: 12px; background: #fafbfc; font-size: 13.5px; }
.aq-facts-lite small { font-size: 12px; color: #64748b; } .aq-facts-lite b { color: #0f172a; font-weight: 600; }
.fx-final { margin: 0; font-size: 12.5px; color: #6b7280; }
.ix-drawer .oa-tasks { max-height: none; }
.fx-side { border: 1px solid #eef0f4; background: #fafbfc; border-radius: 12px; padding: 9px 12px; display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.fx-side.ask { border-color: #bbe5c8; background: #f3fbf6; }
.fx-lbl { font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #94a3b8; }
.fx-side.ask .fx-lbl { color: #15803d; }
.fx-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.fx-pair svg { display: none; }
.fx-pair > div { display: flex; flex-direction: column; gap: 3px; line-height: 1.2; min-width: 0; }
.fx-pair small { font-size: 11.5px; color: #64748b; }
.fx-pair b { font-size: 15px; color: #0f172a; white-space: nowrap; }
.fx-pair b.none { color: #b91c1c; font-weight: 600; font-size: 13.5px; }
.fx-pair b.new { color: #15803d; }
.fx-arrow { align-self: center; font-size: 20px; color: #94a3b8; }
.fx-kv { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 12px !important; }
.fx-steps { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; gap: 12px !important; padding: 2px 0 !important; }
@media (max-width: 760px) {
  .fx-cmp { grid-template-columns: 1fr; }
  .fx-kv { grid-template-columns: 1fr 1fr !important; }
}
`;

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