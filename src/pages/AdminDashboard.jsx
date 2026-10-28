// AdminDashboard.jsx
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import Shell, {
  navWithTabs,
  Spinner, PageHeader, StatCard, Badge, Table, Section, Empty, Msg, Modal, Bar, Avatar, Ring, Icon, PhotoPicker, Inbox,
  InternMonitor, AccountSecurity, UserDetails, UserForm, PRE_REQUIREMENTS, POST_REQUIREMENTS, todayManila, fmtTime, calcHours, greeting, esc, requiredHoursFor,
  DTR_MODES, dtrModeOf, liveRefresh, programKey, AnnouncementBoard, Drawer,
} from "../components/DashKit.jsx";
import { DashLayout, Panel, DashRow, DashEmpty, TodayPeople, NeedsAttention } from "../components/DashBoard.jsx";
import { formalLayout } from "../components/formalLayout.js";
import { mdCss } from "../components/materialTheme.js";
import { internCss, cardUnify, CS48_CSS, dtrFormHtml, buildDtr, OFFICIAL_HOURS, useHolidays, CertifyBar, DTR_PICK_CSS } from "./InternDashboard.jsx";
import { CardRequests } from "../components/NfcCards.jsx";
import CardAlerts from "../components/CardAlerts.jsx";
import QuarterlyReport from "../components/QuarterlyReport.jsx";
import { currentFit } from "../fit.js";
import { API, STORAGE } from "../config.js";

