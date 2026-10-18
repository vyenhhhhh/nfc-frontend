// OjtCoordinatorDashboard.jsx
// The OJT coordinator's workspace: reviews online attendance + MOVs, manages NFC cards,
// monitors interns, and prints DTRs / consolidated reports.
import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Shell, {
  Spinner, PageHeader, Badge, Table, Section, Msg, Avatar, Icon,
  InternMonitor, AnnouncementManager, todayManila, fmtTime, greeting,
  PRE_REQUIREMENTS, POST_REQUIREMENTS, DURING_REQUIREMENTS, REQUIREMENTS_BY_PHASE, PHASE_LABEL, SCHEDULE, fmtMinutes, Modal, liveRefresh,
} from "../components/DashKit.jsx";
import NfcCards from "../components/NfcCards.jsx";
import {
  HomeCalendar, Records, DTR, Reports, AdminProfile, adminCss, adminMatch,
} from "./AdminDashboard.jsx";
import { internCss, cardUnify } from "./InternDashboard.jsx";
import { formalLayout } from "../components/formalLayout.js";
import { mdCss } from "../components/materialTheme.js";

import { API, STORAGE } from "../config.js";
const NAV = [
  { path: "/coordinator",               label: "Home",     icon: "home" },
  { path: "/coordinator/approvals",     label: "Approvals",     icon: "inbox" },
  { path: "/coordinator/interns",       label: "Interns",       icon: "users" },
  { path: "/coordinator/nfc",           label: "NFC Cards",     icon: "card" },
  { path: "/coordinator/reports",       label: "Reports",       icon: "chart" },
  { path: "/coordinator/announcements", label: "Announcements", icon: "bell" },
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
      { key: "corrections", label: "Time Corrections",  icon: "pencil", sub: "Forgotten tap-outs: the supervisor confirms the time first, then you decide." },
      { key: "wfh",         label: "Work Arrangement",  icon: "globe",  sub: "WFH requests with the HTE's letter (or WFH stated in the MOA / Student Contract)." },
    ],
  },
  "/coordinator/interns": {
    title: "Interns",
    live: true,
    tabs: [
      { key: "monitor", label: "Monitor Interns",    icon: "users", sub: "Real-time status of all interns." },
      { key: "records", label: "Attendance Records", icon: "list",  sub: "Complete attendance log of every intern." },
    ],
  },
  "/coordinator/reports": {
    title: "Reports",
    tabs: [
      { key: "dtr",     label: "Generate DTR",        icon: "file",  sub: "Print an intern's Daily Time Record (CS Form 48)." },
      { key: "summary", label: "Consolidated Report", icon: "chart", sub: "Monthly attendance summary for all interns." },
    ],
  },
};

// The old addresses still work (bookmarks, links in notifications): they open the matching tab.
const OLD_PATHS = {
  "/coordinator/pending":     "/coordinator/approvals?tab=online",
  "/coordinator/submissions": "/coordinator/approvals?tab=movs",
  "/coordinator/overtime":    "/coordinator/approvals?tab=overtime",
  "/coordinator/corrections": "/coordinator/approvals?tab=corrections",
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
  const [corrections, setCorrections] = useState([]); // forgotten time-outs sent by interns
  const [wfhReqs, setWfhReqs] = useState([]);         // work-from-home requests
  const [records, setRecords] = useState([]);
  const [interns, setInterns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
    return liveRefresh(fetchAll);
  }, []);

  const fetchAll = async () => {
    try {
      const [p, m, r, u, ot, tc, wm] = await Promise.all([
        fetch(`${API}/supervisor/pending`).then((r) => r.json()),
        fetch(`${API}/coordinator/movs`).then((r) => r.json()),
        fetch(`${API}/admin/all-attendance`).then((r) => r.json()),
        fetch(`${API}/admin/users`).then((r) => r.json()),
        fetch(`${API}/coordinator/overtime`).then((r) => r.json()).catch(() => []),
        fetch(`${API}/coordinator/time-corrections`).then((r) => r.json()).catch(() => []),
        fetch(`${API}/coordinator/work-mode-requests`).then((r) => r.json()).catch(() => []),
      ]);
      if (Array.isArray(p)) setPending(p);
      if (Array.isArray(m)) setMovs([...m]);
      if (Array.isArray(r)) setRecords([...r]);
      if (Array.isArray(u)) setInterns(u.filter((x) => x.role === "intern"));
      if (Array.isArray(ot)) setOvertime(ot);
      if (Array.isArray(tc)) setCorrections(tc);
      if (Array.isArray(wm)) setWfhReqs(wm);
    } catch (err) {
      console.error("Poll error:", err);
    } finally {
      setLoading(false);
    }
  };

  const pendingMovs = movs.filter((m) => m.status === "pending").length;
  // what the coordinator can decide now: approved by the supervisor, or no supervisor assigned
  const pendingOt = overtime.filter(otForMe).length;
  const pendingFix = corrections.filter(fixForMe).length;
  const onlineForMe = pending.filter(fixForMe);      // confirmed by the supervisor, or no supervisor
  const onlineWaiting = pending.filter(fixWaiting);  // still with the supervisor
  const pendingWfh = wfhReqs.filter((w) => w.status === "pending").length;

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
  const counts = { online: onlineForMe.length, movs: pendingMovs, overtime: pendingOt, corrections: pendingFix, wfh: pendingWfh };

  return (
    <Shell navItems={NAV} user={user}>
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
          user={user} pending={onlineForMe} pendingMovs={pendingMovs} pendingWfh={pendingWfh} pendingOt={pendingOt} pendingFix={pendingFix} records={records}
          interns={interns} loading={loading} go={navigate}
        />
      )}

      {group && (
        <GroupPage group={group} tab={tab} onPick={pickTab} counts={counts}>
          {/* Approvals */}
          {tab.key === "online" && <Pending pending={onlineForMe} waiting={onlineWaiting} interns={interns} user={user} onRefresh={fetchAll} />}
          {tab.key === "wfh" && <WorkModeReview requests={wfhReqs} onRefresh={fetchAll} />}
          {tab.key === "movs" && <MovReview movs={movs} user={user} onRefresh={fetchAll} />}
          {tab.key === "overtime" && <OvertimeReview overtime={overtime} onRefresh={fetchAll} />}
          {tab.key === "corrections" && <CorrectionReview corrections={corrections} onRefresh={fetchAll} />}
          {/* Interns */}
          {tab.key === "monitor" && (
            <InternMonitor
              interns={interns} records={records} loading={loading} onRefresh={fetchAll}
              recordsPath="/coordinator/interns?tab=records"
            />
          )}
          {tab.key === "records" && <Records records={records} loading={loading} />}
          {/* Reports */}
          {tab.key === "dtr" && <DTR interns={interns} records={records} />}
          {tab.key === "summary" && <Reports interns={interns} records={records} />}
        </GroupPage>
      )}

      {path === "/coordinator/nfc" && <NfcCards user={user} interns={interns} onRefresh={fetchAll} />}
      {path === "/coordinator/announcements" && <AnnouncementManager user={user} />}
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
      <PageHeader title={group.title} sub={tab.sub} live={group.live} />
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
      <div className="grp-body" role="tabpanel">{children}</div>
    </>
  );
}

