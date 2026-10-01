// SupervisorDashboard.jsx
import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Shell, {
  Spinner, PageHeader, StatCard, Badge, Table, Section, Empty, Msg, Bar, Avatar, Hero, Icon,
  InternMonitor, todayManila, fmtTime, calcHours, greeting, REQUIRED_HOURS,
} from "../components/DashKit.jsx";
import NfcCards from "../components/NfcCards.jsx";

const API = "http://localhost:8000/api";
const NAV = [
  { path: "/supervisor",         label: "Home",                icon: "home" },
  { path: "/supervisor/pending", label: "Pending Submissions", icon: "inbox" },
  { path: "/supervisor/interns", label: "Monitor Interns",     icon: "users" },
  { path: "/supervisor/records", label: "Attendance Records",  icon: "list" },
  { path: "/supervisor/hours",   label: "Hours Summary",       icon: "clock" },
  { path: "/supervisor/nfc",     label: "NFC Cards",           icon: "card" },
];

export default function SupervisorDashboard() {
  const user = JSON.parse(sessionStorage.getItem("user") || "{}");
  const { pathname: path } = useLocation();
  const navigate = useNavigate();
  const [pending, setPending] = useState([]);
  const [records, setRecords] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 5000);
    return () => clearInterval(iv);
  }, []);

  const fetchAll = async () => {
    try {
      const [p, r, u] = await Promise.all([
        fetch(`${API}/supervisor/pending`).then((r) => r.json()),
        fetch(`${API}/admin/all-attendance`).then((r) => r.json()),
        fetch(`${API}/admin/users`).then((r) => r.json()),
      ]);
      if (Array.isArray(p)) setPending(p);
      if (Array.isArray(r)) setRecords(r);
      if (Array.isArray(u)) setUsers(u.filter((x) => x.role === "intern"));
    } catch (err) {
      console.error("Poll error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Shell navItems={NAV} user={user}>
      {path === "/supervisor" && (
        <Home user={user} pending={pending} records={records} users={users} loading={loading}
          onReview={() => navigate("/supervisor/pending")} />
      )}
      {path === "/supervisor/pending" && <Pending pending={pending} user={user} onRefresh={fetchAll} />}
      {path === "/supervisor/interns" && <InternMonitor interns={users} records={records} loading={loading} onRefresh={fetchAll} />}
      {path === "/supervisor/records" && <Records records={records} loading={loading} />}
      {path === "/supervisor/hours" && <Hours records={records} users={users} loading={loading} />}
      {path === "/supervisor/nfc" && <NfcCards user={user} interns={users} onRefresh={fetchAll} />}
    </Shell>
  );
}

/* ───────────────────────── Home ───────────────────────── */
function Home({ user, pending, records, users, loading, onReview }) {
  const today = todayManila();
  const todayRecs = records.filter((r) => r.date === today);
  const checkedIn = todayRecs.filter((r) => r.action === "CHECK_IN" && !r.checked_out_at).length;
  const pct = users.length ? (checkedIn / users.length) * 100 : 0;
  const first = user.name?.split(" ")[0] || "there";

  return (
    <>
      <Hero
        tag="Supervisor overview"
        title={`${greeting()}, ${first}!`}
        text={
          pending.length > 0
            ? `You have ${pending.length} submission${pending.length > 1 ? "s" : ""} waiting for your review.`
            : "You're all caught up. Here's how your interns are doing today."
        }
        facts={[
          { v: checkedIn, l: "checked in now" },
          { v: todayRecs.length, l: "records today" },
          { v: pending.length, l: "to review" },
        ]}
        ring={{ pct, top: `${checkedIn}/${users.length}`, bottom: "interns in" }}
      />

      {pending.length > 0 && (
        <div className="ix-alert">
          <Icon name="warn" size={18} />
          {pending.length} pending submission{pending.length > 1 ? "s" : ""} need your review.
          <button className="ix-b primary sm" onClick={onReview}>Review now</button>
        </div>
      )}

      <div className="ix-stats">
        <StatCard label="Total Interns" value={users.length} icon="users" tone="orange" />
        <StatCard label="Pending Submissions" value={pending.length} icon="inbox" tone="blue" sub="Needs your review" />
        <StatCard label="Checked In Today" value={checkedIn} icon="tap" tone="green" />
        <StatCard label="Today's Records" value={todayRecs.length} icon="list" tone="purple" />
      </div>

      <Section icon="clock" title="Today's Activity" count={todayRecs.length} live>
        {loading ? <Spinner /> : (
          <Table
            headers={["Intern", "Type", "Action", "Time"]}
            rows={todayRecs.map((r) => [
              <strong>{r.name}</strong>,
              <Badge label={r.uid === "ONLINE" ? "Online" : "Onsite"} type={r.uid === "ONLINE" ? "online" : "onsite"} />,
              <Badge label={r.action === "CHECK_IN" ? "IN" : "OUT"} type={r.action === "CHECK_IN" ? "in" : "out"} />,
              fmtTime(r.checked_in_at),
            ])}
            empty="No activity today yet."
          />
        )}
      </Section>
    </>
  );
}

/* ───────────────────────── Pending ───────────────────────── */
function Pending({ pending, user, onRefresh }) {
  const [remarks, setRemarks] = useState({});
  const [processing, setProcessing] = useState(null);
  const [msg, setMsg] = useState(null);

  const handleValidate = async (id, action) => {
    setProcessing(id + action); setMsg(null);
    try {
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
      <PageHeader title="Pending Submissions" sub="Review intern online attendance submissions." live />
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

/* ───────────────────────── Records ───────────────────────── */
function Records({ records, loading }) {
  const [search, setSearch] = useState("");
  const filtered = records.filter((r) => r.name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <PageHeader title="Attendance Records" sub="All intern attendance logs." live />
      <div className="ix-toolbar">
        <div className="ix-search">
          <Icon name="search" size={16} />
          <input type="text" placeholder="Search by intern name..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <span className="ix-chip">{filtered.length} records</span>
      </div>
      <div className="ix-card flush">
        {loading ? <Spinner /> : (
          <Table
            headers={["Intern", "Date", "Type", "Action", "Time In", "Time Out"]}
            rows={filtered.map((r) => [
              <strong>{r.name}</strong>,
              r.date,
              <Badge label={r.uid === "ONLINE" ? "Online" : "Onsite"} type={r.uid === "ONLINE" ? "online" : "onsite"} />,
              <Badge label={r.action === "CHECK_IN" ? "IN" : "OUT"} type={r.action === "CHECK_IN" ? "in" : "out"} />,
              fmtTime(r.checked_in_at),
              fmtTime(r.checked_out_at),
            ])}
            empty="No records match your search."
          />
        )}
      </div>
    </>
  );
}

/* ───────────────────────── Hours ───────────────────────── */
function Hours({ records, users, loading }) {
  const internHours = users.map((u) => {
    const recs = records.filter((r) => r.user_id === u.id);
    const days = [...new Set(recs.map((r) => r.date))].length;
    const total = calcHours(recs);
    const pct = Math.min(Math.round((total / REQUIRED_HOURS) * 100), 100);
    return { id: u.id, name: u.name, email: u.email, photo: u.photo, days, total, pct };
  });

  return (
    <>
      <PageHeader title="Hours Summary" sub="Total hours worked by each intern." />
      {loading ? <Spinner /> : internHours.length === 0 ? (
        <div className="ix-card"><Empty icon="clock" title="No interns yet" /></div>
      ) : (
        <div className="ix-hours-grid">
          {internHours.map((intern) => (
            <div key={intern.id} className="ix-hc">
              <div className="ix-hc-top">
                <Avatar name={intern.name} photo={intern.photo} />
                <div className="ix-ic-id">
                  <strong>{intern.name}</strong>
                  <span>{intern.days} days present</span>
                </div>
                <div className="ix-hc-hours">
                  <strong>{intern.total}h</strong>
                  <span>of {REQUIRED_HOURS}h</span>
                </div>
              </div>
              <Bar pct={intern.pct} />
              <div className="ix-hc-foot">
                <span>{intern.pct}% complete</span>
                <span>{Math.max(Math.round((REQUIRED_HOURS - intern.total) * 10) / 10, 0)}h to go</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}