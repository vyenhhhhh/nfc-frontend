// components/DashKit.jsx
// Shared shell (navbar + sidebar) and UI pieces for the Admin, Coordinator and Intern dashboards.
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import logo from "../assets/logo.png";

const API = "http://localhost:8000/api";
export const REQUIRED_HOURS = 486; // fallback when an intern has no program set

/* ── Required OJT hours per program ──────────────────────────────
   EXAMPLE VALUES ONLY — replace with the real numbers from the CCIS OJT office. */
export const PROGRAM_HOURS = { BSIT: 486, BSIS: 400, BSCS: 300 };
export const PROGRAMS = Object.keys(PROGRAM_HOURS);
export function programKey(program) {
  const p = String(program || "").toUpperCase();
  if (/BSIT|INFORMATION\s+TECH/.test(p)) return "BSIT";
  if (/BSIS|INFORMATION\s+SYS/.test(p)) return "BSIS";
  if (/BSCS|COMPUTER\s+SCI/.test(p)) return "BSCS";
  return null;
}
export const requiredHoursFor = (program) => PROGRAM_HOURS[programKey(program)] ?? REQUIRED_HOURS;

/* ── Internship requirements (edit the lists here) ── */
export const PRE_REQUIREMENTS = [
  { key: "letter_of_intent", label: "Letter of Intent", hint: "With your CV attached" },
  { key: "endorsement_letter", label: "Endorsement Letter", hint: "Signed by the OJT Coordinator, Chairperson and Dean of CCIS" },
  { key: "moa", label: "Memorandum of Agreement (MOA)", hint: "Must be approved and notarized — hours are not credited without it" },
  { key: "internship_contract", label: "Student Internship Contract" },
  { key: "medical_certificate", label: "Medical Certificate" },
  { key: "personal_history", label: "Student Trainee's Personal History", hint: "A4 size" },
  { key: "parents_consent", label: "Parents' Consent" },
  { key: "pledge", label: "Student's Pledge" },
  { key: "acceptance_form", label: "Acceptance Form" },
  { key: "insurance", label: "Insurance" },
];
export const POST_REQUIREMENTS = [
  { key: "certificate_of_completion", label: "Certificate of Completion" },
  { key: "evaluation_forms", label: "Evaluation Forms" },
  { key: "narrative_report", label: "Narrative Report" },
  { key: "dtr", label: "Daily Time Record (DTR)", hint: "Signed copy" },
];
const STORAGE = "http://localhost:8000/storage/";

// Two lines shown next to the logo when the sidebar is open
const BRAND_LINES = ["CSU CCIS", "MYTRACK"]; // e.g. ["CARAGA STATE", "UNIVERSITY"]

// Turns a stored photo path (e.g. "profiles/abc.jpg") into a full URL
export const photoUrl = (p) => (!p ? null : /^https?:\/\//.test(p) ? p : STORAGE + p);

/* ───────────────────────── helpers ───────────────────────── */
export const todayManila = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
export const fmtTime = (v) => (v ? new Date(v).toLocaleTimeString("en-PH") : "—");
export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
} 

// Total hours from a list of attendance records (first check-in / check-out per date).
// A check-out that is not later than the check-in is ignored (this used to cause negative hours).
export function calcHours(recs) {
  let total = 0;
  const byDate = {};
  recs.forEach((r) => {
    if (!byDate[r.date]) byDate[r.date] = {};
    if (r.checked_in_at && !byDate[r.date].in) byDate[r.date].in = r.checked_in_at;
    if (r.checked_out_at && !byDate[r.date].out) byDate[r.date].out = r.checked_out_at;
  });
  Object.values(byDate).forEach(({ in: i, out: o }) => {
    if (i && o) {
      const h = (new Date(o) - new Date(i)) / 3600000;
      if (h > 0) total += h;
    }
  });
  return Math.round(total * 10) / 10;
}

