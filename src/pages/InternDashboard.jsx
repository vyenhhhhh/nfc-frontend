// InternDashboard.jsx
import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import logo from "../assets/logo.png";

const API = "http://localhost:8000/api";
const REQUIRED_HOURS = 486;

const NAV = [
  { path: "/intern",         label: "Home",          icon: "home" },
  { path: "/intern/records", label: "My Attendance", icon: "list" },
  { path: "/intern/hours",   label: "Total Hours",   icon: "clock" },
  { path: "/intern/online",  label: "Submit Online", icon: "upload" },
  { path: "/intern/movs",    label: "Submit MOV",    icon: "folder" },
  { path: "/intern/profile", label: "My Profile",    icon: "user" },
];

/* ───────────────────────── icons ───────────────────────── */
const PATHS = {
  home: <path d="M3 11.5 12 4l9 7.5M5.5 10v10h13V10" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  logout: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  nfc: <path d="M8 8.5a5 5 0 0 1 0 7M12 6a8.5 8.5 0 0 1 0 12M16 3.5a12 12 0 0 1 0 17" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  warn: <><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v5M12 18h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  shrink: <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />,
  tap: <><path d="M9 11V5a2 2 0 0 1 4 0v6" /><path d="M13 11.5a2 2 0 0 1 4 0V14a6 6 0 0 1-6 6H10a5 5 0 0 1-4.3-2.5L3 13a1.6 1.6 0 0 1 2.6-1.8L9 14" /></>,
};
const Icon = ({ name, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {PATHS[name]}
  </svg>
);

/* ───────────────────────── small UI pieces ───────────────────────── */
const fmtTime = (v) => (v ? new Date(v).toLocaleTimeString("en-PH") : "—");

function Spinner() {
  return (
    <div className="ix-spin-wrap" role="status" aria-label="Loading">
      <div className="ix-spin" />
    </div>
  );
}

function PageHeader({ title, sub, live }) {
  return (
    <div className="ix-ph">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {live && (
        <span className="ix-live"><i /> Live</span>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, tone = "orange", sub }) {
  return (
    <div className="ix-stat">
      <div className={`ix-stat-icon ${tone}`}><Icon name={icon} size={20} /></div>
      <div>
        <div className="ix-stat-label">{label}</div>
        <div className="ix-stat-value">{value}</div>
        {sub && <div className="ix-stat-sub">{sub}</div>}
      </div>
    </div>
  );
}

function Badge({ label, type }) {
  return <span className={`ix-badge ${type}`}>{label}</span>;
}

function Section({ icon, title, count, children }) {
  return (
    <section className="ix-section">
      <header>
        <span className="ix-section-icon"><Icon name={icon} size={16} /></span>
        <h2>{title}</h2>
        {count !== undefined && <span className="ix-count">{count}</span>}
      </header>
      {children}
    </section>
  );
}

function Empty({ icon, title, sub }) {
  return (
    <div className="ix-empty">
      <div className="ix-empty-icon"><Icon name={icon} size={26} /></div>
      <div className="ix-empty-title">{title}</div>
      {sub && <div className="ix-empty-sub">{sub}</div>}
    </div>
  );
}

function Table({ headers, rows, empty = "Nothing here yet." }) {
  if (!rows.length) return <Empty icon="list" title={empty} />;
  return (
    <div className="ix-table-wrap">
      <table className="ix-table">
        <thead>
          <tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Ring({ pct, size = 140, stroke = 12, track = "rgba(255,255,255,0.28)", color = "#fff", children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(pct, 100));
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - clamped / 100)}
          style={{ transition: "stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      <div className="ix-ring-center">{children}</div>
    </div>
  );
}

/* ───────────────────────── main component ───────────────────────── */
export default function InternDashboard() {
  const user = JSON.parse(sessionStorage.getItem("user") || "{}");
  const navigate = useNavigate();
  const { pathname: path } = useLocation();

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isFull, setIsFull] = useState(false);

  // Not signed in? Back to the login page.
  useEffect(() => {
    if (!user.id) navigate("/login", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchRecords();
    const iv = setInterval(fetchRecords, 5000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    const onFs = () => setIsFull(!!document.fullscreenElement);
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, []);

  // close the sidebar after navigating (helps on mobile)
  useEffect(() => setMenuOpen(false), [path]);

  const fetchRecords = async () => {
    try {
      const res = await fetch(`${API}/intern/attendance?user_id=${user.id}`);
      const data = await res.json();
      setRecords(Array.isArray(data) ? data : []);
    } catch {
      /* keep whatever we already have */
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    sessionStorage.removeItem("user");
    localStorage.removeItem("ojt_remember"); // stops "Remember me" from signing back in
    navigate("/login", { replace: true });
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  // Stats
  const uniqueDays = [...new Set(records.map((r) => r.date))].length;
  const totalHours = calcTotalHours(records);
  const onsite = records.filter((r) => r.uid !== "ONLINE").length;
  const online = records.filter((r) => r.uid === "ONLINE").length;
  const lastTap = records[0];

  const firstName = user.name?.split(" ")[0] || "Intern";
  const initial = user.name?.charAt(0).toUpperCase() || "?";

  return (
    <div className="ix-page">
      {/* ── Top navbar ── */}
      <header className="ix-nav">
        <button className="ix-logo-btn" onClick={() => navigate("/intern")} aria-label="Home">
          <img src={logo} alt="CSU CCIS" className="ix-nav-logo" />
          <span className={menuOpen ? "ix-brand-name show" : "ix-brand-name"} aria-hidden={!menuOpen}>
            CARAGA STATE<br />UNIVERSITY
          </span>
        </button>

        <button
          className="ix-icon-btn"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <Icon name="menu" size={18} />
        </button>
        <button className="ix-icon-btn ix-fs-btn" aria-label="Toggle fullscreen" onClick={toggleFullscreen}>
          <Icon name={isFull ? "shrink" : "expand"} size={18} />
        </button>

        <div className="ix-nav-right">
          <div className="ix-user">
            <div className="ix-avatar">{initial}</div>
            <div className="ix-user-text">
              <strong>{user.name || "Intern"}</strong>
              <span>OJT Intern</span>
            </div>
          </div>
          <button className="ix-logout" onClick={logout}>
            <Icon name="logout" size={17} /> <span>Logout</span>
          </button>
        </div>
      </header>

      <div className="ix-body">
        {/* Sidebar: pushes the page when expanded */}
        <div className={menuOpen ? "ix-strip open" : "ix-strip"} />
        {menuOpen && <div className="ix-backdrop" onClick={() => setMenuOpen(false)} />}
        <aside className={menuOpen ? "ix-side open" : "ix-side"} aria-label="Main navigation">
          {NAV.map((it) => (
            <button
              key={it.path}
              className={path === it.path ? "ix-side-item active" : "ix-side-item"}
              onClick={() => navigate(it.path)}
              title={it.label}
              aria-current={path === it.path ? "page" : undefined}
            >
              <span className="ix-side-icon"><Icon name={it.icon} /></span>
              <span className="ix-side-label">{it.label}</span>
            </button>
          ))}
          <div className="ix-side-foot">CSU CCIS OJT</div>
        </aside>

        <main className="ix-main">
          <div className="ix-content" key={path}>
            {path === "/intern" && (
              <Home
                user={user} firstName={firstName} uniqueDays={uniqueDays} totalHours={totalHours}
                onsite={onsite} online={online} lastTap={lastTap} loading={loading} records={records}
              />
            )}
            {path === "/intern/records" && <Records records={records} loading={loading} />}
            {path === "/intern/hours" && <Hours records={records} loading={loading} />}
            {path === "/intern/online" && <SubmitOnline user={user} />}
            {path === "/intern/movs" && <SubmitMov user={user} />}
            {path === "/intern/profile" && <Profile user={user} uniqueDays={uniqueDays} totalHours={totalHours} />}
          </div>
        </main>
      </div>

      <style>{css}</style>
    </div>
  );
}

/* ───────────────────────── Home ───────────────────────── */
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function cheer(pct) {
  if (pct <= 0) return "Every tap counts. Your first one is waiting.";
  if (pct < 25) return "Great start! The hours are beginning to add up.";
  if (pct < 50) return "You're building real momentum. Keep tapping in!";
  if (pct < 75) return "Past the halfway mark. Look how far you've come.";
  if (pct < 100) return "Almost there. The finish line is in sight!";
  return "You did it! Your required hours are complete. 🎉";
}

function Home({ user, firstName, uniqueDays, totalHours, onsite, online, lastTap, loading, records }) {
  const needsCardWarning = user.work_mode !== "offsite" && user.tracking_type !== "output" && !user.has_card;
  const pct = (totalHours / REQUIRED_HOURS) * 100;
  const left = Math.max(REQUIRED_HOURS - totalHours, 0);

  return (
    <>
      <div className="ix-hero">
        <span className="ix-hero-blob b1" />
        <span className="ix-hero-blob b2" />
        <div className="ix-hero-text">
          <span className="ix-hero-tag"><Icon name="nfc" size={14} /> OJT Progress</span>
          <h1>{greeting()}, {firstName}!</h1>
          <p>{cheer(pct)}</p>
          <div className="ix-hero-facts">
            <div><strong>{totalHours}h</strong><span>completed</span></div>
            <div><strong>{left}h</strong><span>to go</span></div>
            <div><strong>{uniqueDays}</strong><span>days present</span></div>
          </div>
        </div>
        <Ring pct={pct} size={150} stroke={13}>
          <strong>{pct.toFixed(0)}%</strong>
          <span>of {REQUIRED_HOURS}h</span>
        </Ring>
      </div>

      {needsCardWarning && (
        <div className="ix-alert">
          <Icon name="warn" size={18} />
          No NFC card linked to your account yet. Contact your admin to register your card.
        </div>
      )}

      <div className="ix-stats">
        <StatCard label="Days Present" value={uniqueDays} icon="calendar" tone="orange" />
        <StatCard label="Total Hours" value={totalHours + "h"} icon="clock" tone="blue" />
        <StatCard label="Onsite Taps" value={onsite} icon="tap" tone="green" />
        <StatCard label="Online Logs" value={online} icon="globe" tone="purple" />
      </div>

      <div className="ix-grid-2">
        <Section icon="clock" title="Last Recorded Tap">
          {lastTap ? (
            <div className="ix-last">
              <Badge
                label={lastTap.action === "CHECK_IN" ? "CHECK IN" : "CHECK OUT"}
                type={lastTap.action === "CHECK_IN" ? "in" : "out"}
              />
              <div className="ix-last-date">{lastTap.date}</div>
              <div className="ix-last-time">
                {lastTap.checked_in_at ? new Date(lastTap.checked_in_at).toLocaleTimeString("en-PH") : "—"}
              </div>
            </div>
          ) : (
            <Empty icon="tap" title="No tap recorded yet" sub="Your latest check-in or check-out will appear here." />
          )}
        </Section>

        <Section icon="list" title="Recent Attendance" count={records.length}>
          {loading ? <Spinner /> : (
            <Table
              headers={["Date", "Type", "Action", "Time In", "Time Out"]}
              rows={records.slice(0, 5).map((r) => [
                r.date,
                <Badge label={r.uid === "ONLINE" ? "Online" : "Onsite"} type={r.uid === "ONLINE" ? "online" : "onsite"} />,
                <Badge label={r.action === "CHECK_IN" ? "IN" : "OUT"} type={r.action === "CHECK_IN" ? "in" : "out"} />,
                fmtTime(r.checked_in_at),
                fmtTime(r.checked_out_at),
              ])}
              empty="When you tap in or out, your records will appear here."
            />
          )}
        </Section>
      </div>
    </>
  );
}

/* ───────────────────────── Records ───────────────────────── */
function Records({ records, loading }) {
  const [filter, setFilter] = useState("all");
  const filtered =
    filter === "all" ? records
      : filter === "onsite" ? records.filter((r) => r.uid !== "ONLINE")
        : records.filter((r) => r.uid === "ONLINE");

  return (
    <>
      <PageHeader title="My Attendance Records" sub="Your complete attendance log, updated in real time." live />
      <div className="ix-pills">
        {["all", "onsite", "online"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={filter === f ? "ix-pill active" : "ix-pill"}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      <div className="ix-card flush">
        {loading ? <Spinner /> : (
          <Table
            headers={["Date", "Type", "Action", "Time In", "Time Out", "Token"]}
            rows={filtered.map((r) => [
              r.date,
              <Badge label={r.uid === "ONLINE" ? "Online" : "Onsite"} type={r.uid === "ONLINE" ? "online" : "onsite"} />,
              <Badge label={r.action === "CHECK_IN" ? "IN" : "OUT"} type={r.action === "CHECK_IN" ? "in" : "out"} />,
              fmtTime(r.checked_in_at),
              fmtTime(r.checked_out_at),
              <span className="ix-mono">{r.token?.substring(0, 36)}…</span>,
            ])}
            empty="No records match this filter."
          />
        )}
      </div>
    </>
  );
}

/* ───────────────────────── Hours ───────────────────────── */
function Hours({ records, loading }) {
  const totalHours = calcTotalHours(records);
  const uniqueDays = [...new Set(records.map((r) => r.date))].length;
  const avgHours = uniqueDays > 0 ? (totalHours / uniqueDays).toFixed(1) : 0;
  const pct = Math.min((totalHours / REQUIRED_HOURS) * 100, 100);

  const byDate = {};
  records.forEach((r) => {
    if (!byDate[r.date]) byDate[r.date] = { checkin: null, checkout: null };
    if (r.checked_in_at && !byDate[r.date].checkin) byDate[r.date].checkin = r.checked_in_at;
    if (r.checked_out_at && !byDate[r.date].checkout) byDate[r.date].checkout = r.checked_out_at;
  });

  const dailyRows = Object.entries(byDate)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, t]) => {
      const hrs = t.checkin && t.checkout
        ? ((new Date(t.checkout) - new Date(t.checkin)) / 3600000).toFixed(2)
        : "—";
      return [
        date,
        fmtTime(t.checkin),
        t.checkout ? fmtTime(t.checkout) : <span className="ix-muted">No checkout</span>,
        hrs !== "—" ? <strong>{hrs} hrs</strong> : "—",
      ];
    });

  return (
    <>
      <PageHeader title="Total Hours Summary" sub="Your computed OJT hours, day by day." />
      <div className="ix-stats">
        <StatCard label="Total Days" value={uniqueDays} icon="calendar" tone="orange" />
        <StatCard label="Total Hours" value={totalHours + "h"} icon="clock" tone="blue" />
        <StatCard label="Average / Day" value={avgHours + "h"} icon="tap" tone="green" />
        <StatCard label="Required" value={REQUIRED_HOURS + "h"} icon="folder" tone="purple" sub="Standard OJT requirement" />
      </div>

      <div className="ix-card">
        <div className="ix-card-label">OJT progress · {REQUIRED_HOURS} hours</div>
        <div className="ix-bar">
          <div className="ix-bar-fill" style={{ width: pct + "%" }} />
          {[25, 50, 75].map((m) => <i key={m} style={{ left: m + "%" }} />)}
        </div>
        <div className="ix-bar-marks"><span>0</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
        <div className="ix-bar-caption">
          <strong>{totalHours}h</strong> completed · <strong>{Math.max(REQUIRED_HOURS - totalHours, 0)}h</strong> remaining
        </div>
      </div>

      <div className="ix-card flush" style={{ marginTop: "1.25rem" }}>
        {loading ? <Spinner /> : <Table headers={["Date", "Time In", "Time Out", "Hours Worked"]} rows={dailyRows} empty="No hours logged yet." />}
      </div>
    </>
  );
}

/* ───────────────────────── Submit Online ───────────────────────── */
function SubmitOnline({ user }) {
  const [form, setForm] = useState({ date: "", description: "" });
  const [submitting, setSub] = useState(false);
  const [msg, setMsg] = useState(null);

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
    } catch (err) { setMsg({ type: "error", text: err.message }); }
    finally { setSub(false); }
  };

  return (
    <>
      <PageHeader title="Submit Online Attendance" sub="For asynchronous or remote workdays." />
      <div className="ix-card narrow">
        <div className="ix-note">
          <Icon name="info" size={18} />
          Submit your attendance for days you worked remotely. Your supervisor will review and approve or reject it.
        </div>
        {msg && <div className={`ix-msg ${msg.type}`}>{msg.text}</div>}
        <form onSubmit={handleSubmit} className="ix-form">
          <div className="ix-field">
            <label htmlFor="ix-date">Date of work</label>
            <input
              id="ix-date" type="date" value={form.date} required
              max={new Date().toISOString().split("T")[0]}
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
            {submitting ? "Submitting..." : "Submit for Supervisor Approval"}
          </button>
        </form>
      </div>
    </>
  );
}

/* ───────────────────────── Submit MOV ───────────────────────── */
function SubmitMov({ user }) {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [movs, setMovs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => { fetchMovs(); /* eslint-disable-next-line */ }, []);

  const fetchMovs = async () => {
    try {
      const res = await fetch(`${API}/intern/my-movs?user_id=${user.id}`);
      const data = await res.json();
      setMovs(Array.isArray(data) ? data : []);
    } finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setMsg({ type: "error", text: "Please select a file." }); return; }
    setSubmitting(true); setMsg(null);
    try {
      const fd = new FormData();
      fd.append("user_id", user.id);
      fd.append("title", title);
      fd.append("file", file);
      const res = await fetch(`${API}/intern/submit-mov`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setMsg({ type: "success", text: data.message });
      setTitle(""); setFile(null);
      fetchMovs();
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    } finally { setSubmitting(false); }
  };

  return (
    <>
      <PageHeader title="Submit MOV" sub="Upload documents, certificates, or forms for your coordinator to review." />
      <div className="ix-card narrow" style={{ marginBottom: "1.5rem" }}>
        {msg && <div className={`ix-msg ${msg.type}`}>{msg.text}</div>}
        <form onSubmit={handleSubmit} className="ix-form">
          <div className="ix-field">
            <label htmlFor="ix-title">Document title</label>
            <input
              id="ix-title" type="text" required placeholder="e.g. Endorsement Letter, MOA Copy"
              value={title} onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="ix-field">
            <label>File</label>
            <label className={file ? "ix-drop has-file" : "ix-drop"}>
              <input
                type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={(e) => setFile(e.target.files[0] || null)}
              />
              <span className="ix-drop-icon"><Icon name={file ? "file" : "upload"} size={22} /></span>
              <span className="ix-drop-text">
                {file ? file.name : "Click to choose a file"}
                <small>{file ? "Click to change" : "PDF, JPG, PNG, DOC or DOCX"}</small>
              </span>
            </label>
          </div>
          <button type="submit" disabled={submitting} className="ix-btn">
            {submitting ? "Uploading..." : "Submit MOV"}
          </button>
        </form>
      </div>

      <Section icon="folder" title="My Submissions" count={movs.length}>
        {loading ? <Spinner /> : (
          <Table
            headers={["Title", "File", "Status", "Remarks", "Submitted"]}
            rows={movs.map((m) => [
              <strong>{m.title}</strong>,
              <a
                className="ix-link"
                href={`http://localhost:8000/storage/${m.file_path}`}
                target="_blank" rel="noopener noreferrer"
              >
                {m.original_name}
              </a>,
              <Badge
                label={m.status.charAt(0).toUpperCase() + m.status.slice(1)}
                type={m.status === "approved" ? "approved" : m.status === "rejected" ? "rejected" : "pending"}
              />,
              m.remarks || "—",
              new Date(m.created_at).toLocaleDateString("en-PH"),
            ])}
            empty="No submissions yet."
          />
        )}
      </Section>
    </>
  );
}

/* ───────────────────────── Profile ───────────────────────── */
function Profile({ user, uniqueDays, totalHours }) {
  const pct = (totalHours / REQUIRED_HOURS) * 100;
  return (
    <>
      <PageHeader title="My Profile" sub="Your account information." />
      <div className="ix-profile">
        <div className="ix-card ix-profile-card">
          <div className="ix-profile-avatar">{user.name?.charAt(0).toUpperCase()}</div>
          <h2>{user.name}</h2>
          <p>{user.email}</p>
          <Badge label="OJT Intern" type="onsite" />
          <dl>
            {[
              ["User ID", "#" + user.id],
              ["Role", "OJT Intern"],
              ["Days done", uniqueDays + " days"],
              ["Hours", totalHours + " hours"],
            ].map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
        </div>

        <div className="ix-card ix-profile-progress">
          <div className="ix-card-label">OJT progress</div>
          <div className="ix-profile-ring">
            <Ring pct={pct} size={170} stroke={15} track="#fde3d6" color="#e8582a">
              <strong className="dark">{Math.min(pct, 100).toFixed(1)}%</strong>
              <span className="dark">complete</span>
            </Ring>
            <div className="ix-profile-ring-text">
              <div><strong>{totalHours}</strong> hrs completed</div>
              <div><strong>{REQUIRED_HOURS}</strong> hrs required</div>
              <div><strong>{Math.max(REQUIRED_HOURS - totalHours, 0)}</strong> hrs remaining</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ───────────────────────── helpers ───────────────────────── */
function calcTotalHours(records) {
  let total = 0;
  const byDate = {};
  records.forEach((r) => {
    if (!byDate[r.date]) byDate[r.date] = {};
    if (r.checked_in_at && !byDate[r.date].in) byDate[r.date].in = r.checked_in_at;
    if (r.checked_out_at && !byDate[r.date].out) byDate[r.date].out = r.checked_out_at;
  });
  Object.values(byDate).forEach(({ in: i, out: o }) => {
    if (i && o) total += (new Date(o) - new Date(i)) / 3600000;
  });
  return Math.round(total * 10) / 10;
}

/* ───────────────────────── styles ───────────────────────── */
const css = `
  .ix-page, .ix-page * { box-sizing: border-box; }
  html, body, #root { height: 100%; width: 100%; margin: 0; }
  .ix-page { font-family: 'Poppins', 'Segoe UI', sans-serif; color: #0f172a; }
  .ix-page h1, .ix-page h2, .ix-page p, .ix-page dl, .ix-page dd { margin: 0; }
  .ix-page button { font-family: inherit; }

  .ix-page { height: 100vh; min-height: 620px; display: flex; flex-direction: column; background: #f3f5f7; }

  /* ───── Navbar ───── */
  .ix-nav {
    height: 75px; flex-shrink: 0; background: #fff; display: flex; align-items: center; gap: 10px;
    padding: 0 22px 0 15px; position: relative; z-index: 30; box-shadow: 0 4px 14px rgba(15,23,42,0.12);
  }
  .ix-logo-btn { background: none; border: none; cursor: pointer; display: flex; align-items: center; text-align: left; margin-right: 14px; }
  .ix-nav-logo { height: 42px; width: auto; flex-shrink: 0; }
  .ix-brand-name {
    display: block; overflow: hidden; white-space: nowrap; max-width: 0; opacity: 0; margin-left: 0;
    font-size: 11.5px; font-weight: 800; line-height: 1.2; letter-spacing: .8px; color: #0b1220;
    transition: max-width .35s cubic-bezier(.2,.8,.2,1), opacity .25s, margin-left .35s;
  }
  .ix-brand-name.show { max-width: 170px; opacity: 1; margin-left: 10px; }
  .ix-icon-btn {
    background: none; border: none; cursor: pointer; padding: 8px; border-radius: 8px; display: flex;
    color: #1e293b; transition: background .15s, color .15s;
  }
  .ix-icon-btn:hover { background: #fdeee7; color: #e8582a; }
  .ix-nav-right { margin-left: auto; display: flex; align-items: center; gap: 14px; }
  .ix-user { display: flex; align-items: center; gap: 10px; }
  .ix-avatar {
    width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, #f2864f, #e8582a); color: #fff; font-weight: 700; font-size: 15px;
    box-shadow: 0 6px 14px rgba(232,88,42,0.35);
  }
  .ix-user-text { display: flex; flex-direction: column; line-height: 1.25; }
  .ix-user-text strong { font-size: 13px; font-weight: 700; }
  .ix-user-text span { font-size: 11px; color: #94a3b8; }
  .ix-logout {
    display: flex; align-items: center; gap: 7px; padding: 9px 14px; border-radius: 10px; cursor: pointer;
    background: #fff; border: 1.5px solid #e2e8f0; color: #334155; font-size: 13px; font-weight: 600;
    transition: all .15s;
  }
  .ix-logout:hover { border-color: #e8582a; color: #e8582a; background: #fdeee7; }
  .ix-icon-btn:focus-visible, .ix-logout:focus-visible, .ix-logo-btn:focus-visible, .ix-side-item:focus-visible,
  .ix-pill:focus-visible, .ix-btn:focus-visible { outline: 2px solid #e8582a; outline-offset: 2px; }

  /* ───── Sidebar (white, pushes the page) ───── */
  .ix-body { flex: 1; display: flex; min-height: 0; position: relative; }
  .ix-strip { width: 65px; flex-shrink: 0; transition: width .3s cubic-bezier(.2,.8,.2,1); }
  .ix-strip.open { width: 236px; }
  .ix-backdrop { display: none; position: absolute; inset: 0; background: rgba(15,23,42,0.35); z-index: 18; animation: ix-fade .2s; }
  .ix-side {
    position: absolute; top: 0; bottom: 0; left: 0; width: 65px; z-index: 20; overflow: hidden; background: #fff;
    box-shadow: 4px 0 18px rgba(15,23,42,0.10); display: flex; flex-direction: column; padding-top: 14px;
    transition: width .3s cubic-bezier(.2,.8,.2,1);
  }
  .ix-side.open { width: 236px; }
  .ix-side-item {
    position: relative; display: flex; align-items: center; gap: 16px; height: 48px; margin: 2px 10px; padding: 0 0 0 13px;
    border: none; background: none; cursor: pointer; color: #334155; border-radius: 12px; white-space: nowrap;
    text-align: left; transition: background .15s, color .15s;
  }
  .ix-side-item:hover { background: #fdeee7; color: #e8582a; }
  .ix-side-item.active { background: #fdeee7; color: #e8582a; }
  .ix-side-item.active::before { content: ""; position: absolute; left: -10px; top: 10px; bottom: 10px; width: 4px; border-radius: 0 4px 4px 0; background: #e8582a; }
  .ix-side-icon { display: flex; flex-shrink: 0; }
  .ix-side-label { font-size: 14px; font-weight: 600; opacity: 0; transform: translateX(-6px); transition: opacity .2s, transform .25s; }
  .ix-side.open .ix-side-label { opacity: 1; transform: none; transition-delay: .1s; }
  .ix-side-foot { margin-top: auto; padding: 18px 22px; font-size: 11px; letter-spacing: .5px; color: #94a3b8; white-space: nowrap; opacity: 0; transition: opacity .2s; }
  .ix-side.open .ix-side-foot { opacity: 1; transition-delay: .15s; }

  /* ───── Main ───── */
  .ix-main { flex: 1; min-width: 0; overflow-y: auto; padding: 28px 32px 40px; }
  .ix-content { max-width: 1180px; margin: 0 auto; animation: ix-rise .45s cubic-bezier(.2,.8,.2,1) both; }

  .ix-ph { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 22px; }
  .ix-ph h1 { font-size: 24px; font-weight: 800; letter-spacing: -0.4px; color: #0b1220; }
  .ix-ph p { font-size: 13.5px; color: #64748b; margin-top: 3px; }
  .ix-live { display: inline-flex; align-items: center; gap: 7px; padding: 5px 12px; border-radius: 99px; background: #ecfdf3; color: #15803d; font-size: 12px; font-weight: 600; }
  .ix-live i { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; animation: ix-blink 1.6s ease-in-out infinite; }

  /* ───── Hero ───── */
  .ix-hero {
    position: relative; overflow: hidden; display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-wrap: wrap;
    padding: 28px 32px; border-radius: 24px; margin-bottom: 20px; color: #fff;
    background: linear-gradient(135deg, #f2864f 0%, #e8582a 55%, #d94a1c 100%); box-shadow: 0 20px 44px rgba(232,88,42,0.30);
  }
  .ix-hero-blob { position: absolute; border-radius: 50%; background: rgba(255,255,255,0.10); pointer-events: none; }
  .ix-hero-blob.b1 { width: 320px; height: 320px; right: -80px; top: -140px; }
  .ix-hero-blob.b2 { width: 220px; height: 220px; left: 30%; bottom: -130px; background: rgba(255,255,255,0.07); }
  .ix-hero-text { position: relative; max-width: 560px; }
  .ix-hero-tag { display: inline-flex; align-items: center; gap: 6px; padding: 4px 11px; border-radius: 99px; background: rgba(255,255,255,0.2); font-size: 11.5px; font-weight: 600; }
  .ix-hero h1 { font-size: 28px; font-weight: 800; letter-spacing: -0.5px; margin-top: 12px; }
  .ix-hero p { font-size: 14px; line-height: 1.55; margin-top: 6px; color: rgba(255,255,255,0.92); }
  .ix-hero-facts { display: flex; gap: 26px; margin-top: 18px; flex-wrap: wrap; }
  .ix-hero-facts div { display: flex; flex-direction: column; }
  .ix-hero-facts strong { font-size: 20px; font-weight: 800; }
  .ix-hero-facts span { font-size: 11.5px; color: rgba(255,255,255,0.8); }
  .ix-ring-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #fff; }
  .ix-ring-center strong { font-size: 26px; font-weight: 800; line-height: 1.1; }
  .ix-ring-center span { font-size: 11px; opacity: .85; }
  .ix-ring-center .dark { color: #0b1220; opacity: 1; }
  .ix-ring-center span.dark { color: #64748b; }
  .ix-hero > div:last-child { position: relative; }

  .ix-alert { display: flex; align-items: center; gap: 10px; background: #fffbeb; border: 1px solid #fde68a; color: #92400e; border-radius: 14px; padding: 12px 16px; font-size: 13px; margin-bottom: 20px; }

  /* ───── Stats ───── */
  .ix-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 16px; margin-bottom: 20px; }
  .ix-stat { display: flex; align-items: center; gap: 14px; background: #fff; border-radius: 18px; padding: 18px; box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.05); transition: transform .2s, box-shadow .2s; }
  .ix-stat:hover { transform: translateY(-2px); box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 14px 30px rgba(15,23,42,0.09); }
  .ix-stat-icon { width: 46px; height: 46px; border-radius: 14px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .ix-stat-icon.orange { background: #fdeee7; color: #e8582a; }
  .ix-stat-icon.blue { background: #e8f1fd; color: #2563eb; }
  .ix-stat-icon.green { background: #e6f7ee; color: #16a34a; }
  .ix-stat-icon.purple { background: #f0eafd; color: #7c3aed; }
  .ix-stat-label { font-size: 11.5px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: .5px; }
  .ix-stat-value { font-size: 26px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.2; }
  .ix-stat-sub { font-size: 11px; color: #94a3b8; }

  /* ───── Cards / sections ───── */
  .ix-grid-2 { display: grid; grid-template-columns: 300px 1fr; gap: 20px; align-items: start; }
  .ix-section, .ix-card { background: #fff; border-radius: 20px; box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.05); overflow: hidden; }
  .ix-section header { display: flex; align-items: center; gap: 10px; padding: 16px 20px; border-bottom: 1px solid #f1f5f9; }
  .ix-section header h2 { font-size: 14.5px; font-weight: 700; }
  .ix-section-icon { width: 28px; height: 28px; border-radius: 9px; background: #fdeee7; color: #e8582a; display: flex; align-items: center; justify-content: center; }
  .ix-count { margin-left: auto; padding: 2px 10px; border-radius: 99px; background: #f1f5f9; color: #64748b; font-size: 12px; font-weight: 600; }
  .ix-card { padding: 22px; }
  .ix-card.flush { padding: 0; }
  .ix-card.narrow { max-width: 580px; }
  .ix-card-label { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .6px; }

  .ix-last { padding: 22px 20px; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
  .ix-last-date { font-size: 20px; font-weight: 800; margin-top: 8px; }
  .ix-last-time { font-size: 14px; color: #64748b; font-family: ui-monospace, monospace; }

  /* ───── Table ───── */
  .ix-table-wrap { overflow-x: auto; }
  .ix-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .ix-table th { text-align: left; padding: 12px 20px; font-size: 11px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: #94a3b8; background: #fafbfc; white-space: nowrap; }
  .ix-table td { padding: 13px 20px; border-top: 1px solid #f1f5f9; color: #334155; white-space: nowrap; }
  .ix-table tbody tr { transition: background .12s; }
  .ix-table tbody tr:hover { background: #fffaf7; }
  .ix-mono { font-family: ui-monospace, monospace; font-size: 10.5px; color: #94a3b8; }
  .ix-muted { color: #94a3b8; }
  .ix-link { color: #e8582a; font-weight: 600; text-decoration: none; }
  .ix-link:hover { text-decoration: underline; }

  .ix-badge { display: inline-block; padding: 3px 11px; border-radius: 99px; font-size: 11.5px; font-weight: 700; letter-spacing: .3px; }
  .ix-badge.in { background: #e6f7ee; color: #15803d; }
  .ix-badge.out { background: #fdeee7; color: #d94a1c; }
  .ix-badge.online { background: #f0eafd; color: #6d28d9; }
  .ix-badge.onsite { background: #e8f1fd; color: #1d4ed8; }
  .ix-badge.approved { background: #e6f7ee; color: #15803d; }
  .ix-badge.rejected { background: #fef2f2; color: #dc2626; }
  .ix-badge.pending { background: #fffbeb; color: #b45309; }

  .ix-empty { padding: 36px 20px; text-align: center; }
  .ix-empty-icon { width: 54px; height: 54px; margin: 0 auto 12px; border-radius: 50%; background: #fdeee7; color: #e8582a; display: flex; align-items: center; justify-content: center; }
  .ix-empty-title { font-size: 14px; font-weight: 700; }
  .ix-empty-sub { font-size: 12.5px; color: #94a3b8; margin-top: 3px; }

  .ix-spin-wrap { display: flex; justify-content: center; padding: 36px; }
  .ix-spin { width: 30px; height: 30px; border-radius: 50%; border: 3px solid #fde3d6; border-top-color: #e8582a; animation: ix-spin .8s linear infinite; }

  /* ───── Filters ───── */
  .ix-pills { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
  .ix-pill { padding: 7px 18px; border-radius: 99px; border: 1.5px solid #e2e8f0; background: #fff; color: #64748b; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .15s; }
  .ix-pill:hover { border-color: #f5b79f; color: #e8582a; }
  .ix-pill.active { background: linear-gradient(135deg, #f2733a, #e04a1a); border-color: transparent; color: #fff; box-shadow: 0 6px 14px rgba(232,88,42,0.3); }

  /* ───── Progress bar ───── */
  .ix-bar { position: relative; margin-top: 16px; height: 14px; border-radius: 99px; background: #f1f5f9; overflow: hidden; }
  .ix-bar-fill { height: 100%; border-radius: 99px; background: linear-gradient(90deg, #f2864f, #e8582a); transition: width .8s cubic-bezier(.2,.8,.2,1); }
  .ix-bar i { position: absolute; top: 0; bottom: 0; width: 2px; background: #fff; opacity: .9; }
  .ix-bar-marks { display: flex; justify-content: space-between; font-size: 10.5px; color: #94a3b8; margin-top: 6px; }
  .ix-bar-caption { font-size: 13px; color: #64748b; margin-top: 12px; }
  .ix-bar-caption strong { color: #0b1220; }

  /* ───── Forms ───── */
  .ix-form { display: flex; flex-direction: column; gap: 18px; }
  .ix-field { display: flex; flex-direction: column; gap: 6px; }
  .ix-field > label { font-size: 12px; font-weight: 700; color: #334155; letter-spacing: .2px; }
  .ix-field input[type="text"], .ix-field input[type="date"], .ix-field textarea {
    padding: 11px 14px; border: 1.5px solid #e2e8f0; border-radius: 12px; font-size: 14px; color: #1e293b;
    font-family: inherit; background: #fff; transition: border-color .15s, box-shadow .15s;
  }
  .ix-field textarea { resize: vertical; line-height: 1.6; }
  .ix-field input:focus, .ix-field textarea:focus { outline: none; border-color: #e8582a; box-shadow: 0 0 0 4px rgba(232,88,42,0.12); }
  .ix-field input::placeholder, .ix-field textarea::placeholder { color: #b6c0cc; }
  .ix-btn {
    padding: 13px; border: none; border-radius: 12px; cursor: pointer; color: #fff; font-size: 14px; font-weight: 700; letter-spacing: .3px;
    background: linear-gradient(135deg, #f2733a, #e04a1a); box-shadow: 0 10px 22px rgba(232,88,42,0.32); transition: transform .15s, box-shadow .15s;
  }
  .ix-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 14px 28px rgba(232,88,42,0.4); }
  .ix-btn:disabled { opacity: .7; cursor: default; }
  .ix-note { display: flex; gap: 10px; align-items: flex-start; font-size: 13px; line-height: 1.55; color: #9a3412; background: #fff5ef; border: 1px solid #fde1d5; padding: 12px 14px; border-radius: 12px; margin-bottom: 18px; }
  .ix-note svg { flex-shrink: 0; margin-top: 1px; color: #e8582a; }
  .ix-msg { padding: 10px 14px; border-radius: 10px; border: 1px solid; font-size: 13px; margin-bottom: 16px; }
  .ix-msg.success { background: #f0fdf4; border-color: #86efac; color: #15803d; }
  .ix-msg.error { background: #fef2f2; border-color: #fca5a5; color: #dc2626; }

  .ix-drop { position: relative; display: flex; align-items: center; gap: 14px; padding: 18px; border: 2px dashed #f5b79f; border-radius: 14px; background: #fffaf7; cursor: pointer; transition: all .15s; }
  .ix-drop:hover { border-color: #e8582a; background: #fff5ef; }
  .ix-drop.has-file { border-style: solid; border-color: #e8582a; }
  .ix-drop input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
  .ix-drop-icon { width: 46px; height: 46px; border-radius: 14px; background: #fdeee7; color: #e8582a; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .ix-drop-text { display: flex; flex-direction: column; font-size: 13.5px; font-weight: 600; color: #1e293b; min-width: 0; word-break: break-all; }
  .ix-drop-text small { font-size: 11.5px; font-weight: 400; color: #94a3b8; margin-top: 2px; }

  /* ───── Profile ───── */
  .ix-profile { display: grid; grid-template-columns: 300px 1fr; gap: 20px; align-items: start; }
  .ix-profile-card { text-align: center; }
  .ix-profile-avatar { width: 84px; height: 84px; border-radius: 50%; margin: 0 auto 14px; display: flex; align-items: center; justify-content: center; font-size: 34px; font-weight: 800; color: #fff; background: linear-gradient(135deg, #f2864f, #e8582a); box-shadow: 0 12px 26px rgba(232,88,42,0.38); }
  .ix-profile-card h2 { font-size: 18px; font-weight: 800; }
  .ix-profile-card p { font-size: 13px; color: #64748b; margin: 3px 0 10px; }
  .ix-profile-card dl { margin-top: 18px; padding-top: 16px; border-top: 1px solid #f1f5f9; text-align: left; }
  .ix-profile-card dl div { display: flex; justify-content: space-between; margin-bottom: 11px; }
  .ix-profile-card dt { font-size: 12px; color: #94a3b8; }
  .ix-profile-card dd { font-size: 13px; font-weight: 600; color: #1e293b; }
  .ix-profile-ring { display: flex; align-items: center; gap: 32px; margin-top: 20px; flex-wrap: wrap; }
  .ix-profile-ring-text { display: flex; flex-direction: column; gap: 10px; font-size: 13.5px; color: #64748b; }
  .ix-profile-ring-text strong { color: #0b1220; font-size: 18px; }

  /* ───── Motion ───── */
  @keyframes ix-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
  @keyframes ix-fade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes ix-spin { to { transform: rotate(360deg); } }
  @keyframes ix-blink { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
  @media (prefers-reduced-motion: reduce) {
    .ix-content, .ix-live i, .ix-spin { animation: none !important; }
    .ix-side, .ix-strip, .ix-side-label, .ix-brand-name { transition: none !important; }
  }

  /* ───── Responsive ───── */
  @media (max-width: 1000px) {
    .ix-grid-2, .ix-profile { grid-template-columns: 1fr; }
  }
  @media (max-width: 900px) {
    .ix-strip, .ix-strip.open { width: 0; }
    .ix-side { width: 0; }
    .ix-side.open { width: 236px; box-shadow: 10px 0 40px rgba(0,0,0,0.25); }
    .ix-backdrop { display: block; }
    .ix-fs-btn { display: none; }
    .ix-main { padding: 20px 16px 32px; }
  }
  @media (max-width: 600px) {
    .ix-user-text, .ix-logout span { display: none; }
    .ix-logout { padding: 9px; }
    .ix-hero { padding: 22px; }
    .ix-hero h1 { font-size: 22px; }
    .ix-brand-name { font-size: 9.5px; letter-spacing: .4px; }
    .ix-brand-name.show { max-width: 110px; margin-left: 6px; }
  }
`;