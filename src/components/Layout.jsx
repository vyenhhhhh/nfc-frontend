import { useNavigate, useLocation } from "react-router-dom";
import logo from "../assets/logo.png";

const ICONS = {
  home: <path d="M3 12l9-9 9 9M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" />,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  list: <><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>,
  folder: <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />,
  user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>,
  chart: <><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>,
  inbox: <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>,
  wifi: <><path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" /></>,
};

const Icon = ({ name, size = 17 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {ICONS[name] || ICONS.file}
  </svg>
);

export default function Layout({ children, navItems, role }) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const user      = JSON.parse(sessionStorage.getItem("user") || "{}");

  const logout = () => { sessionStorage.clear(); navigate("/login"); };

  const roleLabel = {
    intern:          "STUDENT",
    supervisor:      "SUPERVISOR",
    admin:           "ADMIN",
    ojt_coordinator: "COORDINATOR",
  }[user.role] || user.role?.toUpperCase();

  return (
    <div style={s.page}>
      {/* Animated contour background */}
      <div style={s.bgLayer}>
        <div style={{ ...s.blob, ...s.blob1 }} />
        <div style={{ ...s.blob, ...s.blob2 }} />
        <div style={{ ...s.blob, ...s.blob3 }} />
      </div>

      {/* Sidebar */}
      <div style={s.sidebar}>
        <div style={s.brand}>
          <div style={s.brandIcon}>
            <img src={logo} alt="CSU Logo" style={{ width: 22, height: 22, objectFit: "contain" }} />
          </div>
          <div>
            <div style={s.brandName}>CSU OJT</div>
            <span style={s.brandBadge}>{roleLabel}</span>
          </div>
        </div>

        <nav style={s.nav}>
          {navItems.map(({ path, label, icon }) => {
            const active = location.pathname === path;
            return (
              <button key={path} onClick={() => navigate(path)} style={{
                ...s.navBtn,
                background: active ? "linear-gradient(135deg, #16541e, #1f7a2b)" : "transparent",
                color: active ? "#fff" : "#475569",
                fontWeight: active ? 600 : 500,
                boxShadow: active ? "0 4px 14px rgba(22,84,30,0.28)" : "none",
              }}>
                <Icon name={icon} />
                {label}
              </button>
            );
          })}
        </nav>

        <div style={{ flex: 1 }} />

        <div style={s.profileRow} onClick={logout} title="Click to sign out">
          <div style={s.avatar}>{user.name?.charAt(0).toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={s.profileName}>{user.name}</div>
            <div style={s.profileRole}>{roleLabel}</div>
          </div>
        </div>
        <button onClick={logout} style={s.signOutBtn}>
          <Icon name="upload" size={15} /> Sign Out
        </button>
      </div>

      {/* Content */}
      <div style={s.content}>{children}</div>

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', sans-serif; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes float1 { 0%,100%{ transform: translate(0,0) scale(1); } 50%{ transform: translate(40px,-30px) scale(1.1); } }
        @keyframes float2 { 0%,100%{ transform: translate(0,0) scale(1); } 50%{ transform: translate(-30px,40px) scale(1.15); } }
        @keyframes float3 { 0%,100%{ transform: translate(0,0) scale(1); } 50%{ transform: translate(25px,25px) scale(0.95); } }
        input:focus, textarea:focus, select:focus { outline: none; border-color: #16541e !important; box-shadow: 0 0 0 3px rgba(22,84,30,0.1); }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 99px; }
        button:hover { filter: brightness(0.98); }
      `}</style>
    </div>
  );
}

export { Icon };

export const Spinner = () => (
  <div style={{ display:"flex", justifyContent:"center", padding:"4rem" }}>
    <div style={{ width:32, height:32, border:"3px solid #e2e8f0", borderTop:"3px solid #16541e", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
  </div>
);

export const LiveBadge = () => (
  <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:11, color:"#16541e", marginLeft:10 }}>
    <span style={{ width:6, height:6, borderRadius:"50%", background:"#16541e", animation:"pulse 1.5s infinite", display:"inline-block" }} />
    Live
  </span>
);

export const StatCard = ({ label, value, sub, color="#16541e" }) => (
  <div style={{ flex:1, background:"rgba(255,255,255,0.75)", backdropFilter:"blur(10px)", borderRadius:16, border:"1px solid rgba(255,255,255,0.6)", boxShadow:"0 4px 20px rgba(0,0,0,0.04)", padding:"1.1rem 1.25rem", minWidth:0 }}>
    <div style={{ fontSize:26, fontWeight:700, color }}>{value}</div>
    <div style={{ fontSize:13, color:"#1e293b", fontWeight:500, marginTop:4 }}>{label}</div>
    {sub && <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>{sub}</div>}
  </div>
);

export const PageHeader = ({ title, sub, live=false }) => (
  <div style={{
    background:"rgba(255,255,255,0.75)", backdropFilter:"blur(10px)",
    border:"1px solid rgba(255,255,255,0.6)", boxShadow:"0 4px 20px rgba(0,0,0,0.04)",
    borderRadius:18, padding:"1.5rem 1.75rem", marginBottom:"1.5rem",
  }}>
    <div style={{ fontSize:22, fontWeight:700, color:"#0f172a" }}>{title}</div>
    <div style={{ fontSize:13.5, color:"#64748b", marginTop:6 }}>
      {sub}{live && <LiveBadge />}
    </div>
  </div>
);

export const EmptyState = ({ icon="folder", title, sub }) => (
  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"3.5rem 1.5rem", textAlign:"center" }}>
    <div style={{ width:56, height:56, borderRadius:"50%", background:"#f1f5f9", display:"flex", alignItems:"center", justifyContent:"center", color:"#94a3b8", marginBottom:14 }}>
      <Icon name={icon} size={22} />
    </div>
    <div style={{ fontSize:15, fontWeight:600, color:"#1e293b", marginBottom:4 }}>{title}</div>
    {sub && <div style={{ fontSize:13, color:"#94a3b8", maxWidth:340, lineHeight:1.6 }}>{sub}</div>}
  </div>
);

export const SectionCard = ({ icon, title, count, children }) => (
  <div style={{ marginBottom:"1.5rem" }}>
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
      {icon && <span style={{ color:"#16541e", display:"flex" }}><Icon name={icon} size={16} /></span>}
      <span style={{ fontSize:15, fontWeight:700, color:"#0f172a" }}>{title}</span>
      {count !== undefined && <span style={{ fontSize:14, fontWeight:700, color:"#0f172a" }}>({count})</span>}
    </div>
    <div style={{ background:"rgba(255,255,255,0.75)", backdropFilter:"blur(10px)", border:"1px solid rgba(255,255,255,0.6)", boxShadow:"0 4px 20px rgba(0,0,0,0.04)", borderRadius:18, overflow:"hidden" }}>
      {children}
    </div>
  </div>
);

export const Badge = ({ label, type }) => {
  const styles = {
    in:       { bg:"#dcfce7", color:"#15803d" },
    out:      { bg:"#dbeafe", color:"#1d4ed8" },
    online:   { bg:"#eff6ff", color:"#1d4ed8" },
    onsite:   { bg:"#f0fdf4", color:"#15803d" },
    pending:  { bg:"#fef3c7", color:"#92400e" },
    approved: { bg:"#dcfce7", color:"#15803d" },
    rejected: { bg:"#fee2e2", color:"#991b1b" },
  };
  const st = styles[type] || { bg:"#f1f5f9", color:"#64748b" };
  return (
    <span style={{ fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:99, background:st.bg, color:st.color }}>
      {label}
    </span>
  );
};

export const Table = ({ headers, rows, empty="No records found." }) => (
  <div style={{ overflow:"auto" }}>
    {rows.length === 0 ? (
      <EmptyState icon="list" title="No records yet" sub={empty} />
    ) : (
      <table style={{ width:"100%", borderCollapse:"collapse" }}>
        <thead>
          <tr>{headers.map(h => <th key={h} style={tS.th}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => <td key={j} style={tS.td}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);

const tS = {
  th: { padding:"12px 18px", fontSize:11, fontWeight:600, color:"#94a3b8", textTransform:"uppercase", letterSpacing:0.5, textAlign:"left", background:"rgba(248,250,252,0.6)", borderBottom:"1px solid rgba(241,245,249,0.8)", whiteSpace:"nowrap" },
  td: { padding:"12px 18px", fontSize:13, color:"#1e293b", borderBottom:"1px solid rgba(248,250,252,0.8)" },
};

const s = {
  page:     { display:"flex", height:"100vh", overflow:"hidden", position:"relative", background:"#f4f7f5" },
  bgLayer:  { position:"absolute", inset:0, overflow:"hidden", zIndex:0, pointerEvents:"none" },
  blob:     { position:"absolute", borderRadius:"50%", filter:"blur(70px)", opacity:0.35 },
  blob1:    { width:420, height:420, top:-100, left:180, background:"#7fd897", animation:"float1 14s ease-in-out infinite" },
  blob2:    { width:380, height:380, bottom:-80, left:"45%", background:"#a7e3b5", animation:"float2 18s ease-in-out infinite" },
  blob3:    { width:320, height:320, top:"30%", right:-60, background:"#c9f0d0", animation:"float3 16s ease-in-out infinite" },

  sidebar:  {
    width:240, background:"rgba(255,255,255,0.7)", backdropFilter:"blur(16px)",
    borderRight:"1px solid rgba(255,255,255,0.5)",
    display:"flex", flexDirection:"column", padding:"1.25rem 1rem",
    flexShrink:0, overflowY:"auto", position:"relative", zIndex:1,
  },
  brand:    { display:"flex", alignItems:"center", gap:10, marginBottom:"1.75rem", padding:"0 0.25rem" },
  brandIcon:{ width:36, height:36, borderRadius:10, background:"#16541e", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 },
  brandName:{ fontSize:15, fontWeight:700, color:"#0f172a", lineHeight:1.2 },
  brandBadge:{
    fontSize:9.5, fontWeight:700, color:"#16541e", background:"#e9f7ee",
    padding:"2px 8px", borderRadius:99, letterSpacing:0.4, display:"inline-block", marginTop:3,
  },

  nav:      { display:"flex", flexDirection:"column", gap:3 },
  navBtn:   {
    display:"flex", alignItems:"center", gap:11,
    padding:"10px 12px", borderRadius:12, border:"none",
    cursor:"pointer", fontSize:13.5, textAlign:"left",
    transition:"all 0.2s", width:"100%",
  },

  profileRow: {
    display:"flex", alignItems:"center", gap:10,
    padding:"10px", borderRadius:12, border:"1px solid rgba(255,255,255,0.5)",
    background:"rgba(255,255,255,0.4)",
    cursor:"pointer", marginBottom:6,
  },
  avatar: {
    width:34, height:34, borderRadius:"50%", background:"#16541e",
    display:"flex", alignItems:"center", justifyContent:"center",
    fontSize:14, fontWeight:700, color:"#fff", flexShrink:0,
  },
  profileName: { fontSize:12.5, fontWeight:600, color:"#0f172a", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" },
  profileRole: { fontSize:10.5, color:"#94a3b8" },
  signOutBtn: {
    display:"flex", alignItems:"center", gap:8,
    padding:"9px 10px", borderRadius:9, border:"none",
    background:"transparent", color:"#dc2626", cursor:"pointer",
    fontSize:13, fontWeight:500, width:"100%",
  },

  content:  { flex:1, overflow:"auto", padding:"2rem 2.25rem", minWidth:0, position:"relative", zIndex:1 },
};