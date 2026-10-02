// AdminDashboard.jsx
import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import Shell, {
  Spinner, PageHeader, StatCard, Badge, Table, Section, Empty, Msg, Modal, Bar, Avatar, Hero, Icon, PhotoPicker,
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
  { path: "/admin/calendar", label: "Calendar", icon: "calendar" },
];

export default function AdminDashboard() {
  const user = JSON.parse(sessionStorage.getItem("user") || "{}");
  const { pathname: path } = useLocation();
  const [records, setRecords] = useState([]);
  const [users, setUsers] = useState([]);
  const [movs, setMovs] = useState([]);
  const [loading, setLoading] = useState(true);

  const isCoordinator = user.role === "ojt_coordinator";
  const navItems = isCoordinator
    ? [...NAV, { path: "/admin/submissions", label: "MOV Submissions", icon: "inbox" }]
    : NAV;

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 3000);
    return () => clearInterval(iv);
  }, []);

  const fetchAll = async () => {
    try {
      const [r, u, m] = await Promise.all([
        fetch(`${API}/admin/all-attendance`).then((r) => r.json()),
        fetch(`${API}/admin/users`).then((r) => r.json()),
        fetch(`${API}/coordinator/movs`).then((r) => r.json()),
      ]);
      if (Array.isArray(r)) setRecords([...r]);
      if (Array.isArray(u)) setUsers([...u]);
      if (Array.isArray(m)) setMovs([...m]);
    } catch (err) {
      console.error("Poll error:", err);
    } finally {
      setLoading(false);
    }
  };

  const interns = users.filter((u) => u.role === "intern");
  const supervisors = users.filter((u) => u.role === "supervisor");

  return (
    <Shell navItems={navItems} user={user}>
      {path === "/admin" && <Home user={user} records={records} interns={interns} supervisors={supervisors} loading={loading} />}
      {path === "/admin/interns" && <InternMonitor interns={interns} records={records} loading={loading} onRefresh={fetchAll} />}
      {path === "/admin/records" && <Records records={records} loading={loading} />}
      {path === "/admin/hours" && <Hours records={records} interns={interns} loading={loading} />}
      {path === "/admin/accounts" && <Accounts users={users} onRefresh={fetchAll} />}
      {path === "/admin/calendar" && <Calendar />}
      {path === "/admin/dtr" && <DTR interns={interns} records={records} />}
      {path === "/admin/reports" && <Reports interns={interns} records={records} />}
      {path === "/admin/submissions" && <Submissions movs={movs} user={user} onRefresh={fetchAll} />}
    </Shell>
  );
}

/* ───────────────────────── Home ───────────────────────── */
function Home({ user, records, interns, supervisors, loading }) {
  const today = todayManila();
  const todayRecs = records.filter((r) => r.date === today);
  const checkedIn = todayRecs.filter((r) => r.action === "CHECK_IN" && !r.checked_out_at).length;
  const pct = interns.length ? (checkedIn / interns.length) * 100 : 0;
  const first = user.name?.split(" ")[0] || "there";

  return (
    <>
      <Hero
        tag="Admin overview"
        title={`${greeting()}, ${first}!`}
        text="Here's what's happening across the OJT program today."
        facts={[
          { v: checkedIn, l: "checked in now" },
          { v: todayRecs.length, l: "records today" },
          { v: interns.length, l: "interns" },
        ]}
        ring={{ pct, top: `${checkedIn}/${interns.length}`, bottom: "interns in" }}
      />

      <div className="ix-stats">
        <StatCard label="Total Interns" value={interns.length} icon="users" tone="orange" />
        <StatCard label="Supervisors" value={supervisors.length} icon="user" tone="blue" />
        <StatCard label="Checked In Today" value={checkedIn} icon="tap" tone="green" />
        <StatCard label="Today's Records" value={todayRecs.length} icon="list" tone="purple" />
      </div>

      <div
  style={{
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 380px",
    gap: "20px",
    alignItems: "start",
  }}
>
  <Section
    icon="clock"
    title="Today's Live Attendance"
    count={todayRecs.length}
    live
  >
    {loading ? (
      <Spinner />
    ) : (
      <Table
        headers={["Intern", "Type", "Action", "Time"]}
        rows={todayRecs.map((r) => [
          <strong>{r.name}</strong>,
          <Badge
            label={r.uid === "ONLINE" ? "Online" : "Onsite"}
            type={r.uid === "ONLINE" ? "online" : "onsite"}
          />,
          <Badge
            label={r.action === "CHECK_IN" ? "IN" : "OUT"}
            type={r.action === "CHECK_IN" ? "in" : "out"}
          />,
          fmtTime(r.checked_in_at),
        ])}
        empty="No activity today yet."
      />
    )}
  </Section>

  <HomeCalendar />
</div>
    </>
  );
}

