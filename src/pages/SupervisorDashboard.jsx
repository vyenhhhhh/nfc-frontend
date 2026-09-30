//Supervisor.jsx
import { useState, useEffect } from "react";
import Layout, { Spinner, PageHeader, StatCard, Badge, Table, LiveBadge } from "../components/Layout.jsx";

const API = "http://localhost:8000/api";
const NAV = [
  { path:"/supervisor",          label:"Home",               icon:"home" },
  { path:"/supervisor/pending",  label:"Pending Submissions", icon:"inbox" },
  { path:"/supervisor/interns",  label:"Monitor Interns",     icon:"users" },
  { path:"/supervisor/records",  label:"Attendance Records",  icon:"list" },
  { path:"/supervisor/hours",    label:"Hours Summary",       icon:"clock" },
];

export default function SupervisorDashboard() {
  const user  = JSON.parse(sessionStorage.getItem("user") || "{}");
  const path  = window.location.pathname;
  const [pending,  setPending]  = useState([]);
  const [records,  setRecords]  = useState([]);
  const [users,    setUsers]    = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 5000);
    return () => clearInterval(iv);
  }, []);

  const fetchAll = async () => {
    try {
      const [p, r, u] = await Promise.all([
        fetch(`${API}/supervisor/pending`).then(r=>r.json()),
        fetch(`${API}/admin/all-attendance`).then(r=>r.json()),
        fetch(`${API}/admin/users`).then(r=>r.json()),
      ]);
      setPending(p);
      setRecords(r);
      setUsers(u.filter(u=>u.role==="intern"));
    } finally { setLoading(false); }
  };

  return (
    <Layout navItems={NAV} role="supervisor">
      {path === "/supervisor"         && <Home pending={pending} records={records} users={users} loading={loading} />}
      {path === "/supervisor/interns" && <Interns users={users} records={records} loading={loading} onRefresh={fetchAll} />}
      {path === "/supervisor/interns" && <Interns users={users} records={records} loading={loading} />}
      {path === "/supervisor/records" && <Records records={records} loading={loading} />}
      {path === "/supervisor/hours"   && <Hours records={records} users={users} loading={loading} />}
    </Layout>
  );
}

// ── Home ─────────────────────────────────────────────────
function Home({ pending, records, users, loading }) {
  const today     = new Date().toISOString().split("T")[0];
  const todayRecs = records.filter(r=>r.date===today);
  const checkedIn = todayRecs.filter(r=>r.action==="CHECK_IN" && !r.checked_out_at).length;

  return (
    <>
      <PageHeader title="Supervisor Dashboard" sub="Overview of intern attendance" live />
      <div style={row}>
        <StatCard label="Total Interns"       value={users.length}   color="#1A2E5A" />
        <StatCard label="Pending Submissions" value={pending.length} color="#D97706" sub="Needs your review" />
        <StatCard label="Checked In Today"    value={checkedIn}      color="#059669" />
        <StatCard label="Today's Records"     value={todayRecs.length} color="#2E86C1" />
      </div>
      {pending.length > 0 && (
        <div style={{ ...card, borderLeft:"4px solid #f59e0b", marginBottom:"1.25rem" }}>
          <div style={{ fontSize:13, fontWeight:600, color:"#92400e", marginBottom:4 }}>
            ⚠ {pending.length} pending submission{pending.length>1?"s":""} waiting for your review
          </div>
          <div style={{ fontSize:12, color:"#94a3b8" }}>Go to Pending Submissions to approve or reject</div>
        </div>
      )}
      <div style={card}>
        <div style={cardLabel}>Today's Activity <LiveBadge /></div>
        {loading ? <Spinner /> : (
          <Table
            headers={["Intern","Type","Action","Time"]}
            rows={todayRecs.map(r=>[
              r.name,
              <Badge label={r.uid==="ONLINE"?"Online":"Onsite"} type={r.uid==="ONLINE"?"online":"onsite"}/>,
              <Badge label={r.action==="CHECK_IN"?"IN":"OUT"} type={r.action==="CHECK_IN"?"in":"out"}/>,
              r.checked_in_at ? new Date(r.checked_in_at).toLocaleTimeString("en-PH") : "—",
            ])}
            empty="No activity today yet."
          />
        )}
      </div>
    </>
  );
}

