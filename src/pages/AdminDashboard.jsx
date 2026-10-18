// AdminDashboard.jsx
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import Shell, {
  Spinner, PageHeader, StatCard, Badge, Table, Section, Empty, Msg, Modal, Bar, Avatar, Ring, Icon, PhotoPicker,
  InternMonitor, AccountSecurity, UserDetails, UserForm, PRE_REQUIREMENTS, POST_REQUIREMENTS, todayManila, fmtTime, calcHours, greeting, esc, requiredHoursFor,
  DTR_MODES, dtrModeOf, liveRefresh,
} from "../components/DashKit.jsx";
import { formalLayout } from "../components/formalLayout.js";
import { mdCss } from "../components/materialTheme.js";
import { internCss, cardUnify, CS48_CSS, dtrFormHtml, buildDtr, OFFICIAL_HOURS, useHolidays, CertifyBar, DTR_PICK_CSS } from "./InternDashboard.jsx";
import { PrintCards } from "../components/NfcCards.jsx";
import { API, STORAGE } from "../config.js";

const NAV = [
  { path: "/admin",          label: "Home",  icon: "home" },
  { path: "/admin/interns",  label: "Interns",    icon: "users" },
  { path: "/admin/accounts", label: "Accounts",   icon: "settings" },
  { path: "/admin/reports",  label: "Reports",    icon: "chart" },
  { path: "/admin/calendar", label: "Calendar",   icon: "calendar" },
  { path: "/admin/profile",  label: "My Profile", icon: "user" },
];

/* Pages that hold several tabs. The open tab is in the address, e.g. /admin/accounts?tab=cards,
   so a link can open the right tab directly. The first tab is the default. */
const GROUPS = {
  "/admin/interns": {
    title: "Interns",
    live: true,
    tabs: [
      { key: "monitor", label: "Monitor Interns",    icon: "users", sub: "Real-time status of all interns." },
      { key: "records", label: "Attendance Records", icon: "list",  sub: "Complete system-wide attendance log." },
    ],
  },
  "/admin/accounts": {
    title: "Accounts",
    tabs: [
      { key: "users", label: "Manage Accounts", icon: "settings", sub: "Add, view, edit or remove users from the system." },
      { key: "cards", label: "Print ID Cards",  icon: "card",     sub: "Print the cards of interns whose NFC card request was approved." },
    ],
  },
  "/admin/reports": {
    title: "Reports",
    tabs: [
      { key: "dtr",     label: "Generate DTR",        icon: "file",  sub: "Daily Time Record for each intern. Search an intern and pick a month to view or print it." },
      { key: "summary", label: "Consolidated Report", icon: "chart", sub: "Monthly attendance summary for all interns." },
    ],
  },
};

// The old addresses still work (bookmarks): they open the matching tab.
const OLD_PATHS = {
  "/admin/records": "/admin/interns?tab=records",
  "/admin/cards":   "/admin/accounts?tab=cards",
  "/admin/dtr":     "/admin/reports?tab=dtr",
  "/admin/hours":   "/admin",
};

/* ───────── Page with tabs (one title, a row of tabs, then the open tab) ─────────
   The open tab's own title is hidden (the group title + the tab's description replace it);
   a button the tab had in its header (e.g. "Add New User") stays, on the right. */
