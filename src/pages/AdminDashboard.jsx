// AdminDashboard.jsx
import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import Shell, {
  Spinner, PageHeader, StatCard, Badge, Table, Section, Empty, Msg, Modal, Bar, Avatar, Ring, Icon, PhotoPicker,
  InternMonitor, todayManila, fmtTime, calcHours, greeting, esc, REQUIRED_HOURS,
} from "../components/DashKit.jsx";

const API = "http://localhost:8000/api";
const NAV = [
  { path: "/admin",          label: "Home",                icon: "home" },
  { path: "/admin/interns",  label: "Monitor Interns",     icon: "users" },
  { path: "/admin/records",  label: "Attendance Records",  icon: "list" },
  { path: "/admin/hours",    label: "Hours Summary",       icon: "clock" },
  { path: "/admin/accounts", label: "Manage Accounts",     icon: "settings" },
  { path: "/admin/dtr",      label: "Generate DTR",        icon: "file" },
  { path: "/admin/reports",  label: "Consolidated Report", icon: "chart" },
  { path: "/admin/calendar", label: "Calendar",            icon: "calendar" },
];

export default function AdminDashboard() {
  const user = JSON.parse(sessionStorage.getItem("user") || "{}");
  const { pathname: path } = useLocation();
  const [records, setRecords] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 3000);
    return () => clearInterval(iv);
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

  return (
    <Shell navItems={NAV} user={user}>
      <style>{adminCss}</style>
      {path === "/admin" && <Home user={user} records={records} interns={interns} coordinators={coordinators} loading={loading} />}
      {path === "/admin/interns" && <InternMonitor interns={interns} records={records} loading={loading} onRefresh={fetchAll} />}
      {path === "/admin/records" && <Records records={records} loading={loading} />}
      {path === "/admin/hours" && <Hours records={records} interns={interns} loading={loading} />}
      {path === "/admin/accounts" && <Accounts users={users} onRefresh={fetchAll} />}
      {path === "/admin/calendar" && <Calendar />}
      {path === "/admin/dtr" && <DTR interns={interns} records={records} />}
      {path === "/admin/reports" && <Reports interns={interns} records={records} />}
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
  const today = todayManila();
  const todayRecs = records.filter((r) => r.date === today);
  const inNowAll = todayRecs.filter((r) => r.action === "CHECK_IN" && !r.checked_out_at);
  // one entry per person, in case someone has more than one open check-in
  const inNow = inNowAll.filter((r, i, a) => a.findIndex((x) => (x.user_id ?? x.name) === (r.user_id ?? r.name)) === i);
  const checkedIn = inNow.length;
  const pct = interns.length ? (checkedIn / interns.length) * 100 : 0;
  const first = user.name?.split(" ")[0] || "there";
  const dateLabel = new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="adm-home">
      {/* ───── LEFT: hero, stats, live attendance ───── */}
      <div className="adm-col">
        <div className="ix-card adm-hero">
          <span className="adm-hero-glow" aria-hidden="true" />
          <div className="adm-hero-text">
            <span className="adm-hero-tag">Admin overview · {dateLabel}</span>
            <h1>{greeting()}, {first} 👋</h1>
            <p>Here's what's happening across the OJT program today.</p>
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
          <MiniStat icon="users" tone="orange" label="Total interns" value={interns.length} hint="registered" />
          <MiniStat icon="user" tone="blue" label="OJT coordinators" value={coordinators.length} hint="on the program" />
          <MiniStat icon="tap" tone="green" label="Checked in today" value={checkedIn} hint={`of ${interns.length} interns`} bar={pct} live={checkedIn > 0} />
          <MiniStat icon="list" tone="purple" label="Today's records" value={todayRecs.length} hint="taps and logs" />
        </div>

        <div className="adm-live">
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
                  <Badge
                    label={r.uid === "ONLINE" ? "Online" : "Onsite"}
                    type={r.uid === "ONLINE" ? "online" : "onsite"}
                  />,
                  <Badge
                    label={r.action === "CHECK_IN" ? "IN" : "OUT"}
                    type={r.action === "CHECK_IN" ? "in" : "out"}
                  />,
                  <span className="adm-time">{fmtTime(r.checked_in_at)}</span>,
                ])}
                empty="No activity today yet."
              />
            )}
          </Section>
        </div>
      </div>

      {/* ───── RIGHT: calendar + who's on duty ───── */}
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

