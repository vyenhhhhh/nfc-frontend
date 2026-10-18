// InternDashboard.jsx
import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import Shell, {
  Spinner, PageHeader, StatCard, Badge, Table, Section, Msg, Icon, Ring, Avatar, Bar, Modal, Empty,
  calcHours, fmtTime, greeting, esc, requiredHoursFor, programKey,
  PRE_REQUIREMENTS, POST_REQUIREMENTS, REQUIREMENTS_BY_PHASE, dueStatus, AnnouncementBoard, AccountSecurity, UserDetails,
  sessionsByDate, dayHours, dayOvertime, fmtMinutes, manilaHour, dtrModeOf, DTR_MODES, SCHEDULE, liveRefresh, todayManila,
} from "../components/DashKit.jsx";

// Home look (stats, calendar, gaps) is shared with the admin / coordinator dashboards
import { HomeCalendar, adminCss } from "./AdminDashboard.jsx";
import { formalLayout } from "../components/formalLayout.js";
import { mdCss } from "../components/materialTheme.js";
import { API, STORAGE } from "../config.js";


const NAV = [
  { path: "/intern",         label: "Home",     icon: "home" },
  { path: "/intern/records", label: "My Attendance", icon: "list" },
  { path: "/intern/dtr",     label: "My DTR",        icon: "file" },
  { path: "/intern/online",  label: "Submit Online", icon: "upload" },
  { path: "/intern/movs",    label: "Submit MOV",    icon: "folder" },
  { path: "/intern/requests", label: "My Requests",  icon: "inbox" },
  { path: "/intern/nfc",     label: "NFC Card",      icon: "card" },
  { path: "/intern/profile", label: "My Profile",    icon: "user" },
];