// "5 minutes ago", "2 hours ago", "Yesterday" ...
function timeAgo(v) {
  const d = new Date(v);
  if (!v || isNaN(d)) return "";
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "Just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m > 1 ? "s" : ""} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? "s" : ""} ago`;
  const days = Math.floor(h / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

/* ───────────────────────── icons ───────────────────────── */
const PATHS = {
  home: <path d="M3 11.5 12 4l9 7.5M5.5 10v10h13V10" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  inbox: <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z" /></>,
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
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
  trash: <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M6 6l1 14a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-14M10 11v6M14 11v6" />,
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  eye: <><path d="M2 12s3.5-7.5 10-7.5S22 12 22 12s-3.5 7.5-10 7.5S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeoff: <><path d="M17.9 17.9A10.4 10.4 0 0 1 12 19.5C5.5 19.5 2 12 2 12a18 18 0 0 1 4.1-5.1M9.9 4.6A9.7 9.7 0 0 1 12 4.5c6.5 0 10 7.5 10 7.5a18 18 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2" /><path d="M3 3l18 18" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="M10.8 12.2 20 3M16 7l3 3M14 9l2 2" /></>,
  pencil: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  print: <><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="9" rx="2" /><path d="M7 14h10v7H7z" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  camera: <><path d="M4 8a2 2 0 0 1 2-2h1.5l1-2h7l1 2H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="3.5" /></>,
  card: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></>,
  send: <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />,
  clip: <path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7-7l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9" />,
  bell: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />,
};
export const Icon = ({ name, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {PATHS[name]}
  </svg>
);

/* ───────────────────────── UI pieces ───────────────────────── */
export function Spinner() {
  return (
    <div className="ix-spin-wrap" role="status" aria-label="Loading">
      <div className="ix-spin" />
    </div>
  );
}

export function PageHeader({ title, sub, live, children }) {
  return (
    <div className="ix-ph">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      <div className="ix-ph-right">
        {live && <span className="ix-live"><i /> Live</span>}
        {children}
      </div>
    </div>
  );
}

export function StatCard({ label, value, icon, tone = "orange", sub }) {
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

export function Badge({ label, type }) {
  return <span className={`ix-badge ${type}`}>{label}</span>;
}

export function Section({ icon, title, count, live, children }) {
  return (
    <section className="ix-section">
      <header>
        <span className="ix-section-icon"><Icon name={icon} size={16} /></span>
        <h2>{title}</h2>
        {live && <span className="ix-live sm"><i /> Live</span>}
        {count !== undefined && <span className="ix-count">{count}</span>}
      </header>
      {children}
    </section>
  );
}

export function Empty({ icon, title, sub }) {
  return (
    <div className="ix-empty">
      <div className="ix-empty-icon"><Icon name={icon} size={26} /></div>
      <div className="ix-empty-title">{title}</div>
      {sub && <div className="ix-empty-sub">{sub}</div>}
    </div>
  );
}

export function Table({ headers, rows, empty = "Nothing here yet." }) {
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

export function Ring({ pct, size = 140, stroke = 12, track = "rgba(255,255,255,0.28)", color = "#fff", children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(pct || 0, 100));
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

export function Hero({ tag = "Overview", title, text, facts = [], ring }) {
  return (
    <div className="ix-hero">
      <span className="ix-hero-blob b1" />
      <span className="ix-hero-blob b2" />
      <div className="ix-hero-text">
        <span className="ix-hero-tag"><Icon name="nfc" size={14} /> {tag}</span>
        <h1>{title}</h1>
        {text && <p>{text}</p>}
        {facts.length > 0 && (
          <div className="ix-hero-facts">
            {facts.map((f) => (
              <div key={f.l}><strong>{f.v}</strong><span>{f.l}</span></div>
            ))}
          </div>
        )}
      </div>
      {ring && (
        <Ring pct={ring.pct} size={150} stroke={13}>
          <strong>{ring.top}</strong>
          <span>{ring.bottom}</span>
        </Ring>
      )}
    </div>
  );
}

export function Msg({ msg }) {
  if (!msg) return null;
  return <div className={`ix-msg ${msg.type}`} role="status">{msg.text}</div>;
}

export function Bar({ pct }) {
  return (
    <div className="ix-minibar">
      <div className="ix-bar-fill" style={{ width: Math.max(0, Math.min(pct || 0, 100)) + "%" }} />
    </div>
  );
}

export function Avatar({ name, photo, status, size = 44 }) {
  const [bad, setBad] = useState(false);
  const src = photoUrl(photo);
  useEffect(() => setBad(false), [photo]);
  return (
    <div className="ix-av" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {src && !bad ? <img src={src} alt="" onError={() => setBad(true)} /> : (name?.charAt(0).toUpperCase() || "?")}
      {status && <i className={`ix-dot ${status}`} />}
    </div>
  );
}

// Square profile photo for the sidebar
function SquarePhoto({ name, photo }) {
  const [bad, setBad] = useState(false);
  const src = photoUrl(photo);
  useEffect(() => setBad(false), [photo]);
  return (
    <div className="ix-side-photo">
      {src && !bad
        ? <img src={src} alt={name || "Profile photo"} onError={() => setBad(true)} />
        : <span>{name?.charAt(0).toUpperCase() || "?"}</span>}
    </div>
  );
}

// Click-to-choose square photo picker (used when adding a user)
export function PhotoPicker({ file, onChange }) {
  const [preview, setPreview] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) { setErr("Please choose an image file."); return; }
    if (f.size > 2 * 1024 * 1024) { setErr("Photo must be under 2 MB."); return; }
    setErr(null);
    onChange(f);
  };

  return (
    <div className="ix-photo-pick">
      <label className="ix-photo-box">
        <input type="file" accept="image/*" onChange={pick} />
        {preview
          ? <img src={preview} alt="Selected profile" />
          : <span className="ix-photo-ph"><Icon name="camera" size={26} /><small>Add photo</small></span>}
        <span className="ix-photo-badge"><Icon name="camera" size={13} /></span>
      </label>
      <div className="ix-photo-info">
        <strong>Profile photo</strong>
        <span>Square photo works best. JPG or PNG, max 2 MB.</span>
        {file && <button type="button" onClick={() => { setErr(null); onChange(null); }}>Remove photo</button>}
        {err && <em>{err}</em>}
      </div>
    </div>
  );
}

// `actions` = optional buttons shown beside the X (e.g. an Edit button); `wide` = bigger window
export function Modal({ title, sub, onClose, actions, wide, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="ix-modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={wide ? "ix-modal wide" : "ix-modal"} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <div>
            <h2>{title}</h2>
            {sub && <p>{sub}</p>}
          </div>
          <div className="ix-modal-tools">
            {actions}
            <button className="ix-modal-x" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
          </div>
        </header>
        <div className="ix-modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}

/* Account security: recovery code (view / replace) and change password.
   Each action asks for the current password in a small window. Used on every "My Profile" page. */
function PwInput({ value, onChange, placeholder, autoComplete, autoFocus }) {
  const [show, setShow] = useState(false);
  return (
    <div className="sec-pw">
      <input
        type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} autoComplete={autoComplete} autoFocus={autoFocus}
      />
      <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}>
        <Icon name={show ? "eye" : "eyeoff"} size={18} />
      </button>
    </div>
  );
}

export function AccountSecurity({ user }) {
  const [dob, setDob] = useState(null);
  const [code, setCode] = useState(null);       // the code, once revealed
  const [ask, setAsk] = useState(null);         // null | "show" | "new" | "pw"
  const [pw, setPw] = useState("");
  const [np, setNp] = useState("");
  const [np2, setNp2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [note, setNote] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`${API}/me?user_id=${user.id}`).then((r) => r.json())
      .then((d) => setDob(d?.date_of_birth ? String(d.date_of_birth).slice(0, 10) : ""))
      .catch(() => setDob(""));
  }, [user.id]);

  const close = () => { setAsk(null); setPw(""); setNp(""); setNp2(""); setErr(null); setBusy(false); };

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    if (ask === "pw") {
      if (np.length < 6) { setErr("New password must be at least 6 characters."); return; }
      if (np !== np2) { setErr("The new passwords don't match."); return; }
    }
    const path = ask === "show" ? "/account/recovery-code"
      : ask === "new" ? "/account/recovery-code/regenerate" : "/account/change-password";
    setBusy(true);
    try {
      const res = await fetch(`${API}${path}`, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ user_id: user.id, password: pw, ...(ask === "pw" ? { new_password: np } : {}) }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 429) throw new Error("Too many tries. Please wait a minute.");
      if (!res.ok) throw new Error((d.errors && Object.values(d.errors)[0]?.[0]) || d.message || "Something went wrong.");
      if (ask === "pw") { setCode(null); setNote({ type: "success", text: "Password changed." }); }
      else { setCode(d.code); setNote(ask === "new" ? { type: "success", text: "New recovery code created. The old one no longer works." } : null); }
      close();
    } catch (er) {
      setErr(er instanceof TypeError ? "Couldn't reach the server." : er.message);
      setBusy(false);
    }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };

  const dobLabel = dob ? new Date(dob + "T00:00:00").toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) : null;
  const titles = { show: "View recovery code", new: "Make a new recovery code", pw: "Change Password" };

  return (
    <section className="ix-card sec-card">
      <div className="ix-card-label">Account security</div>
      <Msg msg={note} />

      <div className="sec-row2">
        <div className="sec-label">Account Recovery Code</div>
        <div className="sec-value">
          <code className={code ? "show" : ""}>{code || "••••••••"}</code>
          {code && <button type="button" className="sec-ic" onClick={copy} aria-label="Copy code"><small>{copied ? "Copied" : "Copy"}</small></button>}
          <button type="button" className="sec-ic" aria-label={code ? "Hide code" : "Show code"}
            onClick={() => (code ? setCode(null) : setAsk("show"))}>
            <Icon name={code ? "eye" : "eyeoff"} size={18} />
          </button>
          <button type="button" className="sec-ic" aria-label="Make a new code" title="Make a new code" onClick={() => setAsk("new")}>
            <Icon name="pencil" size={17} />
          </button>
        </div>
        <small className="sec-hint">Use it on the login page (Forgot password?) to set a new password. It changes after every use, so check this page for the new one.</small>
      </div>

      <div className="sec-row2">
        <div className="sec-label">Date of birth</div>
        <div className="sec-value"><strong>{dob === null ? "…" : dobLabel || "Not set"}</strong></div>
        <small className="sec-hint">{dob === "" ? "Ask your administrator to add it. It can also be used to recover your account." : "Set by your administrator. It can also be used to recover your account."}</small>
      </div>

      <button type="button" className="ix-b warn sec-change" onClick={() => setAsk("pw")}>
        <Icon name="key" size={16} /> Change Password
      </button>

      {ask && (
        <Modal title={titles[ask]} sub={ask === "pw" ? null : "Enter your password to continue."} onClose={close}>
          <form onSubmit={submit} className="sec-form">
            {err && <div className="ix-hint" style={{ color: "#dc2626" }} role="alert">{err}</div>}
            <PwInput value={pw} onChange={setPw} placeholder="Current Password" autoComplete="current-password" autoFocus />
            {ask === "pw" && (
              <>
                <PwInput value={np} onChange={setNp} placeholder="New Password" autoComplete="new-password" />
                <PwInput value={np2} onChange={setNp2} placeholder="Re-type Password" autoComplete="new-password" />
              </>
            )}
            {ask === "new" && <small className="sec-hint">Your current code will stop working.</small>}
            <div className="ix-form-actions">
              <button type="button" className="ix-b ghost" onClick={close} disabled={busy}>Cancel</button>
              <button type="submit" className="ix-b primary" disabled={busy || !pw}>{busy ? "Please wait..." : ask === "pw" ? "Save" : "Continue"}</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}

/* "My Profile" page for admin, coordinator and supervisor (their own account) */
export function MyProfile({ user }) {
  const [me, setMe] = useState(null);
  const [draft, setDraft] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/me?user_id=${user.id}`);
      const d = await res.json();
      if (res.ok) setMe(d);
      else setMsg({ type: "error", text: d.message || "Could not load your profile." });
    } catch {
      setMsg({ type: "error", text: "Couldn't reach the server." });
    }
  }, [user.id]);
  useEffect(() => { load(); }, [load]);

  if (!me) return (<><PageHeader title="My Profile" sub="Your account information." />{msg ? <Msg msg={msg} /> : <Spinner />}</>);

  const parts = (me.name || "").trim().split(/\s+/);
  const base = () => ({
    first_name: me.first_name || parts[0] || "",
    middle_name: me.middle_name || "",
    last_name: me.last_name || (parts.length > 1 ? parts[parts.length - 1] : ""),
    contact_number: me.contact_number || "",
    address: me.address || "",
  });
  const setField = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  const save = async () => {
    const clean = Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, String(v).trim()]));
    if (!clean.first_name || !clean.last_name) { setMsg({ type: "error", text: "First name and last name are required." }); return; }
    setSaving(true); setMsg(null);
    try {
      const res = await fetch(`${API}/admin/users/${me.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(clean),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data?.errors && Object.values(data.errors)[0]?.[0]) || data?.message || "Could not save the changes.");

      let photo = me.photo;
      if (photoFile) {
        const fd = new FormData();
        fd.append("photo", photoFile);
        const rp = await fetch(`${API}/admin/users/${me.id}/photo`, { method: "POST", headers: { Accept: "application/json" }, body: fd });
        const pd = await rp.json().catch(() => null);
        if (!rp.ok) throw new Error(pd?.message || "Details saved, but the photo could not be uploaded.");
        photo = pd.photo;
      }

      // keep the signed-in session (sidebar name / photo) in step
      try {
        const cur = JSON.parse(sessionStorage.getItem("user") || "{}");
        sessionStorage.setItem("user", JSON.stringify({ ...cur, name: data.name || cur.name, photo }));
      } catch { /* ignore */ }

      setEditing(false); setPhotoFile(null);
      setMsg({ type: "success", text: "Profile updated." });
      await load();
      if (photoFile || data.name !== user.name) setTimeout(() => window.location.reload(), 700);
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    } finally { setSaving(false); }
  };

  const rows = [
    { key: "first_name", label: "First name", view: base().first_name || "—" },
    { key: "middle_name", label: "Middle name", view: me.middle_name || "—" },
    { key: "last_name", label: "Last name", view: base().last_name || "—" },
    { label: "Email", view: me.email || "—" },
    { label: "Role", view: ROLE_LABEL[me.role] || me.role },
    { key: "contact_number", label: "Contact", type: "tel", view: me.contact_number || "—" },
    { key: "address", label: "Address", view: me.address || "—" },
  ];

  return (
    <>
      <PageHeader title="My Profile" sub="Your account information." />
      <section className="imp-panel" style={{ marginTop: 0 }}>
        <div className="imp-tools">
          {!editing && (
            <button type="button" className="ix-b ghost sm" onClick={() => { setDraft(base()); setMsg(null); setEditing(true); }}>
              <Icon name="settings" size={14} /> Edit
            </button>
          )}
        </div>
        <div className="imp-top">
          <div className="imp-who">
            <Avatar name={me.name} photo={me.photo} size={96} />
            <h2>{me.name}</h2>
            <Badge label={ROLE_LABEL[me.role] || me.role} type={"r-" + me.role} />
            {editing && (
              <label className="ix-b ghost sm" style={{ cursor: "pointer", position: "relative" }}>
                <input
                  type="file" accept="image/*" style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0]; e.target.value = "";
                    if (!f) return;
                    if (!f.type.startsWith("image/") || f.size > 2 * 1024 * 1024) { setMsg({ type: "error", text: "Choose an image under 2 MB." }); return; }
                    setPhotoFile(f);
                  }}
                />
                <Icon name="camera" size={14} /> {photoFile ? photoFile.name.slice(0, 14) : "Change photo"}
              </label>
            )}
          </div>
          <dl className="imp-info">
            {rows.map((f) => (
              <div key={f.label}>
                <dt>{f.label}</dt>
                <dd title={String(f.view)}>
                  {editing && f.key
                    ? <input className="imp-edit" type={f.type || "text"} value={draft[f.key]} onChange={setField(f.key)} aria-label={f.label} />
                    : f.view}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        {editing && (
          <div className="imp-edit-bar">
            <button type="button" className="ix-b ghost" disabled={saving} onClick={() => { setEditing(false); setPhotoFile(null); setMsg(null); }}>Cancel</button>
            <button type="button" className="ix-b primary" disabled={saving} onClick={save}>{saving ? "Saving..." : "Save changes"}</button>
          </div>
        )}
        {msg && <div style={{ marginTop: 14 }}><Msg msg={msg} /></div>}
      </section>
      <AccountSecurity user={user} />
    </>
  );
}

/* Inline profile panel on Monitor Interns: attendance focus only.
   Personal details live in Manage Accounts (View). */
function InternProfile({ u, records, today, onClose, onViewRecords }) {
  const recs = records.filter((r) => r.user_id === u.id);
  const isIn = recs.some((r) => r.date === today && r.action === "CHECK_IN" && !r.checked_out_at);
  const days = [...new Set(recs.map((r) => r.date))].length;
  const total = calcHours(recs);
  const outputBased = u.tracking_type === "output";
  const required = requiredHoursFor(u.program);
  const pct = Math.min(Math.round((total / required) * 100), 100);
  const left = Math.max(Math.round((required - total) * 10) / 10, 0);
  const onsite = recs.filter((r) => r.uid !== "ONLINE").length;
  const online = recs.filter((r) => r.uid === "ONLINE").length;
  const studentId = u.student_id || u.student_number || "—";

  const todayRecs = recs.filter((r) => r.date === today);
  const tIn = todayRecs.find((r) => r.checked_in_at)?.checked_in_at;
  const tOut = todayRecs.find((r) => r.checked_out_at)?.checked_out_at;
  const lastDate = recs.map((r) => r.date).sort().pop();
  const fmtDate = (d) => {
    const x = new Date(d + "T00:00:00");
    return isNaN(x) ? d : x.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  };

  const emergencyWho = [u.emergency_contact_name, u.emergency_contact_relation && `(${u.emergency_contact_relation})`]
    .filter(Boolean).join(" ");

  const cell = (label, value) => (
    <div className="ipv-cell" key={label}>
      <span className="ipv-label">{label}</span>
      <div className="ipv-value">{value}</div>
    </div>
  );

  return (
    <section className="imp-panel ipv" aria-label={`Profile of ${u.name}`}>
      {/* header */}
      <div className="ipv-head">
        <Avatar name={u.name} photo={u.photo} size={84} status={isIn ? "on" : "off"} />
        <div className="ipv-head-main">
          <h2>{u.name}</h2>
          <div className="ipv-head-sub">
            <span>Student ID <strong>{studentId}</strong></span>
            {u.program && <span>{u.program}</span>}
            {u.placement && <span>{u.placement}</span>}
          </div>
          <Badge label={isIn ? "Present Now" : "Not In"} type={isIn ? "in" : "out"} />
        </div>
        <div className="ipv-head-actions">
          <button className="imp-close" onClick={onClose} aria-label="Close profile"><Icon name="x" size={16} /></button>
        </div>
      </div>

      {/* today */}
      <div className="ipv-block">
        <h3 className="ipv-title">Today</h3>
        <div className="ipv-grid c3">
          {cell("Time in", tIn ? fmtTime(tIn) : "Not in yet")}
          {cell("Time out", tOut ? fmtTime(tOut) : tIn ? <Badge label="Still in" type="in" /> : "—")}
          {cell("Last record", lastDate ? fmtDate(lastDate) : "—")}
        </div>
      </div>

      {/* quick contact */}
      <div className="ipv-block">
        <h3 className="ipv-title">Contact</h3>
        <div className="ipv-grid c3">
          {cell("Contact number", u.contact_number || "—")}
          {cell("Emergency contact", emergencyWho || "Not set")}
          {cell("Emergency number", u.emergency_contact_number || "—")}
        </div>
      </div>

      {/* attendance summary + progress */}
      <div className="ipv-block">
        <div className="ipv-title-row">
          <h3 className="ipv-title">Attendance summary</h3>
          {onViewRecords && (
            <button type="button" className="ix-b ghost sm" onClick={onViewRecords}>
              <Icon name="list" size={14} /> View all records
            </button>
          )}
        </div>
        <div className="ipv-grid c4 ipv-stats">
          <div className="ipv-cell"><strong>{days}</strong><span>Days present</span></div>
          <div className="ipv-cell"><strong>{onsite}</strong><span>Onsite taps</span></div>
          <div className="ipv-cell"><strong>{online}</strong><span>Online logs</span></div>
          <div className="ipv-cell"><strong>{outputBased ? "—" : total + "h"}</strong><span>Hours rendered</span></div>
        </div>

        {outputBased ? (
          <div className="ix-note" style={{ marginTop: 14 }}>
            <Icon name="info" size={18} />
            <span>This intern is <strong>output-based</strong>, so progress is measured by submitted MOVs, not hours.</span>
          </div>
        ) : (
          <div className="ipv-progress">
            <div className="ipv-progress-row">
              <span>OJT progress</span>
              <span><strong>{total}h</strong> of {required}h · {left}h left</span>
            </div>
            <div className="ipv-bar-line">
              <div className="ipv-bar"><div className="ix-bar-fill" style={{ width: `${Math.max(0, pct)}%` }} /></div>
              <strong>{pct}%</strong>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* Read-only details (same look as the Monitor Interns profile). Used in the View window in Manage Accounts. */
export function UserDetails({ u }) {
  const isIntern = u.role === "intern";
  const parts = (u.name || "").trim().split(/\s+/);
  const bday = u.date_of_birth
    ? new Date(String(u.date_of_birth).slice(0, 10) + "T00:00:00").toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })
    : "—";

  const cell = (label, value, full = false) => (
    <div className="ipv-cell" key={label} style={full ? { gridColumn: "1 / -1" } : undefined}>
      <span className="ipv-label">{label}</span>
      <div className="ipv-value">{value || "—"}</div>
    </div>
  );

  return (
    <div className="ipv ipv-modal">
      {/* header (same as Monitor Interns) */}
      <div className="ipv-head">
        <Avatar name={u.name} photo={u.photo} size={84} />
        <div className="ipv-head-main">
          <h2>{u.name}</h2>
          <div className="ipv-head-sub">
            <span>{isIntern ? "Student ID" : "Employee ID"} <strong>{u.student_id || "—"}</strong></span>
            {isIntern && u.program && <span>{u.program}</span>}
            {isIntern && u.placement && <span>{u.placement}</span>}
          </div>
          <Badge label={ROLE_LABEL[u.role] || u.role} type={"r-" + u.role} />
        </div>
      </div>

      <div className="ipv-block">
        <h3 className="ipv-title">Personal information</h3>
        <div className="ipv-grid c3">
          {cell("First name", u.first_name || parts[0])}
          {cell("Middle name", u.middle_name)}
          {cell("Last name", u.last_name || (parts.length > 1 ? parts[parts.length - 1] : ""))}
          {cell("Birthday", bday)}
          {cell("Email", u.email)}
          {cell("Contact number", u.contact_number)}
          {cell("Address", u.address, true)}
        </div>
      </div>

      {isIntern && (
        <>
          <div className="ipv-block">
            <h3 className="ipv-title">Internship details</h3>
            <div className="ipv-grid c3">
              {cell("College", u.college || "CCIS")}
              {cell("Program", u.program)}
              {cell("Semester", u.semester)}
              {cell("Placement", u.placement)}
              {cell("Work mode", u.work_mode === "offsite" ? "Offsite (WFH)" : "Onsite")}
              {cell("Tracking", u.tracking_type === "output" ? "Output-based" : "Hours-based")}
              {cell("NFC UID", u.nfc_uid || "Not linked", true)}
            </div>
          </div>

          <div className="ipv-block">
            <h3 className="ipv-title">Emergency contact</h3>
            <div className="ipv-grid c3">
              {cell("Full name", u.emergency_contact_name)}
              {cell("Relationship", u.emergency_contact_relation)}
              {cell("Contact number", u.emergency_contact_number)}
              {cell("Address", u.emergency_contact_address, true)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* Shared form for "Add New User" and "Edit User" (same look as the View window) */
export function UserForm({ f, set, mode, isIntern, header, title, sub, uidField, actions }) {
  const add = mode === "add";
  const today = new Date().toISOString().slice(0, 10);

  const cell = (label, control, { full = false, hint, plain = false } = {}) => {
    const Tag = plain ? "div" : "label";
    return (
      <Tag className="ipv-cell uf-cell" key={label} style={full ? { gridColumn: "1 / -1" } : undefined}>
        <span className="ipv-label">{label}</span>
        {control}
        {hint && <small className="uf-hint">{hint}</small>}
      </Tag>
    );
  };
  const text = (k, props = {}) => (
    <input className="uf-input" value={f[k] ?? ""} onChange={set(k)} {...props} />
  );

  return (
    <div className="ipv ipv-modal">
      <div className="ipv-head uf-head">
        {header}
        {title && (
          <div className="ipv-head-main">
            <h2>{title}</h2>
            {sub && <div className="ipv-head-sub"><span>{sub}</span></div>}
          </div>
        )}
      </div>

      <div className="ipv-block">
        <h3 className="ipv-title">Personal information</h3>
        <div className="ipv-grid c3">
          {cell("First name", text("first_name", { required: true }))}
          {cell("Middle name", text("middle_name"))}
          {cell("Last name", text("last_name", { required: true }))}
          {cell("Birthday", text("date_of_birth", { type: "date", max: today, required: add }),
            { hint: "Used for account recovery." })}
          {cell("Contact number", text("contact_number", { type: "tel", placeholder: "e.g. 09123456789" }))}
          {cell("Email", text("email", { type: "email", required: true, placeholder: "e.g. juan@csu.edu.ph" }))}
          {cell("Address", text("address", { placeholder: "Street, Barangay, City" }), { full: true })}
        </div>
      </div>

      <div className="ipv-block">
        <h3 className="ipv-title">Account</h3>
        <div className="ipv-grid c3">
          {cell(isIntern ? "Student ID" : "Employee ID",
            text("student_id", { required: add, placeholder: isIntern ? "e.g. 2021-00123" : "e.g. EMP-0001" }),
            { hint: "Used to sign up for account recovery." })}
          {add && cell("Role", (
            <select className="uf-input" value={f.role} onChange={set("role")}>
              <option value="intern">Intern</option>
              <option value="ojt_coordinator">OJT Coordinator</option>
              <option value="supervisor">Supervisor</option>
              <option value="admin">Admin</option>
            </select>
          ))}
          {cell(add ? "Password" : "Set new password",
            text("password", {
              type: "text", autoComplete: "off", required: add, minLength: add ? 6 : undefined,
              placeholder: add ? "At least 6 characters" : "Leave blank to keep",
            }))}
        </div>
      </div>

      {isIntern && (
        <>
          <div className="ipv-block">
            <h3 className="ipv-title">Internship details</h3>
            <div className="ipv-grid c3">
              {cell("College", <input className="uf-input" value="CCIS" disabled readOnly />)}
              {cell("Program", (
                <select className="uf-input" value={f.program} onChange={set("program")}>
                  {!add && <option value="">Select program</option>}
                  <option value="BSIT - 4">BSIT - 4</option>
                  <option value="BSCS - 4">BSCS - 4</option>
                  <option value="BSIS - 4">BSIS - 4</option>
                </select>
              ))}
              {cell("Semester", (
                <select className="uf-input" value={f.semester} onChange={set("semester")}>
                  {!add && <option value="">Select semester</option>}
                  <option value="1st Semester">1st Semester</option>
                  <option value="2nd Semester">2nd Semester</option>
                </select>
              ))}
              {cell("Placement", text("placement", { required: add, placeholder: "e.g. Provincial IT Office, Butuan City" }), { full: true })}
              {cell("Work mode", (
                <select className="uf-input" value={f.work_mode} onChange={set("work_mode")}>
                  <option value="onsite">Onsite</option>
                  <option value="offsite">Offsite (WFH)</option>
                </select>
              ))}
              {cell("Tracking", (
                <select className="uf-input" value={f.tracking_type} onChange={set("tracking_type")}>
                  <option value="hours">Hours-based</option>
                  <option value="output">Output-based</option>
                </select>
              ))}
              {cell("NFC card UID", uidField, { plain: true })}
            </div>
          </div>

          <div className="ipv-block">
            <h3 className="ipv-title">Emergency contact</h3>
            <div className="ipv-grid c3">
              {cell("Full name", text("emergency_contact_name"))}
              {cell("Relationship", text("emergency_contact_relation", { placeholder: "e.g. Mother" }))}
              {cell("Contact number", text("emergency_contact_number", { type: "tel" }))}
              {cell("Address", text("emergency_contact_address"), { full: true })}
            </div>
          </div>
        </>
      )}

      <div className="ipv-block">
        <div className="ix-form-actions">{actions}</div>
      </div>
    </div>
  );
}

/* Shared "Monitor Interns" page (same for admin and coordinator).
   Pass recordsPath (e.g. "/admin/records") to show the "View all records" button. */
export function InternMonitor({ interns, records, loading, onRefresh, recordsPath = null }) {
  const today = todayManila();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [open, setOpen] = useState(false);       // suggestions dropdown
  const [programFilter, setProgramFilter] = useState("all");
  const [active, setActive] = useState(0);       // highlighted suggestion
  const wrapRef = useRef(null);
  const panelRef = useRef(null);

  // close the suggestions when clicking elsewhere
  useEffect(() => {
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const q = search.trim().toLowerCase();
  const matchesProgram = (u) => programFilter === "all" || programKey(u.program) === programFilter;
  const suggestions = q
    ? interns.filter(matchesProgram).filter((u) => `${u.name} ${u.email} ${u.student_id ?? ""}`.toLowerCase().includes(q)).slice(0, 6)
    : [];

  // looked up by id so the panel stays live while the page polls
  const selected = interns.find((u) => u.id === selectedId) || null;

  const pick = (u) => {
    setSelectedId(u.id);
    setSearch(u.name);
    setOpen(false);
    setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  };
  const closeProfile = () => { setSelectedId(null); setSearch(""); };

  // clicking a card opens the profile without changing the search box
  const openCard = (u) => {
    setSelectedId(u.id);
    setOpen(false);
    setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const onSearchKey = (e) => {
    if (!open || !suggestions.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % suggestions.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + suggestions.length) % suggestions.length); }
    else if (e.key === "Enter") { e.preventDefault(); pick(suggestions[active] || suggestions[0]); }
    else if (e.key === "Escape") setOpen(false);
  };

  const updateSettings = async (id, field, value, current) => {
    setSaving(id);
    try {
      await fetch(`${API}/users/${id}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          work_mode: field === "work_mode" ? value : current.work_mode || "onsite",
          tracking_type: field === "tracking_type" ? value : current.tracking_type || "hours",
        }),
      });
      onRefresh && onRefresh();
    } finally {
      setSaving(null);
    }
  };

  const rows = interns
    .filter(matchesProgram)
    .filter((u) => `${u.name} ${u.email} ${u.student_id ?? ""}`.toLowerCase().includes(q))
    .map((u) => {
      const recs = records.filter((r) => r.user_id === u.id);
      return {
        u,
        isIn: recs.some((r) => r.date === today && r.action === "CHECK_IN" && !r.checked_out_at),
        days: [...new Set(recs.map((r) => r.date))].length,
        last: recs[0]?.date,
      };
    });
  const present = rows.filter((x) => x.isIn).length;

  return (
    <>
      <PageHeader title="Monitor Interns" sub="Real-time status of all interns." live />
      <div className="ix-toolbar">
        <div className="imp-search-wrap" ref={wrapRef}>
          <div className="ix-search">
            <Icon name="search" size={16} />
            <input
              type="text"
              placeholder="Search intern..."
              value={search}
              role="combobox"
              aria-expanded={open && suggestions.length > 0}
              aria-autocomplete="list"
              onChange={(e) => { setSearch(e.target.value); setOpen(true); setActive(0); if (selectedId) setSelectedId(null); }}
              onFocus={() => setOpen(true)}
              onKeyDown={onSearchKey}
            />
          </div>

          {open && q && (
            <ul className="imp-suggest" role="listbox">
              {suggestions.length === 0 ? (
                <li className="imp-suggest-empty">No intern found</li>
              ) : (
                suggestions.map((u, i) => (
                  <li key={u.id} role="option" aria-selected={i === active}>
                    <button
                      type="button"
                      className={i === active ? "imp-suggest-item active" : "imp-suggest-item"}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => pick(u)}
                    >
                      <Avatar name={u.name} photo={u.photo} size={32} />
                      <span className="imp-suggest-text">
                        <strong>{u.name}</strong>
                        <small>{u.email}</small>
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>

        <select
          className="ix-select"
          value={programFilter}
          onChange={(e) => { setProgramFilter(e.target.value); setSelectedId(null); }}
          aria-label="Filter by program"
        >
          <option value="all">All programs</option>
          <option value="BSIT">BSIT</option>
          <option value="BSCS">BSCS</option>
          <option value="BSIS">BSIS</option>
        </select>

        <span className="ix-chip green"><i /> {present} present now</span>
        <span className="ix-chip">{rows.length - present} not in</span>
      </div>

      {selected && (
        <div ref={panelRef}>
          <InternProfile
            key={selected.id} u={selected} records={records} today={today} onClose={closeProfile}
            onViewRecords={recordsPath ? () => navigate(recordsPath, { state: { search: selected.name } }) : null}
          />
        </div>
      )}

      {loading ? <Spinner /> : selected ? null : rows.length === 0 ? (
        <div className="ix-card"><Empty icon="users" title="No interns found" /></div>
      ) : (
        <div className="ix-intern-grid">
          {rows.map(({ u, isIn, days, last }) => (
            <div
              key={u.id}
              className={selectedId === u.id ? "ix-ic clickable selected" : "ix-ic clickable"}
              role="button"
              tabIndex={0}
              aria-label={`View profile of ${u.name}`}
              onClick={() => openCard(u)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openCard(u); }
              }}
            >
              <div className="ix-ic-top">
                <Avatar name={u.name} photo={u.photo} status={isIn ? "on" : "off"} />
                <div className="ix-ic-id">
                  <strong>{u.name}</strong>
                  <span>{u.email}</span>
                </div>
                <Badge label={isIn ? "Present Now" : "Not In"} type={isIn ? "in" : "out"} />
              </div>
              <div className="ix-ic-stats">
                <div><strong>{days}</strong><span>Days present</span></div>
                <div><strong>{last || "—"}</strong><span>Last record</span></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ───────────────────────── Announcements ───────────────────────── */
const fmtDay = (v) => {
  const d = new Date(v);
  return isNaN(d) ? "" : d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
};

// Read-only card (intern home). Polls so a new post shows up without a refresh.
export function AnnouncementBoard({ limit = 3 }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`${API}/announcements`, { headers: { Accept: "application/json" } });
        const data = await res.json();
        if (alive && Array.isArray(data)) setItems(data);
      } catch { /* keep what we have */ }
      finally { if (alive) setLoading(false); }
    };
    load();
    const iv = setInterval(() => { if (!document.hidden) load(); }, 15000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  return (
    <div className="ix-card adm-duty">
      <div className="adm-duty-head">
        <span className="adm-duty-icon" style={{ background: "linear-gradient(135deg, #f2864f, #e8582a)", boxShadow: "0 8px 16px rgba(232,88,42,0.3)" }}>
          <Icon name="bell" size={18} />
        </span>
        <h2>Announcements</h2>
        {items.length > 0 && <span className="ix-count">{items.length}</span>}
      </div>
      {loading ? <Spinner /> : items.length === 0 ? (
        <div className="adm-duty-empty">
          <strong>No announcements yet.</strong>
          <p>Important OJT announcements will appear here.</p>
        </div>
      ) : (
        <ul className="ann-list">
          {items.slice(0, limit).map((a) => (
            <li key={a.id}>
              <strong>{a.title}</strong>
              <p>{a.body}</p>
              <small>{a.author || "OJT office"} · {fmtDay(a.created_at)}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Full page for staff: post a new announcement + manage the old ones
export function AnnouncementManager({ user }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    try {
      const res = await fetch(`${API}/announcements`, { headers: { Accept: "application/json" } });
      const data = await res.json();
      if (Array.isArray(data)) setItems(data);
    } catch { /* keep what we have */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const post = async (e) => {
    e.preventDefault();
    setSaving(true); setMsg(null);
    try {
      const res = await fetch(`${API}/announcements`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ user_id: user.id, title: title.trim(), body: body.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || (data?.errors && Object.values(data.errors)[0]?.[0]) || "Could not post the announcement.");
      setMsg({ type: "success", text: "Posted. Interns have been notified." });
      setTitle(""); setBody("");
      load();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this announcement?")) return;
    try {
      await fetch(`${API}/announcements/${id}`, { method: "DELETE", headers: { Accept: "application/json" } });
      load();
    } catch { /* ignore */ }
  };

  return (
    <>
      <PageHeader title="Announcements" sub="Post updates for all interns. They get a notification right away." />
      <div className="ann-split">
        <div className="ix-card">
          <Msg msg={msg} />
          <form onSubmit={post} className="ix-form">
            <div className="ix-field">
              <label htmlFor="ann-title">Title</label>
              <input id="ann-title" type="text" required maxLength={150} value={title}
                placeholder="e.g. Orientation moved to Friday" onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="ix-field">
              <label htmlFor="ann-body">Message</label>
              <textarea id="ann-body" rows={6} required maxLength={2000} value={body}
                placeholder="Write the details interns need to know..." onChange={(e) => setBody(e.target.value)} />
            </div>
            <button type="submit" className="ix-b primary" disabled={saving}>
              <Icon name="send" size={15} /> {saving ? "Posting..." : "Post announcement"}
            </button>
          </form>
        </div>

        <Section icon="bell" title="Posted announcements" count={items.length}>
          {loading ? <Spinner /> : items.length === 0 ? (
            <Empty icon="bell" title="Nothing posted yet" sub="Your announcements will be listed here." />
          ) : (
            <ul className="ann-list ann-manage">
              {items.map((a) => (
                <li key={a.id}>
                  <div className="ann-row">
                    <strong>{a.title}</strong>
                    <button type="button" className="ix-b danger sm" onClick={() => remove(a.id)} aria-label={`Delete ${a.title}`}>
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                  <p>{a.body}</p>
                  <small>{a.author || "OJT office"} · {fmtDay(a.created_at)}</small>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}

/* ───────────────────────── Shell (navbar + sidebar) ───────────────────────── */
const ROLE_LABEL = {
  intern: "OJT Intern",
  supervisor: "Supervisor",
  admin: "Administrator",
  ojt_coordinator: "OJT Coordinator",
};

// The sidebar remembers whether it was left open, so it stays put when you change pages
const SIDEBAR_KEY = "ix_sidebar_open";
const isMobile = () => typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;

// Real notifications from the backend (GET /notifications?user_id=…).
// If the server can't be reached the bell simply keeps what it already has.
function useNotifications(userId) {
  const [items, setItems] = useState([]);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`${API}/notifications?user_id=${userId}`, { headers: { Accept: "application/json" } });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setItems(data);
    } catch {
      /* keep the previous list */
    }
  }, [userId]);

  useEffect(() => {
    load();
    const iv = setInterval(() => { if (!document.hidden) load(); }, 20000);
    return () => clearInterval(iv);
  }, [load]);

  const markRead = async (id) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));   // instant
    try {
      await fetch(`${API}/notifications/${id}/read`, { method: "PATCH", headers: { Accept: "application/json" } });
    } catch {
      /* it will sync on the next refresh */
    }
  };

  const markAllRead = () => items.filter((n) => !n.is_read).forEach((n) => markRead(n.id));

  return { items, markRead, markAllRead };
}

export default function Shell({ navItems, user, children }) {
  const navigate = useNavigate();
  const { pathname: path } = useLocation();
  const [menuOpen, setMenuOpen] = useState(() => {
    try { return !isMobile() && localStorage.getItem(SIDEBAR_KEY) === "1"; } catch { return false; }
  });
  const [isFull, setIsFull] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef(null);

  // student / employee ID and program are not in the login response, so read them from the account
  const [me, setMe] = useState(null);
  useEffect(() => {
    if (!user?.id) return;
    fetch(`${API}/me?user_id=${user.id}`).then((r) => r.json()).then((d) => setMe(d?.user || d)).catch(() => {});
    // eslint-disable-next-line
  }, []);
  const yearLabel = (p) => {
    const [prog, yr] = String(p || "").split(/\s*-\s*/);
    const n = parseInt(yr, 10);
    const sfx = n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
    return prog ? (n ? `${prog} · ${n}${sfx} Year` : prog) : "";
  };

  const { items: notifications, markRead, markAllRead } = useNotifications(user?.id);
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // One login page for everyone (it has the Intern / Employee picker)
  const loginPath = "/login";

  useEffect(() => {
    if (!user?.id) navigate(loginPath, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (isMobile()) setMenuOpen(false);   // on phones the menu is an overlay
        setNotifOpen(false);
      }
    };
    const onClick = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    const onFs = () => setIsFull(!!document.fullscreenElement);
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, []);

  // Remember the choice (desktop only)
  useEffect(() => {
    if (isMobile()) return;
    try { localStorage.setItem(SIDEBAR_KEY, menuOpen ? "1" : "0"); } catch { /* ignore */ }
  }, [menuOpen]);

  // On phones the sidebar covers the page, so close it after picking a page
  useEffect(() => {
    if (isMobile()) setMenuOpen(false);
    setNotifOpen(false);
  }, [path]);

  const logout = () => {
    sessionStorage.removeItem("user");
    localStorage.removeItem("ojt_remember"); // stops "Remember me" from signing back in
    navigate(loginPath, { replace: true });
  };
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  return (
    <div className="ix-page">
      <header className="ix-nav">
        <button className="ix-logo-btn" onClick={() => navigate(navItems[0].path)} aria-label="Home">
          <img src={logo} alt="CSU CCIS" className="ix-nav-logo" />
          <span className={menuOpen ? "ix-brand-name show" : "ix-brand-name"} aria-hidden={!menuOpen}>
            {BRAND_LINES[0]}<br />{BRAND_LINES[1]}
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
          <div className="ix-notification-wrap" ref={notifRef}>
            <button
              className="ix-notification-btn"
              onClick={() => setNotifOpen((o) => !o)}
              aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
              aria-expanded={notifOpen}
            >
              <Icon name="bell" size={19} />
              {unreadCount > 0 && <span className="ix-notification-count">{unreadCount > 9 ? "9+" : unreadCount}</span>}
            </button>

            {notifOpen && (
              <div className="ix-notification-dropdown">
                <div className="ix-notification-header">
                  <strong>Notifications</strong>
                  {unreadCount > 0
                    ? <button type="button" className="ix-notification-all" onClick={markAllRead}>Mark all read</button>
                    : <span>All caught up</span>}
                </div>

                <div className="ix-notification-list">
                  {notifications.length === 0 ? (
                    <div className="ix-no-notifications">No notifications yet.</div>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        className={`ix-notification-item ${n.is_read ? "read" : ""}`}
                        onClick={() => !n.is_read && markRead(n.id)}
                      >
                        <span className="ix-notification-dot" />
                        <span className="ix-notification-content">
                          <strong>{n.title}</strong>
                          <span>{n.message}</span>
                          <small>{timeAgo(n.created_at)}</small>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <button className="ix-logout" onClick={logout}>
            <Icon name="logout" size={17} />
            <span>Logout</span>
          </button>
        </div>
      </header>

      <div className="ix-body">
        <div className={menuOpen ? "ix-strip open" : "ix-strip"} />
        {menuOpen && <div className="ix-backdrop" onClick={() => setMenuOpen(false)} />}
        <aside className={menuOpen ? "ix-side open" : "ix-side"} aria-label="Main navigation">
          <div className="ix-side-profile" aria-hidden={!menuOpen}>
            <SquarePhoto name={user?.name} photo={user?.photo} />
            <div className="ix-side-who">
              <strong>{user?.name || "User"}</strong>
              <span className="ix-side-role">{ROLE_LABEL[user?.role] || "Staff"}</span>
              {me?.student_id && <span className="ix-side-meta">{user?.role === "intern" ? "ID No." : "Employee ID"} · {me.student_id}</span>}
              {user?.role === "intern" && me?.program && <span className="ix-side-meta">{yearLabel(me.program)}</span>}
            </div>
          </div>
          {navItems.map((it) => (
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
          <div className="ix-content" key={path}>{children}</div>
        </main>
      </div>

      <style>{css}</style>
    </div>
  );
}

/* ───────────────────────── styles ───────────────────────── */
const css = `
  .ix-page, .ix-page * { box-sizing: border-box; }
  html, body, #root { height: 100%; width: 100%; margin: 0; }
  .ix-page { font-family: 'Poppins', 'Segoe UI', sans-serif; color: #0f172a; }
  .ix-page h1, .ix-page h2, .ix-page p, .ix-page dl, .ix-page dd { margin: 0; }
  .ix-page button, .ix-page input, .ix-page select, .ix-page textarea { font-family: inherit; }
  .ix-page { height: 100vh; min-height: 620px; display: flex; flex-direction: column; background: #f3f5f7; }

  /* ───── Navbar ───── */
  .ix-nav { height: 75px; flex-shrink: 0; background: #fff; display: flex; align-items: center; gap: 10px; padding: 0 22px 0 15px; position: relative; z-index: 30; box-shadow: 0 4px 14px rgba(15,23,42,0.12); }
  .ix-nav::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 3px; pointer-events: none; background: linear-gradient(90deg, #f2733a, #ffb48f, #f59e0b, #f2733a); background-size: 200% 100%; animation: ix-slide 6s linear infinite; }
  .ix-logo-btn { background: none; border: none; cursor: pointer; display: flex; align-items: center; text-align: left; margin-right: 14px; }
  .ix-nav-logo { height: 36px; width: auto; flex-shrink: 0; }
  .ix-brand-name { display: block; overflow: hidden; white-space: nowrap; max-width: 0; opacity: 0; margin-left: 0; font-size: 11.5px; font-weight: 800; line-height: 1.2; letter-spacing: .8px; color: #0b1220; transition: max-width .35s cubic-bezier(.2,.8,.2,1), opacity .25s, margin-left .35s; }
  .ix-brand-name.show { max-width: 170px; opacity: 1; margin-left: 10px; }
  .ix-icon-btn { background: none; border: none; cursor: pointer; padding: 8px; border-radius: 8px; display: flex; color: #1e293b; transition: background .15s, color .15s; }
  .ix-icon-btn:hover { background: #fdeee7; color: #e8582a; }
  .ix-nav-right { margin-left: auto; display: flex; align-items: center; gap: 14px; }

  /* notifications */
  .ix-notification-wrap { position: relative; }
  .ix-notification-btn { position: relative; width: 40px; height: 40px; border: 1.5px solid #e2e8f0; border-radius: 10px; background: #fff; color: #334155; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all .15s; }
  .ix-notification-btn:hover { border-color: #e8582a; color: #e8582a; background: #fdeee7; }
  .ix-notification-btn:focus-visible { outline: 2px solid #e8582a; outline-offset: 2px; }
  .ix-notification-btn:has(.ix-notification-count) svg { animation: ix-ring 3.2s ease-in-out infinite; transform-origin: 50% 10%; }
  .ix-notification-count { position: absolute; top: -5px; right: -5px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 99px; background: #e8582a; color: #fff; font-size: 10px; font-weight: 800; display: flex; align-items: center; justify-content: center; border: 2px solid #fff; animation: ix-pulse 2s ease-out infinite; }
  .ix-notification-dropdown { position: absolute; top: calc(100% + 10px); right: 0; width: 340px; background: #fff; border-radius: 16px; box-shadow: 0 16px 40px rgba(15,23,42,0.15); border: 1px solid #e2e8f0; overflow: hidden; z-index: 100; animation: ix-pop .2s ease-out; }
  .ix-notification-header { display: flex; align-items: center; justify-content: space-between; padding: 15px 16px; border-bottom: 1px solid #f1f5f9; }
  .ix-notification-header strong { font-size: 14px; }
  .ix-notification-header span { font-size: 11px; color: #94a3b8; }
  .ix-notification-all { background: none; border: none; padding: 0; cursor: pointer; font-size: 11.5px; font-weight: 700; color: #e8582a; }
  .ix-notification-all:hover { text-decoration: underline; }
  .ix-notification-list { max-height: 380px; overflow-y: auto; }
  .ix-notification-item { width: 100%; display: flex; align-items: flex-start; gap: 10px; padding: 13px 16px; border: none; border-bottom: 1px solid #f1f5f9; background: #fffaf7; text-align: left; cursor: pointer; font: inherit; transition: background .15s; }
  .ix-notification-item:hover { background: #fff5ef; }
  .ix-notification-item.read { background: #fff; cursor: default; }
  .ix-notification-dot { width: 7px; height: 7px; border-radius: 50%; background: #e8582a; margin-top: 6px; flex-shrink: 0; }
  .ix-notification-item.read .ix-notification-dot { background: #cbd5e1; }
  .ix-notification-content { display: flex; flex-direction: column; min-width: 0; gap: 2px; }
  .ix-notification-content strong { display: block; font-size: 12.5px; color: #1e293b; }
  .ix-notification-content > span { display: block; font-size: 11.5px; line-height: 1.4; color: #64748b; }
  .ix-notification-content small { font-size: 10px; color: #94a3b8; }
  .ix-no-notifications { padding: 30px 16px; text-align: center; font-size: 12px; color: #94a3b8; }

  .ix-avatar { width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #f2864f, #e8582a); color: #fff; font-weight: 700; font-size: 15px; box-shadow: 0 6px 14px rgba(232,88,42,0.35); }
  .ix-logout { display: flex; align-items: center; gap: 7px; padding: 9px 14px; border-radius: 10px; cursor: pointer; background: #fff; border: 1.5px solid #e2e8f0; color: #334155; font-size: 13px; font-weight: 600; transition: all .15s; }
  .ix-logout:hover { border-color: #e8582a; color: #e8582a; background: #fdeee7; transform: translateY(-1px); box-shadow: 0 8px 16px rgba(232,88,42,0.2); }
  .ix-icon-btn:focus-visible, .ix-logout:focus-visible, .ix-logo-btn:focus-visible, .ix-side-item:focus-visible, .ix-b:focus-visible { outline: 2px solid #e8582a; outline-offset: 2px; }

  /* ───── Sidebar (white, pushes the page) ───── */
  .ix-body { flex: 1; display: flex; min-height: 0; position: relative; }
  .ix-strip { width: 65px; flex-shrink: 0; transition: width .3s cubic-bezier(.2,.8,.2,1); }
  .ix-strip.open { width: 236px; }
  .ix-backdrop { display: none; position: absolute; inset: 0; background: rgba(15,23,42,0.35); z-index: 18; animation: ix-fade .2s; }
  .ix-side { position: absolute; top: 0; bottom: 0; left: 0; width: 65px; z-index: 20; overflow-x: hidden; overflow-y: auto; scrollbar-width: none; background: linear-gradient(180deg, #ffffff 0%, #fff6f1 100%); box-shadow: 4px 0 18px rgba(15,23,42,0.10); display: flex; flex-direction: column; padding-top: 14px; transition: width .3s cubic-bezier(.2,.8,.2,1); }
  .ix-side::-webkit-scrollbar { display: none; }
  .ix-side.open { width: 236px; }

  /* profile photo at the top of the sidebar */
  .ix-side-profile { margin: 0 10px 10px; padding-bottom: 12px; border-bottom: 0px solid #f1e2d9; display: flex; flex-direction: column; align-items: center; flex-shrink: 0; }
  .ix-side-photo { width: 45px; height: 45px; overflow: hidden; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #f2864f, #e8582a); color: #fff; font-weight: 800; font-size: 18px; box-shadow: 0 8px 18px rgba(232,88,42,0.28); transition: width .3s cubic-bezier(.2,.8,.2,1), height .3s cubic-bezier(.2,.8,.2,1), border-radius .3s, font-size .3s; }
  .ix-side.open .ix-side-photo { width: 120px; height: 120px; border-radius: 0px; font-size: 46px; }
  .ix-side-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .ix-side-who { text-align: center; max-height: 0; max-width: 200px; opacity: 0; overflow: hidden; white-space: nowrap; transition: max-height .3s, opacity .2s, margin .3s; }
  .ix-side-who strong { display: block; font-size: 14px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; }
  .ix-side-who span { font-size: 11.5px; color: #fdfdfd; }
  .ix-side.open .ix-side-who { max-height: 56px; opacity: 1; margin-top: 12px; transition-delay: .1s; }

  .ix-side-item { position: relative; display: flex; align-items: center; gap: 16px; height: 48px; margin: 2px 10px; padding: 0 0 0 13px; border: none; background: none; cursor: pointer; color: #334155; border-radius: 12px; white-space: nowrap; text-align: left; transition: background .2s, color .2s, transform .2s, box-shadow .2s; }
  .ix-side-item:hover { background: #fff0e8; color: #e8582a; transform: translateX(4px); }
  .ix-side-item:hover .ix-side-icon { animation: ix-wiggle .6s; }
  .ix-side-item.active { color: #fff; background: linear-gradient(135deg, #f2733a, #e04a1a); box-shadow: 0 10px 22px rgba(232,88,42,0.38); }
  .ix-side-item.active:hover { transform: translateX(2px); }
  .ix-side-item.active::before { content: ""; position: absolute; left: -10px; top: 10px; bottom: 10px; width: 4px; border-radius: 0 4px 4px 0; background: #ffb48f; }
  .ix-side-icon { display: flex; flex-shrink: 0; }
  .ix-side-label { font-size: 14px; font-weight: 600; opacity: 0; transform: translateX(-6px); transition: opacity .2s, transform .25s; }
  .ix-side.open .ix-side-label { opacity: 1; transform: none; transition-delay: .1s; }
  .ix-side-foot { margin-top: auto; padding: 18px 22px; font-size: 11px; font-weight: 700; letter-spacing: .5px; color: #e8582a; white-space: nowrap; opacity: 0; transition: opacity .2s; }
  .ix-side.open .ix-side-foot { opacity: 1; transition-delay: .15s; }
  /* ── Compact formal sidebar (made a little bigger) ── */
  .ix-strip { width: 64px; }
  .ix-strip.open { width: 240px; }
  .ix-side { width: 64px; padding-top: 12px; background: #fff; border-right: none; box-shadow: none; }
  .ix-side.open { width: 240px; box-shadow: 6px 0 20px rgba(15,23,42,0.06); }
  .ix-side-profile { margin: 0 10px 8px; padding-bottom: 12px; border-bottom: none; }
  .ix-side-photo { width: 44px; height: 44px; border-radius: 0px; font-size: 18px; background: #334155; box-shadow: none; }
  .ix-side.open .ix-side-photo { width: 150px; height: 150px; border-radius: 0px; font-size: 56px; }
  .ix-side-who strong { font-size: 13.5px; font-weight: 600; color: #111827; white-space: normal; line-height: 1.25; }
  .ix-side-who span { display: block; font-size: 11.5px; color: #6b7280; line-height: 1.5; }
  .ix-side-who .ix-side-role { color: #c2410c; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; margin: 2px 0 6px; }
  .ix-side-who .ix-side-meta { color: #374151; }
  .ix-side-who { max-width: 216px; }
  .ix-side.open .ix-side-who { max-height: 140px; margin-top: 12px; }
  .ix-side-item { gap: 14px; height: 42px; margin: 2px 8px; padding: 0 0 0 14px; border-radius: 6px; color: #4b5563; }
  .ix-side-item:hover { background: #f3f4f6; color: #111827; transform: none; }
  .ix-side-item:hover .ix-side-icon { animation: none; }
  .ix-side-item.active { background: #fdf1ea; color: #c2410c; box-shadow: none; }
  .ix-side-item.active:hover { transform: none; }
  .ix-side-item.active::before { left: -8px; top: 7px; bottom: 7px; width: 3px; background: #e8582a; }
  .ix-side-icon svg { width: 18px; height: 18px; }
  .ix-side-label { font-size: 13.5px; font-weight: 500; }
  .ix-side-foot { margin-top: auto; padding: 14px 18px; border-top: 1px solid #eceef1; font-size: 10.5px; font-weight: 600; letter-spacing: .06em; color: #6b7280; }
  .ix-side::after { content: ""; flex: 0 0 0; }
  .ix-side-item:last-of-type { margin-bottom: 28px; }

  /* hide the profile photo block while the sidebar is collapsed */
  .ix-side-profile { max-height: 0; margin-top: 0; margin-bottom: 0; padding-bottom: 0; opacity: 0; visibility: hidden; overflow: hidden;
    transition: max-height .3s cubic-bezier(.2,.8,.2,1), opacity .2s, margin .3s, padding .3s, visibility 0s linear .3s; }
  .ix-side.open .ix-side-profile { max-height: 320px; margin: 0 10px 8px; padding-bottom: 12px; opacity: 1; visibility: visible;
    transition: max-height .3s cubic-bezier(.2,.8,.2,1), opacity .25s .1s, margin .3s, padding .3s, visibility 0s; }

  /* calmer top bar */
  .ix-nav { height: 64px; box-shadow: none; border-bottom: 1px solid #e5e7eb; }
  .ix-nav::after { height: 2px; background: #e8582a; animation: none; }
  .ix-nav-logo { height: 36px; }

  /* ───── Main ───── */
  .ix-main { flex: 1; min-width: 0; overflow-y: auto; padding: 28px 32px 40px; }
  .ix-content { max-width: 1180px; margin: 0 auto; animation: ix-rise .45s cubic-bezier(.2,.8,.2,1) backwards; }
  .ix-ph { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 22px; flex-wrap: wrap; }
  .ix-ph h1 { font-size: 24px; font-weight: 800; letter-spacing: -0.4px; color: #0b1220; }
  .ix-ph p { font-size: 13.5px; color: #64748b; margin-top: 3px; }
  .ix-ph-right { display: flex; align-items: center; gap: 10px; }
  .ix-live { display: inline-flex; align-items: center; gap: 7px; padding: 5px 12px; border-radius: 99px; background: #ecfdf3; color: #15803d; font-size: 12px; font-weight: 600; }
  .ix-live.sm { padding: 2px 9px; font-size: 11px; }
  .ix-live i { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; animation: ix-blink 1.6s ease-in-out infinite; }

  /* ───── Hero ───── */
  .ix-hero { position: relative; overflow: hidden; display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-wrap: wrap; padding: 28px 32px; border-radius: 24px; margin-bottom: 20px; color: #fff; background: linear-gradient(135deg, #f2864f 0%, #e8582a 55%, #d94a1c 100%); box-shadow: 0 20px 44px rgba(232,88,42,0.30); }
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
  .ix-hero > div:last-child { position: relative; }
  .ix-alert { display: flex; align-items: center; gap: 10px; background: #fffbeb; border: 1px solid #fde68a; color: #92400e; border-radius: 14px; padding: 12px 16px; font-size: 13px; margin-bottom: 20px; }
  .ix-alert .ix-b { margin-left: auto; }

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
  .ix-section, .ix-card { background: #fff; border-radius: 20px; box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.05); overflow: hidden; }
  .ix-section { margin-bottom: 20px; }
  .ix-section header { display: flex; align-items: center; gap: 10px; padding: 16px 20px; border-bottom: 1px solid #f1f5f9; }
  .ix-section header h2 { font-size: 14.5px; font-weight: 700; }
  .ix-section-icon { width: 28px; height: 28px; border-radius: 9px; background: #fdeee7; color: #e8582a; display: flex; align-items: center; justify-content: center; }
  .ix-count { margin-left: auto; padding: 2px 10px; border-radius: 99px; background: #f1f5f9; color: #64748b; font-size: 12px; font-weight: 600; }
  .ix-section .ix-live.sm + .ix-count { margin-left: 0; }
  .ix-section header .ix-live.sm { margin-left: 4px; }
  .ix-card { padding: 22px; }
  .ix-card.flush { padding: 0; }
  .ix-card-label { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .6px; }

  /* ───── Table ───── */
  .ix-table-wrap { overflow-x: auto; }
  .ix-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .ix-table th { text-align: left; padding: 12px 20px; font-size: 11px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: #94a3b8; background: #fafbfc; white-space: nowrap; }
  .ix-table td { padding: 13px 20px; border-top: 1px solid #f1f5f9; color: #334155; white-space: nowrap; vertical-align: middle; }
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
  .sec-card { margin-top: 20px; }
  .sec-row2 { padding: 14px 0; border-top: 1px solid #f3e3da; }
  .sec-row2:first-of-type { border-top: 0; }
  .sec-label { font-size: 12px; color: #8a7468; font-weight: 600; margin-bottom: 4px; }
  .sec-value { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 15px; }
  .sec-value code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 17px; letter-spacing: 3px; color: #1e293b; margin-right: auto; }
  .sec-value code.show { font-weight: 800; letter-spacing: 3px; background: #fff8f4; border: 1.5px dashed #f5b79f; border-radius: 10px; padding: 6px 12px; }
  .sec-ic { border: 0; background: transparent; color: #64748b; cursor: pointer; padding: 6px; border-radius: 8px; display: inline-flex; align-items: center; }
  .sec-ic:hover { background: #fff3ec; color: #e04a1a; }
  .sec-hint { display: block; margin-top: 6px; color: #8a7468; font-size: 12px; line-height: 1.45; }
  .sec-change { margin-top: 8px; background: #f59e0b; color: #fff; border-color: #f59e0b; }
  .sec-change:hover { background: #d97706; }
  .sec-form { display: flex; flex-direction: column; gap: 14px; }
  .sec-pw { position: relative; }
  .sec-pw input { width: 100%; padding: 14px 44px 14px 14px; border: 1.5px solid #e2e8f0; border-radius: 12px; font-size: 14px; font-family: inherit; }
  .sec-pw input:focus { outline: none; border-color: #e8582a; box-shadow: 0 0 0 4px rgba(232,88,42,.12); }
  .sec-pw button { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); border: 0; background: transparent; color: #64748b; cursor: pointer; padding: 6px; display: inline-flex; }
  .ix-badge.none { background: #f1f5f9; color: #64748b; }
  .ix-badge.pending { background: #fffbeb; color: #b45309; }
  .ix-badge.r-intern { background: #e6f7ee; color: #15803d; }
  .ix-badge.r-supervisor { background: #f0eafd; color: #6d28d9; }
  .ix-badge.r-admin { background: #fff4e0; color: #b45309; }
  .ix-badge.r-ojt_coordinator { background: #e8f1fd; color: #1d4ed8; }

  .ix-empty { padding: 36px 20px; text-align: center; }
  .ix-empty-icon { width: 54px; height: 54px; margin: 0 auto 12px; border-radius: 50%; background: #fdeee7; color: #e8582a; display: flex; align-items: center; justify-content: center; }
  .ix-empty-title { font-size: 14px; font-weight: 700; }
  .ix-empty-sub { font-size: 12.5px; color: #94a3b8; margin-top: 3px; }
  .ix-spin-wrap { display: flex; justify-content: center; padding: 36px; }
  .ix-spin { width: 30px; height: 30px; border-radius: 50%; border: 3px solid #fde3d6; border-top-color: #e8582a; animation: ix-spin .8s linear infinite; }

  /* ───── Buttons / inputs ───── */
  .ix-b { display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 9px 16px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1.5px solid transparent; transition: all .15s; white-space: nowrap; }
  .ix-b:disabled { opacity: .6; cursor: default; }
  .ix-b.primary { color: #fff; background: linear-gradient(135deg, #f2733a, #e04a1a); box-shadow: 0 8px 18px rgba(232,88,42,0.3); }
  .ix-b.primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 12px 24px rgba(232,88,42,0.4); }
  .ix-b.ghost { background: #fff; border-color: #e2e8f0; color: #475569; }
  .ix-b.ghost:hover:not(:disabled) { border-color: #e8582a; color: #e8582a; background: #fdeee7; }
  .ix-b.danger { background: #fff; border-color: #fca5a5; color: #dc2626; }
  .ix-b.danger:hover:not(:disabled) { background: #fef2f2; }
  .ix-b.ok { background: #16a34a; color: #fff; box-shadow: 0 8px 18px rgba(22,163,74,0.25); }
  .ix-b.ok:hover:not(:disabled) { background: #15803d; }
  .ix-b.sm { padding: 6px 12px; font-size: 12px; border-radius: 8px; }
  .ix-toolbar { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
  .ix-search { display: flex; align-items: center; gap: 8px; padding: 0 14px; background: #fff; border: 1.5px solid #e2e8f0; border-radius: 12px; color: #94a3b8; transition: border-color .15s, box-shadow .15s; min-width: 240px; }
  .ix-search:focus-within { border-color: #e8582a; box-shadow: 0 0 0 4px rgba(232,88,42,0.12); color: #e8582a; }
  .ix-search input { border: none; outline: none; background: transparent; padding: 10px 0; font-size: 13.5px; color: #1e293b; flex: 1; min-width: 0; }
  .ix-input, .ix-select, .ix-field input, .ix-field select, .ix-field textarea { padding: 10px 14px; border: 1.5px solid #e2e8f0; border-radius: 12px; font-size: 13.5px; color: #1e293b; background: #fff; transition: border-color .15s, box-shadow .15s; }
  .ix-input:focus, .ix-select:focus, .ix-field input:focus, .ix-field select:focus, .ix-field textarea:focus { outline: none; border-color: #e8582a; box-shadow: 0 0 0 4px rgba(232,88,42,0.12); }
  .ix-field input::placeholder { color: #b6c0cc; }
  .ix-chip { display: inline-flex; align-items: center; gap: 7px; padding: 6px 13px; border-radius: 99px; background: #f1f5f9; color: #64748b; font-size: 12px; font-weight: 600; }
  .ix-chip.green { background: #ecfdf3; color: #15803d; }
  .ix-chip.green i { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; }
  .ix-msg { padding: 10px 14px; border-radius: 10px; border: 1px solid; font-size: 13px; margin-bottom: 16px; }
  .ix-msg.success { background: #f0fdf4; border-color: #86efac; color: #15803d; }
  .ix-msg.error { background: #fef2f2; border-color: #fca5a5; color: #dc2626; }
  .ix-note { display: flex; gap: 10px; align-items: flex-start; font-size: 13px; line-height: 1.55; color: #9a3412; background: #fff5ef; border: 1px solid #fde1d5; padding: 12px 14px; border-radius: 12px; margin-top: 16px; }
  .ix-note svg { flex-shrink: 0; margin-top: 1px; color: #e8582a; }

  /* ───── Tabs / pills ───── */
  .ix-pills { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
  .ix-pill { display: inline-flex; align-items: center; gap: 8px; padding: 7px 18px; border-radius: 99px; border: 1.5px solid #e2e8f0; background: #fff; color: #64748b; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .15s; }
  .ix-pill:hover { border-color: #f5b79f; color: #e8582a; }
  .ix-pill.active { background: linear-gradient(135deg, #f2733a, #e04a1a); border-color: transparent; color: #fff; box-shadow: 0 6px 14px rgba(232,88,42,0.3); }
  .ix-pill:focus-visible { outline: 2px solid #e8582a; outline-offset: 2px; }
  .ix-pill-count { min-width: 20px; padding: 1px 6px; border-radius: 99px; background: #e8582a; color: #fff; font-size: 11px; font-weight: 700; text-align: center; }
  .ix-pill.active .ix-pill-count { background: #fff; color: #e8582a; }
  .ix-actions { display: flex; gap: 8px; align-items: center; }

  /* ───── Photo picker ───── */
  .ix-photo-pick { display: flex; align-items: center; gap: 16px; padding: 14px; border: 1.5px dashed #f5b79f; border-radius: 16px; background: #fffaf7; }
  .ix-photo-box { position: relative; width: 92px; height: 92px; border-radius: 18px; overflow: hidden; flex-shrink: 0; cursor: pointer; background: #fdeee7; color: #e8582a; display: flex; align-items: center; justify-content: center; transition: transform .15s; }
  .ix-photo-box:hover { transform: scale(1.03); }
  .ix-photo-box input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; padding: 0; border: 0; }
  .ix-photo-box img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .ix-photo-ph { display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .ix-photo-ph small { font-size: 11px; font-weight: 600; }
  .ix-photo-badge { position: absolute; right: 6px; bottom: 6px; width: 24px; height: 24px; border-radius: 50%; background: #e8582a; color: #fff; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(232,88,42,0.4); pointer-events: none; }
  .ix-photo-info { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .ix-photo-info strong { font-size: 13.5px; }
  .ix-photo-info span { font-size: 11.5px; color: #94a3b8; line-height: 1.45; }
  .ix-photo-info button { align-self: flex-start; background: none; border: none; padding: 0; color: #dc2626; font-size: 12px; font-weight: 600; cursor: pointer; }
  .ix-photo-info button:hover { text-decoration: underline; }
  .ix-photo-info em { font-style: normal; font-size: 12px; color: #dc2626; }

  /* ───── Progress ───── */
  .ix-minibar { flex: 1; min-width: 90px; height: 8px; border-radius: 99px; background: #f1f5f9; overflow: hidden; }
  .ix-bar-fill { height: 100%; border-radius: 99px; background: linear-gradient(90deg, #f2864f, #e8582a); transition: width .8s cubic-bezier(.2,.8,.2,1); }
  .ix-prog { display: flex; align-items: center; gap: 10px; min-width: 160px; }
  .ix-prog span { font-size: 11.5px; font-weight: 600; color: #64748b; width: 34px; text-align: right; }

  /* ───── Avatars ───── */
  .ix-av img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block; }
  .ix-av { position: relative; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; background: linear-gradient(135deg, #f2864f, #e8582a); color: #fff; font-weight: 700; }
  .ix-dot { position: absolute; right: -1px; bottom: -1px; width: 13px; height: 13px; border-radius: 50%; border: 2.5px solid #fff; background: #cbd5e1; }
  .ix-dot.on { background: #22c55e; }

  /* ───── Intern monitor cards ───── */
  .ix-intern-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; }
  .ix-ic { background: #fff; border-radius: 20px; padding: 18px; box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.05); transition: transform .2s, box-shadow .2s; }
  .ix-ic:hover { transform: translateY(-2px); box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 14px 30px rgba(15,23,42,0.09); }
  .ix-ic.clickable { cursor: pointer; }
  .ix-ic.clickable:focus-visible { outline: 2px solid #e8582a; outline-offset: 2px; }
  .ix-ic.selected { box-shadow: 0 0 0 2px #e8582a, 0 14px 30px rgba(232,88,42,0.18); }
  .ix-ic-top { display: flex; align-items: center; gap: 12px; }
  .ix-ic-id { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .ix-ic-id strong { font-size: 14px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ix-ic-id span { font-size: 12px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ix-ic-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 16px 0; }
  .ix-ic-stats div { background: #fafbfc; border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; }
  .ix-ic-stats strong { font-size: 15px; font-weight: 800; }
  .ix-ic-stats span { font-size: 11px; color: #94a3b8; }
  .ix-ic-foot { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; padding-top: 14px; border-top: 1px solid #f1f5f9; }
  .ix-ic-foot em { font-size: 12px; color: #94a3b8; font-style: normal; align-self: center; }
  .ix-mini { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 130px; }
  .ix-mini span { font-size: 10.5px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .4px; }
  .ix-mini .ix-select { padding: 8px 10px; font-size: 12.5px; border-radius: 10px; }

  /* ───── Monitor Interns: quick search + inline profile ───── */
  .imp-search-wrap { position: relative; }
  .imp-suggest { position: absolute; top: calc(100% + 6px); left: 0; right: 0; min-width: 280px; z-index: 40; list-style: none; margin: 0; padding: 6px; background: #fff; border: 1px solid #f1e2d9; border-radius: 14px; box-shadow: 0 16px 36px rgba(150,52,20,0.16); animation: ix-pop .15s ease-out; }
  .imp-suggest-item { width: 100%; display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: none; background: none; border-radius: 10px; cursor: pointer; text-align: left; }
  .imp-suggest-item.active, .imp-suggest-item:hover { background: #fff3ec; }
  .imp-suggest-text { display: flex; flex-direction: column; min-width: 0; }
  .imp-suggest-text strong { font-size: 13px; color: #1e293b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .imp-suggest-text small { font-size: 11.5px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .imp-suggest-empty { padding: 12px; font-size: 12.5px; color: #94a3b8; text-align: center; }

  .imp-panel { position: relative; background: #fff; border-radius: 20px; padding: 22px 24px; margin-bottom: 20px; border-top: 4px solid #e8582a; box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 12px 32px rgba(150,52,20,0.10); animation: ix-rise .3s cubic-bezier(.2,.8,.2,1) backwards; }
  .imp-tools { position: absolute; top: 14px; right: 14px; display: flex; align-items: center; gap: 8px; }
  .imp-close { width: 32px; height: 32px; border-radius: 50%; border: none; background: #f1f5f9; color: #475569; cursor: pointer; display: flex; align-items: center; justify-content: center; }
  .imp-close:hover { background: #fdeee7; color: #e8582a; }
  .imp-close:focus-visible { outline: 2px solid #e8582a; outline-offset: 2px; }
  .imp-top { display: flex; gap: 28px; align-items: flex-start; flex-wrap: wrap; }
  .imp-who { display: flex; flex-direction: column; align-items: center; gap: 8px; width: 170px; flex-shrink: 0; text-align: center; }
  .imp-who h2 { font-size: 16px; font-weight: 800; line-height: 1.25; }
  .imp-info { flex: 1 1 360px; min-width: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px 24px; padding-right: 36px; padding-top: 34px; }
  .imp-info div { min-width: 0; }
  .imp-info dt { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .4px; }
  .imp-info dd { margin: 2px 0 0; font-size: 13.5px; font-weight: 600; color: #1e293b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .imp-sid { font-size: 12px; color: #64748b; }
  .imp-sid strong { color: #1e293b; font-weight: 700; }
  .imp-info dd:has(.imp-edit) { overflow: visible; }
  .imp-edit { width: 100%; padding: 7px 10px; border: 1.5px solid #f1e2d9; border-radius: 10px; background: #fffaf7; font-size: 13px; font-weight: 500; color: #1e293b; font-family: inherit; }
  .imp-edit:focus { outline: none; border-color: #e8582a; background: #fff; box-shadow: 0 0 0 3px rgba(232,88,42,0.12); }
  .imp-edit-bar { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
  .imp-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-top: 20px; }
  .imp-stats div { background: #fff6f1; border-radius: 12px; padding: 10px 14px; display: flex; flex-direction: column; }
  .imp-stats strong { font-size: 18px; font-weight: 800; color: #1b1410; }
  .imp-stats span { font-size: 11px; color: #94a3b8; }
  .imp-progress { margin-top: 16px; }
  .imp-progress-row { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; font-size: 12.5px; color: #64748b; margin-bottom: 6px; }
  .imp-progress-row strong { color: #1e293b; }
  .imp-recent { margin-top: 20px; border: 1px solid #f3e3da; border-radius: 14px; overflow: hidden; }
  .imp-recent h3 { margin: 0; padding: 12px 18px; font-size: 13px; font-weight: 700; background: #fff6f1; color: #8a6a5c; }
  @media (max-width: 600px) {
    .imp-who { width: 100%; }
    .imp-info { padding-right: 0; }
    .imp-search-wrap { width: 100%; }
  }

  /* ───── Modal ───── */
  .ix-modal-wrap, .ix-modal-wrap * { box-sizing: border-box; }
  .ix-modal-wrap { font-family: 'Poppins', 'Segoe UI', sans-serif; color: #0f172a; }
  .ix-modal-wrap h2, .ix-modal-wrap p { margin: 0; }
  .ix-modal-wrap button, .ix-modal-wrap input, .ix-modal-wrap select, .ix-modal-wrap textarea { font-family: inherit; }
  .ix-modal-wrap { position: fixed; inset: 0; z-index: 1000; background: rgba(15,23,42,0.5); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; padding: 16px; animation: ix-fade .2s; }
  .ix-modal { background: #fff; border-radius: 22px; width: 100%; max-width: 500px; max-height: 90vh; overflow-y: auto; box-shadow: 0 30px 80px rgba(0,0,0,0.3); border-top: 5px solid #e8582a; animation: ix-pop .25s ease-out; }
  .ix-modal.wide { max-width: 880px; }
  .ix-modal header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 20px 24px 14px; }
  .ix-modal header h2 { font-size: 18px; font-weight: 800; }
  .ix-modal header p { font-size: 12.5px; color: #94a3b8; margin-top: 2px; }
  .ix-modal-tools { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .ix-modal-x { width: 32px; height: 32px; border-radius: 50%; border: none; background: #f1f5f9; color: #475569; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .ix-modal-x:hover { background: #fdeee7; color: #e8582a; }
  .ix-modal-body { padding: 4px 24px 24px; }
  .ix-form { display: flex; flex-direction: column; gap: 16px; }
  .ix-field { display: flex; flex-direction: column; gap: 6px; }
  .ix-field > label { font-size: 12px; font-weight: 700; color: #334155; }
  .ix-row-gap { display: flex; gap: 10px; }
  .ix-row-gap > input { flex: 1; min-width: 0; }
  .ix-row-gap > .ix-field { flex: 1; }
  .ix-field input.scanning { background: #fff5ef; border-color: #e8582a; color: #d94a1c; }
  .ix-hint { font-size: 11.5px; color: #94a3b8; line-height: 1.5; }
  .ix-hint.info { color: #9a3412; background: #fff5ef; border-radius: 8px; padding: 7px 10px; }
  .ix-hint.good { color: #15803d; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .ix-hint.good button { background: none; border: none; color: #94a3b8; cursor: pointer; text-decoration: underline; font-size: 11.5px; }
  .ix-form-actions { display: flex; gap: 10px; margin-top: 4px; }
  .ix-form-actions .ix-b { flex: 1; padding: 11px; font-size: 14px; }

  /* ───── MOV / pending submission cards ───── */
  .ix-list { display: flex; flex-direction: column; gap: 16px; }
  .ix-sub { background: #fff; border-radius: 20px; padding: 20px; box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.05); }
  .ix-sub-top { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
  .ix-sub-top .ix-ic-id { flex: 1; }
  .ix-sub-title { font-size: 15px; font-weight: 700; margin-bottom: 10px; }
  .ix-file { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 10px; background: #fff5ef; border: 1px solid #fde1d5; color: #d94a1c; font-size: 13px; font-weight: 600; text-decoration: none; max-width: 100%; }
  .ix-file:hover { background: #fdeee7; }
  .ix-desc-label { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 6px; }
  .ix-desc { font-size: 14px; color: #334155; line-height: 1.6; background: #fafbfc; padding: 12px 14px; border-radius: 12px; }
  .ix-review { display: flex; gap: 10px; align-items: center; margin-top: 16px; flex-wrap: wrap; }
  .ix-review .ix-input { flex: 1; min-width: 180px; }
  .ix-remarks { font-size: 12.5px; color: #94a3b8; margin-top: 10px; }
  .ix-allgood { padding: 48px 20px; text-align: center; }
  .ix-allgood .ix-empty-icon { width: 64px; height: 64px; background: #e6f7ee; color: #16a34a; }

  /* ───── Profile panel / details (ipv) ───── */
  .ipv { padding: 0; overflow: hidden; border-top: 4px solid #e8582a; }
  .ipv-head { display: flex; align-items: center; gap: 20px; padding: 22px 28px; border-bottom: 1px solid #eadfd8; background: #fffaf7; }
  .ipv-head-main { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
  .ipv-head-main h2 { font-size: 21px; font-weight: 800; letter-spacing: -.3px; color: #0b1220; line-height: 1.2; }
  .ipv-head-sub { display: flex; flex-wrap: wrap; gap: 4px 0; font-size: 13px; color: #64748b; }
  .ipv-head-sub span + span::before { content: ""; display: inline-block; width: 1px; height: 12px; background: #d8c9bf; margin: 0 12px; vertical-align: -1px; }
  .ipv-head-sub strong { color: #1e293b; font-weight: 700; }
  .ipv-head-actions { display: flex; align-items: center; gap: 8px; align-self: flex-start; }

  .ipv-block { padding: 20px 28px; border-bottom: 1px solid #eadfd8; }
  .ipv-block:last-child { border-bottom: 0; }
  .ipv-title { margin: 0 0 12px; font-size: 14.5px; font-weight: 800; color: #1b1410; display: flex; align-items: center; gap: 9px; }
  .ipv-title::before { content: ""; width: 4px; height: 16px; border-radius: 2px; background: #e8582a; }
  .ipv-title-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
  .ipv-title-row .ipv-title { margin: 0; }
  .ipv-muted { font-size: 12px; color: #94a3b8; }

  /* ruled grid: 1px gaps over a line-coloured background draw the borders */
  .ipv-grid { display: grid; gap: 1px; background: #e3d6cd; border: 1px solid #e3d6cd; border-radius: 12px; overflow: hidden; }
  .ipv-grid.c2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ipv-grid.c3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .ipv-grid.c4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .ipv-cell { background: #fff; padding: 12px 16px; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .ipv-cell.wide { grid-column: span 2; }
  .ipv-label { font-size: 12px; font-weight: 600; color: #8a7468; }
  .ipv-value { font-size: 14.5px; font-weight: 700; color: #111827; overflow-wrap: anywhere; line-height: 1.35; }

  .ipv-stats .ipv-cell { padding: 14px 18px; }
  .ipv-stats .ipv-cell strong { font-size: 24px; font-weight: 800; color: #e8582a; line-height: 1.1; }
  .ipv-stats .ipv-cell span { font-size: 12.5px; font-weight: 600; color: #6b5a50; }

  .ipv-progress { margin-top: 16px; }
  .ipv-progress-row { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; font-size: 13px; color: #64748b; margin-bottom: 8px; }
  .ipv-progress-row strong { color: #111827; }
  .ipv-bar-line { display: flex; align-items: center; gap: 12px; }
  .ipv-bar { flex: 1; height: 12px; border-radius: 99px; background: #f1e6df; overflow: hidden; }
  .ipv-bar-line > strong { font-size: 14px; font-weight: 800; min-width: 40px; text-align: right; color: #111827; }

  /* details inside the View window (no card chrome of its own) */
  .ipv-flat .ipv-head { padding: 0 0 18px; background: none; }
  .ipv-flat .ipv-block { padding: 18px 0; }
  .ipv-flat .ipv-block:last-child { padding-bottom: 0; }

  @media (max-width: 900px) {
    .ipv-grid.c3, .ipv-grid.c4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 560px) {
    .ipv-head { flex-wrap: wrap; padding: 18px; }
    .ipv-block { padding: 16px 18px; }
    .ipv-grid.c2, .ipv-grid.c3, .ipv-grid.c4:not(.ipv-stats) { grid-template-columns: 1fr; }
    .ipv-cell.wide { grid-column: auto; }
  }

  /* ───── Hours cards ───── */
  .ix-hours-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
  .ix-hc { background: #fff; border-radius: 20px; padding: 18px; box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.05); }
  .ix-hc-top { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
  .ix-hc-top .ix-ic-id { flex: 1; }
  .ix-hc-hours { text-align: right; }
  .ix-hc-hours strong { display: block; font-size: 20px; font-weight: 800; color: #e8582a; line-height: 1.1; }
  .ix-hc-hours span { font-size: 11px; color: #94a3b8; }
  .ix-hc-foot { display: flex; justify-content: space-between; font-size: 11.5px; color: #94a3b8; margin-top: 8px; }

  /* ───── DTR preview ───── */
  .ix-doc { background: #fff; border-radius: 20px; padding: 32px; box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.05); }
  .ix-doc-head { text-align: center; padding-bottom: 16px; margin-bottom: 18px; border-bottom: 2px solid #e8582a; }
  .ix-doc-head h2 { font-size: 19px; font-weight: 800; letter-spacing: .5px; }
  .ix-doc-head p { font-size: 13px; color: #64748b; margin-top: 2px; }
  .ix-doc-head h3 { font-size: 14px; font-weight: 700; margin-top: 10px; color: #e8582a; }
  .ix-doc-meta { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; font-size: 13.5px; margin-bottom: 16px; }
  .ix-doc-meta span { color: #94a3b8; }
  .ix-doc-total { text-align: right; margin-top: 18px; font-size: 15px; font-weight: 800; }
  .ix-doc-sigs { display: flex; justify-content: space-between; gap: 20px; flex-wrap: wrap; margin-top: 52px; }
  .ix-doc-sig { width: 190px; border-top: 1px solid #1e293b; padding-top: 6px; text-align: center; font-size: 12px; color: #64748b; }
  .ix-doc-empty { text-align: center; padding: 48px 20px; color: #94a3b8; font-size: 14px; }

  /* ───── Announcements ───── */
  .ann-split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; align-items: start; }
  .ann-split > * { min-width: 0; margin: 0; }
  .ann-list { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .ann-manage { margin: 0; padding: 16px 20px 20px; }
  .ann-list li { padding: 12px 14px; border-radius: 14px; background: #fff6f1; border: 1px solid #f8e3d8; }
  .ann-list li strong { font-size: 13.5px; color: #1e293b; }
  .ann-list li p { margin: 4px 0 6px; font-size: 12.5px; line-height: 1.5; color: #64748b; white-space: pre-line; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
  .ann-manage li p { -webkit-line-clamp: unset; display: block; }
  .ann-list li small { font-size: 11px; color: #94a3b8; }
  .ann-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  @media (max-width: 1000px) { .ann-split { grid-template-columns: 1fr; } }

  /* View / Add / Edit window: same look as the Monitor Interns profile, edge to edge inside the modal */
  .ipv-modal { margin: 0 -24px -24px; border-top: 1px solid #eadfd8; }

  /* Add / Edit user form (inputs inside the same boxed cells) */
  .uf-head .ix-photo-pick { flex: 1; background: transparent; }
  .uf-cell { cursor: text; transition: background .15s, box-shadow .15s; }
  .uf-cell:focus-within { background: #fffaf7; box-shadow: inset 0 0 0 2px #e8582a; }
  .uf-input { width: 100%; padding: 2px 0; border: 0; outline: none; background: transparent; font-size: 14.5px; font-weight: 700; color: #111827; font-family: inherit; }
  select.uf-input { cursor: pointer; }
  .uf-input::placeholder { font-weight: 400; color: #b6c0cc; }
  .uf-input:disabled { color: #94a3b8; }
  .uf-input.scanning { color: #d94a1c; }
  .uf-hint { font-size: 11px; font-weight: 400; line-height: 1.4; color: #94a3b8; }

  /* ───── Motion ───── */
  @keyframes ix-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
  @keyframes ix-fade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes ix-pop { from { opacity: 0; transform: translateY(-8px) scale(.98); } to { opacity: 1; transform: none; } }
  @keyframes ix-spin { to { transform: rotate(360deg); } }
  @keyframes ix-blink { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
  @keyframes ix-slide { from { background-position: 0% 0; } to { background-position: 200% 0; } }
  @keyframes ix-wiggle { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(-14deg) scale(1.1); } 75% { transform: rotate(12deg) scale(1.1); } }
  @keyframes ix-ring { 0%, 86%, 100% { transform: rotate(0); } 88% { transform: rotate(16deg); } 91% { transform: rotate(-14deg); } 94% { transform: rotate(10deg); } 97% { transform: rotate(-6deg); } }
  @keyframes ix-pulse { 0% { box-shadow: 0 0 0 0 rgba(232,88,42,0.5); } 100% { box-shadow: 0 0 0 9px rgba(232,88,42,0); } }
  @media (prefers-reduced-motion: reduce) {
    .ix-content, .ix-live i, .ix-spin, .ix-modal, .ix-nav::after, .ix-notification-count, .ix-notification-btn svg, .ix-notification-dropdown, .imp-panel, .imp-suggest { animation: none !important; }
    .ix-side, .ix-strip, .ix-side-label, .ix-brand-name, .ix-side-photo, .ix-side-who, .ix-side-profile { transition: none !important; }
  }

  /* ───── Responsive ───── */
  @media (max-width: 900px) {
    .ix-strip, .ix-strip.open { width: 0; }
    .ix-side { width: 0; }
    .ix-side.open { width: 240px; box-shadow: none; }
    .ix-backdrop { display: block; }
    .ix-fs-btn { display: none; }
    .ix-main { padding: 20px 16px 32px; }
  }
  @media (max-width: 600px) { 
    .ix-logout span { display: none; }
    .ix-logout { padding: 9px; }
    .ix-notification-dropdown { position: fixed; top: 80px; left: 12px; right: 12px; width: auto; }
    .ix-hero { padding: 22px; }
    .ix-hero h1 { font-size: 22px; }
    .ix-brand-name { font-size: 9.5px; letter-spacing: .4px; }
    .ix-brand-name.show { max-width: 110px; margin-left: 6px; }
    .ix-intern-grid, .ix-hours-grid { grid-template-columns: 1fr; }
    .ix-doc { padding: 20px; }
  }
`;