// components/DashKit.jsx
// Shared shell (navbar + sidebar) and UI pieces for the Admin, Coordinator and Intern dashboards.
import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import { currentFit } from "../fit.js";
import logo from "../assets/logo.png";

import { API, STORAGE } from "../config.js";
export const REQUIRED_HOURS = 460; // fallback when an intern has no program set

/* ── Required OJT hours per program (from the OJT coordinator) ── */
export const PROGRAM_HOURS = { BSIT: 460, BSIS: 460, BSCS: 320 };
export const PROGRAMS = Object.keys(PROGRAM_HOURS);
export function programKey(program) {
  const p = String(program || "").toUpperCase();
  if (/BSIT|INFORMATION\s+TECH/.test(p)) return "BSIT";
  if (/BSIS|INFORMATION\s+SYS/.test(p)) return "BSIS";
  if (/BSCS|COMPUTER\s+SCI/.test(p)) return "BSCS";
  return null;
}
export const requiredHoursFor = (program) => PROGRAM_HOURS[programKey(program)] ?? REQUIRED_HOURS;

/* ── DTR type, set per intern (depends on the HTI) ──
   four = 4 taps: AM in / AM out, PM in / PM out (8–12 and 1–5)
   two  = 2 taps: in and out (8–5), lunch break not counted            */
export const DTR_MODES = {
  four: "4 taps (AM in/out, PM in/out)",
  two: "2 taps (in and out, lunch not counted)",
};
export const dtrModeOf = (u) => (u?.dtr_mode === "four" ? "four" : "two");

/* The intern's DTR type in their profile. The HTE decides it, so the intern's own supervisor can change it here;
   everyone else just sees it. */
export function DtrModeField({ u }) {
  const [mode, setMode] = useState(dtrModeOf(u));
  const [state, setState] = useState("");          // "" | saving | saved | error text
  useEffect(() => { setMode(dtrModeOf(u)); setState(""); }, [u?.id, u?.dtr_mode]);
  let me = {};
  try { me = JSON.parse(sessionStorage.getItem("user") || "{}"); } catch { /* not signed in */ }
  const label = (m) => (m === "four" ? "4 taps (AM/PM in and out)" : "2 taps (in and out)");
  const canSet = me.role === "supervisor" && Number(u?.supervisor_id) === Number(me.id);
  if (!canSet) return label(mode);
  const change = async (e) => {
    const next = e.target.value, prev = mode;
    setMode(next); setState("saving");
    try {
      const res = await fetch(`${API}/supervisor/interns/${u.id}/dtr-mode`, {
        method: "PATCH", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ dtr_mode: next }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || "Couldn't save.");
      setState("saved");
    } catch (err) {
      setMode(prev); setState(err instanceof TypeError ? "Couldn't reach the server." : err.message);
    }
  };
  return (
    <span className="dtr-set">
      <select value={mode} onChange={change} disabled={state === "saving"} aria-label="DTR type (set by the HTE)">
        <option value="two">2 taps (in and out)</option>
        <option value="four">4 taps (AM/PM in and out)</option>
      </select>
      {state === "saved" && <em className="ok">Saved</em>}
      {state && state !== "saved" && state !== "saving" && <em className="err">{state}</em>}
    </span>
  );
}

/* ── Internship requirements (edit the lists here) ── */
export const PRE_REQUIREMENTS = [
  { key: "capstone_summary", label: "Capstone/Thesis Summary Sheet", hint: "With a passed rating — proof you may enroll in the internship" },
  { key: "letter_of_intent", label: "Letter of Intent", hint: "With your CV attached" },
  { key: "endorsement_letter", label: "Endorsement Letter", hint: "Signed by the OJT Coordinator, Chairperson and Dean of CCIS" },
  { key: "moa", label: "Memorandum of Agreement (MOA)", hint: "Approved and notarized, long bond paper (7 copies) — hours are not credited without it" },
  { key: "internship_contract", label: "Student Internship Contract", hint: "Signed and notarized, long bond paper (3 copies)" },
  { key: "internship_plan", label: "Student Internship Plan", hint: "Signed by the Chairperson, SIP Coordinator and HTE Supervisor" },
  { key: "medical_certificate", label: "Medical Certificate", hint: "With CBC, signed by the university physician" },
  { key: "personal_history", label: "Student Trainee's Personal History", hint: "A4 size" },
  { key: "parents_consent", label: "Parents' Consent", hint: "Long bond paper, notarized" },
  { key: "pledge", label: "Student's Pledge", hint: "Signed in front of the SIP Coordinator (A4)" },
  { key: "acceptance_form", label: "Acceptance Form", hint: "Signed by your parent/guardian and the HTE representative (A4)" },
  { key: "insurance", label: "Insurance", hint: "Scanned copy from any reliable insurance company" },
  { key: "orientation", label: "Deployment Orientation Attendance", hint: "Proof you attended the internship deployment orientation" },
];
// During the internship (weekly / monthly reports can be submitted many times)
export const DURING_REQUIREMENTS = [
  { key: "supervisor_feedback_form", label: "Training Supervisor Feedback Form", hint: "Give it to your HTE supervisor at the start — it is used to monitor and grade you" },
  { key: "weekly_report", label: "Weekly / Monthly Report", hint: "Submit one every week (or month, as instructed)", repeat: true },
  { key: "performance_appraisal", label: "Student Trainee Performance Appraisal", hint: "Your HTE supervisor's final rating, given in your last week" },
];
export const POST_REQUIREMENTS = [
  { key: "certificate_of_completion", label: "Certificate of Completion" },
  { key: "evaluation_forms", label: "Evaluation Forms" },
  { key: "narrative_report", label: "Narrative Report", hint: "Use the prescribed format, written in 3rd person" },
  { key: "dtr", label: "Daily Time Record (DTR)", hint: "Signed copy" },
  { key: "system_output", label: "System Output Presentation", hint: "Every intern presents the system output they made" },
];
export const REQUIREMENTS_BY_PHASE = { pre: PRE_REQUIREMENTS, during: DURING_REQUIREMENTS, post: POST_REQUIREMENTS };
export const PHASE_LABEL = { pre: "Pre-internship", during: "During internship", post: "Post-internship" };

