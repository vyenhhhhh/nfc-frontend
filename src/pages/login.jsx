import { useState } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";

const API = "http://localhost:8000/api";

export default function Login() {
  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`${API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Login failed.");
      sessionStorage.setItem("user", JSON.stringify(data));
      if (data.role === "intern")                                        navigate("/intern");
      else if (data.role === "supervisor")                               navigate("/supervisor");
      else if (data.role === "admin" || data.role === "ojt_coordinator") navigate("/admin");
      else setError("Unknown role. Contact administrator.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.card}>

        {/* Logo & Header */}
        <div style={s.header}>
          <img src={logo} alt="CSU Logo" style={s.logoImg} />
          <div style={s.headerText}>
            <div style={s.uniName}>CARAGA STATE UNIVERSITY</div>
            <div style={s.logoTitle}>OJT Attendance Monitoring Web Portal</div>
          </div>
        </div>

        <div style={s.divider} />

        <div style={s.formTitle}>Log in to your account</div>
        
        {error && (
          <div style={s.errorBox}>
            <span style={s.errorDot}>!</span> {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={s.form}>

          {/* Username */}
          <div>
            
            <div style={{ position: "relative" }}>
              <span style={s.inputIcon}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Username"
                required
                style={{ ...s.input, paddingLeft: 33 }}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <div style={{ position: "relative" }}>
              <span style={s.inputIcon}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </span>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                style={{ ...s.input, paddingLeft: 33, paddingRight: 38 }}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} style={s.eyeBtn}>
                {showPassword ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16541e" strokeWidth="2">
                    <path d="M17.94 17.94A10.94 10.94 0 0112 19C7 19 2.73 15.11 1 12c.73-1.31 1.72-2.61 2.94-3.79M9.9 4.24A10.94 10.94 0 0112 5c5 0 9.27 3.89 11 7-1.06 1.91-2.63 3.71-4.6 5.03M1 1l22 22"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button type="submit" style={{ ...s.btn, opacity: loading ? 0.7 : 1 }} disabled={loading}>
            {loading ? "..." : "Log In"}
          </button>
        </form>

        {/* Roles */}
        <div style={s.roles}>
          <div style={s.rolesLabel}>Available roles</div>
          <div style={s.rolesList}>
            {["Intern", "Supervisor", "OJT Coordinator", "Admin"].map(r => (
              <span key={r} style={s.roleBadge}>{r}</span>
            ))}
          </div>
        </div>

        <div style={s.terminalLink}>
          Running the NFC terminal?{" "}
          <a href="/" style={s.link}>Go to terminal →</a>
        </div>

      </div>

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root {
          height: 100%;
          width: 100%;
          overflow: hidden;
          background: #f0f4f8;
        }
        body { font-family: 'Segoe UI', sans-serif; }
        input:focus {
          outline: none;
          border-color: #16541e !important;
          box-shadow: 0 0 0 3px rgba(22,84,30,0.1) !important;
          background: #fff !important;
        }
      `}</style>
    </div>
  );
}

const s = {
  page: {
    height: "100vh",
    width: "100vw",
    background: "#f0f4f8",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "1rem",
    overflow: "hidden",
  },
  card: {
    background: "#fff",
    borderRadius: 18,
    border: "1px solid #e2e8f0",
    padding: "1.6rem 2.8rem",
    width: "100%",
    maxWidth: 500,
  },

  header: {
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap: "0.2rem",  
},
  logoImg: {
  width: 64,
  height: 64,
  objectFit: "contain ",
  flexShrink: 0,
},
headerText: {
  display: "flex",
  flexDirection: "column",
  textAlign: "left",
},
uniName: {
  fontSize: 19,
  fontWeight: 800,
  color: "#0f172a",
  lineHeight: 1.2,
  letterSpacing: "0.2px",
},
logoTitle: {
  fontSize: 13,
  fontWeight: 500,
  color: "#475569",
  marginTop: 2,
},
  logoTitle: { fontSize: 16, fontWeight: 700, color: "#0f172a", lineHeight: 1.3 },
  logoSub:   { fontSize: 12, color: "#64748b", marginTop: 3 },

  divider: { borderTop: "1px solid #f1f5f9", marginBottom: "0.8rem" },

  formTitle: { fontSize: 14, fontWeight: 600, color: "#0f172a", marginBottom: "0.9rem", textAlign: "center" },
  formSub:   { fontSize: 12, color: "#94a3b8", marginBottom: "1.2rem", textAlign: "center" },

  errorBox: {
    background: "#fef2f2", border: "1px solid #fca5a5",
    borderRadius: 8, padding: "9px 12px",
    color: "#dc2626", fontSize: 12,
    display: "flex", alignItems: "center", gap: 8,
    marginBottom: "0.8rem",
  },
  errorDot: {
    width: 16, height: 16, borderRadius: "50%",
    background: "#dc2626", color: "#fff",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    fontSize: 10, fontWeight: 700, flexShrink: 0,
  },

  form: { display: "flex", flexDirection: "column", gap: "0.75rem" },

  label: {
    fontSize: 11, fontWeight: 600, color: "#374151",
    display: "block", marginBottom: 5,
    letterSpacing: "0.4px", textTransform: "uppercase",
  },
  inputIcon: {
    position: "absolute", left: 11, top: "50%",
    transform: "translateY(-50%)",
    pointerEvents: "none", display: "flex",
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #e2e8f0",
    borderRadius: 9, fontSize: 13,
    color: "#1e293b", background: "#fafafa",
    transition: "border-color 0.2s, box-shadow 0.2s",
  },
  eyeBtn: {
    position: "absolute", right: 9, top: "50%",
    transform: "translateY(-50%)",
    background: "transparent", border: "none",
    cursor: "pointer", padding: 4, display: "flex",
  },
  btn: {
    padding: "11px", background: "#16541e", color: "#fff",
    border: "none", borderRadius: 10,
    fontSize: 14, fontWeight: 600, cursor: "pointer",
    width: "100%", letterSpacing: "0.2px",
  },

  roles: { marginTop: "1rem", paddingTop: "0.1rem", borderTop: "1px solid #f1f5f9" },
  rolesLabel: {
    fontSize: 10, color: "#94a3b8",
    textTransform: "uppercase", letterSpacing: "0.8px",
    marginBottom: 8, textAlign: "center",
  },
  rolesList: { display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "center" },
  roleBadge: {
    fontSize: 11, padding: "3px 10px",
    background: "#f0fdf4", color: "#16541e",
    borderRadius: 99, border: "1px solid #bbf7d0",
  },

  terminalLink: { marginTop: "0.9rem", fontSize: 12, color: "#94a3b8", textAlign: "center" },
  link: { color: "#16541e", fontWeight: 600, textDecoration: "none" },
};