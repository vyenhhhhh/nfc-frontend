// SupervisorDashboard.jsx
// The HTE supervisor's workspace: sees only their own interns' attendance, confirms online workdays and
// overtime first (the OJT coordinator gives the final decision), decides time corrections and work
// arrangement requests (final — no coordinator step), and certifies DTRs.
import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Shell, {
  navWithTabs,
  Spinner, Badge, Table, Section, Avatar, Icon, PageHeader, Msg, Inbox,
  InternMonitor, AnnouncementBoard, OnlineReview, OvertimeBoard, OaHistory, OA_CSS, todayManila, fmtTime, greeting, liveRefresh, fmtMinutes,
} from "../components/DashKit.jsx";
import {
  Records, DTR, AdminProfile, adminCss, adminMatch, GroupPage, grpCss, HomeCalendar, Calendar,
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
      { key: "monitor", label: "Monitor Interns",    icon: "users", sub: "Real-time status of your interns." },
      { key: "records", label: "Attendance Records", icon: "list",  sub: "Complete attendance log of your interns." },
      // Evaluation tab hidden for now (waiting for the OJT coordinator's answer on who submits the evaluation form):
      // { key: "evaluation", label: "Evaluation", icon: "pencil", sub: "Upload the signed paper evaluation form of each intern." },
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
  const [remarks, setRemarks] = useState({});
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  const otPending = overtime.filter((o) => o.ot_status === "pending");
  const fixPending = corrections.filter(fixIsMine);
  const wfhPending = wfhReqs.filter((w) => w.status === "pending");
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
        <OnlineReview role="supervisor" waiting={online.filter((o) => o.status === "pending")} reviewed={online.filter((o) => o.status !== "pending")}
          onReview={(o, status, rm) => send(`/supervisor/online/${o.id}/review`, { status, remarks: rm || "" }, "n" + o.id + status)} />
      ) : tab === "overtime" ? (
        <OvertimeBoard role="supervisor" waiting={otPending} reviewed={overtime.filter((o) => o.ot_status !== "pending")} all={overtime}
          capOf={(o) => o.ot_minutes} onReview={reviewOt} />
      ) : tab === "fix" ? (
        <FixBoard waiting={fixPending} reviewed={corrections.filter((c) => !fixIsMine(c))}
          onReview={(c, status, rm) => send(`/supervisor/time-corrections/${c.id}/review`, { status, remarks: rm || "" }, "c" + c.id + status)} />
      ) : (
        <WfhBoard waiting={wfhPending} reviewed={wfhReqs.filter((w) => w.status !== "pending")}
          onReview={(w, status, rm) => send(`/supervisor/work-mode-requests/${w.id}/review`, { status, remarks: rm || "" }, "w" + w.id + status)} />
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

function FixBoard({ waiting = [], reviewed = [], onReview }) {
  const [view, setView] = useState("waiting");
  const [sel, setSel] = useState(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [remarks, setRemarks] = useState({});
  const [busy, setBusy] = useState(null);
  const sq = q.trim().toLowerCase();
  const list = (view === "waiting" ? waiting : reviewed).filter((c) => !sq || String(c.intern_name || "").toLowerCase().includes(sq));
  const cur = list.find((c) => c.id === sel) || list[0] || null;
  const pick = (v) => { setView(v); setSel(null); setOpen(false); setQ(""); };
  const kind = (c) => (c.kind === "in" || c.kind === "day" ? c.kind : "out");
  const decide = async (c, status) => {
    setBusy(c.id + status);
    const ok = await onReview(c, status, remarks[c.id] || "");
    setBusy(null);
    if (ok) { setSel(null); setOpen(false); }
  };

  // recorded vs asked, as two "In → Out" pairs
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
  const badge = (c, long) => c.status === "approved" ? <Badge label="Approved" type="approved" />
    : c.status === "rejected" ? <Badge label="Rejected" type="rejected" />
    : <Badge label={long ? "Waiting for you" : "Waiting"} type="pending" />;

  return (
    <div className={open && cur ? "oa fx2 oa-open" : "oa fx2"}>
      <style>{OA_CSS}</style>
      <style>{FX_CSS}</style>
      <div className="oa-list">
        <div className="oa-switch" role="tablist" aria-label="Show">
          <button type="button" role="tab" aria-selected={view === "waiting"} className={view === "waiting" ? "on" : ""} onClick={() => pick("waiting")}>
            Waiting <span className={waiting.length ? "oa-n hot" : "oa-n"}>{waiting.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={view === "reviewed"} className={view === "reviewed" ? "on" : ""} onClick={() => pick("reviewed")}>
            Reviewed <span className="oa-n">{reviewed.length}</span>
          </button>
        </div>
        {(view === "waiting" ? waiting : reviewed).length > 6 && (
          <div className="oa-search"><Icon name="search" size={14} />
            <input type="search" placeholder="Search intern" value={q} onChange={(e) => { setQ(e.target.value); setSel(null); }} aria-label="Search intern" /></div>
        )}
        <div className="oa-items" role="list">
          {list.length === 0 ? (
            <div className="oa-none">
              <span className="oa-none-ic"><Icon name="check" size={18} /></span>
              <b>{sq ? "No match" : view === "waiting" ? "All caught up" : "Nothing reviewed yet"}</b>
              <small>{sq ? "Try another name." : view === "waiting" ? "No time corrections waiting for you." : "Corrections you approve or reject show here."}</small>
            </div>
          ) : list.map((c) => (
            <button key={c.id} type="button" role="listitem" className={cur && cur.id === c.id ? "oa-item on" : "oa-item"}
              onClick={() => { setSel(c.id); setOpen(true); }}>
              <Avatar name={c.intern_name} photo={c.intern_photo} size={34} />
              <span className="oa-who"><b>{c.intern_name}</b><small>{fxDay(c.date)} · {FX_KIND[kind(c)].replace("Forgot to ", "no ").replace("Missed the whole day", "whole day")}</small></span>
              {view === "reviewed" && badge(c)}
            </button>
          ))}
        </div>
      </div>

      <div className="oa-detail">
        {!cur ? (
          <div className="oa-blank">
            <span className="oa-none-ic"><Icon name="pencil" size={20} /></span>
            <b>{view === "waiting" ? "No corrections waiting" : "Nothing to show yet"}</b>
            <small>{view === "waiting" && reviewed.length ? "Open Reviewed to see the corrections already checked." : "When an intern forgets to time in or out, their request shows here."}</small>
          </div>
        ) : (
          <>
            <button type="button" className="oa-back" onClick={() => setOpen(false)}><Icon name="menu" size={14} /> Back to the list</button>
            <div className="oa-head">
              <Avatar name={cur.intern_name} photo={cur.intern_photo} size={46} />
              <div className="oa-hn"><b>{cur.intern_name}</b><small>{FX_KIND[kind(cur)]} · {fxDay(cur.date, true)}</small></div>
              {badge(cur, true)}
            </div>
            {(() => {
              const p = pairs(cur);
              return (
                <div className="fx-cmp">
                  <div className="fx-side">
                    <span className="fx-lbl">Recorded</span>
                    <div className="fx-pair"><div><small>Time in</small><b className={p.rec[0] === "No tap" ? "none" : ""}>{p.rec[0]}</b></div>
                      <Icon name="menu" size={0} /><div><small>Time out</small><b className={p.rec[1] === "No tap" ? "none" : ""}>{p.rec[1]}</b></div></div>
                  </div>
                  <div className="fx-side ask">
                    <span className="fx-lbl">Asks for</span>
                    <div className="fx-pair"><div><small>Time in</small><b className={p.hl[0] ? "new" : ""}>{p.ask[0]}</b></div>
                      <div><small>Time out</small><b className={p.hl[1] ? "new" : ""}>{p.ask[1]}</b></div></div>
                  </div>
                </div>
              );
            })()}
            <div className="oa-kv fx-kv">
              <div><small>Time between</small><b>{span(cur)}</b></div>
              <div><small>{view === "waiting" ? "Sent" : "Reviewed"}</small><b>{fxWhen(view === "waiting" ? cur.created_at : (cur.reviewed_at || cur.updated_at))}</b></div>
            </div>
            <div className="oa-tasks">
              <span>Reason</span>
              <p>{cur.reason || "—"}</p>
            </div>
            <ol className="oa-steps fx-steps">
              <li className="done"><i><Icon name="check" size={11} /></i><span>Intern asked</span></li>
              <li className={cur.status === "approved" ? "done" : cur.status === "rejected" ? "bad" : "now"}>
                <i>{cur.status === "approved" ? <Icon name="check" size={11} /> : cur.status === "rejected" ? <Icon name="x" size={11} /> : 2}</i>
                <span>{cur.status === "rejected" ? "Rejected" : "You decide"}</span></li>
              <li className={cur.status === "approved" ? "done" : ""}>
                <i>{cur.status === "approved" ? <Icon name="check" size={11} /> : 3}</i><span>Fixed in records</span></li>
            </ol>
            <OaHistory name={cur.intern_name}
              rows={[...waiting, ...reviewed].filter((c) => c.id !== cur.id && (c.user_id ? c.user_id === cur.user_id : c.intern_name === cur.intern_name))
                .sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 12)
                .map((c) => ({ id: c.id, when: fxDay(c.date), text: `${FX_KIND[kind(c)]} · ${c.reason || ""}`, badge: badge(c) }))}
              onPick={(r) => { const w = waiting.some((x) => x.id === r.id); setView(w ? "waiting" : "reviewed"); setQ(""); setSel(r.id); }} />
            {view === "waiting" ? (
              <div className="oa-act">
                <input type="text" className="ix-input" placeholder="Remarks (optional)" value={remarks[cur.id] || ""}
                  onChange={(e) => setRemarks((r) => ({ ...r, [cur.id]: e.target.value }))} />
                <button className="ix-b danger" onClick={() => decide(cur, "rejected")} disabled={!!busy}>{busy === cur.id + "rejected" ? "..." : "Reject"}</button>
                <button className="ix-b ok" onClick={() => decide(cur, "approved")} disabled={!!busy}>{busy === cur.id + "approved" ? "..." : "Approve"}</button>
              </div>
            ) : (
              <div className={cur.status === "rejected" ? "oa-done bad" : "oa-done ok"}>
                <Icon name={cur.status === "rejected" ? "x" : "check"} size={14} />
                <span>{cur.status === "rejected" ? "Rejected. The record stays as it was." : "Approved. The record was fixed."}
                  {cur.remarks ? <> Remarks: <em>{cur.remarks}</em></> : null}
                  {cur.reviewer_name ? <small> · {cur.reviewer_name}</small> : null}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const FX_CSS = `
.fx-cmp { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: stretch; flex: none; }
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

/* Work arrangement: waiting / reviewed list on the left, the picked request on the right
   ("from -> to", reason, HTE letter). The supervisor's decision is final. */
function WfhBoard({ waiting = [], reviewed = [], onReview }) {
  const [view, setView] = useState("waiting");
  const [sel, setSel] = useState(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [remarks, setRemarks] = useState({});
  const [busy, setBusy] = useState(null);
  const sq = q.trim().toLowerCase();
  const list = (view === "waiting" ? waiting : reviewed).filter((w) => !sq || String(w.intern_name || "").toLowerCase().includes(sq));
  const cur = list.find((w) => w.id === sel) || list[0] || null;
  const pick = (v) => { setView(v); setSel(null); setOpen(false); setQ(""); };
  const to = (w) => (w.requested_mode === "offsite" ? "offsite" : "onsite");
  const from = (w) => (to(w) === "offsite" ? "onsite" : "offsite");
  const short = (m) => (m === "offsite" ? "WFH" : "Onsite");
  const decide = async (w, status) => {
    setBusy(w.id + status);
    const ok = await onReview(w, status, remarks[w.id] || "");
    setBusy(null);
    if (ok) { setSel(null); setOpen(false); }
  };
  const badge = (w, long) => w.status === "approved" ? <Badge label="Approved" type="approved" />
    : w.status === "rejected" ? <Badge label="Rejected" type="rejected" />
    : <Badge label={long ? "Waiting for you" : "Waiting"} type="pending" />;
  const range = (w) => w.start_date ? `${fxDay(w.start_date)}${w.end_date && w.end_date !== w.start_date ? ` – ${fxDay(w.end_date)}` : ""}` : null;

  return (
    <div className={open && cur ? "oa wf2 oa-open" : "oa wf2"}>
      <style>{OA_CSS}</style>
      <style>{FX_CSS}</style>
      <style>{WF_CSS}</style>
      <div className="oa-list">
        <div className="oa-switch" role="tablist" aria-label="Show">
          <button type="button" role="tab" aria-selected={view === "waiting"} className={view === "waiting" ? "on" : ""} onClick={() => pick("waiting")}>
            Waiting <span className={waiting.length ? "oa-n hot" : "oa-n"}>{waiting.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={view === "reviewed"} className={view === "reviewed" ? "on" : ""} onClick={() => pick("reviewed")}>
            Reviewed <span className="oa-n">{reviewed.length}</span>
          </button>
        </div>
        {(view === "waiting" ? waiting : reviewed).length > 6 && (
          <div className="oa-search"><Icon name="search" size={14} />
            <input type="search" placeholder="Search intern" value={q} onChange={(e) => { setQ(e.target.value); setSel(null); }} aria-label="Search intern" /></div>
        )}
        <div className="oa-items" role="list">
          {list.length === 0 ? (
            <div className="oa-none">
              <span className="oa-none-ic"><Icon name="check" size={18} /></span>
              <b>{sq ? "No match" : view === "waiting" ? "All caught up" : "Nothing reviewed yet"}</b>
              <small>{sq ? "Try another name." : view === "waiting" ? "No work arrangement requests waiting for you." : "Requests you approve or reject show here."}</small>
            </div>
          ) : list.map((w) => (
            <button key={w.id} type="button" role="listitem" className={cur && cur.id === w.id ? "oa-item on" : "oa-item"}
              onClick={() => { setSel(w.id); setOpen(true); }}>
              <Avatar name={w.intern_name} photo={w.intern_photo} size={34} />
              <span className="oa-who"><b>{w.intern_name}</b><small>{short(from(w))} → {short(to(w))}{w.created_at ? ` · ${fxWhen(w.created_at).replace(/, \d{4}$/, "")}` : ""}</small></span>
              {view === "reviewed" && badge(w)}
            </button>
          ))}
        </div>
      </div>

      <div className="oa-detail">
        {!cur ? (
          <div className="oa-blank">
            <span className="oa-none-ic"><Icon name="globe" size={20} /></span>
            <b>{view === "waiting" ? "No requests waiting" : "Nothing to show yet"}</b>
            <small>{view === "waiting" && reviewed.length ? "Open Reviewed to see the requests already checked." : "When an intern asks to work from home or go back onsite, it shows here."}</small>
          </div>
        ) : (
          <>
            <button type="button" className="oa-back" onClick={() => setOpen(false)}><Icon name="menu" size={14} /> Back to the list</button>
            <div className="oa-head">
              <Avatar name={cur.intern_name} photo={cur.intern_photo} size={46} />
              <div className="oa-hn"><b>{cur.intern_name}</b><small>Work arrangement{cur.placement ? ` · ${cur.placement}` : ""}</small></div>
              {badge(cur, true)}
            </div>
            <div className="fx-cmp">
              <div className="fx-side">
                <span className="fx-lbl">{cur.status === "approved" ? "Was" : "Now"}</span>
                <span className={`wf-mode ${from(cur)}`}><Icon name={from(cur) === "offsite" ? "home" : "briefcase"} size={16} /> {modeLabel(from(cur))}</span>
              </div>
              <div className="fx-side ask">
                <span className="fx-lbl">{cur.status === "approved" ? "Now" : "Asks for"}</span>
                <span className={`wf-mode ${to(cur)}`}><Icon name={to(cur) === "offsite" ? "home" : "briefcase"} size={16} /> {modeLabel(to(cur))}</span>
              </div>
            </div>
            <div className="oa-kv fx-kv">
              <div><small>{range(cur) ? "Dates" : "Sent"}</small><b>{range(cur) || fxWhen(cur.created_at)}</b></div>
              <div><small>{view === "waiting" ? (range(cur) ? "Sent" : "Proof") : "Reviewed"}</small>
                <b>{view === "waiting" ? (range(cur) ? fxWhen(cur.created_at) : (cur.file_path ? "HTE letter" : cur.in_moa ? "In the MOA" : "None")) : fxWhen(cur.reviewed_at || cur.updated_at)}</b></div>
            </div>
            <div className="oa-tasks">
              <span>Reason</span>
              <p>{cur.reason || "—"}</p>
            </div>
            <div className="wf-proof">
              <span className="fx-lbl">Proof</span>
              {cur.file_path ? (
                <a className="wf-file" href={`${STORAGE}${cur.file_path}`} target="_blank" rel="noopener noreferrer">
                  <Icon name="file" size={15} /> <span>{cur.original_name || "HTE letter"}</span> <em>Open</em>
                </a>
              ) : cur.in_moa ? <span className="wf-note ok"><Icon name="check" size={13} /> Work from home is stated in the MOA / Student Contract</span>
                : <span className="wf-note">{to(cur) === "onsite" ? "No letter needed (going back onsite)" : "No letter attached"}</span>}
            </div>
            <ol className="oa-steps fx-steps">
              <li className="done"><i><Icon name="check" size={11} /></i><span>Intern asked</span></li>
              <li className={cur.status === "approved" ? "done" : cur.status === "rejected" ? "bad" : "now"}>
                <i>{cur.status === "approved" ? <Icon name="check" size={11} /> : cur.status === "rejected" ? <Icon name="x" size={11} /> : 2}</i>
                <span>{cur.status === "rejected" ? "Rejected" : "You decide"}</span></li>
              <li className={cur.status === "approved" ? "done" : ""}>
                <i>{cur.status === "approved" ? <Icon name="check" size={11} /> : 3}</i><span>Arrangement changed</span></li>
            </ol>
            <OaHistory name={cur.intern_name}
              rows={[...waiting, ...reviewed].filter((w) => w.id !== cur.id && (w.user_id ? w.user_id === cur.user_id : w.intern_name === cur.intern_name))
                .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))).slice(0, 12)
                .map((w) => ({ id: w.id, when: fxWhen(w.created_at), text: `${short(from(w))} → ${short(to(w))} · ${w.reason || ""}`, badge: badge(w) }))}
              onPick={(r) => { const wt = waiting.some((x) => x.id === r.id); setView(wt ? "waiting" : "reviewed"); setQ(""); setSel(r.id); }} />
            {view === "waiting" ? (
              <div className="oa-act">
                <input type="text" className="ix-input" placeholder="Remarks (optional)" value={remarks[cur.id] || ""}
                  onChange={(e) => setRemarks((r) => ({ ...r, [cur.id]: e.target.value }))} />
                <button className="ix-b danger" onClick={() => decide(cur, "rejected")} disabled={!!busy}>{busy === cur.id + "rejected" ? "..." : "Reject"}</button>
                <button className="ix-b ok" onClick={() => decide(cur, "approved")} disabled={!!busy}>{busy === cur.id + "approved" ? "..." : "Approve"}</button>
              </div>
            ) : (
              <div className={cur.status === "rejected" ? "oa-done bad" : "oa-done ok"}>
                <Icon name={cur.status === "rejected" ? "x" : "check"} size={14} />
                <span>{cur.status === "rejected" ? "Rejected. The arrangement stays the same." : `Approved. Now ${modeLabel(to(cur)).toLowerCase()}.`}
                  {cur.remarks ? <> Remarks: <em>{cur.remarks}</em></> : null}
                  {cur.reviewer_name ? <small> · {cur.reviewer_name}</small> : null}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const WF_CSS = `
.wf-mode { display: inline-flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 700; color: #0f172a; }
.wf-mode.offsite { color: #15803d; }
.fx-side:not(.ask) .wf-mode { color: #334155; }
.wf-proof { display: flex; align-items: center; gap: 12px; flex: none; padding: 0 2px; }
.wf-file { display: inline-flex; align-items: center; gap: 8px; padding: 7px 12px; border: 1px solid #e2e8f0; border-radius: 9px; font-size: 13px; color: #0f172a; text-decoration: none !important; min-width: 0; }
.wf-file span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 320px; }
.wf-file em { font-style: normal; font-weight: 700; color: #ea580c; margin-left: 4px; }
.wf-file:hover { border-color: #fdba74; background: #fff8f3; }
.wf-note { font-size: 13px; color: #64748b; display: inline-flex; align-items: center; gap: 6px; }
.wf-note.ok { color: #15803d; font-weight: 600; }
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