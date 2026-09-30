import { useState, useEffect, useRef } from "react";
import schoolLogo from "./assets/logo.png";

const API = "http://localhost:8000/api";

export default function App() {
  const [status, setStatus]   = useState(null);
  const [log, setLog]         = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const buffer = useRef("");
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Enter") {
        const uid = buffer.current.trim();
        buffer.current = "";
        if (uid.length >= 4) handleTap(uid);
      } else {
        if (e.key.length === 1) buffer.current += e.key;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);
  useEffect(() => {
  const interval = setInterval(() => {
    setTime(new Date());
  }, 1000);

  return () => clearInterval(interval);
}, []);

  const handleTap = async (uid) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/tap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Server error");
      setStatus(data);
      setLog((prev) => [data, ...prev].slice(0, 50));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isIn = status?.action === "CHECK_IN";

  return (
    <div style={s.page}>
      <div style={s.layout}>

        {/* ── LEFT PANEL ── */}
        <div style={s.left}>

          {/* Header */}
          <div style={s.header}>
            <img
              src={schoolLogo}
              alt="CSU Logo"
              style={{ width: 64, height: 64, objectFit: "contain", flexShrink: 0 }}
            />
            <div style={{ flex: 1, borderLeft: "1px solid rgba(255, 255, 255, 0.15)", paddingLeft: 14 }}>
              <div style={{ fontSize: 25, fontWeight: 700, color: "#fff", letterSpacing: 0.3, marginBottom:7 }}>
                Caraga State University
              </div>
              <div style={{ fontSize: 12, fontWeight: 500, color: "#ffffff", marginBottom: 1 }}>
                NFC Internship Attendance Monitoring
              </div>
              <div style={{ gap: 6, marginTop: 2, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center",  }}>
                <span style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "#22c55e",
                  boxShadow: "0 0 6px #22c55e",
                  animation: "pulse 1.5s infinite",
                  display: "inline-block",
                  flexShrink: 0,
                  marginTop: 1,
                }} />

                {/* DATE */}
                <span style={{
                  fontSize: 11,
                  color: "#93c5fd",
                  lineHeight: 1,
                  marginLeft: 5,
                }}>
                  {time.toLocaleDateString("en-PH", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>

                {/* TIME */}
                <span style={{
                  fontSize: 11,
                  color: "#93c5fd",
                  marginLeft: 8,
                }}>
                  {time.toLocaleTimeString("en-PH", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
              </div>
            </div>
          </div>

          {/* Scan area */}
          <div style={s.scanCard}>
            <div style={s.nfcRing}>
              {loading ? (
                <div style={s.spinner} />
              ) : (
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <circle cx="24" cy="24" r="16" stroke="#1c221d" strokeWidth="2" fill="none"/>
                  <circle cx="24" cy="24" r="10" stroke="#3e963e" strokeWidth="2" fill="none"/>
                  <circle cx="24" cy="24" r="4" fill="#1c221d"/>
                  <line x1="2"  y1="24" x2="6"  y2="24" stroke="#1c221d" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="42" y1="24" x2="46" y2="24" stroke="#1c221d" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="24" y1="2"  x2="24" y2="6"  stroke="#1c221d" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="24" y1="42" x2="24" y2="46" stroke="#1c221d" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              )}
            </div>
            <div style={s.scanText}>
              {loading ? "Reading card..." : "Tap your NFC card on the reader"}
            </div>
            <div style={s.scanSub}>
              {loading ? "Please wait..." : "The reader will detect your card automatically"}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={s.errorBox}>
              <div style={s.errorIcon}>!</div>
              <span>{error}</span>
            </div>
          )}

          {/* Status result */}
          {status && !loading && (
            <div style={{
              ...s.statusBox,
              background: isIn ? "#ffffff" : "#eff6ff",
              borderColor: isIn ? "#86efac" : "#224129",
            }}>
              <div style={s.statusTop}>
                <div style={{
                  ...s.statusBadge,
                  background: isIn ? "#dcfce7" : "#dbeafe",
                  color: isIn ? "#255ba8" : "#c23131",
                }}>
                  {isIn ? "✓ CHECKED IN" : "✓ CHECKED OUT"}
                </div>
                <div style={s.statusTime}>{status.time}</div>
              </div>
              <div style={s.statusName}>{status.name || "Unknown Intern"}</div>
              <div style={s.statusUid}>UID: {status.uid} · {status.date}</div>
              <div style={s.tokenWrap}>
                <div style={s.tokenLabel}>UUID v4 Token (bound: UID · Date · Action)</div>
                <div style={s.tokenVal}>{status.token}</div>
              </div>
            </div>
          )}

          {/* Simulate button */}
          <button
            style={{ ...s.testBtn, opacity: loading ? 0.6 : 1 }}
            onClick={() => handleTap("1248158722")}
            disabled={loading}
          >
            {loading ? "Processing..." : "Simulate Tap (Test)"}
          </button>

        </div>

        {/* ── RIGHT PANEL — LOG ── */}
        <div style={s.right}>
          <div style={s.logHeader}>
            <div style={s.logTitle}>Attendance Log</div>
            <div style={s.logCount}>
              {log.length} record{log.length !== 1 ? "s" : ""}
            </div>
          </div>

          <div style={s.logList}>
            {log.length === 0 ? (
              <div style={s.emptyState}>
                <div style={s.emptyIcon}>📋</div>
                <div style={{ fontSize: 14, color: "#38782a" }}>No records yet</div>
                <div style={s.emptySub}>Tap a card to begin logging</div>
              </div>
            ) : (
              log.map((entry, i) => (
                <div key={i} style={s.logEntry}>
                  <div style={{
                    ...s.logBadge,
                    background: entry.action === "CHECK_IN" ? "#bedbe8" : "#fbd8d8",
                    color:      entry.action === "CHECK_IN" ? "#255ba8" : "#c23131",
                  }}>
                    {entry.action === "CHECK_IN" ? "IN" : "OUT"}
                  </div>
                  <div style={s.logInfo}>
                    <div style={s.logName}>{entry.name || entry.uid}</div>
                    <div style={s.logToken}>{entry.token}</div>
                  </div>
                  <div style={s.logTime}>{entry.time}</div>
                </div>
              ))
            )}
          </div>

          {log.length > 0 && (
            <div style={s.logFooter}>
              <button style={s.clearBtn} onClick={() => setLog([])}>
                Clear log
              </button>
            </div>
          )}
        </div>

      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.7); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { height: 100%; }
        body { background: #f1f5f9; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 99px; }
      `}</style>
    </div>
  );
}

const s = {
  page: {
    height: "100vh",
    background: "#f1f5f9",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Segoe UI', sans-serif",
    padding: "1.25rem",
  },
  layout: {
    display: "flex",
    gap: "1.25rem",
    width: "100%",
    maxWidth: 940,
    height: "calc(100vh - 2.5rem)",
    alignItems: "stretch",
  },

  // ── Left ──
  left: {
    width: 420,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  header: {
  background: "#1a5a26",
  borderRadius: 14,
  padding: "1rem 1.25rem",
  display: "flex",
  alignItems: "center",
  gap: 14,
  flexShrink: 0,
},
  headerDot: {
    width: 10, height: 10, borderRadius: "50%",
    background: "#22c55e", flexShrink: 0,
    boxShadow: "0 0 8px #22c55e",
  },
  headerTitle: { fontSize: 15, fontWeight: 600, color: "#fff" },
  headerSub:   { fontSize: 11, color: "#93c5fd", marginTop: 2 },

  scanCard: {
    background: "#ffffff",
    borderRadius: 14,
    border: "1px solid #e2f0e3",
    padding: "1rem 1rem",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.75rem",
    flexShrink: 0,
  },
  nfcRing: {
    width: 90, height: 90, borderRadius: "50%",
    background: "#eff6ff", border: "2px solid #2b7b3c",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  spinner: {
    width: 36, height: 36,
    border: "3px solid #e2e8f0",
    borderTop: "3px solid #28772f",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  scanText: { fontSize: 15, fontWeight: 600, color: "#1e3b20", textAlign: "center" },
  scanSub:  { fontSize: 12, color: "#94b898", textAlign: "center" },

  errorBox: {
    background: "#fef2f2", border: "1px solid #fca5a5",
    borderRadius: 10, padding: "0.75rem 1rem",
    color: "#dc2626", fontSize: 13,
    display: "flex", alignItems: "center", gap: 8,
    flexShrink: 0,
  },
  errorIcon: {
    width: 20, height: 20, borderRadius: "50%",
    background: "#dc2626", color: "#fff",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 11, fontWeight: 700, flexShrink: 0,
  },

  statusBox: {
    borderRadius: 12, border: "1px solid",
    padding: "2rem 1.25rem", flexShrink: 0,
  },
  statusTop: {
    display: "flex", justifyContent: "space-between",
    alignItems: "center", marginBottom: 8,
  },
  statusBadge: {
    fontSize: 11, fontWeight: 700,
    padding: "3px 10px", borderRadius: 99, letterSpacing: 0.5,
  },
  statusTime: {
    fontSize: 12, color: "#19551c",
    fontFamily: "'Courier New', monospace",
  },
  statusName: { fontSize: 20, fontWeight: 700, color: "#0f172a", marginBottom: 4 },
  statusUid:  { fontSize: 12, color: "#46556b", marginBottom: 10 },
  tokenWrap: {
    background: "rgba(0,0,0,0.04)",
    borderRadius: 8, padding: "8px 12px",
  },
  tokenLabel: {
    fontSize: 10, color: "#94a3b8",
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4,
  },
  tokenVal: {
    fontSize: 11, fontFamily: "'Courier New', monospace",
    color: "#553333", wordBreak: "break-all", lineHeight: 1.6,
  },

  testBtn: {
    width: "100%", padding: "12px",
    background: "#16541e", color: "#fff",
    border: "none", borderRadius: 10,
    cursor: "pointer", fontSize: 14, fontWeight: 500,
    marginTop: "auto", flexShrink: 0,
  },

  // ── Right ──
  right: {
    flex: 1,
    background: "#fff",
    borderRadius: 14,
    border: "1px solid #e2e8f0",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minHeight: 0,
  },
  logHeader: {
    padding: "1rem 1.25rem",
    borderBottom: "1px solid #f1f5f9",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexShrink: 0,
  },
  logTitle: { fontSize: 15, fontWeight: 600, color: "#1e293b" },
  logCount: {
    fontSize: 12, color: "#94a3b8",
    background: "#f8fafc", border: "1px solid #e2e8f0",
    borderRadius: 99, padding: "2px 10px",
  },
  logList: {
    flex: 1,
    overflowY: "auto",
    padding: "0.75rem",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  emptyState: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "3rem 1rem",
    textAlign: "center",
  },
  emptyIcon: { fontSize: 32, marginBottom: 4 },
  emptySub:  { fontSize: 12, color: "#cbd5e1" },

  logEntry: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    background: "#f8fafc",
    borderRadius: 10,
    border: "1px solid #f1f5f9",
    flexShrink: 0,
  },
  logBadge: {
    fontSize: 10, fontWeight: 700,
    padding: "3px 8px", borderRadius: 99,
    flexShrink: 0, letterSpacing: 0.3,
  },
  logInfo:  { flex: 1, minWidth: 0 },
  logName:  { fontSize: 13, fontWeight: 600, color: "#1e293b", marginBottom: 2 },
  logToken: {
    fontSize: 10, color: "#94a3b8",
    fontFamily: "'Courier New', monospace",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  logTime: {
    fontSize: 11, color: "#64748b",
    fontFamily: "'Courier New', monospace",
    flexShrink: 0,
  },

  logFooter: {
    padding: "0.75rem",
    borderTop: "1px solid #f1f5f9",
    flexShrink: 0,
  },
  clearBtn: {
    width: "100%", padding: "8px",
    background: "transparent", border: "1px solid #e2e8f0",
    borderRadius: 8, cursor: "pointer",
    fontSize: 13, color: "#94a3b8",
  },
};

