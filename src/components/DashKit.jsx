// components/DashKit.jsx
// Shared shell (navbar + sidebar) and UI pieces for the Admin, Coordinator and Intern dashboards.
import { useState, useEffect, useLayoutEffect, useRef, useCallback, createContext, useContext, Fragment } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { useNavigate, useLocation } from "react-router-dom";
import { currentFit } from "../fit.js";
import logo from "../assets/logo.png";

import { API, STORAGE } from "../config.js";
import { fileHref, openFile, useFileLink } from "../files.js";
export const REQUIRED_HOURS = 486; // fallback when an intern has no program set

/* ── Required OJT hours per program (from the OJT coordinator) ── */
export const PROGRAM_HOURS = { BSIT: 486, BSIS: 486, BSCS: 320 };
export const PROGRAMS = Object.keys(PROGRAM_HOURS);
export function programKey(program) {
  const p = String(program || "").toUpperCase();
  if (/BSIT|INFORMATION\s+TECH/.test(p)) return "BSIT";
  if (/BSIS|INFORMATION\s+SYS/.test(p)) return "BSIS";
  if (/BSCS|COMPUTER\s+SCI/.test(p)) return "BSCS";
  return null;
}
// prior = hours already rendered in an earlier term (users.prior_hours): they are taken off
export const requiredHoursFor = (program, prior = 0) => Math.max(0, (PROGRAM_HOURS[programKey(program)] ?? REQUIRED_HOURS) - (Number(prior) || 0));
export const priorHoursOf = (u) => Number(u?.prior_hours) || 0;
// is the System Output Presentation required for this intern? (the HTE decides; the coordinator can change it)
export const outputRequired = (u) => !(u?.output_required === false || u?.output_required === 0 || u?.output_required === "0");
// the requirements of a phase for one intern (no System Output Presentation when the HTE doesn't require it)
// is this weekly / monthly report (from GET /reports) for this intern? Same rule as the server (ReportController::appliesTo)
const hteKey = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
export const reportFor = (rp, u) => !u ? false
  : rp.audience === "programs" ? (rp.programs || []).includes(programKey(u.program))
  : rp.audience === "interns" ? (rp.intern_ids || []).map(Number).includes(Number(u.id))
  : rp.audience === "htes" ? (rp.htes || []).map(hteKey).includes(hteKey(u.placement))
  : true;
export const reqsFor = (phase, u) => (REQUIREMENTS_BY_PHASE[phase] || []).filter((r) => r.key !== "system_output" || !u || outputRequired(u));

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
  if (u?.modality === "virtual") return "Not needed (virtual: Submit Online)";   // a virtual intern never taps
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

/* ── Internship modality and scope (the CCIS internship modalities) ──
   modality: how the internship is done · scope: where the intern / HTE is from. Set by the OJT coordinator. */
export const MODALITIES = { onsite: "On-site", hybrid: "Hybrid", virtual: "Virtual", project: "Project-based" };
// local = a CSU student at an HTE in the Caraga Region · out_of_region = at an HTE elsewhere in the Philippines ·
// inbound = a foreign student interning at CSU ·
// outbound = a CSU student interning with a foreign HTE (abroad, or virtually for a foreign company)
export const SCOPES = { local: "Local", out_of_region: "Out-of-region", inbound: "Inbound", outbound: "Outbound" };
export const SCOPE_HINT = {
  local: "CSU student at an HTE in the Caraga Region",
  out_of_region: "CSU student at an HTE in the Philippines, outside the Caraga Region",
  inbound: "Foreign student interning at CSU",
  outbound: "CSU student with a foreign HTE (abroad or virtual)",
};
export const MODALITY_HINT = {
  onsite: "Times in and out at the kiosk",
  hybrid: "Kiosk on office days, Submit Online on remote days",
  virtual: "Logs every day through Submit Online",
  project: "Works on a project: done when the project is complete (supervisor marks it, coordinator confirms it)",
};
export const modalityOf = (u) => (MODALITIES[u?.modality] ? u.modality : "onsite");
// Is the OJT done? Project-based: when the project is confirmed complete (supervisor marks it, coordinator confirms it),
// even before the required hours. Everyone else: when the rendered hours reach the required hours.
export const ojtComplete = (u, hours) => (modalityOf(u) === "project"
  ? !!u?.project_confirmed_at
  : Number(hours) + 0.0001 >= requiredHoursFor(u?.program, u?.prior_hours));

/* Project status of a project-based intern, on the intern's summary.
   The intern's HTE supervisor marks the project complete; the OJT coordinator (or admin) confirms it. */
export function ProjectStatusField({ u }) {
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true; setSt(null); setErr("");
    fetch(`${API}/interns/${u.id}/project`, { headers: { Accept: "application/json" } })
      .then((r) => r.json()).then((d) => { if (alive && d && "project_based" in d) setSt(d); }).catch(() => {});
    return () => { alive = false; };
  }, [u?.id]);
  let me = {};
  try { me = JSON.parse(sessionStorage.getItem("user") || "{}"); } catch { /* not signed in */ }
  const call = async (method, path) => {
    setBusy(true); setErr("");
    try {
      const res = await fetch(`${API}/interns/${u.id}/project/${path}`, { method, headers: { Accept: "application/json" } });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || "Couldn't save.");
      setSt(d); u.project_marked_at = d.marked_at; u.project_confirmed_at = d.confirmed_at;   // keeps the lists in step
    } catch (e) {
      setErr(e instanceof TypeError ? "Couldn't reach the server." : e.message);
    } finally { setBusy(false); }
  };
  if (!st) return <b>—</b>;
  const isSup = me.role === "supervisor" && Number(u?.supervisor_id) === Number(me.id);
  const isCoord = me.role === "ojt_coordinator" || me.role === "admin";
  const label = st.confirmed_at ? "Project complete" : st.marked_at ? "Marked complete · waiting for the coordinator" : "In progress";
  const btn = (txt, method, path) => (
    <button type="button" className="ix-b ghost sm" disabled={busy} onClick={() => call(method, path)}>{txt}</button>
  );
  return (
    <span className="prj-set">
      <span className={st.confirmed_at ? "uz-chip g" : "uz-chip"} title={st.marked_by_name ? `Marked by ${st.marked_by_name}${st.confirmed_by_name ? `, confirmed by ${st.confirmed_by_name}` : ""}` : "The OJT is complete once the project is done"}>{label}</span>
      {isSup && !st.marked_at && btn("Mark project complete", "POST", "mark")}
      {isSup && st.marked_at && !st.confirmed_at && btn("Undo", "DELETE", "mark")}
      {isCoord && st.marked_at && !st.confirmed_at && btn("Confirm complete", "POST", "confirm")}
      {isCoord && st.confirmed_at && btn("Undo confirmation", "DELETE", "confirm")}
      {err && <em className="err">{err}</em>}
    </span>
  );
}
// the kinds of HTE (the same list as the CCIS quarterly reports, Table 4)
export const HTE_CATEGORIES = ["Government Agency", "Academic / University Office", "Educational Institution", "IT Company", "Private Company / Industry", "Research Center", "Hospital", "NGO", "NGO / Religious", "Utility Service", "Transportation", "Engineering", "Other"];
export const scopeOf = (u) => (u?.scope === "international" ? "outbound" : SCOPES[u?.scope] ? u.scope : "local");

// the coordinator (or admin) changes them right on the intern's summary; everyone else sees the labels
export function PlacementField({ u }) {
  const [v, setV] = useState({ modality: modalityOf(u), scope: scopeOf(u) });
  const [state, setState] = useState("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setV({ modality: modalityOf(u), scope: scopeOf(u) }); setState(""); }, [u?.id]);
  let me = {};
  try { me = JSON.parse(sessionStorage.getItem("user") || "{}"); } catch { /* not signed in */ }
  const canSet = me.role === "ojt_coordinator" || me.role === "admin";
  if (!canSet) return <span className="plc-ro">{MODALITIES[v.modality]} · {SCOPES[v.scope]}</span>;
  const change = (k) => async (e) => {
    const next = { ...v, [k]: e.target.value }, prev = v;
    setV(next); setState("saving");
    try {
      const res = await fetch(`${API}/coordinator/interns/${u.id}/placement`, {
        method: "PATCH", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ [k]: e.target.value }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || "Couldn't save.");
      u[k] = e.target.value; if (d.work_mode) u.work_mode = d.work_mode;   // keeps the list filters in step
      // "Same as the HTE" comes back as the HTE's modality; an exception is marked as the intern's own
      if (k === "modality" && d.modality) { u.modality = d.modality; u.modality_custom = d.modality_custom; setV((x) => ({ ...x, modality: d.modality })); }
      setState("saved");
    } catch (err) {
      setV(prev); setState(err instanceof TypeError ? "Couldn't reach the server." : err.message);
    }
  };
  return (
    <span className="plc-set">
      <select value={v.modality} onChange={change("modality")} disabled={state === "saving"} aria-label="Internship modality" title={MODALITY_HINT[v.modality]}>
        {Object.entries(MODALITIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        <option value="hte">↺ Same as the HTE</option>
      </select>
      {u.modality_custom && Number(u.modality_custom) !== 0 && <em className="plc-own" title="Different from the HTE's modality. Pick “Same as the HTE” to follow it again.">Own</em>}
      <select value={v.scope} onChange={change("scope")} disabled={state === "saving"} aria-label="Internship scope" title={SCOPE_HINT[v.scope]}>
        {Object.entries(SCOPES).map(([k, l]) => <option key={k} value={k} title={SCOPE_HINT[k]}>{l}</option>)}
      </select>
      {state === "saved" && <em className="ok">Saved</em>}
      {state && state !== "saved" && state !== "saving" && <em className="err">{state}</em>}
    </span>
  );
}

/* ── Internship requirements (edit the lists here) ── */
export const PRE_REQUIREMENTS = [
  { key: "capstone_summary", label: "Capstone/Thesis Summary Sheet with Passed Rating", hint: "With a passed rating — proof you may enroll in the internship" },
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
  { key: "insurance", label: "Insurance", hint: "Scanned copy of any insurance (e.g. Palawan Insurance)" },
  { key: "orientation", label: "Deployment Orientation Attendance", hint: "Proof of your attendance at the internship deployment orientation" },
];
// During the internship (weekly / monthly reports can be submitted many times)
export const DURING_REQUIREMENTS = [
  { key: "supervisor_feedback_form", label: "Training Supervisor Feedback Form", hint: "Give it to your HTE supervisor at the start — it is used to monitor and grade you" },
  { key: "weekly_report", label: "Weekly / Monthly Report", hint: "Upload each report your OJT coordinator asks for (she sets the name and the due date)", repeat: true },
  { key: "performance_appraisal", label: "Student Trainee Performance Appraisal", hint: "Your HTE supervisor's final rating, given in your last week" },
];
export const POST_REQUIREMENTS = [
  { key: "certificate_of_completion", label: "Certificate of Completion" },
  { key: "evaluation_forms", label: "Evaluation Forms", hint: "The signed evaluation from your HTE supervisor (scan or clear photo)" },
  { key: "narrative_report", label: "Narrative Report", hint: "Use the prescribed format, written in 3rd person" },
  { key: "dtr", label: "Daily Time Record (DTR)", hint: "Signed copy" },
  { key: "system_output", label: "System Output Presentation", hint: "Proof you presented the system you made, if your HTE required a presentation. If not, describe the system in your narrative report" },
];
export const REQUIREMENTS_BY_PHASE = { pre: PRE_REQUIREMENTS, during: DURING_REQUIREMENTS, post: POST_REQUIREMENTS };
export const PHASE_LABEL = { pre: "Pre-internship", during: "During internship", post: "Post-internship" };

/* The OJT coordinator manages the list (Interns → Requirements → Manage requirements; GET /requirements).
   The lists above are only the starting list: once the server answers, they are filled IN PLACE with the
   coordinator's list, so every page that imported them sees the current requirements.
   Shell loads them once after sign-in, before showing the page. */
export const REQ_EVENT = "mytrack:requirements";
let reqLoad = null;
export function loadRequirements(force = false) {
  if (reqLoad && !force) return reqLoad;
  reqLoad = fetch(`${API}/requirements`, { headers: { Accept: "application/json" }, cache: force ? "no-store" : undefined })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      const got = d?.requirements;
      if (!got || !Array.isArray(got.pre) || !got.pre.length) return false;   // not set up yet: keep the starting list
      Object.entries(REQUIREMENTS_BY_PHASE).forEach(([phase, list]) => {
        const next = (got[phase] || []).map((r) => ({ key: r.key, label: r.label, ...(r.hint ? { hint: r.hint } : {}), ...(r.repeat ? { repeat: true } : {}), id: r.id }));
        list.splice(0, list.length, ...next);
      });
      window.dispatchEvent(new Event(REQ_EVENT));
      return true;
    })
    .catch(() => false);
  return reqLoad;
}

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
const BRAND_LINES = ["CSU CCIS", "OJT"]; // e.g. ["CARAGA STATE", "UNIVERSITY"]

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

// Online = the account's portal was open in the last 3 minutes (the page pings the server every minute)
export const lastSeenMs = (u) => {
  const v = u?.last_seen_at;
  if (!v) return 0;
  const str = String(v).replace(" ", "T");
  const t = new Date(/([zZ]|[+-]\d\d:?\d\d)$/.test(str) ? str : `${str}+08:00`).getTime();
  return Number.isNaN(t) ? 0 : t;
};
export const portalOnline = (u) => { const t = lastSeenMs(u); return t > 0 && Date.now() - t < 3 * 60 * 1000; };
export const seenText = (u) => {
  const t = lastSeenMs(u);
  if (!t) return "Never";
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 3) return "Just now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.floor(m / 60)} h ago`;
  return new Date(t).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
};

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
  heart: <path d="M12 20s-7-4.4-9.3-8.8A5.2 5.2 0 0 1 12 6.3a5.2 5.2 0 0 1 9.3 4.9C19 15.6 12 20 12 20z" />,
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
  chevronLeft: <path d="M15 6l-6 6 6 6" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
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

// a private image (a staff signature): shown once the server gives its short-lived link
function PrivateImg({ path, alt }) {
  const src = useFileLink(path);
  return src ? <img src={src} alt={alt} /> : <b>…</b>;
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
        {file && <button type="button" title="Remove photo" aria-label="Remove photo" onClick={() => { setErr(null); onChange(null); }}>Remove photo</button>}
        {err && <em>{err}</em>}
      </div>
    </div>
  );
}

// `actions` = optional buttons shown beside the X (e.g. an Edit button); `wide` = bigger window
/* Ask before doing something (instead of the browser's own confirm box), in the same pop-up design as the rest:
     if (!(await confirmBox({ title: "Delete this day?", message: "...", ok: "Yes, delete", danger: true }))) return;
   Resolves true for the main button, false for Cancel / Esc / clicking outside. */
