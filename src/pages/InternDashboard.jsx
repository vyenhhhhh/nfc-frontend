//InternDashboard.jsx
import { useState, useEffect } from "react";
import Layout, { Spinner, PageHeader, StatCard, Badge, Table, LiveBadge, SectionCard, EmptyState } from "../components/Layout.jsx";
const API = "http://localhost:8000/api";
const NAV = [
  { path:"/intern",         label:"Home",               icon:"🏠" },
  { path:"/intern/records", label:"My Attendance",       icon:"📋" },
  { path:"/intern/hours",   label:"Total Hours",         icon:"⏱" },
  { path:"/intern/online",  label:"Submit Online",       icon:"📤" },
  { path:"/intern/movs",    label:"Submit MOV",          icon:"🗂️" },
  { path:"/intern/profile", label:"My Profile",          icon:"👤" },
  
];
export default function InternDashboard() {
  const user    = JSON.parse(sessionStorage.getItem("user") || "{}");
  const path    = window.location.pathname;
  const [records, setRecords]   = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    fetchRecords();
    const iv = setInterval(fetchRecords, 5000);
    return () => clearInterval(iv);
  }, []);

  const fetchRecords = async () => {
    try {
      const res  = await fetch(`${API}/intern/attendance?user_id=${user.id}`);
      setRecords(await res.json());
    } finally { setLoading(false); }
  };

  // Stats
  const uniqueDays  = [...new Set(records.map(r => r.date))].length;
  const totalHours  = calcTotalHours(records);
  const onsite      = records.filter(r => r.uid !== "ONLINE").length;
  const online      = records.filter(r => r.uid === "ONLINE").length;
  const lastTap     = records[0];

  return (
    <Layout navItems={NAV} role="intern">
      {path === "/intern" && (
        <Home user={user} uniqueDays={uniqueDays} totalHours={totalHours}
          onsite={onsite} online={online} lastTap={lastTap} loading={loading} records={records} />
      )}
      {path === "/intern/records" && (
        <Records records={records} loading={loading} />
      )}
      {path === "/intern/hours" && (
        <Hours records={records} loading={loading} />
      )}
      {path === "/intern/online" && (
        <SubmitOnline user={user} />
      )}
      {path === "/intern/profile" && (
        <Profile user={user} uniqueDays={uniqueDays} totalHours={totalHours} />
      )}
      {path === "/intern/movs" && <SubmitMov user={user} />}
    </Layout>
  );
}

// ── Home ─────────────────────────────────────────────────
function Home({ user, uniqueDays, totalHours, onsite, online, lastTap, loading, records }) {
  const needsCardWarning = user.work_mode !== "offsite" && user.tracking_type !== "output" && !user.has_card;

  return (
    <>
      <PageHeader title={`Welcome, ${user.name?.split(" ")[0]} 👋`} sub="Access your attendance and OJT progress." />

      {needsCardWarning && (
        <div style={{
          display:"flex", alignItems:"center", gap:10,
          background:"#fef9e7", border:"1px solid #fde68a",
          borderRadius:14, padding:"12px 16px",
          fontSize:13, color:"#92400e", marginBottom:"1.5rem",
        }}>
          <span style={{ fontSize:16 }}>⚠️</span>
          No NFC card linked to your account yet. Contact your admin to register your card.
        </div>
      )}

      <div style={row}>
        <StatCard label="Days Present"  value={uniqueDays}  />
        <StatCard label="Total Hours"   value={totalHours + "h"} />
        <StatCard label="Onsite Taps"   value={onsite} />
        <StatCard label="Online Logs"   value={online} />
      </div>

      <SectionCard icon="🕒" title="Last Recorded Tap">
        {lastTap ? (
          <div style={{ padding:"1.25rem 1.5rem", display:"flex", alignItems:"center", gap:12 }}>
            <Badge label={lastTap.action === "CHECK_IN" ? "CHECK IN" : "CHECK OUT"}
              type={lastTap.action === "CHECK_IN" ? "in" : "out"} />
            <span style={{ fontSize:14, color:"#1e293b" }}>{lastTap.date}</span>
            <span style={{ fontSize:13, color:"#64748b", fontFamily:"monospace" }}>
              {lastTap.checked_in_at ? new Date(lastTap.checked_in_at).toLocaleTimeString("en-PH") : "—"}
            </span>
          </div>
        ) : (
          <EmptyState icon="🕒" title="No tap recorded yet" sub="Your latest check-in or check-out will appear here." />
        )}
      </SectionCard>

      <SectionCard icon="📋" title="Recent Attendance" count={records.length}>
        {loading ? <Spinner /> : (
          <Table
            headers={["Date","Type","Action","Time In","Time Out"]}
            rows={records.slice(0,5).map(r => [
              r.date,
              <Badge label={r.uid==="ONLINE"?"Online":"Onsite"} type={r.uid==="ONLINE"?"online":"onsite"}/>,
              <Badge label={r.action==="CHECK_IN"?"IN":"OUT"} type={r.action==="CHECK_IN"?"in":"out"}/>,
              r.checked_in_at  ? new Date(r.checked_in_at).toLocaleTimeString("en-PH")  : "—",
              r.checked_out_at ? new Date(r.checked_out_at).toLocaleTimeString("en-PH") : "—",
            ])}
            empty="When you tap in or out, your records will appear here."
          />
        )}
      </SectionCard>
    </>
  );
}

