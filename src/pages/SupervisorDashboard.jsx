// SupervisorDashboard.jsx
// The supervisor's workspace (read-only): sees interns' attendance, DTRs and reports.
import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import Shell, {
  Ring, InternMonitor, MyProfile, AnnouncementBoard, todayManila, greeting,
} from "../components/DashKit.jsx";
import { MiniStat, HomeCalendar, Records, DTR, Reports, adminCss } from "./AdminDashboard.jsx";
import { formalLayout } from "../components/formalLayout.js";

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
      if (Array.isArray(r)) setRecords(r);
      if (Array.isArray(u)) setInterns(u.filter((x) => x.role === "intern"));
    } catch (err) {
      console.error("Poll error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Shell navItems={NAV} user={user}>
      <style>{adminCss}</style>
      <style>{formalLayout}</style>
      {path === "/supervisor" && <Home user={user} records={records} interns={interns} />}
      {path === "/supervisor/interns" && <InternMonitor interns={interns} records={records} loading={loading} onRefresh={fetchAll} />}
      {path === "/supervisor/records" && <Records records={records} loading={loading} />}
      {path === "/supervisor/dtr" && <DTR interns={interns} records={records} />}
      {path === "/supervisor/reports" && <Reports interns={interns} records={records} />}
      {path === "/supervisor/profile" && <MyProfile user={user} />}
    </Shell>
  );
}

function Home({ user, records, interns }) {
  const today = todayManila();
  const todayRecs = records.filter((r) => r.date === today);
  const inNowAll = todayRecs.filter((r) => r.action === "CHECK_IN" && !r.checked_out_at);
  const inNow = inNowAll.filter((r, i, a) => a.findIndex((x) => (x.user_id ?? x.name) === (r.user_id ?? r.name)) === i);
  const checkedIn = inNow.length;
  const pct = interns.length ? (checkedIn / interns.length) * 100 : 0;
  const first = user.name?.split(" ")[0] || "there";
  const dateLabel = new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="adm-home">
      <div className="adm-col">
        <div className="ix-card adm-hero">
          <span className="adm-hero-glow" aria-hidden="true" />
          <div className="adm-hero-text">
            <span className="adm-hero-tag">Supervisor · {dateLabel}</span>
            <h1>{greeting()}, {first}</h1>
            <p>Here's how your interns are doing today.</p>
            <div className="adm-hero-facts">
              <div><strong>{checkedIn}</strong><span>checked in now</span></div>
              <div><strong>{todayRecs.length}</strong><span>records today</span></div>
              <div><strong>{interns.length}</strong><span>interns</span></div>
            </div>
          </div>
          <Ring pct={pct} size={150} stroke={14} track="rgba(255,255,255,0.18)" color="#ffb48f">
            <strong>{checkedIn}/{interns.length}</strong>
            <span>interns in</span>
          </Ring>
        </div>

        <div className="adm-stats">
          <MiniStat icon="users" tone="orange" label="Interns" value={interns.length} hint="Under monitoring" />
          <MiniStat icon="clock" tone="green" label="Present now" value={checkedIn} hint="Live" live bar={pct} />
        </div>

        <AnnouncementBoard limit={3} />
      </div>

      <div className="adm-col">
        <HomeCalendar />
      </div>
    </div>
  );
}