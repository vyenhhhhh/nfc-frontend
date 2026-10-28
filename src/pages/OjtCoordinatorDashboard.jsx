// OjtCoordinatorDashboard.jsx
// The OJT coordinator's workspace: reviews online attendance + MOVs, manages NFC cards,
// monitors interns, and prints DTRs / consolidated reports.
import { createPortal } from "react-dom";
import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Shell, {
  navWithTabs,
  Spinner, PageHeader, Badge, Table, Section, Msg, Avatar, Icon, Inbox, Empty,
  InternMonitor, AnnouncementManager, AnnouncementBoard, OnlineReview, OvertimeBoard, OA_CSS, calcHours, requiredHoursFor, todayManila, fmtTime, greeting,
  PRE_REQUIREMENTS, POST_REQUIREMENTS, DURING_REQUIREMENTS, REQUIREMENTS_BY_PHASE, PHASE_LABEL, SCHEDULE, fmtMinutes, Modal, liveRefresh,
} from "../components/DashKit.jsx";
import NfcCards from "../components/NfcCards.jsx";
import {
  HomeCalendar, Records, DTR, AdminProfile, adminCss, adminMatch, Calendar,
} from "./AdminDashboard.jsx";
import { internCss, cardUnify, preStatusOf } from "./InternDashboard.jsx";
import QuarterlyReport from "../components/QuarterlyReport.jsx";
import Evaluations from "../components/Evaluations.jsx";
import { DashLayout, Panel, DashRow, TodayPeople, NeedsAttention } from "../components/DashBoard.jsx";
import { formalLayout } from "../components/formalLayout.js";
import { mdCss } from "../components/materialTheme.js";

import { API, STORAGE } from "../config.js";
const NAV = [
  { path: "/coordinator",               label: "Dashboard",     icon: "dashboard" },
  { path: "/coordinator/approvals",     label: "Approvals",     icon: "inbox" },
  { path: "/coordinator/interns",       label: "Interns",       icon: "users" },
  { path: "/coordinator/supervisors",   label: "Supervisors",   icon: "briefcase" },
  { path: "/coordinator/nfc",           label: "NFC Cards",     icon: "card" },
  { path: "/coordinator/reports",       label: "Reports",       icon: "chart" },
  { path: "/coordinator/announcements", label: "Announcements", icon: "bell" },
  { path: "/coordinator/calendar",      label: "Calendar",      icon: "calendar" },
  { path: "/coordinator/profile",       label: "My Profile",    icon: "user" },
];

/* Pages that hold several tabs. The open tab is in the address, e.g. /coordinator/approvals?tab=overtime,
   so a link (or the "Needs your review" box) can open the right tab directly. The first tab is the default. */
const GROUPS = {
  "/coordinator/approvals": {
    title: "Approvals",
    live: true,
    tabs: [
      { key: "online",      label: "Online Attendance", icon: "inbox",  sub: "Remote workdays: the supervisor confirms first, then you give the final decision." },
      { key: "movs",        label: "MOV Submissions",   icon: "folder", sub: "Review intern-submitted documents (MOVs, forms, certificates)." },
      { key: "overtime",    label: "Overtime",          icon: "clock",  sub: "Time after 5:00 PM: the supervisor approves first, then you give the final decision." },
    ],
  },
  "/coordinator/interns": {
    title: "Interns",
    live: true,
    tabs: [
      { key: "monitor", label: "Monitor Interns",    icon: "users", sub: "Real-time status of all interns." },
      { key: "records", label: "Attendance Records", icon: "list",  sub: "Complete attendance log of every intern." },
      // Evaluation tab hidden for now (waiting for the OJT coordinator's answer on who submits the evaluation form):
      // { key: "evaluation", label: "Evaluation", icon: "pencil", sub: "Upload the signed paper evaluation form of each intern." },
    ],
  },
  "/coordinator/reports": {
    title: "Reports",
    tabs: [
      { key: "dtr",     label: "Generate DTR",        icon: "file",  sub: "Print an intern's Daily Time Record (CS Form 48)." },
      { key: "quarterly", label: "Quarterly Report", icon: "file", sub: "Unit Performance Review Report: the deployment tables fill in by themselves; type the rest, then print or save as PDF." },
    ],
  },
};

// The old addresses still work (bookmarks, links in notifications): they open the matching tab.
const OLD_PATHS = {
  "/coordinator/pending":     "/coordinator/approvals?tab=online",
  "/coordinator/submissions": "/coordinator/approvals?tab=movs",
  "/coordinator/overtime":    "/coordinator/approvals?tab=overtime",
  "/coordinator/corrections": "/coordinator/approvals",   // time corrections moved to the HTE supervisor
  "/coordinator/records":     "/coordinator/interns?tab=records",
  "/coordinator/dtr":         "/coordinator/reports?tab=dtr",
  "/coordinator/hours":       "/coordinator",
};