export default function InternDashboard() {
  const user = JSON.parse(sessionStorage.getItem("user") || "{}");
  const { pathname: path } = useLocation();
  const navigate = useNavigate();

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [program, setProgram] = useState(user.program || "");
  const [dtrMode, setDtrMode] = useState(dtrModeOf(user));

  // the login response has no program / DTR type, so read them from the account
  useEffect(() => {
    fetch(`${API}/me?user_id=${user.id}`)
      .then((r) => r.json())
      .then((d) => {
        const acct = d?.user || d || {};
        setProgram(acct.program || "");
        setDtrMode(dtrModeOf(acct));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchRecords();
    return liveRefresh(fetchRecords);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchRecords = async () => {
    try {
      const res = await fetch(`${API}/intern/attendance?user_id=${user.id}`);
      const data = await res.json();
      setRecords(Array.isArray(data) ? data : []);
    } catch {
      /* keep what we already have */
    } finally {
      setLoading(false);
    }
  };

  const uniqueDays = [...new Set(records.map((r) => r.date))].length;
  const totalHours = calcHours(records);
  const onsite = records.filter((r) => r.uid !== "ONLINE").length;
  const online = records.filter((r) => r.uid === "ONLINE").length;
  const lastTap = records.find((r) => r.uid !== "ONLINE"); // latest kiosk tap
  const firstName = user.name?.split(" ")[0] || "Intern";
  const required = requiredHoursFor(program);

  return (
    <Shell navItems={NAV} user={user}>
      {/* admin CSS first, intern CSS after so it can override, material theme last */}
      <style>{adminCss}</style>
      <style>{internCss}</style>
      <style>{formalLayout}</style>
      <style>{mdCss}</style>
      <style>{cardUnify}</style>
      {path === "/intern" && <MoaNotice user={user} go={navigate} />}
      {path === "/intern" && (
        <Home
          user={user} firstName={firstName} uniqueDays={uniqueDays} totalHours={totalHours}
          onsite={onsite} online={online} lastTap={lastTap} loading={loading} records={records} required={required}
          onApply={() => navigate("/intern/nfc")}
          go={navigate}
        />
      )}
      {(path === "/intern/records" || path === "/intern/hours") && (
        <Attendance user={user} records={records} loading={loading} required={required} program={program} onRefresh={fetchRecords} />
      )}
      {path === "/intern/dtr" && (
        <MyDtr user={user} records={records} loading={loading} mode={dtrMode} />
      )}
      {path === "/intern/online" && <SubmitOnline user={user} />}
      {path === "/intern/movs" && <SubmitMov user={user} unlocked={user.tracking_type === "output" || totalHours >= required} totalHours={totalHours} required={required} />}
      {path === "/intern/requests" && <MyRequests user={user} records={records} />}
      {path === "/intern/nfc" && <NfcApply user={user} />}
      {path === "/intern/profile" && <Profile user={user} />}
    </Shell>
  );
}

/* ───────────────────────── My Requests ─────────────────────────
   Everything the intern asked for, in one place, with where each one is now:
   Filed → HTE supervisor (confirms) → OJT coordinator (final decision).
   WFH requests and interns without a supervisor go straight to the coordinator. */
const REQ_KINDS = {
  online:     { label: "Online attendance", icon: "upload" },
  overtime:   { label: "Overtime",          icon: "clock" },
  correction: { label: "Time correction",   icon: "pencil" },
  wfh:        { label: "Work arrangement",  icon: "globe" },
};

function reqSteps(row) {
  const steps = row.viaSupervisor ? ["Filed", "Supervisor", "Coordinator"] : ["Filed", "Coordinator"];
  const last = steps.length - 1;
  let done = 1, current = 1, failed = -1;
  if (row.status === "endorsed") { done = 2; current = 2; }
  else if (row.status === "approved") { done = steps.length; current = -1; }
  else if (row.status === "rejected") {
    // rejected by the coordinator if the supervisor had already confirmed it, otherwise by the first reviewer
    failed = row.viaSupervisor && !row.endorsed ? 1 : last;
    done = failed; current = -1;
  }
  return steps.map((label, i) => ({
    label,
    state: i === failed ? "fail" : i < done ? "done" : i === current ? "now" : "todo",
  }));
}

const REQ_STATUS = {
  pending:  { label: "Waiting", type: "pending" },
  endorsed: { label: "Confirmed by supervisor", type: "pending" },
  approved: { label: "Approved", type: "approved" },
  rejected: { label: "Rejected", type: "rejected" },
};

function MyRequests({ user, records }) {
  const [online, setOnline] = useState([]);
  const [fixes, setFixes] = useState([]);
  const [wfh, setWfh] = useState([]);
  const [hasSup, setHasSup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const load = async () => {
    const get = (url) => fetch(url, { headers: { Accept: "application/json" } }).then((r) => r.json()).catch(() => null);
    const [o, c, w, me] = await Promise.all([
      get(`${API}/intern/my-online?user_id=${user.id}`),
      get(`${API}/intern/time-corrections`),
      get(`${API}/intern/work-mode-requests`),
      get(`${API}/me?user_id=${user.id}`),
    ]);
    if (Array.isArray(o)) setOnline(o);
    if (Array.isArray(c)) setFixes(c);
    if (Array.isArray(w)) setWfh(w);
    if (me) setHasSup(!!(me.user || me).supervisor_id);
    setLoading(false);
  };
  useEffect(() => { load(); return liveRefresh(load); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const day = (v) => v ? new Date(String(v).slice(0, 10) + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
  const time12 = (t) => {
    if (!t) return "";
    const [h, m] = String(t).split(":").map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  };

  const rows = [
    ...online.map((o) => ({
      key: `o${o.id}`, kind: "online", date: o.date, status: o.status, viaSupervisor: hasSup,
      endorsed: !!o.endorsed_at || o.status === "endorsed",
      details: o.description, remarks: o.remarks || o.endorse_remarks,
    })),
    ...records.filter((r) => r.ot_status).map((r) => ({
      key: `t${r.id}`, kind: "overtime", date: r.date, status: r.ot_status, viaSupervisor: hasSup,
      endorsed: !!r.ot_endorsed_at || r.ot_status === "endorsed",
      details: r.ot_status === "approved" && r.ot_approved_minutes != null
        ? `${fmtMinutes(r.ot_approved_minutes)} approved of ${fmtMinutes(r.ot_minutes || 0)}`
        : `${fmtMinutes(r.ot_minutes || 0)} after 5:00 PM`,
      remarks: r.ot_remarks,
    })),
    ...fixes.map((c) => ({
      key: `c${c.id}`, kind: "correction", date: c.date, status: c.status, viaSupervisor: hasSup,
      endorsed: !!c.endorsed_at || c.status === "endorsed",
      details: `Time out ${time12(c.requested_out || c.time_out)} — ${c.reason || ""}`, remarks: c.remarks || c.endorse_remarks,
    })),
    ...wfh.map((w) => ({
      key: `w${w.id}`, kind: "wfh", date: w.created_at, status: w.status, viaSupervisor: false, endorsed: false,
      details: `${w.requested_mode === "offsite" ? "Work from home" : "Back to onsite"} — ${w.reason || ""}`, remarks: w.remarks,
    })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const groupOf = (r) => (r.status === "approved" ? "approved" : r.status === "rejected" ? "rejected" : "waiting");
  const count = (g) => rows.filter((r) => groupOf(r) === g).length;
  const shown = filter === "all" ? rows : rows.filter((r) => groupOf(r) === filter);

  return (
    <>
      <PageHeader title="My Requests" sub="Everything you filed and where it is now: your supervisor confirms first, then the OJT coordinator decides." live />

      <div className="ix-pills">
        {[["all", "All", rows.length], ["waiting", "Waiting", count("waiting")], ["approved", "Approved", count("approved")], ["rejected", "Rejected", count("rejected")]].map(([k, l, n]) => (
          <button key={k} type="button" className={filter === k ? "ix-pill active" : "ix-pill"} onClick={() => setFilter(k)}>
            {l} <span className="ix-pill-count">{n}</span>
          </button>
        ))}
      </div>

      <div className="ix-card flush">
        {loading ? <Spinner /> : shown.length === 0 ? (
          <Empty icon="inbox" title={rows.length ? "Nothing here" : "No requests yet"}
            sub="Online attendance, overtime, time corrections and WFH requests you file will show up here." />
        ) : (
          <Table
            headers={["Request", "Date", "Progress", "Status"]}
            rows={shown.map((r) => {
              const st = REQ_STATUS[r.status] || { label: r.status || "—", type: "none" };
              return [
                <div className="rq-what">
                  <span className="rq-ic"><Icon name={REQ_KINDS[r.kind].icon} size={15} /></span>
                  <div>
                    <strong>{REQ_KINDS[r.kind].label}</strong>
                    {r.details && <small>{r.details}</small>}
                  </div>
                </div>,
                day(r.date),
                <ol className="rq-steps" aria-label="Progress">
                  {reqSteps(r).map((s) => (
                    <li key={s.label} className={s.state}>
                      <i>{s.state === "done" ? "✓" : s.state === "fail" ? "✕" : ""}</i>
                      <span>{s.label}</span>
                    </li>
                  ))}
                </ol>,
                <div className="rq-status">
                  <Badge label={st.label} type={st.type} />
                  {r.remarks && <small>“{r.remarks}”</small>}
                </div>,
              ];
            })}
          />
        )}
      </div>
    </>
  );
}

/* ───────────────────────── Home helpers ───────────────────────── */
const DAY_MS = 86400000;
const manilaToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
const addDays = (iso, n) => new Date(new Date(iso + "T12:00:00Z").getTime() + n * DAY_MS).toISOString().slice(0, 10);
export const weekdayIdx = (iso) => (new Date(iso + "T12:00:00Z").getUTCDay() + 6) % 7; // Mon = 0

// consecutive weekdays with a record (weekends never break the streak)
function streakOf(days, today) {
  const set = new Set(days);
  let cur = today;
  if (!set.has(cur)) cur = addDays(cur, -1); // today may simply not have started yet
  let n = 0;
  for (let i = 0; i < 400; i++) {
    if (weekdayIdx(cur) >= 5) { cur = addDays(cur, -1); continue; }
    if (!set.has(cur)) break;
    n++;
    cur = addDays(cur, -1);
  }
  return n;
}

const fmtElapsed = (ms) => {
  const m = Math.max(Math.floor(ms / 60000), 0);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

/* ───────────────────────── Home ───────────────────────── */
function Home({ user, firstName, uniqueDays, totalHours, onsite, online, lastTap, loading, records, onApply, go, required }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(iv);
  }, []);

  const needsCardWarning =
    user.work_mode !== "offsite" && user.tracking_type !== "output" && !user.has_card;

  const pct = Math.max(Math.min((totalHours / required) * 100, 100), 0);
  const left = Math.max(Math.round((required - totalHours) * 10) / 10, 0);
  const nextMilestone = [25, 50, 75, 100].find((m) => pct < m);
  const hrsToMilestone = nextMilestone
    ? Math.max(Math.round(((nextMilestone / 100) * required - totalHours) * 10) / 10, 0)
    : 0;

  const today = manilaToday();
  const dateLabel = new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" });
  const streak = streakOf([...new Set(records.map((r) => r.date))], today);

  // current session
  const lastIn = lastTap?.action === "CHECK_IN";
  const lastTime = lastTap
    ? fmtTime(lastTap.action === "CHECK_OUT" && lastTap.checked_out_at ? lastTap.checked_out_at : lastTap.checked_in_at)
    : "";
  let statusClass = "idle";
  let statusText = "No taps yet";
  if (lastTap && lastIn && lastTap.date === today) {
    statusClass = "live";
    statusText = `On the clock since ${lastTime} · ${fmtElapsed(now - new Date(lastTap.checked_in_at).getTime())}`;
  } else if (lastTap && lastIn) {
    statusClass = "warn";
    statusText = `No checkout on ${lastTap.date}`;
  } else if (lastTap) {
    statusText = `Checked out ${lastTime} · ${lastTap.date}`;
  }

  // one row per day (like My Attendance): first time in, last time out, hours credited
  const sessions = sessionsByDate(records);
  const recentDays = Object.keys(sessions).sort((a, b) => b.localeCompare(a)).slice(0, 5).map((d) => {
    const s = sessions[d];
    const last = [...s].reverse().find((x) => x.out);
    return { date: d, online: s.some((x) => x.online), in: s[0]?.in, out: last?.out || null, hrs: last ? dayHours(s) : null };
  });
  const dayLabel = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  const stats = [
    { icon: "calendar", tone: "orange", label: "Days present", value: uniqueDays, hint: "days logged" },
    { icon: "clock", tone: "blue", label: "Total hours", value: totalHours + "h", hint: `${pct.toFixed(0)}% of ${required}h`, bar: pct },
    { icon: "check", tone: "green", label: "Streak", value: streak + (streak === 1 ? " day" : " days"), hint: streak >= 3 ? "Keep it going" : "weekdays in a row" },
    { icon: "tap", tone: "purple", label: "Onsite / online", value: `${onsite} / ${online}`, hint: "taps and remote logs" },
  ];

  const quick = [
    { icon: "file", label: "My DTR", to: "/intern/dtr" },
    { icon: "upload", label: "Submit online", to: "/intern/online" },
    { icon: "folder", label: "Submit MOV", to: "/intern/movs" },
  ];

  return (
    <div className="adm-home">
      {/* ───── LEFT ───── */}
      <div className="adm-col">
        {/* hero */}
        <div className="hv-hero">
          <span className="hv-blob a" aria-hidden="true" />
          <span className="hv-blob b" aria-hidden="true" />

          <div className="hv-hero-main">
            <span className={`hv-pill ${statusClass}`}>
              <i aria-hidden="true" /> {statusText}
            </span>
            <h1>{greeting()}, {firstName}</h1>
            <p>
              {nextMilestone
                ? `Only ${hrsToMilestone}h until you hit ${nextMilestone}%. ${dateLabel}.`
                : `You've completed your required OJT hours. ${dateLabel}.`}
            </p>

            <div className="hv-track" aria-hidden="true">
              <div className="hv-track-fill" style={{ width: pct + "%" }} />
              {[25, 50, 75].map((m) => <i key={m} style={{ left: m + "%" }} />)}
            </div>
            <div className="hv-track-cap">
              <span><b>{totalHours}h</b> done</span>
              <span><b>{left}h</b> left of {required}h</span>
            </div>
          </div>

          <div className="hv-hero-side">
            <Ring pct={pct} size={92} stroke={10} track="#fde5d8" color="#f2733a">
              <strong>{pct.toFixed(0)}%</strong>
            </Ring>
            <div className="hv-quick">
              {quick.map((q) => (
                <button key={q.to} type="button" onClick={() => go(q.to)}>
                  <Icon name={q.icon} size={14} /> {q.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* first steps for a new intern; disappears once everything is done */}
        <GettingStarted user={user} records={records} needsCard={needsCardWarning} go={go} onApply={onApply} />

        {/* stats */}
        <div className="hv-stats">
          {stats.map((s) => (
            <div key={s.label} className={`hv-stat ${s.tone}`}>
              <span className="hv-stat-ic"><Icon name={s.icon} size={18} /></span>
              <div className="hv-stat-body">
                <small>{s.label}</small>
                <strong>{s.value}</strong>
                <em>{s.hint}</em>
                {s.bar !== undefined && <span className="hv-stat-bar"><i style={{ width: s.bar + "%" }} /></span>}
              </div>
            </div>
          ))}
        </div>

        {/* recent attendance */}
        <div className="adm-live hv-recent">
          <Section icon="list" title="Recent Attendance" count={Object.keys(sessions).length} live>
            {loading ? (
              <Spinner />
            ) : (
              <Table
                headers={["Date", "Type", "Time In", "Time Out", "Hours"]}
                rows={recentDays.map((r) => [
                  <strong>{dayLabel(r.date)}</strong>,
                  <Badge label={r.online ? "Online" : "Onsite"} type={r.online ? "online" : "onsite"} />,
                  r.in ? <span className="adm-time">{fmtTime(r.in)}</span> : <span className="ix-muted">—</span>,
                  r.out ? <span className="adm-time">{fmtTime(r.out)}</span>
                    : r.date === today ? <Badge label="On the clock" type="in" /> : <Badge label="No time out" type="pending" />,
                  r.hrs != null ? <strong>{Math.round(r.hrs * 10) / 10}h</strong> : <span className="ix-muted">—</span>,
                ])}
                empty="No records yet. Tap your card to log your first day."
              />
            )}
          </Section>
        </div>
      </div>

      {/* ───── RIGHT: calendar + announcements ───── */}
      <div className="adm-col">
        <HomeCalendar />
        <AnnouncementBoard />
      </div>
    </div>
  );
}

/* ───────────────────────── Getting started (new interns) ─────────────────────────
   Upload the MOA → get the NFC card → first attendance. Hidden once every step is done. */
function GettingStarted({ user, records, needsCard, go, onApply }) {
  const [moa, setMoa] = useState(null);   // null (loading) | "none" | "pending" | "rejected" | "approved"
  const [card, setCard] = useState(null); // null (loading) | true | false

  useEffect(() => {
    const load = () => {
      fetch(`${API}/intern/my-movs?user_id=${user.id}`, { headers: { Accept: "application/json" } })
        .then((r) => r.json())
        .then((list) => {
          if (!Array.isArray(list)) return;
          const m = list.filter((x) => x.requirement === "moa");
          setMoa(m.some((x) => x.status === "approved") ? "approved"
            : m.some((x) => x.status === "pending") ? "pending" : m.length ? "rejected" : "none");
        })
        .catch(() => {});
      fetch(`${API}/me?user_id=${user.id}`, { headers: { Accept: "application/json" } })
        .then((r) => r.json())
        .then((d) => setCard(!!(d?.user || d)?.nfc_uid))
        .catch(() => {});
    };
    load();
    return liveRefresh(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (moa === null) return null;

  const steps = [
    {
      key: "moa", title: "Upload your MOA",
      state: moa === "approved" ? "done" : moa === "pending" ? "wait" : "todo",
      sub: moa === "approved" ? "Approved by your OJT coordinator."
        : moa === "pending" ? "Uploaded. Waiting for your OJT coordinator to approve it."
        : moa === "rejected" ? "It was returned. Please upload it again." : "Your taps won't count until the MOA is approved.",
      action: moa === "approved" || moa === "pending" ? null : { label: "Upload", run: () => go("/intern/movs") },
    },
    // interns who work offsite or are output-based don't need a card
    ...(needsCard || card ? [{
      key: "card", title: "Get your NFC card",
      state: card ? "done" : "todo",
      sub: card ? "Your card is linked to your account." : "Apply for a card, then your coordinator links it.",
      action: card ? null : { label: "Apply", run: onApply },
    }] : []),
    {
      key: "tap", title: "Log your first attendance",
      state: records.length ? "done" : "todo",
      sub: records.length ? "You're all set." : "Tap your card on the kiosk when you arrive.",
      action: null,
    },
  ];
  const doneCount = steps.filter((s) => s.state === "done").length;
  if (doneCount === steps.length) return null;

  return (
    <div className="ix-card gs-card">
      <div className="gs-head">
        <strong>Getting started</strong>
        <span>{doneCount} of {steps.length} done</span>
      </div>
      <div className="gs-bar"><i style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
      <ol className="gs-list">
        {steps.map((s, i) => (
          <li key={s.key} className={s.state}>
            <span className="gs-dot">{s.state === "done" ? "✓" : i + 1}</span>
            <span className="gs-text"><b>{s.title}</b><small>{s.sub}</small></span>
            {s.action && <button type="button" className="ix-b primary sm" onClick={s.action.run}>{s.action.label}</button>}
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ───────────────────────── My Attendance (records + total hours) ───────────────────────── */
function Attendance({ user, records, loading, required, program, onRefresh }) {
  // forgot to tap out → request a time correction (the coordinator approves or rejects it)
  const [fixes, setFixes] = useState([]);
  const [fixFor, setFixFor] = useState(null);   // { id, date, checkin } of the day being fixed
  const [fixTime, setFixTime] = useState("17:00");
  const [fixReason, setFixReason] = useState("");
  const [fixBusy, setFixBusy] = useState(false);
  const [fixMsg, setFixMsg] = useState(null);
  const [pageMsg, setPageMsg] = useState(null);

  const loadFixes = async () => {
    try {
      const res = await fetch(`${API}/intern/time-corrections?user_id=${user.id}`, { headers: { Accept: "application/json" } });
      const data = await res.json();
      if (Array.isArray(data)) setFixes(data);
    } catch { /* keep what we have */ }
  };
  useEffect(() => { loadFixes(); /* eslint-disable-next-line */ }, [records.length]);

  const openFix = (date, t) => {
    setFixFor({ id: t.openId, date, checkin: t.openIn });
    setFixTime("17:00"); setFixReason(""); setFixMsg(null);
  };
  const sendFix = async (e) => {
    e.preventDefault();
    setFixBusy(true); setFixMsg(null);
    try {
      const res = await fetch(`${API}/intern/time-corrections`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ user_id: user.id, attendance_id: fixFor.id, time_out: fixTime, reason: fixReason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.errors && Object.values(data.errors)[0]?.[0]) || data.message || "Couldn't send the request.");
      setFixFor(null);
      setPageMsg({ type: "success", text: data.message });
      loadFixes();
      onRefresh && onRefresh();
    } catch (err) {
      setFixMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    } finally {
      setFixBusy(false);
    }
  };
  const fixOf = (attendanceId) => fixes.find((f) => f.attendance_id === attendanceId);
  const [filter, setFilter] = useState("all");
  const [month, setMonth] = useState("all"); // "all" or "YYYY-MM"

  const totalHours = calcHours(records);
  const uniqueDays = [...new Set(records.map((r) => r.date))].length;
  const avgHours = uniqueDays > 0 ? (totalHours / uniqueDays).toFixed(1) : 0;
  const pct = Math.max(Math.min((totalHours / required) * 100, 100), 0);
  const left = Math.max(Math.round((required - totalHours) * 10) / 10, 0);
  const nextMilestone = [25, 50, 75, 100].find((m) => pct < m);
  const hrsToMilestone = nextMilestone
    ? Math.max(Math.round(((nextMilestone / 100) * required - totalHours) * 10) / 10, 0)
    : 0;

  // one row per day: first time in, last time out, credited hours (official hours only, approved overtime, 8h cap)
  const sessions = sessionsByDate(records);
  const byDate = {};
  records.forEach((r) => {
    if (byDate[r.date]) return;
    const s = sessions[r.date] || [];
    const last = [...s].reverse().find((x) => x.out);
    byDate[r.date] = {
      checkin: s[0]?.in || null,
      checkout: last?.out || null,
      online: r.uid === "ONLINE",
      hrs: dayHours(s),
      ot: dayOvertime(s),
      openId: s.find((x) => !x.out && !x.online)?.id ?? null,   // kiosk record with no time out
      openIn: s.find((x) => !x.out && !x.online)?.in ?? null,
    };
  });

  const hoursOf = (t) => (t.checkout ? t.hrs : null);
  const allDays = Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0]));
  const months = [...new Set(allDays.map(([d]) => d.slice(0, 7)))]; // newest first
  const monthName = (m) =>
    new Date(m + "-01T12:00:00Z").toLocaleDateString("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });
  const monthDays = allDays.filter(([d]) => month === "all" || d.startsWith(month));
  const counts = {
    all: monthDays.length,
    onsite: monthDays.filter(([, t]) => !t.online).length,
    online: monthDays.filter(([, t]) => t.online).length,
  };
  const weekday = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-PH", { weekday: "short", timeZone: "UTC" });

  const noCheckout = allDays.filter(([, t]) => t.checkin && !t.checkout).length;

  const stats = [
    { icon: "calendar", tone: "orange", label: "Total days", value: uniqueDays, hint: "days logged" },
    { icon: "clock", tone: "blue", label: "Total hours", value: totalHours + "h", hint: `${pct.toFixed(0)}% of ${required}h`, bar: pct },
    { icon: "tap", tone: "green", label: "Average / day", value: avgHours + "h", hint: "hours per day present" },
    noCheckout > 0
      ? { icon: "warn", tone: "red", label: "No checkout", value: noCheckout, hint: noCheckout === 1 ? "day to fix" : "days to fix" }
      : { icon: "check", tone: "red ok", label: "No checkout", value: 0, hint: "all days complete" },
  ];

  const dailyRows = monthDays
    .filter(([, t]) => filter === "all" || (filter === "online" ? t.online : !t.online))
    .map(([date, t]) => {
      const hrs = hoursOf(t);
      return [
        <div className="at-date"><strong>{date}</strong><small>{weekday(date)}</small></div>,
        <Badge label={t.online ? "Online" : "Onsite"} type={t.online ? "online" : "onsite"} />,
        <span className="adm-time">{fmtTime(t.checkin)}</span>,
        // has a time out and nothing left open → just the time
        // (a 4-tap intern can have an AM time out but a PM check-in that was never closed)
        t.checkout && !t.openId
          ? <span className="adm-time">{fmtTime(t.checkout)}</span>
          : (() => {
              const f = t.openId && fixOf(t.openId);
              const past = date < manilaToday();          // today you can still tap out at the kiosk
              if (f?.status === "pending") return <Badge label="Fix requested" type="pending" />;
              if (f?.status === "endorsed") return <Badge label="Fix confirmed by supervisor" type="pending" />;
              return (
                <div className="at-fix">
                  <Badge label={f?.status === "rejected" ? "Fix rejected" : "No checkout"} type={f?.status === "rejected" ? "rejected" : "pending"} />
                  {past && t.openId && (
                    <button type="button" className="at-fix-btn" onClick={() => openFix(date, t)}>Request fix</button>
                  )}
                </div>
              );
            })(),
        hrs !== null
          ? (
            <div className="at-hrs">
              <span>{hrs.toFixed(2)} hrs</span>
              <em className="at-hrs-bar"><i style={{ width: Math.min((hrs / SCHEDULE.dailyCap) * 100, 100) + "%" }} /></em>
              {t.ot && (
                <small className={`at-ot ${t.ot.status}`}>
                  OT {fmtMinutes(t.ot.minutes)} · {t.ot.status === "approved"
                    ? `${fmtMinutes(t.ot.approved)} credited`
                    : t.ot.status === "pending" ? "waiting for approval" : "not credited"}
                </small>
              )}
            </div>
          )
          : <span className="ix-muted">—</span>,
      ];
    });

  return (
    <div className="at-stack">
      <PageHeader title="My Attendance" sub="Your attendance log and computed OJT hours, day by day." live />
      <Msg msg={pageMsg} />

      {fixFor && (
        <Modal title="Request a time correction" sub={`You forgot to tap out on ${fixFor.date}.`} onClose={() => setFixFor(null)}>
          <form onSubmit={sendFix} className="ix-form">
            <Msg msg={fixMsg} />
            <div className="ix-note" style={{ marginTop: 0 }}>
              <Icon name="info" size={18} />
              <span>Time in: <strong>{fmtTime(fixFor.checkin)}</strong>. Your OJT coordinator will approve or reject the time out you send.</span>
            </div>
            <div className="ix-field">
              <label htmlFor="fix-time">What time did you leave?</label>
              <input id="fix-time" type="time" required value={fixTime} max="17:00" onChange={(e) => setFixTime(e.target.value)} />
            </div>
            <div className="ix-field">
              <label htmlFor="fix-reason">Reason</label>
              <textarea id="fix-reason" rows={3} required maxLength={500} value={fixReason}
                placeholder="e.g. I forgot to tap my card before going home."
                onChange={(e) => setFixReason(e.target.value)} />
            </div>
            <div className="ix-form-actions">
              <button type="button" className="ix-b ghost" onClick={() => setFixFor(null)} disabled={fixBusy}>Cancel</button>
              <button type="submit" className="ix-b primary" disabled={fixBusy}>{fixBusy ? "Sending..." : "Send request"}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* hero */}
      <div className="hv-hero compact">
        <span className="hv-blob a" aria-hidden="true" />
        <span className="hv-blob b" aria-hidden="true" />
        <div className="hv-hero-main">
          <span className="hv-pill idle">
            <i aria-hidden="true" /> {programKey(program) || "Standard OJT"} · {required}h required
          </span>
          <h1>{nextMilestone ? `${hrsToMilestone}h to your ${nextMilestone}% mark` : "OJT hours complete"}</h1>
          <p>
            {nextMilestone
              ? `${totalHours}h rendered so far, ${left}h to go. Keep tapping in.`
              : "You've rendered all of your required hours. Great work!"}
          </p>
          <div className="hv-track" aria-hidden="true">
            <div className="hv-track-fill" style={{ width: pct + "%" }} />
            {[25, 50, 75].map((m) => <i key={m} style={{ left: m + "%" }} />)}
          </div>
          <div className="at-marks">{[25, 50, 75, 100].map((m) => <span key={m} style={{ left: m + "%" }}>{m}%</span>)}</div>
        </div>
        <div className="hv-hero-side">
          <Ring pct={pct} size={46} stroke={6} track="#fde5d8" color="#f2733a">
            <strong>{pct.toFixed(0)}%</strong>
          </Ring>
        </div>
      </div>

      {/* stats */}
      <div className="at-mid">
        <div className="hv-stats">
          {stats.map((s) => (
            <div key={s.label} className={`hv-stat ${s.tone}`}>
              <span className="hv-stat-ic"><Icon name={s.icon} size={18} /></span>
              <div className="hv-stat-body">
                <small>{s.label}</small>
                <strong>{s.value}</strong>
                <em>{s.hint}</em>
                {s.bar !== undefined && <span className="hv-stat-bar"><i style={{ width: s.bar + "%" }} /></span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* log */}
      <div className="at-log-head">
        <div className="ix-pills">
          {["all", "onsite", "online"].map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={filter === f ? "ix-pill active" : "ix-pill"}>
              {cap(f)} <span className="at-count">{counts[f]}</span>
            </button>
          ))}
        </div>
        <select
          className="at-month" value={month} aria-label="Filter by month"
          onChange={(e) => setMonth(e.target.value)}
        >
          <option value="all">All months</option>
          {months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
        </select>
      </div>
      <div className="ix-card flush at-log">
        {loading ? <Spinner /> : (
          <Table
            headers={["Date", "Type", "Time In", "Time Out", "Hours Worked"]}
            rows={dailyRows}
            empty="No attendance records match this filter."
          />
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── Submit Online ───────────────────────── */
// If your Laravel route has a different name, change it here.
const ONLINE_LIST_URL = `${API}/intern/my-online`;

const cap = (s = "") => s.charAt(0).toUpperCase() + s.slice(1);
const statusType = (s) => (s === "approved" ? "approved" : s === "rejected" ? "rejected" : "pending");

// Delete endpoints (Laravel). Change here if your routes are named differently.
const ONLINE_DELETE_URL = (id, uid) => `${API}/intern/submit-online/${id}?user_id=${uid}`;
const MOV_DELETE_URL = (id, uid) => `${API}/intern/submit-mov/${id}?user_id=${uid}`;

// "Remove" with an inline "are you sure?" step (only shown for pending items)
function RemoveBtn({ onConfirm }) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  if (ask) {
    return (
      <span className="rm-confirm">
        <button type="button" className="rm-yes" disabled={busy}
          onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); setAsk(false); }}>
          {busy ? "Removing..." : "Yes, remove"}
        </button>
        <button type="button" className="rm-no" disabled={busy} onClick={() => setAsk(false)}>Keep</button>
      </span>
    );
  }
  return (
    <button type="button" className="rm-btn" onClick={() => setAsk(true)} aria-label="Remove this submission">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
      </svg>
      Remove
    </button>
  );
}

function SubmitOnline({ user }) {
  const [form, setForm] = useState({ date: "", description: "" });
  const [submitting, setSub] = useState(false);
  const [msg, setMsg] = useState(null);
  const [subs, setSubs] = useState([]);
  const [loadingSubs, setLoadingSubs] = useState(true);

  const fetchSubs = async () => {
    try {
      const res = await fetch(`${ONLINE_LIST_URL}?user_id=${user.id}`, { headers: { Accept: "application/json" } });
      const data = await res.json();
      setSubs(Array.isArray(data) ? data : []);
    } catch {
      /* keep what we already have */
    } finally {
      setLoadingSubs(false);
    }
  };

  useEffect(() => {
    fetchSubs();
    return liveRefresh(fetchSubs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeSub = async (id) => {
    setMsg(null);
    try {
      const res = await fetch(ONLINE_DELETE_URL(id, user.id), { method: "DELETE", headers: { Accept: "application/json" } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Couldn't remove this submission.");
      setSubs((list) => list.filter((x) => x.id !== id));
      setMsg({ type: "success", text: data.message || "Submission removed." });
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setSub(true); setMsg(null);
    try {
      const res = await fetch(`${API}/intern/submit-online`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, ...form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setMsg({ type: "success", text: data.message });
      setForm({ date: "", description: "" });
      fetchSubs();
    } catch (err) { setMsg({ type: "error", text: err.message }); }
    finally { setSub(false); }
  };

  return (
    <>
      <PageHeader title="Submit Online Attendance" sub="For asynchronous or remote workdays." />
      <WorkModeCard user={user} />
      <div className="intern-split online-split">
        <div className="ix-card">
          <div className="ix-note">
            <Icon name="info" size={18} />
            Submit your attendance for days you worked remotely. Your HTE supervisor confirms it first, then your OJT coordinator approves or rejects it.
          </div>
          <Msg msg={msg} />
          <form onSubmit={handleSubmit} className="ix-form">
            <div className="ix-field">
              <label htmlFor="ix-date">Date of work</label>
              <input
                id="ix-date" type="date" value={form.date} required
                max={manilaToday()}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="ix-field">
              <label htmlFor="ix-desc">Tasks completed</label>
              <textarea
                id="ix-desc" rows={6} value={form.description} required
                placeholder="Describe in detail what you worked on that day..."
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <button type="submit" disabled={submitting} className="ix-btn">
              {submitting ? "Submitting..." : "Submit for Approval"}
            </button>
          </form>
        </div>

        <div className="ix-card os-card">
          <div className="os-head">
            <span className="os-title"><Icon name="inbox" size={18} /> My Online Submissions</span>
            <span className="os-count">{subs.length}</span>
          </div>
          {loadingSubs ? <Spinner /> : (
            <Table
              headers={["Date", "Task Completed", "Status", ""]}
              rows={subs.map((s) => [
                <span className="os-date">{String(s.date).slice(0, 10)}</span>,
                <div className="intern-task" title={s.description}>
                  {s.description}
                  {s.remarks && <small>Remarks: {s.remarks}</small>}
                </div>,
                <span className={`os-status ${statusType(s.status)}`}>
                  {s.status === "endorsed" ? "Confirmed by supervisor" : cap(s.status || "pending")}
                </span>,
                (s.status || "pending") === "pending" ? <RemoveBtn onConfirm={() => removeSub(s.id)} /> : "",
              ])}
              empty="No online submissions yet."
            />
          )}
        </div>
      </div>
    </>
  );
}

/* ───────────────────────── Work arrangement (WFH) ─────────────────────────
   From the OJT coordinator: WFH needs a letter from the HTE approving it (plus the student's request),
   unless WFH is already stated in the MOA or Student Contract. Online attendance is for approved WFH. */
function WorkModeCard({ user }) {
  const [mode, setMode] = useState(null);          // onsite | offsite
  const [reqs, setReqs] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ reason: "", in_moa: false, file: null });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = () => {
    fetch(`${API}/me?user_id=${user.id}`, { headers: { Accept: "application/json" } })
      .then((r) => r.json()).then((d) => setMode((d?.user || d)?.work_mode || "onsite")).catch(() => {});
    fetch(`${API}/intern/work-mode-requests`, { headers: { Accept: "application/json" } })
      .then((r) => r.json()).then((d) => { if (Array.isArray(d)) setReqs(d); }).catch(() => {});
  };
  useEffect(() => {
    load();
    return liveRefresh(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mode) return null;
  const wfh = mode === "offsite";
  const want = wfh ? "onsite" : "offsite";
  const pending = reqs.find((r) => r.status === "pending");
  const last = reqs[0];

  const send = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData();
      fd.append("requested_mode", want);
      fd.append("reason", form.reason);
      fd.append("in_moa", form.in_moa ? "1" : "0");
      if (form.file) fd.append("file", form.file);
      const res = await fetch(`${API}/intern/work-mode-requests`, { method: "POST", headers: { Accept: "application/json" }, body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || (data.errors && Object.values(data.errors)[0]?.[0]) || "Something went wrong.");
      setOpen(false);
      setForm({ reason: "", in_moa: false, file: null });
      setMsg({ type: "success", text: data.message });
      load();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!pending || !window.confirm("Cancel your work arrangement request?")) return;
    const res = await fetch(`${API}/intern/work-mode-requests/${pending.id}`, { method: "DELETE", headers: { Accept: "application/json" } });
    const data = await res.json().catch(() => ({}));
    setMsg({ type: res.ok ? "success" : "error", text: data.message || "Something went wrong." });
    load();
  };

  return (
    <div className="ix-card wm-card">
      <div className="wm-row">
        <span className={wfh ? "wm-ic wfh" : "wm-ic"}><Icon name={wfh ? "globe" : "home"} size={18} /></span>
        <div className="wm-text">
          <strong>Work arrangement: {wfh ? "Work from home (approved)" : "Onsite"}</strong>
          <small>
            {pending
              ? `Your request to ${pending.requested_mode === "offsite" ? "work from home" : "go back onsite"} is waiting for your OJT coordinator.`
              : wfh
                ? "You can submit online attendance for the days you work from home."
                : "Online attendance is for approved work-from-home. Request it with the letter from your HTE."}
            {!pending && last?.status === "rejected" && ` Your last request was not approved${last.remarks ? `: ${last.remarks}` : "."}`}
          </small>
        </div>
        {pending
          ? <button type="button" className="ix-b ghost sm" onClick={cancel}>Cancel request</button>
          : <button type="button" className="ix-b primary sm" onClick={() => { setMsg(null); setOpen(true); }}>
              {wfh ? "Request to go back onsite" : "Request WFH"}
            </button>}
      </div>
      <Msg msg={msg} />

      {open && (
        <Modal title={wfh ? "Go back onsite" : "Request work from home"} sub="Your OJT coordinator reviews this request." onClose={() => setOpen(false)}>
          <form onSubmit={send} className="ix-form">
            <div className="ix-field">
              <label htmlFor="wm-reason">Reason</label>
              <textarea id="wm-reason" rows={3} required maxLength={500} value={form.reason}
                placeholder={wfh ? "e.g. My HTE asked us to report onsite again." : "e.g. My HTE allows remote work every Friday."}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
            </div>
            {!wfh && (
              <>
                <label className="wm-check">
                  <input type="checkbox" checked={form.in_moa} onChange={(e) => setForm((f) => ({ ...f, in_moa: e.target.checked }))} />
                  WFH is already stated in our MOA / Student Internship Contract
                </label>
                {!form.in_moa && (
                  <div className="ix-field">
                    <label>Letter from the HTE approving the WFH</label>
                    <label className={form.file ? "ix-drop has-file" : "ix-drop"}>
                      <input type="file" accept={ACCEPT} onChange={(e) => setForm((f) => ({ ...f, file: e.target.files[0] || null }))} />
                      <span className="ix-drop-icon"><Icon name={form.file ? "file" : "upload"} size={22} /></span>
                      <span className="ix-drop-text">
                        {form.file ? form.file.name : "Click to choose a file"}
                        <small>{form.file ? "Click to change" : "PDF, JPG, PNG, DOC or DOCX"}</small>
                      </span>
                    </label>
                  </div>
                )}
              </>
            )}
            <button type="submit" className="ix-btn" disabled={busy}>{busy ? "Sending..." : "Send request"}</button>
          </form>
        </Modal>
      )}
      <style>{`
        .ix-content .ix-card.wm-card { margin-bottom: 16px; padding: 12px 16px !important; }
        .wm-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .wm-ic { width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
          background: #fff1e6; color: #ea580c; }
        .wm-ic.wfh { background: #e8f6ea; color: #2e7d32; }
        .wm-text { flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: 2px; }
        .wm-text strong { font-size: 14px; }
        .wm-text small { font-size: 12.5px; color: #6b7280; }
        .wm-check { display: flex; align-items: center; gap: 8px; margin: 4px 0 12px; font-size: 13px; color: #374151; cursor: pointer; }
        .wm-check input { width: 16px; height: 16px; accent-color: #e8582a; }
      `}</style>
    </div>
  );
}

/* ───────────────────────── Submit MOV ───────────────────────── */
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.doc,.docx";

function SubmitMov({ user, unlocked, totalHours, required }) {
  const [tab, setTab] = useState("pre");
  const [movs, setMovs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState(null);
  const [msg, setMsg] = useState(null);
  const [otherTitle, setOtherTitle] = useState("");
  const [otherFile, setOtherFile] = useState(null);
  const [deadlines, setDeadlines] = useState({});   // { "pre:moa": "2026-11-05", ... }

  useEffect(() => {
    const loadDue = () =>
      fetch(`${API}/requirement-deadlines`, { headers: { Accept: "application/json" } })
        .then((r) => r.json())
        .then((d) => { if (Array.isArray(d)) setDeadlines(Object.fromEntries(d.map((x) => [`${x.phase}:${x.requirement}`, x.due_date]))); })
        .catch(() => {});
    fetchMovs(); loadDue();
    return liveRefresh(() => { fetchMovs(); loadDue(); });
    /* eslint-disable-next-line */
  }, []);

  const fetchMovs = async () => {
    try {
      const res = await fetch(`${API}/intern/my-movs?user_id=${user.id}`);
      const data = await res.json();
      setMovs(Array.isArray(data) ? data : []);
    } finally { setLoading(false); }
  };

  const phase = tab; // "pre" | "during" | "post"
  const list = REQUIREMENTS_BY_PHASE[phase] || PRE_REQUIREMENTS;
  const inPhase = (m) => (m.phase || "pre") === phase;
  // newest submission for each requirement (movs come newest first)
  const latest = (key) => movs.find((m) => m.requirement === key && inPhase(m));
  const others = movs.filter((m) => (m.requirement === "others" || !m.requirement) && inPhase(m));
  const doneCount = list.filter((r) => latest(r.key)?.status === "approved").length;

  const upload = async ({ key, title, file }) => {
    setBusyKey(key); setMsg(null);
    try {
      const fd = new FormData();
      fd.append("user_id", user.id);
      fd.append("title", title);
      fd.append("requirement", key);
      fd.append("phase", phase);
      fd.append("file", file);
      const res = await fetch(`${API}/intern/submit-mov`, { method: "POST", headers: { Accept: "application/json" }, body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Upload failed.");
      setMsg({ type: "success", text: data.message });
      await fetchMovs();
      return true;
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
      return false;
    } finally { setBusyKey(null); }
  };

  const removeMov = async (id) => {
    setMsg(null);
    try {
      const res = await fetch(MOV_DELETE_URL(id, user.id), { method: "DELETE", headers: { Accept: "application/json" } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Couldn't remove this file.");
      setMovs((list) => list.filter((x) => x.id !== id));
      setMsg({ type: "success", text: data.message || "Submission removed." });
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    }
  };

  const submitOther = async (e) => {
    e.preventDefault();
    if (!otherFile) { setMsg({ type: "error", text: "Please select a file." }); return; }
    if (await upload({ key: "others", title: otherTitle, file: otherFile })) { setOtherTitle(""); setOtherFile(null); }
  };

  const fileLink = (m) => (
    <a className="ix-link" href={`${STORAGE}${m.file_path}`} target="_blank" rel="noopener noreferrer">
      {m.original_name}
    </a>
  );

  return (
    <>
      <PageHeader title="Submit MOV" sub="Upload your internship requirements for your coordinator to review." />
      <style>{`
        .req-due { display: inline-block; margin-left: 8px; padding: 1px 8px; border-radius: 99px; font-size: 11px; font-weight: 600; vertical-align: 1px; background: #f1f5f9; color: #475569; }
        .req-due.pending { background: #fff4d6; color: #9a5b00; }
        .req-due.rejected { background: #fee2e2; color: #b91c1c; }
      `}</style>

      <div className="req-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "pre"} className={tab === "pre" ? "on" : ""}
          onClick={() => { setTab("pre"); setMsg(null); }}>Pre-Internship</button>
        <button type="button" role="tab" aria-selected={tab === "during"} className={tab === "during" ? "on" : ""}
          onClick={() => { setTab("during"); setMsg(null); }}>During Internship</button>
        <button type="button" role="tab" aria-selected={tab === "post"} className={tab === "post" ? "on" : ""}
          onClick={() => { setTab("post"); setMsg(null); }}>
          {!unlocked && <Icon name="lock" size={14} />} Post-Internship
        </button>
      </div>

      {tab === "post" && !unlocked ? (
        <div className="ix-card">
          <div className="req-locked">
            <span className="req-lock-icon"><Icon name="lock" size={28} /></span>
            <h3>Post-internship requirements are locked</h3>
            <p>
              They open once you complete your required OJT hours. You have rendered{" "}
              <strong>{totalHours}h</strong> of <strong>{required}h</strong>
              {" "}— <strong>{Math.max(Math.round((required - totalHours) * 10) / 10, 0)}h</strong> to go.
            </p>
            <div className="ix-prog"><Bar pct={Math.max(Math.min((totalHours / required) * 100, 100), 0)} /></div>
          </div>
        </div>
      ) : (
        <>
          <Msg msg={msg} />
          <div className="ix-card">
            <div className="req-head">
              <div>
                <div className="ix-card-label">{phase === "pre" ? "Pre-internship requirements" : phase === "during" ? "During the internship" : "Post-internship requirements"}</div>
                <small className="req-sub">{doneCount} of {list.length} approved</small>
              </div>
            </div>
            {loading ? <Spinner /> : (
              <ul className="req-list">
                {list.map((r) => {
                  const m = latest(r.key);
                  const many = movs.filter((x) => x.requirement === r.key && inPhase(x)).length;
                  // reports can be sent again and again; other requirements once (or again after a rejection)
                  const canUpload = r.repeat || !m || m.status === "rejected";
                  const due = dueStatus(deadlines[`${phase}:${r.key}`], r.repeat ? null : m);
                  return (
                    <li key={r.key} className="req-item">
                      <div className="req-main">
                        <strong>
                          {r.label}
                          {due && <span className={`req-due ${due.tone}`}>{due.label}</span>}
                          {r.repeat && many > 0 && <span className="req-due none">{many} submitted</span>}
                        </strong>
                        {r.hint && <small>{r.hint}</small>}
                        {m && <span className="req-file">{fileLink(m)}</span>}
                        {m?.status === "rejected" && m.remarks && <small className="req-reject">Remarks: {m.remarks}</small>}
                      </div>
                      <Badge label={m ? cap(m.status) : "Not submitted"} type={m ? statusType(m.status) : "none"} />
                      {canUpload ? (
                        <label className={`ix-b ${m ? "ghost" : "primary"} sm req-up`} aria-disabled={busyKey === r.key}>
                          <input
                            type="file" accept={ACCEPT} disabled={busyKey !== null}
                            onChange={(e) => {
                              const f = e.target.files[0];
                              e.target.value = "";
                              if (f) upload({ key: r.key, title: r.label, file: f });
                            }}
                          />
                          <Icon name="upload" size={14} /> {busyKey === r.key ? "Uploading..." : r.repeat && m ? "Upload new" : m ? "Re-upload" : "Upload"}
                        </label>
                      ) : m.status === "pending" ? (
                        <RemoveBtn onConfirm={() => removeMov(m.id)} />
                      ) : <span className="req-spacer" />}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="intern-split mov-split" style={{ marginTop: 20 }}>
            <div className="ix-card">
              <div className="ix-card-label">Others</div>
              <small className="req-sub">Any other document you need to submit.</small>
              <form onSubmit={submitOther} className="ix-form" style={{ marginTop: 12 }}>
                <div className="ix-field">
                  <label htmlFor="ix-title">Document title</label>
                  <input id="ix-title" type="text" required placeholder="e.g. Company ID copy"
                    value={otherTitle} onChange={(e) => setOtherTitle(e.target.value)} />
                </div>
                <div className="ix-field">
                  <label>File</label>
                  <label className={otherFile ? "ix-drop has-file" : "ix-drop"}>
                    <input type="file" accept={ACCEPT} onChange={(e) => setOtherFile(e.target.files[0] || null)} />
                    <span className="ix-drop-icon"><Icon name={otherFile ? "file" : "upload"} size={22} /></span>
                    <span className="ix-drop-text">
                      {otherFile ? otherFile.name : "Click to choose a file"}
                      <small>{otherFile ? "Click to change" : "PDF, JPG, PNG, DOC or DOCX"}</small>
                    </span>
                  </label>
                </div>
                <button type="submit" disabled={busyKey !== null} className="ix-btn">
                  {busyKey === "others" ? "Uploading..." : "Submit"}
                </button>
              </form>
            </div>

            <div className="ix-card os-card">
              <div className="os-head">
                <span className="os-title"><Icon name="folder" size={18} /> Other documents</span>
                <span className="os-count">{others.length}</span>
              </div>
              {loading ? <Spinner /> : (
                <Table
                  headers={["Document", "Status", "Remarks", ""]}
                  rows={others.map((m) => [
                    <div className="mov-doc">
                      <strong className="os-date">{m.title}</strong>
                      {fileLink(m)}
                      <small className="os-remarks">
                        {new Date(m.created_at).toLocaleDateString("en-PH")}
                      </small>
                    </div>,
                    <span className={`os-status ${statusType(m.status)}`}>{cap(m.status)}</span>,
                    <span className="os-remarks">{m.remarks || "—"}</span>,
                    m.status === "pending" ? <RemoveBtn onConfirm={() => removeMov(m.id)} /> : "",
                  ])}
                  empty="No other documents yet."
                />
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* ───────────────────────── My DTR (CS Form 48 layout) ───────────────────────── */
// Same CSS is used for the on-screen preview and the printed copy.
export const CS48_CSS = `
.cs48 { font-family: 'Times New Roman', Times, serif; color: #000; font-size: 11px; line-height: 1.25; background: #fff; min-width: 0; }
.cs48 .cs-top { font-size: 12px; }
.cs48 h2 { margin: 4px 0 6px; text-align: center; font-size: 17px; font-weight: 700; letter-spacing: .3px; color: #000; }
.cs48 .cs-name, .cs48 .cs-office { text-align: center; font-size: 12.5px; text-transform: uppercase; border-bottom: 1px solid #000; padding: 1px 0; margin: 0 6px; min-height: 16px; }
.cs48 .cs-cap { text-align: center; font-size: 8.5px; margin: 1px 0 4px; }
.cs48 .cs-row { display: flex; justify-content: space-between; gap: 6px; margin: 1px 0; font-size: 11px; }
.cs48 .cs-row .ln { flex: 1; border-bottom: 1px solid #000; text-align: center; min-width: 40px; }
.cs48 table { width: 100%; border-collapse: collapse; margin-top: 6px; table-layout: fixed; }
.cs48 th, .cs48 td { border: 1px solid #000 !important; padding: 1px 2px !important; text-align: center; font-size: 10px !important; height: 15px; color: #000 !important; background: transparent !important;
  text-transform: none !important; letter-spacing: 0 !important; font-weight: 400 !important; white-space: nowrap; overflow: hidden; font-family: inherit !important; }
.cs48 thead th { font-weight: 700 !important; border-bottom: 1px solid #000 !important; }
.cs48 thead tr:first-child th { border-top: 2px solid #000 !important; }
.cs48 th.dh, .cs48 td.d { width: 8%; font-weight: 400 !important; }
.cs48 td.d { text-align: center; }
.cs48 td.wk { letter-spacing: .5px !important; }
.cs48 tfoot td { height: 17px; }
.cs48 tfoot td.l { text-align: left; padding-left: 4px !important; }
.cs48 tbody tr:hover, .cs48 tr:hover { background: transparent !important; }
.cs48 table, .cs48 tr { border: 0; }
.cs48 .cs-tot { text-align: right; margin: 5px 2px 0; font-size: 11px; }
.cs48 .cs-cert { margin: 10px 0 18px; font-size: 11px; }
.cs48 .cs-sig { border-top: 1px solid #000; text-align: center; font-size: 8.5px; margin: 0 4px; padding-top: 1px; }
.cs48 .cs-ver { margin: 10px 0 24px; font-size: 11px; }
.cs48 .cs-sup { text-align: center; font-weight: 700; font-size: 11px; margin-top: 4px; }
.cs48 .cs-supcap { text-align: center; font-style: italic; font-size: 10px; }

/* on-screen only: two copies side by side */
.cs48-pair { display: flex; gap: 16px; align-items: flex-start; margin-top: 10px; }
.cs48-pair > .cs48-card { flex: 1; min-width: 0; padding: 16px 18px; background: #fff; border-radius: 8px; box-shadow: 0 2px 14px rgba(0,0,0,.12); }
@media (max-width: 1100px) {
  .cs48-pair { flex-direction: column; }
  .cs48-pair > .cs48-card { width: 100%; max-width: 560px; margin: 0 auto; }
}
`;

// "8:05 am" in Manila time
export const t12 = (iso) =>
  iso ? new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Manila" }).toLowerCase() : "";

// Official hours printed on the form, per DTR type
export const OFFICIAL_HOURS = { four: "8:00–12:00, 1:00–5:00", two: "8:00 AM–5:00 PM (lunch 12–1)" };

// rows: { d, amIn, amOut, pmIn, pmOut } or { d, weekend: "SATURDAY" }
export function dtrFormHtml({ name, office, periodLabel, officialHours = "", rows, totalHrs, undertimeMin = 0, tardyMin = 0 }) {
  const hm = (m) => (m > 0 ? [Math.floor(m / 60), m % 60] : ["", ""]);
  const blank = '<tr><td class="d"></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>';
  const body = rows.map((r) => r.weekend
    ? `<tr><td class="d">${r.d}</td><td colspan="4" class="wk">${r.weekend}</td><td>-</td><td>-</td></tr>`
    : `<tr><td class="d">${r.d}</td><td>${r.amIn || ""}</td><td>${r.amOut || ""}</td><td>${r.pmIn || ""}</td><td>${r.pmOut || ""}</td><td>${hm(r.ut || 0)[0]}</td><td>${hm(r.ut || 0)[1]}</td></tr>`
  ).join("") + blank.repeat(Math.max(31 - rows.length, 0));

  return `<div class="cs48">
    <div class="cs-top">CS Form 48</div>
    <h2>DAILY TIME RECORD</h2>
    <div class="cs-name">${esc(name || "")}</div>
    <div class="cs-cap">Name in Print</div>
    <div class="cs-office">${esc(office || "")}</div>
    <div class="cs-cap">OFFICE</div>
    <div class="cs-row"><span>For the period of</span><span class="ln">${esc(periodLabel)}</span></div>
    <div class="cs-row"><span>Official Hours of arrival</span><span class="ln">${esc(officialHours)}</span><span>(Regular days)</span><span class="ln"></span></div>
    <div class="cs-row"><span>and departure days</span><span class="ln"></span><span>(Saturdays)</span><span class="ln"></span></div>
    <table>
      <thead>
        <tr><th rowspan="2" class="dh">Day</th><th colspan="2">AM</th><th colspan="2">PM</th><th colspan="2">Undertime / Tardiness</th></tr>
        <tr><th>Arrival</th><th>Departure</th><th>Arrival</th><th>Departure</th><th>Hours</th><th>Minutes</th></tr>
      </thead>
      <tbody>${body}</tbody>
      <tfoot>
        <tr><td rowspan="2">Total</td><td colspan="4" class="l">Undertime</td><td>${hm(undertimeMin)[0] || "-"}</td><td>${hm(undertimeMin)[1] || "-"}</td></tr>
        <tr><td colspan="4" class="l">Tardiness</td><td>${hm(tardyMin)[0] || "-"}</td><td>${hm(tardyMin)[1] || "-"}</td></tr>
      </tfoot>
    </table>
    <div class="cs-tot">Total hours rendered: <b>${totalHrs} hrs</b></div>
    <div class="cs-cert">I certify on my honor that the above is true and correct record of the hours of work performed, record of which was made daily at the time of arrival and departure from the office.</div>
    <div class="cs-sig">(Signature of Intern)</div>
    <div class="cs-ver">VERIFIED as to the prescribed office hours:</div>
    <div class="cs-sig">(Supervisor / OJT Coordinator)</div>
  </div>`;
}

/* Builds the DTR rows for one intern and one period.
   mode "two":  AM arrival + PM departure only (lunch break not counted in the hours)
   mode "four": AM arrival / AM departure / PM arrival / PM departure
   The times shown are the real tap times. Each day's Undertime/Tardiness column is the
   minutes late (no grace period) plus the minutes left early, measured against SCHEDULE. */
/* ───────── MOA notice: taps don't count until the MOA is approved (Internship FAQ #6–7) ─────────
   A small card that floats at the bottom-right of the screen. The X hides it until the next sign-in,
   or until the MOA status changes (e.g. pending -> rejected), whichever comes first.
   The "closed" mark is tied to this sign-in's token: logging out keeps the browser tab's storage,
   but a new sign-in gets a new token, so the notice comes back.                                   */
const MOA_HIDE_KEY = "mytrack_moa_notice_hidden";
const MOA_TOAST_CSS = `
        .moa-toast {
          position: fixed; right: 24px; bottom: 24px; z-index: 60; width: min(360px, calc(100vw - 32px));
          display: flex; gap: 12px; align-items: flex-start; padding: 14px 14px 14px 16px;
          background: #fff; border-radius: 14px; border-left: 4px solid #f59e0b;
          box-shadow: 0 18px 40px rgba(15,23,42,0.18), 0 2px 6px rgba(15,23,42,0.06);
          animation: moa-in .35s cubic-bezier(.2,.8,.2,1);
        }
        .moa-toast.rejected { border-left-color: #dc2626; }
        .moa-toast-ic { flex-shrink: 0; width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center;
          background: #fef3c7; color: #b45309; }
        .moa-toast.rejected .moa-toast-ic { background: #fee2e2; color: #b91c1c; }
        .moa-toast-body { flex: 1; min-width: 0; }
        .moa-toast-body strong { display: block; font-size: 14px; color: #111827; margin-bottom: 3px; }
        .moa-toast-body p { margin: 0; font-size: 12.5px; line-height: 1.45; color: #4b5563; }
        .moa-toast-link { margin-top: 8px; padding: 0; border: 0; background: none; cursor: pointer; font: inherit;
          font-size: 12.5px; font-weight: 600; color: #ea580c; display: inline-flex; align-items: center; gap: 4px; }
        .moa-toast-link:hover { text-decoration: underline; }
        .moa-toast-x { flex-shrink: 0; width: 28px; height: 28px; margin: -4px -4px 0 0; border: 0; border-radius: 8px; background: none;
          color: #9ca3af; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .moa-toast-x:hover { background: #f3f4f6; color: #111827; }
        .moa-toast-x:focus-visible, .moa-toast-link:focus-visible { outline: 2px solid #f97316; outline-offset: 2px; }
        @keyframes moa-in { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
        @media (max-width: 600px) { .moa-toast { right: 16px; bottom: 16px; } }
        @media (prefers-reduced-motion: reduce) { .moa-toast { animation: none; } }
        .moa-due { margin: 2px 0 0; padding-left: 16px; font-size: 12.5px; color: #4b5563; line-height: 1.5; }
`;

function MoaNotice({ user, go }) {
  const [moa, setMoa] = useState(null);   // null = loading | "none" | "pending" | "rejected" | "approved"
  const [dueItems, setDueItems] = useState([]);   // requirements overdue or due within 3 days, not submitted
  const [hidden, setHidden] = useState(() => {
    try { return sessionStorage.getItem(MOA_HIDE_KEY) || ""; } catch { return ""; }
  });

  useEffect(() => {
    const load = () =>
      fetch(`${API}/intern/my-movs?user_id=${user.id}`, { headers: { Accept: "application/json" } })
        .then((r) => r.json())
        .then((list) => {
          if (!Array.isArray(list)) return;
          const m = list.filter((x) => x.requirement === "moa");
          setMoa(m.some((x) => x.status === "approved") ? "approved"
            : m.some((x) => x.status === "pending") ? "pending"
            : m.length ? "rejected" : "none");
          // due dates set by the coordinator (pre- and during-internship requirements)
          fetch(`${API}/requirement-deadlines`, { headers: { Accept: "application/json" } })
            .then((r) => r.json())
            .then((dl) => {
              if (!Array.isArray(dl)) return;
              const items = [];
              dl.filter((d) => d.phase !== "post").forEach((d) => {
                const req = (REQUIREMENTS_BY_PHASE[d.phase] || []).find((r) => r.key === d.requirement);
                if (!req || req.repeat) return;
                const sub = list.find((x) => x.requirement === d.requirement && (x.phase || "pre") === d.phase);
                const st = dueStatus(d.due_date, sub);
                if (st && st.tone !== "none") items.push({ key: d.requirement, label: req.label, status: st.label, overdue: st.tone === "rejected" });
              });
              setDueItems(items);
            })
            .catch(() => {});
        })
        .catch(() => {});
    load();
    return liveRefresh(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "<this sign-in's token>|<MOA status>" — a new sign-in or a new status shows the notice again
  const mark = `${user.token || user.id}|${moa}`;
  const close = () => {
    setHidden(mark);
    try { sessionStorage.setItem(MOA_HIDE_KEY, mark); } catch { /* ignore */ }
  };

  // the MOA comes first; once it is approved, remind about requirements that are due
  const dueMark = `${user.token || user.id}|due|${dueItems.map((d) => d.key + d.status).join(",")}`;
  if (moa === "approved" && dueItems.length && hidden !== dueMark) {
    const overdue = dueItems.some((d) => d.overdue);
    const closeDue = () => {
      setHidden(dueMark);
      try { sessionStorage.setItem(MOA_HIDE_KEY, dueMark); } catch { /* ignore */ }
    };
    return (
      <div className={`moa-toast ${overdue ? "rejected" : "pending"}`} role="status" aria-live="polite">
        <span className="moa-toast-ic"><Icon name="calendar" size={18} /></span>
        <div className="moa-toast-body">
          <strong>{overdue ? "Requirements overdue" : "Requirements due soon"}</strong>
          <ul className="moa-due">
            {dueItems.slice(0, 3).map((d) => <li key={d.key}>{d.label} — <b>{d.status}</b></li>)}
            {dueItems.length > 3 && <li>+{dueItems.length - 3} more</li>}
          </ul>
          <button type="button" className="moa-toast-link" onClick={() => go("/intern/movs")}>
            <Icon name="upload" size={13} /> Go to Submit MOV
          </button>
        </div>
        <button type="button" className="moa-toast-x" onClick={closeDue} aria-label="Close notice">
          <Icon name="x" size={16} />
        </button>
        <style>{MOA_TOAST_CSS}</style>
      </div>
    );
  }

  if (!moa || moa === "approved" || hidden === mark) return null;

  const TEXT = {
    none: ["Upload your MOA", "Upload your approved and notarized MOA. The kiosk won't count your taps until your OJT coordinator approves it."],
    pending: ["MOA waiting for approval", "Your OJT coordinator is reviewing your MOA. The kiosk won't count your taps until it is approved."],
    rejected: ["MOA not approved", "Your MOA was not approved. Upload a corrected copy — the kiosk won't count your taps until it is approved."],
  };
  const [title, body] = TEXT[moa];

  return (
    <div className={`moa-toast ${moa}`} role="status" aria-live="polite">
      <span className="moa-toast-ic"><Icon name="warn" size={18} /></span>
      <div className="moa-toast-body">
        <strong>{title}</strong>
        <p>{body}</p>
        {moa !== "pending" && (
          <button type="button" className="moa-toast-link" onClick={() => { go("/intern/movs"); }}>
            <Icon name="upload" size={13} /> Go to Submit MOV
          </button>
        )}
      </div>
      <button type="button" className="moa-toast-x" onClick={close} aria-label="Close notice">
        <Icon name="x" size={16} />
      </button>
      <style>{MOA_TOAST_CSS}</style>
    </div>
  );
}

/* ───────── DTR certification by the HTE supervisor (shown on every DTR page) ─────────
   intern = the intern; from/to = "YYYY-MM-DD"; canCertify = the signed-in user is a supervisor */
export function CertifyBar({ intern, from, to, canCertify = false, hasDays = true, currentHours = null }) {
  const me = JSON.parse(sessionStorage.getItem("user") || "{}");
  const [certs, setCerts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = () =>
    fetch(`${API}/dtr-certifications?user_id=${intern.id}`, { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setCerts(d); })
      .catch(() => {});
  useEffect(() => {
    setMsg(null);
    load();
    return liveRefresh(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intern.id]);

  const cert = certs.find((c) => String(c.period_from).slice(0, 10) === from && String(c.period_to).slice(0, 10) === to);
  const ended = to < todayManila();
  // the hours can still change after certifying (e.g. a late time correction): then the certification is out of date
  const changed = !!cert && currentHours !== null && Math.abs(Number(cert.hours) - Number(currentHours)) > 0.06;

  const call = async (method, url, body) => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`${API}${url}`, {
        method, headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Something went wrong.");
      setMsg({ type: "success", text: data.message });
      load();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    } finally {
      setBusy(false);
    }
  };

  const when = (v) => new Date(v).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="dtr-cert">
      {cert ? (
        <div className="dtr-cert-row ok">
          <Icon name="check" size={18} />
          <span>
            <strong>Certified</strong> by {cert.certified_by_name || "the supervisor"} on {when(cert.certified_at)}
            {" · "}{Number(cert.hours).toFixed(1)}h{cert.remarks ? ` · ${cert.remarks}` : ""}
          </span>
          {changed && (
            <span className="dtr-cert-changed">
              <Icon name="warn" size={14} /> Hours changed after certification (now {Number(currentHours).toFixed(1)}h)
              {canCertify ? " — undo, then certify again." : " — the supervisor needs to certify it again."}
            </span>
          )}
          {canCertify && Number(cert.certified_by) === Number(me.id) && (
            <button type="button" className="ix-b ghost sm" disabled={busy}
              onClick={() => window.confirm("Remove the certification of this DTR period?") && call("DELETE", `/supervisor/dtr-certifications/${cert.id}`)}>
              Undo
            </button>
          )}
        </div>
      ) : (
        <div className="dtr-cert-row">
          <Icon name="info" size={18} />
          <span>
            {canCertify
              ? (ended ? "Check the DTR below, then certify that it is true and correct." : "You can certify this period once it has ended.")
              : "Not yet certified by the HTE supervisor."}
          </span>
          {canCertify && (
            <button type="button" className="ix-b primary sm" disabled={busy || !ended || !hasDays}
              onClick={() => window.confirm(`Certify ${intern.name}'s DTR for this period as true and correct?`)
                && call("POST", "/supervisor/dtr-certifications", { user_id: intern.id, from, to })}>
              <Icon name="check" size={14} /> Certify DTR
            </button>
          )}
        </div>
      )}
      {msg && <Msg msg={msg} />}
      <style>{`
        .dtr-cert { margin: 0 0 14px; }
        .dtr-cert-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 14px; border-radius: 10px;
          background: #fff7ed; color: #9a3412; font-size: 13.5px; }
        .dtr-cert-row.ok { background: #ecfdf5; color: #065f46; }
        .dtr-cert-changed { flex-basis: 100%; display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; color: #b45309; }
        .dtr-cert-row > span { flex: 1; min-width: 200px; }
        .dtr-cert .ix-msg { margin-top: 8px; }
      `}</style>
    </div>
  );
}

/* Holidays / non-working days from the admin's Calendar: { "2026-11-01": "All Saints' Day", ... } */
export function useHolidays() {
  const [holidays, setHolidays] = useState({});
  useEffect(() => {
    fetch(`${API}/calendar`, { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((list) => {
        if (!Array.isArray(list)) return;
        const map = {};
        list.forEach((e) => { map[String(e.date).slice(0, 10)] = e.title || "Holiday"; });
        setHolidays(map);
      })
      .catch(() => {});
  }, []);
  return holidays;
}

export function buildDtr({ records, month, from, to, mode, holidays = {} }) {
  const S = SCHEDULE;
  const mins = (h) => Math.max(Math.floor(h * 60 + 1e-6), 0);   // hours → whole minutes, never negative
  const inRange = records.filter((r) => {
    if (!r.date?.startsWith(month)) return false;
    const d = Number(r.date.slice(8, 10));
    return d >= from && d <= to;
  });
  const byDate = sessionsByDate(inRange);
  const totalHrs = Math.round(Object.values(byDate).reduce((s, x) => s + dayHours(x), 0) * 10) / 10;
  let tardyMin = 0;
  let undertimeMin = 0;

  const formRows = Array.from({ length: to - from + 1 }, (_, i) => {
    const d = from + i;
    const iso = `${month}-${String(d).padStart(2, "0")}`;
    const s = byDate[iso] || [];
    const wi = weekdayIdx(iso);
    // a holiday in the Calendar is printed on the DTR (and is not counted)
    if (!s.length && holidays[iso]) return { d, weekend: String(holidays[iso]).toUpperCase().slice(0, 28) };
    if (!s.length) return wi >= 5 ? { d, weekend: wi === 5 ? "SATURDAY" : "SUNDAY" } : { d };
    if (s.every((x) => x.online)) return { d, weekend: "ONLINE (approved)" };

    let late = 0;
    let early = 0;
    let row;
    if (mode === "two") {
      const last = [...s].reverse().find((x) => x.out);
      late = mins(manilaHour(s[0].in) - S.amIn);
      if (last) early = mins(S.pmOut - manilaHour(last.out));
      row = { d, amIn: t12(s[0].in), pmOut: last ? t12(last.out) : "" };
    } else {
      const am = s.find((x) => manilaHour(x.in) < 12);
      const pm = s.find((x) => x !== am);
      if (am) late += mins(manilaHour(am.in) - S.amIn);
      if (am?.out) early += mins(S.amOut - manilaHour(am.out));
      if (pm) late += mins(manilaHour(pm.in) - S.pmIn);
      if (pm?.out) early += mins(S.pmOut - manilaHour(pm.out));
      row = {
        d,
        amIn: am ? t12(am.in) : "",
        amOut: am?.out ? t12(am.out) : "",
        pmIn: pm ? t12(pm.in) : "",
        pmOut: pm?.out ? t12(pm.out) : "",
      };
    }
    tardyMin += late;
    undertimeMin += early;
    return { ...row, ut: late + early };
  });

  return { formRows, totalHrs, daysPresent: Object.keys(byDate).length, tardyMin, undertimeMin };
}

function MyDtr({ user, records, loading, mode }) {
  // Month and year start on the current month; the period starts blank.
  // Nothing is shown until the user picks a period and clicks "Display DTR".
  const nowManila = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const [year, setYear] = useState(nowManila.slice(0, 4));
  const [mon, setMon] = useState(nowManila.slice(5, 7));
  const [period, setPeriod] = useState("");       // "" | "first" | "second" | "full"
  const [shown, setShown] = useState(null);       // { year, mon, period } of the DTR on screen
  const [err, setErr] = useState("");

  const MONTHS = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1).padStart(2, "0"),
    label: new Date(2000, i, 1).toLocaleDateString("en-US", { month: "long" }),
  }));
  const years = [...new Set([nowManila.slice(0, 4), year, ...records.map((r) => String(r.date || "").slice(0, 4)).filter(Boolean)])]
    .sort((a, b) => b.localeCompare(a));
  const periodsOf = (y, m) => {
    const last = new Date(Number(y), Number(m), 0).getDate();   // days in that month
    return [
      { key: "first", label: "1–15", from: 1, to: 15 },
      { key: "second", label: `16–${last}`, from: 16, to: last },
      { key: "full", label: `Whole month (1–${last})`, from: 1, to: last },
    ];
  };

  const display = () => {
    if (!period) { setErr("Choose a period first."); return; }
    setErr("");
    setShown({ year, mon, period });
  };

  const holidays = useHolidays();

  // everything below is for the DTR that was displayed (not the dropdowns being changed)
  let view = null;
  if (shown) {
    const month = `${shown.year}-${shown.mon}`;
    const range = periodsOf(shown.year, shown.mon).find((p) => p.key === shown.period);
    const { formRows, totalHrs, daysPresent, tardyMin, undertimeMin } =
      buildDtr({ records, month, from: range.from, to: range.to, mode, holidays });
    const monthName = MONTHS.find((m) => m.value === shown.mon)?.label || "";
    const periodLabel = `${monthName} ${range.from} - ${range.to}, ${shown.year}`;
    const formHtml = dtrFormHtml({
      name: user.name, office: "Caraga State University - MAIN", periodLabel,
      officialHours: OFFICIAL_HOURS[mode], rows: formRows, totalHrs, tardyMin, undertimeMin,
    });
    view = { month, range, totalHrs, daysPresent, monthName, formHtml };
  }

  const handlePrint = () => {
    if (!view) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>DTR - ${esc(user.name)}</title><style>
      @page { size: A4 portrait; margin: 8mm; }
      body { margin: 0; padding: 0; }
      .sheet { display: flex; gap: 10mm; align-items: flex-start; }
      .sheet .cs48 { flex: 1; }
      ${CS48_CSS}
    </style></head><body><div class="sheet">${view.formHtml}${view.formHtml}</div></body></html>`);
    w.document.close(); w.print();
  };

  return (
    <>
      <style>{CS48_CSS}</style>
      <PageHeader title="My DTR" sub="Your Daily Time Record. Choose the month, year and period, then click Display DTR." />
      <div className="ix-card">
        <div className="dtr-pick">
          <label className="fl-field">
            <span className="fl-label">Month *</span>
            <select value={mon} onChange={(e) => setMon(e.target.value)}>
              {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
          <label className="fl-field">
            <span className="fl-label">Year *</span>
            <select value={year} onChange={(e) => setYear(e.target.value)}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label className={period ? "fl-field" : "fl-field empty"}>
            <span className="fl-label">Period *</span>
            <select value={period} onChange={(e) => { setPeriod(e.target.value); setErr(""); }}>
              <option value="" disabled hidden></option>
              {periodsOf(year, mon).map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </label>
          <button type="button" className="fl-btn" onClick={display}>
            <Icon name="send" size={18} /> Display DTR
          </button>
        </div>
        {err && <div className="fl-err">{err}</div>}

        {!view ? (
          <div className="dtr-wait">
            <span className="dtr-wait-ic"><Icon name="file" size={26} /></span>
            <strong>No DTR displayed yet</strong>
            <p>Choose a period, then click <b>Display DTR</b>.</p>
          </div>
        ) : (
          <>
            <div className="dtr-shown-head">
              <div className="req-dtr-meta">
                <span><strong>{view.monthName} {shown.year}</strong> · {view.range.label}</span>
                <span>{DTR_MODES[mode]}</span>
                <span>{view.daysPresent} day{view.daysPresent === 1 ? "" : "s"} present</span>
                <span>Total: <strong>{view.totalHrs}h</strong></span>
              </div>
              <button type="button" className="ix-b primary" onClick={handlePrint} disabled={!view.daysPresent}>
                <Icon name="print" size={16} /> Print DTR
              </button>
            </div>
            <CertifyBar
              intern={user}
              from={`${view.month}-${String(view.range.from).padStart(2, "0")}`}
              to={`${view.month}-${String(view.range.to).padStart(2, "0")}`}
              currentHours={view.totalHrs}
            />
            {loading ? <Spinner /> : (
              <div className="cs48-pair">
                <div className="cs48-card" dangerouslySetInnerHTML={{ __html: view.formHtml }} />
                <div className="cs48-card" dangerouslySetInnerHTML={{ __html: view.formHtml }} />
              </div>
            )}
          </>
        )}
      </div>
      <style>{DTR_PICK_CSS}</style>
    </>
  );
}

/* Month / Year / Period fields + "Display DTR" button (used on every DTR page) */
export const DTR_PICK_CSS = `
        .dtr-pick { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) auto; gap: 12px; align-items: stretch; }
        .fl-field { position: relative; display: block; margin: 0; }
        .fl-field select {
          width: 100%; height: 56px; padding: 18px 40px 8px 14px; border: 1px solid #c4c4c4; border-radius: 6px;
          background: #fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24'%3E%3Cpath d='M7 10l5 5 5-5z' fill='%23757575'/%3E%3C/svg%3E") no-repeat right 14px center;
          appearance: none; -webkit-appearance: none; font: inherit; font-size: 15px; color: #1f2937; cursor: pointer;
        }
        .fl-field select:hover { border-color: #6b7280; }
        .fl-field select:focus { outline: none; border: 2px solid #f97316; padding: 17px 39px 7px 13px; }
        .fl-label { position: absolute; left: 14px; top: 7px; font-size: 11.5px; color: #6b7280; pointer-events: none; transition: all .15s; }
        .fl-field:focus-within .fl-label { color: #ea580c; }
        /* blank period: the label sits in the middle like a placeholder */
        .fl-field.empty .fl-label { top: 50%; transform: translateY(-50%); font-size: 15px; color: #6b7280; }
        .fl-field.empty:focus-within .fl-label { top: 7px; transform: none; font-size: 11.5px; color: #ea580c; }
        .fl-btn {
          height: 56px; padding: 0 20px; border: 1px solid #f97316; border-radius: 6px; background: #fff; color: #ea580c;
          font: inherit; font-size: 14.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase;
          display: inline-flex; align-items: center; gap: 10px; cursor: pointer; white-space: nowrap; transition: background .15s;
        }
        .fl-btn:hover { background: #fff7ed; }
        .fl-btn:focus-visible { outline: 2px solid #f97316; outline-offset: 2px; }
        .fl-err { margin-top: 8px; font-size: 13px; color: #dc2626; }
        .dtr-wait { padding: 48px 20px 36px; text-align: center; color: #6b7280; }
        .dtr-wait-ic { width: 56px; height: 56px; margin: 0 auto 12px; border-radius: 50%; background: #fdeee7; color: #e8582a;
          display: flex; align-items: center; justify-content: center; }
        .dtr-wait strong { display: block; font-size: 15px; color: #1f2937; }
        .dtr-wait p { margin: 4px 0 0; font-size: 13px; }
        .dtr-shown-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin: 18px 0 10px; }
        .dtr-shown-head .req-dtr-meta { margin: 0; }
        @media (max-width: 800px) { .dtr-pick { grid-template-columns: 1fr 1fr; } .fl-btn { grid-column: 1 / -1; justify-content: center; } }
`;

/* ───────────────────────── NFC card application ───────────────────────── */
const STEPS = ["Submitted", "Approved", "Card issued"];
const DONE_COUNT = { pending: 1, approved: 2, issued: 3 };
const STATUS_TEXT = {
  pending: "Waiting for your OJT coordinator to review your request.",
  approved: "Approved! Your card is being prepared. Your OJT coordinator will link it to your account.",
  issued: "Your card has been issued and linked to your account.",
};

function NfcApply({ user }) {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [type, setType] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    try {
      const res = await fetch(`${API}/intern/nfc-request?user_id=${user.id}`, { headers: { Accept: "application/json" } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not load your NFC card status.");
      setInfo(data);
      setError(null);
    } catch (e) {
      setError(
        e instanceof SyntaxError || e instanceof TypeError
          ? "Couldn't reach the NFC card service. Please try again later."
          : e.message
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    return liveRefresh(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const req = info?.request;
  const status = req?.status;
  const hasCard = !!info?.has_card;
  const active = status === "pending" || status === "approved";
  const types = hasCard ? ["Lost card", "Damaged card", "Replacement"] : ["First NFC card"];
  const chosen = types.includes(type) ? type : types[0];

  const submit = async (e) => {
    e.preventDefault(); setSubmitting(true); setMsg(null);
    try {
      const res = await fetch(`${API}/intern/nfc-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ user_id: user.id, type: chosen, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not submit your request.");
      setMsg({ type: "success", text: data.message || "Request submitted!" });
      setNotes("");
      load();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof SyntaxError ? "The NFC card service isn't available yet." : err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader title="NFC Card" sub="Apply for your attendance card and track its status." />
      {loading ? <Spinner /> : error ? (
        <div className="ix-alert"><Icon name="warn" size={18} /> {error}</div>
      ) : (
        <div className="nfc-page">
          {/* 1 · card preview */}
          <div className={`nfc-hero ${hasCard ? "linked" : ""}`}>
            <div className="nfc-plastic" aria-hidden="true">
              <span className="nfc-chip" />
              <Icon name="card" size={22} />
              <b>{hasCard ? `•••• ${String(info.uid || "").slice(-4) || "••••"}` : "No card yet"}</b>
            </div>
            <div className="nfc-hero-text">
              <span className={`nfc-state ${hasCard ? "ok" : ""}`}>
                {hasCard ? "Card linked" : "Not linked"}
              </span>
              <h3>{hasCard ? "Your NFC card is ready to use" : "You don't have an NFC card yet"}</h3>
              <p>
                {hasCard
                  ? "Tap it on the reader to log your attendance."
                  : "Apply below and your OJT coordinator will get your card ready."}
              </p>
            </div>
          </div>

          {/* 2 · latest request */}
          {req && (
            <div className="ix-card nfc-req">
              <div className="nfc-req-head">
                <div className="ix-card-label">Your latest request</div>
                <div className="ix-req-meta">
                  <span className="ix-chip">{req.type || "NFC card"}</span>
                  {req.created_at && (
                    <span className="ix-muted">
                      Applied {new Date(req.created_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}
                    </span>
                  )}
                </div>
              </div>

              {status === "rejected" ? (
                <div className="ix-msg error" style={{ marginTop: 14, marginBottom: 0 }}>
                  Your request wasn't approved.{req.remarks ? ` Remarks: ${req.remarks}` : ""} You can apply again in the form below.
                </div>
              ) : (
                <>
                  <ol className="ix-steps">
                    {STEPS.map((label, i) => {
                      const done = DONE_COUNT[status] ?? 0;
                      return (
                        <li key={label} className={i < done ? "done" : i === done ? "current" : ""}>
                          <span className="ix-step-dot">{i < done ? <Icon name="check" size={16} /> : i + 1}</span>
                          <span>{label}</span>
                        </li>
                      );
                    })}
                  </ol>
                  <div className="ix-step-text">{STATUS_TEXT[status]}</div>
                  {req.remarks && <div className="ix-remarks" style={{ marginTop: 6 }}>Remarks: {req.remarks}</div>}
                </>
              )}
            </div>
          )}

          {/* 3 · application form (hidden while a request is pending/approved) */}
          {!active ? (
            <div className="ix-card nfc-form">
              <div className="ix-card-label">{hasCard ? "Request a replacement" : "Apply for your card"}</div>
              <Msg msg={msg} />
              <form onSubmit={submit} className="ix-form" style={{ marginTop: 14 }}>
                <div className="nfc-form-row">
                  {types.length > 1 ? (
                    <div className="ix-field">
                      <label htmlFor="nfc-type">Reason</label>
                      <select id="nfc-type" value={chosen} onChange={(e) => setType(e.target.value)}>
                        {types.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  ) : (
                    <div className="ix-field">
                      <label>Request type</label>
                      <span className="ix-chip" style={{ alignSelf: "flex-start" }}>{chosen}</span>
                    </div>
                  )}
                  <div className="ix-field">
                    <label htmlFor="nfc-notes">Notes <span className="ix-muted">(optional)</span></label>
                    <textarea
                      id="nfc-notes" rows={2} value={notes} maxLength={500}
                      placeholder="Anything your OJT coordinator should know?"
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                </div>
                <div className="nfc-foot">
                  <div className="ix-note">
                    <Icon name="info" size={16} />
                    Your coordinator reviews requests and links the card to your account.
                  </div>
                  <button type="submit" disabled={submitting} className="ix-btn">
                    {submitting ? "Submitting..." : "Submit Application"}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="ix-note nfc-wait">
              <Icon name="info" size={18} />
              You have an open request, so a new application isn't needed right now.
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ───────────────────────── Profile ───────────────────────── */
function Profile({ user }) {
  const [acct, setAcct] = useState(null);

  // the full account (program, supervisor, NFC card, emergency contact...)
  useEffect(() => {
    fetch(`${API}/me?user_id=${user.id}`)
      .then((r) => r.json())
      .then((d) => setAcct(d?.user || d || {}))
      .catch(() => setAcct({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageHeader title="My Profile" sub="Your account information. Ask the admin if something needs to be changed." />
      {!acct ? <Spinner /> : (
        <div className="prof-stack">
          <div className="ix-card prof-main"><UserDetails u={{ ...user, ...acct }} /></div>
          <div className="prof-sec"><AccountSecurity user={user} /></div>
        </div>
      )}
    </>
  );
}

/* ───────── ONE PLACE TO CHANGE ALL CARD BORDERS ─────────
   Change --card-border below and every page follows (Home, DTR, Submit Online,
   Submit MOV, NFC Card, Profile).
   Examples:  0                      → no border (Material look)
              1px solid #f3e3da      → thin brown line
              1px solid #e5e7eb      → thin gray line
              1px solid #e8582a      → orange line                              */
export const cardUnify = `
.ix-content {
  --card-border: 0;
  --card-radius: 12px;
  --card-shadow: var(--md-shadow);
}
  .ix-page .ix-main { background: #fdfdfd !important; }

/* every card */
.ix-content .ix-card,
.ix-content .os-card,
.ix-content .nfc-hero,
.ix-content .hv-stat,
.ix-content .at-log,
.ix-content .at-chart,
.ix-content .hv-hero,
.ix-content .adm-col > :not(.hv-hero):not(.hv-stats):not(.ix-alert) {
  border: var(--card-border) !important;
  border-radius: var(--card-radius) !important;
  box-shadow: var(--card-shadow) !important;
  background: #fff;
  box-sizing: border-box;
}

/* same padding (flush cards like the attendance table keep 0) */
.ix-content .ix-card:not(.flush),
.ix-content .os-card,
.ix-content .nfc-hero,
.ix-content .nfc-page .ix-card:not(.flush) {
  padding: 18px 20px !important;
}

/* tables inside cards must not draw a second border */
.ix-content .ix-card .ix-table-wrap,
.ix-content .os-card .ix-table-wrap {
  border: 0 !important; box-shadow: none !important; border-radius: 0 !important; background: transparent !important;
}

/* DTR paper sheets: flat, with a hairline */
.ix-content .cs48-pair > .cs48-card {
  border: 1px solid #f0f2f5;
  border-radius: 8px;
  box-shadow: none;
}

/* ═════ Hero: dark brown → orange gradient (all users) ═════ */
.ix-content .hv-hero {
  background:
    radial-gradient(520px 260px at 88% -10%, rgba(232,120,70,.45), transparent 70%),
    linear-gradient(110deg, #3d1509 0%, #6b2611 45%, #a8471f 80%, #c2602f 100%) !important;
  color: #fff;
}

/* text must be light on the dark background */
.ix-content .hv-hero h1 { color: #fff !important; }
.ix-content .hv-hero p,
.ix-content .hv-hero .hv-track-cap,
.ix-content .hv-hero .at-marks { color: rgba(255,255,255,.8) !important; }
.ix-content .hv-hero .hv-track-cap b,
.ix-content .hv-hero .ix-ring-center strong { color: #fff !important; }

/* progress bar and ring track: see-through white */
.ix-content .hv-hero .hv-track { background: rgba(255,255,255,.2); }
.ix-content .hv-hero .hv-track i { background: rgba(61,21,9,.6); }
.ix-content .hv-hero svg circle:first-child { stroke: rgba(255,255,255,.2); }
`;

/* ───────────────────────── intern-only styles ─────────────────────────
   Loaded AFTER adminCss. Stats, calendar and gaps on Home come from adminCss;
   the .hv-* rules below are the Home redesign. mdCss (materialTheme.js) is
   loaded after this and restyles the look. */
export const internCss = `
/* ═════════ SHARED LOOK (matches admin) ═════════ */
.ix-main { background:
    #ffede5;
}
.ix-content tbody td:first-child { font-weight: 600; color: var(--ink); }
.ix-content .ix-pill { border-radius: 99px; }
.ix-content .ix-pill.active { background: linear-gradient(135deg, var(--o2), #e04a1a); color: #fff; box-shadow: 0 8px 18px rgba(232,88,42,0.3); }

/* ═════════ HOME (redesign) ═════════ */
.hv-hero { position: relative; overflow: hidden; display: flex; align-items: center; justify-content: space-between; gap: 22px;
  padding: 20px 24px; border-radius: 22px; color: #fff;
  background: linear-gradient(120deg, #f2733a 0%, #e8582a 55%, #d4401a 100%);
  box-shadow: 0 16px 34px rgba(232,88,42,.32); }
.hv-blob { position: absolute; border-radius: 50%; pointer-events: none; background: rgba(255,255,255,.12); }
.hv-blob.a { width: 220px; height: 220px; right: -60px; top: -90px; }
.hv-blob.b { width: 130px; height: 130px; right: 150px; bottom: -70px; background: rgba(255,255,255,.08); }
.hv-hero-main { position: relative; min-width: 0; flex: 1; }
.hv-hero h1 { font-size: 24px; font-weight: 800; margin: 10px 0 2px; line-height: 1.2; color: #fff; }
.hv-hero p { font-size: 13px; margin: 0 0 14px; color: rgba(255,255,255,.88); }

.hv-pill { display: inline-flex; align-items: center; gap: 7px; padding: 4px 12px; border-radius: 99px;
  font-size: 12px; font-weight: 600; background: rgba(255,255,255,.2); color: #fff; backdrop-filter: blur(4px); }
.hv-pill i { width: 8px; height: 8px; border-radius: 50%; background: #fff; opacity: .7; }
.hv-pill.live i { background: #86efac; opacity: 1; animation: hv-pulse 1.8s ease-out infinite; }
.hv-pill.warn { background: #fff; color: #c2410c; }
.hv-pill.warn i { background: #f59e0b; opacity: 1; }
@keyframes hv-pulse { 0% { box-shadow: 0 0 0 0 rgba(134,239,172,.7); } 100% { box-shadow: 0 0 0 8px rgba(134,239,172,0); } }

.hv-track { position: relative; height: 9px; border-radius: 99px; background: rgba(255,255,255,.28); overflow: hidden; }
.hv-track-fill { height: 100%; border-radius: 99px; background: #fff; transition: width .6s ease; }
.hv-track i { position: absolute; top: 0; bottom: 0; width: 2px; background: rgba(232,88,42,.55); }
.hv-track-cap { display: flex; justify-content: space-between; font-size: 12px; margin-top: 6px; color: rgba(255,255,255,.85); }
.hv-track-cap b { color: #fff; }

.hv-hero-side { position: relative; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 12px; }
.hv-hero .ix-ring-center strong { color: #fff !important; opacity: 1; font-size: 20px; }
.hv-quick { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
.hv-quick button { display: inline-flex; align-items: center; gap: 5px; padding: 6px 11px; border: 0; border-radius: 99px; cursor: pointer;
  font-size: 12px; font-weight: 700; color: #c2410c; background: #fff; transition: transform .15s, box-shadow .15s; }
.hv-quick button:hover { transform: translateY(-1px); box-shadow: 0 6px 14px rgba(0,0,0,.18); }
.hv-quick button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }

/* stats */
.hv-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.hv-stat { display: flex; align-items: center; gap: 12px; padding: 14px; border-radius: 18px; background: #fff; border: 1px solid #f3e3da;
  box-shadow: 0 6px 16px rgba(120,60,30,.06); min-width: 0; }
.hv-stat-ic { width: 42px; height: 42px; border-radius: 13px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
.hv-stat.orange .hv-stat-ic { background: #fdeee7; color: #e8582a; }
.hv-stat.blue .hv-stat-ic { background: #e5f0ff; color: #2563eb; }
.hv-stat.green .hv-stat-ic { background: #dcf5e6; color: #16a34a; }
.hv-stat.purple .hv-stat-ic { background: #efe7ff; color: #7c3aed; }
.hv-stat-body { display: flex; flex-direction: column; min-width: 0; line-height: 1.2; }
.hv-stat-body small { font-size: 11.5px; font-weight: 600; color: #8a7468; }
.hv-stat-body strong { font-size: 20px; font-weight: 800; color: var(--ink); margin: 2px 0; font-variant-numeric: tabular-nums; }
.hv-stat-body em { font-style: normal; font-size: 11px; color: #a1857a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hv-stat-bar { display: block; height: 4px; border-radius: 99px; background: #e5f0ff; margin-top: 5px; overflow: hidden; }
.hv-stat-bar i { display: block; height: 100%; background: #2563eb; border-radius: 99px; }

.ih-stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }

/* ═════════ OTHER INTERN PAGES ═════════ */
.ix-stack { display: flex; flex-direction: column; gap: 20px; }
.ix-card.narrow { max-width: 580px; width: 100%; }
.ix-card .ix-note { margin: 0 0 18px; }

.ix-bar { position: relative; margin-top: 16px; height: 14px; border-radius: 99px; background: #fbeee7; overflow: hidden; }
.ix-bar i { position: absolute; top: 0; bottom: 0; width: 2px; background: #fff; opacity: .9; }
.ix-bar-marks { display: flex; justify-content: space-between; font-size: 10.5px; color: #a1857a; margin-top: 6px; }
.ix-bar-caption { font-size: 13px; color: #7a6c64; margin-top: 12px; }
.ix-bar-caption strong { color: var(--ink); }

.ix-field textarea { resize: vertical; line-height: 1.6; }
.ix-btn { padding: 13px; border: none; border-radius: 14px; cursor: pointer; color: #fff; font-size: 14px; font-weight: 700; letter-spacing: .2px; background: linear-gradient(135deg, #f2733a, #e04a1a); box-shadow: 0 12px 24px rgba(232,88,42,0.32); transition: transform .15s, box-shadow .15s; }
.ix-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 16px 30px rgba(232,88,42,0.42); }
.ix-btn:disabled { opacity: .7; cursor: default; }
.ix-btn:focus-visible { outline: 2px solid #e8582a; outline-offset: 2px; }

.ix-drop { position: relative; display: flex; align-items: center; gap: 14px; padding: 18px; border: 2px dashed #f5b79f; border-radius: 16px; background: #fffaf7; cursor: pointer; transition: all .15s; }
.ix-drop:hover { border-color: #e8582a; background: #fff5ef; }
.ix-drop.has-file { border-style: solid; border-color: #e8582a; }
.ix-field .ix-drop input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; padding: 0; border: 0; background: transparent; box-shadow: none; }
.ix-drop-icon { width: 46px; height: 46px; border-radius: 14px; background: #fdeee7; color: #e8582a; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.ix-drop-text { display: flex; flex-direction: column; font-size: 13.5px; font-weight: 600; color: #1e293b; min-width: 0; word-break: break-all; }
.ix-drop-text small { font-size: 11.5px; font-weight: 400; color: #94a3b8; margin-top: 2px; }

.ix-nfc-status { display: flex; align-items: center; gap: 16px; }
.ix-nfc-status strong { display: block; font-size: 15px; font-weight: 800; }
.ix-nfc-status span { font-size: 12.5px; color: #64748b; line-height: 1.5; }
.ix-nfc-badge { width: 56px; height: 56px; border-radius: 16px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: #f1f5f9; color: #94a3b8; }
.ix-nfc-badge.ok { background: #e6f7ee; color: #16a34a; }
.ix-req-meta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 10px; font-size: 12.5px; }
.ix-steps { list-style: none; margin: 22px 0 0; padding: 0; display: flex; }
.ix-steps li { flex: 1; position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: #94a3b8; text-align: center; }
.ix-steps li:not(:last-child)::after { content: ""; position: absolute; top: 17px; left: calc(50% + 24px); right: calc(-50% + 24px); height: 3px; border-radius: 3px; background: #f1f5f9; }
.ix-steps li.done:not(:last-child)::after { background: #e8582a; }
.ix-step-dot { width: 36px; height: 36px; border-radius: 50%; background: #f1f5f9; color: #94a3b8; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; }
.ix-steps li.done { color: #0b1220; }
.ix-steps li.done .ix-step-dot { background: linear-gradient(135deg, #f2864f, #e8582a); color: #fff; box-shadow: 0 6px 14px rgba(232,88,42,0.3); }
.ix-steps li.current { color: #e8582a; }
.ix-steps li.current .ix-step-dot { background: #fdeee7; color: #e8582a; box-shadow: 0 0 0 4px rgba(232,88,42,0.15); }
.ix-step-text { margin-top: 18px; font-size: 13px; color: #475569; text-align: center; line-height: 1.5; }

/* profile page */
.ix-profile { display: grid; grid-template-columns: 300px 1fr; gap: 20px; align-items: start; }
.ix-profile-card { text-align: center; }
.ix-profile-avatar { display: flex; justify-content: center; margin-bottom: 14px; }
.ix-profile-card h2 { font-size: 19px; font-weight: 800; }
.ix-profile-card h2 { margin-bottom: 8px; }
.ix-profile-card .ix-profile-name { color: #0b1220; opacity: 1; font-size: 20px; font-weight: 800; }
.ix-profile-sec { min-width: 0; }
.ix-profile-sec > * { margin-top: 0; }
.ix-profile-card dl { margin-top: 18px; padding-top: 16px; border-top: 1px dashed #f1ddd1; text-align: left; }
.ix-profile-card dl div { display: flex; justify-content: space-between; margin-bottom: 11px; }
.ix-profile-card dt { font-size: 12px; color: #a1857a; }
.ix-profile-card dd { font-size: 13px; font-weight: 600; color: #1e293b; }
.ix-profile-ring { display: flex; align-items: center; gap: 32px; margin-top: 20px; flex-wrap: wrap; }
.ix-profile-ring-text { display: flex; flex-direction: column; gap: 10px; font-size: 13.5px; color: #7a6c64; }
.ix-profile-ring-text strong { color: var(--ink); font-size: 18px; }
.ix-profile .ix-ring-center .dark { color: #0b1220; opacity: 1; }
.ix-profile .ix-ring-center span.dark { color: #64748b; }

/* profile card and Account Security share the same top and height */
.ix-content .ix-profile { align-items: stretch; }
.ix-content .ix-profile > .ix-profile-card { height: 100%; margin: 0; box-sizing: border-box; }
.ix-content .ix-profile-sec { display: flex; flex-direction: column; min-width: 0; }
.ix-content .ix-profile-sec > * { margin: 0; flex: 1; }

/* form on the left, "my submissions" table on the right */
.intern-split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; align-items: start; }
.intern-split > * { min-width: 0; margin: 0; }
.intern-split .ix-table-wrap { overflow-x: auto; }
/* Submit Online: "My Online Submissions" is exactly as tall as the form beside it;
   a long list scrolls inside the card instead of stretching the page */
.online-split { align-items: stretch; }
.online-split > .os-card { height: 0; min-height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.online-split > .os-card > .ix-table-wrap { flex: 1; overflow-y: auto; }
.online-split > .os-card > .ix-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.intern-task { max-width: 280px; white-space: normal; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.intern-task { color: #3b2f29; font-size: 13px; }
.intern-task small { display: block; margin-top: 3px; font-size: 11.5px; color: #6b5a50; }

/* MOV "Others": narrow form, wide documents card (no sideways scroll) */
.mov-split { grid-template-columns: minmax(260px, 340px) minmax(0, 1fr); align-items: stretch; }
/* "Others" form and "Other documents" list: same height, the list's empty state centered in the card */
.mov-split > .ix-card, .mov-split > .os-card { height: 100%; }
.mov-split > .os-card { display: flex; flex-direction: column; }
.mov-split > .os-card > .ix-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.mov-split .os-card th, .mov-split .os-card td { white-space: normal; }
.mov-split .os-card .ix-table-wrap { overflow-x: visible; }
.mov-doc { display: flex; flex-direction: column; gap: 2px; min-width: 0; max-width: 230px; }
.mov-doc .ix-link { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; }
.mov-doc .os-date { white-space: normal; overflow-wrap: anywhere; }
@media (max-width: 1100px) { .mov-split { grid-template-columns: 1fr; } }

/* NFC card: compact single column, fits the screen */
.nfc-page { display: flex; flex-direction: column; gap: 10px; max-width: 720px; }
.nfc-page > * { margin: 0; }
.nfc-page .ix-card { padding: 12px 16px; }

.nfc-hero { display: flex; align-items: center; gap: 14px; padding: 10px 16px; border-radius: 18px; background: #fff; }
.nfc-plastic { position: relative; flex-shrink: 0; width: 112px; height: 70px; border-radius: 10px; padding: 8px 10px;
  display: flex; flex-direction: column; justify-content: space-between; color: #94a3b8;
  background: repeating-linear-gradient(45deg, #f1f5f9, #f1f5f9 6px, #e8eef5 6px, #e8eef5 12px); border: 2px dashed #cbd5e1; }
.nfc-hero.linked .nfc-plastic { color: #fff; border: 0; box-shadow: 0 8px 16px rgba(232,88,42,.3);
  background: linear-gradient(135deg, #f2733a, #d4401a); }
.nfc-plastic > svg { position: absolute; top: 8px; right: 10px; width: 16px; height: 16px; }
.nfc-plastic b { font-size: 10px; letter-spacing: 1px; font-variant-numeric: tabular-nums; }
.nfc-chip { width: 20px; height: 15px; border-radius: 4px; background: rgba(255,255,255,.55); border: 1px solid rgba(0,0,0,.08); }
.nfc-hero-text { min-width: 0; }
.nfc-hero-text h3 { margin: 4px 0 2px; font-size: 14px; font-weight: 800; color: #1e293b; }
.nfc-hero-text p { margin: 0; font-size: 12px; color: #6b5a50; line-height: 1.4; }
.nfc-state { display: inline-block; padding: 2px 9px; border-radius: 99px; font-size: 11px; font-weight: 700; background: #f1f5f9; color: #64748b; }
.nfc-state.ok { background: #dcf5e6; color: #146c3a; }

.nfc-req-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.nfc-req-head .ix-req-meta { margin-top: 0; }
.nfc-page .ix-steps { margin-top: 10px; }
.nfc-page .ix-steps li { gap: 4px; font-size: 11.5px; }
.nfc-page .ix-step-dot { width: 28px; height: 28px; font-size: 12.5px; }
.nfc-page .ix-steps li:not(:last-child)::after { top: 13px; left: calc(50% + 18px); right: calc(-50% + 18px); }
.nfc-page .ix-step-text { margin-top: 8px; font-size: 12px; }
.nfc-page .ix-form { gap: 8px; }
.nfc-form-row { display: grid; grid-template-columns: minmax(0, 200px) minmax(0, 1fr); gap: 12px; align-items: start; }
.nfc-foot { display: flex; align-items: center; gap: 12px; }
.nfc-foot .ix-note { flex: 1; margin: 0; padding: 6px 10px; font-size: 11.5px; }
.nfc-foot .ix-btn { padding: 10px 18px; white-space: nowrap; }
.nfc-wait { margin: 0; padding: 8px 12px; font-size: 12px; }

@media (max-width: 640px) {
  .nfc-hero { flex-direction: column; align-items: flex-start; }
  .nfc-form-row { grid-template-columns: 1fr; }
  .nfc-foot { flex-direction: column; align-items: stretch; }
}


/* my online submissions */
.os-card { background: #fff; padding: 18px 20px; }
.os-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.os-title { display: inline-flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 800; color: #1e293b; }
.os-title svg { color: #e8582a; }
.os-count { min-width: 26px; text-align: center; padding: 2px 9px; border-radius: 99px; font-size: 12px; font-weight: 700;
  background: #fdeee7; color: #c2410c; }
.os-card th { color: #6b5a50; font-weight: 700; }
.os-card td { color: #3b2f29; }
.os-date { font-weight: 600; color: #1e293b; white-space: nowrap; }
.os-status { display: inline-block; padding: 4px 12px; border-radius: 99px; font-size: 12px; font-weight: 700; white-space: nowrap; }
.os-status.pending { background: #fff1d6; color: #9a5b00; }
.os-status.approved { background: #dcf5e6; color: #146c3a; }
.os-status.rejected { background: #fde2e2; color: #b42318; }

/* ═════════ MY ATTENDANCE ═════════ */
.at-stack { display: flex; flex-direction: column; gap: 16px; }
.at-stack > * { margin-top: 0; margin-bottom: 0; }

.at-log-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.at-log-head .ix-pills { margin: 0; }
.at-log-head .ix-pills { display: flex; gap: 8px; flex-wrap: wrap; }
.ix-content .at-log-head .ix-pill { background: #fff; color: #4b3b33; border: 1px solid #f0d9cc; border-radius: 99px;
  padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: none; }
.ix-content .at-log-head .ix-pill:hover { border-color: #e8582a; color: #d94a1c; }
.ix-content .at-log-head .ix-pill.active { background: linear-gradient(135deg, #f2733a, #e04a1a); color: #fff;
  border-color: transparent; box-shadow: 0 8px 18px rgba(232,88,42,0.3); }
.at-month { padding: 8px 34px 8px 14px; border: 1px solid #f0d9cc; border-radius: 99px; background-color: #fff; color: #4b3b33;
  font-size: 13px; font-weight: 600; cursor: pointer; }
.at-month:focus-visible { outline: 2px solid #e8582a; outline-offset: 2px; }
.at-count { display: inline-block; min-width: 20px; margin-left: 6px; padding: 1px 7px; border-radius: 99px;
  font-size: 11px; font-weight: 700; background: rgba(232,88,42,.12); color: #d94a1c; }
.ix-content .at-log-head .ix-pill.active .at-count { background: rgba(255,255,255,.25); color: #fff; }

.at-date { display: flex; flex-direction: column; line-height: 1.25; }
.at-date small { font-size: 11.5px; font-weight: 500; color: #a1857a; }
.at-hrs { font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; }

@media (prefers-reduced-motion: reduce) { .at-col-track i { transition: none; } }

/* ═════════ RESPONSIVE ═════════ */
@media (max-width: 1100px) {
  .intern-split { grid-template-columns: 1fr; }
  .online-split > .os-card { height: auto; min-height: 0; overflow: visible; }
  .ih-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .hv-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 1000px) {
  .ix-profile { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .hv-hero { flex-direction: column; align-items: flex-start; }
  .hv-hero-side { flex-direction: row; align-items: center; }
}
@media (prefers-reduced-motion: reduce) {
  .hv-pill.live i { animation: none; }
  .hv-track-fill { transition: none; }
}

.req-tabs { display: inline-flex; gap: 4px; padding: 4px; background: #fff3ec; border-radius: 14px; margin-bottom: 16px; }
.req-tabs button { display: inline-flex; align-items: center; gap: 6px; padding: 9px 18px; border: 0; border-radius: 11px; background: transparent; color: #7c5c4c; font-weight: 700; font-size: 13.5px; cursor: pointer; }
.req-tabs button.on { background: #fff; color: #d94a1c; box-shadow: 0 4px 12px rgba(232,88,42,.15); }
.req-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
.req-sub { display: block; color: #8a7468; font-size: 12px; margin-top: 2px; }
.req-list { list-style: none; margin: 10px 0 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.req-item { display: flex; flex-wrap: nowrap; align-items: center; gap: 8px; padding: 6px 10px;
  border: 1px solid #f3e3da; border-radius: 10px; background: #fffdfb; min-height: 0; }
.req-item .req-main { flex: 1 1 auto; min-width: 0; gap: 0; }
.req-item .req-main strong { font-size: 12.5px; line-height: 1.25; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.req-item .req-main small { font-size: 11px; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.req-item .req-file { font-size: 11px; line-height: 1.25; }
.req-item > :nth-child(2) { zoom: .85; flex-shrink: 0; }
.req-item .req-up { flex-shrink: 0; margin-left: 0; padding: 4px 9px; font-size: 11.5px; gap: 4px; }
.req-item .req-spacer { display: none; }
.req-item .ix-link, .os-card .ix-link { color: #c2410c; font-weight: 600; }
.req-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.os-remarks { color: #6b5a50; font-size: 12.5px; }
@media (max-width: 760px) { .req-list { grid-template-columns: 1fr; } }
.req-main small { color: #8a7468; font-size: 12px; }
.req-file { font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.req-reject { color: #dc2626 !important; }
.req-up { position: relative; overflow: hidden; cursor: pointer; white-space: nowrap; }
.req-up input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; }
.req-spacer { width: 96px; }
.req-locked { text-align: center; padding: 28px 12px; max-width: 460px; margin: 0 auto; }
.req-locked h3 { margin: 10px 0 6px; font-size: 17px; }
.req-locked p { color: #6b5a50; font-size: 13.5px; line-height: 1.55; margin: 0 0 14px; }
.req-lock-icon { display: inline-flex; width: 60px; height: 60px; align-items: center; justify-content: center; border-radius: 50%; background: #fff3ec; color: #e04a1a; }
.dtr-filters { display: flex; gap: 8px; flex-wrap: wrap; }
.dtr-sel { padding: 9px 32px 9px 14px; border: 1px solid #f0d9cc; border-radius: 99px; background-color: #fff; color: #4b3b33;
  font-size: 13px; font-weight: 600; cursor: pointer; }
.dtr-sel:focus-visible { outline: 2px solid #e8582a; outline-offset: 2px; }
.req-dtr-meta { display: flex; gap: 18px; flex-wrap: wrap; color: #6b5a50; font-size: 13px; margin: 6px 0 12px; }
@media (max-width: 640px) { .req-spacer { display: none; } }

/* ═════════ MY ATTENDANCE (redesign) ═════════ */
.hv-stat.red .hv-stat-ic { background: #fde2e2; color: #dc2626; }
.hv-stat.red.ok .hv-stat-ic { background: #dcf5e6; color: #16a34a; }
.at-marks { display: flex; justify-content: space-between; font-size: 10.5px; margin-top: 6px; color: rgba(255,255,255,.8); }
.at-mid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 14px; align-items: stretch; }
.at-mid .hv-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); align-content: stretch; }
.at-chart { display: flex; flex-direction: column; padding: 14px 16px; border-radius: 18px; background: #fff; border: 1px solid #f3e3da;
  box-shadow: 0 6px 16px rgba(120,60,30,.06); min-width: 0; }
.at-chart-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.at-chart-head strong { font-size: 14px; font-weight: 800; color: var(--ink); }
.at-legend { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: #8a7468; }
.at-legend i { width: 9px; height: 9px; border-radius: 3px; display: inline-block; }
.at-legend i.on { background: #e8582a; }
.at-legend i.off { background: #2563eb; margin-left: 6px; }
.at-chart-empty { flex: 1; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 12.5px; color: #a1857a; padding: 10px; }
.at-bars { flex: 1; display: flex; align-items: stretch; gap: 6px; min-height: 120px; }
.at-col { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.at-col-val { font-size: 10.5px; font-weight: 700; color: #6b5a50; font-variant-numeric: tabular-nums; }
.at-col-track { flex: 1; width: 100%; max-width: 26px; display: flex; align-items: flex-end; border-radius: 8px; background: #fdf1ea; overflow: hidden; }
.at-col-track i { display: block; width: 100%; border-radius: 8px; background: linear-gradient(180deg, #f2864f, #e8582a); transition: height .5s ease; }
.at-col-track i.online { background: linear-gradient(180deg, #5b9bff, #2563eb); }
.at-col small { font-size: 10.5px; color: #a1857a; }

.at-log { border-radius: 18px; overflow: hidden; }
.at-hrs { display: flex; flex-direction: column; gap: 4px; min-width: 90px; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; }
.at-hrs-bar { display: block; height: 4px; border-radius: 99px; background: #fdeee7; overflow: hidden; }
.at-hrs-bar i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #f2864f, #e8582a); }
.at-ot { font-size: 11px; font-weight: 600; color: #9a5b00; }
.at-fix { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.at-fix-btn { padding: 3px 10px; border-radius: 99px; border: 1px solid #f0d9cc; background: #fff; color: #c2410c;
  font-size: 11.5px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.at-fix-btn:hover { border-color: #e8582a; background: #fff3ec; }
.at-fix-btn:focus-visible { outline: 2px solid #e8582a; outline-offset: 2px; }
.at-ot.approved { color: #146c3a; }
.at-ot.rejected { color: #b42318; }


@media (max-width: 900px) { .at-mid { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .at-col-track i { transition: none; } }

/* remove (pending only) */
.rm-btn { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; border: 1px solid #f6c9c9; border-radius: 99px; cursor: pointer;
  background: #fff5f5; color: #b42318; font-size: 12px; font-weight: 700; white-space: nowrap; transition: background .15s, border-color .15s; }
.rm-btn:hover { background: #fde2e2; border-color: #f0a8a8; }
.rm-confirm { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.rm-yes, .rm-no { padding: 5px 10px; border-radius: 99px; font-size: 12px; font-weight: 700; cursor: pointer; border: 1px solid transparent; }
.rm-yes { background: #dc2626; color: #fff; }
.rm-yes:disabled, .rm-no:disabled { opacity: .6; cursor: default; }
.rm-no { background: #fff; color: #4b3b33; border-color: #f0d9cc; }
.rm-btn:focus-visible, .rm-yes:focus-visible, .rm-no:focus-visible { outline: 2px solid #e8582a; outline-offset: 2px; }
.req-item .rm-btn, .req-item .rm-yes, .req-item .rm-no { padding: 3px 8px; font-size: 11px; flex-shrink: 0; }
.req-item .rm-confirm { flex-shrink: 0; }


/* My Requests */
.rq-what { display: flex; align-items: flex-start; gap: 10px; min-width: 220px; max-width: 420px; }
.rq-what > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rq-what strong { font-size: 13.5px; color: #111827; }
.rq-what small { font-size: 12px; color: #6b7280; white-space: normal; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.rq-ic { width: 30px; height: 30px; flex-shrink: 0; border-radius: 8px; background: #fdeee7; color: #e8582a; display: inline-flex; align-items: center; justify-content: center; }
.rq-steps { list-style: none; margin: 0; padding: 0; display: flex; align-items: flex-start; }
.rq-steps li { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; width: 78px; font-size: 11px; color: #9ca3af; text-align: center; }
.rq-steps li + li::before { content: ""; position: absolute; top: 9px; right: 50%; width: 100%; height: 2px; background: #e5e7eb; z-index: 0; }
.rq-steps li.done + li::before, .rq-steps li.done + li.fail::before { background: #16a34a; }
.rq-steps i { position: relative; z-index: 1; width: 20px; height: 20px; border-radius: 50%; border: 2px solid #d1d5db; background: #fff; font-style: normal; font-size: 11px; font-weight: 700; line-height: 16px; color: #fff; }
.rq-steps li.done i { background: #16a34a; border-color: #16a34a; }
.rq-steps li.now i { border-color: #f59e0b; background: #fffbeb; box-shadow: 0 0 0 3px rgba(245,158,11,.18); }
.rq-steps li.fail i { background: #dc2626; border-color: #dc2626; }
.rq-steps li.done span { color: #15803d; font-weight: 600; }
.rq-steps li.now span { color: #b45309; font-weight: 600; }
.rq-steps li.fail span { color: #dc2626; font-weight: 600; }
.rq-status { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.rq-status small { font-size: 11.5px; color: #6b7280; font-style: italic; max-width: 220px; white-space: normal; }
`;