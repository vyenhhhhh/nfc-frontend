// OjtCoordinatorDashboard.jsx
// The OJT coordinator's workspace: reviews online attendance + MOVs, manages NFC cards,
// monitors interns, and prints DTRs / consolidated reports.
import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Shell, {
  Spinner, PageHeader, Badge, Table, Section, Msg, Avatar, Icon,
  InternMonitor, AnnouncementManager, MyProfile, todayManila, fmtTime, greeting,
  PRE_REQUIREMENTS, POST_REQUIREMENTS,
} from "../components/DashKit.jsx";
import NfcCards from "../components/NfcCards.jsx";
import {
  HomeCalendar, Records, DTR, Reports, adminCss, adminMatch,
} from "./AdminDashboard.jsx";
import { internCss, cardUnify } from "./InternDashboard.jsx";
import { formalLayout } from "../components/formalLayout.js";
import { mdCss } from "../components/materialTheme.js";

const API = "http://localhost:8000/api";
const NAV = [
  { path: "/coordinator",               label: "Home",                icon: "home" },
  { path: "/coordinator/pending",       label: "Online Attendance",   icon: "inbox" },
  { path: "/coordinator/submissions",   label: "MOV Submissions",     icon: "folder" },
  { path: "/coordinator/interns",       label: "Monitor Interns",     icon: "users" },
  { path: "/coordinator/records",       label: "Attendance Records",  icon: "list" },
  { path: "/coordinator/nfc",           label: "NFC Cards",           icon: "card" },
  { path: "/coordinator/dtr",           label: "Generate DTR",        icon: "file" },
  { path: "/coordinator/reports",       label: "Consolidated Report", icon: "chart" },
  { path: "/coordinator/announcements", label: "Announcements",       icon: "bell" },
  { path: "/coordinator/profile",       label: "My Profile",          icon: "user" },
];

export default function OjtCoordinatorDashboard() {
  const user = JSON.parse(sessionStorage.getItem("user") || "{}");
  const { pathname: path } = useLocation();
  const navigate = useNavigate();
  const [pending, setPending] = useState([]);   // online attendance waiting for review
  const [movs, setMovs] = useState([]);
  const [records, setRecords] = useState([]);
  const [interns, setInterns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(() => { if (!document.hidden) fetchAll(); }, 15000);
    return () => clearInterval(iv);
  }, []);

  const fetchAll = async () => {
    try {
      const [p, m, r, u] = await Promise.all([
        fetch(`${API}/supervisor/pending`).then((r) => r.json()),
        fetch(`${API}/coordinator/movs`).then((r) => r.json()),
        fetch(`${API}/admin/all-attendance`).then((r) => r.json()),
        fetch(`${API}/admin/users`).then((r) => r.json()),
      ]);
      if (Array.isArray(p)) setPending(p);
      if (Array.isArray(m)) setMovs([...m]);
      if (Array.isArray(r)) setRecords([...r]);
      if (Array.isArray(u)) setInterns(u.filter((x) => x.role === "intern"));
    } catch (err) {
      console.error("Poll error:", err);
    } finally {
      setLoading(false);
    }
  };

  const pendingMovs = movs.filter((m) => m.status === "pending").length;

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
          user={user} pending={pending} pendingMovs={pendingMovs} records={records}
          interns={interns} loading={loading} go={navigate}
        />
      )}
      {path === "/coordinator/pending" && <Pending pending={pending} user={user} onRefresh={fetchAll} />}
      {path === "/coordinator/submissions" && <MovReview movs={movs} user={user} onRefresh={fetchAll} />}
      {path === "/coordinator/interns" && (
        <InternMonitor interns={interns} records={records} loading={loading} onRefresh={fetchAll} recordsPath="/coordinator/records" />
      )}
      {path === "/coordinator/records" && <Records records={records} loading={loading} />}
      {path === "/coordinator/nfc" && <NfcCards user={user} interns={interns} onRefresh={fetchAll} />}
      {path === "/coordinator/dtr" && <DTR interns={interns} records={records} />}
      {path === "/coordinator/reports" && <Reports interns={interns} records={records} />}
      {path === "/coordinator/announcements" && <AnnouncementManager user={user} />}
      {path === "/coordinator/profile" && <MyProfile user={user} />}
    </Shell>
  );
}