export function GroupPage({ group, tab, onPick, children }) {
  return (
    <>
      <style>{grpCss}</style>
      <PageHeader title={group.title} sub={tab.sub} live={group.live} />
      <div className="grp-tabs" role="tablist" aria-label={group.title}>
        {group.tabs.map((t) => (
          <button
            key={t.key} type="button" role="tab"
            aria-selected={t.key === tab.key}
            className={t.key === tab.key ? "grp-tab active" : "grp-tab"}
            onClick={() => onPick(t.key)}
          >
            <Icon name={t.icon} size={16} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <div className="grp-body" role="tabpanel">{children}</div>
    </>
  );
}

export const grpCss = `
/* the tab row only scrolls sideways on small screens, and never shows a scrollbar */
.ix-page .grp-tabs {
  display: flex; gap: 4px; margin: -4px 0 18px; box-shadow: inset 0 -1px 0 #ece4df;
  overflow-x: auto; overflow-y: hidden; scrollbar-width: none; -ms-overflow-style: none;
}
.ix-page .grp-tabs::-webkit-scrollbar { display: none; width: 0; height: 0; }
.grp-tab {
  position: relative; display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0;
  padding: 11px 14px 12px; border: none; background: none; cursor: pointer; white-space: nowrap;
  font: inherit; font-size: 14px; font-weight: 600; color: #6b7280; border-radius: 8px 8px 0 0;
  transition: color .15s, background .15s;
}
.grp-tab:hover { color: #ea580c; background: #fff7f2; }
.grp-tab.active { color: #ea580c; }
.grp-tab.active::after { content: ""; position: absolute; left: 10px; right: 10px; bottom: 0; height: 3px; border-radius: 3px 3px 0 0; background: #f97316; }
.grp-tab:focus-visible { outline: 2px solid #f97316; outline-offset: -2px; }

/* Manage Accounts: search, role filter and count on the left, "Add New User" on the right, one row */
.ix-page .acc-role { min-width: 170px; }
.ix-page .acc-add { margin-left: auto; }
.ix-page .acc-who { display: flex; flex-direction: column; line-height: 1.25; }
.ix-page .acc-who small { font-size: 11.5px; color: #94a3b8; font-weight: 500; }
.ix-page .acc-open { background: none; border: 0; padding: 0; cursor: pointer; text-align: left; font: inherit; color: inherit; }
.ix-page .acc-open:hover strong { color: #e8582a; text-decoration: underline; }
.ix-page .acc-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
.ix-page .acc-bar .acc-bar-r { margin-left: auto; display: flex; gap: 8px; }
@media (max-width: 700px) { .ix-page .acc-add { margin-left: 0; width: 100%; justify-content: center; } }

/* the tab's own title is replaced by the group title above the tabs */
.grp-body > .ix-ph { display: none; }
/* ...but keep a button it had there (e.g. "Add New User"), on the right */
.grp-body > .ix-ph:has(.ix-ph-right .ix-b) { display: flex; justify-content: flex-end; margin: 0 0 14px; }
.grp-body > .ix-ph:has(.ix-ph-right .ix-b) > div:first-child,
.grp-body > .ix-ph:has(.ix-ph-right .ix-b) .ix-live { display: none; }
`;

export default function AdminDashboard() {
  const user = JSON.parse(sessionStorage.getItem("user") || "{}");
  const { pathname: path, search, state } = useLocation();
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
    return liveRefresh(fetchAll);
  }, []);

  const fetchAll = async () => {
    try {
      const [r, u] = await Promise.all([
        fetch(`${API}/admin/all-attendance`).then((r) => r.json()),
        fetch(`${API}/admin/users`).then((r) => r.json()),
      ]);
      if (Array.isArray(r)) setRecords([...r]);
      if (Array.isArray(u)) setUsers([...u]);
    } catch (err) {
      console.error("Poll error:", err);
    } finally {
      setLoading(false);
    }
  };

  const interns = users.filter((u) => u.role === "intern");
  const coordinators = users.filter((u) => u.role === "ojt_coordinator");

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

  return (
    <Shell navItems={NAV} user={user}>
      <style>{adminCss}</style>
      <style>{internCss}</style>
      <style>{formalLayout}</style>
      <style>{mdCss}</style>
      <style>{cardUnify}</style>
      <style>{adminMatch}</style>
      {path === "/admin" && <Home user={user} records={records} interns={interns} coordinators={coordinators} loading={loading} />}

      {group && (
        <GroupPage group={group} tab={tab} onPick={pickTab}>
          {/* Interns */}
          {tab.key === "monitor" && (
            <InternMonitor
              interns={interns} records={records} loading={loading} onRefresh={fetchAll}
              recordsPath="/admin/interns?tab=records"
            />
          )}
          {tab.key === "records" && <Records records={records} loading={loading} />}
          {/* Accounts */}
          {tab.key === "users" && <Accounts users={users} onRefresh={fetchAll} />}
          {tab.key === "cards" && <PrintIdCards interns={interns} />}
          {/* Reports */}
          {tab.key === "dtr" && <DTR interns={interns} records={records} />}
          {tab.key === "summary" && <Reports interns={interns} records={records} />}
        </GroupPage>
      )}

      {path === "/admin/calendar" && <Calendar />}
      {path === "/admin/profile" && <AdminProfile user={user} />}
    </Shell>
  );
}

/* ───────────────────────── Home ───────────────────────── */

// One of the four summary cards
export function MiniStat({ icon, tone, label, value, hint, bar, live }) {
  return (
    <div className={`adm-mini ${tone}`}>
      <div className="adm-mini-top">
        <span className="adm-mini-icon"><Icon name={icon} size={16} /></span>
        <span className="adm-mini-label">{label}</span>
      </div>
      <div className="adm-mini-value">{value}</div>
      {bar !== undefined && (
        <div className="adm-mini-bar" aria-hidden="true"><i style={{ width: `${Math.min(bar, 100)}%` }} /></div>
      )}
      {hint && <div className="adm-mini-hint">{live && <i className="adm-live-dot" />}{hint}</div>}
    </div>
  );
}

function Home({ user, records, interns, coordinators, loading }) {
  const go = useNavigate();
  const today = todayManila();
  const todayRecs = records.filter((r) => r.date === today);
  const inNowAll = todayRecs.filter((r) => r.uid !== "ONLINE" && r.action === "CHECK_IN" && !r.checked_out_at);
  // one entry per person, in case someone has more than one open check-in
  const inNow = inNowAll.filter((r, i, a) => a.findIndex((x) => (x.user_id ?? x.name) === (r.user_id ?? r.name)) === i);
  const checkedIn = inNow.length;
  const pct = interns.length ? (checkedIn / interns.length) * 100 : 0;
  const first = user.name?.split(" ")[0] || "there";
  const dateLabel = new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" });

  const stats = [
    { icon: "users", tone: "orange", label: "Total interns", value: interns.length, hint: "registered" },
    { icon: "user", tone: "blue", label: "OJT coordinators", value: coordinators.length, hint: "on the program" },
    { icon: "tap", tone: "green", label: "Checked in today", value: checkedIn, hint: `of ${interns.length} interns` },
    { icon: "list", tone: "purple", label: "Today's records", value: todayRecs.length, hint: "taps and logs" },
  ];

  const quick = [
    { icon: "users", label: "Monitor", to: "/admin/interns" },
    { icon: "list", label: "Records", to: "/admin/interns?tab=records" },
    { icon: "file", label: "DTR", to: "/admin/reports?tab=dtr" },
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
            <span className={`hv-pill ${checkedIn > 0 ? "live" : "idle"}`}>
              <i aria-hidden="true" /> {checkedIn > 0 ? `${checkedIn} on the clock now` : "Nobody checked in yet"}
            </span>
            <h1>{greeting()}, {first}</h1>
            <p>Here's what's happening across the OJT program today. {dateLabel}.</p>
          </div>

          <div className="hv-hero-side">
            <div className="hv-quick">
              {quick.map((q) => (
                <button key={q.to} type="button" onClick={() => go(q.to)}>
                  <Icon name={q.icon} size={14} /> {q.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* stats */}
        <div className="hv-stats">
          {stats.map((s) => (
            <div key={s.label} className={`hv-stat ${s.tone}`}>
              <span className="hv-stat-ic"><Icon name={s.icon} size={18} /></span>
              <div className="hv-stat-body">
                <small>{s.label}</small>
                <strong>{s.value}</strong>
                <em>{s.hint}</em>
              </div>
            </div>
          ))}
        </div>

        {/* live attendance */}
        <div className="adm-live hv-recent">
          <Section icon="clock" title="Today's Live Attendance" count={todayRecs.length} live>
            {loading ? (
              <Spinner />
            ) : (
              <Table
                headers={["Intern", "Type", "Action", "Time"]}
                rows={todayRecs.map((r) => [
                  <div className="ix-actions">
                    <Avatar name={r.name} photo={r.photo} size={32} />
                    <strong>{r.name}</strong>
                  </div>,
                  <Badge label={r.uid === "ONLINE" ? "Online" : "Onsite"} type={r.uid === "ONLINE" ? "online" : "onsite"} />,
                  <Badge label={r.action === "CHECK_IN" ? "IN" : "OUT"} type={r.action === "CHECK_IN" ? "in" : "out"} />,
                  <span className="adm-time">{fmtTime(r.checked_in_at)}</span>,
                ])}
                empty="No activity today yet."
              />
            )}
          </Section>
        </div>
      </div>

      {/* ───── RIGHT: calendar + on duty ───── */}
      <div className="adm-col">
        <HomeCalendar />

        <div className="ix-card adm-duty">
          <div className="adm-duty-head">
            <span className="adm-duty-icon"><Icon name="tap" size={18} /></span>
            <h2>On duty now</h2>
            <span className="ix-count">{checkedIn}</span>
          </div>
          {inNow.length === 0 ? (
            <div className="adm-duty-empty">
              <strong>Nobody is checked in.</strong>
              <p>Interns who tap in will show up here.</p>
            </div>
          ) : (
            <ul className="adm-duty-list">
              {inNow.slice(0, 6).map((r) => (
                <li key={r.user_id ?? r.name}>
                  <Avatar name={r.name} photo={r.photo} size={34} status="on" />
                  <span className="adm-duty-name">{r.name}</span>
                  <span className="adm-duty-time">since {fmtTime(r.checked_in_at)}</span>
                </li>
              ))}
              {inNow.length > 6 && <li className="adm-duty-more">+{inNow.length - 6} more</li>}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/* makes the remaining admin cards follow the same --card-* variables as the intern pages */
export const adminMatch = `
.ix-content .ix-section,
.ix-content .ix-sub,
.ix-content .ix-ic:not(.selected),
.ix-content .ix-hc,
.ix-content .ix-stat,
.ix-content .ix-doc,
.ix-content .imp-panel {
  border: var(--card-border) !important;
  border-radius: var(--card-radius) !important;
  box-shadow: var(--card-shadow) !important;
  background: #fff;
}
.ix-content .ix-ic.selected {
  border: 0 !important;
  border-radius: var(--card-radius) !important;
  box-shadow: 0 0 0 2px #e8582a, var(--md-shadow) !important;
}
.ix-content .ix-section { overflow: hidden; }
/* smaller intern cards on Monitor Interns */
.ix-content .ix-intern-grid {
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 12px;
}
.ix-content .ix-ic {
  padding: 12px 14px !important;
}
.ix-content .ix-ic-top { gap: 10px; }
.ix-content .ix-ic-id strong { font-size: 13px; }
.ix-content .ix-ic-id span { font-size: 11px; }
.ix-content .ix-ic-stats {
  margin: 10px 0 0;
  gap: 8px;
}
.ix-content .ix-ic-stats div { padding: 6px 10px; }
.ix-content .ix-ic-stats strong { font-size: 13px; }
.ix-content .ix-ic-stats span { font-size: 10.5px; }
`;

/* ───────────────────────── Home Calendar ───────────────────────── */
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// hover card on the calendar (rendered on <body> so the card's edges never cut it off)
const CAL_TIP_CSS = `
  .cal-tip { position: fixed; z-index: 9999; transform: translate(-50%, -100%); width: max-content; max-width: 260px;
    padding: 10px 12px 9px; background: #fff; border: 1px solid #f1e2d9; border-radius: 10px;
    box-shadow: 0 12px 28px rgba(15,23,42,.16); font-family: 'Poppins', 'Segoe UI', sans-serif; color: #1f2937;
    display: flex; flex-direction: column; gap: 3px; pointer-events: none; animation: cal-tip-in .12s ease-out; }
  .cal-tip.below { transform: translate(-50%, 0); }
  .cal-tip::after { content: ""; position: absolute; left: 50%; bottom: -6px; width: 10px; height: 10px; background: #fff;
    border-right: 1px solid #f1e2d9; border-bottom: 1px solid #f1e2d9; transform: translateX(-50%) rotate(45deg); }
  .cal-tip.below::after { bottom: auto; top: -6px; transform: translateX(-50%) rotate(225deg); }
  .cal-tip-type { align-self: flex-start; padding: 2px 8px; border-radius: 99px; font-size: 10.5px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; }
  .cal-tip-type.holiday { background: #dcfce7; color: #15803d; }
  .cal-tip-type.nonwork { background: #fef3c7; color: #b45309; }
  .cal-tip strong { font-size: 13.5px; font-weight: 700; line-height: 1.3; }
  .cal-tip p { margin: 0; font-size: 12.5px; line-height: 1.45; color: #4b5563; white-space: pre-line; overflow-wrap: anywhere; }
  .cal-tip small { margin-top: 2px; font-size: 11px; color: #9ca3af; }
  @keyframes cal-tip-in { from { opacity: 0; } to { opacity: 1; } }
`;

export function HomeCalendar() {
  const [events, setEvents] = useState([]);
  const [viewDate, setViewDate] = useState(new Date());
  const [tip, setTip] = useState(null); // { ev, x, y, below } — the hover card for a holiday / non-working day

  useEffect(() => {
    const load = () =>
      fetch(`${API}/calendar`, { headers: { Accept: "application/json" } })
        .then((res) => res.json())
        .then((data) => { if (Array.isArray(data)) setEvents(data); })
        .catch((err) => console.error("Calendar error:", err));
    load();
    return liveRefresh(load);
  }, []);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = viewDate.toLocaleString("en-US", { month: "long" });

  // "today" in Philippine time, even on a computer set to another timezone
  const todayKey = todayManila();
  const [ty, tm, td] = todayKey.split("-").map(Number);
  const pad = (n) => String(n).padStart(2, "0");
  const isToday = (d) => d === td && month === tm - 1 && year === ty;
  const keyOf = (d) => `${year}-${pad(month + 1)}-${pad(d)}`;
  // slice(0, 10) so both "2026-10-15" and "2026-10-15T00:00:00Z" work
  const eventOf = (d) => events.find((e) => String(e.date).slice(0, 10) === keyOf(d));

  const upcoming = events
    .map((e) => ({ ...e, k: String(e.date).slice(0, 10) }))
    .filter((e) => e.k >= todayKey)
    .sort((a, b) => a.k.localeCompare(b.k))[0];
  const upcomingLabel = upcoming
    ? new Date(upcoming.k + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "";

  return (
    <div className="ix-card adm-cal">
      <div className="adm-cal-head">
        <button className="adm-cal-nav" onClick={() => setViewDate(new Date(year, month - 1, 1))} aria-label="Previous month">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <strong>{monthName} {year}</strong>
        <button className="adm-cal-nav" onClick={() => setViewDate(new Date(year, month + 1, 1))} aria-label="Next month">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </div>

      <button className="adm-cal-today" onClick={() => setViewDate(new Date(ty, tm - 1, 1))}>Jump to today</button>

      <div className="adm-cal-grid">
        {DOW.map((d) => <div key={d} className="adm-cal-dow">{d}</div>)}
        {Array.from({ length: firstDay }, (_, i) => <div key={`blank-${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const d = i + 1;
          const ev = eventOf(d);
          const cls = ["adm-cal-day", isToday(d) && "today", ev && "event"].filter(Boolean).join(" ");
          // show the hover card above the day (or below it near the top of the screen)
          const showTip = (e) => {
            if (!ev) return;
            const r = e.currentTarget.getBoundingClientRect();
            const below = r.top < 150;
            setTip({ ev, x: r.left + r.width / 2, y: below ? r.bottom + 8 : r.top - 8, below });
          };
          return (
            <div
              key={d} className={cls}
              tabIndex={ev ? 0 : undefined}
              onMouseEnter={showTip} onFocus={showTip}
              onMouseLeave={() => setTip(null)} onBlur={() => setTip(null)}
              aria-label={`${monthName} ${d}${ev ? ", " + ev.title + (ev.description ? ". " + ev.description : "") : ""}`}
            >
              {d}
              {ev && <i className="adm-cal-dot" />}
            </div>
          );
        })}
      </div>

      <div className="adm-cal-legend">
        <span><i className="dot orange" /> Today</span>
        <span><i className="dot amber" /> Holiday / Non-working</span>
      </div>
      {tip && createPortal(
        <div
          className={tip.below ? "cal-tip below" : "cal-tip"}
          style={{ left: Math.min(Math.max(tip.x, 140), window.innerWidth - 140), top: tip.y }}
          role="tooltip"
        >
          <span className={tip.ev.type === "holiday" ? "cal-tip-type holiday" : "cal-tip-type nonwork"}>
            {tip.ev.type === "holiday" ? "Holiday" : "Non-working day"}
          </span>
          <strong>{tip.ev.title}</strong>
          {tip.ev.description && <p>{tip.ev.description}</p>}
          <small>
            {new Date(String(tip.ev.date).slice(0, 10) + "T00:00:00")
              .toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </small>
          <style>{CAL_TIP_CSS}</style>
        </div>,
        document.body
      )}
      {upcoming && (
        <div className="adm-cal-next">
          <Icon name="calendar" size={15} />
          <span>Next break: <strong>{upcoming.title}</strong> on {upcomingLabel}</span>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Records ───────────────────────── */
export function Records({ records, loading }) {
  const { state } = useLocation();                       // "View all records" from Monitor Interns pre-fills the search
  const [dateFilter, setDateFilter] = useState("");
  const [search, setSearch] = useState(state?.search || "");
  const filtered = records
    .filter((r) => !dateFilter || r.date === dateFilter)
    .filter((r) => r.name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <PageHeader title="All Attendance Records" sub="Complete system-wide attendance log." live />
      <div className="ix-toolbar">
        <div className="ix-search">
          <Icon name="search" size={16} />
          <input type="text" placeholder="Search intern..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <input type="date" className="ix-input" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
        {dateFilter && <button className="ix-b ghost" onClick={() => setDateFilter("")}>Clear date</button>}
        <span className="ix-chip">{filtered.length} records</span>
      </div>
      <div className="ix-card flush">
        {loading ? <Spinner /> : (
          <Table
            headers={["Intern", "Date", "Type", "Action", "Time In", "Time Out", "Token"]}
            rows={filtered.map((r) => [
              <strong>{r.name}</strong>,
              r.date,
              <Badge label={r.uid === "ONLINE" ? "Online" : "Onsite"} type={r.uid === "ONLINE" ? "online" : "onsite"} />,
              <Badge label={r.action === "CHECK_IN" ? "IN" : "OUT"} type={r.action === "CHECK_IN" ? "in" : "out"} />,
              fmtTime(r.checked_in_at),
              fmtTime(r.checked_out_at),
              <span className="ix-mono">{r.token?.substring(0, 20)}…</span>,
            ])}
            empty="No records match your filters."
          />
        )}
      </div>
    </>
  );
}

/* ───────────────────────── Manage Accounts ───────────────────────── */
const BLANK_FORM = {
  first_name: "", middle_name: "", last_name: "",
  email: "", password: "", date_of_birth: "", role: "intern",
  student_id: "", contact_number: "", address: "",
  placement: "", semester: "1st Semester", program: "BSIT - 4",
  uid: "", work_mode: "onsite", tracking_type: "hours", dtr_mode: "two", supervisor_id: "", photo: null,
  emergency_contact_name: "", emergency_contact_relation: "",
  emergency_contact_number: "", emergency_contact_address: "",
};
const ROLE_NAME = { intern: "Intern", supervisor: "Supervisor", admin: "Admin", ojt_coordinator: "OJT Coordinator" };

function Accounts({ users, onRefresh }) {
  // HTE supervisors the admin can assign to an intern
  const supervisors = users.filter((u) => u.role === "supervisor").sort((a, b) => a.name.localeCompare(b.name));
  const [form, setForm] = useState(BLANK_FORM);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [msg, setMsg] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [scanning, setScanning] = useState(false);
  const uidBuffer = useRef("");

  // ── view-user modal state (read-only details, with an Edit button) ──
  const [viewUser, setViewUser] = useState(null);
  const vu = viewUser ? users.find((x) => x.id === viewUser.id) || viewUser : null; // stays fresh after a refresh

  // ── edit-user modal state ──
  const [editUser, setEditUser] = useState(null);   // the user being edited (null = modal closed)
  const [editForm, setEditForm] = useState({});
  const [editPhoto, setEditPhoto] = useState(null); // a newly chosen photo file
  const [editPreview, setEditPreview] = useState(null);
  const [editMsg, setEditMsg] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Listens for the NFC reader (it "types" the UID and presses Enter)
  useEffect(() => {
    const handleKey = (e) => {
      if (!scanning) return;
      if (e.key === "Enter") {
        e.preventDefault();
        const uid = uidBuffer.current.trim();
        uidBuffer.current = "";
        if (uid.length >= 4) {
          setForm((f) => ({ ...f, uid }));
          setScanning(false);
        }
      } else if (e.key.length === 1) {
        e.preventDefault(); // keeps the digits out of whatever field has focus
        uidBuffer.current += e.key;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [scanning]);

  useEffect(() => {
    if (form.role !== "intern") {
      setForm((f) => ({ ...f, uid: "" }));
      setScanning(false);
      uidBuffer.current = "";
    }
  }, [form.role]);

  // preview of the newly chosen photo in the edit modal
  useEffect(() => {
    if (!editPhoto) { setEditPreview(null); return; }
    const url = URL.createObjectURL(editPhoto);
    setEditPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [editPhoto]);

  const openModal = () => { setMsg(null); setViewUser(null); setEditUser(null); setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const closeModal = () => {
    setShowForm(false);
    setForm(BLANK_FORM);
    setScanning(false);
    uidBuffer.current = "";
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (scanning) return;
    setAdding(true); setMsg(null);
    try {
      // multipart form, so the profile photo can travel with the other fields
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (k !== "photo" && v !== null && v !== undefined) fd.append(k, v);
      });
      if (form.photo) fd.append("photo", form.photo);
      const res = await fetch(`${API}/admin/users`, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setMsg({ type: "success", text: data.message });
      closeModal();
      onRefresh();
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    } finally { setAdding(false); }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete user "${name}"? This cannot be undone.`)) return false;
    setDeleting(id);
    try {
      const res = await fetch(`${API}/admin/users/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setMsg({ type: "success", text: "User deleted." });
      onRefresh();
      return true;
    } catch (err) {
      setMsg({ type: "error", text: err.message });
      return false;
    } finally { setDeleting(null); }
  };

  /* ───── edit ───── */
  const openEdit = (u) => {
    const parts = (u.name || "").trim().split(/\s+/);
    setEditForm({
      first_name: u.first_name || parts[0] || "",
      middle_name: u.middle_name || "",
      last_name: u.last_name || (parts.length > 1 ? parts[parts.length - 1] : ""),
      email: u.email || "",
      student_id: u.student_id || "",
      contact_number: u.contact_number || "",
      address: u.address || "",
      program: u.program || "",
      semester: u.semester || "",
      placement: u.placement || "",
      work_mode: u.work_mode || "onsite",
      tracking_type: u.tracking_type || "hours",
      dtr_mode: dtrModeOf(u),
      supervisor_id: u.supervisor_id ? String(u.supervisor_id) : "",
      uid: u.nfc_uid || "",
      date_of_birth: u.date_of_birth ? String(u.date_of_birth).slice(0, 10) : "",
      password: "",
      emergency_contact_name: u.emergency_contact_name || "",
      emergency_contact_relation: u.emergency_contact_relation || "",
      emergency_contact_number: u.emergency_contact_number || "",
      emergency_contact_address: u.emergency_contact_address || "",
    });
    setEditPhoto(null);
    setEditMsg(null);
    setMsg(null);
    setEditUser(u);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  // Cancel / Save go back to the read-only profile (the user stays open)
  const closeEdit = () => { setEditUser(null); setEditPhoto(null); setEditMsg(null); };
  const openView = (u) => { setMsg(null); closeEdit(); setViewUser(u); };
  const backToList = () => { closeEdit(); setViewUser(null); setMsg(null); };
  const setEF = (k) => (e) => setEditForm((f) => ({ ...f, [k]: e.target.value }));

  const pickEditPhoto = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/") || f.size > 2 * 1024 * 1024) {
      setEditMsg({ type: "error", text: "Please choose an image under 2 MB." });
      return;
    }
    setEditMsg(null);
    setEditPhoto(f);
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    setSavingEdit(true); setEditMsg(null);
    try {
      const clean = Object.fromEntries(Object.entries(editForm).map(([k, v]) => [k, String(v).trim()]));

      // 1) the details
      const res = await fetch(`${API}/admin/users/${editUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(clean),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const firstError = data?.errors ? Object.values(data.errors)[0]?.[0] : null;
        throw new Error(
          firstError || data?.message ||
          (res.status === 404 || res.status === 405
            ? "Saving isn't set up on the server yet."
            : "Could not save the changes.")
        );
      }

      // 2) the photo, only if a new one was chosen
      let newPhoto = null;
      if (editPhoto) {
        const fd = new FormData();
        fd.append("photo", editPhoto);
        const pr = await fetch(`${API}/admin/users/${editUser.id}/photo`, {
          method: "POST", headers: { Accept: "application/json" }, body: fd,
        });
        const pdata = await pr.json().catch(() => null);
        if (!pr.ok) throw new Error(pdata?.message || "Details were saved, but the photo could not be uploaded.");
        newPhoto = pdata?.photo || null;
      }

      // if this is my own account, refresh my navbar name / photo too
      const me = JSON.parse(sessionStorage.getItem("user") || "{}");
      if (me.id === editUser.id) {
        sessionStorage.setItem("user", JSON.stringify({
          ...me,
          ...(data?.name ? { name: data.name } : {}),
          ...(newPhoto ? { photo: newPhoto } : {}),
        }));
      }

      setMsg({ type: "success", text: data?.message || "User updated." });
      closeEdit();
      onRefresh();
    } catch (err) {
      setEditMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    } finally { setSavingEdit(false); }
  };

  const editIsIntern = editUser?.role === "intern";

  /* ───── search + role filter ───── */
  const ROLE_TABS = [
    { key: "all", label: "All" },
    { key: "intern", label: "Interns" },
    { key: "admin", label: "Admins" },
    { key: "supervisor", label: "Supervisors" },
    { key: "ojt_coordinator", label: "Coordinators" },
  ];
  const sq = search.trim().toLowerCase();
  const shownUsers = users
    .filter((u) => roleFilter === "all" || u.role === roleFilter)
    .filter((u) => `${u.name} ${u.email} ${u.student_id ?? ""}`.toLowerCase().includes(sq));

  return (
    <>
      <PageHeader title="Manage Accounts" sub="Click a user to see their profile, then Edit to change it." />

      {!showForm && !editUser && <Msg msg={msg} />}

      {showForm ? (
        /* ───────── Add a user on the page (same layout as the profile / edit view) ───────── */
        <>
          <div className="acc-bar">
            <button type="button" className="ix-b ghost sm" onClick={closeModal} disabled={adding}>
              ‹ Back to all users
            </button>
          </div>
          <div className="ix-card">
            <Msg msg={msg} />
            <form
              onSubmit={handleAdd}
              onKeyDown={(e) => { if (e.key === "Enter" && e.target.tagName !== "BUTTON") e.preventDefault(); }}
            >
              <UserForm
                mode="add"
                f={form}
                set={(k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }))}
                isIntern={form.role === "intern"}
                supervisors={supervisors}
                header={<PhotoPicker file={form.photo} onChange={(file) => setForm((s) => ({ ...s, photo: file }))} />}
                uidField={
                  <>
                    <div className="ix-row-gap">
                      <input
                        type="text"
                        className={scanning ? "uf-input scanning" : "uf-input"}
                        placeholder="Scan the card or type the UID"
                        value={scanning ? "Waiting for card tap..." : form.uid}
                        readOnly={scanning}
                        onChange={(e) => setForm((s) => ({ ...s, uid: e.target.value }))}
                      />
                      <button
                        type="button"
                        className={scanning ? "ix-b ghost sm" : "ix-b primary sm"}
                        onClick={(e) => { e.currentTarget.blur(); uidBuffer.current = ""; setScanning((s) => !s); }}
                      >
                        <Icon name="nfc" size={14} /> {scanning ? "Cancel" : "Scan"}
                      </button>
                    </div>
                    {scanning && <small className="uf-hint">Keep this window focused, then tap the card on the reader.</small>}
                    {form.uid && !scanning && (
                      <small className="uf-hint">
                        UID captured: <strong style={{ fontFamily: "monospace" }}>{form.uid}</strong>{" "}
                        <button type="button" style={{ background: "none", border: 0, color: "#dc2626", cursor: "pointer", fontSize: 11 }}
                          onClick={() => setForm((s) => ({ ...s, uid: "" }))}>clear</button>
                      </small>
                    )}
                    {!form.uid && !scanning && <small className="uf-hint">Leave blank if there's no NFC card yet.</small>}
                  </>
                }
                actions={
                  <>
                    <button type="button" className="ix-b ghost" onClick={closeModal}>Cancel</button>
                    <button type="submit" className="ix-b primary" disabled={adding}>{adding ? "Adding..." : "Add User"}</button>
                  </>
                }
              />
            </form>
          </div>
        </>
      ) : vu ? (
        /* ───────── One user's profile on the page: read-only, Edit switches it to fields right here ───────── */
        <>
          <div className="acc-bar">
            <button type="button" className="ix-b ghost sm" onClick={backToList} disabled={savingEdit}>
              ‹ Back to all users
            </button>
            {!editUser && (
              <div className="acc-bar-r">
                <button type="button" className="ix-b primary sm" onClick={() => openEdit(vu)}>
                  <Icon name="pencil" size={14} /> Edit
                </button>
                <button type="button" className="ix-b danger sm" disabled={deleting === vu.id}
                  onClick={async () => { if (await handleDelete(vu.id, vu.name)) setViewUser(null); }}>
                  <Icon name="trash" size={14} /> {deleting === vu.id ? "..." : "Delete"}
                </button>
              </div>
            )}
          </div>

          {!editUser ? (
            <div className="ix-card"><UserDetails u={vu} /></div>
          ) : (
            <div className="ix-card">
              <Msg msg={editMsg} />
              <form
                onSubmit={saveEdit}
                onKeyDown={(e) => { if (e.key === "Enter" && e.target.tagName !== "BUTTON") e.preventDefault(); }}
              >
                <UserForm
                  mode="edit"
                  f={editForm}
                  set={setEF}
                  isIntern={editIsIntern}
                  supervisors={supervisors}
                  title={editUser.name}
                  sub="Click the photo to change it."
                  header={
                    <label className="ix-photo-box" style={{ width: 84, height: 84, borderRadius: "50%" }}>
                      <input type="file" accept="image/*" onChange={pickEditPhoto} />
                      {editPreview
                        ? <img src={editPreview} alt="New profile" />
                        : <Avatar name={editUser.name} photo={editUser.photo} size={84} />}
                      <span className="ix-photo-badge"><Icon name="camera" size={13} /></span>
                    </label>
                  }
                  uidField={
                    <>
                      <input className="uf-input" type="text" placeholder="Type the UID" value={editForm.uid} onChange={setEF("uid")} />
                      <small className="uf-hint">Clear this field to unlink the card.</small>
                    </>
                  }
                  actions={
                    <>
                      <button type="button" className="ix-b ghost" onClick={closeEdit} disabled={savingEdit}>Cancel</button>
                      <button type="submit" className="ix-b primary" disabled={savingEdit}>{savingEdit ? "Saving..." : "Save changes"}</button>
                    </>
                  }
                />
              </form>
            </div>
          )}
        </>
      ) : (
      <>

      <div className="ix-toolbar">
        <div className="ix-search">
          <Icon name="search" size={16} />
          <input
            type="text"
            placeholder="Search name, email or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {/* who to show: All / Interns / Admins / Supervisors / Coordinators */}
        <select
          className="ix-select acc-role"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          aria-label="Show users by role"
        >
          {ROLE_TABS.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label} ({t.key === "all" ? users.length : users.filter((u) => u.role === t.key).length})
            </option>
          ))}
        </select>
        <span className="ix-chip">{shownUsers.length} of {users.length}</span>
        <button className="ix-b primary acc-add" onClick={openModal}><Icon name="plus" size={16} /> Add New User</button>
      </div>

      <div className="ix-card flush">
        <Table
          headers={["User", "Role", "Email"]}
          rows={shownUsers.map((u) => [
            <button type="button" className="ix-actions acc-open" onClick={() => openView(u)} title="View profile">
              <Avatar name={u.name} photo={u.photo} size={36} />
              <span className="acc-who">
                <strong>{u.name}</strong>
                {u.student_id && <small>{u.student_id}</small>}
              </span>
            </button>,
            ROLE_NAME[u.role] || u.role,
            u.email,
          ])}
          empty={users.length ? "No users match your search." : "No users yet."}
        />
      </div>
      </>
      )}


    </>
  );
}

/* ───────────────────────── Print ID Cards ─────────────────────────
   Only interns whose NFC card request the coordinator approved (or whose card is already linked). */
function PrintIdCards({ interns }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API}/supervisor/nfc-requests`, { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setRequests(d); else setError(d?.message || "Couldn't load card requests."); })
      .catch(() => setError("Couldn't reach the server."))
      .finally(() => setLoading(false));
  }, []);

  // newest request of each intern (the list comes newest first within each status)
  const latest = {};
  [...requests].sort((a, b) => b.id - a.id).forEach((r) => { if (!latest[r.user_id]) latest[r.user_id] = r; });

  const ready = interns.filter((u) => u.nfc_uid || ["approved", "issued"].includes(latest[u.id]?.status));
  const statusOf = (u) => (u.nfc_uid
    ? <><i /> Card linked</>
    : "Approved · link the card after printing");

  return (
    <>
      <PageHeader title="Print ID Cards" sub="Print the cards of interns whose NFC card request was approved." />
      {error && <div className="ix-alert"><Icon name="warn" size={18} /> {error}</div>}
      {loading ? <Spinner /> : <PrintCards interns={ready} statusOf={statusOf} />}
    </>
  );
}

/* ───────── Searchable intern picker (name / email / student ID) ───────── */
function InternSearch({ interns, selected, onSelect }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const wrap = useRef(null);

  // close when clicking outside
  useEffect(() => {
    const h = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const sq = q.trim().toLowerCase();
  const matches = interns
    .filter((u) => `${u.name} ${u.email} ${u.student_id ?? ""}`.toLowerCase().includes(sq))
    .slice(0, 8);

  const pick = (u) => { onSelect(String(u.id)); setQ(""); setOpen(false); };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((i) => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (open && matches[hi]) pick(matches[hi]); }
    else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div className="dtr-search" ref={wrap}>
      <Icon name="search" size={15} />
      <input
        type="text"
        placeholder="Search name, email or student ID…"
        value={open ? q : selected?.name || ""}
        onFocus={() => { setOpen(true); setQ(""); setHi(0); }}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
        onKeyDown={onKeyDown}
        aria-label="Search intern"
        autoComplete="off"
      />
      {selected && !open && (
        <button type="button" className="dtr-search-clear" onClick={() => onSelect("")} aria-label="Clear intern">×</button>
      )}
      {open && (
        <ul className="dtr-search-list">
          {matches.length === 0 ? (
            <li className="dtr-search-empty">No interns found.</li>
          ) : matches.map((u, i) => (
            <li
              key={u.id}
              className={i === hi ? "active" : ""}
              onMouseEnter={() => setHi(i)}
              onMouseDown={(e) => { e.preventDefault(); pick(u); }}
            >
              <Avatar name={u.name} photo={u.photo} size={28} />
              <div>
                <strong>{u.name}</strong>
                <small>{u.email}{u.student_id ? ` · ${u.student_id}` : ""}</small>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ───────────────────────── DTR ───────────────────────── */
// Same CS Form 48 design as the intern's "My DTR", but with an intern picker.
// The columns follow each intern's DTR type (2 taps or 4 taps).
export function DTR({ interns, records, canCertify = false }) {
  // Month and year start on the current month; intern and period start blank.
  // Nothing is shown until an intern and a period are picked and "Display DTR" is clicked.
  const nowManila = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const [selectedId, setSelectedId] = useState("");
  const [year, setYear] = useState(nowManila.slice(0, 4));
  const [mon, setMon] = useState(nowManila.slice(5, 7));
  const [period, setPeriod] = useState("");       // "" | "first" | "second" | "full"
  const [shown, setShown] = useState(null);       // { id, year, mon, period } of the DTR on screen
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
  const picked = interns.find((u) => u.id === parseInt(selectedId));

  const display = () => {
    if (!picked) { setErr("Choose an intern first."); return; }
    if (!period) { setErr("Choose a period first."); return; }
    setErr("");
    setShown({ id: picked.id, year, mon, period });
  };

  const holidays = useHolidays();

  // everything below is for the DTR that was displayed (not the fields being changed)
  const intern = shown ? interns.find((u) => u.id === shown.id) : null;
  let view = null;
  if (intern) {
    const mode = dtrModeOf(intern);
    const month = `${shown.year}-${shown.mon}`;
    const range = periodsOf(shown.year, shown.mon).find((p) => p.key === shown.period);
    const { formRows, totalHrs, daysPresent, tardyMin, undertimeMin } =
      buildDtr({ records: records.filter((r) => r.user_id === intern.id), month, from: range.from, to: range.to, mode, holidays });
    const monthName = MONTHS.find((m) => m.value === shown.mon)?.label || "";
    const formHtml = dtrFormHtml({
      name: intern.name, office: "Caraga State University - MAIN", periodLabel: `${monthName} ${range.from} - ${range.to}, ${shown.year}`,
      officialHours: OFFICIAL_HOURS[mode], rows: formRows, totalHrs, tardyMin, undertimeMin,
    });
    view = { mode, month, range, totalHrs, daysPresent, monthName, formHtml };
  }

  const handlePrint = () => {
    if (!view) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>DTR - ${esc(intern?.name)}</title><style>
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
      <style>{DTR_PICK_CSS}</style>
      <PageHeader title="Generate DTR" sub="Choose an intern, the month, year and period, then click Display DTR." />
      <div className="ix-card">
        <div className="dtr-intern">
          <InternSearch interns={interns} selected={picked} onSelect={(id) => { setSelectedId(id); setErr(""); }} />
        </div>
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
            <p>Search an intern, choose a period, then click <b>Display DTR</b>.</p>
          </div>
        ) : (
          <>
            <div className="dtr-shown-head">
              <div className="req-dtr-meta">
                <span><strong>{intern.name}</strong></span>
                <span><strong>{view.monthName} {shown.year}</strong> · {view.range.label}</span>
                <span>{DTR_MODES[view.mode]}</span>
                <span>{view.daysPresent} day{view.daysPresent === 1 ? "" : "s"} present</span>
                <span>Total: <strong>{view.totalHrs}h</strong></span>
              </div>
              <button type="button" className="ix-b primary" onClick={handlePrint} disabled={!view.daysPresent}>
                <Icon name="print" size={16} /> Print DTR
              </button>
            </div>
            <CertifyBar
              key={`${intern.id}-${view.month}-${shown.period}`}
              intern={intern}
              from={`${view.month}-${String(view.range.from).padStart(2, "0")}`}
              to={`${view.month}-${String(view.range.to).padStart(2, "0")}`}
              canCertify={canCertify}
              hasDays={view.daysPresent > 0}
              currentHours={view.totalHrs}
            />
            <div className="cs48-pair">
              <div className="cs48-card" dangerouslySetInnerHTML={{ __html: view.formHtml }} />
              <div className="cs48-card" dangerouslySetInnerHTML={{ __html: view.formHtml }} />
            </div>
          </>
        )}
      </div>
      <style>{`.dtr-intern { margin-bottom: 12px; } .dtr-intern > * { max-width: 520px; }`}</style>
    </>
  );
}

/* ───────────────────────── Reports ───────────────────────── */
export function Reports({ interns, records }) {
  const nowManila = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const [year, setYear] = useState(nowManila.slice(0, 4));
  const [mon, setMon] = useState(nowManila.slice(5, 7));
  const month = `${year}-${mon}`; // "YYYY-MM", same format the rest of the report uses

  const MONTHS = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1).padStart(2, "0"),
    label: new Date(2000, i, 1).toLocaleDateString("en-US", { month: "long" }),
  }));
  const years = [...new Set([nowManila.slice(0, 4), year, ...records.map((r) => String(r.date || "").slice(0, 4)).filter(Boolean)])]
    .sort((a, b) => b.localeCompare(a));

  const data = interns.map((u) => {
    const recs = records.filter((r) => r.user_id === u.id && r.date?.startsWith(month));
    const days = [...new Set(recs.map((r) => r.date))].length;
    const onsite = recs.filter((r) => r.uid !== "ONLINE").length;
    const online = recs.filter((r) => r.uid === "ONLINE").length;
    const total = calcHours(recs);
    return { name: u.name, email: u.email, days, onsite, online, total, pct: Math.min(Math.round((total / requiredHoursFor(u.program)) * 100), 100) };
  });

  const monthLabel = new Date(month + "-01").toLocaleDateString("en-PH", { month: "long", year: "numeric" });

  const handlePrint = () => {
    const rowsHtml = data.map((d, i) => `
      <tr>
        <td>${i + 1}</td>
        <td style="text-align:left">${esc(d.name)}</td>
        <td style="text-align:left">${esc(d.email)}</td>
        <td>${d.days}</td><td>${d.onsite}</td><td>${d.online}</td>
        <td>${d.total}h</td><td>${d.pct}%</td>
      </tr>`).join("");

    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>Consolidated Report</title><style>
      body{font-family:'Times New Roman',serif;padding:40px;}
      h2,h3,p{text-align:center;margin:2px 0;}
      table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px;}
      th,td{border:1px solid #000;padding:6px 8px;text-align:center;}
      th{background:#f0f0f0;font-weight:bold;}
      .sig-line{width:220px;border-top:1px solid #000;text-align:center;padding-top:4px;font-size:12px;}
    </style></head><body>
      <h2>CARAGA STATE UNIVERSITY</h2>
      <p>College of Computing and Information Sciences</p>
      <p>Butuan City, Agusan del Norte</p>
      <h3 style="margin-top:10px;">CONSOLIDATED OJT ATTENDANCE REPORT</h3>
      <p>For the Month of: <strong>${monthLabel}</strong></p>
      <hr style="margin:10px 0"/>
      <table>
        <thead><tr><th>#</th><th>Intern</th><th>Email</th><th>Days</th><th>Onsite</th><th>Online</th><th>Total Hours</th><th>Progress</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <p style="text-align:right;margin-top:12px;font-size:11px;">Generated: ${new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}</p>
      <div style="display:flex;justify-content:flex-end;margin-top:50px;">
        <div class="sig-line">OJT Coordinator's Signature over Printed Name</div>
      </div>
    </body></html>`);
    w.document.close(); w.print();
  };

  return (
    <>
      <PageHeader title="Consolidated Report" sub="Monthly attendance summary for all interns." />
      <div className="ix-toolbar">
        <select className="dtr-sel" value={mon} onChange={(e) => setMon(e.target.value)} aria-label="Month">
          {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <select className="dtr-sel" value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <button className="ix-b primary" onClick={handlePrint}><Icon name="print" size={16} /> Print Report</button>
      </div>

      <div className="ix-stats">
        <StatCard label="Interns" value={data.length} icon="users" tone="orange" />
        <StatCard label="Total Hours" value={Math.round(data.reduce((s, d) => s + d.total, 0) * 10) / 10 + "h"} icon="clock" tone="blue" />
        <StatCard label="Total Days" value={data.reduce((s, d) => s + d.days, 0)} icon="calendar" tone="green" />
        <StatCard label="Online Logs" value={data.reduce((s, d) => s + d.online, 0)} icon="globe" tone="purple" />
      </div>

      <Section icon="chart" title={`Summary · ${monthLabel}`} count={data.length}>
        <Table
          headers={["#", "Intern", "Email", "Days", "Onsite", "Online", "Total Hours", "Progress"]}
          rows={data.map((d, i) => [
            i + 1,
            <strong>{d.name}</strong>,
            d.email, d.days, d.onsite, d.online,
            <strong>{d.total}h</strong>,
            <div className="ix-prog"><Bar pct={d.pct} /><span>{d.pct}%</span></div>,
          ])}
          empty="No records for this month."
        />
      </Section>
    </>
  );
}

/* ───────────────────────── Calendar Management ───────────────────────── */
function Calendar() {
  const [events, setEvents] = useState([]);
  const [date, setDate] = useState("");
  const [type, setType] = useState("holiday");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const fetchEvents = async () => {
    try {
      const res = await fetch(`${API}/calendar`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load calendar.");
      setEvents(Array.isArray(data) ? data : []);
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handleEdit = (event) => {
    setEditingId(event.id);
    setDate(String(event.date).slice(0, 10));
    setType(event.type);
    setTitle(event.title);
    setDescription(event.description || "");
    setMsg(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDate("");
    setType("holiday");
    setTitle("");
    setDescription("");
    setMsg(null);
  };

  const handleSave = async (e) => {
    e.preventDefault();

    if (!date || !title) {
      setMsg({ type: "error", text: "Please enter a date and title." });
      return;
    }

    setSaving(true);
    setMsg(null);

    try {
      const url = editingId ? `${API}/calendar/${editingId}` : `${API}/calendar`;
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ date, type, title, description }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save calendar event.");

      setMsg({ type: "success", text: data.message });
      setEditingId(null);
      setDate("");
      setTitle("");
      setDescription("");
      setType("holiday");
      fetchEvents();
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this calendar event?")) return;

    try {
      const res = await fetch(`${API}/calendar/${id}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to delete event.");

      setMsg({ type: "success", text: data.message });
      fetchEvents();
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    }
  };

  return (
    <>
      <PageHeader title="Calendar Management" sub="Manage holidays and non-working days." />

      <Msg msg={msg} />

      {/* the form on the left, the list of events on the right — one row */}
      <div className="side-split">
      <div className="ix-card adm-cal-form">
        <h3 className="side-title">{editingId ? "Edit Calendar Event" : "Add Calendar Event"}</h3>

        <form onSubmit={handleSave} className="ix-form">
          <div className="ix-row-gap">
            <div className="ix-field">
              <label htmlFor="cal-date">Date</label>
              <input id="cal-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="ix-field">
              <label htmlFor="cal-type">Type</label>
              <select id="cal-type" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="holiday">Holiday</option>
                <option value="non_working">Non-working Day</option>
              </select>
            </div>
          </div>

          <div className="ix-field">
            <label htmlFor="cal-title">Title</label>
            <input
              id="cal-title" type="text" required placeholder="e.g. Independence Day"
              value={title} onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="ix-field">
            <label htmlFor="cal-desc">Description</label>
            <input
              id="cal-desc" type="text" placeholder="Optional description"
              value={description} onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="ix-form-actions adm-cal-actions">
            <button type="submit" className="ix-b primary" disabled={saving}>
              {saving ? (editingId ? "Updating..." : "Adding...") : editingId ? "Update Event" : "Add Event"}
            </button>
            {editingId && (
              <button type="button" className="ix-b ghost" onClick={cancelEdit}>Cancel</button>
            )}
          </div>
        </form>
      </div>

      <div className="ix-card flush adm-cal-list">
        <div className="side-head">
          <div>
            <h3>Calendar Events</h3>
            <p>Holidays and non-working days registered in the system.</p>
          </div>
          <span className="ix-count">{events.length}</span>
        </div>

        {loading ? (
          <Spinner />
        ) : events.length === 0 ? (
          <Empty
            icon="calendar"
            title="No calendar events"
            sub="No holidays or non-working days have been added yet."
          />
        ) : (
          <Table
            headers={["Date", "Type", "Title", "Description", "Action"]}
            rows={events.map((event) => [
              String(event.date).slice(0, 10),
              <Badge
                label={event.type === "holiday" ? "Holiday" : "Non-working"}
                type={event.type === "holiday" ? "approved" : "pending"}
              />,
              <strong>{event.title}</strong>,
              event.description || "—",
              <div className="ix-actions">
                <button className="ix-b ghost sm" onClick={() => handleEdit(event)}>Edit</button>
                <button className="ix-b danger sm" onClick={() => handleDelete(event.id)}>Delete</button>
              </div>,
            ])}
            empty="No calendar events."
          />
        )}
      </div>
      </div>
    </>
  );
}

/* ───────────────────────── My Profile (same design as the intern's, with editing) ───────────────────────── */
// Uses the .ix-profile styles from internCss, which this file already loads.
export function AdminProfile({ user }) {
  const [acct, setAcct] = useState(null);
  const [form, setForm] = useState({});
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    try {
      const res = await fetch(`${API}/me?user_id=${user.id}`);
      const d = await res.json();
      if (res.ok) setAcct(d?.user || d);
      else { setAcct({}); setMsg({ type: "error", text: d.message || "Could not load your profile." }); }
    } catch {
      setAcct({}); setMsg({ type: "error", text: "Couldn't reach the server." });
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // preview of a newly chosen photo
  useEffect(() => {
    if (!photoFile) { setPreview(null); return; }
    const url = URL.createObjectURL(photoFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  const me = { ...user, ...(acct || {}) };

  // only the admin may edit profile details; coordinators and supervisors just view theirs
  const canEdit = user?.role === "admin";
  const startEdit = () => {
    if (!canEdit) return;
    const parts = (me.name || "").trim().split(/\s+/);
    setForm({
      first_name: me.first_name || parts[0] || "",
      middle_name: me.middle_name || "",
      last_name: me.last_name || (parts.length > 1 ? parts[parts.length - 1] : ""),
      email: me.email || "",
      student_id: me.student_id || "",
      contact_number: me.contact_number || "",
      address: me.address || "",
      date_of_birth: me.date_of_birth ? String(me.date_of_birth).slice(0, 10) : "",
      password: "",
    });
    setPhotoFile(null); setMsg(null); setEditing(true);
  };
  const cancelEdit = () => { setEditing(false); setPhotoFile(null); setMsg(null); };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const pickPhoto = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/") || f.size > 2 * 1024 * 1024) {
      setMsg({ type: "error", text: "Please choose an image under 2 MB." });
      return;
    }
    setMsg(null);
    setPhotoFile(f);
  };

  const save = async (e) => {
    e.preventDefault();
    const clean = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, String(v).trim()]));
    setSaving(true); setMsg(null);
    try {
      // 1) the details
      const res = await fetch(`${API}/admin/users/${me.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(clean),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error((data?.errors && Object.values(data.errors)[0]?.[0]) || data?.message || "Could not save the changes.");
      }

      // 2) the photo, only if a new one was chosen
      let photo = me.photo;
      if (photoFile) {
        const fd = new FormData();
        fd.append("photo", photoFile);
        const pr = await fetch(`${API}/admin/users/${me.id}/photo`, { method: "POST", headers: { Accept: "application/json" }, body: fd });
        const pd = await pr.json().catch(() => null);
        if (!pr.ok) throw new Error(pd?.message || "Details saved, but the photo could not be uploaded.");
        photo = pd.photo;
      }

      // keep the signed-in session (navbar name / photo) in step
      try {
        const cur = JSON.parse(sessionStorage.getItem("user") || "{}");
        sessionStorage.setItem("user", JSON.stringify({ ...cur, name: data?.name || cur.name, photo }));
      } catch { /* ignore */ }

      const changed = !!photoFile || (data?.name && data.name !== user.name);
      setEditing(false); setPhotoFile(null);
      setMsg({ type: "success", text: "Profile updated." });
      await load();
      if (changed) setTimeout(() => window.location.reload(), 700); // refresh the navbar name / photo
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="My Profile"
        sub={canEdit ? "Your account information and security." : "Your account information. Ask the admin if something needs to be changed."}
      />
      <Msg msg={msg} />
      {!acct ? <Spinner /> : (
        <div className="prof-stack">
          {editing ? (
            <div className="ix-card prof-main">
              <form onSubmit={save} onKeyDown={(e) => { if (e.key === "Enter" && e.target.tagName !== "BUTTON") e.preventDefault(); }}>
                <UserForm
                  mode="edit"
                  f={form}
                  set={set}
                  isIntern={false}
                  supervisors={[]}
                  title={me.name}
                  sub="Click the photo to change it."
                  header={
                    <label className="ix-photo-box" style={{ width: 84, height: 84, borderRadius: "50%" }}>
                      <input type="file" accept="image/*" onChange={pickPhoto} />
                      {preview ? <img src={preview} alt="New profile" /> : <Avatar name={me.name} photo={me.photo} size={84} />}
                      <span className="ix-photo-badge"><Icon name="camera" size={13} /></span>
                    </label>
                  }
                  actions={
                    <>
                      <button type="button" className="ix-b ghost" onClick={cancelEdit} disabled={saving}>Cancel</button>
                      <button type="submit" className="ix-b primary" disabled={saving}>{saving ? "Saving..." : "Save changes"}</button>
                    </>
                  }
                />
              </form>
            </div>
          ) : (
            <div className="ix-card prof-main">
              {canEdit && (
                <div className="prof-tools">
                  <button type="button" className="ix-b ghost sm" onClick={startEdit}>
                    <Icon name="pencil" size={14} /> Edit
                  </button>
                </div>
              )}
              <UserDetails u={me} />
            </div>
          )}
          <div className="prof-sec"><AccountSecurity user={user} /></div>
        </div>
      )}
    </>
  );
}
const cap = (s = "") => s.charAt(0).toUpperCase() + s.slice(1);

/* ───────────────────────── admin styles ───────────────────────── */
export const adminCss = `
/* font: Poppins, loaded by DashKit (uiUnify) */

/* ═════════ SHARED LOOK (all admin pages) ═════════ */
.ix-main { background:
  radial-gradient(560px 380px at 94% -4%, rgba(242,115,58,0.22), transparent 0%),
  radial-gradient(520px 400px at -4% 104%, rgba(255,181,140,0.38), transparent 0%),
  #f9f9f9;
}
.ix-content { font-family: 'Figtree', 'Segoe UI', sans-serif; }
.ix-content h1, .ix-content h2 { font-family: var(--display); }
.ix-content .ix-ph h1 { letter-spacing: -0.6px; }

/* cards: rounder, warmer shadow */
.ix-content .ix-card,
.ix-content .ix-section,
.ix-content .ix-sub,
.ix-content .ix-ic,
.ix-content .ix-hc,
.ix-content .ix-stat,
.ix-content .ix-doc {
  border-radius: 20px;
  border: 1px solid rgba(255,255,255,0.85);
  box-shadow: 0 12px 32px rgba(150,52,20,0.08), 0 1px 2px rgba(27,20,16,0.04);
}
.ix-content .ix-card.flush,
.ix-content .ix-section { overflow: hidden; }
.ix-content .ix-ic:hover,
.ix-content .ix-stat:hover { box-shadow: 0 20px 38px rgba(150,52,20,0.14); }

/* stat cards on Reports: gradient icon tiles, friendlier labels */
.ix-content .ix-stat-icon { color: #fff; }
.ix-content .ix-stat-icon.orange { background: linear-gradient(135deg, #f2864f, #e8582a); box-shadow: 0 8px 16px rgba(232,88,42,0.3); }
.ix-content .ix-stat-icon.blue   { background: linear-gradient(135deg, #5b8def, #2563eb); box-shadow: 0 8px 16px rgba(37,99,235,0.28); }
.ix-content .ix-stat-icon.green  { background: linear-gradient(135deg, #3ecf7d, #16a34a); box-shadow: 0 8px 16px rgba(22,163,74,0.28); }
.ix-content .ix-stat-icon.purple { background: linear-gradient(135deg, #a07af2, #7c3aed); box-shadow: 0 8px 16px rgba(124,58,237,0.28); }
.ix-content .ix-stat-label { text-transform: none; letter-spacing: 0; font-size: 12.5px; color: var(--mut); }
.ix-content .ix-stat-value { font-family: var(--display); }

/* tables: soft header, airy rows, warm hover */
.ix-content table { width: 100%; border-collapse: separate; border-spacing: 0; }
.ix-content thead th {
  background: #fff6f1; color: #8a6a5c; font-size: 12.5px; font-weight: 600; text-align: left;
  letter-spacing: 0; text-transform: none; padding: 14px 20px; border-bottom: 1px solid var(--line);
  white-space: nowrap;
}
.ix-content tbody td {
  padding: 14px 20px; font-size: 13.5px; color: #3a2e28; border-bottom: 1px solid #f8eee8;
  border-top: none; vertical-align: middle;
}
.ix-content tbody tr { transition: background .15s; }
.ix-content tbody tr:hover td { background: #fffaf6; }
.ix-content tbody tr:last-child td { border-bottom: none; }
.ix-content .ix-badge { border-radius: 99px; font-weight: 700; }

/* toolbar, inputs, pills, buttons */
.ix-content .ix-search, .ix-content .ix-input, .ix-content .ix-select { border-radius: 14px; border-color: #f1e2d9; background: #fff; }
.ix-content .ix-search:focus-within, .ix-content .ix-input:focus, .ix-content .ix-select:focus { border-color: var(--o); }
.ix-content .ix-chip { border-radius: 99px; background: #fff; border: 1px solid #f1e2d9; }
.ix-content .ix-chip.green { background: #ecfdf3; border-color: #c9f0d9; }
.ix-content .ix-b { border-radius: 12px; }
.ix-content .ix-b.ghost { border-color: #f1e2d9; background: #fffaf7; }
.ix-content .ix-b.ghost:hover:not(:disabled) { border-color: var(--o); background: #fdeee7; }
.ix-content .ix-field input, .ix-content .ix-field select, .ix-content .ix-field textarea { border-radius: 14px; border-color: #f1e2d9; background: #fffaf7; }
.ix-content .ix-field input:focus, .ix-content .ix-field select:focus, .ix-content .ix-field textarea:focus { background: #fff; border-color: var(--o); }
.ix-content .ix-note { border-radius: 14px; }
.ix-modal-wrap .ix-field input, .ix-modal-wrap .ix-field select { border-radius: 14px; border-color: #f1e2d9; background: #fffaf7; }
.ix-modal-wrap .ix-modal { border-radius: 26px; }
.ix-modal-wrap .ix-modal header h2 { font-family: 'Bricolage Grotesque', 'Segoe UI', sans-serif; }

/* calendar management page */
.adm-cal-form { margin: 0; }
.adm-cal-form h3 { margin: 0 0 14px; font-family: var(--display); font-size: 18px; font-weight: 800; letter-spacing: -0.3px; }
.adm-cal-actions .ix-b { flex: 1 1 auto; }
.ix-content .adm-cal-list td:nth-child(4) { white-space: normal; min-width: 120px; max-width: 220px; overflow-wrap: anywhere; }
.ix-content .adm-cal-list td:last-child .ix-actions { flex-wrap: nowrap; }
.ix-content .adm-cal-list > .ix-ph { padding: 20px 22px 0; margin-bottom: 14px; }
.ix-content .adm-cal-list > .ix-ph h1 { font-size: 19px; }

/* ═════════ HOME PAGE ═════════ */
.ix-content:has(.adm-home) { max-width: 1320px; }

.adm-home {
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(340px, 28vw, 440px);
  gap: 18px;
  align-items: start;
}
.adm-col { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
.adm-col .ix-section, .adm-col .ix-card { margin: 0; }

/* ── hero: the one bold card ── */
.ix-content .ix-card.adm-hero {
  position: relative; overflow: hidden; color: #fff;
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 22px 30px;
  padding: 28px 32px;
  background: linear-gradient(125deg, #2a120a 0%, #7a2a12 52%, #e8582a 135%);
  border: 1px solid rgba(255,255,255,0.85);
  box-shadow: 0 18px 40px rgba(150,52,20,0.22);
}
.adm-hero::before {
  content: ""; position: absolute; inset: 0; pointer-events: none; opacity: .13; mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='.6'/></svg>");
}
.adm-home .adm-hero .adm-hero-glow {
  position: absolute; right: -90px; top: -120px; width: 380px; height: 380px; border-radius: 50%; pointer-events: none; z-index: 0;
  background: radial-gradient(circle, rgba(255,160,110,0.5), rgba(255,160,110,0) 65%);
}
.adm-hero > *:not(.adm-hero-glow) { position: relative; z-index: 1; }
.adm-hero-text { min-width: 0; max-width: 560px; }
.adm-hero-tag {
  display: inline-block; padding: 5px 13px; border-radius: 99px; font-size: 12.5px; font-weight: 600;
  background: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.3);
}
.ix-content .adm-hero h1 { font-size: clamp(26px, 2.4vw, 36px); font-weight: 800; letter-spacing: -0.8px; line-height: 1.1; margin-top: 14px; color: #fff; text-shadow: 0 2px 20px rgba(0,0,0,0.3); }
.adm-hero p { font-size: 14px; line-height: 1.6; margin-top: 8px; color: rgba(255,255,255,0.82); }
.adm-hero-facts { display: flex; gap: 12px; margin-top: 20px; flex-wrap: wrap; }
.adm-hero-facts > div {
  display: flex; flex-direction: column; min-width: 104px; padding: 10px 16px; border-radius: 16px;
  background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.2);
}
.adm-hero-facts strong { font-family: var(--display); font-size: 24px; font-weight: 800; line-height: 1.1; }
.adm-hero-facts span { font-size: 12px; color: rgba(255,255,255,0.72); margin-top: 2px; }
.adm-hero .ix-ring-center strong { font-family: var(--display); font-size: 28px; }

/* ── summary cards ── */
.adm-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.adm-mini {
  position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 6px; min-width: 0;
  padding: 16px 18px; background: #fff; border-radius: 22px; border: 1px solid rgba(255,255,255,0.85);
  box-shadow: 0 14px 34px rgba(150,52,20,0.09), 0 1px 2px rgba(27,20,16,0.04);
  transition: transform .2s, box-shadow .2s;
}
.adm-mini::after {
  content: ""; position: absolute; right: -28px; top: -28px; width: 96px; height: 96px; border-radius: 50%;
  background: var(--tint); opacity: .75; pointer-events: none;
}
.adm-mini:hover { transform: translateY(-3px); box-shadow: 0 20px 38px rgba(150,52,20,0.14); }
.adm-mini.orange { --tint: #fdeee7; --fg: #e8582a; --grad: linear-gradient(135deg, #f2864f, #e8582a); }
.adm-mini.blue   { --tint: #e8f1fd; --fg: #2563eb; --grad: linear-gradient(135deg, #5b8def, #2563eb); }
.adm-mini.green  { --tint: #e6f7ee; --fg: #16a34a; --grad: linear-gradient(135deg, #3ecf7d, #16a34a); }
.adm-mini.purple { --tint: #f0eafd; --fg: #7c3aed; --grad: linear-gradient(135deg, #a07af2, #7c3aed); }
.adm-mini-top { position: relative; z-index: 1; display: flex; align-items: center; gap: 9px; min-width: 0; }
.adm-mini-icon {
  width: 32px; height: 32px; flex-shrink: 0; border-radius: 11px; display: flex; align-items: center; justify-content: center;
  background: var(--grad); color: #fff; box-shadow: 0 8px 16px color-mix(in srgb, var(--fg) 32%, transparent);
}
.adm-mini-label { font-size: 12.5px; font-weight: 600; color: var(--mut); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.adm-mini-value { position: relative; z-index: 1; font-family: var(--display); font-size: 32px; font-weight: 800; letter-spacing: -.6px; line-height: 1.1; color: var(--ink); }
.adm-mini-hint { position: relative; z-index: 1; display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: #9a8c84; line-height: 1.35; }
.adm-mini-bar { position: relative; z-index: 1; height: 5px; border-radius: 99px; background: var(--tint); overflow: hidden; }
.adm-mini-bar i { display: block; height: 100%; border-radius: 99px; background: var(--grad); transition: width .6s cubic-bezier(.2,.8,.2,1); }
.adm-live-dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; flex-shrink: 0; animation: adm-live 2s ease-out infinite; }
@keyframes adm-live { 0% { box-shadow: 0 0 0 0 rgba(34,197,94,0.5); } 100% { box-shadow: 0 0 0 9px rgba(34,197,94,0); } }

/* ── live attendance: scrolls inside its card ── */
.adm-live .ix-table-wrap { max-height: 420px; overflow: auto; }
.adm-live thead th { position: sticky; top: 0; z-index: 1; }
.adm-time { font-variant-numeric: tabular-nums; font-weight: 600; }
.adm-live .ix-actions { gap: 10px; }

/* ── calendar ── */
.ix-content .ix-card.adm-cal { padding: 20px 22px 18px; background: #fff; }
.adm-cal-head { display: flex; align-items: center; justify-content: space-between; }
.adm-cal-head strong { font-family: var(--display); font-size: 22px; font-weight: 800; letter-spacing: -.4px; }
.adm-cal-nav {
  width: 40px; height: 40px; border-radius: 14px; border: 1.5px solid #f1e2d9; background: #fffaf7;
  color: #6b5a50; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all .15s;
}
.adm-cal-nav:hover { border-color: #e8582a; color: #e8582a; background: #fdeee7; }
.adm-cal-today {
  display: block; margin: 12px auto 6px; padding: 7px 20px; border-radius: 99px;
  border: 1.5px solid #f1e2d9; background: #fffaf7; font-size: 14px; font-weight: 600; color: #3a2e28;
  cursor: pointer; transition: all .15s;
}
.adm-cal-today:hover { border-color: #e8582a; color: #e8582a; background: #fdeee7; }
.adm-cal-nav:focus-visible, .adm-cal-today:focus-visible { outline: 2px solid #e8582a; outline-offset: 2px; }
.adm-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); row-gap: 4px; }
.adm-cal-dow { text-align: center; font-size: 13px; font-weight: 600; color: #a1857a; padding: 9px 0; }
.adm-cal-day {
  position: relative; height: 46px; margin: 0 2px; border-radius: 15px;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; font-weight: 500; color: #2b211c; transition: background .15s;
}
.adm-cal-day:hover { background: #fff3ec; }
.adm-cal-day.today { background: linear-gradient(135deg, #f2733a, #e04a1a); color: #fff; font-weight: 800; box-shadow: 0 10px 20px rgba(232,88,42,0.35); }
.adm-cal-day.event { background: #fff4d6; color: #b45309; font-weight: 800; cursor: default; }
.adm-cal-day.event:focus-visible { outline: 2px solid #e8582a; outline-offset: -2px; }
.adm-cal-day.today.event { background: linear-gradient(135deg, #f2733a, #e04a1a); color: #fff; }
.adm-cal-dot { position: absolute; bottom: 6px; width: 6px; height: 6px; border-radius: 50%; background: #f59e0b; }
.adm-cal-day.today .adm-cal-dot { background: #fff; }
.adm-cal-legend {
  margin-top: 14px; padding-top: 14px; border-top: 1px dashed #f1ddd1;
  display: flex; align-items: center; gap: 20px; flex-wrap: wrap; font-size: 13.5px; color: #7a6c64;
}
.adm-cal-legend span { display: inline-flex; align-items: center; gap: 7px; }
.adm-cal-legend .dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.adm-cal-legend .dot.orange { background: #e8582a; }
.adm-cal-legend .dot.amber { background: #f59e0b; }
.adm-cal-next {
  margin-top: 12px; display: flex; align-items: center; gap: 8px; padding: 9px 12px; border-radius: 12px;
  background: #fff8e6; color: #92520b; font-size: 13px; line-height: 1.35;
}
.adm-cal-next svg { flex-shrink: 0; }

/* ── on duty now ── */
.ix-content .ix-card.adm-duty { padding: 20px 22px; background: linear-gradient(160deg, #fff 55%, #fff1e9); }
.adm-duty-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.adm-duty-head h2 { font-size: 20px; font-weight: 800; letter-spacing: -.3px; color: var(--ink); margin: 0; }
.adm-duty-head .ix-count { margin-left: auto; }
.adm-duty-icon {
  width: 38px; height: 38px; border-radius: 13px; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #3ecf7d, #16a34a); color: #fff; box-shadow: 0 8px 16px rgba(22,163,74,0.3);
}
.adm-duty-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.adm-duty-list li { display: flex; align-items: center; gap: 12px; padding: 8px 10px; border-radius: 14px; background: rgba(255,255,255,0.8); border: 1px solid #f8eee8; }
.adm-duty-name { font-size: 13.5px; font-weight: 700; color: #3a2e28; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.adm-duty-time { margin-left: auto; font-size: 12px; color: #9a8c84; white-space: nowrap; font-variant-numeric: tabular-nums; }
.adm-duty-list li.adm-duty-more { justify-content: center; font-size: 12.5px; font-weight: 600; color: #9a8c84; background: transparent; border-style: dashed; }
.adm-duty-empty { padding: 14px 16px; border-radius: 14px; border: 1.5px dashed #f2cdb9; background: rgba(255,255,255,0.7); }
.adm-duty-empty strong { font-size: 14.5px; color: #3a2e28; }
.adm-duty-empty p { margin-top: 4px; font-size: 13px; color: #9a8c84; }

/* ── My Profile (editable card) ── */
.ix-content .ix-profile-card { position: relative; }
.ix-profile-card dl dt { flex-shrink: 0; }
.ix-profile-card dl dd { min-width: 0; text-align: right; overflow-wrap: anywhere; }
.ix-profile-card dl dd:has(.imp-edit) { flex: 1; max-width: 62%; }
.ix-profile-card .imp-edit { width: 100%; text-align: left; }
.ix-profile-card .imp-edit-bar { justify-content: center; }
.ix-profile-card .ix-photo-box { margin: 0 auto; }

/* ── DTR intern search ── */
.dtr-search { position: relative; min-width: 260px; display: flex; align-items: center; }
.dtr-search > svg { position: absolute; left: 12px; color: #a1857a; pointer-events: none; }
.dtr-search input {
  width: 100%; padding: 10px 34px 10px 36px; border-radius: 14px; border: 1px solid #f1e2d9;
  background: #fff; font: inherit; font-size: 13.5px; color: #3a2e28; outline: none;
}
.dtr-search input:focus { border-color: #e8582a; }
.dtr-search-clear {
  position: absolute; right: 8px; width: 22px; height: 22px; border: 0; border-radius: 50%;
  background: #f6ebe4; color: #7a6c64; cursor: pointer; font-size: 15px; line-height: 1;
}
.dtr-search-clear:hover { background: #fdeee7; color: #e8582a; }
.dtr-search-list {
  position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 30; margin: 0; padding: 6px;
  list-style: none; max-height: 320px; overflow-y: auto; background: #fff;
  border: 1px solid #f1e2d9; border-radius: 16px; box-shadow: 0 16px 36px rgba(150,52,20,0.16);
}
.dtr-search-list li { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 12px; cursor: pointer; }
.dtr-search-list li.active { background: #fff3ec; }
.dtr-search-list li strong { display: block; font-size: 13.5px; color: #3a2e28; }
.dtr-search-list li small { display: block; font-size: 11.5px; color: #9a8c84; }
.dtr-search-list li.dtr-search-empty { cursor: default; justify-content: center; color: #9a8c84; font-size: 13px; }

/* ═════════ RESPONSIVE ═════════ */
@media (max-width: 1100px) {
  .adm-home { grid-template-columns: 1fr; }
  .adm-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 700px) {
  .ix-content .ix-card.adm-hero { padding: 22px; justify-content: center; text-align: center; }
  .adm-hero-facts { justify-content: center; }
  .adm-cal-day { height: 40px; font-size: 16px; margin: 0 1px; }
}
@media (prefers-reduced-motion: reduce) {
  .adm-live-dot { animation: none; }
  .adm-mini, .adm-mini-bar i { transition: none; }
}
`;