/* ───────────────────────── Dashboard ───────────────────────── */
function Home({ user, pending, pendingMovs, pendingOt = 0, pendingFix = 0, pendingWfh = 0, records, interns, loading, go }) {
  const today = todayManila();
  const todayRecs = records.filter((r) => r.date === today);
  const inNowAll = todayRecs.filter((r) => r.uid !== "ONLINE" && r.action === "CHECK_IN" && !r.checked_out_at);
  // one entry per person, in case someone has more than one open check-in
  const inNow = inNowAll.filter((r, i, a) => a.findIndex((x) => (x.user_id ?? x.name) === (r.user_id ?? r.name)) === i);
  const checkedIn = inNow.length;
  const pct = interns.length ? (checkedIn / interns.length) * 100 : 0;
  const toReview = pending.length + pendingMovs + pendingOt + pendingFix + pendingWfh;
  const first = user.name?.split(" ")[0] || "there";
  const dateLabel = new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" });

  const pillClass = toReview > 0 ? "warn" : checkedIn > 0 ? "live" : "idle";
  const pillText = toReview > 0
    ? `${toReview} item${toReview > 1 ? "s" : ""} waiting for review`
    : checkedIn > 0 ? `${checkedIn} on the clock now` : "Nobody checked in yet";

  const stats = [
    { icon: "users", tone: "orange", label: "Total interns", value: interns.length, hint: "under your watch" },
    { icon: "inbox", tone: "blue", label: "Online attendance", value: pending.length, hint: "waiting for review" },
    { icon: "folder", tone: "purple", label: "MOV submissions", value: pendingMovs, hint: "waiting for review" },
    { icon: "tap", tone: "green", label: "Checked in today", value: checkedIn, hint: `of ${interns.length} interns`, bar: pct },
  ];

  const quick = [
    { icon: "inbox", label: "Approvals", to: "/coordinator/approvals" },
    { icon: "users", label: "Interns", to: "/coordinator/interns" },
    { icon: "file", label: "DTR", to: "/coordinator/reports?tab=dtr" },
  ];

  return (
    <div className="adm-home">
      {/* ───── LEFT ───── */}
      <div className="adm-col">
        <div className="hv-hero">
          <span className="hv-blob a" aria-hidden="true" />
          <span className="hv-blob b" aria-hidden="true" />

          <div className="hv-hero-main">
            <span className={`hv-pill ${pillClass}`}>
              <i aria-hidden="true" /> {pillText}
            </span>
            <h1>{greeting()}, {first}</h1>
            <p>
              {toReview > 0
                ? `Review the pending items and keep your interns on track. ${dateLabel}.`
                : `You're all caught up. Here's how your interns are doing today. ${dateLabel}.`}
            </p>
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

        <div className="adm-live hv-recent">
          <Section icon="clock" title="Today's Live Attendance" count={todayRecs.length} live>
            {loading ? <Spinner /> : (
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

      {/* ───── RIGHT: calendar, review queue, on duty ───── */}
      <div className="adm-col">
        <HomeCalendar />

        <div className="ix-card crd-review">
          <div className="crd-head">
            <span className="crd-icon orange"><Icon name="inbox" size={18} /></span>
            <h2>Needs your review</h2>
            <span className="ix-count">{toReview}</span>
          </div>

          {toReview === 0 ? (
            <div className="crd-empty">
              <strong>All caught up!</strong>
              <p>No online attendance, MOVs, overtime, time corrections or WFH requests waiting.</p>
            </div>
          ) : (
            <div className="crd-rows">
              <button className="crd-row" onClick={() => go("/coordinator/approvals?tab=online")}>
                <span className="crd-row-ico blue"><Icon name="inbox" size={17} /></span>
                <span className="crd-row-text"><strong>Online attendance</strong><small>Remote workdays to approve</small></span>
                <span className="crd-row-n">{pending.length}</span>
              </button>
              <button className="crd-row" onClick={() => go("/coordinator/approvals?tab=movs")}>
                <span className="crd-row-ico purple"><Icon name="folder" size={17} /></span>
                <span className="crd-row-text"><strong>MOV submissions</strong><small>Documents and certificates</small></span>
                <span className="crd-row-n">{pendingMovs}</span>
              </button>
              <button className="crd-row" onClick={() => go("/coordinator/approvals?tab=overtime")}>
                <span className="crd-row-ico blue"><Icon name="clock" size={17} /></span>
                <span className="crd-row-text"><strong>Overtime</strong><small>Approved by the supervisor, your final say</small></span>
                <span className="crd-row-n">{pendingOt}</span>
              </button>
              <button className="crd-row" onClick={() => go("/coordinator/approvals?tab=corrections")}>
                <span className="crd-row-ico purple"><Icon name="pencil" size={17} /></span>
                <span className="crd-row-text"><strong>Time corrections</strong><small>Forgotten tap-outs confirmed by the supervisor</small></span>
                <span className="crd-row-n">{pendingFix}</span>
              </button>
              <button className="crd-row" onClick={() => go("/coordinator/approvals?tab=wfh")}>
                <span className="crd-row-ico blue"><Icon name="globe" size={17} /></span>
                <span className="crd-row-text"><strong>Work arrangement</strong><small>WFH requests with the HTE letter</small></span>
                <span className="crd-row-n">{pendingWfh}</span>
              </button>
            </div>
          )}
        </div>

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

/* ───────────────────────── shared bits for the review pages ───────────────────────── */
const fmtDate = (v) => {
  const d = new Date(v);
  return !v || isNaN(d) ? "—" : d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
};
const cap = (s = "") => s.charAt(0).toUpperCase() + s.slice(1);

function ReviewTabs({ tab, setTab, pendingCount, historyCount }) {
  return (
    <div className="ix-pills">
      <button type="button" className={tab === "pending" ? "ix-pill active" : "ix-pill"} onClick={() => setTab("pending")}>
        Pending <span className="ix-pill-count">{pendingCount}</span>
      </button>
      <button type="button" className={tab === "history" ? "ix-pill active" : "ix-pill"} onClick={() => setTab("history")}>
        History <span className="ix-pill-count">{historyCount}</span>
      </button>
    </div>
  );
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
  const [tab, setTab] = useState("pending");
  const [remarks, setRemarks] = useState({});
  const [processing, setProcessing] = useState(null);
  const [msg, setMsg] = useState(null);
  const [history, setHistory] = useState([]);
  const [histState, setHistState] = useState("loading"); // loading | ok | error
  const [hStatus, setHStatus] = useState("all");
  const [q, setQ] = useState("");

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

  const handleValidate = async (id, action) => {
    setProcessing(id + action); setMsg(null);
    try {
      // the endpoint still calls the reviewer "supervisor_id"; it is the coordinator's id here
      const res = await fetch(`${API}/supervisor/validate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submission_id: id, supervisor_id: user.id, action, remarks: remarks[id] || "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setMsg({ type: "success", text: data.message });
      onRefresh();
    } catch (err) { setMsg({ type: "error", text: err.message }); }
    finally { setProcessing(null); }
  };

  const shown = history
    .filter((h) => hStatus === "all" || h.status === hStatus)
    .filter((h) => (h.intern_name || "").toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <PageHeader title="Online Attendance" sub="Review intern online attendance submissions." live />
      <Msg msg={msg} />
      <ReviewTabs tab={tab} setTab={setTab} pendingCount={pending.length} historyCount={history.length} />
      {tab === "pending" && <WaitingList items={waiting} what={() => "online workday"} />}

      {tab === "pending" ? (
        pending.length === 0 ? (
          <div className="ix-card ix-allgood">
            <div className="ix-empty-icon"><Icon name="check" size={30} /></div>
            <div className="ix-empty-title" style={{ fontSize: 17 }}>All caught up!</div>
            <div className="ix-empty-sub">No pending submissions to review.</div>
          </div>
        ) : (
          <div className="rv-list">
            {pending.map((sub) => (
              <div key={sub.id} className="rv-card">
                <div className="rv-who">
                  <Avatar name={sub.intern_name} photo={sub.intern_photo} size={36} />
                  <div>
                    <strong>{sub.intern_name}</strong>
                    <span>{sub.intern_email}</span>
                  </div>
                </div>
                <div className="rv-main">
                  <div className="rv-main-top">
                    <Badge label={String(sub.date).slice(0, 10)} type="pending" />
                  </div>
                  <div className="rv-desc" title={sub.description}>{sub.description}</div>
                  {sub.status === "endorsed" ? (
                    <div className="rv-endorsed">
                      <Icon name="check" size={13} /> {sub.endorser_name || "Supervisor"} confirmed this workday
                      {sub.endorse_remarks ? ` · “${sub.endorse_remarks}”` : ""}
                    </div>
                  ) : (
                    <div className="rv-endorsed none">No supervisor assigned — you decide directly.</div>
                  )}
                </div>
                <div className="rv-actions">
                  <input
                    type="text" className="ix-input" placeholder="Remarks (optional)"
                    value={remarks[sub.id] || ""}
                    onChange={(e) => setRemarks((r) => ({ ...r, [sub.id]: e.target.value }))}
                  />
                  <button className="ix-b danger" onClick={() => handleValidate(sub.id, "rejected")} disabled={!!processing}>
                    {processing === sub.id + "rejected" ? "..." : "Reject"}
                  </button>
                  <button className="ix-b ok" onClick={() => handleValidate(sub.id, "approved")} disabled={!!processing}>
                    {processing === sub.id + "approved" ? "..." : "Approve"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : histState === "error" ? (
        <div className="ix-alert">
          <Icon name="warn" size={18} /> Couldn't load the history. Check that the server is running.
        </div>
      ) : (
        <>
          <HistoryToolbar q={q} setQ={setQ} status={hStatus} setStatus={setHStatus} count={shown.length} />
          <div className="ix-card flush">
            {histState === "loading" ? <Spinner /> : (
              <Table
                headers={["Intern", "Date of work", "Tasks", "Result", "Remarks", "Reviewed"]}
                rows={shown.map((h) => [
                  <div className="ix-actions">
                    <Avatar name={h.intern_name} photo={h.intern_photo} size={30} />
                    <strong>{h.intern_name}</strong>
                  </div>,
                  String(h.date).slice(0, 10),
                  <div className="rv-cell-text" title={h.description}>{h.description}</div>,
                  <span className={`os-status ${h.status}`}>{cap(h.status)}</span>,
                  <span className="os-remarks">{h.remarks || "—"}</span>,
                  fmtDate(h.reviewed_at || h.updated_at),
                ])}
                empty="No reviewed submissions yet."
              />
            )}
          </div>
        </>
      )}
    </>
  );
}

/* ───────────────────────── MOV submissions review ───────────────────────── */
function MovReview({ movs, user, onRefresh }) {
  const [tab, setTab] = useState("pending");
  const [processing, setProcessing] = useState(null);
  const [remarks, setRemarks] = useState({});
  const [msg, setMsg] = useState(null);
  const [fPhase, setFPhase] = useState("all");   // all | pre | post
  const [hStatus, setHStatus] = useState("all"); // history: all | approved | rejected
  const [q, setQ] = useState("");

  const reqLabel = (m) => {
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
        <span><Icon name="calendar" size={16} /> Set due dates for the requirements and remind interns who haven't submitted.</span>
        <button type="button" className="ix-b primary sm" onClick={() => setShowDue(true)}>
          <Icon name="calendar" size={14} /> Due dates &amp; reminders
        </button>
      </div>
      {showDue && <DeadlinesModal onClose={() => setShowDue(false)} />}
      <Msg msg={msg} />
      <ReviewTabs tab={tab} setTab={setTab} pendingCount={pendingAll.length} historyCount={historyAll.length} />

      {tab === "pending" ? (
        <>
          <div className="ix-toolbar">{phaseSelect}</div>
          {pendingList.length === 0 ? (
            <div className="ix-card ix-allgood">
              <div className="ix-empty-icon"><Icon name="check" size={30} /></div>
              <div className="ix-empty-title" style={{ fontSize: 17 }}>All caught up!</div>
              <div className="ix-empty-sub">No MOV submissions waiting for review.</div>
            </div>
          ) : (
            <div className="rv-list">
              {pendingList.map((m) => (
                <div key={m.id} className="rv-card">
                  <div className="rv-who">
                    <Avatar name={m.intern_name} photo={m.intern_photo} size={36} />
                    <div>
                      <strong>{m.intern_name}</strong>
                      <span>{m.intern_email}</span>
                    </div>
                  </div>
                  <div className="rv-main">
                    <div className="rv-main-top">
                      <span className="rv-title" title={m.title}>{m.title}</span>
                      {phaseBadge(m)}
                      <Badge label={reqLabel(m)} type="none" />
                    </div>
                    {fileLink(m)}
                  </div>
                  <div className="rv-actions">
                    <input
                      type="text" className="ix-input" placeholder="Remarks (optional)"
                      value={remarks[m.id] || ""}
                      onChange={(e) => setRemarks((r) => ({ ...r, [m.id]: e.target.value }))}
                    />
                    <button className="ix-b danger" onClick={() => handleReview(m.id, "rejected")} disabled={!!processing}>
                      {processing === m.id + "rejected" ? "..." : "Reject"}
                    </button>
                    <button className="ix-b ok" onClick={() => handleReview(m.id, "approved")} disabled={!!processing}>
                      {processing === m.id + "approved" ? "..." : "Approve"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <HistoryToolbar q={q} setQ={setQ} status={hStatus} setStatus={setHStatus} count={historyList.length}>
            {phaseSelect}
          </HistoryToolbar>
          <div className="ix-card flush">
            <Table
              headers={["Intern", "Document", "Phase", "File", "Result", "Remarks", "Reviewed"]}
              rows={historyList.map((m) => [
                <div className="ix-actions">
                  <Avatar name={m.intern_name} photo={m.intern_photo} size={30} />
                  <strong>{m.intern_name}</strong>
                </div>,
                <div className="rv-cell-text" title={m.title}>
                  <strong>{m.title}</strong>
                  <small>{reqLabel(m)}</small>
                </div>,
                phaseBadge(m),
                fileLink(m),
                <span className={`os-status ${m.status}`}>{cap(m.status)}</span>,
                <span className="os-remarks">{m.remarks || "—"}</span>,
                fmtDate(m.reviewed_at || m.updated_at),
              ])}
              empty="No reviewed documents yet."
            />
          </div>
        </>
      )}
    </>
  );
}


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
  const [tab, setTab] = useState("pending");
  const [minutes, setMinutes] = useState({});
  const [remarks, setRemarks] = useState({});
  const [processing, setProcessing] = useState(null);
  const [msg, setMsg] = useState(null);
  const [hStatus, setHStatus] = useState("all");
  const [q, setQ] = useState("");

  const pendingList = overtime.filter(otForMe);
  const waitingList = overtime.filter(otWaiting);
  const historyAll = overtime.filter((o) => o.ot_status === "approved" || o.ot_status === "rejected");
  const capOf = (o) => (o.ot_status === "endorsed" && o.ot_endorsed_minutes ? o.ot_endorsed_minutes : o.ot_minutes);
  const historyList = historyAll
    .filter((o) => hStatus === "all" || o.ot_status === hStatus)
    .filter((o) => (o.intern_name || "").toLowerCase().includes(q.trim().toLowerCase()));

  const review = async (o, status) => {
    const cap = capOf(o);
    const credit = minutes[o.id] === undefined || minutes[o.id] === "" ? cap : Number(minutes[o.id]);
    if (status === "approved" && (!credit || credit < 1 || credit > cap)) {
      setMsg({ type: "error", text: `Credit between 1 and ${cap} minutes.` });
      return;
    }
    setProcessing(o.id + status); setMsg(null);
    try {
      const res = await fetch(`${API}/coordinator/overtime/${o.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ status, minutes: status === "approved" ? credit : null, remarks: remarks[o.id] || "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Something went wrong.");
      setMsg({ type: "success", text: data.message });
      onRefresh();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    } finally {
      setProcessing(null);
    }
  };

  return (
    <>
      <PageHeader title="Overtime" sub="Time after 5:00 PM only counts when you approve it." live />
      <div className="ix-note" style={{ marginTop: 0, marginBottom: 16 }}>
        <Icon name="info" size={18} />
        <span>
          Official hours give at most <strong>{SCHEDULE.dailyCap} hours</strong> a day. Any time after 5:00 PM shows
          here, and only the minutes you approve are added on top of that day's hours.
        </span>
      </div>
      <Msg msg={msg} />
      <ReviewTabs tab={tab} setTab={setTab} pendingCount={pendingList.length} historyCount={historyAll.length} />
      {tab === "pending" && <WaitingList items={waitingList} what={(o) => `${fmtMinutes(o.ot_minutes)} overtime`} />}

      {tab === "pending" ? (
        pendingList.length === 0 ? (
          <div className="ix-card ix-allgood">
            <div className="ix-empty-icon"><Icon name="check" size={30} /></div>
            <div className="ix-empty-title" style={{ fontSize: 17 }}>All caught up!</div>
            <div className="ix-empty-sub">No overtime waiting for review.</div>
          </div>
        ) : (
          <div className="rv-list">
            {pendingList.map((o) => (
              <div key={o.id} className="rv-card">
                <div className="rv-who">
                  <Avatar name={o.intern_name} photo={o.intern_photo} size={36} />
                  <div>
                    <strong>{o.intern_name}</strong>
                    <span>{o.intern_email}</span>
                  </div>
                </div>
                <div className="rv-main">
                  <div className="rv-main-top">
                    <Badge label={String(o.date).slice(0, 10)} type="pending" />
                    <span className="rv-title">{fmtMinutes(o.ot_minutes)} overtime</span>
                  </div>
                  <div className="rv-desc">In {clock(o.checked_in_at)} · Out {clock(o.checked_out_at)}</div>
                  {o.ot_status === "endorsed" ? (
                    <div className="rv-endorsed">
                      <Icon name="check" size={13} /> {o.endorser_name || "Supervisor"} approved {fmtMinutes(o.ot_endorsed_minutes)}
                      {o.ot_endorse_remarks ? ` · “${o.ot_endorse_remarks}”` : ""}
                    </div>
                  ) : (
                    <div className="rv-endorsed none">No supervisor assigned — you decide directly.</div>
                  )}
                </div>
                <div className="rv-actions">
                  <input
                    type="number" className="ix-input ot-min" min={1} max={capOf(o)}
                    placeholder={`${capOf(o)} min`} aria-label="Minutes to credit"
                    value={minutes[o.id] ?? ""}
                    onChange={(e) => setMinutes((m) => ({ ...m, [o.id]: e.target.value }))}
                  />
                  <input
                    type="text" className="ix-input" placeholder="Remarks (optional)"
                    value={remarks[o.id] || ""}
                    onChange={(e) => setRemarks((r) => ({ ...r, [o.id]: e.target.value }))}
                  />
                  <button className="ix-b danger" onClick={() => review(o, "rejected")} disabled={!!processing}>
                    {processing === o.id + "rejected" ? "..." : "Reject"}
                  </button>
                  <button className="ix-b ok" onClick={() => review(o, "approved")} disabled={!!processing}>
                    {processing === o.id + "approved" ? "..." : "Approve"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          <HistoryToolbar q={q} setQ={setQ} status={hStatus} setStatus={setHStatus} count={historyList.length} />
          <div className="ix-card flush">
            <Table
              headers={["Intern", "Date", "Time out", "Overtime", "Result", "Credited", "Remarks", "Reviewed"]}
              rows={historyList.map((o) => [
                <div className="ix-actions">
                  <Avatar name={o.intern_name} photo={o.intern_photo} size={30} />
                  <strong>{o.intern_name}</strong>
                </div>,
                String(o.date).slice(0, 10),
                clock(o.checked_out_at),
                fmtMinutes(o.ot_minutes),
                <span className={`os-status ${o.ot_status}`}>{cap(o.ot_status)}</span>,
                o.ot_status === "approved" ? fmtMinutes(o.ot_approved_minutes) : "—",
                <span className="os-remarks">{o.ot_remarks || "—"}</span>,
                fmtDate(o.ot_reviewed_at),
              ])}
              empty="No reviewed overtime yet."
            />
          </div>
        </>
      )}
    </>
  );
}


/* ───────────────────────── Time corrections ─────────────────────────
   An intern forgot to tap out and sends the time they left. Approving saves that time out,
   so the day gets its hours (official hours only, 8h cap). */
function CorrectionReview({ corrections, onRefresh }) {
  const [tab, setTab] = useState("pending");
  const [remarks, setRemarks] = useState({});
  const [processing, setProcessing] = useState(null);
  const [msg, setMsg] = useState(null);
  const [hStatus, setHStatus] = useState("all");
  const [q, setQ] = useState("");

  const pendingList = corrections.filter(fixForMe);
  const waitingList = corrections.filter(fixWaiting);
  const historyAll = corrections.filter((c) => c.status === "approved" || c.status === "rejected");
  const historyList = historyAll
    .filter((c) => hStatus === "all" || c.status === hStatus)
    .filter((c) => (c.intern_name || "").toLowerCase().includes(q.trim().toLowerCase()));

  const review = async (c, status) => {
    setProcessing(c.id + status); setMsg(null);
    try {
      const res = await fetch(`${API}/coordinator/time-corrections/${c.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ status, remarks: remarks[c.id] || "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Something went wrong.");
      setMsg({ type: "success", text: data.message });
      onRefresh();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    } finally {
      setProcessing(null);
    }
  };

  return (
    <>
      <PageHeader title="Time Corrections" sub="Interns who forgot to tap out ask you to set their time out." live />
      <Msg msg={msg} />
      <ReviewTabs tab={tab} setTab={setTab} pendingCount={pendingList.length} historyCount={historyAll.length} />
      {tab === "pending" && <WaitingList items={waitingList} what={(c) => `time out ${clock(c.requested_out)}`} />}

      {tab === "pending" ? (
        pendingList.length === 0 ? (
          <div className="ix-card ix-allgood">
            <div className="ix-empty-icon"><Icon name="check" size={30} /></div>
            <div className="ix-empty-title" style={{ fontSize: 17 }}>All caught up!</div>
            <div className="ix-empty-sub">No time corrections waiting for review.</div>
          </div>
        ) : (
          <div className="rv-list">
            {pendingList.map((c) => (
              <div key={c.id} className="rv-card">
                <div className="rv-who">
                  <Avatar name={c.intern_name} photo={c.intern_photo} size={36} />
                  <div>
                    <strong>{c.intern_name}</strong>
                    <span>{c.intern_email}</span>
                  </div>
                </div>
                <div className="rv-main">
                  <div className="rv-main-top">
                    <Badge label={String(c.date).slice(0, 10)} type="pending" />
                    <span className="rv-title">In {clock(c.checked_in_at)} → Out {clock(c.requested_out)}</span>
                  </div>
                  <div className="rv-desc" title={c.reason}>{c.reason}</div>
                  {c.status === "endorsed" ? (
                    <div className="rv-endorsed">
                      <Icon name="check" size={13} /> {c.endorser_name || "Supervisor"} confirmed this time out
                      {c.endorse_remarks ? ` · “${c.endorse_remarks}”` : ""}
                    </div>
                  ) : (
                    <div className="rv-endorsed none">No supervisor assigned — you decide directly.</div>
                  )}
                </div>
                <div className="rv-actions">
                  <input
                    type="text" className="ix-input" placeholder="Remarks (optional)"
                    value={remarks[c.id] || ""}
                    onChange={(e) => setRemarks((r) => ({ ...r, [c.id]: e.target.value }))}
                  />
                  <button className="ix-b danger" onClick={() => review(c, "rejected")} disabled={!!processing}>
                    {processing === c.id + "rejected" ? "..." : "Reject"}
                  </button>
                  <button className="ix-b ok" onClick={() => review(c, "approved")} disabled={!!processing}>
                    {processing === c.id + "approved" ? "..." : "Approve"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          <HistoryToolbar q={q} setQ={setQ} status={hStatus} setStatus={setHStatus} count={historyList.length} />
          <div className="ix-card flush">
            <Table
              headers={["Intern", "Date", "Time in", "Requested out", "Reason", "Result", "Remarks", "Reviewed"]}
              rows={historyList.map((c) => [
                <div className="ix-actions">
                  <Avatar name={c.intern_name} photo={c.intern_photo} size={30} />
                  <strong>{c.intern_name}</strong>
                </div>,
                String(c.date).slice(0, 10),
                clock(c.checked_in_at),
                clock(c.requested_out),
                <div className="rv-cell-text" title={c.reason}>{c.reason}</div>,
                <span className={`os-status ${c.status}`}>{cap(c.status)}</span>,
                <span className="os-remarks">{c.remarks || "—"}</span>,
                fmtDate(c.reviewed_at),
              ])}
              empty="No reviewed time corrections yet."
            />
          </div>
        </>
      )}
    </>
  );
}


/* ───────────────────────── Requirement due dates + reminders ─────────────────────────
   The coordinator sets a due date per requirement. Interns see "Due …" / "Overdue" on Submit MOV and get a
   notice when a requirement is due within 3 days. "Remind" sends a notification to everyone who hasn't
   submitted it (post-internship: only interns who already finished their hours). */
function DeadlinesModal({ onClose }) {
  const [dates, setDates] = useState({});      // "pre:moa" -> "2026-11-05"
  const [missing, setMissing] = useState({});  // "pre:moa" -> 3
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  const all = Object.entries(REQUIREMENTS_BY_PHASE).flatMap(([phase, list]) => list.map((r) => ({ ...r, phase, id: `${phase}:${r.key}` })));

  const load = async () => {
    try {
      const [d, m] = await Promise.all([
        fetch(`${API}/requirement-deadlines`, { headers: { Accept: "application/json" } }).then((r) => r.json()),
        fetch(`${API}/coordinator/requirement-deadlines/missing?${all.map((r) => "keys[]=" + encodeURIComponent(r.id)).join("&")}`,
          { headers: { Accept: "application/json" } }).then((r) => r.json()),
      ]);
      if (Array.isArray(d)) setDates(Object.fromEntries(d.map((x) => [`${x.phase}:${x.requirement}`, String(x.due_date).slice(0, 10)])));
      if (m && typeof m === "object" && !Array.isArray(m)) setMissing(m);
    } catch { setMsg({ type: "error", text: "Couldn't load the due dates." }); }
    finally { setLoading(false); }
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
  const remind = (r) => call("POST", "/coordinator/requirement-deadlines/remind", { requirement: r.key, phase: r.phase, label: r.label }, r.id);

  return (
    <Modal wide title="Due dates & reminders" sub="Leave a date blank for no due date. Weekly reports remind interns with nothing sent in the last 7 days." onClose={onClose}>
      <Msg msg={msg} />
      {loading ? <Spinner /> : (
        <div className="dl-list">
          {["pre", "during", "post"].map((phase) => (
            <div key={phase} className="dl-group">
              <div className="dl-phase">{PHASE_LABEL[phase]}</div>
              {all.filter((r) => r.phase === phase).map((r) => (
                <div key={r.id} className="dl-row">
                  <span className="dl-name">{r.label}</span>
                  <input type="date" className="ix-input dl-date" value={dates[r.id] || ""}
                    onChange={(e) => setDates((d) => ({ ...d, [r.id]: e.target.value }))} aria-label={`Due date of ${r.label}`} />
                  <span className={missing[r.id] ? "dl-miss" : "dl-miss ok"}>
                    {missing[r.id] === undefined ? "—" : missing[r.id] ? `${missing[r.id]} missing` : "All in"}
                  </span>
                  <button type="button" className="ix-b ghost sm" disabled={!!busy || !missing[r.id]} onClick={() => remind(r)}>
                    {busy === r.id ? "..." : "Remind"}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      <div className="dl-foot">
        <button type="button" className="ix-b ghost" onClick={onClose}>Close</button>
        <button type="button" className="ix-b primary" disabled={!!busy || loading} onClick={save}>{busy === "save" ? "Saving..." : "Save due dates"}</button>
      </div>
    </Modal>
  );
}

/* ───────────────────────── Work arrangement (WFH) requests ─────────────────────────
   WFH needs the HTE's letter, unless WFH is already stated in the MOA / Student Contract.
   Approving changes the intern's work mode (online attendance opens for WFH interns). */
function WorkModeReview({ requests, onRefresh }) {
  const [tab, setTab] = useState("pending");
  const [remarks, setRemarks] = useState({});
  const [processing, setProcessing] = useState(null);
  const [msg, setMsg] = useState(null);

  const pendingList = requests.filter((w) => w.status === "pending");
  const historyList = requests.filter((w) => w.status !== "pending");
  const modeLabel = (m) => (m === "offsite" ? "Work from home" : "Onsite");

  const review = async (w, status) => {
    setProcessing(w.id + status); setMsg(null);
    try {
      const res = await fetch(`${API}/coordinator/work-mode-requests/${w.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ status, remarks: remarks[w.id] || "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Something went wrong.");
      setMsg({ type: "success", text: data.message });
      onRefresh();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    } finally {
      setProcessing(null);
    }
  };

  const proof = (w) => w.file_path
    ? <a className="ix-link rv-file" href={`${STORAGE}${w.file_path}`} target="_blank" rel="noopener noreferrer"><Icon name="clip" size={13} /> {w.original_name || "HTE letter"}</a>
    : w.in_moa ? <span className="rv-endorsed">WFH is stated in the MOA / Student Contract</span>
    : <span className="rv-endorsed none">No letter (going back onsite)</span>;

  return (
    <>
      <PageHeader title="Work Arrangement" sub="WFH requests." live />
      <Msg msg={msg} />
      <ReviewTabs tab={tab} setTab={setTab} pendingCount={pendingList.length} historyCount={historyList.length} />
      {tab === "pending" ? (
        pendingList.length === 0 ? (
          <div className="ix-card ix-allgood">
            <div className="ix-empty-icon"><Icon name="check" size={30} /></div>
            <div className="ix-empty-title" style={{ fontSize: 17 }}>All caught up!</div>
            <div className="ix-empty-sub">No work arrangement requests waiting.</div>
          </div>
        ) : (
          <div className="rv-list">
            {pendingList.map((w) => (
              <div key={w.id} className="rv-card">
                <div className="rv-who">
                  <Avatar name={w.intern_name} photo={w.intern_photo} size={36} />
                  <div>
                    <strong>{w.intern_name}</strong>
                    <span>{w.placement || w.intern_email}</span>
                  </div>
                </div>
                <div className="rv-main">
                  <div className="rv-main-top">
                    <Badge label={`${modeLabel(w.current_mode)} → ${modeLabel(w.requested_mode)}`} type="pending" />
                  </div>
                  <div className="rv-desc" title={w.reason}>{w.reason}</div>
                  {proof(w)}
                </div>
                <div className="rv-actions">
                  <input type="text" className="ix-input" placeholder="Remarks (optional)"
                    value={remarks[w.id] || ""} onChange={(e) => setRemarks((r) => ({ ...r, [w.id]: e.target.value }))} />
                  <button className="ix-b danger" onClick={() => review(w, "rejected")} disabled={!!processing}>
                    {processing === w.id + "rejected" ? "..." : "Reject"}
                  </button>
                  <button className="ix-b ok" onClick={() => review(w, "approved")} disabled={!!processing}>
                    {processing === w.id + "approved" ? "..." : "Approve"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="ix-card flush">
          <Table
            headers={["Intern", "Request", "Proof", "Result", "Remarks", "Reviewed"]}
            rows={historyList.map((w) => [
              <div className="ix-actions"><Avatar name={w.intern_name} photo={w.intern_photo} size={30} /><strong>{w.intern_name}</strong></div>,
              modeLabel(w.requested_mode),
              proof(w),
              <span className={`os-status ${w.status}`}>{cap(w.status)}</span>,
              <span className="os-remarks">{w.remarks || "—"}</span>,
              fmtDate(w.reviewed_at),
            ])}
            empty="No reviewed requests yet."
          />
        </div>
      )}
    </>
  );
}

/* ───────────────────────── coordinator-only styles ─────────────────────────
   "Needs your review" card, compact review cards, print-card picker. Border / radius / shadow
   come from cardUnify, so changing --card-border there updates these too. */
const coordCss = `
.crd-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.crd-head h2 { font-size: 20px; font-weight: 800; letter-spacing: -.3px; color: var(--ink); margin: 0; }
.crd-head .ix-count { margin-left: auto; }
.crd-icon { width: 38px; height: 38px; border-radius: 13px; display: flex; align-items: center; justify-content: center; color: #fff; }
.crd-icon.orange { background: linear-gradient(135deg, #f2864f, #e8582a); box-shadow: 0 8px 16px rgba(232,88,42,0.3); }

.crd-rows { display: flex; flex-direction: column; gap: 8px; }
.crd-row {
  display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 12px; text-align: left; cursor: pointer;
  border-radius: 12px; border: 1px solid #f8eee8; background: #fff;
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
  padding: 10px 14px; background: #fff;
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
.dl-bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin: 0 0 14px;
  padding: 10px 14px; border-radius: 10px; background: #fff7ed; color: #9a3412; font-size: 13px; }
.dl-bar > span { display: inline-flex; align-items: center; gap: 8px; }
.dl-list { display: flex; flex-direction: column; gap: 14px; max-height: 60vh; overflow-y: auto; padding-right: 4px; }
.dl-phase { font-size: 11.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #9a8c84; margin-bottom: 4px; }
.dl-row { display: grid; grid-template-columns: minmax(0, 1fr) 160px 90px auto; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid #f3f4f6; }
.dl-name { font-size: 13px; color: #1f2937; }
.dl-date { padding: 6px 8px !important; font-size: 12.5px !important; }
.dl-miss { font-size: 12px; font-weight: 600; color: #b91c1c; text-align: right; }
.dl-miss.ok { color: #15803d; }
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