/* ───────────────────────── Records ───────────────────────── */
function Records({ records, loading }) {
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
function Hours({ records, interns, loading }) {
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
function Submissions({ movs, user, onRefresh }) {
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
      // if this is my own account, refresh my sidebar photo too
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
                <option value="supervisor">Supervisor</option>
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
function DTR({ interns, records }) {
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
          <div className="ix-card flush" style={{ boxShadow: "none", border: "1px solid #f1f5f9" }}>
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
function Reports({ interns, records }) {
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

/* ───────────────────────── Home Calendar ───────────────────────── */
function HomeCalendar() {
  const [events, setEvents] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    fetch(`${API}/calendar`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setEvents(data);
        }
      })
      .catch((err) => {
        console.error("Calendar error:", err);
      });
  }, []);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthName = currentDate.toLocaleDateString("en-PH", {
    month: "long",
    year: "numeric",
  });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const previousMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToday = () => {
    setCurrentDate(new Date());
  };

  const getEvent = (day) => {
    const date =
      `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    return events.find((event) => event.date === date);
  };

  const cells = [];

  // Empty spaces before the first day
  for (let i = 0; i < firstDay; i++) {
    cells.push(
      <div key={`empty-${i}`} style={{ minHeight: 42 }} />
    );
  }

  // Days
  for (let day = 1; day <= daysInMonth; day++) {
    const event = getEvent(day);

    const today = new Date();
    const isToday =
      day === today.getDate() &&
      month === today.getMonth() &&
      year === today.getFullYear();

    cells.push(
      <div
        key={day}
        title={event ? event.title : ""}
        style={{
          minHeight: 42,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          borderRadius: "8px",
          background: isToday
            ? "#e8f0ff"
            : event
            ? "#fff4e5"
            : "transparent",
          fontWeight: isToday || event ? 700 : 400,
          color: event
            ? "#b45309"
            : isToday
            ? "#2563eb"
            : "#334155",
          cursor: event ? "help" : "default",
        }}
      >
        {day}

        {event && (
          <span
            style={{
              position: "absolute",
              bottom: "4px",
              width: "5px",
              height: "5px",
              borderRadius: "50%",
              background: "#f59e0b",
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className="ix-card"
      style={{
        padding: "20px",
        margin: 0,
      }}
    >
      {/* Calendar Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
        }}
      >
        <button
          className="ix-b ghost sm"
          onClick={previousMonth}
        >
          ‹
        </button>

        <strong style={{ fontSize: "16px" }}>
          {monthName}
        </strong>

        <button
          className="ix-b ghost sm"
          onClick={nextMonth}
        >
          ›
        </button>
      </div>

      <div
        style={{
          textAlign: "center",
          marginBottom: "14px",
        }}
      >
        <button
          className="ix-b ghost sm"
          onClick={goToday}
        >
          Today
        </button>
      </div>

      {/* Weekdays */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          textAlign: "center",
          fontSize: "12px",
          fontWeight: 700,
          color: "#64748b",
          marginBottom: "6px",
        }}
      >
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
          (day) => (
            <div key={day}>{day}</div>
          )
        )}
      </div>

      {/* Calendar Days */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: "3px",
          textAlign: "center",
        }}
      >
        {cells}
      </div>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          gap: "14px",
          marginTop: "16px",
          paddingTop: "12px",
          borderTop: "1px solid #e5e7eb",
          fontSize: "12px",
          color: "#64748b",
        }}
      >
        <span>
          <span style={{ color: "#2563eb" }}>●</span> Today
        </span>

        <span>
          <span style={{ color: "#f59e0b" }}>●</span> Holiday / Non-working
        </span>
      </div>
    </div>
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

      if (!res.ok) {
        throw new Error(data.message || "Failed to load calendar.");
      }

      setEvents(Array.isArray(data) ? data : []);
    } catch (err) {
      setMsg({
        type: "error",
        text: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  // EDIT
  const handleEdit = (event) => {
    setEditingId(event.id);
    setDate(event.date);
    setType(event.type);
    setTitle(event.title);
    setDescription(event.description || "");
    setMsg(null);
  };

  // CANCEL EDIT
  const cancelEdit = () => {
    setEditingId(null);
    setDate("");
    setType("holiday");
    setTitle("");
    setDescription("");
    setMsg(null);
  };

  // ADD OR UPDATE
  const handleSave = async (e) => {
    e.preventDefault();

    if (!date || !title) {
      setMsg({
        type: "error",
        text: "Please enter a date and title.",
      });
      return;
    }

    setSaving(true);
    setMsg(null);

    try {
      const url = editingId
        ? `${API}/calendar/${editingId}`
        : `${API}/calendar`;

      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          date,
          type,
          title,
          description,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.message || "Failed to save calendar event."
        );
      }

      setMsg({
        type: "success",
        text: data.message,
      });

      setEditingId(null);
      setDate("");
      setTitle("");
      setDescription("");
      setType("holiday");

      fetchEvents();
    } catch (err) {
      setMsg({
        type: "error",
        text: err.message,
      });
    } finally {
      setSaving(false);
    }
  };

  // DELETE
  const handleDelete = async (id) => {
    if (!window.confirm("Delete this calendar event?")) {
      return;
    }

    try {
      const res = await fetch(`${API}/calendar/${id}`, {
        method: "DELETE",
        headers: {
          Accept: "application/json",
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.message || "Failed to delete event."
        );
      }

      setMsg({
        type: "success",
        text: data.message,
      });

      fetchEvents();
    } catch (err) {
      setMsg({
        type: "error",
        text: err.message,
      });
    }
  };

  return (
    <>
      <PageHeader
        title="Calendar Management"
        sub="Manage holidays and non-working days."
      />

      <Msg msg={msg} />

      <div className="ix-card">
        <h3 style={{ marginTop: 0 }}>
          {editingId
            ? "Edit Calendar Event"
            : "Add Calendar Event"}
        </h3>

        <form onSubmit={handleSave} className="ix-form">

          <div className="ix-field">
            <label>Date</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="ix-field">
            <label>Type</label>

            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="holiday">
                Holiday
              </option>

              <option value="non_working">
                Non-working Day
              </option>
            </select>
          </div>

          <div className="ix-field">
            <label>Title</label>

            <input
              type="text"
              required
              placeholder="e.g. Independence Day"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="ix-field">
            <label>Description</label>

            <input
              type="text"
              placeholder="Optional description"
              value={description}
              onChange={(e) =>
                setDescription(e.target.value)
              }
            />
          </div>

          <div className="ix-form-actions">

            <button
              type="submit"
              className="ix-b primary"
              disabled={saving}
            >
              {saving
                ? editingId
                  ? "Updating..."
                  : "Adding..."
                : editingId
                ? "Update Event"
                : "Add Event"}
            </button>

            {editingId && (
              <button
                type="button"
                className="ix-b ghost"
                onClick={cancelEdit}
              >
                Cancel
              </button>
            )}

          </div>
        </form>
      </div>

      <div className="ix-card flush">

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
            headers={[
              "Date",
              "Type",
              "Title",
              "Description",
              "Action",
            ]}
            rows={events.map((event) => [
              event.date,

              <Badge
                label={
                  event.type === "holiday"
                    ? "Holiday"
                    : "Non-working"
                }
                type={
                  event.type === "holiday"
                    ? "approved"
                    : "pending"
                }
              />,

              <strong>{event.title}</strong>,

              event.description || "—",

              <div className="ix-actions">

                <button
                  className="ix-b ghost sm"
                  onClick={() => handleEdit(event)}
                >
                  Edit
                </button>

                <button
                  className="ix-b danger sm"
                  onClick={() => handleDelete(event.id)}
                >
                  Delete
                </button>

              </div>,
            ])}
            empty="No calendar events."
          />
        )}
      </div>
    </>
  );
}