/* ───────────────────────── Home Calendar ───────────────────────── */
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function HomeCalendar() {
  const [events, setEvents] = useState([]);
  const [viewDate, setViewDate] = useState(new Date());

  useEffect(() => {
    const load = () =>
      fetch(`${API}/calendar`, { headers: { Accept: "application/json" } })
        .then((res) => res.json())
        .then((data) => { if (Array.isArray(data)) setEvents(data); })
        .catch((err) => console.error("Calendar error:", err));
    load();
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
  }, []);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = viewDate.toLocaleString("en-US", { month: "long" });

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const isToday = (d) => d === now.getDate() && month === now.getMonth() && year === now.getFullYear();
  const keyOf = (d) => `${year}-${pad(month + 1)}-${pad(d)}`;
  // slice(0, 10) so both "2026-10-15" and "2026-10-15T00:00:00Z" work
  const eventOf = (d) => events.find((e) => String(e.date).slice(0, 10) === keyOf(d));

  const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
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

      <button className="adm-cal-today" onClick={() => setViewDate(new Date())}>Jump to today</button>

      <div className="adm-cal-grid">
        {DOW.map((d) => <div key={d} className="adm-cal-dow">{d}</div>)}
        {Array.from({ length: firstDay }, (_, i) => <div key={`blank-${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const d = i + 1;
          const ev = eventOf(d);
          const cls = ["adm-cal-day", isToday(d) && "today", ev && "event"].filter(Boolean).join(" ");
          return (
            <div
              key={d} className={cls} title={ev ? ev.title : undefined}
              aria-label={`${monthName} ${d}${ev ? ", " + ev.title : ""}`}
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
  const [dateFilter, setDateFilter] = useState("");
  const [search, setSearch] = useState("");
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

/* ───────────────────────── Hours ───────────────────────── */
export function Hours({ records, interns, loading }) {
  const hoursBased = interns.filter((u) => (u.tracking_type || "hours") === "hours");
  const outputBased = interns.filter((u) => u.tracking_type === "output");

  const data = hoursBased.map((u) => {
    const recs = records.filter((r) => r.user_id === u.id);
    const days = [...new Set(recs.map((r) => r.date))].length;
    const total = calcHours(recs);
    return { ...u, days, total, pct: Math.min(Math.round((total / REQUIRED_HOURS) * 100), 100) };
  });

  return (
    <>
      <PageHeader title="Hours Summary" sub="Total OJT hours per intern (hours-based only)." />
      <div className="ix-card flush">
        {loading ? <Spinner /> : (
          <Table
            headers={["Intern", "Email", "Days Present", "Total Hours", "Progress", "Status"]}
            rows={data.map((d) => [
              <strong>{d.name}</strong>,
              d.email,
              d.days + " days",
              <strong>{d.total}h</strong>,
              <div className="ix-prog"><Bar pct={d.pct} /><span>{d.pct}%</span></div>,
              <Badge
                label={d.pct >= 100 ? "Complete" : d.pct >= 50 ? "Halfway" : "In Progress"}
                type={d.pct >= 100 ? "approved" : d.pct >= 50 ? "pending" : "rejected"}
              />,
            ])}
            empty="No hours-based interns yet."
          />
        )}
      </div>
      {!loading && outputBased.length > 0 && (
        <div className="ix-note">
          <Icon name="info" size={18} />
          <span>
            <strong>Output-based interns</strong> are not tracked by hours: {outputBased.map((u) => u.name).join(", ")}.
            See MOV Submissions for their progress.
          </span>
        </div>
      )}
    </>
  );
}

/* ───────────────────────── MOV Submissions ───────────────────────── */
export function Submissions({ movs, user, onRefresh }) {
  const [processing, setProcessing] = useState(null);
  const [remarks, setRemarks] = useState({});
  const [msg, setMsg] = useState(null);

  const handleReview = async (id, status) => {
    setProcessing(id + status);
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

  return (
    <>
      <PageHeader title="MOV Submissions" sub="Review intern-submitted documents (MOVs, forms, certificates)." live />
      <Msg msg={msg} />
      {movs.length === 0 ? (
        <div className="ix-card"><Empty icon="inbox" title="No submissions yet" sub="Interns' uploaded documents will show up here." /></div>
      ) : (
        <div className="ix-list">
          {movs.map((m) => (
            <div key={m.id} className="ix-sub">
              <div className="ix-sub-top">
                <Avatar name={m.intern_name} photo={m.intern_photo} />
                <div className="ix-ic-id">
                  <strong>{m.intern_name}</strong>
                  <span>{m.intern_email}</span>
                </div>
                <Badge
                  label={m.status.charAt(0).toUpperCase() + m.status.slice(1)}
                  type={m.status === "approved" ? "approved" : m.status === "rejected" ? "rejected" : "pending"}
                />
              </div>
              <div className="ix-sub-title">{m.title}</div>
              <a className="ix-file" href={`http://localhost:8000/storage/${m.file_path}`} target="_blank" rel="noopener noreferrer">
                <Icon name="clip" size={16} /> {m.original_name}
              </a>

              {m.status === "pending" && (
                <div className="ix-review">
                  <input
                    type="text" className="ix-input" placeholder="Add remarks (optional)"
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
              )}
              {m.remarks && <div className="ix-remarks">Remarks: {m.remarks}</div>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ───────────────────────── Manage Accounts ───────────────────────── */
const BLANK_FORM = {
  name: "", email: "", password: "password123", role: "intern",
  uid: "", work_mode: "onsite", tracking_type: "hours", photo: null,
};
const ROLE_NAME = { intern: "Intern", supervisor: "Supervisor", admin: "Admin", ojt_coordinator: "OJT Coordinator" };

function Accounts({ users, onRefresh }) {
  const [form, setForm] = useState(BLANK_FORM);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [msg, setMsg] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [uploading, setUploading] = useState(null);
  const uidBuffer = useRef("");

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

  const openModal = () => { setMsg(null); setShowForm(true); };
  const closeModal = () => {
    setShowForm(false);
    setForm(BLANK_FORM);
    setScanning(false);
    uidBuffer.current = "";
  };

  const handleAdd = async (e) => {
    e.preventDefault(); setAdding(true); setMsg(null);
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
    if (!window.confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      const res = await fetch(`${API}/admin/users/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setMsg({ type: "success", text: "User deleted." });
      onRefresh();
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    } finally { setDeleting(null); }
  };

  const changePhoto = async (u, file) => {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) {
      setMsg({ type: "error", text: "Please choose an image under 2 MB." });
      return;
    }
    setUploading(u.id); setMsg(null);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch(`${API}/admin/users/${u.id}/photo`, {
        method: "POST", headers: { Accept: "application/json" }, body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Upload failed.");
      setMsg({ type: "success", text: data.message || "Photo updated." });
      // if this is my own account, refresh my navbar photo too
      const me = JSON.parse(sessionStorage.getItem("user") || "{}");
      if (me.id === u.id && data.photo) sessionStorage.setItem("user", JSON.stringify({ ...me, photo: data.photo }));
      onRefresh();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof SyntaxError ? "Photo upload isn't set up on the server yet." : err.message });
    } finally { setUploading(null); }
  };

  return (
    <>
      <PageHeader title="Manage Accounts" sub="Add or remove users from the system.">
        <button className="ix-b primary" onClick={openModal}><Icon name="plus" size={16} /> Add New User</button>
      </PageHeader>

      {!showForm && <Msg msg={msg} />}

      <div className="ix-card flush">
        <Table
          headers={["User", "Email", "Role", "Setup", "Action"]}
          rows={users.map((u) => [
            <div className="ix-actions">
              <Avatar name={u.name} photo={u.photo} size={36} />
              <strong>{u.name}</strong>
            </div>,
            u.email,
            <Badge label={ROLE_NAME[u.role] || u.role} type={`r-${u.role}`} />,
            u.role === "intern"
              ? <span className="ix-muted">{u.work_mode === "offsite" ? "WFH" : "Onsite"} · {u.tracking_type === "output" ? "Output" : "Hours"}</span>
              : <span className="ix-muted">—</span>,
            <div className="ix-actions">
              <label className="ix-b ghost sm" style={{ opacity: uploading === u.id ? 0.6 : 1 }}>
                <input
                  type="file" accept="image/*" hidden disabled={uploading === u.id}
                  onChange={(e) => { changePhoto(u, e.target.files?.[0]); e.target.value = ""; }}
                />
                <Icon name="camera" size={14} /> {uploading === u.id ? "Uploading..." : "Photo"}
              </label>
              <button className="ix-b danger sm" onClick={() => handleDelete(u.id, u.name)} disabled={deleting === u.id}>
                <Icon name="trash" size={14} /> {deleting === u.id ? "..." : "Delete"}
              </button>
            </div>,
          ])}
          empty="No users yet."
        />
      </div>

      {showForm && (
        <Modal title="Add New User" sub="Fill in the details below." onClose={closeModal}>
          <Msg msg={msg} />
          <form onSubmit={handleAdd} className="ix-form">
            <PhotoPicker file={form.photo} onChange={(f) => setForm((st) => ({ ...st, photo: f }))} />
            <div className="ix-field">
              <label htmlFor="acc-name">Full name</label>
              <input id="acc-name" type="text" required placeholder="e.g. Juan Dela Cruz" value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="ix-field">
              <label htmlFor="acc-email">Email</label>
              <input id="acc-email" type="email" required placeholder="e.g. juan@csu.edu.ph" value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="ix-field">
              <label htmlFor="acc-pass">Password</label>
              <input id="acc-pass" type="password" required value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
            </div>
            <div className="ix-field">
              <label htmlFor="acc-role">Role</label>
              <select id="acc-role" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
                <option value="intern">Intern</option>
                <option value="ojt_coordinator">OJT Coordinator</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            {form.role === "intern" && (
              <>
                <div className="ix-row-gap">
                  <div className="ix-field">
                    <label htmlFor="acc-wm">Work mode</label>
                    <select id="acc-wm" value={form.work_mode} onChange={(e) => setForm((f) => ({ ...f, work_mode: e.target.value }))}>
                      <option value="onsite">Onsite</option>
                      <option value="offsite">Offsite (WFH)</option>
                    </select>
                  </div>
                  <div className="ix-field">
                    <label htmlFor="acc-tt">Tracking type</label>
                    <select id="acc-tt" value={form.tracking_type} onChange={(e) => setForm((f) => ({ ...f, tracking_type: e.target.value }))}>
                      <option value="hours">Hours-based</option>
                      <option value="output">Output-based</option>
                    </select>
                  </div>
                </div>

                <div className="ix-field">
                  <label htmlFor="acc-uid">NFC card UID</label>
                  <div className="ix-row-gap">
                    <input
                      id="acc-uid" type="text"
                      className={scanning ? "scanning" : ""}
                      placeholder="Scan the card or type the UID"
                      value={scanning ? "Waiting for card tap..." : form.uid}
                      readOnly={scanning}
                      onChange={(e) => setForm((f) => ({ ...f, uid: e.target.value }))}
                    />
                    <button
                      type="button"
                      className={scanning ? "ix-b ghost" : "ix-b primary"}
                      onClick={(e) => { e.currentTarget.blur(); uidBuffer.current = ""; setScanning((s) => !s); }}
                    >
                      <Icon name="nfc" size={16} /> {scanning ? "Cancel" : "Scan"}
                    </button>
                  </div>
                  {scanning && (
                    <div className="ix-hint info">Keep this window focused, then tap the NFC card on the reader.</div>
                  )}
                  {form.uid && !scanning && (
                    <div className="ix-hint good">
                      <Icon name="check" size={14} /> UID captured: <strong style={{ fontFamily: "monospace" }}>{form.uid}</strong>
                      <button type="button" onClick={() => setForm((f) => ({ ...f, uid: "" }))}>clear</button>
                    </div>
                  )}
                  <div className="ix-hint">Leave blank if there's no NFC card yet.</div>
                </div>
              </>
            )}

            <div className="ix-form-actions">
              <button type="button" className="ix-b ghost" onClick={closeModal}>Cancel</button>
              <button type="submit" className="ix-b primary" disabled={adding}>{adding ? "Adding..." : "Add User"}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

/* ───────────────────────── DTR ───────────────────────── */
export function DTR({ interns, records }) {
  const [selectedId, setSelectedId] = useState("");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  const intern = interns.find((u) => u.id === parseInt(selectedId));
  const filtered = records.filter((r) => r.user_id === parseInt(selectedId) && r.date?.startsWith(month));

  const byDate = {};
  filtered.forEach((r) => {
    if (!byDate[r.date]) byDate[r.date] = { in: null, out: null };
    if (r.checked_in_at && !byDate[r.date].in) byDate[r.date].in = r.checked_in_at;
    if (r.checked_out_at && !byDate[r.date].out) byDate[r.date].out = r.checked_out_at;
  });

  let totalHrs = 0;
  Object.values(byDate).forEach(({ in: i, out: o }) => { if (i && o) totalHrs += (new Date(o) - new Date(i)) / 3600000; });
  totalHrs = Math.round(totalHrs * 10) / 10;

  const monthLabel = new Date(month + "-01").toLocaleDateString("en-PH", { month: "long", year: "numeric" });

  const handlePrint = () => {
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>DTR - ${esc(intern?.name)}</title><style>
      body{font-family:'Times New Roman',serif;padding:40px;color:#000;}
      h2,h3{text-align:center;margin:0;}
      p{text-align:center;font-size:13px;margin:2px 0;}
      table{width:100%;border-collapse:collapse;margin-top:14px;font-size:13px;}
      th,td{border:1px solid #000;padding:6px 10px;text-align:center;}
      th{background:#f0f0f0;font-weight:bold;}
      .total{text-align:right;margin-top:10px;font-weight:bold;font-size:13px;}
      .sig{display:flex;justify-content:space-between;margin-top:50px;}
      .sig-line{width:200px;text-align:center;}
      .sig-line .line{border-top:1px solid #000;padding-top:4px;font-size:12px;}
    </style></head><body>
      <h2>CARAGA STATE UNIVERSITY</h2>
      <p>Butuan City, Agusan del Norte</p>
      <h3 style="margin-top:10px;">DAILY TIME RECORD (OJT Attendance)</h3>
      <hr style="margin:12px 0"/>
      <table style="border:none;margin-top:0;">
        <tr style="border:none;">
          <td style="border:none;text-align:left;padding:3px 0;"><strong>Name:</strong> ${esc(intern?.name)}</td>
          <td style="border:none;text-align:right;padding:3px 0;"><strong>Month:</strong> ${monthLabel}</td>
        </tr>
        <tr style="border:none;">
          <td style="border:none;text-align:left;padding:3px 0;"><strong>Email:</strong> ${esc(intern?.email)}</td>
          <td style="border:none;text-align:right;padding:3px 0;"><strong>Required Hours:</strong> ${REQUIRED_HOURS} hours</td>
        </tr>
      </table>
      <table>
        <thead><tr><th>Date</th><th>Day</th><th>A.M. In</th><th>A.M. Out</th><th>P.M. In</th><th>P.M. Out</th><th>Hours</th><th>Remarks</th></tr></thead>
        <tbody>
          ${Object.entries(byDate).sort().map(([date, t]) => {
            const hrs = t.in && t.out ? ((new Date(t.out) - new Date(t.in)) / 3600000).toFixed(2) : "—";
            const day = new Date(date).toLocaleDateString("en-PH", { weekday: "short" });
            const remark = !t.in ? "Absent" : !t.out ? "No checkout" : "";
            return `<tr>
              <td>${date}</td><td>${day}</td>
              <td>${t.in ? new Date(t.in).toLocaleTimeString("en-PH") : "—"}</td><td></td>
              <td></td><td>${t.out ? new Date(t.out).toLocaleTimeString("en-PH") : "—"}</td>
              <td>${hrs !== "—" ? hrs + " hrs" : "—"}</td>
              <td>${remark}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
      <div class="total">Total Hours Rendered: ${totalHrs} hours</div>
      <div class="sig">
        <div class="sig-line"><div class="line">Intern's Signature</div></div>
        <div class="sig-line"><div class="line">Supervisor's Signature</div></div>
        <div class="sig-line"><div class="line">OJT Coordinator</div></div>
      </div>
    </body></html>`);
    w.document.close(); w.print();
  };

  return (
    <>
      <PageHeader title="Generate DTR" sub="Daily Time Record for each intern." />
      <div className="ix-toolbar">
        <select className="ix-select" value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={{ minWidth: 240 }}>
          <option value="">Select an intern…</option>
          {interns.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <input type="month" className="ix-input" value={month} onChange={(e) => setMonth(e.target.value)} />
        {selectedId && (
          <button className="ix-b primary" onClick={handlePrint}><Icon name="print" size={16} /> Print DTR</button>
        )}
      </div>

      {selectedId && intern ? (
        <div className="ix-doc">
          <div className="ix-doc-head">
            <h2>CARAGA STATE UNIVERSITY</h2>
            <p>Butuan City, Agusan del Norte</p>
            <h3>DAILY TIME RECORD (OJT Attendance)</h3>
          </div>
          <div className="ix-doc-meta">
            <div><span>Name: </span><strong>{intern.name}</strong></div>
            <div><span>Email: </span>{intern.email}</div>
            <div><span>Month: </span><strong>{monthLabel}</strong></div>
          </div>
          <div className="ix-card flush" style={{ boxShadow: "none", border: "1px solid #f3e3da" }}>
            <Table
              headers={["Date", "Day", "Time In", "Time Out", "Hours Worked", "Remarks"]}
              rows={Object.entries(byDate).sort().map(([date, t]) => {
                const hrs = t.in && t.out ? ((new Date(t.out) - new Date(t.in)) / 3600000).toFixed(2) + " hrs" : "—";
                return [
                  date,
                  new Date(date).toLocaleDateString("en-PH", { weekday: "short" }),
                  fmtTime(t.in),
                  fmtTime(t.out),
                  hrs,
                  t.in && !t.out ? <Badge label="No Checkout" type="pending" /> : "",
                ];
              })}
              empty="No records for this month."
            />
          </div>
          <div className="ix-doc-total">Total Hours Rendered: {totalHrs} hours</div>
          <div className="ix-doc-sigs">
            {["Intern's Signature", "Supervisor's Signature", "OJT Coordinator"].map((l) => (
              <div key={l} className="ix-doc-sig">{l}</div>
            ))}
          </div>
        </div>
      ) : (
        <div className="ix-card">
          <Empty icon="file" title="Nothing to preview yet" sub="Select an intern and month above to preview the DTR." />
        </div>
      )}
    </>
  );
}

/* ───────────────────────── Reports ───────────────────────── */
export function Reports({ interns, records }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  const data = interns.map((u) => {
    const recs = records.filter((r) => r.user_id === u.id && r.date?.startsWith(month));
    const days = [...new Set(recs.map((r) => r.date))].length;
    const onsite = recs.filter((r) => r.uid !== "ONLINE").length;
    const online = recs.filter((r) => r.uid === "ONLINE").length;
    const total = calcHours(recs);
    return { name: u.name, email: u.email, days, onsite, online, total, pct: Math.min(Math.round((total / REQUIRED_HOURS) * 100), 100) };
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
        <input type="month" className="ix-input" value={month} onChange={(e) => setMonth(e.target.value)} />
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

      <div className="ix-card adm-cal-form">
        <h3>{editingId ? "Edit Calendar Event" : "Add Calendar Event"}</h3>

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
        <PageHeader
          title="Calendar Events"
          sub="Holidays and non-working days registered in the system."
        />

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
    </>
  );
}

/* ───────────────────────── admin styles ───────────────────────── */
export const adminCss = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Figtree:wght@400;500;600;700&display=swap');

/* ═════════ SHARED LOOK (all admin pages) ═════════ */
.ix-main {
  --o: #e8582a; --o2: #f2733a; --ink: #1b1410; --mut: #7a6c64; --line: #f3e3da;
  --display: 'Bricolage Grotesque', 'Figtree', 'Segoe UI', sans-serif;
  background:
    radial-gradient(560px 380px at 94% -4%, rgba(242,115,58,0.22), transparent 70%),
    radial-gradient(520px 400px at -4% 104%, rgba(255,181,140,0.38), transparent 70%),
    #fdeee6;
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
.adm-cal-form { margin-bottom: 20px; max-width: 640px; }
.adm-cal-form h3 { margin: 0 0 14px; font-family: var(--display); font-size: 18px; font-weight: 800; letter-spacing: -0.3px; }
.adm-cal-actions .ix-b { flex: 0 0 auto; min-width: 140px; }
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
.adm-cal-day.event { background: #fff4d6; color: #b45309; font-weight: 800; cursor: help; }
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