export default function OjtCoordinatorDashboard() {
  const user = JSON.parse(sessionStorage.getItem("user") || "{}");
  const { pathname: path, search, state } = useLocation();
  const navigate = useNavigate();
  const [pending, setPending] = useState([]);   // online attendance waiting for review
  const [movs, setMovs] = useState([]);
  const [overtime, setOvertime] = useState([]); // overtime after 5:00 PM (pending + reviewed)
  // (time corrections and work arrangement are the HTE supervisor's — not on this page)
  const [records, setRecords] = useState([]);
  const [interns, setInterns] = useState([]);
  const [supervisors, setSupervisors] = useState([]);   // HTE supervisor accounts (for assigning)
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
    return liveRefresh(fetchAll);
  }, []);

  const fetchAll = async () => {
    try {
      const [p, m, r, u, ot] = await Promise.all([
        fetch(`${API}/supervisor/pending`).then((r) => r.json()),
        fetch(`${API}/coordinator/movs`).then((r) => r.json()),
        fetch(`${API}/admin/all-attendance`).then((r) => r.json()),
        fetch(`${API}/admin/users`).then((r) => r.json()),
        fetch(`${API}/coordinator/overtime`).then((r) => r.json()).catch(() => []),
      ]);
      if (Array.isArray(p)) setPending(p);
      if (Array.isArray(m)) setMovs([...m]);
      if (Array.isArray(r)) setRecords([...r]);
      if (Array.isArray(u)) {
        setInterns(u.filter((x) => x.role === "intern"));
        setSupervisors(u.filter((x) => x.role === "supervisor"));
      }
      if (Array.isArray(ot)) setOvertime(ot);
    } catch (err) {
      console.error("Poll error:", err);
    } finally {
      setLoading(false);
    }
  };

  const pendingMovs = movs.filter((m) => m.status === "pending").length;
  // what the coordinator can decide now: approved by the supervisor, or no supervisor assigned
  const pendingOt = overtime.filter(otForMe).length;
  const onlineForMe = pending.filter(fixForMe);      // confirmed by the supervisor, or no supervisor
  const onlineWaiting = pending.filter(fixWaiting);  // still with the supervisor

  // old address -> the new page + tab (keeps the "View all records" search, if any)
  useEffect(() => {
    if (path === "/coordinator/interns" && new URLSearchParams(search).get("tab") === "assign") {
      navigate("/coordinator/supervisors", { replace: true });
      return;
    }
    if (OLD_PATHS[path]) navigate(OLD_PATHS[path], { replace: true, state });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // which tab is open on a grouped page
  const group = GROUPS[path];
  const asked = new URLSearchParams(search).get("tab");
  const tab = group ? (group.tabs.find((t) => t.key === asked) || group.tabs[0]) : null;
  const pickTab = (key) => navigate(`${path}?tab=${key}`, { replace: true });
  const counts = { online: onlineForMe.length, movs: pendingMovs, overtime: pendingOt };

  return (
    <Shell navItems={navWithTabs(NAV, GROUPS, {}, { "/coordinator/approvals": counts })} user={user}>
      {/* same order as the admin dashboard so every page looks identical */}
      <style>{adminCss}</style>
      <style>{internCss}</style>
      <style>{formalLayout}</style>
      <style>{mdCss}</style>
      <style>{cardUnify}</style>
      <style>{adminMatch}</style>
      <style>{coordCss}</style>
      {path === "/coordinator" && (
        <Home
          user={user} pending={onlineForMe} pendingMovs={pendingMovs} pendingOt={pendingOt} records={records}
          interns={interns} loading={loading} go={navigate}
        />
      )}

      {group && (
        <GroupPage group={group} tab={tab} onPick={pickTab} counts={counts}>
          {/* Approvals */}
          {tab.key === "online" && <Pending pending={onlineForMe} waiting={onlineWaiting} interns={interns} user={user} onRefresh={fetchAll} />}
          {tab.key === "movs" && <MovReview movs={movs} user={user} interns={interns} onRefresh={fetchAll} />}
          {tab.key === "overtime" && <OvertimeReview overtime={overtime} onRefresh={fetchAll} />}
          {/* Interns */}
          {tab.key === "monitor" && (
            <InternMonitor
              interns={interns} records={records} loading={loading} onRefresh={fetchAll}
              recordsPath="/coordinator/interns?tab=records"
              canViewFiles   // only the coordinator can open the files interns upload
            />
          )}
          {tab.key === "records" && <Records records={records} loading={loading} />}
          {tab.key === "evaluation" && <Evaluations interns={interns} user={user} />}
          {/* Reports */}
          {tab.key === "dtr" && <DTR interns={interns} records={records} />}
          {tab.key === "quarterly" && <QuarterlyReport user={user} />}
        </GroupPage>
      )}

      {path === "/coordinator/nfc" && (
        <NfcCards
          user={user} interns={interns} onRefresh={fetchAll}
          // match by user id, or by email in case the request list has no user_id
          preOf={(r) => preStatusOf(movs.filter((m) =>
            (r.user_id != null && String(m.user_id) === String(r.user_id)) || (!!r.intern_email && m.intern_email === r.intern_email)))}
        />
      )}
      {path === "/coordinator/announcements" && <AnnouncementManager user={user} />}
      {path === "/coordinator/calendar" && <Calendar />}
      {path === "/coordinator/supervisors" && <AssignSupervisors interns={interns} supervisors={supervisors} records={records} online={pending} overtime={overtime} onRefresh={fetchAll} />}
      {path === "/coordinator/profile" && <AdminProfile user={user} />}
    </Shell>
  );
}

/* ───────────────────────── Page with tabs ─────────────────────────
   One title for the group, a row of tabs, then the open tab. Each tab's own title is hidden
   (the group title + the tab's description replace it), so the page has one header only. */
function GroupPage({ group, tab, onPick, counts, children }) {
  return (
    <>
      <PageHeader title={group.title} heading={tab.label} sub={tab.sub} live={group.live} tabs={(
      <div className="grp-tabs" role="tablist" aria-label={group.title}>
        {group.tabs.map((t) => {
          const n = counts[t.key];
          return (
            <button
              key={t.key} type="button" role="tab"
              aria-selected={t.key === tab.key}
              className={t.key === tab.key ? "grp-tab active" : "grp-tab"}
              onClick={() => onPick(t.key)}
            >
              <Icon name={t.icon} size={16} />
              <span>{t.label}</span>
              {n > 0 && <span className="grp-tab-n">{n > 99 ? "99+" : n}</span>}
            </button>
          );
        })}
      </div>
      )} />
      <div className="grp-body" role="tabpanel">{children}</div>
    </>
  );
}

/* ───────────────────────── Dashboard ───────────────────────── */
function Home({ user, pending, pendingMovs, pendingOt = 0, records, interns, loading, go }) {
  const today = todayManila();
  const todayRecs = records.filter((r) => r.date === today);
  const inNowAll = todayRecs.filter((r) => r.uid !== "ONLINE" && r.action === "CHECK_IN" && !r.checked_out_at);
  // one entry per person, in case someone has more than one open check-in
  const inNow = inNowAll.filter((r, i, a) => a.findIndex((x) => (x.user_id ?? x.name) === (r.user_id ?? r.name)) === i);
  const checkedIn = inNow.length;
  const seenToday = new Set(todayRecs.map((r) => r.user_id ?? r.name)).size;
  const toReview = pending.length + pendingMovs + pendingOt;
  const noSup = interns.filter((i) => !i.supervisor_id);
  const first = user.name?.split(" ")[0] || "there";
  const dateLabel = new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" });

  const review = [
    { key: "online", icon: "inbox", tone: "blue", title: "Online attendance", sub: "Remote workdays to approve", n: pending.length, to: "/coordinator/approvals?tab=online" },
    { key: "movs", icon: "folder", tone: "purple", title: "MOV submissions", sub: "Documents and certificates", n: pendingMovs, to: "/coordinator/approvals?tab=movs" },
    { key: "ot", icon: "clock", tone: "amber", title: "Overtime", sub: "Approved by the supervisor, your final say", n: pendingOt, to: "/coordinator/approvals?tab=overtime" },
  ];

  return (
    <DashLayout
      title={`${greeting()}, ${first}`}
      sub={dateLabel}
      status={{ text: checkedIn > 0 ? `${checkedIn} on the clock now` : "Nobody timed in yet", tone: checkedIn > 0 ? "live" : "" }}
      actions={[
        { icon: "users", label: "Interns", run: () => go("/coordinator/interns") },
        { icon: "file", label: "DTR", run: () => go("/coordinator/reports?tab=dtr") },
        { icon: "inbox", label: toReview > 0 ? `Approvals · ${toReview}` : "Approvals", run: () => go("/coordinator/approvals"), primary: true },
      ]}
      strip={[
        { icon: "users", tone: "t-orange", label: "Total interns", value: interns.length, sub: "under your watch" },
        { icon: "tap", tone: "t-green", label: "On duty now", value: checkedIn, sub: `${Math.max(interns.length - seenToday, 0)} not in yet` },
        { icon: "inbox", tone: "t-amber", label: "To review", value: toReview, sub: "online · MOV · overtime", onClick: () => go("/coordinator/approvals") },
        { icon: "list", tone: "t-blue", label: "Logged today", value: seenToday, sub: `${todayRecs.length} taps and logs` },
        { icon: "briefcase", tone: "t-purple", label: "No supervisor", value: noSup.length, sub: noSup.length ? "assign one" : "everyone has one", onClick: () => go("/coordinator/supervisors") },
      ]}
      left={(
        <>
        <Panel title="Needs your review" count={toReview} link="Open approvals" onLink={() => go("/coordinator/approvals")}>
          {review.map((r) => (
            <DashRow key={r.key} icon={r.icon} tone={r.tone} title={r.title} sub={r.sub}
              tag={r.n > 0 ? String(r.n) : "None"} tagTone={r.n > 0 ? "orange" : ""} onClick={() => go(r.to)} />
          ))}
          {noSup.length > 0 && (
            <DashRow icon="warn" tone="red" title={`${noSup.length} intern${noSup.length > 1 ? "s have" : " has"} no HTE supervisor`}
              sub="They can't send time corrections or WFH requests" tag="Assign" tagTone="red" onClick={() => go("/coordinator/supervisors")} />
          )}
        </Panel>
        {/* interns who need a follow-up */}
        <NeedsAttention interns={interns} records={records} monitorPath="/coordinator/interns" />
        </>
      )}
      right={<><HomeCalendar /><AnnouncementBoard limit={3} /></>}
    >
      <Panel title="Today's attendance" count={seenToday} link="Monitor" onLink={() => go("/coordinator/interns")} grow>
        {loading ? <Spinner /> : <TodayPeople records={todayRecs} limit={10} />}
      </Panel>
    </DashLayout>
  );
}

/* ───────────────────────── Assign HTE supervisors ─────────────────────────
   From the OJT coordinator: she assigns each intern's supervisor. Interns without one show first. */
function AssignSupervisors({ interns, supervisors, records = [], online = [], overtime = [], onRefresh }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [sel, setSel] = useState(null);             // "none" (interns without a supervisor) or a supervisor id
  const [open, setOpen] = useState(false);          // phones: the details replace the list
  const [moving, setMoving] = useState(null);       // intern id whose "Move" picker is open
  const [movePick, setMovePick] = useState("");
  const [adding, setAdding] = useState(false);
  const [addPick, setAddPick] = useState("");
  const today = todayManila();

  const noSup = interns.filter((i) => !i.supervisor_id);
  const sq = q.trim().toLowerCase();
  const countOf = (sid) => interns.filter((i) => String(i.supervisor_id) === String(sid)).length;

  // does the intern's placement match the supervisor's HTE? (ignores case, spaces and punctuation)
  const norm = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const sameHte = (intern, sup) => {
    const a = norm(intern?.placement), b = norm(sup?.placement);
    if (!a || !b) return null;                       // unknown: one of them has no HTE written
    return a === b || a.includes(b) || b.includes(a);
  };
  const supById = (sid) => supervisors.find((x) => String(x.id) === String(sid));
  const mismatchOf = (sid) => interns.filter((i) => String(i.supervisor_id) === String(sid) && sameHte(i, supById(sid)) === false).length;

  // live facts about an intern
  const recsOf = (id) => records.filter((r) => r.user_id === id);
  const onDuty = (id) => records.some((r) => r.user_id === id && r.date === today && r.uid !== "ONLINE" && r.action === "CHECK_IN" && !r.checked_out_at);
  const tappedToday = (id) => records.some((r) => r.user_id === id && r.date === today);
  // requests still waiting for this supervisor (online days + overtime)
  const waitingFor = (sid) => online.filter((o) => o.status === "pending" && String(o.supervisor_id) === String(sid)).length
    + overtime.filter((o) => o.ot_status === "pending" && String(o.supervisor_id) === String(sid)).length;

  const save = async (intern, picked) => {
    if (!intern) return;
    setBusy(intern.id); setMsg(null);
    try {
      const res = await fetch(`${API}/coordinator/interns/${intern.id}/supervisor`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ supervisor_id: picked ? Number(picked) : null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Something went wrong.");
      setMsg({ type: "success", text: data.message });
      setMoving(null); setMovePick(""); setAddPick(""); setAdding(false);
      onRefresh();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    } finally {
      setBusy(null);
    }
  };

  // supervisors for a picker: the intern's own HTE first (marked ✓)
  const supOptions = (i) => [...supervisors]
    .sort((a, b) => (sameHte(i, b) === true) - (sameHte(i, a) === true) || (a.name || "").localeCompare(b.name || ""))
    .map((x) => (
      <option key={x.id} value={String(x.id)}>
        {sameHte(i, x) === true ? "✓ " : ""}{x.name}{x.placement ? ` — ${x.placement}` : ""} ({countOf(x.id)})
      </option>
    ));

  // one intern: status, hours and a "Move" (or "Assign") link that opens a small picker under the row
  const internRow = (i, label = "Move") => {
    const hrs = calcHours(recsOf(i.id));
    const req = requiredHoursFor(i.program);
    const duty = onDuty(i.id);
    const diff = i.supervisor_id && sameHte(i, supById(i.supervisor_id)) === false;
    const isMoving = moving === i.id;
    return (
      <li key={i.id} className={isMoving ? "sv2-row moving" : "sv2-row"}>
        <div className="sv2-main">
          <Avatar name={i.name} photo={i.photo} size={36} />
          <span className="sv2-who"><b>{i.name}</b>
            <small>{[i.student_id, i.program, !i.supervisor_id || diff ? (i.placement || "No placement") : null].filter(Boolean).join(" · ")}</small></span>
          {diff && <span className="sv2-tag warn" title="The intern's placement is not this supervisor's HTE">Different HTE</span>}
          <span className={duty ? "sv2-tag in" : tappedToday(i.id) ? "sv2-tag done" : "sv2-tag out"}>{duty ? "On duty" : tappedToday(i.id) ? "Timed out" : "Not in yet"}</span>
          <span className="sv2-hrs"><b>{hrs}h</b> / {req}h</span>
          <button type="button" className="sv2-move" onClick={() => { setMoving(isMoving ? null : i.id); setMovePick(i.supervisor_id ? String(i.supervisor_id) : ""); }}>
            {isMoving ? "Cancel" : `${label} ›`}
          </button>
        </div>
        {isMoving && (
          <div className="sv2-pick">
            <span>{i.supervisor_id ? "Move to" : "Assign to"}</span>
            <select className="ix-select" value={movePick} onChange={(e) => setMovePick(e.target.value)} aria-label={`Supervisor of ${i.name}`}>
              <option value="">— No supervisor —</option>
              {supOptions(i)}
            </select>
            <button type="button" className="ix-b primary sm" disabled={busy !== null || movePick === (i.supervisor_id ? String(i.supervisor_id) : "")}
              onClick={() => save(i, movePick)}>{busy === i.id ? "Saving..." : "Save"}</button>
          </div>
        )}
      </li>
    );
  };

  const supsShown = supervisors.filter((x) => !sq || `${x.name} ${x.placement || ""} ${x.email}`.toLowerCase().includes(sq)
    || interns.some((i) => String(i.supervisor_id) === String(x.id) && `${i.name} ${i.student_id || ""}`.toLowerCase().includes(sq)));
  // nothing opens by itself: a click, or a search that leaves only one supervisor, opens the details
  const curKey = sel ?? (sq && supsShown.length === 1 ? String(supsShown[0].id) : null);
  const cur = curKey && curKey !== "none" ? supById(curKey) : null;
  const filt = (list) => list.filter((i) => !sq || `${i.name} ${i.email} ${i.student_id || ""} ${i.placement || ""}`.toLowerCase().includes(sq));
  const pick = (k) => { setSel(k); setOpen(true); setMoving(null); setAdding(false); setAddPick(""); };

  return (
    <>
      <PageHeader title="Supervisors" sub="HTE supervisors and their interns. Assign each intern's supervisor: they review the intern's requests and certify the DTR." live />
      <Msg msg={msg} />
      {supervisors.length === 0 && (
        <div className="ix-alert" style={{ marginBottom: 14 }}>
          <Icon name="warn" size={18} /> There are no supervisor accounts yet. Ask the admin to create them under Accounts.
        </div>
      )}
      <div className={open && curKey ? "oa sv2 oa-open" : "oa sv2"}>
        <style>{OA_CSS}</style>
        <style>{SV2_CSS}</style>
        {/* supervisors */}
        <div className="oa-list">
          <div className="oa-search sv2-search"><Icon name="search" size={14} />
            <input type="search" placeholder="Search supervisor, HTE or intern" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" /></div>
          <div className="oa-items" role="list">
            <button type="button" role="listitem" className={curKey === "none" ? "oa-item on sv2-none" : "oa-item sv2-none"} onClick={() => pick("none")}>
              <span className={noSup.length ? "sv2-warn-ic hot" : "sv2-warn-ic"}><Icon name={noSup.length ? "warn" : "check"} size={16} /></span>
              <span className="oa-who"><b>Without a supervisor</b><small>{noSup.length ? "Can't send corrections or WFH requests" : "Every intern has a supervisor"}</small></span>
              <span className={noSup.length ? "oa-n hot" : "oa-n"}>{noSup.length}</span>
            </button>
            {supsShown.map((x) => {
              const n = countOf(x.id); const bad = mismatchOf(x.id);
              return (
                <button key={x.id} type="button" role="listitem" className={curKey === String(x.id) ? "oa-item on" : "oa-item"} onClick={() => pick(String(x.id))}>
                  <Avatar name={x.name} photo={x.photo} size={34} />
                  <span className="oa-who"><b>{x.name}</b><small className={x.placement ? "" : "sv2-nohte"}>{x.placement || "HTE not set"}{bad ? ` · ${bad} different HTE` : ""}</small></span>
                  <span className="sv2-count">{n} intern{n === 1 ? "" : "s"}</span>
                </button>
              );
            })}
            {supsShown.length === 0 && supervisors.length > 0 && <div className="oa-none"><b>No match</b><small>Try another name or HTE.</small></div>}
          </div>
        </div>

        {/* details */}
        <div className="oa-detail sv2-detail">
          {!curKey ? (
            <div className="oa-blank">
              <span className="oa-none-ic"><Icon name="users" size={20} /></span>
              <b>Pick a supervisor</b>
              <small>Their interns show here, and you can add or move interns.</small>
            </div>
          ) : curKey === "none" ? (
            <>
              <button type="button" className="oa-back" onClick={() => setOpen(false)}><Icon name="menu" size={14} /> Back to the list</button>
              <div className="oa-head">
                <span className={noSup.length ? "sv2-warn-ic big hot" : "sv2-warn-ic big"}><Icon name={noSup.length ? "warn" : "check"} size={20} /></span>
                <div className="oa-hn"><b>Interns without a supervisor</b><small>Click Assign to pick one. Supervisors from the intern's own HTE are listed first (✓).</small></div>
                <span className={noSup.length ? "oa-n hot" : "oa-n"}>{noSup.length}</span>
              </div>
              {noSup.length === 0 ? <div className="oa-done ok"><Icon name="check" size={14} /><span>Every intern has a supervisor.</span></div>
                : <ul className="sv2-list">{filt(noSup).map((i) => internRow(i, "Assign"))}</ul>}
            </>
          ) : cur ? (() => {
            const mine = interns.filter((i) => String(i.supervisor_id) === String(cur.id));
            const others = interns.filter((i) => String(i.supervisor_id) !== String(cur.id))
              .sort((a, b) => (sameHte(b, cur) === true) - (sameHte(a, cur) === true) || (a.name || "").localeCompare(b.name || ""));
            const duty = mine.filter((i) => onDuty(i.id)).length;
            const waiting = waitingFor(cur.id);
            return (
              <>
                <button type="button" className="oa-back" onClick={() => setOpen(false)}><Icon name="menu" size={14} /> Back to the list</button>
                <div className="sv2-head">
                  <Avatar name={cur.name} photo={cur.photo} size={56} />
                  <div className="sv2-hn"><b>{cur.name}</b>
                    <small>{[cur.placement || "HTE not set", cur.student_id, cur.email, cur.contact_number].filter(Boolean).join(" · ")}</small></div>
                  <div className="sv2-stats">
                    <div><b>{mine.length}</b><small>intern{mine.length === 1 ? "" : "s"}</small></div>
                    <div className="in"><b>{duty}</b><small>on duty now</small></div>
                    <div className={waiting ? "wait" : ""}><b>{waiting}</b><small>waiting for them</small></div>
                  </div>
                </div>
                {!cur.placement && <div className="oa-done"><Icon name="warn" size={14} /><span>Ask the admin to add this supervisor's HTE in Accounts so interns can be matched.</span></div>}
                <div className="sv2-sec">
                  <div className="sv2-sec-h">
                    <h3>Interns under this supervisor</h3>
                    <button type="button" className="sv2-add" onClick={() => { setAdding((v) => !v); setAddPick(""); }}>{adding ? "Cancel" : "+ Add intern"}</button>
                  </div>
                  {adding && (
                    <div className="sv2-pick add">
                      <select className="ix-select" value={addPick} onChange={(e) => setAddPick(e.target.value)} aria-label="Intern to add">
                        <option value="">Choose an intern…</option>
                        {others.map((i) => (
                          <option key={i.id} value={String(i.id)}>
                            {sameHte(i, cur) === true ? "✓ " : ""}{i.name}{i.placement ? ` — ${i.placement}` : ""}{i.supervisor_id ? ` (now: ${supById(i.supervisor_id)?.name || "another"})` : " (no supervisor)"}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="ix-b primary sm" disabled={!addPick || busy !== null}
                        onClick={() => save(interns.find((i) => String(i.id) === addPick), String(cur.id))}>
                        {busy && String(busy) === addPick ? "Saving..." : "Assign"}
                      </button>
                    </div>
                  )}
                  {mine.length === 0 ? <p className="sv2-empty">No interns assigned yet. Click "+ Add intern" to assign one.</p>
                    : <ul className="sv2-list">{filt(mine).map((i) => internRow(i))}</ul>}
                </div>
              </>
            );
          })() : <div className="oa-blank"><b>Supervisor not found</b></div>}
        </div>
      </div>
    </>
  );
}

const SV2_CSS = `
.sv2-search { margin: 10px 10px 4px !important; }
.sv2-none { margin-bottom: 4px; }
.sv2-warn-ic { flex: none; width: 34px; height: 34px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: #e9f8ef; color: #16a34a; }
.sv2-warn-ic.hot { background: #fff4e5; color: #d97706; }
.sv2-warn-ic.big { width: 46px; height: 46px; }
.sv2-count { flex: none; font-size: 11.5px; font-weight: 700; color: #475569; background: #f1f5f9; padding: 3px 9px; border-radius: 7px; }
.sv2-nohte { color: #b45309 !important; }
.sv2-detail { gap: 16px !important; }
.sv2-head { display: flex; align-items: center; gap: 14px; flex: none; flex-wrap: wrap; }
.sv2-head .ix-av:has(img) { background: transparent !important; }
.sv2-hn { flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: 3px; line-height: 1.25; }
.sv2-hn b { font-size: 18px; color: #0f172a; }
.sv2-hn small { font-size: 12.5px; color: #64748b; }
.sv2-stats { display: flex; gap: 8px; }
.sv2-stats > div { min-width: 82px; text-align: center; padding: 9px 12px; border-radius: 12px; background: #fff4ee; display: flex; flex-direction: column; line-height: 1.15; }
.sv2-stats b { font-size: 21px; font-weight: 800; color: #ea580c; }
.sv2-stats small { font-size: 11.5px; font-weight: 600; color: #7c4a2e; margin-top: 2px; }
.sv2-stats > .in { background: #e9f8ef; } .sv2-stats > .in b { color: #15803d; } .sv2-stats > .in small { color: #166534; }
.sv2-stats > .wait { background: #fff4e5; } .sv2-stats > .wait b { color: #b45309; } .sv2-stats > .wait small { color: #92400e; }
.sv2-sec { border: 1px solid #eef0f4; border-radius: 14px; padding: 14px 16px; display: flex; flex-direction: column; min-height: 0; flex: 0 1 auto; overflow: hidden; }
.sv2-sec-h { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; flex: none; }
.sv2-sec-h h3 { margin: 0; font-size: 14.5px; font-weight: 800; color: #0f172a; }
.sv2-add { border: 0; background: none; padding: 0; font: inherit; font-size: 13px; font-weight: 700; color: #ea580c; cursor: pointer; }
.sv2-list { list-style: none; margin: 0; padding: 0; overflow-y: auto; min-height: 0; }
.oa-detail > .sv2-list { flex: 0 1 auto; }
.sv2-row { border-bottom: 1px solid #f1f2f5; }
.sv2-row:last-child { border-bottom: 0; }
.sv2-row.moving { background: #fffaf7; border-radius: 10px; }
.sv2-main { display: flex; align-items: center; gap: 12px; padding: 10px 6px; }
.sv2-main .ix-av:has(img) { background: transparent !important; }
.sv2-who { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.25; }
.sv2-who b { font-size: 13.5px; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sv2-who small { font-size: 12px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sv2-tag { flex: none; font-size: 11.5px; font-weight: 700; padding: 3px 9px; border-radius: 7px; }
.sv2-tag.in { background: #e9f8ef; color: #15803d; }
.sv2-tag.out { background: #fff4e5; color: #b45309; }
.sv2-tag.done { background: #eef2ff; color: #4338ca; }
.sv2-tag.warn { background: #fef2f2; color: #b91c1c; }
.sv2-hrs { flex: none; width: 104px; text-align: right; font-size: 12.5px; color: #64748b; }
.sv2-hrs b { color: #0f172a; }
.sv2-move { flex: none; border: 0; background: none; padding: 4px 2px; font: inherit; font-size: 12.5px; font-weight: 700; color: #64748b; cursor: pointer; min-width: 58px; text-align: right; }
.sv2-move:hover { color: #ea580c; }
.sv2-pick { display: flex; align-items: center; gap: 8px; padding: 0 6px 12px 54px; }
.sv2-pick span { font-size: 12.5px; font-weight: 600; color: #475569; flex: none; }
.sv2-pick .ix-select { flex: 1; min-width: 0; }
.sv2-pick.add { padding: 4px 0 10px; }
.sv2-empty { margin: 6px 0 2px; font-size: 13px; color: #94a3b8; }
@media (max-width: 1100px) { .sv2-hrs { display: none; } }
@media (max-width: 760px) {
  .sv2-stats { width: 100%; } .sv2-stats > div { flex: 1; min-width: 0; }
  .sv2-main { flex-wrap: wrap; } .sv2-pick { padding-left: 6px; flex-wrap: wrap; }
}
`;

/* ───────────────────────── shared bits for the review pages ───────────────────────── */
const fmtDate = (v) => {
  const d = new Date(v);
  return !v || isNaN(d) ? "—" : d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
};
const cap = (s = "") => s.charAt(0).toUpperCase() + s.slice(1);

function ReviewTabs({ tab, setTab, pendingCount, historyCount }) {
  // shown on the right side of the page's tab row (Online Attendance · MOV Submissions · Overtime)
  const [slot, setSlot] = useState(null);
  useEffect(() => { setSlot(document.getElementById("ix-tabtools")); }, []);
  const pills = (
    <div className="ix-pills">
      <button type="button" className={tab === "pending" ? "ix-pill active" : "ix-pill"} onClick={() => setTab("pending")}>
        Pending <span className="ix-pill-count">{pendingCount}</span>
      </button>
      <button type="button" className={tab === "history" ? "ix-pill active" : "ix-pill"} onClick={() => setTab("history")}>
        History <span className="ix-pill-count">{historyCount}</span>
      </button>
    </div>
  );
  return slot ? createPortal(pills, slot) : pills;
}

function HistoryToolbar({ q, setQ, status, setStatus, count, children }) {
  return (
    <div className="ix-toolbar">
      <div className="ix-search">
        <Icon name="search" size={16} />
        <input type="text" placeholder="Search intern..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <select className="ix-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
        <option value="all">All results</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
      </select>
      {children}
      <span className="ix-chip">{count} records</span>
    </div>
  );
}

/* ───────────────────────── Online attendance review ───────────────────────── */
// Optional: a route that returns every approved + rejected online submission.
// If it doesn't exist, the history is built from each intern's own list
// (/intern/my-online), which your API already has, so no backend change is needed.
const HISTORY_URL = `${API}/supervisor/history`;

function Pending({ pending, waiting = [], interns, user, onRefresh }) {
  const [msg, setMsg] = useState(null);
  const [history, setHistory] = useState([]);
  const [histState, setHistState] = useState("loading"); // loading | ok | error

  const reviewedOnly = (list) => list.filter((s) => s.status === "approved" || s.status === "rejected");
  const sortNewest = (list) =>
    [...list].sort((a, b) =>
      String(b.reviewed_at || b.updated_at || b.date).localeCompare(String(a.reviewed_at || a.updated_at || a.date)));

  const loadHistory = async () => {
    // 1) the dedicated route, if you have it
    try {
      const res = await fetch(HISTORY_URL, { headers: { Accept: "application/json" } });
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setHistory(sortNewest(reviewedOnly(data)));
        setHistState("ok");
        return;
      }
    } catch { /* fall through */ }

    // 2) otherwise collect it from every intern's own submissions
    try {
      const lists = await Promise.all(
        interns.map((u) =>
          fetch(`${API}/intern/my-online?user_id=${u.id}`, { headers: { Accept: "application/json" } })
            .then((r) => r.json())
            .then((d) => (Array.isArray(d)
              ? d.map((s) => ({ ...s, intern_name: u.name, intern_email: u.email, intern_photo: u.photo }))
              : []))
            .catch(() => [])
        )
      );
      setHistory(sortNewest(reviewedOnly(lists.flat())));
      setHistState("ok");
    } catch {
      setHistState("error");
    }
  };
  // reload when the intern list arrives or the pending queue changes (after approve / reject)
  useEffect(() => { loadHistory(); /* eslint-disable-next-line */ }, [interns.length, pending.length]);

  const handleValidate = async (sub, action, rm) => {
    setMsg(null);
    try {
      // the endpoint still calls the reviewer "supervisor_id"; it is the coordinator's id here
      const res = await fetch(`${API}/supervisor/validate`, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ submission_id: sub.id, supervisor_id: user.id, action, remarks: rm || "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Something went wrong.");
      setMsg({ type: "success", text: data.message });
      onRefresh();
      return true;
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
      return false;
    }
  };

  return (
    <>
      <PageHeader title="Online Attendance" sub="Review intern online attendance submissions." live />
      <Msg msg={msg} />
      {/* items still with the HTE supervisor are not shown: they come here only after the supervisor approves */}
      {histState === "error" && (
        <div className="ix-alert" style={{ marginBottom: 12 }}>
          <Icon name="warn" size={18} /> Couldn't load the reviewed days. Check that the server is running.
        </div>
      )}
      <OnlineReview role="coordinator" waiting={pending} reviewed={history} onReview={handleValidate} />
    </>
  );
}

/* ───────────────────────── MOV submissions review ───────────────────────── */
function MovReview({ movs, user, interns = [], onRefresh }) {
  const [processing, setProcessing] = useState(null);
  const [remarks, setRemarks] = useState({});
  const [msg, setMsg] = useState(null);
  const [fPhase, setFPhase] = useState("all");   // all | pre | post
  const [hStatus, setHStatus] = useState("all"); // history: all | approved | rejected
  const [q, setQ] = useState("");

  const reqLabel = (m) => {
    if (m.report_id && m.report_title) return `Report · ${m.report_title}`;
    if (!m.requirement || m.requirement === "others") return "Others";
    const hit = [...PRE_REQUIREMENTS, ...DURING_REQUIREMENTS, ...POST_REQUIREMENTS].find((r) => r.key === m.requirement);
    return hit ? hit.label : m.requirement;
  };
  const phaseOf = (m) => (["pre", "during", "post"].includes(m.phase) ? m.phase : "pre");
  const phaseBadge = (m) => {
    const ph = phaseOf(m);
    return <Badge label={ph === "post" ? "Post" : ph === "during" ? "During" : "Pre"} type={ph === "post" ? "online" : ph === "during" ? "pending" : "onsite"} />;
  };
  const [showDue, setShowDue] = useState(false);
  const phaseOk = (m) => fPhase === "all" || phaseOf(m) === fPhase;

  const pendingAll = movs.filter((m) => m.status === "pending");
  const pendingList = pendingAll.filter(phaseOk);
  const historyAll = movs.filter((m) => m.status !== "pending");
  const historyList = historyAll
    .filter(phaseOk)
    .filter((m) => hStatus === "all" || m.status === hStatus)
    .filter((m) => (m.intern_name || "").toLowerCase().includes(q.trim().toLowerCase()));

  const handleReview = async (id, status) => {
    setProcessing(id + status); setMsg(null);
    try {
      const res = await fetch(`${API}/coordinator/movs/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, remarks: remarks[id] || "", reviewer_id: user.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setMsg({ type: "success", text: data.message });
      onRefresh();
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    } finally {
      setProcessing(null);
    }
  };

  // take back an approval / rejection made by mistake (asks once before doing it)
  const [undoAsk, setUndoAsk] = useState(null);
  const handleUndo = async (m) => {
    setProcessing(m.id + "undo"); setMsg(null);
    try {
      const res = await fetch(`${API}/coordinator/movs/${m.id}/undo`, { method: "POST", headers: { Accept: "application/json" } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Could not undo the review.");
      setMsg({ type: "success", text: data.message });
      setUndoAsk(null);
      onRefresh();
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    } finally {
      setProcessing(null);
    }
  };
  const undoCell = (m) => undoAsk === m.id ? (
    <span className="ix-actions" style={{ flexWrap: "nowrap" }}>
      <button type="button" className="ix-b danger sm" onClick={() => handleUndo(m)} disabled={!!processing}>
        {processing === m.id + "undo" ? "..." : "Yes, undo"}</button>
      <button type="button" className="ix-b ghost sm" onClick={() => setUndoAsk(null)} disabled={!!processing}>No</button>
    </span>
  ) : (
    <button type="button" className="ix-b ghost sm" title={`Take back this ${m.status === "approved" ? "approval" : "rejection"}`} onClick={() => setUndoAsk(m.id)}>
      Undo
    </button>
  );

  const fileLink = (m) => (
    <a className="ix-link rv-file" href={`${STORAGE}${m.file_path}`} target="_blank" rel="noopener noreferrer" title={m.original_name}>
      <Icon name="clip" size={13} /> {m.original_name}
    </a>
  );

  const phaseSelect = (
    <select className="ix-select" value={fPhase} onChange={(e) => setFPhase(e.target.value)} aria-label="Filter by phase">
      <option value="all">All phases</option>
      <option value="pre">Pre-internship</option>
      <option value="during">During internship</option>
      <option value="post">Post-internship</option>
    </select>
  );

  return (
    <>
      <PageHeader title="MOV Submissions" sub="Review intern-submitted documents (MOVs, forms, certificates)." live />
      <div className="dl-bar">
        <span><Icon name="calendar" size={16} /> Set due dates, ask for reports, and remind interns who haven't submitted.</span>
        {showDue ? (
          <button type="button" className="ix-b ghost sm" onClick={() => setShowDue(false)}>← Back to MOV submissions</button>
        ) : (
          <span style={{ display: "inline-flex", gap: 8 }}>
            <button type="button" className="ix-b ghost sm" onClick={() => setShowDue("reports")}>
              <Icon name="file" size={14} /> Weekly / monthly reports
            </button>
            <button type="button" className="ix-b primary sm" onClick={() => setShowDue("due")}>
              <Icon name="calendar" size={14} /> Due dates &amp; reminders
            </button>
          </span>
        )}
      </div>
      {showDue === "due" && <DeadlinesPanel onClose={() => setShowDue(false)} />}
      {showDue === "reports" && <ReportsPanel interns={interns} onClose={() => setShowDue(false)} />}
      {!showDue && <>
        <Msg msg={msg} />
        <MovBoard movs={movs} interns={interns} reqLabel={reqLabel} remarks={remarks} setRemarks={setRemarks}
          processing={processing} onReview={handleReview} undoCell={undoCell} />
      </>}
    </>
  );
}

/* MOV review: interns on the left (waiting first), the picked intern's requirement checklist in the
   middle, and the picked document's preview on the right with Approve / Reject. */
const MV_PHASES = [["pre", "Pre", PRE_REQUIREMENTS], ["during", "During", DURING_REQUIREMENTS], ["post", "Post", POST_REQUIREMENTS]];
const MV_TOTAL = MV_PHASES.reduce((n, [, , l]) => n + l.length, 0);
const mvTime = (m) => String(m.created_at || "");
const mvExt = (m) => String(m.original_name || m.file_path || "").split(".").pop().toLowerCase();
const MV_CHIP = { approved: ["Approved", "ok"], pending: ["Waiting", "wait"], rejected: ["Rejected", "bad"], missing: ["Missing", "miss"] };

function MovBoard({ movs, interns, reqLabel, remarks, setRemarks, processing, onReview, undoCell }) {
  // opens on "Waiting" when something waits, otherwise on "All interns"
  const [view, setView] = useState(() => (movs.some((m) => m.status === "pending") ? "waiting" : "all"));
  const [picked, setPicked] = useState(false);      // the coordinator chose a view themselves
  const anyWaiting = movs.some((m) => m.status === "pending");
  useEffect(() => { if (!picked) setView(anyWaiting ? "waiting" : "all"); }, [anyWaiting, picked]);
  const [q, setQ] = useState("");
  const [who, setWho] = useState(null);
  const [docId, setDocId] = useState(null);
  const [phase, setPhase] = useState("all");
  const [open, setOpen] = useState(false);         // phones: details replace the list

  // every intern with their documents (also interns who sent documents but are not in the list)
  const people = (() => {
    const map = new Map();
    interns.forEach((u) => map.set(u.id, { id: u.id, name: u.name, photo: u.photo, docs: [] }));
    movs.forEach((m) => {
      if (!map.has(m.user_id)) map.set(m.user_id, { id: m.user_id, name: m.intern_name, photo: m.intern_photo, docs: [] });
      map.get(m.user_id).docs.push(m);
    });
    return [...map.values()].map((p) => {
      const latest = {};
      [...p.docs].sort((a, b) => mvTime(a).localeCompare(mvTime(b))).forEach((m) => { if (m.requirement) latest[m.requirement] = m; });
      const done = MV_PHASES.reduce((n, [, , l]) => n + l.filter((r) => latest[r.key]?.status === "approved").length, 0);
      const waiting = p.docs.filter((m) => m.status === "pending");
      const oldest = waiting.map(mvTime).sort()[0] || "";
      return { ...p, latest, done, waiting, oldest };
    });
  })();
  const sq = q.trim().toLowerCase();
  const shown = people
    .filter((p) => view === "all" || p.waiting.length)
    .filter((p) => !sq || String(p.name || "").toLowerCase().includes(sq))
    .sort((a, b) => view === "waiting" ? a.oldest.localeCompare(b.oldest) : String(a.name).localeCompare(String(b.name)));
  const waitingPeople = people.filter((p) => p.waiting.length).length;
  const cur = shown.find((p) => p.id === who) || null;   // nothing opens until you pick an intern

  // the checklist rows of the picked intern
  const rows = [];
  if (cur) {
    MV_PHASES.forEach(([key, label, list]) => {
      if (phase !== "all" && phase !== key) return;
      rows.push({ head: key === "pre" ? "Pre-internship" : key === "during" ? "During internship" : "Post-internship" });
      list.forEach((r) => {
        if (r.repeat) {
          const subs = cur.docs.filter((m) => m.requirement === r.key || (m.report_id && !m.requirement)).sort((a, b) => mvTime(b).localeCompare(mvTime(a)));
          const ok = subs.filter((m) => m.status === "approved").length;
          rows.push({ key: r.key, label: r.label, st: subs.some((m) => m.status === "pending") ? "pending" : subs.length ? (ok ? "approved" : subs[0].status) : "missing",
            note: subs.length ? `${ok} approved${subs.length > ok ? ` · ${subs.length - ok} other` : ""}` : "", doc: subs.find((m) => m.status === "pending") || subs[0] });
          subs.forEach((m) => rows.push({ key: "s" + m.id, label: m.report_title || m.title || "Report", note: fmtDate(m.created_at), st: m.status, doc: m, sub: true }));
        } else {
          const m = cur.latest[r.key];
          rows.push({ key: r.key, label: r.label, st: m ? m.status : "missing", doc: m });
        }
      });
    });
    const others = cur.docs.filter((m) => !m.report_id && (!m.requirement || m.requirement === "others"));
    if (others.length && (phase === "all")) {
      rows.push({ head: "Other documents" });
      others.forEach((m) => rows.push({ key: "o" + m.id, label: m.title || "Document", st: m.status, doc: m }));
    }
  }
  const docs = cur ? cur.docs : [];
  const doc = docs.find((m) => m.id === docId) || cur?.waiting.slice().sort((a, b) => mvTime(a).localeCompare(mvTime(b)))[0] || null;
  const pickWho = (id) => { setWho(id); setDocId(null); setOpen(true); };
  const fileUrl = doc ? `${STORAGE}${doc.file_path}` : "";

  const ext = doc ? mvExt(doc) : "";

  return (
    <div className={`mv2${open && cur ? " mv2-open" : ""}${!cur ? " mv2-empty" : ""}`}>
      <style>{OA_CSS}</style>
      <style>{MV2_CSS}</style>
      {/* interns */}
      <div className="mv2-list">
        <div className="oa-switch" role="tablist" aria-label="Show">
          <button type="button" role="tab" aria-selected={view === "waiting"} className={view === "waiting" ? "on" : ""} onClick={() => { setPicked(true); setView("waiting"); setWho(null); setDocId(null); }}>
            Waiting <span className={waitingPeople ? "oa-n hot" : "oa-n"}>{waitingPeople}</span>
          </button>
          <button type="button" role="tab" aria-selected={view === "all"} className={view === "all" ? "on" : ""} onClick={() => { setPicked(true); setView("all"); setWho(null); setDocId(null); }}>
            All interns <span className="oa-n">{people.length}</span>
          </button>
        </div>
        <div className="oa-search">
          <Icon name="search" size={14} />
          <input type="search" placeholder="Search intern" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search intern" />
        </div>
        <div className="mv2-people" role="list">
          {shown.length === 0 ? (
            <div className="oa-none">
              <span className="oa-none-ic"><Icon name="check" size={18} /></span>
              <b>{sq ? "No match" : view === "waiting" ? "All caught up" : "No interns yet"}</b>
              <small>{sq ? "Try another name." : view === "waiting" ? "No documents waiting for review." : "Interns show here once added."}</small>
            </div>
          ) : shown.map((p) => (
            <button key={p.id} type="button" role="listitem" className={cur && cur.id === p.id ? "oa-item on" : "oa-item"} onClick={() => pickWho(p.id)}>
              <Avatar name={p.name} photo={p.photo} size={34} />
              <span className="oa-who"><b>{p.name}</b>
                <small className="mv2-mini"><i style={{ width: `${Math.round((p.done / MV_TOTAL) * 100)}%` }} /></small>
                <small>{p.done} of {MV_TOTAL} approved</small></span>
              {p.waiting.length > 0 ? <span className="oa-n hot">{p.waiting.length}</span> : p.done === MV_TOTAL ? <Badge label="Complete" type="approved" /> : null}
            </button>
          ))}
        </div>
      </div>

      {/* checklist + preview */}
      <div className="mv2-main">
        {!cur ? (
          <div className="oa-blank">
            <span className="oa-none-ic"><Icon name="users" size={20} /></span>
            <b>{shown.length ? "Pick an intern" : view === "waiting" ? "No documents waiting" : "No interns yet"}</b>
            <small>{shown.length ? "Choose an intern on the left to see their requirements and documents."
              : view === "waiting" ? "Open \"All interns\" to see each intern's requirements." : "Interns show here once added."}</small>
          </div>
        ) : (
          <>
            <button type="button" className="oa-back" onClick={() => setOpen(false)}><Icon name="menu" size={14} /> Back to the list</button>
            <div className="mv2-head">
              <Avatar name={cur.name} photo={cur.photo} size={42} />
              <div className="mv2-hn"><b>{cur.name}</b>
                <span className="mv2-bar"><i style={{ width: `${Math.round((cur.done / MV_TOTAL) * 100)}%` }} /></span>
                <small>{cur.done} of {MV_TOTAL} requirements approved{cur.waiting.length ? ` · ${cur.waiting.length} waiting for you` : ""}</small></div>
              <div className="mv2-ph" role="tablist" aria-label="Phase">
                {[["all", "All"], ["pre", "Pre"], ["during", "During"], ["post", "Post"]].map(([k, l]) => (
                  <button key={k} type="button" className={phase === k ? "on" : ""} onClick={() => setPhase(k)}>{l}</button>
                ))}
              </div>
            </div>
            <div className="mv2-body">
              <div className="mv2-check">
                {rows.map((r, i) => r.head ? <div key={"h" + i} className="mv2-sec">{r.head}</div> : (
                  <button key={r.key} type="button" disabled={!r.doc}
                    className={`mv2-row${r.sub ? " sub" : ""}${doc && r.doc && r.doc.id === doc.id && !(!r.sub && rows.some((x) => x.sub && x.doc?.id === doc.id)) ? " on" : ""}`}
                    onClick={() => r.doc && setDocId(r.doc.id)}>
                    <span className={`mv2-chip ${MV_CHIP[r.st]?.[1] || "miss"}`}>{MV_CHIP[r.st]?.[0] || r.st}</span>
                    <span className="mv2-lbl">{r.label}{r.note ? <small>{r.note}</small> : null}</span>
                  </button>
                ))}
              </div>
              <div className="mv2-prev">
                {!doc ? (
                  <div className="oa-blank">
                    <span className="oa-none-ic"><Icon name="file" size={20} /></span>
                    <b>Pick a document</b>
                    <small>Click a sent requirement on the left to see it here.</small>
                  </div>
                ) : (
                  <>
                    <div className="mv2-doc">
                      {ext === "pdf" ? <iframe key={doc.id} title={doc.original_name || "Document"} src={`${fileUrl}#toolbar=0&navpanes=0&view=FitH`} scrolling="no" />
                        : ["png", "jpg", "jpeg", "gif", "webp"].includes(ext) ? <img src={fileUrl} alt={doc.original_name || "Document"} />
                        : <div className="mv2-nofile"><Icon name="file" size={26} /><b>{doc.original_name || "File"}</b><small>This file type can't be shown here.</small></div>}
                    </div>
                    <div className="mv2-info">
                      <div className="mv2-it"><b>{reqLabel(doc) === "Others" ? doc.title : reqLabel(doc)}</b>
                        <small>{doc.title && reqLabel(doc) !== "Others" && doc.title.trim().toLowerCase() !== reqLabel(doc).toLowerCase() ? `${doc.title} · ` : ""}Sent {fmtDate(doc.created_at)}</small></div>
                      <a className="ix-b ghost sm mv2-open" href={fileUrl} target="_blank" rel="noopener noreferrer"><Icon name="eye" size={13} /> Open</a>
                    </div>
                    {doc.status === "pending" ? (
                      <div className="oa-act">
                        <input type="text" className="ix-input" placeholder="Remarks (optional)" value={remarks[doc.id] || ""}
                          onChange={(e) => setRemarks((r) => ({ ...r, [doc.id]: e.target.value }))} />
                        <button className="ix-b danger" onClick={() => onReview(doc.id, "rejected")} disabled={!!processing}>
                          {processing === doc.id + "rejected" ? "..." : "Reject"}</button>
                        <button className="ix-b ok" onClick={() => onReview(doc.id, "approved")} disabled={!!processing}>
                          {processing === doc.id + "approved" ? "..." : "Approve"}</button>
                      </div>
                    ) : (
                      <div className={doc.status === "rejected" ? "oa-done bad" : "oa-done ok"}>
                        <Icon name={doc.status === "rejected" ? "x" : "check"} size={14} />
                        <span>{doc.status === "rejected" ? "Rejected" : "Approved"}{doc.reviewed_at ? ` · ${fmtDate(doc.reviewed_at)}` : ""}{doc.remarks ? <> · <em>{doc.remarks}</em></> : null}</span>
                        <span style={{ marginLeft: "auto" }}>{undoCell(doc)}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const MV2_CSS = `
.ix-page.lay2 .ix-main:has(.mv2) > .ix-content { align-self: stretch; width: 100%; box-sizing: border-box; }
/* nothing picked yet: both boxes fill the window, same height */
.ix-page.lay2 .ix-main:has(.mv2.mv2-empty) { display: flex !important; flex-direction: column !important; }
.ix-page.lay2 .ix-main:has(.mv2.mv2-empty) > .ix-content { flex: 1 1 auto !important; display: flex !important; flex-direction: column !important; }
.ix-page.lay2 .ix-main:has(.mv2.mv2-empty) > .ix-content > * { flex: none; }
.ix-page.lay2 .ix-main:has(.mv2.mv2-empty) .grp-body { flex: 1 1 auto !important; display: flex; flex-direction: column; }
.ix-page.lay2 .ix-main:has(.mv2.mv2-empty) .grp-body > * { flex: none; }
.ix-page.lay2 .ix-main:has(.mv2.mv2-empty) .grp-body > .mv2 { flex: 1 1 auto; min-height: 380px; }
.mv2.mv2-empty { align-items: stretch; }
.mv2.mv2-empty .mv2-list { position: static; max-height: none; }
.mv2.mv2-empty .mv2-main > .oa-blank { min-height: 0; }
.mv2 { display: grid; grid-template-columns: minmax(240px, 290px) minmax(0, 1fr); gap: 16px; align-items: start; }
.mv2-list, .mv2-main { background: #fff; border: 1px solid #e8ebf0; border-radius: 14px; display: flex; flex-direction: column; }
.mv2-list { position: sticky; top: 12px; max-height: calc(100vh - 150px); min-height: 300px; overflow: hidden; }
.mv2-people { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 6px; }
.mv2-mini { display: block; height: 4px; border-radius: 2px; background: #eef0f4; margin: 5px 0 1px; overflow: hidden; max-width: 140px; }
.mv2-mini i, .mv2-bar i { display: block; height: 100%; background: #ea580c; border-radius: inherit; }
.mv2-main { padding: 16px 18px; gap: 12px; min-height: 300px; }
.mv2-head { display: flex; align-items: center; gap: 12px; flex: none; flex-wrap: wrap; }
.mv2-hn { flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 5px; line-height: 1.2; }
.mv2-hn b { font-size: 16px; color: #0f172a; }
.mv2-hn small { font-size: 12.5px; color: #64748b; }
.mv2-bar { display: block; height: 6px; border-radius: 3px; background: #eef0f4; overflow: hidden; max-width: 360px; }
.mv2-ph { display: inline-flex; gap: 2px; padding: 3px; background: #f3f4f6; border-radius: 9px; }
.mv2-ph button { border: 0; background: transparent; font: inherit; font-size: 12.5px; font-weight: 600; color: #64748b; padding: 5px 11px; border-radius: 7px; cursor: pointer; }
.mv2-ph button.on { background: #fff; color: #c2410c; box-shadow: 0 1px 2px rgba(15,23,42,.08); }
.mv2-body { display: grid; grid-template-columns: minmax(270px, 380px) minmax(0, 1fr); gap: 14px; align-items: start; }
.mv2-check { border: 1px solid #eef0f4; border-radius: 12px; padding: 4px 6px 8px; }
.mv2-sec { font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #94a3b8; padding: 10px 6px 4px; }
.mv2-row { width: 100%; display: flex; align-items: center; gap: 9px; padding: 7px 8px; border: 0; border-radius: 8px; background: transparent; font: inherit; text-align: left; cursor: pointer; line-height: 1.25; }
.mv2-row:hover:not(:disabled) { background: #f8f9fb; }
.mv2-row:disabled { cursor: default; }
.mv2-row.on { background: #fff4ee; box-shadow: inset 3px 0 0 #ea580c; }
.mv2-row.sub { padding-left: 22px; }
.mv2-row.sub .mv2-lbl { font-size: 12.5px; color: #475569; }
.mv2-lbl { flex: 1; min-width: 0; font-size: 13px; color: #0f172a; display: flex; flex-direction: column; }
.mv2-lbl small { font-size: 11.5px; color: #64748b; margin-top: 2px; }
.mv2-chip { flex: none; width: 66px; text-align: center; font-size: 11px; font-weight: 700; padding: 3px 0; border-radius: 6px; }
.mv2-chip.ok { background: #e9f8ef; color: #15803d; }
.mv2-chip.wait { background: #fff4e5; color: #b45309; }
.mv2-chip.bad { background: #fef2f2; color: #b91c1c; }
.mv2-chip.miss { background: #f3f4f6; color: #94a3b8; }
/* the preview stays in view while the checklist scrolls with the page */
.mv2-prev { position: sticky; top: 12px; height: min(calc(100vh - 160px), 760px); min-height: 380px; display: flex; flex-direction: column; gap: 10px; }
.mv2-doc { flex: 1 1 auto; min-height: 180px; min-width: 0; border: 1px solid #eef0f4; border-radius: 12px; overflow: hidden; background: #f6f7f9; display: flex; position: relative; }
/* the PDF fills the box at page width: no sideways scrolling, no toolbar */
.mv2-doc iframe { position: absolute; inset: 0; display: block; width: 100%; height: 100%; min-width: 0; max-width: 100%; border: 0; background: #fff; overflow: hidden; }
.mv2-doc img { margin: auto; max-width: 100%; max-height: 100%; object-fit: contain; }
.mv2-nofile { margin: auto; display: flex; flex-direction: column; align-items: center; gap: 6px; color: #64748b; text-align: center; padding: 20px; }
.mv2-nofile b { color: #0f172a; font-size: 13.5px; word-break: break-all; }
.mv2-nofile small { font-size: 12.5px; }
.mv2-info { display: flex; align-items: center; gap: 10px; flex: none; }
.mv2-it { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.25; }
.mv2-it b { font-size: 14px; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mv2-it small { font-size: 12px; color: #64748b; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mv2-prev .oa-act { padding-top: 0; border-top: 0; }
.ix-page a.mv2-open, .ix-page a.mv2-open:hover { text-decoration: none !important; display: inline-flex; align-items: center; gap: 6px; flex: none; }
.mv2-prev .oa-done { align-items: center; }
.mv2-main > .oa-blank { flex: 1; min-height: 360px; }
@media (max-width: 1250px) {
  .mv2-body { grid-template-columns: 1fr; }
  .mv2-prev { position: static; height: 520px; order: -1; }
}
@media (max-width: 760px) {
  .ix-main:has(.mv2) .dl-bar, .ix-main:has(.mv2) .dl-bar > span { flex-wrap: wrap; }
  .mv2 { grid-template-columns: 1fr; }
  .mv2-list { position: static; max-height: none; }
  .mv2 .mv2-main { display: none; }
  .mv2.mv2-open .mv2-list { display: none; }
  .mv2.mv2-open .mv2-main { display: flex; }
  .mv2-people { max-height: none; }
  .mv2-body { display: flex; flex-direction: column; }
  .mv2-prev { height: 440px; }
  .mv2-prev .oa-act { flex-wrap: wrap; } .mv2-prev .oa-act .ix-input { flex: 1 1 100%; }
}
`;

/* ───────────────────────── Overtime review ─────────────────────────
   Time after 5:00 PM counts only when approved. The coordinator can credit all or part of it.
   Official hours give at most SCHEDULE.dailyCap hours a day; approved overtime is added on top. */
const clock = (v) => (v ? new Date(v).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }) : "—");

/* Two steps: the intern's HTE supervisor reviews first ("endorsed" = approved by the supervisor),
   then the coordinator decides. An intern with no supervisor assigned comes straight here. */
const otForMe = (o) => o.ot_status === "endorsed" || (o.ot_status === "pending" && !o.supervisor_id);
const otWaiting = (o) => o.ot_status === "pending" && !!o.supervisor_id;
const fixForMe = (c) => c.status === "endorsed" || (c.status === "pending" && !c.supervisor_id);
const fixWaiting = (c) => c.status === "pending" && !!c.supervisor_id;

// "Waiting for the supervisor" list under a review page
function WaitingList({ items, what }) {
  if (!items.length) return null;
  return (
    <div className="ix-card rv-waiting">
      <div className="rv-waiting-head">
        <Icon name="clock" size={16} /> Waiting for the supervisor ({items.length})
      </div>
      <ul>
        {items.map((x) => (
          <li key={x.id}>
            <strong>{x.intern_name}</strong> · {String(x.date).slice(0, 10)} · {what(x)}
            <span> — {x.supervisor_name || "supervisor"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OvertimeReview({ overtime, onRefresh }) {
  const [msg, setMsg] = useState(null);
  const pendingList = overtime.filter(otForMe);
  const historyAll = overtime.filter((o) => o.ot_status === "approved" || o.ot_status === "rejected");
  const capOf = (o) => (o.ot_status === "endorsed" && o.ot_endorsed_minutes ? o.ot_endorsed_minutes : o.ot_minutes);

  const review = async (o, status, credit, rm) => {
    const cap = capOf(o);
    if (status === "approved" && (!credit || credit < 1 || credit > cap)) {
      setMsg({ type: "error", text: `Credit between 1 and ${cap} minutes.` });
      return false;
    }
    setMsg(null);
    try {
      const res = await fetch(`${API}/coordinator/overtime/${o.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ status, minutes: status === "approved" ? credit : null, remarks: rm || "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Something went wrong.");
      setMsg({ type: "success", text: data.message });
      onRefresh();
      return true;
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
      return false;
    }
  };

  return (
    <>
      <PageHeader title="Overtime" sub="Time after 5:00 PM only counts when you approve it." live />
      <Msg msg={msg} />
      <OvertimeBoard role="coordinator" waiting={pendingList} reviewed={historyAll} all={overtime} capOf={capOf} onReview={review} />
    </>
  );
}


/* ───────────────────────── Requirement due dates + reminders ─────────────────────────
   The coordinator sets a due date per requirement. Interns see "Due …" / "Overdue" on Submit MOV and get a
   notice when a requirement is due within 3 days. "Remind" sends a notification to everyone who hasn't
   submitted it (post-internship: only interns who already finished their hours). */
// Shown on the page (not a pop-up), in place of the MOV list
function DeadlinesPanel({ onClose }) {
  const [dates, setDates] = useState({});      // "pre:moa" -> "2026-11-05"
  const [missing, setMissing] = useState({});  // "pre:moa" -> 3
  const [loading, setLoading] = useState(true);
  const [counting, setCounting] = useState(true);  // "missing" numbers come in a moment after the dates
  const [phase, setPhase] = useState("pre");      // which tab is open
  const [q, setQ] = useState("");                  // search
  const [openId, setOpenId] = useState(null);      // requirement whose "who is missing" list is open
  const [who, setWho] = useState({});              // "pre:moa" -> [interns] (loaded when opened)
  const [whoQ, setWhoQ] = useState("");            // search inside the open list (for long lists)
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  // the weekly / monthly report is not here: the coordinator asks for each report under "Reports"
  const all = Object.entries(REQUIREMENTS_BY_PHASE).flatMap(([phase, list]) => list.filter((r) => !r.repeat).map((r) => ({ ...r, phase, id: `${phase}:${r.key}` })));

  const load = () => {
    // the list shows as soon as the dates arrive; the "missing" counts fill in when ready
    fetch(`${API}/requirement-deadlines`, { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setDates(Object.fromEntries(d.map((x) => [`${x.phase}:${x.requirement}`, String(x.due_date).slice(0, 10)]))); })
      .catch(() => setMsg({ type: "error", text: "Couldn't load the due dates." }))
      .finally(() => setLoading(false));
    fetch(`${API}/coordinator/requirement-deadlines/missing?${all.map((r) => "keys[]=" + encodeURIComponent(r.id)).join("&")}`,
      { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((m) => { if (m && typeof m === "object" && !Array.isArray(m)) setMissing(m); })
      .catch(() => {})
      .finally(() => setCounting(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const call = async (method, url, body, key) => {
    setBusy(key); setMsg(null);
    try {
      const res = await fetch(`${API}${url}`, {
        method, headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Something went wrong.");
      setMsg({ type: "success", text: data.message });
      return true;
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
      return false;
    } finally { setBusy(null); }
  };

  const save = () => call("PUT", "/coordinator/requirement-deadlines", {
    deadlines: all.map((r) => ({ requirement: r.key, phase: r.phase, due_date: dates[r.id] || null })),
  }, "save");
  const remind = (r, userIds) => call("POST", "/coordinator/requirement-deadlines/remind",
    { requirement: r.key, phase: r.phase, label: r.label, ...(userIds ? { user_ids: userIds } : {}) },
    userIds ? `${r.id}#${userIds[0]}` : r.id);
  // show / hide the interns who still haven't submitted this requirement
  const toggleWho = (r) => {
    if (openId === r.id) { setOpenId(null); return; }
    setOpenId(r.id);
    setWhoQ("");
    if (who[r.id]) return;
    fetch(`${API}/coordinator/requirement-deadlines/missing-list?phase=${r.phase}&requirement=${encodeURIComponent(r.key)}`,
      { headers: { Accept: "application/json" } })
      .then((x) => x.json())
      .then((list) => setWho((w) => ({ ...w, [r.id]: Array.isArray(list) ? list : [] })))
      .catch(() => setWho((w) => ({ ...w, [r.id]: [] })));
  };

  // one phase at a time (tabs) + search, so the list is short and easy to scan
  const shownAll = all.filter((r) => r.phase === phase);
  const sq = q.trim().toLowerCase();
  const shown = shownAll.filter((r) => !sq || r.label.toLowerCase().includes(sq));
  const missingIn = (ph) => all.filter((r) => r.phase === ph && missing[r.id]).length;
  const dueChip = (id) => {
    const v = dates[id];
    if (!v) return <span className="dl-chip none">No due date</span>;
    const days = Math.round((new Date(v + "T00:00:00") - new Date(new Date().toDateString())) / 86400000);
    if (days < 0) return <span className="dl-chip over">Overdue {Math.abs(days)}d</span>;
    if (days === 0) return <span className="dl-chip soon">Due today</span>;
    if (days <= 3) return <span className="dl-chip soon">In {days} day{days > 1 ? "s" : ""}</span>;
    return <span className="dl-chip ok">In {days} days</span>;
  };

  return (
    <div className="ix-card dl-panel">
      <div className="dl-head">
        <div>
          <h3>Due dates &amp; reminders</h3>
          <p>Leave a date blank for no due date. Weekly / monthly reports are set under Reports.</p>
        </div>
        <div className="ix-search dl-search">
          <Icon name="search" size={16} />
          <input type="text" placeholder="Search requirement..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="dl-tabs" role="tablist">
        {["pre", "during", "post"].map((ph) => (
          <button key={ph} type="button" role="tab" aria-selected={phase === ph}
            className={phase === ph ? "dl-tab on" : "dl-tab"} onClick={() => setPhase(ph)}>
            {PHASE_LABEL[ph]}
            {missingIn(ph) > 0 && <span className="dl-tab-n" title="requirements with interns missing">{missingIn(ph)}</span>}
          </button>
        ))}
      </div>

      <Msg msg={msg} />
      {loading ? <Spinner /> : (
        <div className="dl-table">
          <div className="dl-tr dl-th">
            <span>Requirement</span><span>Due date</span><span>Deadline</span><span>Submitted</span><span />
          </div>
          {shown.length === 0 ? (
            <div className="dl-empty">No requirement matches "{q}".</div>
          ) : shown.map((r, n) => (
            <div key={r.id} className={openId === r.id ? "dl-item open" : "dl-item"}>
            <div className="dl-tr">
              <span className="dl-name"><b>{shownAll.indexOf(r) + 1}</b>{r.label}</span>
              <input type="date" className="ix-input dl-date" value={dates[r.id] || ""}
                onChange={(e) => setDates((d) => ({ ...d, [r.id]: e.target.value }))} aria-label={`Due date of ${r.label}`} />
              {dueChip(r.id)}
              {missing[r.id] ? (
                <button type="button" className="dl-miss link" onClick={() => toggleWho(r)} aria-expanded={openId === r.id}
                  title="See who hasn't submitted">
                  {missing[r.id]} missing <span className="dl-caret">{openId === r.id ? "▲" : "▼"}</span>
                </button>
              ) : (
                <span className={missing[r.id] === undefined ? "dl-miss wait" : "dl-miss ok"}>
                  {missing[r.id] === undefined ? (counting ? "counting…" : "—") : "All in"}
                </span>
              )}
              <button type="button" className="ix-b ghost sm" disabled={!!busy || !missing[r.id]} onClick={() => remind(r)}>
                <Icon name="bell" size={13} /> {busy === r.id ? "..." : "Remind all"}
              </button>
            </div>

            {/* who hasn't submitted it */}
            {openId === r.id && (
              <div className="dl-who">
                {!who[r.id] ? <span className="dl-who-wait">Loading…</span> : who[r.id].length === 0 ? (
                  <span className="dl-who-wait">Everyone has submitted it.</span>
                ) : (() => {
                  // long lists (e.g. 100 interns): a search box, a compact scrolling list and a count
                  const wq = whoQ.trim().toLowerCase();
                  const people = who[r.id].filter((u) => !wq || `${u.name} ${u.program || ""} ${u.placement || ""} ${u.student_id || ""}`.toLowerCase().includes(wq));
                  return (
                    <>
                      <div className="dl-who-bar">
                        <strong>{who[r.id].length} intern{who[r.id].length === 1 ? "" : "s"} haven't submitted it</strong>
                        {who[r.id].length > 6 && (
                          <div className="ix-search dl-who-search">
                            <Icon name="search" size={14} />
                            <input type="text" placeholder="Find an intern..." value={whoQ} onChange={(e) => setWhoQ(e.target.value)} />
                          </div>
                        )}
                        {wq && <small>{people.length} shown</small>}
                      </div>
                      {people.length === 0 ? <span className="dl-who-wait">No intern matches "{whoQ}".</span> : (
                        <ul>
                          {people.map((u) => (
                            <li key={u.id}>
                              <Avatar name={u.name} photo={u.photo} size={26} />
                              <span className="dl-who-name"><strong>{u.name}</strong><small>{[u.program, u.placement].filter(Boolean).join(" · ") || u.email}</small></span>
                              <button type="button" className="dl-who-remind" disabled={!!busy} onClick={() => remind(r, [u.id])} title={`Remind ${u.name}`}>
                                <Icon name="bell" size={13} /> {busy === `${r.id}#${u.id}` ? "..." : "Remind"}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
            </div>
          ))}
        </div>
      )}
      <div className="dl-foot">
        <button type="button" className="ix-b ghost" onClick={onClose}>Back</button>
        <button type="button" className="ix-b primary" disabled={!!busy || loading} onClick={save}>{busy === "save" ? "Saving..." : "Save due dates"}</button>
      </div>
    </div>
  );
}


/* ───────────────────────── Reports (weekly / monthly) ─────────────────────────
   The coordinator decides when a report is needed: she adds one with a name and a due date,
   for all interns, some programs, or specific interns. Interns upload into it; nothing is replaced. */
const PROGRAM_KEYS = ["BSIT", "BSIS", "BSCS"];
function ReportsPanel({ interns, onClose }) {
  const [list, setList] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(null);
  const [form, setForm] = useState(null);           // null | { id?, title, due_date, audience, programs, intern_ids }
  const [pickQ, setPickQ] = useState("");
  const [openId, setOpenId] = useState(null);
  const [who, setWho] = useState({});
  const [delAsk, setDelAsk] = useState(null);

  const load = () =>
    fetch(`${API}/reports`, { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((d) => setList(Array.isArray(d) ? d : []))
      .catch(() => { setList([]); setMsg({ type: "error", text: "Couldn't load the reports." }); });
  useEffect(() => { load(); }, []);

  const call = async (method, url, body, key) => {
    setBusy(key); setMsg(null);
    try {
      const res = await fetch(`${API}${url}`, {
        method, headers: { "Content-Type": "application/json", Accept: "application/json" }, body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.errors && Object.values(data.errors)[0]?.[0]) || data.message || "Something went wrong.");
      setMsg({ type: "success", text: data.message });
      return true;
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
      return false;
    } finally { setBusy(null); }
  };

  const save = async (e) => {
    e.preventDefault();
    const body = { title: form.title, due_date: form.due_date || null, audience: form.audience, programs: form.programs, intern_ids: form.intern_ids };
    const ok = form.id ? await call("PUT", `/coordinator/reports/${form.id}`, body, "save") : await call("POST", "/coordinator/reports", body, "save");
    if (ok) { setForm(null); setWho({}); load(); }
  };
  const remove = async (r) => { if (await call("DELETE", `/coordinator/reports/${r.id}`, null, `del${r.id}`)) { setDelAsk(null); load(); } };
  const remind = async (r, ids) => {
    if (await call("POST", `/coordinator/reports/${r.id}/remind`, ids ? { user_ids: ids } : {}, ids ? `${r.id}#${ids[0]}` : `rem${r.id}`)) load();
  };
  const toggleWho = (r) => {
    if (openId === r.id) { setOpenId(null); return; }
    setOpenId(r.id);
    fetch(`${API}/coordinator/reports/${r.id}/missing`, { headers: { Accept: "application/json" } })
      .then((x) => x.json()).then((d) => setWho((w) => ({ ...w, [r.id]: Array.isArray(d) ? d : [] })))
      .catch(() => setWho((w) => ({ ...w, [r.id]: [] })));
  };

  const who4 = (r) => r.audience === "programs" ? r.programs.join(", ")
    : r.audience === "interns" ? `${r.intern_ids.length} intern${r.intern_ids.length === 1 ? "" : "s"}` : "All interns";
  const dueChip = (v) => {
    if (!v) return <span className="dl-chip none">No due date</span>;
    const days = Math.round((new Date(v + "T00:00:00") - new Date(new Date().toDateString())) / 86400000);
    const label = new Date(v + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
    return <span className={`dl-chip ${days < 0 ? "over" : days <= 3 ? "soon" : "ok"}`}>{label}</span>;
  };
  const blank = { title: "", due_date: "", audience: "all", programs: [], intern_ids: [] };
  const toggleIn = (k, v) => setForm((f) => ({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] }));
  const pq = pickQ.trim().toLowerCase();
  const pickable = interns.filter((u) => !pq || `${u.name} ${u.program || ""} ${u.student_id || ""}`.toLowerCase().includes(pq));

  return (
    <div className="ix-card dl-panel">
      <div className="dl-head">
        <div>
          <h3>Weekly / monthly reports</h3>
          <p>Ask for a weekly / monthly report whenever you need one. Interns upload each report on its own, and old ones are kept.</p>
        </div>
        {!form && <button type="button" className="ix-b primary sm" onClick={() => { setForm(blank); setMsg(null); }}><Icon name="plus" size={14} /> New report</button>}
      </div>
      <Msg msg={msg} />

      {form && (
        <form className="rp-form" onSubmit={save}>
          <div className="rp-row">
            <label className="rp-field grow"><span>Report name</span>
              <input className="ix-input" required maxLength={150} placeholder="e.g. Report 1, or Monthly report – November"
                value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></label>
            <label className="rp-field"><span>Due date</span>
              <input type="date" className="ix-input" value={form.due_date || ""} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} /></label>
          </div>
          <div className="rp-field"><span>Who submits it</span>
            <div className="rp-aud">
              {[["all", "All interns"], ["programs", "By program"], ["interns", "Specific interns"]].map(([k, l]) => (
                <button key={k} type="button" className={form.audience === k ? "rc-f on" : "rc-f"} onClick={() => setForm((f) => ({ ...f, audience: k }))}>{l}</button>
              ))}
            </div>
          </div>
          {form.audience === "programs" && (
            <div className="rp-aud">
              {PROGRAM_KEYS.map((k) => (
                <label key={k} className={form.programs.includes(k) ? "rp-check on" : "rp-check"}>
                  <input type="checkbox" checked={form.programs.includes(k)} onChange={() => toggleIn("programs", k)} /> {k}
                </label>
              ))}
            </div>
          )}
          {form.audience === "interns" && (
            <div className="rp-pick">
              <div className="rp-pick-bar">
                <div className="ix-search"><Icon name="search" size={14} />
                  <input type="text" placeholder="Find an intern..." value={pickQ} onChange={(e) => setPickQ(e.target.value)} /></div>
                <small>{form.intern_ids.length} picked</small>
              </div>
              <ul>
                {pickable.map((u) => (
                  <li key={u.id}>
                    <label className={form.intern_ids.includes(u.id) ? "on" : ""}>
                      <input type="checkbox" checked={form.intern_ids.includes(u.id)} onChange={() => toggleIn("intern_ids", u.id)} />
                      <Avatar name={u.name} photo={u.photo} size={24} />
                      <span><b>{u.name}</b><small>{[u.program, u.placement].filter(Boolean).join(" · ")}</small></span>
                    </label>
                  </li>
                ))}
                {pickable.length === 0 && <li className="rp-none">No intern matches.</li>}
              </ul>
            </div>
          )}
          <div className="rp-form-foot">
            <button type="button" className="ix-b ghost" onClick={() => setForm(null)} disabled={!!busy}>Cancel</button>
            <button type="submit" className="ix-b primary" disabled={!!busy}>{busy === "save" ? "Saving..." : form.id ? "Save changes" : "Add report and notify interns"}</button>
          </div>
        </form>
      )}

      {list === null ? <Spinner /> : list.length === 0 ? (
        !form && <div className="dl-empty">No reports yet. Click <b>New report</b> to ask interns for one.</div>
      ) : (
        <div className="dl-table">
          <div className="dl-tr dl-th rp-tr"><span>Report</span><span>Due date</span><span>For</span><span>Sent</span><span /></div>
          {list.map((r) => {
            const miss = Math.max((r.total || 0) - (r.sent || 0), 0);
            return (
              <div key={r.id} className={openId === r.id ? "dl-item open" : "dl-item"}>
                <div className="dl-tr rp-tr">
                  <span className="dl-name">{r.title}</span>
                  {dueChip(r.due_date)}
                  <span className="rp-for">{who4(r)}</span>
                  {miss > 0 ? (
                    <button type="button" className="dl-miss link" onClick={() => toggleWho(r)} title="See who hasn't sent it">
                      {r.sent}/{r.total} · {miss} missing <span className="dl-caret">{openId === r.id ? "▲" : "▼"}</span>
                    </button>
                  ) : <span className="dl-miss ok">{r.total ? `All ${r.total} sent` : "No interns"}</span>}
                  <span className="rp-acts">
                    <button type="button" className="ix-b ghost sm" disabled={!!busy || !miss} onClick={() => remind(r)} title="Remind everyone who hasn't sent it">
                      <Icon name="bell" size={13} /> {busy === `rem${r.id}` ? "..." : "Remind"}</button>
                    <button type="button" className="ix-b ghost sm" disabled={!!busy} onClick={() => { setForm({ ...r, due_date: r.due_date || "" }); setMsg(null); }} title="Edit">
                      <Icon name="pencil" size={13} /></button>
                    {delAsk === r.id ? (
                      <>
                        <button type="button" className="ix-b danger sm" disabled={!!busy} onClick={() => remove(r)}>{busy === `del${r.id}` ? "..." : "Remove"}</button>
                        <button type="button" className="ix-b ghost sm" onClick={() => setDelAsk(null)}>No</button>
                      </>
                    ) : (
                      <button type="button" className="ix-b ghost sm" disabled={!!busy} onClick={() => setDelAsk(r.id)} title="Remove"><Icon name="trash" size={13} /></button>
                    )}
                  </span>
                </div>
                {openId === r.id && (
                  <div className="dl-who">
                    {!who[r.id] ? <span className="dl-who-wait">Loading…</span> : who[r.id].length === 0 ? (
                      <span className="dl-who-wait">Everyone has sent it.</span>
                    ) : (
                      <ul>
                        {who[r.id].map((u) => (
                          <li key={u.id}>
                            <Avatar name={u.name} photo={u.photo} size={26} />
                            <span className="dl-who-name"><strong>{u.name}</strong><small>{[u.program, u.placement].filter(Boolean).join(" · ") || u.email}</small></span>
                            <button type="button" className="dl-who-remind" disabled={!!busy} onClick={() => remind(r, [u.id])}>
                              <Icon name="bell" size={13} /> {busy === `${r.id}#${u.id}` ? "..." : "Remind"}</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="dl-foot"><button type="button" className="ix-b ghost" onClick={onClose}>Back</button></div>
    </div>
  );
}

/* ───────────────────────── coordinator-only styles ─────────────────────────
   "Needs your review" card, compact review cards, print-card picker. Border / radius / shadow
   come from cardUnify, so changing --card-border there updates these too. */
const coordCss = `
/* "N interns have no HTE supervisor yet" banner on the dashboard */
.crd-nosup { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 16px; text-align: left; cursor: pointer;
  font-family: inherit; background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; transition: box-shadow .15s, transform .15s; }
.crd-nosup:hover { transform: translateY(-1px); box-shadow: 0 8px 18px -10px rgba(180,83,9,.4); }
.crd-nosup-ic { width: 34px; height: 34px; flex-shrink: 0; border-radius: 10px; display: grid; place-items: center; background: #fef3c7; color: #b45309; }
.crd-nosup-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.crd-nosup-text strong { font-size: 13.5px; color: #78350f; }
.crd-nosup-text small { font-size: 12px; color: #92400e; }
.crd-nosup-go { flex-shrink: 0; padding: 7px 14px; border-radius: 8px; background: #e8582a; color: #fff; font-size: 12.5px; font-weight: 600; }
/* Supervisors page */
.as-sups { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; margin-bottom: 18px; }
.as-sup { display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: var(--ix-surface, #fff); border: 1px solid #e9ebef; border-radius: 14px; min-width: 0;
  cursor: pointer; text-align: left; font-family: inherit; transition: border-color .15s, box-shadow .15s, transform .15s; }
.as-sup:hover { border-color: #f6c7b0; transform: translateY(-1px); box-shadow: 0 8px 18px -12px rgba(232,88,42,.45); }
.as-sup.on { border-color: #e8582a; box-shadow: 0 0 0 3px rgba(232,88,42,.12); }
.as-sup-text small { display: inline-flex; align-items: center; gap: 4px; }
.as-sup-text small.warn { color: #b45309; }
.as-sup-side { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
.as-sup-bad { padding: 2px 8px; border-radius: 99px; background: #fef3c7; color: #b45309; font-size: 10.5px; font-weight: 600; white-space: nowrap; }
.ix-content .ix-card.as-detail { padding: 18px 20px !important; margin-bottom: 18px; }
.as-detail-head { display: flex; align-items: flex-start; gap: 14px; }
.as-detail-main { flex: 1; min-width: 0; }
.as-detail-main h3 { margin: 0 0 4px; font-size: 17px; font-weight: 700; }
.as-detail-meta { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12.5px; color: #64748b; }
.as-detail-meta span { display: inline-flex; align-items: center; gap: 5px; }
.as-detail-meta strong { color: #0f172a; }
.as-detail-note { margin-top: 8px; font-size: 12px; color: #b45309; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 6px 10px; display: inline-block; }
.as-detail-sub { margin: 16px 0 8px; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #94a3b8; }
.as-detail-empty { font-size: 13px; color: #94a3b8; padding: 6px 0; }
.as-detail-list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr)); gap: 8px; }
.as-detail-list li { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid #eef0f3; border-radius: 10px; min-width: 0; }
.as-detail-list .as-who { flex: 1; }
.as-sup-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.as-sup-text strong { font-size: 13.5px; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.as-sup-text small { font-size: 11.5px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.as-sup-n { flex-shrink: 0; padding: 3px 9px; border-radius: 99px; background: #fff1ea; color: #c2410c; font-size: 11.5px; font-weight: 600; }
.as-sup-n.warn { background: #fef3c7; color: #b45309; }
.ix-page .mon-chip.as-warn { border-style: solid; border-color: #fde68a; background: #fffbeb; color: #b45309; }
.as-none-ic { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: #fef3c7; color: #b45309; flex-shrink: 0; }
.as-none-ic.big { width: 48px; height: 48px; }
.as-nohte { color: #b45309 !important; }
.as-bad { color: #b45309 !important; font-weight: 600; }
.as-rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.as-row { display: grid; grid-template-columns: 30px minmax(0, 1fr) minmax(200px, 300px) 112px auto; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f4f1ee; }
.as-row:last-child { border-bottom: 0; }
.as-row .ix-select { height: 34px; font-size: 12.5px; min-width: 0; width: 100%; }
.as-row .as-who { display: flex; flex-direction: column; min-width: 0; }
.as-row .as-who strong { font-size: 12.5px; }
.as-row .as-who small { font-size: 11px; color: #8a7a71; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ibx-d .ibx-act .ix-select { flex: 1; min-width: 200px; height: 36px; }
@media (max-width: 1100px) { .as-row { grid-template-columns: 30px minmax(0, 1fr); } .as-row .ix-select, .as-row .as-badge, .as-row .ix-b { grid-column: 1 / -1; } }
.as-sup-n.none { background: #f3f4f6; color: #9ca3af; }
.as-who { display: flex; flex-direction: column; min-width: 0; }
.as-who strong { font-size: 13px; }
.as-who small { font-size: 11.5px; color: #94a3b8; }
.as-muted { color: #64748b; font-size: 12.5px; }
.as-pick { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.as-pick .ix-select { min-width: 220px; max-width: 100%; }

/* same header as "On duty now" (size comes from formalLayout) */
.crd-head { display: flex; align-items: center; gap: 12px; }
.crd-head h2 { font-weight: 800; letter-spacing: -.3px; color: var(--ink); margin: 0; }
.crd-head .ix-count { margin-left: auto; }
.crd-icon { display: flex; align-items: center; justify-content: center; color: #fff; }
.crd-icon.orange { background: linear-gradient(135deg, #f2864f, #e8582a); box-shadow: 0 8px 16px rgba(232,88,42,0.3); }

.crd-rows { display: flex; flex-direction: column; gap: 8px; }
.crd-row {
  display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 12px; text-align: left; cursor: pointer;
  border-radius: 12px; border: 1px solid #f8eee8; background: var(--ix-surface, #fff);
  transition: transform .15s, box-shadow .15s, border-color .15s;
}
.crd-row:hover { transform: translateY(-2px); border-color: #f5b79f; box-shadow: 0 12px 24px rgba(150,52,20,0.10); }
.crd-row:focus-visible { outline: 2px solid #e8582a; outline-offset: 2px; }
.crd-row-ico { width: 36px; height: 36px; border-radius: 12px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: #fff; }
.crd-row-ico.blue   { background: linear-gradient(135deg, #5b8def, #2563eb); box-shadow: 0 8px 16px rgba(37,99,235,0.25); }
.crd-row-ico.purple { background: linear-gradient(135deg, #a07af2, #7c3aed); box-shadow: 0 8px 16px rgba(124,58,237,0.25); }
.crd-row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.crd-row-text strong { font-size: 13.5px; font-weight: 700; color: #3a2e28; }
.crd-row-text small { font-size: 12px; color: #9a8c84; }
.crd-row-n { min-width: 30px; padding: 3px 10px; border-radius: 99px; text-align: center; font-size: 13px; font-weight: 800; color: #fff; background: linear-gradient(135deg, #f2733a, #e04a1a); }
.crd-empty { padding: 14px 16px; border-radius: 12px; border: 1.5px dashed #bfe8cf; background: rgba(255,255,255,0.7); }
.crd-empty strong { font-size: 14.5px; color: #3a2e28; }
.crd-empty p { margin-top: 4px; font-size: 13px; color: #9a8c84; }
@media (prefers-reduced-motion: reduce) { .crd-row { transition: none; } }

/* compact review cards (Online Attendance + MOV Submissions) */
.rv-list { display: flex; flex-direction: column; gap: 10px; }
.rv-card {
  display: grid; grid-template-columns: 230px minmax(0, 1fr) minmax(300px, 400px); align-items: center; gap: 14px;
  padding: 10px 14px; background: var(--ix-surface, #fff);
  border: var(--card-border) !important; border-radius: var(--card-radius) !important; box-shadow: var(--card-shadow) !important;
}
.rv-who { display: flex; align-items: center; gap: 10px; min-width: 0; }
.rv-who > div { display: flex; flex-direction: column; min-width: 0; }
.rv-who strong { font-size: 13.5px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rv-who span { font-size: 11.5px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rv-main { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.rv-main-top { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }
.rv-title { font-size: 13.5px; font-weight: 700; color: #1e293b; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rv-desc { font-size: 12.5px; line-height: 1.4; color: #475569; overflow-wrap: anywhere;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.rv-file { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; font-size: 12px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rv-actions { display: flex; align-items: center; gap: 8px; }
.rv-actions .ix-input { flex: 1; min-width: 0; padding: 7px 10px; font-size: 12.5px; }
.rv-actions .ix-b { padding: 7px 12px; font-size: 12.5px; }
.rv-actions .ot-min { flex: 0 0 96px; }
.rv-cell-text { display: flex; flex-direction: column; max-width: 260px; white-space: normal; overflow-wrap: anywhere;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 13px; }
.rv-cell-text small { display: block; font-size: 11.5px; color: #94a3b8; }
/* due dates & reminders */
/* Reports panel */
.rp-tr { grid-template-columns: minmax(0, 1fr) 130px 120px 160px 210px !important; }
.rp-for { font-size: 12px; color: #6b7280; }
.rp-acts { display: inline-flex; gap: 6px; justify-content: flex-end; }
.rp-form { display: flex; flex-direction: column; gap: 12px; padding: 14px 16px; margin-bottom: 14px; border: 1px solid #f6c7b0; border-radius: 12px; background: #fffaf7; }
.rp-row { display: flex; gap: 12px; flex-wrap: wrap; }
.rp-field { display: flex; flex-direction: column; gap: 5px; font-size: 12px; font-weight: 600; color: #6b5b52; }
.rp-field.grow { flex: 1; min-width: 220px; }
.rp-aud { display: flex; gap: 6px; flex-wrap: wrap; }
.rp-check { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border: 1px solid #ece6e2; border-radius: 99px; background: var(--ix-surface, #fff); font-size: 12px; font-weight: 600; cursor: pointer; }
.rp-check.on { border-color: #e8582a; background: #fff1ea; color: #c2410c; }
.rp-pick { border: 1px solid #ece6e2; border-radius: 10px; background: var(--ix-surface, #fff); }
.rp-pick-bar { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-bottom: 1px solid #f4f1ee; }
.rp-pick-bar .ix-search { flex: 1; }
.rp-pick-bar small { font-size: 11.5px; color: #c2410c; font-weight: 600; white-space: nowrap; }
.rp-pick ul { list-style: none; margin: 0; padding: 4px; max-height: 240px; overflow-y: auto; }
.rp-pick label { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 8px; cursor: pointer; }
.rp-pick label.on { background: #fff1ea; }
.rp-pick label span { display: flex; flex-direction: column; min-width: 0; } .rp-pick label b { font-size: 12.5px; } .rp-pick label small { font-size: 11px; color: #8a7a71; }
.rp-none { padding: 10px; font-size: 12px; color: #8a7a71; }
.rp-form-foot { display: flex; justify-content: flex-end; gap: 8px; }
.rc-f { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 12px; border-radius: 99px; border: 1px solid #ece6e2; background: var(--ix-surface, #fff); font: inherit; font-size: 12px; font-weight: 600; color: #6b7280; cursor: pointer; }
.rc-f.on { background: #fff1ea; border-color: #f6c7b0; color: #c2410c; }
@media (max-width: 800px) { .rp-tr { grid-template-columns: 1fr auto !important; } .rp-tr > .rp-for, .rp-tr > .dl-chip { display: none; } }
.dl-bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin: 0 0 14px;
  padding: 10px 14px; border-radius: 10px; background: #fff7ed; color: #9a3412; font-size: 13px; }
.dl-bar > span { display: inline-flex; align-items: center; gap: 8px; }
.dl-list { display: flex; flex-direction: column; gap: 14px; }
.ix-content .ix-card.dl-panel { padding: 20px 22px !important; }
.dl-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 14px; }
.dl-head h3 { margin: 0; font-size: 17px; font-weight: 700; }
.dl-head p { margin: 4px 0 0; font-size: 12.5px; color: #64748b; }
.dl-search { width: 300px; max-width: 100%; }
.dl-tabs { display: flex; gap: 6px; border-bottom: 1px solid #f1e6df; margin-bottom: 12px; }
.dl-tab { position: relative; display: inline-flex; align-items: center; gap: 7px; padding: 9px 14px; border: 0; background: none; cursor: pointer;
  font: 600 13px/1 inherit; font-family: inherit; color: #8a7a71; }
.dl-tab::after { content: ""; position: absolute; left: 8px; right: 8px; bottom: -1px; height: 2px; border-radius: 2px; background: transparent; }
.dl-tab.on { color: #e8582a; }
.dl-tab.on::after { background: #e8582a; }
.dl-tab-n { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 99px; background: #fee2e2; color: #b91c1c; font-size: 10.5px; display: inline-grid; place-items: center; }
.dl-table { border: 1px solid #f1e6df; border-radius: 12px; overflow: hidden; }
.dl-tr { display: grid; grid-template-columns: minmax(0, 1fr) 170px 120px 120px 118px; align-items: center; gap: 14px; padding: 10px 16px; border-top: 1px solid #f6eee9; }
.dl-item:nth-child(odd) > .dl-tr { background: #fffaf7; }
.dl-item.open > .dl-tr { background: #fff1ea; }
button.dl-miss.link { border: 0; cursor: pointer; font-family: inherit; display: inline-flex; align-items: center; gap: 5px; }
button.dl-miss.link:hover { background: #fecaca; }
.dl-caret { font-size: 8px; }
.dl-who { padding: 8px 16px 12px 48px; background: #fffaf7; border-top: 1px dashed #f3dcd0; }
.dl-who-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
.dl-who-bar strong { font-size: 12.5px; color: #7c2d12; }
.dl-who-bar small { font-size: 11.5px; color: #9a8c84; }
.dl-who-search { width: 240px; max-width: 100%; }
/* compact rows, 3 per line, at most ~6 rows tall; scrolls when there are more */
.dl-who ul { list-style: none; margin: 0; padding: 0 4px 0 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 6px;
  max-height: 262px; overflow-y: auto; }
.dl-who li { display: flex; align-items: center; gap: 8px; padding: 6px 8px; background: var(--ix-surface, #fff); border: 1px solid #f3e7e0; border-radius: 9px; min-width: 0; }
.dl-who-remind { flex-shrink: 0; display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border: 1px solid #f1e2d9; border-radius: 7px;
  background: var(--ix-surface, #fff); color: #7c2d12; font: 600 11.5px/1 inherit; font-family: inherit; cursor: pointer; }
.dl-who-remind:hover:not(:disabled) { border-color: #e8582a; color: #e8582a; background: #fff7f2; }
.dl-who-remind:disabled { opacity: .5; cursor: default; }
.dl-who-name { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.dl-who-name strong { font-size: 12.5px; color: #1f2937; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dl-who-name small { font-size: 11px; color: #9a8c84; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dl-who-wait { font-size: 12.5px; color: #9a8c84; }
.dl-th { border-top: 0; background: #fbf4f0; font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #9a8c84; padding: 10px 16px; }
.dl-name { display: flex; align-items: center; gap: 10px; font-size: 13.5px; font-weight: 600; color: #1f2937; min-width: 0; }
.dl-name b { flex-shrink: 0; width: 22px; height: 22px; border-radius: 7px; display: grid; place-items: center; background: #fdeee7; color: #e8582a; font-size: 11px; }
.dl-date { padding: 6px 8px !important; font-size: 12.5px !important; min-height: 0 !important; height: 34px !important; }
.dl-chip { justify-self: start; padding: 3px 9px; border-radius: 99px; font-size: 11px; font-weight: 600; white-space: nowrap; }
.dl-chip.none { background: #f3f4f6; color: #9ca3af; }
.dl-chip.ok { background: #ecfdf3; color: #15803d; }
.dl-chip.soon { background: #fef3c7; color: #b45309; }
.dl-chip.over { background: #fee2e2; color: #b91c1c; }
.dl-miss { justify-self: start; padding: 3px 9px; border-radius: 99px; font-size: 11.5px; font-weight: 600; background: #fee2e2; color: #b91c1c; white-space: nowrap; }
.dl-miss.ok { background: #dcfce7; color: #15803d; }
.dl-miss.wait { background: none; color: #a1928a; font-weight: 500; padding: 0; }
.dl-tr .ix-b { justify-self: end; gap: 5px; }
.dl-empty { padding: 26px; text-align: center; font-size: 13px; color: #9a8c84; }
@media (max-width: 900px) {
  .dl-tr { grid-template-columns: 1fr 1fr; }
  .dl-th { display: none; }
  .dl-name { grid-column: 1 / -1; }
}
.dl-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
@media (max-width: 640px) { .dl-row { grid-template-columns: 1fr 1fr; } }

/* supervisor's step on the coordinator's review cards */
.rv-endorsed { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: #047857; font-weight: 600; }
.rv-endorsed.none { color: #94a3b8; font-weight: 500; }
.rv-waiting { margin-bottom: 12px; padding: 12px 16px; }
.rv-waiting-head { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; color: #475569; margin-bottom: 6px; }
.rv-waiting ul { margin: 0; padding-left: 18px; font-size: 12.5px; color: #475569; }
.rv-waiting li span { color: #94a3b8; }

/* tabs of the grouped pages (Approvals, Interns, Reports) */
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
.grp-tab-n {
  min-width: 20px; height: 20px; padding: 0 6px; border-radius: 99px; display: inline-flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 800; color: #fff; background: #f97316;
}
/* the tab's own title is replaced by the group title above the tabs */
.grp-body > .ix-ph { display: none; }

@media (max-width: 1250px) { .rv-card { grid-template-columns: 200px minmax(0, 1fr); } .rv-actions { grid-column: 1 / -1; } }
@media (max-width: 700px) { .rv-card { grid-template-columns: 1fr; } .rv-actions { flex-wrap: wrap; } }
`;