// ── Records ──────────────────────────────────────────────
function Records({ records, loading }) {
  const [filter, setFilter] = useState("all");
  const filtered = filter === "all" ? records
    : filter === "onsite" ? records.filter(r => r.uid !== "ONLINE")
    : records.filter(r => r.uid === "ONLINE");

  return (
    <>
      <PageHeader title="My Attendance Records" sub="Complete personal attendance log" live />
      <div style={{ display:"flex", gap:8, marginBottom:"1rem" }}>
        {["all","onsite","online"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding:"6px 16px", borderRadius:99, border:"1px solid #e2e8f0",
            background: filter===f ? "#1A2E5A" : "#fff",
            color: filter===f ? "#fff" : "#64748b",
            cursor:"pointer", fontSize:13, fontWeight:500,
          }}>
            {f.charAt(0).toUpperCase()+f.slice(1)}
          </button>
        ))}
      </div>
      {loading ? <Spinner /> : (
        <Table
          headers={["Date","Type","Action","Time In","Time Out","Token"]}
          rows={filtered.map(r => [
            r.date,
            <Badge label={r.uid==="ONLINE"?"Online":"Onsite"} type={r.uid==="ONLINE"?"online":"onsite"}/>,
            <Badge label={r.action==="CHECK_IN"?"IN":"OUT"} type={r.action==="CHECK_IN"?"in":"out"}/>,
            r.checked_in_at  ? new Date(r.checked_in_at).toLocaleTimeString("en-PH")  : "—",
            r.checked_out_at ? new Date(r.checked_out_at).toLocaleTimeString("en-PH") : "—",
            <span style={{ fontFamily:"monospace", fontSize:10, color:"#94a3b8" }}>
              {r.token?.substring(0,36)}…
            </span>,
          ])}
        />
      )}
    </>
  );
}

// ── Hours ────────────────────────────────────────────────
function Hours({ records, loading }) {
  const totalHours = calcTotalHours(records);
  const uniqueDays = [...new Set(records.map(r => r.date))].length;
  const avgHours   = uniqueDays > 0 ? (totalHours / uniqueDays).toFixed(1) : 0;

  // Group by date
  const byDate = {};
  records.forEach(r => {
    if (!byDate[r.date]) byDate[r.date] = { checkin: null, checkout: null };
    if (r.checked_in_at  && !byDate[r.date].checkin)  byDate[r.date].checkin  = r.checked_in_at;
    if (r.checked_out_at && !byDate[r.date].checkout) byDate[r.date].checkout = r.checked_out_at;
  });

  const dailyRows = Object.entries(byDate).sort((a,b) => b[0].localeCompare(a[0])).map(([date, t]) => {
    const hrs = t.checkin && t.checkout
      ? ((new Date(t.checkout) - new Date(t.checkin)) / 3600000).toFixed(2)
      : "—";
    return [
      date,
      t.checkin  ? new Date(t.checkin).toLocaleTimeString("en-PH")  : "—",
      t.checkout ? new Date(t.checkout).toLocaleTimeString("en-PH") : "No checkout",
      hrs !== "—" ? hrs + " hrs" : "—",
    ];
  });

  return (
    <>
      <PageHeader title="Total Hours Summary" sub="Your computed OJT hours" />
      <div style={row}>
        <StatCard label="Total Days"   value={uniqueDays}       color="#1A2E5A" />
        <StatCard label="Total Hours"  value={totalHours + "h"} color="#2E86C1" />
        <StatCard label="Average/Day"  value={avgHours + "h"}   color="#059669" />
        <StatCard label="Required"     value="486h"             color="#94a3b8" sub="Standard OJT requirement" />
      </div>
      {/* Progress bar */}
      <div style={card}>
        <div style={cardLabel}>OJT Progress (out of 486 hours)</div>
        <div style={{ marginTop:12, background:"#e2e8f0", borderRadius:99, height:12, overflow:"hidden" }}>
          <div style={{ width: Math.min((totalHours/486)*100, 100) + "%", height:"100%", background:"#2E86C1", borderRadius:99, transition:"width 0.5s" }} />
        </div>
        <div style={{ fontSize:12, color:"#64748b", marginTop:6 }}>
          {totalHours}h completed · {Math.max(486-totalHours,0)}h remaining
        </div>
      </div>
      {loading ? <Spinner /> : (
        <div style={{ marginTop:"1rem" }}>
          <Table headers={["Date","Time In","Time Out","Hours Worked"]} rows={dailyRows} />
        </div>
      )}
    </>
  );
}