/* ───────────────────────── Home ───────────────────────── */
function Home({ user, pending, pendingMovs, records, interns, loading, go }) {
  const today = todayManila();
  const todayRecs = records.filter((r) => r.date === today);
  const inNowAll = todayRecs.filter((r) => r.action === "CHECK_IN" && !r.checked_out_at);
  // one entry per person, in case someone has more than one open check-in
  const inNow = inNowAll.filter((r, i, a) => a.findIndex((x) => (x.user_id ?? x.name) === (r.user_id ?? r.name)) === i);
  const checkedIn = inNow.length;
  const pct = interns.length ? (checkedIn / interns.length) * 100 : 0;
  const toReview = pending.length + pendingMovs;
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
    { icon: "inbox", label: "Attendance", to: "/coordinator/pending" },
    { icon: "folder", label: "MOVs", to: "/coordinator/submissions" },
    { icon: "users", label: "Monitor", to: "/coordinator/interns" },
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

        {/* live attendance */}
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
              <p>No online attendance or MOVs waiting.</p>
            </div>
          ) : (
            <div className="crd-rows">
              <button className="crd-row" onClick={() => go("/coordinator/pending")}>
                <span className="crd-row-ico blue"><Icon name="inbox" size={17} /></span>
                <span className="crd-row-text"><strong>Online attendance</strong><small>Remote workdays to approve</small></span>
                <span className="crd-row-n">{pending.length}</span>
              </button>
              <button className="crd-row" onClick={() => go("/coordinator/submissions")}>
                <span className="crd-row-ico purple"><Icon name="folder" size={17} /></span>
                <span className="crd-row-text"><strong>MOV submissions</strong><small>Documents and certificates</small></span>
                <span className="crd-row-n">{pendingMovs}</span>
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

/* ───────────────────────── shared bits for the two review pages ───────────────────────── */
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
// Must return the already reviewed (approved + rejected) online submissions.
// If your Laravel route has a different name, change it here.
const HISTORY_URL = `${API}/supervisor/history`;

function Pending({ pending, user, onRefresh }) {
  const [tab, setTab] = useState("pending");
  const [remarks, setRemarks] = useState({});
  const [processing, setProcessing] = useState(null);
  const [msg, setMsg] = useState(null);
  const [history, setHistory] = useState([]);
  const [histState, setHistState] = useState("loading"); // loading | ok | error
  const [hStatus, setHStatus] = useState("all");
  const [q, setQ] = useState("");

  const loadHistory = async () => {
    try {
      const res = await fetch(HISTORY_URL, { headers: { Accept: "application/json" } });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) throw new Error("bad response");
      setHistory(data);
      setHistState("ok");
    } catch {
      setHistState("error");
    }
  };
  useEffect(() => { loadHistory(); }, []);

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
      loadHistory();
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
          <Icon name="warn" size={18} />
          Couldn't load the history. The server route <code>&nbsp;{HISTORY_URL.replace(API, "/api")}&nbsp;</code> may not exist yet.
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
    const hit = [...PRE_REQUIREMENTS, ...POST_REQUIREMENTS].find((r) => r.key === m.requirement);
    return hit ? hit.label : m.requirement;
  };
  const phaseOf = (m) => ((m.phase || "pre") === "post" ? "post" : "pre");
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
    <a className="ix-link rv-file" href={`http://localhost:8000/storage/${m.file_path}`} target="_blank" rel="noopener noreferrer" title={m.original_name}>
      <Icon name="clip" size={13} /> {m.original_name}
    </a>
  );

  const phaseSelect = (
    <select className="ix-select" value={fPhase} onChange={(e) => setFPhase(e.target.value)} aria-label="Filter by phase">
      <option value="all">All phases</option>
      <option value="pre">Pre-internship</option>
      <option value="post">Post-internship</option>
    </select>
  );

  return (
    <>
      <PageHeader title="MOV Submissions" sub="Review intern-submitted documents (MOVs, forms, certificates)." live />
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
                      <Badge label={phaseOf(m) === "post" ? "Post" : "Pre"} type={phaseOf(m) === "post" ? "online" : "onsite"} />
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
                <Badge label={phaseOf(m) === "post" ? "Post" : "Pre"} type={phaseOf(m) === "post" ? "online" : "onsite"} />,
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

/* ───────────────────────── coordinator-only styles ─────────────────────────
   "Needs your review" card + compact review cards. Border / radius / shadow
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
.rv-cell-text { display: flex; flex-direction: column; max-width: 260px; white-space: normal; overflow-wrap: anywhere;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 13px; }
.rv-cell-text small { display: block; font-size: 11.5px; color: #94a3b8; }
@media (max-width: 1250px) { .rv-card { grid-template-columns: 200px minmax(0, 1fr); } .rv-actions { grid-column: 1 / -1; } }
@media (max-width: 700px) { .rv-card { grid-template-columns: 1fr; } .rv-actions { flex-wrap: wrap; } }
`;