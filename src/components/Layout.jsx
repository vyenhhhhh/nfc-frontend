import { useNavigate, useLocation } from "react-router-dom";
import logo from "../assets/logo.png";

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
                background: active ? "#e9f7ee" : "transparent",
                color: active ? "#16541e" : "#475569",
                fontWeight: active ? 600 : 500,
              }}>
                <span style={s.navIcon}>{icon}</span>
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
          <span style={s.chevron}>›</span>
        </div>
        <button onClick={logout} style={s.signOutBtn}>
          <span>⎋</span> Sign Out
        </button>
      </div>

      {/* Content */}
      <div style={s.content}>{children}</div>

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', sans-serif; background: #f8faf9; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        input:focus, textarea:focus, select:focus { outline: none; border-color: #16541e !important; box-shadow: 0 0 0 3px rgba(22,84,30,0.1); }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 99px; }
        button:hover { filter: brightness(0.98); }
      `}</style>
    </div>
  );
}

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
  <div style={{ flex:1, background:"#fff", borderRadius:14, border:"1px solid #e5e7eb", padding:"1.1rem 1.25rem", minWidth:0 }}>
    <div style={{ fontSize:26, fontWeight:700, color }}>{value}</div>
    <div style={{ fontSize:13, color:"#1e293b", fontWeight:500, marginTop:4 }}>{label}</div>
    {sub && <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>{sub}</div>}
  </div>
);

export const PageHeader = ({ title, sub, live=false }) => (
  <div style={{
    background:"#fff", border:"1px solid #e5e7eb", borderRadius:16,
    padding:"1.5rem 1.75rem", marginBottom:"1.5rem",
  }}>
    <div style={{ fontSize:22, fontWeight:700, color:"#0f172a" }}>{title}</div>
    <div style={{ fontSize:13.5, color:"#64748b", marginTop:6 }}>
      {sub}{live && <LiveBadge />}
    </div>
  </div>
);

export const EmptyState = ({ icon="📭", title, sub }) => (
  <div style={{
    display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
    padding:"3.5rem 1.5rem", textAlign:"center",
  }}>
    <div style={{
      width:56, height:56, borderRadius:"50%", background:"#f1f5f9",
      display:"flex", alignItems:"center", justifyContent:"center",
      fontSize:24, marginBottom:14,
    }}>{icon}</div>
    <div style={{ fontSize:15, fontWeight:600, color:"#1e293b", marginBottom:4 }}>{title}</div>
    {sub && <div style={{ fontSize:13, color:"#94a3b8", maxWidth:340, lineHeight:1.6 }}>{sub}</div>}
  </div>
);

export const SectionCard = ({ icon, title, count, children }) => (
  <div style={{ marginBottom:"1.5rem" }}>
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
      {icon && <span style={{ fontSize:15 }}>{icon}</span>}
      <span style={{ fontSize:15, fontWeight:700, color:"#0f172a" }}>{title}</span>
      {count !== undefined && <span style={{ fontSize:14, fontWeight:700, color:"#0f172a" }}>({count})</span>}
    </div>
    <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:16, overflow:"hidden" }}>
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
  <div style={{ background:"#fff", borderRadius:16, border:"1px solid #e5e7eb", overflow:"auto" }}>
    {rows.length === 0 ? (
      <EmptyState icon="📋" title="No records yet" sub={empty} />
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
  th: { padding:"12px 18px", fontSize:11, fontWeight:600, color:"#94a3b8", textTransform:"uppercase", letterSpacing:0.5, textAlign:"left", background:"#fafbfc", borderBottom:"1px solid #f1f5f9", whiteSpace:"nowrap" },
  td: { padding:"12px 18px", fontSize:13, color:"#1e293b", borderBottom:"1px solid #f8fafc" },
};

const s = {
  page:     { display:"flex", height:"100vh", overflow:"hidden", background:"#f8faf9" },
  sidebar:  {
    width:240, background:"#fff", borderRight:"1px solid #eef1f0",
    display:"flex", flexDirection:"column", padding:"1.25rem 1rem",
    flexShrink:0, overflowY:"auto",
  },
  brand:    { display:"flex", alignItems:"center", gap:10, marginBottom:"1.75rem", padding:"0 0.25rem" },
  brandIcon:{ width:36, height:36, borderRadius:10, background:"#16541e", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 },
  brandName:{ fontSize:15, fontWeight:700, color:"#0f172a", lineHeight:1.2 },
  brandBadge:{
    fontSize:9.5, fontWeight:700, color:"#16541e", background:"#e9f7ee",
    padding:"2px 8px", borderRadius:99, letterSpacing:0.4, display:"inline-block", marginTop:3,
  },

  nav:      { display:"flex", flexDirection:"column", gap:2 },
  navBtn:   {
    display:"flex", alignItems:"center", gap:11,
    padding:"10px 12px", borderRadius:9, border:"none",
    cursor:"pointer", fontSize:13.5, textAlign:"left",
    transition:"all 0.15s", width:"100%",
  },
  navIcon:  { fontSize:16, width:18, textAlign:"center", flexShrink:0 },

  profileRow: {
    display:"flex", alignItems:"center", gap:10,
    padding:"10px", borderRadius:12, border:"1px solid #eef1f0",
    cursor:"pointer", marginBottom:6,
  },
  avatar: {
    width:34, height:34, borderRadius:"50%", background:"#16541e",
    display:"flex", alignItems:"center", justifyContent:"center",
    fontSize:14, fontWeight:700, color:"#fff", flexShrink:0,
  },
  profileName: { fontSize:12.5, fontWeight:600, color:"#0f172a", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" },
  profileRole: { fontSize:10.5, color:"#94a3b8", display:"flex", alignItems:"center", gap:4 },
  chevron: { fontSize:16, color:"#cbd5e1", flexShrink:0 },
  signOutBtn: {
    display:"flex", alignItems:"center", gap:8,
    padding:"9px 10px", borderRadius:9, border:"none",
    background:"transparent", color:"#dc2626", cursor:"pointer",
    fontSize:13, fontWeight:500, width:"100%",
  },

  content:  { flex:1, overflow:"auto", padding:"2rem 2.25rem", minWidth:0 },
};