const NAV = [
  { path: "/admin",          label: "Dashboard",  icon: "dashboard" },
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
      { key: "cards", label: "Card Requests",   icon: "card",     sub: "Approved ID cards: download the details for your printing app, then mark them as printed." },
      { key: "kiosks", label: "Kiosks",         icon: "tap",      sub: "Each kiosk has its own key. An HTE kiosk only accepts the interns placed at that HTE." },
      { key: "activity", label: "Activity Log", icon: "list",     sub: "Who did what, and when: sign-ins, approvals, edits and deletions." },
      { key: "term",     label: "End of Term",  icon: "download", sub: "At the end of a term: export a batch's records to Excel, then deactivate their accounts (records are kept)." },
      { key: "backup",   label: "Backups",      icon: "download", sub: "Download a copy of the whole database. Keep it somewhere safe (not only on this laptop)." },
    ],
  },
  "/admin/reports": {
    title: "Reports",
    tabs: [
      { key: "dtr",     label: "Generate DTR",        icon: "file",  sub: "Daily Time Record for each intern. Search an intern and pick a month to view or print it." },
      { key: "quarterly", label: "Quarterly Report", icon: "file", sub: "Unit Performance Review Report: the deployment tables fill in by themselves; type the rest, then print or save as PDF." },
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
      <PageHeader title={group.title} heading={tab.label} sub={tab.sub} live={group.live} tabs={(
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
      )} />
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
/* Attendance Records */
.ix-page .rec-date { height: 30px; padding: 0 10px; font-size: 12px; width: auto; }
.ix-page .rec-taps { list-style: none; margin: 0; padding: 0; border: 1px solid #eceef1; border-radius: 12px; overflow: hidden; background: var(--ix-surface, #fff); }
.ix-page .rec-head-who { display: flex; align-items: center; gap: 10px; }
.ix-page .rec-taps li { display: grid; grid-template-columns: 34px minmax(0, 1fr) 72px 88px 84px; align-items: center; gap: 12px; padding: 9px 14px; }
.ix-page .rec-taps li + li { border-top: 1px solid #f4f1ee; }
.ix-page .rec-tap-name { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ix-page .rec-act { justify-self: start; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 6px; white-space: nowrap; }
.ix-page .rec-act.in { background: #dcfce7; color: #15803d; }
.ix-page .rec-act.out { background: #fff1ea; color: #c2410c; }
.ix-page .rec-tap-time { text-align: right; font-size: 13px; white-space: nowrap; }
@media (max-width: 640px) { .ix-page .rec-taps li { grid-template-columns: 30px minmax(0, 1fr) auto auto; } .ix-page .rec-taps li > .ix-badge { display: none; } }
.ix-page .rec-count { margin-left: auto; font-size: 11.5px; color: #8a7a71; }
.ix-page .rec-day { width: 34px; height: 34px; border-radius: 9px; background: #fff1ea; color: #c2410c; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1; }
.ix-page .rec-day b { font-size: 13px; } .ix-page .rec-day small { font-size: 9px; font-weight: 700; text-transform: uppercase; }
.ix-page .rec-head { display: flex; align-items: baseline; gap: 10px; } .ix-page .rec-head b { font-size: 16px; } .ix-page .rec-head small { font-size: 12px; color: #8a7a71; }
.ix-page .rec-scale, .ix-page .rec-rows li { display: grid; grid-template-columns: minmax(150px, 1.2fr) 150px minmax(160px, 2fr) 52px; gap: 12px; align-items: center; }
.ix-page .rec-scale { font-size: 10px; color: #a99d96; font-weight: 600; margin-bottom: -6px; }
.ix-page .rec-ticks { display: flex; justify-content: space-between; padding: 0 14px 0 0; }
.ix-page .rec-ticks i { font-style: normal; }
.ix-page .rec-scale { padding: 0 14px; }
.ix-page .rec-rows { list-style: none; margin: 0; padding: 0; background: var(--ix-surface, #fff); border: 1px solid #eceef1; border-radius: 12px; overflow: hidden; }
.ix-page .rec-rows li { padding: 8px 14px; border-bottom: 1px solid #f4f1ee; font-size: 12.5px; }
.ix-page .rec-rows li:last-child { border-bottom: 0; }
.ix-page .rec-rows li:hover { background: #fffaf7; }
.ix-page .rec-who { display: flex; align-items: center; gap: 8px; min-width: 0; }
.ix-page .rec-who strong { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12.5px; }
.ix-page .rec-times { font-size: 12px; color: #334155; white-space: nowrap; }
.ix-page .rec-in { font-style: normal; color: #15803d; font-weight: 600; }
.ix-page .rec-line { position: relative; height: 10px; border-radius: 99px; background: repeating-linear-gradient(90deg, #f3ede9 0 calc(25% - 1px), #e9e2dd calc(25% - 1px) 25%); }
.ix-page .rec-line i { position: absolute; top: 0; bottom: 0; border-radius: 99px; background: linear-gradient(90deg, #f2864f, #e8582a); }
.ix-page .rec-line i.open { background: linear-gradient(90deg, #4ade80, #16a34a); }
.ix-page .rec-h { text-align: right; font-size: 12.5px; }
@media (max-width: 900px) {
  .ix-page .rec-scale { display: none; }
  .ix-page .rec-rows li { grid-template-columns: 1fr auto; }
  .ix-page .rec-line { grid-column: 1 / -1; }
  .ix-page .rec-count { margin-left: 0; width: 100%; }
}

.ix-page .rp-sum { grid-template-columns: repeat(4, 1fr); }
.ix-page .rp-sum > :nth-child(1) { border-left: 0; }
@media (max-width: 700px) { .ix-page .rp-sum { grid-template-columns: repeat(2, 1fr); } }
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
    <Shell navItems={navWithTabs(NAV, GROUPS)} user={user}>
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
          {tab.key === "kiosks" && <Kiosks />}
          {tab.key === "activity" && <ActivityLog />}
          {tab.key === "term" && <EndOfTerm users={users} records={records} onRefresh={fetchAll} />}
          {tab.key === "backup" && <Backups />}
          {/* Reports */}
          {tab.key === "dtr" && <DTR interns={interns} records={records} />}
          {tab.key === "quarterly" && <QuarterlyReport user={user} />}
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
  const seenToday = new Set(todayRecs.map((r) => r.user_id ?? r.name)).size;
  const first = user.name?.split(" ")[0] || "there";
  const dateLabel = new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" });

  // ID cards waiting for the admin (same stages as Accounts → Card Requests)
  const [cards, setCards] = useState(null);
  useEffect(() => {
    const load = () =>
      fetch(`${API}/supervisor/nfc-requests`, { headers: { Accept: "application/json" } })
        .then((r) => r.json())
        .then((list) => { if (Array.isArray(list)) setCards(list); })
        .catch(() => {});
    load();
    return liveRefresh(load);
  }, []);
  const approved = (cards || []).filter((r) => r.status === "approved");
  const stages = [
    { key: "print", icon: "print", tone: "", title: "To print", sub: "Approved, download and print", n: approved.filter((r) => !r.printed_at).length },
    { key: "link", icon: "nfc", tone: "blue", title: "To link", sub: "Printed, tap the card to link its UID", n: approved.filter((r) => r.printed_at && !r.uid).length },
    { key: "claim", icon: "card", tone: "green", title: "Ready to claim", sub: "Linked, waiting for the intern", n: approved.filter((r) => r.printed_at && r.uid).length },
  ];
  const cardWork = stages.reduce((s, x) => s + x.n, 0);

  return (
    <DashLayout
      title={`${greeting()}, ${first}`}
      sub={dateLabel}
      status={{ text: checkedIn > 0 ? `${checkedIn} on the clock now` : "Nobody timed in yet", tone: checkedIn > 0 ? "live" : "" }}
      actions={[
        { icon: "list", label: "Records", run: () => go("/admin/interns?tab=records") },
        { icon: "file", label: "DTR", run: () => go("/admin/reports?tab=dtr") },
        { icon: "users", label: "Monitor", run: () => go("/admin/interns"), primary: true },
      ]}
      strip={[
        { icon: "users", tone: "t-orange", label: "Total interns", value: interns.length, sub: "registered" },
        { icon: "briefcase", tone: "t-purple", label: "OJT coordinators", value: coordinators.length, sub: "on the program" },
        { icon: "tap", tone: "t-green", label: "On duty now", value: checkedIn, sub: `of ${interns.length} interns` },
        { icon: "list", tone: "t-blue", label: "Today's records", value: todayRecs.length, sub: "taps and logs" },
        { icon: "card", tone: "t-amber", label: "ID cards", value: cardWork, sub: "to print, link or release", onClick: () => go("/admin/accounts?tab=cards") },
      ]}
      left={(
        <>
        <Panel title="ID cards" count={cardWork} link="Card requests" onLink={() => go("/admin/accounts?tab=cards")}>
          {stages.map((s) => (
            <DashRow key={s.key} icon={s.icon} tone={s.tone} title={s.title} sub={s.sub}
              tag={s.n > 0 ? String(s.n) : "None"} tagTone={s.n > 0 ? "orange" : ""} onClick={() => go("/admin/accounts?tab=cards")} />
          ))}
        </Panel>
        {/* interns who need a follow-up */}
        <NeedsAttention interns={interns} records={records} monitorPath="/admin/interns" />
        </>
      )}
      right={<><HomeCalendar /><AnnouncementBoard limit={3} /></>}
    >
      <Panel title="Today's attendance" count={seenToday} link="Monitor" onLink={() => go("/admin/interns")} grow>
        {loading ? <Spinner /> : <TodayPeople records={todayRecs} limit={10} />}
      </Panel>
    </DashLayout>
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
  background: var(--ix-surface, #fff);
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
    padding: 10px 12px 9px; background: var(--ix-surface, #fff); border: 1px solid #f1e2d9; border-radius: 10px;
    box-shadow: 0 12px 28px rgba(15,23,42,.16); font-family: 'Poppins', 'Segoe UI', sans-serif; color: #1f2937;
    display: flex; flex-direction: column; gap: 3px; pointer-events: none; animation: cal-tip-in .12s ease-out; }
  .cal-tip.below { transform: translate(-50%, 0); }
  .cal-tip::after { content: ""; position: absolute; left: 50%; bottom: -6px; width: 10px; height: 10px; background: var(--ix-surface, #fff);
    border-right: 1px solid #f1e2d9; border-bottom: 1px solid #f1e2d9; transform: translateX(-50%) rotate(45deg); }
  .cal-tip.below::after { bottom: auto; top: -6px; transform: translateX(-50%) rotate(225deg); }
  .cal-tip-type { align-self: flex-start; padding: 2px 8px; border-radius: 99px; font-size: 10.5px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; }
  .cal-tip-type.holiday { background: #dcfce7; color: #15803d; }
  .cal-tip-type.nonwork { background: #fef3c7; color: #b45309; }
  .cal-tip-ev { display: flex; flex-direction: column; gap: 3px; }
  .cal-tip-ev + .cal-tip-ev { margin-top: 8px; padding-top: 8px; border-top: 1px solid #f1f2f4; }
  .cal-tip-type.k-off { background: #fef2f2; color: #b91c1c; } .cal-tip-type.k-school { background: #f3efff; color: #6d28d9; }
  .cal-tip-type.k-hte { background: #eef4ff; color: #1d4ed8; } .cal-tip-type.k-work, .cal-tip-type.k-open { background: #ecfdf3; color: #15803d; }
  .cal-tip-mean { font-style: normal; font-size: 11.5px; font-weight: 600; }
  .cal-tip-mean.k-off { color: #b91c1c; } .cal-tip-mean.k-school { color: #6d28d9; } .cal-tip-mean.k-hte { color: #1d4ed8; } .cal-tip-mean.k-work, .cal-tip-mean.k-open { color: #15803d; }
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
  const eventsOf = (d) => events.filter((e) => String(e.date).slice(0, 10) === keyOf(d));
  // the one event that sets the day's color: an HTE working day > an HTE day off > a university day
  const mainOf = (list) => list.find((e) => e.hte_key && e.type === "working") || list.find((e) => e.hte_key) || list[0];
  const kindOfEv = (e) => !e ? null : e.hte_key ? (e.type === "working" ? "work" : "hte")
    : (e.scope === "school_event" || e.off === false ? (e.scope === "school_event" ? "school" : "open") : "off");
  // "next break": a day that really closes OJT for this viewer (staff: university No-OJT days)
  const closesOJT = (e) => e.off !== false && (!e.hte_key || events.every((x) => !x.hte_key || x.hte_key === e.hte_key));

  const upcoming = events
    .filter(closesOJT)
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
          const evs = eventsOf(d);
          const ev = mainOf(evs);
          const kind = kindOfEv(ev);
          const cls = ["adm-cal-day", isToday(d) && "today", ev && "event", kind && `k-${kind}`].filter(Boolean).join(" ");
          // show the hover card above the day (or below it near the top of the screen)
          const showTip = (e) => {
            if (!ev) return;
            // the page may be zoomed by fit.js: screen positions are divided by it to get page positions
            const z = currentFit();
            const r = e.currentTarget.getBoundingClientRect();
            const below = r.top < 150;
            setTip({ ev, evs, x: (r.left + r.width / 2) / z, y: (below ? r.bottom + 8 : r.top - 8) / z, below });
          };
          return (
            <div
              key={d} className={cls}
              tabIndex={ev ? 0 : undefined}
              onMouseEnter={showTip} onFocus={showTip}
              onMouseLeave={() => setTip(null)} onBlur={() => setTip(null)}
              aria-label={`${monthName} ${d}${evs.length ? ", " + evs.map((x) => x.title).join(", ") : ""}`}
            >
              {d}
              {ev && <i className={`adm-cal-dot k-${kind}`} />}
            </div>
          );
        })}
      </div>

      {/* color guide: only the kinds that appear this month */}
      {(() => {
        const inMonth = events.filter((e) => String(e.date).slice(0, 7) === `${year}-${pad(month + 1)}`).map(kindOfEv);
        const show = [["off", "No OJT"], ["school", "School event"], ["hte", "HTE day off"], ["work", "HTE open"]].filter(([k]) => inMonth.includes(k) || (k === "work" && inMonth.includes("open")));
        return show.length > 0 && (
          <div className="adm-cal-keys">{show.map(([k, l]) => <span key={k}><i className={`k-${k}`} />{l}</span>)}</div>
        );
      })()}
      {tip && createPortal(
        <div
          className={tip.below ? "cal-tip below" : "cal-tip"}
          style={{ left: Math.min(Math.max(tip.x, 140), window.innerWidth / currentFit() - 140), top: tip.y }}
          role="tooltip"
        >
          {(tip.evs || [tip.ev]).map((x) => {
            const k = kindOfEv(x);
            const opened = !x.hte_key && x.off === false && x.scope !== "school_event";
            const label = x.hte_key ? (x.type === "working" ? "HTE open" : "HTE day off") + (x.hte_name ? ` · ${x.hte_name}` : "")
              : x.scope === "school_event" ? "School event" : x.type === "holiday" ? "Holiday" : "Non-working day";
            const meaning = x.hte_key
              ? (x.type === "working" ? "Your HTE is open: time in as usual." : "No OJT at this HTE: time-ins are closed.")
              : x.scope === "school_event" ? "School event: interns still time in."
              : opened ? "Your HTE is open this day: time in as usual." : "No OJT: time-ins are closed.";
            return (
              <div key={x.id} className="cal-tip-ev">
                <span className={`cal-tip-type k-${opened ? "open" : k}`}>{label}</span>
                <strong>{x.title}</strong>
                {x.description && <p>{x.description}</p>}
                <em className={`cal-tip-mean k-${opened ? "work" : k}`}>{meaning}</em>
              </div>
            );
          })}
          <small>
            {new Date(String(tip.ev.date).slice(0, 10) + "T00:00:00")
              .toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </small>
          <style>{CAL_TIP_CSS}</style>
        </div>,
        document.body
      )}
      {upcoming ? (
        <div className="adm-cal-next">
          <Icon name="calendar" size={15} />
          <span>Next break: <strong>{upcoming.title}</strong> on {upcomingLabel}</span>
        </div>
      ) : (
        <div className="adm-cal-next none">
          <Icon name="calendar" size={15} />
          <span>No upcoming break yet.</span>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Records ───────────────────────── */
/* Attendance Records: the days on the left, that day's taps on the right
   (each row shows when the intern was in on a 7 AM – 7 PM line). */
export function Records({ records, loading }) {
  // One list of every tap: search an intern, filter by date or type.
  // "View all records" on Monitor Interns opens this list already searched for that intern.
  const location = useLocation();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");               // all | onsite | online
  const [dateFilter, setDateFilter] = useState("");
  const [limit, setLimit] = useState(60);
  useEffect(() => {
    setSearch(location.state?.search || ""); setType("all"); setDateFilter(""); setLimit(60);
    /* eslint-disable-next-line */
  }, [location.key, location.state?.search]);

  const sq = search.trim().toLowerCase();
  const filtered = records
    .filter((r) => !dateFilter || r.date === dateFilter)
    .filter((r) => type === "all" || (type === "online" ? r.uid === "ONLINE" : r.uid !== "ONLINE"))
    .filter((r) => !sq || String(r.name || "").toLowerCase().includes(sq))
    .sort((a, b) => String(b.checked_in_at || b.date).localeCompare(String(a.checked_in_at || a.date)));
  const counts = {
    all: records.length,
    onsite: records.filter((r) => r.uid !== "ONLINE").length,
    online: records.filter((r) => r.uid === "ONLINE").length,
  };
  const day = (d) => new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const hm = (v) => (v ? new Date(v).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }) : "—");
  const hrs = (r) => {
    if (!r.checked_in_at || !r.checked_out_at) return "—";
    const h = (new Date(r.checked_out_at) - new Date(r.checked_in_at)) / 3600000;
    return h > 0 ? `${Math.round(h * 100) / 100}h` : "—";
  };

  return (
    <>
      <PageHeader title="Attendance Records" sub="Complete attendance log: every time in and time out." live />
      <div className="mon-bar">
        <div className="ix-search mon-search">
          <Icon name="search" size={15} />
          <input type="text" placeholder="Search intern..." value={search} onChange={(e) => { setSearch(e.target.value); setLimit(60); }} />
        </div>
        {[["all", "All"], ["onsite", "Onsite"], ["online", "Online"]].map(([k, l]) => (
          <button key={k} type="button" className={type === k ? "mon-chip on" : "mon-chip"} onClick={() => { setType(k); setLimit(60); }}>{l} · {counts[k]}</button>
        ))}
        <span className="mon-sep" />
        <input type="date" className="ix-input rec-date" value={dateFilter} aria-label="Filter by date" onChange={(e) => { setDateFilter(e.target.value); setLimit(60); }} />
        {(dateFilter || search) && <button type="button" className="ix-b ghost sm" onClick={() => { setDateFilter(""); setSearch(""); }}>Clear</button>}
        <span className="rec-count">{filtered.length} record{filtered.length === 1 ? "" : "s"}</span>
      </div>
      <div className="ix-card flush rec-card">
        {loading ? <Spinner /> : (
          <Table
            headers={["Intern", "Date", "Type", "Action", "Time in", "Time out", "Hours"]}
            rows={filtered.slice(0, limit).map((r) => [
              <span className="rec-who"><Avatar name={r.name} photo={r.photo} size={28} /><strong>{r.name}</strong></span>,
              day(r.date),
              <Badge label={r.uid === "ONLINE" ? "Online" : "Onsite"} type={r.uid === "ONLINE" ? "online" : "onsite"} />,
              r.checked_out_at
                ? <Badge label="Time out" type="out" />
                : <Badge label="Time in" type="in" />,
              hm(r.checked_in_at),
              r.checked_out_at ? hm(r.checked_out_at) : <span className="rec-open">No time out yet</span>,
              hrs(r),
            ])}
            empty="No records match your filters."
          />
        )}
        {!loading && filtered.length > limit && (
          <div className="rec-more">
            <span>Showing {limit} of {filtered.length}</span>
            <button type="button" className="ix-b ghost sm" onClick={() => setLimit((n) => n + 100)}>Show more</button>
          </div>
        )}
      </div>
      <style>{`
        .ix-page .rec-date { height: 34px; width: 160px; }
        .ix-page .rec-count { margin-left: auto; font-size: 12.5px; color: #6b7280; font-weight: 600; }
        .ix-page .rec-who { display: inline-flex; align-items: center; gap: 10px; }
        .ix-page .rec-open { font-size: 12px; color: #c2410c; font-weight: 600; }
        .ix-page .rec-more { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 16px; font-size: 12.5px; color: #6b7280; border-top: 1px solid #e3e6ea; }
        .ix-page .rec-card .ix-table-wrap { max-height: none; }
      `}</style>
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

  // import interns from the coordinator's Excel list
  const [importing, setImporting] = useState(false);
  // graduated / inactive: can't sign in or tap, records stay
  const [toggling, setToggling] = useState(null);
  const setActive = async (u, active) => {
    if (!active && !window.confirm(`Deactivate ${u.name}?\n\nThey won't be able to sign in or tap their card. All their records are kept, and you can reactivate the account anytime.`)) return;
    setToggling(u.id); setMsg(null);
    try {
      const res = await fetch(`${API}/admin/users/${u.id}/active`, {
        method: "PATCH", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ active }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Couldn't change the account.");
      setMsg({ type: "success", text: data.message });
      onRefresh();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    } finally { setToggling(null); }
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
    { key: "inactive", label: "Deactivated" },
  ];
  const sq = search.trim().toLowerCase();
  const wide = typeof window !== "undefined" && !window.matchMedia("(max-width: 900px)").matches;
  const shownUsers = users
    .filter((u) => roleFilter === "all" || (roleFilter === "inactive" ? !!u.deactivated_at : u.role === roleFilter))
    .filter((u) => `${u.name} ${u.email} ${u.student_id ?? ""}`.toLowerCase().includes(sq));
  // the user shown on the right: the one clicked, or (wide screens) the only one left after a search.
  // Nothing opens by itself.
  const cur = vu || null;   // a table of everyone; clicking a user opens their details

  return (
    <>
      <style>{ACC_OFF_CSS}</style>
      <style>{`.ix-page .acc-filter { width: auto; min-width: 180px; flex: none; }
        .ix-page .acc-name { display: inline-flex; align-items: center; gap: 10px; border: 0; background: none; padding: 0; font: inherit; cursor: pointer; text-align: left; }
        .ix-page .acc-name strong { white-space: nowrap; }
        .ix-page .acc-name:hover strong { color: #ea580c; }
        .ix-page .acc-mail { font-size: 12.5px; color: #64748b; }
        .ix-page .acc-table .ix-table-wrap { max-height: none; }
        .ix-page .acc-table td { vertical-align: middle; }
        /* the account opens in the side panel (like the calendar): a wider panel, the profile in one column */
        .ix-page .ix-drawer:has(.acc-detail) { width: min(720px, calc(100vw - 24px)); }
        .ix-drawer .acc-detail .acc-detail-bar { position: sticky; top: -16px; z-index: 2; background: #fff; padding: 4px 0 10px; margin: 0; display: flex; gap: 8px; justify-content: flex-start; }
        .ix-drawer .acc-detail :is(.ipv-grid, .uf-grid).c3, .ix-drawer .acc-detail .uf-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }`}</style>
      {importing && <ImportInterns onClose={() => setImporting(false)} onDone={onRefresh} />}
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
      ) : (
        /* ───────── list on the left, the selected user on the right (phones: one at a time) ───────── */
        <div className={vu ? "mon show-detail" : "mon"}>
          <div className="mon-bar">
            <div className="ix-search mon-search">
              <Icon name="search" size={15} />
              <input type="text" placeholder="Search name, email or ID..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className="ix-select acc-filter" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter by role">
              {ROLE_TABS.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.key === "all" ? "All users" : t.label} ({t.key === "all" ? users.length : t.key === "inactive" ? users.filter((u) => u.deactivated_at).length : users.filter((u) => u.role === t.key).length})
                </option>
              ))}
            </select>
            <span className="mon-chip on">{shownUsers.length} shown</span>
            <button className="ix-b ghost sm acc-add" onClick={() => setImporting(true)}><Icon name="upload" size={14} /> Import interns (Excel)</button>
            <button className="ix-b primary sm" onClick={openModal}><Icon name="plus" size={14} /> Add New User</button>
          </div>

          <div className="ix-card flush rec-card acc-table">
            <Table
              headers={["User", "Role", "Email", "ID", "Program / HTE", "Status", ""]}
              rows={shownUsers.map((u) => [
                <button type="button" className="acc-name" onClick={() => openView(u)}>
                  <Avatar name={u.name} photo={u.photo} size={28} /><strong>{u.name}</strong></button>,
                <span className={`acc-role-tag ${u.role}`}>{ROLE_NAME[u.role] || u.role}</span>,
                <span className="acc-mail">{u.email}</span>,
                u.student_id || <span className="ix-muted">—</span>,
                <span className="acc-mail">{[u.role === "intern" ? u.program : null, u.placement].filter(Boolean).join(" · ") || "—"}</span>,
                u.deactivated_at ? <span className="acc-role-tag off">Deactivated</span> : <Badge label="Active" type="approved" />,
                <button type="button" className="ix-b ghost sm" onClick={() => openView(u)}>View</button>,
              ])}
              empty={users.length ? "No users match your search." : "No users yet."}
            />
          </div>
          {cur && (
            <Drawer inPage key={cur.id} icon={editUser ? "pencil" : "user"} kicker={editUser ? "Edit account" : (ROLE_NAME[cur.role] || cur.role)}
              title={cur.name} onClose={() => { if (!savingEdit) backToList(); }}>
              {(
                <div className="acc-detail">
                  {!editUser && (
                    <div className="acc-detail-bar">
                      <button type="button" className="ix-b primary sm" onClick={() => openEdit(cur)}>
                        <Icon name="pencil" size={14} /> Edit
                      </button>
                      {cur.deactivated_at ? (
                        <button type="button" className="ix-b ghost sm" disabled={toggling === cur.id} onClick={() => setActive(cur, true)}>
                          <Icon name="check" size={14} /> {toggling === cur.id ? "..." : "Reactivate"}
                        </button>
                      ) : (
                        <button type="button" className="ix-b ghost sm" disabled={toggling === cur.id} onClick={() => setActive(cur, false)}
                          title="Graduated or no longer active: can't sign in or tap; records are kept">
                          <Icon name="lock" size={14} /> {toggling === cur.id ? "..." : "Deactivate"}
                        </button>
                      )}
                      <button type="button" className="ix-b danger sm" disabled={deleting === cur.id}
                        onClick={async () => { if (await handleDelete(cur.id, cur.name)) setViewUser(null); }}>
                        <Icon name="trash" size={14} /> {deleting === cur.id ? "..." : "Delete"}
                      </button>
                    </div>
                  )}

                  {!editUser && cur.deactivated_at && (
                    <div className="acc-off-note"><Icon name="lock" size={15} />
                      <span>Deactivated on {new Date(String(cur.deactivated_at).replace(" ", "T")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}. This account can't sign in or tap. Its records are kept.</span>
                    </div>
                  )}
                  {!editUser ? (
                    <UserDetails u={cur} />
                  ) : (
                    <>
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
                          role={editUser.role}
                          supervisors={supervisors}
                          title={editUser.name}
                          sub="Click the photo to change it."
                          header={
                            <label className="ix-photo-box" style={{ width: 72, height: 72, borderRadius: "50%" }}>
                              <input type="file" accept="image/*" onChange={pickEditPhoto} />
                              {editPreview
                                ? <img src={editPreview} alt="New profile" />
                                : <Avatar name={editUser.name} photo={editUser.photo} size={72} />}
                              <span className="ix-photo-badge"><Icon name="camera" size={13} /></span>
                            </label>
                          }
                          uidField={editIsIntern ? (
                            <>
                              <div className="ix-row-gap">
                                <input className="uf-input" type="text" readOnly
                                  value={editForm.uid || (editUser.nfc_uid ? "Will be unlinked when you save" : "No card linked")} />
                                {editForm.uid && (
                                  <button type="button" className="ix-b danger sm" onClick={() => setEF("uid")({ target: { value: "" } })}>Unlink</button>
                                )}
                                {!editForm.uid && editUser.nfc_uid && (
                                  <button type="button" className="ix-b ghost sm" onClick={() => setEF("uid")({ target: { value: editUser.nfc_uid } })}>Undo</button>
                                )}
                              </div>
                              <small className="uf-hint">New cards are linked in Card Requests after the request is approved and printed. Unlink a lost or damaged card here.</small>
                            </>
                          ) : null}
                          actions={
                            <>
                              <button type="button" className="ix-b ghost" onClick={closeEdit} disabled={savingEdit}>Cancel</button>
                              <button type="submit" className="ix-b primary" disabled={savingEdit}>{savingEdit ? "Saving..." : "Save changes"}</button>
                            </>
                          }
                        />
                      </form>
                    </>
                  )}
                </div>
              )}
            </Drawer>
          )}
        </div>
      )}
    </>
  );
}

/* ───────────────────────── Card Requests ─────────────────────────
   ID cards are printed in the card printer's own app. Here the admin gets the approved list, downloads
   the details and photos, and marks the cards as printed. */
function PrintIdCards({ interns }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = () =>
    fetch(`${API}/supervisor/nfc-requests`, { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) { setRequests(d); setError(null); } else setError(d?.message || "Couldn't load card requests."); })
      .catch(() => setError("Couldn't reach the server."))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  return (
    <>
      {error && <div className="ix-alert"><Icon name="warn" size={18} /> {error}</div>}
      {loading ? <Spinner /> : <CardRequests requests={requests} interns={interns} onChanged={load} />}
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

  const holidays = useHolidays(shown?.id || null);   // that intern's days off (university + their HTE)

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
      <PageHeader title="Generate DTR" sub="Search an intern, pick the month, year and period, then click Display DTR." />
      <div className="ix-card dtr-card">
        {/* one row: intern · month · year · period · Display DTR */}
        <div className="dtr-filters">
          <InternSearch interns={interns} selected={picked} onSelect={(id) => { setSelectedId(String(id)); setErr(""); }} />
          <select className="dtr-sel" value={mon} onChange={(e) => setMon(e.target.value)} aria-label="Month">
            {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <select className="dtr-sel" value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="dtr-sel" value={period} onChange={(e) => { setPeriod(e.target.value); setErr(""); }} aria-label="Period">
            <option value="" disabled>Period</option>
            {periodsOf(year, mon).map((p) => <option key={p.key} value={p.key}>Period: {p.label}</option>)}
          </select>
          <button type="button" className="ix-b primary" onClick={display}>
            <Icon name="send" size={16} /> Display DTR
          </button>
        </div>
        {err && <div className="fl-err">{err}</div>}

        {!view ? (
          <Empty icon="file" title="Nothing to preview yet" sub="Search an intern, then choose a month, year and period above and click Display DTR." />
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
      <style>{`
        .ix-page .ix-content .dtr-card { padding: 16px 18px !important; display: flex; flex-direction: column; gap: 14px; }
        .ix-page .dtr-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
        .ix-page .dtr-filters > :first-child { flex: 1 1 280px; min-width: 240px; }
        .ix-page .dtr-filters .dtr-sel { height: 38px; min-width: 140px; }
        .ix-page .dtr-shown-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
      `}</style>
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

      <div className="at-sum rp-sum">
        <div className="at-sum-num"><small>Interns</small><b>{data.length}</b><em>{monthLabel}</em></div>
        <div className="at-sum-num"><small>Total hours</small><b>{Math.round(data.reduce((x, d) => x + d.total, 0) * 10) / 10}h</b><em>all interns</em></div>
        <div className="at-sum-num"><small>Total days</small><b>{data.reduce((x, d) => x + d.days, 0)}</b><em>days present</em></div>
        <div className="at-sum-num"><small>Online logs</small><b>{data.reduce((x, d) => x + d.online, 0)}</b><em>remote workdays</em></div>
      </div>
      <div className="ix-card flush" style={{ marginTop: 14 }}>
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
      </div>
    </>
  );
}

/* ───────────────────────── Calendar Management ───────────────────────── */
// also used by the OJT coordinator (she sets the holidays and non-working days)
/* Calendar: the month on the left (click a day to add or edit), upcoming days off on the right.
   The form opens from the right side. */
const CAL_DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/* what kind of day an event is (one color each) */
const kindOf = (e) => e.hte_key
  ? (e.type === "working" ? "work" : "hte")
  : (e.scope === "school_event" ? "school" : e.type === "holiday" ? "h" : "n");
const KIND_LABEL = { h: "Holiday", n: "Non-working", school: "School event", hte: "HTE day off", work: "HTE working day", uni: "University", unischool: "School event" };
// a supervisor sees the university's days in gray (for reference only)
const kindFor = (e, sup) => (sup && !e.hte_key ? (e.scope === "school_event" ? "unischool" : "uni") : kindOf(e));

/* Two calendars:
   - staff (OJT coordinator / admin): the university calendar. Each day is either "No OJT" (time-ins closed
     for every intern) or "School event only" (shown, interns still time in). Every HTE's days show too.
   - supervisor: their HTE's calendar (shared by all supervisors at the same HTE). Days off close time-ins
     for that HTE's interns only; "We work this day" keeps time-ins open on a university No-OJT day. */
export function Calendar({ mode = "staff" }) {
  const sup = mode === "supervisor";
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [open, setOpen] = useState(null);   // { date } for a new event, or the event to open
  const [hteFilter, setHteFilter] = useState("all");   // staff: "all" | "uni" | an hte_key

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
  useEffect(() => { fetchEvents(); }, []);

  const today = ymd(new Date());
  const htes = [...new Map(events.filter((e) => e.hte_key).map((e) => [e.hte_key, e.hte_name || e.hte_key])).entries()];
  const shownEvents = sup || hteFilter === "all" ? events
    : hteFilter === "uni" ? events.filter((e) => !e.hte_key)
    : events.filter((e) => !e.hte_key || e.hte_key === hteFilter);
  const byDay = {};
  shownEvents.forEach((e) => { const k = String(e.date).slice(0, 10); (byDay[k] ||= []).push(e); });
  const upcoming = shownEvents.filter((e) => String(e.date).slice(0, 10) >= today).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const past = shownEvents.filter((e) => String(e.date).slice(0, 10) < today).sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const start = new Date(month); start.setDate(1 - month.getDay());
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const lastRow = days.slice(35).every((d) => d.getMonth() !== month.getMonth()) ? 35 : 42;
  const monthLabel = month.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const shift = (n) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  const dayTile = (iso) => { const x = new Date(iso + "T00:00:00"); return { d: x.getDate(), m: x.toLocaleDateString("en-US", { month: "short" }).toUpperCase(), w: x.toLocaleDateString("en-US", { weekday: "long" }) }; };
  const done = (m) => { setMsg(m); if (m?.type === "success") { setOpen(null); fetchEvents(); } };

  // clicking a day: a supervisor opens their HTE's event (or the university one to see it); staff open the university one
  const clickDay = (iso, evs) => {
    const mine = evs.find((e) => e.hte_key);
    const uni = evs.find((e) => !e.hte_key);
    if (sup) setOpen(mine || (uni ? { ...uni, _uni: true } : { date: iso }));
    else setOpen(uni || (evs[0] ? evs[0] : { date: iso }));
  };

  return (
    <>
      <PageHeader title={sup ? "HTE Calendar" : "Calendar Management"}
        sub={sup ? "Your HTE's own calendar. Days off here apply only to the interns placed at your HTE. The university's days show for reference."
          : "The university calendar. Click a day to add a holiday, a suspension or a school event. Each HTE keeps its own calendar too."} />
      <Msg msg={msg} />
      {loading ? <Spinner /> : (
        <div className="cm-cols">
          <section className="ix-card flush cm-cal">
            <header className="cm-hd">
              <div className="cm-nav">
                <button type="button" className="cm-nb" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
                <b>{monthLabel}</b>
                <button type="button" className="cm-nb" onClick={() => shift(1)} aria-label="Next month">›</button>
                <button type="button" className="ix-b ghost sm cm-today" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Today</button>
                {!sup && htes.length > 0 && (
                  <select className="ix-select cm-filter" value={hteFilter} onChange={(e) => setHteFilter(e.target.value)} aria-label="Show">
                    <option value="all">University + all HTEs</option>
                    <option value="uni">University only</option>
                    {htes.map(([k, n]) => <option key={k} value={k}>University + {n}</option>)}
                  </select>
                )}
              </div>
              <div className="cm-leg">
                {sup ? (<>
                  <span><i className="hte" />Your HTE's day off</span><span><i className="work" />Your HTE works</span><span><i className="uni" />University (reference)</span>
                </>) : (<>
                  <span><i className="h" />Holiday</span><span><i className="n" />Non-working</span><span><i className="school" />School event</span>
                  <span><i className="hte" />HTE day off</span><span><i className="work" />HTE working</span>
                </>)}
              </div>
            </header>
            <div className="cm-grid" style={{ gridTemplateRows: `auto repeat(${lastRow / 7}, minmax(0, 1fr))` }}>
              {CAL_DOW.map((d) => <div key={d} className="cm-dow">{d}</div>)}
              {days.slice(0, lastRow).map((d) => {
                const iso = ymd(d);
                const evs = byDay[iso] || [];
                const other = d.getMonth() !== month.getMonth();
                const we = d.getDay() === 0 || d.getDay() === 6;
                return (
                  <button key={iso} type="button"
                    className={`cm-day${other ? " other" : ""}${we ? " we" : ""}${iso === today ? " today" : ""}`}
                    onClick={() => clickDay(iso, evs)}
                    title={evs.length ? evs.map((e) => `${e.title}${e.hte_key && !sup ? ` (${e.hte_name})` : ""}`).join(", ") : sup ? "Add a day to your HTE calendar" : "Add a university event"}>
                    <b>{d.getDate()}</b>
                    {evs.slice(0, 3).map((e) => <span key={e.id} className={`cm-tag ${kindFor(e, sup)}`}>{e.hte_key && !sup ? `${e.hte_name}: ` : ""}{e.title}</span>)}
                    {evs.length > 3 && <span className="cm-more">+{evs.length - 3} more</span>}
                    {!evs.length && !other && <span className="cm-plus">+</span>}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="ix-card flush cm-list">
            <header className="cm-hd"><b>Upcoming</b><span className="cm-cnt">{upcoming.length} event{upcoming.length === 1 ? "" : "s"}</span></header>
            <div className="cm-items">
              {upcoming.length === 0 && <div className="cm-empty">Nothing coming up.<small>Click a day on the calendar to add one.</small></div>}
              {[...upcoming, ...past.slice(0, 5)].map((e) => {
                const iso = String(e.date).slice(0, 10);
                const t = dayTile(iso);
                const k = kindFor(e, sup);
                return (
                  <button key={e.id} type="button" className={`cm-item${iso < today ? " past" : ""}`}
                    onClick={() => { setOpen(sup && !e.hte_key ? { ...e, _uni: true } : e); setMonth(new Date(iso.slice(0, 4), Number(iso.slice(5, 7)) - 1, 1)); }}>
                    <span className={`cm-tile ${k}`}><b>{t.d}</b><small>{t.m}</small></span>
                    <span className="cm-tx"><b>{e.title}</b>
                      <small>{t.w}{e.hte_key ? (sup ? " · your HTE" : ` · ${e.hte_name}`) : " · University"}{iso < today ? " · past" : ""}</small></span>
                    <span className={`cm-pill ${k}`}>{KIND_LABEL[k]}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}
      {open && <CalDrawer key={(open.id || open.date) + (open._uni ? "u" : "")} ev={open.id ? open : null} date={open.date} sup={sup} workFrom={open._work} events={events} onClose={() => setOpen(null)} onDone={done} onWorkDay={(uni) => setOpen({ date: String(uni.date).slice(0, 10), _work: uni })} />}
      <style>{CM_CSS}</style>
    </>
  );
}

function CalDrawer({ ev, date: initDate, sup, workFrom, events = [], onClose, onDone, onWorkDay }) {
  // what is being edited
  const viewUni = sup && ev?._uni;                      // supervisor looking at a university day: read only
  const hteEvent = sup || !!ev?.hte_key;                 // an HTE calendar day
  const base = sup ? `${API}/supervisor/calendar` : `${API}/calendar`;
  const [date, setDate] = useState(String(ev ? ev.date : initDate).slice(0, 10));
  const [type, setType] = useState(ev ? ev.type : workFrom ? "working" : "holiday");
  const [scope, setScope] = useState(ev?.scope || "no_ojt");
  const [title, setTitle] = useState(ev ? ev.title : workFrom ? "Office open as usual" : "");
  const [description, setDescription] = useState(ev ? ev.description || "" : workFrom ? `Our HTE works on ${workFrom.title}.` : "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const d = new Date(date + "T00:00:00");
  const dateTitle = isNaN(d) ? "New event" : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const save = async (e) => {
    e.preventDefault();
    if (!date || !title.trim()) { setErr("Please enter a date and title."); return; }
    setSaving(true); setErr(null);
    try {
      const res = await fetch(ev ? `${base}/${ev.id}` : base, {
        method: ev ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ date, type, title: title.trim(), description, ...(hteEvent ? {} : { scope }) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.errors && Object.values(data.errors)[0]?.[0]) || data.message || "Failed to save.");
      onDone({ type: "success", text: data.message || "Saved." });
    } catch (er) { setErr(er.message); } finally { setSaving(false); }
  };
  const del = async () => {
    if (!window.confirm("Delete this day from the calendar?")) return;
    try {
      const res = await fetch(`${base}/${ev.id}`, { method: "DELETE", headers: { Accept: "application/json" } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Failed to delete.");
      onDone({ type: "success", text: data.message || "Deleted." });
    } catch (er) { setErr(er.message); }
  };

  /* a supervisor opening a university day: see it, and (on a No-OJT day) "We work this day" */
  if (viewUni) {
    const closes = ev.scope !== "school_event";
    return (
      <Drawer inPage title={dateTitle} kicker="University calendar" icon="calendar" onClose={onClose}
        footer={closes ? (close) => (<>
          <button type="button" className="ix-b ghost" onClick={close}>Close</button>
          <button type="button" className="ix-b primary" onClick={() => onWorkDay(ev)}>We work this day</button>
        </>) : null}>
        <div className="cm-form">
          <span className={`cm-pill ${kindOf(ev)}`} style={{ alignSelf: "flex-start" }}>{KIND_LABEL[kindOf(ev)]}</span>
          <div><small className="cm-lbl">Title</small><b className="cm-val">{ev.title}</b></div>
          {ev.description && <div><small className="cm-lbl">Description</small><p className="cm-val">{ev.description}</p></div>}
          <small className="cm-note">{closes
            ? "Set by the OJT coordinator: no OJT for every intern. If your HTE is open this day, click “We work this day” so your interns can time in."
            : "A school event. Your interns still time in as usual."}</small>
        </div>
      </Drawer>
    );
  }

  const isWork = type === "working";
  // "We work" only makes sense on a day the university closed (No OJT): it opens that day for this HTE's interns
  const uniClosed = events.some((x) => !x.hte_key && String(x.date).slice(0, 10) === date && x.scope !== "school_event");
  const canWork = hteEvent && (uniClosed || isWork);
  return (
    <Drawer inPage title={dateTitle}
      kicker={hteEvent ? (sup ? (ev ? "Your HTE calendar" : "Add to your HTE calendar") : `HTE calendar · ${ev?.hte_name || ""}`) : ev ? "University calendar · edit" : "University calendar"}
      icon="calendar" onClose={onClose}
      footer={(close) => (<>
        {ev ? <button type="button" className="ix-b danger" onClick={del}><Icon name="trash" size={14} /> Delete</button>
          : <button type="button" className="ix-b ghost" onClick={close} disabled={saving}>Cancel</button>}
        <button type="submit" form="cal-form" className="ix-b primary" disabled={saving}>{saving ? "Saving..." : ev ? "Update" : "Add"}</button>
      </>)}>
      <form id="cal-form" onSubmit={save} className="ix-form cm-form">
        {err && <Msg msg={{ type: "error", text: err }} />}
        {hteEvent && !sup && (
          <div className="cm-hte"><Icon name="info" size={14} /> {ev?.hte_name}'s own calendar{ev?.created_by_name ? `, added by ${ev.created_by_name}` : ""}. It applies only to the interns placed there.</div>
        )}
        <div className="ix-field">
          <label>Type</label>
          <div className="cm-seg" role="radiogroup" aria-label="Type">
            <button type="button" role="radio" aria-checked={type === "holiday"} className={type === "holiday" ? "on h" : ""} onClick={() => setType("holiday")}>Holiday</button>
            <button type="button" role="radio" aria-checked={type === "non_working"} className={type === "non_working" ? "on n" : ""} onClick={() => setType("non_working")}>Non-working</button>
            {canWork && <button type="button" role="radio" aria-checked={isWork} className={isWork ? "on work" : ""} onClick={() => setType("working")}>We're open</button>}
          </div>
        </div>
        {!hteEvent && (
          <div className="ix-field">
            <label>For interns</label>
            <div className="cm-seg two" role="radiogroup" aria-label="For interns">
              <button type="button" role="radio" aria-checked={scope === "no_ojt"} className={scope === "no_ojt" ? "on h" : ""} onClick={() => setScope("no_ojt")}>
                No OJT<small>Time-ins closed for all interns</small></button>
              <button type="button" role="radio" aria-checked={scope === "school_event"} className={scope === "school_event" ? "on school" : ""} onClick={() => setScope("school_event")}>
                School event only<small>Shown; interns still time in</small></button>
            </div>
          </div>
        )}
        <div className="ix-field">
          <label htmlFor="cal-date">Date</label>
          <input id="cal-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="ix-field">
          <label htmlFor="cal-title">Title</label>
          <input id="cal-title" type="text" required placeholder={isWork ? "e.g. Office open as usual" : hteEvent ? "e.g. Company anniversary" : "e.g. Independence Day"}
            value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div className="ix-field">
          <label htmlFor="cal-desc">Description <span className="ix-muted">(optional)</span></label>
          <textarea id="cal-desc" rows={3} placeholder="e.g. interns are not allowed to time in" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {canWork && !isWork && <small className="cm-note">The university has no OJT this day. If your office is open, choose “We're open” so your interns can time in.</small>}
        <small className="cm-note">{isWork
          ? "The university has no OJT this day, but your office is open: your interns can time in as usual. The OJT coordinator is notified."
          : hteEvent ? "Only the interns placed at this HTE can't time in this day. They and the OJT coordinator are notified."
          : scope === "school_event" ? "Shown on everyone's calendar. Interns still time in at their HTE."
          : "No intern can time in this day (unless their HTE marks it as a working day). It shows on the DTR."}</small>
      </form>
    </Drawer>
  );
}

const CM_CSS = `
.ix-page .cm-cols { display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 14px; align-items: stretch; }
.ix-page .ix-card.cm-cal, .ix-page .ix-card.cm-list { margin: 0 !important; padding: 0 !important; overflow: hidden; display: flex; flex-direction: column; }
.ix-page .cm-hd { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 12px 16px; border-bottom: 1px solid #eef0f3; min-height: 56px; box-sizing: border-box; }
.ix-page .cm-hd > b { font-size: 15px; font-weight: 600; color: #111827; }
.ix-page .cm-nav { display: flex; align-items: center; gap: 8px; }
.ix-page .cm-nav > b { font-size: 15px; font-weight: 600; color: #111827; min-width: 140px; text-align: center; }
.ix-page .cm-nb { width: 32px; height: 32px !important; min-height: 0 !important; padding: 0 !important; border: 1px solid #e7e9ee; border-radius: 9px; background: #fff; font: inherit; font-size: 16px; color: #374151; cursor: pointer; }
.ix-page .cm-nb:hover { border-color: #f6c9b3; color: #c2410c; }
.ix-page .cm-today { height: 32px !important; }
.ix-page .cm-leg { display: flex; gap: 10px; flex-wrap: wrap; font-size: 11px; color: #6b7280; }
.ix-page .cm-leg span { display: inline-flex; align-items: center; gap: 5px; }
.ix-page .cm-leg i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.ix-page .cm-leg i.h { background: #ef4444; } .ix-page .cm-leg i.n { background: #f59e0b; } .ix-page .cm-leg i.w { background: #d1d5db; }
.ix-page .cm-leg i.school { background: #8b5cf6; } .ix-page .cm-leg i.hte { background: #3b82f6; } .ix-page .cm-leg i.work { background: #22c55e; }
.ix-page .cm-tag.school, .ix-page .cm-pill.school { background: #f3efff; color: #6d28d9; }
.ix-page .cm-tag.hte, .ix-page .cm-pill.hte { background: #eef4ff; color: #1d4ed8; }
.ix-page .cm-tag.work, .ix-page .cm-pill.work { background: #ecfdf3; color: #15803d; }
.ix-page .cm-tile.school { background: #f3efff; color: #6d28d9; } .ix-page .cm-tile.hte { background: #eef4ff; color: #1d4ed8; } .ix-page .cm-tile.work { background: #ecfdf3; color: #15803d; }
.ix-page .cm-more { font-size: 10.5px; color: #6b7280; padding-left: 2px; }
.ix-page .cm-leg i.uni { background: #9ca3af; }
.ix-page :is(.cm-tag, .cm-pill, .cm-tile).uni, .ix-page :is(.cm-tag, .cm-pill, .cm-tile).unischool { background: #f3f4f6; color: #4b5563; }
.ix-page .cm-filter { height: 32px !important; font-size: 12px !important; padding: 0 28px 0 10px !important; width: auto !important; margin-left: 4px; }
.ix-page .cm-seg.two button { height: auto !important; min-height: 52px !important; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 6px 8px !important; }
.ix-page .cm-seg button small { font-size: 10.5px; font-weight: 500; color: #6b7280; }
.ix-page .cm-seg button.on.school { border-color: #8b5cf6; background: #f3efff; color: #6d28d9; }
.ix-page .cm-seg button.on.work { border-color: #22c55e; background: #ecfdf3; color: #15803d; }
.ix-page .cm-hte { display: flex; gap: 8px; align-items: flex-start; padding: 10px 12px; border-radius: 10px; background: #eef4ff; color: #1e40af; font-size: 12.5px; line-height: 1.45; }
.ix-page .cm-lbl { display: block; font-size: 11.5px; color: #8b919b; margin-bottom: 2px; }
.ix-page .cm-val { font-size: 14px; color: #111827; margin: 0; }
.ix-page .cm-grid { flex: 1; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; padding: 12px 16px 16px; }
.ix-page .cm-dow { font-size: 10.5px; font-weight: 600; color: #8b919b; text-align: center; padding: 2px 0 4px; }
.ix-page .cm-day { position: relative; min-height: 64px; display: flex; flex-direction: column; align-items: stretch; gap: 3px; padding: 6px 8px !important; border: 1px solid #eef0f3; border-radius: 10px;
  background: #fff; font: inherit; text-align: left; cursor: pointer; overflow: hidden; height: auto !important; transition: border-color .15s, background .15s; }
.ix-page .cm-day > b { font-size: 12.5px; font-weight: 600; color: #111827; }
.ix-page .cm-day.we { background: #fafafb; } .ix-page .cm-day.we > b { color: #9ca3af; }
.ix-page .cm-day.other { opacity: .4; }
.ix-page .cm-day.today { border-color: #e8582a; } .ix-page .cm-day.today > b { color: #e8582a; }
.ix-page .cm-day:hover { border-color: #f6c9b3; background: #fff7f2; }
.ix-page .cm-plus { position: absolute; right: 8px; top: 5px; font-size: 15px; color: #e8582a; opacity: 0; transition: opacity .15s; }
.ix-page .cm-day:hover .cm-plus { opacity: 1; }
.ix-page .cm-tag { display: block; font-size: 10.5px; font-weight: 600; border-radius: 6px; padding: 2px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ix-page .cm-tag.h { background: #fef2f2; color: #b91c1c; } .ix-page .cm-tag.n { background: #fff7ed; color: #c2410c; }
.ix-page .cm-cnt { font-size: 12px; color: #6b7280; }
.ix-page .cm-items { flex: 1; min-height: 0; overflow-y: auto; }
.ix-page .cm-item { width: 100%; display: grid; grid-template-columns: 42px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 11px 16px !important; border: 0; border-bottom: 1px solid #f1f2f4;
  background: #fff; font: inherit; text-align: left; cursor: pointer; height: auto !important; border-radius: 0; }
.ix-page .cm-item:hover { background: #fffaf7; }
.ix-page .cm-item.past { opacity: .55; }
.ix-page .cm-tile { width: 42px; height: 42px; border-radius: 11px; background: #fff1ea; color: #c2410c; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1; }
.ix-page .cm-tile b { font-size: 15px; } .ix-page .cm-tile small { font-size: 9px; font-weight: 700; }
.ix-page .cm-tx { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.ix-page .cm-tx b { font-size: 13px; font-weight: 600; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ix-page .cm-tx small { font-size: 11.5px; color: #6b7280; }
.ix-page .cm-pill { display: inline-flex; align-items: center; height: 22px; padding: 0 9px; border-radius: 99px; font-size: 11px; font-weight: 600; white-space: nowrap; }
.ix-page .cm-pill.h { background: #fef2f2; color: #b91c1c; } .ix-page .cm-pill.n { background: #fff7ed; color: #c2410c; }
.ix-page .cm-empty { padding: 32px 16px; text-align: center; font-size: 13px; color: #374151; font-weight: 600; display: flex; flex-direction: column; gap: 4px; }
.ix-page .cm-empty small { font-weight: 400; color: #9ca3af; font-size: 12px; }
.ix-page .cm-form { display: flex; flex-direction: column; gap: 14px; }
.ix-page .cm-seg { display: flex; gap: 8px; }
.ix-page .cm-seg button { flex: 1; height: 40px !important; min-height: 0 !important; border: 1px solid #e3e5ea; border-radius: 10px; background: #fff; font: inherit; font-size: 13px; font-weight: 600; color: #374151; cursor: pointer; }
.ix-page .cm-seg button.on.h { border-color: #ef4444; background: #fef2f2; color: #b91c1c; }
.ix-page .cm-seg button.on.n { border-color: #f59e0b; background: #fff7ed; color: #c2410c; }
.ix-page .cm-note { font-size: 12px; color: #6b7280; line-height: 1.5; }
/* computers: the page fits the window */
@media (min-width: 1001px) and (min-height: 600px) {
  .ix-page.lay2 .ix-main:has(.cm-cols) { display: flex !important; flex-direction: column !important; overflow-y: auto !important; }
  .ix-page.lay2 .ix-main:has(.cm-cols) > .ix-content { flex: 1 0 auto !important; display: flex !important; flex-direction: column !important; align-self: stretch; width: 100%; box-sizing: border-box; }
  .ix-page.lay2 .ix-main:has(.cm-cols) > .ix-content > * { flex: none; }
  .ix-page .ix-content > .cm-cols { flex: 1 0 auto !important; min-height: 460px; }
  .ix-page .cm-day { min-height: 0; }
}
@media (max-width: 1000px) {
  .ix-page .cm-cols { grid-template-columns: 1fr; }
  .ix-page .cm-leg { display: none; }
  .ix-page .cm-day { min-height: 48px; padding: 4px 5px !important; }
  .ix-page .cm-tag { font-size: 0; padding: 0; height: 5px; border-radius: 3px; }
  .ix-page .cm-tag.h { background: #ef4444; } .ix-page .cm-tag.n { background: #f59e0b; } .ix-page .cm-tag.school { background: #8b5cf6; } .ix-page .cm-tag.hte { background: #3b82f6; } .ix-page .cm-tag.work { background: #22c55e; }
  .ix-page .cm-grid { gap: 4px; padding: 10px; }
}
`;

const CAL_FORM_CSS = `
/* Calendar event form: everything fits without scrolling */
.ix-page .ix-content .ann-compose.cal-compose { gap: 10px !important; }
.ix-page .ix-content .cal-compose .ibx-head { margin-bottom: 2px; }
.ix-page .ix-content .cal-compose textarea { height: 84px !important; min-height: 0 !important; flex: none !important; resize: vertical; }
.ix-page .ix-content .cal-compose > .ix-field { flex: none !important; }
.ix-page .ix-content .cal-compose .ix-row-gap > .ix-field { flex: 1 1 0 !important; min-width: 0; }
.ix-page .ix-content .cal-compose .ibx-act { position: static !important; margin: 4px 0 0 !important; padding: 0 !important; border: 0 !important; background: none !important; box-shadow: none !important; }
.ix-page .mon-detail:has(.cal-compose) { overflow: hidden; }
`;

function CalEditor({ ev, onDone }) {
  const [date, setDate] = useState(ev ? String(ev.date).slice(0, 10) : "");
  const [type, setType] = useState(ev ? ev.type : "holiday");
  const [title, setTitle] = useState(ev ? ev.title : "");
  const [description, setDescription] = useState(ev ? ev.description || "" : "");
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    if (!date || !title) { onDone({ type: "error", text: "Please enter a date and title." }); return; }
    setSaving(true);
    try {
      const res = await fetch(ev ? `${API}/calendar/${ev.id}` : `${API}/calendar`, {
        method: ev ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ date, type, title, description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save calendar event.");
      if (!ev) { setDate(""); setTitle(""); setDescription(""); setType("holiday"); }
      onDone({ type: "success", text: data.message });
    } catch (err) {
      onDone({ type: "error", text: err.message });
    } finally { setSaving(false); }
  };
  const del = async () => {
    if (!window.confirm("Delete this calendar event?")) return;
    try {
      const res = await fetch(`${API}/calendar/${ev.id}`, { method: "DELETE", headers: { Accept: "application/json" } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to delete event.");
      onDone({ type: "success", text: data.message });
    } catch (err) { onDone({ type: "error", text: err.message }); }
  };

  return (
    <form onSubmit={save} className="ann-compose cal-compose">
      <style>{CAL_FORM_CSS}</style>
      <div className="ibx-head"><span className="ibx-ic big"><Icon name={ev ? "calendar" : "plus"} size={20} /></span>
        <div><b>{ev ? "Edit event" : "New event"}</b><small>{ev ? "Change the details and click Update." : "Interns can't time in on these days."}</small></div></div>
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
        <input id="cal-title" type="text" required placeholder="e.g. Independence Day" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="ix-field">
        <label htmlFor="cal-desc">Description <span className="ix-muted">(optional)</span></label>
        <textarea id="cal-desc" rows={3} placeholder="e.g. interns are not allowed to time in" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="ibx-act">
        {ev && <button type="button" className="ix-b danger" onClick={del}><Icon name="trash" size={14} /> Delete</button>}
        <span style={{ flex: 1 }} />
        <button type="submit" className="ix-b primary" disabled={saving}>
          {saving ? (ev ? "Updating..." : "Adding...") : ev ? "Update event" : "Add event"}
        </button>
      </div>
    </form>
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

  const role = { admin: "Admin", ojt_coordinator: "OJT Coordinator", supervisor: "HTE Supervisor" }[me.role] || me.role;
  const parts = (me.name || "").trim().split(/\s+/);
  const bday = me.date_of_birth
    ? new Date(String(me.date_of_birth).slice(0, 10) + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "";
  // one fact: a label and its value, or an input while editing
  const kv = (label, value, key, opts = {}) => (
    <div key={label} className={opts.full ? "pf-kv full" : "pf-kv"}>
      <small>{label}</small>
      {editing && key
        ? <input className="pf-input" type={opts.type || "text"} value={form[key] ?? ""} onChange={set(key)} aria-label={label}
            placeholder={opts.placeholder} autoComplete={opts.type === "password" ? "new-password" : undefined} required={opts.required} />
        : <b>{value || "—"}</b>}
    </div>
  );

  return (
    <>
      <PageHeader
        title="My Profile"
        sub={canEdit ? "Your account information and security." : "Your account information. Ask the admin if something needs to be changed."}
      />
      {!acct ? <Spinner /> : (
        <form className="pf-page" onSubmit={save} onKeyDown={(e) => { if (e.key === "Enter" && e.target.tagName !== "BUTTON") e.preventDefault(); }}>
          {/* header: who you are, at a glance */}
          <div className="ix-card pf-head">
            <div className="pf-photo">
              {preview ? <img src={preview} alt="New profile" className="pf-preview" /> : <Avatar name={me.name} photo={me.photo} size={76} />}
              {editing && (
                <label className="pf-cam" title="Change photo">
                  <input type="file" accept="image/*" onChange={pickPhoto} />
                  <Icon name="camera" size={14} />
                </label>
              )}
            </div>
            <div className="pf-who">
              <h2>{me.name}</h2>
              <div className="pf-sub">
                <span>Employee ID <b>{me.student_id || "—"}</b></span>
                {me.email && <span>{me.email}</span>}
                {me.role === "supervisor" && me.placement && <span>{me.placement}</span>}
              </div>
              <div className="pf-tags">
                <span className="pf-tag o">{role}</span>
                <span className="pf-tag">{me.college || "CCIS"}</span>
                <span className="pf-tag g">Active</span>
              </div>
            </div>
            <div className="pf-right">
              {canEdit ? (
                editing ? (
                  <div className="pf-actions">
                    <button type="button" className="ix-b ghost" onClick={cancelEdit} disabled={saving}>Cancel</button>
                    <button type="submit" className="ix-b primary" disabled={saving}>{saving ? "Saving..." : "Save changes"}</button>
                  </div>
                ) : (
                  <button type="button" className="ix-b ghost" onClick={startEdit}><Icon name="pencil" size={14} /> Edit profile</button>
                )
              ) : (
                <span className="pf-lock"><Icon name="lock" size={12} /> Only the admin can edit these</span>
              )}
            </div>
          </div>
          <Msg msg={msg} />

          <div className="pf-grid">
            <section className="ix-card flush pf-card">
              <header>Personal information</header>
              <div className="pf-body">
                {kv("First name", me.first_name || parts[0], "first_name", { required: true })}
                {kv("Middle name", me.middle_name, "middle_name")}
                {kv("Last name", me.last_name || (parts.length > 1 ? parts[parts.length - 1] : ""), "last_name", { required: true })}
                {kv("Birthday", bday, "date_of_birth", { type: "date" })}
                {kv("Contact number", me.contact_number, "contact_number", { type: "tel" })}
                {kv("Address", me.address, "address", { full: true })}
              </div>
            </section>
            <section className="ix-card flush pf-card">
              <header>{me.role === "supervisor" ? "HTE details" : "Work details"}</header>
              <div className="pf-body">
                {kv("Role", role)}
                {kv("Employee ID", me.student_id, "student_id")}
                {kv("Email", me.email, "email", { type: "email", full: true, required: true })}
                {me.role === "supervisor"
                  ? kv("HTE (company / office)", me.placement || "Not set", null, { full: true })
                  : kv("College", me.college || "CCIS")}
                {editing && kv("New password", "", "password", { type: "password", full: true, placeholder: "Leave blank to keep the current one" })}
              </div>
            </section>
          </div>
          {!editing && <div className="pf-sec pf-sec-full"><AccountSecurity user={user} /></div>}
        </form>
      )}
      <style>{STAFF_PF_CSS}</style>
      <style>{`
        .ix-page .pf-photo { position: relative; flex-shrink: 0; }
        .ix-page .pf-preview { width: 76px; height: 76px; border-radius: 50%; object-fit: cover; display: block; }
        .ix-page .pf-cam { position: absolute; right: -2px; bottom: -2px; width: 28px; height: 28px; border-radius: 50%; background: #e8582a; color: #fff;
          display: grid; place-items: center; border: 2px solid #fff; cursor: pointer; }
        .ix-page .pf-cam input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
        .ix-page .pf-actions { display: flex; gap: 8px; }
        .ix-page .pf-input { width: 100%; height: 36px; padding: 0 10px; border: 1px solid #e3e5ea; border-radius: 9px; font: inherit; font-size: 13px; box-sizing: border-box; background: #fff; color: #111827; }
        .ix-page .pf-input:focus { outline: none; border-color: #e8582a; box-shadow: 0 0 0 3px rgba(232,88,42,.12); }
        /* this page has 3 cards: personal and work side by side, account security under them */
        @media (min-width: 901px) and (min-height: 600px) {
          .ix-page .pf-page:not(:has(.pf-sec-full)) .pf-grid { grid-template-rows: 1fr; }
          .ix-page .pf-page:has(.pf-sec-full) .pf-grid { grid-template-rows: 1fr; flex: 1 1 0; }
          .ix-page .pf-sec-full { flex: none; }
          .ix-page .pf-sec-full > .ix-card.sec-card { height: auto; }
        }
      `}</style>
    </>
  );
}
const STAFF_PF_CSS = `
.ix-page .pf-page { display: flex; flex-direction: column; gap: 14px; }
.ix-page .ix-card.pf-head { position: relative; overflow: hidden; display: flex; align-items: center; gap: 18px; margin: 0 !important; padding: 18px 22px !important;
  background: linear-gradient(100deg, #fff7f2 0%, #fff 60%) !important; }
.ix-page .ix-card.pf-head { background: linear-gradient(100deg, #fff4ec 0%, #fffaf7 45%, #fff 100%) !important; }
.ix-page .pf-head > * { position: relative; z-index: 1; }
.ix-page .pf-who { min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.ix-page .pf-who h2 { margin: 0; font-size: 20px; line-height: 1.25 !important; font-weight: 700; color: #111827; }
.ix-page .pf-page :is(.pf-sub, .pf-stats small, .pf-stats b, .pf-lock, .pf-card > header) { line-height: 1.3 !important; }
.ix-page .pf-sec .sec-card :is(.sec-label, .sec-hint, .ipv-title) { line-height: 1.4 !important; }
.ix-page .pf-sub { display: flex; flex-wrap: wrap; gap: 0; font-size: 12.5px; color: #6b7280; }
.ix-page .pf-sub span + span::before { content: "·"; margin: 0 7px; color: #c4c8cf; }
.ix-page .pf-sub b { color: #111827; font-weight: 600; }
.ix-page .pf-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 2px; }
.ix-page .pf-tag { display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: 99px; background: #f3f4f6; color: #374151; font-size: 11.5px; font-weight: 600; }
.ix-page .pf-tag.o { background: #fff3ec; color: #c2410c; } .ix-page .pf-tag.g { background: #ecfdf3; color: #15803d; }
.ix-page .pf-right { margin-left: auto; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
.ix-page .pf-stats { display: flex; gap: 28px; }
.ix-page .pf-stats div { text-align: right; }
.ix-page .pf-stats small { display: block; font-size: 11.5px; color: #6b7280; }
.ix-page .pf-stats b { font-size: 19px; font-weight: 700; color: #111827; }
.ix-page .pf-lock { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: #8b919b; }
.ix-page .pf-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: stretch; }
.ix-page .ix-card.pf-card { margin: 0 !important; padding: 0 !important; overflow: hidden; }
.ix-page .pf-card > header { padding: 13px 18px; border-bottom: 1px solid #eef0f3; font-size: 14px; font-weight: 600; color: #111827; }
.ix-page .pf-body { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 24px; padding: 16px 18px 18px; }
.ix-page .pf-kv { min-width: 0; }
.ix-page .pf-kv.full { grid-column: 1 / -1; }
.ix-page .pf-kv small { display: block; font-size: 11.5px; line-height: 1.35 !important; color: #8b919b; margin: 0 0 2px !important; }
.ix-page .pf-kv b { display: block; font-size: 13.5px; line-height: 1.35 !important; font-weight: 600; color: #111827; overflow-wrap: anywhere; margin: 0 !important; }
/* account security uses the same card header as the others */
.ix-page .pf-sec, .ix-page .pf-sec > .sec-card { height: 100%; }
.ix-page .pf-sec > .ix-card.sec-card { margin: 0 !important; padding: 0 0 16px !important; box-sizing: border-box; display: flex; flex-direction: column; gap: 12px; }
.ix-page .pf-sec .sec-card > .ipv-title { margin: 0 !important; padding: 13px 18px; border-bottom: 1px solid #eef0f3; font-size: 14px !important; font-weight: 600 !important; color: #111827; text-transform: none !important; letter-spacing: 0 !important; }
.ix-page .pf-sec .sec-card > .ipv-title::after { display: none !important; }
.ix-page .pf-sec .sec-card > :not(.ipv-title) { margin-left: 18px !important; margin-right: 18px !important; }
.ix-page .pf-sec .sec-change { align-self: flex-start; }
@media (max-width: 1100px) { .ix-page .pf-stats { gap: 18px; } }
/* computers: the page fits the window; the four cards share the height left */
@media (min-width: 901px) and (min-height: 600px) {
  .ix-page.lay2 .ix-main:has(.pf-page) { overflow-y: auto !important; display: flex !important; flex-direction: column !important; }
  .ix-page.lay2 .ix-main:has(.pf-page) > .ix-content { flex: 1 1 auto !important; min-height: 0 !important; display: flex !important; flex-direction: column !important; align-self: stretch; width: 100%; box-sizing: border-box; }
  .ix-page.lay2 .ix-main:has(.pf-page) > .ix-content > * { flex: none; }
  .ix-page .ix-content > .pf-page { flex: 1 0 auto !important; min-height: 0; }
  .ix-page .ix-card.pf-head { flex: none; padding: clamp(12px, 1.8vh, 18px) 22px !important; }
  /* each row is at least as tall as its content (nothing is cut); extra height is shared */
  .ix-page .pf-grid { flex: 1 0 auto; grid-template-rows: minmax(min-content, 1.15fr) minmax(min-content, 1fr); }
  .ix-page .pf-grid > * { min-height: 0; }
  .ix-page .pf-card > header, .ix-page .pf-sec .sec-card > .ipv-title { padding: clamp(9px, 1.4vh, 13px) 18px !important; }
  .ix-page .pf-body { gap: clamp(8px, 1.4vh, 14px) 24px; padding: clamp(10px, 1.6vh, 16px) 18px; }
  .ix-page .pf-sec > .ix-card.sec-card { gap: clamp(6px, 1.2vh, 12px); padding-bottom: clamp(10px, 1.6vh, 16px) !important; }
  .ix-page .pf-sec .sec-hint { font-size: 11.5px; line-height: 1.45; }
}
/* wide screens: three facts per row, so the cards stay short */
@media (min-width: 1200px) and (max-height: 900px) { .ix-page .pf-body { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
/* tall screens: roomier facts so the cards are filled */
@media (min-width: 901px) and (min-height: 901px) { .ix-page .pf-body { gap: 18px 24px; } .ix-page .pf-kv b { font-size: 14px; } }
@media (min-width: 901px) and (max-height: 800px) {
  .ix-page .pf-sec .sec-hint { display: none; }
  .ix-page .pf-kv small { margin-bottom: 0; font-size: 11px; } .ix-page .pf-kv b { font-size: 12.5px; }
  .ix-page .pf-head .ix-avatar, .ix-page .pf-head > :first-child { transform: scale(.85); }
}
@media (max-width: 900px) {
  .ix-page .ix-card.pf-head { flex-wrap: wrap; }
  .ix-page .pf-stats { margin-left: 0; width: 100%; justify-content: space-between; }
  .ix-page .pf-stats div { text-align: left; }
  .ix-page .pf-lock { position: static !important; }
  .ix-page .pf-grid { grid-template-columns: 1fr; }
}
@media (max-width: 480px) { .ix-page .pf-body { grid-template-columns: 1fr; } }
`;

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
.ix-content .ix-search, .ix-content .ix-input, .ix-content .ix-select { border-radius: 14px; border-color: #f1e2d9; background: var(--ix-surface, #fff); }
.ix-content .ix-search:focus-within, .ix-content .ix-input:focus, .ix-content .ix-select:focus { border-color: var(--o); }
.ix-content .ix-chip { border-radius: 99px; background: var(--ix-surface, #fff); border: 1px solid #f1e2d9; }
.ix-content .ix-chip.green { background: #ecfdf3; border-color: #c9f0d9; }
.ix-content .ix-b { border-radius: 12px; }
.ix-content .ix-b.ghost { border-color: #f1e2d9; background: #fffaf7; }
.ix-content .ix-b.ghost:hover:not(:disabled) { border-color: var(--o); background: #fdeee7; }
.ix-content .ix-field input, .ix-content .ix-field select, .ix-content .ix-field textarea { border-radius: 14px; border-color: #f1e2d9; background: #fffaf7; }
.ix-content .ix-field input:focus, .ix-content .ix-field select:focus, .ix-content .ix-field textarea:focus { background: var(--ix-surface, #fff); border-color: var(--o); }
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
  padding: 16px 18px; background: var(--ix-surface, #fff); border-radius: 22px; border: 1px solid rgba(255,255,255,0.85);
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
.ix-content .ix-card.adm-cal { padding: 20px 22px 18px; background: var(--ix-surface, #fff); }
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
/* day colors: red no OJT, purple school event, blue HTE day off, green open (HTE working) */
.ix-page .ix-content .adm-cal .adm-cal-day.event.k-off { background: #fef2f2 !important; color: #b91c1c !important; }
.ix-page .ix-content .adm-cal .adm-cal-day.event.k-school { background: #f3efff !important; color: #6d28d9 !important; }
.ix-page .ix-content .adm-cal .adm-cal-day.event.k-hte { background: #eef4ff !important; color: #1d4ed8 !important; }
.ix-page .ix-content .adm-cal .adm-cal-day.event:is(.k-work, .k-open) { background: #ecfdf3 !important; color: #15803d !important; }
.ix-page .ix-content .adm-cal .adm-cal-dot.k-off { background: #ef4444 !important; } .ix-page .ix-content .adm-cal .adm-cal-dot.k-school { background: #8b5cf6 !important; }
.ix-page .ix-content .adm-cal .adm-cal-dot.k-hte { background: #3b82f6 !important; } .ix-page .adm-cal-dot:is(.k-work, .k-open) { background: #22c55e !important; }
.ix-page .adm-cal-day.today .adm-cal-dot { background: #fff !important; }
.ix-page .adm-cal-keys { display: flex; flex-wrap: wrap; gap: 4px 10px; margin: 6px 2px 0; font-size: 10.5px; color: #6b7280; line-height: 1.3; }
.ix-page .adm-cal-keys span { display: inline-flex; align-items: center; gap: 4px; }
.ix-page .adm-cal-keys i { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
.ix-page .adm-cal-keys i.k-off { background: #ef4444; } .ix-page .adm-cal-keys i.k-school { background: #8b5cf6; }
.ix-page .adm-cal-keys i.k-hte { background: #3b82f6; } .ix-page .adm-cal-keys i.k-work { background: #22c55e; }
.adm-cal-day.today .adm-cal-dot { background: var(--ix-surface, #fff); }
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
  background: var(--ix-surface, #fff); font: inherit; font-size: 13.5px; color: #3a2e28; outline: none;
}
.dtr-search input:focus { border-color: #e8582a; }
.dtr-search-clear {
  position: absolute; right: 8px; width: 22px; height: 22px; border: 0; border-radius: 50%;
  background: #f6ebe4; color: #7a6c64; cursor: pointer; font-size: 15px; line-height: 1;
}
.dtr-search-clear:hover { background: #fdeee7; color: #e8582a; }
.dtr-search-list {
  position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 30; margin: 0; padding: 6px;
  list-style: none; max-height: 320px; overflow-y: auto; background: var(--ix-surface, #fff);
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

/* ───────────────────────── Kiosks (Accounts → Kiosks) ─────────────────────────
   Each kiosk has its own key. The key is shown once, as a setup link to open on the kiosk device.
   "CCIS" kiosks accept every intern; an HTE kiosk only accepts the interns placed at that HTE. */
function Kiosks() {
  const [data, setData] = useState(null);       // { kiosks, placements }
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(null);
  const [form, setForm] = useState({ name: "", placement: "" });
  const [shown, setShown] = useState(null);     // { name, key } just made: shown once
  const [copied, setCopied] = useState(false);
  const [readerPick, setReaderPick] = useState("auto");   // which card reader the kiosk device uses
  const [adding, setAdding] = useState(false);
  const [kq, setKq] = useState("");
  const [kf, setKf] = useState("all");

  const load = () => fetch(`${API}/admin/kiosks`, { headers: { Accept: "application/json" } })
    .then((r) => r.json()).then((d) => setData(d && Array.isArray(d.kiosks) ? d : { kiosks: [], placements: [] }))
    .catch(() => setData({ kiosks: [], placements: [] }));
  useEffect(() => { load(); }, []);

  const call = async (url, method, body, tag) => {
    setBusy(tag); setMsg(null);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json", Accept: "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d.errors && Object.values(d.errors)[0]?.[0]) || d.message || "Something went wrong.");
      load();
      return d;
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
      return null;
    } finally { setBusy(null); }
  };
  const add = async (e) => {
    e.preventDefault();
    const d = await call(`${API}/admin/kiosks`, "POST", { name: form.name.trim(), placement: form.placement || null }, "add");
    if (d?.key) { setShown({ name: form.name.trim(), key: d.key }); setCopied(false); setForm({ name: "", placement: "" }); setAdding(false); }
  };
  const newKey = async (k) => {
    if (!window.confirm(`Make a new key for "${k.name}"? The old key stops working right away, so you'll need to set up the kiosk again.`)) return;
    const d = await call(`${API}/admin/kiosks/${k.id}`, "PATCH", { new_key: true }, "key" + k.id);
    if (d?.key) { setShown({ name: k.name, key: d.key }); setCopied(false); }
  };
  // show the setup link of a kiosk again (the key is kept encrypted on the server)
  const showLink = async (k) => {
    setBusy("show" + k.id); setMsg(null);
    try {
      const res = await fetch(`${API}/admin/kiosks/${k.id}/key`, { headers: { Accept: "application/json" } });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || "Couldn't get the key.");
      setShown({ name: k.name, key: d.key }); setCopied(false);
      const m = document.querySelector(".ix-main"); if (m) m.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    } finally { setBusy(null); }
  };
  const toggle = (k) => call(`${API}/admin/kiosks/${k.id}`, "PATCH", { active: !k.active }, "on" + k.id);
  const remove = (k) => window.confirm(`Remove "${k.name}"? Its key stops working.`) && call(`${API}/admin/kiosks/${k.id}`, "DELETE", null, "rm" + k.id);
  const link = shown ? `${window.location.origin}/?kiosk_key=${encodeURIComponent(shown.key)}${readerPick !== "auto" ? `&reader=${readerPick}` : ""}` : "";
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { /* select it by hand */ } };
  const seen = (v) => (v ? new Date(String(v).replace(" ", "T")).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Never");
  const kqs = kq.trim().toLowerCase();
  const kiosksShown = (data?.kiosks || [])
    .filter((k) => kf === "all" || (kf === "on" && k.active) || (kf === "off" && !k.active) || (kf === "ccis" && !k.placement)
      || (kf === "hte" && k.placement) || (kf === "never" && !k.last_seen_at))
    .filter((k) => !kqs || `${k.name} ${k.placement || ""}`.toLowerCase().includes(kqs))
    .sort((a, b) => (b.active - a.active) || String(a.name).localeCompare(String(b.name)));

  return (
    <div className="ks-wrap">
      <style>{KIOSK_CSS}</style>
      <Msg msg={msg} />
      {shown && (
        <div className="ix-card ks-key">
          <div className="ks-key-h"><Icon name="key" size={18} /><b>Set up "{shown.name}"</b><button type="button" className="ix-b ghost sm" onClick={() => setShown(null)}>Done</button></div>
          <p>Open this link <b>once</b> on the kiosk device. It saves the key there. You can see this link again any time with <b>Show link</b>. Keep it private: anyone with it can set up a kiosk.</p>
          <div className="ks-reader">
            <label htmlFor="ks-reader">Card reader on this kiosk</label>
            <select id="ks-reader" className="ix-select" value={readerPick} onChange={(e) => { setReaderPick(e.target.value); setCopied(false); }}>
              <option value="auto">Find it automatically</option>
              <option value="phone">Android phone / tablet (NFC)</option>
              <option value="acr122u">ACR122U (with the helper program)</option>
              <option value="usb">Old USB reader (can't protect cards)</option>
            </select>
          </div>
          <div className="ks-link"><code>{link}</code><button type="button" className="ix-b primary sm" onClick={copy}>{copied ? "Copied" : "Copy link"}</button></div>
        </div>
      )}
      <div className="ix-card ks-list">
        <div className="ks-bar">
          <h3>Kiosks <span className="ks-n">{data?.kiosks?.length ?? 0}</span></h3>
          <div className="ix-search ks-search"><Icon name="search" size={15} />
            <input type="text" placeholder="Search kiosk or HTE..." value={kq} onChange={(e) => setKq(e.target.value)} /></div>
          <select className="ix-select ks-filter" value={kf} onChange={(e) => setKf(e.target.value)} aria-label="Filter kiosks">
            <option value="all">All kiosks</option>
            <option value="on">On</option>
            <option value="off">Off</option>
            <option value="ccis">CCIS (every intern)</option>
            <option value="hte">HTE kiosks</option>
            <option value="never">Never used</option>
          </select>
          <button type="button" className="ix-b primary sm ks-addbtn" onClick={() => setAdding(true)}><Icon name="plus" size={14} /> Add kiosk</button>
        </div>
        {!data ? <Spinner /> : kiosksShown.length === 0 ? (
          <div className="ks-empty">{data.kiosks.length ? "No kiosk matches." : "No kiosks yet. The main kiosk key in the server's .env still works as a CCIS kiosk."}</div>
        ) : (
          <div className="ks-scroll">
            <table className="ks-t">
              <thead><tr><th>Kiosk</th><th>Who can tap</th><th>Last used</th><th>Status</th><th className="r">Actions</th></tr></thead>
              <tbody>
                {kiosksShown.map((k) => (
                  <tr key={k.id} className={k.active ? "" : "off"}>
                    <td><b>{k.name}</b></td>
                    <td>{k.placement ? <span className="ks-hte">{k.placement}</span> : <span className="ks-ccis">Every intern (CCIS)</span>}</td>
                    <td className="ks-seen">{seen(k.last_seen_at)}</td>
                    <td>
                      <button type="button" className={k.active ? "ks-sw on" : "ks-sw"} role="switch" aria-checked={k.active} disabled={!!busy}
                        onClick={() => toggle(k)} title={k.active ? "Turn off" : "Turn on"}><i /><span>{k.active ? "On" : "Off"}</span></button>
                    </td>
                    <td className="r">
                      <span className="ks-acts">
                        <button type="button" className="ix-b ghost sm" disabled={!!busy} onClick={() => showLink(k)} title="Show the setup link of this kiosk again"><Icon name="eye" size={13} /> {busy === "show" + k.id ? "..." : "Show link"}</button>
                        <button type="button" className="ix-b ghost sm" disabled={!!busy} onClick={() => newKey(k)} title="Make a new key: the old link stops working (use it if the link was shared by mistake)"><Icon name="key" size={13} /> New key</button>
                        <button type="button" className="ix-b danger sm ks-del" disabled={!!busy} onClick={() => remove(k)} aria-label={`Remove ${k.name}`} title="Remove"><Icon name="trash" size={15} /></button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {adding && (
        <Drawer inPage title="Add a kiosk" kicker="Kiosks" icon="tap" onClose={() => setAdding(false)}
          footer={(close) => (
            <>
              <button type="button" className="ix-b ghost" onClick={close}>Cancel</button>
              <button type="submit" form="ks-add-form" className="ix-b primary" disabled={busy === "add" || !form.name.trim()}>{busy === "add" ? "Adding..." : "Add kiosk"}</button>
            </>
          )}>
          <form id="ks-add-form" className="ks-form" onSubmit={async (e) => { await add(e); }}>
            <div className="ix-field">
              <label htmlFor="ks-name">Kiosk name</label>
              <input id="ks-name" className="ix-input" required maxLength={120} placeholder="e.g. CCIS lobby, City Hall IT office" autoFocus
                value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="ix-field">
              <label htmlFor="ks-place">Who can tap here?</label>
              <select id="ks-place" className="ix-select" value={form.placement} onChange={(e) => setForm((f) => ({ ...f, placement: e.target.value }))}>
                <option value="">Every intern (CCIS kiosk)</option>
                {(data?.placements || []).map((p) => <option key={p} value={p}>Only interns placed at {p}</option>)}
              </select>
              <small className="ks-hint">The HTE list comes from the interns' OJT placement.</small>
            </div>
            <p className="ks-hint">After adding, a setup link shows at the top of the page. Open it once on the kiosk device.</p>
          </form>
        </Drawer>
      )}
      <CardAlerts />
    </div>
  );
}

const KIOSK_CSS = `
  .ix-page .ks-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
  .ix-page .ks-bar h3 { margin: 0 6px 0 0 !important; }
  .ix-page .ks-search { flex: 1 1 220px; max-width: 340px; }
  .ix-page .ks-filter { width: auto; min-width: 170px; }
  .ix-page .ks-addbtn { margin-left: auto; }
  .ix-page .ks-scroll { max-height: min(60vh, 560px); overflow: auto; border: 1px solid #eef0f4; border-radius: 12px; }
  .ix-page .ks-t { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  .ix-page .ks-t th { position: sticky; top: 0; z-index: 1; background: #f8f9fb; text-align: left; font-size: 12.5px; font-weight: 700; color: #475569; padding: 10px 14px; border-bottom: 1px solid #eef0f4; }
  .ix-page .ks-t td { padding: 9px 14px; border-bottom: 1px solid #f1f2f5; vertical-align: middle; }
  .ix-page .ks-t tr:last-child td { border-bottom: 0; }
  .ix-page .ks-t tr:hover td { background: #fffaf7; }
  .ix-page .ks-t tr.off td { color: #94a3b8; }
  .ix-page .ks-t .r { text-align: right; }
  .ix-page .ks-hte { font-weight: 600; }
  .ix-page .ks-ccis { color: #64748b; }
  .ix-page .ks-seen { white-space: nowrap; color: #64748b; font-size: 12.5px; }
  .ix-page .ks-acts { display: inline-flex !important; flex-wrap: nowrap !important; gap: 6px; align-items: center; }
  .ix-page .ks-del { width: 34px; padding-left: 0 !important; padding-right: 0 !important; justify-content: center; }
  .ix-page .ks-sw { display: inline-flex; align-items: center; gap: 8px; border: 0; background: none; padding: 0; font: inherit; font-size: 12.5px; font-weight: 700; color: #94a3b8; cursor: pointer; }
  .ix-page .ks-sw i { position: relative; width: 34px; height: 20px; border-radius: 10px; background: #cbd5e1; transition: background .2s; }
  .ix-page .ks-sw i::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: left .2s; box-shadow: 0 1px 2px rgba(0,0,0,.2); }
  .ix-page .ks-sw.on { color: #15803d; }
  .ix-page .ks-sw.on i { background: #16a34a; }
  .ix-page .ks-sw.on i::after { left: 16px; }
  .ix-page .ks-empty { padding: 26px; text-align: center; color: #94a3b8; font-size: 13px; border: 1.5px dashed #e5e7eb; border-radius: 12px; }
  .ks-form { display: flex; flex-direction: column; gap: 14px; }
  .ix-page .ks-reader { display: flex; align-items: center; gap: 10px; margin: 0 0 10px; flex-wrap: wrap; }
  .ix-page .ks-reader label { font-size: 12.5px; font-weight: 600; color: #374151; }
  .ix-page .ks-reader .ix-select { width: auto; min-width: 260px; }
  .ix-page .ks-wrap { display: flex; flex-direction: column; gap: 14px; }
  .ix-page .ks-grid { display: grid; grid-template-columns: minmax(260px, 340px) 1fr; gap: 14px; align-items: start; }
  @media (max-width: 900px) { .ix-page .ks-grid { grid-template-columns: 1fr; } }
  .ix-page .ix-content .ks-form, .ix-page .ix-content .ks-list { padding: 16px 18px !important; }
  .ix-page .ks-form { display: flex; flex-direction: column; gap: 12px; }
  .ix-page .ks-form h3, .ix-page .ks-list h3 { margin: 0 0 4px; font-size: 14.5px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
  .ix-page .ks-n { font-size: 11px; padding: 1px 8px; border-radius: 99px; background: #f3ede9; color: #6b5b52; }
  .ix-page .ks-hint { display: block; margin-top: 4px; font-size: 11.5px; color: #94a3b8; }
  .ix-page .ks-acts { display: inline-flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
  .ix-page .ix-content .ks-key { padding: 14px 18px !important; border: 1px solid #fbcfb5 !important; background: #fff7f2 !important; }
  .ix-page .ks-key-h { display: flex; align-items: center; gap: 8px; color: #c2410c; }
  .ix-page .ks-key-h b { flex: 1; color: #111827; font-size: 14px; }
  .ix-page .ks-key p { margin: 6px 0 10px; font-size: 12.5px; color: #4b5563; }
  .ix-page .ks-link { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .ix-page .ks-link code { flex: 1; min-width: 240px; padding: 8px 10px; border-radius: 8px; background: #fff; border: 1px dashed #f0b896;
    font: 600 12px ui-monospace, monospace; color: #9a3412; word-break: break-all; }
`;

/* ───────────────────────── End of term (Accounts → End of Term) ─────────────────────────
   Pick the batch (program, HTE, semester, or the term's dates), export its records to Excel,
   then deactivate the accounts: graduated interns can't sign in or tap, their records stay. */
function EndOfTerm({ users, records, onRefresh }) {
  const interns = users.filter((u) => u.role === "intern");
  const [f, setF] = useState({ program: "", placement: "", semester: "", from: "", to: "", status: "active" });
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  const inRange = (r) => (!f.from || r.date >= f.from) && (!f.to || r.date <= f.to);
  const recsOf = (id) => records.filter((r) => String(r.user_id) === String(id) && inRange(r));
  const rows = interns.map((u) => {
    const recs = recsOf(u.id);
    const days = [...new Set(recs.map((r) => r.date))].sort();
    const hours = calcHours(recs);
    const required = requiredHoursFor(u.program);
    return { u, recs, days, hours, required, done: hours >= required, active: !u.deactivated_at };
  }).filter(({ u, recs, done, active }) =>
    (!f.program || programKey(u.program) === f.program)
    && (!f.placement || (u.placement || "") === f.placement)
    && (!f.semester || (u.semester || "") === f.semester)
    && (!(f.from || f.to) || recs.length > 0)
    && (f.status === "all" || (f.status === "active" && active) || (f.status === "done" && active && done)
        || (f.status === "notdone" && active && !done) || (f.status === "inactive" && !active)));

  const programs = [...new Set(interns.map((u) => programKey(u.program)).filter(Boolean))].sort();
  const places = [...new Set(interns.map((u) => u.placement).filter(Boolean))].sort();
  const allOn = rows.length > 0 && rows.every((r) => picked.has(r.u.id));
  const toggleAll = () => setPicked(allOn ? new Set() : new Set(rows.map((r) => r.u.id)));
  const toggle = (id) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const chosen = rows.filter((r) => picked.has(r.u.id));
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setPicked(new Set()); };

  const hm = (v) => (v ? new Date(String(v).replace(" ", "T")).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }) : "");
  const exportXlsx = async () => {
    setBusy("export"); setMsg(null);
    try {
      const XLSX = await import(/* @vite-ignore */ SHEETJS_URL);
      const summary = chosen.map(({ u, days, hours, required, active }) => ({
        "Student ID": u.student_id || "", Name: u.name, Program: u.program || "", Semester: u.semester || "", "HTE / placement": u.placement || "",
        Supervisor: u.supervisor_name || "", "Required hours": required, "Hours rendered": hours, "Hours left": Math.max(Math.round((required - hours) * 10) / 10, 0),
        "Days present": days.length, "First day": days[0] || "", "Last day": days[days.length - 1] || "", Status: active ? "Active" : "Deactivated",
      }));
      const detail = [];
      chosen.forEach(({ u, recs }) => {
        [...recs].sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.checked_in_at).localeCompare(String(b.checked_in_at))).forEach((r) => {
          detail.push({
            "Student ID": u.student_id || "", Name: u.name, Date: r.date, Type: r.uid === "ONLINE" ? "Online" : "Onsite",
            "Time in": hm(r.checked_in_at), "Time out": hm(r.checked_out_at), Hours: calcHours([r]),
            Overtime: r.ot_minutes ? `${r.ot_minutes} min (${r.ot_status || "pending"})` : "",
          });
        });
      });
      const wb = XLSX.utils.book_new();
      const s1 = XLSX.utils.json_to_sheet(summary);
      s1["!cols"] = [12, 28, 10, 13, 26, 22, 14, 14, 11, 12, 12, 12, 12].map((w) => ({ wch: w }));
      const s2 = XLSX.utils.json_to_sheet(detail);
      s2["!cols"] = [12, 28, 12, 8, 10, 10, 7, 18].map((w) => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, s1, "Summary");
      XLSX.utils.book_append_sheet(wb, s2, "Attendance");
      XLSX.writeFile(wb, `MYTRACK_interns_${new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })}.xlsx`);
      setMsg({ type: "success", text: `Exported ${chosen.length} intern${chosen.length > 1 ? "s" : ""} (${detail.length} attendance rows).` });
    } catch (err) {
      setMsg({ type: "error", text: "Couldn't create the Excel file (no internet to load the Excel tool?). " + (err?.message || "") });
    } finally { setBusy(null); }
  };

  const setActive = async (active) => {
    const n = chosen.length;
    if (!active && !window.confirm(`Deactivate ${n} intern account${n > 1 ? "s" : ""}? They can't sign in or tap their card anymore. All their records are kept, and you can reactivate them later.`)) return;
    setBusy(active ? "on" : "off"); setMsg(null);
    try {
      const res = await fetch(`${API}/admin/users/active-batch`, {
        method: "PATCH", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ ids: chosen.map((r) => r.u.id), active }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || "Something went wrong.");
      setMsg({ type: "success", text: d.message }); setPicked(new Set()); onRefresh && onRefresh();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    } finally { setBusy(null); }
  };

  return (
    <div className="ix-card eot">
      <style>{EOT_CSS}</style>
      <div className="eot-filters">
        <div className="ix-field"><label>Program</label>
          <select className="ix-select" value={f.program} onChange={set("program")}><option value="">All programs</option>{programs.map((p) => <option key={p}>{p}</option>)}</select></div>
        <div className="ix-field"><label>HTE / placement</label>
          <select className="ix-select" value={f.placement} onChange={set("placement")}><option value="">All</option>{places.map((p) => <option key={p}>{p}</option>)}</select></div>
        <div className="ix-field"><label>Semester</label>
          <select className="ix-select" value={f.semester} onChange={set("semester")}><option value="">Any</option><option>1st Semester</option><option>2nd Semester</option></select></div>
        <div className="ix-field"><label>Term from</label><input type="date" className="ix-input" value={f.from} onChange={set("from")} /></div>
        <div className="ix-field"><label>to</label><input type="date" className="ix-input" value={f.to} onChange={set("to")} /></div>
        <div className="ix-field"><label>Show</label>
          <select className="ix-select" value={f.status} onChange={set("status")}>
            <option value="active">Active accounts</option><option value="done">Active, hours completed</option>
            <option value="notdone">Active, hours not completed</option><option value="inactive">Deactivated</option><option value="all">Everyone</option>
          </select></div>
      </div>
      <p className="eot-hint">Term dates are optional: they keep only interns with attendance in those dates, and the export only has those dates.</p>
      <Msg msg={msg} />
      <div className="eot-bar">
        <b>{chosen.length} of {rows.length} selected</b>
        <span className="eot-acts">
          <button type="button" className="ix-b ghost sm" disabled={!chosen.length || !!busy} onClick={exportXlsx}><Icon name="download" size={14} /> {busy === "export" ? "Exporting..." : "Export to Excel"}</button>
          {f.status === "inactive"
            ? <button type="button" className="ix-b primary sm" disabled={!chosen.length || !!busy} onClick={() => setActive(true)}>{busy === "on" ? "..." : "Reactivate"}</button>
            : <button type="button" className="ix-b danger sm" disabled={!chosen.length || !!busy} onClick={() => setActive(false)}>{busy === "off" ? "..." : "Deactivate"}</button>}
        </span>
      </div>
      <Table
        headers={[<input key="all" type="checkbox" aria-label="Select all" checked={allOn} onChange={toggleAll} />, "Intern", "Program", "HTE", "Hours", "Days", "Status"]}
        empty="No interns match these filters."
        rows={rows.map(({ u, days, hours, required, done, active }) => [
          <input type="checkbox" aria-label={`Select ${u.name}`} checked={picked.has(u.id)} onChange={() => toggle(u.id)} />,
          <span><b>{u.name}</b><small className="eot-sub">{u.student_id || ""}</small></span>,
          u.program || "—",
          u.placement || "—",
          <span className={done ? "eot-done" : ""}>{hours}h / {required}h</span>,
          days.length,
          <Badge label={active ? (done ? "Completed" : "Active") : "Deactivated"} type={active ? (done ? "approved" : "pending") : "rejected"} />,
        ])}
      />
    </div>
  );
}
const EOT_CSS = `
  .ix-page .ix-content .eot { padding: 16px 18px !important; }
  .ix-page .eot-filters { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; }
  @media (max-width: 1100px) { .ix-page .eot-filters { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (max-width: 640px) { .ix-page .eot-filters { grid-template-columns: 1fr 1fr; } }
  .ix-page .eot-hint { margin: 8px 0 10px; font-size: 11.5px; color: #94a3b8; }
  .ix-page .eot-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 0; }
  .ix-page .eot-bar b { font-size: 13px; }
  .ix-page .eot-acts { margin-left: auto; display: inline-flex; gap: 8px; flex-wrap: wrap; }
  .ix-page .eot-sub { display: block; font-size: 11px; color: #94a3b8; }
  .ix-page .eot-done { color: #15803d; font-weight: 700; }
  .ix-page .eot input[type="checkbox"] { width: 16px; height: 16px; accent-color: #e8582a; cursor: pointer; }
`;

/* ───────────────────────── Backups (Accounts → Backups) ─────────────────────────
   One file with every table (JSON inside a .zip), made on the server. Also: php artisan mytrack:backup */
function Backups() {
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const load = () => fetch(`${API}/admin/backups`, { headers: { Accept: "application/json" } })
    .then((r) => r.json()).then((d) => setList(Array.isArray(d?.backups) ? d.backups : [])).catch(() => setList([]));
  useEffect(() => { load(); }, []);

  const make = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`${API}/admin/backups`, { method: "POST", headers: { Accept: "application/json" } });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || "The backup failed.");
      setMsg({ type: "success", text: d.message }); load();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    } finally { setBusy(false); }
  };
  const download = async (b) => {
    setMsg(null);
    try {
      const res = await fetch(`${API}/admin/backups/${encodeURIComponent(b.name)}`, { headers: { Accept: "application/zip" } });
      if (!res.ok) throw new Error("Couldn't download the backup.");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = b.name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (err) { setMsg({ type: "error", text: err.message }); }
  };
  const size = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
  const when = (v) => new Date(String(v).replace(" ", "T")).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div className="ix-card eot">
      <style>{EOT_CSS}</style>
      <div className="eot-bar" style={{ paddingTop: 0 }}>
        <div>
          <b>Database backups</b>
          <p className="eot-hint" style={{ margin: "4px 0 0" }}>Every table in one file. The server keeps the last 12 backups; download them and keep a copy on Google Drive or a USB drive.</p>
        </div>
        <span className="eot-acts"><button type="button" className="ix-b primary sm" disabled={busy} onClick={make}>{busy ? "Backing up..." : "Back up now"}</button></span>
      </div>
      <Msg msg={msg} />
      {!list ? <Spinner /> : (
        <Table
          headers={["Backup", "Made", "Size", ""]}
          empty="No backups yet. Click “Back up now”."
          rows={list.map((b) => [<b>{b.name}</b>, when(b.created_at), size(b.size),
            <button type="button" className="ix-b ghost sm" onClick={() => download(b)}><Icon name="download" size={14} /> Download</button>])}
        />
      )}
    </div>
  );
}

/* ───────────────────────── Activity log (Accounts → Activity Log) ───────────────────────── */
function ActivityLog() {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  useEffect(() => {
    let off = false;
    const t = setTimeout(() => {
      fetch(`${API}/admin/activity?q=${encodeURIComponent(q)}&role=${role}&page=${page}`, { headers: { Accept: "application/json" } })
        .then((r) => r.json()).then((d) => { if (!off) setData(d && Array.isArray(d.rows) ? d : { rows: [], total: 0, per_page: 50 }); })
        .catch(() => { if (!off) setData({ rows: [], total: 0, per_page: 50 }); });
    }, 250);
    return () => { off = true; clearTimeout(t); };
  }, [q, role, page]);
  const pages = data ? Math.max(1, Math.ceil(data.total / (data.per_page || 50))) : 1;
  const when = (v) => new Date(String(v).replace(" ", "T")).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  const tone = (a) => (/refused|locked|failed|deleted|removed/i.test(a) ? "rejected" : /approved|signed in|added|agreed/i.test(a) ? "approved" : "pending");
  const ROLES = [["", "Everyone"], ["admin", "Admins"], ["ojt_coordinator", "Coordinators"], ["supervisor", "Supervisors"], ["intern", "Interns"]];
  return (
    <div className="al-wrap">
      <style>{ACT_CSS}</style>
      <div className="mon-bar">
        <div className="ix-search mon-search">
          <Icon name="search" size={15} />
          <input type="text" placeholder="Search a name, an action or a detail..." value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
        {ROLES.map(([k, l]) => (
          <button key={k} type="button" className={role === k ? "mon-chip on" : "mon-chip"} onClick={() => { setRole(k); setPage(1); }}>{l}</button>
        ))}
      </div>
      <div className="ix-card al-card">
        {!data ? <Spinner /> : (
          <Table
            headers={["When", "Who", "Did what", "Details"]}
            empty="Nothing logged yet."
            rows={data.rows.map((r) => [
              <span className="al-when">{when(r.created_at)}</span>,
              <span className="al-who"><b>{r.user_name || "Not signed in"}</b><small>{[({ admin: "Admin", ojt_coordinator: "Coordinator", supervisor: "Supervisor", intern: "Intern" })[r.role], r.ip].filter(Boolean).join(" · ")}</small></span>,
              <Badge label={r.action} type={tone(r.action)} />,
              <span className="al-det" title={r.details || ""}>{r.details || "—"}</span>,
            ])}
          />
        )}
        {data && data.total > 0 && (
          <div className="al-pager">
            <span>{data.total} entr{data.total === 1 ? "y" : "ies"} · page {page} of {pages}</span>
            <button type="button" className="ix-b ghost sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Newer</button>
            <button type="button" className="ix-b ghost sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Older</button>
          </div>
        )}
      </div>
    </div>
  );
}
const ACT_CSS = `
  .ix-page .al-wrap { display: flex; flex-direction: column; gap: 12px; }
  .ix-page .ix-content .al-card { padding: 6px 0 0 !important; }
  .ix-page .al-when { white-space: nowrap; font-size: 12px; color: #4b5563; }
  .ix-page .al-who { display: flex; flex-direction: column; }
  .ix-page .al-who small { font-size: 11px; color: #94a3b8; }
  .ix-page .al-det { display: inline-block; max-width: 420px; font-size: 12px; color: #4b5563; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; vertical-align: middle; }
  .ix-page .al-pager { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 10px 14px; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; }
  .ix-page .al-pager span { margin-right: auto; }
`;
const ACC_OFF_CSS = `
  .ix-page .acc-role-tag.off { background: #e5e7eb; color: #4b5563; }
  .ix-page .acc-off-note { display: flex; gap: 8px; align-items: flex-start; margin: 0 0 12px; padding: 9px 12px; border-radius: 10px;
    background: #f1f2f4; border: 1px solid #dcdfe4; color: #374151; font-size: 12.5px; line-height: 1.45; }
`;


/* ───────────────────────── Import interns from Excel (Accounts → Import interns) ─────────────────────────
   1. download the template (or use the coordinator's own sheet: the column names are matched loosely)
   2. choose the file → every row is checked on the server, nothing is saved yet
   3. "Create accounts" → good rows become intern accounts; each intern gets a temporary password by email */
const SHEETJS_URL = "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs";   // reads and writes .xlsx in the browser
const IMPORT_COLUMNS = [
  ["student_id", "Student ID", "221-00123"],
  ["last_name", "Last name", "Dela Cruz"],
  ["first_name", "First name", "Juan"],
  ["middle_name", "Middle name", "Santos"],
  ["email", "Email", "juan.delacruz@carsu.edu.ph"],
  ["program", "Program (BSIT, BSIS or BSCS)", "BSIT"],
  ["semester", "Semester (1st or 2nd)", "1st"],
  ["birthday", "Birthday (YYYY-MM-DD)", "2003-05-14"],
  ["contact_number", "Contact number", "09171234567"],
  ["placement", "Placement / HTE (can be blank)", ""],
  ["emergency_contact_name", "Emergency contact name", "Maria Dela Cruz"],
  ["emergency_contact_relation", "Emergency contact relationship", "Mother"],
  ["emergency_contact_number", "Emergency contact number", "09181234567"],
];
// a heading in the coordinator's file -> our field (spaces, case and symbols are ignored)
const HEADER_ALIASES = {
  student_id: ["studentid", "studentno", "studentnumber", "idnumber", "idno", "id"],
  last_name: ["lastname", "surname", "familyname"],
  first_name: ["firstname", "givenname"],
  middle_name: ["middlename", "middleinitial", "mi"],
  email: ["email", "emailaddress", "carsuemail", "schoolemail"],
  program: ["program", "course", "programbsitbsisorbscs", "degree"],
  semester: ["semester", "sem", "semester1stor2nd"],
  birthday: ["birthday", "birthdate", "dateofbirth", "birthdayyyyymmdd", "dob"],
  contact_number: ["contactnumber", "contact", "contactno", "mobile", "mobilenumber", "phone", "cellphone"],
  placement: ["placement", "hte", "company", "placementhte", "placementhtecanbeblank", "hostestablishment"],
  emergency_contact_name: ["emergencycontactname", "emergencycontact", "incaseofemergency", "guardian"],
  emergency_contact_relation: ["emergencycontactrelationship", "relationship", "relation"],
  emergency_contact_number: ["emergencycontactnumber", "emergencynumber", "guardiannumber"],
};
const keyOf = (h) => String(h || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const FIELD_OF = Object.fromEntries(Object.entries(HEADER_ALIASES).flatMap(([f, list]) => list.map((a) => [a, f])));

// tiny CSV reader (quotes, commas and new lines inside quotes)
function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim() !== ""));
}

// sheet rows (first row = headings) -> [{ student_id, last_name, ... }]
function rowsFromTable(table) {
  if (!table.length) return { rows: [], missing: ["every column"] };
  const heads = table[0].map((h) => FIELD_OF[keyOf(h)] || (["name", "fullname", "studentname", "nameofstudent"].includes(keyOf(h)) ? "full_name" : null));
  const rows = table.slice(1).map((r) => {
    const o = {};
    heads.forEach((f, i) => { if (f && o[f] === undefined) o[f] = String(r[i] ?? "").trim(); });
    // one "Name" column: "Dela Cruz, Juan Santos" or "Juan Santos Dela Cruz"
    if (o.full_name && !o.last_name && !o.first_name) {
      const n = o.full_name.replace(/\s+/g, " ").trim();
      if (n.includes(",")) { const [last, rest] = n.split(/,(.+)/); o.last_name = last.trim(); o.first_name = (rest || "").trim(); }
      else { const parts = n.split(" "); o.last_name = parts.pop() || ""; o.first_name = parts.join(" "); }
    }
    delete o.full_name;
    return o;
  }).filter((o) => Object.values(o).some((v) => v));
  const need = ["student_id", "email", "program", "semester", "birthday"];
  const missing = need.filter((f) => !heads.includes(f)).map((f) => IMPORT_COLUMNS.find((c) => c[0] === f)[1]);
  if (!heads.includes("last_name") && !heads.includes("full_name")) missing.unshift("Last name (or Name)");
  return { rows, missing };
}

function ImportInterns({ onClose, onDone }) {
  const [step, setStep] = useState("pick");          // pick | check | done
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);               // what was read from the file
  const [checked, setChecked] = useState(null);       // { rows: [{row, data, errors, exists}], ready }
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [onlyProblems, setOnlyProblems] = useState(false);

  const loadXlsx = () => import(/* @vite-ignore */ SHEETJS_URL);

  const downloadTemplate = async () => {
    const head = IMPORT_COLUMNS.map((c) => c[1]);
    const sample = IMPORT_COLUMNS.map((c) => c[2]);
    try {
      const XLSX = await loadXlsx();
      // sheet 1 "Interns": headings only (fill this in) · sheet 2 "Example": one filled-in row to copy from.
      // Only the first sheet is imported, so the example never becomes an account.
      const cols = head.map((h) => ({ wch: Math.max(14, h.length + 2) }));
      const ws = XLSX.utils.aoa_to_sheet([head]);
      ws["!cols"] = cols;
      const ex = XLSX.utils.aoa_to_sheet([head, sample, [], ["This is only an example. Type your interns in the \"Interns\" sheet; this sheet is not imported."]]);
      ex["!cols"] = cols;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Interns");
      XLSX.utils.book_append_sheet(wb, ex, "Example");
      XLSX.writeFile(wb, "MYTRACK-interns-template.xlsx");
    } catch {
      // no internet for the Excel helper: give a CSV (Excel opens it too)
      const csv = [head].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
      a.download = "MYTRACK-interns-template.csv"; a.click();
    }
  };

  const check = async (list) => {
    setBusy("check"); setErr("");
    try {
      const res = await fetch(`${API}/admin/users/import/preview`, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ rows: list }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d.errors && Object.values(d.errors)[0]?.[0]) || d.message || "Couldn't check the file.");
      setChecked(d); setStep("check");
    } catch (e) {
      setErr(e instanceof TypeError ? "Couldn't reach the server." : e.message);
    } finally { setBusy(""); }
  };

  const pickFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    setErr(""); setFileName(f.name); setBusy("read");
    try {
      let table;
      if (/\.csv$/i.test(f.name)) {
        table = parseCsv(await f.text());
      } else if (/\.xlsx?$/i.test(f.name)) {
        let XLSX;
        try { XLSX = await loadXlsx(); } catch { throw new Error("Couldn't load the Excel reader (no internet?). In Excel, use File → Save As → CSV, then choose the .csv file."); }
        const wb = XLSX.read(await f.arrayBuffer(), { cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        table = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: "yyyy-mm-dd", defval: "" });
      } else {
        throw new Error("Choose an Excel (.xlsx) or CSV file.");
      }
      // skip title lines above the headings: use the first row that has a "Student ID" or "Email" heading
      const start = table.findIndex((r) => r.some((h) => ["student_id", "email"].includes(FIELD_OF[keyOf(h)])));
      const { rows: list, missing } = rowsFromTable(start > 0 ? table.slice(start) : table);
      if (missing.length) throw new Error(`These columns are missing: ${missing.join(", ")}. Download the template to see the columns.`);
      if (!list.length) throw new Error("The file has no interns under the headings.");
      if (list.length > 500) throw new Error("Up to 500 interns at a time. Split the file and import it in parts.");
      setRows(list);
      setBusy("");
      await check(list);
    } catch (e2) {
      setErr(e2.message); setBusy("");
    }
  };

  const create = async () => {
    const good = checked.rows.filter((x) => !x.errors.length).length;
    if (!window.confirm(`Create ${good} intern account${good === 1 ? "" : "s"}? Each intern gets a temporary password by email.`)) return;
    setBusy("create"); setErr("");
    try {
      const res = await fetch(`${API}/admin/users/import`, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ rows, login_url: `${window.location.origin}/login` }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d.errors && Object.values(d.errors)[0]?.[0]) || d.message || "Couldn't create the accounts.");
      setResult(d); setStep("done"); onDone && onDone();
    } catch (e) {
      setErr(e instanceof TypeError ? "Couldn't reach the server. Some accounts may have been made: check the list before trying again." : e.message);
    } finally { setBusy(""); }
  };

  const downloadPasswords = () => {
    const list = result?.no_email || [];
    const csv = [["Name", "Student ID", "Email", "Temporary password"], ...list.map((x) => [x.name, x.student_id, x.email, x.password])]
      .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = "MYTRACK-temporary-passwords.csv"; a.click();
  };

  const ready = checked ? checked.rows.filter((x) => !x.errors.length) : [];
  const bad = checked ? checked.rows.filter((x) => x.errors.length) : [];
  const shown = checked ? (onlyProblems ? bad : checked.rows) : [];

  return (
    <Modal title="Import interns from Excel" sub="Create many intern accounts at once from the coordinator's list." onClose={busy === "create" ? () => {} : onClose} wide>
      <style>{IMPORT_CSS}</style>
      <div className="im-body">
        {err && <Msg msg={{ type: "error", text: err }} />}

        {step === "pick" && (
          <>
            <ol className="im-steps">
              <li><b>Get the list in the right columns.</b> Download the template, or use the coordinator's own sheet if it has these headings:
                <span className="im-cols">{IMPORT_COLUMNS.map((c) => <em key={c[0]} className={["middle_name", "contact_number", "placement", "emergency_contact_name", "emergency_contact_relation", "emergency_contact_number"].includes(c[0]) ? "opt" : ""}>{c[1].replace(/ \(.*\)/, "")}</em>)}</span>
                <small>Orange = required. A single "Name" column ("Dela Cruz, Juan") works too. Placement can be blank and filled in later.</small>
              </li>
              <li><b>Choose the file.</b> Every row is checked first. Nothing is saved until you press Create.</li>
              <li><b>Create the accounts.</b> Each intern gets an email with a temporary password and sets their own on first sign-in.</li>
            </ol>
            <div className="im-actions">
              <button type="button" className="ix-b ghost" onClick={downloadTemplate}><Icon name="download" size={15} /> Download template</button>
              <label className={busy ? "ix-b primary disabled" : "ix-b primary"}>
                <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={pickFile} disabled={!!busy} />
                <Icon name="upload" size={15} /> {busy === "read" ? "Reading..." : busy === "check" ? "Checking..." : "Choose Excel file"}
              </label>
            </div>
          </>
        )}

        {step === "check" && checked && (
          <>
            <div className="im-sum">
              <span className="im-file"><Icon name="file" size={15} /> {fileName}</span>
              <span className="im-pill ok">{ready.length} ready</span>
              {bad.length > 0 && <span className="im-pill bad">{bad.length} with problems (will be skipped)</span>}
              {bad.length > 0 && (
                <label className="im-only"><input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} /> Show only problems</label>
              )}
            </div>
            <div className="im-table">
              <table>
                <thead><tr><th>Row</th><th>Name</th><th>Student ID</th><th>Email</th><th>Program</th><th>Placement</th><th>Status</th></tr></thead>
                <tbody>
                  {shown.map((x) => (
                    <tr key={x.row} className={x.errors.length ? "bad" : ""}>
                      <td>{x.row}</td>
                      <td>{[x.data.last_name, x.data.first_name].filter(Boolean).join(", ") || "—"}</td>
                      <td>{x.data.student_id || "—"}</td>
                      <td>{x.data.email || "—"}</td>
                      <td>{x.data.program ? x.data.program.slice(0, 4) : "—"}</td>
                      <td>{x.data.placement || <i className="im-later">later</i>}</td>
                      <td>{x.errors.length ? <span className="im-err">{x.errors.join(" · ")}</span> : <span className="im-ok">Ready</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="im-actions">
              <button type="button" className="ix-b ghost" disabled={!!busy} onClick={() => { setStep("pick"); setChecked(null); setRows([]); setErr(""); }}>Choose another file</button>
              <button type="button" className="ix-b primary" disabled={!ready.length || !!busy} onClick={create}>
                {busy === "create" ? "Creating accounts and sending emails..." : `Create ${ready.length} account${ready.length === 1 ? "" : "s"}`}
              </button>
            </div>
            {bad.length > 0 && <p className="im-note">Fix the rows with problems in the file and import it again later: rows already created are skipped automatically.</p>}
          </>
        )}

        {step === "done" && result && (
          <>
            <div className="im-done">
              <Icon name="check" size={20} />
              <div><b>{result.message}</b><small>New interns are on Onsite, hours-based and 2-tap DTR. Change any of them in Manage Accounts.</small></div>
            </div>
            {result.no_email?.length > 0 && (
              <div className="im-warn">
                <b>{result.no_email.length} intern{result.no_email.length === 1 ? "" : "s"} didn't get an email.</b>
                <span>The email server isn't set up, or sending failed. Give these temporary passwords in person; they'll set their own on first sign-in. This list is shown only now.</span>
                <div className="im-table small">
                  <table>
                    <thead><tr><th>Name</th><th>Student ID</th><th>Email</th><th>Temporary password</th></tr></thead>
                    <tbody>{result.no_email.map((x) => <tr key={x.email}><td>{x.name}</td><td>{x.student_id}</td><td>{x.email}</td><td><code>{x.password}</code></td></tr>)}</tbody>
                  </table>
                </div>
                <button type="button" className="ix-b ghost sm" onClick={downloadPasswords}><Icon name="download" size={14} /> Download this list</button>
              </div>
            )}
            {result.skipped?.length > 0 && (
              <div className="im-skip">
                <b>Skipped rows</b>
                <ul>{result.skipped.map((x) => <li key={x.row}>Row {x.row}{x.name ? ` (${x.name})` : ""}: {x.errors.join(" · ")}</li>)}</ul>
              </div>
            )}
            <div className="im-actions"><button type="button" className="ix-b primary" onClick={onClose}>Done</button></div>
          </>
        )}
      </div>
    </Modal>
  );
}
const IMPORT_CSS = `
  .im-body { display: flex; flex-direction: column; gap: 12px; font-size: 13px; color: #374151; }
  .im-steps { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 10px; }
  .im-steps li { line-height: 1.5; }
  .im-steps li b { color: #111827; }
  .im-steps small { display: block; margin-top: 4px; font-size: 12px; color: #6b7280; }
  .im-cols { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
  .im-cols em { font-style: normal; font-size: 11.5px; font-weight: 600; padding: 2px 8px; border-radius: 6px; background: #fff1ea; color: #c2410c; }
  .im-cols em.opt { background: #f1f2f4; color: #4b5563; }
  .im-actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
  .im-actions label.ix-b { cursor: pointer; }
  .im-actions label.ix-b.disabled { opacity: .6; pointer-events: none; }
  .im-sum { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .im-file { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: #111827; margin-right: auto; }
  .im-pill { font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 99px; }
  .im-pill.ok { background: #dcf5e6; color: #146c3a; }
  .im-pill.bad { background: #fde8e8; color: #b91c1c; }
  .im-only { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; }
  .im-only input { accent-color: #e8582a; }
  .im-table { max-height: 46vh; overflow: auto; border: 1px solid #e5e7eb; border-radius: 10px; }
  .im-table.small { max-height: 30vh; margin: 8px 0; background: #fff; }
  .im-table table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .im-table th { position: sticky; top: 0; background: #f6f7f9; text-align: left; padding: 8px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: .3px; color: #6b7280; border-bottom: 1px solid #e5e7eb; }
  .im-table td { padding: 7px 10px; border-bottom: 1px solid #f1f2f4; vertical-align: top; }
  .im-table tr.bad td { background: #fff7f7; }
  .im-ok { color: #15803d; font-weight: 600; }
  .im-err { color: #b91c1c; font-size: 12px; }
  .im-later { color: #9ca3af; font-style: normal; }
  .im-note { margin: 0; font-size: 12px; color: #6b7280; }
  .im-done { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: 12px; background: #ecfdf3; border: 1px solid #bbf0cf; color: #15803d; }
  .im-done b { display: block; color: #14532d; font-size: 14px; }
  .im-done small { display: block; color: #3f6b50; font-size: 12px; margin-top: 2px; }
  .im-warn { padding: 12px 14px; border-radius: 12px; background: #fff7ed; border: 1px solid #fde4cc; }
  .im-warn > b { display: block; color: #9a3412; }
  .im-warn > span { display: block; font-size: 12px; color: #7c5a45; margin-top: 2px; }
  .im-warn code { font: 600 12.5px ui-monospace, monospace; color: #111827; }
  .im-skip { padding: 10px 14px; border-radius: 12px; background: #f6f7f9; border: 1px solid #e5e7eb; }
  .im-skip ul { margin: 6px 0 0; padding-left: 18px; font-size: 12px; color: #4b5563; }
`;