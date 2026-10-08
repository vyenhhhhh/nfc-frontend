// OjtCoordinatorDashboard.jsx
// The OJT coordinator's workspace: reviews online attendance + MOVs, manages NFC cards,
// monitors interns, and prints DTRs / consolidated reports.
import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Shell, {
  Spinner, PageHeader, Badge, Table, Section, Msg, Avatar, Ring, Icon,
  InternMonitor, AnnouncementManager, todayManila, fmtTime, greeting,
} from "../components/DashKit.jsx";
import NfcCards from "../components/NfcCards.jsx";
import {
  MiniStat, HomeCalendar, Records, Submissions, DTR, Reports, adminCss,
} from "./AdminDashboard.jsx";
import { formalLayout } from "../components/formalLayout.js";

const API = "http://localhost:8000/api";
const NAV = [
  { path: "/coordinator",             label: "Home",                icon: "home" },
  { path: "/coordinator/pending",     label: "Online Attendance",   icon: "inbox" },
  { path: "/coordinator/submissions", label: "MOV Submissions",     icon: "folder" },
  { path: "/coordinator/interns",     label: "Monitor Interns",     icon: "users" },
  { path: "/coordinator/records",     label: "Attendance Records",  icon: "list" },
  { path: "/coordinator/nfc",         label: "NFC Cards",           icon: "card" },
  { path: "/coordinator/dtr",         label: "Generate DTR",        icon: "file" },
  { path: "/coordinator/reports",     label: "Consolidated Report", icon: "chart" },
  { path: "/coordinator/profile",     label: "My Profile", icon: "user" },
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
    const iv = setInterval(fetchAll, 15000);
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
      <style>{adminCss}</style>
      <style>{coordCss}</style>
      <style>{formalLayout}</style>
      {path === "/coordinator" && (
        <Home
          user={user} pending={pending} pendingMovs={pendingMovs} records={records}
          interns={interns} loading={loading} go={navigate}
        />
      )}
      {path === "/coordinator/pending" && <Pending pending={pending} user={user} onRefresh={fetchAll} />}
      {path === "/coordinator/submissions" && <Submissions movs={movs} user={user} onRefresh={fetchAll} />}
      {path === "/coordinator/interns" && <InternMonitor interns={interns} records={records} loading={loading} onRefresh={fetchAll} />}
      {path === "/coordinator/records" && <Records records={records} loading={loading} />}
      {path === "/coordinator/nfc" && <NfcCards user={user} interns={interns} onRefresh={fetchAll} />}
      {path === "/coordinator/dtr" && <DTR interns={interns} records={records} />}
      {path === "/coordinator/reports" && <Reports interns={interns} records={records} />}
      {path === "/coordinator/announcements" && <AnnouncementManager user={user} />}
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

  return (
    <div className="adm-home">
      {/* ───── LEFT: hero, stats, live attendance ───── */}
      <div className="adm-col">
        <div className="ix-card adm-hero">
          <span className="adm-hero-glow" aria-hidden="true" />
          <div className="adm-hero-text">
            <span className="adm-hero-tag">OJT coordinator · {dateLabel}</span>
            <h1>{greeting()}, {first} </h1>
            <p>
              {toReview > 0
                ? `You have ${toReview} item${toReview > 1 ? "s" : ""} waiting for your review.`
                : "You're all caught up. Here's how your interns are doing today."}
            </p>
            <div className="adm-hero-facts">
              <div><strong>{checkedIn}</strong><span>checked in now</span></div>
              <div><strong>{todayRecs.length}</strong><span>records today</span></div>
              <div><strong>{toReview}</strong><span>to review</span></div>
            </div>
          </div>
          <Ring pct={pct} size={150} stroke={14} track="rgba(255,255,255,0.18)" color="#ffb48f">
            <strong>{checkedIn}/{interns.length}</strong>
            <span>interns in</span>
          </Ring>
        </div>

        <div className="adm-stats">
          <MiniStat icon="users" tone="orange" label="Total interns" value={interns.length} hint="under your watch" />
          <MiniStat icon="inbox" tone="blue" label="Online attendance" value={pending.length} hint="waiting for review" />
          <MiniStat icon="folder" tone="purple" label="MOV submissions" value={pendingMovs} hint="waiting for review" />
          <MiniStat icon="tap" tone="green" label="Checked in today" value={checkedIn} hint={`of ${interns.length} interns`} bar={pct} live={checkedIn > 0} />
        </div>

        <div className="adm-live">
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

/* ───────────────────────── Online attendance review ───────────────────────── */
function Pending({ pending, user, onRefresh }) {
  const [remarks, setRemarks] = useState({});
  const [processing, setProcessing] = useState(null);
  const [msg, setMsg] = useState(null);

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

  return (
    <>
      <PageHeader title="Online Attendance" sub="Review intern online attendance submissions." live />
      <Msg msg={msg} />
      {pending.length === 0 ? (
        <div className="ix-card ix-allgood">
          <div className="ix-empty-icon"><Icon name="check" size={30} /></div>
          <div className="ix-empty-title" style={{ fontSize: 17 }}>All caught up!</div>
          <div className="ix-empty-sub">No pending submissions to review.</div>
        </div>
      ) : (
        <div className="ix-list">
          {pending.map((sub) => (
            <div key={sub.id} className="ix-sub">
              <div className="ix-sub-top">
                <Avatar name={sub.intern_name} photo={sub.intern_photo} />
                <div className="ix-ic-id">
                  <strong>{sub.intern_name}</strong>
                  <span>{sub.intern_email}</span>
                </div>
                <Badge label={sub.date} type="pending" />
              </div>
              <div className="ix-desc-label">Task description</div>
              <div className="ix-desc">{sub.description}</div>
              <div className="ix-review">
                <input
                  type="text" className="ix-input" placeholder="Add remarks (optional)"
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
      )}
    </>
  );
}

/* ───────────────────────── coordinator-only styles ───────────────────────── */
const coordCss = `
.ix-content .ix-card.crd-review { padding: 20px 22px; background: linear-gradient(160deg, #fff 55%, #fff1e9); }
.crd-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.crd-head h2 { font-size: 20px; font-weight: 800; letter-spacing: -.3px; color: var(--ink); margin: 0; }
.crd-head .ix-count { margin-left: auto; }
.crd-icon { width: 38px; height: 38px; border-radius: 13px; display: flex; align-items: center; justify-content: center; color: #fff; }
.crd-icon.orange { background: linear-gradient(135deg, #f2864f, #e8582a); box-shadow: 0 8px 16px rgba(232,88,42,0.3); }

.crd-rows { display: flex; flex-direction: column; gap: 8px; }
.crd-row {
  display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 12px; text-align: left; cursor: pointer;
  border-radius: 16px; border: 1px solid #f8eee8; background: rgba(255,255,255,0.85);
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
.crd-empty { padding: 14px 16px; border-radius: 14px; border: 1.5px dashed #bfe8cf; background: rgba(255,255,255,0.7); }
.crd-empty strong { font-size: 14.5px; color: #3a2e28; }
.crd-empty p { margin-top: 4px; font-size: 13px; color: #9a8c84; }
@media (prefers-reduced-motion: reduce) { .crd-row { transition: none; } }
`;