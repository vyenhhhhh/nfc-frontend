// InternDashboard.jsx
import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import Shell, {
  Spinner, PageHeader, StatCard, Badge, Table, Section, Msg, Icon, Ring, Avatar, Bar, Modal, Drawer, Empty, Inbox,
  calcHours, fmtTime, greeting, esc, requiredHoursFor, programKey,
  PRE_REQUIREMENTS, POST_REQUIREMENTS, DURING_REQUIREMENTS, REQUIREMENTS_BY_PHASE, reqsFor, dueStatus, AnnouncementBoard, AccountSecurity, UserDetails,
  sessionsByDate, dayHours, dayOvertime, fmtMinutes, manilaHour, dtrModeOf, DTR_MODES, MODALITIES, SCOPES, modalityOf, scopeOf, SCHEDULE, liveRefresh, todayManila,
  ojtComplete, confirmBox } from "../components/DashKit.jsx";

// Home look (stats, calendar, gaps) is shared with the admin / coordinator dashboards
import { HomeCalendar, Calendar, adminCss } from "./AdminDashboard.jsx";
import { DashLayout, Panel, DashRow, DashEmpty, TimeLine } from "../components/DashBoard.jsx";
import { formalLayout } from "../components/formalLayout.js";
import { mdCss } from "../components/materialTheme.js";
import { API } from "../config.js";
import { fileHref, openFile, useFileLinkState } from "../files.js";
import RequirementForms from "./RequirementForms.jsx";   // blank forms to download and print
import { MyGrade, gradeIsNew } from "../components/Evaluations.jsx";   // the internship grade, once the coordinator releases it
import { Pager } from "../components/ReviewQueue.jsx";   // page numbers under a table
import { ID_OFFICE, CardFace, CardBack, idCardCss, loadCardSettings } from "../components/NfcCards.jsx";   // where interns sign and claim their ID card


const NAV = [
  { path: "/intern",          label: "Dashboard",     icon: "dashboard" },
  { path: "/intern/online",   label: "Submit Online", icon: "upload" },
  { path: "/intern/movs",     label: "Submit MOV",    icon: "folder" },
  { path: "/intern/records",  label: "My Attendance", icon: "list" },
  { path: "/intern/dtr",      label: "My DTR",        icon: "file" },
  { path: "/intern/grade",    label: "My Grade",      icon: "chart" },
  { path: "/intern/requests", label: "My Request",    icon: "inbox" },
  { path: "/intern/nfc",      label: "My NFC Card",   icon: "card" },
  { path: "/intern/calendar", label: "Calendar",      icon: "calendar" },
  { path: "/intern/profile",  label: "My Profile",    icon: "user" },
];

/* Confetti for the finish line: only mounted when the intern has rendered all required hours.
   Draws on a canvas over the panel, plays once (and again when the ring is clicked), and stops by itself. */
function FinishConfetti({ play }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !play) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const box = cv.parentElement;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = box.clientWidth, H = box.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    const colors = ["#e8582a", "#f59e0b", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#fcd34d"];
    const bits = [];
    const burst = (x, n, dir) => {
      for (let i = 0; i < n; i++) {
        const a = (-Math.PI / 2) + dir * (Math.random() * 0.9) + (Math.random() - 0.5) * 0.5;
        const v = 7 + Math.random() * 9;
        bits.push({ x, y: H * 0.85, vx: Math.cos(a) * v, vy: Math.sin(a) * v, w: 5 + Math.random() * 6, h: 3 + Math.random() * 5,
          r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4, c: colors[(Math.random() * colors.length) | 0], round: Math.random() < 0.25, life: 0 });
      }
    };
    burst(W * 0.08, 70, 1); burst(W * 0.92, 70, -1);
    const t2 = setTimeout(() => { burst(W * 0.3, 40, 1); burst(W * 0.7, 40, -1); }, 700);
    let raf, last = performance.now();
    const tick = (now) => {
      const dt = Math.min((now - last) / 16.67, 2); last = now;
      ctx.clearRect(0, 0, W, H);
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.vy += 0.28 * dt; b.vx *= 0.992; b.x += b.vx * dt; b.y += b.vy * dt; b.r += b.vr * dt; b.life += dt;
        if (b.y > H + 20 || b.life > 260) { bits.splice(i, 1); continue; }
        ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, (260 - b.life) / 60));
        ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.fillStyle = b.c;
        if (b.round) { ctx.beginPath(); ctx.arc(0, 0, b.w / 2.4, 0, 6.28); ctx.fill(); } else ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        ctx.restore();
      }
      if (bits.length || performance.now() - last < 900) raf = requestAnimationFrame(tick); else ctx.clearRect(0, 0, W, H);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); clearTimeout(t2); ctx.clearRect(0, 0, W, H); };
  }, [play]);
  return <canvas ref={ref} className="dbx-confetti" aria-hidden="true" />;
}

