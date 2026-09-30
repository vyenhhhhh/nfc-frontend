//AdminDashboard.jsx
import { useState, useEffect, useRef } from "react";
import Layout, { Spinner, PageHeader, StatCard, Badge, Table, LiveBadge } from "../components/Layout.jsx";

const API = "http://localhost:8000/api";
const NAV = [
  { path:"/admin",           label:"Home",               icon:"🏠" },
  { path:"/admin/interns",   label:"Monitor Interns",    icon:"👥" },
  { path:"/admin/records",   label:"Attendance Records", icon:"📋" },
  { path:"/admin/hours",     label:"Hours Summary",      icon:"⏱" },
  { path:"/admin/accounts",  label:"Manage Accounts",    icon:"⚙️" },
  { path:"/admin/dtr",       label:"Generate DTR",       icon:"📄" },
  { path:"/admin/reports",   label:"Consolidated Report",icon:"📊" },
];  

export default function AdminDashboard() {
  const user   = JSON.parse(sessionStorage.getItem("user") || "{}");
  const path   = window.location.pathname;
  const [records, setRecords] = useState([]);
  const [users,   setUsers]   = useState([]);
  const [movs,    setMovs]    = useState([]);
  const [loading, setLoading] = useState(true);

  const isCoordinator = user.role === "ojt_coordinator";

  const navItems = isCoordinator
    ? [...NAV, { path:"/admin/submissions", label:"MOV Submissions", icon:"🗂️" }]
    : NAV;

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 3000);
    return () => clearInterval(iv);
  }, []);

  const fetchAll = async () => {
    try {
      const [r, u, m] = await Promise.all([
        fetch(`${API}/admin/all-attendance`).then(r => r.json()),
        fetch(`${API}/admin/users`).then(r => r.json()),
        fetch(`${API}/coordinator/movs`).then(r => r.json()),
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

  const interns     = users.filter(u => u.role === "intern");
  const supervisors = users.filter(u => u.role === "supervisor");

  return (
    <Layout navItems={navItems} role="admin">
      {path === "/admin"          && <Home records={records} interns={interns} supervisors={supervisors} loading={loading} />}
      {path === "/admin/interns"  && <Interns interns={interns} records={records} loading={loading} onRefresh={fetchAll} />}
      {path === "/admin/records"  && <Records records={records} loading={loading} />}
      {path === "/admin/hours"    && <Hours records={records} interns={interns} loading={loading} />}
      {path === "/admin/accounts" && <Accounts users={users} onRefresh={fetchAll} />}
      {path === "/admin/dtr"      && <DTR interns={interns} records={records} />}
      {path === "/admin/reports"  && <Reports interns={interns} records={records} />}
      {path === "/admin/submissions" && <Submissions movs={movs} user={user} onRefresh={fetchAll} />}
    </Layout>
  );
}
// ── Home ──────────────────────────────────────────────────
function Home({ records, interns, supervisors, loading }) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const todayRecs = records.filter(r => r.date === today);
  const checkedIn = todayRecs.filter(r => r.action === "CHECK_IN" && !r.checked_out_at).length;
  return (
    <>
      <PageHeader title="Admin Dashboard" sub="Full system overview" live />
      <div style={row}>
        <StatCard label="Total Interns"    value={interns.length}     color="#16541e" />
        <StatCard label="Supervisors"      value={supervisors.length} color="#16541e" />
        <StatCard label="Checked In Today" value={checkedIn}          color="#16541e" />
        <StatCard label="Today's Records"  value={todayRecs.length}   color="#16541e" />
      </div>
      <div style={card}>
        <div style={cardLabel}>Today's Live Attendance <LiveBadge /></div>
        {loading ? <Spinner /> : (
          <Table
            headers={["Intern","Type","Action","Time"]}
            rows={todayRecs.map(r => [
              r.name,
              <Badge label={r.uid === "ONLINE" ? "Online" : "Onsite"} type={r.uid === "ONLINE" ? "online" : "onsite"} />,
              <Badge label={r.action === "CHECK_IN" ? "IN" : "OUT"} type={r.action === "CHECK_IN" ? "in" : "out"} />,
              r.checked_in_at ? new Date(r.checked_in_at).toLocaleTimeString("en-PH") : "—",
            ])}
            empty="No activity today yet."
          />
        )}
      </div>
    </>
  );
}

// ── Interns ───────────────────────────────────────────────
function Interns({ interns, records, loading, onRefresh }) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const [saving, setSaving] = useState(null);

  const updateSettings = async (id, field, value, current) => {
    setSaving(id);
    try {
      await fetch(`${API}/users/${id}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          work_mode:     field === "work_mode"     ? value : current.work_mode || "onsite",
          tracking_type: field === "tracking_type" ? value : current.tracking_type || "hours",
        }),
      });
      onRefresh && onRefresh();
    } finally {
      setSaving(null);
    }
  };

  return (
    <>
      <PageHeader title="Monitor Interns" sub="Real-time status of all interns" live />
      {loading ? <Spinner /> : (
        <div style={{ display:"flex", flexDirection:"column", gap:"0.75rem" }}>
          {interns.map(u => {
            const recs    = records.filter(r => r.user_id === u.id);
            const isIn    = recs.some(r => r.date === today && r.action === "CHECK_IN" && !r.checked_out_at);
            const days    = [...new Set(recs.map(r => r.date))].length;
            const lastRec = recs[0];
            return (
              <div key={u.id} style={{ ...card, marginBottom:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:"1rem", marginBottom: "0.85rem" }}>
                  <div style={{ width:44, height:44, borderRadius:"50%", background:isIn?"#265faf":"#94a3b8", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:700, color:"#fff", flexShrink:0 }}>
                    {u.name?.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:600, color:"#1e293b" }}>{u.name}</div>
                    <div style={{ fontSize:12, color:"#94a3b8" }}>{u.email}</div>
                  </div>
                  <div style={{ textAlign:"center", padding:"0 1rem" }}>
                    <div style={{ fontSize:20, fontWeight:700, color:"#1A2E5A" }}>{days}</div>
                    <div style={{ fontSize:11, color:"#94a3b8" }}>Days</div>
                  </div>
                  <Badge label={isIn ? "Present Now" : "Not In"} type={isIn ? "in" : "out"} />
                  <div style={{ fontSize:12, color:"#94a3b8" }}>Last: {lastRec?.date || "—"}</div>
                </div>

                <div style={{ display:"flex", gap:10, paddingTop:"0.75rem", borderTop:"1px solid #f1f5f9", flexWrap:"wrap", alignItems:"center" }}>
                  <div style={fld2}>
                    <label style={lbl2}>Work Mode</label>
                    <select
                      value={u.work_mode || "onsite"}
                      disabled={saving === u.id}
                      onChange={e => updateSettings(u.id, "work_mode", e.target.value, u)}
                      style={selInp}
                    >
                      <option value="onsite">Onsite</option>
                      <option value="offsite">Offsite (WFH)</option>
                    </select>
                  </div>
                  <div style={fld2}>
                    <label style={lbl2}>Tracking Type</label>
                    <select
                      value={u.tracking_type || "hours"}
                      disabled={saving === u.id}
                      onChange={e => updateSettings(u.id, "tracking_type", e.target.value, u)}
                      style={selInp}
                    >
                      <option value="hours">Hours-based</option>
                      <option value="output">Output-based</option>
                    </select>
                  </div>
                  {saving === u.id && <span style={{ fontSize:12, color:"#94a3b8" }}>Saving...</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

const fld2 = { display:"flex", flexDirection:"column", gap:3 };
const lbl2 = { fontSize:10.5, fontWeight:600, color:"#94a3b8", textTransform:"uppercase", letterSpacing:0.4 };
const selInp = { padding:"6px 10px", border:"1px solid #e2e8f0", borderRadius:6, fontSize:12.5, fontFamily:"inherit", background:"#fff" };

// ── Records ───────────────────────────────────────────────
function Records({ records, loading }) {
  const [dateFilter, setDateFilter] = useState("");
  const [search,     setSearch]     = useState("");
  const filtered = records
    .filter(r => !dateFilter || r.date === dateFilter)
    .filter(r => r.name?.toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      <PageHeader title="All Attendance Records" sub="Complete system-wide attendance log" live />
      <div style={{ display:"flex", gap:10, marginBottom:"1rem", flexWrap:"wrap" }}>
        <input type="text" placeholder="Search intern..." value={search}
          onChange={e => setSearch(e.target.value)} style={filterInp} />
        <input type="date" value={dateFilter}
          onChange={e => setDateFilter(e.target.value)} style={filterInp} />
        {dateFilter && (
          <button onClick={() => setDateFilter("")}
            style={{ padding:"8px 14px", border:"1px solid #e2e8f0", borderRadius:8, background:"#fff", cursor:"pointer", fontSize:13, color:"#64748b" }}>
            Clear
          </button>
        )}
      </div>
      {loading ? <Spinner /> : (
        <Table
          headers={["Intern","Date","Type","Action","Time In","Time Out","Token"]}
          rows={filtered.map(r => [
            r.name, r.date,
            <Badge label={r.uid === "ONLINE" ? "Online" : "Onsite"} type={r.uid === "ONLINE" ? "online" : "onsite"} />,
            <Badge label={r.action === "CHECK_IN" ? "IN" : "OUT"} type={r.action === "CHECK_IN" ? "in" : "out"} />,
            r.checked_in_at  ? new Date(r.checked_in_at).toLocaleTimeString("en-PH")  : "—",
            r.checked_out_at ? new Date(r.checked_out_at).toLocaleTimeString("en-PH") : "—",
            <span style={{ fontFamily:"monospace", fontSize:10, color:"#94a3b8" }}>{r.token?.substring(0,20)}…</span>,
          ])}
        />
      )}
    </>
  );
}

// ── Hours ─────────────────────────────────────────────────
function Hours({ records, interns, loading }) {
  const hoursBased = interns.filter(u => (u.tracking_type || "hours") === "hours");
  const outputBased = interns.filter(u => u.tracking_type === "output");

  const data = hoursBased.map(u => {
    const recs = records.filter(r => r.user_id === u.id);
    const days = [...new Set(recs.map(r => r.date))].length;
    let total  = 0;
    const byDate = {};
    recs.forEach(r => {
      if (!byDate[r.date]) byDate[r.date] = {};
      if (r.checked_in_at  && !byDate[r.date].in)  byDate[r.date].in  = r.checked_in_at;
      if (r.checked_out_at && !byDate[r.date].out) byDate[r.date].out = r.checked_out_at;
    });
    Object.values(byDate).forEach(({ in:i, out:o }) => { if (i && o) total += (new Date(o) - new Date(i)) / 3600000; });
    total = Math.round(total * 10) / 10;
    return { ...u, days, total, pct: Math.min(Math.round((total / 486) * 100), 100) };
  });

  return (
    <>
      <PageHeader title="Hours Summary" sub="Total OJT hours per intern (hours-based only)" />
      {loading ? <Spinner /> : (
        <>
          <Table
            headers={["Intern","Email","Days Present","Total Hours","Progress","Status"]}
            rows={data.map(d => [
              d.name, d.email, d.days + " days", d.total + "h",
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ flex:1, background:"#e2e8f0", borderRadius:99, height:8, overflow:"hidden", minWidth:80 }}>
                  <div style={{ width:d.pct + "%", height:"100%", background:"#2E86C1", borderRadius:99 }} />
                </div>
                <span style={{ fontSize:11, color:"#64748b" }}>{d.pct}%</span>
              </div>,
              <Badge label={d.pct >= 100 ? "Complete" : d.pct >= 50 ? "Halfway" : "In Progress"}
                type={d.pct >= 100 ? "approved" : d.pct >= 50 ? "pending" : "rejected"} />,
            ])}
          />
          {outputBased.length > 0 && (
            <div style={{ ...card, marginTop:"1rem", background:"#f8fafc" }}>
              <div style={cardLabel}>Output-based interns (not tracked by hours)</div>
              <div style={{ fontSize:13, color:"#64748b" }}>
                {outputBased.map(u => u.name).join(", ")} — see MOV Submissions for their progress.
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

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
      setMsg({ type:"success", text: data.message });
      onRefresh();
    } catch (err) {
      setMsg({ type:"error", text: err.message });
    } finally {
      setProcessing(null);
    }
  };

  return (
    <>
      <PageHeader title="MOV Submissions" sub="Review intern-submitted documents (MOVs, forms, certificates)" live />
      {msg && (
        <div style={{
          padding:"10px 14px", borderRadius:8, border:"1px solid", fontSize:13, marginBottom:"1rem",
          background:  msg.type === "success" ? "#f0fdf4" : "#fef2f2",
          borderColor: msg.type === "success" ? "#86efac" : "#fca5a5",
          color:       msg.type === "success" ? "#15803d" : "#dc2626",
        }}>{msg.text}</div>
      )}
      {movs.length === 0 ? (
        <div style={{ ...card, textAlign:"center", padding:"4rem", color:"#94a3b8" }}>
          No submissions yet.
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:"1rem" }}>
          {movs.map(m => (
            <div key={m.id} style={card}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"0.75rem" }}>
                <div>
                  <div style={{ fontSize:15, fontWeight:600, color:"#1e293b" }}>{m.title}</div>
                  <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>
                    {m.intern_name} · {m.intern_email}
                  </div>
                </div>
                <Badge
                  label={m.status.charAt(0).toUpperCase() + m.status.slice(1)}
                  type={m.status === "approved" ? "approved" : m.status === "rejected" ? "rejected" : "pending"}
                />
              </div> 
              <a
                href={`http://localhost:8000/storage/${m.file_path}`}
                target="_blank" rel="noopener noreferrer"
                style={{ fontSize:13, color:"#2E86C1", textDecoration:"underline" }}
              >
                📎 {m.original_name}
              </a>
              {m.status === "pending" && (
                <div style={{ display:"flex", gap:10, alignItems:"center", marginTop:"0.85rem" }}>
                  <input
                    type="text" placeholder="Add remarks (optional)"
                    value={remarks[m.id] || ""}
                    onChange={e => setRemarks(r => ({ ...r, [m.id]: e.target.value }))}
                    style={{ flex:1, padding:"8px 12px", border:"1px solid #e2e8f0", borderRadius:8, fontSize:13, fontFamily:"inherit" }}
                  />
                  <button onClick={() => handleReview(m.id, "rejected")} disabled={!!processing}
                    style={{ padding:"8px 18px", background:"#fff", color:"#dc2626", border:"1px solid #fca5a5", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:600 }}>
                    {processing === m.id + "rejected" ? "..." : "Reject"}
                  </button>
                  <button onClick={() => handleReview(m.id, "approved")} disabled={!!processing}
                    style={{ padding:"8px 18px", background:"#15803d", color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:600 }}>
                    {processing === m.id + "approved" ? "..." : "Approve"}
                  </button>
                </div>
              )}
              {m.remarks && (
                <div style={{ fontSize:12, color:"#94a3b8", marginTop:8 }}>Remarks: {m.remarks}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Manage Accounts ───────────────────────────────────────
function Accounts({ users, onRefresh }) {
  const [form, setForm] = useState({
  name:"", email:"", password:"password123", role:"intern",
  uid:"", work_mode:"onsite", tracking_type:"hours",
});
  const [adding,   setAdding]   = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [msg,      setMsg]      = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [scanning, setScanning] = useState(false);
  const uidBuffer = useRef("");

  useEffect(() => {
    const handleKey = (e) => {
      if (!scanning) return;
      if (e.key === "Enter") {
        const uid = uidBuffer.current.trim();
        uidBuffer.current = "";
        if (uid.length >= 4) {
          setForm(f => ({ ...f, uid }));
          setScanning(false);
        }
      } else {
        if (e.key.length === 1) uidBuffer.current += e.key;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [scanning]);

  useEffect(() => {
    if (form.role !== "intern") {
      setForm(f => ({ ...f, uid:"" }));
      setScanning(false);
      uidBuffer.current = "";
    }
  }, [form.role]);

  // Lock body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = showForm ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [showForm]);

  const openModal  = () => { setMsg(null); setShowForm(true); };
  const closeModal = () => {
  setShowForm(false);
  setForm({ name:"", email:"", password:"password123", role:"intern", uid:"", work_mode:"onsite", tracking_type:"hours" });
  setScanning(false);
  uidBuffer.current = "";
};

  const handleAdd = async (e) => {
    e.preventDefault(); setAdding(true); setMsg(null);
    try {
      const res  = await fetch(`${API}/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setMsg({ type:"success", text: data.message });
      closeModal();
      onRefresh();
    } catch (err) {
      setMsg({ type:"error", text: err.message });
    } finally { setAdding(false); }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      const res  = await fetch(`${API}/admin/users/${id}`, { method:"DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setMsg({ type:"success", text:"User deleted." });
      onRefresh();
    } catch (err) {
      setMsg({ type:"error", text: err.message });
    } finally { setDeleting(null); }
  };

  const roleColor = { intern:"#059669", supervisor:"#7C3AED", admin:"#D97706", ojt_coordinator:"#2E86C1" };

  return (
    <>
      <PageHeader title="Manage Accounts" sub="Add or remove users from the system" />

      {msg && (
        <div style={{
          padding:"10px 14px", borderRadius:8, border:"1px solid", fontSize:13, marginBottom:"1rem",
          background:  msg.type === "success" ? "#f0fdf4" : "#fef2f2",
          borderColor: msg.type === "success" ? "#86efac" : "#fca5a5",
          color:       msg.type === "success" ? "#15803d" : "#dc2626",
        }}>{msg.text}</div>
      )}

      <button
        onClick={openModal}
        style={{ marginBottom:"1rem", padding:"10px 20px", background:"#16541e", color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:600 }}
      >
        + Add New User
      </button>

      <Table
        headers={["Name","Email","Role","Action"]}
        rows={users.map(u => [
          u.name, u.email,
          <span style={{ fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:99, background:(roleColor[u.role] || "#94a3b8") + "22", color: roleColor[u.role] || "#94a3b8" }}>
            {u.role}
          </span>,
          <button onClick={() => handleDelete(u.id, u.name)} disabled={deleting === u.id}
            style={{ padding:"5px 12px", background:"#fff", color:"#dc2626", border:"1px solid #fca5a5", borderRadius:6, cursor:"pointer", fontSize:12, fontWeight:600, opacity: deleting === u.id ? 0.5 : 1 }}>
            {deleting === u.id ? "..." : "Delete"}
          </button>,
        ])}
      />

      {/* ── Modal Overlay ── */}
      {showForm && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
          style={{
            position:"fixed", inset:0, zIndex:1000,
            background:"rgba(15,23,42,0.45)",
            backdropFilter:"blur(3px)",
            display:"flex", alignItems:"center", justifyContent:"center",
            padding:"1rem",
          }}
        >
          <div style={{
            background:"#fff", borderRadius:16, width:"100%", maxWidth:480,
            boxShadow:"0 20px 60px rgba(0,0,0,0.15)",
            maxHeight:"90vh", overflowY:"auto",
          }}>

            {/* Modal Header */}
            <div style={{
              display:"flex", alignItems:"center", justifyContent:"space-between",
              padding:"1.25rem 1.5rem",
              borderBottom:"1px solid #f1f5f9",
            }}>
              <div>
                <div style={{ fontSize:16, fontWeight:700, color:"#0f172a" }}>Add New User</div>
                <div style={{ fontSize:12, color:"#94a3b8", marginTop:2 }}>Fill in the details below</div>
              </div>
              <button
                onClick={closeModal}
                style={{ background:"#f1f5f9", border:"none", borderRadius:8, width:32, height:32, cursor:"pointer", fontSize:16, color:"#64748b", display:"flex", alignItems:"center", justifyContent:"center" }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding:"1.5rem" }}>
              {msg && (
                <div style={{
                  padding:"10px 14px", borderRadius:8, border:"1px solid", fontSize:13, marginBottom:"1rem",
                  background:  msg.type === "success" ? "#f0fdf4" : "#fef2f2",
                  borderColor: msg.type === "success" ? "#86efac" : "#fca5a5",
                  color:       msg.type === "success" ? "#15803d" : "#dc2626",
                }}>{msg.text}</div>
              )}

              <form onSubmit={handleAdd} style={{ display:"flex", flexDirection:"column", gap:"1rem" }}>

                <div style={fld}>
                  <label style={lbl}>Full Name</label>
                  <input type="text" required placeholder="e.g. Juan Dela Cruz" value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inp} />
                </div>

                <div style={fld}>
                  <label style={lbl}>Email</label>
                  <input type="email" required placeholder="e.g. juan@csu.edu.ph" value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={inp} />
                </div>

                <div style={fld}>
                  <label style={lbl}>Password</label>
                  <input type="password" required value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))} style={inp} />
                </div>

                <div style={fld}>
                  <label style={lbl}>Role</label>
                  <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={inp}>
                    <option value="intern">Intern</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="ojt_coordinator">OJT Coordinator</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                {form.role === "intern" && (
  <div style={{ display:"flex", gap:10 }}>
    <div style={{ ...fld, flex:1 }}>
      <label style={lbl}>Work Mode</label>
      <select value={form.work_mode} onChange={e => setForm(f => ({ ...f, work_mode: e.target.value }))} style={inp}>
        <option value="onsite">Onsite</option>
        <option value="offsite">Offsite (WFH)</option>
      </select>
    </div>
    <div style={{ ...fld, flex:1 }}>
      <label style={lbl}>Tracking Type</label>
      <select value={form.tracking_type} onChange={e => setForm(f => ({ ...f, tracking_type: e.target.value }))} style={inp}>
        <option value="hours">Hours-based</option>
        <option value="output">Output-based</option>
      </select>
    </div>
  </div>
)}

                {form.role === "intern" && (
                  <div style={fld}>
                    <label style={lbl}>NFC Card UID</label>
                    <div style={{ display:"flex", gap:8 }}>
                      <input
                        type="text"
                        placeholder={scanning ? "Tap the NFC card on the reader..." : "Tap NFC card or enter UID manually"}
                        value={scanning ? "📡 Waiting for card tap..." : form.uid}
                        readOnly={scanning}
                        onChange={e => setForm(f => ({ ...f, uid: e.target.value }))}
                        style={{
                          ...inp, flex:1,
                          background:  scanning ? "#eff6ff" : "#fff",
                          borderColor: scanning ? "#2E86C1" : "#e2e8f0",
                          color:       scanning ? "#1d4ed8" : "#1e293b",
                          cursor:      scanning ? "not-allowed" : "text",
                        }}
                      />
                    </div>
                    {scanning && (
                      <div style={{ fontSize:11, color:"#1d4ed8", marginTop:4, padding:"7px 10px", background:"#eff6ff", borderRadius:6, lineHeight:1.5 }}>
                        ✋ Keep this window focused, then tap the NFC card on the reader.
                      </div>
                    )}
                    {form.uid && !scanning && (
                      <div style={{ fontSize:11, color:"#059669", marginTop:4, display:"flex", alignItems:"center", gap:6 }}>
                        <span style={{ width:16, height:16, borderRadius:"50%", background:"#059669", color:"#fff", display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, flexShrink:0 }}>✓</span>
                        UID captured: <strong style={{ fontFamily:"monospace" }}>{form.uid}</strong>
                        <button type="button" onClick={() => setForm(f => ({ ...f, uid:"" }))}
                          style={{ background:"none", border:"none", color:"#94a3b8", cursor:"pointer", fontSize:11, textDecoration:"underline", marginLeft:4 }}>
                          clear
                        </button>
                      </div>
                    )}
                    <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>
                      Leave blank if no NFC card yet.
                    </div>
                  </div>
                )}

                {/* Modal Footer Buttons */}
                <div style={{ display:"flex", gap:8, marginTop:4 }}>
                  <button
                    type="button"
                    onClick={closeModal}
                    style={{ flex:1, padding:"11px", background:"#f1f5f9", color:"#64748b", border:"none", borderRadius:8, cursor:"pointer", fontSize:14, fontWeight:600 }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={adding}
                    style={{ flex:1, padding:"11px", background:"#16541e", color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontSize:14, fontWeight:600, opacity: adding ? 0.7 : 1 }}
                  >
                    {adding ? "Adding..." : "Add User"}
                  </button>
                </div>

              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}



// ── DTR ───────────────────────────────────────────────────
function DTR({ interns, records }) {
  const [selectedId, setSelectedId] = useState("");
  const [month,      setMonth]      = useState(new Date().toISOString().slice(0, 7));
  const printRef = useRef();

  const intern   = interns.find(u => u.id === parseInt(selectedId));
  const filtered = records.filter(r => r.user_id === parseInt(selectedId) && r.date?.startsWith(month));

  const byDate = {};
  filtered.forEach(r => {
    if (!byDate[r.date]) byDate[r.date] = { in:null, out:null };
    if (r.checked_in_at  && !byDate[r.date].in)  byDate[r.date].in  = r.checked_in_at;
    if (r.checked_out_at && !byDate[r.date].out) byDate[r.date].out = r.checked_out_at;
  });

  let totalHrs = 0;
  Object.values(byDate).forEach(({ in:i, out:o }) => { if (i && o) totalHrs += (new Date(o) - new Date(i)) / 3600000; });
  totalHrs = Math.round(totalHrs * 10) / 10;

  const handlePrint = () => {
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>DTR - ${intern?.name}</title><style>
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
          <td style="border:none;text-align:left;padding:3px 0;"><strong>Name:</strong> ${intern?.name}</td>
          <td style="border:none;text-align:right;padding:3px 0;"><strong>Month:</strong> ${new Date(month + "-01").toLocaleDateString("en-PH", { month:"long", year:"numeric" })}</td>
        </tr>
        <tr style="border:none;">
          <td style="border:none;text-align:left;padding:3px 0;"><strong>Email:</strong> ${intern?.email}</td>
          <td style="border:none;text-align:right;padding:3px 0;"><strong>Required Hours:</strong> 486 hours</td>
        </tr>
      </table>
      <table>
        <thead><tr><th>Date</th><th>Day</th><th>A.M. In</th><th>A.M. Out</th><th>P.M. In</th><th>P.M. Out</th><th>Hours</th><th>Remarks</th></tr></thead>
        <tbody>
          ${Object.entries(byDate).sort().map(([date, t]) => {
            const hrs = t.in && t.out ? ((new Date(t.out) - new Date(t.in)) / 3600000).toFixed(2) : "—";
            const day = new Date(date).toLocaleDateString("en-PH", { weekday:"short" });
            const remark = !t.in ? "Absent" : !t.out ? "No checkout" : "";
            return `<tr>
              <td>${date}</td><td>${day}</td>
              <td>${t.in  ? new Date(t.in).toLocaleTimeString("en-PH")  : "—"}</td><td></td>
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
      <PageHeader title="Generate DTR" sub="Daily Time Record for each intern" />
      <div style={{ display:"flex", gap:10, marginBottom:"1.25rem", flexWrap:"wrap", alignItems:"center" }}>
        <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
          style={{ padding:"9px 14px", border:"1px solid #e2e8f0", borderRadius:8, fontSize:13, fontFamily:"inherit", minWidth:220 }}>
          <option value="">— Select Intern —</option>
          {interns.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          style={{ padding:"9px 12px", border:"1px solid #e2e8f0", borderRadius:8, fontSize:13 }} />
        {selectedId && (
          <button onClick={handlePrint}
            style={{ padding:"9px 20px", background:"#124d1a", color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:600 }}>
            🖨 Print DTR
          </button>
        )}
      </div>

      {selectedId && intern ? (
        <div style={card} ref={printRef}>
          <div style={{ textAlign:"center", borderBottom:"2px solid #1A2E5A", paddingBottom:"1rem", marginBottom:"1rem" }}>
            <div style={{ fontSize:18, fontWeight:700, color:"#1A2E5A" }}>CARAGA STATE UNIVERSITY</div>
            <div style={{ fontSize:13, color:"#64748b" }}>Butuan City, Agusan Del Norte</div>
            <div style={{ fontSize:14, fontWeight:600, marginTop:6 }}>DAILY TIME RECORD (OJT Attendance)</div>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"1rem", fontSize:14, flexWrap:"wrap", gap:8 }}>
            <div><span style={{ color:"#94a3b8" }}>Name: </span><strong>{intern.name}</strong></div>
            <div><span style={{ color:"#94a3b8" }}>Email: </span>{intern.email}</div>
            <div><span style={{ color:"#94a3b8" }}>Month: </span><strong>{new Date(month + "-01").toLocaleDateString("en-PH", { month:"long", year:"numeric" })}</strong></div>
          </div>
          <Table
            headers={["Date","Day","Time In","Time Out","Hours Worked","Remarks"]}
            rows={Object.entries(byDate).sort().map(([date, t]) => {
              const hrs = t.in && t.out ? ((new Date(t.out) - new Date(t.in)) / 3600000).toFixed(2) + " hrs" : "—";
              return [
                date,
                new Date(date).toLocaleDateString("en-PH", { weekday:"short" }),
                t.in  ? new Date(t.in).toLocaleTimeString("en-PH")  : "—",
                t.out ? new Date(t.out).toLocaleTimeString("en-PH") : "—",
                hrs,
                t.in && !t.out ? <Badge label="No Checkout" type="pending" /> : "",
              ];
            })}
            empty="No records for this month."
          />
          <div style={{ textAlign:"right", marginTop:"1rem", fontSize:15, fontWeight:700, color:"#1A2E5A" }}>
            Total Hours Rendered: {totalHrs} hours
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", marginTop:"3rem" }}>
            {["Intern's Signature","Supervisor's Signature","OJT Coordinator"].map(lbl => (
              <div key={lbl} style={{ textAlign:"center" }}>
                <div style={{ width:180, borderTop:"1px solid #1e293b", paddingTop:6, fontSize:12, color:"#64748b" }}>{lbl}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ ...card, textAlign:"center", padding:"3rem", color:"#94a3b8" }}>
          Select an intern and month above to preview the DTR.
        </div>
      )}
    </>
  );
}

// ── Reports ───────────────────────────────────────────────
function Reports({ interns, records }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  const data = interns.map(u => {
    const recs   = records.filter(r => r.user_id === u.id && r.date?.startsWith(month));
    const days   = [...new Set(recs.map(r => r.date))].length;
    const onsite = recs.filter(r => r.uid !== "ONLINE").length;
    const online = recs.filter(r => r.uid === "ONLINE").length;
    let total    = 0;
    const byDate = {};
    recs.forEach(r => {
      if (!byDate[r.date]) byDate[r.date] = {};
      if (r.checked_in_at  && !byDate[r.date].in)  byDate[r.date].in  = r.checked_in_at;
      if (r.checked_out_at && !byDate[r.date].out) byDate[r.date].out = r.checked_out_at;
    });
    Object.values(byDate).forEach(({ in:i, out:o }) => { if (i && o) total += (new Date(o) - new Date(i)) / 3600000; });
    total = Math.round(total * 10) / 10;
    return { name:u.name, email:u.email, days, onsite, online, total, pct: Math.min(Math.round((total / 486) * 100), 100) };
  });

  const handlePrint = () => {
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
      <p>For the Month of: <strong>${new Date(month + "-01").toLocaleDateString("en-PH", { month:"long", year:"numeric" })}</strong></p>
      <hr style="margin:10px 0"/>
      <Table
  headers={["Name","Email","Role","Setup","Action"]}
  rows={users.map(u => [
    u.name, u.email,
    <span style={{ fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:99, background:(roleColor[u.role] || "#94a3b8") + "22", color: roleColor[u.role] || "#94a3b8" }}>
      {u.role}
    </span>,
    u.role === "intern"
      ? <span style={{ fontSize:11, color:"#64748b" }}>{u.work_mode === "offsite" ? "WFH" : "Onsite"} · {u.tracking_type === "output" ? "Output" : "Hours"}</span>
      : <span style={{ fontSize:11, color:"#cbd5e1" }}>—</span>,
    <button onClick={() => handleDelete(u.id, u.name)} disabled={deleting === u.id}
      style={{ padding:"5px 12px", background:"#fff", color:"#dc2626", border:"1px solid #fca5a5", borderRadius:6, cursor:"pointer", fontSize:12, fontWeight:600, opacity: deleting === u.id ? 0.5 : 1 }}>
      {deleting === u.id ? "..." : "Delete"}
    </button>,
  ])}
/>
      <p style="text-align:right;margin-top:12px;font-size:11px;">Generated: ${new Date().toLocaleDateString("en-PH", { year:"numeric", month:"long", day:"numeric" })}</p>
      <div style="display:flex;justify-content:flex-end;margin-top:50px;">
        <div class="sig-line">OJT Coordinator's Signature over Printed Name</div>
      </div>
    </body></html>`);
    w.document.close(); w.print();
  };

  return (
    <>
      <PageHeader title="Consolidated Report" sub="Monthly attendance summary for all interns" />
      <div style={{ display:"flex", gap:10, marginBottom:"1.25rem", alignItems:"center" }}>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          style={{ padding:"9px 12px", border:"1px solid #e2e8f0", borderRadius:8, fontSize:13 }} />
        <button onClick={handlePrint}
          style={{ padding:"9px 20px", background:"#16541e", color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:600 }}>
          🖨 Print Report
        </button>
      </div>
      <div style={{ ...card, marginBottom:"1rem" }}>
        <div style={cardLabel}>Summary — {new Date(month + "-01").toLocaleDateString("en-PH", { month:"long", year:"numeric" })}</div>
        <div style={row}>
          <StatCard label="Interns"     value={data.length}                                color="#1A2E5A" />
          <StatCard label="Total Hours" value={data.reduce((s, d) => s + d.total, 0) + "h"} color="#2E86C1" />
          <StatCard label="Total Days"  value={data.reduce((s, d) => s + d.days,  0)}       color="#059669" />
          <StatCard label="Online Logs" value={data.reduce((s, d) => s + d.online, 0)}      color="#7C3AED" />
        </div>
      </div>
      <Table
        headers={["#","Intern","Email","Days","Onsite","Online","Total Hours","Progress"]}
        rows={data.map((d, i) => [
          i + 1, d.name, d.email, d.days, d.onsite, d.online, d.total + "h",
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ flex:1, background:"#e2e8f0", borderRadius:99, height:8, overflow:"hidden", minWidth:80 }}>
              <div style={{ width:d.pct + "%", height:"100%", background:"#2E86C1", borderRadius:99 }} />
            </div>
            <span style={{ fontSize:11, color:"#64748b" }}>{d.pct}%</span>
          </div>,
        ])}
        empty="No records for this month."
      />
    </>
  );
}

// ── Shared styles ─────────────────────────────────────────
const row      = { display:"flex", gap:"1rem", marginBottom:"1.25rem", flexWrap:"wrap" };
const card     = { background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", padding:"1.25rem", marginBottom:"1rem" };
const cardLabel= { fontSize:11, fontWeight:600, color:"#94a3b8", textTransform:"uppercase", letterSpacing:0.5, marginBottom:12 };
const fld      = { display:"flex", flexDirection:"column", gap:4 };
const lbl      = { fontSize:12, fontWeight:600, color:"#374151" };
const inp = { padding:"9px 12px", border:"1px solid #4f6685", borderRadius:8, fontSize:13, fontFamily:"inherit", color:"#000000", background:"#ffffff" };
const filterInp= { padding:"8px 12px", border:"1px solid #e2e8f0", borderRadius:8, fontSize:13, fontFamily:"inherit" };