// ── Submit Online ─────────────────────────────────────────
function SubmitOnline({ user }) {
  const [form, setForm]       = useState({ date:"", description:"" });
  const [submitting, setSub]  = useState(false);
  const [msg, setMsg]         = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault(); setSub(true); setMsg(null);
    try {
      const res  = await fetch(`${API}/intern/submit-online`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ user_id:user.id, ...form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setMsg({ type:"success", text:data.message });
      setForm({ date:"", description:"" });
    } catch(err) { setMsg({ type:"error", text:err.message }); }
    finally { setSub(false); }
  };

  return (
    <>
      <PageHeader title="Submit Online Attendance" sub="For asynchronous or remote workdays" />
      <div style={{ ...card, maxWidth:560 }}>
        <div style={{ fontSize:13, color:"#64748b", marginBottom:"1.25rem", lineHeight:1.6, background:"#eff6ff", padding:"10px 14px", borderRadius:8 }}>
          📌 Submit your online attendance for days you worked remotely. Your supervisor will review and approve or reject your submission.
        </div>
        {msg && (
          <div style={{ padding:"10px 14px", borderRadius:8, border:"1px solid", fontSize:13, marginBottom:"1rem",
            background: msg.type==="success"?"#f0fdf4":"#fef2f2",
            borderColor: msg.type==="success"?"#86efac":"#fca5a5",
            color: msg.type==="success"?"#15803d":"#dc2626",
          }}>{msg.text}</div>
        )}
        <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:"1rem" }}>
          <div style={field}>
            <label style={lbl}>Date of Work</label>
            <input type="date" value={form.date} required
              max={new Date().toISOString().split("T")[0]}
              onChange={e => setForm(f=>({...f,date:e.target.value}))}
              style={inp} />
          </div>
          <div style={field}>
            <label style={lbl}>Description of Tasks Completed</label>
            <textarea rows={6} value={form.description} required
              placeholder="Describe in detail the tasks you completed on this day..."
              onChange={e => setForm(f=>({...f,description:e.target.value}))}
              style={{...inp,resize:"vertical",lineHeight:1.6}} />
          </div>
          <button type="submit" disabled={submitting}
            style={{...btn,opacity:submitting?0.7:1}}>
            {submitting ? "Submitting..." : "Submit for Supervisor Approval"}
          </button>
        </form>
      </div>
    </>
  );
}

