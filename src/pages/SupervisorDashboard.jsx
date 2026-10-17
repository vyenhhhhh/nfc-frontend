// SupervisorDashboard.jsx
// The supervisor's workspace (read-only): sees interns' attendance, DTRs and reports.
import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Shell, {
  Spinner, Badge, Table, Section, Avatar, Icon,
  InternMonitor, AnnouncementBoard, todayManila, fmtTime, greeting,
} from "../components/DashKit.jsx";
import {
  HomeCalendar, Records, DTR, Reports, AdminProfile, adminCss, adminMatch,
} from "./AdminDashboard.jsx";
import { internCss, cardUnify } from "./InternDashboard.jsx";
import { formalLayout } from "../components/formalLayout.js";
import { mdCss } from "../components/materialTheme.js";

const API = "http://localhost:8000/api";
const NAV = [
  { path: "/supervisor",          label: "Home",                icon: "home" },
  { path: "/supervisor/interns",  label: "Monitor Interns",     icon: "users" },
  { path: "/supervisor/records",  label: "Attendance Records",  icon: "list" },
  { path: "/supervisor/dtr",      label: "Generate DTR",        icon: "file" },
  { path: "/supervisor/reports",  label: "Consolidated Report", icon: "chart" },
  { path: "/supervisor/profile",  label: "My Profile",          icon: "user" },
];

export default function SupervisorDashboard() {
  const user = JSON.parse(sessionStorage.getItem("user") || "{}");
  const { pathname: path } = useLocation();
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [interns, setInterns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(() => { if (!document.hidden) fetchAll(); }, 15000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAll = async () => {
    try {
      const [r, u] = await Promise.all([
        fetch(`${API}/admin/all-attendance`).then((r) => r.json()),
        fetch(`${API}/admin/users`).then((r) => r.json()),
      ]);
      if (Array.isArray(r)) setRecords([...r]);
      if (Array.isArray(u)) setInterns(u.filter((x) => x.role === "intern"));
    } catch (err) {
      console.error("Poll error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Shell navItems={NAV} user={user}>
      {/* same order as the admin dashboard so every page looks identical */}
      <style>{adminCss}</style>
      <style>{internCss}</style>
      <style>{formalLayout}</style>
      <style>{mdCss}</style>
      <style>{cardUnify}</style>
      <style>{adminMatch}</style>
      {path === "/supervisor" && (
        <Home user={user} records={records} interns={interns} loading={loading} go={navigate} />
      )}
      {path === "/supervisor/interns" && (
        <InternMonitor
          interns={interns} records={records} loading={loading} onRefresh={fetchAll}
          recordsPath="/supervisor/records"
        />
      )}
      {path === "/supervisor/records" && <Records records={records} loading={loading} />}
      {path === "/supervisor/dtr" && <DTR interns={interns} records={records} />}
      {path === "/supervisor/reports" && <Reports interns={interns} records={records} />}
      {path === "/supervisor/profile" && <AdminProfile user={user} />}
    </Shell>
  );
}

/* ───────────────────────── Home ───────────────────────── */
function Home({ user, records, interns, loading, go }) {
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
    { icon: "users", tone: "orange", label: "Total interns", value: interns.length, hint: "under monitoring" },
    { icon: "tap", tone: "green", label: "Present now", value: checkedIn, hint: `of ${interns.length} interns`, bar: pct },
    { icon: "list", tone: "purple", label: "Today's records", value: todayRecs.length, hint: "taps and logs" },
    { icon: "clock", tone: "blue", label: "Not in yet", value: Math.max(interns.length - checkedIn, 0), hint: "interns today" },
  ];

  const quick = [
    { icon: "users", label: "Monitor", to: "/supervisor/interns" },
    { icon: "list", label: "Records", to: "/supervisor/records" },
    { icon: "file", label: "DTR", to: "/supervisor/dtr" },
  ];

  return (
    <div className="adm-home">
      {/* ───── LEFT ───── */}
      <div className="adm-col">
        <div className="hv-hero">
          <span className="hv-blob a" aria-hidden="true" />
          <span className="hv-blob b" aria-hidden="true" />

          <div className="hv-hero-main">
            <span className={`hv-pill ${checkedIn > 0 ? "live" : "idle"}`}>
              <i aria-hidden="true" /> {checkedIn > 0 ? `${checkedIn} on the clock now` : "Nobody checked in yet"}
            </span>
            <h1>{greeting()}, {first}</h1>
            <p>Here's how your interns are doing today. {dateLabel}.</p>
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

      {/* ───── RIGHT: calendar, on duty, announcements ───── */}
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

        <AnnouncementBoard limit={3} />
      </div>
    </div>
  );
}