// ── Pending ───────────────────────────────────────────────
function Pending({ pending, user, onRefresh }) {
  const [remarks,    setRemarks]    = useState({});
  const [processing, setProcessing] = useState(null);
  const [msg,        setMsg]        = useState(null);

  const handleValidate = async (id, action) => {
    setProcessing(id+action); setMsg(null);
    try {
      const res  = await fetch(`${API}/supervisor/validate`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ submission_id:id, supervisor_id:user.id, action, remarks:remarks[id]||"" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setMsg({ type:"success", text:data.message });
      onRefresh();
    } catch(err) { setMsg({ type:"error", text:err.message }); }
    finally { setProcessing(null); }
  };

  return (
    <>
      <PageHeader title="Pending Submissions" sub="Review intern online attendance submissions" live />
      {msg && (
        <div style={{ padding:"10px 14px", borderRadius:8, border:"1px solid", fontSize:13, marginBottom:"1rem",
          background:msg.type==="success"?"#f0fdf4":"#fef2f2",
          borderColor:msg.type==="success"?"#86efac":"#fca5a5",
          color:msg.type==="success"?"#15803d":"#dc2626",
        }}>{msg.text}</div>
      )}
      {pending.length === 0 ? (
        <div style={{ ...card, textAlign:"center", padding:"4rem" }}>
          <div style={{ fontSize:40, marginBottom:12 }}>✅</div>
          <div style={{ fontSize:16, fontWeight:600, color:"#1e293b" }}>All caught up!</div>
          <div style={{ fontSize:13, color:"#94a3b8", marginTop:4 }}>No pending submissions to review.</div>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:"1rem" }}>
          {pending.map(sub => (
            <div key={sub.id} style={card}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"1rem" }}>
                <div>
                  <div style={{ fontSize:16, fontWeight:600, color:"#1e293b" }}>{sub.intern_name}</div>
                  <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>{sub.intern_email}</div>
                </div>
                <Badge label={sub.date} type="pending" />
              </div>
              <div style={{ fontSize:11, color:"#94a3b8", textTransform:"uppercase", letterSpacing:0.5, marginBottom:6 }}>Task Description</div>
              <div style={{ fontSize:14, color:"#374151", lineHeight:1.6, background:"#f8fafc", padding:"10px 14px", borderRadius:8, marginBottom:"1rem" }}>
                {sub.description}
              </div>
              <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                <input type="text" placeholder="Add remarks (optional)"
                  value={remarks[sub.id]||""}
                  onChange={e=>setRemarks(r=>({...r,[sub.id]:e.target.value}))}
                  style={{ flex:1, padding:"8px 12px", border:"1px solid #e2e8f0", borderRadius:8, fontSize:13, fontFamily:"inherit" }}
                />
                <button onClick={()=>handleValidate(sub.id,"rejected")} disabled={!!processing}
                  style={{ padding:"8px 18px", background:"#fff", color:"#dc2626", border:"1px solid #fca5a5", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:600, opacity:processing?0.6:1 }}>
                  {processing===sub.id+"rejected"?"...":"Reject"}
                </button>
                <button onClick={()=>handleValidate(sub.id,"approved")} disabled={!!processing}
                  style={{ padding:"8px 18px", background:"#15803d", color:"#fff", border:"none", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:600, opacity:processing?0.6:1 }}>
                  {processing===sub.id+"approved"?"...":"Approve"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
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
  const [search, setSearch] = useState("");
  const filtered = records.filter(r=>r.name?.toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      <PageHeader title="Attendance Records" sub="All intern attendance logs" live />
      <input type="text" placeholder="Search by intern name..."
        value={search} onChange={e=>setSearch(e.target.value)}
        style={{ padding:"9px 14px", border:"1px solid #e2e8f0", borderRadius:8, fontSize:14, marginBottom:"1rem", width:280, fontFamily:"inherit" }}
      />
      {loading ? <Spinner /> : (
        <Table
          headers={["Intern","Date","Type","Action","Time In","Time Out"]}
          rows={filtered.map(r=>[
            r.name,
            r.date,
            <Badge label={r.uid==="ONLINE"?"Online":"Onsite"} type={r.uid==="ONLINE"?"online":"onsite"}/>,
            <Badge label={r.action==="CHECK_IN"?"IN":"OUT"} type={r.action==="CHECK_IN"?"in":"out"}/>,
            r.checked_in_at  ? new Date(r.checked_in_at).toLocaleTimeString("en-PH")  : "—",
            r.checked_out_at ? new Date(r.checked_out_at).toLocaleTimeString("en-PH") : "—",
          ])}
        />
      )}
    </>
  );
}

// ── Hours ─────────────────────────────────────────────────
function Hours({ records, users, loading }) {
  const internHours = users.map(u => {
    const recs = records.filter(r=>r.user_id===u.id);
    const days = [...new Set(recs.map(r=>r.date))].length;
    let total  = 0;
    const byDate = {};
    recs.forEach(r => {
      if (!byDate[r.date]) byDate[r.date] = {};
      if (r.checked_in_at  && !byDate[r.date].in)  byDate[r.date].in  = r.checked_in_at;
      if (r.checked_out_at && !byDate[r.date].out) byDate[r.date].out = r.checked_out_at;
    });
    Object.values(byDate).forEach(({in:i,out:o})=>{ if(i&&o) total += (new Date(o)-new Date(i))/3600000; });
    total = Math.round(total*10)/10;
    const pct = Math.min(Math.round((total/486)*100),100);
    return { name:u.name, email:u.email, days, total, pct };
  });

  return (
    <>
      <PageHeader title="Hours Summary" sub="Total hours worked by each intern" />
      {loading ? <Spinner /> : (
        <div style={{ display:"flex", flexDirection:"column", gap:"0.75rem" }}>
          {internHours.map((intern,i)=>(
            <div key={i} style={card}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:600, color:"#1e293b" }}>{intern.name}</div>
                  <div style={{ fontSize:12, color:"#94a3b8" }}>{intern.days} days · {intern.total}h worked</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:18, fontWeight:700, color:"#1A2E5A" }}>{intern.total}h</div>
                  <div style={{ fontSize:11, color:"#94a3b8" }}>of 486h</div>
                </div>
              </div>
              <div style={{ background:"#e2e8f0", borderRadius:99, height:8, overflow:"hidden" }}>
                <div style={{ width:intern.pct+"%", height:"100%", background:"#2E86C1", borderRadius:99 }} />
              </div>
              <div style={{ fontSize:11, color:"#94a3b8", marginTop:4 }}>{intern.pct}% complete</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

const row  = { display:"flex", gap:"1rem", marginBottom:"1.25rem", flexWrap:"wrap" };
const card = { background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", padding:"1.25rem" };
const cardLabel = { fontSize:11, fontWeight:600, color:"#94a3b8", textTransform:"uppercase", letterSpacing:0.5, marginBottom:8 };