// ── Profile ───────────────────────────────────────────────
function Profile({ user, uniqueDays, totalHours }) {
  return (
    <>
      <PageHeader title="My Profile" sub="Your account information" />
      <div style={{ display:"flex", gap:"1.25rem", flexWrap:"wrap" }}>
        <div style={{ ...card, flex:"0 0 280px" }}>
          <div style={{ textAlign:"center", marginBottom:"1rem" }}>
            <div style={{ width:72, height:72, borderRadius:"50%", background:"#2E86C1", display:"flex", alignItems:"center", justifyContent:"center", fontSize:28, fontWeight:700, color:"#fff", margin:"0 auto 12px" }}>
              {user.name?.charAt(0).toUpperCase()}
            </div>
            <div style={{ fontSize:16, fontWeight:700, color:"#0f172a" }}>{user.name}</div>
            <div style={{ fontSize:13, color:"#64748b", marginTop:4 }}>{user.email}</div>
            <div style={{ marginTop:8 }}><Badge label="OJT Intern" type="onsite" /></div>
          </div>
          <div style={{ borderTop:"1px solid #f1f5f9", paddingTop:"1rem" }}>
            {[
              ["User ID",   "#" + user.id],
              ["Role",      "OJT Intern"],
              ["Days Done", uniqueDays + " days"],
              ["Hours",     totalHours + " hours"],
            ].map(([k,v]) => (
              <div key={k} style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
                <span style={{ fontSize:12, color:"#94a3b8" }}>{k}</span>
                <span style={{ fontSize:13, fontWeight:500, color:"#1e293b" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ ...card, flex:1 }}>
          <div style={cardLabel}>OJT Progress</div>
          <div style={{ marginTop:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, color:"#64748b", marginBottom:8 }}>
              <span>{totalHours} hrs completed</span>
              <span>486 hrs required</span>
            </div>
            <div style={{ background:"#e2e8f0", borderRadius:99, height:16, overflow:"hidden" }}>
              <div style={{ width:Math.min((totalHours/486)*100,100)+"%", height:"100%", background:"linear-gradient(90deg,#2E86C1,#00B4D8)", borderRadius:99, transition:"width 0.5s" }} />
            </div>
            <div style={{ fontSize:12, color:"#94a3b8", marginTop:8 }}>
              {Math.max(486-totalHours,0)} hours remaining · {((totalHours/486)*100).toFixed(1)}% complete
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Helpers ───────────────────────────────────────────────
function calcTotalHours(records) {
  let total = 0;
  const byDate = {};
  records.forEach(r => {
    if (!byDate[r.date]) byDate[r.date] = {};
    if (r.checked_in_at  && !byDate[r.date].in)  byDate[r.date].in  = r.checked_in_at;
    if (r.checked_out_at && !byDate[r.date].out) byDate[r.date].out = r.checked_out_at;
  });
  Object.values(byDate).forEach(({ in: i, out: o }) => {
    if (i && o) total += (new Date(o) - new Date(i)) / 3600000;
  });
  return Math.round(total * 10) / 10;
}

const row   = { display:"flex", gap:"1rem", marginBottom:"1.25rem", flexWrap:"wrap" };
const card  = { background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", padding:"1.25rem" };
const cardLabel = { fontSize:11, fontWeight:600, color:"#94a3b8", textTransform:"uppercase", letterSpacing:0.5, marginBottom:8 };
const field = { display:"flex", flexDirection:"column", gap:6 };
const lbl   = { fontSize:13, fontWeight:600, color:"#374151" };
const inp   = { padding:"10px 14px", border:"1px solid #e2e8f0", borderRadius:8, fontSize:14, color:"#1e293b", fontFamily:"inherit" };
const btn   = { padding:"12px", background:"#1A2E5A", color:"#fff", border:"none", borderRadius:10, fontSize:14, fontWeight:600, cursor:"pointer" };
function SubmitMov({ user }) {
  const [title, setTitle]   = useState("");
  const [file, setFile]     = useState(null);
  const [movs, setMovs]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => { fetchMovs(); }, []);

  const fetchMovs = async () => {
    try {
      const res = await fetch(`${API}/intern/my-movs?user_id=${user.id}`);
      setMovs(await res.json());
    } finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setMsg({ type:"error", text:"Please select a file." }); return; }
    setSubmitting(true); setMsg(null);
    try {
      const fd = new FormData();
      fd.append("user_id", user.id);
      fd.append("title", title);
      fd.append("file", file);
      const res = await fetch(`${API}/intern/submit-mov`, { method:"POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setMsg({ type:"success", text: data.message });
      setTitle(""); setFile(null);
      fetchMovs();
    } catch (err) {
      setMsg({ type:"error", text: err.message });
    } finally { setSubmitting(false); }
  };

  return (
    <>
      <PageHeader title="Submit MOV" sub="Upload documents, certificates, or forms for review" />
      <div style={{ ...card, maxWidth:560, marginBottom:"1.25rem" }}>
        {msg && (
          <div style={{ padding:"10px 14px", borderRadius:8, border:"1px solid", fontSize:13, marginBottom:"1rem",
            background: msg.type==="success"?"#f0fdf4":"#fef2f2",
            borderColor: msg.type==="success"?"#86efac":"#fca5a5",
            color: msg.type==="success"?"#15803d":"#dc2626",
          }}>{msg.text}</div>
        )}
        <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:"1rem" }}>
          <div style={field}>
            <label style={lbl}>Document Title</label>
            <input type="text" required placeholder="e.g. Endorsement Letter, MOA Copy"
              value={title} onChange={e => setTitle(e.target.value)} style={inp} />
          </div>
          <div style={field}>
            <label style={lbl}>File</label>
            <input type="file" required accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              onChange={e => setFile(e.target.files[0])} style={inp} />
          </div>
          <button type="submit" disabled={submitting} style={{ ...btn, opacity: submitting ? 0.7 : 1 }}>
            {submitting ? "Uploading..." : "Submit MOV"}
          </button>
        </form>
      </div>

      <div style={cardLabel}>My Submissions</div>
      {loading ? <Spinner /> : (
        <Table
          headers={["Title","File","Status","Remarks","Submitted"]}
          rows={movs.map(m => [
            m.title,
            <a href={`http://localhost:8000/storage/${m.file_path}`} target="_blank" rel="noopener noreferrer" style={{ color:"#2E86C1" }}>{m.original_name}</a>,
            <Badge label={m.status.charAt(0).toUpperCase()+m.status.slice(1)} type={m.status==="approved"?"approved":m.status==="rejected"?"rejected":"pending"} />,
            m.remarks || "—",
            new Date(m.created_at).toLocaleDateString("en-PH"),
          ])}
          empty="No submissions yet."
        />
      )}
    </>
  );
}