export default function InternDashboard() {
  const user = JSON.parse(sessionStorage.getItem("user") || "{}");
  const { pathname: path } = useLocation();
  const navigate = useNavigate();

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [program, setProgram] = useState(user.program || "");
  const [dtrMode, setDtrMode] = useState(dtrModeOf(user));
  const [prior, setPrior] = useState(Number(user.prior_hours) || 0);   // hours from an earlier term
  const [, setProjectDone] = useState(!!user.project_confirmed_at);   // re-renders once /me says the project is confirmed

  // the login response has no program / DTR type, so read them from the account
  useEffect(() => {
    fetch(`${API}/me?user_id=${user.id}`)
      .then((r) => r.json())
      .then((d) => {
        const acct = d?.user || d || {};
        setProgram(acct.program || "");
        setDtrMode(dtrModeOf(acct));
        setPrior(Number(acct.prior_hours) || 0);
        // project-based interns finish by project, not by hours: keep the two fields with the signed-in user
        try {
          const cur = JSON.parse(sessionStorage.getItem("user") || "{}");
          sessionStorage.setItem("user", JSON.stringify({ ...cur, modality: acct.modality ?? cur.modality, project_confirmed_at: acct.project_confirmed_at ?? null }));
        } catch { /* keep the session as it is */ }
        setProjectDone(!!acct.project_confirmed_at);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchRecords();
    return liveRefresh(fetchRecords);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchRecords = async () => {
    try {
      const res = await fetch(`${API}/intern/attendance?user_id=${user.id}`);
      const data = await res.json();
      setRecords(Array.isArray(data) ? data : []);
    } catch {
      /* keep what we already have */
    } finally {
      setLoading(false);
    }
  };

  // the sidebar count on Submit MOV: what the intern has to act on — requirements returned by the coordinator
  // and reports the coordinator asked for that aren't sent yet (refreshes live, like the rest of the page)
  // + requirement notices (approved / returned / reminders) not read yet: they are marked read when Submit MOV is opened
  const [movTodo, setMovTodo] = useState(0);
  const movNotif = (n) => n && !n.is_read && (n.type === "mov_review" || n.type === "requirement_reminder"
    || (!n.type && /requirement/i.test(n.title || "")));
  const onMovs = path === "/intern/movs";
  useEffect(() => {
    const load = () => Promise.all([
      fetch(`${API}/intern/my-movs?user_id=${user.id}`, { headers: { Accept: "application/json" } }).then((r) => r.json()).catch(() => []),
      fetch(`${API}/reports`, { headers: { Accept: "application/json" } }).then((r) => r.json()).catch(() => []),
      fetch(`${API}/notifications?user_id=${user.id}`, { headers: { Accept: "application/json" } }).then((r) => r.json()).catch(() => []),
    ]).then(async ([mv, rp, nt]) => {
      let unread = (Array.isArray(nt) ? nt : []).filter(movNotif);
      if (onMovs && unread.length) {
        // the intern is on Submit MOV now: these notices are seen (the bell updates too)
        await Promise.all(unread.map((n) => fetch(`${API}/notifications/${n.id}/read`, { method: "PATCH", headers: { Accept: "application/json" } }).catch(() => {})));
        window.dispatchEvent(new Event("notifications-changed"));
        unread = [];
      }
      const list = Array.isArray(mv) ? [...mv].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))) : [];
      const latest = new Map();   // newest upload per requirement (or per report)
      list.forEach((m) => {
        const k = m.report_id ? `r${m.report_id}` : `${m.phase || "pre"}:${m.requirement}`;
        if (m.requirement && m.requirement !== "others" && !latest.has(k)) latest.set(k, m);
      });
      const returned = [...latest.values()].filter((m) => m.status === "rejected").length;
      const toSend = (Array.isArray(rp) ? rp : []).filter((r) => !latest.has(`r${r.id}`)).length;
      // a "returned" notice is already counted as a returned requirement, so only the other unread notices are added
      const notices = unread.filter((n) => !/returned|rejected/i.test(n.title || "")).length;
      setMovTodo(returned + toSend + notices);
    }).catch(() => {});
    load();
    return liveRefresh(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMovs]);
  // the sidebar count on My Grade: shown when the coordinator released the grade, gone once the intern opens My Grade
  const [gradeNew, setGradeNew] = useState(false);
  useEffect(() => {
    const load = () => fetch(`${API}/my-grade`, { headers: { Accept: "application/json" } }).then((r) => r.json())
      .then((g) => setGradeNew(gradeIsNew(g))).catch(() => {});
    const seen = () => setGradeNew(false);
    load();
    window.addEventListener("grade-seen", seen);
    const stop = liveRefresh(load);
    return () => { window.removeEventListener("grade-seen", seen); stop && stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const nav = NAV.map((it) => (it.path === "/intern/movs" && movTodo > 0 ? { ...it, badge: movTodo }
    : it.path === "/intern/grade" && gradeNew && path !== "/intern/grade" ? { ...it, badge: 1 } : it));

  const uniqueDays = [...new Set(records.map((r) => r.date))].length;
  const totalHours = calcHours(records);
  const onsite = records.filter((r) => r.uid !== "ONLINE").length;
  const online = records.filter((r) => r.uid === "ONLINE").length;
  const lastTap = records.find((r) => r.uid !== "ONLINE"); // latest kiosk tap
  const firstName = user.name?.split(" ")[0] || "Intern";
  const required = requiredHoursFor(program, prior);

  return (
    <Shell navItems={nav} user={user}>
      {/* admin CSS first, intern CSS after so it can override, material theme last */}
      <style>{adminCss}</style>
      <style>{internCss}</style>
      <style>{formalLayout}</style>
      <style>{mdCss}</style>
      <style>{cardUnify}</style>
      {/* the pre-internship pop-up was removed: Getting started and Requirements due on the dashboard show the same thing */}
      {path === "/intern" && (
        <Home
          user={user} firstName={firstName} uniqueDays={uniqueDays} totalHours={totalHours}
          onsite={onsite} online={online} lastTap={lastTap} loading={loading} records={records} required={required}
          onApply={() => navigate("/intern/nfc")}
          go={navigate}
        />
      )}
      {(path === "/intern/records" || path === "/intern/hours") && (
        <Attendance user={user} records={records} loading={loading} required={required} program={program} onRefresh={fetchRecords} />
      )}
      {path === "/intern/dtr" && (
        <MyDtr user={user} records={records} loading={loading} mode={dtrMode} />
      )}
      {path === "/intern/online" && <SubmitOnline user={user} />}
      {path === "/intern/movs" && <SubmitMov user={user} unlocked={ojtComplete({ ...user, program, prior_hours: prior }, totalHours)} totalHours={totalHours} required={required} />}
      {path === "/intern/requests" && <MyRequests user={user} records={records} />}
      {path === "/intern/grade" && (
        <>
          <PageHeader title="My Grade" sub="Your internship grade, once your OJT coordinator releases it." />
          <div className="gr-page">
            <MyGrade />
          </div>
        </>
      )}
      {path === "/intern/calendar" && <Calendar mode="intern" />}
      {path === "/intern/nfc" && <NfcApply user={user} records={records} />}
      {path === "/intern/profile" && <Profile user={user} totalHours={totalHours} required={required} days={uniqueDays} />}
    </Shell>
  );
}

/* ───────────────────────── My Requests ─────────────────────────
   Everything the intern asked for, in one place, with where each one is now:
   Online attendance and overtime: Filed → HTE supervisor (confirms) → OJT coordinator (final decision);
   interns without a supervisor go straight to the coordinator.
   Time corrections: Filed → HTE supervisor (final decision).
   The modality (on-site / hybrid / virtual) is decided by the HTE, so interns don't request it. */
const REQ_KINDS = {
  online:     { label: "Online attendance", icon: "upload" },
  overtime:   { label: "Overtime",          icon: "clock" },
  correction: { label: "Time correction",   icon: "pencil" },
  event:      { label: "Excused",           icon: "calendar" },
};

function reqSteps(row) {
  const steps = row.supervisorOnly ? ["Filed", "Supervisor"]
    : row.viaSupervisor ? ["Filed", "Supervisor", "Coordinator"] : ["Filed", "Coordinator"];
  const last = steps.length - 1;
  let done = 1, current = 1, failed = -1;
  if (row.status === "endorsed" && !row.supervisorOnly) { done = 2; current = 2; }
  else if (row.status === "approved") { done = steps.length; current = -1; }
  else if (row.status === "rejected") {
    // rejected by the coordinator if the supervisor had already confirmed it, otherwise by the first reviewer
    failed = row.viaSupervisor && !row.endorsed ? 1 : last;
    done = failed; current = -1;
  }
  return steps.map((label, i) => ({
    label,
    state: i === failed ? "fail" : i < done ? "done" : i === current ? "now" : "todo",
  }));
}

const REQ_STATUS = {
  pending:  { label: "Waiting", type: "pending" },
  endorsed: { label: "Confirmed by supervisor", type: "pending" },
  approved: { label: "Approved", type: "approved" },
  rejected: { label: "Rejected", type: "rejected" },
};

function MyRequests({ user, records }) {
  const [online, setOnline] = useState([]);
  const [fixes, setFixes] = useState([]);
  const [events, setEvents] = useState([]);
  const [hasSup, setHasSup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [type, setType] = useState("all");
  const [page, setPage] = useState(1);   // 10 rows a page, the same pager as the Approvals tables
  useEffect(() => { setPage(1); }, [filter, type]);
  const [openKey, setOpenKey] = useState(null);
  const go = useNavigate();

  const load = async () => {
    const get = (url) => fetch(url, { headers: { Accept: "application/json" } }).then((r) => r.json()).catch(() => null);
    const [o, c, me, ev] = await Promise.all([
      get(`${API}/intern/my-online?user_id=${user.id}`),
      get(`${API}/intern/time-corrections`),
      get(`${API}/me?user_id=${user.id}`),
      get(`${API}/intern/school-events`),
    ]);
    if (Array.isArray(o)) setOnline(o);
    if (Array.isArray(c)) setFixes(c);
    if (Array.isArray(ev)) setEvents(ev);
    if (me) setHasSup(!!(me.user || me).supervisor_id);
    setLoading(false);
  };
  useEffect(() => { load(); return liveRefresh(load); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // take back a request the supervisor has not checked yet (excused day, time correction, online attendance)
  const REMOVE_URL = { event: "intern/school-events", correction: "intern/time-corrections", online: "intern/submit-online" };
  const [rmMsg, setRmMsg] = useState("");
  useEffect(() => { setRmMsg(""); }, [openKey]);
  const removeRequest = async (row) => {
    if (!(await confirmBox({ title: "Remove this request?", message: "Your request is taken back and will not be reviewed.", ok: "Yes, remove", danger: true }))) return;
    setRmMsg("");
    try {
      const res = await fetch(`${API}/${REMOVE_URL[row.kind]}/${row.rid}`, { method: "DELETE", headers: { Accept: "application/json" } });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setRmMsg(d.message || "Couldn't remove the request."); return; }
      setOpenKey(null); load();
    } catch { setRmMsg("Couldn't reach the server."); }
  };

  const day = (v) => v ? new Date(String(v).slice(0, 10) + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
  const time12 = (t) => {
    const hm = String(t || "").match(/(\d{1,2}):(\d{2})/);
    if (!hm) return "";
    const [h, m] = [Number(hm[1]), Number(hm[2])];
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  };

  const rows = [
    ...online.map((o) => ({
      key: `o${o.id}`, rid: o.id, kind: "online", date: o.date, status: o.status, viaSupervisor: hasSup,
      endorsed: !!o.endorsed_at || o.status === "endorsed",
      details: o.description, remarks: o.remarks || o.endorse_remarks,
    })),
    ...records.filter((r) => r.ot_status).map((r) => ({
      key: `t${r.id}`, kind: "overtime", date: r.date, status: r.ot_status, viaSupervisor: hasSup,
      endorsed: !!r.ot_endorsed_at || r.ot_status === "endorsed",
      details: r.ot_status === "approved" && r.ot_approved_minutes != null
        ? `${fmtMinutes(r.ot_approved_minutes)} approved of ${fmtMinutes(r.ot_minutes || 0)}`
        : `${fmtMinutes(r.ot_minutes || 0)} after 5:00 PM`,
      remarks: r.ot_remarks,
    })),
    ...fixes.map((c) => ({
      key: `c${c.id}`, rid: c.id, kind: "correction", date: c.date, proof_path: c.proof_path, proof_name: c.proof_name, status: c.status, viaSupervisor: true, supervisorOnly: true,
      endorsed: !!c.endorsed_at || c.status === "endorsed",
      details: `${c.kind === "day" ? `Missed the whole day · in ${time12(c.requested_in)}, out` : c.kind === "in" ? `Forgot to time in · in ${time12(c.requested_in)}, out` : "Forgot to time out ·"} ${time12(c.requested_out || c.time_out)} — ${c.reason || ""}`, remarks: c.remarks || c.endorse_remarks,
    })),
    ...events.map((v) => ({
      key: `e${v.id}`, rid: v.id, proof_path: v.proof_path, proof_name: v.proof_name, kind: "event", date: v.date, status: v.status, viaSupervisor: hasSup, evId: v.id,
      endorsed: !!v.endorsed_at || v.status === "endorsed",
      details: `${v.event_name}${v.mandatory ? " (mandatory)" : ""} · excused ${PORTION_LBL[v.portion] || "whole day"}, no hours counted for it${v.reason ? " — " + v.reason : ""}`,
      remarks: v.remarks || v.endorse_remarks,
    })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const groupOf = (r) => (r.status === "approved" ? "approved" : r.status === "rejected" ? "rejected" : "waiting");
  const ofType = type === "all" ? rows : rows.filter((r) => r.kind === type);
  const count = (g) => ofType.filter((r) => groupOf(r) === g).length;
  const shown = filter === "all" ? ofType : ofType.filter((r) => groupOf(r) === filter);
  const PER_PAGE = 10;
  const pageRows = shown.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const open = rows.find((r) => r.key === openKey);

  // this month's numbers for the side card
  const ym = manilaToday().slice(0, 7);
  const thisMonth = rows.filter((r) => String(r.date || "").slice(0, 7) === ym);
  const otCredited = records.filter((r) => r.ot_status === "approved" && String(r.date || "").slice(0, 7) === ym)
    .reduce((n, r) => n + Number(r.ot_approved_minutes || 0), 0);

  const Steps = ({ r, big }) => (
    <ol className={big ? "rq-steps rq-steps-lg" : "rq-trk"} aria-label="Progress">
      {reqSteps(r).map((x) => (
        <li key={x.label} className={x.state}><i>{big ? (x.state === "done" ? "✓" : x.state === "fail" ? "✕" : "") : ""}</i><span>{x.label}</span></li>
      ))}
    </ol>
  );

  return (
    <>
      <PageHeader title="My Request" sub="Everything you filed and where it is now." live />

      <div className="mon-bar rq-bar">
        {/* same switch as "My online submissions" */}
        <div className="so-tabs" role="tablist" aria-label="Filter by status">
          {[["all", "All", ofType.length], ["waiting", "Waiting", count("waiting")], ["approved", "Approved", count("approved")], ["rejected", "Rejected", count("rejected")]].map(([k, l, n]) => (
            <button key={k} type="button" role="tab" aria-selected={filter === k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l} · {n}</button>
          ))}
        </div>
        <span className="mon-sep" />
        <select className="ix-select at-month rq-type" value={type} aria-label="Filter by type" onChange={(e) => setType(e.target.value)}>
          <option value="all">All types</option>
          {Object.entries(REQ_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <div className="rq-cols">
        <div className="ix-card flush rq-table">
          {loading ? <Spinner /> : shown.length === 0 ? (
            <div className="rq-empty"><Icon name="inbox" size={22} /><b>{rows.length ? "Nothing here" : "No requests yet"}</b>
              <small>Online attendance, overtime, time corrections and excuses you file will show up here.</small></div>
          ) : (
            <><div className="rq-tscroll"><table>
              <thead><tr><th>Request</th><th>Filed</th><th>Where it is</th><th>Status</th></tr></thead>
              <tbody>
                {pageRows.map((r) => {
                  const st = REQ_STATUS[r.status] || { label: r.status || "—", type: "none" };
                  const g = groupOf(r);
                  return (
                    <tr key={r.key} className={`g-${g}`} tabIndex={0} onClick={() => setOpenKey(r.key)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenKey(r.key); } }}>
                      <td>
                        <div className="rq-what">
                          <span className={`rq-ic ${g}`}><Icon name={REQ_KINDS[r.kind].icon} size={15} /></span>
                          <div><strong>{REQ_KINDS[r.kind].label}</strong><small>{r.details || ""}</small>
                            {r.remarks && g === "rejected" && <em className="rq-rem">“{r.remarks}”</em>}</div>
                        </div>
                      </td>
                      <td className="rq-date">{day(r.date)}</td>
                      <td><Steps r={r} /></td>
                      <td className="rq-st"><Badge label={r.status === "endorsed" ? "Waiting" : st.label} type={st.type} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
            <Pager page={page} total={shown.length} perPage={PER_PAGE} onPage={setPage} /></>
          )}
        </div>

        <aside className="rq-side">
          <div className="ix-card rq-box">
            <b>This month</b>
            <div className="rq-nums">
              <div><small>Waiting</small><strong className="w">{thisMonth.filter((r) => groupOf(r) === "waiting").length}</strong></div>
              <div><small>Approved</small><strong className="a">{thisMonth.filter((r) => groupOf(r) === "approved").length}</strong></div>
              <div><small>Rejected</small><strong className="r">{thisMonth.filter((r) => groupOf(r) === "rejected").length}</strong></div>
              <div><small>OT</small><strong>{fmtMinutes(otCredited)}</strong></div>
            </div>
          </div>
          <div className="ix-card rq-box">
            <b>File a request</b>
            <div className="rq-new">
              <button type="button" title="Opens My Attendance: use “Request fix” on that day" onClick={() => go("/intern/records")}><Icon name="pencil" size={15} /><span>Forgot to time in / out</span></button>
              <button type="button" title="Opens My Attendance" onClick={() => go("/intern/records", { state: { missedDay: Date.now() } })}><Icon name="calendar" size={15} /><span>Missed a whole day</span></button>
              <button type="button" onClick={() => go("/intern/online")}><Icon name="upload" size={15} /><span>Online attendance</span></button>
              <button type="button" title="Opens Submit Online, Excused absence tab" onClick={() => go("/intern/online", { state: { kind: "event" } })}><Icon name="calendar" size={15} /><span>Excused (sick, school event)</span></button>
            </div>
          </div>
          <div className="ix-card rq-box rq-how-box">
            <b>How approval works</b>
            <ol className="rq-how2">
              <li><span>1</span><div><strong>You file it</strong><small>From My Attendance or Submit Online.</small></div></li>
              <li><span>2</span><div><strong>Your HTE supervisor checks it</strong><small>Tap fixes end here. Excuses go on to the coordinator.</small></div></li>
              <li><span>3</span><div><strong>The OJT coordinator decides</strong><small>For online days, overtime and excuses.</small></div></li>
            </ol>
            <div className="rq-legend">
              <small>What the colors mean</small>
              <div><span><i className="done" />Done</span><span><i className="now" />Waiting</span><span><i className="fail" />Rejected</span></div>
            </div>
          </div>
        </aside>
      </div>

      {open && (() => {
        const st = REQ_STATUS[open.status] || { label: open.status || "—", type: "none" };
        return (
          <Drawer inPage title={REQ_KINDS[open.kind].label} kicker={`Filed ${day(open.date)}`} icon={REQ_KINDS[open.kind].icon} onClose={() => setOpenKey(null)}>
            <div className="rq-drawer">
              <div className="rq-dst"><Badge label={st.label} type={st.type} /></div>
              <div className="ibx-sec"><span>Where it is now</span><Steps r={open} big /></div>
              {open.details && <div className="ibx-sec"><span>Details</span><p>{open.details}</p></div>}
              {open.proof_path && <div className="ibx-sec"><span>Proof</span><p><a className="ix-link" href={fileHref(open.proof_path)} onClick={(e) => openFile(open.proof_path, e)} target="_blank" rel="noopener noreferrer">{open.proof_name || "View file"}</a></p></div>}
              {open.remarks && <div className="ibx-sec"><span>Remarks</span><p>“{open.remarks}”</p></div>}
              {/* only while still waiting for the supervisor: once checked, it can't be taken back */}
              {REMOVE_URL[open.kind] && open.status === "pending" && (
                <button type="button" className="ix-b ghost" onClick={() => removeRequest(open)}>Remove request</button>
              )}
              <Msg msg={rmMsg ? { type: "error", text: rmMsg } : null} />
            </div>
          </Drawer>
        );
      })()}


    </>
  );
}

/* ───────────────────────── Home helpers ───────────────────────── */
const DAY_MS = 86400000;
const manilaToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
const addDays = (iso, n) => new Date(new Date(iso + "T12:00:00Z").getTime() + n * DAY_MS).toISOString().slice(0, 10);
export const weekdayIdx = (iso) => (new Date(iso + "T12:00:00Z").getUTCDay() + 6) % 7; // Mon = 0

// consecutive weekdays with a record (weekends never break the streak)
function streakOf(days, today) {
  const set = new Set(days);
  let cur = today;
  if (!set.has(cur)) cur = addDays(cur, -1); // today may simply not have started yet
  let n = 0;
  for (let i = 0; i < 400; i++) {
    if (weekdayIdx(cur) >= 5) { cur = addDays(cur, -1); continue; }
    if (!set.has(cur)) break;
    n++;
    cur = addDays(cur, -1);
  }
  return n;
}

const fmtElapsed = (ms) => {
  const m = Math.max(Math.floor(ms / 60000), 0);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

/* ───────────────────────── Home ───────────────────────── */
function Home({ user, firstName, uniqueDays, totalHours, onsite, online, lastTap, loading, records, onApply, go, required }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(iv);
  }, []);

  // pre-internship requirements and the NFC card, for the number strip and "Getting started"
  // the last answers are kept in this browser, so the dashboard shows at once and refreshes quietly (no waiting spinner)
  const cacheKey = `mytrack.home.${user.id}`;
  const cached = (() => { try { return JSON.parse(localStorage.getItem(cacheKey) || "{}") || {}; } catch { return {}; } })();
  const [pre, setPre] = useState(cached.pre ?? null);       // { approved, total, status }
  const [card, setCard] = useState(cached.card ?? null);     // null (loading) | true | false
  const [myMovs, setMyMovs] = useState(cached.myMovs || []);    // every requirement the intern sent (newest first)
  const [deadlines, setDeadlines] = useState(cached.deadlines || {}); // "during:weekly_report" -> due date
  const [reports, setReports] = useState(cached.reports || []);     // reports the coordinator asked for
  const saveCache = (patch) => { try { const c = JSON.parse(localStorage.getItem(cacheKey) || "{}") || {}; localStorage.setItem(cacheKey, JSON.stringify({ ...c, ...patch })); } catch { /* private window */ } };
  const [fixes, setFixes] = useState([]);         // time corrections the intern already sent
  useEffect(() => {
    const load = () => {
      fetch(`${API}/intern/time-corrections?user_id=${user.id}`, { headers: { Accept: "application/json" } })
        .then((r) => r.json())
        .then((d) => { if (Array.isArray(d)) setFixes(d); })
        .catch(() => {});
      fetch(`${API}/intern/my-movs?user_id=${user.id}`, { headers: { Accept: "application/json" } })
        .then((r) => r.json())
        .then((list) => {
          if (!Array.isArray(list)) return;
          setPre(preStatusOf(list));
          setMyMovs(list);
          saveCache({ pre: preStatusOf(list), myMovs: list });
        })
        .catch(() => {});
      // due dates set by the coordinator
      fetch(`${API}/requirement-deadlines`, { headers: { Accept: "application/json" } })
        .then((r) => r.json())
        .then((d) => { if (Array.isArray(d)) { const m = Object.fromEntries(d.map((x) => [`${x.phase}:${x.requirement}`, x.due_date])); setDeadlines(m); saveCache({ deadlines: m }); } })
        .catch(() => {});
      fetch(`${API}/reports`, { headers: { Accept: "application/json" } })
        .then((r) => r.json())
        .then((d) => { if (Array.isArray(d)) { setReports(d); saveCache({ reports: d }); } })
        .catch(() => {});
      fetch(`${API}/me?user_id=${user.id}`, { headers: { Accept: "application/json" } })
        .then((r) => r.json())
        .then((d) => { const c = !!(d?.user || d)?.nfc_uid; setCard(c); saveCache({ card: c }); })
        .catch(() => setCard(false));
    };
    load();
    return liveRefresh(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // hold the "Getting started" / "Requirements due" slot until its data is in, so the page doesn't jump around while loading
  const [gsWaited, setGsWaited] = useState(false);
  useEffect(() => { const t = setTimeout(() => setGsWaited(true), 900); return () => clearTimeout(t); }, []);
  const slotReady = gsWaited || pre !== null;   // the card step fills in by itself if /me is slower

  const needsCard = user.work_mode !== "offsite";
  const pct = Math.max(Math.min((totalHours / required) * 100, 100), 0);
  const left = Math.max(Math.round((required - totalHours) * 10) / 10, 0);
  const nextMilestone = [25, 50, 75, 100].find((m) => pct < m);
  const hrsToMilestone = nextMilestone
    ? Math.max(Math.round(((nextMilestone / 100) * required - totalHours) * 10) / 10, 0)
    : 0;

  const today = manilaToday();
  const dateLabel = new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" });
  const streak = streakOf([...new Set(records.map((r) => r.date))], today);

  // current session
  const lastIn = lastTap?.action === "CHECK_IN";
  const lastTime = lastTap
    ? fmtTime(lastTap.action === "CHECK_OUT" && lastTap.checked_out_at ? lastTap.checked_out_at : lastTap.checked_in_at)
    : "";
  let state = { tone: "", title: "No time in yet", text: "Tap your card on the kiosk when you arrive." };
  if (lastTap && lastIn && lastTap.date === today) {
    state = { tone: "live", title: "You're on the clock", text: `Timed in at ${lastTime} · ${fmtElapsed(now - new Date(lastTap.checked_in_at).getTime())} so far` };
  } else if (lastTap && lastTap.date === today) {
    state = { tone: "", title: "Timed out", text: `Timed out at ${lastTime}` };
  }

  // one row per day (like My Attendance)
  const sessions = sessionsByDate(records);
  const dayInfo = (d) => {
    const s = sessions[d] || [];
    const last = [...s].reverse().find((x) => x.out);
    const open = s.some((x) => !x.out);
    return { date: d, online: s.some((x) => x.online), in: s[0]?.in, out: open ? null : last?.out || null, open, parts: s, hrs: s.length ? dayHours(s) : 0 };
  };
  // the last 5 taps (each time in and each time out is its own row)
  const recentTaps = Object.entries(sessions)
    .flatMap(([date, list]) => list.flatMap((x, i) => [
      { key: `${date}-${i}-in`, date, at: x.in, kind: "in", online: x.online },
      ...(x.out ? [{ key: `${date}-${i}-out`, date, at: x.out, kind: "out", online: x.online }] : []),
    ]))
    .filter((t) => t.at)
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 5);
  const todayInfo = dayInfo(today);

  // forgot to time out / forgot to time in: each day to fix, newest first (the request opens in My Attendance)
  const toFix = missingTaps(records, fixes, today);
  const fixDay = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

  // this week, Monday to Friday
  const monday = addDays(today, -weekdayIdx(today));
  const week = ["M", "T", "W", "T", "F"].map((l, i) => {
    const d = addDays(monday, i);
    const info = dayInfo(d);
    const h = Math.round(info.hrs * 10) / 10;
    const cls = d === today && info.open ? "now" : h >= SCHEDULE.dailyCap ? "full" : h > 0 ? "part" : "";
    return { l, d, h, cls, label: d === today && info.open ? "now" : h > 0 ? h + "h" : "—" };
  });

  // Getting started: first steps for a new intern; the card disappears once everything is done
  const steps = pre === null ? [] : [
    {
      key: "pre", title: `Pre-internship requirements (${pre.approved}/${pre.total})`,
      state: pre.status === "approved" ? "done" : pre.status === "pending" ? "wait" : "todo",
      sub: pre.status === "approved" ? "All approved. Your internship has started."
        : pre.status === "pending" ? "All uploaded. Waiting for your OJT coordinator to approve the rest."
        : pre.status === "rejected" ? "A document was returned. Please upload a corrected copy."
        : "Your taps count once all of them are approved.",
      action: pre.status === "approved" || pre.status === "pending" ? null : { label: "Upload", run: () => go("/intern/movs") },
    },
    // interns who work offsite don't need a card
    ...(needsCard || card ? [{
      key: "card", title: "Get your NFC card",
      state: card ? "done" : "todo",
      sub: card ? "Your card is linked to your account."
        : "Apply now, no need to wait for your requirements.",
      action: card ? null : { label: "Apply", run: onApply },
    }] : []),
    {
      key: "tap", title: "Log your first attendance",
      state: records.length ? "done" : "todo",
      sub: records.length ? "You're all set." : "Tap your card on the kiosk when you arrive.",
      action: null,
    },
  ];
  const stepsDone = steps.filter((x) => x.state === "done").length;
  const showSteps = steps.length > 0 && stepsDone < steps.length;

  // confetti only when the required hours are really rendered (never for an unfinished internship)
  // project-based: done when the coordinator confirms the project (marked first by the HTE supervisor)
  const isProject = modalityOf(user) === "project";
  const [proj, setProj] = useState(null);   // { marked_at, confirmed_at } for project-based interns
  useEffect(() => {
    if (!isProject || !user.id) return;
    fetch(`${API}/interns/${user.id}/project`, { headers: { Accept: "application/json" } })
      .then((r) => r.json()).then((d) => { if (d && "project_based" in d) setProj(d); }).catch(() => {});
  }, [isProject, user.id]);
  const done = isProject ? !!(proj?.confirmed_at || user.project_confirmed_at) : Number(required) > 0 && Number(totalHours) >= Number(required);
  const [confettiRun, setConfettiRun] = useState(1);

  // Finish line: when the intern finishes at their own pace (weekends and holidays skipped)
  const holidays = useHolidays();
  const avgDay = uniqueDays ? totalHours / uniqueDays : 0;
  const isWorkday = (d) => weekdayIdx(d) < 5 && !holidays[d];
  const workdaysFor = (hrs) => (avgDay ? Math.ceil(hrs / avgDay - 1e-9) : null);
  const projectDate = (hrs) => {               // the workday when `hrs` more hours are done, counting from tomorrow
    const n = workdaysFor(hrs);
    if (n === null) return null;
    let d = today;
    for (let k = n, i = 0; k > 0 && i < 1000; i++) { d = addDays(d, 1); if (isWorkday(d)) k--; }
    return d;
  };
  const fmtD = (d, year) => new Date(d + "T00:00:00").toLocaleDateString("en-US", year ? { month: "short", day: "numeric", year: "numeric" } : { month: "short", day: "numeric" });
  let run = 0;
  const reachedOn = {};                        // first day the running total passed each milestone
  Object.keys(sessions).sort().forEach((d) => {
    run += dayHours(sessions[d]);
    [25, 50, 75, 100].forEach((m) => { if (!reachedOn[m] && run >= (m / 100) * required) reachedOn[m] = d; });
  });
  const firstDay = Object.keys(sessions).sort()[0];
  const milestones = [0, 25, 50, 75, 100].map((m) => {
    if (m === 0) return { m, state: "ok", label: firstDay ? fmtD(firstDay) : "Start" };   // the starting point
    const target = (m / 100) * required;
    if (totalHours >= target) return { m, state: "ok", label: reachedOn[m] ? fmtD(reachedOn[m]) : "Done" };
    const est = projectDate(target - totalHours);
    return { m, state: m === nextMilestone ? "next" : "", label: est ? "~" + fmtD(est) : "—" };
  });
  const finishDate = left > 0 ? projectDate(left) : null;
  const daysLeft = left > 0 ? workdaysFor(left) : 0;

  // Requirements due: during- and post-internship requirements, the ones that need action first
  // post-internship opens after the hours (project-based: once the project is confirmed complete)
  const hoursDone = modalityOf(user) === "project" ? !!user.project_confirmed_at : totalHours >= required;
  const RANK = { overdue: 0, returned: 1, due: 2, todo: 3, locked: 4, waiting: 5, approved: 6 };
  const dueList = [["during", DURING_REQUIREMENTS], ["post", reqsFor("post", user)]].flatMap(([phase, list]) => list.map((r) => {
    const m = myMovs.find((x) => x.requirement === r.key && (x.phase || "pre") === phase);
    const due = deadlines[`${phase}:${r.key}`];
    const ds = dueStatus(due, m);
    const phaseTag = phase === "during" ? "During" : "Post";
    let st, sub;
    if (m?.status === "approved" && !r.repeat) { st = "approved"; sub = "Approved"; }
    else if (m?.status === "pending") { st = "waiting"; sub = "Sent · waiting for your coordinator"; }
    else if (m?.status === "rejected") { st = "returned"; sub = m.remarks ? `Returned: ${m.remarks}` : "Returned · upload a corrected copy"; }
    else if (phase === "post" && !hoursDone) { st = "locked"; sub = isProject ? "Opens once your project is confirmed complete" : "Opens once you finish your required hours"; }
    else if (ds?.tone === "rejected") { st = "overdue"; sub = ds.label; }
    else if (ds?.tone === "pending") { st = "due"; sub = ds.label; }
    else { st = "todo"; sub = r.repeat ? (m ? "Sent before · submit the next one" : "Submit one every week (or month)") : ds ? ds.label : "Not submitted yet"; }
    return { key: `${phase}:${r.key}`, label: r.label, phaseTag, st, sub };
  }))
    // the weekly / monthly report is listed per report the coordinator asked for
    .filter((x) => x.key !== "during:weekly_report")
    .concat(reports.map((rp) => {
      const m = myMovs.find((x) => Number(x.report_id) === Number(rp.id));
      const ds = dueStatus(rp.due_date, m);
      let st, sub;
      if (m?.status === "approved") { st = "approved"; sub = "Approved"; }
      else if (m?.status === "pending") { st = "waiting"; sub = "Sent · waiting for your coordinator"; }
      else if (m?.status === "rejected") { st = "returned"; sub = m.remarks ? `Returned: ${m.remarks}` : "Returned · upload a corrected copy"; }
      else if (ds?.tone === "rejected") { st = "overdue"; sub = ds.label; }
      else if (ds?.tone === "pending") { st = "due"; sub = ds.label; }
      else { st = "todo"; sub = ds ? ds.label : "Not submitted yet"; }
      return { key: `report:${rp.id}`, label: rp.title, phaseTag: "During", st, sub };
    }))
    .sort((a, b) => RANK[a.st] - RANK[b.st]);
  const dueCount = dueList.filter((x) => ["overdue", "returned", "due", "todo"].includes(x.st)).length;
  const DUE_LOOK = {
    overdue: ["warn", "red", "Overdue", "red"], returned: ["warn", "red", "Returned", "red"], due: ["calendar", "amber", "Due soon", "amber"],
    todo: ["upload", "", "To do", "orange"], locked: ["lock", "", "Later", ""], waiting: ["clock", "amber", "Waiting", "amber"], approved: ["check", "green", "Approved", "green"],
  };

  const dShort = (d) => new Date(d + "T00:00:00");

  const hrsTxt = (h) => (Math.round(h * 10) / 10) + "h";

  return (
    <DashLayout
      title={`${greeting()}, ${firstName}`}
      sub={dateLabel}
      status={{ text: state.tone === "live" ? `On the clock · ${fmtElapsed(now - new Date(lastTap.checked_in_at).getTime())}` : state.title, tone: state.tone }}
      actions={[
        { icon: "file", label: "My DTR", run: () => go("/intern/dtr") },
        { icon: "upload", label: "Submit online", run: () => go("/intern/online") },
        { icon: "folder", label: "Submit MOV", run: () => go("/intern/movs"), primary: true },
      ]}
      /* colourful tiles (the hours progress bar lives in "My OJT finish line" below) */
      strip={[
        { icon: "clock", tone: "t-orange", label: "Hours rendered", value: `${totalHours}h`, sub: left > 0 ? `${left}h left of ${required}h` : "Required hours completed" },
        { icon: "calendar", tone: "t-green", label: "Days present", value: uniqueDays, sub: "days logged" },
        { icon: "flame", tone: "t-amber", label: "Streak", value: streak + (streak === 1 ? " day" : " days"), sub: streak >= 3 ? "keep it going" : "weekdays in a row" },
        { icon: "globe", tone: "t-blue", label: "Kiosk / online log", value: `${onsite} / ${online}`, sub: "kiosk taps and online logs" },
        { icon: "folder", tone: "t-purple", label: "Requirements", value: pre ? `${pre.approved} / ${pre.total}` : "—", sub: "pre-internship done", onClick: () => go("/intern/movs") },
      ]}
      left={(
        <>
          <Panel className="dbx-today">
            <div className="dbx-state">
              <span className={`dbx-dot ${state.tone}`}><Icon name={state.tone === "warn" ? "warn" : "tap"} size={18} /></span>
              <div><b>{state.title}</b><small>{state.text}</small></div>
            </div>
            {toFix.length > 0 && (
              <div className="dbx-fix" role="alert">
                {toFix.slice(0, 2).map((r) => {
                  const lone = r.date === today;   // today's only tap is late in the afternoon
                  return (
                    <div key={r.id} className="dbx-fix-row">
                      <span className="dbx-fix-ic"><Icon name="warn" size={14} /></span>
                      <span className="dbx-fix-tx">
                        <b>{lone ? "Forgot to time in?" : `No time out · ${fixDay(r.date)}`}</b>
                        <small>{lone
                          ? `Your only tap today: ${fmtTime(r.checked_in_at).replace(/:\d\d(?= )/, "")}`
                          : `Only one tap: ${fmtTime(r.checked_in_at).replace(/:\d\d(?= )/, "")}`}</small>
                      </span>
                      <button type="button" className="ix-b primary sm" onClick={() => go("/intern/records", { state: { fix: r.id } })}>Request fix</button>
                    </div>
                  );
                })}
                {toFix.length > 2 && (
                  <button type="button" className="dbx-fix-more" onClick={() => go("/intern/records")}>+{toFix.length - 2} more day{toFix.length - 2 === 1 ? "" : "s"} to fix in My Attendance</button>
                )}
              </div>
            )}
            <div className="dbx-kv">
              <div><small>Time in</small><b>{todayInfo.in ? fmtTime(todayInfo.in).replace(/:\d\d(?= )/, "") : "—"}</b></div>
              <div><small>Time out</small><b>{todayInfo.out ? fmtTime(todayInfo.out).replace(/:\d\d(?= )/, "") : "—"}</b></div>
              <div><small>Today</small><b>{hrsTxt(todayInfo.hrs)}</b></div>
            </div>
            <div className="dbx-wkcap">This week</div>
            <div className="dbx-wk">
              {week.map((w) => <span key={w.d} className={`${w.cls}${w.d === today ? " is-today" : ""}`}><b>{w.l}</b>{w.label}</span>)}
            </div>
          </Panel>
          {!slotReady && (
            <Panel title=" " className="dbx-gs" grow><Spinner /></Panel>
          )}
          {slotReady && showSteps && (
            <Panel title="Getting started" count={`${stepsDone} of ${steps.length} done`} className="dbx-gs" grow>
              <div className="dbx-gs-bar"><i style={{ width: `${(stepsDone / steps.length) * 100}%` }} /></div>
              <ol className="dbx-gs-list">
                {steps.map((x, i) => (
                  <li key={x.key} className={x.state}>
                    <span className="dbx-gs-dot">{x.state === "done" ? <Icon name="check" size={13} /> : i + 1}</span>
                    <span className="dbx-tx"><b>{x.title}</b><small>{x.sub}</small></span>
                    {x.action && <button type="button" className="ix-b primary sm" onClick={x.action.run}>{x.action.label}</button>}
                  </li>
                ))}
              </ol>
            </Panel>
          )}
          {/* once Getting started is done, the same spot shows the requirements still to do */}
          {slotReady && !showSteps && (
            <Panel title="Requirements due" count={dueCount || undefined} link="Submit MOV" onLink={() => go("/intern/movs")}>
              {dueList.slice(0, 5).map((x) => (
                <DashRow key={x.key} icon={DUE_LOOK[x.st][0]} tone={DUE_LOOK[x.st][1]} title={x.label}
                  sub={`${x.phaseTag}-internship · ${x.sub}`} tag={DUE_LOOK[x.st][2]} tagTone={DUE_LOOK[x.st][3]}
                  onClick={x.st === "locked" ? undefined : () => go("/intern/movs")} />
              ))}
              {dueList.length > 5 && <div className="dbx-more">+{dueList.length - 5} more in Submit MOV</div>}
            </Panel>
          )}
        </>
      )}
      right={<><HomeCalendar /><AnnouncementBoard limit={3} /></>}
    >
      <Panel title="My OJT finish line" link="My Attendance" onLink={() => go("/intern/records")} className="dbx-fin">
        <div className="dbx-fin-body">
          {done && <FinishConfetti play={confettiRun} />}
          <div className={`dbx-ring${done ? " done" : ""}`} style={{ "--p": pct }}
            onClick={done ? () => setConfettiRun((n) => n + 1) : undefined} title={done ? "Click to celebrate again" : undefined}>
            <div><b>{pct.toFixed(0)}%</b><small>{totalHours}h of {required}h</small></div>
          </div>
          <div className="dbx-eta">
            {isProject ? (
              done ? (
                <><small>Congratulations!</small><div className="dbx-eta-big"><em>Project complete</em></div><small>The OJT coordinator confirmed your project. Your post-internship requirements are open.</small></>
              ) : proj?.marked_at ? (
                <><small>Your HTE supervisor marked your project as complete</small><div className="dbx-eta-big"><em>Waiting for the coordinator</em></div><small>Once the OJT coordinator confirms it, your post-internship requirements open.</small></>
              ) : (
                <><small>You are project-based</small><div className="dbx-eta-big"><em>Project in progress</em></div><small>Your OJT is complete when all the tasks of your project are done: your HTE supervisor marks it, then the coordinator confirms it. This can be before or after your {required}h.</small></>
              )
            ) : left <= 0 ? (
              <><small>Congratulations!</small><div className="dbx-eta-big"><em>Hours completed</em></div><small>You've finished your required OJT hours.</small></>
            ) : finishDate ? (
              <><small>At your pace ({Math.round(avgDay * 10) / 10}h a day) you finish around</small>
                <div className="dbx-eta-big"><em>{fmtD(finishDate, true)}</em></div>
                <small>{daysLeft} working day{daysLeft === 1 ? "" : "s"} left · {left}h to go · weekends and holidays skipped</small></>
            ) : (
              <><small>Your finish date</small><div className="dbx-eta-big"><em>Not yet</em></div><small>Log your first day to see when you'll finish.</small></>
            )}
            {/* one straight line from 0% to 100%: each dot sits at its own percent, the orange part is the hours done */}
            {!isProject && <div className="dbx-ms">
              <span className="dbx-ms-track"><span className="dbx-ms-fill" style={{ width: Math.min(pct, 100) + "%" }} /></span>
              {milestones.map((x) => (
                <div key={x.m} className={x.state} style={{ left: x.m + "%" }}>
                  <i>{x.state === "ok" && x.m > 0 ? <Icon name="check" size={12} /> : x.m === 100 ? "★" : x.m}</i>
                  <b>{x.m}%</b>
                  <small>{x.label}</small>
                </div>
              ))}
            </div>}
          </div>
        </div>
      </Panel>

      <Panel title="Recent attendance" count={recentTaps.length} link="View all" onLink={() => go("/intern/records")} grow>
        {loading ? <Spinner /> : recentTaps.length === 0 ? (
          <DashEmpty title="No records yet." sub="Tap your card to log your first day." />
        ) : (
          <ul className="dbx-rows dbx-fill">
            {recentTaps.map((t) => (
              <li key={t.key} className="dbx-tap">
                <span className={`dbx-dd${t.date === today ? " today" : ""}`}>
                  <b>{dShort(t.date).getDate()}</b>
                  <small>{dShort(t.date).toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}</small>
                </span>
                <span className="dbx-tap-day">{dShort(t.date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</span>
                <span className={`dbx-tag ${t.online ? "purple" : "blue"}`}>{t.online ? "Online log" : "Kiosk"}</span>
                <span className={`dbx-tag ${t.kind === "in" ? "green" : "orange"}`}>{t.kind === "in" ? "Time in" : "Time out"}</span>
                <span className="dbx-tap-time">{fmtTime(t.at).replace(/:\d\d(?= )/, "")}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </DashLayout>
  );
}

/* Days that need a time correction:
   - a past day with a time in but no time out (forgot to time out, or the only tap was really the time out)
   - today, when the only tap is late in the afternoon (likely a time out: forgot to time in)
   Days with a request already waiting (or approved) are left out. */
const FIX_OPEN = ["pending", "endorsed", "approved"];
const minutesOf = (v) => Math.round(manilaHour(v) * 60);   // minutes after midnight, Manila time
const SCHEDULE_START_MIN = SCHEDULE.amIn * 60;              // 8:00 AM
export function missingTaps(records, fixes, today) {
  return records
    .filter((r) => r.uid !== "ONLINE" && r.checked_in_at && !r.checked_out_at)
    .filter((r) => r.date < today || minutesOf(r.checked_in_at) >= 16 * 60)
    .filter((r) => !fixes.some((f) => Number(f.attendance_id) === Number(r.id) && FIX_OPEN.includes(f.status)))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

/* ───────────────────────── My Attendance (records + total hours) ───────────────────────── */
// proof for a time correction or a missed day (same look as the excused-absence proof)
function ProofField({ id, file, onFile, hint = true }) {
  return (
    <div className="ix-field so-proof">
      <label htmlFor={id}>Proof (photo or PDF, required)</label>
      <label className={`so-file${file ? " has" : ""}`} htmlFor={id}>
        <Icon name="upload" size={15} /><span>{file ? file.name : hint ? "Tap to attach: office logbook, message from your supervisor..." : "Attach a photo or PDF"}</span>
        {file && <button type="button" onClick={(e) => { e.preventDefault(); onFile(null); }} aria-label="Remove file">✕</button>}
      </label>
      <input id={id} type="file" accept="image/*,.pdf" hidden onChange={(e) => onFile(e.target.files?.[0] || null)} />
      {hint && <small className="fx-hint">Anything that shows you were at work at that time, like a photo of the office logbook or a message from your supervisor.</small>}
      <style>{PROOF_CSS}</style>
    </div>
  );
}

// "Missed a whole day?": no tap at all on a workday. Lives on My Attendance (My Request links here).
function MissedDayDrawer({ user, records, fixes, onClose, onSent }) {
  const [dayForm, setDayForm] = useState({ date: "", time_in: "08:00", time_out: "17:00", reason: "" });
  const [dayBusy, setDayBusy] = useState(false);
  const [dayMsg, setDayMsg] = useState(null);
  const [dayProof, setDayProof] = useState(null);
  const dayWaiting = fixes.filter((f) => f.kind === "day" && (f.status === "pending" || f.status === "endorsed"));
  const sendDay = async (e) => {
    e.preventDefault();
    if (records.some((r) => r.date === dayForm.date)) { setDayMsg({ type: "error", text: 'That day already has attendance. Use "Request fix" on that day instead.' }); return; }
    if (!dayProof) { setDayMsg({ type: "error", text: "Attach a proof first (a photo or PDF)." }); return; }
    setDayBusy(true); setDayMsg(null);
    try {
      const fd = new FormData();
      Object.entries({ user_id: user.id, kind: "day", ...dayForm, reason: dayForm.reason.trim() }).forEach(([k, v]) => fd.append(k, v));
      fd.append("proof", dayProof);
      const res = await fetch(`${API}/intern/time-corrections`, { method: "POST", headers: { Accept: "application/json" }, body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.errors && Object.values(data.errors)[0]?.[0]) || data.message || "Couldn't send the request.");
      onSent();
    } catch (err) {
      setDayMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    } finally { setDayBusy(false); }
  };
  return (
    <Drawer title="Missed a whole day?" kicker="Attendance request" icon="calendar"
          sub="No tap at all on a workday. Your HTE supervisor approves or rejects it." onClose={onClose}
          footer={(close) => (<>
            <button type="button" className="ix-b ghost" onClick={close} disabled={dayBusy}>Cancel</button>
            <button type="submit" form="rq-day-form" className="ix-b primary" disabled={dayBusy}>{dayBusy ? "Sending..." : "Send request"}</button>
          </>)}>
          <form id="rq-day-form" onSubmit={sendDay} className="ix-form">
            <Msg msg={dayMsg} />
            <div className="ix-field">
              <label htmlFor="rq-day-date">Which day?</label>
              <input id="rq-day-date" type="date" required max={addDays(manilaToday(), -1)} min={addDays(manilaToday(), -30)} value={dayForm.date}
                onChange={(e) => setDayForm((f) => ({ ...f, date: e.target.value }))} />
              <small className="fx-hint">A workday in the last 30 days that has no attendance (a weekday, or a weekend day your HTE marked open).</small>
            </div>
            <div className="fx-two">
              <div className="ix-field">
                <label htmlFor="rq-day-in">Time in</label>
                <input id="rq-day-in" type="time" required min="06:00" value={dayForm.time_in} onChange={(e) => setDayForm((f) => ({ ...f, time_in: e.target.value }))} />
              </div>
              <div className="ix-field">
                <label htmlFor="rq-day-out">Time out</label>
                <input id="rq-day-out" type="time" required max="17:00" value={dayForm.time_out} onChange={(e) => setDayForm((f) => ({ ...f, time_out: e.target.value }))} />
              </div>
            </div>
            <div className="ix-field">
              <label htmlFor="rq-day-reason">Reason</label>
              <textarea id="rq-day-reason" rows={3} required maxLength={500} value={dayForm.reason}
                placeholder="e.g. I left my card at home and the guard let me in. My supervisor saw me that day."
                onChange={(e) => setDayForm((f) => ({ ...f, reason: e.target.value }))} />
            </div>
            <ProofField id="rq-day-proof" file={dayProof} onFile={setDayProof} />
            {dayWaiting.length > 0 && (
              <small className="fx-hint">Already waiting: {dayWaiting.map((f) => new Date(f.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })).join(", ")}</small>
            )}
          </form>
        </Drawer>
  );
}

function Attendance({ user, records, loading, required, program, onRefresh }) {
  // forgot to time out → request a time correction (the HTE supervisor approves or rejects it)
  const [fixes, setFixes] = useState([]);
  const [fixFor, setFixFor] = useState(null);   // { id, date, tap, out, canOut } of the record being fixed
  const [fixKind, setFixKind] = useState("out"); // "out" = forgot to time out, "in" = forgot to time in
  const [fixTime, setFixTime] = useState("17:00");
  const [fixIn, setFixIn] = useState("08:00");
  const [fixReason, setFixReason] = useState("");
  const [fixProof, setFixProof] = useState(null);
  const [fixBusy, setFixBusy] = useState(false);
  const [fixMsg, setFixMsg] = useState(null);
  const [pageMsg, setPageMsg] = useState(null);
  const [dayOpen, setDayOpen] = useState(false);   // "Missed a whole day?"
  const excusedDays = useExcused();

  const loadFixes = async () => {
    try {
      const res = await fetch(`${API}/intern/time-corrections?user_id=${user.id}`, { headers: { Accept: "application/json" } });
      const data = await res.json();
      if (Array.isArray(data)) setFixes(data);
    } catch { /* keep what we have */ }
  };
  useEffect(() => { loadFixes(); /* eslint-disable-next-line */ }, [records.length]);

  // open the request for one kiosk record; kind "in" only = the forgot-to-tap-in form
  const openFix = (rec, only) => {
    if (!rec) return;
    const canOut = !rec.checked_out_at && rec.date < manilaToday();
    setFixFor({ id: rec.id, date: rec.date, tap: rec.checked_in_at, out: rec.checked_out_at || null, canOut: canOut && only !== "in" });
    setFixKind(canOut && only !== "in" ? "out" : "in");
    setFixTime("17:00"); setFixIn("08:00"); setFixReason(""); setFixProof(null); setFixMsg(null);
  };
  // from the Home reminder: open the request for that record right away
  const { state: navState } = useLocation();
  const [autoOpened, setAutoOpened] = useState(null);
  useEffect(() => {
    const id = navState?.fix;
    if (!id || autoOpened === id) return;
    const rec = records.find((r) => Number(r.id) === Number(id));
    if (rec) { openFix(rec); setAutoOpened(id); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navState, records]);
  // from My Request → "Missed a whole day": open that form right away
  const navAtt = useNavigate();
  useEffect(() => {
    if (!navState?.missedDay) return;
    setDayOpen(true);
    navAtt("/intern/records", { replace: true, state: null });   // a reload doesn't open it again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navState]);
  const sendFix = async (e) => {
    e.preventDefault();
    if (!fixProof) { setFixMsg({ type: "error", text: "Attach a proof first (a photo or PDF)." }); return; }
    setFixBusy(true); setFixMsg(null);
    try {
      const fd = new FormData();
      Object.entries({
        user_id: user.id, attendance_id: fixFor.id, kind: fixKind, reason: fixReason.trim(),
        ...(fixKind === "in" ? { time_in: fixIn } : { time_out: fixTime }),
      }).forEach(([k, v]) => fd.append(k, v));
      fd.append("proof", fixProof);
      const res = await fetch(`${API}/intern/time-corrections`, { method: "POST", headers: { Accept: "application/json" }, body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.errors && Object.values(data.errors)[0]?.[0]) || data.message || "Couldn't send the request.");
      setFixFor(null);
      setPageMsg({ type: "success", text: data.message });
      loadFixes();
      onRefresh && onRefresh();
    } catch (err) {
      setFixMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    } finally {
      setFixBusy(false);
    }
  };
  const fixOf = (attendanceId) => fixes.find((f) => f.attendance_id === attendanceId);
  const [filter, setFilter] = useState("all");
  const [month, setMonth] = useState("all"); // "all" or "YYYY-MM"

  const totalHours = calcHours(records);
  const uniqueDays = [...new Set(records.map((r) => r.date))].length;
  const avgHours = uniqueDays > 0 ? (totalHours / uniqueDays).toFixed(1) : 0;
  const pct = Math.max(Math.min((totalHours / required) * 100, 100), 0);
  const left = Math.max(Math.round((required - totalHours) * 10) / 10, 0);
  const nextMilestone = [25, 50, 75, 100].find((m) => pct < m);
  const hrsToMilestone = nextMilestone
    ? Math.max(Math.round(((nextMilestone / 100) * required - totalHours) * 10) / 10, 0)
    : 0;

  // one row per day: first time in, last time out, credited hours (official hours only, approved overtime, 8h cap)
  const sessions = sessionsByDate(records);
  const byDate = {};
  records.forEach((r) => {
    if (byDate[r.date]) return;
    const s = sessions[r.date] || [];
    const last = [...s].reverse().find((x) => x.out);
    byDate[r.date] = {
      checkin: s[0]?.in || null,
      checkout: last?.out || null,
      online: r.uid === "ONLINE",
      hrs: dayHours(s),
      ot: dayOvertime(s),
      openId: s.find((x) => !x.out && !x.online)?.id ?? null,   // kiosk record with no time out
      openIn: s.find((x) => !x.out && !x.online)?.in ?? null,
      firstId: s.find((x) => !x.online)?.id ?? null,            // the day's first kiosk record (for a late time in)
      date: r.date,
    };
  });

  const hoursOf = (t) => (t.checkout ? t.hrs : null);
  const allDays = Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0]));
  const months = [...new Set(allDays.map(([d]) => d.slice(0, 7)))]; // newest first
  const monthName = (m) =>
    new Date(m + "-01T12:00:00Z").toLocaleDateString("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });
  const monthDays = allDays.filter(([d]) => month === "all" || d.startsWith(month));
  const counts = {
    all: monthDays.length,
    onsite: monthDays.filter(([, t]) => !t.online).length,
    online: monthDays.filter(([, t]) => t.online).length,
  };
  const weekday = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-PH", { weekday: "short", timeZone: "UTC" });

  // today is not "to fix" yet (the intern can still tap out); only past days count
  const noCheckout = allDays.filter(([d, t]) => t.checkin && !t.checkout && d !== manilaToday()).length;

  const stats = [
    { icon: "calendar", tone: "orange", label: "Total days", value: uniqueDays, hint: "days logged" },
    { icon: "clock", tone: "blue", label: "Total hours", value: totalHours + "h", hint: `${pct.toFixed(0)}% of ${required}h`, bar: pct },
    { icon: "tap", tone: "green", label: "Average / day", value: avgHours + "h", hint: "hours per day present" },
    noCheckout > 0
      ? { icon: "warn", tone: "red", label: "No time out", value: noCheckout, hint: noCheckout === 1 ? "day to fix" : "days to fix" }
      : { icon: "check", tone: "red ok", label: "No time out", value: 0, hint: "all days complete" },
  ];

  const shownDays = monthDays.filter(([, t]) => filter === "all" || (filter === "online" ? t.online : !t.online));
  const hm = (v) => (v ? new Date(v).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }) : "—");
  // position on a 7 AM – 7 PM line, in %
  const pos = (v) => { const x = new Date(v); return Math.max(0, Math.min(100, ((x.getHours() + x.getMinutes() / 60) - 7) / 12 * 100)); };
  // what to show when a day has no time out: the fix request (or the button to ask for one)
  const recOf = (id) => records.find((r) => Number(r.id) === Number(id));
  const outCell = (date, t) => {
    if (t.checkout && !t.openId) return <span>{hm(t.checkout)}</span>;
    const f = t.openId && fixOf(t.openId);
    const past = date < manilaToday();          // today you can still time out at the kiosk
    // today: a single tap late in the afternoon was probably the time out (forgot to time in)
    const lateTap = !past && t.openIn && minutesOf(t.openIn) >= 16 * 60;
    if (f?.status === "pending" || f?.status === "endorsed") return <Badge label="Fix requested" type="pending" />;
    return (
      <span className="at-fix">
        <Badge label={f?.status === "rejected" ? "Fix rejected" : date === manilaToday() ? "Still in" : "No time out"} type={f?.status === "rejected" ? "rejected" : date === manilaToday() ? "in" : "pending"} />
        {(past || lateTap) && t.openId && <button type="button" className="at-fix-btn" onClick={() => openFix(recOf(t.openId))}>Request fix</button>}
      </span>
    );
  };
  // a late time in on a complete day: "Fix time in" (forgot to time in when they arrived)
  const inFix = (t) => {
    if (t.online || !t.firstId || t.openId === t.firstId) return null;
    const f = fixOf(t.firstId);
    if (f?.status === "pending" || f?.status === "endorsed") return <Badge label="Fix requested" type="pending" />;
    if (f?.status === "approved") return null;
    if (!t.checkin || minutesOf(t.checkin) <= SCHEDULE_START_MIN) return null;
    if (t.date < addDays(manilaToday(), -7)) return null;   // only the last 7 days, so old days stay clean
    return <button type="button" className="at-fix-btn sm at-fix-in" title="Forgot to time in when you arrived?" onClick={() => openFix(recOf(t.firstId), "in")}>Fix time in</button>;
  };
  // group the days by month
  const groups = [];
  shownDays.forEach(([d, t]) => {
    const m = d.slice(0, 7);
    if (!groups.length || groups[groups.length - 1].m !== m) groups.push({ m, days: [] });
    groups[groups.length - 1].days.push([d, t]);
  });

  return (
    <div className="at-stack">
      <PageHeader title="My Attendance" sub="Your attendance log and computed OJT hours, day by day." live />
      <Msg msg={pageMsg} />

      {Object.keys(excusedDays).length > 0 && (
        <div className="at-excused" role="note">
          <Icon name="calendar" size={15} />
          <div>
            <b>Excused days</b>
            <span>{Object.entries(excusedDays).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6)
              .map(([d, n]) => `${new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${n}`).join("   ")}</span>
            <small>Excused, not absent. The event time gives no OJT hours.</small>
          </div>
        </div>
      )}

      {fixFor && (
        <Modal wide title="Request a time correction" sub={`${new Date(fixFor.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · your HTE supervisor decides.`} onClose={() => setFixFor(null)}>
          <form onSubmit={sendFix} className="ix-form fx-compact">
            <Msg msg={fixMsg} />
            <div className="fx-kinds" role="radiogroup" aria-label="What happened?">
              {fixFor.canOut && (
                <label className={fixKind === "out" ? "fx-kind on" : "fx-kind"}>
                  <input type="radio" name="fx-kind" checked={fixKind === "out"} onChange={() => setFixKind("out")} />
                  <b>I forgot to time out</b>
                  <small>I timed in at {hm(fixFor.tap)} but not when I left.</small>
                </label>
              )}
              <label className={fixKind === "in" ? "fx-kind on" : "fx-kind"}>
                <input type="radio" name="fx-kind" checked={fixKind === "in"} onChange={() => setFixKind("in")} />
                <b>I forgot to time in</b>
                <small>{fixFor.out
                  ? `I arrived earlier than my tap at ${hm(fixFor.tap)}.`
                  : `My tap at ${hm(fixFor.tap)} was when I left.`}</small>
              </label>
            </div>
            <div className="fx-two">
            {fixKind === "out" ? (
              <div className="ix-field">
                <label htmlFor="fix-time">What time did you leave?</label>
                <input id="fix-time" type="time" required value={fixTime} max="17:00" onChange={(e) => setFixTime(e.target.value)} />
              </div>
            ) : (
              <div className="ix-field">
                <label htmlFor="fix-in">What time did you arrive?</label>
                <input id="fix-in" type="time" required value={fixIn} min="06:00" onChange={(e) => setFixIn(e.target.value)} />
                <small className="fx-hint">{fixFor.out
                  ? `Your time out stays at ${hm(fixFor.out)}.`
                  : `Your tap at ${hm(fixFor.tap)} becomes your time out.`}</small>
              </div>
            )}
            <ProofField id="fix-proof" file={fixProof} onFile={setFixProof} hint={false} />
            </div>
            <div className="ix-field">
              <label htmlFor="fix-reason">Reason</label>
              <textarea id="fix-reason" rows={2} required maxLength={500} value={fixReason}
                placeholder={fixKind === "in" ? "e.g. I forgot to tap my card when I arrived." : "e.g. I forgot to tap my card before going home."}
                onChange={(e) => setFixReason(e.target.value)} />
            </div>
            <small className="fx-hint">Proof: anything that shows you were at work at that time, like a photo of the office logbook or a message from your supervisor.</small>
            <div className="ix-form-actions">
              <button type="button" className="ix-b ghost" onClick={() => setFixFor(null)} disabled={fixBusy}>Cancel</button>
              <button type="submit" className="ix-b primary" disabled={fixBusy}>{fixBusy ? "Sending..." : "Send request"}</button>
            </div>
          </form>
        </Modal>
      )}


      {/* one slim summary: progress on the left, the numbers beside it */}
      <div className="at-sum">
        <div className="at-sum-prog">
          <div className="at-sum-top">
            <span><b>{totalHours}h</b> of {required}h · {programKey(program) || "OJT"}</span>
            <strong>{pct.toFixed(0)}%</strong>
          </div>
          {/* progress with the 25 / 50 / 75 / 100% marks */}
          <div className="at-ms">
            <div className="at-sum-bar"><i style={{ width: Math.min(pct, 100) + "%" }} /></div>
            {[25, 50, 75, 100].map((m) => (
              <span key={m} className={`at-ms-pt ${pct >= m ? "done" : m === nextMilestone ? "next" : ""}`} style={{ left: m + "%" }}>
                <i>{pct >= m ? "✓" : ""}</i><b>{m}%</b>
              </span>
            ))}
          </div>
          <small>{nextMilestone ? `${hrsToMilestone}h to your ${nextMilestone}% mark · ${left}h left` : "All required hours rendered. Great work!"}</small>
        </div>
        {stats.filter((x) => x.label !== "Total hours").map((x) => (
          <div key={x.label} className={`at-sum-num ${x.tone}`}>
            <small>{x.label}</small><b>{x.value}</b><em>{x.hint}</em>
          </div>
        ))}
      </div>

      {/* filters */}
      <div className="mon-bar at-bar">
        {/* same switch as "My online submissions" (All · Waiting · Approved · Rejected) */}
        <div className="so-tabs" role="tablist" aria-label="Filter by type">
          {["all", "onsite", "online"].map((f) => (
            <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={filter === f ? "on" : ""}>
              {/* how the day was recorded (not the modality): a kiosk tap or a log sent through Submit Online */}
              {{ all: "All", onsite: "Kiosk", online: "Online log" }[f]} · {counts[f]}
            </button>
          ))}
        </div>
        <span className="mon-sep" />
        <select className="ix-select at-month" value={month} aria-label="Filter by month" onChange={(e) => setMonth(e.target.value)}>
          <option value="all">All months</option>
          {months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
        </select>
        <span className="at-day-box">
          <button type="button" className="ix-b ghost at-day-btn" title="No tap at all on a workday" onClick={() => setDayOpen(true)}>
            <Icon name="calendar" size={14} /> Missed a whole day?</button>
        </span>
      </div>
      {dayOpen && (
        <MissedDayDrawer user={user} records={records} fixes={fixes} onClose={() => setDayOpen(false)}
          onSent={() => { setDayOpen(false); loadFixes(); setPageMsg({ type: "success", text: "Request sent. Your HTE supervisor will check it. Follow it in My Request." }); }} />
      )}

      {/* the log: one compact row per day, grouped by month */}
      <div className="at-log2">
        {loading ? <Spinner /> : shownDays.length === 0 ? (
          <Empty icon="list" title="No attendance records match this filter." />
        ) : groups.map((g, gi) => (
          <div key={g.m} className="at-grp">
            <div className="at-grp-h"><span>{monthName(g.m)}</span><small>{g.days.length} day{g.days.length === 1 ? "" : "s"} · {Math.round(g.days.reduce((n, [, t]) => n + (hoursOf(t) || 0), 0) * 10) / 10}h</small>
              {gi === 0 && <em className="at-scale-note">Bars show when you were in, 7 AM – 7 PM</em>}</div>
            <ul className="at-rows">
              {g.days.map(([date, t]) => {
                const hrs = hoursOf(t);
                const a2 = t.checkin ? pos(t.checkin) : null;
                const b2 = t.checkout ? pos(t.checkout) : null;
                const x = new Date(date + "T12:00:00Z");
                return (
                  <li key={date}>
                    <span className="at-dd"><b>{x.getUTCDate()}</b><small>{weekday(date)}</small></span>
                    <Badge label={t.online ? "Online log" : "Kiosk"} type={t.online ? "online" : "onsite"} />
                    <span className="at-io">{hm(t.checkin)} {inFix(t)} <i>→</i> {outCell(date, t)}</span>
                    <span className="at-line" aria-hidden="true">
                      {a2 !== null && <i className={b2 === null ? "open" : ""} style={{ left: a2 + "%", width: Math.max(1.5, (b2 ?? a2 + 4) - a2) + "%" }} />}
                    </span>
                    <span className="at-h">
                      <b>{hrs !== null ? `${hrs.toFixed(2)}h` : "—"}</b>
                      {t.ot && <small className={`at-ot ${t.ot.status}`}>OT {fmtMinutes(t.ot.minutes)} · {t.ot.status === "approved" ? `${fmtMinutes(t.ot.approved)} credited` : t.ot.status === "pending" ? "waiting" : "not credited"}</small>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────── Submit Online ───────────────────────── */
// If your Laravel route has a different name, change it here.
const ONLINE_LIST_URL = `${API}/intern/my-online`;

const cap = (s = "") => s.charAt(0).toUpperCase() + s.slice(1);
// requirement status shown to the intern: a sent-back file is "Returned" (stored as "rejected")
const movLabel = (s = "") => (s === "rejected" ? "Returned" : s === "pending" ? "Waiting" : cap(s));
const statusType = (s) => (s === "approved" ? "approved" : s === "rejected" ? "rejected" : "pending");

// Delete endpoints (Laravel). Change here if your routes are named differently.
const ONLINE_DELETE_URL = (id, uid) => `${API}/intern/submit-online/${id}?user_id=${uid}`;
const MOV_DELETE_URL = (id, uid) => `${API}/intern/submit-mov/${id}?user_id=${uid}`;

// "Remove" with an inline "are you sure?" step (only shown for pending items)
function RemoveBtn({ onConfirm }) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  if (ask) {
    return (
      <span className="rm-confirm">
        <button type="button" className="rm-yes" disabled={busy}
          onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); setAsk(false); }}>
          {busy ? "Removing..." : "Yes, remove"}
        </button>
        <button type="button" className="rm-no" disabled={busy} onClick={() => setAsk(false)}>Keep</button>
      </span>
    );
  }
  return (
    <button type="button" className="rm-btn" onClick={() => setAsk(true)} aria-label="Remove this submission">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
      </svg>
      Remove
    </button>
  );
}

/* on-site interns: why a day was not tapped at the kiosk (shown to the supervisor and coordinator) */
const OFFSITE_REASONS = [
  "My supervisor asked me to work from home",
  "Off-site assignment (fieldwork, errand for the office)",
  "Office closed (no power, bad weather, suspension)",
  "My card was lost or damaged",
  "Other (explained below)",
];
// a lost or damaged card: the intern was at the office and the supervisor saw them, so "Tasks completed" is optional
const CARD_LOST = "My card was lost or damaged";

function SubmitOnline({ user }) {
  const [form, setForm] = useState({ date: "", description: "" });
  const [submitting, setSub] = useState(false);
  const [msg, setMsg] = useState(null);
  const [subs, setSubs] = useState([]);
  const [loadingSubs, setLoadingSubs] = useState(true);
  const [tab, setTab] = useState("all");
  const [openId, setOpenId] = useState(null);
  const { state: soState } = useLocation();
  const [kind, setKind] = useState(soState?.kind === "event" ? "event" : "online");   // My Request → "Excused" opens the Excused tab
  const navSo = useNavigate();
  useEffect(() => {
    if (soState?.kind !== "event") return;
    setKind("event");
    navSo("/intern/online", { replace: true, state: null });   // a reload shows the normal tab
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soState]);
  // on-site interns normally tap at the kiosk: a remote day is the exception, so it is an "Off-site day" with a reason
  const offsite = modalityOf(user) === "onsite";
  const [why, setWhy] = useState("");
  const dayLabel = offsite ? "Off-site day" : "Online workday";
  const tasksOptional = offsite && why === CARD_LOST;
  const [evs, setEvs] = useState([]);
  const [evf, setEvf] = useState({ date: "", event_name: "", reason: "", mandatory: false, portion: "whole" });
  const [proof, setProof] = useState(null);

  const fetchSubs = async () => {
    try {
      const res = await fetch(`${ONLINE_LIST_URL}?user_id=${user.id}`, { headers: { Accept: "application/json" } });
      const data = await res.json();
      setSubs(Array.isArray(data) ? data : []);
      const r2 = await fetch(`${API}/intern/school-events?user_id=${user.id}`, { headers: { Accept: "application/json" } }).catch(() => null);
      const d2 = r2 && r2.ok ? await r2.json().catch(() => []) : [];
      setEvs(Array.isArray(d2) ? d2 : []);
    } catch {
      /* keep what we already have */
    } finally {
      setLoadingSubs(false);
    }
  };

  useEffect(() => {
    fetchSubs();
    return liveRefresh(fetchSubs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeSub = async (id, isEv) => {
    setMsg(null);
    try {
      const res = await fetch(isEv ? `${API}/intern/school-events/${id}` : ONLINE_DELETE_URL(id, user.id), { method: "DELETE", headers: { Accept: "application/json" } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Couldn't remove this submission.");
      if (isEv) setEvs((list) => list.filter((x) => x.id !== id)); else setSubs((list) => list.filter((x) => x.id !== id));
      setMsg({ type: "success", text: data.message || "Submission removed." });
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    }
  };

  const all = [
    ...subs.map((x) => ({ ...x, key: `o-${x.id}` })),
    ...evs.map((v) => ({ ...v, key: `e-${v.id}`, isEv: true, description: v.event_name || "Excused" })),
  ];
  const shown = all
    .filter((x) => tab === "all" || soGroup(x) === tab)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const handleSubmit = async (e) => {
    e.preventDefault(); setSub(true); setMsg(null);
    if (kind === "event") {
      if (!proof) { setMsg({ type: "error", text: "Attach a proof first (a medical certificate, event invitation or similar)." }); setSub(false); return; }
      try {
        const fd = new FormData();
        fd.append("user_id", user.id);
        fd.append("date", evf.date);
        fd.append("event_name", evf.event_name.trim());
        fd.append("reason", evf.reason.trim());
        fd.append("mandatory", evf.mandatory ? "1" : "0");
        fd.append("portion", evf.portion);
        if (proof) fd.append("proof", proof);
        const res = await fetch(`${API}/intern/school-events`, { method: "POST", headers: { Accept: "application/json" }, body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data.errors && Object.values(data.errors)[0]?.[0]) || data.message || "Couldn't send the request.");
        setMsg({ type: "success", text: data.message || "Excuse sent for approval." });
        setEvf({ date: "", event_name: "", reason: "", mandatory: false, portion: "whole" });
        setProof(null);
        fetchSubs();
      } catch (err) { setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message }); }
      finally { setSub(false); }
      return;
    }
    if (offsite && !why) { setMsg({ type: "error", text: "Choose why you weren't at the office that day." }); setSub(false); return; }
    try {
      // the server puts the reason at the start of the description, so the supervisor and coordinator see it when they review
      const res = await fetch(`${API}/intern/submit-online`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, date: form.date, description: form.description.trim(), ...(offsite ? { reason: why } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setMsg({ type: "success", text: data.message });
      setForm({ date: "", description: "" });
      setWhy("");
      fetchSubs();
    } catch (err) { setMsg({ type: "error", text: err.message }); }
    finally { setSub(false); }
  };

  return (
    <>
      <PageHeader title="Submit Online Attendance" sub="For asynchronous or remote workdays." />
      {/* the note at the top follows the picked tab: how to log a day, or what an excused absence is */}
      <WorkModeCard user={user} tab={kind} />
      <Msg msg={msg} />
      <div className="so-cols">
        {/* left: the form, always there */}
        <form onSubmit={handleSubmit} className={`ix-card so-form${kind === "event" ? " so-ev" : ""}`}>
          <div className="so-hd"><b>{kind === "event" ? "File an excused absence" : offsite ? "Log an off-site day" : "Log an online day"}</b></div>
          <div className="so-body">
            <div className="so-kind" role="tablist">
              <button type="button" role="tab" aria-selected={kind === "online"} className={kind === "online" ? "on" : ""} onClick={() => setKind("online")}>{dayLabel}</button>
              <button type="button" role="tab" aria-selected={kind === "event"} className={kind === "event" ? "on" : ""} onClick={() => setKind("event")}>Excused absence</button>
            </div>
            {kind === "online" ? (<>
              <div className="ix-field">
                <label htmlFor="ix-date">Date of work</label>
                <input id="ix-date" type="date" value={form.date} required max={manilaToday()}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              {offsite && (
                <div className="ix-field">
                  <label htmlFor="ix-why">Why weren't you at the office?</label>
                  <select id="ix-why" className="ix-select" required value={why} onChange={(e) => setWhy(e.target.value)}>
                    <option value="" disabled>Choose a reason</option>
                    {OFFSITE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              )}
              <div className="ix-field so-fill">
                <label htmlFor="ix-desc">Tasks completed{tasksOptional ? " (optional)" : ""}</label>
                <textarea id="ix-desc" rows={6} value={form.description} required={!tasksOptional} maxLength={500}
                  placeholder={tasksOptional ? "You may leave this blank if you worked at the office as usual." : "Describe in detail what you worked on that day..."}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <small className="so-note">Your HTE supervisor confirms it first, then your OJT coordinator approves or rejects it. Approved days count as 8:00 AM – 5:00 PM.</small>
            </>) : (<>
              <div className="ix-field">
                <label htmlFor="sev-date">Which day?</label>
                <input id="sev-date" type="date" required min={addDays(manilaToday(), -30)} value={evf.date}
                  onChange={(e) => setEvf((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <PortionPick value={evf.portion} onChange={(v) => setEvf((f) => ({ ...f, portion: v }))} />
              <div className="ix-field">
                {/* the "mandatory school event" tick sits on the label's line, so the form stays short */}
                <div className="so-lblrow">
                  <label htmlFor="sev-name">Reason</label>
                  <label className="ix-check so-mand">
                    <input type="checkbox" checked={evf.mandatory} onChange={(e) => setEvf((f) => ({ ...f, mandatory: e.target.checked }))} />
                    <span>Mandatory school event</span>
                  </label>
                </div>
                <input id="sev-name" type="text" required maxLength={160} value={evf.event_name} placeholder="e.g. Sick (fever), Foundation Day"
                  onChange={(e) => setEvf((f) => ({ ...f, event_name: e.target.value }))} />
              </div>
              <div className="ix-field so-fill so-note-fill">
                <label htmlFor="sev-reason">Note (optional)</label>
                <textarea id="sev-reason" rows={2} maxLength={500} value={evf.reason} placeholder="e.g. I will report to the office after lunch."
                  onChange={(e) => setEvf((f) => ({ ...f, reason: e.target.value }))} />
              </div>
              <div className="ix-field so-proof">
                <label htmlFor="sev-proof">Proof (required)</label>
                <label className={`so-file${proof ? " has" : ""}`} htmlFor="sev-proof">
                  <Icon name="upload" size={15} /><span>{proof ? proof.name : "Attach a photo or PDF"}</span>
                  {proof && <button type="button" onClick={(e) => { e.preventDefault(); setProof(null); }} aria-label="Remove file">✕</button>}
                </label>
                <input id="sev-proof" type="file" accept="image/*,.pdf" hidden onChange={(e) => setProof(e.target.files?.[0] || null)} />
              </div>
              <small className="so-note">Excused time gives no hours and isn't marked absent.</small>
            </>)}
            <button type="submit" disabled={submitting} className="ix-b primary so-send">
              <Icon name="send" size={15} /> {submitting ? "Submitting..." : kind === "event" ? "Send for approval" : "Submit for approval"}</button>
          </div>
        </form>

        {/* right: everything already sent, newest first */}
        <div className="ix-card so-list">
          <div className="so-hd">
            <b>My online submissions</b>
            <div className="so-tabs" role="tablist">
              {SO_TABS.map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
                  {label} · {all.filter((x) => soGroup(x) === k || k === "all").length}
                </button>
              ))}
            </div>
          </div>
          {loadingSubs ? <Spinner /> : shown.length === 0 ? (
            <div className="so-empty"><Icon name="upload" size={20} /><b>{all.length ? "Nothing here." : "No submissions yet."}</b>
              <small>{all.length ? "Try another filter." : "Days you log on the left will show up here."}</small></div>
          ) : (
            <ul className="so-items">
              {shown.map((x) => {
                const st = x.isEv ? { ...soStage(x), text: soStage(x).text.replace(" · counted 8:00 AM – 5:00 PM", " · excused day") } : soStage(x);
                const d = new Date(String(x.date).slice(0, 10) + "T12:00:00");
                const isOpen = openId === x.key;
                return (
                  <li key={x.key} className={isOpen ? "open" : ""}>
                    <button type="button" className="so-row" onClick={() => setOpenId(isOpen ? null : x.key)} aria-expanded={isOpen}>
                      <span className="so-dd"><b>{d.getDate()}</b><small>{d.toLocaleDateString("en-US", { weekday: "short" })}</small></span>
                      <span className="so-tx">
                        <b><em className={`so-tag${x.isEv ? "" : " wd"}`}>{x.isEv ? `Excused absence${x.portion === "am" ? " · Morning" : x.portion === "pm" ? " · Afternoon" : ""}` : dayLabel}</em>{x.description}</b>
                        <span className="so-steps"><i className={st.a} /><i className={st.b} /><em>{st.text}</em></span>
                      </span>
                      <span className={`so-pill ${st.tone}`}>{st.label}</span>
                    </button>
                    {isOpen && (
                      <div className="so-more">
                        <div><span>{d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span><p>{x.description}{x.isEv && x.mandatory ? " (mandatory school event)" : ""}{x.isEv ? ` · excused ${PORTION_LBL[x.portion] || "whole day"}` : ""}</p></div>
                        {x.isEv && x.reason && <div><span>Note</span><p>{x.reason}</p></div>}
                        {x.isEv && x.proof_path && <div><span>Proof</span><p><a className="ix-link" href={fileHref(x.proof_path)} onClick={(e) => openFile(x.proof_path, e)} target="_blank" rel="noopener noreferrer">{x.proof_name || "View file"}</a></p></div>}
                        {x.remarks && <div><span>Remarks</span><p>“{x.remarks}”</p></div>}
                        {(x.status || "pending") === "pending" && (
                          <div className="so-act"><small>You can remove it while it's still waiting.</small><RemoveBtn onConfirm={() => removeSub(x.id, x.isEv)} /></div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      <style>{SO_CSS}</style>
    </>
  );
}

const PORTION_LBL = { whole: "whole day", am: "morning", pm: "afternoon" };
function PortionPick({ value = "whole", onChange }) {
  return (
    <div className="ix-field">
      <label>How long are you excused?</label>
      <div className="so-kind so-three" role="radiogroup">
        {[["whole", "Whole day"], ["am", "Morning"], ["pm", "Afternoon"]].map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={value === k} className={value === k ? "on" : ""} onClick={() => onChange(k)}>{l}</button>
        ))}
      </div>
    </div>
  );
}
const SO_TABS = [["all", "All"], ["waiting", "Waiting"], ["approved", "Approved"], ["rejected", "Rejected"]];
const soGroup = (x) => (x.status === "approved" ? "approved" : x.status === "rejected" ? "rejected" : "waiting");
// two dots: 1 = HTE supervisor, 2 = OJT coordinator
function soStage(x) {
  const s = x.status || "pending";
  if (s === "approved") return { a: "done", b: "done", tone: "ok", label: "Approved", text: "Approved · counted 8:00 AM – 5:00 PM" };
  if (s === "endorsed") return { a: "done", b: "wait", tone: "wait", label: "Waiting", text: "Supervisor confirmed · waiting for the coordinator" };
  if (s === "rejected") {
    const bySup = !x.endorsed_at;
    return { a: bySup ? "no" : "done", b: bySup ? "" : "no", tone: "no", label: "Rejected",
      text: `Rejected by the ${bySup ? "supervisor" : "coordinator"}${x.remarks ? `: “${x.remarks}”` : ""}` };
  }
  return { a: "wait", b: "", tone: "wait", label: "Waiting", text: "Waiting for your HTE supervisor" };
}
const PROOF_CSS = `
.so-file { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 12px; border: 1.5px dashed #d6dae1; border-radius: 10px; background: #fafbfc; color: #6b7280; font-size: 12.5px; cursor: pointer; overflow: hidden; box-sizing: border-box; }
.so-file:hover { border-color: #e8582a; color: #c2410c; }
.so-file.has { border-style: solid; border-color: #f6c9b3; background: #fff7f3; color: #c2410c; font-weight: 600; }
.so-file span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.so-file button { border: 0; background: none; color: inherit; cursor: pointer; font-size: 13px; padding: 2px 4px; }`;
const SO_CSS = `
.ix-page .ix-content .so-file { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 12px; border: 1.5px dashed #d6dae1; border-radius: 10px; background: #fafbfc; color: #6b7280; font-size: 12.5px; cursor: pointer; overflow: hidden; }
.ix-page .ix-content .so-file:hover { border-color: #e8582a; color: #c2410c; }
.ix-page .ix-content .so-file.has { border-style: solid; border-color: #f6c9b3; background: #fff7f3; color: #c2410c; font-weight: 600; }
.ix-page .ix-content .so-file span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ix-page .ix-content .so-file button { border: 0; background: none; color: inherit; cursor: pointer; font-size: 13px; padding: 2px 4px !important; }
.ix-page .ix-content .so-kind { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 3px; background: #f3f4f6; border: 1px solid #e8ebf0; border-radius: 10px; }
.ix-page .ix-content .so-kind.so-three { grid-template-columns: 1fr 1fr 1fr; }
.ix-page .ix-content .so-kind button { height: 32px; border: 0; border-radius: 8px; background: transparent; color: #4b5563; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; padding: 0 6px !important; }
.ix-page .ix-content .so-kind button.on { background: #fff; color: #c2410c; box-shadow: 0 1px 3px rgba(15,23,42,.12); }
.ix-page .ix-content .so-tag.wd { color: #1d4ed8; background: #eef4ff; border-color: #cfe0ff; }
.ix-page .ix-content .so-tag { display: inline-block; font-style: normal; font-size: 10.5px; font-weight: 700; color: #c2410c; background: #fdece4; border: 1px solid #f6c9b3; border-radius: 99px; padding: 1px 8px; margin-right: 7px; vertical-align: 1px; }
.ix-page .ix-content .so-cols { display: grid; grid-template-columns: minmax(300px, 400px) minmax(0, 1fr); gap: 14px; align-items: stretch; }
.ix-page .ix-content .so-cols > .ix-card { padding: 0 !important; overflow: hidden; margin: 0 !important; }
.ix-page .ix-content .so-hd { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; min-height: 54px; padding: 10px 18px; border-bottom: 1px solid #eef0f3; box-sizing: border-box; }
.ix-page .ix-content .so-hd > b { font-size: 15px; font-weight: 600; color: #111827; }
.ix-page .ix-content .so-body { display: flex; flex-direction: column; gap: 12px; padding: 16px 18px 18px; }
.ix-page .ix-content .so-body .ix-field { margin: 0 !important; }
.ix-page .ix-content .so-body textarea { min-height: 150px; resize: vertical; }
.ix-page .ix-content .so-body .so-note-fill textarea { min-height: 64px; }
.ix-page .ix-content .so-note { font-size: 12px; line-height: 1.5; color: #6b7280; }
.ix-page .ix-content .so-lblrow { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.ix-page .ix-content .so-lblrow > label:first-child { margin: 0 !important; }
.ix-page .ix-content .so-mand { margin: 0 !important; font-size: 12.5px; font-weight: 500; color: #4b5563; gap: 6px; }
.ix-page .ix-content .so-mand input { width: 15px; height: 15px; margin: 0; }
/* long notes: a thin grey scrollbar inside the box instead of the thick orange one */
.ix-page .ix-content .so-form :is(textarea, .so-body) { scrollbar-width: thin; scrollbar-color: #d6d9de transparent; }
.ix-page .ix-content .so-form :is(textarea, .so-body)::-webkit-scrollbar { width: 6px; }
.ix-page .ix-content .so-form :is(textarea, .so-body)::-webkit-scrollbar-track { background: transparent; }
.ix-page .ix-content .so-form :is(textarea, .so-body)::-webkit-scrollbar-thumb { background: #d6d9de; border-radius: 99px; }
.ix-page .ix-content .so-form :is(textarea, .so-body)::-webkit-scrollbar-button { display: none; height: 0; }
.ix-page .ix-content .so-form textarea { overflow-wrap: anywhere; }
.ix-page .ix-content .so-send { width: 100%; justify-content: center; }
.ix-page .ix-content .so-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.ix-page .ix-content .so-tabs button { height: 28px; padding: 0 11px !important; border-radius: 99px; border: 1px solid #e7e9ee; background: #fff; color: #4b5563;
  font: inherit; font-size: 11.5px; font-weight: 600; line-height: 1; cursor: pointer; }
.ix-page .ix-content .so-tabs button.on { background: #fdece4; border-color: #f6c9b3; color: #c2410c; }
.ix-page .ix-content .so-items { list-style: none; margin: 0; padding: 0 18px; max-height: 560px; overflow-y: auto; }
.ix-page .ix-content .so-items > li { border-bottom: 1px solid #f1f2f4; }
.ix-page .ix-content .so-items > li:last-child { border-bottom: 0; }
.ix-page .ix-content .so-row { width: 100%; display: grid; grid-template-columns: 46px minmax(0, 1fr) auto; gap: 14px; align-items: center; padding: 12px 0 !important;
  border: 0; background: none; text-align: left; font: inherit; color: inherit; cursor: pointer; border-radius: 0; }
.ix-page .ix-content .so-row:hover .so-tx > b { color: #c2410c; }
.ix-page .ix-content .so-dd { width: 46px; height: 46px; border-radius: 12px; background: #fff1ea; color: #c2410c; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.05; }
.ix-page .ix-content .so-dd b { font-size: 15px; } .ix-page .ix-content .so-dd small { font-size: 9px; font-weight: 700; text-transform: uppercase; }
.ix-page .ix-content .so-tx { min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.ix-page .ix-content .so-tx > b { font-size: 13px; font-weight: 600; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: color .15s; }
.ix-page .ix-content .so-steps { display: flex; align-items: center; gap: 4px; min-width: 0; }
.ix-page .ix-content .so-steps i { width: 8px; height: 8px; border-radius: 50%; background: #e5e7eb; flex-shrink: 0; }
.ix-page .ix-content .so-steps i.done { background: #22c55e; } .ix-page .ix-content .so-steps i.wait { background: #f59e0b; } .ix-page .ix-content .so-steps i.no { background: #ef4444; }
.ix-page .ix-content .so-steps em { font-style: normal; font-size: 11.5px; color: #6b7280; margin-left: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ix-page .ix-content .so-pill { display: inline-flex; align-items: center; height: 22px; padding: 0 9px; border-radius: 99px; font-size: 11px; font-weight: 600; white-space: nowrap; }
.ix-page .ix-content .so-pill.ok { background: #ecfdf3; color: #15803d; } .ix-page .ix-content .so-pill.wait { background: #fff7ed; color: #c2410c; } .ix-page .ix-content .so-pill.no { background: #fef2f2; color: #b91c1c; }
.ix-page .ix-content .so-more { margin: 0 0 14px 60px; padding: 12px 14px; border-radius: 12px; background: #fafafb; border: 1px solid #f1f2f4; display: grid; gap: 10px; }
.ix-page .ix-content .so-more span { display: block; font-size: 11px; color: #8b919b; margin-bottom: 2px; }
.ix-page .ix-content .so-more p { margin: 0; font-size: 13px; line-height: 1.5; color: #374151; white-space: pre-wrap; word-break: break-word; }
.ix-page .ix-content .so-act { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.ix-page .ix-content .so-act small { font-size: 11.5px; color: #8b919b; }
.ix-page .ix-content .so-empty { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 40px 16px; color: #9ca3af; text-align: center; }
.ix-page .ix-content .so-empty b { color: #374151; font-size: 13.5px; } .ix-page .ix-content .so-empty small { font-size: 12px; }
/* computers: the page fits the window (no page scroll); only the "Your online days" list scrolls */
@media (min-width: 901px) and (min-height: 520px) {
  .ix-page.lay2 .ix-main:has(.so-cols) { overflow: hidden !important; display: flex !important; flex-direction: column !important; }
  .ix-page.lay2 .ix-main:has(.so-cols) > .ix-content { flex: 1 1 auto !important; min-height: 0 !important; display: flex !important; flex-direction: column !important; align-self: stretch; width: 100%; box-sizing: border-box; }
  .ix-page.lay2 .ix-main:has(.so-cols) > .ix-content > * { flex: none; }
  .ix-page .ix-content > .so-cols { flex: 1 1 0 !important; min-height: 0; margin-bottom: 0 !important; }
  .ix-page .ix-content .so-cols > .ix-card { display: flex; flex-direction: column; min-height: 0; }
  .ix-page .ix-content .so-list .so-items { flex: 1 1 0; min-height: 0; max-height: none; overflow-y: auto; }
  .ix-page .ix-content .so-list > .ix-spin, .ix-page .ix-content .so-list > .so-empty { flex: 1; }
  .ix-page .ix-content .so-list > .so-empty { justify-content: center; margin: 12px; border: 1.5px dashed #e5e7eb; border-radius: 12px; }
  /* the form gives or takes space through the tasks box, so its button always shows */
  .ix-page .ix-content .so-form .so-body { flex: 1 1 0; min-height: 0; overflow-y: auto; }
  .ix-page .ix-content .so-form .so-body > * { flex-shrink: 0; }
  .ix-page .ix-content .so-form .so-body > .so-send { position: sticky; bottom: 0; box-shadow: 0 -8px 10px -4px #fff; }
  .ix-page .ix-content .so-form .so-body > .so-fill { flex-shrink: 1; }
  .ix-page .ix-content .so-form .so-body > .ix-field.so-fill { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }
  .ix-page .ix-content .so-form .so-body .so-fill textarea { flex: 1 1 0; min-height: 70px !important; height: auto !important; resize: none; }
  /* excused absence has more fields: tighter spacing, and the note box takes whatever room is left, so it fits without scrolling */
  .ix-page.lay2 .ix-main:has(.so-cols) { padding-bottom: 18px !important; }
  .ix-page .ix-content .so-form.so-ev .so-body { gap: 9px; padding: 12px 18px 14px; }
  .ix-page .ix-content .so-form.so-ev .so-body > .ix-field.so-note-fill { min-height: auto; }
  .ix-page .ix-content .so-form.so-ev .so-body .so-note-fill textarea { min-height: 64px !important; }
  .ix-page .ix-content .so-form.so-ev .so-note { line-height: 1.4; }
}
@media (max-width: 900px) {
  .ix-page .ix-content .so-cols { grid-template-columns: 1fr; }
  .ix-page .ix-content .so-items { max-height: none; padding: 0 14px; }
  .ix-page .ix-content .so-more { margin-left: 0; }
  .ix-page .ix-content .so-steps em { white-space: normal; }
}
`;

/* ───────────────────────── Internship modality ─────────────────────────
   The HTE decides whether the intern works on-site, virtually, or hybrid; the OJT coordinator records it.
   Interns don't request it. Any intern can log a single day worked from home as online attendance. */
function WorkModeCard({ user, tab = "online" }) {
  const [u, setU] = useState(null);
  const load = () => {
    fetch(`${API}/me?user_id=${user.id}`, { headers: { Accept: "application/json" } })
      .then((r) => r.json()).then((d) => setU(d?.user || d || null)).catch(() => {});
  };
  useEffect(() => {
    load();
    return liveRefresh(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!u) return null;
  const m = modalityOf(u);
  // one short line that fits the modality (nothing about "working from home" for interns who work remotely by design)
  const NOTE = {
    onsite: "Tap at the kiosk. Only log a day below when you couldn't (your supervisor sent you off-site, the office was closed, or your card was lost), and say why.",
    hybrid: "Tap at the kiosk on office days and log your remote days below.",
    virtual: "Log every workday below.",
    project: "Log the days you worked on your project below.",
  };
  return (
    <div className="wm-strip">
      <span className={`wm-tag m-${m}`}>{MODALITIES[m]}</span>
      <span className="wm-note">{tab === "event"
        ? "Missed a whole day or half a day for a valid reason (sickness, a school event)? File it below with a proof. Your supervisor confirms it, then your coordinator approves it."
        : `${NOTE[m]} Your supervisor confirms it, then your coordinator approves it.`}</span>
      <small className="wm-help" title="Your modality is set by your HTE. Ask your OJT coordinator if it is wrong.">Wrong modality? Ask your OJT coordinator.</small>
      <style>{`
        .ix-content .wm-strip { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 0 0 14px; font-size: 12.5px; color: #6b7280; }
        .wm-tag { font-size: 11.5px; font-weight: 700; padding: 3px 10px; border-radius: 99px; background: #fff1ea; color: #c2410c; white-space: nowrap; }
        .wm-tag.m-hybrid { background: #e0f2fe; color: #0369a1; } .wm-tag.m-virtual { background: #f3e8ff; color: #7e22ce; } .wm-tag.m-project { background: #dcfce7; color: #15803d; }
        .wm-note { flex: 1; min-width: 220px; line-height: 1.45; }
        .wm-help { color: #9ca3af; font-size: 11.5px; }
      `}</style>
    </div>
  );
}

/* ───────────────────────── Submit MOV ───────────────────────── */
/* a look at the submitted file inside the drawer: PDF and images show right there; Word files can only be opened */
function FilePreview({ x }) {
  // private: a short-lived link from the server. Nothing is shown in the frame until the link is here
  // (an empty frame would load this page inside itself)
  const { url, error, loading } = useFileLinkState(x.file_path);
  const ext = String(x.original_name || x.file_path || "").split(".").pop().toLowerCase();
  const isImg = ["jpg", "jpeg", "png", "gif", "webp"].includes(ext);
  const isPdf = ext === "pdf";
  return (
    <div className="mv-prev">
      <div className="mv-prev-h"><span>Preview</span>
        {url && <a className="ix-link" href={url} target="_blank" rel="noopener noreferrer">Open in a new tab</a>}</div>
      <div className="mv-prev-box">
        {loading ? <div className="mv-prev-none"><Spinner /><span>Loading the file…</span></div>
          : !url ? <div className="mv-prev-none"><Icon name="warn" size={26} /><span>{error || "This file can't be opened."}</span></div>
          : isPdf ? <iframe key={url} title={x.original_name || "Submitted file"} src={`${url}#toolbar=0&navpanes=0&view=FitH`} />
          : isImg ? <img src={url} alt={x.original_name || "Submitted file"} />
          : <div className="mv-prev-none"><Icon name="file" size={26} /><span>No preview for this file type.</span><a className="ix-link" href={url} target="_blank" rel="noopener noreferrer">Open {x.original_name || "the file"}</a></div>}
      </div>
    </div>
  );
}

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.doc,.docx";

function SubmitMov({ user, unlocked, totalHours, required }) {
  const [tab, setTab] = useState("pre");
  const [prevId, setPrevId] = useState(null);      // which submitted file the drawer previews
  const [formsOpen, setFormsOpen] = useState(false);   // "Forms to print" panel
  const [movs, setMovs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState(null);
  const [msg, setMsg] = useState(null);
  const [otherTitle, setOtherTitle] = useState("");
  const [otherFile, setOtherFile] = useState(null);
  const [deadlines, setDeadlines] = useState({});   // { "pre:moa": "2026-11-05", ... }
  const [reports, setReports] = useState([]);       // reports the coordinator asked for (weekly / monthly report)
  const [openKey, setOpenKey] = useState(null);     // the requirement opened on the right
  const [showApproved, setShowApproved] = useState(false);

  useEffect(() => {
    const loadDue = () => {
      fetch(`${API}/requirement-deadlines`, { headers: { Accept: "application/json" } })
        .then((r) => r.json())
        .then((d) => { if (Array.isArray(d)) setDeadlines(Object.fromEntries(d.map((x) => [`${x.phase}:${x.requirement}`, x.due_date]))); })
        .catch(() => {});
      fetch(`${API}/reports`, { headers: { Accept: "application/json" } })
        .then((r) => r.json())
        .then((d) => { if (Array.isArray(d)) setReports(d); })
        .catch(() => {});
    };
    fetchMovs(); loadDue();
    return liveRefresh(() => { fetchMovs(); loadDue(); });
    /* eslint-disable-next-line */
  }, []);

  const fetchMovs = async () => {
    try {
      const res = await fetch(`${API}/intern/my-movs?user_id=${user.id}`);
      const data = await res.json();
      setMovs(Array.isArray(data) ? data : []);
    } finally { setLoading(false); }
  };

  const phase = tab; // "pre" | "during" | "post"
  const list = REQUIREMENTS_BY_PHASE[phase] ? reqsFor(phase, user) : PRE_REQUIREMENTS;   // no System Output Presentation when the HTE doesn't require it
  const inPhase = (m) => (m.phase || "pre") === phase;
  // newest submission for each requirement (movs come newest first)
  const latest = (key) => movs.find((m) => m.requirement === key && inPhase(m));
  const others = movs.filter((m) => (m.requirement === "others" || !m.requirement) && inPhase(m));
  const doneCount = list.filter((r) => r.key === "weekly_report"
    ? reports.length > 0 && reports.every((x) => movs.find((m) => Number(m.report_id) === Number(x.id))?.status === "approved")
    : latest(r.key)?.status === "approved").length;
  // the internship starts (and During opens) only when every pre-internship requirement is approved
  const pre = preStatusOf(movs);
  const duringLocked = !loading && !pre.started;

  const upload = async ({ key, title, file, reportId, busy }) => {
    setBusyKey(busy || key); setMsg(null);
    try {
      const fd = new FormData();
      fd.append("user_id", user.id);
      fd.append("title", title);
      fd.append("requirement", key);
      fd.append("phase", phase);
      if (reportId) fd.append("report_id", reportId);
      fd.append("file", file);
      const res = await fetch(`${API}/intern/submit-mov`, { method: "POST", headers: { Accept: "application/json" }, body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Upload failed.");
      setMsg({ type: "success", text: data.message });
      await fetchMovs();
      return true;
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
      return false;
    } finally { setBusyKey(null); }
  };

  const removeMov = async (id) => {
    setMsg(null);
    try {
      const res = await fetch(MOV_DELETE_URL(id, user.id), { method: "DELETE", headers: { Accept: "application/json" } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Couldn't remove this file.");
      setMovs((list) => list.filter((x) => x.id !== id));
      setMsg({ type: "success", text: data.message || "Submission removed." });
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    }
  };

  const submitOther = async (e) => {
    e.preventDefault();
    if (!otherFile) { setMsg({ type: "error", text: "Please select a file." }); return; }
    if (await upload({ key: "others", title: otherTitle, file: otherFile })) { setOtherTitle(""); setOtherFile(null); }
  };

  const fileLink = (m) => (
    <a className="ix-link" href={fileHref(m.file_path)} onClick={(e) => openFile(m.file_path, e)} target="_blank" rel="noopener noreferrer">
      {m.original_name}
    </a>
  );

  // weekly / monthly report: one entry per report the coordinator asked for, newest upload first
  const reportUploads = (rid) => movs.filter((x) => Number(x.report_id) === Number(rid));
  const reportStatus = (rid) => reportUploads(rid)[0]?.status || "none";
  const reportsApproved = reports.filter((r) => reportStatus(r.id) === "approved").length;
  const oldReports = movs.filter((x) => x.requirement === "weekly_report" && !x.report_id);   // sent before reports were added

  // the full view of one requirement (opens from the right): upload, every file sent, remarks, remove
  const renderDetail = (r) => {
                if (r.key === "__others") return (
                  <>
                    <div className="ibx-head"><span className="ibx-ic big"><Icon name="folder" size={20} /></span>
                      <div><b>Other documents</b><small>Any other document you need to submit.</small></div></div>
                    <form onSubmit={submitOther} className="ibx-sec mv-upform">
                      <span>Send a document</span>
                      <input type="text" className="ix-input" required placeholder="Document title, e.g. "
                        value={otherTitle} onChange={(e) => setOtherTitle(e.target.value)} />
                      <label className={otherFile ? "ix-drop has-file" : "ix-drop"}>
                        <input type="file" accept={ACCEPT} onChange={(e) => setOtherFile(e.target.files[0] || null)} />
                        <span className="ix-drop-icon"><Icon name={otherFile ? "file" : "upload"} size={20} /></span>
                        <span className="ix-drop-text">{otherFile ? otherFile.name : "Drag file or photos here"}<small>{otherFile ? "Drop another file to change it" : "PDF, JPG, PNG, DOC or DOCX"}</small></span>
                        <span className="ix-b ghost sm mv-choose">{otherFile ? "Change file" : "Choose file"}</span>
                      </label>
                      <button type="submit" disabled={busyKey !== null} className="ix-b primary">{busyKey === "others" ? "Uploading..." : "Submit"}</button>
                    </form>
                    <div className="ibx-sec"><span>Sent ({others.length})</span>
                      {others.length === 0 ? <p className="ix-muted">No other documents yet.</p> : (
                        <ul className="mv-hist">{others.map((m) => (
                          <li key={m.id}>
                            <span className="mv-hist-main"><b>{m.title}</b>{fileLink(m)}<small>{[m.created_at && !isNaN(new Date(m.created_at)) ? new Date(m.created_at).toLocaleDateString("en-PH") : "", m.remarks ? `“${m.remarks}”` : ""].filter(Boolean).join(" · ")}</small></span>
                            <Badge label={movLabel(m.status)} type={statusType(m.status)} />
                            {m.status === "pending" && <RemoveBtn onConfirm={() => removeMov(m.id)} />}
                          </li>
                        ))}</ul>
                      )}
                    </div>
                  </>
                );
                if (r.key === "weekly_report") return (
                  <>
                    <div className="ibx-head"><span className="ibx-ic big"><Icon name="file" size={20} /></span>
                      <div><b>{r.label}</b><small>Your coordinator decides when a report is needed. Upload each one into its own report below.</small></div>
                      <span style={{ marginLeft: "auto" }}><Badge label={`${reportsApproved} of ${reports.length} approved`} type="none" /></span>
                    </div>
                    {reports.length === 0 ? (
                      <div className="ibx-sec"><p className="ix-muted">Your coordinator hasn't asked for a report yet. You'll get a notification when she does.</p></div>
                    ) : (
                      <ul className="rp-list">
                        {reports.map((rp) => {
                          const ups = reportUploads(rp.id);
                          const last = ups[0];
                          const st = last?.status || "none";
                          const due = dueStatus(rp.due_date, last);
                          const canUp = st === "none" || st === "rejected";
                          const bk = `report-${rp.id}`;
                          return (
                            <li key={rp.id} className={`rp-item ${st}`}>
                              <div className="rp-top">
                                <span className="rp-ic"><Icon name={st === "approved" ? "check" : st === "pending" ? "clock" : st === "rejected" ? "warn" : "file"} size={15} /></span>
                                <span className="rp-txt">
                                  <b>{rp.title}</b>
                                  <small>{rp.due_date ? `Due ${new Date(rp.due_date + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}` : "No due date"}</small>
                                </span>
                                {due && due.tone !== "none" && <span className={`req-due ${due.tone}`} style={{ margin: 0 }}>{due.label}</span>}
                                <Badge label={st === "none" ? "Not submitted" : movLabel(st)} type={st === "none" ? "none" : statusType(st)} />
                              </div>
                              {st === "rejected" && last.remarks && <div className="rp-note">Returned: “{last.remarks}”. Upload a corrected file.</div>}
                              {ups.length > 0 && (
                                <ul className="mv-hist rp-files">{ups.map((x) => (
                                  <li key={x.id}>
                                    <span className="mv-hist-main">{fileLink(x)}<small>{x.created_at && !isNaN(new Date(x.created_at)) ? `Sent ${new Date(x.created_at).toLocaleDateString("en-PH")}` : ""}</small></span>
                                    <Badge label={movLabel(x.status)} type={statusType(x.status)} />
                                    {x.status === "pending" && <RemoveBtn onConfirm={() => removeMov(x.id)} />}
                                  </li>
                                ))}</ul>
                              )}
                              {canUp && (
                                <label className={`mv-drop rp-drop ${busyKey === bk ? "busy" : ""}`}>
                                  <input type="file" accept={ACCEPT} disabled={busyKey !== null}
                                    onChange={(e) => { const f = e.target.files[0]; e.target.value = ""; if (f) upload({ key: "weekly_report", title: rp.title, file: f, reportId: rp.id, busy: bk }); }} />
                                  <span className="ix-drop-icon"><Icon name="upload" size={18} /></span>
                                  <span className="ix-drop-text">{busyKey === bk ? "Uploading..." : st === "rejected" ? "Upload a corrected file" : "Upload this report"}<small>PDF, JPG, PNG, DOC or DOCX</small></span>
                                </label>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {oldReports.length > 0 && (
                      <div className="ibx-sec"><span>Other reports ({oldReports.length})</span>
                        <ul className="mv-hist">{oldReports.map((x) => (
                          <li key={x.id}>
                            <span className="mv-hist-main">{fileLink(x)}<small>{x.created_at && !isNaN(new Date(x.created_at)) ? `Sent ${new Date(x.created_at).toLocaleDateString("en-PH")}` : ""}</small></span>
                            <Badge label={movLabel(x.status)} type={statusType(x.status)} />
                          </li>
                        ))}</ul>
                      </div>
                    )}
                  </>
                );
                const m = latest(r.key);
                const mine = movs.filter((x) => x.requirement === r.key && inPhase(x));
                const canUpload = r.repeat || !m || m.status === "rejected";
                const due = dueStatus(deadlines[`${phase}:${r.key}`], r.repeat ? null : m);
                const shownFile = (r.repeat ? mine.find((x) => x.id === prevId) : null) || mine[0] || null;
                return (
                  <>
                    <div className="ibx-head">
                      <span className={`ibx-ic big ${m?.status === "approved" ? "approved" : m?.status === "rejected" ? "rejected" : ""}`}>
                        <Icon name={m?.status === "approved" ? "check" : m?.status === "rejected" ? "x" : m?.status === "pending" ? "clock" : "upload"} size={20} /></span>
                      <div><b>{r.label}</b><small>{r.hint || ""}</small></div>
                      <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                        {due && <span className={`req-due ${due.tone}`} style={{ margin: 0 }}>{due.label}</span>}
                        <Badge label={m ? movLabel(m.status) : "Not submitted"} type={m ? statusType(m.status) : "none"} />
                      </span>
                    </div>
                    {m?.status === "rejected" && m.remarks && <div className="nfc-wait"><Icon name="warn" size={16} /><span>Rejected: “{m.remarks}”. Upload a corrected file.</span></div>}
                    {canUpload && (
                      <label className={`mv-drop ${busyKey === r.key ? "busy" : ""}`}>
                        <input type="file" accept={ACCEPT} disabled={busyKey !== null}
                          onChange={(e) => { const f = e.target.files[0]; e.target.value = ""; if (f) upload({ key: r.key, title: r.label, file: f }); }} />
                        <span className="ix-drop-icon"><Icon name="upload" size={22} /></span>
                        <span className="ix-drop-text">
                          {busyKey === r.key ? "Uploading..." : r.repeat && m ? "Upload a new one" : m ? "Upload a corrected file" : "Click to choose the file"}
                          <small>PDF, JPG, PNG, DOC or DOCX</small>
                        </span>
                      </label>
                    )}
                    <div className="ibx-sec"><span>{r.repeat ? `Submitted (${mine.length})` : "Your submission"}</span>
                      {mine.length === 0 ? <p className="ix-muted">Nothing submitted yet.</p> : (
                        <ul className="mv-hist">{(r.repeat ? mine : mine.slice(0, 1)).map((x) => (
                          <li key={x.id} className={r.repeat && shownFile?.id === x.id ? "mv-sel" : ""} onClick={r.repeat ? () => setPrevId(x.id) : undefined} style={r.repeat ? { cursor: "pointer" } : undefined}>
                            <span className="mv-hist-main">{fileLink(x)}<small>{[x.created_at && !isNaN(new Date(x.created_at)) ? `Sent ${new Date(x.created_at).toLocaleDateString("en-PH")}` : "", x.remarks ? `“${x.remarks}”` : ""].filter(Boolean).join(" · ")}</small></span>
                            <Badge label={movLabel(x.status)} type={statusType(x.status)} />
                            {x.status === "pending" && <RemoveBtn onConfirm={() => removeMov(x.id)} />}
                          </li>
                        ))}</ul>
                      )}
                    </div>
                    {shownFile && <FilePreview x={shownFile} />}
                  </>
                );
              };

  return (
    <>
      <PageHeader title="Submit MOV" sub="Upload your requirements for your coordinator to review." tabs={(
        <div className="grp-tabs" role="tablist" aria-label="Requirement phase">
          {[["pre", "Pre-Internship", false], ["during", "During Internship", duringLocked], ["post", "Post-Internship", !unlocked]].map(([k, l, locked]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "grp-tab active" : "grp-tab"}
              onClick={() => { setTab(k); setMsg(null); }}>
              <Icon name={locked ? "lock" : "folder"} size={14} /><span>{l}</span>
            </button>
          ))}
        </div>
      )}>
        <button type="button" className="ix-b ghost sm" onClick={() => setFormsOpen(true)}><Icon name="file" size={14} /> Forms and templates</button>
      </PageHeader>
      {formsOpen && <RequirementForms user={user} onClose={() => setFormsOpen(false)} />}
      <style>{`
        .mv-prev { flex: 1 1 0; min-height: 260px; display: flex; flex-direction: column; gap: 8px; }
        .mv-prev-h { display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #94a3b8; }
        .mv-prev-h a { text-transform: none; letter-spacing: 0; font-size: 12px; font-weight: 600; }
        .mv-prev-box { flex: 1 1 0; min-height: 240px; position: relative; border: 1px solid #e7e9ee; border-radius: 12px; background: #f6f7f9; overflow: hidden; display: flex; align-items: center; justify-content: center; }
        .mv-prev-box iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: #fff; }
        .mv-prev-box img { max-width: 100%; max-height: 100%; object-fit: contain; }
        .mv-prev-none { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 20px; text-align: center; font-size: 12.5px; color: #6b7280; }
        .mv-hist li.mv-sel { background: #fff3ee; border-radius: 8px; }
        .req-due { display: inline-block; margin-left: 8px; padding: 1px 8px; border-radius: 99px; font-size: 11px; font-weight: 600; vertical-align: 1px; background: #f1f5f9; color: #475569; }
        .req-due.pending { background: #fff4d6; color: #9a5b00; }
        .req-due.rejected { background: #fee2e2; color: #b91c1c; }
        .rp-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
        .rp-item { border: 1px solid #f1ece9; border-radius: 12px; padding: 12px 14px; background: var(--ix-surface, #fff); display: flex; flex-direction: column; gap: 10px; }
        .rp-item.rejected { border-color: #fecaca; }
        .rp-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .rp-ic { width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; background: #f3f4f6; color: #9ca3af; flex-shrink: 0; }
        .rp-item.approved .rp-ic { background: #ecfdf3; color: #16a34a; } .rp-item.pending .rp-ic { background: #fffbeb; color: #d97706; }
        .rp-item.rejected .rp-ic { background: #fef2f2; color: #dc2626; }
        .rp-txt { flex: 1; min-width: 140px; display: flex; flex-direction: column; }
        .rp-txt b { font-size: 13px; } .rp-txt small { font-size: 11.5px; color: #8a7a71; }
        .rp-note { font-size: 12px; color: #b91c1c; background: #fef2f2; border-radius: 8px; padding: 7px 10px; }
        .rp-files { margin: 0; }
        .rp-drop { padding: 10px 12px !important; min-height: 0 !important; }
        /* the requirements grouped by what to do next */
        .ix-page .mv-groups { display: flex; flex-direction: column; gap: 16px; }
        .ix-page .mv-grp > header { display: flex; align-items: center; gap: 8px; margin: 0 2px 8px; }
        .ix-page .mv-grp > header b { font-size: 14px; font-weight: 600; color: #111827; }
        .ix-page .mv-cnt { min-width: 22px; height: 20px; padding: 0 7px; border-radius: 99px; background: #f3f4f6; color: #4b5563; font-size: 11px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; }
        .ix-page .g-todo .mv-cnt { background: #fdece4; color: #c2410c; }
        .ix-page .mv-toggle { margin-left: auto; display: inline-flex; align-items: center; gap: 4px; padding: 0 !important; border: 0; background: none; font: inherit; font-size: 12px; color: #6b7280; cursor: pointer; height: auto !important; min-height: 0 !important; }
        .ix-page .mv-toggle:hover { color: #c2410c; }
        .ix-page .mv-list { list-style: none; margin: 0; padding: 0; border: 1px solid #e7e9ee; border-radius: 14px; background: var(--ix-surface, #fff); overflow: hidden; }
        .ix-page .mv-row { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 11px 16px; border-bottom: 1px solid #f1f2f4; }
        .ix-page .mv-row:last-child { border-bottom: 0; }
        .ix-page .mv-row.s-rejected { background: #fffafa; }
        .ix-page .mv-ic { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: #f3f4f6; color: #6b7280; }
        .ix-page .mv-ic.s-none, .ix-page .mv-ic.s-todo { background: #fff3ec; color: #e8582a; }
        .ix-page .mv-ic.s-rejected { background: #fef2f2; color: #dc2626; } .ix-page .mv-ic.s-pending { background: #fff7ed; color: #d97706; } .ix-page .mv-ic.s-approved { background: #ecfdf3; color: #16a34a; }
        .ix-page .mv-tx { min-width: 0; display: flex; flex-direction: column; gap: 1px; padding: 0 !important; border: 0; background: none; text-align: left; font: inherit; color: inherit; cursor: pointer; height: auto !important; min-height: 0 !important; }
        .ix-page .mv-tx b { font-size: 13.5px; font-weight: 600; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ix-page .mv-tx:hover b { color: #c2410c; }
        .ix-page .mv-tx small { font-size: 12px; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ix-page .mv-tx em { font-style: normal; font-size: 12px; color: #b91c1c; margin-top: 2px; }
        .ix-page .mv-rt { display: flex; align-items: center; gap: 12px; justify-content: flex-end; min-width: 0; }
        .ix-page .mv-file { display: inline-flex; gap: 4px; align-items: baseline; max-width: 260px; min-width: 0; font-size: 12px; color: #c2410c; text-decoration: none; }
        .ix-page .mv-file span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
        .ix-page .mv-file em { font-style: normal; color: #9ca3af; white-space: nowrap; }
        .ix-page a.mv-file:hover span { text-decoration: underline; }
        .ix-page .mv-pill { display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: 99px; font-size: 11.5px; font-weight: 600; white-space: nowrap; }
        .ix-page .mv-pill.approved { background: #ecfdf3; color: #15803d; } .ix-page .mv-pill.pending { background: #fff7ed; color: #c2410c; }
        .ix-page .mv-act { position: relative; height: 32px !important; min-height: 32px !important; padding: 0 14px !important; font-size: 12.5px !important; gap: 6px; cursor: pointer; white-space: nowrap; }
        .ix-page label.mv-act input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
        .ix-page .mv-act.busy { opacity: .6; pointer-events: none; }
        .ix-page .mv-chips { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 14px; border: 1px solid #e7e9ee; border-radius: 14px; background: var(--ix-surface, #fff); }
        .ix-page .mv-chip { display: inline-flex; align-items: center; gap: 5px; height: 28px !important; min-height: 0 !important; padding: 0 11px !important; border: 0; border-radius: 99px; background: #ecfdf3; color: #15803d;
          font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
        .ix-page .mv-chip:hover { background: #dcfce7; }
        .ix-page .mv-alldone { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-radius: 12px; background: #ecfdf3; color: #15803d; font-size: 13px; font-weight: 600; }
        .ix-page .mv-drawer .ibx-head { display: none; }
        .ix-page .mv-drawer { display: flex; flex-direction: column; gap: 12px; flex: 1 1 auto; min-height: 0; }
        .ix-page .ix-drawer-body:has(> .mv-drawer) { display: flex; flex-direction: column; }
        @media (max-width: 700px) {
          .ix-page .mv-row { grid-template-columns: 34px minmax(0, 1fr); }
          .ix-page .mv-rt { grid-column: 2; justify-content: flex-start; flex-wrap: wrap; }
          .ix-page .mv-tx small { white-space: normal; }
        }
      `}</style>

      {tab === "during" && duringLocked ? (
        <div className="ix-card">
          <div className="req-locked">
            <span className="req-lock-icon"><Icon name="lock" size={28} /></span>
            <h3>During-internship requirements are locked</h3>
            <p>
              They open when your internship starts, once <strong>all</strong> your pre-internship requirements are
              approved by your OJT coordinator. <strong>{pre.approved} of {pre.total}</strong> are approved so far.
            </p>
            <div className="ix-prog"><Bar pct={(pre.approved / pre.total) * 100} /></div>
          </div>
        </div>
      ) : tab === "post" && !unlocked ? (
        <div className="ix-card">
          <div className="req-locked">
            <span className="req-lock-icon"><Icon name="lock" size={28} /></span>
            <h3>Post-internship requirements are locked</h3>
            {modalityOf(user) === "project" ? (
              <p>
                You are project-based, so they open once your project is done: your HTE supervisor marks it
                as complete and the OJT coordinator confirms it. This can be before or after your{" "}
                <strong>{required}h</strong> (you have <strong>{totalHours}h</strong> so far).
              </p>
            ) : (
            <p>
              They open once you complete your required OJT hours. You have rendered{" "}
              <strong>{totalHours}h</strong> of <strong>{required}h</strong>
              {" "}— <strong>{Math.max(Math.round((required - totalHours) * 10) / 10, 0)}h</strong> to go.
            </p>
            )}
            <div className="ix-prog"><Bar pct={Math.max(Math.min((totalHours / required) * 100, 100), 0)} /></div>
          </div>
        </div>
      ) : (
        <>
          <Msg msg={msg} />
          {(() => {
            // one state per requirement: approved / waiting / needs fix / to upload
            const stateOf = (r) => {
              if (r.key === "weekly_report") {
                if (!reports.length) return "na";   // the coordinator hasn't asked for a report yet: nothing to do, not counted
                const sts = reports.map((x) => reportStatus(x.id));
                if (sts.length && sts.every((x) => x === "approved")) return "approved";
                if (sts.includes("rejected")) return "rejected";
                if (sts.length && !sts.includes("none")) return "pending";
                return "none";
              }
              return latest(r.key)?.status || "none";
            };
            const c = { approved: 0, pending: 0, rejected: 0, none: 0 };
            const counted = list.filter((r) => stateOf(r) !== "na");
            counted.forEach((r) => { const k = stateOf(r); c[k in c ? k : "none"]++; });
            const n = counted.length || 1;
            const othersWaiting = others.filter((m) => m.status === "pending").length;   // sent under "Other documents", still waiting
            const segs = [["approved", "approved"], ["pending", "waiting"], ["rejected", "returned"], ["none", "to upload"]];
            return (
              <div className="mv-prog2">
                <b>{c.approved} of {counted.length} approved</b>
                <span className="mv-bar2" role="img" aria-label={segs.map(([k, l]) => `${c[k]} ${l}`).join(", ")}>
                  {segs.slice(0, 3).map(([k]) => c[k] > 0 && <i key={k} className={k} style={{ width: (c[k] / n) * 100 + "%" }} />)}
                </span>
                <span className="mv-legend">
                  {segs.map(([k, l]) => <span key={k}><i className={k} /><b>{k === "pending" ? c[k] + othersWaiting : c[k]}</b> {l}</span>)}
                </span>
              </div>
            );
          })()}
          {loading ? <Spinner /> : (() => {
            // sort every requirement into what the intern has to do next
            const items = list.map((r, i) => {
              if (r.key === "weekly_report") {
                const needs = reports.some((x) => ["none", "rejected"].includes(reportStatus(x.id)));
                const allDone = reports.length > 0 && reportsApproved === reports.length;
                // nothing asked yet: the next step is the coordinator's, so it sits under "Waiting for your coordinator"
                return { r, i, report: true, group: allDone ? "approved" : needs ? "todo" : "waiting" };
              }
              const m = latest(r.key);
              const st = m?.status || "none";
              return { r, i, m, st, group: st === "approved" && !r.repeat ? "approved" : st === "pending" ? "waiting" : st === "approved" ? "approved" : "todo" };
            });
            const groups = [
              ["todo", "Needs your action", items.filter((x) => x.group === "todo")],
              ["waiting", "Waiting for your coordinator", items.filter((x) => x.group === "waiting")],
              ["approved", "Approved", items.filter((x) => x.group === "approved")],
            ];
            const row = ({ r, m, st, report }) => {
              if (report) {
                const next = reports.find((x) => !["pending", "approved"].includes(reportStatus(x.id)));
                const nd = next ? dueStatus(next.due_date, null) : null;
                return (
                  <li key={r.key} className="mv-row">
                    <span className="mv-ic s-todo"><Icon name="file" size={15} /></span>
                    <button type="button" className="mv-tx" onClick={() => setOpenKey(r.key)}>
                      <b>{r.label}</b>
                      <small>{reports.length ? `${reportsApproved} of ${reports.length} reports approved` : "Your coordinator hasn't asked for a report yet."}</small>
                    </button>
                    <span className="mv-rt">
                      {nd && nd.tone !== "none" && <span className={`req-due ${nd.tone}`} style={{ margin: 0 }}>{nd.label}</span>}
                      <button type="button" className="ix-b primary mv-act" onClick={() => setOpenKey(r.key)}>Open reports</button>
                    </span>
                  </li>
                );
              }
              const due = dueStatus(deadlines[`${phase}:${r.key}`], r.repeat ? null : m);
              const canUpload = r.repeat || !m || m.status === "rejected";
              const busy = busyKey === r.key;
              const pick = (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) upload({ key: r.key, title: r.label, file: f }); };
              const ic = st === "rejected" ? "warn" : st === "pending" ? "clock" : st === "approved" ? "check" : "upload";
              return (
                <li key={r.key} className={`mv-row s-${st}`}>
                  <span className={`mv-ic s-${st}`}><Icon name={ic} size={15} /></span>
                  <button type="button" className="mv-tx" onClick={() => setOpenKey(r.key)} title="See everything you sent">
                    <b>{r.label}</b>
                    <small>{r.hint || ""}</small>
                    {st === "rejected" && m.remarks && <em>“{m.remarks}”</em>}
                  </button>
                  <span className="mv-rt">
                    {m && (
                      <a className="mv-file" href={fileHref(m.file_path)} onClick={(e) => openFile(m.file_path, e)} target="_blank" rel="noopener noreferrer" title={m.original_name}>
                        <span>{m.original_name}</span>
                        {m.created_at && !isNaN(new Date(m.created_at)) && <em>· sent {new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</em>}
                      </a>
                    )}
                    {due && due.tone !== "none" && st === "none" && <span className={`req-due ${due.tone}`} style={{ margin: 0 }}>{due.label}</span>}
                    {canUpload ? (
                      <label className={`ix-b primary mv-act ${busy ? "busy" : ""}`}>
                        <input type="file" accept={ACCEPT} disabled={busyKey !== null} onChange={pick} />
                        <Icon name="upload" size={14} />{busy ? "Uploading..." : st === "rejected" ? "Re-upload" : r.repeat && m ? "Upload new" : "Upload"}
                      </label>
                    ) : (
                      <span className={`mv-pill ${st}`}>{st === "pending" ? "Waiting" : "Approved"}</span>
                    )}
                  </span>
                </li>
              );
            };
            return (
              <div className="mv-groups">
                {groups.map(([k, title, its]) => its.length === 0 ? null : (
                  <section key={k} className={`mv-grp g-${k}`}>
                    <header>
                      <b>{title}</b><span className="mv-cnt">{its.length}</span>
                      {k === "approved" && <button type="button" className="mv-toggle" onClick={() => setShowApproved((v) => !v)}>{showApproved ? "Hide" : "Show all"} <span aria-hidden="true">{showApproved ? "▴" : "▾"}</span></button>}
                    </header>
                    {k === "approved" && !showApproved ? (
                      <div className="mv-chips">
                        {its.map(({ r }) => (
                          <button key={r.key} type="button" className="mv-chip" onClick={() => setOpenKey(r.key)}><Icon name="check" size={12} />{r.label}</button>
                        ))}
                      </div>
                    ) : (
                      <ul className="mv-list">{its.map(row)}</ul>
                    )}
                  </section>
                ))}
                {groups[0][2].length === 0 && groups[1][2].length === 0 && (
                  <div className="mv-alldone"><Icon name="check" size={16} /> Everything here is approved. Nice work!</div>
                )}
                <section className="mv-grp g-other">
                  <header><b>Other documents</b><span className="mv-cnt">{others.length}</span></header>
                  <ul className="mv-list">
                    <li className="mv-row">
                      <span className="mv-ic"><Icon name="folder" size={15} /></span>
                      <button type="button" className="mv-tx" onClick={() => setOpenKey("__others")}>
                        <b>Other documents</b><small>{others.length ? `Last sent: ${others[0].title}` : "Any other document your coordinator asks for."}</small>
                      </button>
                      <span className="mv-rt">
                        {others.some((m) => m.status === "pending") && <Badge label={`${others.filter((m) => m.status === "pending").length} waiting`} type="pending" />}
                        <button type="button" className="ix-b ghost mv-act" onClick={() => setOpenKey("__others")}>Upload</button>
                      </span>
                    </li>
                  </ul>
                </section>
              </div>
            );
          })()}
          {openKey && (() => {
            const r = openKey === "__others" ? { key: "__others", label: "Other documents", hint: "Any other document you need to submit." } : list.find((x) => x.key === openKey);
            if (!r) return null;
            return (
              <Drawer inPage title={r.label} kicker={r.key === "__others" ? "Submit MOV" : phase === "pre" ? "Pre-internship requirement" : phase === "during" ? "During the internship" : "Post-internship requirement"}
                icon={r.key === "__others" ? "folder" : "file"} sub={r.hint || null} onClose={() => setOpenKey(null)}>
                <div className="mv-drawer">{renderDetail(r)}</div>
              </Drawer>
            );
          })()}
        </>
      )}
    </>
  );
}

/* ───────────────────────── My DTR (CS Form 48 layout) ───────────────────────── */
// Same CSS is used for the on-screen preview and the printed copy.
export const CS48_CSS = `
.cs48 { font-family: 'Times New Roman', Times, serif; color: #000; font-size: 11px; line-height: 1.25; background: var(--ix-surface, #fff); min-width: 0; }
.cs48 .cs-top { font-size: 12px; }
.cs48 h2 { margin: 4px 0 6px; text-align: center; font-size: 17px; font-weight: 700; letter-spacing: .3px; color: #000; }
.cs48 .cs-name, .cs48 .cs-office { text-align: center; font-size: 12.5px; text-transform: uppercase; border-bottom: 1px solid #000; padding: 1px 0; margin: 0 6px; min-height: 16px; }
.cs48 .cs-cap { text-align: center; font-size: 8.5px; margin: 1px 0 4px; }
.cs48 .cs-row { display: flex; justify-content: space-between; gap: 6px; margin: 1px 0; font-size: 11px; }
.cs48 .cs-row .ln { flex: 1; border-bottom: 1px solid #000; text-align: center; min-width: 40px; }
.cs48 table { width: 100%; border-collapse: collapse; margin-top: 6px; table-layout: fixed; }
.cs48 th, .cs48 td { border: 1px solid #000 !important; padding: 1px 2px !important; text-align: center; font-size: 10px !important; height: 15px; color: #000 !important; background: transparent !important;
  text-transform: none !important; letter-spacing: 0 !important; font-weight: 400 !important; white-space: nowrap; overflow: hidden; font-family: inherit !important; }
.cs48 thead th { font-weight: 700 !important; border-bottom: 1px solid #000 !important; }
.cs48 thead tr:first-child th { border-top: 2px solid #000 !important; }
.cs48 th.dh, .cs48 td.d { width: 8%; font-weight: 400 !important; }
.cs48 td.d { text-align: center; }
.cs48 td.wk { letter-spacing: .5px !important; }
.cs48 tfoot td { height: 17px; }
.cs48 tfoot td.l { text-align: left; padding-left: 4px !important; }
.cs48 tbody tr:hover, .cs48 tr:hover { background: transparent !important; }
.cs48 table, .cs48 tr { border: 0; }
.cs48 .cs-tot { text-align: right; margin: 5px 2px 0; font-size: 11px; }
.cs48 .cs-cert { margin: 10px 0 18px; font-size: 11px; }
.cs48 .cs-sig { border-top: 1px solid #000; text-align: center; font-size: 8.5px; margin: 0 4px; padding-top: 1px; }
.cs48 .cs-ver { margin: 10px 0 24px; font-size: 11px; }
.cs48 .cs-sup { text-align: center; font-weight: 700; font-size: 11px; margin-top: 4px; }
.cs48 .cs-ver.has { margin-bottom: 0; }
.cs48 .cs-vby { position: relative; height: 34px; display: flex; align-items: flex-end; justify-content: center; font-weight: 700; font-size: 10.5px; padding-bottom: 1px; }
.cs48 .cs-vby img { position: absolute; left: 50%; bottom: 6px; transform: translateX(-50%); max-height: 38px; max-width: 130px; object-fit: contain; mix-blend-mode: multiply; }
.cs48 .cs-vby span { position: relative; }
.cs48 .cs-vnote { text-align: center; font-size: 8.5px; font-style: italic; color: #444; margin-top: 2px; }
.cs48 .cs-supcap { text-align: center; font-style: italic; font-size: 10px; }

/* on-screen only: two copies side by side */
/* the sheets sit on a light gray panel, like the Quarterly Report's page view */
.cs48-pair { display: flex; gap: 16px; align-items: flex-start; margin-top: 10px; padding: 16px; background: #eef0f3; border: 1px solid #e5e7eb; border-radius: 14px; }
.cs48-pair > .cs48-card { flex: 1; min-width: 0; padding: 16px 18px; background: var(--ix-surface, #fff); border-radius: 8px; box-shadow: 0 2px 14px rgba(0,0,0,.12); }
@media (max-width: 1100px) {
  .cs48-pair { flex-direction: column; }
  .cs48-pair > .cs48-card { width: 100%; max-width: 560px; margin: 0 auto; }
}
`;

// "8:05 am" in Manila time
export const t12 = (iso) =>
  iso ? new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Manila" }).toLowerCase() : "";

// Official hours printed on the form, per DTR type
export const OFFICIAL_HOURS = { four: "8:00–12:00, 1:00–5:00", two: "8:00 AM–5:00 PM (lunch 12–1)" };

// rows: { d, amIn, amOut, pmIn, pmOut } or { d, weekend: "SATURDAY" }
// verifier = { name, position, signature (image), date }: set only when the HTE supervisor certified this period in
// the system (and the hours did not change since). Then the "VERIFIED" line carries their signature and name;
// otherwise it stays blank, to be signed by hand.
export function dtrFormHtml({ name, office, periodLabel, officialHours = "", rows, totalHrs, undertimeMin = 0, tardyMin = 0, verifier = null }) {
  const hm = (m) => (m > 0 ? [Math.floor(m / 60), m % 60] : ["", ""]);
  const blank = '<tr><td class="d"></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>';
  const body = rows.map((r) => r.weekend
    ? `<tr><td class="d">${r.d}</td><td colspan="4" class="wk">${r.weekend}</td><td>-</td><td>-</td></tr>`
    : `<tr><td class="d">${r.d}</td><td>${r.amIn || ""}</td><td>${r.amOut || ""}</td><td>${r.pmIn || ""}</td><td>${r.pmOut || ""}</td><td>${hm(r.ut || 0)[0]}</td><td>${hm(r.ut || 0)[1]}</td></tr>`
  ).join("") + blank.repeat(Math.max(31 - rows.length, 0));

  return `<div class="cs48">
    <div class="cs-top">CS Form 48</div>
    <h2>DAILY TIME RECORD</h2>
    <div class="cs-name">${esc(name || "")}</div>
    <div class="cs-cap">Name in Print</div>
    <div class="cs-office">${esc(office || "")}</div>
    <div class="cs-cap">OFFICE</div>
    <div class="cs-row"><span>For the period of</span><span class="ln">${esc(periodLabel)}</span></div>
    <div class="cs-row"><span>Official Hours of arrival</span><span class="ln">${esc(officialHours)}</span><span>(Regular days)</span><span class="ln"></span></div>
    <div class="cs-row"><span>and departure days</span><span class="ln"></span><span>(Saturdays)</span><span class="ln"></span></div>
    <table>
      <thead>
        <tr><th rowspan="2" class="dh">Day</th><th colspan="2">AM</th><th colspan="2">PM</th><th colspan="2">Undertime / Tardiness</th></tr>
        <tr><th>Arrival</th><th>Departure</th><th>Arrival</th><th>Departure</th><th>Hours</th><th>Minutes</th></tr>
      </thead>
      <tbody>${body}</tbody>
      <tfoot>
        <tr><td rowspan="2">Total</td><td colspan="4" class="l">Undertime</td><td>${hm(undertimeMin)[0] || "-"}</td><td>${hm(undertimeMin)[1] || "-"}</td></tr>
        <tr><td colspan="4" class="l">Tardiness</td><td>${hm(tardyMin)[0] || "-"}</td><td>${hm(tardyMin)[1] || "-"}</td></tr>
      </tfoot>
    </table>
    <div class="cs-tot">Total hours rendered: <b>${totalHrs} hrs</b></div>
    <div class="cs-cert">I certify on my honor that the above is true and correct record of the hours of work performed, record of which was made daily at the time of arrival and departure from the office.</div>
    <div class="cs-sig">(Signature of Intern)</div>
    ${verifier ? `<div class="cs-ver has">VERIFIED as to the prescribed office hours:</div>
    <div class="cs-vby">${verifier.signature ? `<img src="${verifier.signature}" alt="">` : ""}<span>${esc(String(verifier.name || "").toUpperCase())}</span></div>
    <div class="cs-sig">${esc(verifier.position || "HTE Supervisor")}</div>
    <div class="cs-vnote">Certified in the system on ${esc(verifier.date || "")}</div>`
    : `<div class="cs-ver">VERIFIED as to the prescribed office hours:</div>
    <div class="cs-sig">(Supervisor / OJT Coordinator)</div>`}
  </div>`;
}

/* The certification of one intern's DTR period, for the printed DTR: the supervisor's name, position, signature
   and date, or null when the period is not certified (or the hours changed after it was). */
export function useDtrCerts(internId) {
  const [certs, setCerts] = useState([]);
  useEffect(() => {
    if (!internId) { setCerts([]); return undefined; }
    const load = () => fetch(`${API}/dtr-certifications?user_id=${internId}`, { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : [])).then((d) => { if (Array.isArray(d)) setCerts(d); }).catch(() => {});
    load();
    return liveRefresh(load);
  }, [internId]);
  return certs;
}
export function verifierOf(certs, from, to, hours) {
  if (!from || !to) return null;
  const c = (certs || []).find((x) => String(x.period_from).slice(0, 10) === from && String(x.period_to).slice(0, 10) === to);
  if (!c) return null;
  if (hours != null && Math.abs(Number(c.hours) - Number(hours)) > 0.06) return null;   // out of date: sign by hand
  return {
    name: c.certified_by_name || "", position: c.certified_by_position || "", signature: c.certified_by_signature || null,
    date: new Date(String(c.certified_at).replace(" ", "T")).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
  };
}

/* Builds the DTR rows for one intern and one period.
   mode "two":  AM arrival + PM departure only (lunch break not counted in the hours)
   mode "four": AM arrival / AM departure / PM arrival / PM departure
   The times shown are the real tap times. Each day's Undertime/Tardiness column is the
   minutes late (no grace period) plus the minutes left early, measured against SCHEDULE. */
/* ───────── Start notice: the internship (and taps) start only when ALL pre-internship requirements are approved ─────────
   A small card that floats at the bottom-right of the screen. The X hides it until the next sign-in,
   or until the MOA status changes (e.g. pending -> rejected), whichever comes first.
   The "closed" mark is tied to this sign-in's token: logging out keeps the browser tab's storage,
   but a new sign-in gets a new token, so the notice comes back.                                   */
const MOA_HIDE_KEY = "mytrack_moa_notice_hidden";
const MOA_TOAST_CSS = `
        .moa-toast {
          position: fixed; right: 24px; bottom: 24px; z-index: 60; width: min(360px, calc(100vw - 32px));
          display: flex; gap: 12px; align-items: flex-start; padding: 14px 14px 14px 16px;
          background: var(--ix-surface, #fff); border-radius: 14px; border-left: 4px solid #f59e0b;
          box-shadow: 0 18px 40px rgba(15,23,42,0.18), 0 2px 6px rgba(15,23,42,0.06);
          animation: moa-in .35s cubic-bezier(.2,.8,.2,1);
        }
        .moa-toast.rejected { border-left-color: #dc2626; }
        .moa-toast-ic { flex-shrink: 0; width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center;
          background: #fef3c7; color: #b45309; }
        .moa-toast.rejected .moa-toast-ic { background: #fee2e2; color: #b91c1c; }
        .moa-toast-body { flex: 1; min-width: 0; }
        .moa-toast-body strong { display: block; font-size: 14px; color: #111827; margin-bottom: 3px; }
        .moa-toast-body p { margin: 0; font-size: 12.5px; line-height: 1.45; color: #4b5563; }
        .moa-toast-link { margin-top: 8px; padding: 0; border: 0; background: none; cursor: pointer; font: inherit;
          font-size: 12.5px; font-weight: 600; color: #ea580c; display: inline-flex; align-items: center; gap: 4px; }
        .moa-toast-link:hover { text-decoration: underline; }
        .moa-toast-x { flex-shrink: 0; width: 28px; height: 28px; margin: -4px -4px 0 0; border: 0; border-radius: 8px; background: none;
          color: #9ca3af; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .moa-toast-x:hover { background: #f3f4f6; color: #111827; }
        .moa-toast-x:focus-visible, .moa-toast-link:focus-visible { outline: 2px solid #f97316; outline-offset: 2px; }
        @keyframes moa-in { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
        @media (max-width: 600px) { .moa-toast { right: 16px; bottom: 16px; } }
        @media (prefers-reduced-motion: reduce) { .moa-toast { animation: none; } }
        .moa-due { margin: 2px 0 0; padding-left: 16px; font-size: 12.5px; color: #4b5563; line-height: 1.5; }
`;

/* Pre-internship status from the intern's MOVs (newest first).
   The internship starts only when EVERY pre-internship requirement is approved. */
export function preStatusOf(movs) {
  const inPre = (m) => (m.phase || "pre") === "pre";
  const latest = (key) => movs.find((m) => m.requirement === key && inPre(m));
  const states = PRE_REQUIREMENTS.map((r) => latest(r.key)?.status || "none");
  const approved = states.filter((x) => x === "approved").length;
  const total = PRE_REQUIREMENTS.length;
  const status = approved === total ? "approved"
    : states.includes("rejected") ? "rejected"
    : states.includes("none") ? "none" : "pending";
  return { status, approved, total, started: approved === total };
}

function MoaNotice({ user, go }) {
  const [moa, setMoa] = useState(null);   // pre-internship status: null = loading | "none" | "pending" | "rejected" | "approved"
  const [pre, setPre] = useState({ approved: 0, total: PRE_REQUIREMENTS.length });
  const [dueItems, setDueItems] = useState([]);   // requirements overdue or due within 3 days, not submitted
  const [hidden, setHidden] = useState(() => {
    try { return sessionStorage.getItem(MOA_HIDE_KEY) || ""; } catch { return ""; }
  });

  useEffect(() => {
    const load = () =>
      fetch(`${API}/intern/my-movs?user_id=${user.id}`, { headers: { Accept: "application/json" } })
        .then((r) => r.json())
        .then((list) => {
          if (!Array.isArray(list)) return;
          const ps = preStatusOf(list);
          setPre(ps);
          setMoa(ps.status);
          // due dates set by the coordinator (pre- and during-internship requirements)
          fetch(`${API}/requirement-deadlines`, { headers: { Accept: "application/json" } })
            .then((r) => r.json())
            .then((dl) => {
              if (!Array.isArray(dl)) return;
              const items = [];
              dl.filter((d) => d.phase !== "post").forEach((d) => {
                const req = (REQUIREMENTS_BY_PHASE[d.phase] || []).find((r) => r.key === d.requirement);
                if (!req || req.repeat) return;
                const sub = list.find((x) => x.requirement === d.requirement && (x.phase || "pre") === d.phase);
                const st = dueStatus(d.due_date, sub);
                if (st && st.tone !== "none") items.push({ key: d.requirement, label: req.label, status: st.label, overdue: st.tone === "rejected" });
              });
              setDueItems(items);
            })
            .catch(() => {});
        })
        .catch(() => {});
    load();
    return liveRefresh(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "<this sign-in's token>|<MOA status>" — a new sign-in or a new status shows the notice again
  const mark = `${user.token || user.id}|${moa}`;
  const close = () => {
    setHidden(mark);
    try { sessionStorage.setItem(MOA_HIDE_KEY, mark); } catch { /* ignore */ }
  };

  // the pre-internship requirements come first; once it is approved, remind about requirements that are due
  const dueMark = `${user.token || user.id}|due|${dueItems.map((d) => d.key + d.status).join(",")}`;
  if (moa === "approved" && dueItems.length && hidden !== dueMark) {
    const overdue = dueItems.some((d) => d.overdue);
    const closeDue = () => {
      setHidden(dueMark);
      try { sessionStorage.setItem(MOA_HIDE_KEY, dueMark); } catch { /* ignore */ }
    };
    return (
      <div className={`moa-toast ${overdue ? "rejected" : "pending"}`} role="status" aria-live="polite">
        <span className="moa-toast-ic"><Icon name="calendar" size={18} /></span>
        <div className="moa-toast-body">
          <strong>{overdue ? "Requirements overdue" : "Requirements due soon"}</strong>
          <ul className="moa-due">
            {dueItems.slice(0, 3).map((d) => <li key={d.key}>{d.label} — <b>{d.status}</b></li>)}
            {dueItems.length > 3 && <li>+{dueItems.length - 3} more</li>}
          </ul>
          <button type="button" className="moa-toast-link" onClick={() => go("/intern/movs")}>
            <Icon name="upload" size={13} /> Go to Submit MOV
          </button>
        </div>
        <button type="button" className="moa-toast-x" onClick={closeDue} aria-label="Close notice">
          <Icon name="x" size={16} />
        </button>
        <style>{MOA_TOAST_CSS}</style>
      </div>
    );
  }

  if (!moa || moa === "approved" || hidden === mark) return null;

  const count = `${pre.approved} of ${pre.total} approved.`;
  const TEXT = {
    none: ["Complete your pre-internship requirements", `${count} Your internship starts, and the kiosk counts your taps, once all of them are approved by your OJT coordinator.`],
    pending: ["Pre-requirements waiting for approval", `${count} Your OJT coordinator is reviewing the rest. Your internship starts once all are approved.`],
    rejected: ["A pre-requirement was returned", `${count} Upload a corrected copy of the returned document. Your internship starts once all are approved.`],
  };
  const [title, body] = TEXT[moa];

  return (
    <div className={`moa-toast ${moa}`} role="status" aria-live="polite">
      <span className="moa-toast-ic"><Icon name="warn" size={18} /></span>
      <div className="moa-toast-body">
        <strong>{title}</strong>
        <p>{body}</p>
        {moa !== "pending" && (
          <button type="button" className="moa-toast-link" onClick={() => { go("/intern/movs"); }}>
            <Icon name="upload" size={13} /> Go to Submit MOV
          </button>
        )}
      </div>
      <button type="button" className="moa-toast-x" onClick={close} aria-label="Close notice">
        <Icon name="x" size={16} />
      </button>
      <style>{MOA_TOAST_CSS}</style>
    </div>
  );
}

/* ───────── DTR certification by the HTE supervisor (shown on every DTR page) ─────────
   intern = the intern; from/to = "YYYY-MM-DD"; canCertify = the signed-in user is a supervisor */
// "Jul 1 – 31, 2026" / "Jun 16 – Jul 15, 2026"
const fmtRange = (from, to) => {
  const a = new Date(`${from}T00:00:00`), b = new Date(`${to}T00:00:00`);
  const mo = (d) => d.toLocaleDateString("en-US", { month: "short" });
  return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
    ? `${mo(a)} ${a.getDate()} – ${b.getDate()}, ${b.getFullYear()}`
    : `${mo(a)} ${a.getDate()} – ${mo(b)} ${b.getDate()}, ${b.getFullYear()}`;
};

export function CertifyBar({ intern, from, to, canCertify = false, hasDays = true, currentHours = null }) {
  const me = JSON.parse(sessionStorage.getItem("user") || "{}");
  const [certs, setCerts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [ask, setAsk] = useState(null);   // "certify" | "undo": the confirm window

  const load = () =>
    fetch(`${API}/dtr-certifications?user_id=${intern.id}`, { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setCerts(d); })
      .catch(() => {});
  useEffect(() => {
    setMsg(null);
    load();
    return liveRefresh(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intern.id]);

  const cert = certs.find((c) => String(c.period_from).slice(0, 10) === from && String(c.period_to).slice(0, 10) === to);
  const ended = to < todayManila();
  // the hours can still change after certifying (e.g. a late time correction): then the certification is out of date
  const changed = !!cert && currentHours !== null && Math.abs(Number(cert.hours) - Number(currentHours)) > 0.06;

  const call = async (method, url, body) => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`${API}${url}`, {
        method, headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Something went wrong.");
      setAsk(null);
      load();   // the bar itself turns green (or back); no second message needed
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    } finally {
      setBusy(false);
    }
  };

  const when = (v) => new Date(v).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="dtr-cert">
      {cert ? (
        <div className="dtr-cert-row ok">
          <Icon name="check" size={18} />
          <span>
            <strong>Certified</strong> by {cert.certified_by_name || "the supervisor"} on {when(cert.certified_at)}
            {" · "}{Number(cert.hours).toFixed(1)}h{cert.remarks ? ` · ${cert.remarks}` : ""}
          </span>
          {changed && (
            <span className="dtr-cert-changed">
              <Icon name="warn" size={14} /> Hours changed after certification (now {Number(currentHours).toFixed(1)}h)
              {canCertify ? " — undo, then certify again." : " — the supervisor needs to certify it again."}
            </span>
          )}
          {canCertify && Number(cert.certified_by) === Number(me.id) && (
            <button type="button" className="ix-b ghost sm" disabled={busy}
              onClick={() => { setMsg(null); setAsk("undo"); }}>
              Undo
            </button>
          )}
        </div>
      ) : (
        !hasDays ? (
        <div className="dtr-cert-row none">
          <Icon name="info" size={18} />
          <span>No days present in this period, so there is nothing to certify yet.</span>
        </div>
        ) : (
        <div className="dtr-cert-row">
          <Icon name="info" size={18} />
          <span>
            {canCertify
              ? (ended ? "Check the DTR below, then certify that it is true and correct." : "You can certify this period once it has ended.")
              : "Not yet certified by the HTE supervisor."}
          </span>
          {canCertify && (
            <button type="button" className="ix-b primary sm" disabled={busy || !ended || !hasDays}
              onClick={() => { setMsg(null); setAsk("certify"); }}>
              <Icon name="check" size={14} /> Certify DTR
            </button>
          )}
        </div>
        )
      )}
      {msg && !ask && <Msg msg={msg} />}
      {ask && (
        <Modal title={ask === "certify" ? "Certify this DTR?" : "Undo the certification?"}
          sub={`${intern.name} · ${fmtRange(from, to)}`} onClose={() => !busy && setAsk(null)}>
          <div className="dtr-ask">
            {ask === "certify" ? (<>
              <div className="dtr-ask-sum">
                <span><b>{fmtRange(from, to)}</b><small>Period</small></span>
                {currentHours !== null && <span><b>{Number(currentHours).toFixed(1)}h</b><small>Total hours</small></span>}
              </div>
              <p>By certifying, you confirm that the time-ins and time-outs in this DTR are <b>true and correct</b>. The intern and the OJT coordinator are notified.</p>
            </>) : (
              <p>The DTR for this period goes back to <b>not certified</b>. You can certify it again after checking it.</p>
            )}
            {msg?.type === "error" && <Msg msg={msg} />}
            <div className="dtr-ask-btns">
              <button type="button" className="ix-b ghost" disabled={busy} onClick={() => setAsk(null)}>Cancel</button>
              {ask === "certify" ? (
                <button type="button" className="ix-b primary" disabled={busy}
                  onClick={() => call("POST", "/supervisor/dtr-certifications", { user_id: intern.id, from, to })}>
                  <Icon name="check" size={14} /> {busy ? "Certifying..." : "Certify DTR"}</button>
              ) : (
                <button type="button" className="ix-b primary" disabled={busy}
                  onClick={() => call("DELETE", `/supervisor/dtr-certifications/${cert.id}`)}>
                  {busy ? "Removing..." : "Undo certification"}</button>
              )}
            </div>
          </div>
        </Modal>
      )}
      <style>{`
        .dtr-ask { display: grid; gap: 14px; }
        .dtr-ask p { margin: 0; font-size: 14px; line-height: 1.55; color: #374151; }
        .dtr-ask-sum { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
        .dtr-ask-sum span { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border-radius: 10px; background: #f8f9fb; border: 1px solid #eef0f3; }
        .dtr-ask-sum b { font-size: 15px; color: #111827; } .dtr-ask-sum small { font-size: 12px; color: #6b7280; }
        .dtr-ask-btns { display: flex; justify-content: flex-end; gap: 8px; }
        .dtr-cert { margin: 0 0 14px; }
        .dtr-cert-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 14px; border-radius: 10px;
          background: #fff7ed; color: #9a3412; font-size: 13.5px; }
        .dtr-cert-row.ok { background: #ecfdf5; color: #065f46; }
        .dtr-cert-row.none { background: #f3f4f6; color: #4b5563; }
        .dtr-cert-changed { flex-basis: 100%; display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; color: #b45309; }
        .dtr-cert-row > span { flex: 1; min-width: 200px; }
        .dtr-cert .ix-msg { margin-top: 8px; }
      `}</style>
    </div>
  );
}

/* Holidays / non-working days from the admin's Calendar: { "2026-11-01": "All Saints' Day", ... } */
// only the days with no OJT for this intern: school events and HTE working days don't count.
// forId: (staff) whose days off, e.g. the intern whose DTR is shown; interns get their own.
export function useHolidays(forId = null) {
  const [holidays, setHolidays] = useState({});
  useEffect(() => {
    fetch(`${API}/calendar${forId ? `?for=${forId}` : ""}`, { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((list) => {
        if (!Array.isArray(list)) return;
        const map = {};
        list.forEach((e) => {
          if (e.off === false) return;
          map[String(e.date).slice(0, 10)] = e.title || "Holiday";
        });
        setHolidays(map);
      })
      .catch(() => {});
  }, [forId]);
  return holidays;
}

// Approved school-event days (excused absence): { "2026-11-05": "University Foundation Day" }
// forId: (staff) the intern whose DTR is shown; interns get their own.
export function useExcused(forId = null) {
  const [days, setDays] = useState({});
  useEffect(() => {
    fetch(`${API}/excused-days${forId ? `?user_id=${forId}` : ""}`, { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((list) => {
        if (!Array.isArray(list)) { setDays({}); return; }
        const map = {};
        const portions = {};
        list.forEach((e) => { const k = String(e.date).slice(0, 10); map[k] = e.event_name || "Excused"; portions[k] = e.portion || "whole"; });
        Object.defineProperty(map, "portions", { value: portions, enumerable: false });
        setDays(map);
      })
      .catch(() => {});
  }, [forId]);
  return days;
}
// printed on the DTR for an excused day with no taps (a holiday on the same day wins)
// (a morning-only or afternoon-only event is not a day off: the DTR shows the taps instead)
export const excusedLabels = (map) =>
  Object.fromEntries(Object.entries(map).filter(([d]) => !["am", "pm"].includes(map.portions?.[d])).map(([d, n]) => [d, `EXCUSED: ${n}`]));

export function buildDtr({ records, month, from, to, mode, holidays = {}, portions = {} }) {
  const S = SCHEDULE;
  const mins = (h) => Math.max(Math.floor(h * 60 + 1e-6), 0);   // hours → whole minutes, never negative
  const inRange = records.filter((r) => {
    if (!r.date?.startsWith(month)) return false;
    const d = Number(r.date.slice(8, 10));
    return d >= from && d <= to;
  });
  const byDate = sessionsByDate(inRange);
  const totalHrs = Math.round(Object.values(byDate).reduce((s, x) => s + dayHours(x), 0) * 10) / 10;
  let tardyMin = 0;
  let undertimeMin = 0;

  const formRows = Array.from({ length: to - from + 1 }, (_, i) => {
    const d = from + i;
    const iso = `${month}-${String(d).padStart(2, "0")}`;
    const s = byDate[iso] || [];
    const wi = weekdayIdx(iso);
    // a holiday in the Calendar is printed on the DTR (and is not counted)
    if (!s.length && holidays[iso]) return { d, weekend: String(holidays[iso]).toUpperCase().slice(0, 28) };
    if (!s.length) return wi >= 5 ? { d, weekend: wi === 5 ? "SATURDAY" : "SUNDAY" } : { d };
    if (s.every((x) => x.online)) return { d, weekend: "ONLINE (approved)" };

    let late = 0;
    let early = 0;
    let row;
    const part = portions[iso];   // "am" / "pm": that half was an excused school event
    if (mode === "two") {
      const last = [...s].reverse().find((x) => x.out);
      // the lunch hour (amOut–pmIn, 12–1) is never work time, so it is never undertime or tardiness either
      const lunch = (from, to) => Math.max(0, Math.min(to, S.pmIn) - Math.max(from, S.amOut));
      const arr = Math.min(manilaHour(s[0].in), S.pmOut);
      late = part === "am" ? 0 : mins(Math.max(0, arr - S.amIn) - lunch(S.amIn, arr));
      if (last && part !== "pm") {
        const dep = Math.max(manilaHour(last.out), S.amIn);   // leaving before 8:00 counts from 8:00
        early = mins(Math.max(0, S.pmOut - dep) - lunch(dep, S.pmOut));
      }
      row = { d, amIn: t12(s[0].in), pmOut: last ? t12(last.out) : "" };
    } else {
      const am = s.find((x) => manilaHour(x.in) < 12);
      const pm = s.find((x) => x !== am);
      if (am && part !== "am") late += mins(manilaHour(am.in) - S.amIn);
      if (am?.out && part !== "am") early += mins(S.amOut - manilaHour(am.out));
      if (pm && part !== "pm") late += mins(manilaHour(pm.in) - S.pmIn);
      if (pm?.out && part !== "pm") early += mins(S.pmOut - manilaHour(pm.out));
      row = {
        d,
        amIn: am ? t12(am.in) : "",
        amOut: am?.out ? t12(am.out) : "",
        pmIn: pm ? t12(pm.in) : "",
        pmOut: pm?.out ? t12(pm.out) : "",
      };
    }
    tardyMin += late;
    undertimeMin += early;
    return { ...row, ut: late + early };
  });

  return { formRows, totalHrs, daysPresent: Object.keys(byDate).length, tardyMin, undertimeMin };
}

function MyDtr({ user, records, loading, mode }) {
  // Month and year start on the current month; the period starts blank.
  // Nothing is shown until the user picks a period and clicks "Display DTR".
  const nowManila = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const [year, setYear] = useState(nowManila.slice(0, 4));
  const [mon, setMon] = useState(nowManila.slice(5, 7));
  const [period, setPeriod] = useState("");       // "" | "first" | "second" | "full"
  const [shown, setShown] = useState(null);       // { year, mon, period } of the DTR on screen
  const [err, setErr] = useState("");

  const MONTHS = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1).padStart(2, "0"),
    label: new Date(2000, i, 1).toLocaleDateString("en-US", { month: "long" }),
  }));
  const years = [...new Set([nowManila.slice(0, 4), year, ...records.map((r) => String(r.date || "").slice(0, 4)).filter(Boolean)])]
    .sort((a, b) => b.localeCompare(a));
  const periodsOf = (y, m) => {
    const last = new Date(Number(y), Number(m), 0).getDate();   // days in that month
    return [
      { key: "first", label: "1–15", from: 1, to: 15 },
      { key: "second", label: `16–${last}`, from: 16, to: last },
      { key: "full", label: `Whole month (1–${last})`, from: 1, to: last },
    ];
  };

  const display = () => {
    if (!period) { setErr("Choose a period first."); return; }
    setErr("");
    setShown({ year, mon, period });
  };

  const excusedDays = useExcused();
  const holidays = { ...excusedLabels(excusedDays), ...useHolidays() };
  const certs = useDtrCerts(user?.id);   // the supervisor's certifications: signed on the printed DTR

  // everything below is for the DTR that was displayed (not the dropdowns being changed)
  let view = null;
  if (shown) {
    const month = `${shown.year}-${shown.mon}`;
    const range = periodsOf(shown.year, shown.mon).find((p) => p.key === shown.period);
    const { formRows, totalHrs, daysPresent, tardyMin, undertimeMin } =
      buildDtr({ records, month, from: range.from, to: range.to, mode, holidays, portions: excusedDays.portions || {} });
    const monthName = MONTHS.find((m) => m.value === shown.mon)?.label || "";
    const periodLabel = `${monthName} ${range.from} - ${range.to}, ${shown.year}`;
    const verifierFor = (h) => verifierOf(certs, `${month}-${String(range.from).padStart(2, "0")}`, `${month}-${String(range.to).padStart(2, "0")}`, h);
    const formHtml = dtrFormHtml({
      name: user.name, office: "Caraga State University - MAIN", periodLabel,
      officialHours: OFFICIAL_HOURS[mode], rows: formRows, totalHrs, tardyMin, undertimeMin, verifier: verifierFor(totalHrs),
    });
    view = { month, range, totalHrs, daysPresent, monthName, formHtml };
  }

  const handlePrint = () => {
    if (!view) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>DTR - ${esc(user.name)}</title><style>
      @page { size: A4 portrait; margin: 8mm; }
      body { margin: 0; padding: 0; }
      .sheet { display: flex; gap: 10mm; align-items: flex-start; }
      .sheet .cs48 { flex: 1; }
      ${CS48_CSS}
    </style></head><body><div class="sheet">${view.formHtml}${view.formHtml}</div></body></html>`);
    w.document.close(); w.print();
  };

  return (
    <>
      <style>{CS48_CSS}</style>
      <PageHeader title="My DTR" sub="Your Daily Time Record. Choose the month, year and period, then click Display DTR." />
      <div className="ix-card">
        <div className="dtr-pick">
          <label className="fl-field">
            <span className="fl-label">Month *</span>
            <select value={mon} onChange={(e) => setMon(e.target.value)}>
              {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
          <label className="fl-field">
            <span className="fl-label">Year *</span>
            <select value={year} onChange={(e) => setYear(e.target.value)}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label className={period ? "fl-field" : "fl-field empty"}>
            <span className="fl-label">Period *</span>
            <select value={period} onChange={(e) => { setPeriod(e.target.value); setErr(""); }}>
              <option value="" disabled hidden></option>
              {periodsOf(year, mon).map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </label>
          <button type="button" className="fl-btn" onClick={display}>
            <Icon name="send" size={18} /> Display DTR
          </button>
        </div>
        {err && <div className="fl-err">{err}</div>}

        {!view ? (
          <div className="dtr-wait">
            <span className="dtr-wait-ic"><Icon name="file" size={26} /></span>
            <strong>No DTR displayed yet</strong>
            <p>Choose a period, then click <b>Display DTR</b>.</p>
          </div>
        ) : (
          <>
            <div className="dtr-shown-head">
              <div className="req-dtr-meta">
                <span><strong>{view.monthName} {shown.year}</strong> · {view.range.label}</span>
                <span>{DTR_MODES[mode]}</span>
                <span>{view.daysPresent} day{view.daysPresent === 1 ? "" : "s"} present</span>
                <span>Total: <strong>{view.totalHrs}h</strong></span>
              </div>
              <button type="button" className="ix-b primary" onClick={handlePrint} disabled={!view.daysPresent}>
                <Icon name="print" size={16} /> Print DTR
              </button>
            </div>
            <CertifyBar
              intern={user}
              from={`${view.month}-${String(view.range.from).padStart(2, "0")}`}
              to={`${view.month}-${String(view.range.to).padStart(2, "0")}`}
              hasDays={view.daysPresent > 0}
              currentHours={view.totalHrs}
            />
            {loading ? <Spinner /> : (
              <div className="cs48-pair">
                <div className="cs48-card" dangerouslySetInnerHTML={{ __html: view.formHtml }} />
                <div className="cs48-card" dangerouslySetInnerHTML={{ __html: view.formHtml }} />
              </div>
            )}
          </>
        )}
      </div>
      <style>{DTR_PICK_CSS}</style>
    </>
  );
}

/* Month / Year / Period fields + "Display DTR" button (used on every DTR page) */
export const DTR_PICK_CSS = `
        .dtr-pick { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) auto; gap: 12px; align-items: stretch; }
        .fl-field { position: relative; display: block; margin: 0; }
        .fl-field select {
          width: 100%; height: 56px; padding: 18px 40px 8px 14px; border: 1px solid #c4c4c4; border-radius: 6px;
          background: var(--ix-surface, #fff) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24'%3E%3Cpath d='M7 10l5 5 5-5z' fill='%23757575'/%3E%3C/svg%3E") no-repeat right 14px center;
          appearance: none; -webkit-appearance: none; font: inherit; font-size: 15px; color: #1f2937; cursor: pointer;
        }
        .fl-field select:hover { border-color: #6b7280; }
        .fl-field select:focus { outline: none; border: 2px solid #f97316; padding: 17px 39px 7px 13px; }
        .fl-label { position: absolute; left: 14px; top: 7px; font-size: 11.5px; color: #6b7280; pointer-events: none; transition: all .15s; }
        .fl-field:focus-within .fl-label { color: #ea580c; }
        /* blank period: the label sits in the middle like a placeholder */
        .fl-field.empty .fl-label { top: 50%; transform: translateY(-50%); font-size: 15px; color: #6b7280; }
        .fl-field.empty:focus-within .fl-label { top: 7px; transform: none; font-size: 11.5px; color: #ea580c; }
        .fl-btn {
          height: 56px; padding: 0 20px; border: 1px solid #f97316; border-radius: 6px; background: var(--ix-surface, #fff); color: #ea580c;
          font: inherit; font-size: 14.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase;
          display: inline-flex; align-items: center; gap: 10px; cursor: pointer; white-space: nowrap; transition: background .15s;
        }
        .fl-btn:hover { background: #fff7ed; }
        .fl-btn:focus-visible { outline: 2px solid #f97316; outline-offset: 2px; }
        .fl-err { margin-top: 8px; font-size: 13px; color: #dc2626; }
        .dtr-wait { padding: 48px 20px 36px; text-align: center; color: #6b7280; }
        .dtr-wait-ic { width: 56px; height: 56px; margin: 0 auto 12px; border-radius: 50%; background: #fdeee7; color: #e8582a;
          display: flex; align-items: center; justify-content: center; }
        .dtr-wait strong { display: block; font-size: 15px; color: #1f2937; }
        .dtr-wait p { margin: 4px 0 0; font-size: 13px; }
        .dtr-shown-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin: 18px 0 10px; }
        .dtr-shown-head .req-dtr-meta { margin: 0; }
        /* the DTR card reaches the bottom of the window (it still grows when a long DTR is shown, then the page scrolls) */
        @media (min-width: 801px) and (min-height: 520px) {
          .ix-page.lay2 .ix-main:has(.dtr-pick) { display: flex !important; flex-direction: column !important; overflow-y: auto !important; }
          .ix-page.lay2 .ix-main:has(.dtr-pick) > .ix-content { flex: 1 0 auto !important; display: flex !important; flex-direction: column !important; align-self: stretch; width: 100%; box-sizing: border-box; }
          .ix-page.lay2 .ix-main:has(.dtr-pick) > .ix-content > * { flex: none; }
          .ix-page.lay2 .ix-main:has(.dtr-pick) > .ix-content > .ix-card:has(> .dtr-pick) { flex: 1 0 auto; margin-bottom: 0 !important; }
        }
        @media (max-width: 800px) { .dtr-pick { grid-template-columns: 1fr 1fr; } .fl-btn { grid-column: 1 / -1; justify-content: center; } }
`;

/* ───────────────────────── NFC card application ───────────────────────── */
// Submitted → Approved (sign at the office) → Printed → Linked (ready) → Claimed (active)
const STEPS = ["Submitted", "Approved", "Printed", "Linked", "Claimed"];
const stageOf = (r) =>
  !r ? "none"
  : r.status === "issued" ? "issued"
  : r.status === "approved" ? (!r.printed_at ? "approved" : r.uid ? "linked" : "printed")
  : r.status;
const DONE_COUNT = { pending: 1, approved: 2, printed: 3, linked: 4, issued: 5 };
const STATUS_TEXT = {
  pending: "Waiting for your OJT coordinator to review your request.",
  approved: `Approved! Next, go to the ${ID_OFFICE} to sign your ID card so it can be printed. You'll be notified when it's ready to claim.`,
  printed: `Your ID card is printed. You can claim it at the ${ID_OFFICE}. It becomes active when you claim it.`,
  linked: `Your ID card is ready. Claim it at the ${ID_OFFICE}; it becomes active as soon as you claim it.`,
  issued: "You claimed your card. It's active, so your taps on the kiosk are recorded.",
};

function NfcApply({ user, records = [] }) {
  const go = useNavigate();
  // taps count only after every pre-internship requirement is approved (same rule as the kiosk)
  const [pre, setPre] = useState(null);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [type, setType] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState(null);
  const [showReplace, setShowReplace] = useState(false);   // replacement form, opened on demand
  const [me, setMe] = useState(null);                       // full account, for the card preview
  const [back, setBack] = useState(false);                  // card preview: front or back
  // computers: the page is exactly as tall as the window (no page scroll) and the card scales to its box
  const pageRef = useRef(null);
  const boxRef = useRef(null);
  const [zoom, setZoom] = useState(null);
  useLayoutEffect(() => {
    const fit = () => {
      const pg = pageRef.current, box = boxRef.current;
      if (!pg || !box) return;
      if (window.innerWidth <= 1000 || window.innerHeight < 600) { if (pg.style.height) pg.style.height = ""; setZoom(null); return; }
      const h = Math.max(470, Math.floor(window.innerHeight - pg.getBoundingClientRect().top - 34));
      if (pg.style.height !== h + "px") pg.style.height = h + "px";
      const r = box.getBoundingClientRect();
      // CR80 card: 54mm x 85.6mm = about 204 x 324 px; leave room for the Show the back button and padding
      const z = Math.min((r.height - 96) / 324, (r.width - 44) / 204);
      setZoom(Math.round(Math.max(0.6, Math.min(1.7, z)) * 100) / 100);
    };
    fit();
    window.addEventListener("resize", fit);
    const t = setInterval(fit, 400);
    return () => { window.removeEventListener("resize", fit); clearInterval(t); };
  });
  useEffect(() => {
    fetch(`${API}/me?user_id=${user.id}`, { headers: { Accept: "application/json" } })
      .then((r) => r.json()).then((d) => setMe(d?.user || d || {})).catch(() => setMe({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    try {
      const [res, movs] = await Promise.all([
        fetch(`${API}/intern/nfc-request?user_id=${user.id}`, { headers: { Accept: "application/json" } }),
        fetch(`${API}/intern/my-movs?user_id=${user.id}`, { headers: { Accept: "application/json" } })
          .then((r) => r.json()).catch(() => null),
      ]);
      if (Array.isArray(movs)) setPre(preStatusOf(movs));
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not load your NFC card status.");
      setInfo(data);
      setError(null);
    } catch (e) {
      setError(
        e instanceof SyntaxError || e instanceof TypeError
          ? "Couldn't reach the NFC card service. Please try again later."
          : e.message
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    return liveRefresh(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const req = info?.request;
  const status = req?.status;
  const hasCard = !!info?.has_card;
  // linked, but the kiosk won't record taps until the internship has started
  const notStarted = hasCard && pre && !pre.started;
  const active = status === "pending" || status === "approved";
  const types = hasCard ? ["Lost card", "Damaged card", "Replacement"] : ["First NFC card"];
  const chosen = types.includes(type) ? type : types[0];

  const submit = async (e) => {
    e.preventDefault(); setSubmitting(true); setMsg(null);
    try {
      const res = await fetch(`${API}/intern/nfc-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ user_id: user.id, type: chosen, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not submit your request.");
      setMsg({ type: "success", text: data.message || "Request submitted!" });
      setNotes("");
      setShowReplace(false);
      load();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof SyntaxError ? "The NFC card service isn't available yet." : err.message });
    } finally {
      setSubmitting(false);
    }
  };

  // the card's journey: every step done once the card is claimed
  const stage = stageOf(req);
  const doneSteps = hasCard && (!req || status === "issued" || !active) ? STEPS.length : DONE_COUNT[stage] ?? 0;
  // the latest kiosk taps (online days are not card taps)
  const taps = records
    .filter((r) => r.uid !== "ONLINE")
    .flatMap((r) => [r.checked_in_at && { t: r.checked_in_at, kind: "in" }, r.checked_out_at && { t: r.checked_out_at, kind: "out" }])
    .filter(Boolean)
    .sort((x, y) => new Date(y.t) - new Date(x.t))
    .slice(0, 5);
  const tapDay = (t) => {
    const d = new Date(t);
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
    const day = d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
    return day === today ? "Today" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "Asia/Manila" });
  };
  const tapTime = (t) => new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });
  const cardUser = { ...user, ...(me || {}) };
  const settings = loadCardSettings();   // the valid date (end of the school year)
  // the card itself is shown only once it's released (claimed); before that, its journey
  const released = hasCard && !active;
  const reached = { none: 0, rejected: 1, pending: 1, approved: 2, printed: 3, linked: 4, issued: 5 }[stage] ?? 0;
  const journey = [
    { t: "Pre-internship requirements approved", d: pre ? `${pre.approved} of ${pre.total} approved` : "Checking…", done: !!pre?.started },
    { t: "Apply for your card", d: req ? "Request sent" : "Use the form on this page", done: reached >= 1 },
    status === "rejected"
      ? { t: "Approved by your OJT coordinator", d: "Not approved. You can apply again.", bad: true }
      : { t: "Approved by your OJT coordinator", d: `Then sign your ID at the ${ID_OFFICE}`, done: reached >= 2 },
    { t: "Printed by the admin", d: "Your ID card is printed", done: reached >= 3 },
    { t: "Linked to your account", d: "The card is connected to you", done: reached >= 4 },
    { t: "Claimed and released", d: "Your card becomes active", done: reached >= 5 },
  ];
  const nowAt = journey.findIndex((j) => !j.done && !j.bad);

  return (
    <>
      <PageHeader title="My NFC Card" sub="Your attendance card and its status." />
      <style>{idCardCss}</style>
      {loading ? <Spinner /> : error ? (
        <div className="ix-alert"><Icon name="warn" size={18} /> {error}</div>
      ) : (
        <div className="nc-page" ref={pageRef}>
          {/* 1 · the card (same design as the printed ID) and where it is */}
          <div className={released ? "ix-card nc-cardbox" : "ix-card nc-cardbox nc-locked"} ref={boxRef}>
            {!released ? (
              <div className="nc-track">
                <div className="nc-track-ico"><Icon name="card" size={26} /></div>
                <b className="nc-track-t">Your card will show here once it's released</b>
                <p className="nc-track-p">Finish each step below. Your ID card appears here after you claim it.</p>
                <ol className="nc-track-list" aria-label="Steps to get your card">
                  {journey.map((j, i) => (
                    <li key={j.t} className={j.bad ? "bad" : j.done ? "done" : i === nowAt ? "now" : ""}>
                      <i>{j.bad ? "!" : j.done ? <Icon name="check" size={12} /> : i + 1}</i>
                      <span><b>{j.t}</b><small>{j.d}</small></span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
            <div className="nc-card">
              <div className={`nc-flip ${back ? "back" : ""} ${hasCard ? "" : "ghost"}`} style={zoom ? { zoom } : undefined}>
                <div className="nc-side front">{me ? <CardFace u={cardUser} settings={settings} /> : <div className="nc-skel" />}</div>
                <div className="nc-side rear">{me ? <CardBack u={cardUser} settings={settings} /> : <div className="nc-skel" />}</div>
              </div>
              <button type="button" className="nc-turn" onClick={() => setBack((v) => !v)}>
                <Icon name="card" size={13} /> {back ? "Show the front" : "Show the back"}
              </button>
            </div>
            )}
          </div>

          <div className="nc-col">
          <div className="ix-card nc-hero">
            <div className="nc-info">
              <span className={`nc-state ${notStarted ? "warn" : hasCard ? "ok" : status === "rejected" ? "bad" : active ? "wait" : ""}`}>
                {notStarted ? "Linked · not active yet" : hasCard ? "Card linked · ready" : status === "rejected" ? "Request not approved" : active ? "On its way" : "No card yet"}
              </span>
              <h3>
                {notStarted ? "Your card is linked, but taps won't be recorded yet"
                  : hasCard ? "Your NFC card is ready to use"
                  : active ? "Your card is being prepared" : "You don't have an NFC card yet"}
              </h3>
              <p>
                {notStarted
                  ? `Your internship starts when all pre-internship requirements are approved (${pre.approved} of ${pre.total} approved so far). Until then, the kiosk won't log your time in.`
                  : hasCard ? "Tap it on the kiosk reader when you arrive and when you leave."
                  : active ? (["printed", "linked"].includes(stage) && pre && !pre.started
                      ? `Your ID card is ${stage === "linked" ? "ready" : "printed"}. It's kept at the ${ID_OFFICE} until you can claim it.`
                      : STATUS_TEXT[stage])
                  : status === "rejected" ? `Your request wasn't approved.${req.remarks ? ` Remarks: ${req.remarks}` : ""} You can apply again below.`
                  : pre && !pre.started
                    ? `Apply now, while you complete your pre-internship requirements (${pre.approved} of ${pre.total} approved), so your card is ready when your internship starts.`
                    : "Apply below and your OJT coordinator will get your card ready."}
              </p>

              {released && status !== "rejected" && (req || hasCard) && (
                <ol className="nc-steps" aria-label="Card progress">
                  {STEPS.map((label, i) => (
                    <li key={label} className={i < doneSteps ? "done" : i === doneSteps && active ? "now" : ""}>
                      <i>{i < doneSteps ? <Icon name="check" size={13} /> : i + 1}</i><span>{label}</span>
                    </li>
                  ))}
                </ol>
              )}

              {active && ["approved", "printed", "linked"].includes(stage) && pre && !pre.started && (
                <div className="nfc-claim-warn" role="alert">
                  <Icon name="warn" size={16} />
                  <span><strong>You can't claim your card yet.</strong> All pre-internship requirements must be approved first ({pre.approved} of {pre.total} approved).</span>
                  <button type="button" className="ix-b ghost sm" onClick={() => go("/intern/movs")}>Submit MOV</button>
                </div>
              )}
              {notStarted && <button type="button" className="ix-b primary sm nfc-go" onClick={() => go("/intern/movs")}>Go to Submit MOV</button>}
              {active && req?.remarks && <div className="ix-remarks">Remarks: {req.remarks}</div>}
            </div>
          </div>

          {/* 2 · recent taps + replacement / application */}
          <div className="nc-row">
            <div className="ix-card flush nc-taps">
              <div className="nc-hd"><b>Recent taps with this card</b>
                <button type="button" className="nc-link" onClick={() => go("/intern/records")}>View all ›</button></div>
              {taps.length === 0 ? (
                <div className="nc-empty">{hasCard ? "No taps yet. Your taps on the kiosk will show here." : "Your taps will show here once your card is active."}</div>
              ) : (
                <ul className="nc-tlist">
                  {taps.slice(0, 5).map((x, i) => (
                    <li key={i}><span><b>{tapDay(x.t)}</b> · {tapTime(x.t)}</span>
                      <span className={`nc-pill ${x.kind}`}>{x.kind === "in" ? "Time in" : "Time out"}</span></li>
                  ))}
                </ul>
              )}
            </div>

            <div className="ix-card nc-act">
              {active ? (
                <>
                  <b className="nc-act-t">You have an open request</b>
                  <p className="nc-act-p">A new application isn't needed right now. Follow its progress above.</p>
                </>
              ) : (
                <form onSubmit={submit} className="nc-form">
                  <b className="nc-act-t">{hasCard ? "Lost or damaged your card?" : "Apply for your card"}</b>
                  <p className="nc-act-p">{hasCard
                    ? "Ask for a new one. Your current card keeps working until you claim the replacement."
                    : `Your OJT coordinator approves it. Then you sign your ID at the ${ID_OFFICE}, the admin prints it, and it becomes active when you claim it.`}</p>
                  <Msg msg={msg} />
                  {types.length > 1 && (
                    <div className="nc-seg" role="radiogroup" aria-label="Reason">
                      {types.map((t) => (
                        <button key={t} type="button" role="radio" aria-checked={chosen === t} className={chosen === t ? "on" : ""} onClick={() => setType(t)}>
                          {t.replace(" card", "")}
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea rows={2} value={notes} maxLength={500} placeholder="Notes for your OJT coordinator (optional)"
                    aria-label="Notes" onChange={(e) => setNotes(e.target.value)} className="nc-notes" />
                  <button type="submit" disabled={submitting} className="ix-b primary nc-send">
                    {submitting ? "Sending..." : hasCard ? "Request a replacement" : "Apply for my card"}
                  </button>
                </form>
              )}
            </div>
          </div>
          </div>
        </div>
      )}
      <style>{NC_CSS}</style>
    </>
  );
}

const NC_CSS = `
.ix-page .nc-page:has(.nc-locked) { grid-template-columns: minmax(300px, 340px) minmax(0, 1fr); }
.ix-page .ix-card.nc-cardbox.nc-locked { align-items: stretch; justify-content: flex-start; padding: 22px 22px !important; width: auto; min-width: 0; box-sizing: border-box; }
.ix-page .nc-track { display: flex; flex-direction: column; gap: 6px; }
.ix-page .nc-track-ico { width: 52px; height: 52px; border-radius: 14px; display: grid; place-items: center; background: #fdeee5; color: #e8582a; margin-bottom: 6px; }
.ix-page .nc-track-t { font-size: 15px; font-weight: 700; color: #1f2430; line-height: 1.3; }
.ix-page .nc-track-p { margin: 0 0 10px; font-size: 12.5px; color: #6b7280; line-height: 1.45; }
.ix-page .nc-track-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.ix-page .nc-track-list li { position: relative; display: flex; gap: 12px; padding: 0 0 16px; }
.ix-page .nc-track-list li:last-child { padding-bottom: 0; }
.ix-page .nc-track-list li::before { content: ""; position: absolute; left: 12px; top: 26px; bottom: 2px; width: 2px; background: #e7e9ee; }
.ix-page .nc-track-list li:last-child::before { display: none; }
.ix-page .nc-track-list li.done::before { background: #16a34a; }
.ix-page .nc-track-list i { flex: none; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-style: normal; font-size: 12px; font-weight: 700; background: #f3f4f6; color: #9aa1ad; border: 2px solid #e7e9ee; box-sizing: border-box; position: relative; z-index: 1; }
.ix-page .nc-track-list li.done i { background: #16a34a; border-color: #16a34a; color: #fff; }
.ix-page .nc-track-list li.now i { background: #fff; border-color: #e8582a; color: #e8582a; }
.ix-page .nc-track-list li.bad i { background: #fdecec; border-color: #dc2626; color: #dc2626; }
.ix-page .nc-track-list span { display: flex; flex-direction: column; gap: 1px; padding-top: 3px; min-width: 0; }
.ix-page .nc-track-list b { font-size: 13px; font-weight: 600; color: #1f2430; line-height: 1.35; }
.ix-page .nc-track-list li:not(.done):not(.now):not(.bad) b { color: #6b7280; }
.ix-page .nc-track-list small { font-size: 11.5px; color: #9aa1ad; line-height: 1.4; }
.ix-page .nc-track-list li.now small { color: #c2410c; }
.ix-page .nc-track-list li.bad small { color: #b91c1c; }
@media (max-width: 1000px) { .ix-page .nc-page:has(.nc-locked) { grid-template-columns: 1fr; } }
.ix-page .nc-page { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 14px; align-items: stretch; }
.ix-page .nc-col { min-width: 0; display: flex; flex-direction: column; gap: 14px; }
.ix-page .ix-card.nc-cardbox { display: flex; align-items: center; justify-content: center; padding: 22px 30px !important; margin: 0 !important; }
.ix-page .ix-card.nc-hero { display: block; padding: 24px 28px !important; margin: 0 !important; }
.ix-page .nc-card { display: flex; flex-direction: column; align-items: center; gap: 10px; }
.ix-page .nc-flip { position: relative; width: 54mm; height: 85.6mm; perspective: 1200px; zoom: 1.12; }
.ix-page .nc-side { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; transition: transform .6s cubic-bezier(.2,.8,.2,1); }
.ix-page .nc-side.rear { transform: rotateY(180deg); }
.ix-page .nc-flip.back .nc-side.front { transform: rotateY(-180deg); }
.ix-page .nc-flip.back .nc-side.rear { transform: rotateY(0deg); }
.ix-page .nc-flip.ghost { opacity: .55; filter: grayscale(.35); }
.ix-page .nc-skel { width: 100%; height: 100%; border-radius: 3mm; background: linear-gradient(90deg, #f3f4f6, #fafafb, #f3f4f6); }
.ix-page .nc-turn { display: inline-flex; align-items: center; gap: 6px; height: 28px !important; min-height: 0 !important; padding: 0 12px !important; border-radius: 99px; border: 1px solid #e7e9ee;
  background: #fff; color: #4b5563; font: inherit; font-size: 11.5px; font-weight: 600; cursor: pointer; }
.ix-page .nc-turn:hover { border-color: #f6c9b3; color: #c2410c; }
.ix-page .nc-preview-tag { font-size: 11px; color: #9ca3af; }
.ix-page .nc-info { min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.ix-page .nc-state { align-self: flex-start; display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: 99px; font-size: 11.5px; font-weight: 600; background: #f3f4f6; color: #4b5563; }
.ix-page .nc-state.ok { background: #ecfdf3; color: #15803d; } .ix-page .nc-state.warn, .ix-page .nc-state.wait { background: #fff7ed; color: #c2410c; } .ix-page .nc-state.bad { background: #fef2f2; color: #b91c1c; }
.ix-page .nc-info h3 { margin: 0; font-size: 21px; font-weight: 700; color: #111827; line-height: 1.25; }
.ix-page .nc-info > p { margin: 0; font-size: 13.5px; line-height: 1.55; color: #6b7280; max-width: 620px; }
.ix-page .nc-steps { list-style: none; margin: 14px 0 0; padding: 0; display: flex; max-width: 640px; }
.ix-page .nc-steps li { position: relative; flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 12px; color: #9ca3af; text-align: center; }
.ix-page .nc-steps li + li::before { content: ""; position: absolute; top: 13px; right: 50%; width: 100%; height: 2px; background: #e5e7eb; }
.ix-page .nc-steps li.done + li::before { background: #22c55e; }
.ix-page .nc-steps i { position: relative; z-index: 1; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; font-style: normal; font-size: 12px; font-weight: 700;
  background: #fff; border: 2px solid #e5e7eb; color: #9ca3af; box-sizing: border-box; }
.ix-page .nc-steps li.done i { background: #22c55e; border-color: #22c55e; color: #fff; }
.ix-page .nc-steps li.done span { color: #15803d; font-weight: 600; }
.ix-page .nc-steps li.now i { border-color: #f59e0b; color: #b45309; background: #fffbeb; box-shadow: 0 0 0 4px rgba(245,158,11,.15); }
.ix-page .nc-steps li.now span { color: #b45309; font-weight: 600; }
.ix-page .nc-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; align-items: stretch; }
.ix-page .ix-card.nc-taps { padding: 0 !important; overflow: hidden; margin: 0 !important; }
.ix-page .nc-hd { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #eef0f3; }
.ix-page .nc-hd b { font-size: 14px; font-weight: 600; color: #111827; }
.ix-page .nc-link { padding: 0 !important; border: 0; background: none; font: inherit; font-size: 12px; font-weight: 600; color: #6b7280; cursor: pointer; height: auto !important; min-height: 0 !important; }
.ix-page .nc-link:hover { color: #c2410c; }
.ix-page .nc-tlist { list-style: none; margin: 0; padding: 0; }
.ix-page .nc-tlist li { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid #f1f2f4; font-size: 12.5px; color: #6b7280; }
.ix-page .nc-tlist li:last-child { border-bottom: 0; }
.ix-page .nc-tlist b { color: #111827; font-weight: 600; }
.ix-page .nc-pill { display: inline-flex; align-items: center; height: 22px; padding: 0 9px; border-radius: 99px; font-size: 11px; font-weight: 600; }
.ix-page .nc-pill.in { background: #ecfdf3; color: #15803d; } .ix-page .nc-pill.out { background: #fff7ed; color: #c2410c; }
.ix-page .nc-empty { padding: 28px 16px; text-align: center; font-size: 12.5px; color: #9ca3af; }
.ix-page .ix-card.nc-act { display: flex; flex-direction: column; gap: 10px; padding: 18px 20px !important; margin: 0 !important; }
.ix-page .nc-form { display: flex; flex-direction: column; gap: 10px; }
.ix-page .nc-act-t { font-size: 14px; font-weight: 600; color: #111827; }
.ix-page .nc-act-p { margin: 0; font-size: 12.5px; line-height: 1.5; color: #6b7280; }
.ix-page .nc-seg { display: flex; gap: 8px; flex-wrap: wrap; }
.ix-page .nc-seg button { height: 34px !important; min-height: 0 !important; padding: 0 14px !important; border-radius: 10px; border: 1px solid #e3e5ea; background: #fff; font: inherit; font-size: 12.5px; font-weight: 600; color: #374151; cursor: pointer; }
.ix-page .nc-seg button.on { border-color: #e8582a; background: #fff3ec; color: #c2410c; }
.ix-page .nc-notes { width: 100%; height: 84px !important; min-height: 84px !important; resize: vertical; box-sizing: border-box; padding: 10px 12px !important; border: 1px solid #e3e5ea !important; border-radius: 10px !important;
  font: inherit; font-size: 13px; color: #111827; background: #fff; outline: none; }
.ix-page .nc-notes:focus { border-color: #e8582a !important; box-shadow: 0 0 0 3px rgba(232,88,42,.12); }
.ix-page .nc-info .nfc-go, .ix-page .nc-info .ix-b { align-self: flex-start; width: auto !important; }
.ix-page .nc-send { align-self: flex-start; }
.ix-page .nc-sec { margin-top: auto; display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: #6b7280; padding-top: 6px; }
/* computers: the page is as tall as the window (set in the component); the card scales to its stage, the status box keeps its size, and the bottom row shares the rest evenly */
@media (min-width: 1001px) and (min-height: 600px) {
  .ix-page .ix-main:has(.nc-page) { overflow: hidden !important; }
  .ix-page .nc-page { grid-template-columns: clamp(260px, 26vw, 400px) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }
  .ix-page .nc-col { min-height: 0; }
  .ix-page .ix-card.nc-cardbox { background: #f7f1ec !important; border-color: transparent !important; overflow: hidden; min-height: 0; }
  .ix-page .ix-card.nc-hero { flex: none; padding: clamp(14px, 2.2vh, 24px) 28px !important; }
  /* the bottom row ends on the same line as the ID card box on the left (never shorter than its content);
     both cards share the same height */
  .ix-page .nc-row { grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); flex: 1 0 auto; min-height: 0; align-items: stretch; }
  .ix-page .nc-row > .ix-card { min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
  /* the 5 tap slots share the card's height, so the list fills the card on any screen size */
  .ix-page .nc-tlist { flex: 1 0 auto; display: grid; grid-template-rows: repeat(5, minmax(44px, 1fr)); align-content: stretch; }
  .ix-page .nc-tlist li:last-child { border-bottom: 1px solid #f1f2f4; }
  .ix-page .nc-tlist li:nth-child(5) { border-bottom: 0; }
  /* the form fills its card: the notes box takes the extra height and the button sits at the bottom */
  .ix-page .nc-act > .nc-form { flex: 1 0 auto; }
  .ix-page .nc-act .nc-notes { flex: 1 0 84px; height: auto !important; min-height: 84px !important; max-height: none !important; resize: none; }
  .ix-page .nc-empty { flex: 1; display: grid; place-items: center; margin: 12px; border: 1.5px dashed #e5e7eb; border-radius: 12px; }
  .ix-page .ix-card.nc-cardbox.nc-locked { overflow-y: auto; }
}
/* tall screens (full HD, full screen): a bigger card and steps, so the rows below don't stretch too far */
@media (min-width: 1001px) and (min-height: 920px) {
  .ix-page .nc-info h3 { font-size: 24px; } .ix-page .nc-info > p { font-size: 14.5px; }
  .ix-page .nc-steps { max-width: 720px; margin-top: 18px; }
  /* bigger text in the bottom row too, so it doesn't look small in the taller cards */
  .ix-page .nc-hd b, .ix-page .nc-act-t { font-size: 16px; }
  .ix-page .nc-tlist li { font-size: 14px; padding: 12px 20px; }
  .ix-page .nc-act-p { font-size: 13.5px; }
  .ix-page .ix-card.nc-act { padding: 22px 24px !important; gap: 14px; }
  .ix-page .nc-form { gap: 14px; }
}
@media (min-width: 1001px) and (max-height: 860px) { .ix-page .nc-info h3 { font-size: 19px; } }

@media (max-width: 1000px) {
  .ix-page .nc-page { grid-template-columns: 1fr; }
  .ix-page .ix-card.nc-hero { text-align: center; }
  .ix-page .nc-info { align-items: center; } .ix-page .nc-state { align-self: center; }
  .ix-page .nc-row { grid-template-columns: 1fr; }
}
@media (max-width: 600px) {
  .ix-page .nc-flip { zoom: .9; }
  .ix-page .nc-steps span { font-size: 10.5px; }
}
`;

/* ───────────────────────── Profile ───────────────────────── */
function Profile({ user, totalHours = 0, required = 0, days = 0 }) {
  const [acct, setAcct] = useState(null);
  // computers: scale the page down just enough that it fits the window (no scroll bar)
  const pageRef = useRef(null);
  const lastKey = useRef("");
  useLayoutEffect(() => {
    const fit = (force) => {
      const pg = pageRef.current;
      if (!pg) return;
      if (window.innerWidth < 901 || window.innerHeight < 600) { pg.style.zoom = ""; lastKey.current = ""; return; }
      const key = `${window.innerWidth}|${window.innerHeight}|${Math.round(pg.getBoundingClientRect().top)}`;
      if (!force && key === lastKey.current) return;
      lastKey.current = key;
      pg.style.zoom = "";
      const natural = pg.getBoundingClientRect().height;
      const avail = window.innerHeight - pg.getBoundingClientRect().top - 30;
      const z = natural > avail ? Math.max(0.66, avail / natural) : 1;
      pg.style.zoom = z < 1 ? String(Math.floor(z * 100) / 100) : "";
    };
    fit(true);
    const onR = () => fit(false);
    window.addEventListener("resize", onR);
    const t = setInterval(onR, 500);
    return () => { window.removeEventListener("resize", onR); clearInterval(t); };
  }, [acct]);

  // the full account (program, supervisor, NFC card, emergency contact...)
  useEffect(() => {
    fetch(`${API}/me?user_id=${user.id}`)
      .then((r) => r.json())
      .then((d) => setAcct(d?.user || d || {}))
      .catch(() => setAcct({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const u = { ...user, ...(acct || {}) };
  const parts = (u.name || "").trim().split(/\s+/);
  const bday = u.date_of_birth
    ? new Date(String(u.date_of_birth).slice(0, 10) + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "";
  const kv = (label, value, full) => (
    <div key={label} className={full ? "pf-kv full" : "pf-kv"}><small>{label}</small><b>{value || "—"}</b></div>
  );
  const fmtH = (h) => `${Math.round((Number(h) || 0) * 10) / 10}h`;

  return (
    <>
      <PageHeader title="My Profile" sub="Your account information. Ask the admin if something needs to be changed." />
      {!acct ? <Spinner /> : (
        <div className="pf-page" ref={pageRef}>
          {/* header: who you are, at a glance */}
          <div className="ix-card pf-head">
            <Avatar name={u.name} photo={u.photo} size={76} />
            <div className="pf-who">
              <h2>{u.name}</h2>
              <div className="pf-sub">
                <span>Student ID <b>{u.student_id || "—"}</b></span>
                {u.program && <span>{u.program}</span>}
                {u.placement && <span>{u.placement}</span>}
              </div>
              <div className="pf-tags">
                <span className="pf-tag o">OJT Intern</span>
                <span className="pf-tag">{MODALITIES[modalityOf(u)]}</span>
                {scopeOf(u) !== "local" && <span className="pf-tag">{SCOPES[scopeOf(u)]}</span>}
                <span className={u.nfc_uid ? "pf-tag g" : "pf-tag"}>{u.nfc_uid ? "Card linked" : "No card yet"}</span>
              </div>
            </div>
            <div className="pf-right">
              <div className="pf-stats">
                <div><small>Hours</small><b>{fmtH(totalHours)}</b></div>
                <div><small>Required</small><b>{required}h</b></div>
                <div><small>Days present</small><b>{days}</b></div>
              </div>
              <span className="pf-lock"><Icon name="lock" size={12} /> Only the admin can edit these</span>
            </div>
          </div>

          <div className="pf-grid">
            <section className="ix-card flush pf-card">
              <header><span>Personal information</span></header>
              <div className="pf-body">
                {kv("First name", u.first_name || parts[0])}
                {kv("Middle name", u.middle_name)}
                {kv("Last name", u.last_name || (parts.length > 1 ? parts[parts.length - 1] : ""))}
                {kv("Birthday", bday)}
                {kv("Email", u.email)}
                {kv("Contact number", u.contact_number)}
                {kv("Address", u.address, true)}
              </div>
            </section>
            <section className="ix-card flush pf-card">
              <header><span>Internship details</span></header>
              <div className="pf-body">
                {kv("College", u.college || "CCIS")}
                {kv("Program", u.program)}
                {kv("Semester", u.semester)}
                {kv("Placement", u.placement)}
                {kv("HTE supervisor", u.supervisor_name || "Not assigned yet")}
                {kv("Required hours", `${requiredHoursFor(u.program, u.prior_hours)}h`)}
                {kv("Modality", MODALITIES[modalityOf(u)])}
                {kv("Scope", SCOPES[scopeOf(u)])}
                {kv("DTR type", u.modality === "virtual" ? "Not needed (you log through Submit Online)" : DTR_MODES[dtrModeOf(u)])}
              </div>
            </section>
            <section className="ix-card flush pf-card">
              <header><span>In case of emergency</span></header>
              <div className="pf-body">
                {kv("Full name", u.emergency_contact_name)}
                {kv("Relationship", u.emergency_contact_relation)}
                {kv("Contact number", u.emergency_contact_number)}
                {kv("Address", u.emergency_contact_address, true)}
              </div>
            </section>
            <div className="pf-sec"><AccountSecurity user={user} /></div>
          </div>
        </div>
      )}
      <style>{PF_CSS}</style>
    </>
  );
}

const PF_CSS = `
.ix-page .pf-page { display: flex; flex-direction: column; gap: 14px; }
.ix-page .ix-card.pf-head { position: relative; overflow: hidden; display: flex; align-items: center; gap: 18px; margin: 0 !important; padding: 18px 22px !important;
  background: linear-gradient(100deg, #fff7f2 0%, #fff 60%) !important; }
.ix-page .ix-card.pf-head { background: linear-gradient(100deg, #fff4ec 0%, #fffaf7 45%, #fff 100%) !important; }
.ix-page .ix-card.pf-head::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: #e8582a; z-index: 2; }
.ix-page .pf-head > * { position: relative; z-index: 1; }
.ix-page .pf-who { min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.ix-page .pf-who h2 { margin: 0; font-size: 20px; line-height: 1.25 !important; font-weight: 700; color: #111827; }
.ix-page .pf-page :is(.pf-sub, .pf-stats small, .pf-stats b, .pf-lock, .pf-card > header) { line-height: 1.3 !important; }
.ix-page .pf-sec .sec-card :is(.sec-label, .sec-hint, .ipv-title) { line-height: 1.4 !important; }
.ix-page .pf-sub { display: flex; flex-wrap: wrap; gap: 0; font-size: 12.5px; color: #6b7280; }
.ix-page .pf-sub span + span::before { content: "·"; margin: 0 7px; color: #c4c8cf; }
.ix-page .pf-sub b { color: #111827; font-weight: 600; }
.ix-page .pf-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 2px; }
.ix-page .pf-tag { display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: 99px; background: #f3f4f6; color: #374151; font-size: 11.5px; font-weight: 600; }
.ix-page .pf-tag.o { background: #fff3ec; color: #c2410c; } .ix-page .pf-tag.g { background: #ecfdf3; color: #15803d; }
.ix-page .pf-right { margin-left: auto; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
.ix-page .pf-stats { display: flex; gap: 28px; }
.ix-page .pf-stats div { text-align: right; }
.ix-page .pf-stats small { display: block; font-size: 11.5px; color: #6b7280; }
.ix-page .pf-stats b { font-size: 19px; font-weight: 700; color: #111827; }
.ix-page .pf-lock { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: #8b919b; }
.ix-page .pf-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: stretch; }
.ix-page .ix-card.pf-card { margin: 0 !important; padding: 0 !important; overflow: hidden; }
.ix-page .pf-card > header { padding: 0 18px; border-bottom: 1px solid #eef0f3; font-size: 14px; font-weight: 600; color: #111827; }
.ix-page .pf-card > header, .ix-page .pf-sec .sec-card > .ipv-title { position: relative; box-sizing: border-box; height: clamp(40px, 5.2vh, 48px); display: flex; align-items: center; }
.ix-page .pf-card > header > span, .ix-page .pf-sec .sec-card > .ipv-title > span { position: relative; align-self: stretch; display: inline-flex; align-items: center; }
.ix-page .pf-card > header > span::after, .ix-page .pf-sec .sec-card > .ipv-title > span::after { content: ""; position: absolute; left: 0; right: 0; bottom: -1px; height: 3px; border-radius: 3px 3px 0 0; background: #e8582a; }
.ix-page .pf-body { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 24px; padding: 16px 18px 18px; }
.ix-page .pf-kv { min-width: 0; }
.ix-page .pf-kv.full { grid-column: 1 / -1; }
.ix-page .pf-kv small { display: block; font-size: 11.5px; line-height: 1.35 !important; color: #8b919b; margin: 0 0 2px !important; }
.ix-page .pf-kv b { display: block; font-size: 13.5px; line-height: 1.35 !important; font-weight: 600; color: #111827; overflow-wrap: anywhere; margin: 0 !important; }
/* account security uses the same card header as the others */
.ix-page .pf-sec, .ix-page .pf-sec > .sec-card { height: 100%; }
.ix-page .pf-sec > .ix-card.sec-card { margin: 0 !important; padding: 0 0 16px !important; box-sizing: border-box; display: flex; flex-direction: column; gap: 12px; }
.ix-page .pf-sec .sec-card > .ipv-title { margin: 0 !important; padding: 0 18px; border-bottom: 1px solid #eef0f3; font-size: 14px !important; font-weight: 600 !important; color: #111827; text-transform: none !important; letter-spacing: 0 !important; }
.ix-page .pf-sec .sec-card > :not(.ipv-title) { margin-left: 18px !important; margin-right: 18px !important; }
.ix-page .pf-sec .sec-change { align-self: flex-start; }
@media (max-width: 1100px) { .ix-page .pf-stats { gap: 18px; } }
/* computers: the page fits the window; the four cards share the height left */
@media (min-width: 901px) and (min-height: 600px) {
  .ix-page.lay2 .ix-main:has(.pf-page) { overflow: hidden !important; display: flex !important; flex-direction: column !important; }
  .ix-page.lay2 .ix-main:has(.pf-page) > .ix-content { flex: 1 1 auto !important; min-height: 0 !important; display: flex !important; flex-direction: column !important; align-self: stretch; width: 100%; box-sizing: border-box; }
  .ix-page.lay2 .ix-main:has(.pf-page) > .ix-content > * { flex: none; }
  .ix-page .ix-content > .pf-page { flex: 0 0 auto !important; min-height: 0; }
  .ix-page .ix-card.pf-head { flex: none; padding: clamp(12px, 1.8vh, 18px) 22px !important; }
  /* each row is at least as tall as its content (nothing is cut); extra height is shared */
  .ix-page .pf-grid { grid-template-rows: auto auto; }
  .ix-page .pf-grid > * { min-height: 0; }
  .ix-page .pf-card > header, .ix-page .pf-sec .sec-card > .ipv-title { padding: 0 18px !important; }
  .ix-page .pf-body { gap: clamp(8px, 1.4vh, 14px) 24px; padding: clamp(10px, 1.6vh, 16px) 18px; }
  .ix-page .pf-sec > .ix-card.sec-card { gap: clamp(6px, 1.2vh, 12px); padding-bottom: clamp(10px, 1.6vh, 16px) !important; }
  .ix-page .pf-sec .sec-hint { font-size: 11.5px; line-height: 1.45; }
}
/* wide screens: three facts per row, so the cards stay short */
@media (min-width: 1200px) and (max-height: 1000px) { .ix-page .pf-body { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
/* tall screens: roomier facts so the cards are filled */
@media (min-width: 901px) and (min-height: 901px) { .ix-page .pf-body { gap: 18px 24px; } .ix-page .pf-kv b { font-size: 14px; } }
/* full screen / tall windows: both rows share the extra height evenly and the facts spread out inside each card,
   so no card is left with a big blank at the bottom */
@media (min-width: 901px) and (min-height: 600px) {
  .ix-page.lay2 .ix-content .pf-page > .pf-grid:last-child { grid-template-rows: minmax(min-content, 1fr) minmax(min-content, 1fr) !important; }
  .ix-page .ix-card.pf-card { display: flex; flex-direction: column; }
  .ix-page .pf-card > header { flex: none; }
  .ix-page .pf-card > .pf-body { flex: 1 0 auto; align-content: space-evenly; }
  /* account security: the code and the button sit in the middle of the space under the title */
  .ix-page .pf-sec .sec-card > .sec-row2 { margin-top: auto !important; }
  .ix-page .pf-sec .sec-card > .sec-change { margin-bottom: auto !important; margin-top: clamp(6px, 1.6vh, 18px) !important; }
}
@media (min-width: 901px) and (min-height: 960px) {
  .ix-page .pf-who h2 { font-size: 24px; }
  .ix-page .pf-sub { font-size: 13.5px; }
  .ix-page .pf-stats b { font-size: 22px; } .ix-page .pf-stats small { font-size: 12.5px; }
  .ix-page .pf-card > header, .ix-page .pf-sec .sec-card > .ipv-title { font-size: 15.5px !important; height: 54px; }
  .ix-page .pf-kv small { font-size: 12.5px; } .ix-page .pf-kv b { font-size: 15.5px; }
  .ix-page .pf-body { padding: 18px 22px !important; }
  .ix-page .pf-sec .sec-card > :not(.ipv-title) { margin-left: 22px !important; margin-right: 22px !important; }
  .ix-page .pf-sec .sec-hint { font-size: 12.5px; }
}
@media (min-width: 901px) and (max-height: 800px) {
  .ix-page .pf-sec .sec-hint { display: none; }
  .ix-page .pf-kv small { margin-bottom: 0; font-size: 11px; } .ix-page .pf-kv b { font-size: 12.5px; }
  .ix-page .pf-head .ix-avatar, .ix-page .pf-head > :first-child { transform: scale(.85); }
}
@media (max-width: 900px) {
  .ix-page .ix-card.pf-head { flex-wrap: wrap; }
  .ix-page .pf-stats { margin-left: 0; width: 100%; justify-content: space-between; }
  .ix-page .pf-stats div { text-align: left; }
  .ix-page .pf-lock { position: static !important; }
  .ix-page .pf-grid { grid-template-columns: 1fr; }
}
@media (max-width: 480px) { .ix-page .pf-body { grid-template-columns: 1fr; } }
`;

/* ───────── ONE PLACE TO CHANGE ALL CARD BORDERS ─────────
   Change --card-border below and every page follows (Home, DTR, Submit Online,
   Submit MOV, NFC Card, Profile).
   Examples:  0                      → no border (Material look)
              1px solid #f3e3da      → thin brown line
              1px solid #e5e7eb      → thin gray line
              1px solid #e8582a      → orange line                              */
export const cardUnify = `
.ix-content {
  --card-border: 0;
  --card-radius: 12px;
  --card-shadow: var(--md-shadow);
}
  .ix-page .ix-main { background: var(--ix-surface-2, #fdfdfd) !important; }

/* every card */
.ix-content .ix-card,
.ix-content .os-card,
.ix-content .nfc-hero,
.ix-content .hv-stat,
.ix-content .at-log,
.ix-content .at-chart,
.ix-content .hv-hero,
.ix-content .adm-col > :not(.hv-hero):not(.hv-stats):not(.ix-alert) {
  border: var(--card-border) !important;
  border-radius: var(--card-radius) !important;
  box-shadow: var(--card-shadow) !important;
  background: var(--ix-surface, #fff);
  box-sizing: border-box;
}

/* same padding (flush cards like the attendance table keep 0) */
.ix-content .ix-card:not(.flush),
.ix-content .os-card,
.ix-content .nfc-hero,
.ix-content .nfc-page .ix-card:not(.flush) {
  padding: 18px 20px !important;
}

/* tables inside cards must not draw a second border */
.ix-content .ix-card .ix-table-wrap,
.ix-content .os-card .ix-table-wrap {
  border: 0 !important; box-shadow: none !important; border-radius: 0 !important; background: transparent !important;
}

/* DTR paper sheets: flat, with a hairline */
.ix-content .cs48-pair > .cs48-card {
  border: 0;
  border-radius: 4px;
  background: #fff;
  box-shadow: 0 2px 14px rgba(0,0,0,.14);
}

/* ═════ Hero: dark brown → orange gradient (all users) ═════ */
.ix-content .hv-hero {
  background:
    radial-gradient(520px 260px at 88% -10%, rgba(232,120,70,.45), transparent 70%),
    linear-gradient(110deg, #3d1509 0%, #6b2611 45%, #a8471f 80%, #c2602f 100%) !important;
  color: #fff;
}

/* text must be light on the dark background */
.ix-content .hv-hero h1 { color: #fff !important; }
.ix-content .hv-hero p,
.ix-content .hv-hero .hv-track-cap,
.ix-content .hv-hero .at-marks { color: rgba(255,255,255,.8) !important; }
.ix-content .hv-hero .hv-track-cap b,
.ix-content .hv-hero .ix-ring-center strong { color: #fff !important; }

/* progress bar and ring track: see-through white */
.ix-content .hv-hero .hv-track { background: rgba(255,255,255,.2); }
.ix-content .hv-hero .hv-track i { background: rgba(61,21,9,.6); }
.ix-content .hv-hero svg circle:first-child { stroke: rgba(255,255,255,.2); }
`;

/* ───────────────────────── intern-only styles ─────────────────────────
   Loaded AFTER adminCss. Stats, calendar and gaps on Home come from adminCss;
   the .hv-* rules below are the Home redesign. mdCss (materialTheme.js) is
   loaded after this and restyles the look. */
export const internCss = `
.ix-page .dbx-fin-body { position: relative; }
/* DashKit lines the top cards up with the tall calendar, which stretches "No time in yet" and "My OJT finish line".
   Here the calendar + announcements column sits on its own, so those two cards are only as tall as their content.
   The second row stretches, so every card ends on the same bottom line (new interns with Getting started, and finished ones with Requirements due). */
@media (min-width: 1251px) {
  .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right:has(> .dbx-mid > :nth-child(2)) { grid-template-rows: auto 1fr !important; }
  .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right:has(> .dbx-mid > :nth-child(2)) > .dbx-side { display: flex !important; flex-direction: column !important; gap: 12px !important; grid-column: 3 !important; grid-row: 1 / 3 !important; align-self: stretch !important; margin: 0 !important; }
  .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right:has(> .dbx-mid > :nth-child(2)) > .dbx-side > * { grid-column: auto !important; grid-row: auto !important; margin: 0 !important; }
  .ix-page.lay2 .ix-content .dbx-grid.has-left.has-right:has(> .dbx-mid > :nth-child(2)) > .dbx-side > :last-child { flex: 1 1 auto !important; }
}
.ix-page .dbx-confetti { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 5; }
.ix-page .dbx-ring.done { cursor: pointer; animation: dbxRingPop .7s ease-out both; }
@keyframes dbxRingPop { 0% { transform: scale(.9); } 55% { transform: scale(1.06); } 100% { transform: scale(1); } }
@media (prefers-reduced-motion: reduce) { .ix-page .dbx-ring.done { animation: none; } }

/* ═════════ SHARED LOOK (matches admin) ═════════ */
.ix-main { background:
    #ffede5;
}
.ix-content tbody td:first-child { font-weight: 600; color: var(--ink); }
.ix-content .ix-pill { border-radius: 99px; }
.ix-content .ix-pill.active { background: linear-gradient(135deg, var(--o2), #e04a1a); color: #fff; box-shadow: 0 8px 18px rgba(232,88,42,0.3); }

/* ═════════ HOME (redesign) ═════════ */
.hv-hero { position: relative; overflow: hidden; display: flex; align-items: center; justify-content: space-between; gap: 22px;
  padding: 20px 24px; border-radius: 22px; color: #fff;
  background: linear-gradient(120deg, #f2733a 0%, #e8582a 55%, #d4401a 100%);
  box-shadow: 0 16px 34px rgba(232,88,42,.32); }
.hv-blob { position: absolute; border-radius: 50%; pointer-events: none; background: rgba(255,255,255,.12); }
.hv-blob.a { width: 220px; height: 220px; right: -60px; top: -90px; }
.hv-blob.b { width: 130px; height: 130px; right: 150px; bottom: -70px; background: rgba(255,255,255,.08); }
.hv-hero-main { position: relative; min-width: 0; flex: 1; }
.hv-hero h1 { font-size: 24px; font-weight: 800; margin: 10px 0 2px; line-height: 1.2; color: #fff; }
.hv-hero p { font-size: 13px; margin: 0 0 14px; color: rgba(255,255,255,.88); }

.hv-pill { display: inline-flex; align-items: center; gap: 7px; padding: 4px 12px; border-radius: 99px;
  font-size: 12px; font-weight: 600; background: rgba(255,255,255,.2); color: #fff; backdrop-filter: blur(4px); }
.hv-pill i { width: 8px; height: 8px; border-radius: 50%; background: var(--ix-surface, #fff); opacity: .7; }
.hv-pill.live i { background: #86efac; opacity: 1; animation: hv-pulse 1.8s ease-out infinite; }
.hv-pill.warn { background: var(--ix-surface, #fff); color: #c2410c; }
.hv-pill.warn i { background: #f59e0b; opacity: 1; }
@keyframes hv-pulse { 0% { box-shadow: 0 0 0 0 rgba(134,239,172,.7); } 100% { box-shadow: 0 0 0 8px rgba(134,239,172,0); } }

.hv-track { position: relative; height: 9px; border-radius: 99px; background: rgba(255,255,255,.28); overflow: hidden; }
.hv-track-fill { height: 100%; border-radius: 99px; background: var(--ix-surface, #fff); transition: width .6s ease; }
.hv-track i { position: absolute; top: 0; bottom: 0; width: 2px; background: rgba(232,88,42,.55); }
.hv-track-cap { display: flex; justify-content: space-between; font-size: 12px; margin-top: 6px; color: rgba(255,255,255,.85); }
.hv-track-cap b { color: #fff; }

.hv-hero-side { position: relative; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 12px; }
.hv-hero .ix-ring-center strong { color: #fff !important; opacity: 1; font-size: 20px; }
.hv-quick { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
.hv-quick button { display: inline-flex; align-items: center; gap: 5px; padding: 6px 11px; border: 0; border-radius: 99px; cursor: pointer;
  font-size: 12px; font-weight: 700; color: #c2410c; background: var(--ix-surface, #fff); transition: transform .15s, box-shadow .15s; }
.hv-quick button:hover { transform: translateY(-1px); box-shadow: 0 6px 14px rgba(0,0,0,.18); }
.hv-quick button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }

/* stats */
.hv-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.hv-stat { display: flex; align-items: center; gap: 12px; padding: 14px; border-radius: 18px; background: var(--ix-surface, #fff); border: 1px solid #f3e3da;
  box-shadow: 0 6px 16px rgba(120,60,30,.06); min-width: 0; }
.hv-stat-ic { width: 42px; height: 42px; border-radius: 13px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
.hv-stat.orange .hv-stat-ic { background: #fdeee7; color: #e8582a; }
.hv-stat.blue .hv-stat-ic { background: #e5f0ff; color: #2563eb; }
.hv-stat.green .hv-stat-ic { background: #dcf5e6; color: #16a34a; }
.hv-stat.purple .hv-stat-ic { background: #efe7ff; color: #7c3aed; }
.hv-stat-body { display: flex; flex-direction: column; min-width: 0; line-height: 1.2; }
.hv-stat-body small { font-size: 11.5px; font-weight: 600; color: #8a7468; }
.hv-stat-body strong { font-size: 20px; font-weight: 800; color: var(--ink); margin: 2px 0; font-variant-numeric: tabular-nums; }
.hv-stat-body em { font-style: normal; font-size: 11px; color: #a1857a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hv-stat-bar { display: block; height: 4px; border-radius: 99px; background: #e5f0ff; margin-top: 5px; overflow: hidden; }
.hv-stat-bar i { display: block; height: 100%; background: #2563eb; border-radius: 99px; }

.ih-stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }

/* ═════════ OTHER INTERN PAGES ═════════ */
.ix-stack { display: flex; flex-direction: column; gap: 20px; }
.ix-card.narrow { max-width: 580px; width: 100%; }
.ix-card .ix-note { margin: 0 0 18px; }

.ix-bar { position: relative; margin-top: 16px; height: 14px; border-radius: 99px; background: #fbeee7; overflow: hidden; }
.ix-bar i { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--ix-surface, #fff); opacity: .9; }
.ix-bar-marks { display: flex; justify-content: space-between; font-size: 10.5px; color: #a1857a; margin-top: 6px; }
.ix-bar-caption { font-size: 13px; color: #7a6c64; margin-top: 12px; }
.ix-bar-caption strong { color: var(--ink); }

.ix-field textarea { resize: vertical; line-height: 1.6; }
.ix-btn { padding: 13px; border: none; border-radius: 14px; cursor: pointer; color: #fff; font-size: 14px; font-weight: 700; letter-spacing: .2px; background: linear-gradient(135deg, #f2733a, #e04a1a); box-shadow: 0 12px 24px rgba(232,88,42,0.32); transition: transform .15s, box-shadow .15s; }
.ix-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 16px 30px rgba(232,88,42,0.42); }
.ix-btn:disabled { opacity: .7; cursor: default; }
.ix-btn:focus-visible { outline: 2px solid #e8582a; outline-offset: 2px; }

.ix-drop { position: relative; display: flex; align-items: center; gap: 14px; padding: 18px; border: 2px dashed #f5b79f; border-radius: 16px; background: #fffaf7; cursor: pointer; transition: all .15s; }
.ix-drop:hover { border-color: #e8582a; background: #fff5ef; }
.ix-drop.has-file { border-style: solid; border-color: #e8582a; }
.ix-field .ix-drop input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; padding: 0; border: 0; background: transparent; box-shadow: none; }
.ix-drop-icon { width: 46px; height: 46px; border-radius: 14px; background: #fdeee7; color: #e8582a; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.ix-drop-text { display: flex; flex-direction: column; font-size: 13.5px; font-weight: 600; color: #1e293b; min-width: 0; word-break: break-all; }
.ix-drop-text small { font-size: 11.5px; font-weight: 400; color: #94a3b8; margin-top: 2px; }

.ix-nfc-status { display: flex; align-items: center; gap: 16px; }
.ix-nfc-status strong { display: block; font-size: 15px; font-weight: 800; }
.ix-nfc-status span { font-size: 12.5px; color: #64748b; line-height: 1.5; }
.ix-nfc-badge { width: 56px; height: 56px; border-radius: 16px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: #f1f5f9; color: #94a3b8; }
.ix-nfc-badge.ok { background: #e6f7ee; color: #16a34a; }
.ix-req-meta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 10px; font-size: 12.5px; }
.ix-steps { list-style: none; margin: 22px 0 0; padding: 0; display: flex; }
.ix-steps li { flex: 1; position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: #94a3b8; text-align: center; }
.ix-steps li:not(:last-child)::after { content: ""; position: absolute; top: 17px; left: calc(50% + 24px); right: calc(-50% + 24px); height: 3px; border-radius: 3px; background: #f1f5f9; }
.ix-steps li.done:not(:last-child)::after { background: #e8582a; }
.ix-step-dot { width: 36px; height: 36px; border-radius: 50%; background: #f1f5f9; color: #94a3b8; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; }
.ix-steps li.done { color: #0b1220; }
.ix-steps li.done .ix-step-dot { background: linear-gradient(135deg, #f2864f, #e8582a); color: #fff; box-shadow: 0 6px 14px rgba(232,88,42,0.3); }
.ix-steps li.current { color: #e8582a; }
.ix-steps li.current .ix-step-dot { background: #fdeee7; color: #e8582a; box-shadow: 0 0 0 4px rgba(232,88,42,0.15); }
.ix-step-text { margin-top: 18px; font-size: 13px; color: #475569; text-align: center; line-height: 1.5; }

/* profile page */
.ix-profile { display: grid; grid-template-columns: 300px 1fr; gap: 20px; align-items: start; }
.ix-profile-card { text-align: center; }
.ix-profile-avatar { display: flex; justify-content: center; margin-bottom: 14px; }
.ix-profile-card h2 { font-size: 19px; font-weight: 800; }
.ix-profile-card h2 { margin-bottom: 8px; }
.ix-profile-card .ix-profile-name { color: #0b1220; opacity: 1; font-size: 20px; font-weight: 800; }
.ix-profile-sec { min-width: 0; }
.ix-profile-sec > * { margin-top: 0; }
.ix-profile-card dl { margin-top: 18px; padding-top: 16px; border-top: 1px dashed #f1ddd1; text-align: left; }
.ix-profile-card dl div { display: flex; justify-content: space-between; margin-bottom: 11px; }
.ix-profile-card dt { font-size: 12px; color: #a1857a; }
.ix-profile-card dd { font-size: 13px; font-weight: 600; color: #1e293b; }
.ix-profile-ring { display: flex; align-items: center; gap: 32px; margin-top: 20px; flex-wrap: wrap; }
.ix-profile-ring-text { display: flex; flex-direction: column; gap: 10px; font-size: 13.5px; color: #7a6c64; }
.ix-profile-ring-text strong { color: var(--ink); font-size: 18px; }
.ix-profile .ix-ring-center .dark { color: #0b1220; opacity: 1; }
.ix-profile .ix-ring-center span.dark { color: #64748b; }

/* profile card and Account Security share the same top and height */
.ix-content .ix-profile { align-items: stretch; }
.ix-content .ix-profile > .ix-profile-card { height: 100%; margin: 0; box-sizing: border-box; }
.ix-content .ix-profile-sec { display: flex; flex-direction: column; min-width: 0; }
.ix-content .ix-profile-sec > * { margin: 0; flex: 1; }

/* form on the left, "my submissions" table on the right */
.intern-split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; align-items: start; }
.intern-split > * { min-width: 0; margin: 0; }
.intern-split .ix-table-wrap { overflow-x: auto; }
/* Submit Online: "My Online Submissions" is exactly as tall as the form beside it;
   a long list scrolls inside the card instead of stretching the page */
.online-split { align-items: stretch; }
.online-split > .os-card { height: 0; min-height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.online-split > .os-card > .ix-table-wrap { flex: 1; overflow-y: auto; }
.online-split > .os-card > .ix-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.intern-task { max-width: 280px; white-space: normal; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.intern-task { color: #3b2f29; font-size: 13px; }
.intern-task small { display: block; margin-top: 3px; font-size: 11.5px; color: #6b5a50; }

/* MOV "Others": narrow form, wide documents card (no sideways scroll) */
.mov-split { grid-template-columns: minmax(260px, 340px) minmax(0, 1fr); align-items: stretch; }
/* "Others" form and "Other documents" list: same height, the list's empty state centered in the card */
.mov-split > .ix-card, .mov-split > .os-card { height: 100%; }
.mov-split > .os-card { display: flex; flex-direction: column; }
.mov-split > .os-card > .ix-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.mov-split .os-card th, .mov-split .os-card td { white-space: normal; }
.mov-split .os-card .ix-table-wrap { overflow-x: visible; }
.mov-doc { display: flex; flex-direction: column; gap: 2px; min-width: 0; max-width: 230px; }
.mov-doc .ix-link { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; }
.mov-doc .os-date { white-space: normal; overflow-wrap: anywhere; }
@media (max-width: 1100px) { .mov-split { grid-template-columns: 1fr; } }

/* NFC card: compact single column, fits the screen */
.nfc-page { display: flex; flex-direction: column; gap: 10px; max-width: 720px; }
.nfc-page > * { margin: 0; }
.nfc-page .ix-card { padding: 12px 16px; }

.nfc-hero { display: flex; align-items: center; gap: 14px; padding: 10px 16px; border-radius: 18px; background: var(--ix-surface, #fff); }
.nfc-plastic { position: relative; flex-shrink: 0; width: 112px; height: 70px; border-radius: 10px; padding: 8px 10px;
  display: flex; flex-direction: column; justify-content: space-between; color: #94a3b8;
  background: repeating-linear-gradient(45deg, #f1f5f9, #f1f5f9 6px, #e8eef5 6px, #e8eef5 12px); border: 2px dashed #cbd5e1; }
.nfc-hero.linked .nfc-plastic { color: #fff; border: 0; box-shadow: 0 8px 16px rgba(232,88,42,.3);
  background: linear-gradient(135deg, #f2733a, #d4401a); }
.nfc-plastic > svg { position: absolute; top: 8px; right: 10px; width: 16px; height: 16px; }
.nfc-plastic b { font-size: 10px; letter-spacing: 1px; font-variant-numeric: tabular-nums; }
.nfc-chip { width: 20px; height: 15px; border-radius: 4px; background: rgba(255,255,255,.55); border: 1px solid rgba(0,0,0,.08); }
.nfc-hero-text { min-width: 0; }
.nfc-hero-text h3 { margin: 4px 0 2px; font-size: 14px; font-weight: 800; color: #1e293b; }
.nfc-hero-text p { margin: 0; font-size: 12px; color: #6b5a50; line-height: 1.4; }
.nfc-state { display: inline-block; padding: 2px 9px; border-radius: 99px; font-size: 11px; font-weight: 700; background: #f1f5f9; color: #64748b; }
.nfc-state.ok { background: #dcf5e6; color: #146c3a; }
.nfc-state.warn { background: #fef3c7; color: #92400e; }
.nfc-hero.waiting .nfc-plastic { filter: grayscale(.85); opacity: .75; box-shadow: none; }
.nfc-go { margin-top: 8px; }

.nfc-req-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.nfc-req-head .ix-req-meta { margin-top: 0; }
.nfc-page .ix-steps { margin-top: 10px; }
.nfc-page .ix-steps li { gap: 4px; font-size: 11.5px; }
.nfc-page .ix-step-dot { width: 28px; height: 28px; font-size: 12.5px; }
.nfc-page .ix-steps li:not(:last-child)::after { top: 13px; left: calc(50% + 18px); right: calc(-50% + 18px); }
.nfc-page .ix-step-text { margin-top: 8px; font-size: 12px; }
.nfc-page .ix-form { gap: 8px; }
.nfc-form-row { display: grid; grid-template-columns: minmax(0, 200px) minmax(0, 1fr); gap: 12px; align-items: start; }
.nfc-foot { display: flex; align-items: center; gap: 12px; }
.nfc-foot .ix-note { flex: 1; margin: 0; padding: 6px 10px; font-size: 11.5px; }
.nfc-foot .ix-btn { padding: 10px 18px; white-space: nowrap; }
.nfc-wait { margin: 0; padding: 8px 12px; font-size: 12px; }
.nfc-foot:not(:has(.ix-note)) { justify-content: flex-end; }
.nfc-claim-warn { display: flex; align-items: center; gap: 10px; margin-top: 12px; padding: 10px 12px; border-radius: 10px; background: #fffbeb; border: 1px solid #fde68a; color: #92400e; font-size: 12.5px; line-height: 1.45; }
.nfc-claim-warn svg { flex-shrink: 0; }
.nfc-claim-warn span { flex: 1; }
.nfc-claim-warn .ix-b { flex-shrink: 0; }
.ix-content .ix-card.nfc-replace { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding: 16px 20px !important; }
.nfc-replace > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.nfc-replace strong { font-size: 14px; }
.nfc-replace span { font-size: 12.5px; color: #64748b; }

@media (max-width: 640px) {
  .nfc-hero { flex-direction: column; align-items: flex-start; }
  .nfc-form-row { grid-template-columns: 1fr; }
  .nfc-foot { flex-direction: column; align-items: stretch; }
}


/* my online submissions */
.os-card { background: var(--ix-surface, #fff); padding: 18px 20px; }
.os-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.os-title { display: inline-flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 800; color: #1e293b; }
.os-title svg { color: #e8582a; }
.os-count { min-width: 26px; text-align: center; padding: 2px 9px; border-radius: 99px; font-size: 12px; font-weight: 700;
  background: #fdeee7; color: #c2410c; }
.os-card th { color: #6b5a50; font-weight: 700; }
.os-card td { color: #3b2f29; }
.os-date { font-weight: 600; color: #1e293b; white-space: nowrap; }
.os-status { display: inline-block; padding: 4px 12px; border-radius: 99px; font-size: 12px; font-weight: 700; white-space: nowrap; }
.os-status.pending { background: #fff1d6; color: #9a5b00; }
.os-status.approved { background: #dcf5e6; color: #146c3a; }
.os-status.rejected { background: #fde2e2; color: #b42318; }

/* ═════════ MY ATTENDANCE ═════════ */
.at-stack { display: flex; flex-direction: column; gap: 16px; }
.ix-page .wm-strip ~ .ibx .mon-split.ibx-split { height: calc(100vh / var(--fit, 1) - 270px); min-height: 380px; }
@media (max-width: 900px) { .ix-page .wm-strip ~ .ibx .mon-split.ibx-split { height: auto; min-height: 0; } }
/* Submit MOV (list + details) */
.ix-page .mv-prog { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; font-size: 12.5px; }
.ix-page .mv-prog b { white-space: nowrap; } .ix-page .mv-prog small { color: #8a7a71; white-space: nowrap; }
.ix-page .mv-bar { flex: 1; max-width: 320px; height: 7px; border-radius: 99px; background: #fbe7dd; overflow: hidden; }
.ix-page .mv-bar i { display: block; height: 100%; background: linear-gradient(90deg, #f2864f, #e8582a); border-radius: 99px; }
.ix-page .ibx-ic.waiting { background: #fef3c7; color: #b45309; }
.ix-page .mv-drop { position: relative; display: flex; align-items: center; gap: 12px; padding: 18px; border: 1.5px dashed #f5b79f; border-radius: 12px; background: #fffaf7; cursor: pointer; }
.ix-page .mv-drop:hover { background: #fff3ec; border-color: #e8582a; }
.ix-page .mv-drop.busy { opacity: .6; pointer-events: none; }
.ix-page .mv-choose { margin-left: auto; flex: none; pointer-events: none; white-space: nowrap; }
.ix-page .mv-drop input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.ix-page .mv-hist { list-style: none; margin: 0; padding: 0; }
.ix-page .mv-hist li { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid #f4f1ee; font-size: 12.5px; }
.ix-page .mv-hist li:last-child { border-bottom: 0; }
.ix-page .mv-hist-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.ix-page .mv-hist-main a { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ix-page .mv-hist-main small { font-size: 11px; color: #8a7a71; }
.ix-page .mv-upform { display: flex; flex-direction: column; gap: 10px; }
.ix-page .mv-upform .ix-b { align-self: flex-end; }
/* progress split by color, with a legend: green approved, amber waiting, red needs fix, gray to upload */
.ix-page .mv-prog2 { display: flex; align-items: center; gap: 14px; margin: 2px 0 14px; flex-wrap: wrap; }
.ix-page .mv-prog2 > b { font-size: 13px; font-weight: 700; color: #111827; white-space: nowrap; }
.ix-page .mv-bar2 { flex: 1; min-width: 160px; height: 8px; border-radius: 99px; background: #eef0f3; display: flex; overflow: hidden; }
.ix-page .mv-bar2 i { display: block; height: 100%; transition: width .4s ease; }
.ix-page :is(.mv-bar2, .mv-legend) i.approved { background: #22c55e; } .ix-page :is(.mv-bar2, .mv-legend) i.pending { background: #f59e0b; }
.ix-page :is(.mv-bar2, .mv-legend) i.rejected { background: #ef4444; } .ix-page .mv-legend i.none { background: #d1d5db; }
.ix-page .mv-legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: #6b7280; }
.ix-page .mv-legend > span { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.ix-page .mv-legend i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.ix-page .mv-legend b { color: #111827; font-weight: 700; }
/* each row and its icon use the same colors as the legend, so interns can match them at a glance */
.ix-page .mv-row { box-shadow: inset 3px 0 0 #d1d5db; }
.ix-page .mv-row.s-approved { box-shadow: inset 3px 0 0 #22c55e; } .ix-page .mv-row.s-pending { box-shadow: inset 3px 0 0 #f59e0b; }
.ix-page .mv-row.s-rejected { box-shadow: inset 3px 0 0 #ef4444; }
.ix-page .mv-ic.s-none, .ix-page .mv-ic.s-todo { background: #f3f4f6 !important; color: #6b7280 !important; }
.ix-page .g-other .mv-row { box-shadow: none; }
.ix-page .mv-chip { box-shadow: inset 0 0 0 1px #bbf7d0; }
/* the "Other documents" file box: a tidy row, the real file input hidden over it */
.ix-page .mv-upform .ix-drop { position: relative; display: flex !important; flex-direction: row !important; align-items: center; gap: 12px; min-height: 0 !important; height: auto !important;
  padding: 14px 16px !important; border: 1.5px dashed #f0c9b5; border-radius: 12px; background: #fffaf7; cursor: pointer; box-sizing: border-box; }
.ix-page .mv-upform .ix-drop:hover, .ix-page .mv-upform .ix-drop.has-file { border-color: #e8582a; background: #fff3ec; }
.ix-page .mv-upform .ix-drop input[type="file"] { position: absolute !important; inset: 0; width: 100% !important; height: 100% !important; opacity: 0; cursor: pointer; margin: 0; padding: 0; }
.ix-page .mv-upform .ix-drop-icon { width: 40px; height: 40px; flex-shrink: 0; border-radius: 12px; display: grid; place-items: center; }
.ix-page .mv-upform .ix-drop-text { flex: 1; min-width: 0; display: flex !important; flex-direction: column; writing-mode: horizontal-tb; font-size: 13px; font-weight: 600; color: #1e293b;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ix-page .mv-upform .ix-drop-text small { font-size: 11.5px; font-weight: 400; color: #94a3b8; }
.ix-page .mv-upform .ix-input { height: 40px; }
.ix-page .ibx-ic.big { width: 48px; height: 48px; border-radius: 14px; }
.ix-page .rq-steps-lg { transform: none; margin-top: 4px; }
.ix-page .rq-steps-lg li span { font-size: 12.5px !important; }
/* My Attendance (dense): summary strip, filters, compact day rows */
.ix-page .at-sum { display: grid; grid-template-columns: minmax(280px, 2fr) repeat(3, minmax(110px, 1fr)); background: var(--ix-surface, #fff); border: 1px solid #eceef1; border-radius: 14px; overflow: hidden; }
.ix-page .at-sum > * { padding: 12px 16px; min-width: 0; }
.ix-page .at-sum > * + * { border-left: 1px solid #f1ece9; }
.ix-page .at-sum-top { display: flex; justify-content: space-between; align-items: baseline; font-size: 12.5px; color: #64748b; }
.ix-page .at-sum-top b { font-size: 18px; color: #111827; } .ix-page .at-sum-top strong { color: #e8582a; font-size: 14px; }
.ix-page .at-sum-bar { position: relative; height: 8px; border-radius: 99px; background: #fbe7dd; margin: 7px 0 5px; overflow: hidden; }
.ix-page .at-sum-bar i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 99px; background: linear-gradient(90deg, #f2864f, #e8582a); }
.ix-page .at-sum-bar em { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--ix-surface, #fff); }
.ix-page .at-sum-prog small { font-size: 11.5px; color: #8a7a71; }
/* the 25 / 50 / 75 / 100% marks on the progress bar */
.ix-page .at-ms { position: relative; margin: 10px 14px 26px 0; }
.ix-page .at-ms .at-sum-bar { margin: 0; overflow: visible; }
.ix-page .at-ms-pt { position: absolute; top: 4px; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 3px; }
.ix-page .at-ms-pt i { width: 16px; height: 16px; border-radius: 50%; background: #fff; border: 2px solid #f3c7b2; box-sizing: border-box;
  display: grid; place-items: center; font-style: normal; font-size: 9px; font-weight: 800; color: #fff; line-height: 1; }
.ix-page .at-ms-pt b { position: absolute; top: 19px; font-size: 10.5px; font-weight: 600; color: #a99d96; white-space: nowrap; line-height: 1.2; }
.ix-page .at-ms-pt.done i { background: #e8582a; border-color: #e8582a; }
.ix-page .at-ms-pt.done b { color: #c2410c; }
.ix-page .at-ms-pt.next i { border-color: #e8582a; box-shadow: 0 0 0 3px rgba(232,88,42,.18); }
.ix-page .at-ms-pt.next b { color: #111827; }
.ix-page .at-sum-num { display: flex; flex-direction: column; justify-content: center; }
.ix-page .at-sum-num small { font-size: 11px; color: #8a7a71; } .ix-page .at-sum-num b { font-size: 18px; color: #111827; line-height: 1.2; }
.ix-page .at-sum-num em { font-style: normal; font-size: 11px; color: #a99d96; }
.ix-page .at-sum-num.red:not(.ok) b { color: #dc2626; }
.ix-page .at-bar { margin: 0; }
.ix-page .at-bar .at-month { height: 30px; font-size: 12px; padding: 0 28px 0 10px; width: auto; }
.ix-page .at-scale-note { margin-left: auto; font-size: 11px; color: #a99d96; }
.ix-page .at-log2 { display: flex; flex-direction: column; gap: 12px; }
.ix-page .at-grp-h { display: flex; align-items: baseline; gap: 10px; margin: 0 2px 6px; }
.ix-page .at-grp-h span { font-size: 11px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: #c2410c; }
.ix-page .at-grp-h small { font-size: 11px; color: #a99d96; }
.ix-page .at-rows { list-style: none; margin: 0; padding: 0; background: var(--ix-surface, #fff); border: 1px solid #eceef1; border-radius: 12px; overflow: hidden; }
.ix-page .at-rows li { display: grid; grid-template-columns: 38px 66px 210px minmax(120px, 1fr) 150px; align-items: center; gap: 12px; padding: 6px 14px; border-bottom: 1px solid #f4f1ee; font-size: 12.5px; }
.ix-page .at-rows li:last-child { border-bottom: 0; }
.ix-page .at-rows li:hover { background: #fffaf7; }
.ix-page .at-dd { width: 34px; height: 34px; border-radius: 9px; background: #fff1ea; color: #c2410c; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1; }
.ix-page .at-dd b { font-size: 13px; } .ix-page .at-dd small { font-size: 9px; font-weight: 700; text-transform: uppercase; }
.ix-page .at-io { display: flex; align-items: center; gap: 6px; white-space: nowrap; color: #334155; }
.ix-page .at-io > i { font-style: normal; color: #c9b8ae; }
.ix-page .at-io .at-fix { display: inline-flex; align-items: center; gap: 6px; }
.ix-page .at-line { position: relative; height: 10px; border-radius: 99px; background: repeating-linear-gradient(90deg, #f3ede9 0 calc(25% - 1px), #e9e2dd calc(25% - 1px) 25%); }
.ix-page .at-line i { position: absolute; top: 0; bottom: 0; border-radius: 99px; background: linear-gradient(90deg, #f2864f, #e8582a); }
.ix-page .at-line i.open { background: linear-gradient(90deg, #4ade80, #16a34a); }
.ix-page .at-h { display: flex; flex-direction: column; align-items: flex-end; text-align: right; }
.ix-page .at-h b { font-size: 12.5px; } .ix-page .at-h small { font-size: 10.5px; }
@media (max-width: 900px) {
  .ix-page .at-sum { grid-template-columns: repeat(3, 1fr); }
  .ix-page .at-sum-prog { grid-column: 1 / -1; border-bottom: 1px solid #f1ece9; }
  .ix-page .at-sum > :nth-child(2) { border-left: 0; }
  .ix-page .at-scale-note { display: none; }
  .ix-page .at-rows li { grid-template-columns: 38px 1fr auto; row-gap: 4px; }
  .ix-page .at-rows li > .ix-badge, .ix-page .at-rows li > [class*="badge"] { display: none; }
  .ix-page .at-dd { grid-column: 1; grid-row: 1 / 3; }
  .ix-page .at-io { grid-column: 2; grid-row: 1; }
  .ix-page .at-h { grid-column: 3; grid-row: 1; }
  .ix-page .at-line { grid-column: 2 / -1; grid-row: 2; }
}
.at-stack > * { margin-top: 0; margin-bottom: 0; }

.at-log-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.at-log-head .ix-pills { margin: 0; }
.at-log-head .ix-pills { display: flex; gap: 8px; flex-wrap: wrap; }
.ix-content .at-log-head .ix-pill { background: var(--ix-surface, #fff); color: #4b3b33; border: 1px solid #f0d9cc; border-radius: 99px;
  padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: none; }
.ix-content .at-log-head .ix-pill:hover { border-color: #e8582a; color: #d94a1c; }
.ix-content .at-log-head .ix-pill.active { background: linear-gradient(135deg, #f2733a, #e04a1a); color: #fff;
  border-color: transparent; box-shadow: 0 8px 18px rgba(232,88,42,0.3); }
.at-month { padding: 8px 34px 8px 14px; border: 1px solid #f0d9cc; border-radius: 99px; background-color: var(--ix-surface, #fff); color: #4b3b33;
  font-size: 13px; font-weight: 600; cursor: pointer; }
.at-month:focus-visible { outline: 2px solid #e8582a; outline-offset: 2px; }
.at-count { display: inline-block; min-width: 20px; margin-left: 6px; padding: 1px 7px; border-radius: 99px;
  font-size: 11px; font-weight: 700; background: rgba(232,88,42,.12); color: #d94a1c; }
.ix-content .at-log-head .ix-pill.active .at-count { background: rgba(255,255,255,.25); color: #fff; }

.at-date { display: flex; flex-direction: column; line-height: 1.25; }
.at-date small { font-size: 11.5px; font-weight: 500; color: #a1857a; }
.at-hrs { font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; }

@media (prefers-reduced-motion: reduce) { .at-col-track i { transition: none; } }

/* ═════════ RESPONSIVE ═════════ */
@media (max-width: 1100px) {
  .intern-split { grid-template-columns: 1fr; }
  .online-split > .os-card { height: auto; min-height: 0; overflow: visible; }
  .ih-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .hv-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 1000px) {
  .ix-profile { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .hv-hero { flex-direction: column; align-items: flex-start; }
  .hv-hero-side { flex-direction: row; align-items: center; }
}
@media (prefers-reduced-motion: reduce) {
  .hv-pill.live i { animation: none; }
  .hv-track-fill { transition: none; }
}

.req-tabs { display: inline-flex; gap: 4px; padding: 4px; background: #fff3ec; border-radius: 14px; margin-bottom: 16px; }
.req-tabs button { display: inline-flex; align-items: center; gap: 6px; padding: 9px 18px; border: 0; border-radius: 11px; background: transparent; color: #7c5c4c; font-weight: 700; font-size: 13.5px; cursor: pointer; }
.req-tabs button.on { background: var(--ix-surface, #fff); color: #d94a1c; box-shadow: 0 4px 12px rgba(232,88,42,.15); }
.req-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
.req-sub { display: block; color: #8a7468; font-size: 12px; margin-top: 2px; }
.req-list { list-style: none; margin: 10px 0 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.req-item { display: flex; flex-wrap: nowrap; align-items: center; gap: 8px; padding: 6px 10px;
  border: 1px solid #f3e3da; border-radius: 10px; background: #fffdfb; min-height: 0; }
.req-item .req-main { flex: 1 1 auto; min-width: 0; gap: 0; }
.req-item .req-main strong { font-size: 12.5px; line-height: 1.25; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.req-item .req-main small { font-size: 11px; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.req-item .req-file { font-size: 11px; line-height: 1.25; }
.req-item > :nth-child(2) { zoom: .85; flex-shrink: 0; }
.req-item .req-up { flex-shrink: 0; margin-left: 0; padding: 4px 9px; font-size: 11.5px; gap: 4px; }
.req-item .req-spacer { display: none; }
.req-item .ix-link, .os-card .ix-link { color: #c2410c; font-weight: 600; }
.req-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.os-remarks { color: #6b5a50; font-size: 12.5px; }
@media (max-width: 760px) { .req-list { grid-template-columns: 1fr; } }
.req-main small { color: #8a7468; font-size: 12px; }
.req-file { font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.req-reject { color: #dc2626 !important; }
.req-up { position: relative; overflow: hidden; cursor: pointer; white-space: nowrap; }
.req-up input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; }
.req-spacer { width: 96px; }
.req-locked { text-align: center; padding: 28px 12px; max-width: 460px; margin: 0 auto; }
.req-locked h3 { margin: 10px 0 6px; font-size: 17px; }
.req-locked p { color: #6b5a50; font-size: 13.5px; line-height: 1.55; margin: 0 0 14px; }
.req-lock-icon { display: inline-flex; width: 60px; height: 60px; align-items: center; justify-content: center; border-radius: 50%; background: #fff3ec; color: #e04a1a; }
.dtr-filters { display: flex; gap: 8px; flex-wrap: wrap; }
.dtr-sel { padding: 9px 32px 9px 14px; border: 1px solid #f0d9cc; border-radius: 99px; background-color: var(--ix-surface, #fff); color: #4b3b33;
  font-size: 13px; font-weight: 600; cursor: pointer; }
.dtr-sel:focus-visible { outline: 2px solid #e8582a; outline-offset: 2px; }
.req-dtr-meta { display: flex; gap: 18px; flex-wrap: wrap; color: #6b5a50; font-size: 13px; margin: 6px 0 12px; }
@media (max-width: 640px) { .req-spacer { display: none; } }

/* ═════════ MY ATTENDANCE (redesign) ═════════ */
.hv-stat.red .hv-stat-ic { background: #fde2e2; color: #dc2626; }
.hv-stat.red.ok .hv-stat-ic { background: #dcf5e6; color: #16a34a; }
.at-marks { display: flex; justify-content: space-between; font-size: 10.5px; margin-top: 6px; color: rgba(255,255,255,.8); }
.at-mid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 14px; align-items: stretch; }
.at-mid .hv-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); align-content: stretch; }
.at-chart { display: flex; flex-direction: column; padding: 14px 16px; border-radius: 18px; background: var(--ix-surface, #fff); border: 1px solid #f3e3da;
  box-shadow: 0 6px 16px rgba(120,60,30,.06); min-width: 0; }
.at-chart-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.at-chart-head strong { font-size: 14px; font-weight: 800; color: var(--ink); }
.at-legend { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: #8a7468; }
.at-legend i { width: 9px; height: 9px; border-radius: 3px; display: inline-block; }
.at-legend i.on { background: #e8582a; }
.at-legend i.off { background: #2563eb; margin-left: 6px; }
.at-chart-empty { flex: 1; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 12.5px; color: #a1857a; padding: 10px; }
.at-bars { flex: 1; display: flex; align-items: stretch; gap: 6px; min-height: 120px; }
.at-col { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.at-col-val { font-size: 10.5px; font-weight: 700; color: #6b5a50; font-variant-numeric: tabular-nums; }
.at-col-track { flex: 1; width: 100%; max-width: 26px; display: flex; align-items: flex-end; border-radius: 8px; background: #fdf1ea; overflow: hidden; }
.at-col-track i { display: block; width: 100%; border-radius: 8px; background: linear-gradient(180deg, #f2864f, #e8582a); transition: height .5s ease; }
.at-col-track i.online { background: linear-gradient(180deg, #5b9bff, #2563eb); }
.at-col small { font-size: 10.5px; color: #a1857a; }

.at-log { border-radius: 18px; overflow: hidden; }
.at-hrs { display: flex; flex-direction: column; gap: 4px; min-width: 90px; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; }
.at-hrs-bar { display: block; height: 4px; border-radius: 99px; background: #fdeee7; overflow: hidden; }
.at-hrs-bar i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #f2864f, #e8582a); }
.at-ot { font-size: 11px; font-weight: 600; color: #9a5b00; }
.at-fix { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.at-fix-btn { padding: 3px 10px; border-radius: 99px; border: 1px solid #f0d9cc; background: var(--ix-surface, #fff); color: #c2410c;
  font-size: 11.5px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.at-fix-btn:hover { border-color: #e8582a; background: #fff3ec; }
.at-fix-btn:focus-visible { outline: 2px solid #e8582a; outline-offset: 2px; }
.at-fix-btn.sm { padding: 1px 8px; font-size: 11px; }
/* "Fix time in" shows when the row is hovered (always on touch screens) */
@media (hover: hover) { .at-rows li .at-fix-in { opacity: 0; transition: opacity .15s; }
  .at-rows li:hover .at-fix-in, .at-rows li:focus-within .at-fix-in { opacity: 1; } }
.fx-kinds { display: grid; gap: 8px; }
/* Request a time correction: everything fits on one screen (the two choices side by side, time + proof on one row) */
.ix-modal.wide:has(.fx-compact) { max-width: 640px; }
.fx-compact .fx-kinds { grid-template-columns: 1fr 1fr; }
.fx-compact .fx-two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; align-items: start; }
.fx-compact .fx-two input[type="time"] { width: 100%; box-sizing: border-box; }
.fx-compact > .fx-hint { line-height: 1.45; margin-top: -4px; }
.fx-compact .fx-two .ix-field input[type="time"], .fx-compact .so-file { height: 44px; min-height: 44px; }
.fx-kind { display: grid; grid-template-columns: auto 1fr; column-gap: 10px; align-items: center; padding: 10px 12px;
  border: 1px solid #ece4df; border-radius: 12px; cursor: pointer; background: var(--ix-surface, #fff); }
.fx-kind input { grid-row: span 2; accent-color: #e8582a; margin: 0; }
.fx-kind b { font-size: 13.5px; color: #111827; }
.fx-kind small { font-size: 12px; color: #6b7280; line-height: 1.4; }
.fx-kind.on { border-color: #e8582a; background: #fff7f2; }
.fx-hint { display: block; margin-top: 4px; font-size: 12px; color: #6b7280; }
.fx-two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
/* "Missed a whole day?" (the pill) on the right; the bars note sits under it */
/* one even row: chips, month and the button all 34px tall; the bars note hangs under the button
   (on the same line as the month heading) so it doesn't make the row taller */
.ix-page .at-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; position: relative; margin: 0 !important; }
.ix-page .at-bar :is(.mon-chip, .at-month, .at-day-btn) { height: 34px !important; min-height: 34px !important; box-sizing: border-box; display: inline-flex; align-items: center; margin: 0 !important; }
.ix-page .at-bar .at-month { padding-top: 0 !important; padding-bottom: 0 !important; }
.ix-page .at-bar .mon-sep { align-self: center; height: 20px; margin: 0 4px !important; }
.ix-page .at-bar .at-day-box { margin-left: auto; }
/* the bars note sits at the right end of the first month heading, right under the button */
.ix-page .at-grp-h .at-scale-note { margin-left: auto; font-style: normal; font-size: 11px; color: #a99d96; white-space: nowrap; }
.ix-page .at-bar .at-day-btn { padding: 0 14px !important; font-size: 12.5px; line-height: 1; white-space: nowrap; }
.ix-page .at-bar { margin: 4px 0 6px !important; }
/* the description line sits as close to the summary as the other gaps on this page */
.ix-page.lay2 .ix-content .at-stack > .ix-ph.ix-ph.ix-ph { margin-bottom: 4px !important; }
/* every attendance row the same height: badges and buttons stay on one line, OT sits beside the hours */
@media (min-width: 901px) {
  .ix-page .at-rows li { grid-template-columns: 38px 66px 300px minmax(120px, 1fr) 230px; height: 52px; padding: 0 14px; box-sizing: border-box; }
  .ix-page .at-io, .ix-page .at-io .at-fix { flex-wrap: nowrap; }
  .ix-page .at-io :is(.ix-badge, [class*="badge"]) { padding: 3px 8px !important; font-size: 11px !important; line-height: 1.3 !important; white-space: nowrap; }
  .ix-page .at-io .at-fix-btn { padding: 3px 10px !important; font-size: 11px; line-height: 1.3; }
  .ix-page .at-h { flex-direction: row-reverse; align-items: baseline; justify-content: flex-start; gap: 10px; white-space: nowrap; }
}
.ix-page .at-day-wait { display: flex; align-items: center; gap: 8px; margin: -4px 0 10px; padding: 8px 12px; border-radius: 10px;
  background: #fff7ed; border: 1px solid #fde4cc; color: #9a3412; font-size: 12.5px; }
/* Home: "No time out" / "Forgot to time in?" reminder inside the Today card */
.ix-page .ix-content .dbx-fix { margin-top: 10px; display: grid; gap: 6px; }
.ix-page .ix-content .dbx-fix-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px;
  border: 1px solid #fde2cf; background: #fff7f1; border-radius: 10px; }
.ix-page .ix-content .dbx-fix-ic { width: 26px; height: 26px; flex: none; border-radius: 8px; display: grid; place-items: center;
  color: #fff; background: linear-gradient(135deg, #f97316, #e8582a); }
.ix-page .ix-content .dbx-fix-tx { flex: 1; min-width: 0; }
.ix-page .ix-content .dbx-fix-tx b { display: block; font-size: 12.5px; color: #9a3412; }
.ix-page .ix-content .dbx-fix-tx small { display: block; font-size: 11.5px; line-height: 1.35; color: #7c6a60; }
.ix-page .ix-content .dbx-fix-row .ix-b { flex: none; white-space: nowrap; }
.ix-page .ix-content .dbx-fix-more { justify-self: start; border: 0; background: none; padding: 0; font: inherit;
  font-size: 12px; font-weight: 600; color: #c2410c; cursor: pointer; }
.ix-page .ix-content .dbx-fix-more:hover { text-decoration: underline; }
.at-ot.approved { color: #146c3a; }
.at-ot.rejected { color: #b42318; }


@media (max-width: 900px) { .at-mid { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .at-col-track i { transition: none; } }

/* remove (pending only) */
.rm-btn { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; border: 1px solid #f6c9c9; border-radius: 99px; cursor: pointer;
  background: #fff5f5; color: #b42318; font-size: 12px; font-weight: 700; white-space: nowrap; transition: background .15s, border-color .15s; }
.rm-btn:hover { background: #fde2e2; border-color: #f0a8a8; }
.rm-confirm { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.rm-yes, .rm-no { padding: 5px 10px; border-radius: 99px; font-size: 12px; font-weight: 700; cursor: pointer; border: 1px solid transparent; }
.rm-yes { background: #dc2626; color: #fff; }
.rm-yes:disabled, .rm-no:disabled { opacity: .6; cursor: default; }
.rm-no { background: var(--ix-surface, #fff); color: #4b3b33; border-color: #f0d9cc; }
.rm-btn:focus-visible, .rm-yes:focus-visible, .rm-no:focus-visible { outline: 2px solid #e8582a; outline-offset: 2px; }
.req-item .rm-btn, .req-item .rm-yes, .req-item .rm-no { padding: 3px 8px; font-size: 11px; flex-shrink: 0; }
.req-item .rm-confirm { flex-shrink: 0; }


/* Excused school events */
.at-excused { display: flex; gap: 10px; align-items: flex-start; padding: 10px 14px; border-radius: 12px;
  background: color-mix(in srgb, #6366f1 9%, var(--card, #fff)); border: 1px solid color-mix(in srgb, #6366f1 28%, transparent); font-size: 13px; }
.at-excused > svg { margin-top: 2px; color: #6366f1; flex: none; }
.at-excused div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.at-excused span { white-space: pre-wrap; }
.at-excused small { opacity: .7; }
.ix-check { display: flex; align-items: center; gap: 8px; font-size: 13.5px; cursor: pointer; }
.ix-check input { width: 16px; height: 16px; }

/* My Requests */
.ix-page .rq-bar { margin-bottom: 12px !important; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.ix-page .rq-bar .rq-type { height: 34px; }
.ix-page .rq-cols { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 14px; align-items: start; }
.ix-page .ix-card.rq-table { padding: 0 !important; overflow: hidden; margin: 0 !important; }
.ix-page .rq-table table { width: 100%; border-collapse: collapse; }
.ix-page .rq-table th { padding: 10px 16px; text-align: left; font-size: 10.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: #8b919b; background: #fafafb; border-bottom: 1px solid #eef0f3; white-space: nowrap; }
.ix-page .rq-table td { padding: 12px 16px; border-bottom: 1px solid #f1f2f4; vertical-align: middle; font-size: 12.5px; }
.ix-page .rq-table tbody tr { cursor: pointer; transition: background .15s; }
.ix-page .rq-table tbody tr:hover, .ix-page .rq-table tbody tr:focus-visible { background: #fffaf7; outline: none; }
.ix-page .rq-table tbody tr:last-child td { border-bottom: 0; }
.ix-page .rq-table tr.g-rejected > td:first-child { box-shadow: inset 3px 0 0 #ef4444; } .ix-page .rq-table tr.g-waiting > td:first-child { box-shadow: inset 3px 0 0 #f59e0b; } .ix-page .rq-table tr.g-approved > td:first-child { box-shadow: inset 3px 0 0 #22c55e; }
.ix-page .rq-table .rq-what { max-width: none; min-width: 0; }
.ix-page .rq-ic.approved { background: #ecfdf3; color: #16a34a; } .ix-page .rq-ic.rejected { background: #fef2f2; color: #dc2626; } .ix-page .rq-ic.waiting { background: #fff7ed; color: #d97706; }
.ix-page .rq-rem { font-style: normal; font-size: 11.5px; color: #b91c1c; margin-top: 2px; }
.ix-page .rq-date { white-space: nowrap; color: #6b7280; }
.ix-page .rq-st { white-space: nowrap; }
.ix-page .rq-trk { list-style: none; margin: 0; padding: 0; display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.ix-page .rq-trk li { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: #9ca3af; font-weight: 500; }
.ix-page .rq-trk li + li::before { content: ""; width: 18px; height: 2px; border-radius: 2px; background: #e5e7eb; margin-right: 1px; }
.ix-page .rq-trk li.done + li::before { background: #22c55e; }
.ix-page .rq-trk i { width: 9px; height: 9px; border-radius: 50%; background: #e5e7eb; display: inline-block; }
.ix-page .rq-trk li.done { color: #15803d; } .ix-page .rq-trk li.done i { background: #22c55e; }
.ix-page .rq-trk li.now { color: #c2410c; } .ix-page .rq-trk li.now i { background: #f59e0b; box-shadow: 0 0 0 3px #fde7c3; }
.ix-page .rq-trk li.fail { color: #b91c1c; } .ix-page .rq-trk li.fail i { background: #ef4444; }
.ix-page .rq-empty { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 48px 16px; text-align: center; color: #9ca3af; }
.ix-page .rq-empty b { color: #374151; font-size: 13.5px; } .ix-page .rq-empty small { font-size: 12px; max-width: 360px; }
.ix-page .rq-side { display: flex; flex-direction: column; gap: 12px; }
.ix-page .ix-card.rq-box { padding: 14px 16px !important; margin: 0 !important; }
.ix-page .rq-box > b { display: block; font-size: 13.5px; font-weight: 600; color: #111827; margin-bottom: 10px; }
.ix-page .rq-nums { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; }
.ix-page .rq-nums small { display: block; font-size: 11.5px; color: #6b7280; }
.ix-page .rq-nums strong { font-size: 20px; font-weight: 700; color: #111827; }
.ix-page .rq-nums .w { color: #c2410c; } .ix-page .rq-nums .a { color: #15803d; } .ix-page .rq-nums .r { color: #b91c1c; }
.ix-page .rq-new { display: grid; gap: 6px; }
.ix-page .rq-new button { display: flex; align-items: center; gap: 10px; width: 100%; height: auto !important; min-height: 40px; padding: 8px 10px !important; border: 1px solid #eef0f3; border-radius: 10px;
  background: #fff; text-align: left; font: inherit; font-size: 12.5px; font-weight: 500; color: #374151; cursor: pointer; transition: border-color .15s, background .15s; }
.ix-page .rq-new button:hover { border-color: #f6c9b3; background: #fff7f2; color: #c2410c; }
.ix-page .rq-new button > svg { color: #e8582a; flex-shrink: 0; }
.ix-page .rq-new button span { display: flex; flex-direction: column; }
.ix-page .rq-new button small { font-size: 11px; color: #9ca3af; font-weight: 400; }
.ix-page .rq-how2 { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.ix-page .rq-how2 li { position: relative; display: grid; grid-template-columns: 26px 1fr; gap: 10px; align-items: start; }
.ix-page .rq-how2 li > span { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: #fff3ec; border: 1px solid #fbe0d2; color: #e8582a; font-size: 12px; font-weight: 700; position: relative; z-index: 1; }
.ix-page .rq-how2 strong { display: block; font-size: 12.5px; font-weight: 600; color: #111827; line-height: 1.35; }
.ix-page .rq-how2 small { display: block; font-size: 11.5px; color: #6b7280; line-height: 1.4; margin-top: 1px; }
.ix-page .rq-legend { margin-top: 14px; padding-top: 12px; border-top: 1px solid #f1f2f4; }
.ix-page .rq-legend > small { display: block; font-size: 11px; color: #8b919b; margin-bottom: 6px; }
.ix-page .rq-legend > div { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; color: #374151; }
.ix-page .rq-legend span { display: inline-flex; align-items: center; gap: 5px; }
.ix-page .rq-legend i { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.ix-page .rq-legend i.done { background: #22c55e; } .ix-page .rq-legend i.now { background: #f59e0b; box-shadow: 0 0 0 3px #fde7c3; } .ix-page .rq-legend i.fail { background: #ef4444; }
.ix-page .rq-how { margin: 0; padding-left: 18px; display: grid; gap: 5px; font-size: 12px; line-height: 1.5; color: #6b7280; }
.ix-page .rq-drawer { display: flex; flex-direction: column; gap: 12px; }
.ix-page .rq-dst { display: flex; }
/* computers: the page fits the window; only the requests table scrolls (inside its border) */
@media (min-width: 1101px) and (min-height: 560px) {
  .ix-page.lay2 .ix-main:has(.rq-cols) { overflow: hidden !important; display: flex !important; flex-direction: column !important; }
  .ix-page.lay2 .ix-main:has(.rq-cols) > .ix-content { flex: 1 1 auto !important; min-height: 0 !important; display: flex !important; flex-direction: column !important; align-self: stretch; width: 100%; box-sizing: border-box; }
  .ix-page.lay2 .ix-main:has(.rq-cols) > .ix-content > * { flex: none; }
  .ix-page .ix-content > .rq-cols { flex: 1 1 0 !important; min-height: 0; align-items: stretch; }
  .ix-page .rq-cols > .rq-table { display: flex; flex-direction: column; min-height: 0; overflow: hidden !important; }
  .ix-page .rq-table .rq-tscroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
  .ix-page .rq-table thead th { position: sticky; top: 0; z-index: 1; }
  .ix-page .rq-cols > .rq-side { min-height: 0; overflow: hidden; }
  .ix-page .rq-side .ix-card.rq-box { padding: 12px 14px !important; }
  .ix-page .rq-box > b { margin-bottom: 8px; }
  .ix-page .rq-nums strong { font-size: 18px; }
  .ix-page .rq-new button { min-height: 36px; padding: 6px 10px !important; }
}
/* shorter windows: the approval guide steps aside so the side column still fits */
/* the side column shrinks and grows with the window height, so it always fits without scrolling */
@media (min-width: 1101px) and (min-height: 560px) {
  .ix-page .rq-side { gap: clamp(8px, 1.4vh, 12px) !important; }
  .ix-page .rq-side .ix-card.rq-box { padding: clamp(10px, 1.6vh, 16px) 14px !important; }
  .ix-page .rq-side .rq-box > b { margin-bottom: clamp(4px, 1vh, 10px); font-size: 13.5px; }
  .ix-page .rq-side .rq-nums { gap: clamp(4px, 1vh, 10px) 12px; }
  .ix-page .rq-side .rq-nums strong { font-size: clamp(16px, 2.3vh, 20px); line-height: 1.2; }
  .ix-page .rq-side .rq-new { grid-template-columns: 1fr 1fr; gap: 6px; }
  .ix-page .rq-side .rq-new button { min-height: clamp(34px, 4.6vh, 44px); padding: 6px 9px !important; font-size: 12px; line-height: 1.25; gap: 7px; }
  .ix-page .rq-side .rq-how { gap: clamp(2px, .6vh, 6px); font-size: 12px; line-height: 1.45; }
  .ix-page .rq-side > .rq-how-box { overflow: visible !important; flex: 1 0 auto !important; }
  .ix-page .rq-cols > .rq-side { overflow-y: auto !important; }
  .ix-page .rq-how2 li > div { min-width: 0; }
  .ix-page .rq-how2 :is(strong, small) { line-height: 1.35 !important; margin: 0 !important; }
  .ix-page .rq-side > .rq-how-box .rq-how2 { flex: 1 1 auto; gap: 8px; min-height: 0; justify-content: space-evenly; }
  .ix-page .rq-side > .rq-how-box .rq-how2 li { flex: 0 0 auto; min-height: 0; }
  .ix-page .rq-side > .rq-how-box .rq-how2 li { padding: clamp(6px, 1.2vh, 12px); border-radius: 12px; background: #fafafb; border: 1px solid #f1f2f4; align-items: center; }
  .ix-page .rq-side > .rq-how-box .rq-legend { margin-top: auto; }
}
/* short windows: keep the steps, drop the small lines and the color guide */
@media (min-width: 1101px) and (max-height: 820px) { .ix-page .rq-how2 small { display: none; } }
@media (min-width: 1101px) and (max-height: 640px) { .ix-page .rq-side .rq-how-box { display: none; } }
/* the side column ends exactly where the requests table ends: the approval guide takes the space left */
@media (min-width: 1101px) and (min-height: 560px) {
  .ix-page .rq-cols > .rq-side { display: flex; flex-direction: column; }
  .ix-page .rq-side > .rq-box { flex: none; }
  .ix-page .rq-side > .rq-how-box { flex: 1 1 auto; min-height: 0; overflow: auto; display: flex; flex-direction: column; }
}
/* side column always fits (no scrollbar): the numbers sit in one row, the approval steps
   shrink to the space left, and the color guide is always shown at the bottom */
@media (min-width: 1101px) and (min-height: 560px) {
  .ix-page .rq-cols > .rq-side { overflow: hidden !important; display: flex !important; flex-direction: column !important; }
  .ix-page .rq-side > .rq-box { flex: none !important; }
  .ix-page .rq-side .rq-nums { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; gap: 6px !important; }
  .ix-page .rq-side .rq-nums small { font-size: 11px !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.3 !important; }
  .ix-page .rq-side .rq-nums strong { font-size: 18px !important; line-height: 1.2 !important; }
  .ix-page .rq-side > .rq-how-box { flex: 1 1 0 !important; min-height: 0 !important; overflow: hidden !important; display: flex !important; flex-direction: column !important; }
  .ix-page .rq-side > .rq-how-box .rq-how2 { flex: 1 1 0 !important; min-height: 0 !important; overflow: hidden; justify-content: flex-start !important; gap: 8px !important; }
  .ix-page .rq-side > .rq-how-box .rq-how2 li { flex: 0 0 auto !important; min-height: 0; padding: 8px 10px !important; }
  .ix-page .rq-side .rq-how2 small { display: -webkit-box !important; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .ix-page .rq-side > .rq-how-box .rq-legend { flex: none !important; margin-top: 10px !important; padding-top: 10px !important; display: block !important; }
  .ix-page .rq-side .rq-legend > div { gap: 10px !important; font-size: 11.5px !important; }
}
/* not full screen: compact steps (title only, no tile) and a one-line color guide, so all three steps
   and the guide always fit */
@media (min-width: 1101px) and (max-height: 1000px) {
  .ix-page .rq-side .rq-how2 small { display: none !important; }
  .ix-page .rq-side .rq-how2 { gap: 2px !important; }
  .ix-page .rq-side .rq-how2 li { padding: 5px 0 !important; background: none !important; border: 0 !important; grid-template-columns: 24px 1fr !important; }
  .ix-page .rq-side .rq-how2 li > span { width: 24px !important; height: 24px !important; font-size: 11px !important; }
  .ix-page .rq-side .rq-how2 strong { font-size: 12.5px !important; line-height: 1.3 !important; }
  .ix-page .rq-side .rq-legend { margin-top: 8px !important; padding-top: 8px !important; display: flex !important; align-items: center; gap: 10px; flex-wrap: wrap; }
  .ix-page .rq-side .rq-legend > small { margin: 0 !important; line-height: 1.3 !important; }
  .ix-page .rq-side .rq-legend > div { line-height: 1.3 !important; }
  .ix-page .rq-side .rq-box > b { margin-bottom: 6px !important; line-height: 1.3 !important; }
}
@media (max-width: 1100px) { .ix-page .rq-cols { grid-template-columns: 1fr; } .ix-page .rq-side { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); } }
@media (max-width: 760px) {
  .ix-page .rq-table thead { display: none; }
  .ix-page .rq-table tr { display: grid; grid-template-columns: 1fr auto; gap: 6px 10px; padding: 12px 14px; border-bottom: 1px solid #f1f2f4; }
  .ix-page .rq-table td { padding: 0; border: 0; }
  .ix-page .rq-table td:first-child { grid-column: 1 / -1; }
  .ix-page .rq-trk span { display: none; }
}
.rq-what { display: flex; align-items: flex-start; gap: 10px; min-width: 220px; max-width: 420px; }
.rq-what > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rq-what strong { font-size: 13.5px; color: #111827; }
.rq-what small { font-size: 12px; color: #6b7280; white-space: normal; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.rq-ic { width: 30px; height: 30px; flex-shrink: 0; border-radius: 8px; background: #fdeee7; color: #e8582a; display: inline-flex; align-items: center; justify-content: center; }
.rq-steps { list-style: none; margin: 0; padding: 0; display: flex; align-items: flex-start; }
.rq-steps li { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; width: 78px; font-size: 11px; color: #9ca3af; text-align: center; }
.rq-steps li + li::before { content: ""; position: absolute; top: 9px; right: 50%; width: 100%; height: 2px; background: #e5e7eb; z-index: 0; }
.rq-steps li.done + li::before, .rq-steps li.done + li.fail::before { background: #16a34a; }
.rq-steps i { position: relative; z-index: 1; width: 20px; height: 20px; border-radius: 50%; border: 2px solid #d1d5db; background: var(--ix-surface, #fff); font-style: normal; font-size: 11px; font-weight: 700; line-height: 16px; color: #fff; }
.rq-steps li.done i { background: #16a34a; border-color: #16a34a; }
.rq-steps li.now i { border-color: #f59e0b; background: #fffbeb; box-shadow: 0 0 0 3px rgba(245,158,11,.18); }
.rq-steps li.fail i { background: #dc2626; border-color: #dc2626; }
.rq-steps li.done span { color: #15803d; font-weight: 600; }
.rq-steps li.now span { color: #b45309; font-weight: 600; }
.rq-steps li.fail span { color: #dc2626; font-weight: 600; }
.rq-status { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.rq-status small { font-size: 11.5px; color: #6b7280; font-style: italic; max-width: 220px; white-space: normal; }
`;