// Due date status of one requirement: { label, tone } or null.  sub = the intern's latest submission.
export function dueStatus(due, sub, today = todayManila()) {
  if (!due) return null;
  const d = String(due).slice(0, 10);
  const label = new Date(d + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  if (sub && (sub.status === "approved" || sub.status === "pending")) return { label: `Due ${label}`, tone: "none" };
  const days = Math.round((new Date(d + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000);
  if (days < 0) return { label: `Overdue · ${label}`, tone: "rejected" };
  if (days <= 3) return { label: days === 0 ? "Due today" : `Due in ${days} day${days === 1 ? "" : "s"}`, tone: "pending" };
  return { label: `Due ${label}`, tone: "none" };
}

// Two lines shown next to the logo when the sidebar is open
const BRAND_LINES = ["CSU CCIS", "MYTRACK"]; // e.g. ["CARAGA STATE", "UNIVERSITY"]

// Turns a stored photo path (e.g. "profiles/abc.jpg") into a full URL
export const photoUrl = (p) => (!p ? null : /^https?:\/\//.test(p) ? p : STORAGE + p);

/* ───────────────────────── helpers ───────────────────────── */
/* ───────── Live updates ─────────
   Shell asks the server "has anything changed?" every few seconds (GET /api/live, a tiny answer).
   When the answer changes it sends the "mytrack:live" event, and every page that called
   liveRefresh() reloads its data. Nobody has to press refresh.                                   */
export const LIVE_EVENT = "mytrack:live";
const LIVE_CHECK_MS = 4000;      // how often to ask "has anything changed?"
const LIVE_FALLBACK_MS = 60000;  // full reload anyway once a minute, just in case

// Use inside a useEffect:  useEffect(() => { load(); return liveRefresh(load); }, []);
export function liveRefresh(load, fallbackMs = LIVE_FALLBACK_MS) {
  const run = () => { if (!document.hidden) load(); };
  const onVisible = () => { if (!document.hidden) load(); };   // coming back to the tab
  window.addEventListener(LIVE_EVENT, run);
  document.addEventListener("visibilitychange", onVisible);
  const iv = setInterval(run, fallbackMs);
  return () => {
    window.removeEventListener(LIVE_EVENT, run);
    document.removeEventListener("visibilitychange", onVisible);
    clearInterval(iv);
  };
}

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

/* ── Official hours (from the OJT coordinator) ──
   Keep these the same as config/ojt.php in the Laravel app.
   - no grace period: a tap after 8:00 AM (or 1:00 PM for a 4-tap PM check-in) is late
   - arriving early is fine, but hours only count from 8:00 (the DTR still shows the real time)
   - 12:00–1:00 is lunch and never counts
   - time after 5:00 PM is overtime: it counts only after the coordinator approves it
   - official hours give at most dailyCap hours a day; approved overtime is added on top   */
export const SCHEDULE = { amIn: 8, amOut: 12, pmIn: 13, pmOut: 17, dailyCap: 8, tapCooldownMin: 5 };

const HOUR = 3600000;
// Manila midnight of the day this time falls on
const manilaDayStart = (iso) =>
  new Date(new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }) + "T00:00:00+08:00").getTime();
// Hour of the day in Manila (e.g. 13.5 = 1:30 pm)
export const manilaHour = (iso) => (new Date(iso).getTime() - manilaDayStart(iso)) / HOUR;
const overlap = (a, b, c, d) => Math.max(0, Math.min(b, d) - Math.max(a, c));

// One in/out pair per record, grouped by date: { "2026-10-15": [{ in, out, ... }, ...] } (earliest first)
export function sessionsByDate(recs) {
  const map = {};
  const seen = new Set();
  recs.forEach((r) => {
    const key = `${r.user_id}|${r.checked_in_at}`;
    if (!r.checked_in_at || seen.has(key)) return;
    seen.add(key);
    (map[r.date] ||= []).push({
      id: r.id,
      online: r.uid === "ONLINE",                      // approved online attendance (8:00–5:00)
      in: r.checked_in_at,
      out: r.checked_out_at || null,
      otMinutes: Number(r.ot_minutes || 0),            // overtime found at check-out
      otStatus: r.ot_status || null,                   // pending (supervisor) | endorsed (coordinator) | approved | rejected
      otApproved: Number(r.ot_approved_minutes || 0),  // minutes the coordinator credited
    });
  });
  Object.values(map).forEach((s) => s.sort((a, b) => new Date(a.in) - new Date(b.in)));
  return map;
}

// Regular (inside 8–12 and 1–5) and overtime (after 5:00 PM) time of one pair, in ms
export function sessionSplit({ in: i, out: o }) {
  if (!i || !o) return { reg: 0, ot: 0 };
  const a = new Date(i).getTime();
  const b = new Date(o).getTime();
  if (b <= a) return { reg: 0, ot: 0 };
  const d = manilaDayStart(i);
  const S = SCHEDULE;
  const reg = overlap(a, b, d + S.amIn * HOUR, d + S.amOut * HOUR) + overlap(a, b, d + S.pmIn * HOUR, d + S.pmOut * HOUR);
  const ot = overlap(a, b, d + S.pmOut * HOUR, d + 24 * HOUR);
  return { reg, ot };
}

// Credited hours of one day: official-hours time + approved overtime, never above the daily cap.
// 4 taps 8–12 + 1–5 = 8h.  2 taps 8–5 = 8h (lunch not counted).  7:30 → counts from 8:00.
export function dayHours(sessions) {
  let reg = 0;
  let ot = 0;
  sessions.forEach((s) => { reg += sessionSplit(s).reg; ot += (s.otApproved || 0) * 60000; });
  // the cap is for the official hours only; overtime the coordinator approved is added on top
  return (Math.min(SCHEDULE.dailyCap * HOUR, reg) + ot) / HOUR;
}

// Overtime of one day: { minutes, status } (status = the "worst" one: pending > approved > rejected)
export function dayOvertime(sessions) {
  const withOt = sessions.filter((s) => s.otStatus);
  if (!withOt.length) return null;
  const minutes = withOt.reduce((n, s) => n + s.otMinutes, 0);
  const approved = withOt.reduce((n, s) => n + s.otApproved, 0);
  // "endorsed" = the supervisor approved, the coordinator has not decided yet: still waiting
  const status = withOt.some((s) => s.otStatus === "pending" || s.otStatus === "endorsed") ? "pending"
    : withOt.some((s) => s.otStatus === "approved") ? "approved" : "rejected";
  return { minutes, approved, status };
}

// "1h 15m"
export const fmtMinutes = (m) => {
  const n = Math.max(Math.round(m || 0), 0);
  return n >= 60 ? `${Math.floor(n / 60)}h${n % 60 ? ` ${n % 60}m` : ""}` : `${n}m`;
};

// Total credited hours from a list of attendance records
export function calcHours(recs) {
  const total = Object.values(sessionsByDate(recs)).reduce((s, day) => s + dayHours(day), 0);
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
  dashboard: <><rect x="3.5" y="3.5" width="7" height="8" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="5" rx="1.5" /><rect x="13.5" y="11.5" width="7" height="9" rx="1.5" /><rect x="3.5" y="14.5" width="7" height="6" rx="1.5" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" /></>,
  list: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></>,
  download: <><path d="M12 4v12M7 11l5 5 5-5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></>,
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
  flame: <path d="M12 22c4 0 7-2.8 7-7 0-3.5-2.2-6-4-8 0 2.5-1.5 4-3 4 0-3.5-1.5-6.5-4-9 .3 3.5-3 6-3 11 0 4.6 3 9 7 9z" />,
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

// the icon of the open menu item (the Shell fills this in), shown in front of the page title
const PageIconCtx = createContext(null);

// Page header = a slim toolbar across the top of the page:
// icon · title (+ one-line description) · tabs · actions on the right
export function PageHeader({ title, heading, sub, live, icon, tabs, children }) {
  const navIcon = useContext(PageIconCtx);
  const ic = icon || navIcon;
  // the page name is in the top bar; here: the description, then the page's tabs under it
  return (
    <div className={tabs ? "ix-ph has-tabs" : "ix-ph"}>
      <div className="ix-ph-title">
        {ic && <span className="ix-ph-ic" aria-hidden="true"><Icon name={ic} size={16} /></span>}
        <div className="ix-ph-text">
          <h1>{heading || title}</h1>
          {sub && <p title={sub}>{sub}</p>}
        </div>
      </div>
      {tabs && (
        // tabs on the left; a page can put small controls on the right of the same row (e.g. Pending / History)
        <div className="ix-ph-tabrow">{tabs}<div className="ix-ph-tabtools" id="ix-tabtools" /></div>
      )}
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
            <tr key={i}>{r.map((c, j) => <td key={j} data-label={headers[j]}>{c}</td>)}</tr>
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

/* A form that slides in from the right side (instead of a window in the middle).
   <Drawer title icon kicker sub onClose footer>…</Drawer>  — footer = the buttons pinned at the bottom */
const DRAWER_CSS = `
.ix-modal-wrap.ix-drawer-wrap { position: fixed; inset: 0; z-index: 1200; display: block; padding: 0; background: rgba(17, 24, 39, 0.18); animation: ixdwFade .22s ease both; }
.ix-modal-wrap.ix-drawer-wrap.closing { animation: ixdwFadeOut .2s ease both; }
.ix-drawer { position: absolute; top: 12px; right: 12px; bottom: 12px; width: min(440px, calc(100vw - 24px)); display: flex; flex-direction: column;
  background: #fff; border: 1px solid #e7e9ee; border-radius: 20px; box-shadow: -18px 0 50px rgba(17, 24, 39, 0.14);
  font-family: inherit; color: #111827; overflow: hidden; animation: ixdwIn .3s cubic-bezier(.2,.8,.2,1) both; }
.ix-drawer-wrap.closing .ix-drawer { animation: ixdwOut .2s ease both; }
.ix-drawer-head { display: flex; align-items: center; gap: 14px; padding: 16px 20px 14px; border-bottom: 1px solid #eef0f3; }
.ix-drawer-ico { width: 46px; height: 46px; flex-shrink: 0; border-radius: 50%; display: grid; place-items: center; background: #fff3ec; color: #e8582a; border: 1px solid #fbe0d2; }
.ix-drawer-ttl { flex: 1; min-width: 0; }
.ix-drawer-ttl small { display: block; font-size: 12px; color: #8b919b; margin-bottom: 2px; }
.ix-drawer-ttl h2 { margin: 0; font-size: 19px; font-weight: 600; line-height: 1.25; color: #111827; }
.ix-drawer-x { width: 36px; height: 36px; padding: 0 !important; flex-shrink: 0; border-radius: 50%; border: 1px solid #e7e9ee; background: #fff; color: #4b5563;
  display: grid; place-items: center; cursor: pointer; transition: background .15s; }
.ix-drawer-x:hover { background: #f3f4f6; }
.ix-drawer-sub { margin: 0; padding: 12px 20px 0; font-size: 13px; line-height: 1.45; color: #6b7280; }
.ix-drawer-body { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 20px 16px; }
.ix-drawer-body .ix-form { gap: 12px !important; }
.ix-drawer-body .ix-field textarea { min-height: 70px !important; }
/* "what happens next" steps under a form, so the panel isn't half empty */
.ix-drawer-steps { margin-top: 16px; padding: 12px 14px; border: 1px solid #eef0f3; border-radius: 14px; background: #fafafb; }
.ix-drawer-steps h3 { margin: 0 0 8px; font-size: 13px; font-weight: 600; color: #111827; }
.ix-drawer-steps ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 7px; }
.ix-drawer-steps li { display: grid; grid-template-columns: 22px 1fr; gap: 10px; align-items: center; }
.ix-drawer-steps li > span { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: #fff; border: 1px solid #fbe0d2; color: #e8582a; font-size: 11px; font-weight: 700; }
.ix-drawer-steps li b { display: block; font-size: 12.5px; font-weight: 500; color: #374151; line-height: 1.35; }
.ix-drawer-steps li small { display: block; font-size: 12px; color: #6b7280; line-height: 1.45; margin-top: 1px; }
.ix-drawer-note { margin-top: 12px; display: flex; gap: 8px; align-items: flex-start; padding: 10px 12px; border-radius: 12px; background: #fff7ed; color: #9a3412; font-size: 12px; line-height: 1.45; }
.ix-drawer-foot { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 12px 20px 14px; border-top: 1px solid #eef0f3; background: #fff; }
.ix-drawer-foot > * { width: 100%; }
@keyframes ixdwIn { from { transform: translateX(calc(100% + 24px)); } to { transform: none; } }
@keyframes ixdwOut { from { transform: none; } to { transform: translateX(calc(100% + 24px)); } }
@keyframes ixdwFade { from { background-color: rgba(17, 24, 39, 0); } to { background-color: rgba(17, 24, 39, 0.18); } }
@keyframes ixdwFadeOut { from { background-color: rgba(17, 24, 39, 0.18); } to { background-color: rgba(17, 24, 39, 0); } }
@media (max-width: 600px) { .ix-drawer { top: 0; right: 0; bottom: 0; width: 100vw; border-radius: 0; border: 0; } }
/* short screens: the steps box steps aside so the form never needs scrolling */
@media (max-height: 700px) { .ix-drawer-steps { display: none; } }
@media (prefers-reduced-motion: reduce) { .ix-drawer, .ix-drawer-wrap { animation-duration: .01s !important; } }
`;
export function Drawer({ title, kicker, sub, icon = "calendar", onClose, footer, inPage, children }) {
  const [closing, setClosing] = useState(false);
  const close = () => { if (closing) return; setClosing(true); setTimeout(onClose, 200); };
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return createPortal(
    <div className={`ix-modal-wrap ix-drawer-wrap${closing ? " closing" : ""}`} style={inPage ? { zIndex: 5000 } : undefined} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <style>{DRAWER_CSS}</style>
      <aside className="ix-drawer" role="dialog" aria-modal="true" aria-label={title}>
        <header className="ix-drawer-head">
          <span className="ix-drawer-ico"><Icon name={icon} size={20} /></span>
          <div className="ix-drawer-ttl">{kicker && <small>{kicker}</small>}<h2>{title}</h2></div>
          <button type="button" className="ix-drawer-x" onClick={close} aria-label="Close"><Icon name="x" size={16} /></button>
        </header>
        {sub && <p className="ix-drawer-sub">{sub}</p>}
        <div className="ix-drawer-body">{typeof children === "function" ? children(close) : children}</div>
        {footer && <footer className="ix-drawer-foot">{typeof footer === "function" ? footer(close) : footer}</footer>}
      </aside>
    </div>,
    // inPage: opened inside the page, so the page's own styles (lists, badges, upload boxes) apply inside the panel
    (inPage && document.querySelector(".ix-page")) || document.body
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
  const [code, setCode] = useState(null);       // the code, once revealed
  const [ask, setAsk] = useState(null);         // null | "show" | "new" | "pw"
  const [pw, setPw] = useState("");
  const [np, setNp] = useState("");
  const [np2, setNp2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [note, setNote] = useState(null);
  const [copied, setCopied] = useState(false);

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

  const titles = { show: "View recovery code", new: "Make a new recovery code", pw: "Change Password" };

  return (
    <section className="ix-card sec-card">
      <h3 className="ipv-title">Account security</h3>
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
/* ───── Requirements checklist of one intern (in their profile under Interns) ─────
   Every requirement of the phase with its status: Approved / Pending / Rejected / Not submitted. */
function RequirementChecklist({ internId, intern = null, canViewFiles = false }) {
  const [movs, setMovs] = useState(null);
  const [phase, setPhase] = useState("pre");
  const [rcFilter, setRcFilter] = useState("all");   // all | approved | pending | rejected | none
  useEffect(() => { setRcFilter("all"); }, [phase, internId]);
  const [reload, setReload] = useState(0);
  // the reports the coordinator asked for (weekly / monthly report), kept to the ones for this intern
  const [reports, setReports] = useState([]);
  useEffect(() => {
    let alive = true;
    fetch(`${API}/reports`, { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !Array.isArray(d)) return;
        setReports(d.filter((rp) => rp.audience === "programs" ? (rp.programs || []).includes(programKey(intern?.program))
          : rp.audience === "interns" ? (rp.intern_ids || []).map(Number).includes(Number(internId)) : true));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [internId, intern?.program]);
  useEffect(() => {
    let alive = true;
    if (!reload) setMovs(null);
    fetch(`${API}/staff/interns/${internId}/requirements`, { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((d) => { if (alive) setMovs(Array.isArray(d) ? d : []); })
      .catch(() => { if (alive) setMovs([]); });
    return () => { alive = false; };
  }, [internId, reload]);

  // coordinator only: take back an approval made by mistake (asks once first)
  const [undoAsk, setUndoAsk] = useState(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoMsg, setUndoMsg] = useState(null);
  const undo = async (m) => {
    setUndoBusy(true); setUndoMsg(null);
    try {
      const res = await fetch(`${API}/coordinator/movs/${m.id}/undo`, { method: "POST", headers: { Accept: "application/json" } });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || "Could not undo the approval.");
      setUndoMsg({ type: "success", text: d.message });
      setUndoAsk(null);
      setReload((n) => n + 1);
    } catch (e) {
      setUndoMsg({ type: "error", text: e instanceof TypeError ? "Couldn't reach the server." : e.message });
    } finally { setUndoBusy(false); }
  };

  const inPhase = (m, ph) => (m.phase || "pre") === ph;
  // newest first from the server, so find() gives the latest submission
  const statusOf = (key, ph) => (movs || []).find((m) => m.requirement === key && inPhase(m, ph));
  const list = REQUIREMENTS_BY_PHASE[phase] || [];
  const approvedIn = (ph) => (REQUIREMENTS_BY_PHASE[ph] || []).filter((r) => r.key === "weekly_report"
    ? reports.length > 0 && reports.every((rp) => (movs || []).find((x) => Number(x.report_id) === Number(rp.id))?.status === "approved")
    : statusOf(r.key, ph)?.status === "approved").length;
  const LABEL = { approved: "Approved", pending: "Pending", rejected: "Rejected" };

  return (
    <div className="ipv-block">
      <div className="ipv-title-row">
        <h3 className="ipv-title">Requirements</h3>
        <div className="rc-tabs">
          {["pre", "during", "post"].map((ph) => (
            <button key={ph} type="button" className={phase === ph ? "rc-tab on" : "rc-tab"} onClick={() => setPhase(ph)}>
              {PHASE_LABEL[ph].replace("-internship", "").replace(" internship", "")}
              {movs && <span>{approvedIn(ph)}/{(REQUIREMENTS_BY_PHASE[ph] || []).length}</span>}
            </button>
          ))}
        </div>
      </div>
      {!movs ? <Spinner /> : (() => {
        // a status list (not a checklist): what the intern has sent, when, and what the coordinator decided
        const rows = list.map((r) => {
          const m = statusOf(r.key, phase);
          if (r.key === "weekly_report") {
            // one row for all the reports: "2 of 3 reports approved"
            const latestOf = (rid) => (movs || []).find((x) => Number(x.report_id) === Number(rid));
            const st4 = reports.map((rp) => latestOf(rp.id)?.status || "none");
            const ap = st4.filter((x) => x === "approved").length;
            const wait = st4.filter((x) => x === "pending").length;
            const ret = st4.filter((x) => x === "rejected").length;
            const st = !reports.length ? "none" : ap === reports.length ? "approved" : ret ? "rejected" : wait ? "pending" : "none";
            const bits = [wait && `${wait} waiting`, ret && `${ret} returned`, (reports.length - ap - wait - ret) && `${reports.length - ap - wait - ret} not sent`].filter(Boolean);
            return { r, m: null, st, report: { ap, total: reports.length, text: reports.length
              ? `${ap} of ${reports.length} report${reports.length === 1 ? "" : "s"} approved${bits.length ? " · " + bits.join(" · ") : ""}`
              : "The coordinator hasn't asked for a report yet" } };
          }
          return { r, m, st: m?.status || "none" };
        });
        const count = (st) => rows.filter((x) => x.st === st).length;
        const shown = rcFilter === "all" ? rows : rows.filter((x) => x.st === rcFilter);
        const when = (v) => (v ? new Date(v).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "");
        const sentOn = (m) => { const d = when(m.created_at || m.submitted_at || m.updated_at); return d ? `Submitted ${d}` : "Submitted"; };
        const SUB = {
          approved: (m) => `${sentOn(m)} · approved by the coordinator`,
          pending: (m) => `${sentOn(m)} · waiting for the coordinator's review`,
          rejected: (m) => m.remarks ? `Returned: ${m.remarks}` : "Returned · the intern needs to upload a new copy",
          none: () => "The intern hasn't uploaded this yet",
        };
        const TAG = { approved: ["Approved", "approved"], pending: ["Waiting", "pending"], rejected: ["Returned", "rejected"], none: ["Not submitted", "none"] };
        const ICON = { approved: "check", pending: "clock", rejected: "warn", none: "file" };
        return (
          <>
            <div className="rc-sum">
              <strong>{approvedIn(phase)} of {list.length}</strong> approved
              <span className="rc-bar"><i style={{ width: `${list.length ? (approvedIn(phase) / list.length) * 100 : 0}%` }} /></span>
            </div>
            {undoMsg && <div style={{ marginBottom: 8 }}><Msg msg={undoMsg} /></div>}
            <div className="rc-filters" role="group" aria-label="Show">
              {[["all", "All", rows.length], ["approved", "Approved", count("approved")], ["pending", "Waiting", count("pending")],
                ["rejected", "Returned", count("rejected")], ["none", "Not submitted", count("none")]].map(([k, l, n]) => (
                <button key={k} type="button" className={`rc-f ${k}${rcFilter === k ? " on" : ""}`} onClick={() => setRcFilter(k)} disabled={k !== "all" && !n}>
                  {k !== "all" && <i />}{l} <b>{n}</b>
                </button>
              ))}
            </div>
            {shown.length === 0 ? <div className="rc-none">Nothing here.</div> : (
              <ul className="rc-rows">
                {shown.map(({ r, m, st, report }) => (
                  <li key={r.key} className={`rc-row ${st}`}>
                    <span className="rc-ic" aria-hidden="true"><Icon name={ICON[st]} size={15} /></span>
                    <span className="rc-txt">
                      <b>{r.label}</b>
                      <small>{report ? report.text : SUB[st](m || {})}</small>
                    </span>
                    {canViewFiles && m?.file_path && (
                      <a className="rc-view" href={`${STORAGE}${m.file_path}`} target="_blank" rel="noopener noreferrer" title={m.original_name || "Open file"}>
                        <Icon name="eye" size={13} /> View
                      </a>
                    )}
                    {canViewFiles && st === "approved" && m?.id && (
                      undoAsk === m.id ? (
                        <span className="rc-undo-ask">
                          <button type="button" className="rc-undo yes" onClick={() => undo(m)} disabled={undoBusy}>{undoBusy ? "..." : "Yes, remove"}</button>
                          <button type="button" className="rc-undo" onClick={() => setUndoAsk(null)} disabled={undoBusy}>No</button>
                        </span>
                      ) : (
                        <button type="button" className="rc-undo" title="Approved by mistake? Put it back to waiting for review" onClick={() => setUndoAsk(m.id)}>
                          Remove approval
                        </button>
                      )
                    )}
                    <span className={`rc-tag ${TAG[st][1]}`}>{report && report.total ? `${report.ap}/${report.total}` : TAG[st][0]}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        );
      })()}
    </div>
  );
}

function InternProfile({ u, records, today, onClose, onViewRecords, canViewFiles = false }) {
  const recs = records.filter((r) => r.user_id === u.id);
  const isIn = recs.some((r) => r.date === today && r.uid !== "ONLINE" && r.action === "CHECK_IN" && !r.checked_out_at);
  const days = [...new Set(recs.map((r) => r.date))].length;
  const total = calcHours(recs);
  const outputBased = u.tracking_type === "output";
  const required = requiredHoursFor(u.program);
  const pct = Math.min(Math.round((total / required) * 100), 100);
  const left = Math.max(Math.round((required - total) * 10) / 10, 0);
  const onsite = recs.filter((r) => r.uid !== "ONLINE").length;
  const online = recs.filter((r) => r.uid === "ONLINE").length;
  const studentId = u.student_id || u.student_number || "—";

  // first time in and last time out of today
  const todaySessions = sessionsByDate(recs.filter((r) => r.date === today))[today] || [];
  const tIn = todaySessions[0]?.in;
  const tOut = [...todaySessions].reverse().find((s) => s.out)?.out;
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
          <div className="ipv-name-row">
            <h2>{u.name}</h2>
          </div>
          {/* the intern's key details, each with its own label */}
          <dl className="ipv-facts">
            <div><dt>Student ID</dt><dd>{studentId}</dd></div>
            <div><dt>Program &amp; year</dt><dd>{u.program || "—"}</dd></div>
            <div><dt>Placement</dt><dd title={u.placement || ""}>{u.placement || "—"}</dd></div>
            <div><dt>DTR type</dt><dd><DtrModeField u={u} /></dd></div>
          </dl>
        </div>
      </div>

      {/* today */}
      <div className="ipv-block">
        <h3 className="ipv-title">Today</h3>
        <div className="ipv-grid c3">
          {cell("Time in", tIn ? fmtTime(tIn) : "Not in yet")}
          {cell("Time out", isIn ? <Badge label="Still in" type="in" /> : tOut ? fmtTime(tOut) : "—")}
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

      {/* which requirements this intern has (and hasn't) submitted */}
      <RequirementChecklist internId={u.id} intern={u} canViewFiles={canViewFiles} />
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

      {u.role === "supervisor" && (
        <div className="ipv-block">
          <h3 className="ipv-title">HTE details</h3>
          <div className="ipv-grid c3">
            {cell("HTE (company / office)", u.placement || "Not set", true)}
          </div>
        </div>
      )}

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
              {cell("DTR type", DTR_MODES[dtrModeOf(u)])}
              {cell("HTE supervisor", u.supervisor_name || "Not assigned yet")}
              {cell("Required hours", `${requiredHoursFor(u.program)}h`)}
              {cell("NFC UID", u.nfc_uid || "Not linked")}
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
export function UserForm({ f, set, mode, isIntern, header, title, sub, uidField, actions, supervisors, role }) {
  const add = mode === "add";
  // when editing, the form has no "role" field, so the page passes the account's role
  const formRole = role || f.role;
  const today = todayManila();

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
            isIntern
              ? text("student_id", { required: add, placeholder: "e.g. 2021-00123" })
              : (
                /* employees: a fixed "EMP-" in front, you only type the number; saved as e.g. EMP-0001 */
                <div className="uf-prefix">
                  <span>EMP-</span>
                  <input
                    className="uf-input"
                    required={add}
                    placeholder="0001"
                    value={String(f.student_id ?? "").replace(/^EMP-?/i, "")}
                    onChange={(e) => {
                      const rest = e.target.value.replace(/^EMP-?/i, "").replace(/\s+/g, "").toUpperCase();
                      set("student_id")({ target: { value: rest ? `EMP-${rest}` : "" } });
                    }}
                  />
                </div>
              ),
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

      {formRole === "supervisor" && (
        <div className="ipv-block">
          <h3 className="ipv-title">HTE details</h3>
          <div className="ipv-grid c3">
            {cell("HTE (company / office)", text("placement", { required: add, placeholder: "e.g. Provincial IT Office, Butuan City" }),
              { full: true, hint: "Use the same name as the interns' Placement, so the coordinator can match them." })}
          </div>
        </div>
      )}

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
              ), { hint: `Required hours: ${requiredHoursFor(f.program)}h` })}
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
              {cell("DTR type", (
                <select className="uf-input" value={f.dtr_mode || "two"} onChange={set("dtr_mode")}>
                  <option value="two">{DTR_MODES.two}</option>
                  <option value="four">{DTR_MODES.four}</option>
                </select>
              ), { hint: "Depends on the intern's HTI." })}
              {supervisors && cell("HTE supervisor", (
                <select className="uf-input" value={f.supervisor_id ?? ""} onChange={set("supervisor_id")}>
                  <option value="">Not assigned yet</option>
                  {supervisors.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                </select>
              ), { hint: "Reviews this intern's overtime and time corrections and certifies the DTR." })}
              {uidField && cell("NFC card", uidField, { plain: true, full: true })}
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
/* Inbox: a compact list on the left and the selected item on the right (phones: one at a time).
   row(item) -> { name, photo, sub, tag, meta };  detail(item) -> what shows on the right */
export function Inbox({ items, keyOf = (x) => x.id, row, detail, emptyTitle = "Nothing here", emptySub }) {
  const [sel, setSel] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const wide = !isMobile();
  const cur = items.find((x) => keyOf(x) === sel) || (wide ? items[0] : null) || null;
  if (!items.length) {
    return <div className="ix-card"><Empty icon="check" title={emptyTitle} sub={emptySub} /></div>;
  }
  return (
    <div className={showDetail && cur ? "mon ibx show-detail" : "mon ibx"}>
      <div className="mon-split ibx-split">
        <div className="mon-list" role="list">
          {items.map((x) => {
            const r = row(x);
            return (
              <button key={keyOf(x)} type="button" role="listitem"
                className={cur && keyOf(cur) === keyOf(x) ? "mon-item on" : "mon-item"}
                onClick={() => { setSel(keyOf(x)); setShowDetail(true); }}>
                {r.icon ? <span className={`ibx-ic ${r.tone || ""}`}><Icon name={r.icon} size={16} /></span> : <Avatar name={r.name} photo={r.photo} size={34} />}
                <span className="mon-who"><b>{r.name}</b><small>{r.sub}</small></span>
                <span className="mon-right">{r.tag}<small>{r.meta}</small></span>
              </button>
            );
          })}
        </div>
        <div className="mon-detail">
          <button type="button" className="mon-back" onClick={() => setShowDetail(false)}>
            <Icon name="menu" size={14} /> Back to the list
          </button>
          {cur ? <div className="ibx-d" key={keyOf(cur)}>{detail(cur)}</div>
            : <div className="mon-empty"><Empty icon="inbox" title="Select an item" /></div>}
        </div>
      </div>
    </div>
  );
}

/* Monitor Interns: a compact list on the left, the selected intern's details on the right
   (like an inbox). On phones the list shows first; tapping an intern opens the details. */
export function InternMonitor({ interns, records, loading, onRefresh, recordsPath = null, canViewFiles = false }) {
  const today = todayManila();
  const navigate = useNavigate();
  const location = useLocation();
  const [q, setQ] = useState(() => location.state?.search || "");   // a name sent from the dashboard opens that intern
  const [status, setStatus] = useState("all");       // all | in | out
  const [program, setProgram] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [showDetail, setShowDetail] = useState(false); // phones: details instead of the list

  const sq = q.trim().toLowerCase();
  const rows = interns.map((u) => {
    const recs = records.filter((r) => r.user_id === u.id);
    const todaySessions = sessionsByDate(recs.filter((r) => r.date === today))[today] || [];
    const isIn = recs.some((r) => r.date === today && r.uid !== "ONLINE" && r.action === "CHECK_IN" && !r.checked_out_at);
    const tIn = todaySessions[0]?.in;
    const tOut = [...todaySessions].reverse().find((x) => x.out)?.out;
    return { u, isIn, tIn, tOut, hours: calcHours(recs), required: requiredHoursFor(u.program) };
  });
  const inCount = rows.filter((x) => x.isIn).length;
  const shown = rows
    .filter((x) => program === "all" || programKey(x.u.program) === program)
    .filter((x) => status === "all" || (status === "in" ? x.isIn : !x.isIn))
    .filter((x) => `${x.u.name} ${x.u.email} ${x.u.student_id ?? ""} ${x.u.placement ?? ""}`.toLowerCase().includes(sq))
    .sort((a, b) => (b.isIn - a.isIn) || String(a.u.name).localeCompare(String(b.u.name)));

  // nothing opens by itself: the details show once an intern is clicked,
  // or when the search narrows the list down to one intern
  const selected = interns.find((u) => u.id === selectedId) || null;
  const open = (u) => { setSelectedId(u.id); setShowDetail(true); };
  // sent here with a name (e.g. from a dashboard): open that intern's summary right away
  const [autoOpened, setAutoOpened] = useState(false);
  useEffect(() => {
    if (autoOpened || !location.state?.search || loading) return;
    if (shown.length === 1) open(shown[0].u);
    setAutoOpened(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, interns.length]);
  const hm = (v) => (v ? new Date(v).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }) : "");
  const todayText = (x) => x.isIn ? `In ${hm(x.tIn)}` : x.tOut ? `Out ${hm(x.tOut)}` : "Not in";

  return (
    <>
      <PageHeader title="Monitor Interns" sub="Real-time status of all interns." live />
      <div className={showDetail ? "mon show-detail" : "mon"}>
        <div className="mon-bar">
          <div className="ix-search mon-search">
            <Icon name="search" size={15} />
            <input type="text" placeholder="Search name, ID or placement..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {[["all", `All · ${rows.length}`], ["in", `On duty · ${inCount}`], ["out", `Not in · ${rows.length - inCount}`]].map(([k, l]) => (
            <button key={k} type="button" className={status === k ? "mon-chip on" : "mon-chip"} onClick={() => setStatus(k)}>
              {k === "in" && <i className="mon-dot in" />}{l}
            </button>
          ))}
          <span className="mon-sep" />
          {["all", "BSIT", "BSCS", "BSIS"].map((k) => (
            <button key={k} type="button" className={program === k ? "mon-chip on" : "mon-chip"} onClick={() => setProgram(k)}>
              {k === "all" ? "All programs" : k}
            </button>
          ))}
        </div>

        {loading ? <Spinner /> : selected && showDetail ? (
          /* one intern: the summary details, with a way back to all the cards */
          <div className="imc-detail">
            <button type="button" className="ix-b ghost sm imc-back" onClick={() => { setShowDetail(false); setSelectedId(null); }}>
              <span aria-hidden="true">←</span> All interns
            </button>
            <InternProfile
              key={selected.id} u={selected} records={records} today={today} canViewFiles={canViewFiles}
              onClose={() => { setSelectedId(null); setShowDetail(false); }}
              onViewRecords={recordsPath ? () => navigate(recordsPath, { state: { search: selected.name } }) : null}
            />
          </div>
        ) : shown.length === 0 ? (
          <div className="ix-card"><Empty icon="users" title="No interns found" /></div>
        ) : (
          /* every intern as a card; click one to see the summary */
          <div className="ix-intern-grid imc-grid">
            {shown.map((x) => {
              const pct = Math.min(100, Math.round((x.hours / (x.required || 1)) * 100));
              return (
                <div key={x.u.id} className="ix-ic clickable imc" role="button" tabIndex={0}
                  aria-label={`View the summary of ${x.u.name}`}
                  onClick={() => open(x.u)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(x.u); } }}>
                  <div className="ix-ic-top">
                    <Avatar name={x.u.name} photo={x.u.photo} status={x.isIn ? "on" : "off"} />
                    <div className="ix-ic-id">
                      <strong>{x.u.name}</strong>
                      <span>{[programKey(x.u.program), x.u.placement || x.u.email].filter(Boolean).join(" · ")}</span>
                    </div>
                    <Badge label={x.isIn ? "Present now" : "Not in"} type={x.isIn ? "in" : "out"} />
                  </div>
                  <div className="ix-ic-stats">
                    <div><strong>{x.u.tracking_type === "output" ? "Output" : `${x.hours}h`}</strong><span>{x.u.tracking_type === "output" ? "output-based" : `of ${x.required}h · ${pct}%`}</span></div>
                    <div><strong>{x.isIn ? hm(x.tIn) : x.tOut ? hm(x.tOut) : "—"}</strong><span>{x.isIn ? "time in today" : x.tOut ? "time out today" : "no tap today"}</span></div>
                  </div>
                  {x.u.tracking_type !== "output" && <div className="imc-bar" aria-hidden="true"><i style={{ width: pct + "%" }} /></div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
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
    const stop = liveRefresh(load);
    return () => { alive = false; stop(); };
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
  const [removed, setRemoved] = useState([]);       // the history of taken-down announcements
  const [view, setView] = useState("posted");        // "posted" | "removed"
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    try {
      const [a, h] = await Promise.all([
        fetch(`${API}/announcements`, { headers: { Accept: "application/json" } }).then((r) => r.json()).catch(() => null),
        fetch(`${API}/announcements/history`, { headers: { Accept: "application/json" } }).then((r) => r.json()).catch(() => null),
      ]);
      if (Array.isArray(a)) setItems(a);
      if (Array.isArray(h)) setRemoved(h);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => liveRefresh(load), []);

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
      setView("posted");
      load();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    } finally {
      setSaving(false);
    }
  };

  // take it down: interns stop seeing it, and it moves to the Removed history
  const remove = async (a) => {
    if (!window.confirm(`Remove "${a.title}"? Interns will no longer see it. It stays in the Removed history.`)) return;
    setBusy(`p${a.id}`); setMsg(null);
    try {
      const res = await fetch(`${API}/announcements/${a.id}`, { method: "DELETE", headers: { Accept: "application/json" } });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Could not remove the announcement.");
      setMsg({ type: "success", text: data?.message || "Removed. You can find it in the history." });
      load();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    } finally { setBusy(null); }
  };

  // delete a removed announcement for good
  const purge = async (h) => {
    if (!window.confirm(`Delete "${h.title}" for good? This cannot be undone.`)) return;
    setBusy(`h${h.id}`); setMsg(null);
    try {
      const res = await fetch(`${API}/announcements/history/${h.id}`, { method: "DELETE", headers: { Accept: "application/json" } });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Could not delete it.");
      setMsg({ type: "success", text: "Deleted for good." });
      load();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    } finally { setBusy(null); }
  };

  const msgCell = (t, b) => (
    <div className="ann-cell">
      <strong>{t}</strong>
      {b && <span>{b}</span>}
    </div>
  );

  return (
    <>
      <PageHeader title="Announcements" sub="Post updates for all interns. They get a notification right away." />
      <Msg msg={msg} />
      <div className="mon-bar">
        <button type="button" className={view === "posted" ? "mon-chip on" : "mon-chip"} onClick={() => setView("posted")}>Posted · {items.length}</button>
        <button type="button" className={view === "removed" ? "mon-chip on" : "mon-chip"} onClick={() => setView("removed")}>Removed · {removed.length}</button>
      </div>
      {loading ? <Spinner /> : (
        <Inbox
          key={view}
          items={view === "posted" ? [{ id: "__new" }, ...items] : removed}
          keyOf={(a) => a.id}
          emptyTitle="No removed announcements" emptySub="Announcements you remove are kept here."
          row={(a) => a.id === "__new"
            ? { icon: "plus", name: "New announcement", sub: "Write and post an update", tag: null, meta: "" }
            : { icon: "bell", tone: view === "removed" ? "rejected" : "", name: a.title, sub: a.body,
                tag: <small className="ann-date">{fmtDay(view === "removed" ? a.removed_at : a.created_at)}</small>, meta: a.author || "OJT office" }}
          detail={(a) => a.id === "__new" ? (
            <form onSubmit={post} className="ann-compose">
              <div className="ibx-head"><span className="ibx-ic big"><Icon name="send" size={20} /></span>
                <div><b>New announcement</b><small>Every intern gets a notification right away.</small></div></div>
              <div className="ix-field">
                <label htmlFor="ann-title">Title</label>
                <input id="ann-title" type="text" required maxLength={150} value={title}
                  placeholder="e.g. Orientation moved to Friday" onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="ix-field ann-body-field">
                <label htmlFor="ann-body">Message</label>
                <textarea id="ann-body" rows={9} required maxLength={2000} value={body}
                  placeholder="Write the details interns need to know..." onChange={(e) => setBody(e.target.value)} />
              </div>
              <div className="ibx-act">
                <small className="ann-count">{body.length}/2000</small>
                <span style={{ flex: 1 }} />
                <button type="submit" className="ix-b primary" disabled={saving}>
                  <Icon name="send" size={15} /> {saving ? "Posting..." : "Post announcement"}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="ibx-head"><span className={`ibx-ic big ${view === "removed" ? "rejected" : ""}`}><Icon name="bell" size={20} /></span>
                <div><b>{a.title}</b><small>{view === "removed"
                  ? `Posted by ${a.author || "OJT office"} · ${fmtDay(a.posted_at)} · removed by ${a.removed_by_name || "—"} · ${fmtDay(a.removed_at)}`
                  : `Posted by ${a.author || "OJT office"} · ${fmtDay(a.created_at)}`}</small></div></div>
              <div className="ibx-sec"><span>Message</span><p>{a.body}</p></div>
              <div className="ibx-act">
                <span className="ann-count">{view === "removed" ? "Interns can't see this anymore." : "Interns see this on their dashboard."}</span>
                <span style={{ flex: 1 }} />
                {view === "posted" ? (
                  <button type="button" className="ix-b danger" disabled={busy === `p${a.id}`} onClick={() => remove(a)}>
                    <Icon name="trash" size={14} /> {busy === `p${a.id}` ? "..." : "Remove"}</button>
                ) : (
                  <button type="button" className="ix-b danger" disabled={busy === `h${a.id}`} onClick={() => purge(a)}>
                    <Icon name="trash" size={14} /> {busy === `h${a.id}` ? "..." : "Delete for good"}</button>
                )}
              </div>
            </>
          )}
        />
      )}
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

/* ───────── Notifications: clicking one opens the page where it is handled ─────────
   Uses the notification type sent by the backend; older notifications without a type
   are matched by their title. Returns null when there is nowhere specific to go. */
const NOTIF_PAGES = {
  intern: {
    mov_review: "/intern/movs", requirement_reminder: "/intern/movs",
    online_review: "/intern/requests", overtime_review: "/intern/requests",
    time_correction_review: "/intern/requests", work_mode_review: "/intern/requests",
    nfc_review: "/intern/nfc", dtr_certified: "/intern/dtr",
    supervisor_assigned: "/intern/profile", announcement: "/intern",
  },
  ojt_coordinator: {
    mov_submission: "/coordinator/approvals?tab=movs", online_submission: "/coordinator/approvals?tab=online",
    online_review: "/coordinator/approvals?tab=online", overtime: "/coordinator/approvals?tab=overtime",
    overtime_review: "/coordinator/approvals?tab=overtime", nfc_request: "/coordinator/nfc",
    dtr_certified: "/coordinator/reports?tab=dtr", supervisor_assigned: "/coordinator/supervisors",
    time_correction: "/coordinator/supervisors", work_mode_request: "/coordinator/supervisors",
    announcement: "/coordinator/announcements",
  },
  supervisor: {
    online_submission: "/supervisor/approvals?tab=online", overtime: "/supervisor/approvals?tab=overtime",
    time_correction: "/supervisor/approvals?tab=fix", work_mode_request: "/supervisor/approvals?tab=wfh",
    supervisor_assigned: "/supervisor/interns", dtr_certified: "/supervisor/reports?tab=dtr", announcement: "/supervisor",
  },
  admin: {
    nfc_print: "/admin/accounts?tab=cards", nfc_request: "/admin/accounts?tab=cards", nfc_review: "/admin/accounts?tab=cards", announcement: "/admin",
  },
};
// title words -> type (for notifications saved before types were used everywhere)
const NOTIF_GUESS = [
  [/time correction/i, "time_correction"], [/work arrangement|wfh/i, "work_mode_request"],
  [/overtime/i, "overtime"], [/online attendance|remote/i, "online_submission"],
  [/\bmovs?\b|requirement|document/i, "mov_submission"], [/\bnfc\b|\bcard\b/i, "nfc_request"],
  [/id card to print/i, "nfc_print"], [/dtr/i, "dtr_certified"], [/supervisor assigned|new intern assigned/i, "supervisor_assigned"],
  [/announcement/i, "announcement"],
];
export function notifTarget(n, role) {
  const pages = NOTIF_PAGES[role] || {};
  let type = n?.type;
  if (!type || !pages[type]) {
    const hit = NOTIF_GUESS.find(([re]) => re.test(`${n?.title || ""}`));
    type = hit ? hit[1] : type;
    // an intern's "approved / rejected" notice is a review, not a new request
    if (role === "intern" && hit && /approved|rejected|confirmed|issued|certified/i.test(n?.title || "")) {
      const review = { time_correction: "time_correction_review", work_mode_request: "work_mode_review", overtime: "overtime_review",
        online_submission: "online_review", mov_submission: "mov_review", nfc_request: "nfc_review" }[type];
      if (review) type = review;
    }
  }
  return pages[type] || null;
}

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
    return liveRefresh(load);
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

  const remove = async (id) => {
    setItems((prev) => prev.filter((n) => n.id !== id));   // instant
    try {
      await fetch(`${API}/notifications/${id}`, { method: "DELETE", headers: { Accept: "application/json" } });
    } catch { /* ignore */ }
  };

  const clearAll = async () => {
    setItems([]);
    try {
      await fetch(`${API}/notifications`, { method: "DELETE", headers: { Accept: "application/json" } });
    } catch { /* ignore */ }
  };

  return { items, markRead, markAllRead, remove, clearAll };
}

/* Sidebar sub-menus: a page with tabs (e.g. Approvals) gets its tabs as sub-items.
   groups = the page's GROUPS object ({ "/coordinator/approvals": { tabs: [{ key, label }] } }). */
export function navWithTabs(nav, groups = {}, extra = {}, badges = {}) {
  // badges = { "/coordinator/approvals": { online: 2, overtime: 1 } } -> a count on each sub-item and the total on the page
  return nav.map((it) => {
    const tabs = extra[it.path] || groups[it.path]?.tabs;
    const b = badges[it.path] || {};
    if (!tabs) return typeof b === "number" ? { ...it, badge: b } : it;
    const children = tabs.map((t) => ({ label: t.label, path: `${it.path}?tab=${t.key}`, key: t.key, badge: Number(b[t.key]) || 0 }));
    return { ...it, badge: children.reduce((n, c) => n + c.badge, 0), children };
  });
}

/* ───────── First sign-in after the Excel import: set your own password ─────────
   The account has a temporary password (sent by email). It can't be used until the user picks their own. */
function FirstPasswordGate({ user, onSignOut, children }) {
  const [need, setNeed] = useState(null);   // null = still checking · true = must set a password · false = fine

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  useEffect(() => {
    if (!user?.id) return;
    fetch(`${API}/me?user_id=${user.id}`, { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((d) => { const u = d?.user || d; setNeed(!!(u && (u.must_change_password === true || u.must_change_password === 1 || u.must_change_password === "1"))); })
      .catch(() => setNeed(false));
  }, [user?.id]);
  if (need === null) return null;
  if (!need) return children || null;   // the Data Privacy notice comes after the password
  const save = async (e) => {
    e.preventDefault();
    if (pw.length < 8) { setErr("Use at least 8 characters."); return; }
    if (pw !== pw2) { setErr("The two passwords don't match."); return; }
    setBusy(true); setErr("");
    try {
      const res = await fetch(`${API}/account/first-password`, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ new_password: pw }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d.errors && Object.values(d.errors)[0]?.[0]) || d.message || "Couldn't save your password.");
      setDone(d.message || "Password set.");
      setTimeout(() => setNeed(false), 900);
    } catch (e2) {
      setErr(e2 instanceof TypeError ? "Couldn't reach the server." : e2.message);
    } finally { setBusy(false); }
  };
  return createPortal(
    <div className="ix-modal-wrap pv-wrap fp-wrap">
      <style>{PRIVACY_CSS}</style>
      <div className="ix-modal pv-modal fp-modal" role="dialog" aria-modal="true" aria-label="Set your password">
        <header><div><h2>Set your own password</h2><p>You signed in with a temporary password. Choose your own to continue.</p></div></header>
        <form className="ix-modal-body pv-body fp-body" onSubmit={save}>
          <label className="fp-field">New password
            <input type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" minLength={8} required autoFocus />
          </label>
          <label className="fp-field">Type it again
            <input type={show ? "text" : "password"} value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" minLength={8} required />
          </label>
          <label className="fp-show"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show password</label>
          <p className="fp-hint">At least 8 characters. Don't use your birthday or student ID.</p>
          {err && <p className="pv-err">{err}</p>}
          {done && <p className="fp-ok">{done}</p>}
          <div className="pv-actions">
            <button type="button" className="ix-b ghost" onClick={onSignOut} disabled={busy}>Sign out</button>
            <button type="submit" className="ix-b primary" disabled={busy || !!done}>{busy ? "Saving..." : "Save password"}</button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

/* ───────── Data Privacy Act: asked once, on an intern's first sign-in (interns only) ─────────
   Shown until the user agrees. "I don't agree" signs them out (the system can't be used without it).
   Only shown when the server has the consent column (php artisan migrate was run). */
function PrivacyGate({ user, onDecline }) {
  const [need, setNeed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [checked, setChecked] = useState(false);
  const isIntern = user?.role === "intern";
  useEffect(() => {
    if (!user?.id || !isIntern) return;
    fetch(`${API}/me?user_id=${user.id}`, { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((d) => { const u = d?.user || d; if (u && "privacy_consent_at" in u && !u.privacy_consent_at) setNeed(true); })
      .catch(() => {});
  }, [user?.id, isIntern]);
  if (!need || !isIntern) return null;
  const agree = async () => {
    setBusy(true); setErr("");
    try {
      const res = await fetch(`${API}/account/privacy-consent`, { method: "POST", headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error();
      setNeed(false);
    } catch { setErr("Couldn't save. Please try again."); } finally { setBusy(false); }
  };
  return createPortal(
    <div className="ix-modal-wrap pv-wrap">
      <style>{PRIVACY_CSS}</style>
      <div className="ix-modal pv-modal" role="dialog" aria-modal="true" aria-label="Data Privacy Notice">
        <header><div><h2>Data Privacy Notice</h2><p>Please read this before using MYTRACK.</p></div></header>
        <div className="ix-modal-body pv-body">
          <p>Caraga State University – College of Computing and Information Sciences (CCIS) collects and uses your personal information
            through MYTRACK in line with the <b>Data Privacy Act of 2012 (Republic Act No. 10173)</b>.</p>
          <h3>What we collect</h3>
          <p>Your name, student ID, program, contact details, emergency contact, photo, OJT placement, attendance taps,
            online attendance, and the requirements you upload.</p>
          <h3>Why we collect it</h3>
          <p>Only to monitor your OJT: record attendance, compute rendered hours, review requirements, and produce your DTR and reports.</p>
          <h3>Who can see it</h3>
          <p>The CCIS admin and your OJT coordinator. Your HTE supervisor sees only your attendance and requests. Uploaded files are
            visible only to the OJT coordinator. Nothing is shared outside the university.</p>
          <h3>How long we keep it</h3>
          <p>For as long as the university's records policy requires. After your internship your account is deactivated, but your
            records are kept.</p>
          <h3>Your rights</h3>
          <p>You may ask the CCIS office to see or correct your information at any time.</p>
          <label className="pv-check">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <span>I have read this notice and I agree to the collection and use of my personal information for OJT monitoring.</span>
          </label>
          {err && <p className="pv-err">{err}</p>}
          <div className="pv-actions">
            <button type="button" className="ix-b ghost" onClick={onDecline} disabled={busy}>I don't agree (sign out)</button>
            <button type="button" className="ix-b primary" onClick={agree} disabled={!checked || busy}>{busy ? "Saving..." : "I agree"}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
const PRIVACY_CSS = `
  .pv-wrap { z-index: 300 !important; }
  .pv-modal { max-width: 560px !important; }
  .pv-body { font-size: 13px; line-height: 1.55; color: #374151; max-height: 70vh; overflow: auto; }
  .pv-body p { margin: 0 0 8px; }
  .pv-body h3 { margin: 12px 0 3px; font-size: 13px; font-weight: 700; color: #111827; }
  .pv-check { display: flex; gap: 10px; align-items: flex-start; margin-top: 14px; padding: 10px 12px; border-radius: 10px;
    background: #fff7f2; border: 1px solid #fde2cf; cursor: pointer; font-size: 12.5px; color: #1f2937; }
  .pv-check input { margin-top: 2px; accent-color: #e8582a; width: 16px; height: 16px; flex: none; }
  .pv-err { color: #dc2626; font-size: 12px; margin-top: 8px; }
  .pv-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
  .fp-wrap { z-index: 310 !important; }
  .fp-modal { max-width: 420px !important; }
  .fp-body { display: flex; flex-direction: column; gap: 10px; }
  .fp-field { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; font-weight: 600; color: #374151; }
  .fp-field input { height: 40px; padding: 0 12px; border-radius: 10px; border: 1px solid #e5e7eb; font: inherit; font-weight: 500; font-size: 14px; }
  .fp-field input:focus { outline: 2px solid #f5b79f; border-color: #e8582a; }
  .fp-show { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: #4b5563; cursor: pointer; }
  .fp-show input { accent-color: #e8582a; }
  .fp-hint { font-size: 12px; color: #6b7280; margin: 0 !important; }
  .fp-ok { color: #15803d; font-size: 12.5px; font-weight: 600; margin: 0 !important; }
`;

export default function Shell({ navItems, user, children }) {
  const navigate = useNavigate();
  const { pathname: path, search: navSearch } = useLocation();
  const [openGroups, setOpenGroups] = useState({});   // sub-menus the user opened or closed by hand
  const [tip, setTip] = useState(null);               // tooltip next to an icon when the sidebar is closed
  const [menuOpen, setMenuOpen] = useState(() => {
    // open by default on computers (labels showing); it remembers if you collapse it
    try { return !isMobile() && localStorage.getItem(SIDEBAR_KEY) !== "0"; } catch { return !isMobile(); }
  });
  const [isFull, setIsFull] = useState(false);

  // live updates: one small "has anything changed?" check for the whole page
  useEffect(() => {
    let last = null;
    let busy = false;
    const check = async () => {
      if (document.hidden || busy) return;
      busy = true;
      try {
        const res = await fetch(`${API}/live`, { headers: { Accept: "application/json" }, cache: "no-store" });
        const d = await res.json();
        if (d?.v) {
          if (last !== null && d.v !== last) window.dispatchEvent(new Event(LIVE_EVENT));
          last = d.v;
        }
      } catch { /* offline for a moment: try again next time */ }
      finally { busy = false; }
    };
    check();
    const iv = setInterval(check, LIVE_CHECK_MS);
    return () => clearInterval(iv);
  }, []);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef(null);
  const [acctOpen, setAcctOpen] = useState(false);
  const acctRef = useRef(null);
  // sidebar: search the menu (Ctrl+K) and the account card's menu
  const [menuQ, setMenuQ] = useState("");
  const menuQRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setMenuOpen(true);
        setTimeout(() => menuQRef.current?.focus(), 60);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // student / employee ID and program are not in the login response, so read them from the account
  // kept in this tab's storage, so the ID shows right away when you change pages (no "role first, ID later")
  const ME_KEY = `mytrack_me_${user?.id}`;
  const [me, setMe] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(ME_KEY) || "null"); } catch { return null; }
  });
  useEffect(() => {
    if (!user?.id) return;
    fetch(`${API}/me?user_id=${user.id}`).then((r) => r.json()).then((d) => {
      const u = d?.user || d;
      if (!u || !u.id) return;
      setMe(u);
      try {
        sessionStorage.setItem(ME_KEY, JSON.stringify({ id: u.id, student_id: u.student_id, program: u.program }));
      } catch { /* ignore */ }
    }).catch(() => {});
    // eslint-disable-next-line
  }, []);
  const yearLabel = (p) => {
    const [prog, yr] = String(p || "").split(/\s*-\s*/);
    const n = parseInt(yr, 10);
    const sfx = n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
    return prog ? (n ? `${prog} · ${n}${sfx} Year` : prog) : "";
  };

  const { items: notifications, markRead, markAllRead, remove, clearAll } = useNotifications(user?.id);
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
        setAcctOpen(false);
      }
    };
    const onClick = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
      if (acctRef.current && !acctRef.current.contains(e.target)) setAcctOpen(false);
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
    setAcctOpen(false);
  }, [path]);

  const logout = () => {
    sessionStorage.removeItem("user");
    try { sessionStorage.removeItem(ME_KEY); } catch { /* ignore */ }
    localStorage.removeItem("ojt_remember"); // stops "Remember me" from signing back in
    navigate(loginPath, { replace: true });
  };
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  // the page the sidebar points at (its name goes in the top bar)
  const section = navItems.find((it) => it.path === path)
    || navItems.filter((it) => path.startsWith(it.path + "/")).sort((a, b) => b.path.length - a.path.length)[0]
    || navItems[0];
  const matches = (it) => !menuQ.trim() || `${it.label} ${(it.children || []).map((c) => c.label).join(" ")}`.toLowerCase().includes(menuQ.trim().toLowerCase());

  return (
    <div className={menuOpen ? "ix-page lay2 menu-open" : "ix-page lay2"}>
      <FirstPasswordGate user={user} onSignOut={logout}>
        <PrivacyGate user={user} onDecline={logout} />
      </FirstPasswordGate>
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

        {/* page name + its tabs (filled in by the page's header) */}
        <div className="ix-top-title">
          <h2>{section?.label}</h2>
          <div className="ix-top-tabs" id="ix-top-tabs" />
        </div>

        <div className="ix-nav-right">
          <div className="ix-notification-wrap" ref={notifRef}>
            <button
              className="ix-notification-btn"
              onClick={() => { setNotifOpen((o) => !o); setAcctOpen(false); }}
              aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
              aria-expanded={notifOpen}
            >
              <Icon name="bell" size={20} />
              {unreadCount > 0 && <span className="ix-notification-count">{unreadCount > 9 ? "9+" : unreadCount}</span>}
            </button>

            {notifOpen && (
              <div className="ix-notification-dropdown">
                <div className="ix-notification-header">
                  <strong>Notifications</strong>
                  <span className="ix-notification-actions">
                    {unreadCount > 0 && (
                      <button type="button" className="ix-notification-all" onClick={markAllRead}>Mark all read</button>
                    )}
                    {notifications.length > 0
                      ? <button type="button" className="ix-notification-all danger" onClick={clearAll}>Clear all</button>
                      : <span>All caught up</span>}
                  </span>
                </div>

                <div className="ix-notification-list">
                  {notifications.length === 0 ? (
                    <div className="ix-no-notifications">No notifications yet.</div>
                  ) : (
                    notifications.map((n) => (
                      <div key={n.id} className={`ix-notification-item ${n.is_read ? "read" : ""}`}>
                        <button
                          type="button"
                          className={notifTarget(n, user?.role) ? "ix-notification-main go" : "ix-notification-main"}
                          onClick={() => {
                            if (!n.is_read) markRead(n.id);
                            const to = notifTarget(n, user?.role);
                            if (to) { setNotifOpen(false); navigate(to); }
                          }}
                        >
                          <span className="ix-notification-dot" />
                          <span className="ix-notification-content">
                            <strong>{n.title}</strong>
                            <span>{n.message}</span>
                            <small>
                              {timeAgo(n.created_at)}
                              {notifTarget(n, user?.role) && <em className="ix-notification-open">Open →</em>}
                            </small>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="ix-notification-x"
                          onClick={() => remove(n.id)}
                          aria-label={`Delete notification: ${n.title}`}
                          title="Delete"
                        >
                          <Icon name="x" size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* account button: full name + photo; click it to open the Log out menu */}
          <div className="ix-acct-wrap" ref={acctRef}>
            <button
              className={acctOpen ? "ix-acct-btn open" : "ix-acct-btn"}
              onClick={() => { setAcctOpen((o) => !o); setNotifOpen(false); }}
              aria-label="Account menu"
              aria-haspopup="menu"
              aria-expanded={acctOpen}
            >
              <span className="ix-acct-name">{user?.name || "User"}</span>
              <Avatar name={user?.name} photo={user?.photo} status="on" size={36} />
            </button>

            {acctOpen && (
              <div className="ix-acct-menu" role="menu">
                <button type="button" className="ix-logout" role="menuitem" onClick={logout}>
                  <Icon name="logout" size={16} />
                  <span>Log out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="ix-body">
        <div className={menuOpen ? "ix-strip open" : "ix-strip"} />
        {menuOpen && <div className="ix-backdrop" onClick={() => setMenuOpen(false)} />}
        <aside className={menuOpen ? "ix-side open" : "ix-side"} aria-label="Main navigation">
          <div className="ix-sb-top">
            <label className="ix-sb-search" onClick={() => { if (!menuOpen) { setMenuOpen(true); setTimeout(() => menuQRef.current?.focus(), 60); } }}>
              <Icon name="search" size={15} />
              <input ref={menuQRef} type="text" value={menuQ} placeholder="Search" aria-label="Search the menu"
                onChange={(e) => setMenuQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { setMenuQ(""); e.currentTarget.blur(); }
                  if (e.key === "Enter") {
                    const hit = navItems.find(matches);
                    if (hit) { navigate(hit.path); setMenuQ(""); e.currentTarget.blur(); }
                  }
                }} />
              <kbd>Ctrl K</kbd>
            </label>
          </div>
          <nav className="ix-side-menu">
          {(() => {
            const tabNow = new URLSearchParams(navSearch).get("tab");
            const isAccount = (it) => /\/profile$/.test(it.path);
            const showTip = (e, label) => {
              if (menuOpen) return;
              const z = currentFit();
              const r = e.currentTarget.getBoundingClientRect();
              setTip({ label, top: (r.top + r.height / 2) / z, left: (r.right + 10) / z });
            };
            const item = (it) => {
              const here = path === it.path;
              const kids = it.children || [];
              const open = kids.length > 0 && menuOpen && (openGroups[it.path] ?? here);
              return (
                <div key={it.path} className={open ? "ix-side-group open" : "ix-side-group"}>
                  <button
                    className={here ? "ix-side-item active" : "ix-side-item"}
                    onClick={() => {
                      if (kids.length && menuOpen && here) { setOpenGroups((g) => ({ ...g, [it.path]: !open })); return; }
                      if (kids.length) setOpenGroups((g) => ({ ...g, [it.path]: true }));
                      navigate(it.path);
                    }}
                    onMouseEnter={(e) => showTip(e, it.label)} onMouseLeave={() => setTip(null)}
                    aria-current={here ? "page" : undefined}
                    aria-expanded={kids.length ? open : undefined}
                  >
                    <span className="ix-side-icon"><Icon name={it.icon} /></span>
                    <span className="ix-side-label">{it.label}</span>
                    {it.badge > 0 && <span className="ix-side-badge" aria-label={`${it.badge} waiting`}>{it.badge > 99 ? "99+" : it.badge}</span>}
                    {kids.length > 0 && <span className="ix-side-chev" aria-hidden="true">›</span>}
                  </button>
                  {open && (
                    <div className="ix-side-sub">
                      {kids.map((c, i) => {
                        const on = here && (tabNow ? tabNow === c.key : i === 0);
                        return (
                          <button key={c.path} type="button" className={on ? "ix-side-subitem on" : "ix-side-subitem"}
                            onClick={() => navigate(c.path)} aria-current={on ? "page" : undefined}>
                            {c.label}
                            {c.badge > 0 && <span className="ix-side-badge sm">{c.badge > 99 ? "99+" : c.badge}</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            };
            const main = navItems.filter((it) => !isAccount(it) && matches(it));
            const acct = navItems.filter((it) => isAccount(it) && matches(it));
            if (!main.length && !acct.length) return <div className="ix-sb-none">No page matches "{menuQ}".</div>;
            return (
              <>
                {main.map(item)}
                {acct.length > 0 && (
                  <>
                    <div className="ix-side-sep" />
                    <div className="ix-side-section">Account</div>
                    {acct.map(item)}
                  </>
                )}
              </>
            );
          })()}
          </nav>
          {tip && !menuOpen && <div className="ix-side-tip" style={{ top: tip.top, left: tip.left }}>{tip.label}</div>}
          <div className="ix-sb-bottom">
            <span className="ix-sb-foot">CSU CCIS OJT</span>
            <button type="button" className="ix-sb-collapse" onClick={() => setMenuOpen((o) => !o)}
              aria-label={menuOpen ? "Collapse the menu" : "Expand the menu"} title={menuOpen ? "Collapse" : "Expand"}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
            </button>
          </div>
        </aside>

        <main className="ix-main">
          <PageIconCtx.Provider value={(navItems.find((it) => it.path === path) || navItems.filter((it) => path.startsWith(it.path + "/")).sort((a, b) => b.path.length - a.path.length)[0] || {}).icon || null}>
            <div className="ix-content" key={path}>{children}</div>
          </PageIconCtx.Provider>
        </main>
      </div>

      <style>{css}</style>
      {/* loaded LAST so it wins over every page's own styles: one look for all roles */}
      <style>{uiUnify}</style>
      {/* the light "panel" look (white sidebar, pages inside one white rounded panel) */}
      <style>{lay3}</style>
    </div>
  );
}

/* ───────────────────────── one look for every role ─────────────────────────
   Same font, colours, buttons, dropdowns, inputs and tabs on the Intern, Coordinator,
   Supervisor and Admin pages. To change the look of the whole system, change the
   values in --u-* below. */
/* ═════════════ Light layout: white sidebar with section labels, every page inside one white rounded panel,
   thin-bordered cards, a number strip with round icons. Loaded last, so it decides the look. ═════════════ */
export const lay3 = `
  .ix-page.lay2 { --l3-bg: #f4f5f7; --l3-line: #e7e9ee; --l3-ink: #1f2430; --l3-mut: #6b7280; --l3-o: #e8582a; --l3-o-soft: #fdeee5;
    --ix-surface: #fff; --ix-surface-2: #f6f7f9; background: var(--l3-bg) !important; }
  /* the white panel behind the top bar + page */
  .ix-page.lay2::before { content: ""; position: absolute; z-index: 0; top: 12px; right: 12px; bottom: 12px; left: var(--sb-w);
    background: #fff; border: 1px solid var(--l3-line); border-radius: 20px; box-shadow: 0 1px 2px rgba(16,24,40,.04); transition: left .3s cubic-bezier(.2,.8,.2,1); }
  .ix-page.lay2.menu-open::before { left: var(--sb-w-open); }
  .ix-page.lay2::after { content: ""; position: absolute; z-index: 0; top: 76px; right: 13px; height: 1px; left: calc(var(--sb-w) + 1px); background: var(--l3-line);
    transition: left .3s cubic-bezier(.2,.8,.2,1); }
  .ix-page.lay2.menu-open::after { left: calc(var(--sb-w-open) + 1px); }
  .ix-page.lay2 > .ix-nav, .ix-page.lay2 > .ix-body { position: relative; z-index: 1; }

  /* top bar: no own background; the logo sits over the sidebar, the page title inside the panel */
  .ix-page.lay2 .ix-nav { height: 77px !important; padding: 12px 24px 0 0 !important; background: transparent !important; border: 0 !important; box-shadow: none !important; gap: 8px !important; }
  /* the top bar (and its account / notification menus) always sits above the page, so "Log out" can be clicked */
  .ix-page.lay2 .ix-nav { position: relative !important; z-index: 400 !important; }
  .ix-page.lay2 :is(.ix-acct-menu, .ix-notification-dropdown) { z-index: 410 !important; }
  /* the logo sits in a neat white tile (its file has a white background, so this looks intentional, not like a pasted box) */
  .ix-page.lay2 .ix-nav-logo { width: 42px !important; height: 42px !important; object-fit: contain; padding: 4px; box-sizing: border-box;
    background: #fff; border: 1px solid #e7e9ee; border-radius: 12px; box-shadow: 0 1px 2px rgba(15,23,42,.05); flex-shrink: 0; }
  /* phones: a smaller logo tile; with the menu open the bar shows the brand, without it the page name (never both, so nothing overlaps) */
  @media (max-width: 900px) {
    .ix-page.lay2 .ix-nav-logo { width: 36px !important; height: 36px !important; padding: 3px; border-radius: 10px; }
    .ix-page.lay2 .ix-nav .ix-top-title { min-width: 0; overflow: hidden; }
    .ix-page.lay2 .ix-nav .ix-top-title h2 { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ix-page.lay2.menu-open .ix-nav .ix-top-title { visibility: hidden; }
    .ix-page.lay2:not(.menu-open) .ix-brand-name { display: none !important; }
    .ix-page.lay2 .ix-sb-collapse { display: none !important; }
  }
  .ix-page.lay2 .ix-nav::after { display: none !important; }
  .ix-page.lay2 .ix-logo-btn { flex: none; width: var(--sb-w); justify-content: center; padding: 0 !important; margin: 0 !important; transition: width .3s cubic-bezier(.2,.8,.2,1); }
  .ix-page.lay2.menu-open .ix-logo-btn { width: var(--sb-w-open); justify-content: flex-start; padding-left: 20px !important; }
  .ix-page.lay2 .ix-brand-name { color: var(--l3-ink) !important; }
  .ix-page.lay2 .ix-nav > .ix-icon-btn:not(.ix-fs-btn) { display: none !important; }      /* the menu opens/closes from the sidebar's « button */
  .ix-page.lay2 .ix-nav > .ix-fs-btn { order: 3; border: 1px solid var(--l3-line) !important; border-radius: 10px !important; width: 38px; height: 38px; background: #fff !important; }
  .ix-page.lay2 .ix-nav > .ix-nav-right { order: 4; }
  .ix-page.lay2 .ix-top-title { order: 2; margin-left: 0 !important; padding-left: 28px !important; border-left: 0 !important; }
  .ix-page.lay2 .ix-top-title h2 { font-size: 21px !important; font-weight: 600 !important; color: var(--l3-ink) !important; letter-spacing: -.2px; }
  .ix-page.lay2 .ix-notification-btn, .ix-page.lay2 .ix-nav-right .ix-icon-btn { border: 1px solid var(--l3-line) !important; border-radius: 10px !important; background: #fff !important; }

  /* sidebar: white (no colour of its own), grey section labels, the open page is a soft orange pill */
  .ix-page.lay2 .ix-side { background: transparent !important; color: var(--l3-ink) !important; box-shadow: none !important; }
  .ix-page.lay2 .ix-sb-top { padding: 6px 14px 2px !important; }
  .ix-page.lay2 .ix-sb-search { background: #fff !important; border: 1px solid var(--l3-line) !important; color: var(--l3-mut) !important; border-radius: 10px !important; }
  .ix-page.lay2 .ix-sb-search:focus-within { border-color: var(--l3-o) !important; box-shadow: 0 0 0 3px rgba(232,88,42,.12); }
  .ix-page.lay2 .ix-sb-search input { color: var(--l3-ink) !important; }
  .ix-page.lay2 .ix-sb-search input::placeholder { color: #9aa1ab !important; }
  .ix-page.lay2 .ix-sb-search kbd { background: #f1f2f4 !important; color: var(--l3-mut) !important; border: 1px solid var(--l3-line); }
  .ix-page.lay2 .ix-side.open .ix-side-menu::before { content: "Main"; display: block; padding: 10px 26px 6px; font-size: 11px; font-weight: 600; letter-spacing: .08em;
    text-transform: uppercase; color: #8b919b; }
  .ix-page.lay2 .ix-side .ix-side-item { width: auto !important; margin: 1px 12px !important; border-radius: 10px !important; padding: 0 12px 0 14px !important;
    color: #3a3f4a !important; background: transparent !important; box-shadow: none !important; }
  .ix-page.lay2 .ix-side:not(.open) .ix-side-item { width: 52px !important; margin: 1px 12px !important; padding: 0 0 0 17px !important; justify-content: flex-start !important; overflow: hidden !important; }
  .ix-page.lay2 .ix-side:not(.open) .ix-side-section { font-size: 0 !important; padding: 4px 0 !important; text-align: center; }
  .ix-page.lay2 .ix-side:not(.open) .ix-sb-top { align-items: center; }
  .ix-page.lay2 .ix-side .ix-side-item .ix-side-icon { color: #5b616c !important; }
  .ix-page.lay2 .ix-side .ix-side-label { font-weight: 500 !important; color: inherit !important; }
  .ix-page.lay2 .ix-side .ix-side-item:hover { background: #f1f2f4 !important; color: var(--l3-ink) !important; }
  .ix-page.lay2 .ix-side .ix-side-item:hover .ix-side-icon { color: var(--l3-ink) !important; }
  .ix-page.lay2 .ix-side .ix-side-item.active { background: var(--l3-o-soft) !important; color: #7c2d12 !important; box-shadow: none !important; }
  .ix-page.lay2 .ix-side .ix-side-item.active .ix-side-icon { color: var(--l3-o) !important; }
  .ix-page.lay2 .ix-side .ix-side-item.active .ix-side-label { font-weight: 600 !important; }
  .ix-page.lay2 .ix-side .ix-side-chev { color: #9aa1ab !important; }
  .ix-page.lay2 .ix-side .ix-side-sub { margin: 2px 12px 4px 36px !important; }
  .ix-page.lay2 .ix-side .ix-side-sub::before { background: var(--l3-line) !important; }
  .ix-page.lay2 .ix-side .ix-side-subitem { color: #6b7280 !important; border-radius: 8px !important; }
  .ix-page.lay2 .ix-side .ix-side-subitem:hover { color: var(--l3-ink) !important; background: #f1f2f4 !important; }
  .ix-page.lay2 .ix-side .ix-side-subitem.on { color: #c2410c !important; background: transparent !important; font-weight: 600 !important; }
  .ix-page.lay2 .ix-side .ix-side-subitem.on::before { background: var(--l3-o) !important; }
  .ix-page.lay2 .ix-side .ix-side-sep { background: var(--l3-line) !important; margin: 10px 24px !important; }
  .ix-page.lay2 .ix-side .ix-side-section { color: #8b919b !important; font-size: 11px !important; font-weight: 600 !important; letter-spacing: .08em !important; padding-left: 26px !important; }
  .ix-page.lay2 .ix-side .ix-side-badge { background: #fff !important; color: var(--l3-ink) !important; border: 1px solid var(--l3-line); font-weight: 700; }
  .ix-page.lay2 .ix-side .ix-side-badge.sm { background: var(--l3-o) !important; color: #fff !important; border: 0; }
  .ix-page.lay2 .ix-side:not(.open) .ix-side-badge { background: var(--l3-o) !important; color: #fff !important; border: 0; }
  .ix-page.lay2 .ix-sb-bottom { border-top: 1px solid var(--l3-line) !important; margin: 0 12px 12px; padding: 10px 6px 0 14px !important; background: transparent !important; }
  .ix-page.lay2 .ix-sb-foot { color: #8b919b !important; }
  .ix-page.lay2 .ix-sb-collapse { background: #fff !important; border: 1px solid var(--l3-line) !important; color: var(--l3-mut) !important; }
  .ix-page.lay2 .ix-sb-collapse:hover { color: var(--l3-o) !important; border-color: #f2c7b3 !important; }
  .ix-page.lay2 .ix-tip, .ix-page.lay2 .ix-side-tip { background: var(--l3-ink) !important; color: #fff !important; }

  /* the page itself sits inside the panel */
  .ix-page.lay2 .ix-main { background: transparent !important; margin: 0 12px 12px 0; border-radius: 0 0 20px 20px; padding: 20px 30px 24px 30px !important; }

  /* cards: white with a thin border, no heavy shadow */
  .ix-page.lay2 .ix-content :is(.ix-card, .dbx-card, .imp-panel, .ibx-split, .mon-split, .ipv) {
    background: #fff !important; border: 1px solid var(--l3-line) !important; border-radius: 16px !important; box-shadow: none !important; }
  .ix-page.lay2 .ix-content .dbx-ch { border-bottom: 1px solid var(--l3-line) !important; }
  .ix-page.lay2 .ix-content .dbx-ch b { font-size: 15px !important; font-weight: 600 !important; color: var(--l3-ink) !important; }
  .ix-page.lay2 .ix-content .dbx-n { background: #fff !important; border: 1px solid var(--l3-line); color: var(--l3-mut) !important; }
  .ix-page.lay2 .ix-content .dbx-link { border: 1px solid var(--l3-line); border-radius: 9px; padding: 4px 9px; font-size: 12px !important; background: #fff; color: var(--l3-ink) !important; font-weight: 600; white-space: nowrap; flex: none; }
  .ix-page.lay2 .ix-content .dbx-ch b { white-space: nowrap; }
  .ix-page.lay2 .ix-content .dbx-ch { gap: 8px !important; }
  .ix-page.lay2 .ix-content .dbx-link:hover { border-color: #f2c7b3; color: #c2410c !important; }
  .ix-page.lay2 .ix-content .ix-ph h1, .ix-page.lay2 .ix-content .dbx > .ix-ph h1 { color: var(--l3-ink) !important; }

  /* number strip: one bordered card, cells split by thin lines, round outlined icon, small grey label */
  .ix-page.lay2 .ix-content .dbx-sum.tiles { background: #fff !important; border: 1px solid var(--l3-line) !important; border-radius: 16px !important; gap: 0 !important; overflow: hidden !important; }
  .ix-page.lay2 .ix-content .dbx-sum.tiles > .dbx-num { background: transparent !important; border: 0 !important; border-radius: 0 !important; padding: 16px 20px !important;
    grid-template-columns: 44px minmax(0, 1fr) !important; column-gap: 14px !important; row-gap: 2px !important; }
  .ix-page.lay2 .ix-content .dbx-sum.tiles > .dbx-num + .dbx-num { border-left: 1px solid var(--l3-line) !important; }
  .ix-page.lay2 .ix-content .dbx-sum.tiles > .dbx-num::after { display: none !important; }
  .ix-page.lay2 .ix-content .dbx-sum.tiles > .dbx-num > .dbx-num-ic { width: 44px !important; height: 44px !important; border-radius: 50% !important;
    border: 1px solid var(--l3-line) !important; background: #fff !important; box-shadow: 0 1px 2px rgba(16,24,40,.05) !important; color: var(--tc) !important; align-self: start; }
  .ix-page.lay2 .ix-content .dbx-sum.tiles > .dbx-num > .dbx-num-ic svg { width: 21px !important; height: 21px !important; }
  .ix-page.lay2 .ix-content .dbx-sum.tiles > .dbx-num > small { font-size: 11px !important; font-weight: 500 !important; letter-spacing: .06em; text-transform: uppercase; color: #8b919b !important; opacity: 1 !important; }
  .ix-page.lay2 .ix-content .dbx-sum.tiles > .dbx-num > b { font-size: 22px !important; font-weight: 600 !important; color: var(--l3-ink) !important; }
  .ix-page.lay2 .ix-content .dbx-sum.tiles > .dbx-num > em { font-size: 12px !important; color: var(--l3-mut) !important; }
  /* the small line under each number shows in full (wraps to a second line instead of "...") */
  .ix-page.lay2 .ix-content .dbx-sum.tiles > .dbx-num > em { white-space: normal !important; overflow: visible !important; text-overflow: clip !important; line-height: 1.35 !important; display: block; }
  .ix-page.lay2 .ix-content .dbx-sum.tiles > .dbx-num.click:hover { background: #fafafb !important; transform: none !important; filter: none !important; }
  @media (max-width: 700px) {
    .ix-page.lay2 .ix-content .dbx-sum.tiles > .dbx-num { border-left: 0 !important; border-top: 1px solid var(--l3-line) !important; padding: 12px 14px !important; grid-template-columns: 36px minmax(0, 1fr) !important; }
    .ix-page.lay2 .ix-content .dbx-sum.tiles > .dbx-num:nth-child(-n+2) { border-top: 0 !important; }
    .ix-page.lay2 .ix-content .dbx-sum.tiles > .dbx-num:nth-child(even) { border-left: 1px solid var(--l3-line) !important; }
    .ix-page.lay2 .ix-content .dbx-sum.tiles > .dbx-num > .dbx-num-ic { width: 36px !important; height: 36px !important; }
  }

  /* dashboards: cards take their natural height and the page scrolls (no squeezing to fit the window,
     so nothing looks cut off when the browser isn't full screen) */
  @media (min-width: 1251px) {
    .ix-page.lay2 .ix-main:has(.dbx-grid) { display: block !important; padding-bottom: 28px !important; }
    .ix-page.lay2 .ix-main:has(.dbx-grid.has-left.has-right) > .ix-content { flex: none !important; min-height: auto !important; }
    .ix-page.lay2 .ix-content > .dbx:has(> .dbx-grid.has-left.has-right) { flex: none !important; min-height: auto !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right { flex: none !important; height: auto !important; min-height: 0 !important;
      grid-template-rows: auto auto !important; align-content: start !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side { overflow: visible !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > :last-child { overflow: visible !important; flex: 1 1 auto !important; min-height: 0 !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-col:not(.dbx-side) > *,
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-col:not(.dbx-side) > :nth-child(2) { overflow: visible !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > .ix-card.adm-cal { flex: none !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > .adm-duty:last-child > .ann-list { overflow: visible !important; flex: none !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > .adm-duty:last-child > .adm-duty-empty { overflow: visible !important; min-height: 90px !important; }
    /* three equal rows across: [today | finish line | calendar] then [requirements | recent attendance | announcements] */
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right { align-items: stretch !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side { display: contents !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > * { grid-column: 3 !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > :first-child { grid-row: 1 !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > :nth-child(2) { grid-row: 2 !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > :only-child { grid-row: 1 / 3 !important; }
    /* a list fills its card: when a card in the same row is taller, the rows share the extra space
       evenly (no empty gap under the last row) */
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-col > * { display: flex !important; flex-direction: column !important; }
    .ix-page.lay2 .ix-content .dbx-grid .dbx-fill { flex: 1 1 auto !important; justify-content: stretch !important; display: flex !important; flex-direction: column !important; }
    .ix-page.lay2 .ix-content .dbx-grid .dbx-fill > * { flex: 1 1 auto !important; }
    .ix-page.lay2 .ix-content .dbx-grid .dbx-fill > .dbx-more { flex: none !important; }
    /* every list row the same height as a Recent attendance row (clickable or not) */
    .ix-page.lay2 .ix-content .dbx-grid .dbx-it { min-height: 56px; box-sizing: border-box; padding: 8px 14px !important; line-height: 1.3 !important; margin: 0 !important; }
    .ix-page.lay2 .ix-content .dbx-grid .dbx-it .dbx-tx { gap: 2px; }
    .ix-page.lay2 .ix-content .dbx-grid .dbx-it .dbx-tx :is(b, small) { display: block; line-height: 1.3 !important; margin: 0 !important; }
    .ix-page.lay2 .ix-content .dbx-grid .dbx-tap { min-height: 56px; box-sizing: border-box; }
    /* announcements: the same header line as the other cards */
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > .adm-duty:last-child { padding: 0 !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > .adm-duty:last-child > .adm-duty-head { min-height: 48px !important; margin: 0 !important; padding: 10px 14px !important; border-bottom: 1px solid var(--l3-line) !important; box-sizing: border-box; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > .adm-duty:last-child > .adm-duty-head h2 { font-size: 15px !important; font-weight: 600 !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > .adm-duty:last-child > :not(.adm-duty-head) { margin: 12px 14px 14px !important; }
    /* announcements: the list or empty message reaches the bottom of the card, like Recent attendance */
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > .adm-duty:last-child { display: flex !important; flex-direction: column !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > .adm-duty:last-child > .adm-duty-empty { flex: 1 1 auto !important; min-height: 0 !important; height: auto !important; padding: 18px 12px !important; display: flex !important; flex-direction: column; align-items: center; justify-content: center !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > .adm-duty:last-child > .ann-list { flex: 1 1 0 !important; min-height: 0 !important; overflow-y: auto !important; }
    /* the announcements card never makes its row taller: it takes the row's height and scrolls inside */
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > .adm-duty:nth-child(2):last-child { height: 0 !important; min-height: 100% !important; overflow: hidden !important; }
    /* a roomier calendar again */
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side .adm-cal-grid { grid-auto-rows: 29px !important; row-gap: 2px !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side .adm-cal-day { min-height: 29px !important; height: 29px !important; font-size: 12.5px !important; }
    /* right column: one stack across both rows, a tall calendar on top and announcements below it.
       Its bottom still lines up with the other columns, and it never makes the page taller. */
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side { display: flex !important; flex-direction: column !important; gap: 12px !important;
      grid-column: 3 !important; grid-row: 1 / 3 !important; height: 0 !important; min-height: 100% !important; overflow: visible !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > .ix-card.adm-cal { flex: 0 0 auto !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > .adm-duty:nth-child(2):last-child { flex: 1 1 0 !important; height: auto !important; min-height: 150px !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side .adm-cal-grid { grid-auto-rows: 40px !important; row-gap: 4px !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side .adm-cal-day { min-height: 40px !important; height: 40px !important; font-size: 13.5px !important; }
  }

  /* phones: no panel frame (the screen is the panel); the menu button comes back */
  @media (max-width: 900px) {
    .ix-page.lay2::before { left: 0 !important; top: 0; right: 0; bottom: 0; border-radius: 0; border: 0; }
    .ix-page.lay2::after { left: 0 !important; right: 0; top: 64px; }
    .ix-page.lay2 .ix-nav { height: 64px !important; padding: 0 14px 0 0 !important; }
    .ix-page.lay2 .ix-nav > .ix-icon-btn:not(.ix-fs-btn) { display: flex !important; order: 1; }
    .ix-page.lay2 .ix-logo-btn, .ix-page.lay2.menu-open .ix-logo-btn { width: auto; padding-left: 14px !important; }
    .ix-page.lay2 .ix-top-title { padding-left: 8px !important; }
    .ix-page.lay2 .ix-side { background: #fff !important; }
    .ix-page.lay2 .ix-main { margin: 0; border-radius: 0; padding: 16px 14px 28px !important; }
  }
`;

export const uiUnify = `
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap');
  :is(.ix-page, .ix-modal-wrap) {
    --u-font: 'Poppins', 'Segoe UI', sans-serif;
    --u-orange: #e8582a;        /* main colour (buttons, active tab, focus) */
    --u-orange-dark: #d4481b;   /* hover */
    --u-orange-soft: #fdeee7;   /* light orange background */
    --u-ink: #1f2937;           /* normal text */
    --u-muted: #6b7280;         /* small / secondary text */
    --u-line: #d6d3d1;          /* input & button borders */
    --u-h: 38px;                /* height of every button, dropdown and input */
    --u-h-sm: 32px;             /* small buttons */
    --u-radius: 8px;
    /* the older theme variables now follow the same colours */
    --md-text: var(--u-ink); --md-muted: var(--u-muted); --md-orange: var(--u-orange);
    --display: var(--u-font); --o: var(--u-orange);
  }
  .ix-page .ix-main { --display: var(--u-font); }

  /* ── font: Poppins everywhere (printed DTR keeps its own font) ── */
  .ix-page, .ix-page .ix-content, .ix-modal-wrap { font-family: var(--u-font); color: var(--u-ink); }
  :is(.ix-page, .ix-modal-wrap) :is(button, input, select, textarea) { font-family: var(--u-font); }
  :is(.ix-page, .ix-modal-wrap) :is(h1, h2, h3, .ix-stat-value) { font-family: var(--u-font); }
  .ix-page .ix-ph h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.3px; color: #111827; }

  /* ── buttons ── */
  :is(.ix-page, .ix-modal-wrap) :is(.ix-b, .ix-btn, .fl-btn) {
    height: var(--u-h); padding: 0 16px; border-radius: var(--u-radius);
    font-size: 13px; font-weight: 600; letter-spacing: 0; text-transform: none; line-height: 1;
    display: inline-flex; align-items: center; justify-content: center; gap: 7px; white-space: nowrap;
    transform: none; box-shadow: none; cursor: pointer; transition: background .15s, border-color .15s, color .15s;
  }
  :is(.ix-page, .ix-modal-wrap) :is(.ix-b.primary, .ix-b.warn, .ix-btn, .fl-btn) {
    background: var(--u-orange); background-image: none; color: #fff; border: 1px solid var(--u-orange);
  }
  :is(.ix-page, .ix-modal-wrap) :is(.ix-b.primary, .ix-b.warn, .ix-btn, .fl-btn):hover:not(:disabled) {
    background: var(--u-orange-dark); border-color: var(--u-orange-dark); color: #fff; transform: none; box-shadow: none;
  }
  :is(.ix-page, .ix-modal-wrap) .ix-b.ghost { background: var(--ix-surface, #fff); border: 1px solid var(--u-line); color: #374151; }
  :is(.ix-page, .ix-modal-wrap) .ix-b.ghost:hover:not(:disabled) { background: var(--u-orange-soft); border-color: var(--u-orange); color: var(--u-orange-dark); }
  :is(.ix-page, .ix-modal-wrap) .ix-b.danger { background: var(--ix-surface, #fff); border: 1px solid #fca5a5; color: #dc2626; }
  :is(.ix-page, .ix-modal-wrap) .ix-b.danger:hover:not(:disabled) { background: #fef2f2; border-color: #dc2626; }
  :is(.ix-page, .ix-modal-wrap) .ix-b.ok { background: #16a34a; border: 1px solid #16a34a; color: #fff; }
  :is(.ix-page, .ix-modal-wrap) .ix-b.ok:hover:not(:disabled) { background: #15803d; border-color: #15803d; }
  :is(.ix-page, .ix-modal-wrap) :is(.ix-b.sm, .rv-actions .ix-b, .sv-actions .ix-b) { height: var(--u-h-sm); padding: 0 12px; font-size: 12.5px; }
  :is(.ix-page, .ix-modal-wrap) :is(.ix-b, .ix-btn, .fl-btn):disabled { opacity: .55; cursor: default; }
  :is(.ix-page, .ix-modal-wrap) :is(.ix-b, .ix-btn, .fl-btn):focus-visible { outline: 2px solid var(--u-orange); outline-offset: 2px; }
  /* small secondary buttons that were styled on their own */
  .ix-page .adm-cal-today { height: var(--u-h-sm); padding: 0 12px; border: 1px solid var(--u-line); border-radius: var(--u-radius); background: var(--ix-surface, #fff); color: #374151; font-size: 12.5px; font-weight: 600; }
  .ix-page .adm-cal-today:hover { background: var(--u-orange-soft); border-color: var(--u-orange); color: var(--u-orange-dark); }
  .ix-page .adm-cal-nav { border-radius: var(--u-radius); border-color: var(--u-line); background: var(--ix-surface, #fff); }

  /* ── inputs, dropdowns and text boxes ── */
  :is(.ix-page, .ix-modal-wrap) :is(
    .ix-field input:not([type=file]):not([type=checkbox]):not([type=radio]), .ix-field select, .ix-field textarea,
    .ix-select, .at-month, .dtr-sel, .fl-field select, .dtr-search input, .uf-input, .imp-edit, .sec-pw input
  ) {
    padding: 0 12px; border: 1px solid var(--u-line); border-radius: var(--u-radius);
    background-color: var(--ix-surface, #fff); color: var(--u-ink); font-size: 13.5px; font-weight: 400; box-shadow: none;
    outline: none; transition: border-color .15s, box-shadow .15s;
  }
  :is(.ix-page, .ix-modal-wrap) :is(
    .ix-field input, .ix-field select, .ix-select, .at-month, .dtr-sel, .fl-field select,
    .dtr-search input, input.uf-input, select.uf-input, .imp-edit, .sec-pw input
  ) { height: var(--u-h); }
  :is(.ix-page, .ix-modal-wrap) :is(.ix-field textarea, textarea.uf-input) { padding: 10px 12px; line-height: 1.5; }
  :is(.ix-page, .ix-modal-wrap) :is(.ix-field textarea, textarea.uf-input) { min-height: 76px; }
  /* search boxes with an icon inside keep room for the icon */
  .ix-page .dtr-search input { padding-left: 36px !important; padding-right: 32px !important; }
  .ix-page .dtr-search-list { border-radius: var(--u-radius); }
  .ix-page .dtr-search-list li { border-radius: 6px; }
  /* every dropdown gets the same arrow */
  :is(.ix-page, .ix-modal-wrap) :is(.ix-field select, .ix-select, .at-month, .dtr-sel, .fl-field select, select.uf-input) {
    appearance: none; -webkit-appearance: none; padding-right: 34px; cursor: pointer;
    background: var(--ix-surface, #fff) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E") no-repeat right 11px center;
  }
  :is(.ix-page, .ix-modal-wrap) :is(
    .ix-field input, .ix-field select, .ix-field textarea, .ix-select, .at-month, .dtr-sel, .fl-field select,
    .dtr-search input, .uf-input, .imp-edit, .sec-pw input
  ):is(:hover):not(:disabled) { border-color: #a8a29e; }
  :is(.ix-page, .ix-modal-wrap) :is(
    .ix-field input, .ix-field select, .ix-field textarea, .ix-select, .at-month, .dtr-sel, .fl-field select,
    .dtr-search input, .uf-input, .imp-edit, .sec-pw input
  ):focus { border-color: var(--u-orange); box-shadow: 0 0 0 3px rgba(232,88,42,.15); padding-top: 0; padding-bottom: 0; }
  :is(.ix-page, .ix-modal-wrap) :is(.ix-field textarea, textarea.uf-input):focus { padding-top: 10px; padding-bottom: 10px; }
  :is(.ix-page, .ix-modal-wrap) ::placeholder { color: #a8a29e; font-weight: 400; }
  /* search box (icon + input) */
  :is(.ix-page, .ix-modal-wrap) .ix-search { height: var(--u-h); padding: 0 12px; border: 1px solid var(--u-line); border-radius: var(--u-radius); background: var(--ix-surface, #fff); }
  :is(.ix-page, .ix-modal-wrap) .ix-search:focus-within { border-color: var(--u-orange); box-shadow: 0 0 0 3px rgba(232,88,42,.15); }
  :is(.ix-page, .ix-modal-wrap) .ix-search input { height: 100%; padding: 0; font-size: 13.5px; color: var(--u-ink); }
  /* field labels: same size everywhere */
  :is(.ix-page, .ix-modal-wrap) :is(.ix-field > label, .ix-field > span:first-child, .fl-label, .uf-cell .ipv-label) {
    font-size: 12.5px; font-weight: 600; color: #374151; letter-spacing: 0; text-transform: none;
  }
  /* Display DTR picker: label above the dropdown, like every other form */
  .ix-page .dtr-pick { align-items: end; }
  .ix-page .fl-field { display: flex; flex-direction: column; gap: 5px; }
  .ix-page .fl-field .fl-label,
  .ix-page .fl-field.empty .fl-label,
  .ix-page .fl-field.empty:focus-within .fl-label { position: static; transform: none; top: auto; left: auto; font-size: 12.5px; color: #374151; }
  .ix-page .fl-field:focus-within .fl-label { color: #374151; }

  /* ── tabs ── */
  /* section tabs (underline): same everywhere */
  .ix-page .grp-tab { font-size: 13.5px; font-weight: 600; color: var(--u-muted); }
  .ix-page .grp-tab.active { color: var(--u-orange); }
  .ix-page .grp-tab.active::after { background: var(--u-orange); }
  /* filter tabs (pills) and the requirement-phase tabs: one style */
  .ix-page .req-tabs { display: flex; flex-wrap: wrap; gap: 8px; padding: 0; background: none; box-shadow: none; border-radius: 0; }
  .ix-page :is(.ix-pill, .req-tabs button, .ix-content .at-log-head .ix-pill) {
    height: 34px; padding: 0 14px; border: 1px solid var(--u-line); border-radius: var(--u-radius);
    background: var(--ix-surface, #fff); background-image: none; color: #4b5563; font-size: 13px; font-weight: 600; box-shadow: none;
    display: inline-flex; align-items: center; gap: 7px;
  }
  .ix-page :is(.ix-pill, .req-tabs button):hover:not(.active):not(.on):not(:disabled) { border-color: var(--u-orange); color: var(--u-orange-dark); }
  .ix-page :is(.ix-pill.active, .req-tabs button.on, .ix-content .at-log-head .ix-pill.active) {
    background: var(--u-orange); background-image: none; border-color: var(--u-orange); color: #fff; box-shadow: none;
  }

  /* modal titles */
  .ix-modal-wrap .ix-modal header h2 { font-family: var(--u-font); font-weight: 700; }

  /* ── hero cards (e.g. My Attendance): same dark-brown → orange gradient as the dashboard band ── */
  .ix-page .ix-content .hv-hero {
    background:
      radial-gradient(520px 260px at 78% -30%, rgba(255,150,90,.55), transparent 70%),
      radial-gradient(420px 240px at 8% 130%, rgba(232,88,42,.45), transparent 70%),
      linear-gradient(115deg, #26120b 0%, #4a1d10 42%, #a83a17 78%, #e8582a 100%) !important;
    color: #fff;
  }
  .ix-page .ix-content .hv-hero .hv-blob { background: transparent; border: 1px solid rgba(255,255,255,.08); }
  .ix-page .ix-content .hv-hero .hv-track { background: rgba(255,255,255,.18); }
  .ix-page .ix-content .hv-hero .hv-track-fill { background: linear-gradient(90deg, #ffd2bd, #fff); }
  .ix-page .ix-content .hv-hero .hv-track i { background: rgba(255,255,255,.45); }
  .ix-page .ix-content .hv-hero svg circle:first-child { stroke: rgba(255,255,255,.18); }
  .ix-page .ix-content .hv-hero svg circle:last-child { stroke: #fff; }
  .ix-page .ix-content .hv-hero .hv-pill { background: rgba(255,255,255,.1); color: #fff; border: 1px solid rgba(255,255,255,.16); }
  .ix-page .ix-content .hv-hero .hv-pill i { background: #cbd5e1; opacity: 1; }
  .ix-page .adm-cal-day.today, .ix-page .adm-cal-day.today.event { background: var(--u-orange); color: #fff; box-shadow: none; }
  :is(.ix-page, .ix-modal-wrap, .ix-nav) .ix-av, .ix-page .ix-avatar { background: var(--u-orange); box-shadow: none; }
  .ix-page .ix-bar-fill, .ix-page .at-hrs-bar i, .ix-page .at-col-track i { background: var(--u-orange); }
  .ix-page .at-col-track i.online { background: #2563eb; }
  .ix-page .ix-steps li.done .ix-step-dot { background: var(--u-orange); box-shadow: none; }
  .ix-page .ix-content .ix-card.adm-duty { background: var(--ix-surface, #fff); }
  .ix-page :is(.ix-stat-icon, .crd-icon, .crd-row-ico, .adm-duty-icon) { box-shadow: none !important; }
  .ix-page :is(.ix-stat-icon, .crd-icon, .crd-row-ico).orange { background: var(--u-orange) !important; }
  .ix-page :is(.ix-stat-icon, .crd-row-ico).blue   { background: #2563eb !important; }
  .ix-page .ix-stat-icon.green  { background: #16a34a !important; }
  .ix-page :is(.ix-stat-icon, .crd-row-ico).purple { background: #7c3aed !important; }
  .ix-page .adm-duty-icon { background: var(--u-orange) !important; }

  /* ── stat cards: icon on the left, the number big and easy to read ── */
  .ix-page .ix-content .hv-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-top: 16px; }
  .ix-page .ix-content .hv-stat {
    display: flex; flex-direction: row; align-items: center; gap: 12px; padding: 14px 16px; min-height: 0;
    background: var(--ix-surface, #fff); border-radius: 12px; position: relative; overflow: hidden;
  }
  .ix-page .ix-content .hv-stat .hv-stat-ic {
    position: static; width: 44px; height: 44px; margin: 0; flex-shrink: 0; border-radius: 10px; box-shadow: none;
    display: flex; align-items: center; justify-content: center; grid-column: auto; grid-row: auto;
  }
  .ix-page .ix-content .hv-stat.orange .hv-stat-ic { background: #fdeee7; color: var(--u-orange); }
  .ix-page .ix-content .hv-stat.blue   .hv-stat-ic { background: #e8f1fd; color: #2563eb; }
  .ix-page .ix-content .hv-stat.green  .hv-stat-ic { background: #e6f7ee; color: #16a34a; }
  .ix-page .ix-content .hv-stat.purple .hv-stat-ic { background: #f0eafd; color: #7c3aed; }
  .ix-page .ix-content .hv-stat.red    .hv-stat-ic { background: #fef2f2; color: #dc2626; }
  .ix-page .ix-content .hv-stat.red.ok .hv-stat-ic { background: #e6f7ee; color: #16a34a; }
  .ix-page .ix-content .hv-stat .hv-stat-body { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; flex: 1; gap: 1px; }
  .ix-page .ix-content .hv-stat .hv-stat-body small { order: 1; text-align: left; font-size: 12px; font-weight: 500; color: var(--u-muted); line-height: 1.2; }
  .ix-page .ix-content .hv-stat .hv-stat-body strong { order: 2; text-align: left; font-size: 21px; font-weight: 700; color: #111827; line-height: 1.2; margin: 0; }
  .ix-page .ix-content .hv-stat .hv-stat-body em {
    order: 3; font-style: normal; font-size: 11.5px; line-height: 1.3; color: #9ca3af; margin: 0; padding: 0; border: 0;
    white-space: normal; max-width: 100%;
  }
  .ix-page .ix-content .hv-stat .hv-stat-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; margin: 0; border-radius: 0; background: #fde5d8; }
  .ix-page .ix-content .hv-stat .hv-stat-bar i { display: block; height: 100%; background: var(--u-orange); border-radius: 0; }
  @media (max-width: 1100px) { .ix-page .ix-content .hv-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 420px)  {
    .ix-page .ix-content .hv-stats { gap: 10px; }
    .ix-page .ix-content .hv-stat { padding: 12px; gap: 10px; }
    .ix-page .ix-content .hv-stat .hv-stat-ic { width: 36px; height: 36px; }
    .ix-page .ix-content .hv-stat .hv-stat-body strong { font-size: 18px; }
  }

  /* ── phones: every table turns into a list of cards (label on the left, value on the right) ── */
  @media (max-width: 640px) {
    .ix-page .ix-content .ix-table-wrap { overflow: visible; }
    .ix-page .ix-content .ix-table, .ix-page .ix-content .ix-table tbody { display: block; width: 100%; }
    .ix-page .ix-content .ix-table thead { display: none; }
    .ix-page .ix-content .ix-table tr { display: block; padding: 10px 14px; border-bottom: 1px solid #f1ece9; }
    .ix-page .ix-content .ix-table tr:hover { background: transparent; }
    .ix-page .ix-content .ix-table td {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
      padding: 5px 0; border: 0; text-align: right; white-space: normal; max-width: none; min-width: 0;
    }
    .ix-page .ix-content .ix-table td::before {
      content: attr(data-label); flex-shrink: 0; padding-top: 2px; text-align: left;
      font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: #9ca3af;
    }
    .ix-page .ix-content .ix-table td[data-label=""]::before { content: none; }
    /* the first cell is the row's title: full width, no label */
    .ix-page .ix-content .ix-table td:first-child { display: block; text-align: left; padding-bottom: 6px; }
    .ix-page .ix-content .ix-table td:first-child::before { content: none; }
    .ix-page .ix-content .ix-table td > * { min-width: 0; }
    .ix-page .ix-content .ix-table td .ix-actions { justify-content: flex-end; flex-wrap: wrap; }
    .ix-page .ix-content .rq-steps li { width: 70px; font-size: 10px; }
    .ix-page .ix-content .rq-steps li span { line-height: 1.2; }
    /* Submit MOV: one requirement per row, the button can wrap under the text */
    .ix-page .req-list { grid-template-columns: minmax(0, 1fr); }
    .ix-page .req-item { flex-wrap: wrap; }
    .ix-page .req-item .req-main strong, .ix-page .req-item .req-main small { white-space: normal; }
  }

  /* ── intern home: getting-started checklist ── */
  .gs-card { display: flex; flex-direction: column; gap: 12px; }
  .gs-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .gs-head strong { font-size: 15px; font-weight: 700; color: #111827; }
  .gs-head span { font-size: 12px; color: var(--u-muted); }
  .gs-bar { height: 6px; border-radius: 99px; background: #fde5d8; overflow: hidden; }
  .gs-bar i { display: block; height: 100%; background: var(--u-orange); border-radius: 99px; transition: width .4s; }
  .gs-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .gs-list li { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid #f1ece9; border-radius: 10px; }
  .gs-list li.done { background: #f6fdf9; border-color: #d7f0e1; }
  .gs-dot { width: 26px; height: 26px; flex-shrink: 0; border-radius: 50%; border: 2px solid #d1d5db; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #9ca3af; background: var(--ix-surface, #fff); }
  .gs-list li.done .gs-dot { background: #16a34a; border-color: #16a34a; color: #fff; }
  .gs-list li.wait .gs-dot { border-color: #f59e0b; color: #b45309; background: #fffbeb; }
  .gs-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .gs-text b { font-size: 13.5px; color: #111827; font-weight: 600; }
  .gs-text small { font-size: 12px; color: var(--u-muted); }
  .gs-list li.done .gs-text b { color: #15803d; }

  /* ───── same card headers everywhere ("Today's Live Attendance", "On duty now", "Needs your review",
     "Announcements"): one title size, one icon size ───── */
  .ix-page .ix-content :is(.ix-section > header h2, .adm-duty-head h2, .crd-head h2, .intern-announce h2) {
    font-size: 15px; font-weight: 700; letter-spacing: -.2px;
  }
  .ix-page .ix-content :is(.adm-duty-icon, .crd-icon, .intern-announce-icon) { width: 30px; height: 30px; flex-shrink: 0; }

  /* the same height for every text box, dropdown and search box */
  .ix-page .ix-content .ix-field :is(input[type=text], input[type=email], input[type=date], input[type=time], input[type=number], input:not([type]), select) { min-height: 38px; }

  /* every dropdown keeps room on the right for its arrow, so the arrow never covers the text
     (e.g. "All programs" on the Interns page) */
  :is(.ix-page, .ix-modal-wrap) select:is(.ix-select, .at-month, .dtr-sel, .uf-input),
  :is(.ix-page, .ix-modal-wrap) :is(.ix-field, .fl-field) select { padding-right: 34px !important; }

  /* ───── "Getting started" (intern home): compact, the 3 steps side by side ───── */
  .ix-page .ix-content .ix-card.gs-card { padding: 14px 18px !important; gap: 10px; }
  .ix-page .ix-content .gs-head strong { font-size: 15px; }
  .ix-page .ix-content .gs-bar { height: 5px; }
  .ix-page .ix-content .gs-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); grid-auto-flow: column; gap: 8px; }
  .ix-page .ix-content .gs-list li { align-items: flex-start; gap: 10px; padding: 10px 12px; margin: 0; min-width: 0; flex-wrap: wrap; }
  .ix-page .ix-content .gs-dot { width: 22px; height: 22px; font-size: 11px; border-width: 1.5px; margin-top: 1px; }
  .ix-page .ix-content .gs-text { gap: 2px; flex: 1 1 calc(100% - 32px); }
  .ix-page .ix-content .gs-text b { font-size: 13px; line-height: 1.35; }
  .ix-page .ix-content .gs-text small { font-size: 11.5px; line-height: 1.4; }
  .ix-page .ix-content .gs-list li .ix-b { margin-left: 32px; padding: 5px 12px; font-size: 12px; min-height: 0; height: auto; }
  @media (max-width: 900px) { .ix-page .ix-content .gs-list { grid-auto-flow: row; grid-template-columns: 1fr; } }

  /* ───── Submit MOV on a phone: every requirement looks the same —
     name and description on top, status on the left and the button on the right underneath ───── */
  @media (max-width: 700px) {
    .ix-page .ix-content .req-tabs { display: grid !important; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
    .ix-page .ix-content .req-tabs button { min-width: 0; padding: 9px 6px !important; font-size: 13px !important;
      white-space: nowrap; text-align: center; justify-content: center; gap: 5px; }
    /* short tab names on a phone: Pre / During / Post */
    .ix-page .ix-content .req-tabs .req-tab-long { display: none; }
    .ix-page .ix-content .req-item { display: grid !important; grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas: "main main" "badge btn"; align-items: center; gap: 10px 10px; padding: 12px 14px !important; }
    .ix-page .ix-content .req-item > .req-main { grid-area: main; min-width: 0; }
    .ix-page .ix-content .req-item > :nth-child(2) { grid-area: badge; justify-self: start; }
    .ix-page .ix-content .req-item > :nth-child(3) { grid-area: btn; justify-self: end; margin: 0 !important; }
    .ix-page .ix-content .req-item .req-up { height: 32px !important; min-height: 0 !important; padding: 0 12px !important; font-size: 12.5px !important; }
    .ix-page .ix-content .req-item .req-main strong { font-size: 13.5px; }
    .ix-page .ix-content .req-item .req-main small { font-size: 12px; }
  }

  /* ───── page tabs: no box left around a tab after tapping it on a phone ───── */
  .ix-page .grp-tab:focus { outline: none; box-shadow: none; }
  .ix-page .grp-tab:focus-visible { outline: 2px solid #fbd0bc; outline-offset: -2px; border-radius: 8px; }
  @media (hover: none) { .ix-page .grp-tab:hover { background: transparent; } }

  /* ───── DTR picker on a phone: Month + Year side by side, Period full width, button under it ───── */
  @media (max-width: 800px) {
    .ix-page .ix-content .dtr-pick > :nth-child(3) { grid-column: 1 / -1; }
  }

  /* ───── ID card preview: keep the card's own sizes (mm), whatever the page styles say,
     so the photo, name, email and ID number always fit inside the card ───── */
  .ix-page .nfc-card :is(strong, span, small, code, b) { letter-spacing: normal; }
  .ix-page .nfc-card .nfc-card-head strong { font-size: 2.9mm !important; letter-spacing: 0.2mm; }
  .ix-page .nfc-card .nfc-card-head span { font-size: 2mm !important; }
  .ix-page .nfc-card .nfc-role { font-size: 2mm !important; letter-spacing: 0.4mm; }
  .ix-page .nfc-card .nfc-name { font-size: 3.7mm !important; line-height: 1.15 !important; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .ix-page .nfc-card .nfc-mail { font-size: 2.1mm !important; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; word-break: normal; }
  .ix-page .nfc-card .nfc-uid { margin-top: 1.4mm !important; padding: 0.9mm 1.8mm !important; }
  .ix-page .nfc-card .nfc-uid small { font-size: 1.7mm !important; line-height: 1.2; }
  .ix-page .nfc-card .nfc-uid code { font-size: 2.7mm !important; padding: 0 !important; background: none !important; border: 0 !important; line-height: 1.25; }
  .ix-page .nfc-card .nfc-card-foot { font-size: 2.2mm !important; }
  .ix-page .nfc-card .nfc-card-body { overflow: hidden; }
  /* Print ID Cards toolbar on a phone: search on top, then "Select all" and "Print selected" side by side */
  @media (max-width: 700px) {
    .ix-page .ix-content .ix-toolbar:has(~ .nfc-grid) { display: grid !important; grid-template-columns: 1fr 1fr; gap: 8px; }
    .ix-page .ix-content .ix-toolbar:has(~ .nfc-grid) .ix-search { grid-column: 1 / -1; width: 100%; max-width: none; }
    .ix-page .ix-content .ix-toolbar:has(~ .nfc-grid) .ix-b { width: 100%; justify-content: center; margin: 0; }
  }
  /* on a narrow phone the whole card shrinks to fit the screen */
  @media (max-width: 420px) { .ix-page .nfc-item .idc-preview { zoom: .92; } }

  /* ───── easy on the eyes: light grey page, soft off-white cards (no pure white) ─────
     --ix-surface   = cards, panels, header, side menu, inputs
     --ix-surface-2 = small boxes inside a card (time in / time out, etc.)
     Printed pages (DTR, ID cards) are outside .ix-page, so they stay pure white. */
  .ix-page { --ix-surface: #f6f7f9; --ix-surface-2: #eceef2; --ix-page-bg: #e3e6ea; --ix-line: #d9dde3; }
  .ix-page main.ix-main {
    background-color: var(--ix-page-bg) !important;
    background-image: none !important;
  }
  .ix-page .ix-side { background: var(--ix-surface) !important; border-right: 1px solid #d9dde3 !important; }
  .ix-page .ix-nav { background: var(--ix-surface); border-bottom-color: #d9dde3; }
  .ix-page .ix-section, .ix-page .ix-card { border: 1px solid #dde1e6; }
  .ix-page input:not([type=checkbox]):not([type=radio]):not([type=range]), .ix-page select, .ix-page textarea { background-color: #fbfbfc; }

  /* ───── Calendar Management: the form and the event list are the same height;
     the list shows 5 events and scrolls when there are more ───── */
  @media (min-width: 1001px) {
    .ix-page .ix-content .side-split:has(> .adm-cal-list) { align-items: stretch; }
    .ix-page .ix-content .side-split > .adm-cal-form { display: flex; flex-direction: column; }
    .ix-page .ix-content .side-split > .adm-cal-form .ix-form { flex: 1; display: flex; flex-direction: column; }
    .ix-page .ix-content .side-split > .adm-cal-form .cal-desc-field { flex: 1; display: flex; flex-direction: column; }
    .ix-page .ix-content .side-split > .adm-cal-form .cal-desc-field textarea { flex: 1; min-height: 76px; resize: none; }
    .ix-page .ix-content .side-split > .adm-cal-form .adm-cal-actions { margin-top: 16px; }
  }
  .ix-page .ix-content .adm-cal-list { display: flex; flex-direction: column; }
  .ix-page .ix-content .adm-cal-list .ix-table-wrap { height: 352px; overflow-y: auto; }
  .ix-page .ix-content .adm-cal-list .ix-table thead th { position: sticky; top: 0; z-index: 1; background: var(--ix-surface, #fff); }
  .ix-page .ix-content .adm-cal-list .ix-table td { height: 61px; }
  .ix-page .ix-content .adm-cal-list > .ix-empty, .ix-page .ix-content .adm-cal-list > [class*="empty"] { min-height: 352px; display: flex; flex-direction: column; align-items: center; justify-content: center; }

  /* ───── Announcements: the form and the list are the same height; the list shows 5 and scrolls ───── */
  @media (min-width: 1001px) {
    .ix-page .ix-content .side-split:has(> .ann-list-card) { align-items: stretch; }
    .ix-page .ix-content .side-split > .ann-form { display: flex; flex-direction: column; }
    .ix-page .ix-content .side-split > .ann-form .ix-form { flex: 1; display: flex; flex-direction: column; }
    .ix-page .ix-content .side-split > .ann-form .ann-body-field { flex: 1; display: flex; flex-direction: column; }
    .ix-page .ix-content .side-split > .ann-form .ann-body-field textarea { flex: 1; min-height: 120px; resize: none; }
  }
  .ix-page .ix-content .ann-list-card { display: flex; flex-direction: column; }
  .ix-page .ix-content .ann-list-card .ix-table-wrap { height: 392px; overflow-y: auto; }
  .ix-page .ix-content .ann-list-card .ix-table thead th { position: sticky; top: 0; z-index: 1; background: var(--ix-surface, #fff); }
  .ix-page .ix-content .ann-list-card .ix-table td { height: 69px; }
  .ix-page .ix-content .ann-list-card > .ix-empty, .ix-page .ix-content .ann-list-card > [class*="empty"] {
    min-height: 392px; display: flex; flex-direction: column; align-items: center; justify-content: center; }

  /* ───── requirements checklist in an intern's profile ───── */
  .rc-tabs { display: inline-flex; gap: 4px; padding: 3px; background: #f7f1ee; border-radius: 9px; }
  .rc-tab { display: inline-flex; align-items: center; gap: 6px; border: 0; background: transparent; padding: 6px 10px; border-radius: 7px; cursor: pointer;
    font: 600 12px/1 inherit; font-family: inherit; color: #8a7a71; }
  .rc-tab span { font-size: 10.5px; font-weight: 700; color: #a1928a; }
  .rc-tab.on { background: var(--ix-surface, #fff); color: #c2410c; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  .rc-tab.on span { color: #e8582a; }
  .rc-sum { display: flex; align-items: center; gap: 10px; margin: 2px 0 10px; font-size: 12.5px; color: #64748b; }
  .rc-sum strong { color: #1f2937; }
  .rc-bar { flex: 1; max-width: 260px; height: 6px; border-radius: 99px; background: #fbe7dd; overflow: hidden; }
  .rc-bar i { display: block; height: 100%; background: linear-gradient(90deg, #f2864f, #e8582a); border-radius: 99px; }
  .rc-list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 14px; }
  .rc-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid #f3ece8; border-radius: 10px; background: var(--ix-surface, #fff); min-width: 0; }
  .rc-item.none { background: #fffaf7; border-style: dashed; }
  .rc-dot { width: 20px; height: 20px; flex-shrink: 0; border-radius: 50%; display: grid; place-items: center; font-size: 11px; font-weight: 700;
    border: 1.5px solid #d6cbc5; color: #fff; }
  .rc-item.approved .rc-dot { background: #16a34a; border-color: #16a34a; }
  .rc-item.pending .rc-dot { border-color: #f59e0b; background: #fffbeb; }
  .rc-item.rejected .rc-dot { background: #dc2626; border-color: #dc2626; }
  .rc-name { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: 12.5px; font-weight: 600; color: #1f2937; }
  .rc-name small { font-weight: 500; font-size: 11px; color: #b91c1c; }
  @media (max-width: 800px) { .rc-list { grid-template-columns: 1fr; } }
  /* requirements as a status list: icon by status, what happened, View file, status tag */
  .rc-filters { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 10px; }
  .rc-f { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 11px; border-radius: 99px; border: 1px solid #ece6e2; background: var(--ix-surface, #fff);
    font: inherit; font-size: 11.5px; font-weight: 600; color: #6b7280; cursor: pointer; }
  .rc-f b { font-weight: 700; color: #1f2937; }
  .rc-f i { width: 7px; height: 7px; border-radius: 50%; background: #cbd5e1; }
  .rc-f.approved i { background: #16a34a; } .rc-f.pending i { background: #f59e0b; } .rc-f.rejected i { background: #dc2626; }
  .rc-f.on { background: #fff1ea; border-color: #f6c7b0; color: #c2410c; }
  .rc-f:disabled { opacity: .45; cursor: default; }
  .rc-rows { list-style: none; margin: 0; padding: 0; border: 1px solid #f1ece9; border-radius: 12px; overflow: hidden; }
  .rc-row { display: grid; grid-template-columns: 32px minmax(0, 1fr); grid-auto-flow: column; grid-auto-columns: auto; gap: 12px; align-items: center; padding: 9px 14px; background: var(--ix-surface, #fff); }
  .rc-row + .rc-row { border-top: 1px solid #f4f1ee; }
  .rc-ic { width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; background: #f3f4f6; color: #9ca3af; }
  .rc-row.approved .rc-ic { background: #ecfdf3; color: #16a34a; }
  .rc-row.pending .rc-ic { background: #fffbeb; color: #d97706; }
  .rc-row.rejected .rc-ic { background: #fef2f2; color: #dc2626; }
  .rc-txt { min-width: 0; display: flex; flex-direction: column; }
  .rc-txt b { font-size: 12.5px; font-weight: 600; color: #1f2937; }
  .rc-txt small { font-size: 11px; color: #8a7a71; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rc-row.rejected .rc-txt small { color: #b91c1c; white-space: normal; }
  .rc-row.none .rc-txt b { color: #6b7280; }
  .rc-view { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 10px; border-radius: 7px; border: 1px solid #e6e8ec; font-size: 11px; font-weight: 600;
    color: #374151; text-decoration: none; background: var(--ix-surface, #fff); }
  .rc-view:hover { border-color: #e8582a; color: #c2410c; background: #fff7f2; }
  .rc-tag { font-size: 10.5px; font-weight: 700; padding: 3px 9px; border-radius: 6px; white-space: nowrap; min-width: 84px; text-align: center; }
  .rc-tag.approved { background: #dcfce7; color: #15803d; } .rc-tag.pending { background: #fef3c7; color: #b45309; }
  .rc-tag.rejected { background: #fee2e2; color: #b91c1c; } .rc-tag.none { background: #f3f4f6; color: #6b7280; }
  .rc-undo { height: 26px; padding: 0 10px; border-radius: 7px; border: 1px solid #fecaca; background: var(--ix-surface, #fff); color: #b91c1c; font: inherit; font-size: 11px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .rc-undo:hover:not(:disabled) { background: #fef2f2; }
  .rc-undo.yes { background: #dc2626; border-color: #dc2626; color: #fff; }
  .rc-undo.yes:hover:not(:disabled) { background: #b91c1c; }
  .rc-undo-ask { display: inline-flex; gap: 6px; }
  /* intern profile: the requirements as small cards, three per row (not one long list) */
  .rc-rows { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; border: 0; border-radius: 0; overflow: visible; }
  .rc-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 10px 12px; border: 1px solid #ece6e2; border-radius: 10px; min-width: 0; }
  .rc-row + .rc-row { border-top: 1px solid #ece6e2; }
  .rc-row .rc-txt { flex: 1 1 0; }
  .rc-row .rc-txt small { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .rc-row > :is(.rc-tag, .rc-view, .rc-undo, .rc-undo-ask) { flex: 0 0 auto; }
  .rc-row > .rc-tag { margin-left: 42px; min-width: 0; }
  @media (max-width: 1100px) { .rc-rows { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 640px) { .rc-rows { grid-template-columns: 1fr; } }
  .rc-none { padding: 18px; text-align: center; font-size: 12px; color: #8a7a71; border: 1.5px dashed #e5e7eb; border-radius: 12px; }
  @media (max-width: 640px) {
    .rc-row { grid-template-columns: 32px minmax(0, 1fr) auto; grid-auto-flow: row; }
    .rc-row > .rc-tag { grid-column: 3; grid-row: 1; }
    .rc-row > :is(.rc-view, .rc-undo, .rc-undo-ask) { grid-column: 2 / 4; justify-self: start; }
    .rc-tag { min-width: 0; }
  }

  /* ───── calmer colours: neutral greys for table headers, striped rows and info bars;
     orange is kept for buttons, active tabs, icons and status tags ───── */
  .ix-page .ix-content .ix-table thead th { background: #f8f9fb !important; color: #64748b !important; }
  .ix-page .ix-content .ix-table tbody tr:nth-child(even) td { background: var(--ix-surface-2, #fbfbfc) !important; }
  .ix-page .ix-content .ix-section > header { background: var(--ix-surface-2, #fafbfc) !important; border-bottom-color: #eef0f3 !important; }
  .ix-page .ix-content :is(.ix-card, .ix-section, .db-card, .db-kpi) { border-color: #e9ebef !important; }
  .ix-page .ix-content .dl-th { background: #f8f9fb !important; color: #64748b !important; }
  .ix-page .ix-content .dl-item:nth-child(odd) > .dl-tr { background: var(--ix-surface-2, #fbfbfc) !important; }
  .ix-page .ix-content .dl-item.open > .dl-tr { background: #fff6f1 !important; }
  .ix-page .ix-content .dl-table, .ix-page .ix-content .dl-tr { border-color: #eef0f3 !important; }
  .ix-page .ix-content .dl-who { background: var(--ix-surface-2, #fafbfc) !important; border-top-color: #e9ebef !important; }
  .ix-page .ix-content .dl-bar { background: var(--ix-surface, #fff) !important; border: 1px solid #e9ebef !important; color: #475569 !important; }
  .ix-page .ix-content .dl-bar svg { color: #e8582a; }
  .ix-page .ix-content .db-main .ix-section > header,
  .ix-page .ix-content .db-bottom .ix-section > header { background: var(--ix-surface-2, #fafbfc) !important; }
  .ix-page .ix-content .ann-list li, .ix-page .ix-content .ann-list > * { background: var(--ix-surface, #fff) !important; border-color: #eceef2 !important; }

  /* ───── Sidebar (new look): grey text and icons, soft grey highlight, sub-menus with a tree line ───── */
  .ix-page .ix-side { background: var(--ix-surface, #fff) !important; border-right: 1px solid #eceef1 !important; box-shadow: none !important; }
  .ix-page .ix-side-group { display: flex; flex-direction: column; }
  .ix-page .ix-side-item { height: 40px !important; min-height: 40px !important; flex: 0 0 40px !important; margin: 1px 10px !important; padding: 0 10px 0 12px !important;
    gap: 12px !important; border-radius: 10px !important; color: #64748b !important; background: transparent !important; box-shadow: none !important; transform: none !important; }
  .ix-page .ix-side-item::before { display: none !important; }
  .ix-page .ix-side-item .ix-side-icon svg { width: 19px; height: 19px; stroke-width: 1.8; }
  .ix-page .ix-side-label { font-size: 14px !important; font-weight: 500 !important; }
  .ix-page .ix-side-item:hover { background: #fff3ec !important; color: #e8582a !important; }
  .ix-page .ix-side-item.active { background: #fdeadf !important; color: #c2410c !important; }
  .ix-page .ix-side-item.active .ix-side-label { font-weight: 600 !important; }
  /* highlight: light orange on the open page, orange on hover */
  .ix-page .ix-side-item .ix-side-icon { transition: color .15s; }
  .ix-page .ix-side-item:hover .ix-side-icon,
  .ix-page .ix-side-item.active .ix-side-icon { color: #e8582a; }
  .ix-page .ix-side-chev { margin-left: auto; font-size: 17px; line-height: 1; color: #94a3b8; transform: rotate(90deg); transition: transform .2s, opacity .2s; opacity: 0; }
  .ix-page .ix-side.open .ix-side-chev { opacity: 1; }
  .ix-page .ix-side-group.open .ix-side-chev { transform: rotate(-90deg); }
  /* sub-menu with the thin tree line on the left */
  .ix-page .ix-side-sub { position: relative; display: flex; flex-direction: column; gap: 2px; margin: 4px 10px 6px 31px; padding-left: 14px; }
  .ix-page .ix-side-sub::before { content: ""; position: absolute; left: 0; top: 2px; bottom: 2px; width: 1px; background: #e5e7eb; }
  .ix-page .ix-side-subitem { position: relative; text-align: left; border: 0; background: none; cursor: pointer; font-family: inherit; white-space: nowrap;
    padding: 8px 10px; border-radius: 8px; font-size: 13px; font-weight: 500; color: #64748b; }
  .ix-page .ix-side-subitem:hover { background: #fff3ec; color: #e8582a; }
  .ix-page .ix-side-subitem.on { background: #fdeadf; color: #c2410c; font-weight: 600; }
  .ix-page .ix-side-subitem.on::before { content: ""; position: absolute; left: -15px; top: 50%; width: 3px; height: 16px; margin-top: -8px; border-radius: 2px; background: #e8582a; }
  /* "Account" section at the bottom of the list */
  .ix-page .ix-side-sep { height: 1px; background: #eceef1; margin: 10px 16px; flex-shrink: 0; }
  .ix-page .ix-side-section { padding: 2px 22px 6px; font-size: 10.5px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: #94a3b8; white-space: nowrap; }
  .ix-page .ix-side:not(.open) .ix-side-section { text-align: center; padding: 2px 0 6px; font-size: 0; }
  .ix-page .ix-side:not(.open) .ix-side-section::after { content: "•••"; font-size: 9px; letter-spacing: 1px; color: #cbd5e1; }
  /* black tooltip next to an icon when the sidebar is closed */
  .ix-side-tip { position: fixed; z-index: 1000; transform: translateY(-50%); padding: 7px 11px; border-radius: 7px; background: #e8582a; color: #fff;
    font-size: 12.5px; font-weight: 500; white-space: nowrap; pointer-events: none; box-shadow: 0 8px 20px rgba(232,88,42,.3); animation: ix-tip-in .12s ease-out; }
  .ix-side-tip::before { content: ""; position: absolute; left: -4px; top: 50%; width: 8px; height: 8px; margin-top: -4px; background: #e8582a; transform: rotate(45deg); border-radius: 1px; }
  @keyframes ix-tip-in { from { opacity: 0; transform: translate(-4px, -50%); } to { opacity: 1; transform: translateY(-50%); } }
  .ix-page .ix-side-foot { color: #94a3b8 !important; }
  /* the sidebar sits above the sticky page header (z 30), so the name that pops out on hover is never hidden behind it */
  .ix-page .ix-side { z-index: 45 !important; }

  /* long page descriptions stay on one or two tidy lines instead of pushing the "Live" chip down */
  .ix-page .ix-content .ix-ph p { max-width: 900px; }



  /* ═════════════ Layout: dark sidebar on the left, white top bar, roomy pages (all roles) ═════════════ */
  .ix-page.lay2 { --sb-w: 76px; --sb-w-open: 252px; --sb-bg: #9a3412; --sb-bg-2: #7c2d12; --sb-ink: #ffe9de; --sb-mut: #f6c3a8;
    position: relative; background: #eef0f3; }
  .ix-page.lay2 .ix-strip { width: var(--sb-w) !important; }
  .ix-page.lay2 .ix-strip.open { width: var(--sb-w-open) !important; }

  /* sidebar: under the top bar, full height */
  .ix-page.lay2 .ix-side { position: absolute !important; top: 0 !important; bottom: 0 !important; left: 0 !important; z-index: 50 !important;
    width: var(--sb-w) !important; padding: 0 !important; background: var(--sb-bg) !important; border-right: 0 !important;
    box-shadow: none !important; color: var(--sb-ink); display: flex !important; flex-direction: column !important; overflow-x: hidden !important; }
  .ix-page.lay2 .ix-side.open { width: var(--sb-w-open) !important; }
  .ix-page.lay2 .ix-sb-top { flex-shrink: 0; padding: 14px 12px 4px; display: flex; flex-direction: column; gap: 10px; }
  .ix-page.lay2 .ix-sb-search { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 8px 0 10px; border-radius: 8px; cursor: text;
    background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.06); color: var(--sb-mut); }
  .ix-page.lay2 .ix-sb-search:focus-within { border-color: #ffb48f; background: rgba(255,255,255,.1); }
  .ix-page.lay2 .ix-sb-search input { flex: 1; min-width: 0; height: 100%; border: 0 !important; outline: none; background: transparent !important; color: #fff;
    font: inherit; font-size: 13px; padding: 0 !important; box-shadow: none !important; }
  .ix-page.lay2 .ix-sb-search input::placeholder { color: var(--sb-mut); }
  .ix-page.lay2 .ix-sb-search kbd { flex-shrink: 0; font-family: inherit; font-size: 10px; font-weight: 600; line-height: 1.4; padding: 2px 6px; border-radius: 5px;
    background: rgba(255,255,255,.14); color: #ffe9de; }
  .ix-page.lay2 .ix-sb-none { padding: 10px 22px; font-size: 12.5px; color: var(--sb-mut); }
  /* closed sidebar: icons only */
  .ix-page.lay2 .ix-side:not(.open) .ix-sb-top { padding: 14px 0 6px; align-items: center; }
  .ix-page.lay2 .ix-side:not(.open) :is(.ix-sb-search input, .ix-sb-search kbd) { display: none; }
  .ix-page.lay2 .ix-side:not(.open) .ix-sb-search { width: 44px; justify-content: center; padding: 0; cursor: pointer; }

  /* menu rows: full width, darker when open, orange edge on the page you're on */
  .ix-page.lay2 .ix-side .ix-side-menu { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; scrollbar-width: none; padding: 6px 0 8px; }
  .ix-page.lay2 .ix-side .ix-side-menu::-webkit-scrollbar { display: none; }
  .ix-page.lay2 .ix-side .ix-side-item { width: 100% !important; height: 40px !important; min-height: 40px !important; flex: 0 0 40px !important; margin: 0 !important;
    padding: 0 18px 0 24px !important; gap: 13px !important; border-radius: 0 !important; color: var(--sb-ink) !important; background: transparent !important;
    box-shadow: none !important; transform: none !important; }
  .ix-page.lay2 .ix-side:not(.open) .ix-side-item { padding: 0 0 0 calc((var(--sb-w) - 19px) / 2) !important; justify-content: flex-start !important; }
  .ix-page.lay2 .ix-side .ix-side-item .ix-side-icon { color: var(--sb-ink) !important; }
  .ix-page.lay2 .ix-side .ix-side-item .ix-side-icon svg { width: 19px !important; height: 19px !important; }
  .ix-page.lay2 .ix-side .ix-side-label { font-size: 13.5px !important; font-weight: 500 !important; color: inherit !important; letter-spacing: .1px; }
  .ix-page.lay2 .ix-side .ix-side-item:hover { background: rgba(255,255,255,.06) !important; color: #fff !important; }
  .ix-page.lay2 .ix-side .ix-side-item:hover .ix-side-icon { color: #fff !important; }
  .ix-page.lay2 .ix-side .ix-side-item.active { background: var(--sb-bg-2) !important; color: #fff !important; box-shadow: inset 4px 0 0 #ffb48f !important; }
  .ix-page.lay2 .ix-side .ix-side-item.active .ix-side-icon { color: #ffd2bc !important; }
  .ix-page.lay2 .ix-side .ix-side-item.active .ix-side-label { font-weight: 600 !important; }
  .ix-page.lay2 .ix-side .ix-side-item .ix-side-icon svg { stroke-width: 1.7 !important; }
  .ix-page.lay2 .ix-side .ix-side-item:focus-visible { outline: 2px solid #ffd2bc !important; outline-offset: -2px; }
  .ix-page.lay2 .ix-side .ix-side-chev { color: var(--sb-mut) !important; }
  .ix-page.lay2 .ix-side .ix-side-sub { margin: 2px 12px 6px 34px !important; }
  .ix-page.lay2 .ix-side .ix-side-sub::before { background: rgba(255,255,255,.12) !important; }
  .ix-page.lay2 .ix-side .ix-side-subitem { color: var(--sb-mut) !important; background: none !important; font-weight: 500 !important; }
  .ix-page.lay2 .ix-side .ix-side-subitem:hover { color: #fff !important; background: rgba(255,255,255,.05) !important; }
  .ix-page.lay2 .ix-side .ix-side-subitem.on { color: #fff !important; background: rgba(255,255,255,.08) !important; font-weight: 600 !important; }
  .ix-page.lay2 .ix-side .ix-side-subitem.on::before { background: #ffb48f !important; }
  /* pending count on Approvals and its sub-items */
  .ix-page .ix-side-badge { margin-left: auto; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 99px; background: #fff; color: #c2410c;
    font-size: 11.5px; font-weight: 800; line-height: 20px; text-align: center; flex: 0 0 auto; }
  .ix-page .ix-side-badge + .ix-side-chev { margin-left: 6px !important; }
  .ix-page .ix-side-subitem { display: flex !important; align-items: center; gap: 8px; }
  .ix-page .ix-side-badge.sm { min-width: 18px; height: 18px; line-height: 18px; font-size: 11px; background: #f97316; color: #fff; }
  /* sidebar closed: a small dot-count on the icon */
  .ix-page .ix-side-item { position: relative; }
  .ix-page .ix-side:not(.open) .ix-side-badge, .ix-page.side-closed .ix-side-badge { position: absolute; top: 4px; left: 30px; min-width: 16px; height: 16px; line-height: 16px; font-size: 10px; padding: 0 4px; background: #f97316; color: #fff; }
  .ix-page.lay2 .ix-side .ix-side-sep { background: rgba(255,255,255,.1) !important; margin: 10px 20px !important; }
  .ix-page.lay2 .ix-side .ix-side-section { color: var(--sb-mut) !important; padding-left: 24px !important; }
  .ix-page.lay2 .ix-side:not(.open) .ix-side-section { padding-left: 0 !important; }
  .ix-page.lay2 .ix-side:not(.open) .ix-side-section::after { color: var(--sb-mut) !important; }
  .ix-page.lay2 .ix-side :is(.ix-side-profile, .ix-side-foot) { display: none !important; }
  .ix-page.lay2 .ix-sb-bottom { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 14px 12px 22px;
    border-top: 1px solid rgba(255,255,255,.08); }
  .ix-page.lay2 .ix-sb-foot { font-size: 10.5px; font-weight: 600; letter-spacing: .08em; color: var(--sb-mut); white-space: nowrap; }
  .ix-page.lay2 .ix-side:not(.open) .ix-sb-bottom { padding: 10px 0 12px; justify-content: center; }
  .ix-page.lay2 .ix-side:not(.open) .ix-sb-foot { display: none; }
  .ix-page.lay2 .ix-sb-collapse { width: 28px; height: 28px; border-radius: 50%; border: 0; cursor: pointer; display: grid; place-items: center; color: #c2410c;
    background: #fff; box-shadow: 0 4px 12px rgba(0,0,0,.25); transition: transform .3s, background .15s; flex-shrink: 0; }
  .ix-page.lay2 .ix-sb-collapse:hover { background: #ffe9de; }
  .ix-page.lay2 .ix-side:not(.open) .ix-sb-collapse { transform: rotate(180deg); }
  /* compact menu: every page and every drop-down fits without scrolling (a little room left at the bottom) */
  .ix-page.lay2 .ix-side .ix-side-menu { padding: 4px 0 14px !important; }
  .ix-page.lay2 .ix-side .ix-side-item { height: 33px !important; min-height: 33px !important; flex: 0 0 33px !important; gap: 13px !important; }
  .ix-page.lay2 .ix-side .ix-side-item .ix-side-icon svg { width: 18px !important; height: 18px !important; }
  .ix-page.lay2 .ix-side:not(.open) .ix-side-item { padding-left: calc((var(--sb-w) - 18px) / 2) !important; }
  .ix-page.lay2 .ix-side .ix-side-label { font-size: 13.5px !important; }
  .ix-page.lay2 .ix-side .ix-side-sub { margin: 0 12px 4px 34px !important; gap: 1px !important; }
  .ix-page.lay2 .ix-side .ix-side-subitem { height: 28px !important; min-height: 28px !important; padding-top: 0 !important; padding-bottom: 0 !important; font-size: 13px !important; }
  .ix-page.lay2 .ix-side .ix-side-sep { margin: 6px 20px !important; }
  .ix-page.lay2 .ix-side .ix-side-section { padding-top: 0 !important; padding-bottom: 4px !important; }
  .ix-page.lay2 .ix-side:not(.open) .ix-side-badge { top: 1px; }

  /* top bar (same as before): logo, menu and full-screen buttons, then the page name and its tabs */
  .ix-page.lay2 .ix-top-title { flex: 1; min-width: 0; display: flex; align-items: stretch; align-self: stretch; gap: 26px; }
  .ix-page.lay2 .ix-top-title h2 { align-self: center; margin: 0; font-size: 18px; font-weight: 600; color: #111827; white-space: nowrap; letter-spacing: -.2px; }
  .ix-page.lay2 .ix-top-tabs { display: flex; align-items: stretch; min-width: 0; }
  .ix-page.lay2 .ix-top-tabs:empty { display: none; }
  .ix-page.lay2 .ix-top-tabs .grp-tabs { display: flex; align-items: stretch; gap: 4px; margin: 0 !important; box-shadow: none !important; overflow-x: auto; scrollbar-width: none; }
  .ix-page.lay2 .ix-top-tabs .grp-tabs::-webkit-scrollbar { display: none; }
  .ix-page.lay2 .ix-top-tabs .grp-tab { position: relative; height: auto !important; padding: 0 12px !important; display: inline-flex; align-items: center; gap: 7px;
    border: 0; border-radius: 0 !important; background: none !important; color: #4b5563 !important; font-size: 13.5px !important; font-weight: 600 !important; white-space: nowrap; }
  .ix-page.lay2 .ix-top-tabs .grp-tab:hover { color: #111827 !important; }
  .ix-page.lay2 .ix-top-tabs .grp-tab.active { color: #e8582a !important; }
  .ix-page.lay2 .ix-top-tabs .grp-tab::after { content: ""; position: absolute; left: 8px; right: 8px; bottom: 0; height: 3px; border-radius: 3px 3px 0 0; background: transparent; }
  .ix-page.lay2 .ix-top-tabs .grp-tab.active::after { background: #e8582a !important; }
  .ix-page.lay2 .ix-top-tabs .grp-tab svg { width: 15px; height: 15px; }
  .ix-page.lay2 .ix-top-title { margin-left: 10px; padding-left: 16px; border-left: 1px solid #ece4df; }
  /* ───── phones (interns use MYTRACK mostly on their phones) ───── */
  @media (max-width: 700px) {
    /* page description: wrap instead of being cut with "..." */
    .ix-page.lay2 .ix-main .ix-ph .ix-ph-title .ix-ph-text p, .ix-page .ix-ph .ix-ph-text p, .ix-page .ix-main .ix-ph p { white-space: normal !important; overflow: visible !important; text-overflow: clip !important; max-width: none !important; line-height: 1.45 !important; }
    /* tabs that don't fit scroll sideways (e.g. Submit MOV: Pre / During / Post) */
    .ix-page .ix-content .grp-tabs, .ix-page .ix-ph-tabrow .grp-tabs { overflow-x: auto !important; flex-wrap: nowrap !important; scrollbar-width: none; max-width: 100%; }
    .ix-page .ix-content .grp-tabs::-webkit-scrollbar { display: none; }
    .ix-page .grp-tab { flex: none !important; white-space: nowrap; }
    .ix-page .ix-ph-tabrow { overflow: hidden; max-width: 100%; }
    /* number tiles: two per row, the last one full width when the count is odd */
    .ix-page .ix-content .dbx-sum.tiles { grid-template-columns: 1fr 1fr !important; gap: 8px !important; }
    .ix-page .ix-content .dbx-sum.tiles > .dbx-num { padding: 10px 12px !important; column-gap: 10px !important; grid-template-columns: 26px minmax(0, 1fr) !important; }
    .ix-page .ix-content .dbx-sum.tiles > .dbx-num > .dbx-num-ic { width: 26px; height: 26px; }
    .ix-page .ix-content .dbx-sum.tiles > .dbx-num > .dbx-num-ic svg { width: 24px; height: 24px; }
    .ix-page .ix-content .dbx-sum.tiles > .dbx-num:last-child:nth-child(odd) { grid-column: 1 / -1; }
    .ix-page .ix-content .dbx-sum.tiles > .dbx-num > em { white-space: normal !important; }
    .ix-page .ix-content .dbx-sum.tiles > .dbx-num > b { font-size: 18px !important; }
    /* NFC card: the steps and the "can't claim yet" box */
    .ix-page .ix-steps { gap: 4px !important; }
    .ix-page .ix-steps li span { font-size: 10.5px !important; white-space: normal !important; text-align: center; line-height: 1.2; }
    .ix-page .nfc-claim-warn { flex-wrap: wrap !important; }
    .ix-page .nfc-claim-warn > span { flex: 1 1 200px !important; min-width: 0; }
    .ix-page .nfc-claim-warn > :is(button, a) { margin-left: 30px; }
    /* My Requests / inbox lists: the title may wrap above the status */
    .ix-page .mon-item .mon-who b { white-space: normal !important; overflow: visible !important; text-overflow: clip !important; }
  }

  /* colourful number tiles (intern dashboard): each one its own soft colour with an icon */
  .ix-page .ix-content .dbx-sum.tiles { background: none !important; border: 0 !important; box-shadow: none !important; gap: 12px; overflow: visible !important; }
  .ix-page .ix-content .dbx-sum.tiles > .dbx-num { position: relative; display: grid !important; grid-template-columns: 34px minmax(0, 1fr); grid-template-rows: auto auto auto;
    column-gap: 18px; row-gap: 1px; align-content: center; padding: 12px 16px !important; border: 1px solid transparent !important; border-radius: 14px; overflow: hidden;
    background: var(--tbg) !important; border-color: var(--tline) !important; text-align: left; }
  .ix-page .ix-content .dbx-sum.tiles > .dbx-num > .dbx-num-ic { grid-row: 1 / 4; align-self: center; width: 34px; height: 34px; border-radius: 12px; display: grid; place-items: center;
    color: var(--tc); background: none; box-shadow: none; }
  .ix-page .ix-content .dbx-sum.tiles > .dbx-num > .dbx-num-ic svg { width: 30px; height: 30px; stroke-width: 1.8; }
  .ix-page .ix-content .dbx-sum.tiles > .dbx-num > small { grid-column: 2; font-size: 11.5px !important; font-weight: 600; color: var(--tink) !important; opacity: .85; }
  .ix-page .ix-content .dbx-sum.tiles > .dbx-num > b { grid-column: 2; font-size: 20px !important; font-weight: 800 !important; color: var(--tink) !important; line-height: 1.2 !important; }
  .ix-page .ix-content .dbx-sum.tiles > .dbx-num > em { grid-column: 2; font-size: 11px !important; color: #7c6f68 !important; }
  .ix-page .ix-content .dbx-sum.tiles > .dbx-num::after { content: ""; position: absolute; right: -18px; top: -18px; width: 64px; height: 64px; border-radius: 50%; background: var(--tic); opacity: .08; }
  .ix-page .ix-content .dbx-sum.tiles > * + * { border-left: 1px solid var(--tline) !important; }
  .ix-page .ix-content .dbx-sum.tiles > .dbx-num.click:hover { filter: brightness(.98); transform: translateY(-1px); }
  .ix-page .ix-content .dbx-sum.tiles > .dbx-num { transition: transform .15s, filter .15s; }
  .dbx-num.t-orange { --tc: #e8582a; --tbg: #fff4ed; --tline: #fde0cf; --tic: linear-gradient(135deg, #f2864f, #e8582a); --tsh: rgba(232,88,42,.28); --tink: #9a3412; }
  .dbx-num.t-green  { --tc: #16a34a; --tbg: #effaf3; --tline: #cdeedb; --tic: linear-gradient(135deg, #34d399, #16a34a); --tsh: rgba(22,163,74,.25); --tink: #166534; }
  .dbx-num.t-amber  { --tc: #f59e0b; --tbg: #fff9eb; --tline: #fbe7b5; --tic: linear-gradient(135deg, #fbbf24, #f59e0b); --tsh: rgba(245,158,11,.28); --tink: #92400e; }
  .dbx-num.t-blue   { --tc: #2563eb; --tbg: #eff6ff; --tline: #d3e4fd; --tic: linear-gradient(135deg, #60a5fa, #2563eb); --tsh: rgba(37,99,235,.25); --tink: #1e40af; }
  .dbx-num.t-purple { --tc: #7c3aed; --tbg: #f6f1ff; --tline: #e4d8fd; --tic: linear-gradient(135deg, #a78bfa, #7c3aed); --tsh: rgba(124,58,237,.25); --tink: #5b21b6; }
  /* top bar: plain white, same as the CSU logo's background */
  .ix-page.lay2 .ix-nav { background: #fff !important; }
  .ix-page.lay2 .ix-nav .ix-nav-right { margin-left: 0 !important; }

  /* pages: roomy, a big plain heading (no band), clean white cards */
  .ix-page.lay2 .ix-main { padding: 14px 32px 28px !important; background: #eef0f3 !important; background-image: none !important; }
  .ix-page.lay2 :is(.ix-content > .ix-ph, .ix-content > div:first-of-type > div.ix-ph:first-of-type, .ix-content > .dbx > div.ix-ph) {
    position: static !important; top: auto !important; margin: 0 0 14px !important; padding: 0 !important; min-height: 0 !important;
    background: none !important; box-shadow: none !important; clip-path: none !important; align-items: flex-end !important; gap: 16px !important; flex-wrap: wrap !important; }
  .ix-page.lay2 .ix-content .ix-ph .ix-ph-ic { display: none !important; }
  /* the page name is already in the top bar, so the page itself starts with its description (dashboards keep their greeting) */
  .ix-page.lay2 .ix-main :not(.dbx) > .ix-ph h1 { display: none !important; }
  .ix-page.lay2 .ix-main :not(.dbx) > .ix-ph .ix-ph-title { order: 1; flex: 1 1 0 !important; min-width: 0 !important; max-width: none !important; align-self: center; }
  /* the description: one line (the full text shows on hover if the screen is narrow) */
  .ix-page.lay2 .ix-main :not(.dbx) > .ix-ph .ix-ph-text p { font-size: 14px !important; line-height: 1.5 !important; color: #4b5563 !important;
    margin: 0 !important; max-width: none !important; display: block !important; -webkit-line-clamp: unset !important;
    white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }
  @media (max-width: 700px) {
    .ix-page.lay2 .ix-main :not(.dbx) > .ix-ph .ix-ph-text p { white-space: normal !important; overflow: visible !important; text-overflow: clip !important; }
  }
  .ix-page.lay2 .ix-main :not(.dbx) > .ix-ph .ix-ph-text { min-width: 0 !important; max-width: 100% !important; flex: 1 1 auto !important; }
  .ix-page.lay2 .ix-content .ix-ph .ix-ph-right { order: 2; }
  /* tabs: their own row under the description, underlined like the picture */
  .ix-page.lay2 .ix-content .ix-ph .ix-ph-tabrow { order: 3; flex: 1 0 100%; display: flex; align-items: center; gap: 12px; margin-top: 2px;
    box-shadow: inset 0 -1px 0 #dfe3e8; min-width: 0; }
  .ix-page.lay2 .ix-content .ix-ph .ix-ph-tabtools { margin-left: auto; display: flex; align-items: center; gap: 8px; flex-shrink: 0; padding-bottom: 4px; }
  .ix-page.lay2 .ix-content .ix-ph .ix-ph-tabtools:empty { display: none; }
  .ix-page.lay2 .ix-content .ix-ph .ix-ph-tabtools .ix-pills { margin: 0 !important; }
  .ix-page.lay2 .ix-content .ix-ph .grp-tabs { flex: 1 1 auto !important; display: flex !important; align-items: stretch; gap: 6px !important;
    height: auto !important; margin: 0 !important; padding: 0 !important; align-self: stretch !important;
    box-shadow: none !important; overflow-x: auto; scrollbar-width: none; min-width: 0; }
  .ix-page.lay2 .ix-content .ix-ph .grp-tab { height: auto !important; padding: 10px 14px 12px !important; font-size: 14px !important; font-weight: 600 !important;
    color: #4b5563 !important; background: none !important; border-radius: 0 !important; gap: 7px !important; }
  .ix-page.lay2 .ix-content .ix-ph .grp-tab:hover { color: #111827 !important; }
  .ix-page.lay2 .ix-content .ix-ph .grp-tab.active { color: #e8582a !important; }
  .ix-page.lay2 .ix-content .ix-ph .grp-tab.active::after { left: 8px !important; right: 8px !important; height: 3px !important; background: #e8582a !important; }
  .ix-page.lay2 .ix-content .ix-ph .grp-tab svg { width: 15px !important; height: 15px !important; }
  .ix-page.lay2 :is(.ix-content > .ix-ph, .ix-content > div:first-of-type > div.ix-ph:first-of-type, .ix-content > .dbx > div.ix-ph) h1, .ix-page.lay2 .ix-content .ix-ph h1 { font-size: 26px !important; font-weight: 600 !important; letter-spacing: -.4px !important; color: #111827 !important; white-space: normal !important; line-height: 1.2 !important; }
  .ix-page.lay2 :is(.ix-content > .ix-ph, .ix-content > div:first-of-type > div.ix-ph:first-of-type, .ix-content > .dbx > div.ix-ph) p, .ix-page.lay2 .ix-content .ix-ph p { font-size: 14px !important; color: #4b5563 !important; margin-top: 4px !important; -webkit-line-clamp: 2; }
  .ix-page.lay2 .ix-content .ix-ph .ix-ph-right { margin-left: auto; }
  .ix-page.lay2 :is(.ix-card, .ix-section, .mon-split, .ibx-split, .dbx-panel) { border-radius: 12px !important; border: 1px solid #e3e6ea !important;
    box-shadow: 0 1px 2px rgba(16,24,40,.04) !important; }

  /* dashboards: exactly one screen tall on computers; the announcements list scrolls inside its card if it is long */
  @media (min-width: 1251px) {
    .ix-page.lay2 .ix-main:has(.dbx-grid) { padding-bottom: 14px !important; }
    .ix-page.lay2 .ix-main:has(.dbx-grid.has-left.has-right) { display: flex; flex-direction: column; }
    .ix-page.lay2 .ix-main:has(.dbx-grid.has-left.has-right) > .ix-content { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; width: 100%; }
    .ix-page.lay2 .ix-content > .dbx:has(> .dbx-grid.has-left.has-right) { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right { flex: 1 1 auto; height: auto !important; min-height: 380px !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side { min-height: 0; overflow: hidden; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > :last-child { flex: 1 1 auto; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > :last-child > * { flex-shrink: 0; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side .adm-cal { flex-shrink: 0; }
    /* the cards in the left and middle columns share the height; long lists scroll inside their card */
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right { grid-template-rows: auto minmax(0, 1fr) !important; align-content: stretch !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-col:not(.dbx-side) > * { min-height: 0; overflow: hidden; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-col:not(.dbx-side) > :nth-child(2) { overflow-y: auto; }
    .ix-page.lay2 .ix-content > .dbx:has(> .dbx-grid.has-left.has-right) > :not(.dbx-grid) { flex-shrink: 0; }
    /* less space between the date and the number strip */
    .ix-page.lay2 .ix-main .ix-content > .dbx > .ix-ph.ix-ph.ix-ph { margin-bottom: 0 !important; padding-bottom: 0 !important; }
    /* number strip: every box lines up (the clickable ones are buttons and sat higher) */
    .ix-page.lay2 .ix-content .dbx-sum > .dbx-num { justify-content: flex-start !important; align-self: stretch; gap: 2px; }
    .ix-page.lay2 .ix-content .dbx-sum > .dbx-num > * { margin: 0 !important; }
    .ix-page.lay2 .ix-content .dbx-sum > button.dbx-num { line-height: inherit; font-size: inherit; color: inherit; letter-spacing: inherit; }
    /* calendar: a little smaller on short screens so the announcements always fit */
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side .adm-cal-grid { grid-auto-rows: 27px !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side .adm-cal-day { min-height: 27px !important; height: 27px !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side :is(.adm-cal-day, .adm-cal-dow) { padding: 0 !important; box-sizing: border-box !important; line-height: 1 !important; }
    /* the number sits in the middle of its box (the orange "today" box too) */
    .ix-page.lay2 .ix-content .dbx-side .adm-cal-day { display: grid !important; place-items: center !important; place-content: center !important; justify-content: center !important; align-content: center !important; text-align: center !important; position: relative; }
    .ix-page.lay2 .ix-content .dbx-side .adm-cal-day .adm-cal-dot { left: 50% !important; margin-left: -2px; }
    /* Getting started: compact rows so all the steps fit without scrolling */
    .ix-page.lay2 .ix-content .dbx-gs-bar { margin: 8px 14px 2px !important; }
    .ix-page.lay2 .ix-content .dbx-gs-list li { padding: 7px 14px !important; gap: 10px !important; }
    .ix-page.lay2 .ix-content .dbx-gs-list .dbx-tx { gap: 1px !important; line-height: 1.3 !important; }
    .ix-page.lay2 .ix-content .dbx-gs-list .dbx-tx b { font-size: 13px !important; line-height: 1.3 !important; white-space: normal !important; margin: 0 !important; display: -webkit-box !important; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .ix-page.lay2 .ix-content .dbx-gs-list .dbx-tx small { font-size: 11.5px !important; line-height: 1.35 !important; margin: 0 !important; display: -webkit-box !important; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .ix-page.lay2 .ix-content .dbx-gs-list .ix-b.sm { height: 28px !important; padding: 0 12px !important; line-height: 1 !important; }
    /* announcements empty: compact, no big box */
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > .adm-duty:last-child { display: flex !important; flex-direction: column; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > .adm-duty:last-child > .adm-duty-empty { flex: 1 1 auto; min-height: 0 !important; height: auto !important; margin: 10px 0 0 !important; padding: 10px 12px !important; overflow: hidden; gap: 2px; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > .adm-duty:last-child > .adm-duty-empty strong { font-size: 13.5px !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > .adm-duty:last-child > .adm-duty-empty p { margin: 0 !important; font-size: 12px !important; line-height: 1.45 !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > .adm-duty:last-child { min-height: 120px !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > .adm-duty:last-child > .adm-duty-empty { overflow-y: auto; justify-content: center; }
  }
  /* taller screens (full screen): a bigger calendar */
  @media (min-width: 1251px) and (min-height: 800px) {
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side .adm-cal-grid { grid-auto-rows: 33px !important; row-gap: 3px !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side .adm-cal-day { min-height: 33px !important; height: 33px !important; font-size: 13px !important; }
  }
  @media (min-width: 1251px) and (min-height: 960px) {
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side .adm-cal-grid { grid-auto-rows: 40px !important; row-gap: 4px !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side .adm-cal-day { min-height: 40px !important; height: 40px !important; }
    /* calendar and announcements share the column; the calendar never gets smaller than the announcements */
    /* the calendar keeps its own size; the announcements take whatever is left (they never get cut) */
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > .ix-card.adm-cal { flex: 0 0 auto !important; display: flex !important; flex-direction: column; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > .adm-duty:last-child { flex: 1 1 0 !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side .adm-cal-grid { flex: 1 1 auto; grid-template-rows: auto; grid-auto-rows: minmax(30px, 1fr); }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side .adm-cal-day { height: 100% !important; min-height: 30px !important; max-height: 40px; align-self: center; font-size: 12.5px !important; }
    /* the list under a card title scrolls, the title stays */
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right .dbx-card > .dbx-ch { position: sticky; top: 0; z-index: 2; background: var(--ix-surface, #fff); }
    /* smaller calendar so the announcements fit under it */
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > .ix-card.adm-cal { padding: 10px 12px !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side .adm-cal-grid { margin-top: 6px !important; row-gap: 2px !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side .adm-cal-dow { font-size: 10.5px !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side .adm-cal-next { margin-top: 8px !important; padding: 5px 10px !important; }
    /* announcements: the card fills what's left; the header stays, only the list scrolls */
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > .adm-duty:last-child { overflow: hidden !important; padding: 12px 14px !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > .adm-duty:last-child > .adm-duty-head { flex-shrink: 0; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > .adm-duty:last-child > .ann-list { flex: 1 1 auto !important; min-height: 0; overflow-y: auto; margin-top: 10px; gap: 8px; padding-right: 2px; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side .ann-list li { padding: 9px 12px; border-radius: 10px; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side .ann-list li p { -webkit-line-clamp: 2; margin: 2px 0 4px; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side .ann-list li :is(strong, small) { display: block; line-height: 1.35; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side .ann-list li strong { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side .ann-list li p { line-height: 1.45; }
  }

  /* tables: light header row, roomy rows, thin lines */
  .ix-page.lay2 .ix-table thead th { background: #f6f7f9 !important; color: #4b5563 !important; font-size: 12.5px !important; font-weight: 600 !important;
    text-transform: none !important; letter-spacing: 0 !important; padding: 13px 16px !important; border-bottom: 1px solid #e3e6ea !important; }
  .ix-page.lay2 .ix-table tbody td { padding: 15px 16px !important; border-bottom: 1px solid #edf0f3 !important; font-size: 13px; }
  .ix-page.lay2 .ix-table tbody tr:hover td { background: #fafafb !important; }

  /* phones and small tablets: the sidebar slides in over the page */
  @media (max-width: 900px) {
    .ix-page.lay2 .ix-strip, .ix-page.lay2 .ix-strip.open { width: 0 !important; }
    .ix-page.lay2 .ix-side { width: 0 !important; }
    .ix-page.lay2 .ix-side.open { width: var(--sb-w-open) !important; box-shadow: 8px 0 30px rgba(0,0,0,.3) !important; }
    .ix-page.lay2 .ix-top-title { gap: 12px; margin-left: 4px; padding-left: 10px; }
    .ix-page.lay2 .ix-top-title h2 { font-size: 16px; }
    .ix-page.lay2 .ix-main { padding: 18px 14px 32px !important; }
    .ix-page.lay2 :is(.ix-content > .ix-ph, .ix-content > div:first-of-type > div.ix-ph:first-of-type, .ix-content > .dbx > div.ix-ph) h1, .ix-page.lay2 .ix-content .ix-ph h1 { font-size: 21px !important; }
  }
  @media (max-width: 600px) {
    .ix-page.lay2 .ix-top-tabs { display: none; }
    .ix-page.lay2 .ix-acct-name { display: none; }
  }
`;

/* ───────────────────────── styles ───────────────────────── */
const css = `
  .ix-page, .ix-page * { box-sizing: border-box; }
  /* The app is always light. Without this, a computer in dark mode paints the text boxes, dropdowns
     and date pickers dark (index.css has "color-scheme: light dark"). */
  .ix-page, .ix-modal-wrap { color-scheme: light; }
  html, body, #root { height: 100%; width: 100%; margin: 0; }
  .ix-page { font-family: 'Poppins', 'Segoe UI', sans-serif; color: #0f172a; }
  .ix-page h1, .ix-page h2, .ix-page p, .ix-page dl, .ix-page dd { margin: 0; }
  .ix-page button, .ix-page input, .ix-page select, .ix-page textarea { font-family: inherit; }
  /* full screen height (divided by --fit because fit.js zooms the page); no min-height,
     so a short screen never gets a second, grey page scrollbar */
  html, body { overflow: hidden; }
  .ix-page { height: calc(100vh / var(--fit, 1)); display: flex; flex-direction: column; background: #f3f5f7; }

  /* ───── Navbar ───── */
  .ix-nav { height: 75px; flex-shrink: 0; background: var(--ix-surface, #fff); display: flex; align-items: center; gap: 10px; padding: 0 22px 0 15px; position: relative; z-index: 60; box-shadow: 0 4px 14px rgba(15,23,42,0.12); }
  .ix-nav::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 3px; pointer-events: none; background: linear-gradient(90deg, #f2733a, #ffb48f, #f59e0b, #f2733a); background-size: 200% 100%; animation: ix-slide 6s linear infinite; }
  .ix-logo-btn { background: none; border: none; cursor: pointer; display: flex; align-items: center; text-align: left; margin-right: 14px; }
  .ix-nav-logo { height: 36px; width: auto; flex-shrink: 0; }
  .ix-brand-name { display: block; overflow: hidden; white-space: nowrap; max-width: 0; opacity: 0; margin-left: 0; font-size: 11.5px; font-weight: 800; line-height: 1.2; letter-spacing: .8px; color: #0b1220; transition: max-width .35s cubic-bezier(.2,.8,.2,1), opacity .25s, margin-left .35s; }
  .ix-brand-name.show { max-width: 170px; opacity: 1; margin-left: 10px; }
  .ix-icon-btn { background: none; border: none; cursor: pointer; padding: 8px; border-radius: 8px; display: flex; color: #1e293b; transition: background .15s, color .15s; }
  .ix-icon-btn:hover { background: #fdeee7; color: #e8582a; }
  .ix-nav-right { margin-left: auto; display: flex; align-items: center; gap: 6px; }

  /* notifications */
  .ix-notification-wrap { position: relative; }
  .ix-notification-btn { position: relative; width: 40px; height: 40px; border: none; border-radius: 50%; background: none; color: #f97316; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background .15s, color .15s; }
  .ix-notification-btn:hover, .ix-notification-btn[aria-expanded="true"] { background: #fff1e6; color: #ea580c; }
  .ix-notification-btn:focus-visible { outline: 2px solid #e8582a; outline-offset: 2px; }
  .ix-notification-btn:has(.ix-notification-count) svg { animation: ix-ring 3.2s ease-in-out infinite; transform-origin: 50% 10%; }
  .ix-notification-count { position: absolute; top: -5px; right: -5px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 99px; background: #e8582a; color: #fff; font-size: 10px; font-weight: 800; display: flex; align-items: center; justify-content: center; border: 2px solid #fff; animation: ix-pulse 2s ease-out infinite; }
  .ix-notification-dropdown { position: absolute; top: calc(100% + 10px); right: 0; width: 340px; background: var(--ix-surface, #fff); border-radius: 16px; box-shadow: 0 16px 40px rgba(15,23,42,0.15); border: 1px solid #e2e8f0; overflow: hidden; z-index: 100; animation: ix-pop .2s ease-out; }
  .ix-notification-header { display: flex; align-items: center; justify-content: space-between; padding: 15px 16px; border-bottom: 1px solid #f1f5f9; }
  .ix-notification-header strong { font-size: 14px; }
  .ix-notification-header span { font-size: 11px; color: #94a3b8; }
  .ix-notification-all { background: none; border: none; padding: 0; cursor: pointer; font-size: 11.5px; font-weight: 700; color: #e8582a; }
  .ix-notification-all:hover { text-decoration: underline; }
  .ix-notification-list { max-height: 380px; overflow-y: auto; }
  .ix-notification-item { width: 100%; display: flex; align-items: flex-start; gap: 10px; padding: 13px 16px; border: none; border-bottom: 1px solid #f1f5f9; background: #fffaf7; text-align: left; cursor: pointer; font: inherit; transition: background .15s; }
  .ix-notification-item:hover { background: #fff5ef; }
  .ix-notification-item.read { background: var(--ix-surface, #fff); cursor: default; }
  .ix-notification-dot { width: 7px; height: 7px; border-radius: 50%; background: #e8582a; margin-top: 6px; flex-shrink: 0; }
  .ix-notification-item.read .ix-notification-dot { background: #cbd5e1; }
  .ix-notification-content { display: flex; flex-direction: column; min-width: 0; gap: 2px; }
  .ix-notification-content strong { display: block; font-size: 12.5px; color: #1e293b; }
  .ix-notification-content > span { display: block; font-size: 11.5px; line-height: 1.4; color: #64748b; }
  .ix-notification-content small { font-size: 10px; color: #94a3b8; }
  .ix-notification-main.go { cursor: pointer; }
  .ix-notification-open { margin-left: 8px; font-style: normal; font-weight: 600; color: #e8582a; }
  .ix-notification-main.go:hover .ix-notification-open { text-decoration: underline; }
  .ix-no-notifications { padding: 30px 16px; text-align: center; font-size: 12px; color: #94a3b8; }

  .ix-avatar { width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #f2864f, #e8582a); color: #fff; font-weight: 700; font-size: 15px; box-shadow: 0 6px 14px rgba(232,88,42,0.35); }
  /* account button + menu (photo, name, ID, Sign-Out) */
  .ix-acct-wrap { position: relative; }
  .ix-acct-btn { height: 46px; padding: 0 6px 0 14px; border: none; border-radius: 8px; background: none; color: #1f2937; display: flex; align-items: center; gap: 12px; cursor: pointer; font-family: inherit; transition: background .15s, color .15s; }
  .ix-acct-btn:hover, .ix-acct-btn.open { background: #fde3cf; color: #c2410c; }
  .ix-acct-name { font-size: 14.5px; font-weight: 500; white-space: nowrap; max-width: 260px; overflow: hidden; text-overflow: ellipsis; }
  .ix-acct-btn .ix-av { flex-shrink: 0; }
  @media (max-width: 600px) { .ix-acct-name { display: none; } .ix-acct-btn { padding: 0 4px; } }
  .ix-acct-btn:focus-visible, .ix-notification-btn:focus-visible { outline: 2px solid #f97316; outline-offset: 2px; }
  .ix-acct-menu { position: absolute; top: calc(100% + 8px); right: 0; width: 200px; padding: 6px 0; background: var(--ix-surface, #fff); border-radius: 6px; box-shadow: 0 10px 30px rgba(15,23,42,0.16); overflow: hidden; z-index: 100; animation: ix-pop .18s ease-out; }
  .ix-acct-who { display: flex; align-items: center; padding: 12px 16px; border-bottom: 1px solid #e5e7eb; }
  .ix-acct-text { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .ix-acct-text strong { font-size: 13px; font-weight: 600; color: #111827; line-height: 1.3; overflow-wrap: anywhere; }
  .ix-acct-text span { font-size: 12px; color: #6b7280; }
  .ix-acct-text .ix-acct-role { font-size: 10.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: #c2410c; }
  .ix-logout { width: 100%; display: flex; align-items: center; gap: 8px; padding: 10px 16px; border: none; background: none; cursor: pointer; color: #1f2937; font-size: 13px; font-weight: 600; letter-spacing: .02em; text-align: left; transition: background .15s, color .15s; }
  .ix-logout:hover { background: #fff1e6; color: #ea580c; }
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
  .ix-side { width: 64px; padding-top: 12px; background: var(--ix-surface, #fff); border-right: none; box-shadow: none; }
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
  .ix-nav::after { height: 2px; background: #f97316; animation: none; }   /* orange line under the navbar */
  .ix-nav-logo { height: 36px; }

  /* ───── Main ───── */
  .ix-main { flex: 1; min-width: 0; overflow-y: auto; padding: 28px 32px 40px; }
  /* every page uses the full width (up to 1560px), so closing the sidebar never leaves big empty sides */
  .ix-content { max-width: 1560px; margin: 0 auto; animation: ix-rise .45s cubic-bezier(.2,.8,.2,1) backwards; }
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
  .ix-stat { display: flex; align-items: center; gap: 14px; background: var(--ix-surface, #fff); border-radius: 18px; padding: 18px; box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.05); transition: transform .2s, box-shadow .2s; }
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
  .ix-section, .ix-card { background: var(--ix-surface, #fff); border-radius: 20px; box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.05); overflow: hidden; }
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
  .ix-table th { text-align: left; padding: 12px 20px; font-size: 11px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: #94a3b8; background: var(--ix-surface-2, #fafbfc); white-space: nowrap; }
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
  /* My Profile (every role): the portal-style details card, then Account security under it */
  .prof-stack { display: flex; flex-direction: column; gap: 20px; }
  .prof-stack > * { margin: 0; min-width: 0; }
  .ix-content .ix-card.prof-main { position: relative; overflow: hidden; }
  .prof-main .ipv { border-radius: 0; box-shadow: none; }
  .prof-tools { position: absolute; top: 18px; right: 20px; z-index: 2; }
  .ix-content .prof-sec .ix-card.sec-card { margin: 0; padding: 0 0 18px !important; overflow: hidden; }
  .prof-sec .sec-card > :not(.ipv-title):not(.ix-modal-wrap) { margin-left: 18px; margin-right: 18px; }
  .prof-sec .sec-card .ipv-title { margin: 0 0 4px; }
  .prof-sec .sec-row2:first-of-type { border-top: 0; }
  .prof-sec .sec-change { margin-top: 12px; }
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
  .sec-pw input { width: 100%; padding: 14px 44px 14px 14px; border: 1.5px solid #e2e8f0; border-radius: 12px; font-size: 14px; font-family: inherit; background: var(--ix-surface, #fff); color: #0f172a; }
  .sec-pw input::placeholder { color: #94a3b8; }
  /* the browser's saved-password fill would paint it grey/blue: keep it white */
  .sec-pw input:-webkit-autofill, .sec-pw input:-webkit-autofill:hover, .sec-pw input:-webkit-autofill:focus {
    -webkit-box-shadow: 0 0 0 1000px #fff inset !important; -webkit-text-fill-color: #0f172a !important; caret-color: #0f172a;
  }
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
  .ix-b.ghost { background: var(--ix-surface, #fff); border-color: #e2e8f0; color: #475569; }
  .ix-b.ghost:hover:not(:disabled) { border-color: #e8582a; color: #e8582a; background: #fdeee7; }
  .ix-b.danger { background: var(--ix-surface, #fff); border-color: #fca5a5; color: #dc2626; }
  .ix-b.danger:hover:not(:disabled) { background: #fef2f2; }
  .ix-b.ok { background: #16a34a; color: #fff; box-shadow: 0 8px 18px rgba(22,163,74,0.25); }
  .ix-b.ok:hover:not(:disabled) { background: #15803d; }
  .ix-b.sm { padding: 6px 12px; font-size: 12px; border-radius: 8px; }
  .ix-toolbar { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
  .ix-search { display: flex; align-items: center; gap: 8px; padding: 0 14px; background: var(--ix-surface, #fff); border: 1.5px solid #e2e8f0; border-radius: 12px; color: #94a3b8; transition: border-color .15s, box-shadow .15s; min-width: 240px; }
  .ix-search:focus-within { border-color: #e8582a; box-shadow: 0 0 0 4px rgba(232,88,42,0.12); color: #e8582a; }
  .ix-search input { border: none; outline: none; background: transparent; padding: 10px 0; font-size: 13.5px; color: #1e293b; flex: 1; min-width: 0; }
  .ix-input, .ix-select, .ix-field input, .ix-field select, .ix-field textarea { padding: 10px 14px; border: 1.5px solid #e2e8f0; border-radius: 12px; font-size: 13.5px; color: #1e293b; background: var(--ix-surface, #fff); transition: border-color .15s, box-shadow .15s; }
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
  .ix-pill { display: inline-flex; align-items: center; gap: 8px; padding: 7px 18px; border-radius: 99px; border: 1.5px solid #e2e8f0; background: var(--ix-surface, #fff); color: #64748b; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .15s; }
  .ix-pill:hover { border-color: #f5b79f; color: #e8582a; }
  .ix-pill.active { background: linear-gradient(135deg, #f2733a, #e04a1a); border-color: transparent; color: #fff; box-shadow: 0 6px 14px rgba(232,88,42,0.3); }
  .ix-pill:focus-visible { outline: 2px solid #e8582a; outline-offset: 2px; }
  .ix-pill-count { min-width: 20px; padding: 1px 6px; border-radius: 99px; background: #e8582a; color: #fff; font-size: 11px; font-weight: 700; text-align: center; }
  .ix-pill.active .ix-pill-count { background: var(--ix-surface, #fff); color: #e8582a; }
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
  .ix-page .imc-grid { gap: 14px; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
  .ix-page .imc { border: 1px solid #e3e6ea; border-radius: 14px !important; padding: 16px !important; }
  .ix-page .imc .ix-ic-stats { margin: 14px 0 10px !important; }
  .ix-page .imc-bar { height: 6px; border-radius: 99px; background: #f3e5dc; overflow: hidden; }
  .ix-page .imc-bar i { display: block; height: 100%; background: linear-gradient(90deg, #f2864f, #e8582a); border-radius: 99px; }
  .ix-page .imc-detail { display: flex; flex-direction: column; gap: 12px; }
  .ix-page .imc-back { align-self: flex-start; }
  .ix-intern-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; }
  .ix-ic { background: var(--ix-surface, #fff); border-radius: 20px; padding: 18px; box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.05); transition: transform .2s, box-shadow .2s; }
  .ix-ic:hover { transform: translateY(-2px); box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 14px 30px rgba(15,23,42,0.09); }
  .ix-ic.clickable { cursor: pointer; }
  .ix-ic.clickable:focus-visible { outline: 2px solid #e8582a; outline-offset: 2px; }
  .ix-ic.selected { box-shadow: 0 0 0 2px #e8582a, 0 14px 30px rgba(232,88,42,0.18); }
  .ix-ic-top { display: flex; align-items: center; gap: 12px; }
  .ix-ic-id { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .ix-ic-id strong { font-size: 14px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ix-ic-id span { font-size: 12px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ix-ic-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 16px 0; }
  .ix-ic-stats div { background: var(--ix-surface-2, #fafbfc); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; }
  .ix-ic-stats strong { font-size: 15px; font-weight: 800; }
  .ix-ic-stats span { font-size: 11px; color: #94a3b8; }
  .ix-ic-foot { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; padding-top: 14px; border-top: 1px solid #f1f5f9; }
  .ix-ic-foot em { font-size: 12px; color: #94a3b8; font-style: normal; align-self: center; }
  .ix-mini { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 130px; }
  .ix-mini span { font-size: 10.5px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .4px; }
  .ix-mini .ix-select { padding: 8px 10px; font-size: 12.5px; border-radius: 10px; }

  /* ───── Monitor Interns: quick search + inline profile ───── */
  .imp-search-wrap { position: relative; }
  .imp-suggest { position: absolute; top: calc(100% + 6px); left: 0; right: 0; min-width: 280px; z-index: 40; list-style: none; margin: 0; padding: 6px; background: var(--ix-surface, #fff); border: 1px solid #f1e2d9; border-radius: 14px; box-shadow: 0 16px 36px rgba(150,52,20,0.16); animation: ix-pop .15s ease-out; }
  .imp-suggest-item { width: 100%; display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: none; background: none; border-radius: 10px; cursor: pointer; text-align: left; }
  .imp-suggest-item.active, .imp-suggest-item:hover { background: #fff3ec; }
  .imp-suggest-text { display: flex; flex-direction: column; min-width: 0; }
  .imp-suggest-text strong { font-size: 13px; color: #1e293b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .imp-suggest-text small { font-size: 11.5px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .imp-suggest-empty { padding: 12px; font-size: 12.5px; color: #94a3b8; text-align: center; }

  .imp-panel { position: relative; background: var(--ix-surface, #fff); border-radius: 20px; padding: 22px 24px; margin-bottom: 20px; border-top: 4px solid #e8582a; box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 12px 32px rgba(150,52,20,0.10); animation: ix-rise .3s cubic-bezier(.2,.8,.2,1) backwards; }
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
  .imp-edit:focus { outline: none; border-color: #e8582a; background: var(--ix-surface, #fff); box-shadow: 0 0 0 3px rgba(232,88,42,0.12); }
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
  .ix-modal-wrap { position: fixed; inset: 0; z-index: 1000; background: rgba(15,23,42,0.62); backdrop-filter: none; -webkit-backdrop-filter: none; display: flex; align-items: center; justify-content: center; padding: 16px; animation: ix-fade .2s; }
  .ix-modal { background: var(--ix-surface, #fff); border-radius: 22px; width: 100%; max-width: 500px; max-height: 90vh; overflow-y: auto; box-shadow: 0 30px 80px rgba(0,0,0,0.3); border-top: 5px solid #e8582a; animation: ix-pop .25s ease-out; }
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
  .ix-sub { background: var(--ix-surface, #fff); border-radius: 20px; padding: 20px; box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.05); }
  .ix-sub-top { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
  .ix-sub-top .ix-ic-id { flex: 1; }
  .ix-sub-title { font-size: 15px; font-weight: 700; margin-bottom: 10px; }
  .ix-file { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 10px; background: #fff5ef; border: 1px solid #fde1d5; color: #d94a1c; font-size: 13px; font-weight: 600; text-decoration: none; max-width: 100%; }
  .ix-file:hover { background: #fdeee7; }
  .ix-desc-label { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 6px; }
  .ix-desc { font-size: 14px; color: #334155; line-height: 1.6; background: var(--ix-surface-2, #fafbfc); padding: 12px 14px; border-radius: 12px; }
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
  .dtr-set { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .dtr-set select { font: inherit; font-size: 12.5px; padding: 3px 8px; border-radius: 8px; border: 1px solid #f0c9b3; background: #fff7f2; color: #9a3412; font-weight: 600; cursor: pointer; }
  .dtr-set em { font-style: normal; font-size: 11px; font-weight: 600; }
  .dtr-set em.ok { color: #15803d; }
  .dtr-set em.err { color: #dc2626; }
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
  .ipv-cell { background: var(--ix-surface, #fff); padding: 12px 16px; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
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
  .ix-hc { background: var(--ix-surface, #fff); border-radius: 20px; padding: 18px; box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.05); }
  .ix-hc-top { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
  .ix-hc-top .ix-ic-id { flex: 1; }
  .ix-hc-hours { text-align: right; }
  .ix-hc-hours strong { display: block; font-size: 20px; font-weight: 800; color: #e8582a; line-height: 1.1; }
  .ix-hc-hours span { font-size: 11px; color: #94a3b8; }
  .ix-hc-foot { display: flex; justify-content: space-between; font-size: 11.5px; color: #94a3b8; margin-top: 8px; }

  /* ───── DTR preview ───── */
  .ix-doc { background: var(--ix-surface, #fff); border-radius: 20px; padding: 32px; box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.05); }
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
  /* a form on the left, its table on the right, in one row (Announcements, Calendar) */
  .side-split { display: grid; grid-template-columns: minmax(300px, 380px) minmax(0, 1fr); gap: 20px; align-items: start; }
  .side-split > * { min-width: 0; margin: 0; }
  .side-title { margin: 0 0 14px; font-size: 16px; font-weight: 700; color: #111827; }
  .side-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 14px 18px; border-bottom: 1px solid #f1ece9; }
  .side-head .ix-pills { margin: 0; }
  .side-head h3 { margin: 0; font-size: 16px; font-weight: 700; color: #111827; }
  .side-head p { margin: 2px 0 0; font-size: 12.5px; color: #6b7280; }
  .ann-cell { display: flex; flex-direction: column; gap: 2px; min-width: 0; max-width: 420px; }
  .ann-cell strong { font-size: 13.5px; color: #111827; }
  .ann-cell span { font-size: 12.5px; color: #4b5563; white-space: pre-line; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .ann-cell small { font-size: 11.5px; color: #9ca3af; }
  @media (max-width: 1000px) { .side-split { grid-template-columns: 1fr; } }
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
  /* the same profile layout used on a page card (My Profile, Manage Accounts): fill the card edge to edge */
  .ix-content .ix-card:not(.flush) .ipv-modal { margin: -18px -20px -18px; border-top: 0; }

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

  /* ═════ University-portal look for the profile windows (View / Add / Edit user, profiles) ═════
     Each section is a card with a solid orange title bar; details read "Label: Value". */
  .ipv { border-top: 0; background: #f6f2ef; }
  .ipv-modal { border-top: 0; }
  .ipv-head {
    margin: 0; padding: 18px 24px; gap: 18px; border-bottom: 0;
    background: #e8582a;   /* solid orange header */
  }
  .ipv-head-main h2 { color: #fff; font-size: 20px; }
  .ipv-head-sub { color: #fde3cf; }
  .ipv-head-sub strong { color: #fff; }
  .ipv-head-sub span + span::before { background: rgba(255,255,255,.35); }
  .ipv-head .ix-badge { background: rgba(255,255,255,.18); color: #fff; border: 1px solid rgba(255,255,255,.35); }
  .ipv-head .ix-av { box-shadow: 0 0 0 3px rgba(255,255,255,.85); }
  /* Add / Edit: the photo picker stays readable on the orange bar */
  .uf-head { background: #fff7f2; border-bottom: 3px solid #ea580c; }
  .uf-head .ipv-head-main h2 { color: #1f2937; }
  .uf-head .ipv-head-sub { color: #6b7280; }

  .ipv-block {
    margin: 14px 16px; padding: 0; border: 0; border-radius: 10px; overflow: hidden;
    background: var(--ix-surface, #fff); box-shadow: 0 2px 8px rgba(15,23,42,0.06);
  }
  .ipv-block:last-child { margin-bottom: 16px; }
  /* section titles: black text with a short orange underline (only the top header is orange) */
  .ipv-title, .ipv-title-row {
    position: relative; margin: 0; padding: 14px 18px 9px; background: none;
    color: #111827; font-size: 15px; font-weight: 700; letter-spacing: .01em;
    border-bottom: 1px solid #f1e6df;
  }
  .ipv-title::before { display: none; }
  .ipv-title::after {
    content: ""; position: absolute; left: 18px; bottom: -1px; width: 44px; height: 3px;
    border-radius: 3px 3px 0 0; background: #ea580c;
  }
  .ipv-title-row .ipv-title { position: relative; padding: 0; border: 0; }
  .ipv-title-row .ipv-title::after { left: 0; bottom: -10px; }
  .ipv-title-row .ipv-muted { color: #94a3b8; }

  /* details: "Label: Value" in columns, no boxes */
  .ipv-grid { gap: 0; background: none; border: 0; border-radius: 0; padding: 12px 18px 14px; }
  .ipv-grid .ipv-cell { padding: 7px 10px 7px 0; background: none; flex-direction: row; flex-wrap: wrap; align-items: baseline; gap: 0 6px; }
  .ipv-grid .ipv-label { font-size: 13px; font-weight: 400; color: #6b7280; }
  .ipv-grid .ipv-label::after { content: ":"; }
  .ipv-grid .ipv-value { font-size: 13.5px; font-weight: 700; color: #1f2937; }
  /* Monitor Interns profile: name + labelled details, in the middle beside the photo */
  .mon-detail .ipv .ipv-head { display: flex; align-items: center; gap: 20px; padding: 18px 22px; }
  .mon-detail .ipv .ipv-head-main { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; align-items: stretch; gap: 10px; }
  .ipv-name-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .ipv-name-row h2 { margin: 0; font-size: 20px !important; color: #111827 !important; }
  /* the details sit on the orange header: white text */
  .ipv-head .ipv-facts dt, .mon-detail .ipv .ipv-head .ipv-facts dt { color: rgba(255,255,255,.88) !important; }
  .ipv-head .ipv-facts dd, .mon-detail .ipv .ipv-head .ipv-facts dd { color: #fff !important; }
  .ipv-head .ipv-facts .dtr-set select { color: #fff; background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.45); border-radius: 6px; padding: 2px 6px; font: inherit; font-weight: 700; }
  .ipv-head .ipv-facts .dtr-set select option { color: #1f2937; background: #fff; }
  .ipv-head .ipv-facts .dtr-set em { color: #fff !important; font-weight: 500; margin-left: 6px; }
  .ipv-facts { margin: 0; display: grid; grid-template-columns: repeat(4, minmax(0, auto)); justify-content: start; gap: 6px 28px; }
  .ipv-facts > div { min-width: 0; }
  .ipv-facts dt { font-size: 11.5px; font-weight: 500; color: #8a7a71; }
  .ipv-facts dd { margin: 1px 0 0; font-size: 13.5px; font-weight: 700; color: #1f2937; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px; }
  @media (max-width: 1100px) { .ipv-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); } .ipv-facts dd { max-width: none; } }

  /* Today and Contact: the label on top, the value under it, three even columns (no wrapping mid-value) */
  .mon-detail .ipv .ipv-grid.c3 { grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: 18px; padding: 10px 0 6px !important; margin: 0 !important; }
  .mon-detail .ipv .ipv-block:has(> .ipv-grid.c3) > .ipv-title { padding-bottom: 8px; margin-bottom: 0 !important; }
  .mon-detail .ipv .ipv-grid.c3 .ipv-cell { flex-direction: column; align-items: flex-start; gap: 2px; padding: 6px 0; }
  .mon-detail .ipv .ipv-grid.c3 .ipv-label { font-size: 11.5px; color: #8a7a71; }
  .mon-detail .ipv .ipv-grid.c3 .ipv-label::after { content: none; }
  .mon-detail .ipv .ipv-grid.c3 .ipv-value { font-size: 14px; }
  @media (max-width: 640px) { .mon-detail .ipv .ipv-grid.c3 { grid-template-columns: 1fr; } }

  /* attendance summary numbers keep their own look */
  .ipv-grid.ipv-stats { gap: 10px; }
  .ipv-grid.ipv-stats .ipv-cell { flex-direction: column; align-items: flex-start; padding: 10px 12px; background: #fff7f2; border-radius: 8px; }

  /* Add / Edit form: label above a clean input box */
  .ipv-grid .uf-cell { flex-direction: column; align-items: stretch; gap: 5px; padding: 8px 12px 8px 0; cursor: default; }
  .ipv-grid .uf-cell:focus-within { background: none; box-shadow: none; }
  .ipv-grid .uf-cell .ipv-label { font-size: 12.5px; font-weight: 600; color: #374151; }
  .ipv-grid .uf-cell .ipv-label::after { content: ""; }
  .uf-input {
    padding: 8px 10px; border: 1px solid #d6d3d1; border-radius: 6px; background: var(--ix-surface, #fff);
    font-size: 13.5px; font-weight: 500; transition: border-color .15s, box-shadow .15s;
  }
  .uf-input:focus { border-color: #ea580c; box-shadow: 0 0 0 3px rgba(234,88,12,.15); }
  select.uf-input { appearance: auto; }
  .uf-cell .ix-row-gap .uf-input { flex: 1; }
  /* Employee ID: grey "EMP-" box joined to the input */
  .uf-prefix { display: flex; align-items: stretch; }
  .uf-prefix > span { display: flex; align-items: center; padding: 0 10px; border: 1px solid #d6d3d1; border-right: 0; border-radius: 6px 0 0 6px; background: #f5f5f4; color: #57534e; font-size: 13.5px; font-weight: 700; }
  .uf-prefix .uf-input { flex: 1; min-width: 0; border-radius: 0 6px 6px 0; }

  @media (max-width: 700px) {
    .ipv-block { margin: 12px 10px; }
    .ipv-grid { padding: 10px 14px 12px; }
  }

  /* ───── Notification list: red thin scrollbar + delete button ───── */
  .ix-notification-list { scrollbar-width: thin; scrollbar-color: #dc5d26 #fdeae2; }
  .ix-notification-list::-webkit-scrollbar { width: 5px; }
  .ix-notification-list::-webkit-scrollbar-track { background: #fdeee2; border-radius: 99px; }
  .ix-notification-list::-webkit-scrollbar-thumb { background: #dc7526; border-radius: 99px; }
  .ix-notification-list::-webkit-scrollbar-thumb:hover { background: #ec650b; }

  .ix-notification-item { padding: 0; align-items: stretch; cursor: default; }
  .ix-notification-main { flex: 1; min-width: 0; display: flex; align-items: flex-start; gap: 10px; padding: 13px 4px 13px 16px; border: 0; background: none; text-align: left; cursor: pointer; font: inherit; color: inherit; }
  .ix-notification-item.read .ix-notification-main { cursor: default; }
  .ix-notification-x { flex-shrink: 0; align-self: flex-start; margin: 10px 10px 0 0; width: 24px; height: 24px; border: 0; border-radius: 50%; background: transparent; color: #94a3b8; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background .15s, color .15s; }
  .ix-notification-x:hover { background: #fdeee2; color: #dc6c26; }
  .ix-notification-x:focus-visible { outline: 2px solid #dc5726; outline-offset: 1px; }
  .ix-notification-actions { display: flex; align-items: center; gap: 12px; }
  .ix-notification-all.danger { color: #dc5a26; }

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
    .ix-acct-menu { position: fixed; top: 70px; right: 12px; width: min(200px, calc(100vw - 24px)); }
    .ix-notification-dropdown { position: fixed; top: 80px; left: 12px; right: 12px; width: auto; }
    .ix-hero { padding: 22px; }
    .ix-hero h1 { font-size: 22px; }
    .ix-brand-name { font-size: 9.5px; letter-spacing: .4px; }
    .ix-brand-name.show { max-width: 110px; margin-left: 6px; }
    .ix-intern-grid, .ix-hours-grid { grid-template-columns: 1fr; }
    .ix-doc { padding: 20px; }
  }

  /* ───── One scrollbar design for every dashboard (thin, orange) ───── */
  .ix-page, .ix-modal-wrap {
    --sb-thumb: #e8582a;
    --sb-thumb-hover: #d94a1c;
    --sb-track: #fdeee7;
  }

  /* Firefox */
  .ix-page *, .ix-modal-wrap * {
    scrollbar-width: thin;
    scrollbar-color: var(--sb-thumb) var(--sb-track);
  }

  /* Chrome, Edge, Safari */
  .ix-page *::-webkit-scrollbar, .ix-modal-wrap *::-webkit-scrollbar { width: 6px; height: 6px; }
  .ix-page *::-webkit-scrollbar-track, .ix-modal-wrap *::-webkit-scrollbar-track { background: var(--sb-track); border-radius: 99px; }
  .ix-page *::-webkit-scrollbar-thumb, .ix-modal-wrap *::-webkit-scrollbar-thumb { background: var(--sb-thumb); border-radius: 99px; }
  .ix-page *::-webkit-scrollbar-thumb:hover, .ix-modal-wrap *::-webkit-scrollbar-thumb:hover { background: var(--sb-thumb-hover); }
  .ix-page *::-webkit-scrollbar-corner, .ix-modal-wrap *::-webkit-scrollbar-corner { background: transparent; }

  /* ───── Sidebar: the photo/name stay at the top, only the page list scrolls ───── */
  .ix-page .ix-side { overflow: hidden; }
  .ix-page .ix-side-profile, .ix-page .ix-side-foot { flex-shrink: 0; }
  .ix-page .ix-side-foot { margin-top: 0; }

  /* the page list fills the space left and scrolls when the pages don't fit (e.g. the coordinator) */
  .ix-page .ix-side-menu { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; padding: 4px 0 12px; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; }
  /* (no divider line above the menu — the profile block above it was removed) */

  /* every role gets the same 42px rows and 4px gaps (the buttons never squeeze) */
  .ix-page .ix-side-item { flex: 0 0 42px; height: 42px; min-height: 42px; margin: 2px 8px; }
  .ix-page .ix-side-item:last-of-type { margin-bottom: 2px; }

  /* light orange scrollbar on the right of the sidebar list (orange on hover), shown only while the sidebar is open */
  .ix-page .ix-side-menu { scrollbar-width: none; }
  .ix-page .ix-side-menu::-webkit-scrollbar { width: 0; }
  .ix-page .ix-side.open .ix-side-menu { scrollbar-width: thin; scrollbar-color: #f9c9b0 transparent; }
  .ix-page .ix-side.open .ix-side-menu:hover { scrollbar-color: #e8582a transparent; }
  .ix-page .ix-side.open .ix-side-menu::-webkit-scrollbar { width: 6px; }
  .ix-page .ix-side.open .ix-side-menu::-webkit-scrollbar-track { background: transparent; }
  .ix-page .ix-side.open .ix-side-menu::-webkit-scrollbar-thumb { background: #f9c9b0; border-radius: 99px; }
  .ix-page .ix-side.open .ix-side-menu::-webkit-scrollbar-thumb:hover { background: #e8582a; }
  .ix-page .ix-side.open .ix-side-menu::-webkit-scrollbar-button { display: none; height: 0; }

  /* phones: a slimmer sidebar with smaller rows, so it covers less of the page */
  @media (max-width: 600px) {
    .ix-page .ix-side.open { width: 210px !important; }
    .ix-page .ix-side-menu { padding-top: 2px; }
    .ix-page .ix-side-item { height: 36px !important; min-height: 36px !important; flex: 0 0 36px !important; margin: 1px 8px !important;
      padding: 0 10px !important; gap: 10px !important; border-radius: 9px !important; }
    .ix-page .ix-side-item .ix-side-icon svg { width: 17px; height: 17px; }
    .ix-page .ix-side-label { font-size: 13px !important; }
    .ix-page .ix-side-subitem { font-size: 12.5px !important; padding-top: 6px !important; padding-bottom: 6px !important; }
    .ix-page .ix-side-sep { margin: 8px 14px; }
    .ix-page .ix-side-section { padding: 2px 18px 4px; font-size: 10px; }
    .ix-page .ix-side-foot { font-size: 10px; padding-top: 12px; padding-bottom: 12px; }
  }

  /* ───── Denser tables everywhere: more rows fit on one screen ───── */
  @media (min-width: 641px) {
    .ix-page .ix-content .ix-table th { padding: 9px 14px; font-size: 10px; letter-spacing: .07em; }
    .ix-page .ix-content .ix-table td { padding: 7px 14px; font-size: 12.5px; }
    .ix-page .ix-content .ix-table td strong { font-size: 12.5px; }
    .ix-page .ix-content .ix-table td small { font-size: 11px; }
    .ix-page .ix-content .ix-table tbody tr:hover td { background: #fff8f4; }
  }

  /* ───── Monitor Interns: list + details ───── */
  .ix-page .mon-bar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
  .ix-page .mon-search { width: 260px; height: 34px; }
  .ix-page .mon-search input { font-size: 12.5px; }
  .ix-page .mon-chip { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: 99px; cursor: pointer;
    border: 1px dashed #d9dde3; background: var(--ix-surface, #fff); font-family: inherit; font-size: 11.5px; font-weight: 600; line-height: 1; color: #64748b; white-space: nowrap; }
  .ix-page .mon-chip:hover { border-color: #f6c7b0; color: #c2410c; }
  .ix-page .mon-chip.on { border-style: solid; border-color: #f6c7b0; background: #fff3ec; color: #c2410c; }
  .ix-page .mon-sep { width: 1px; height: 20px; background: #e6e8ec; margin: 0 4px; }
  .ix-page .mon-dot { width: 7px; height: 7px; border-radius: 50%; background: #cbd5e1; display: inline-block; flex-shrink: 0; }
  .ix-page .mon-dot.in { background: #22c55e; box-shadow: 0 0 0 3px rgba(34,197,94,.18); }
  .ix-page .mon-split { display: grid; grid-template-columns: 360px minmax(0, 1fr); border: 1px solid #eceef1; border-radius: 16px; background: var(--ix-surface, #fff);
    overflow: hidden; height: calc(100vh / var(--fit, 1) - 210px); min-height: 440px; box-shadow: 0 10px 30px -24px rgba(60,25,10,.45); }
  .ix-page .mon-list { border-right: 1px solid #eceef1; overflow-y: auto; }
  .ix-page .mon-item { position: relative; width: 100%; display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; align-items: center; gap: 10px;
    padding: 9px 14px; border: 0; border-bottom: 1px solid #f4f1ee; background: var(--ix-surface, #fff); text-align: left; cursor: pointer; font-family: inherit; }
  .ix-page .mon-item:hover { background: #fffaf7; }
  .ix-page .mon-item.on { background: #fff3ec; }
  .ix-page .mon-item.on::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: #e8582a; }
  .ix-page .mon-who { display: flex; flex-direction: column; min-width: 0; }
  .ix-page .mon-who b { font-size: 12.5px; font-weight: 600; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ix-page .mon-who small { font-size: 11px; color: #8a7a71; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ix-page .mon-right { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }
  .ix-page .mon-right b { font-size: 12.5px; color: #111827; }
  .ix-page .mon-right small { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: #64748b; white-space: nowrap; }
  .ix-page .mon-detail { overflow-y: auto; min-width: 0; background: var(--ix-surface-2, #fafbfc); }
  .ix-page .mon-detail > .imp-panel { margin: 0 !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; background: transparent !important; padding: 18px 20px !important; }
  .ix-page .mon-detail .ipv-head .imp-close { display: none; }
  .ix-page .mon-detail .ipv-block { padding: 12px 14px !important; margin-top: 10px !important; background: var(--ix-surface, #fff); border: 1px solid #eceef1; border-radius: 12px; }
  /* compact profile on the right */
  .ix-page .mon-detail .ipv-head { padding: 14px 16px !important; border-radius: 12px !important; gap: 14px !important; min-height: 0 !important; }
  .ix-page .mon-detail .ipv-head .ix-av { width: 56px !important; height: 56px !important; font-size: 22px !important; }
  .ix-page .mon-detail .ipv-head h2 { font-size: 18px !important; }
  .ix-page .mon-detail .ipv-head { background: var(--ix-surface, #fff) !important; border: 1px solid #eceef1 !important; box-shadow: none !important; color: #111827 !important; }
  .ix-page .mon-detail .ipv-head h2 { color: #111827 !important; }
  .ix-page .mon-detail .ipv-head-sub, .ix-page .mon-detail .ipv-head-sub * { color: #64748b !important; border-color: #e6e8ec !important; }
  .ix-page .mon-detail .ipv-head-sub strong { color: #111827 !important; }
  .ix-page .mon-detail .ipv-title { font-size: 12.5px !important; margin: 0 0 8px !important; padding: 0 !important; border: 0 !important; }
  .ix-page .mon-detail .ipv-title::after, .ix-page .mon-detail .ipv-title::before { display: none !important; }
  .ix-page .mon-detail .ipv-title-row { margin: 0 0 6px !important; padding: 0 !important; border: 0 !important; }
  .ix-page .mon-detail .ipv-grid { gap: 6px 14px !important; }
  .ix-page .mon-detail .ipv-cell { padding: 0 !important; font-size: 12.5px; }
  .ix-page .mon-detail .ipv-stats .ipv-cell { padding: 8px 10px !important; }
  .ix-page .mon-detail .ipv-stats strong { font-size: 18px !important; }
  .ix-page .mon-empty { height: 100%; display: grid; place-items: center; }
  /* Inbox (review pages): the selected item on the right */
  .ix-page .ibx-split { height: calc(100vh / var(--fit, 1) - 250px); min-height: 380px; }
  .ix-page .ibx + * { margin-top: 16px !important; }
  .ix-page .ann-compose { display: flex; flex-direction: column; gap: 12px; min-height: 100%; flex: 1; }
  .ix-page .ann-compose .ix-field textarea { min-height: 180px; }
  .ix-page .ann-count { font-size: 11.5px; color: #8a7a71; }
  .ix-page .ann-date { font-size: 11px; color: #8a7a71; white-space: nowrap; }
  .ix-page .ibx-ic { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: #fff1ea; color: #e8582a; }
  .ix-page .ibx-ic.past { background: #f3f4f6; color: #9ca3af; }
  .ix-page .ibx-ic.approved { background: #ecfdf3; color: #16a34a; } .ix-page .ibx-ic.rejected { background: #fef2f2; color: #dc2626; }
  .ix-page .grp-tab-n { display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 99px;
    background: #e8582a; color: #fff; font-size: 10.5px; font-weight: 700; }
  /* the count bubble on a tab sits in the middle of the label, never lower */
  .ix-page .grp-tab .grp-tab-n { display: inline-flex !important; align-items: center; justify-content: center; align-self: center;
    height: 18px !important; min-width: 18px; padding: 0 5px !important; margin: 0 !important; line-height: 1 !important;
    position: static !important; transform: none !important; vertical-align: middle; font-size: 10.5px !important; }
  .ix-page .ibx-d { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; min-height: 100%; }
  .ix-page .ibx-head { display: flex; align-items: center; gap: 12px; }
  .ix-page .ibx-head b { display: block; font-size: 16px; color: #111827; }
  .ix-page .ibx-head small { font-size: 12px; color: #8a7a71; }
  .ix-page .ibx-tags { display: flex; gap: 6px; flex-wrap: wrap; }
  .ix-page .ibx-sec { background: var(--ix-surface, #fff); border: 1px solid #eceef1; border-radius: 12px; padding: 12px 14px; }
  .ix-page .ibx-sec > span { display: block; font-size: 10.5px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: #a99d96; margin-bottom: 6px; }
  .ix-page .ibx-sec p { margin: 0; font-size: 13px; line-height: 1.55; color: #334155; white-space: pre-wrap; }
  .ix-page .ibx-kv { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
  .ix-page .ibx-kv div small { display: block; font-size: 11px; color: #8a7a71; }
  .ix-page .ibx-kv div b { font-size: 13.5px; color: #111827; }
  .ix-page .ibx-act { margin-top: auto; position: sticky; bottom: 0; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
    padding: 12px; background: var(--ix-surface, #fff); border: 1px solid #eceef1; border-radius: 12px; box-shadow: 0 -8px 20px -16px rgba(60,25,10,.4); }
  .ix-page .ibx-act .ix-input { flex: 1; min-width: 180px; height: 36px; }
  .ix-page .ibx-act .ot-min { flex: 0 0 110px; min-width: 0; }
  .ix-page .ibx-note { font-size: 12px; padding: 8px 12px; border-radius: 10px; background: #ecfdf3; color: #15803d; }
  .ix-page .ibx-note.none { background: #f6f7f9; color: #64748b; }
  @media (max-width: 900px) { .ix-page .ibx-split { height: auto; min-height: 0; } .ix-page .ibx-act { position: static; } }

  /* Manage Accounts on the right side */
  .ix-page .acc-detail { padding: 14px 18px 18px; }
  .ix-page .acc-detail-bar { display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 10px; }
  .ix-page .acc-detail > .ipv, .ix-page .acc-detail form > .ipv, .ix-page .acc-detail .uf { margin: 0 !important; }
  .ix-page .mon-detail .acc-detail .ipv-block { margin-top: 10px !important; }
  .ix-page .acc-role-tag { font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 6px; background: #f3ede9; color: #6b5b52; white-space: nowrap; }
  .ix-page .acc-role-tag.intern { background: #fff1ea; color: #c2410c; }
  .ix-page .acc-role-tag.supervisor { background: #e8f0ff; color: #2563eb; }
  .ix-page .acc-role-tag.ojt_coordinator { background: #f1ebff; color: #7c3aed; }
  .ix-page .acc-role-tag.admin { background: #e7f8ee; color: #15803d; }
  .ix-page .mon-bar .acc-add { margin-left: auto; }
  .ix-page .mon-back { display: none; }
  @media (max-width: 900px) {
    .ix-page .mon-search { width: 100%; }
    .ix-page .mon-split { grid-template-columns: 1fr; height: auto; min-height: 0; }
    .ix-page .mon-list { border-right: 0; }
    .ix-page .mon-detail { display: none; }
    .ix-page .mon.show-detail .mon-list { display: none; }
    .ix-page .mon.show-detail .mon-detail { display: block; }
    .ix-page .mon-back { display: inline-flex; align-items: center; gap: 6px; margin: 12px 14px 0; padding: 6px 12px; border-radius: 9px;
      border: 1px solid #e6e8ec; background: var(--ix-surface, #fff); font-family: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
    .ix-page .mon-detail > .imp-panel { padding: 12px 14px !important; }
  }

  /* ───── Page header = slim white toolbar across the top (icon · title · tabs · actions) ───── */
  .ix-page :is(.ix-content > .ix-ph, .ix-content > div:first-of-type > div.ix-ph:first-of-type, .ix-content > .dbx > div.ix-ph) {
    position: sticky; top: -28px; z-index: 30; display: flex; align-items: center; flex-wrap: nowrap; gap: 14px;
    min-height: 58px; margin: -28px 0 14px; padding: 0; background: var(--ix-surface, #fff); border: 0 !important;
    box-shadow: 0 0 0 100vmax var(--ix-surface, #fff), 0 1px 0 100vmax var(--ix-line, #eceef1); clip-path: inset(0 -100vmax -1px);
  }
  .ix-page :is(.ix-content > .ix-ph, .ix-content > div:first-of-type > div.ix-ph:first-of-type, .ix-content > .dbx > div.ix-ph) .ix-ph-title { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 0 1 auto; }
  .ix-page :is(.ix-content > .ix-ph, .ix-content > div:first-of-type > div.ix-ph:first-of-type, .ix-content > .dbx > div.ix-ph) .ix-ph-ic { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; flex-shrink: 0;
    background: linear-gradient(135deg, #f2864f, #e8582a); color: #fff; box-shadow: 0 6px 14px -8px rgba(232,88,42,.7); }
  .ix-page :is(.ix-content > .ix-ph, .ix-content > div:first-of-type > div.ix-ph:first-of-type, .ix-content > .dbx > div.ix-ph) .ix-ph-text { min-width: 0; }
  .ix-page :is(.ix-content > .ix-ph, .ix-content > div:first-of-type > div.ix-ph:first-of-type, .ix-content > .dbx > div.ix-ph) h1 { margin: 0; font-size: 16.5px !important; font-weight: 700; letter-spacing: -.2px; line-height: 1.2; white-space: nowrap; color: #111827; }
  .ix-page :is(.ix-content > .ix-ph, .ix-content > div:first-of-type > div.ix-ph:first-of-type, .ix-content > .dbx > div.ix-ph) p { margin: 1px 0 0 !important; font-size: 11.5px !important; color: #8a7a71; max-width: 380px !important;
    white-space: normal; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.35; }
  .ix-page :is(.ix-content > .ix-ph, .ix-content > div:first-of-type > div.ix-ph:first-of-type, .ix-content > .dbx > div.ix-ph) .ix-ph-right { margin-left: auto; flex-shrink: 0; gap: 8px; }
  .ix-page :is(.ix-content > .ix-ph, .ix-content > div:first-of-type > div.ix-ph:first-of-type, .ix-content > .dbx > div.ix-ph) .ix-live { font-size: 11px; }
  /* the Live pill: small and the same height everywhere */
  .ix-page .ix-ph-right .ix-live { height: 26px; padding: 0 10px !important; line-height: 1 !important; box-sizing: border-box; gap: 6px; margin: 0 !important; }
  .ix-page .ix-ph-right .ix-live i { width: 7px; height: 7px; }
  /* the page description line and its Live pill sit on one tidy line */
  .ix-page .ix-content .ix-ph:not(.has-tabs) { align-items: center !important; }
  /* base look of the tabs (also on pages that don't load the admin styles) */
  .ix-page .ix-ph .grp-tabs { display: flex; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; }
  .ix-page .ix-ph .grp-tabs::-webkit-scrollbar { display: none; }
  .ix-page .ix-ph .grp-tab { position: relative; display: inline-flex; align-items: center; flex-shrink: 0; border: none; background: none; cursor: pointer;
    white-space: nowrap; font-family: inherit; font-weight: 600; color: #6b7280; }
  .ix-page .ix-ph .grp-tab:hover, .ix-page .ix-ph .grp-tab.active { color: #ea580c; }
  .ix-page .ix-ph .grp-tab.active::after { content: ""; position: absolute; bottom: 0; border-radius: 3px 3px 0 0; background: #f97316; }
  /* tabs inside the toolbar, underlined at its bottom edge */
  .ix-page :is(.ix-content > .ix-ph, .ix-content > div:first-of-type > div.ix-ph:first-of-type, .ix-content > .dbx > div.ix-ph) .grp-tabs { margin: 0 0 0 10px !important; box-shadow: none !important; align-self: stretch; gap: 2px; min-width: 0; }
  .ix-page :is(.ix-content > .ix-ph, .ix-content > div:first-of-type > div.ix-ph:first-of-type, .ix-content > .dbx > div.ix-ph) .grp-tab { padding: 0 12px; height: 100%; font-size: 12.5px; border-radius: 0; gap: 6px; }
  .ix-page :is(.ix-content > .ix-ph, .ix-content > div:first-of-type > div.ix-ph:first-of-type, .ix-content > .dbx > div.ix-ph) .grp-tab svg { width: 14px; height: 14px; }
  .ix-page :is(.ix-content > .ix-ph, .ix-content > div:first-of-type > div.ix-ph:first-of-type, .ix-content > .dbx > div.ix-ph) .grp-tab:hover { background: transparent; }
  .ix-page :is(.ix-content > .ix-ph, .ix-content > div:first-of-type > div.ix-ph:first-of-type, .ix-content > .dbx > div.ix-ph) .grp-tab.active::after { left: 8px; right: 8px; height: 2.5px; }
  @media (max-width: 900px) {
    .ix-page :is(.ix-content > .ix-ph, .ix-content > div:first-of-type > div.ix-ph:first-of-type, .ix-content > .dbx > div.ix-ph) { top: -20px; margin-top: -20px; flex-wrap: wrap; row-gap: 0; padding-top: 10px; min-height: 0; }
    .ix-page :is(.ix-content > .ix-ph, .ix-content > div:first-of-type > div.ix-ph:first-of-type, .ix-content > .dbx > div.ix-ph) .grp-tabs { order: 3; flex: 1 0 100%; margin: 4px 0 0 !important; height: 40px; overflow-x: auto; }
    .ix-page :is(.ix-content > .ix-ph, .ix-content > div:first-of-type > div.ix-ph:first-of-type, .ix-content > .dbx > div.ix-ph):not(:has(.grp-tabs)) { padding-bottom: 10px; }
    .ix-page :is(.ix-content > .ix-ph, .ix-content > div:first-of-type > div.ix-ph:first-of-type, .ix-content > .dbx > div.ix-ph) p { max-width: 60vw !important; }
  }

`;