const CONFIRM_CSS = `
/* above side panels and other pop-ups: the question is always on top */
.ix-modal-wrap:has(.cf-btns) { z-index: 10000 !important; }
.cf-msg { margin: 0; font-size: 14px; line-height: 1.55; color: #4b5563; white-space: pre-line; }
.cf-btns { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
`;
function ConfirmBox({ title, message, ok, cancel, danger, onDone }) {
  return (
    <Modal title={title} onClose={() => onDone(false)}>
      <style>{CONFIRM_CSS}</style>
      {message && <p className="cf-msg">{message}</p>}
      <div className="cf-btns">
        <button type="button" className="ix-b ghost" onClick={() => onDone(false)}>{cancel}</button>
        <button type="button" className={danger ? "ix-b danger" : "ix-b primary"} autoFocus onClick={() => onDone(true)}>{ok}</button>
      </div>
    </Modal>
  );
}
export function confirmBox({ title = "Are you sure?", message = "", ok = "Yes", cancel = "Cancel", danger = false } = {}) {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const onDone = (v) => { root.unmount(); host.remove(); resolve(v); };
    root.render(<ConfirmBox title={title} message={message} ok={ok} cancel={cancel} danger={danger} onDone={onDone} />);
  });
}

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
/* wide: room for a document preview (review queues) */
.ix-drawer.wide { width: min(680px, 46vw, calc(100vw - 24px)); min-width: min(520px, calc(100vw - 24px)); }
.ix-drawer-head { display: flex; align-items: center; gap: 14px; padding: 16px 20px 14px; border-bottom: 1px solid #eef0f3; }
.ix-drawer-ico { width: 46px; height: 46px; flex-shrink: 0; border-radius: 50%; display: grid; place-items: center; background: #fff3ec; color: #e8582a; border: 1px solid #fbe0d2; }
.ix-drawer-ttl { flex: 1; min-width: 0; }
.ix-drawer-act { display: flex; align-items: center; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-right: 4px; }
@media (max-width: 640px) { .ix-drawer-head { flex-wrap: wrap; } .ix-drawer-act { order: 3; flex-basis: 100%; justify-content: flex-start; margin: 2px 0 0; } }
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
export function Drawer({ title, kicker, sub, icon = "calendar", onClose, footer, inPage, actions = null, wide = false, children }) {
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
      <aside className={wide ? "ix-drawer wide" : "ix-drawer"} role="dialog" aria-modal="true" aria-label={title}>
        <header className="ix-drawer-head">
          <span className="ix-drawer-ico"><Icon name={icon} size={20} /></span>
          <div className="ix-drawer-ttl">{kicker && <small>{kicker}</small>}<h2>{title}</h2></div>
          {actions && <div className="ix-drawer-act">{actions}</div>}
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
      if (np.length < 8) { setErr("New password must be at least 8 characters."); return; }
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
      <h3 className="ipv-title"><span>Account security</span></h3>
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
   Every requirement of the phase with its status: Approved / Waiting / Returned / Not submitted. */
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
        setReports(d.filter((rp) => reportFor(rp, { ...(intern || {}), id: internId })));   // program, HTE or picked interns
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
  const list = reqsFor(phase, intern);
  const approvedIn = (ph) => reqsFor(ph, intern).filter((r) => r.key === "weekly_report"
    ? reports.length > 0 && reports.every((rp) => (movs || []).find((x) => Number(x.report_id) === Number(rp.id))?.status === "approved")
    : statusOf(r.key, ph)?.status === "approved").length;
  const LABEL = { approved: "Approved", pending: "Waiting", rejected: "Returned" };

  return (
    <div className="ipv-block">
      <div className="ipv-title-row">
        <h3 className="ipv-title">Requirements</h3>
        <div className="rc-tabs">
          {["pre", "during", "post"].map((ph) => (
            <button key={ph} type="button" className={phase === ph ? "rc-tab on" : "rc-tab"} onClick={() => setPhase(ph)}>
              {PHASE_LABEL[ph].replace("-internship", "").replace(" internship", "")}
              {movs && <span>{approvedIn(ph)}/{reqsFor(ph, intern).length}</span>}
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
                    {/* the server sends a file only to who may open it: the coordinator (every file),
                        an HTE supervisor (only the feedback form, the appraisal and the evaluation forms of their interns) */}
                    {m?.file_path && (
                      <a className="rc-view" href={fileHref(m.file_path)} onClick={(e) => openFile(m.file_path, e)} target="_blank" rel="noopener noreferrer" title={m.original_name || "Open file"}>
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

/* Requirements at a glance: Pre / During / Post side by side, one line per requirement with its status. */
const RQD_CSS = `
.rqd-sec { margin-bottom: 16px; }
.rqd-sec h4 { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin: 0 0 6px; font-size: 12px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #c2410c; }
.rqd-sec h4 small { font-size: 12px; font-weight: 600; letter-spacing: 0; text-transform: none; color: #6b7280; }
.rqd-sec ul { list-style: none; margin: 0; padding: 0; border: 1px solid #eef0f4; border-radius: 12px; overflow: hidden; }
.rqd-sec li { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-bottom: 1px solid #f3f4f6; }
.rqd-sec li:last-child { border-bottom: 0; }
.rqd-name { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: 13px; color: #111827; }
.rqd-name small { font-size: 11.5px; color: #6b7280; margin-top: 1px; } .rqd-name small.bad { color: #b91c1c; }
.rqd-st { flex: none; padding: 3px 9px; border-radius: 8px; font-size: 12px; font-weight: 700; white-space: nowrap; }
.rqd-st.approved { background: #dcfce7; color: #15803d; } .rqd-st.pending { background: #fef3c7; color: #b45309; }
.rqd-st.rejected { background: #fee2e2; color: #b91c1c; } .rqd-st.none { background: #f3f4f6; color: #6b7280; }
.ix-page a.rqd-view, .ix-page a.rqd-view:hover { flex: none; display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 10px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 12px; font-weight: 600; color: #374151; text-decoration: none !important; background: #fff; }
.ix-page a.rqd-view:hover { border-color: #f6c7b0; color: #c2410c; }
.rqd-note { display: flex; align-items: center; gap: 6px; margin: 4px 0 0; font-size: 12px; color: #6b7280; }
`;

function RequirementsBoard({ internId, intern, canViewFiles = false, onReviewFiles = null, compact = false }) {
  const [movs, setMovs] = useState(null);
  const [reports, setReports] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    setMovs(null);
    fetch(`${API}/staff/interns/${internId}/requirements`, { headers: { Accept: "application/json" } })
      .then((r) => r.json()).then((d) => { if (alive) setMovs(Array.isArray(d) ? d : []); })
      .catch(() => { if (alive) setMovs([]); });
    fetch(`${API}/reports`, { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !Array.isArray(d)) return;
        setReports(d.filter((rp) => reportFor(rp, { ...(intern || {}), id: internId })));   // program, HTE or picked interns
      }).catch(() => {});
    return () => { alive = false; };
  }, [internId, intern?.program, open]);

  const statusOf = (key, ph) => (movs || []).find((m) => m.requirement === key && (m.phase || "pre") === ph)?.status || "none";
  const stateOf = (r, ph) => {
    if (r.key !== "weekly_report") return statusOf(r.key, ph);
    if (!reports.length) return "none";
    const st = reports.map((rp) => (movs || []).find((x) => Number(x.report_id) === Number(rp.id))?.status || "none");
    return st.every((s) => s === "approved") ? "approved" : st.includes("rejected") ? "rejected" : st.includes("pending") ? "pending" : "none";
  };
  const ICON = { approved: "check", pending: "clock", rejected: "warn", none: "file" };
  const phases = ["pre", "during", "post"].map((ph) => {
    const rows = reqsFor(ph, intern).map((r) => ({ r, st: stateOf(r, ph) }));
    return { ph, rows, ok: rows.filter((x) => x.st === "approved").length };
  });
  const totalAll = phases.reduce((s, p) => s + p.rows.length, 0);
  const okAll = phases.reduce((s, p) => s + p.ok, 0);
  const cnt = { approved: 0, pending: 0, rejected: 0, none: 0 };
  phases.forEach((p) => p.rows.forEach((x) => { cnt[x.st] += 1; }));

  const sumRow = (ph) => {
    const rows = phases.find((x) => x.ph === ph).rows;
    const ok = rows.filter((x) => x.st === "approved").length;
    const wait = rows.filter((x) => x.st === "pending").length;
    return { ph, total: rows.length, ok, wait, miss: rows.length - ok - wait };
  };
  const sums = ["pre", "during", "post"].map(sumRow);
  const missAll = totalAll - okAll - cnt.pending;
  const openFiles = () => (onReviewFiles ? onReviewFiles() : setOpen(true));
  // "View requirements": a slide-in panel, the same list as the coordinator's checklist (Interns → Requirements):
  // one section per phase, each requirement with its status in words, the date, the remarks, and View when the file may be opened
  const RQD_WORD = { approved: "Approved", pending: "Waiting for review", rejected: "Returned", none: "Not submitted" };
  const latestOf = (key, ph) => (movs || []).find((m) => m.requirement === key && (m.phase || "pre") === ph);
  const rqdDay = (v) => (v ? new Date(String(v).replace(" ", "T")).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "");
  const detailModal = open && (
    <Drawer inPage icon="folder" kicker={[intern?.student_id, programKey(intern?.program)].filter(Boolean).join(" · ") || "Requirements"}
      title={intern?.name || "Requirements"} sub={`${okAll} of ${totalAll} requirements approved`} onClose={() => setOpen(false)}>
      <style>{RQD_CSS}</style>
      {!movs ? <Spinner /> : phases.map((p) => (
        <section key={p.ph} className="rqd-sec">
          <h4>{PHASE_LABEL[p.ph]} <small>{p.ok} of {p.rows.length} approved</small></h4>
          <ul>
            {p.rows.map(({ r, st }) => {
              const m = r.key === "weekly_report" ? null : latestOf(r.key, p.ph);
              const repOk = r.key === "weekly_report" ? reports.filter((rp) => (movs || []).find((x) => Number(x.report_id) === Number(rp.id))?.status === "approved").length : 0;
              return (
                <li key={r.key}>
                  <span className="rqd-name">{r.label}
                    {r.key === "weekly_report" ? <small>{reports.length ? `${repOk} of ${reports.length} reports approved` : "No report asked yet"}</small>
                      : st === "rejected" && m?.remarks ? <small className="bad">Returned: {m.remarks}</small>
                      : m?.created_at ? <small>Sent {rqdDay(m.created_at)}</small> : null}
                  </span>
                  {m?.file_path && (
                    <a className="rqd-view" href={fileHref(m.file_path)} onClick={(e) => openFile(m.file_path, e)} target="_blank" rel="noopener noreferrer" title={m.original_name || "Open file"}>
                      <Icon name="eye" size={13} /> View</a>
                  )}
                  <span className={`rqd-st ${st}`}>{RQD_WORD[st]}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {!canViewFiles && <p className="rqd-note"><Icon name="lock" size={12} /> Personal documents (medical, consent, contract…) are only opened by the OJT coordinator.</p>}
    </Drawer>
  );

  // the intern profile's summary card: a plain section
  if (compact) return (
    <div className="uz-sec ipx-req">
      <div className="uz-sh"><h3>Requirements</h3>{movs && <em>{okAll}/{totalAll} approved</em>}</div>
      {!movs ? <Spinner /> : (
        <div className="ipx-phs">
          {sums.map((r) => {
            const pct = r.total ? Math.round((r.ok / r.total) * 100) : 0;
            const done = r.miss === 0 && r.wait === 0;
            return (
              <div className="ipx-ph" key={r.ph}>
                <div className="ipx-ph-t">
                  <span>{PHASE_LABEL[r.ph]}</span>
                  <b className={done ? "ok" : r.miss > 0 ? "bad" : "wait"}>
                    {r.ok}/{r.total}{r.wait > 0 ? ` · ${r.wait} waiting` : ""}{r.miss > 0 ? ` · ${r.miss} missing` : ""}
                  </b>
                </div>
                <div className="ipx-bar"><i className={done ? "ok" : ""} style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
        </div>
      )}
      <button type="button" className="ix-b ghost sm uz-wide" onClick={openFiles}>{canViewFiles ? "Review submitted files" : "View requirements"}</button>
      {detailModal}
    </div>
  );

  return (
    <div className="ipa-sect ipa-reqb">
      <div className="ipa-sh"><b>Requirements</b><em>{movs ? `${okAll} of ${totalAll} approved` : ""}</em>
        <button type="button" className="ipa-lk" onClick={openFiles}>{canViewFiles ? "Review files ›" : "Details ›"}</button></div>
      {!movs ? <Spinner /> : (
        <table className="ipa-tb"><thead><tr><th>Phase</th><th>Approved</th><th>Waiting</th><th>Status</th></tr></thead>
          <tbody>
            {sums.map((r) => (
              <tr key={r.ph}>
                <td>{PHASE_LABEL[r.ph]}</td>
                <td><b>{r.ok}</b> / {r.total}</td>
                <td>{r.wait || "—"}</td>
                <td>{r.miss > 0 ? <span className="ipa-ch bad">{r.miss} missing</span> : <span className="ipa-ch ok">Complete</span>}</td>
              </tr>
            ))}
          </tbody></table>
      )}
      {detailModal}
    </div>
  );
}

/* a date as "April 17, 2003" */
const ipxDate = (v) => {
  if (!v) return null;
  const d = new Date(String(v).slice(0, 10) + "T00:00:00");
  return isNaN(d) ? String(v) : d.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
};
function InternProfile({ u, records, today, onClose, onViewRecords, onReviewFiles = null, canViewFiles = false }) {
  const recs = records.filter((r) => r.user_id === u.id);
  const isIn = recs.some((r) => r.date === today && r.uid !== "ONLINE" && r.action === "CHECK_IN" && !r.checked_out_at);
  const days = [...new Set(recs.map((r) => r.date))].length;
  const total = calcHours(recs);
  const required = requiredHoursFor(u.program, u.prior_hours);
  const pct = Math.min(Math.round((total / required) * 100), 100);
  const left = Math.max(Math.round((required - total) * 10) / 10, 0);
  const onsite = recs.filter((r) => r.uid !== "ONLINE").length;
  const online = recs.filter((r) => r.uid === "ONLINE").length;
  const studentId = u.student_id || u.student_number || "—";

  const todaySessions = sessionsByDate(recs.filter((r) => r.date === today))[today] || [];
  const tIn = todaySessions[0]?.in;
  const tOut = [...todaySessions].reverse().find((s) => s.out)?.out;
  const lastDate = recs.map((r) => r.date).sort().pop();
  const firstDate = recs.map((r) => r.date).sort()[0];
  const fmtDate = (d) => {
    const x = new Date(d + "T00:00:00");
    return isNaN(x) ? d : x.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  };
  const emergencyWho = [u.emergency_contact_name, u.emergency_contact_relation && `(${u.emergency_contact_relation})`]
    .filter(Boolean).join(" ");

  // school-event (excused) days of this intern
  const [excused, setExcused] = useState({});
  useEffect(() => {
    let alive = true;
    fetch(`${API}/excused-days?user_id=${u.id}`, { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((list) => {
        if (!alive || !Array.isArray(list)) return;
        const map = {};
        list.forEach((e) => { map[String(e.date).slice(0, 10)] = e.event_name || "Excused"; });
        setExcused(map);
      }).catch(() => {});
    return () => { alive = false; };
  }, [u.id]);

  const week = (() => {
    const base = new Date(today + "T00:00:00");
    const dow = (base.getDay() + 6) % 7;
    return ["Mon", "Tue", "Wed", "Thu", "Fri"].map((lbl, i) => {
      const d = new Date(base); d.setDate(base.getDate() - dow + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const dayRecs = recs.filter((r) => r.date === key);
      const h = calcHours(dayRecs);
      const ss = sessionsByDate(dayRecs)[key] || [];
      const first = ss[0]?.in;
      const lastOut = [...ss].reverse().find((s) => s.out)?.out;
      const state = dayRecs.length ? "present" : excused[key] ? "excused" : key > today ? "future" : key === today ? "wait" : "none";
      return { lbl, key, h: Math.round(h * 10) / 10, first, lastOut, state, ev: excused[key], num: d.getDate(), isToday: key === today };
    });
  })();
  const weekTotal = Math.round(week.reduce((s, w) => s + w.h, 0) * 10) / 10;
  const short = (t) => (t ? fmtTime(t).replace(/:\d{2}(?=\s?[AP]M)/i, "") : "—");
  const STATE_TXT = { none: "No record", future: "—", wait: "Not in yet" };


  const over = Math.round((total - required) * 10) / 10;
  const bday = u.date_of_birth
    ? new Date(String(u.date_of_birth).slice(0, 10) + "T00:00:00").toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })
    : null;
  const isOnline = portalOnline(u);
  const field = (k, v, wide) => (
    <div className={wide ? "ipx-f w2" : "ipx-f"} key={k}><small>{k}</small><b>{v || "—"}</b></div>
  );
  const DAY_TXT = { present: "Present", excused: "Excused", none: "No record", wait: "Not in yet", future: "Upcoming" };

  const v = (k, val, full) => (
    <div className={full ? "uz-f full" : "uz-f"} key={k}><small>{k}</small><b>{val || "—"}</b></div>
  );

  return (
    <section className="uz uz-view uz-mon" aria-label={`Profile of ${u.name}`}>
      <style>{IPX_CSS + UZ_CSS}</style>
      <div className="uz-body three">
        {/* LEFT: photo and quick facts */}
        <aside className="uz-side">
          <div className="uz-photo"><Avatar name={u.name} photo={u.photo} size={180} /></div>
          <div className="uz-nm"><b>{u.name}</b><small>#{studentId}</small></div>
          <div className="uz-meta">
            <div className="uz-f"><small>Role</small><span className="uz-chip">OJT Intern</span></div>
            <div className="uz-f"><small>Status</small>
              <span className={isOnline ? "uz-st" : "uz-st off"}><i />{isOnline ? "Online now" : `Offline · ${seenText(u)}`}</span></div>
            <div className="uz-f"><small>NFC card</small><b>{u.nfc_uid ? "Linked" : "No card yet"}</b></div>
            {modalityOf(u) === "project"
              ? <div className="uz-f"><small>Project</small><ProjectStatusField u={u} /></div>
              : pct >= 100 && <div className="uz-f"><small>Hours</small><span className="uz-chip g">Hours complete</span></div>}
            {onViewRecords && <button type="button" className="ix-b ghost sm uz-wide" onClick={onViewRecords}><Icon name="list" size={14} /> View records</button>}
          </div>
        </aside>

        {/* MIDDLE: the intern's information */}
        <div className="uz-card">
          <div className="uz-sec">
            <div className="uz-sh"><h3>Personal details</h3></div>
            <div className="uz-grid">
              {v("Student ID", studentId)}
              {v("Birthday", bday)}
              {v("Phone", u.contact_number)}
              {v("Email", u.email)}
              {v("Address", u.address, true)}
            </div>
          </div>
          <div className="uz-sec">
            <div className="uz-sh"><h3>Internship details</h3></div>
            <div className="uz-grid">
              {v("Placement (HTE)", u.placement || "No placement yet")}
              {v("HTE supervisor", u.supervisor_name || "Not assigned yet")}
              {v("Program", u.program)}
              {v("Semester", u.semester)}
              {v("Modality", MODALITIES[modalityOf(u)])}
              {v("Scope", SCOPES[scopeOf(u)])}
              {v("Time record (DTR)", dtrModeOf(u) === "four" ? "4 taps (AM/PM)" : "2 taps (in and out)")}
              {v("Required hours", `${required} hours`)}
              {v("College", u.college || "CCIS")}
              {v("First day", firstDate ? fmtDate(firstDate) : "No records yet")}
            </div>
          </div>
          <div className="uz-sec">
            <div className="uz-sh"><h3>Emergency contact</h3>
              {u.emergency_contact_number && <a className="ix-b ghost sm" href={`tel:${u.emergency_contact_number}`}>Call</a>}</div>
            <div className="uz-grid">
              {v("Full name", u.emergency_contact_name || "Not set")}
              {v("Relationship", u.emergency_contact_relation)}
              {v("Contact number", u.emergency_contact_number)}
              {v("Address", u.emergency_contact_address)}
            </div>
          </div>
        </div>

        {/* RIGHT: attendance summary */}
        <div className="uz-card uz-sum">
          <div className="uz-sec">
            <div className="uz-sh"><h3>Attendance</h3>
              {onViewRecords && <button type="button" className="ipa-lk" onClick={onViewRecords}>All records ›</button>}</div>
            <div className="ipx-ring">
              <Ring pct={pct} size={54} stroke={7} track="#fbe3d6" color="#e8582a"><strong>{pct}%</strong></Ring>
              <div>
                <b>{total}h <em>/ {required}h</em></b>
                {over > 0 ? <small className="ok">+{over}h beyond required</small> : <small>{left}h left</small>}
              </div>
            </div>
            <div className="ipx-mini">
              <div><b>{days}</b>present</div>
              <div><b>{onsite}</b>on-site</div>
              <div><b>{online}</b>online</div>
            </div>
          </div>

          <div className="uz-sec">
            <div className="uz-sh"><h3>This week</h3><em>{weekTotal}h so far</em></div>
            <div className="ipx-today"><span>Today · In <b>{tIn ? short(tIn) : "—"}</b></span><span>Out <b>{isIn ? "Still in" : tOut ? short(tOut) : "—"}</b></span></div>
            <div className="ipx-week">
              {week.map((w) => (
                <div key={w.key} className={`ipx-day ${w.state}${w.isToday ? " today" : ""}`} title={w.ev || DAY_TXT[w.state]}>
                  <small>{w.lbl}</small>
                  <b>{w.num}</b>
                  {w.state === "present" ? <em>{w.h}h</em> : <i aria-label={DAY_TXT[w.state]} />}
                </div>
              ))}
            </div>
            <div className="ipx-last">Last record · {lastDate ? fmtDate(lastDate) : "none yet"}</div>
          </div>

          <RequirementsBoard internId={u.id} intern={u} canViewFiles={canViewFiles} onReviewFiles={onReviewFiles} compact />
        </div>
      </div>
    </section>
  );
}

const IPA_CSS = `
.ipa { display: flex; flex-direction: column; gap: 14px; }
.ipa-card { background: #fff; border: 1px solid #e7e9ee; border-radius: 14px; min-width: 0; padding: 0; overflow: hidden; box-shadow: 0 1px 2px rgba(16,24,40,.04), 0 10px 22px -16px rgba(16,24,40,.22); }
.ipa-card-h { display: flex; align-items: center; gap: 12px; padding: 0 20px; min-height: 56px; background: linear-gradient(90deg, #d94f1e, #e8582a 60%, #ef6a3a); color: #fff; }
.ipa-card-h h3 { margin: 0; margin-right: auto; display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 600; color: #fff; }
.ipa-card-h h3 > span { display: inline-block; }
.ipa-muted { font-size: 12.5px; color: rgba(255,255,255,.88); }
.ipa-btn { height: 32px; padding: 0 14px; border: 1px solid rgba(255,255,255,.75); border-radius: 8px; background: transparent; color: #fff; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.ipa-btn:hover { background: rgba(255,255,255,.18); }
/* record card */
.ipa-rb { display: grid; grid-template-columns: minmax(270px, 1.15fr) repeat(3, minmax(0, 1fr)); }
.ipa-rb > * { border-left: 1px solid #eef0f3; min-width: 0; }
.ipa-rb > *:first-child { border-left: 0; }
.ipa-idb { display: flex; gap: 16px; align-items: center; padding: 18px 20px; background: linear-gradient(135deg, #fff8f4 0%, #fff 70%); }
.ipa-idb .ix-av { box-shadow: 0 0 0 3px #fff, 0 0 0 5px #f6c9b3 !important; }
.ipa-idb .ix-av { flex: none; }
.ipa-idb .ix-av img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
.ipa-idt { min-width: 0; }
.ipa-idt h2 { margin: 0; font-size: 17px; font-weight: 700; color: #1f2430; line-height: 1.25; overflow-wrap: anywhere; }
.ipa-sub { font-size: 12.5px; color: #6b7280; margin-top: 2px; overflow-wrap: anywhere; }
.ipa-pill { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 600; padding: 3px 11px; border-radius: 999px; margin-top: 8px; }
.ipa-pill i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.ipa-pill.in { background: #e6f7ee; color: #15803d; }
.ipa-pill.out { background: #fff4e0; color: #b45309; }
.ipa-pill.done { background: #eef2ff; color: #4338ca; }
.ipa-tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.ipa-tiles > div { padding: 12px 14px; border-left: 1px solid #eef0f3; min-width: 0; }
.ipa-tiles > div:first-child { border-left: 0; }
.ipa-tiles small { display: block; font-size: 11.5px; color: #6b7280; }
.ipa-tiles b { font-size: 13px; font-weight: 700; color: #1f2430; }
.ipa-blk { padding: 16px 18px 10px; }
.ipa-sec { font-size: 10.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #9aa1ad; margin-bottom: 2px; }
.ipa-rows { display: flex; flex-direction: column; }
.ipa-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 10px 0; border-top: 1px solid #eef0f3; min-width: 0; }
.ipa-row:first-child { border-top: 0; }
.ipa-row > span { font-size: 12.5px; color: #6b7280; flex: none; }
.ipa-row > div { text-align: right; font-weight: 600; font-size: 13px; color: #1f2430; min-width: 0; overflow-wrap: anywhere; display: flex; flex-direction: column; align-items: flex-end; }
.ipa-row small { font-weight: 500; color: #6b7280; font-size: 12.5px; }
.plc-set { display: flex; align-items: center; justify-content: flex-end; gap: 6px; flex-wrap: wrap; }
.plc-set select, .ipa-dtr .dtr-set select { font: inherit; font-size: 12.5px; font-weight: 600; height: 30px; padding: 0 8px; border-radius: 8px; border: 1px solid #e3e5ea; background: #fff; color: #1f2430; cursor: pointer; max-width: 100%; }
.ipa-dtr .dtr-set { display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap; }
.plc-set em { font-style: normal; font-size: 11.5px; font-weight: 700; } .plc-set em.ok { color: #15803d; } .plc-set em.err { color: #b91c1c; }
.plc-set em.plc-own { padding: 2px 8px; border-radius: 99px; background: #eef2ff; color: #4338ca; }
.plc-ro { font-weight: 600; }
/* right side */
.ipa-ii { display: grid; grid-template-columns: 176px minmax(0, 1fr); gap: 22px; align-items: stretch; background: #fff; border: 1px solid #e7e9ee; border-radius: 14px; padding: 16px; box-shadow: 0 1px 2px rgba(16,24,40,.04), 0 10px 22px -16px rgba(16,24,40,.22); }
.ipa-photo { width: 176px; min-height: 190px; border-radius: 12px 12px 56px 56px; overflow: hidden; border: 2px solid #f1b99f; background: #fde3d6; box-sizing: border-box; align-self: stretch; }
.ipa-photo .ix-av { width: 100% !important; height: 100% !important; min-height: 186px; border-radius: 0 !important; box-shadow: none !important; border: 0 !important; background: #fde3d6 !important; font-size: 60px !important; overflow: hidden; }
.ipa-photo .ix-av img { width: 100%; height: 100%; object-fit: cover; border-radius: 0 !important; }
.ipa-iic { min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.ipa-iih { display: flex; align-items: center; gap: 10px; height: 42px; padding: 0 16px; border-radius: 9px; background: #97351a; color: #fff; font-size: 16px; font-weight: 600; }
.ipa-iih .ipa-pill { margin: 0 0 0 auto; padding: 3px 11px; background: #fff; }
.ipa-nm { padding: 0 4px; }
.ipa-nm h2 { margin: 0; font-size: 22px; font-weight: 700; color: #1f2430; line-height: 1.25; }
.ipa-nm span { display: block; margin-top: 2px; font-size: 13px; color: #6b7280; }
.ipa-fg { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-top: 1px solid #eef0f3; margin-top: auto; }
.ipa-fg > div { padding: 12px 4px 4px 14px; border-left: 1px solid #eef0f3; min-width: 0; }
.ipa-fg > div:nth-child(4n+1) { border-left: 0; padding-left: 4px; }
.ipa-fg > div:nth-child(n+5) { border-top: 1px solid #eef0f3; }
.ipa-fg small { display: block; font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: #9aa1ad; margin-bottom: 2px; }
.ipa-fg b { font-size: 14px; font-weight: 600; color: #1f2430; overflow-wrap: anywhere; }
.ipa-fg em { display: block; font-style: normal; font-size: 12px; color: #6b7280; }
.ipa-pill u { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: currentColor; text-decoration: none; }
@media (max-width: 900px) { .ipa-ii { grid-template-columns: 1fr; } .ipa-photo { width: 140px; min-height: 150px; } .ipa-fg { grid-template-columns: repeat(2, minmax(0, 1fr)); } .ipa-fg > div:nth-child(n) { border-left: 0; padding-left: 4px; } }
.ipa-hs { margin-left: 8px; font-style: normal; font-size: 12.5px; font-weight: 500; opacity: .9; }
.ipa-phases { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; padding: 14px 18px 16px; }
.ipa-ph { border: 1px solid #e7e9ee; border-radius: 12px; padding: 12px 14px; background: #fafbfc; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.ipa-ph-t { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; font-size: 13px; font-weight: 600; color: #1f2430; }
.ipa-ph-t b { font-size: 20px; color: #1f2430; } .ipa-ph-t small { font-size: 12px; color: #6b7280; font-weight: 500; }
.ipa-ph-c { display: flex; gap: 6px; flex-wrap: wrap; }
@media (max-width: 800px) { .ipa-phases { grid-template-columns: 1fr; } }
.ipa-info { display: flex; gap: 26px; align-items: flex-start; padding: 22px 24px; }
.ipa-info .ix-av { flex: none; box-shadow: 0 0 0 3px #fff, 0 0 0 5px #f6c9b3 !important; }
.ipa-info .ix-av img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
.ipa-grid { flex: 1; min-width: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px 28px; font-size: 13.5px; }
.ipa-grid > div { min-width: 0; overflow-wrap: anywhere; line-height: 1.5; }
.ipa-grid > div.wide { grid-column: span 2; }
.ipa-grid i { font-style: normal; color: #6b7280; }
.ipa-grid b { color: #1f2430; font-weight: 700; }
.ipa-pill u { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: currentColor; text-decoration: none; }
.ipa-grid .ipa-pill { margin-top: 0; padding: 2px 10px; }
@media (max-width: 1250px) { .ipa-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 700px) { .ipa-info { flex-direction: column; } .ipa-grid { grid-template-columns: 1fr; } .ipa-grid > div.wide { grid-column: auto; } }
.ipa-two { display: contents; }
.ipa-main { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 14px; align-items: stretch; }
.ipa-two > .ipa-card:first-child { order: 1; }
.ipa-main > .ipa-card { order: 2; }
.ipa-two > .ipa-card:last-child { order: 3; grid-column: 1 / -1; }
@media (max-width: 1250px) { .ipa-main { grid-template-columns: 1fr; } }
.ipa-prog { padding: 16px 18px 0; }
.ipa-prog-row { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; font-size: 13px; color: #6b7280; margin-bottom: 8px; }
.ipa-prog-row b { color: #1f2430; }
.ipa-bar { height: 10px; border-radius: 9px; background: #f1ece8; overflow: hidden; }
.ipa-bar i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #f08a5d, #e8582a); }
.ipa-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 16px 18px 18px; border: 1px solid #e7e9ee; border-radius: 12px; background: #fafbfc; }
.ipa-stats > div { display: flex; gap: 11px; align-items: center; padding: 12px 14px; border-left: 1px solid #e7e9ee; min-width: 0; }
.ipa-stats > div:first-child { border-left: 0; }
.ipa-ic { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; flex: none; background: #fdeee5; color: #e8582a; }
.ipa-ic.b { background: #e8f0ff; color: #2f5fd0; } .ipa-ic.v { background: #f1eaff; color: #6d3fc4; } .ipa-ic.g { background: #e6f7ee; color: #15803d; }
.ipa-ic svg { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
.ipa-stats b { display: block; font-size: 20px; font-weight: 700; color: #1f2430; line-height: 1.1; }
.ipa-stats small { font-size: 12px; color: #6b7280; }
.ipa-week { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; padding: 16px 18px 18px; }
.ipa-day { border: 1px solid #e7e9ee; border-radius: 12px; padding: 12px 13px; display: flex; flex-direction: column; gap: 6px; min-width: 0; background: #f7f8fa; }
.ipa-day-top { display: flex; align-items: baseline; justify-content: space-between; }
.ipa-day-top small { font-size: 11px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; color: #6b7280; }
.ipa-day-top em { font-style: normal; font-size: 11.5px; font-weight: 600; color: #6b7280; }
.ipa-day strong { font-size: 22px; font-weight: 700; line-height: 1; color: #1f2430; }
.ipa-day strong u { text-decoration: none; font-size: 13px; font-weight: 600; margin-left: 1px; }
.ipa-day strong.txt { font-size: 13px; font-weight: 600; color: #1f2430; padding: 4px 0 2px; }
.ipa-day-bar { height: 5px; border-radius: 3px; background: #eef0f3; overflow: hidden; }
.ipa-day-bar i { display: block; height: 100%; background: #2e9e43; border-radius: inherit; }
.ipa-day-time { font-size: 11px; font-weight: 600; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ipa-day.present { border-color: #cfe9d4; background: #f0faf2; } .ipa-day.present strong { color: #15803d; }
.ipa-day.excused { border-color: #dccaf7; background: #f5efff; } .ipa-day.excused strong, .ipa-day.excused .ipa-day-time { color: #6d3fc4; }
.ipa-day.today { border-color: #e8582a; background: #fdeee5; }
.ipa-day.future strong { color: #9ca3af; }
/* ── sidebar profile (reference style) ── */
.ipa.ipa2 { display: grid; grid-template-columns: clamp(300px, 26vw, 380px) minmax(0, 1fr); gap: 0; background: #fff; border: 1px solid #e7e9ee; border-radius: 14px; overflow: hidden; box-shadow: 0 1px 2px rgba(16,24,40,.04), 0 10px 22px -16px rgba(16,24,40,.22); }
.ipa-side { padding: 18px 20px; border-right: 1px solid #e7e9ee; min-width: 0; }
.ipa-p1 { display: flex; gap: 14px; align-items: center; margin-bottom: 14px; }
.ipa-phw { flex: none; width: 76px; height: 76px; border-radius: 14px; padding: 0; border: 0; overflow: hidden; background: #fde3d6; }
.ipa-phw .ix-av { width: 100% !important; height: 100% !important; border-radius: 0 !important; border: 0 !important; box-shadow: none !important; background: #fde3d6 !important; }
.ipa-phw .ix-av img { width: 100%; height: 100%; object-fit: cover; border-radius: 0 !important; }
.ipa-pn { min-width: 0; display: flex; flex-direction: column; gap: 2px; align-items: flex-start; }
.ipa-pn h2 { margin: 0; font-size: 16px; font-weight: 700; color: #1f2430; line-height: 1.25; overflow-wrap: anywhere; }
.ipa-id { font-size: 12px; color: #6b7280; }
.ipa-pn .ipa-pill { margin-top: 4px; }
.ipa-side h4 { margin: 12px 0 6px; font-size: 13px; font-weight: 700; color: #1f2430; }
.ipa-side hr { border: 0; border-top: 1px solid #e7e9ee; margin: 12px 0 0; }
.ipa-li { display: flex; gap: 6px; padding: 3px 0; font-size: 12.5px; line-height: 1.35; }
.ipa-li i { font-style: normal; color: #6b7280; flex: none; width: 84px; }
.ipa-li b { font-weight: 600; color: #1f2430; overflow-wrap: anywhere; word-break: break-word; min-width: 0; flex: 1; }
.ipa-rt { padding: 6px 22px 12px; min-width: 0; display: flex; flex-direction: column; }
.ipa-sect { padding: 14px 0 6px; }
.ipa-sect + .ipa-sect { border-top: 1px solid #eef0f3; }
.ipa-sh { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; }
.ipa-sh b { font-size: 14.5px; font-weight: 600; color: #1f2430; }
.ipa-sh em { font-style: normal; font-size: 12px; color: #6b7280; }
.ipa-lk { margin-left: auto; border: 0; background: none; padding: 0; font: inherit; font-size: 12.5px; font-weight: 600; color: #e8582a; cursor: pointer; }
.ipa-lk:hover { text-decoration: underline; }
.ipa-sum { font-size: 12.5px; color: #6b7280; }
.ipa-sum b { color: #1f2430; font-weight: 600; }
.ipa-dot { display: inline-block; width: 3px; height: 3px; border-radius: 50%; background: #c4c8cf; margin: 0 8px; vertical-align: middle; }
.ipa-sect .ipa-bar { margin-top: 8px; height: 7px; }
.ipa-tb { width: 100%; border-collapse: collapse; }
.ipa-tb th { text-align: left; font-size: 10.5px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: #9aa1ad; padding: 7px 8px 7px 0; border-bottom: 1px solid #e7e9ee; }
.ipa-tb td { padding: 8px 8px 8px 0; border-bottom: 1px solid #f0f1f4; font-size: 12.5px; color: #1f2430; }
.ipa-tb tr:last-child td { border-bottom: 0; }
.ipa-tb tr.today td { font-weight: 600; background: #fff8f4; }
.ipa-ch { display: inline-block; border-radius: 99px; padding: 1px 10px; font-size: 11.5px; font-weight: 600; }
.ipa-ch.ok { background: #e6f7ee; color: #15803d; } .ipa-ch.bad { background: #fdeaea; color: #b91c1c; } .ipa-ch.ex { background: #f1eaff; color: #6d3fc4; }
.ipa-pill.off { background: #f1f2f4; color: #6b7280; }
.ipa-phw .ix-av, .ipa-phw .ix-av::before, .ipa-phw .ix-av::after { outline: 0 !important; border: 0 !important; box-shadow: none !important; }
@media (max-width: 900px) { .ipa.ipa2 { grid-template-columns: 1fr; } .ipa-side { border-right: 0; border-bottom: 1px solid #e7e9ee; } }
/* compact pass */
.ipa-main, .ipa-page { gap: 10px !important; }
.ipa-ii { grid-template-columns: 128px minmax(0, 1fr); gap: 16px; padding: 12px; }
.ipa-photo { width: 128px; min-height: 0; border-radius: 10px 10px 40px 40px; }
.ipa-photo .ix-av { min-height: 0; }
.ipa-iic { gap: 6px; }
.ipa-iih { height: 34px; font-size: 14.5px; border-radius: 8px; }
.ipa-nm h2 { font-size: 18px; }
.ipa-nm span { font-size: 12.5px; margin-top: 0; }
.ipa-fg > div { padding: 7px 4px 3px 12px; }
.ipa-fg > div:nth-child(4n+1) { padding-left: 4px; }
.ipa-fg small { font-size: 10.5px; margin-bottom: 1px; }
.ipa-fg b { font-size: 13px; }
.ipa-fg em { font-size: 11.5px; }
.ipa-card-h { min-height: 40px; padding: 0 16px; }
.ipa-card-h h3 { font-size: 14.5px; }
.ipa-btn { height: 26px; font-size: 11.5px; padding: 0 11px; }
.ipa-week { padding: 10px 12px 12px; gap: 6px; }
.ipa-day { padding: 8px 9px; gap: 4px; border-radius: 9px; }
.ipa-day strong { font-size: 17px; }
.ipa-day strong.txt { font-size: 12px; padding: 2px 0; }
.ipa-prog { padding: 10px 14px 0; }
.ipa-prog-row { font-size: 12px; margin-bottom: 5px; }
.ipa-bar { height: 8px; }
.ipa-stats { margin: 10px 14px 12px; }
.ipa-stats > div { flex-direction: column; align-items: flex-start; gap: 0; padding: 8px 12px; }
.ipa-ic { display: none; }
.ipa-stats b { font-size: 17px; }
.ipa-stats small { font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.ipa-phases { padding: 10px 14px 12px; gap: 10px; }
.ipa-ph { padding: 9px 12px; gap: 6px; border-radius: 10px; }
.ipa-ph-t b { font-size: 17px; }
.ipa-meter { height: 6px; }
/* simple intern information */
.ipa-ii { display: block !important; padding: 0 !important; overflow: hidden; }
.ipa-ihd { display: flex; align-items: center; gap: 10px; height: 38px; padding: 0 16px; background: #97351a; color: #fff; font-size: 14.5px; font-weight: 600; }
.ipa-ib { display: grid; grid-template-columns: 230px minmax(0, 1fr); }
.ipa-pp { background: #fdeee5; border-right: 1px solid #e7e9ee; padding: 18px 14px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 2px; }
.ipa-pp h2 { margin: 6px 0 0; font-size: 16px; font-weight: 700; color: #1f2430; }
.ipa-pp > span { font-size: 12px; color: #6b7280; }
.ipa-pp .ipa-pill { margin-top: 8px; background: #fff; border: 1px solid #f1b99f; padding: 2px 11px; }
.ipa-photo { width: 170px !important; height: 170px !important; border-radius: 18px !important; border: 6px solid #e8582a !important; box-shadow: 0 0 0 4px #fff, 0 8px 18px -8px rgba(200,70,28,.55); background: #fde3d6 !important; margin-bottom: 6px; align-self: center !important; }
.ipa-kv { width: 100%; height: 100%; border-collapse: collapse; align-self: stretch; }
.ipa-kv td { padding: 11px 14px; border-top: 1px solid #e7e9ee; font-size: 13px; vertical-align: middle; }
.ipa-kv tr:first-child td { border-top: 0; }
.ipa-kv td.k { width: 15%; color: #6b7280; font-weight: 500; background: #f6f7f9; }
.ipa-kv td.v { width: 35%; font-weight: 600; color: #1f2430; overflow-wrap: anywhere; }
@media (max-width: 800px) { .ipa-ib { grid-template-columns: 1fr; } }
/* photo: square, own border */
.ipa-ii { grid-template-columns: 150px minmax(0, 1fr); align-items: start; }
.ipa-photo { width: 150px; height: 150px; min-height: 0; align-self: start; border-radius: 14px; border: 3px solid #e8582a; background: #fde3d6; }
.ipa-photo .ix-av { width: 100% !important; height: 100% !important; min-height: 0; }
.ipa-photo .ix-av img { width: 100%; height: 100%; object-fit: cover; }
.ipa-rqw { padding: 14px 18px 16px; }
.ipa-rq { width: 100%; border-collapse: collapse; table-layout: fixed; }
.ipa-rq th { font-size: 10.5px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: #9aa1ad; text-align: left; padding: 0 0 8px; }
.ipa-rq td { padding: 10px 0; border-top: 1px solid #eef0f3; font-size: 13px; color: #1f2430; background: transparent !important; }
.ipa-rq tr { background: transparent !important; }
.ipa-rq th:first-child, .ipa-rq td:first-child { width: 22%; }
.ipa-rq th:nth-child(2), .ipa-rq td:nth-child(2) { width: 28%; padding-right: 24px; }
.ipa-rq .n { text-align: right; font-variant-numeric: tabular-nums; }
.ipa-rq tr.tot td { background: #fafbfc !important; border-top: 1px solid #e7e9ee; font-weight: 700; }
.ipa-ch { display: inline-block; min-width: 40px; text-align: center; font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 999px; }
.ipa-ch.ok { background: #e6f7ee; color: #15803d; } .ipa-ch.wait { background: #fff4e0; color: #b45309; } .ipa-ch.bad { background: #fdecec; color: #b91c1c; }
.ipa-ch.strong { box-shadow: inset 0 0 0 1px currentColor; }
.ipa-zero { color: #b6bcc6; }
.ipa-meter { display: block; width: 100%; height: 8px; border-radius: 9px; background: #eef0f3; overflow: hidden; }
.ipa-meter u { display: block; height: 100%; background: linear-gradient(90deg, #34a853, #15803d); border-radius: inherit; }
.ipa-reqb .ipa-card-h { flex-wrap: nowrap; }


@media (max-width: 760px) { .ipa-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } .ipa-week { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
`;

/* ── Intern profile (monitor) — info on the left, compact summary on the right ── */
const IPX_CSS = `
.ipx { display: flex; flex-direction: column; gap: 12px; color: #1f2430; width: 100%; max-width: 1120px; }
.ipx small, .ipx em { font-style: normal; line-height: 1.35; }
.ipx-card { background: #fff; border: 1px solid #e9ebef; border-radius: 14px; padding: 14px 16px; min-width: 0; display: flex; flex-direction: column; gap: 12px; box-sizing: border-box; box-shadow: 0 1px 2px rgba(16,24,40,.04); }
.ipx-card.sm { padding: 13px 14px; gap: 10px; }
.ipx-sh { display: flex; align-items: center; gap: 10px; min-height: 28px; }
.ipx-sh h3 { margin: 0; font-size: 14px; font-weight: 700; color: #1f2430; }
.ipx-sht { flex: 1; min-width: 0; }
.ipx-sht em { display: block; font-size: 12px; color: #6b7280; margin-top: 1px; }
.ipx-card.sm .ipx-sh h3 { font-size: 13.5px; font-weight: 600; }
.ipx-sh > em { margin-left: auto; font-size: 12px; color: #6b7280; }
.ipx-sh .ipa-lk { font-size: 12px; }
.ipx-sh.big h3 { font-size: 15.5px; }
.ipx-ic { width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; flex: none; background: #fdeee5; color: #c2410c; }
.ipx-ic.solid { width: 34px; height: 34px; border-radius: 10px; background: linear-gradient(135deg, #f07a4b, #d9481a); color: #fff; box-shadow: 0 6px 14px -8px rgba(217,72,26,.8); }
.ipx-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 34px; padding: 0 14px; border: 0; border-radius: 10px; background: #f4f5f7; color: #1f2430; font: inherit; font-size: 12.5px; font-weight: 600; text-decoration: none; cursor: pointer; white-space: nowrap; }
.ipx-btn:hover { background: #eceef2; }
.ipx-btn.ghost { background: #fff; border: 1px solid #e3e5ea; }
.ipx-btn.ghost:hover { background: #fafbfc; border-color: #d5d8de; }

/* header: a warm card with the photo, name, status and tags */
.ipx-hero { position: relative; overflow: hidden; border-radius: 16px; border: 1px solid #f5d3c0; background: linear-gradient(115deg, #fff6f0 0%, #ffe9dc 55%, #fddcc9 100%); }
.ipx-band { position: absolute; inset: 0; pointer-events: none; }
.ipx-band i { position: absolute; border-radius: 50%; }
.ipx-band i:nth-child(1) { width: 230px; height: 230px; right: -50px; top: -120px; background: rgba(232,88,42,.10); }
.ipx-band i:nth-child(2) { width: 130px; height: 130px; right: 150px; bottom: -80px; background: rgba(232,88,42,.07); }
.ipx-band i:nth-child(3) { width: 54px; height: 54px; right: 110px; top: 14px; border: 8px solid rgba(232,88,42,.10); }
.ipx-hb { position: relative; display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; padding: 16px 18px; }
.ipx-av { flex: none; width: 72px; height: 72px; border-radius: 50%; border: 3px solid #fff; background: #fff; overflow: hidden; box-shadow: 0 8px 18px -10px rgba(194,65,12,.7); }
.ipx-av .ix-av { width: 100% !important; height: 100% !important; border: 0 !important; box-shadow: none !important; background: linear-gradient(135deg, #f07a4b, #c2410c) !important; color: #fff !important; }
.ipx-av .ix-av img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
.ipx-av label.ix-photo-box { width: 100% !important; height: 100% !important; border-radius: 50% !important; }
.ipx-av label.ix-photo-box .ix-photo-badge { right: 2px; bottom: 2px; width: 22px; height: 22px; }
.ipx-avr { flex: none; }
.ipx-avr .ix-photo-pick { display: flex; align-items: center; gap: 12px; padding: 0; border: 0; background: none; }
.ipx-avr .ix-photo-box { width: 72px; height: 72px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 8px 18px -10px rgba(194,65,12,.7); }
.ipx-avr .ix-photo-ph small { display: none; }
.ipx-avr .ix-photo-box .ix-photo-badge { right: 2px; bottom: 2px; width: 22px; height: 22px; }
.ipx-avr { position: relative; }
.ipx-avr .ix-photo-pick { position: relative; }
.ipx-avr .ix-photo-info strong, .ipx-avr .ix-photo-info > span { display: none; }
.ipx-avr .ix-photo-info { position: absolute; left: 0; top: 0; width: 78px; height: 78px; pointer-events: none; }
.ipx-avr .ix-photo-info button { pointer-events: auto; position: absolute; top: -2px; right: -2px; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 50%; background: #fff; color: #b91c1c; font-size: 0; cursor: pointer; box-shadow: 0 2px 8px rgba(16,24,40,.25); display: grid; place-items: center; }
.ipx-avr .ix-photo-info button::before { content: "×"; font-size: 17px; font-weight: 700; line-height: 1; }
.ipx-avr .ix-photo-info button:hover { background: #fdecec; }
.ipx-avr .ix-photo-info em { position: absolute; top: 84px; left: 0; white-space: nowrap; font-size: 11px; color: #b91c1c; }
.ipx-who { flex: 999 1 300px; min-width: 0; display: flex; flex-direction: column; gap: 7px; }
.ipx-nm { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; }
.ipx-nm h2 { margin: 0; font-size: 19px; font-weight: 700; line-height: 1.2; letter-spacing: -0.01em; overflow-wrap: anywhere; }
.ipx-pill { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; background: #fff; color: #4b5563; font-size: 11.5px; font-weight: 600; box-shadow: inset 0 0 0 1px rgba(16,24,40,.08); }
.ipx-pill u { width: 7px; height: 7px; border-radius: 50%; background: #9ca3af; }
.ipx-pill.on { background: #e6f7ee; color: #15803d; box-shadow: none; } .ipx-pill.on u { background: #16a34a; }
.ipx-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.ipx-tags span { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 7px; background: rgba(255,255,255,.8); color: #374151; font-size: 11.5px; font-weight: 500; box-shadow: inset 0 0 0 1px rgba(232,88,42,.12); }
.ipx-tags span.o { background: #e8582a; color: #fff; font-weight: 600; box-shadow: none; }
.ipx-tags span.b { background: #e8f0ff; color: #1d4ed8; box-shadow: none; }
.ipx-tags span.g { background: #e6f7ee; color: #15803d; box-shadow: none; }
.ipx-tags span.w { background: #fff4e0; color: #b45309; box-shadow: none; }
.ipx-tags span.r { background: #fdecec; color: #b91c1c; box-shadow: none; }
.ipx-tags .sub { background: none; box-shadow: none; padding: 0; color: #6b7280; font-size: 12px; }
.ipx-act { margin-left: auto; display: flex; gap: 8px; }

/* columns: both stretch so the bottoms line up */
.ipx-cols { display: flex; flex-wrap: wrap; gap: 12px; align-items: stretch; }
.ipx-main { flex: 999 1 480px; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.ipx-side { flex: 1 1 280px; max-width: 320px; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.ipx-grow { flex: 1; }
.ipx-grow > .ipx-tiles { flex: 1; grid-auto-rows: 1fr; }
.ipx-grow > .ipx-tiles > div { flex-direction: column; align-items: flex-start; justify-content: center; gap: 8px; padding: 12px 14px; }
.ipx-grow > .ipx-tiles b { font-size: 14px; }

/* fields */
.ipx-fg { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 18px; }
.ipx-fg.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.ipx-fg.one { grid-template-columns: 1fr; }
.ipx-fg.names { grid-template-columns: repeat(3, minmax(0, 1fr)) minmax(90px, 0.55fr); }
.ipx-card > .ipx-fg + .ipx-fg { margin-top: -2px; }
.ipx-f { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ipx-f.w2 { grid-column: span 2; }
.ipx-f.wide { grid-column: 1 / -1; }
.ipx-f small { font-size: 11.5px; color: #6b7280; }
.ipx-f b { font-size: 13.5px; font-weight: 600; line-height: 1.4; overflow-wrap: break-word; word-break: break-word; }
.ipx-kv { display: flex; flex-direction: column; }
.ipx-kv > div { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 8px 0; border-top: 1px solid #f0f1f4; font-size: 12.5px; }
.ipx-kv > div:first-child { border-top: 0; padding-top: 0; }
.ipx-kv > div:last-child { padding-bottom: 0; }
.ipx-kv span { color: #6b7280; flex: none; }
.ipx-kv b { font-weight: 600; line-height: 1.4; text-align: right; overflow-wrap: break-word; min-width: 0; }
.ipx-kv span { line-height: 1.4; }

/* internship: an orange placement banner and small tiles */
.ipx-plc { position: relative; overflow: hidden; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 8px 18px; padding: 14px 16px; border-radius: 12px; background: linear-gradient(115deg, #e8582a 0%, #f07a4b 100%); color: #fff; }
.ipx-plc::before { content: ""; position: absolute; right: -40px; top: -60px; width: 160px; height: 160px; border-radius: 50%; background: rgba(255,255,255,.12); }
.ipx-plc::after { content: ""; position: absolute; right: 120px; bottom: -50px; width: 90px; height: 90px; border-radius: 50%; background: rgba(255,255,255,.08); }
.ipx-plc > div { position: relative; z-index: 1; min-width: 0; }
.ipx-plc small { display: block; font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: rgba(255,255,255,.82); }
.ipx-plc b { display: block; font-size: 17px; font-weight: 700; margin-top: 2px; overflow-wrap: anywhere; }
.ipx-plc strong { display: block; font-size: 13.5px; font-weight: 600; margin-top: 2px; }
.ipx-plc .r { text-align: right; }
.ipx-tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.ipx-tiles > div { display: flex; align-items: center; gap: 10px; background: #f7f8fa; border: 1px solid #eef0f3; border-radius: 10px; padding: 9px 11px; min-width: 0; }
.ipx-tiles .ti { width: 28px; height: 28px; border-radius: 8px; flex: none; display: grid; place-items: center; background: #fff; color: #e8582a; box-shadow: inset 0 0 0 1px #f5dccd; }
.ipx-tiles .tt { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.ipx-tiles small { font-size: 11px; color: #6b7280; }
.ipx-tiles b { font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }

/* emergency */
.ipx-emg { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 14px; padding: 11px 14px; border-radius: 14px; background: #fff; border: 1px solid #e9ebef; box-shadow: 0 1px 2px rgba(16,24,40,.04); }
.ipx-emg .ipx-ic { background: #fdecec; color: #dc2626; }
.ipx-emg-t { flex: 999 1 220px; min-width: 0; }
.ipx-emg-t small { display: block; font-size: 11.5px; color: #6b7280; }
.ipx-emg-t b { font-size: 13.5px; font-weight: 600; }
.ipx-emg-t em { font-weight: 400; color: #4b5563; }

/* summary */
.ipx-ring { display: flex; align-items: center; gap: 14px; }
.ipx-ring .ix-ring-center { color: #1f2430; }
.ipx-ring .ix-ring-center strong { font-size: 12.5px; font-weight: 700; }
.ipx-ring b { display: block; font-size: 16px; font-weight: 700; }
.ipx-ring b em { font-size: 13px; font-weight: 500; color: #6b7280; }
.ipx-ring small { font-size: 12px; font-weight: 600; color: #6b7280; }
.ipx-ring small.ok { color: #15803d; }
.ipx-mini { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.ipx-mini > div { background: #f7f8fa; border-radius: 10px; padding: 8px 10px; font-size: 12px; color: #6b7280; }
.ipx-mini b { display: block; font-size: 15px; font-weight: 700; color: #1f2430; }
.ipx-today { display: flex; justify-content: space-between; gap: 8px; padding: 8px 12px; border-radius: 10px; background: #1f2430; color: #fff; font-size: 12px; }
.ipx-week { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
.ipx-day { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 7px 2px; border-radius: 10px; border: 1px dashed #dcdfe4; min-width: 0; }
.ipx-day small { font-size: 11px; color: #6b7280; }
.ipx-day b { font-size: 15px; font-weight: 700; color: #9ca3af; }
.ipx-day i { width: 8px; height: 8px; border-radius: 50%; background: #e5e7eb; margin-top: 3px; }
.ipx-day em { font-size: 11px; font-weight: 700; }
.ipx-day.present { border: 1px solid #cfe9d4; background: #f0faf2; } .ipx-day.present b, .ipx-day.present em { color: #15803d; }
.ipx-day.excused { border: 1px solid #dccaf7; background: #f5efff; } .ipx-day.excused b { color: #6d3fc4; } .ipx-day.excused i { background: #8b5cf6; }
.ipx-day.none { border: 1px solid #fde2e2; background: #fef2f2; } .ipx-day.none b { color: #1f2430; } .ipx-day.none i { background: #dc2626; }
.ipx-day.today { border: 2px solid #e8582a; background: #fff7f2; padding: 6px 1px; } .ipx-day.today small { color: #b8461a; font-weight: 600; } .ipx-day.today b { color: #1f2430; } .ipx-day.today i { background: #e8582a; }
.ipx-last { font-size: 11.5px; color: #6b7280; }
.ipx-req .ipx-phs { flex: 1; display: flex; flex-direction: column; gap: 8px; }
.ipx-ph { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 6px; padding: 9px 12px; border-radius: 10px; background: #f7f8fa; }
.ipx-ph-t { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; }
.ipx-ph-t span { font-weight: 500; }
.ipx-ph-t b { font-weight: 600; text-align: right; } .ipx-ph-t b.ok { color: #15803d; } .ipx-ph-t b.bad { color: #b91c1c; } .ipx-ph-t b.wait { color: #b45309; }
.ipx-bar { height: 6px; border-radius: 99px; background: #e2e4e8; overflow: hidden; }
.ipx-bar i { display: block; height: 100%; border-radius: inherit; background: #e8582a; }
.ipx-bar i.ok { background: #16a34a; }

/* View window (Manage Accounts) */
.ipx-sig { height: 76px; border: 1px dashed #d8dce3; border-radius: 10px; background: #fafbfc; display: grid; place-items: center; overflow: hidden; font-size: 12px; color: #9aa1ad; }
.ipx-sig img { max-width: 90%; max-height: 64px; object-fit: contain; }
.ipx-sig b { font-weight: 500; }
.ipx-mine { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.ipx-mine li { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid #f0f1f4; font-size: 13px; min-width: 0; }
.ipx-mine li:first-child { border-top: 0; padding-top: 0; }
.ipx-mine li b { font-weight: 600; }
.ipx-mine li small { margin-left: auto; color: #6b7280; font-size: 12px; text-align: right; }
.ipx-cnt { font-size: 12px; font-weight: 700; background: #fdeee5; color: #c2410c; padding: 2px 9px; border-radius: 99px; }
.ipx-emgc .ipx-ic { background: #fdecec; color: #dc2626; }
.ipx-none { font-size: 12.5px; color: #6b7280; }
.ipx-moa { display: inline-flex; align-items: center; gap: 6px; }
.ipx-moa.bad { color: #b91c1c; }

/* Add / Edit form */
.ipx-form .ipx-f { gap: 5px; }
.ipx-form .ipx-f > small { font-size: 12px; font-weight: 600; color: #4b5563; }
.ipx-form .ipx-f > small i.rq { font-style: normal; color: #e8582a; }
.ipx-form .ipx-fg { gap: 10px 14px; }
.ipx-form .uf-input { width: 100%; box-sizing: border-box; height: 38px; font-size: 13px; }
.ipx-form .uf-hint, .ipx-form .ipx-f small.uf-hint { font-style: normal; font-size: 11px; font-weight: 400; color: #9aa1ad; line-height: 1.35; }
.ipx-form .uf-prefix .uf-input { border-radius: 0 8px 8px 0; }
.ipx-form .ix-row-gap { display: flex; gap: 8px; align-items: center; }
.ipx-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 16px; border-radius: 14px; background: #fff; border: 1px solid #e9ebef; position: sticky; bottom: 0; z-index: 3; box-shadow: 0 -8px 18px -14px rgba(16,24,40,.35); }
.ipx-actions .ix-b { flex: 0 0 auto; padding: 9px 22px; font-size: 13px; }
.ipx-actions .note { margin-right: auto; align-self: center; font-size: 12px; color: #6b7280; }
.ipx-actions .note i { font-style: normal; color: #e8582a; }
.sig-pick { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.sig-box { width: 180px; height: 64px; border: 1px dashed #d8dce3; border-radius: 10px; background: #fafbfc; display: grid; place-items: center; overflow: hidden; font-size: 12px; color: #9aa1ad; }
.sig-box img { max-width: 100%; max-height: 100%; object-fit: contain; }

@media (max-width: 1100px) { .ipx-side { max-width: none; flex-basis: 100%; } }
@media (max-width: 760px) {
  .ipx-fg, .ipx-fg.three, .ipx-fg.names, .ipx-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ipx-plc .r { text-align: left; }
  .ipx-act { margin-left: 0; }
}
@media (max-width: 460px) { .ipx-fg, .ipx-fg.three, .ipx-fg.names, .ipx-tiles { grid-template-columns: 1fr; } .ipx-f.w2 { grid-column: auto; } }
`;

/* ── Add / Edit / View account: simple layout ── */
const UZ_CSS = `
.uz { display: flex; flex-direction: column; gap: 16px; color: #1f2430; width: 100%; max-width: 1080px; }
.uz small, .uz em { font-style: normal; }
.uz-top { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
/* add / edit form: the bar (Back · title · Cancel · Save) stays at the top while the long form scrolls */
.uz-form > .uz-top { position: sticky; top: 0; z-index: 6; margin: 0 -2px; padding: 10px 2px 12px; background: var(--ix-surface, #fff); border-bottom: 1px solid #eef0f3; }
/* name on one line: First · Middle · Last · Extension (the extension is short) */
.uz-grid.uz-names { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, .55fr); margin-bottom: 14px; }
@media (max-width: 1000px) { .uz-grid.uz-names { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.uz-top h2 { margin: 0 auto 0 0; font-size: 18px; font-weight: 700; letter-spacing: -0.01em; }
.uz-top .uz-back { flex: none; }
.uz-act { display: flex; gap: 8px; margin-left: auto; }
.uz-act .ix-b { flex: 0 0 auto; padding: 9px 22px; font-size: 13px; }
.uz-body { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 24px; align-items: start; }
.uz-side { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
/* the photo / role / ID column sits in its own card like the form, and stays in view while the long form scrolls */
.uz.uz-form { max-width: none; }   /* the add / edit form uses the full width of the page */
.uz-form .uz-body { grid-template-columns: 224px minmax(0, 1fr); }
.uz-form .uz-side { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; position: sticky; top: 12px; }
.uz-role { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.uz-role-chg { border: 0; background: none; padding: 0; font: inherit; font-size: 12.5px; font-weight: 600; color: #e8582a; cursor: pointer; }
.uz-role-chg:hover { text-decoration: underline; }


/* photo */
.uz-photo { width: 100%; }
.uz-photo .ix-photo-pick { display: flex; flex-direction: column; align-items: stretch; gap: 8px; padding: 0; border: 0; background: none; }
.uz-photo .ix-photo-box, .uz-photo label.ix-photo-box { width: 100% !important; height: auto !important; aspect-ratio: 1 / 1; border-radius: 12px !important; border: 1px solid #e5e7eb; background: #f7f8fa; color: #9aa1ad; }
.uz-photo .ix-photo-box:hover { transform: none; border-color: #e8582a; }
.uz-photo .ix-photo-ph { display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 12px; }
.uz-photo .ix-av { width: 100% !important; height: auto !important; aspect-ratio: 1 / 1; border-radius: 12px !important; font-size: 64px !important; box-shadow: none !important; border: 1px solid #e5e7eb !important; background: #fdeee5 !important; color: #c2410c !important; }
.uz-photo .ix-av img { width: 100%; height: 100%; object-fit: cover; border-radius: 12px; }
.uz-photo .ix-photo-info { display: flex; flex-direction: column; gap: 2px; font-size: 11.5px; color: #6b7280; line-height: 1.4; }
.uz-photo .ix-photo-info strong { display: none; }
.uz-photo .ix-photo-info button { align-self: flex-start; margin-top: 2px; border: 0; background: none; padding: 0; font: inherit; font-weight: 600; color: #b91c1c; cursor: pointer; }
.uz-photo .ix-photo-info em { color: #b91c1c; }
.uz-nm { display: flex; flex-direction: column; gap: 2px; }
.uz-nm b { font-size: 15px; font-weight: 700; overflow-wrap: break-word; }
.uz-nm small { font-size: 12px; color: #6b7280; }
.uz-meta { display: flex; flex-direction: column; gap: 14px; }

/* the card */
.uz-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 2px 22px; min-width: 0; }
.uz-sec { padding: 18px 0 20px; }
.uz-sec + .uz-sec { border-top: 1px solid #eef0f3; }
.uz-sec h3 { display: inline-flex; align-items: center; gap: 8px; margin: 0 0 16px; padding-bottom: 7px; font-size: 15px; font-weight: 700; position: relative; }
.uz-sec h3::after { content: ""; position: absolute; left: 0; bottom: 0; width: 100%; height: 2.5px; border-radius: 2px; background: #e8582a; }
.uz-sh { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.uz-sh > em { font-size: 12px; color: #6b7280; padding-top: 2px; }
.uz-sh .ipa-lk { margin-left: 0; font-size: 12.5px; padding: 2px 0 0; border: 0 !important; background: none !important; box-shadow: none !important; height: auto; color: #e8582a; }
.uz-sh a.ix-b { text-decoration: none; }
.uz-sh .ix-b { margin-top: -4px; }
.uz-wide { width: 100%; justify-content: center; }
.uz-chip.g { background: #e6f7ee; color: #15803d; }
/* Monitor Interns profile: photo | information | attendance summary */
.uz.uz-mon { max-width: 1360px; }
.uz-body.three { grid-template-columns: 190px minmax(0, 1fr) 300px; gap: 20px; }
.uz-sum .uz-sec { display: flex; flex-direction: column; gap: 12px; padding: 16px 0 18px; }
.uz-sum .uz-sec h3 { margin-bottom: 0; }
.uz-sum .ipx-phs { display: flex; flex-direction: column; gap: 8px; }
.uz-mon .uz-card { padding: 2px 20px; }
/* the information card and the summary card end on the same bottom line; the summary's last section takes the extra
   height and its button ("Review submitted files") sits at the bottom */
@media (min-width: 1251px) {
  .uz-body.three > .uz-card { align-self: stretch; }
  .uz-body.three > .uz-sum { display: flex; flex-direction: column; }
  .uz-body.three > .uz-sum > .uz-sec:last-child { flex: 1 1 auto; }
  .uz-body.three > .uz-sum > .uz-sec:last-child > .uz-wide { margin-top: auto; }
}
@media (max-width: 1250px) { .uz-body.three { grid-template-columns: 190px minmax(0, 1fr); } .uz-body.three .uz-sum { grid-column: 2; } }
.uz-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 16px; }

/* fields */
.uz-f { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.uz-f.full { grid-column: 1 / -1; }
.uz-f > small { font-size: 12px; font-weight: 500; color: #374151; }
.uz-f > small i { font-style: normal; font-weight: 400; color: #9aa1ad; }
.uz .uf-input { width: 100%; box-sizing: border-box; height: 40px; font-size: 13px; }
.uz .uf-hint { font-style: normal; font-size: 11px; font-weight: 400; color: #9aa1ad; line-height: 1.35; }
.uz .ix-row-gap { display: flex; gap: 8px; align-items: center; }
.uz-view .uz-f { gap: 3px; }
.uz-view .uz-f > small { color: #6b7280; font-weight: 400; }
.uz-view .uz-f > b { font-size: 14px; font-weight: 500; line-height: 1.4; overflow-wrap: break-word; }
.uz-chip { align-self: flex-start; display: inline-flex; align-items: center; height: 26px; padding: 0 10px; border-radius: 7px; background: #fdeee5; color: #c2410c; font-size: 12.5px; font-weight: 600; }
.uz-st { align-self: flex-start; display: inline-flex; align-items: center; gap: 7px; height: 28px; padding: 0 10px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 12.5px; font-weight: 500; }
.uz-st i { width: 7px; height: 7px; border-radius: 2px; background: #14b8a6; }
.uz-st.off i { background: #9ca3af; }
.uz-bad { color: #b91c1c; }
.uz-cnt { font-size: 12px; font-weight: 600; color: #6b7280; background: #f3f4f6; padding: 1px 8px; border-radius: 99px; }
.uz-none { font-size: 13px; color: #6b7280; }
.uz-mine { list-style: none; margin: 0; padding: 0; }
.uz-mine li { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid #f0f1f4; font-size: 13px; min-width: 0; }
.uz-mine li:first-child { border-top: 0; padding-top: 0; }
.uz-mine li b { font-weight: 600; }
.uz-mine li small { margin-left: auto; font-size: 12px; color: #6b7280; text-align: right; }
.sig-pick { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.sig-box { width: 200px; height: 70px; border: 1px dashed #d8dce3; border-radius: 10px; background: #fafbfc; display: grid; place-items: center; overflow: hidden; font-size: 12px; color: #9aa1ad; }
.sig-box img { max-width: 100%; max-height: 100%; object-fit: contain; }

@media (max-width: 760px) {
  .uz-body, .uz-body.three { grid-template-columns: 1fr; }
  .uz-body.three .uz-sum { grid-column: auto; }
  .uz-photo { width: 150px; }
  .uz-form .uz-side { position: static; }
  .uz-form .uz-body { grid-template-columns: 1fr; }
  .uz-grid { grid-template-columns: 1fr; }
}
`;

/* Read-only details, simple layout: photo and account on the left, one card on the right.
   Used in the View window in Manage Accounts. */
export function UserDetails({ u, interns = [] }) {
  const isIntern = u.role === "intern";
  const isSup = u.role === "supervisor";
  const parts = (u.name || "").trim().split(/\s+/);
  const online = portalOnline(u);
  const v = (k, val, full) => (
    <div className={full ? "uz-f full" : "uz-f"} key={k}><small>{k}</small><b>{val || "—"}</b></div>
  );
  const created = u.created_at ? ipxDate(String(u.created_at).replace(" ", "T")) : null;
  const moa = u.moa_valid_until ? (() => {
    const d = new Date(String(u.moa_valid_until).slice(0, 10) + "T00:00:00");
    const expired = d < new Date(new Date().toDateString());
    return <span className={expired ? "uz-bad" : ""}>{ipxDate(u.moa_valid_until)}{expired ? " (expired)" : ""}</span>;
  })() : "No MOA yet";
  const mine = isSup ? interns.filter((x) => String(x.supervisor_id) === String(u.id)) : [];

  return (
    <section className={"uz uz-view" + (isIntern ? "" : " uz-staff")} aria-label={`Profile of ${u.name}`}>
      <style>{UZ_CSS}</style>
      <div className="uz-body">
        <aside className="uz-side">
          <div className="uz-photo"><Avatar name={u.name} photo={u.photo} size={180} /></div>
          <div className="uz-nm"><b>{u.name}</b><small>#{u.student_id || "—"}</small></div>
          <div className="uz-meta">
            <div className="uz-f"><small>Role</small><span className="uz-chip">{isIntern ? "OJT Intern" : (ROLE_LABEL[u.role] || u.role)}</span></div>
            <div className="uz-f"><small>Status</small>
              <span className={u.deactivated_at ? "uz-st off" : "uz-st"}><i />{u.deactivated_at ? "Deactivated" : "Active"}</span></div>
            <div className="uz-f"><small>Last online</small><b>{online ? "Online now" : seenText(u)}</b></div>
            {isIntern && <div className="uz-f"><small>NFC card</small><b>{u.nfc_uid || "Not linked"}</b></div>}
            <div className="uz-f"><small>Created</small><b>{created || "—"}</b></div>
          </div>
        </aside>

        <div className="uz-card">
          <div className="uz-sec">
            <h3>Personal details</h3>
            <div className="uz-grid">
              {v("First name", u.first_name || parts[0])}
              {v("Middle name", u.middle_name)}
              {v("Last name", u.last_name || (parts.length > 1 ? parts[parts.length - 1] : ""))}
              {v("Extension", u.name_extension)}
              {v("Birthday", ipxDate(u.date_of_birth))}
              {v("Contact number", u.contact_number)}
              {v("Email", u.email)}
              {v("Address", u.address)}
            </div>
          </div>

          {isIntern && (
            <div className="uz-sec">
              <h3>Internship details</h3>
              <div className="uz-grid">
                {v("Placement (HTE)", u.placement || "No placement yet")}
                {v("HTE supervisor", u.supervisor_name || "Not assigned yet")}
                {v("Program", u.program)}
                {v("Semester", u.semester)}
                {v("Modality", MODALITIES[modalityOf(u)])}
                {v("Scope", SCOPES[scopeOf(u)])}
                {v("Time record (DTR)", u.modality === "virtual" ? "Not needed (virtual: logs through Submit Online)" : DTR_MODES[dtrModeOf(u)])}
                {v("System output presentation", outputRequired(u) ? "Required" : "Not required by the HTE")}
                {v("Required hours", priorHoursOf(u) ? `${requiredHoursFor(u.program, u.prior_hours)} hours (${priorHoursOf(u)}h from an earlier term)` : `${requiredHoursFor(u.program, u.prior_hours)} hours`)}
              </div>
            </div>
          )}

          {isIntern && (
            <div className="uz-sec">
              <h3>Emergency contact</h3>
              <div className="uz-grid">
                {v("Full name", u.emergency_contact_name || "Not set")}
                {v("Relationship", u.emergency_contact_relation)}
                {v("Contact number", u.emergency_contact_number)}
                {v("Address", u.emergency_contact_address)}
              </div>
            </div>
          )}

          {isSup && (
            <div className="uz-sec">
              <h3>HTE details</h3>
              <div className="uz-grid">
                {v("HTE (company / office)", u.placement || "Not set", true)}
                {v("HTE address", u.hte_address)}
                {v("MOA valid until", moa)}
                {v("System output presentation", outputRequired(u) ? "Required by this HTE" : "Not required by this HTE")}
              </div>
            </div>
          )}

          {!isIntern && (
            <div className="uz-sec">
              <h3>Position & signature</h3>
              <div className="uz-grid">
                {v("Position / job title", u.position || "Not set", true)}
                <div className="uz-f full"><small>Signature</small>
                  <div className="sig-box">{u.signature ? <PrivateImg path={u.signature} alt="Signature" /> : <span>Not uploaded yet</span>}</div>
                </div>
              </div>
            </div>
          )}

          {isSup && (
            <div className="uz-sec">
              <h3>Assigned interns <em className="uz-cnt">{mine.length}</em></h3>
              {mine.length === 0 ? <div className="uz-none">No interns assigned yet.</div> : (
                <ul className="uz-mine">
                  {mine.map((x) => (
                    <li key={x.id}><Avatar name={x.name} photo={x.photo} size={28} /><b>{x.name}</b><small>{x.program || ""}{x.placement ? ` · ${x.placement}` : ""}</small></li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* A photo of a signature on paper -> a PNG with a see-through background, cropped to the ink.
   The paper (white or grey) becomes transparent and the ink is kept, so the signature sits cleanly
   on the DTR and reports. Works in the browser, before the file is uploaded. */
export async function cleanSignature(file) {
  const img = await new Promise((res, rej) => {
    const url = URL.createObjectURL(file); const im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); res(im); };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error("bad image")); };
    im.src = url;
  });
  const scale = Math.min(1, 900 / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true }); ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h); const px = data.data;
  // brightness of each pixel; the paper is the bright majority, the ink the darkest few
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
  const sorted = Array.from(lum).sort((a, b) => a - b);
  const paper = sorted[Math.floor(sorted.length * 0.6)];   // typical paper brightness
  const ink = sorted[Math.floor(sorted.length * 0.01)];    // typical ink brightness
  const hi = paper - Math.max(12, (paper - ink) * 0.18);   // lighter than this = paper (see-through)
  const lo = ink + (hi - ink) * 0.35;                      // darker than this = full ink
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; const L = lum[i];
    let a = L >= hi ? 0 : L <= lo ? 1 : (hi - L) / (hi - lo);
    a = Math.pow(a, 0.8);
    px[i * 4 + 3] = Math.round(a * 255);
    if (a > 0.3) {   // ink: make it a clean dark tone, keeping a little of its colour (blue / black pen)
      for (let k = 0; k < 3; k++) px[i * 4 + k] = Math.round(px[i * 4 + k] * 0.6);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  ctx.putImageData(data, 0, 0);
  if (x1 < 0) return file;   // nothing found: keep the original
  const pad = 8; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const out = document.createElement("canvas"); out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext("2d").drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  const blob = await new Promise((res) => out.toBlob(res, "image/png"));
  return blob ? new File([blob], "signature.png", { type: "image/png" }) : file;
}

/* Signature upload (staff): picks an image, shows a preview, or the saved one */
function SigPicker({ file, onChange, current }) {
  const [preview, setPreview] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const currentUrl = useFileLink(current);   // a saved signature is private: the server gives a short-lived link
  const shown = preview || currentUrl;
  return (
    <div className="sig-pick">
      <div className="sig-box">{shown ? <img src={shown} alt="Signature" /> : <span>No signature yet</span>}</div>
      <label className="ix-b ghost sm">
        <input type="file" accept="image/*" style={{ display: "none" }} onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = "";
          if (!f) return;
          if (!f.type.startsWith("image/")) { setErr("Please choose an image file."); return; }
          if (f.size > 10 * 1024 * 1024) { setErr("Please choose an image under 10 MB."); return; }
          let clean = f;
          try { clean = await cleanSignature(f); } catch { /* keep the original */ }
          if (clean.size > 2 * 1024 * 1024) { setErr("Signature must be under 2 MB."); return; }
          setErr(null); onChange(clean);
        }} />
        {shown ? "Change signature" : "Upload signature"}
      </label>
      {err && <small className="uf-hint" style={{ color: "#b91c1c" }}>{err}</small>}
    </div>
  );
}

/* "What kind of account?" — the first step of Add New User (admin: all roles, coordinator: intern + supervisor) */
const ROLE_KEYS = ["intern", "supervisor", "ojt_coordinator", "admin"];
const ROLE_PICK = {
  intern: ["user", "OJT Intern", "A CCIS student on OJT. Taps the NFC card, submits requirements and online attendance."],
  supervisor: ["briefcase", "HTE Supervisor", "The intern's supervisor at the HTE. Confirms attendance, rates the intern and certifies the DTR."],
  ojt_coordinator: ["users", "OJT Coordinator", "Manages the interns: approvals, requirements, grades and reports."],
  admin: ["lock", "Admin", "Manages accounts, ID cards, kiosks, the activity log and backups."],
};
const PICK_CSS = `
.uz-pick-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; font-family: inherit; }
@media (max-width: 560px) { .uz-pick-grid { grid-template-columns: 1fr; } }
.uz-pick-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
.uz-pick-tile { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; text-align: left; padding: 16px; border: 1px solid #e5e7eb; border-radius: 12px; background: #fff; font: inherit; color: #1f2430; cursor: pointer; transition: border-color .15s, box-shadow .15s, transform .15s; }
.uz-pick-tile:hover, .uz-pick-tile:focus-visible, .uz-pick-tile.on { border-color: #e8582a; box-shadow: 0 0 0 3px rgba(232,88,42,.12); outline: none; transform: translateY(-1px); }
.uz-pick-tile b { font-size: 14.5px; font-weight: 700; }
.uz-pick-tile small { font-size: 12.5px; color: #6b7280; line-height: 1.45; }
.uz-pick-ic { display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; border-radius: 10px; background: #fff1ea; color: #e8582a; margin-bottom: 4px; }
`;
export function RolePickModal({ roles = null, current = null, onPick, onClose }) {
  const list = ROLE_KEYS.filter((k) => !roles || roles.includes(k));
  return (
    <Modal title="What kind of account?" sub="Pick a role first. The form shows only the details that role needs." onClose={onClose}>
      <style>{PICK_CSS}</style>
      <div className="uz-pick-grid">
        {list.map((k) => (
          <button key={k} type="button" className={"uz-pick-tile" + (current === k ? " on" : "")} onClick={() => onPick(k)}>
            <span className="uz-pick-ic"><Icon name={ROLE_PICK[k][0]} size={20} /></span>
            <b>{ROLE_PICK[k][1]}</b>
            <small>{ROLE_PICK[k][2]}</small>
          </button>
        ))}
      </div>
    </Modal>
  );
}


/* Shared form for "Add New User" and "Edit User" (same look as the View window) */
export function UserForm({ f, set, mode, isIntern, header, title, sub, uidField, actions, supervisors, role, roles = null, noPassword = false, sigFile = null, onSig = null, sigCurrent = null, back = null, onChangeRole = null }) {
  const add = mode === "add";
  // when editing, the form has no "role" field, so the page passes the account's role
  const formRole = role || f.role;
  // adding: the role is picked first in the "What kind of account?" window (RolePickModal)
  const roleList = ROLE_KEYS.filter((k) => !roles || roles.includes(k));
  const today = todayManila();
  // the modality of the intern's HTE: from the chosen supervisor, or the HTE with the same name as the placement
  const hk = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
  const hteModOf = (x) => {
    const list = supervisors || [];
    const bySup = x.supervisor_id ? list.find((s) => String(s.id) === String(x.supervisor_id))?.hte_modality : null;
    return MODALITIES[bySup] ? bySup : (list.find((s) => s.hte_modality && hk(s.placement) && hk(s.placement) === hk(x.placement))?.hte_modality || null);
  };
  const effMod = f.modality === "hte" || !f.modality ? (hteModOf(f) || "onsite") : f.modality;   // what the intern will actually have

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

  const fld = (label, control, { full = false, hint, plain = false, opt = false } = {}) => {
    const Tag = plain ? "div" : "label";
    return (
      <Tag className={"uz-f uf-cell" + (full ? " full" : "")} key={label}>
        <small>{label}{opt && <i> (optional)</i>}</small>
        {control}
        {hint && <em className="uf-hint">{hint}</em>}
      </Tag>
    );
  };
  // Placement and HTE supervisor go together: picking an HTE fills in its supervisor (and the other way around)
  const hteKey = (v) => String(v || "").toLowerCase().replace(/\s+/g, " ").trim();
  const sups = supervisors || [];
  const [supAuto, setSupAuto] = useState(false);
  const hteNames = [...new Set(sups.map((s) => String(s.placement || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const atHte = f.placement ? sups.filter((s) => hteKey(s.placement) === hteKey(f.placement)) : [];
  const others = sups.filter((s) => !atHte.includes(s));
  const curSup = sups.find((s) => String(s.id) === String(f.supervisor_id ?? ""));
  const autoSup = !!curSup && atHte.includes(curSup) && supAuto;
  const onPlacement = (e) => {
    set("placement")(e);
    const match = sups.filter((s) => hteKey(s.placement) === hteKey(e.target.value));
    const keep = curSup && match.includes(curSup);
    if (match.length && !keep) {
      set("supervisor_id")({ target: { value: String(match[0].id) } });
      if (isIntern) set("output_required")({ target: { value: outputRequired(match[0]) ? "1" : "0" } });   // the HTE's presentation rule
      setSupAuto(true);
    }
  };
  const onSupervisor = (e) => {
    set("supervisor_id")(e);
    setSupAuto(false);
    const s = sups.find((x) => String(x.id) === e.target.value);
    if (s && isIntern) set("output_required")({ target: { value: outputRequired(s) ? "1" : "0" } });
    if (s?.placement && !String(f.placement || "").trim()) set("placement")({ target: { value: s.placement } });
  };
  const empId = text("student_id", { required: add, placeholder: isIntern ? "e.g. 2021-00123" : "e.g. 0001" });

  const ROLE_TXT = { intern: "OJT Intern", ojt_coordinator: "OJT Coordinator", supervisor: "HTE Supervisor", admin: "Admin" };
  return (
    <section className={"uz uz-form" + (isIntern ? "" : " uz-staff")}>
      <style>{UZ_CSS}</style>

      <div className="uz-top">
        {back}
        <h2>{add ? "New account" : "Edit account"}</h2>
        <div className="uz-act">{actions}</div>
      </div>

      <div className="uz-body">
        <aside className="uz-side">
          <div className="uz-photo">{header}</div>
          {!add && title && <div className="uz-nm"><b>{title}</b>{sub && <small>{sub}</small>}</div>}
          <div className="uz-meta">
            {fld("Role", (
              <span className="uz-role">
                <span className="uz-chip">{ROLE_TXT[formRole] || formRole}</span>
                {add && roleList.length > 1 && onChangeRole && <button type="button" className="uz-role-chg" onClick={onChangeRole}>Change</button>}
              </span>
            ), { plain: true })}
            {fld(isIntern ? "Student ID" : "Employee ID", empId, { hint: "Used for account recovery." })}
            {(add || !noPassword) && fld(add ? "Password" : "New password",
              text("password", {
                type: "text", autoComplete: "off", required: add, minLength: add ? 8 : undefined,
                placeholder: add ? "At least 8 characters" : "Leave blank to keep",
              }), { opt: !add })}
          </div>
        </aside>

        <div className="uz-card">
          <div className="uz-sec">
            <h3>Personal details</h3>
            {/* the name on one line, in the order it is written */}
            <div className="uz-grid uz-names">
              {fld("First name", text("first_name", { required: true }))}
              {fld("Middle name", text("middle_name"), { opt: true })}
              {fld("Last name", text("last_name", { required: true }))}
              {fld("Extension", <>
                {text("name_extension", { list: "name-ext-list", maxLength: 20, placeholder: "Jr., III" })}
                <datalist id="name-ext-list">{["Jr.", "Sr.", "II", "III", "IV", "V"].map((x) => <option key={x} value={x} />)}</datalist>
              </>, { plain: true, opt: true })}
            </div>
            <div className="uz-grid">
              {fld("Birthday", text("date_of_birth", { type: "date", max: today, required: add }), { opt: !add })}
              {fld("Contact number", text("contact_number", { type: "tel", placeholder: "e.g. 09123456789" }), { opt: true })}
              {fld("Email", text("email", { type: "email", required: true, placeholder: "e.g. juan@csu.edu.ph" }))}
              {fld("Address", text("address", { placeholder: "Street, Barangay, City" }), { opt: true })}
            </div>
          </div>

          {formRole === "supervisor" && (
            <div className="uz-sec">
              <h3>HTE details</h3>
              <div className="uz-grid">
                {fld("HTE (company / office)", text("placement", { required: add, placeholder: "e.g. Provincial IT Office, Butuan City" }),
                  { full: true, opt: !add, hint: "Use the same name as the interns' Placement, so the coordinator can match them." })}
                {fld("HTE address", text("hte_address", { placeholder: "Street, Barangay, City" }), { opt: true })}
                {fld("MOA valid until", text("moa_valid_until", { type: "date" }), { opt: true, hint: "Leave empty if there is no MOA yet." })}
                {fld("Category of the HTE", (
                  <select className="uf-input" value={f.hte_category || ""} onChange={set("hte_category")}>
                    <option value="">Not set yet</option>
                    {HTE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                ), { opt: true, hint: "Industry, government agency, NGO, research institution, IT company, hospital, school…" })}
                {fld("Modality at this HTE", (
                  <select className="uf-input" value={f.hte_modality || ""} onChange={set("hte_modality")}>
                    <option value="">Not set yet</option>
                    {Object.entries(MODALITIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                ), { opt: true, hint: "Every intern placed at this HTE gets it automatically (except interns given their own)." })}
                {fld("System output presentation", (
                  <select className="uf-input" value={outputRequired(f) ? "1" : "0"} onChange={set("output_required")}>
                    <option value="1">Required by this HTE</option>
                    <option value="0">Not required by this HTE</option>
                  </select>
                ), { hint: "Applies to every intern under this supervisor." })}
              </div>
            </div>
          )}

          {isIntern && (
            <div className="uz-sec">
              <h3>Internship details</h3>
              <div className="uz-grid">
                {fld("Placement (HTE)", (
                  <>
                    <input className="uf-input" list="uz-hte-list" value={f.placement ?? ""} onChange={onPlacement}
                      required={add} placeholder="e.g. Provincial IT Office, Butuan City" autoComplete="off" />
                    {hteNames.length > 0 && <datalist id="uz-hte-list">{hteNames.map((n) => <option key={n} value={n} />)}</datalist>}
                  </>
                ), { opt: !add, hint: hteNames.length ? "Pick an HTE from the list to fill in its supervisor." : undefined })}
                {supervisors ? fld("HTE supervisor", (
                  <select className="uf-input" value={f.supervisor_id ?? ""} onChange={onSupervisor}>
                    <option value="">Not assigned yet</option>
                    {atHte.length > 0 && (
                      <optgroup label={`At ${f.placement}`}>
                        {atHte.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                      </optgroup>
                    )}
                    {atHte.length > 0
                      ? <optgroup label="Other HTEs">{others.map((s) => <option key={s.id} value={String(s.id)}>{s.name}{s.placement ? ` (${s.placement})` : ""}</option>)}</optgroup>
                      : supervisors.map((s) => <option key={s.id} value={String(s.id)}>{s.name}{s.placement ? ` (${s.placement})` : ""}</option>)}
                  </select>
                ), { opt: true, hint: autoSup ? "Filled in from the HTE. You can change it." : undefined }) : <div />}
                {fld("Program", (
                  <select className="uf-input" value={f.program} onChange={set("program")}>
                    {!add && <option value="">Select program</option>}
                    <option value="BSIT - 4">BSIT - 4</option>
                    <option value="BSCS - 4">BSCS - 4</option>
                    <option value="BSIS - 4">BSIS - 4</option>
                  </select>
                ), { hint: `Required hours: ${requiredHoursFor(f.program)}h` })}
                {fld("Semester", (
                  <select className="uf-input" value={f.semester} onChange={set("semester")}>
                    {!add && <option value="">Select semester</option>}
                    <option value="1st Semester">1st Semester</option>
                    <option value="2nd Semester">2nd Semester</option>
                  </select>
                ))}
                {fld("Modality", (
                  <select className="uf-input" value={f.modality || "hte"} onChange={set("modality")}>
                    <option value="hte">Same as the HTE{hteModOf(f) ? ` (${MODALITIES[hteModOf(f)]})` : ""}</option>
                    {Object.entries(MODALITIES).map(([k, l]) => <option key={k} value={k}>{l}{hteModOf(f) && k !== hteModOf(f) ? " (different from the HTE)" : ""}</option>)}
                  </select>
                ), { hint: hteModOf(f) ? "Follows the HTE automatically. Pick another one only for an exception." : "The HTE's modality isn't set yet (Partner HTEs → HTEs & MOAs)." })}
                {fld("Scope", (
                  <select className="uf-input" value={f.scope || "local"} onChange={set("scope")}>
                    {Object.entries(SCOPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                ))}
                {effMod === "virtual"
                  /* a virtual intern never taps the kiosk: each approved online day counts as one official day */
                  ? fld("Time record (DTR)", <span className="uz-none">Not needed. Virtual interns log their days through Submit Online.</span>, { plain: true })
                  : fld("Time record (DTR)", (
                    <select className="uf-input" value={f.dtr_mode || "two"} onChange={set("dtr_mode")}>
                      <option value="two">{DTR_MODES.two}</option>
                      <option value="four">{DTR_MODES.four}</option>
                    </select>
                  ), { hint: "Depends on the intern's HTE." })}
                {fld("System output presentation", (
                  <select className="uf-input" value={outputRequired(f) ? "1" : "0"} onChange={set("output_required")}>
                    <option value="1">Required</option>
                    <option value="0">Not required by the HTE</option>
                  </select>
                ), { hint: "Set from the HTE supervisor. Change it only for this intern." })}
                {fld("Hours from an earlier term", text("prior_hours", { type: "number", min: 0, step: "0.5", placeholder: "0" }),
                  { opt: true, hint: `Already rendered in a past term. The intern needs ${requiredHoursFor(f.program, f.prior_hours)}h more.` })}
                {uidField && fld("NFC card", uidField, { plain: true, full: true })}
              </div>
            </div>
          )}

          {isIntern && (
            <div className="uz-sec">
              <h3>Emergency contact</h3>
              <div className="uz-grid">
                {fld("Full name", text("emergency_contact_name"), { opt: true })}
                {fld("Relationship", text("emergency_contact_relation", { placeholder: "e.g. Mother" }), { opt: true })}
                {fld("Contact number", text("emergency_contact_number", { type: "tel" }), { opt: true })}
                {fld("Address", text("emergency_contact_address"), { opt: true })}
              </div>
            </div>
          )}

          {!isIntern && (
            <div className="uz-sec">
              <h3>Position & signature</h3>
              <div className="uz-grid">
                {fld("Position / job title", text("position", { placeholder: "e.g. OJT Coordinator, CCIS" }), { full: true, opt: true })}
                {onSig && fld("Signature", <SigPicker file={sigFile} onChange={onSig} current={sigCurrent} />, { full: true, plain: true, opt: true, hint: "Used on the DTR and reports. Use a clear photo of the signature on white paper." })}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
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

/* ───────────── Online attendance review (supervisor and OJT coordinator) ─────────────
   Waiting / Reviewed list on the left, the picked day on the right. Fits the window;
   only the list (and long task notes) scroll. onReview(item, "approved"|"rejected", remarks) -> Promise<bool> */
const oaDay = (v) => String(v || "").slice(0, 10);
const oaDate = (v, long) => {
  const d = new Date(oaDay(v) + "T00:00:00+08:00");
  return isNaN(d) ? oaDay(v) : d.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", ...(long ? { year: "numeric" } : {}), timeZone: "Asia/Manila" });
};
const oaStamp = (v) => {
  if (!v) return "—";
  const s = String(v);
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? "" : "+08:00"));
  return isNaN(d) ? "—" : d.toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });
};
/* "Earlier from this intern": fills the free space in the details panel with the intern's other requests.
   rows: [{ id, when, text, badge }] — click one to open it. */
export function OaHistory({ name, rows = [], onPick }) {
  const first = String(name || "this intern").split(" ")[0];
  return (
    <div className="oa-hist">
      <span className="oa-hist-h">Earlier from {first}{rows.length ? ` · ${rows.length}` : ""}</span>
      {rows.length === 0 ? <small className="oa-hist-none">No other requests from {first} yet.</small> : (
        <div className="oa-hist-list">
          {rows.map((r) => (
            <button key={r.id} type="button" className="oa-hist-row" onClick={() => onPick && onPick(r)}>
              <span className="oa-hist-when">{r.when}</span>
              <span className="oa-hist-txt">{r.text}</span>
              {r.badge}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const OA_STATUS = {
  pending:  ["Waiting for supervisor", "pending"],
  endorsed: ["Sent to coordinator", "online"],
  approved: ["Approved", "approved"],
  rejected: ["Rejected", "rejected"],
};
export function OnlineReview({ role = "supervisor", waiting = [], reviewed = [], withSup = [], onReview }) {
  const coord = role !== "supervisor";
  const [view, setView] = useState("waiting");
  const [sel, setSel] = useState(null);
  const [open, setOpen] = useState(false);   // phones: the details replace the list
  const [q, setQ] = useState("");
  const [remarks, setRemarks] = useState({});
  const [busy, setBusy] = useState(null);
  const sq = q.trim().toLowerCase();
  const list = (view === "waiting" ? waiting : view === "sup" ? withSup : reviewed).filter((o) => !sq || String(o.intern_name || "").toLowerCase().includes(sq));
  const cur = list.find((o) => o.id === sel) || null;   // nothing opens by itself: the details show after a click
  const pick = (v) => { setView(v); setSel(null); setOpen(false); setQ(""); };
  const mine = (o) => (coord ? o.status === "endorsed" || o.status === "pending" : o.status === "pending") && view === "waiting";
  const badge = (o) => {
    const [label, type] = view === "sup" ? ["With supervisor", "pending"] : o.status === "pending" && coord ? ["No supervisor", "pending"] : o.status === "pending" ? ["Waiting for you", "pending"] : (OA_STATUS[o.status] || [o.status, "none"]);
    return <Badge label={o.status === "endorsed" && coord && view === "waiting" ? "Waiting for you" : label} type={type} />;
  };
  const decide = async (o, status) => {
    setBusy(o.id + status);
    const ok = await onReview(o, status, remarks[o.id] || "");
    setBusy(null);
    if (ok !== false) { setRemarks((r) => ({ ...r, [o.id]: "" })); setSel(null); setOpen(false); }
  };

  // the 4 steps: intern -> supervisor -> coordinator -> hours counted
  const steps = (o) => {
    const st = o.status;
    const rej = st === "rejected";
    const hasSup = st === "endorsed" || !!o.endorsed_by || !!o.endorser_name || (st === "pending" && !coord);
    const noSup = !hasSup;                                   // no supervisor: the coordinator decides alone
    const supRej = rej && o.rejected_by === "supervisor";
    const supDone = st === "endorsed" || ((st === "approved" || rej) && hasSup && !supRej);
    const list = [
      { t: "Intern sent it", s: "done" },
      noSup ? { t: "No supervisor", s: "skip" }
        : { t: coord ? "Supervisor confirmed" : "You confirm", s: supDone ? "done" : supRej ? "bad" : "now", bad: "Rejected" },
      { t: coord ? "You decide" : "OJT coordinator", s: st === "approved" ? "done" : rej && !supRej ? "bad" : (st === "endorsed" || (noSup && st === "pending")) ? "now" : "", bad: "Rejected" },
      { t: "Hours counted", s: st === "approved" ? "done" : "" },
    ];
    return (
      <ol className="oa-steps">
        {list.map((x, i) => (
          <li key={i} className={x.s}>
            <i>{x.s === "done" ? <Icon name="check" size={11} /> : x.s === "bad" ? <Icon name="x" size={11} /> : x.s === "skip" ? "–" : i + 1}</i>
            <span>{x.s === "bad" ? x.bad : x.t}</span>
          </li>
        ))}
      </ol>
    );
  };

  const outcome = (o) => {
    const rm = o.remarks || o.endorse_remarks;
    const text = o.status === "rejected" ? (coord ? "This day was rejected." : "You rejected this day.")
      : o.status === "endorsed" ? (coord ? "The supervisor confirmed it. Waiting for your decision." : "You confirmed it. Waiting for the OJT coordinator.")
      : o.status === "approved" ? "Approved. The 8 hours are counted."
      : "Waiting for the HTE supervisor to confirm it first.";
    return (
      <div className={o.status === "rejected" ? "oa-done bad" : o.status === "approved" ? "oa-done ok" : "oa-done"}>
        <Icon name={o.status === "rejected" ? "x" : o.status === "approved" ? "check" : "clock"} size={14} />
        <span>{text}{rm ? <> Remarks: <em>{rm}</em></> : null}{o.reviewed_at ? <small> · {oaStamp(o.reviewed_at)}</small> : null}</span>
      </div>
    );
  };

  return (
    <div className={open && cur ? "oa oa-open" : "oa"}>
      <style>{OA_CSS}</style>
      <div className="oa-list">
        <div className="oa-switch" role="tablist" aria-label="Show">
          <button type="button" role="tab" aria-selected={view === "waiting"} className={view === "waiting" ? "on" : ""} onClick={() => pick("waiting")}>
            Waiting <span className={waiting.length ? "oa-n hot" : "oa-n"}>{waiting.length}</span>
          </button>
          {coord && (
            <button type="button" role="tab" aria-selected={view === "sup"} className={view === "sup" ? "on" : ""} onClick={() => pick("sup")}>
              Supervisor <span className="oa-n">{withSup.length}</span>
            </button>
          )}
          <button type="button" role="tab" aria-selected={view === "reviewed"} className={view === "reviewed" ? "on" : ""} onClick={() => pick("reviewed")}>
            Reviewed <span className="oa-n">{reviewed.length}</span>
          </button>
        </div>
        {list.length + (sq ? 99 : 0) > 6 && (
          <div className="oa-search">
            <Icon name="search" size={14} />
            <input type="search" placeholder="Search intern" value={q} onChange={(e) => { setQ(e.target.value); setSel(null); }} aria-label="Search intern" />
          </div>
        )}
        <div className="oa-items" role="list">
          {list.length === 0 ? (
            <div className="oa-none">
              <span className="oa-none-ic"><Icon name="check" size={18} /></span>
              <b>{sq ? "No match" : view === "waiting" ? "All caught up" : "Nothing reviewed yet"}</b>
              <small>{sq ? "Try another name." : view === "waiting" ? "No online days waiting for you." : view === "sup" ? "Nothing is with the supervisor right now." : "Days you approve or reject show here."}</small>
            </div>
          ) : list.map((o) => (
            <button key={o.id} type="button" role="listitem"
              className={cur && cur.id === o.id ? "oa-item on" : "oa-item"}
              onClick={() => { setSel(o.id); setOpen(true); }}>
              <Avatar name={o.intern_name} photo={o.intern_photo} size={34} />
              <span className="oa-who"><b>{o.intern_name}</b><small>{oaDate(o.date)} · 8h</small></span>
              {(view !== "waiting" || (coord && o.status === "pending")) && badge(o)}
            </button>
          ))}
        </div>
      </div>

      <div className="oa-detail">
        {!cur ? (
          <div className="oa-blank">
            <span className="oa-none-ic"><Icon name="inbox" size={20} /></span>
            <b>{list.length ? "Pick an online day" : view === "waiting" ? "No online days waiting" : "Nothing to show yet"}</b>
            <small>{list.length ? "Click an intern on the left to see the details." : view === "waiting" && reviewed.length ? "Open Reviewed to see the days already checked." : "When an intern works online, their day shows here."}</small>
          </div>
        ) : (
          <>
            <button type="button" className="oa-back" onClick={() => setOpen(false)}><Icon name="menu" size={14} /> Back to the list</button>
            <div className="oa-head">
              <Avatar name={cur.intern_name} photo={cur.intern_photo} size={46} />
              <div className="oa-hn"><b>{cur.intern_name}</b><small>Worked online · {oaDate(cur.date, true)}</small></div>
              {badge(cur)}
            </div>
            <div className="oa-kv">
              <div><small>Date</small><b>{oaDate(cur.date)}</b></div>
              <div><small>Counts as</small><b>8 hours</b></div>
              <div><small>Official time</small><b>8:00 AM – 5:00 PM</b></div>
              <div><small>{coord ? "Supervisor" : "Sent"}</small><b>{coord ? (cur.endorser_name || cur.supervisor_name || (cur.status === "pending" ? "None assigned" : "—")) : oaStamp(cur.submitted_at || cur.created_at)}</b></div>
            </div>
            <div className="oa-tasks">
              <span>What they worked on</span>
              <p>{cur.description || "—"}</p>
            </div>
            {steps(cur)}
            <OaHistory name={cur.intern_name}
              rows={[...waiting, ...reviewed].filter((o) => o.id !== cur.id && (o.user_id ? o.user_id === cur.user_id : o.intern_name === cur.intern_name))
                .sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 12)
                .map((o) => ({ id: o.id, when: oaDate(o.date), text: o.description || "Online day", badge: badge(o), item: o }))}
              onPick={(r) => { const w = waiting.some((x) => x.id === r.id); setView(w ? "waiting" : "reviewed"); setQ(""); setSel(r.id); }} />
            {mine(cur) ? (
              <>
                {coord && cur.status === "endorsed" && cur.endorse_remarks && (
                  <div className="oa-done ok"><Icon name="check" size={14} /><span>Supervisor's note: <em>{cur.endorse_remarks}</em></span></div>
                )}
                <div className="oa-act">
                  <input type="text" className="ix-input" placeholder="Remarks (optional)" value={remarks[cur.id] || ""}
                    onChange={(e) => setRemarks((r) => ({ ...r, [cur.id]: e.target.value }))} />
                  <button className="ix-b danger" onClick={() => decide(cur, "rejected")} disabled={!!busy}>{busy === cur.id + "rejected" ? "..." : "Reject"}</button>
                  <button className="ix-b ok" onClick={() => decide(cur, "approved")} disabled={!!busy}>{busy === cur.id + "approved" ? "..." : "Approve"}</button>
                </div>
              </>
            ) : outcome(cur)}
          </>
        )}
      </div>
    </div>
  );
}

export const OA_CSS = `
/* ── Online attendance review (list + details) ── */
.ix-page.lay2 .ix-main:has(.oa) { overflow: hidden !important; display: flex !important; flex-direction: column !important; }
.ix-page.lay2 .ix-main:has(.oa) > .ix-content { flex: 1 1 auto !important; min-height: 0 !important; display: flex !important; flex-direction: column !important; align-self: stretch; width: 100%; box-sizing: border-box; }
.ix-page.lay2 .ix-main:has(.oa) > .ix-content > * { flex: none; }
/* the lists fill the window height (no blank under them) */
.ix-content > .oa { flex: 1 1 auto !important; min-height: 340px; }
.ix-page.lay2 .ix-main:has(.oa) .grp-body { flex: 1 1 auto !important; min-height: 0; display: flex; flex-direction: column; }
.ix-page.lay2 .ix-main:has(.oa) .grp-body > * { flex: none; }
.ix-page.lay2 .ix-main:has(.oa) .grp-body > .oa { flex: 1 1 auto !important; min-height: 340px; }
.oa-switch button:focus:not(:focus-visible) { outline: none; box-shadow: none; }
.oa { display: grid; grid-template-columns: minmax(260px, 320px) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); gap: 16px; min-height: 0; }
.oa-list, .oa-detail { background: #fff; border: 1px solid #e8ebf0; border-radius: 14px; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.oa-switch { display: flex; gap: 4px; padding: 10px; border-bottom: 1px solid #eef0f4; flex: none; }
.oa-switch button { white-space: nowrap; min-width: 0; padding-left: 6px !important; padding-right: 6px !important; gap: 5px !important; font-size: 12.5px !important; }
.oa-switch button { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 8px 10px; border: 0; border-radius: 9px; background: transparent; font: inherit; font-size: 13px; font-weight: 600; color: #64748b; cursor: pointer; line-height: 1.2; }
.oa-switch button:hover { background: #f6f7f9; }
.oa-switch button.on { background: #fff1ea; color: #c2410c; }
.oa-n { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; background: #eef0f4; color: #475569; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; }
.oa-n.hot { background: #ef4444; color: #fff; }
.oa-items { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 6px; contain: size; }
.oa-item { width: 100%; display: flex; align-items: center; gap: 10px; padding: 9px 10px; border: 0; border-left: 3px solid transparent; border-radius: 0 10px 10px 0; background: transparent; text-align: left; font: inherit; cursor: pointer; margin-bottom: 2px; }
.oa-item:hover { background: #f8f9fb; }
.oa-item.on { background: #fff4ee; border-left-color: #ea580c; }
.oa-who { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.25; }
.oa-who b { font-size: 13.5px; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.oa-who small { font-size: 12px; color: #64748b; margin-top: 2px; }
.oa-item .ix-badge, .oa-head .ix-badge { flex: none; }
.oa-none, .oa-blank { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 4px; padding: 26px 14px; line-height: 1.3; }
.oa-blank { flex: 1; min-height: 300px; }
.oa-none b, .oa-blank b { font-size: 14px; color: #0f172a; margin-top: 4px; }
.oa-none small, .oa-blank small { font-size: 12.5px; color: #64748b; max-width: 280px; }
.oa-list { position: relative; }
.oa-items > .oa-none { position: absolute; inset: 0; padding: 0 14px; pointer-events: none; }   /* centered on the whole card, the same spot as the empty message on the right */
.oa-none-ic { width: 38px; height: 38px; border-radius: 50%; background: #e9f8ef; color: #16a34a; display: inline-flex; align-items: center; justify-content: center; }
.oa-blank .oa-none-ic { background: #fff1ea; color: #ea580c; }
.oa-detail { padding: 18px 20px; gap: 14px; overflow-y: auto; }
.oa-back { display: none; }
/* earlier requests of the same intern: takes the free height, scrolls inside if long */
.oa-hist { flex: 1 1 auto; min-height: 64px; display: flex; flex-direction: column; gap: 6px; border-top: 1px solid #eef0f4; padding-top: 10px; overflow: hidden; }
.oa-hist-h { font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #94a3b8; flex: none; }
.oa-hist-none { font-size: 12.5px; color: #94a3b8; }
.oa-hist-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
.oa-hist-row { display: flex; align-items: center; gap: 12px; padding: 7px 8px; border: 0; border-radius: 8px; background: transparent; font: inherit; text-align: left; cursor: pointer; line-height: 1.25; }
.oa-hist-row:hover { background: #f8f9fb; }
.oa-hist-when { flex: none; width: 92px; font-size: 12.5px; font-weight: 600; color: #334155; }
.oa-hist-txt { flex: 1; min-width: 0; font-size: 12.5px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.oa-hist-row .ix-badge { flex: none; }
.oa-detail > .oa-hist + .oa-act, .oa-detail > .oa-hist + .ot-act, .oa-detail > .oa-hist + .oa-done { margin-top: 0; }

/* photos: no orange ring around the picture */
:is(.oa, .mv2) .ix-av:has(img) { background: transparent !important; box-shadow: none !important; border: 0 !important; padding: 0 !important; }
:is(.oa, .mv2) .ix-av img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; border: 0 !important; box-shadow: none !important; padding: 0 !important; margin: 0 !important; }
/* one even gap between the parts of the details */
.oa-detail { gap: 12px; }
.oa-head { display: flex; align-items: center; gap: 12px; flex: none; }
.oa-head > .oa-hn { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.25; }
.oa-head b { font-size: 16px; color: #0f172a; }
.oa-head small { font-size: 12.5px; color: #64748b; margin-top: 3px; }
.oa-kv { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; flex: none; }
.oa-kv > div { border: 1px solid #eef0f4; background: #fafbfc; border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; line-height: 1.2; min-width: 0; }
.oa-kv small { font-size: 11.5px; color: #64748b; }
.oa-kv b { font-size: 14px; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.oa-tasks { border: 1px solid #eef0f4; border-radius: 10px; padding: 10px 14px; flex: 0 1 auto; min-height: 58px; max-height: 40vh; overflow-y: auto; box-sizing: border-box; }
/* the buttons / result sit at the bottom of the panel */
.oa-detail > .oa-act, .oa-detail > .ot-act, .oa-detail > .oa-done:last-child { margin-top: auto; }
.oa-tasks span { display: block; font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #94a3b8; margin-bottom: 6px; }
.oa-tasks p { margin: 0; font-size: 14px; line-height: 1.55; color: #1e293b; white-space: pre-wrap; }
.oa-steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; flex: none; }
.oa-steps li { position: relative; display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: #94a3b8; line-height: 1.2; min-width: 0; }
.oa-steps li span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.oa-steps i { flex: none; width: 22px; height: 22px; border-radius: 50%; background: #eef0f4; color: #64748b; font-style: normal; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
.oa-steps li.done { color: #15803d; } .oa-steps li.done i { background: #16a34a; color: #fff; }
.oa-steps li.now { color: #c2410c; font-weight: 600; } .oa-steps li.now i { background: #ea580c; color: #fff; }
.oa-steps li.bad { color: #b91c1c; font-weight: 600; } .oa-steps li.bad i { background: #ef4444; color: #fff; }
.oa-act { display: flex; align-items: center; gap: 8px; padding-top: 14px; border-top: 1px solid #eef0f4; flex: none; }
.oa-act .ix-input { flex: 1; min-width: 0; }
.oa-act .ix-b { flex: none; }
.oa-done { display: flex; align-items: flex-start; gap: 8px; padding: 12px 14px; border-radius: 10px; background: #f6f7f9; font-size: 13px; color: #334155; line-height: 1.45; flex: none; }
.oa-done svg { margin-top: 2px; flex: none; }
.oa-done.ok { background: #effaf3; color: #166534; } .oa-done.bad { background: #fef2f2; color: #991b1b; }
.oa-done small { color: #64748b; }
.oa-steps li.skip { color: #94a3b8; } .oa-steps li.skip i { background: #f1f5f9; color: #94a3b8; }
.oa-search { display: flex; align-items: center; gap: 8px; margin: 8px 10px 0; padding: 0 10px; height: 34px; border: 1px solid #e5e7eb; border-radius: 9px; color: #94a3b8; flex: none; }
.oa-search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font: inherit; font-size: 13px; color: #0f172a; }
/* shorter windows: tighter spacing so the whole request fits without scrolling */
@media (max-height: 900px) {
  .oa-detail { gap: 12px; padding: 16px 18px; }
  .oa-kv > div { padding: 7px 12px; gap: 2px; }
  .oa-head b { font-size: 15px; } .oa-head .ix-avatar, .oa-head img { width: 40px !important; height: 40px !important; }
  .oa-tasks { padding: 8px 12px; } .oa-tasks span { margin-bottom: 3px; }
  .oa-done { padding: 9px 12px; }
  .oa-act { padding-top: 10px; }
}
@media (max-height: 700px) { .oa-detail { gap: 10px; padding: 14px 16px; } }
@media (max-width: 1100px) { .oa-kv { grid-template-columns: repeat(2, minmax(0, 1fr)); } .oa-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 760px) {
  .ix-page.lay2 .ix-main:has(.oa) { overflow: auto !important; }
  .oa { grid-template-columns: 1fr; }
  .oa .oa-detail { display: none; }
  .oa-items { contain: none; }
  .oa-detail { overflow: visible; } .oa-tasks { max-height: none; flex: none; }
  .oa.oa-open .oa-list { display: none; }
  .oa.oa-open .oa-detail { display: flex; }
  .oa-back { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; border: 0; background: none; padding: 0; font: inherit; font-size: 13px; font-weight: 600; color: #ea580c; cursor: pointer; }
  .oa-act { flex-wrap: wrap; } .oa-act .ix-input { flex: 1 1 100%; }
}
`;

/* Overtime: waiting / reviewed list on the left, the picked day on the right with a bar of the day
   (regular hours green, after 5:00 PM orange) and quick credit buttons. */
const otMins = (v) => {
  if (!v) return null;
  const d = new Date(String(v).includes("T") ? v : String(v).replace(" ", "T") + "+08:00");
  if (isNaN(d)) return null;
  const t = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Manila" });
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const otClock = (v) => (v ? new Date(v).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }) : "—");
const otStamp = (v) => {
  if (!v) return "—";
  const s = String(v);
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? "" : "+08:00"));
  return isNaN(d) ? "—" : d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
};
const otDay = (v, long) => {
  const d = new Date(String(v).slice(0, 10) + "T00:00:00+08:00");
  return isNaN(d) ? String(v).slice(0, 10) : d.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", ...(long ? { year: "numeric" } : {}), timeZone: "Asia/Manila" });
};

export function OvertimeBoard({ role = "coordinator", waiting = [], reviewed = [], withSup = [], all = [], capOf = (o) => o.ot_minutes, onReview }) {
  const coord = role !== "supervisor";
  const [minutes, setMinutes] = useState({});
  const [remarks, setRemarks] = useState({});
  const [processing, setProcessing] = useState(null);
  const decide = async (o, status, credit) => {
    setProcessing(o.id + status);
    const ok = await onReview(o, status, credit, remarks[o.id] || "");
    setProcessing(null);
    if (ok) { setSel(null); setOpen(false); }
  };
  const [view, setView] = useState("waiting");
  const [sel, setSel] = useState(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const sq = q.trim().toLowerCase();
  const list = (view === "waiting" ? waiting : view === "sup" ? withSup : reviewed).filter((o) => !sq || String(o.intern_name || "").toLowerCase().includes(sq));
  const cur = list.find((o) => o.id === sel) || null;   // nothing opens by itself: the details show after a click
  const pick = (v) => { setView(v); setSel(null); setOpen(false); setQ(""); };
  const mine = cur && view === "waiting";

  // this month's approved overtime of the same intern
  const monthTotal = cur ? all.filter((o) => o.user_id === cur.user_id && o.ot_status === "approved"
    && String(o.date).slice(0, 7) === String(cur.date).slice(0, 7)).reduce((n, o) => n + (Number(o.ot_approved_minutes) || 0), 0) : 0;

  // the day bar: 7:00 AM to whichever is later, 7:00 PM or time out
  const bar = (o) => {
    const tin = otMins(o.checked_in_at) ?? 480;
    const tout = otMins(o.checked_out_at) ?? (1020 + (Number(o.ot_minutes) || 0));
    const from = Math.min(420, tin), to = Math.max(1140, tout + 30), span = to - from;
    const pct = (m) => `${((m - from) / span) * 100}%`;
    return (
      <div className="ot-day">
        <div className="ot-bar">
          <i className="reg" style={{ left: pct(tin), width: `calc(${pct(Math.min(tout, 1020))} - ${pct(tin)})` }} />
          {tout > 1020 && <i className="ot" style={{ left: pct(1020), width: `calc(${pct(tout)} - ${pct(1020)})` }} />}
          <span className="ot-five" style={{ left: pct(1020) }} />
        </div>
        <div className="ot-ticks">
          <span style={{ left: pct(tin) }}>In {otClock(o.checked_in_at)}</span>
          <span style={{ left: pct(1020) }} className="mid">5:00 PM</span>
          <span style={{ left: pct(tout) }} className="end">Out {otClock(o.checked_out_at)}</span>
        </div>
      </div>
    );
  };

  const steps = (o) => {
    const st = o.ot_status;
    const rej = st === "rejected";
    const supOk = st === "endorsed" || Number(o.ot_endorsed_minutes) > 0;
    const hasSup = supOk || !!o.supervisor_id || !!o.ot_endorsed_at || !coord;
    const supRej = rej && hasSup && !supOk;
    const L = [
      { t: "Stayed after 5 PM", s: "done" },
      !hasSup ? { t: "No supervisor", s: "skip" } : { t: coord ? "Supervisor approved" : "You approve", s: supOk ? "done" : supRej ? "bad" : "now" },
      { t: coord ? "You decide" : "OJT coordinator", s: st === "approved" ? "done" : rej && !supRej ? "bad" : st === "endorsed" || (!hasSup && st === "pending") ? "now" : "" },
      { t: "Added to hours", s: st === "approved" ? "done" : "" },
    ];
    return (
      <ol className="oa-steps">
        {L.map((x, i) => (
          <li key={i} className={x.s}>
            <i>{x.s === "done" ? <Icon name="check" size={11} /> : x.s === "bad" ? <Icon name="x" size={11} /> : x.s === "skip" ? "–" : i + 1}</i>
            <span>{x.s === "bad" ? "Rejected" : x.t}</span>
          </li>
        ))}
      </ol>
    );
  };

  const otBadge = (o, long) => o.ot_status === "pending" ? <Badge label="With supervisor" type="pending" /> : o.ot_status === "approved" ? <Badge label={long ? "Approved" : `+${fmtMinutes(o.ot_approved_minutes)}`} type="approved" />
    : o.ot_status === "endorsed" ? <Badge label={long ? "Sent to coordinator" : `${fmtMinutes(o.ot_endorsed_minutes)} sent`} type="online" />
    : <Badge label="Rejected" type="rejected" />;
  const capM = cur ? capOf(cur) : 0;
  const choice = cur ? minutes[cur.id] : undefined;          // undefined/"" = all, a number, or "other"
  const credit = choice === undefined || choice === "" ? capM : choice === "other" ? "" : Number(choice);
  const quick = [capM, 60, 30].filter((m, i, a) => m > 0 && m <= capM && a.indexOf(m) === i);

  return (
    <div className={open && cur ? "oa ot2 oa-open" : "oa ot2"}>
      <style>{OA_CSS}</style>
      <style>{OT2_CSS}</style>
      <div className="oa-list">
        <div className="oa-switch" role="tablist" aria-label="Show">
          <button type="button" role="tab" aria-selected={view === "waiting"} className={view === "waiting" ? "on" : ""} onClick={() => pick("waiting")}>
            Waiting <span className={waiting.length ? "oa-n hot" : "oa-n"}>{waiting.length}</span>
          </button>
          {coord && (
            <button type="button" role="tab" aria-selected={view === "sup"} className={view === "sup" ? "on" : ""} onClick={() => pick("sup")}>
              Supervisor <span className="oa-n">{withSup.length}</span>
            </button>
          )}
          <button type="button" role="tab" aria-selected={view === "reviewed"} className={view === "reviewed" ? "on" : ""} onClick={() => pick("reviewed")}>
            Reviewed <span className="oa-n">{reviewed.length}</span>
          </button>
        </div>
        {(view === "waiting" ? waiting : view === "sup" ? withSup : reviewed).length > 6 && (
          <div className="oa-search"><Icon name="search" size={14} />
            <input type="search" placeholder="Search intern" value={q} onChange={(e) => { setQ(e.target.value); setSel(null); }} aria-label="Search intern" /></div>
        )}
        <div className="oa-items" role="list">
          {list.length === 0 ? (
            <div className="oa-none">
              <span className="oa-none-ic"><Icon name="check" size={18} /></span>
              <b>{sq ? "No match" : view === "waiting" ? "All caught up" : view === "sup" ? "Nothing here" : "Nothing reviewed yet"}</b>
              <small>{sq ? "Try another name." : view === "waiting" ? "No overtime waiting for you." : view === "sup" ? "Nothing is with the supervisor right now." : "Overtime you approve or reject shows here."}</small>
            </div>
          ) : list.map((o) => (
            <button key={o.id} type="button" role="listitem" className={cur && cur.id === o.id ? "oa-item on" : "oa-item"}
              onClick={() => { setSel(o.id); setOpen(true); }}>
              <Avatar name={o.intern_name} photo={o.intern_photo} size={34} />
              <span className="oa-who"><b>{o.intern_name}</b><small>{otDay(o.date)} · out {otClock(o.checked_out_at)}</small></span>
              {view !== "reviewed" ? <span className="ot-tag">{fmtMinutes(capOf(o))}</span>
                : otBadge(o)}
            </button>
          ))}
        </div>
      </div>

      <div className="oa-detail">
        {!cur ? (
          <div className="oa-blank">
            <span className="oa-none-ic"><Icon name="clock" size={20} /></span>
            <b>{list.length ? "Pick an overtime request" : view === "waiting" ? "No overtime waiting" : "Nothing to show yet"}</b>
            <small>{list.length ? "Click an intern on the left to see the details." : view === "waiting" && reviewed.length ? "Open Reviewed to see the overtime already checked." : "Time after 5:00 PM shows here once the supervisor approves it."}</small>
          </div>
        ) : (
          <>
            <button type="button" className="oa-back" onClick={() => setOpen(false)}><Icon name="menu" size={14} /> Back to the list</button>
            <div className="oa-head">
              <Avatar name={cur.intern_name} photo={cur.intern_photo} size={46} />
              <div className="oa-hn"><b>{cur.intern_name}</b><small>Overtime · {otDay(cur.date, true)}</small></div>
              {view === "sup" ? <Badge label="With supervisor" type="pending" /> : view === "waiting" ? (coord && cur.ot_status === "pending" ? <Badge label="No supervisor" type="pending" /> : <Badge label="Waiting for you" type="pending" />)
                : otBadge(cur, true)}
            </div>
            {bar(cur)}
            <div className="oa-kv">
              <div><small>After 5:00 PM</small><b>{fmtMinutes(cur.ot_minutes)}</b></div>
              {coord ? (
                <div><small>Supervisor approved</small><b>{Number(cur.ot_endorsed_minutes) > 0 ? fmtMinutes(cur.ot_endorsed_minutes) : cur.supervisor_id ? "—" : "No supervisor"}</b></div>
              ) : (
                <div><small>{view === "waiting" ? "Time out" : "You approved"}</small><b>{view === "waiting" ? otClock(cur.checked_out_at) : Number(cur.ot_endorsed_minutes) > 0 ? fmtMinutes(cur.ot_endorsed_minutes) : "—"}</b></div>
              )}
              <div><small>{view === "waiting" ? "This month so far" : "Credited"}</small><b>{view === "waiting" ? (monthTotal ? fmtMinutes(monthTotal) : "None yet") : cur.ot_status === "approved" ? fmtMinutes(cur.ot_approved_minutes) : cur.ot_status === "endorsed" ? "Not yet" : "—"}</b></div>
              <div><small>{view === "waiting" ? (coord ? "Supervisor" : "Sent") : "Reviewed"}</small><b>{view === "waiting" ? (coord ? (cur.endorser_name || cur.supervisor_name || "None assigned") : otStamp(cur.created_at || cur.checked_out_at)) : otStamp(cur.ot_reviewed_at || cur.ot_endorsed_at)}</b></div>
            </div>
            {coord && cur.ot_endorse_remarks && (
              <div className="oa-done ok"><Icon name="check" size={14} /><span>Supervisor's note: <em>{cur.ot_endorse_remarks}</em></span></div>
            )}
            {steps(cur)}
            <OaHistory name={cur.intern_name}
              rows={[...waiting, ...reviewed].filter((o) => o.id !== cur.id && o.user_id === cur.user_id)
                .sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 12)
                .map((o) => ({ id: o.id, when: otDay(o.date), text: `${fmtMinutes(o.ot_minutes)} after 5 PM · out ${otClock(o.checked_out_at)}`,
                  badge: waiting.some((x) => x.id === o.id) ? <Badge label="Waiting" type="pending" /> : otBadge(o) }))}
              onPick={(r) => { const w = waiting.some((x) => x.id === r.id); setView(w ? "waiting" : "reviewed"); setQ(""); setSel(r.id); }} />
            {mine ? (
              <div className="ot-act">
                <div className="ot-credit">
                  <span className="ot-cl">Credit</span>
                  {quick.map((m, i) => (
                    <button key={m} type="button" className={choice !== "other" && credit === m ? "on" : ""}
                      onClick={() => setMinutes((mm) => ({ ...mm, [cur.id]: i === 0 ? "" : m }))}>
                      {i === 0 ? `All ${fmtMinutes(m)}` : fmtMinutes(m)}
                    </button>
                  ))}
                  <button type="button" className={choice === "other" || (choice !== undefined && choice !== "" && !quick.includes(Number(choice))) ? "on" : ""}
                    onClick={() => setMinutes((mm) => ({ ...mm, [cur.id]: "other" }))}>Other</button>
                  {(choice === "other" || (choice !== undefined && choice !== "" && !quick.includes(Number(choice)))) && (
                    <input type="number" className="ix-input ot-min" min={1} max={capM} placeholder="minutes" autoFocus
                      aria-label="Minutes to credit" value={choice === "other" ? "" : choice}
                      onChange={(e) => setMinutes((mm) => ({ ...mm, [cur.id]: e.target.value === "" ? "other" : e.target.value }))} />
                  )}
                  <small className="ot-hint">{coord ? `Up to ${fmtMinutes(capM)}. Added on top of the 8 official hours.` : `Up to ${fmtMinutes(capM)}. The OJT coordinator gives the final decision.`}</small>
                </div>
                <div className="oa-act">
                  <input type="text" className="ix-input" placeholder="Remarks (optional)" value={remarks[cur.id] || ""}
                    onChange={(e) => setRemarks((r) => ({ ...r, [cur.id]: e.target.value }))} />
                  <button className="ix-b danger" onClick={() => decide(cur, "rejected", null)} disabled={!!processing}>
                    {processing === cur.id + "rejected" ? "..." : "Reject"}</button>
                  <button className="ix-b ok" onClick={() => decide(cur, "approved", credit)} disabled={!!processing || !credit}>
                    {processing === cur.id + "approved" ? "..." : `Approve${credit ? " " + fmtMinutes(credit) : ""}`}</button>
                </div>
              </div>
            ) : (
              <div className={cur.ot_status === "rejected" ? "oa-done bad" : cur.ot_status === "endorsed" || cur.ot_status === "pending" ? "oa-done" : "oa-done ok"}>
                <Icon name={cur.ot_status === "rejected" ? "x" : cur.ot_status === "endorsed" || cur.ot_status === "pending" ? "clock" : "check"} size={14} />
                <span>{cur.ot_status === "pending" ? "Waiting for the HTE supervisor to approve it first." : cur.ot_status === "rejected" ? "Rejected. No overtime added." : cur.ot_status === "endorsed" ? `You approved ${fmtMinutes(cur.ot_endorsed_minutes)}. Waiting for the OJT coordinator.` : `Approved. ${fmtMinutes(cur.ot_approved_minutes)} added to that day.`}
                  {(cur.ot_remarks || cur.ot_endorse_remarks) ? <> Remarks: <em>{cur.ot_remarks || cur.ot_endorse_remarks}</em></> : null}
                  {cur.reviewer_name ? <small> · {cur.reviewer_name}</small> : null}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const OT2_CSS = `
.ix-page.lay2 .ix-main:has(.ot2) .grp-body { flex: 1 1 auto !important; min-height: 0; display: flex; flex-direction: column; }
.ix-page.lay2 .ix-main:has(.ot2) .grp-body > * { flex: none; }
.ot-tag { flex: none; font-size: 11.5px; font-weight: 700; color: #b45309; background: #fff4e5; padding: 3px 8px; border-radius: 6px; }
.ot-day { flex: none; padding: 20px 2px 0; }
.ot-bar { position: relative; height: 16px; border-radius: 8px; background: #eef0f4; }
.ot-bar i { position: absolute; top: 0; bottom: 0; }
.ot-bar i.reg { background: #86d0a0; border-radius: 8px 0 0 8px; }
.ot-bar i.ot { background: #f59e0b; border-radius: 0 8px 8px 0; }
.ot-five { position: absolute; top: -4px; bottom: -4px; width: 2px; margin-left: -1px; background: #334155; border-radius: 1px; }
.ot-ticks { position: relative; height: 18px; margin-top: 6px; font-size: 11.5px; color: #64748b; }
.ot-ticks span { position: absolute; top: 0; white-space: nowrap; transform: translateX(0); }
.ot-ticks span.mid { top: -46px; transform: translateX(-50%); font-weight: 600; color: #334155; }
.ot-ticks span.end { transform: translateX(-100%); color: #b45309; font-weight: 600; }
.ot-act { display: flex; flex-direction: column; gap: 10px; padding-top: 12px; border-top: 1px solid #eef0f4; flex: none; }
.ot-act .oa-act { padding-top: 0; border-top: 0; }
.ot-credit { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ot-cl { font-size: 12.5px; font-weight: 600; color: #475569; margin-right: 4px; }
.ot-credit > button { border: 1px solid #e2e8f0; background: #fff; font: inherit; font-size: 12.5px; font-weight: 600; color: #334155; padding: 6px 12px; border-radius: 8px; cursor: pointer; }
.ot-credit > button:hover { border-color: #fdba74; }
.ot-credit > button.on { border-color: #ea580c; background: #fff4ee; color: #c2410c; }
.ot-credit .ot-min { width: 100px; padding: 6px 10px; }
.ot-hint { font-size: 12px; color: #94a3b8; margin-left: 6px; }
@media (max-width: 760px) {
  .ix-page.lay2 .ix-main:has(.ot2) .grp-body, .ix-page.lay2 .ix-main:has(.ot2) .grp-body > .oa { flex: none !important; }
  .ot-hint { flex-basis: 100%; margin-left: 0; }
}
`;



/* Monitor Interns: a compact list on the left, the selected intern's details on the right
   (like an inbox). On phones the list shows first; tapping an intern opens the details. */
export function InternMonitor({ interns, records, loading, onRefresh, recordsPath = null, movsPath = null, canViewFiles = false, hideHte = false, hideArr = false }) {
  const today = todayManila();
  const navigate = useNavigate();
  const location = useLocation();
  const [q, setQ] = useState(() => location.state?.search || "");   // a name sent from the dashboard opens that intern
  const [status, setStatus] = useState("all");       // all | in | out
  const [program, setProgram] = useState("all");
  const [hte, setHte] = useState("all");
  const [arr, setArr] = useState("all");             // all | m:onsite|hybrid|virtual | s:local|inbound|outbound
  const [groupBy, setGroupBy] = useState("none");     // none | hte
  const [selectedId, setSelectedId] = useState(null);
  const [showDetail, setShowDetail] = useState(false); // phones: details instead of the list

  const sq = q.trim().toLowerCase();
  // university No-OJT days: they don't count as absent
  const [holidays, setHolidays] = useState({});
  useEffect(() => {
    fetch(`${API}/calendar`, { headers: { Accept: "application/json" } }).then((r) => r.json()).then((list) => {
      if (!Array.isArray(list)) return;
      const m = {}; list.forEach((e) => { if (e.off !== false && !e.hte_key) m[String(e.date).slice(0, 10)] = true; });
      setHolidays(m);
    }).catch(() => {});
  }, []);
  const shiftDay = (iso, n) => new Date(new Date(iso + "T12:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);
  const weekend = (iso) => { const d = new Date(iso + "T12:00:00Z").getUTCDay(); return d === 0 || d === 6; };
  const rows = interns.map((u) => {
    const recs = records.filter((r) => r.user_id === u.id);
    // what needs the coordinator's attention for this intern
    const flags = [];
    const open = recs.some((r) => r.date < today && r.date >= shiftDay(today, -7) && r.uid !== "ONLINE" && r.action === "CHECK_IN" && !r.checked_out_at);
    if (open) flags.push({ k: "amber", t: "No time out" });
    if (recs.length) {
      const have = new Set(recs.map((r) => r.date));
      let n = 0, d = shiftDay(today, -1);
      for (let i = 0; i < 60; i++, d = shiftDay(d, -1)) { if (weekend(d) || holidays[d]) continue; if (have.has(d)) break; n++; }
      if (n >= 3) flags.push({ k: "red", t: `Absent ${n >= 60 ? "60+" : n} days` });
    }
    const todaySessions = sessionsByDate(recs.filter((r) => r.date === today))[today] || [];
    const isIn = recs.some((r) => r.date === today && r.uid !== "ONLINE" && r.action === "CHECK_IN" && !r.checked_out_at);
    const tIn = todaySessions[0]?.in;
    const tOut = [...todaySessions].reverse().find((x) => x.out)?.out;
    const hrs = calcHours(recs);
    return { u, isIn, tIn, tOut, flags, hours: hrs, required: requiredHoursFor(u.program, u.prior_hours) };
  });
  const inCount = rows.filter((x) => x.isIn).length;
  const htes = [...new Set(interns.map((u) => (u.placement || "").trim()).filter(Boolean))].sort();
  const shown = rows
    .filter((x) => program === "all" || programKey(x.u.program) === program)
    .filter((x) => status === "all" || (status === "attn" ? x.flags.length > 0 : status === "in" ? x.isIn : !x.isIn))
    .filter((x) => hte === "all" || (x.u.placement || "").trim() === hte)
    .filter((x) => arr === "all" || (arr.startsWith("m:") ? modalityOf(x.u) === arr.slice(2) : scopeOf(x.u) === arr.slice(2)))
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
  // "Group by HTE": the same cards, under one heading per HTE
  const groups = (() => {
    const m = new Map();
    shown.forEach((x) => {
      const name = (x.u.placement || "").trim() || "No placement yet";
      if (!m.has(name)) m.set(name, { key: name, name, sup: "", rows: [] });
      const g = m.get(name); g.rows.push(x); if (!g.sup && x.u.supervisor_name) g.sup = x.u.supervisor_name;
    });
    return [...m.values()].sort((a, b) => (a.name === "No placement yet") - (b.name === "No placement yet") || a.name.localeCompare(b.name));
  })();
  const card = (x) => {
  const pct = Math.min(100, Math.round((x.hours / (x.required || 1)) * 100));
  return (
    <div key={x.u.id} className="ix-ic clickable imc" role="button" tabIndex={0}
      aria-label={`View the summary of ${x.u.name}`}
      onClick={() => open(x.u)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(x.u); } }}>
      <div className="ix-ic-top">
        <Avatar name={x.u.name} photo={x.u.photo} status={portalOnline(x.u) ? "on" : "off"} />
        <div className="ix-ic-id">
          <strong>{x.u.name}</strong>
          <span>{[programKey(x.u.program), x.u.placement || x.u.email].filter(Boolean).join(" · ")}</span>
          {(modalityOf(x.u) !== "onsite" || scopeOf(x.u) !== "local" || x.flags.length > 0) && (
            <span className="imc-tags">
              {x.flags.map((f) => <em key={f.t} className={`imc-tag a-${f.k}`}>{f.t}</em>)}
              {modalityOf(x.u) !== "onsite" && <em className={`imc-tag m-${modalityOf(x.u)}`}>{MODALITIES[modalityOf(x.u)]}</em>}
              {scopeOf(x.u) !== "local" && <em className="imc-tag s">{SCOPES[scopeOf(x.u)]}</em>}
            </span>
          )}
        </div>
        <Badge label={x.isIn ? "Present now" : "Not in"} type={x.isIn ? "in" : "out"} />
      </div>
      <div className="ix-ic-stats">
        <div><strong>{`${x.hours}h`}</strong><span>{`of ${x.required}h · ${pct}%`}</span></div>
        <div><strong>{x.isIn ? hm(x.tIn) : x.tOut ? hm(x.tOut) : "—"}</strong><span>{x.isIn ? "time in today" : x.tOut ? "time out today" : "no tap today"}</span></div>
      </div>
      <div className="imc-bar" aria-hidden="true"><i style={{ width: pct + "%" }} /></div>
    </div>
  );
  };
  const todayText = (x) => x.isIn ? `In ${hm(x.tIn)}` : x.tOut ? `Out ${hm(x.tOut)}` : "Not in";
  // the interns shown (with the filters), as a CSV for Excel / Google Sheets
  const exportList = () => {
    const cell = (v) => { const t = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const head = ["Intern", "Student ID", "Program", "HTE", "HTE supervisor", "Modality", "Scope", "Hours rendered", "Required hours", "Progress (%)", "Today", "Needs attention"];
    const body = shown.map((x) => [x.u.name, x.u.student_id || "", programKey(x.u.program) || x.u.program || "", x.u.placement || "", x.u.supervisor_name || "",
      MODALITIES[modalityOf(x.u)], SCOPES[scopeOf(x.u)], x.hours, x.required, Math.min(100, Math.round((x.hours / (x.required || 1)) * 100)),
      todayText(x), x.flags.map((f) => f.t).join("; ")]);
    const blob = new Blob(["\uFEFF" + [head, ...body].map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `Interns_${today}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  return (
    <>
      <PageHeader title="Monitor Interns" sub="Real-time status of all interns." live />
      <div className={showDetail ? "mon show-detail" : "mon"}>
        <div className="mon-bar">
          <div className="ix-search mon-search">
            <Icon name="search" size={15} />
            <input type="text" placeholder="Search name, ID or placement..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {!hideHte && (
            <select className="ix-select mon-filter" value={hte} onChange={(e) => setHte(e.target.value)} aria-label="Filter by HTE">
              <option value="all">All HTEs</option>
              {htes.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          )}
          {!hideArr && (
            <select className="ix-select mon-filter" value={arr} onChange={(e) => setArr(e.target.value)} aria-label="Filter by modality or scope">
              <option value="all">All modalities</option>
              <optgroup label="Modality">
                {Object.entries(MODALITIES).map(([k, l]) => <option key={k} value={`m:${k}`}>{l} ({rows.filter((x) => modalityOf(x.u) === k).length})</option>)}
              </optgroup>
              <optgroup label="Scope">
                {Object.entries(SCOPES).map(([k, l]) => <option key={k} value={`s:${k}`}>{l} ({rows.filter((x) => scopeOf(x.u) === k).length})</option>)}
              </optgroup>
            </select>
          )}
          <span className="mon-chip on mon-count">{shown.length} shown</span>
          <button type="button" className="ix-b ghost sm mon-exp ix-exp" disabled={!shown.length} onClick={exportList} title="Save the interns shown for Excel / Google Sheets">
            <Icon name="download" size={14} /> Export
          </button>
        </div>
        {/* the filters with a few choices: one click each (same switch as the other pages) */}
        <div className="mon-bar2">
          <div className="so-tabs" role="tablist" aria-label="Filter by status">
            {[["all", "All", rows.length], ["in", "On duty", inCount], ["out", "Not in", rows.length - inCount], ["attn", "Needs attention", rows.filter((x) => x.flags.length).length]].map(([k, l, n]) => (
              <button key={k} type="button" role="tab" aria-selected={status === k} className={status === k ? "on" : ""} onClick={() => setStatus(k)}>{l} · {n}</button>
            ))}
          </div>
          <div className="so-tabs" role="tablist" aria-label="Filter by program">
            {[["all", "All programs"], ["BSIT", "BSIT"], ["BSCS", "BSCS"], ["BSIS", "BSIS"]].map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={program === k} className={program === k ? "on" : ""} onClick={() => setProgram(k)}>
                {l}{k !== "all" ? ` · ${rows.filter((x) => programKey(x.u.program) === k).length}` : ""}</button>
            ))}
          </div>
          <div className="so-tabs mon-group" role="tablist" aria-label="Group interns">
            {[["none", "List"], ["hte", "By HTE"]].map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={groupBy === k} className={groupBy === k ? "on" : ""} onClick={() => setGroupBy(k)}>{l}</button>
            ))}
          </div>
        </div>

        {loading ? <Spinner /> : selected && showDetail ? (
          /* one intern: the summary details, with a way back to all the cards */
          <div className="imc-detail">
            {/* header bar: the way back (same link as the other detail pages) and whose profile this is */}
            <div className="imc-head">
              <button type="button" className="imc-back" onClick={() => { setShowDetail(false); setSelectedId(null); }}>
                <Icon name="menu" size={14} /> Back to the list
              </button>
              <span className="imc-head-t"><b>{selected.name}</b><small>Intern profile</small></span>
            </div>
            <InternProfile
              key={selected.id} u={selected} records={records} today={today} canViewFiles={canViewFiles}
              onClose={() => { setSelectedId(null); setShowDetail(false); }}
              onViewRecords={recordsPath ? () => navigate(recordsPath, { state: { search: selected.name } }) : null}
              onReviewFiles={movsPath ? () => navigate(movsPath, { state: { movIntern: selected.id } }) : null}
            />
          </div>
        ) : shown.length === 0 ? (
          <div className="ix-card"><Empty icon="users" title="No interns found" /></div>
        ) : (
          /* every intern as a card; click one to see the summary */
          <div className="imc-wrap">
            {(groupBy === "hte" ? groups : [{ key: "all", name: null, rows: shown }]).map((g) => (
              <div key={g.key} className="imc-sec">
                {g.name !== null && (
                  <div className="imc-gh">
                    <b>{g.name}</b>
                    <span>{g.sup ? `Supervisor: ${g.sup}` : "No supervisor assigned"}</span>
                    <em>{g.rows.length} intern{g.rows.length === 1 ? "" : "s"} · {g.rows.filter((x) => x.isIn).length} on duty</em>
                  </div>
                )}
                <div className="ix-intern-grid imc-grid">
                  {g.rows.map((x) => card(x))}
                </div>
              </div>
            ))}
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
export function AnnouncementBoard({ limit = 20 }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tip, setTip] = useState(null);                 // { a, el }: the hover card for a long announcement
  const tipRef = useRef(null);
  // every announcement shows its full text on hover
  const showTip = (a) => (e) => setTip({ a, el: e.currentTarget });
  // put the card beside the announcement (left, since the panel is on the right; right if there is no room), inside the window
  useLayoutEffect(() => {
    const t = tipRef.current;
    if (!t || !tip?.el || !tip.el.isConnected) return;
    const z = currentFit();
    const r = tip.el.getBoundingClientRect();
    const vw = window.innerWidth / z, vh = window.innerHeight / z;
    const w = t.offsetWidth, h = t.offsetHeight;
    let left = r.left / z - 12 - w;
    if (left < 8) left = Math.min(r.right / z + 12, vw - w - 8);
    t.style.left = Math.max(8, left) + "px";
    t.style.top = Math.min(Math.max(8, r.top / z), Math.max(8, vh - h - 8)) + "px";
    t.style.visibility = "visible";
  });
  useEffect(() => {
    if (!tip) return undefined;
    const off = () => setTip(null);
    window.addEventListener("scroll", off, true);
    window.addEventListener("resize", off);
    return () => { window.removeEventListener("scroll", off, true); window.removeEventListener("resize", off); };
  }, [tip]);

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
        <ul className="ann-list ann-two">
          {items.slice(0, Math.max(limit, 20)).map((a) => (
            <li key={a.id} tabIndex={0} onMouseEnter={showTip(a)} onFocus={showTip(a)} onMouseLeave={() => setTip(null)} onBlur={() => setTip(null)}>
              <strong>{a.title}</strong>
              <p>{a.body}</p>
            </li>
          ))}
        </ul>
      )}
      {tip && createPortal(
        <div ref={tipRef} className="ann-tip" role="tooltip" style={{ visibility: "hidden" }}>
          <style>{ANN_TIP_CSS}</style>
          <strong>{tip.a.title}</strong>
          {tip.a.body && <p>{tip.a.body}</p>}
        </div>,
        document.body
      )}
    </div>
  );
}
const ANN_TIP_CSS = `
  .ann-tip { position: fixed; z-index: 9999; width: 320px; max-width: calc(100vw - 24px); max-height: 70vh; overflow: hidden; padding: 14px 16px;
    background: #fff; border: 1px solid #f1e2d9; border-radius: 12px; box-shadow: 0 14px 32px rgba(15,23,42,.18);
    font-family: 'Poppins', 'Segoe UI', sans-serif; color: #1f2937; display: flex; flex-direction: column; gap: 6px; pointer-events: none; animation: ann-tip-in .12s ease-out; }
  .ann-tip strong { font-size: 13.5px; line-height: 1.35; color: #0f172a; overflow-wrap: anywhere; }
  .ann-tip p { margin: 0; font-size: 12.5px; line-height: 1.55; color: #475569; white-space: pre-line; overflow-wrap: anywhere; }
  @keyframes ann-tip-in { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
`;

// Full page for staff: post a new announcement + manage the old ones
export function AnnouncementManager({ user }) {
  const [items, setItems] = useState([]);
  const [removed, setRemoved] = useState([]);       // the history of taken-down announcements
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
      load();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    } finally {
      setSaving(false);
    }
  };

  // take it down: interns stop seeing it, and it moves to the Removed history
  const remove = async (a) => {
    if (!(await confirmBox({ title: "Remove this announcement?", message: `Remove "${a.title}"? Interns will no longer see it. It stays in the Removed history.`, ok: "Yes, remove", danger: true }))) return;
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
    if (!(await confirmBox({ title: "Delete for good?", message: `Delete "${h.title}" for good? This cannot be undone.`, ok: "Yes, delete", danger: true }))) return;
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

  const [compose, setCompose] = useState(false);   // the "New announcement" panel
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("posted");        // posted | removed
  const [openId, setOpenId] = useState(null);      // the announcement opened (full text)
  const match = (a) => !q.trim() || `${a.title} ${a.body}`.toLowerCase().includes(q.trim().toLowerCase());
  const postedList = items.filter(match).sort((x, y) => String(y.created_at || "").localeCompare(String(x.created_at || "")));   // newest first
  const removedList = removed.filter(match).sort((x, y) => String(y.removed_at || "").localeCompare(String(x.removed_at || "")));
  const postAndClose = async (e) => { await post(e); };
  useEffect(() => { if (msg?.type === "success" && compose) setCompose(false); /* eslint-disable-next-line */ }, [msg]);

  return (
    <>
      <PageHeader title="Announcements" sub="Post updates for all interns. They get a notification right away." />
      <Msg msg={msg} />
      {/* Posted / Removed (same switch as the other pages) · search · New announcement */}
      <div className="an-bar">
        <div className="so-tabs" role="tablist" aria-label="Show">
          {[["posted", "Posted", items.length], ["removed", "Removed", removed.length]].map(([k, l, n]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => { setTab(k); setOpenId(null); }}>{l} · {n}</button>
          ))}
        </div>
        <label className="an-search"><Icon name="search" size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search announcements" aria-label="Search announcements" /></label>
        <button type="button" className="ix-b primary an-new" onClick={() => { setMsg(null); setCompose(true); }}>
          <Icon name="plus" size={15} /> New announcement</button>
      </div>

      {loading ? <Spinner /> : (() => {
        const list = tab === "posted" ? postedList : removedList;
        return (
          /* one row per announcement: date · title and the first lines · action */
          <div className="an-list2">
            {list.length === 0 ? (
              <div className="an-empty2">
                <span className="an-empty2-ic"><Icon name={q ? "search" : "bell"} size={20} /></span>
                <b>{q ? "Nothing matches your search." : tab === "posted" ? "No announcements posted." : "No removed announcements."}</b>
                <small>{q ? "Try other words." : tab === "posted" ? "Click “New announcement” to post one. Every intern gets a notification." : "Announcements you remove are kept here."}</small>
              </div>
            ) : list.map((a) => {
              const key = `${tab}${a.id}`;
              const isOpen = openId === key;
              const long = String(a.body || "").length > 160;
              const when = tab === "removed" ? a.removed_at : a.created_at;
              return (
                <article key={a.id} className={`an-row${tab === "removed" ? " gone" : ""}`}>
                  <div className="an-when"><b>{fmtDay(when)}</b><small>{tab === "removed" ? "Removed" : "Posted"}</small></div>
                  <div className="an-txt">
                    <h4>{a.title}</h4>
                    <p className={isOpen ? "open" : ""}>{a.body}</p>
                    {long && <button type="button" className="an-link" onClick={() => setOpenId(isOpen ? null : key)}>{isOpen ? "Show less" : "Read more"}</button>}
                  </div>
                  <div className="an-act">
                    {tab === "posted" ? (
                      <button type="button" className="ix-b ghost sm an-del" disabled={busy === `p${a.id}`} onClick={() => remove(a)}>
                        <Icon name="trash" size={13} /> {busy === `p${a.id}` ? "..." : "Remove"}</button>
                    ) : (
                      <button type="button" className="ix-b ghost sm an-del" disabled={busy === `h${a.id}`} onClick={() => purge(a)}>
                        <Icon name="trash" size={13} /> {busy === `h${a.id}` ? "..." : "Delete for good"}</button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        );
      })()}

      {compose && (
        <Drawer inPage title="New announcement" kicker="Announcement" icon="send" onClose={() => setCompose(false)}
          footer={(close) => (<>
            <button type="button" className="ix-b ghost" onClick={close} disabled={saving}>Cancel</button>
            <button type="submit" form="ann-form" className="ix-b primary" disabled={saving}><Icon name="send" size={15} /> {saving ? "Posting..." : "Post"}</button>
          </>)}>
          <form id="ann-form" onSubmit={postAndClose} className="ix-form an-form">
            {msg?.type === "error" && <Msg msg={msg} />}
            <div className="ix-field">
              <label htmlFor="ann-title">Title</label>
              <input id="ann-title" type="text" required maxLength={150} value={title} autoFocus
                placeholder="e.g. Orientation moved to Friday" onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="ix-field">
              <label htmlFor="ann-body">Message <span className="ix-muted">· {body.length}/2000</span></label>
              <textarea id="ann-body" rows={7} required maxLength={2000} value={body}
                placeholder="Write the details interns need to know..." onChange={(e) => setBody(e.target.value)} />
            </div>
            <div className="an-preview">
              <small>Preview: how interns see it</small>
              <b>{title.trim() || "Your title"}</b>
              <p>{body.trim() || "Your message shows here."}</p>
            </div>
            <small className="an-note">Every intern gets a notification and sees it on their dashboard.</small>
          </form>
        </Drawer>
      )}
      <style>{AN_CSS}</style>
    </>
  );
}

const AN_CSS = `
.ix-page .an-bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.ix-page .an-bar .an-search { margin-left: auto; }
/* the list: one row per announcement */
.ix-page .an-list2 { flex: none !important; background: #fff; border: 1px solid #e8ebf0; border-radius: 14px; overflow: hidden; }
.ix-page .an-row { display: grid; grid-template-columns: 130px minmax(0, 1fr) auto; gap: 18px; align-items: start; padding: 14px 18px; border-bottom: 1px solid #f1f3f6; }
.ix-page .an-row:last-child { border-bottom: 0; }
.ix-page .an-row:hover { background: #fcfcfd; }
.ix-page .an-when { display: flex; flex-direction: column; gap: 2px; padding-top: 1px; }
.ix-page .an-when b { font-size: 13px; font-weight: 600; color: #111827; white-space: nowrap; }
.ix-page .an-when small { font-size: 11.5px; color: #15803d; font-weight: 600; }
.ix-page .an-row.gone .an-when small { color: #9ca3af; }
.ix-page .an-txt { min-width: 0; display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
.ix-page .an-txt h4 { margin: 0; font-size: 14.5px; font-weight: 600; color: #111827; overflow-wrap: anywhere; }
.ix-page .an-txt p { margin: 0; font-size: 13px; line-height: 1.55; color: #4b5563; white-space: pre-wrap; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.ix-page .an-txt p.open { display: block; }
.ix-page .an-row.gone .an-txt h4, .ix-page .an-row.gone .an-txt p { color: #6b7280; }
.ix-page .an-act { display: flex; align-items: center; }
.ix-page .an-del { color: #b91c1c !important; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.ix-page .an-del:hover:not(:disabled) { border-color: #f3c9c9 !important; background: #fef2f2 !important; }
.ix-page .an-empty2 { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 48px 16px; text-align: center; }
.ix-page .an-empty2-ic { width: 44px; height: 44px; border-radius: 50%; background: #fff1ea; color: #ea580c; display: grid; place-items: center; margin-bottom: 6px; }
.ix-page .an-empty2 b { font-size: 14px; color: #111827; } .ix-page .an-empty2 small { font-size: 12.5px; color: #6b7280; max-width: 360px; }
@media (max-width: 760px) {
  .ix-page .an-row { grid-template-columns: minmax(0, 1fr); gap: 6px; }
  .ix-page .an-when { flex-direction: row; gap: 8px; align-items: baseline; }
  .ix-page .an-bar .an-search { margin-left: 0; width: 100%; }
}
.ix-page .an-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-auto-rows: auto; gap: 14px; align-content: start; align-items: stretch; flex: none !important; height: auto !important; }
/* a tile is only as tall as its text (cards in one row still share the row's height) */
.ix-page .an-grid > .an-tile { height: auto; max-height: none; }
.ix-page .an-tile { border: 1px solid #e8ebf0; border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 8px; min-width: 0; min-height: 150px; background: #fff; }
.ix-page .an-tile-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ix-page .an-tile-top small { font-size: 12px; color: #9ca3af; white-space: nowrap; }
.ix-page .an-tag { font-size: 10.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; padding: 2px 9px; border-radius: 999px; background: #e9f8ef; color: #15803d; }
.ix-page .an-tag.rm { background: #fff; color: #6b7280; border: 1px solid #e3e5ea; }
.ix-page .an-tile h4 { margin: 0; font-size: 15px; font-weight: 600; color: #111827; overflow-wrap: anywhere; }
.ix-page .an-tile p { margin: 0; font-size: 13px; line-height: 1.55; color: #4b5563; white-space: pre-wrap; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.ix-page .an-tile p.open { display: block; }
.ix-page .an-tile-ft { margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ix-page .an-tile.gone { background: #f6f7f9; border-style: dashed; }
.ix-page .an-tile.gone h4 { color: #6b7280; }
.ix-page .an-tile.empty { align-items: center; justify-content: center; text-align: center; color: #9ca3af; grid-column: 1 / -1; min-height: 110px; border-style: dashed; }
.ix-page .an-tile.empty b { color: #374151; font-size: 13.5px; }
.ix-page .an-divider { display: flex; align-items: center; gap: 12px; margin: 22px 0 12px; font-size: 11.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #94a3b8; }
.ix-page .an-divider::after { content: ""; flex: 1; height: 1px; background: #e8ebf0; }
@media (max-width: 1100px) { .ix-page .an-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) { .ix-page .an-grid { grid-template-columns: 1fr; } }
.ix-page .an-tabs { display: flex; gap: 6px; }
.ix-page .an-search { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px; border: 1px solid #e3e5ea; border-radius: 10px; background: #fff; color: #9ca3af; width: 260px; box-sizing: border-box; }
.ix-page .an-search input { border: 0 !important; outline: none; background: transparent !important; font: inherit; font-size: 13px; color: #111827; width: 100%; padding: 0 !important; height: auto !important; box-shadow: none !important; }
.ix-page .an-new { height: 36px !important; }
.ix-page .ix-card.an-feed { margin: 0 !important; padding: 0 !important; overflow: hidden; }
.ix-page .an-item { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 14px; padding: 16px 18px; border-bottom: 1px solid #f1f2f4; }
.ix-page .an-item:last-child { border-bottom: 0; }
.ix-page .an-item.gone { opacity: .7; }
.ix-page .an-ic { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; background: #fff3ec; color: #e8582a; }
.ix-page .an-item.gone .an-ic { background: #f3f4f6; color: #9ca3af; }
.ix-page .an-main { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.ix-page .an-top { display: flex; align-items: baseline; gap: 10px; }
.ix-page .an-top b { font-size: 14.5px; font-weight: 600; color: #111827; flex: 1; min-width: 0; }
.ix-page .an-top small { font-size: 12px; color: #9ca3af; white-space: nowrap; }
.ix-page .an-main p { margin: 0; font-size: 13px; line-height: 1.55; color: #4b5563; white-space: pre-wrap; word-break: break-word;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.ix-page .an-main p.open { display: block; -webkit-line-clamp: unset; }
.ix-page .an-meta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 4px; font-size: 12px; color: #8b919b; }
.ix-page .an-link { display: inline-flex; align-items: center; gap: 4px; padding: 0 !important; height: auto !important; min-height: 0 !important; border: 0; background: none;
  font: inherit; font-size: 12px; font-weight: 600; color: #c2410c; cursor: pointer; }
.ix-page .an-link.danger { color: #b91c1c; }
.ix-page .an-link:hover { text-decoration: underline; }
.ix-page .an-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 56px 16px; text-align: center; color: #9ca3af; }
.ix-page .an-empty b { color: #374151; font-size: 14px; } .ix-page .an-empty small { font-size: 12.5px; }
.ix-page .an-form { display: flex; flex-direction: column; gap: 14px; }
.ix-page .an-preview { padding: 12px 14px; border-radius: 12px; background: #fafafb; border: 1px solid #f1f2f4; display: flex; flex-direction: column; gap: 3px; }
.ix-page .an-preview small { font-size: 11px; color: #8b919b; }
.ix-page .an-preview b { font-size: 13.5px; color: #111827; } .ix-page .an-preview p { margin: 0; font-size: 12.5px; color: #4b5563; white-space: pre-wrap; word-break: break-word; max-height: 120px; overflow: auto; }
.ix-page .an-note { font-size: 12px; color: #6b7280; }
@media (max-width: 700px) { .ix-page .an-search { width: 100%; margin-left: 0; order: 3; } .ix-page .an-new { margin-left: auto; } }
`;

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
    supervisor_assigned: "/intern/profile", announcement: "/intern", grade_released: "/intern/grade", evaluation: "/intern/grade",
  },
  ojt_coordinator: {
    mov_submission: "/coordinator/requirements?tab=movs", online_submission: "/coordinator/approvals?tab=online",
    online_review: "/coordinator/approvals?tab=online", overtime: "/coordinator/approvals?tab=overtime",
    overtime_review: "/coordinator/approvals?tab=overtime", nfc_request: "/coordinator/approvals?tab=nfc",
    dtr_certified: "/coordinator/reports?tab=dtr", supervisor_assigned: "/coordinator/htes?tab=supervisors",
    time_correction: "/coordinator/htes?tab=supervisors", work_mode_request: "/coordinator/htes?tab=supervisors",
    announcement: "/coordinator/announcements", evaluation: "/coordinator/interns?tab=evaluation", quarterly_report: "/coordinator/reports?tab=quarterly",
  },
  supervisor: {
    online_submission: "/supervisor/approvals?tab=online", overtime: "/supervisor/approvals?tab=overtime",
    time_correction: "/supervisor/approvals?tab=fix", work_mode_request: "/supervisor/approvals?tab=wfh",
    supervisor_assigned: "/supervisor/interns", dtr_certified: "/supervisor/reports?tab=dtr", announcement: "/supervisor",
  },
  admin: {
    nfc_print: "/admin/cards", nfc_request: "/admin/cards", nfc_review: "/admin/cards", announcement: "/admin",
    card_flag: "/admin/htes?tab=kiosks&alerts=1",   // a copied card was caught: open Kiosks with Card alerts
  },
};
// title words -> type (for notifications saved before types were used everywhere)
const NOTIF_GUESS = [
  [/suspicious card/i, "card_flag"],
  [/time correction/i, "time_correction"], [/work arrangement|wfh/i, "work_mode_request"],
  [/overtime/i, "overtime"], [/online attendance|remote/i, "online_submission"],
  [/\bmovs?\b|requirement|document/i, "mov_submission"], [/\bnfc\b|\bcard\b/i, "nfc_request"],
  [/id card to print/i, "nfc_print"], [/dtr/i, "dtr_certified"], [/supervisor assigned|new intern assigned/i, "supervisor_assigned"],
  [/announcement/i, "announcement"], [/quarterly report/i, "quarterly_report"],
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

/* Bell list look: each notification gets a small icon by its kind, and the list is grouped
   into Today / Yesterday / Earlier. Approved = green, rejected = red. */
const NOTIF_KIND = {
  online_submission: ["globe", "blue"], online_review: ["globe", "blue"],
  overtime: ["clock", "amber"], overtime_review: ["clock", "amber"],
  time_correction: ["pencil", "slate"], time_correction_review: ["pencil", "slate"],
  work_mode_request: ["home", "teal"], work_mode_review: ["home", "teal"],
  mov_submission: ["file", "violet"], mov_review: ["file", "violet"], requirement_reminder: ["file", "violet"],
  nfc_request: ["card", "orange"], nfc_review: ["card", "orange"], nfc_print: ["print", "orange"],
  dtr_certified: ["check", "green"], supervisor_assigned: ["users", "teal"], announcement: ["bell", "orange"],
  evaluation: ["pencil", "violet"], grade_released: ["chart", "green"],
  card_flag: ["warn", "red"],
};
function notifKind(n) {
  let type = n?.type;
  if (!type || !NOTIF_KIND[type]) {
    const hit = NOTIF_GUESS.find(([re]) => re.test(`${n?.title || ""}`));
    type = hit ? hit[1] : type;
  }
  const [icon, tone] = NOTIF_KIND[type] || ["info", "slate"];
  const t = `${n?.title || ""}`;
  if (/rejected|declined|denied/i.test(t)) return { icon, tone: "red" };
  if (/approved|confirmed|endorsed|issued|certified/i.test(t)) return { icon, tone: "green" };
  return { icon, tone };
}
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
function notifGroups(list) {
  const today = new Date();
  const yest = new Date(today); yest.setDate(today.getDate() - 1);
  const out = [["Today", []], ["Yesterday", []], ["Earlier", []]];
  list.forEach((n) => {
    const d = new Date(n.created_at);
    const i = isNaN(d) ? 2 : sameDay(d, today) ? 0 : sameDay(d, yest) ? 1 : 2;
    out[i][1].push(n);
  });
  return out.filter(([, items]) => items.length);
}
// short time for the bell: "Just now", "12m ago", "5h ago", "3:40 PM" (yesterday), "Oct 26"
function notifTime(v) {
  const d = new Date(v);
  if (!v || isNaN(d)) return "";
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  if (m < 60 * 24 && sameDay(d, new Date())) return `${Math.floor(m / 60)}h ago`;
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (sameDay(d, y)) return d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
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
    // a page that marks notices read itself (Submit MOV) asks the bell to reload
    window.addEventListener("notifications-changed", load);
    const stop = liveRefresh(load);
    return () => { window.removeEventListener("notifications-changed", load); stop && stop(); };
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
    // a page with one tab (the supervisor's Generate DTR) is a plain link, not a menu with one item
    if (!tabs || tabs.length < 2) return typeof b === "number" ? { ...it, badge: b } : it;
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

/* ───────── Data Privacy Act: asked once, on each user's first sign-in (wording depends on the role) ─────────
   Shown until the user agrees. "I don't agree" signs them out (the system can't be used without it).
   Only shown when the server has the consent column (php artisan migrate was run). */
function PrivacyGate({ user, onDecline }) {
  const [need, setNeed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [checked, setChecked] = useState(false);
  const notice = PRIVACY_NOTICE[user?.role];
  useEffect(() => {
    if (!user?.id || !notice) return;
    fetch(`${API}/me?user_id=${user.id}`, { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((d) => { const u = d?.user || d; if (u && "privacy_consent_at" in u && !u.privacy_consent_at) setNeed(true); })
      .catch(() => {});
  }, [user?.id, notice]);
  if (!need || !notice) return null;
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
        <header><div><h2>Data Privacy Notice</h2><p>Please read this before using the CSU CCIS OJT system.</p></div></header>
        <div className="ix-modal-body pv-body">
          <p>Caraga State University – College of Computing and Information Sciences (CCIS) collects and uses your personal information
            through this system in line with the <b>Data Privacy Act of 2012 (Republic Act No. 10173)</b>.</p>
          <div className="pv-grid">
            {notice.sections.map(([title, text], i) => (
              <section key={title} className={notice.sections.length % 2 && i === notice.sections.length - 1 ? "pv-wide" : undefined}>
                <h3>{title}</h3>
                <p>{text}</p>
              </section>
            ))}
          </div>
        </div>
        <div className="pv-foot">
          <label className="pv-check">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <span>{notice.agree}</span>
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
/* What the notice says, per role: [title, text] pairs. An odd last section spans both columns. */
const RIGHTS = ["Your rights", "You may ask the CCIS office to see or correct your information at any time."];
const PRIVACY_NOTICE = {
  intern: {
    agree: "I have read this notice and I agree to the collection and use of my personal information for OJT monitoring.",
    sections: [
      ["What we collect", "Your name, student ID, program, contact details, emergency contact, photo, OJT placement, attendance taps, online attendance, and the requirements you upload."],
      ["Why we collect it", "Only to monitor your OJT: record attendance, compute rendered hours, review requirements, and produce your DTR and reports."],
      ["Who can see it", "The CCIS admin and your OJT coordinator. Your HTE supervisor sees only your attendance and requests. Uploaded files are visible only to the OJT coordinator. Nothing is shared outside the university."],
      ["How long we keep it", "For as long as the university's records policy requires. After your internship your account is deactivated, but your records are kept."],
      RIGHTS,
    ],
  },
  ojt_coordinator: {
    agree: "I have read this notice. I agree to the use of my information, and I will protect the interns' personal data I handle.",
    sections: [
      ["What we collect", "Your name, email, contact details, photo, the programs and interns assigned to you, and a log of what you do in the system (approvals, reviews, edits)."],
      ["Why we collect it", "To run your account, show interns and supervisors who their coordinator is, and keep a record of who approved or changed what."],
      ["Who can see it", "The CCIS admin. Your interns and their HTE supervisors see your name and contact details. Nothing is shared outside the university."],
      ["Your responsibility", "You can see interns' personal details, attendance and uploaded files. Use them only for OJT monitoring. Don't share, download or post them elsewhere, and keep your password to yourself."],
      ["How long we keep it", "For as long as the university's records policy requires. If you leave the role your account is deactivated, but the activity log is kept."],
      RIGHTS,
    ],
  },
  supervisor: {
    agree: "I have read this notice. I agree to the use of my information, and I will protect the interns' personal data I handle.",
    sections: [
      ["What we collect", "Your name, email, contact details, position, your company (HTE), and a log of what you do in the system (approvals, evaluations, edits)."],
      ["Why we collect it", "To link you to the interns placed with you, let you approve their attendance and requests, and record your evaluations."],
      ["Who can see it", "The CCIS admin and OJT coordinators. Your interns see your name and contact details. Nothing is shared outside the university."],
      ["Your responsibility", "You see only your own interns' attendance, requests and basic details. Use them only for their OJT. Don't share or post them elsewhere, and keep your password to yourself."],
      ["How long we keep it", "For as long as the university's records policy requires. When your HTE partnership ends your account is deactivated, but your records are kept."],
      RIGHTS,
    ],
  },
  admin: {
    agree: "I have read this notice. I agree to the use of my information, and I will protect the personal data of every user in this system.",
    sections: [
      ["What we collect", "Your name, email, contact details, photo, and a log of everything you do in the system (accounts created, settings changed, records edited)."],
      ["Why we collect it", "To run your account and keep an audit trail of administrative changes, as required for accountability under the Data Privacy Act."],
      ["Who can see it", "Other CCIS admins. Coordinators, supervisors and interns see only your name. Nothing is shared outside the university."],
      ["Your responsibility", "You can see every user's personal data. Open it only when your work needs it, don't export or share it outside the university, and report any breach to the CCIS office right away."],
      ["How long we keep it", "For as long as the university's records policy requires. The audit log is kept even after your account is deactivated."],
      RIGHTS,
    ],
  },
};

const PRIVACY_CSS = `
  .pv-wrap { z-index: 20000 !important; }   /* above the top bar, side menu and drawers */
  .pv-modal { max-width: 760px !important; display: flex; flex-direction: column; max-height: calc(100dvh - 24px) !important; overflow: hidden !important; }
  .pv-modal > header { flex: none; padding: 16px 24px 8px !important; }
  .pv-body { font-size: 12.5px; line-height: 1.5; color: #374151; flex: 1 1 auto; min-height: 0; overflow-y: auto; padding-bottom: 10px !important; }
  .pv-foot { flex: none; padding: 10px 24px 14px; border-top: 1px solid #eef0f3; background: var(--ix-surface, #fff); }
  .pv-body p { margin: 0 0 6px; }
  .pv-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; margin-top: 4px; }
  .pv-grid section { padding: 8px 12px; border-radius: 10px; background: #f8fafc; border: 1px solid #eef0f3; }
  .pv-grid section p { margin: 0; }
  .pv-grid .pv-wide { grid-column: 1 / -1; }
  .pv-body h3 { margin: 0 0 2px; font-size: 12.5px; font-weight: 700; color: #111827; }
  .pv-check { display: flex; gap: 10px; align-items: flex-start; margin-top: 0; padding: 8px 12px; border-radius: 10px;
    background: #fff7f2; border: 1px solid #fde2cf; cursor: pointer; font-size: 12.5px; color: #1f2937; }
  .pv-check input { margin-top: 2px; accent-color: #e8582a; width: 16px; height: 16px; flex: none; }
  .pv-err { color: #dc2626; font-size: 12px; margin-top: 8px; }
  .pv-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
  @media (max-width: 640px) { .pv-grid { grid-template-columns: 1fr; gap: 6px; } .pv-grid section { padding: 6px 10px; } }
  @media (max-width: 480px) { .pv-modal > header { padding: 14px 16px 6px !important; } .pv-body { padding-left: 16px !important; padding-right: 16px !important; font-size: 12px; }
    .pv-foot { padding: 8px 16px 12px; } .pv-actions .ix-b { flex: 1 1 0; } }
  .fp-wrap { z-index: 20010 !important; }
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
  const [openGroups, setOpenGroups] = useState({});   // the current section folded by hand (false); every other section is closed
  const [tip, setTip] = useState(null);               // tooltip next to an icon when the sidebar is closed
  const [menuOpen, setMenuOpen] = useState(() => {
    // open by default on computers (labels showing); it remembers if you collapse it
    try { return !isMobile() && localStorage.getItem(SIDEBAR_KEY) !== "0"; } catch { return !isMobile(); }
  });
  const [isFull, setIsFull] = useState(false);

  // the coordinator's list of requirements: loaded once before the page shows (at most ~2.5 s, then the starting list)
  const [reqReady, setReqReady] = useState(false);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => alive && setReqReady(true), 2500);
    loadRequirements().finally(() => { clearTimeout(t); if (alive) setReqReady(true); });
    // the coordinator changed something: get the list again (the pages reload their own data at the same time)
    const again = () => loadRequirements(true);
    window.addEventListener(LIVE_EVENT, again);
    return () => { alive = false; clearTimeout(t); window.removeEventListener(LIVE_EVENT, again); };
  }, []);

  // tell the server this account has the portal open (shown as "Online" to coordinators and supervisors)
  useEffect(() => {
    const ping = () => { if (!document.hidden) fetch(`${API}/me/ping`, { method: "POST", headers: { Accept: "application/json" } }).catch(() => {}); };
    ping();
    const iv = setInterval(ping, 60000);
    document.addEventListener("visibilitychange", ping);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", ping); };
  }, []);

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
              <div className="ix-notification-dropdown nf2">
                <div className="nf2-head">
                  <strong>Notifications</strong>
                  {unreadCount > 0 && <span className="nf2-new">{unreadCount} new</span>}
                  {unreadCount > 0 && (
                    <button type="button" className="nf2-link" onClick={markAllRead}>
                      <Icon name="check" size={13} /> Mark all read
                    </button>
                  )}
                </div>

                <div className="ix-notification-list nf2-list">
                  {notifications.length === 0 ? (
                    <div className="nf2-empty">
                      <span><Icon name="bell" size={20} /></span>
                      <strong>You're all caught up</strong>
                      <small>New requests and updates will show here.</small>
                    </div>
                  ) : (
                    notifGroups(notifications).map(([label, items]) => (
                      <div key={label} className="nf2-group">
                        <div className="nf2-label">{label}</div>
                        {items.map((n) => {
                          const to = notifTarget(n, user?.role);
                          const k = notifKind(n);
                          return (
                            <div key={n.id} className={`nf2-row ${n.is_read ? "read" : "unread"}`}>
                              <button
                                type="button"
                                className={to ? "nf2-main go" : "nf2-main"}
                                title={to ? "Open" : undefined}
                                onClick={() => {
                                  if (!n.is_read) markRead(n.id);
                                  if (to) { setNotifOpen(false); navigate(to); }
                                }}
                              >
                                <span className={`nf2-ic t-${k.tone}`}><Icon name={k.icon} size={15} /></span>
                                <span className="nf2-txt">
                                  <span className="nf2-top">
                                    <strong>{n.title}</strong>
                                    <small>{notifTime(n.created_at)}</small>
                                  </span>
                                  {n.message && <span className="nf2-msg">{n.message}</span>}
                                </span>
                              </button>
                              {!n.is_read && <span className="nf2-dot" aria-label="Unread" />}
                              <button
                                type="button"
                                className="nf2-x"
                                onClick={() => remove(n.id)}
                                aria-label={`Delete notification: ${n.title}`}
                                title="Delete"
                              >
                                <Icon name="x" size={13} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>

                {notifications.length > 0 && (
                  <div className="nf2-foot">
                    <span>{notifications.length} notification{notifications.length > 1 ? "s" : ""}</span>
                    <button type="button" className="nf2-link danger" onClick={clearAll}>
                      <Icon name="trash" size={13} /> Clear all
                    </button>
                  </div>
                )}
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
              <span className="ix-acct-txt">
                <span className="ix-acct-name">{user?.name || "User"}</span>
                <small className="ix-acct-role">{ROLE_LABEL[user?.role] || "User"}</small>
              </span>
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
              // accordion: only the section you are in is open (clicking its name again folds it)
              const open = kids.length > 0 && menuOpen && here && openGroups[it.path] !== false;
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
            // an item can sit in its own section (e.g. { section: "System" }); My Profile is always under Account
            const main = navItems.filter((it) => !isAccount(it) && !it.section && matches(it));
            const acct = navItems.filter((it) => isAccount(it) && matches(it));
            const secs = [...new Set(navItems.filter((it) => it.section && !isAccount(it)).map((it) => it.section))]
              .map((name) => ({ name, items: navItems.filter((it) => it.section === name && !isAccount(it) && matches(it)) }))
              .filter((g) => g.items.length);
            if (!main.length && !acct.length && !secs.length) return <div className="ix-sb-none">No page matches "{menuQ}".</div>;
            return (
              <>
                {main.map(item)}
                {secs.map((g) => (
                  <div key={g.name} className="ix-side-group">
                    <div className="ix-side-sep" />
                    <div className="ix-side-section">{g.name}</div>
                    {g.items.map(item)}
                  </div>
                ))}
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
            <div className="ix-content" key={path}>{reqReady ? children : <Spinner />}</div>
          </PageIconCtx.Provider>
        </main>
      </div>

      <style>{css}</style>
      {/* loaded LAST so it wins over every page's own styles: one look for all roles */}
      <style>{uiUnify}</style>
      {/* the light "panel" look (white sidebar, pages inside one white rounded panel) */}
      <style>{lay3}</style>
      {/* every page reaches the bottom of the panel, like the dashboard */}
      <style>{FILL_CSS}</style>
      {/* every "pick one" control (Waiting · Supervisor · Reviewed, Pending · History, phase pills...) looks the same */}
      <style>{SEG_CSS}</style>
    </div>
  );
}

/* One look for every "pick one" switch: a light grey track, the picked option white with orange text
   (the same as "Online workday · Excused absence" on the intern's Submit Online page). */
const SEG = ".oa-switch, .ix-pills, .ct-pills, .idq-tabs, .so-tabs, .dl-tabs, .mv2-ph, .req-tabs, .an-tabs, .nc-seg, .cm-seg, .so-kind";
// also inside modals and drawers: they open outside the page (portal), so .ix-page alone misses them
const segIn = (sel) => SEG.split(", ").flatMap((c) => [`.ix-page ${c}${sel}`, `.ix-modal-wrap ${c}${sel}`]).join(", ");
const SEG_CSS = `
${segIn("")} {
  display: inline-flex !important; flex-wrap: wrap; align-items: stretch; gap: 4px !important; padding: 3px !important;
  background: #f3f4f6 !important; border: 1px solid #e8ebf0 !important; border-radius: 10px !important; box-shadow: none !important;
  width: fit-content !important; max-width: 100%; box-sizing: border-box; align-self: flex-start;
}
${segIn(" > button")} {
  display: inline-flex !important; align-items: center; justify-content: center; gap: 6px !important;
  min-height: 32px !important; height: auto !important; padding: 0 12px !important; margin: 0 !important;
  border: 0 !important; border-radius: 8px !important; background: transparent !important; box-shadow: none !important;
  color: #4b5563 !important; font: inherit; font-size: 12.5px !important; font-weight: 600 !important; line-height: 1.2;
  cursor: pointer; white-space: nowrap; transform: none !important;
}
${segIn(" > button::after")} { display: none !important; }
${segIn(" > button:hover:not(:disabled)")} { color: #c2410c !important; background: rgba(255,255,255,.55) !important; }
${segIn(" > button:is(.on, .active, [aria-selected=\"true\"], [aria-checked=\"true\"])")} {
  background: #fff !important; color: #c2410c !important; box-shadow: 0 1px 3px rgba(15,23,42,.12) !important;
}
${segIn(" > button:disabled")} { opacity: .5; cursor: not-allowed; }
/* the small number next to an option stays readable on the white picked option */
.ix-page .ix-pills .ix-pill .ix-pill-count, .ix-page .ix-pills .ix-pill.active .ix-pill-count { background: #e8582a !important; color: #fff !important; }
/* the switch at the top of a list panel spans the panel */
.ix-page .oa-switch { display: flex !important; width: auto !important; align-self: stretch; margin: 10px 10px 6px !important; flex-wrap: nowrap; }
.ix-page .oa-switch > button { flex: 1 1 0 !important; min-width: 0 !important; width: auto !important; padding: 0 6px !important; }
/* switches that fill their row: two or three equal options */
.ix-page :is(.so-kind, .cm-seg), .ix-modal-wrap :is(.so-kind, .cm-seg) { display: grid !important; grid-auto-flow: column; grid-auto-columns: 1fr; width: 100% !important; align-self: stretch; }
.ix-page .cm-seg.two > button { min-height: 52px !important; flex-direction: column; gap: 2px !important; }
.ix-page .dl-tabs { margin-bottom: 12px !important; }
`;

/* Computers: the last card (or tab content) of every page grows down to the bottom of the white panel,
   so no page ends with a short card and empty space under it. Taller pages still scroll as before. */
const FILL_CSS = `
@media (min-width: 1001px) and (min-height: 600px) {
  .ix-page.lay2 .ix-main { display: flex !important; flex-direction: column !important; }
  .ix-page.lay2 .ix-main > .ix-content { flex: 1 0 auto; display: flex; flex-direction: column; width: 100%; box-sizing: border-box; }
  .ix-page.lay2 .ix-main > .ix-content > :nth-last-child(1 of :not(style, script, .ix-modal-wrap)) { flex-grow: 1; }
  .ix-page.lay2 .ix-main > .ix-content > .grp-body:nth-last-child(1 of :not(style, script, .ix-modal-wrap)) { display: flex; flex-direction: column; }
  .ix-page.lay2 .ix-main > .ix-content > .grp-body > :nth-last-child(1 of :not(style, script, .ix-modal-wrap)) { flex-grow: 1; }
  /* pages whose last part is a wrapper: its last card grows too */
  .ix-page.lay2 .ix-content :is(.mon, .al-wrap, .gr-page) { display: flex; flex-direction: column; }
  .ix-page.lay2 .ix-content :is(.mon, .al-wrap) > .ix-card:nth-last-child(1 of :not(style, script, .ix-modal-wrap)) { flex: 1 0 auto; }
  .ix-page.lay2 .ix-content .gr-page > .ix-card:not(.gr-empty), .ix-page.lay2 .ix-content .gr-page > .gr-empty:only-of-type { flex: 1 0 auto; }
  /* My Profile (every role): the bottom cards reach the bottom of the panel */
  .ix-page.lay2 .ix-main > .ix-content > .pf-page { flex: 1 0 auto !important; }
  .ix-page.lay2 .ix-content .pf-page > :last-child { flex: 1 0 auto !important; }
  .ix-page.lay2 .ix-content .pf-page > .pf-grid:last-child { grid-template-rows: auto 1fr !important; }
  .ix-page.lay2 .ix-content .pf-page .pf-sec { display: flex; flex-direction: column; }
  .ix-page.lay2 .ix-content .pf-page .pf-sec > .ix-card { flex: 1 0 auto; }
  /* a card with nothing in its list: the message sits in the middle of the card */
  .ix-page.lay2 .ix-content :is(.ix-card, .dbx-card):has(> :is(.ix-empty, .dtr-wait, .rq-empty, .gr-wait)) { display: flex; flex-direction: column; }
  .ix-page.lay2 .ix-content :is(.ix-card, .dbx-card) > :is(.ix-empty, .dtr-wait, .rq-empty) { flex: 1 0 auto; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
  .ix-page.lay2 .ix-content .ix-card > .gr-wait { flex: 1 0 auto; display: flex; align-items: center; justify-content: center; }
  .ix-page.lay2 .ix-content .cm-items:has(> .cm-empty:only-child) { display: flex; flex-direction: column; justify-content: center; }
}
`;

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
  /* waiting counts in the sidebar: red with a white number */
  .ix-page.lay2 .ix-side .ix-side-badge, .ix-page.lay2 .ix-side .ix-side-badge.sm, .ix-page.lay2 .ix-side:not(.open) .ix-side-badge {
    background: #ef4444 !important; color: #fff !important; border: 0 !important; font-weight: 700; box-shadow: 0 1px 2px rgba(239,68,68,.35); }
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
    .ix-page.lay2 .ix-content .dbx-grid .dbx-fill { flex: 1 1 auto !important; justify-content: stretch !important; display: flex !important; flex-direction: column !important;
      min-height: 0; overflow-y: auto; }
    /* rows may grow to fill a tall card, but never shrink below their own height (no overlapping on small or zoomed screens);
       when the card is shorter than its rows, the list scrolls inside the card */
    .ix-page.lay2 .ix-content .dbx-grid .dbx-fill > * { flex: 1 0 auto !important; }
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
    /* a roomier calendar again */
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side .adm-cal-grid { grid-auto-rows: 29px !important; row-gap: 2px !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side .adm-cal-day { min-height: 29px !important; height: 29px !important; font-size: 12.5px !important; }
    /* two shared rows across all three columns: every card in a row ends on the same line.
       Rows grow with their content (nothing is cut off); a column with one card spans both rows. */
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right { grid-template-rows: auto auto !important; align-items: stretch !important; }
    /* the dashboard fills the window when there is room (full screen: no empty space at the bottom),
       and grows past it (the page scrolls) when the cards need more height */
    .ix-page.lay2 .ix-main:has(.dbx-grid.has-left.has-right) { display: flex !important; flex-direction: column !important; overflow-y: auto !important; }
    .ix-page.lay2 .ix-main:has(.dbx-grid.has-left.has-right) > .ix-content { flex: 1 0 auto !important; display: flex !important; flex-direction: column !important; }
    .ix-page.lay2 .ix-content > .dbx:has(> .dbx-grid.has-left.has-right) { flex: 1 0 auto !important; display: flex !important; flex-direction: column !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right { flex: 1 0 auto !important; align-content: stretch !important; }
    /* the announcements box is never shorter than its text */
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > .adm-duty:last-child > .adm-duty-empty { min-height: fit-content !important; height: auto !important; overflow: visible !important; flex: 1 0 auto !important;
      display: flex !important; flex-direction: column; align-items: center; justify-content: center !important; text-align: center; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > .adm-duty:last-child { min-height: fit-content !important; height: auto !important; overflow: visible !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-col { display: contents !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-left > * { grid-column: 1 !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-mid > * { grid-column: 2 !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > * { grid-column: 3 !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-col > :first-child { grid-row: 1 !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-col > :nth-child(2) { grid-row: 2 !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-col > :only-child { grid-row: 1 / 3 !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-col > * { margin: 0 !important; min-height: 0; height: auto !important; display: flex; flex-direction: column; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > .ix-card.adm-cal { flex: none !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > .adm-duty:last-child { height: auto !important; min-height: 0 !important; overflow: visible !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > .adm-duty:last-child > .ann-list { flex: 1 1 auto !important; overflow: visible !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > .adm-duty:last-child > .adm-duty-empty { flex: 1 1 auto !important; }
    /* an empty list fills its card (centered message) */
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right .dbx-card > :is(.dbx-empty, .ix-empty, [class*="empty"]):last-child { flex: 1 1 auto; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side .adm-cal-grid { grid-auto-rows: 32px !important; row-gap: 3px !important; }
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side .adm-cal-day { min-height: 32px !important; height: 32px !important; font-size: 13px !important; }
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

  /* ═══════════ Consistency pass: one spacing, button, field and card system on every page ═══════════
     Loaded last, so it evens out the page-by-page sizes:
       buttons 38px (small 32px) · fields 38px · chips 30px · cards 16px corners · 14px between cards */

  /* buttons: one small size (some pages had 28 / 30px) */
  .ix-page .ix-content .ix-b.sm, .ix-page.lay2 .ix-content .dbx-gs-list .ix-b.sm, .ix-page .ix-content .gs-list li .ix-b {
    height: 32px !important; min-height: 0 !important; padding: 0 12px !important; font-size: 12.5px !important; line-height: 1 !important; border-radius: 8px !important; }
  .ix-page .ix-content .ix-b:not(.sm) { border-radius: 8px; }
  .ix-page .ix-content .an-new { height: 38px !important; }
  /* icons on filled buttons are white (one page painted them orange on orange) */
  .ix-page :is(.ix-b.primary, .ix-b.ok, .ix-b.warn, .fl-btn, .ix-btn) svg { color: #fff !important; }
  .ix-page .ix-content .at-day-btn { height: 32px !important; border-radius: 8px !important; padding: 0 12px !important; font-size: 12.5px !important; }

  /* filter chips (All · Waiting · Approved …): one height everywhere */
  .ix-page .ix-content :is(.mon-chip, .so-tabs > button) { height: 30px !important; min-height: 0 !important; padding: 0 12px !important; font-size: 11.5px !important; border-radius: 99px !important; line-height: 1 !important; display: inline-flex !important; align-items: center !important; }
  .ix-page .ix-content :is(.mon-bar, .so-tabs, .an-tabs) { gap: 6px; }

  /* fields: inputs, dropdowns and date boxes are all 38px with 8px corners */
  .ix-page .ix-content :is(.ix-input, .ix-select, .rec-date, .at-month, .dtr-sel, .acc-filter, .mon-filter):not(textarea) {
    height: 38px !important; min-height: 0 !important; border-radius: 8px !important; font-size: 13px !important; }
  .ix-page .ix-content :is(.oa-act, .ibx-act) .ix-input { height: 38px !important; }
  /* search boxes: same height and corners as the fields beside them */
  .ix-page .ix-content :is(.ix-search, .an-search, .dtr-search) { height: 38px !important; border-radius: 8px !important; }
  .ix-page .ix-content .oa-search { height: 36px !important; border-radius: 8px !important; }

  /* cards: same corners and border colour */
  .ix-page .ix-content :is(.oa-list, .oa-detail, .mv2-list, .mv2-main, .mv-list, .at-sum, .at-rows) { border-radius: 16px !important; border-color: #e7e9ee !important; }

  /* icon-only buttons: icons never squeezed to nothing by a global button padding */
  .ix-page :is(.adm-cal-nav, .ix-notification-btn, .ix-icon-btn, .cm-nb) { padding: 0 !important; display: inline-flex; align-items: center; justify-content: center; }
  .ix-page :is(.adm-cal-nav, .ix-notification-btn, .ix-icon-btn, .cm-nb, .ix-b) > svg { flex: none; }
  .ix-page .adm-cal-nav { width: 30px !important; height: 30px !important; display: inline-flex !important; align-items: center; justify-content: center; }

  /* table headers: the same look as the admin tables (My Requests had small capitals) */
  .ix-page .ix-content .rq-table th { background: #f6f7f9 !important; color: #4b5563 !important; font-size: 12.5px !important; font-weight: 600 !important; letter-spacing: 0 !important; text-transform: none !important; padding: 13px 16px !important; }

  /* search boxes: the text box inside has no second background (it showed as a grey box inside the white one) */
  .ix-page .ix-content :is(.ix-search, .mon-search, .oa-search, .an-search) input { background: transparent !important; border: 0 !important; box-shadow: none !important; height: 100% !important; }
  .ix-page .ix-content :is(.ix-search, .mon-search, .an-search) { background: #fff !important; border: 1px solid #d6d3d1 !important; }
  .ix-page .ix-content .oa-search { background: #fbfbfc !important; border: 1px solid #e7e9ee !important; }
  .ix-page .ix-content :is(.ix-search, .mon-search, .an-search, .oa-search):focus-within { border-color: var(--u-orange, #e8582a) !important; box-shadow: 0 0 0 3px rgba(232,88,42,.12) !important; }

  /* NFC card steps on tablets and phones: labels sit under their own circles */
  @media (max-width: 1100px) {
    /* NFC card steps: labels small enough to sit under their circles */
    .ix-page .ix-content .nc-steps { width: 100% !important; max-width: 340px; margin-left: auto !important; margin-right: auto !important; }
    .ix-page .ix-content .nc-steps li { flex: 1 1 0; min-width: 0; }
    .ix-page .ix-content .nc-steps li span, .ix-page .ix-content .nc-steps li b { font-size: 10px !important; letter-spacing: 0 !important; white-space: nowrap !important; text-align: center; }
  }
  @media (max-width: 420px) { .ix-page .ix-content .nc-steps li span, .ix-page .ix-content .nc-steps li b { font-size: 9px !important; } }

  /* ═══ phones and small tablets ═══ */
  @media (max-width: 640px) {
    /* top bar: no full-screen button on phones, so the page name fits */
    .ix-page .ix-nav .ix-fs-btn { display: none !important; }
    .ix-page .ix-top-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    /* touch-friendly buttons */
    .ix-page .ix-content .ix-b:not(.sm) { height: 42px !important; }
    /* filter rows: search on its own line, dropdowns two per line, all full width */
    .ix-page .ix-content :is(.mon-bar, .dtr-filters) { display: flex !important; flex-wrap: wrap !important; gap: 8px !important; }
    .ix-page .ix-content :is(.mon-bar, .dtr-filters) > :is(select, .ix-select, .dtr-sel, input[type=date], .rec-date) { flex: 1 1 calc(50% - 4px) !important; min-width: 0 !important; width: auto !important; }
    .ix-page .ix-content :is(.mon-bar, .dtr-filters) > :is(.ix-search, .mon-search, .dtr-search, .ix-b) { flex: 1 1 100% !important; width: 100% !important; max-width: none !important; }
    .ix-page .ix-content .dtr-filters .dtr-search { flex: 1 1 100% !important; }
    /* quarterly report bar */
    .ix-page .ix-content .qr-bar { gap: 10px !important; }
    .ix-page .ix-content .qr-bar .ix-field { flex: 1 1 100% !important; min-width: 0 !important; }
    .ix-page .ix-content .qr-bar .ix-field select { width: 100% !important; }
    .ix-page .ix-content .qr-bar .ix-b { flex: 1 1 auto; }
    /* end of term filters: two per line, nothing cut off */
    .ix-page .ix-content .eot-filters { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
    .ix-page .ix-content .eot-filters > * { min-width: 0 !important; }
    .ix-page .ix-content .eot-filters :is(select, input) { width: 100% !important; min-width: 0 !important; }
    /* card request stages: 2 × 2 instead of a row that runs off the screen */
    .ix-page .ix-content .idq-steps { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px !important; overflow: visible !important; }
    .ix-page .ix-content .idq-steps > :not(.idq-step) { display: none !important; }
    .ix-page .ix-content .idq-step { min-width: 0 !important; }
  }

  /* the same 14px gap between cards on every page */
  .ix-page .ix-content :is(.dbx, .dbx-col, .at-stack, .rq-side, .oa, .mv2, .qr-layout, .al-wrap, .so-cols, .rq-cols, .nc-page, .nc-row, .pf-page, .pf-grid, .qr, .qr-main, .cm-cols) { gap: 14px !important; }

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
    .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side .adm-cal-grid { grid-auto-rows: 32px !important; row-gap: 3px !important; }
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
    .ix-page.lay2 .ix-acct-txt { display: none; }
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
  .ix-acct-txt { display: flex; flex-direction: column; align-items: flex-end; line-height: 1.2; min-width: 0; text-align: right; }
  .ix-acct-role { font-size: 11.5px; font-weight: 600; color: #94a3b8; letter-spacing: .02em; white-space: nowrap; }
  .ix-acct-btn:hover .ix-acct-role, .ix-acct-btn.open .ix-acct-role { color: #c2410c; }
  .ix-acct-btn .ix-av { flex-shrink: 0; }
  @media (max-width: 600px) { .ix-acct-txt { display: none; } .ix-acct-btn { padding: 0 4px; } }
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
  /* the header sits at the top of the profile and scrolls with it (it never covers the details) */
  .ix-page .imc-head { position: static; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; padding: 14px 18px; margin: 0;
    background: #fff; border: 1px solid #eceef1; border-radius: 14px; }
  .ix-page .imc-back { flex: none; display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; border: 0; background: none; padding: 0;
    font: inherit; font-size: 13px; font-weight: 600; color: #ea580c; cursor: pointer; }
  .ix-page .imc-back:hover { text-decoration: underline; }
  .ix-page .imc-head-t { min-width: 0; display: flex; align-items: baseline; gap: 8px; line-height: 1.25; }
  .ix-page .imc-head-t small { font-size: 12.5px; font-weight: 500; color: #9ca3af; }
  .ix-page .imc-head-t b { font-size: 17px; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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
  /* the intern's announcement card shows two announcements; with more, the list scrolls inside the card */
  .ix-page .adm-duty > .ann-list.ann-two, .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right > .dbx-side > .adm-duty:last-child > .ann-list.ann-two {
    flex: none !important; min-height: 0 !important; max-height: 236px !important; overflow-y: auto !important; padding-right: 4px !important;
    scrollbar-width: thin; scrollbar-color: #f0c9b8 transparent; overscroll-behavior: contain; }
  .ann-list.ann-two::-webkit-scrollbar { width: 6px; } .ann-list.ann-two::-webkit-scrollbar-thumb { background: #f0c9b8; border-radius: 99px; }
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
  :is(.ipv-grid, .uz) .uf-cell:focus-within, .uz-f.uf-cell:focus-within { background: none; box-shadow: none; }   /* only the input itself shows focus */
  .uz :is(.uf-input, select, textarea):focus { border-color: #e8582a !important; box-shadow: 0 0 0 3px rgba(232,88,42,.15) !important; }
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

  /* bell list (grouped, compact) */
  .ix-notification-dropdown.nf2 { width: 372px; display: flex; flex-direction: column; }
  .nf2-head { display: flex; align-items: center; gap: 8px; padding: 14px 16px 12px; border-bottom: 1px solid #f1f5f9; }
  .nf2-head strong { font-size: 15px; color: #0f172a; }
  .nf2-new { font-size: 10.5px; font-weight: 700; color: #c2410c; background: #fff1e6; padding: 2px 8px; border-radius: 99px; }
  .nf2-link { margin-left: auto; display: inline-flex; align-items: center; gap: 4px; background: none; border: 0; padding: 4px 6px; border-radius: 6px; cursor: pointer; font: inherit; font-size: 11.5px; font-weight: 600; color: #e8582a; }
  .nf2-link:hover { background: #fff1e6; }
  .nf2-link.danger { color: #64748b; }
  .nf2-link.danger:hover { background: #fef2f2; color: #dc2626; }
  .nf2-list { max-height: min(440px, calc(100vh - 190px)); padding-bottom: 4px; }
  .nf2-label { position: sticky; top: 0; z-index: 1; background: var(--ix-surface, #fff); padding: 10px 16px 4px; font-size: 10.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #94a3b8; }
  .nf2-row { position: relative; display: flex; align-items: flex-start; margin: 1px 6px; border-radius: 10px; transition: background .15s; }
  .nf2-row:hover { background: #f8fafc; }
  .nf2-row.unread { background: #fff7f2; }
  .nf2-row.unread:hover { background: #fff1e8; }
  .nf2-main { flex: 1; min-width: 0; display: flex; gap: 10px; align-items: flex-start; padding: 9px 30px 9px 10px; border: 0; background: none; text-align: left; font: inherit; color: inherit; cursor: default; border-radius: 10px; }
  .nf2-main.go { cursor: pointer; }
  .nf2-main:focus-visible { outline: 2px solid #f97316; outline-offset: -2px; }
  .nf2-ic { width: 30px; height: 30px; flex: none; border-radius: 9px; display: flex; align-items: center; justify-content: center; }
  .nf2-ic.t-blue { background: #e0f2fe; color: #0369a1; }
  .nf2-ic.t-amber { background: #fef3c7; color: #b45309; }
  .nf2-ic.t-teal { background: #ccfbf1; color: #0f766e; }
  .nf2-ic.t-violet { background: #ede9fe; color: #6d28d9; }
  .nf2-ic.t-orange { background: #ffedd5; color: #c2410c; }
  .nf2-ic.t-green { background: #dcfce7; color: #15803d; }
  .nf2-ic.t-red { background: #fee2e2; color: #b91c1c; }
  .nf2-ic.t-slate { background: #f1f5f9; color: #475569; }
  .nf2-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .nf2-top { display: flex; align-items: baseline; gap: 8px; }
  .nf2-top strong { flex: 1; min-width: 0; font-size: 12.5px; font-weight: 700; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nf2-row.read .nf2-top strong { font-weight: 600; color: #334155; }
  .nf2-top small { flex: none; font-size: 10.5px; color: #94a3b8; }
  .nf2-msg { font-size: 11.5px; line-height: 1.4; color: #64748b; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .nf2-dot { position: absolute; right: 12px; top: 33px; width: 7px; height: 7px; border-radius: 50%; background: #e8582a; pointer-events: none; }
  .nf2-x { position: absolute; right: 6px; top: 7px; width: 22px; height: 22px; min-width: 0; padding: 0 !important; border: 0; border-radius: 50%; background: transparent; color: #94a3b8; display: flex; align-items: center; justify-content: center; cursor: pointer; opacity: 0; transition: opacity .15s, background .15s, color .15s; }
  .nf2-row:hover .nf2-x, .nf2-x:focus-visible { opacity: 1; }
  .nf2-x:hover { background: #fee2e2; color: #dc2626; }
  .nf2-row:hover .nf2-top small { visibility: hidden; }
  @media (hover: none) { .nf2-x { opacity: 1; } .nf2-top small { visibility: visible !important; margin-right: 14px; } }
  .nf2-foot { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px 8px 16px; border-top: 1px solid #f1f5f9; font-size: 11px; color: #94a3b8; }
  .nf2-empty { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 34px 20px 38px; text-align: center; }
  .nf2-empty > span { width: 44px; height: 44px; border-radius: 50%; background: #fff1e6; color: #ea580c; display: flex; align-items: center; justify-content: center; margin-bottom: 6px; }
  .nf2-empty strong { font-size: 13px; color: #1e293b; }
  .nf2-empty small { font-size: 11.5px; color: #94a3b8; }

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
  /* every Export button sits at the right end of its toolbar */
  .ix-page .ix-exp { margin-left: auto !important; flex: none; }
  /* status · program · grouping switches, under the search row */
  .ix-page .mon-bar2 { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: -2px 0 14px; }
  .ix-page .mon-bar2 .mon-group { margin-left: auto; }
  @media (max-width: 760px) { .ix-page .mon-bar2 .mon-group { margin-left: 0; } }
  .ix-page .mon-search { width: 260px; height: 34px; }
  .ix-page .mon-search input { font-size: 12.5px; }
  .ix-page .mon-chip { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: 99px; cursor: pointer;
    border: 1px dashed #d9dde3; background: var(--ix-surface, #fff); font-family: inherit; font-size: 11.5px; font-weight: 600; line-height: 1; color: #64748b; white-space: nowrap; }
  .ix-page .mon-chip:hover { border-color: #f6c7b0; color: #c2410c; }
  .ix-page .mon-filter { width: auto !important; min-width: 150px; flex: none; height: 38px; }
  .ix-page .mon-count { cursor: default; }
  .ix-page .mon-exp { flex: none; }
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


  /* modality / scope tags on the Monitor Interns cards */
  .ix-page .imc-wrap { display: flex; flex-direction: column; gap: 18px; }
  .ix-page .imc-gh { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; padding: 0 2px 8px; margin-bottom: 10px; border-bottom: 1px solid #e7e9ee; }
  .ix-page .imc-gh b { font-size: 14px; font-weight: 600; color: #1f2430; }
  .ix-page .imc-gh span { font-size: 12.5px; color: #6b7280; }
  .ix-page .imc-gh em { margin-left: auto; font-style: normal; font-size: 12px; color: #6b7280; }
  .ix-page .imc-tags { display: flex !important; gap: 4px; margin-top: 4px; flex-wrap: wrap; }
  .ix-page .imc-tag { font-style: normal; font-size: 10.5px; font-weight: 700; padding: 2px 7px; border-radius: 99px; line-height: 1.3; background: #eef2ff; color: #4338ca; }
  .ix-page .imc-tag.a-red { background: #fdeaea; color: #b91c1c; }
  .ix-page .imc-tag.a-amber { background: #fff4e0; color: #b45309; }
  .ix-page .imc-tag.m-virtual { background: #f3e8ff; color: #7e22ce; }
  .ix-page .imc-tag.m-hybrid { background: #e0f2fe; color: #0369a1; }
  .ix-page .imc-tag.m-project { background: #dcfce7; color: #15803d; }
  .ix-page .imc-tag.s { background: #fef3c7; color: #92400e; }
`;