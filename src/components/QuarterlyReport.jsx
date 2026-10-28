//QuarterlyReport.jsx
// Coordinator → Reports → Quarterly Report: the CCIS "Unit Performance Review Report"
// (form F-PLN-006, Rev.003 — the 2026 layout).
// Table 1 (enrolled / deployed per program) and Table 4 (interns per HTE) are counted by the system;
// everything else is typed here, saved per quarter, and printed (or saved as PDF) in the college's layout.
import { useState, useEffect, useMemo } from "react";
import { Icon, Msg, Spinner, programKey, esc } from "./DashKit.jsx";
import { API } from "../config.js";
import csuLogo from "../assets/csu-logo.png";

const Q_NAMES = ["1ST", "2ND", "3RD", "4TH"];
const Q_WORD = ["1st", "2nd", "3rd", "4th"];
const Q_MONTHS = ["January – March", "April – June", "July – September", "October – December"];
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
const nowYear = Number(today.slice(0, 4));
const nowQuarter = Math.floor((Number(today.slice(5, 7)) - 1) / 3) + 1;

const PROGRAM_NAME = {
  BSCS: "Bachelor of Science in Computer Science",
  BSIS: "Bachelor of Science in Information Systems",
  BSIT: "Bachelor of Science in Information Technology",
};
const PROGRAM_ORDER = ["BSCS", "BSIS", "BSIT"];
const SECTIONS = [
  { key: "s1", label: "1. Objectives & Profile" },
  { key: "s2a", label: "2.A Internship statistics" },
  { key: "s2b", label: "2.B Partnerships" },
  { key: "s2c", label: "2.C Deployment" },
  { key: "s2d", label: "2.D Monitoring" },
  { key: "s2e", label: "2.E Activities" },
  { key: "s3", label: "3. Best practices" },
  { key: "s4", label: "4. Challenges" },
  { key: "s5", label: "5. Future plans" },
  { key: "sign", label: "Prepared / Noted by" },
];
const CATEGORIES = ["Government Agency", "Educational Institution", "Private Company / Industry", "IT Company", "NGO", "Research Center", "Hospital", "Other"];
const MODALITIES = ["On-site", "Hybrid", "Virtual", "Project-based"];

// the semester(s) a quarter usually falls in (the coordinator can change it)
const termOf = (y, q) => [
  `2nd Semester, AY ${y - 1}-${y}`,
  `2nd Semester and Summer, AY ${y - 1}-${y}`,
  `Summer, AY ${y - 1}-${y} and 1st Semester, AY ${y}-${y + 1}`,
  `1st Semester, AY ${y}-${y + 1}`,
][q - 1];

// texts that stay the same every quarter (copied from the official report)
const OBJECTIVES = "This Unit Performance Review (UPR) Report of the Caraga State University contains an overall assessment of the Physical and Financial accomplishments at a unit level. The UPR Report shall also discuss its significant activities, initiatives, achievements, and other highlights from this past academic year. This report also aims to convey major changes and impactful projects undertaken and catch-up plans formulated by the unit to render its mandates and functions.";
const OBJ_LIST = [
  "Present physical and financial accomplishments for the fiscal year;",
  "Present the institutional performance anchored in the Balanced Scorecard",
  "Discuss and explain deviations/unmet targets; and",
  "Discuss corrective measures implemented by the University and recommendations for improvements",
];
const PROFILE = `The Office of the Student Internship Program (OSIP) aligns with the University's Mission, Vision, and Core Values, guided by Ched Memorandum Order (CMO) No. 104, s. 2017, "Revised Guidelines for Student Internship Program in the Philippines (SIPP) for all Programs," and CMO No. 10, s. 2023, "Enhanced Policies, Standards, and Guidelines (PSGs) on Student Internship Abroad Program." The primary objective of the OSIP is to provide students with invaluable opportunities to enhance their skills, develop a professional work ethic, and gain practical experience in real-world work environments during their internships. We aim to bridge the gap between theoretical learning and practical application by enabling students to apply the knowledge and skills acquired through formal education.

In our commitment to ensuring the effectiveness and smooth operation of the Student Internship Program, seven (7) Student Internship Program (SIP) coordinators are assigned to facilitate internships within specific colleges. These coordinators serve as vital student resources, providing guidance and assistance in processing and submitting the necessary documents for On-the-Job Training/Practicum/Internship programs. The OSIP is committed to fostering and enhancing students' professional development by providing comprehensive support and guidance throughout their internship programs.`;
const QUALITY = [
  "Ensure ≥95% deployment of undergraduate students required to undergo internship to qualified Host Training Establishments (HTEs) aligned with the students' Program Educational Objectives (PEOs) and learning outcomes.",
  "Ensure that 100% of partner Host Training Establishments (HTEs) have a valid and notarized Memorandum of Agreement (MOA) with the University prior to student deployment.",
  "Ensure 100% compliance of internship programs with CHED policies, university guidelines, and applicable legal and regulatory requirements before student deployment.",
  "Ensure that ≥95% of deployed student interns complete the required minimum internship hours and submit the required internship documents and reports.",
  "Ensure continuous improvement of the internship program through a feedback and monitoring system involving students and HTEs, with at least 85% of students obtaining a satisfactory performance rating (≥75%) based on HTE supervisor evaluation.",
];

const blank = (me, y, q) => ({
  v: 2,
  objectives: OBJECTIVES,
  objectives_list: OBJ_LIST.join("\n"),
  profile: PROFILE,
  structure: null,                       // the OSIP functional structure (one picture)
  quality: QUALITY.join("\n"),
  term: termOf(y, q),
  enrolled: {},                          // program → enrolled count typed by hand (blank = counted by the system)
  t1_note: "",
  new_hte: [],                           // { name, notarized, valid }
  renewed: [],                           // { name, expired, renewed, valid }
  engagements: [],                       // { title, date, text, photos: [{ src, caption }] }
  hte_cat: {},                           // HTE name → category
  hte_mod: {},                           // HTE name → modality (when changed by hand)
  deploy_note: "",
  orientation: "",
  orientation_photos: [],
  monitoring: "",
  monitoring_photos: [],
  activities_intro: "This section highlights significant internship-related activities organized by the college.",
  activities: [],                        // { title, text, photos }
  best_intro: "The College of Computing and Information Sciences (CCIS) implemented several effective practices that contributed to the successful execution and continuous improvement of the Student Internship Program:",
  best: [{ title: "", text: "" }],
  challenges_intro: "This section outlines the issues encountered during internship implementation and the corresponding actions taken to address them.",
  challenges: [{ challenge: "", description: "", solution: "" }],
  plans_intro: "The College of Computing and Information Sciences (CCIS) is committed to enhancing the effectiveness, efficiency, and overall quality of its internship program. The following plans and initiatives are proposed for upcoming implementation periods:",
  plans: [{ title: "", text: "" }],
  closing: "",
  prepared: { name: me?.name || "", title: "College SIP Coordinator, College of Computing and Information Sciences (CCIS)" },
  noted: { name: "", title: "Dean, College of Computing and Information Sciences (CCIS)" },
});

// a report saved in the old (2025) layout → the parts that still fit
const fromOld = (o) => ({
  new_hte: (o.new_hte || []).map((r) => ({ name: r.name, notarized: r.notarized || r.entered || "", valid: r.valid || "" })),
  best: o.best?.length ? o.best : undefined,
  challenges: (o.challenges || []).map((c) => ({ challenge: c.challenge, description: "", solution: c.solutions })),
  plans: o.goals?.length ? o.goals : undefined,
  closing: o.goals_outro || "",
  prepared: o.prepared, noted: o.noted,
});

// a photo → a small JPEG (keeps the saved report light)
const shrink = (file, max = 1000) => new Promise((resolve, reject) => {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    resolve(c.toDataURL("image/jpeg", 0.75));
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file is not a picture.")); };
  img.src = url;
});

// "2026-03-04" + "2029-03-04" → "3 years"
const duration = (a, b) => {
  if (!a || !b) return "";
  const x = new Date(a + "T00:00:00"), y = new Date(b + "T00:00:00");
  if (isNaN(x) || isNaN(y) || y <= x) return "";
  const m = (y.getFullYear() - x.getFullYear()) * 12 + (y.getMonth() - x.getMonth()) - (y.getDate() < x.getDate() ? 1 : 0);
  if (m >= 12 && m % 12 === 0) return `${m / 12} year${m === 12 ? "" : "s"}`;
  if (m >= 12) return `${Math.floor(m / 12)} yr ${m % 12} mo`;
  return m > 0 ? `${m} month${m === 1 ? "" : "s"}` : "";
};

export default function QuarterlyReport({ user }) {
  const [year, setYear] = useState(nowYear);
  const [quarter, setQuarter] = useState(nowQuarter);
  const [srv, setSrv] = useState(null);           // { period, interns, enrolled, program_hours, data, updated_at }
  const [d, setD] = useState(blank(user, nowYear, nowQuarter));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = async (y = year, q = quarter) => {
    setSrv(null); setMsg(null);
    try {
      const res = await fetch(`${API}/coordinator/quarterly-report?year=${y}&quarter=${q}`, { headers: { Accept: "application/json" } });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || "Couldn't load the report.");
      setSrv(j);
      const saved = j.data || {};
      const base = blank(user, y, q);
      const merged = saved.v === 2 ? { ...base, ...saved }
        : { ...base, ...Object.fromEntries(Object.entries(fromOld(saved)).filter(([, v]) => v !== undefined && v !== "" && !(Array.isArray(v) && !v.length))) };
      setD(merged);
      setDirty(false);
    } catch (err) {
      setSrv({ interns: [], enrolled: [], period: null, error: true });
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [year, quarter]);

  const set = (k, v) => { setD((x) => ({ ...x, [k]: v })); setDirty(true); };
  const setRow = (k, i, f, v) => set(k, d[k].map((r, j) => (j === i ? { ...r, [f]: v } : r)));
  const addRow = (k, row) => set(k, [...d[k], row]);
  const delRow = (k, i) => set(k, d[k].filter((_, j) => j !== i));

  // ── the numbers the system counts ──
  const t = useMemo(() => {
    const list = srv?.interns || [];
    const hours = srv?.program_hours || {};
    const key = (p) => programKey(p) || "Other";
    // Table 1: per program, enrolled (all intern accounts) and deployed (had attendance this quarter)
    const progs = [...new Set([...PROGRAM_ORDER.filter((p) => (srv?.enrolled || []).some((e) => key(e.program) === p) || list.some((i) => key(i.program) === p)),
      ...(srv?.enrolled || []).map((e) => key(e.program)), ...list.map((i) => key(i.program))])];
    const t1 = progs.map((p) => {
      const auto = (srv?.enrolled || []).filter((e) => key(e.program) === p).length;
      const typed = d.enrolled?.[p];
      return {
        p, name: PROGRAM_NAME[p] || p,
        deployed: list.filter((i) => key(i.program) === p).length,
        enrolled: typed !== undefined && typed !== "" ? Number(typed) : auto,
        autoEnrolled: auto,
        hours: hours[p] ?? "",
      };
    });
    // Table 4: per program → per HTE
    const placed = list.filter((i) => (i.placement || "").trim());
    const t4 = progs.map((p) => {
      const mine = placed.filter((i) => key(i.program) === p);
      const byHte = new Map();
      mine.forEach((i) => { const h = i.placement.trim(); if (!byHte.has(h)) byHte.set(h, []); byHte.get(h).push(i); });
      const rows = [...byHte.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).map(([h, arr]) => {
        const off = arr.filter((i) => i.work_mode === "offsite").length;
        const autoMod = off === 0 ? "On-site" : off === arr.length ? "Virtual" : "Hybrid";
        return { hte: h, n: arr.length, cat: d.hte_cat?.[h] || "", mod: d.hte_mod?.[h] || autoMod };
      });
      return { p, rows };
    }).filter((g) => g.rows.length);
    const htes = [...new Set(placed.map((i) => i.placement.trim()))];
    return { total: list.length, unplaced: list.length - placed.length, t1, t4, htes };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srv, d.enrolled, d.hte_cat, d.hte_mod]);

  const save = async () => {
    setBusy("save"); setMsg(null);
    try {
      const res = await fetch(`${API}/coordinator/quarterly-report`, {
        method: "PUT", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ year, quarter, data: d }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message || "Couldn't save.");
      setDirty(false); setSrv((s) => ({ ...s, updated_at: j.updated_at }));
      setMsg({ type: "success", text: "Saved." });
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    } finally { setBusy(null); }
  };

  // the parts that usually stay the same: profile, structure, categories, best practices, challenges, plans, signatories
  const copyPrevious = async () => {
    const py = quarter === 1 ? year - 1 : year, pq = quarter === 1 ? 4 : quarter - 1;
    setBusy("copy"); setMsg(null);
    try {
      const res = await fetch(`${API}/coordinator/quarterly-report?year=${py}&quarter=${pq}`, { headers: { Accept: "application/json" } });
      const j = await res.json();
      if (!j?.data) throw new Error(`There is no saved report for the ${Q_WORD[pq - 1]} quarter of ${py}.`);
      const src = j.data.v === 2 ? j.data : fromOld(j.data);
      const keep = ["objectives", "objectives_list", "profile", "structure", "quality", "hte_cat", "hte_mod", "best_intro", "best",
        "challenges_intro", "challenges", "plans_intro", "plans", "closing", "prepared", "noted"];
      setD((x) => ({ ...x, ...Object.fromEntries(keep.filter((k) => src[k] !== undefined).map((k) => [k, src[k]])) }));
      setDirty(true);
      setMsg({ type: "success", text: `Copied the profile, HTE categories, best practices, challenges, plans and signatories from Q${pq} ${py}. Check them, then save.` });
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    } finally { setBusy(null); }
  };

  const print = () => {
    const w = window.open("", "_blank");
    if (!w) { setMsg({ type: "error", text: "Allow pop-ups for this site to print the report." }); return; }
    w.document.write(reportHtml({ year, quarter, d, t }));
    w.document.close();
    setTimeout(() => w.print(), 700);   // wait for the logo and photos
  };

  // which section is open, and how complete each one is
  const [sec, setSec] = useState("s1");
  const idx = Math.max(0, SECTIONS.findIndex((x) => x.key === sec));
  const go = (i) => {
    setSec(SECTIONS[i].key);
    const m = document.querySelector(".ix-main"); if (m) m.scrollTo({ top: 0, behavior: "smooth" });
  };
  const filled = (v) => String(v || "").trim() !== "";
  const any = (arr, f) => (arr || []).some(f);
  const status = {
    s1: filled(d.objectives) && filled(d.profile) && filled(d.quality) ? (d.structure ? "ok" : "part") : "part",
    s2a: t.t1.length ? "ok" : "none",
    s2b: any(d.new_hte, (r) => filled(r.name)) || any(d.renewed, (r) => filled(r.name)) || any(d.engagements, (a) => filled(a.title)) ? "ok" : "none",
    s2c: !t.t4.length ? "none" : t.t4.every((g) => g.rows.every((r) => r.cat)) ? (filled(d.orientation) ? "ok" : "part") : "part",
    s2d: filled(d.monitoring) ? "ok" : "none",
    s2e: any(d.activities, (a) => filled(a.title)) ? "ok" : "none",
    s3: any(d.best, (b) => filled(b.title)) ? "ok" : "none",
    s4: any(d.challenges, (c) => filled(c.challenge)) ? (d.challenges.every((c) => !filled(c.challenge) || filled(c.solution)) ? "ok" : "part") : "none",
    s5: any(d.plans, (g) => filled(g.title)) ? "ok" : "none",
    sign: filled(d.prepared?.name) && filled(d.noted?.name) ? "ok" : filled(d.prepared?.name) || filled(d.noted?.name) ? "part" : "none",
  };
  const doneN = SECTIONS.filter((x) => status[x.key] === "ok").length;

  if (!srv) return <Spinner />;

  return (
    <div className="qr">
      <style>{QR_CSS}</style>
      <div className="ix-card qr-bar">
        <div className="ix-field"><label>Year</label>
          <select className="ix-select" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {Array.from({ length: 6 }, (_, i) => nowYear - 4 + i).map((y) => <option key={y}>{y}</option>)}
          </select></div>
        <div className="ix-field"><label>Quarter</label>
          <select className="ix-select" value={quarter} onChange={(e) => setQuarter(Number(e.target.value))}>
            {[1, 2, 3, 4].map((q) => <option key={q} value={q}>{Q_WORD[q - 1]} quarter ({Q_MONTHS[q - 1]})</option>)}
          </select></div>
        <div className="qr-acts">
          <span className="qr-saved">{dirty ? "Not saved yet" : srv.updated_at ? `Saved ${new Date(String(srv.updated_at).replace(" ", "T")).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "Nothing saved for this quarter"}</span>
          <button type="button" className="ix-b ghost sm" disabled={!!busy} onClick={copyPrevious}>{busy === "copy" ? "Copying..." : "Copy from last quarter"}</button>
          <button type="button" className="ix-b ghost sm" disabled={!!busy} onClick={save}>{busy === "save" ? "Saving..." : "Save"}</button>
          <button type="button" className="ix-b primary sm" onClick={print}><Icon name="print" size={14} /> Print / PDF</button>
        </div>
      </div>
      <Msg msg={msg} />
      {srv.ready === false && <div className="ix-alert"><Icon name="warn" size={16} /> Run "php artisan migrate" on the server so the report can be saved.</div>}
      <div className="qr-layout">
      {/* the sections, with how far each one is */}
      <nav className="ix-card qr-nav" aria-label="Report sections">
        <div className="qr-prog"><b>Report progress</b><span>{doneN} of {SECTIONS.length} done</span></div>
        <div className="qr-prog-bar"><i style={{ width: `${(doneN / SECTIONS.length) * 100}%` }} /></div>
        {SECTIONS.map((x, i) => {
          const st = status[x.key];
          return (
            <button key={x.key} type="button" className={sec === x.key ? "qr-nav-i on" : "qr-nav-i"} onClick={() => go(i)}>
              <i className={st}>{st === "ok" ? "✓" : st === "part" ? "!" : "–"}</i>
              <span>{x.label}</span>
            </button>
          );
        })}
        <small className="qr-nav-key"><i className="ok">✓</i> done <i className="part">!</i> started <i className="none">–</i> empty</small>
      </nav>
      <div className="qr-main">

      {/* 1. A–C: the parts that rarely change */}
      {sec === "s1" && (
      <Sec n="1" title="Objectives, Unit Profile and Quality Objectives">
        <div className="qr-fixed">
          <p className="qr-hint">These stay the same every quarter. Change them only when the office updates them.</p>
          <div className="qr-fixed-body">
          <Sub>A. Objectives</Sub>
          <textarea className="ix-input" rows={4} value={d.objectives} onChange={(e) => set("objectives", e.target.value)} />
          <label className="qr-lbl">"Specifically, this UPR Report seeks to:" (one per line)</label>
          <textarea className="ix-input" rows={4} value={d.objectives_list} onChange={(e) => set("objectives_list", e.target.value)} />
          <Sub>B. Unit Profile</Sub>
          <textarea className="ix-input" rows={7} value={d.profile} onChange={(e) => set("profile", e.target.value)} />
          <label className="qr-lbl">Functional structure of the Office (picture)</label>
          <Photos onError={(text) => setMsg({ type: "error", text })} list={d.structure ? [d.structure] : []} max={1} onChange={(l) => set("structure", l[0] || null)} />
          <Sub>C. Quality Objectives of the Office (one per line)</Sub>
          <textarea className="ix-input" rows={7} value={d.quality} onChange={(e) => set("quality", e.target.value)} />
          </div>
        </div>
      </Sec>
      )}

      {/* 2.A Table 1 */}
      {sec === "s2a" && (
      <Sec n="2.A" title="Consolidated Student Internship Statistics" auto="counted by the system">
        <div className="qr-line">
          <label className="qr-lbl">Semester shown in the table title</label>
          <input className="ix-input" value={d.term} onChange={(e) => set("term", e.target.value)} />
        </div>
        <Sub>Table 1. Distribution of students deployed for internship ({d.term}, {Q_WORD[quarter - 1]} Quarter CY {year})</Sub>
        <table className="qr-t">
          <thead><tr><th>Program</th><th className="c">Deployed</th><th className="c">Enrolled</th><th className="c">Minimum hours</th></tr></thead>
          <tbody>
            {t.t1.length === 0 && <tr><td colSpan={4} className="qr-none">No interns yet</td></tr>}
            {t.t1.map((r) => (
              <tr key={r.p}>
                <td>{r.name}</td>
                <td className="c"><b>{r.deployed}</b></td>
                <td className="c"><input className="ix-input qr-num" type="number" min={0} value={d.enrolled?.[r.p] ?? ""} placeholder={String(r.autoEnrolled)}
                  onChange={(e) => set("enrolled", { ...d.enrolled, [r.p]: e.target.value })} /></td>
                <td className="c">{r.hours}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="qr-hint">"Deployed" = interns with attendance from {srv.period?.from} to {srv.period?.to}. "Enrolled" = intern accounts in the system; type a number if the real count is different. Prints as "deployed / enrolled" (like 71/71).</p>
        <textarea className="ix-input" rows={3} placeholder="Explanation under the table, e.g. why some students were not deployed (optional)" value={d.t1_note} onChange={(e) => set("t1_note", e.target.value)} />
      </Sec>
      )}

      {/* 2.B partnerships */}
      {sec === "s2b" && (
      <Sec n="2.B" title="Strengthening Industry and Institutional Partnerships">
        <Sub>1. New Partnerships Established (Table 2)</Sub>
        <table className="qr-t">
          <thead><tr><th>Name of HTE</th><th>Date entered / notarized</th><th>Valid until</th><th>Duration</th><th /></tr></thead>
          <tbody>
            {d.new_hte.length === 0 && <tr><td colSpan={5} className="qr-none">None (prints an empty row)</td></tr>}
            {d.new_hte.map((r, i) => (
              <tr key={i}>
                <td><input className="ix-input" value={r.name} onChange={(e) => setRow("new_hte", i, "name", e.target.value)} /></td>
                <td><input type="date" className="ix-input" value={r.notarized} onChange={(e) => setRow("new_hte", i, "notarized", e.target.value)} /></td>
                <td><input type="date" className="ix-input" value={r.valid} onChange={(e) => setRow("new_hte", i, "valid", e.target.value)} /></td>
                <td className="qr-dur">{duration(r.notarized, r.valid) || "—"}</td>
                <td><button type="button" className="qr-x" aria-label="Remove row" onClick={() => delRow("new_hte", i)}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="ix-b ghost sm" onClick={() => addRow("new_hte", { name: "", notarized: "", valid: "" })}>+ Add new partnership</button>

        <Sub>2. Renewed Partnerships (Table 3)</Sub>
        <table className="qr-t">
          <thead><tr><th>Name of HTE</th><th>Date expired</th><th>Date renewed / notarized</th><th>Valid until</th><th>Duration</th><th /></tr></thead>
          <tbody>
            {d.renewed.length === 0 && <tr><td colSpan={6} className="qr-none">None (prints an empty row)</td></tr>}
            {d.renewed.map((r, i) => (
              <tr key={i}>
                <td><input className="ix-input" value={r.name} onChange={(e) => setRow("renewed", i, "name", e.target.value)} /></td>
                <td><input type="date" className="ix-input" value={r.expired} onChange={(e) => setRow("renewed", i, "expired", e.target.value)} /></td>
                <td><input type="date" className="ix-input" value={r.renewed} onChange={(e) => setRow("renewed", i, "renewed", e.target.value)} /></td>
                <td><input type="date" className="ix-input" value={r.valid} onChange={(e) => setRow("renewed", i, "valid", e.target.value)} /></td>
                <td className="qr-dur">{duration(r.renewed, r.valid) || "—"}</td>
                <td><button type="button" className="qr-x" aria-label="Remove row" onClick={() => delRow("renewed", i)}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="ix-b ghost sm" onClick={() => addRow("renewed", { name: "", expired: "", renewed: "", valid: "" })}>+ Add renewed partnership</button>

        <Sub>3. Industry Engagement Activities and Linkages</Sub>
        {d.engagements.map((a, i) => (
          <div key={i} className="qr-item">
            <div className="qr-two">
              <input className="ix-input" placeholder="Activity title" value={a.title} onChange={(e) => setRow("engagements", i, "title", e.target.value)} />
              <input type="date" className="ix-input" value={a.date} onChange={(e) => setRow("engagements", i, "date", e.target.value)} />
            </div>
            <Photos onError={(text) => setMsg({ type: "error", text })} list={a.photos || []} max={2} onChange={(l) => setRow("engagements", i, "photos", l)} />
            <textarea className="ix-input" rows={4} placeholder="What was discussed / agreed" value={a.text} onChange={(e) => setRow("engagements", i, "text", e.target.value)} />
            <button type="button" className="qr-x" aria-label="Remove activity" onClick={() => delRow("engagements", i)}>×</button>
          </div>
        ))}
        <button type="button" className="ix-b ghost sm" onClick={() => addRow("engagements", { title: "", date: "", text: "", photos: [] })}>+ Add engagement activity</button>
      </Sec>
      )}

      {/* 2.C deployment */}
      {sec === "s2c" && (
      <Sec n="2.C" title="Student Internship Deployment" auto="counted by the system">
        <Sub>Table 4. Students deployed to Host Training Establishments (HTEs), by degree program</Sub>
        {t.t4.length === 0 ? <p className="qr-none">No interns with a placement had attendance this quarter.</p> : (
          <table className="qr-t">
            <thead><tr><th>Name of HTE</th><th className="c">Students</th><th>Category of HTE</th><th>Internship modality</th></tr></thead>
            <tbody>
              {t.t4.map((g) => [
                <tr key={g.p} className="qr-group"><td colSpan={4}>{g.p}</td></tr>,
                ...g.rows.map((r) => (
                  <tr key={g.p + r.hte}>
                    <td>{r.hte}</td>
                    <td className="c"><b>{r.n}</b></td>
                    <td><select className="ix-select" value={r.cat} onChange={(e) => set("hte_cat", { ...d.hte_cat, [r.hte]: e.target.value })}>
                      <option value="">Choose…</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></td>
                    <td><select className="ix-select" value={r.mod} onChange={(e) => set("hte_mod", { ...d.hte_mod, [r.hte]: e.target.value })}>
                      {MODALITIES.map((m) => <option key={m}>{m}</option>)}</select></td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        )}
        <p className="qr-hint">The modality starts from each intern's work arrangement (onsite / work from home). The category of an HTE is remembered for next time.{t.unplaced ? ` ${t.unplaced} intern${t.unplaced === 1 ? "" : "s"} with no placement set are not listed.` : ""}</p>
        <textarea className="ix-input" rows={2} placeholder="Note under the table (optional)" value={d.deploy_note} onChange={(e) => set("deploy_note", e.target.value)} />
        <Sub>Pre-Deployment Orientation</Sub>
        <Photos onError={(text) => setMsg({ type: "error", text })} list={d.orientation_photos} max={3} onChange={(l) => set("orientation_photos", l)} />
        <textarea className="ix-input" rows={5} placeholder="What the orientation covered (policies, requirements, do's and don'ts, GAD session…)" value={d.orientation} onChange={(e) => set("orientation", e.target.value)} />
      </Sec>
      )}

      {/* 2.D monitoring */}
      {sec === "s2d" && (
      <Sec n="2.D" title="Monitoring, Supervision, and Student Support">
        <textarea className="ix-input" rows={5} placeholder="Monitoring visits done this quarter, purpose and results…" value={d.monitoring} onChange={(e) => set("monitoring", e.target.value)} />
        <Photos onError={(text) => setMsg({ type: "error", text })} list={d.monitoring_photos} max={6} onChange={(l) => set("monitoring_photos", l)} />
      </Sec>
      )}

      {/* 2.E activities */}
      {sec === "s2e" && (
      <Sec n="2.E" title="Highlights of Activities Conducted">
        <textarea className="ix-input" rows={2} value={d.activities_intro} onChange={(e) => set("activities_intro", e.target.value)} />
        {d.activities.map((a, i) => (
          <div key={i} className="qr-item">
            <input className="ix-input" placeholder={`${i + 1}. Activity title, e.g. Student Internship Debriefing Program`} value={a.title} onChange={(e) => setRow("activities", i, "title", e.target.value)} />
            <Photos onError={(text) => setMsg({ type: "error", text })} list={a.photos || []} max={4} onChange={(l) => setRow("activities", i, "photos", l)} />
            <textarea className="ix-input" rows={4} placeholder="Description" value={a.text} onChange={(e) => setRow("activities", i, "text", e.target.value)} />
            <button type="button" className="qr-x" aria-label="Remove activity" onClick={() => delRow("activities", i)}>×</button>
          </div>
        ))}
        <button type="button" className="ix-b ghost sm" onClick={() => addRow("activities", { title: "", text: "", photos: [] })}>+ Add activity</button>
      </Sec>
      )}

      {/* 3 best practices */}
      {sec === "s3" && (
      <Sec n="3" title="Best Practices">
        <textarea className="ix-input" rows={2} value={d.best_intro} onChange={(e) => set("best_intro", e.target.value)} />
        {d.best.map((b, i) => (
          <div key={i} className="qr-item">
            <input className="ix-input" placeholder={`${"abcdefghij"[i] || i + 1}. e.g. Conducted the Student Internship Debriefing Program`} value={b.title} onChange={(e) => setRow("best", i, "title", e.target.value)} />
            <textarea className="ix-input" rows={3} placeholder="What was done" value={b.text} onChange={(e) => setRow("best", i, "text", e.target.value)} />
            <button type="button" className="qr-x" aria-label="Remove" onClick={() => delRow("best", i)}>×</button>
          </div>
        ))}
        <button type="button" className="ix-b ghost sm" onClick={() => addRow("best", { title: "", text: "" })}>+ Add best practice</button>
      </Sec>
      )}

      {/* 4 challenges */}
      {sec === "s4" && (
      <Sec n="4" title="Challenges Encountered and Solutions Implemented">
        <textarea className="ix-input" rows={2} value={d.challenges_intro} onChange={(e) => set("challenges_intro", e.target.value)} />
        {d.challenges.map((c, i) => (
          <div key={i} className="qr-item three">
            <textarea className="ix-input" rows={3} placeholder="Challenge" value={c.challenge} onChange={(e) => setRow("challenges", i, "challenge", e.target.value)} />
            <textarea className="ix-input" rows={3} placeholder="Description" value={c.description} onChange={(e) => setRow("challenges", i, "description", e.target.value)} />
            <textarea className="ix-input" rows={3} placeholder="Solution implemented" value={c.solution} onChange={(e) => setRow("challenges", i, "solution", e.target.value)} />
            <button type="button" className="qr-x" aria-label="Remove" onClick={() => delRow("challenges", i)}>×</button>
          </div>
        ))}
        <button type="button" className="ix-b ghost sm" onClick={() => addRow("challenges", { challenge: "", description: "", solution: "" })}>+ Add challenge</button>
      </Sec>
      )}

      {/* 5 plans */}
      {sec === "s5" && (
      <Sec n="5" title="Future Plans and Initiatives">
        <textarea className="ix-input" rows={2} value={d.plans_intro} onChange={(e) => set("plans_intro", e.target.value)} />
        {d.plans.map((g, i) => (
          <div key={i} className="qr-item">
            <input className="ix-input" placeholder={`${"abcdefghij"[i] || i + 1}. e.g. Expand Local and International Internship Opportunities`} value={g.title} onChange={(e) => setRow("plans", i, "title", e.target.value)} />
            <textarea className="ix-input" rows={3} placeholder="Details" value={g.text} onChange={(e) => setRow("plans", i, "text", e.target.value)} />
            <button type="button" className="qr-x" aria-label="Remove" onClick={() => delRow("plans", i)}>×</button>
          </div>
        ))}
        <button type="button" className="ix-b ghost sm" onClick={() => addRow("plans", { title: "", text: "" })}>+ Add plan</button>
        <textarea className="ix-input" rows={4} placeholder="Closing paragraphs (optional), e.g. The accomplishments presented in this report reflect…" value={d.closing} onChange={(e) => set("closing", e.target.value)} />
      </Sec>
      )}

      {sec === "sign" && (
      <section className="ix-card qr-sec">
        <h3><em>✎</em> Prepared by and Noted by</h3>
        <div className="qr-sign">
        <div>
          <h4>Prepared by</h4>
          <input className="ix-input" placeholder="Name" value={d.prepared.name} onChange={(e) => set("prepared", { ...d.prepared, name: e.target.value })} />
          <input className="ix-input" placeholder="Position" value={d.prepared.title} onChange={(e) => set("prepared", { ...d.prepared, title: e.target.value })} />
        </div>
        <div>
          <h4>Noted by</h4>
          <input className="ix-input" placeholder="Name" value={d.noted.name} onChange={(e) => set("noted", { ...d.noted, name: e.target.value })} />
          <input className="ix-input" placeholder="Position" value={d.noted.title} onChange={(e) => set("noted", { ...d.noted, title: e.target.value })} />
        </div>
        </div>
      </section>
      )}
      <div className="qr-row">
        {idx > 0 ? <button type="button" className="ix-b ghost" onClick={() => go(idx - 1)}>‹ {SECTIONS[idx - 1].label}</button> : <span />}
        {idx < SECTIONS.length - 1
          ? <button type="button" className="ix-b primary" onClick={() => go(idx + 1)}>Next: {SECTIONS[idx + 1].label} ›</button>
          : <button type="button" className="ix-b primary" onClick={print}><Icon name="print" size={14} /> Print / PDF</button>}
      </div>
      </div>
      </div>
    </div>
  );
}

// photos with captions (used in several sections)
function Photos({ list, onChange, max = 6, onError }) {
  const add = async (files) => {
    const out = [];
    for (const f of [...files].slice(0, max - list.length)) {
      try { out.push({ src: await shrink(f), caption: "" }); } catch (err) { onError && onError(err.message); }
    }
    if (out.length) onChange([...list, ...out]);
  };
  return (
    <div className="qr-photos">
      {list.map((ph, i) => (
        <figure key={i}>
          <img src={ph.src} alt="" />
          <input className="ix-input" placeholder="Figure caption" value={ph.caption}
            onChange={(e) => onChange(list.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))} />
          <button type="button" className="qr-x" aria-label="Remove photo" onClick={() => onChange(list.filter((_, j) => j !== i))}>×</button>
        </figure>
      ))}
      {list.length < max && (
        <label className="qr-add-photo">
          <input type="file" accept="image/*" multiple hidden onChange={(e) => { const f = e.target.files; add(f); e.target.value = ""; }} />
          <Icon name="camera" size={20} /> Add photo / screenshot
        </label>
      )}
    </div>
  );
}
function Sec({ n, title, auto, children }) {
  return (
    <section className="ix-card qr-sec">
      <h3><em>{n}</em> {title}{auto && <span className="qr-auto">{auto}</span>}</h3>
      {children}
    </section>
  );
}
const Sub = ({ children }) => <h4 className="qr-sub">{children}</h4>;

/* ───────── the printed report (same layout as the 2026 CCIS template, F-PLN-006 Rev.003) ───────── */
function reportHtml({ year, quarter, d, t }) {
  const abs = (u) => new URL(u, window.location.href).href;
  const P = (s) => String(s || "").trim().split(/\n{2,}/).filter(Boolean).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const lines = (s) => String(s || "").split(/\n/).map((x) => x.replace(/^\s*([-•*]|\d+[.)])\s*/, "").trim()).filter(Boolean);
  const fmt = (v) => (v ? new Date(v + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "");
  const qName = `${Q_WORD[quarter - 1].toUpperCase()} Quarter CY ${year}`;
  const qWord = `${Q_WORD[quarter - 1]} Quarter CY ${year}`;
  let fig = 0;
  const figs = (list, cls = "") => (list || []).length
    ? `<div class="figs ${cls}">${list.map((ph) => `<figure><img src="${ph.src}" alt=""><figcaption>${ph.caption ? `<b>Figure ${++fig}:</b> <i>${esc(ph.caption)}</i>` : ""}</figcaption></figure>`).join("")}</div>` : "";
  const qBoxes = Q_NAMES.map((n, i) => `<div class="qb"><span class="${i + 1 === quarter ? "on" : ""}"></span>${n.replace(/(\d)(\D+)/, "$1<sup>$2</sup>")} QUARTER</div>`).join("");
  const bar = (txt) => `<div class="bar">${txt}</div>`;
  const ybar = (txt) => `<div class="ybar">${txt}</div>`;
  const t1rows = t.t1.map((r) => `<tr><td>${esc(r.name)}</td><td class="c">${r.deployed}/${r.enrolled}</td><td class="c">${esc(r.hours)}</td></tr>`).join("");
  const blankRow = (n) => `<tr>${Array.from({ length: n }, () => "<td>&nbsp;</td>").join("")}</tr>`;
  const t4rows = t.t4.map((g) => `<tr class="grp"><td>${esc(g.p)}</td><td></td><td></td><td></td></tr>`
    + g.rows.map((r) => `<tr><td>${esc(r.hte)}</td><td class="c">${r.n}</td><td>${esc(r.cat)}</td><td>${esc(r.mod)}</td></tr>`).join("")).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>Unit Performance Review Report - ${qName}</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; color: #111; line-height: 1.45; }
  /* repeated on every page (the page has no margin; the table's head/foot rows keep the space on each page) */
  .run-head { position: fixed; top: 11mm; right: 18mm; z-index: 0; font-family: Verdana, sans-serif; font-size: 9pt; font-weight: 700; color: #3f9a2f; letter-spacing: .4px; }
  .run-hex { position: fixed; top: 0; left: 0; z-index: 0; width: 60mm; height: 34mm; overflow: hidden; }
  .run-hex i { position: absolute; display: block; clip-path: polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0 50%); }
  .run-dots { position: fixed; top: 22mm; left: 4mm; z-index: 0; width: 9mm; height: 60mm; background: radial-gradient(circle, #3c8a35 1.1px, transparent 1.4px) 0 0 / 3.2mm 3.2mm; }
  .run-foot { position: fixed; bottom: 12mm; left: 22mm; right: 18mm; z-index: 0; border-top: 1px solid #9bbbd4; }
  .run-hex2 { position: fixed; right: 0; bottom: 0; z-index: 0; width: 50mm; height: 32mm; overflow: hidden; }
  .run-hex2 i { position: absolute; display: block; clip-path: polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0 50%); }
  table.page { width: 100%; border: 0; margin: 0; border-collapse: collapse; position: relative; z-index: 1; }
  table.page > thead td, table.page > tfoot td, table.page > tbody > tr > td { border: 0; padding: 0; }
  table.page > tbody > tr > td { padding: 0 18mm 0 26mm; }
  .hsp { height: 30mm; } .fsp { height: 24mm; }
  /* cover */
  .cover { position: relative; z-index: 5; background: #fff; height: 297mm; padding: 14mm 18mm 0 22mm; page-break-after: always; overflow: hidden; }
  .cover .logos img { height: 70px; }
  .cover .dia { position: absolute; border: 2.5px solid #e9c94a; border-radius: 14px; transform: rotate(45deg); }
  .cover .dia.r { border-color: #c0504d; }
  .cover .tri { position: absolute; width: 0; height: 0; }
  .cover h1 { margin: 230px 0 0; text-align: center; font-family: "Rockwell", "Georgia", serif; font-weight: 900; font-size: 25pt; line-height: 1.35; color: #4f8a2a; }
  .cover hr { width: 62%; margin: 4px auto 0; border: 0; border-top: 1.5px solid #3b6c8f; }
  .cover .year { text-align: center; margin-top: 38px; font-family: "Times New Roman", serif; font-weight: 700; font-size: 22pt; }
  .cover .qbs { width: 210px; margin: 26px auto 0; }
  .cover .qb { display: flex; align-items: center; gap: 8px; font-size: 13.5pt; line-height: 1.5; }
  .cover .qb span { width: 38px; height: 17px; border: 1.3px solid #555; border-radius: 4px; }
  .cover .qb span.on { background: #f4d03f; border-color: #b7950b; }
  .cover .band { position: absolute; right: 0; bottom: 64mm; width: 118mm; padding: 12px 18px; border-radius: 34px 0 0 34px; background: #4f8a2a;
    color: #f4e7a1; font-family: "Times New Roman", serif; font-size: 15pt; line-height: 1.35; text-align: center; }
  .cover .form { position: absolute; left: 22mm; bottom: 24mm; font-family: "Courier New", monospace; font-size: 9pt; }
  .cover .dots { position: absolute; right: -10mm; bottom: -8mm; width: 150mm; height: 40mm; border-radius: 60% 0 0 0;
    background: radial-gradient(circle, #2f7d32 1.6px, transparent 2px) 0 0 / 7px 7px; opacity: .9; }
  /* table of contents */
  .toc { position: relative; z-index: 5; background: #fff; height: 297mm; padding: 26mm 18mm 0 40mm; page-break-after: always; overflow: hidden; }
  .toc .run { position: absolute; top: 11mm; right: 18mm; font-family: Verdana, sans-serif; font-size: 9pt; font-weight: 700; color: #3f9a2f; }
  .toc .side { position: absolute; left: 34mm; top: 20mm; bottom: 30mm; border-left: 1.5px solid #3f8a2a; }
  .toc .blk { position: absolute; left: 14mm; top: 4mm; width: 22mm; height: 46mm; background: #4f8a2a; }
  .toc .ybox { position: absolute; right: 12mm; bottom: 10mm; width: 12mm; height: 66mm; background: #f4d03f; }
  .toc .fl { position: absolute; left: 14mm; right: 28mm; bottom: 26mm; border-top: 1px solid #9bbbd4; }
  .toc h2 { margin: 6mm 0 10mm 6mm; font-family: Verdana, sans-serif; font-size: 22pt; line-height: 1.05; color: #555; }
  .toc h2 b { color: #4fa83a; }
  .toc .pg { font-weight: 700; font-size: 10pt; margin: 0 0 4mm 6mm; }
  .toc ol { list-style: none; margin: 0 0 0 20mm; padding: 0; font-size: 10.5pt; }
  .toc li { margin: 0 0 2.2mm; } .toc li span { display: inline-block; width: 6mm; } .toc li div { margin-left: 6mm; }
  .toc li div div { margin: 0 0 3.5mm; }
  /* body */
  .bar { margin: 18px 0 12px; padding: 5px 8px; background: #6abf45; border-bottom: 1px solid #3c8a25; font-family: Verdana, sans-serif; font-weight: 700; font-size: 12pt; color: #fff; text-transform: uppercase; text-shadow: 0 0 1px #2d6a1c; }
  .ybar { display: inline-block; margin: 14px 0 8px 18px; padding: 3px 120px 3px 8px; background: #f7e36b; font-family: Verdana, sans-serif; font-weight: 700; font-size: 11.5pt; color: #2f6f2c; }
  .sub { margin: 12px 0 6px 18px; font-weight: 700; }
  .in { margin-left: 18px; }
  p { margin: 0 0 8px; text-align: justify; }
  .cap { margin: 10px 0 2px; font-size: 10pt; text-align: justify; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; margin-bottom: 8px; }
  th { text-align: center; padding: 3px 6px; border: 1px solid #333; font-weight: 700; }
  td { padding: 2px 6px; border: 1px solid #333; vertical-align: top; }
  table.light th { text-align: left; border: 0; border-bottom: 1px solid #bbb; background: #f2f2f2; }
  table.light td { border: 0; border-bottom: 1px solid #ddd; }
  .c { text-align: center; }
  tr.grp td { background: #f7d94c; font-weight: 700; }
  ul.dot { margin: 4px 0 8px 18px; padding-left: 18px; } ul.dot li { margin-bottom: 3px; }
  ol.num { margin: 4px 0 8px 18px; padding-left: 26px; } ol.num li { margin-bottom: 3px; }
  .act { margin: 12px 0 0 18px; } .act b { font-weight: 700; }
  .figs { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin: 8px 0 10px; }
  .figs figure { margin: 0; flex: 1 1 45%; max-width: 100%; text-align: center; page-break-inside: avoid; }
  .figs.one figure { flex-basis: 80%; }
  .figs img { max-width: 100%; max-height: 82mm; object-fit: contain; }
  .figs figcaption { font-size: 9.5pt; margin-top: 2px; }
  .plan b { display: block; margin: 8px 0 4px; }
  .sign { margin-top: 14mm; page-break-inside: avoid; }
  .sign div { margin-bottom: 12mm; }
  .sign b { display: block; margin-top: 10mm; text-transform: uppercase; }
  .struct { text-align: center; margin: 4px 0 12px; } .struct img { max-width: 100%; max-height: 120mm; }
</style></head><body>
<div class="run-head">QUARTERLY REPORT</div>
<div class="run-hex">
  <i style="left:2mm;top:0;width:38mm;height:32mm;background:#4f8a2a"></i>
  <i style="left:7mm;top:8mm;width:20mm;height:18mm;background:#f4d03f"></i>
  <i style="left:36mm;top:0;width:20mm;height:18mm;background:#f4d03f"></i>
  <i style="left:30mm;top:20mm;width:11mm;height:10mm;background:#f4d03f"></i>
</div>
<div class="run-dots"></div>
<div class="run-foot"></div>
<div class="run-hex2">
  <i style="left:22mm;top:2mm;width:16mm;height:14mm;background:#8fd16f"></i>
  <i style="left:10mm;top:14mm;width:20mm;height:18mm;background:#f4d03f"></i>
  <i style="left:30mm;top:15mm;width:20mm;height:18mm;background:#6abf45"></i>
</div>

<div class="cover">
  <div class="logos"><img src="${abs(csuLogo)}" alt=""></div>
  <i class="dia" style="width:120px;height:120px;right:48mm;top:22mm"></i>
  <i class="dia r" style="width:80px;height:80px;right:14mm;top:58mm"></i>
  <i class="dia r" style="width:85px;height:85px;left:8mm;bottom:58mm"></i>
  <i class="dia" style="width:95px;height:95px;left:40mm;bottom:30mm"></i>
  <span class="tri" style="right:60mm;top:0;border-left:22px solid transparent;border-right:22px solid transparent;border-top:28px solid #3f7d28"></span>
  <span class="tri" style="right:20mm;top:0;border-left:30px solid transparent;border-right:30px solid transparent;border-top:36px solid #e9c94a"></span>
  <h1>UNIT PERFORMANCE<br>REVIEW REPORT</h1><hr>
  <div class="year">${year}</div>
  <div class="qbs">${qBoxes}</div>
  <div class="band">COLLEGE OF COMPUTING AND<br>INFORMATION SCIENCES</div>
  <div class="form">F-PLN-006, Rev.003, 08/30/2024</div>
  <div class="dots"></div>
</div>

<div class="toc">
  <div class="run">QUARTERLY REPORT</div>
  <div class="blk"></div><div class="side"></div><div class="ybox"></div><div class="fl"></div>
  <h2>Table of<br><b>CONTENTS</b></h2>
  <div class="pg">PAGE</div>
  <ol>
    <li><span>1</span>A. OBJECTIVES<div><div>B. UNIT PROFILE</div><div>C. QUALITY OBJECTIVES OF THE OFFICE</div></div></li>
    <li><span>2</span>INITIATIVES AND ACHIEVEMENTS (HIGHLIGHTS OF ACCOMPLISHMENTS)<div>
      <div>A. Consolidated Student Internship Statistics</div><div>B. Strengthening Industry and Institutional Partnerships</div>
      <div>C. Student Internship Deployment</div><div>D. Monitoring, Supervision, and Student Support</div><div>E. Highlights of Activities Conducted</div></div></li>
    <li><span>3</span>BEST PRACTICES</li>
    <li><span>4</span>CHALLENGES ENCOUNTERED AND SOLUTIONS IMPLEMENTED</li>
    <li><span>5</span>FUTURE PLANS AND INITIATIVES</li>
  </ol>
</div>

<table class="page"><thead><tr><td><div class="hsp"></div></td></tr></thead>
<tfoot><tr><td><div class="fsp"></div></td></tr></tfoot><tbody><tr><td>
${bar("1. A. Objectives")}
${P(d.objectives)}
<p>Specifically, this UPR Report seeks to:</p>
<ol class="num">${lines(d.objectives_list).map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
${bar("1.B. Unit Profile")}
${P(d.profile)}
${d.structure ? `<div class="struct"><img src="${d.structure.src}" alt=""></div>` : ""}
${bar("1. C. Quality Objectives of the Office")}
<ul class="dot">${lines(d.quality).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>

${bar("2. Initiatives and Achievements (Highlights of Accomplishments)")}
${ybar("A. Consolidated Student Internship Statistics")}
<p class="cap"><b>Table 1.</b> Distribution of students deployed for internship in the College of Computing and Information Sciences during the ${esc(d.term)} (${qWord}).</p>
<table><thead><tr><th style="width:52%">Program</th><th>Number of Students Enrolled and Deployed for Internship</th><th>Minimum Number of Hours Internship as stipulated in the Curriculum</th></tr></thead>
<tbody>${t1rows || blankRow(3)}</tbody></table>
${P(d.t1_note)}

${ybar("B. Strengthening Industry and Institutional Partnerships")}
<div class="sub">1. New Partnerships Established</div>
<p class="cap in"><b>Table 2.</b> New internship partnerships with Host Training Establishments (HTEs) established by the College of Computing and Information Sciences, ${qWord}.</p>
<div class="in"><table class="light"><thead><tr><th>Name of HTE</th><th>Date Entered/Notarized</th><th>Valid Until</th><th>Duration of Validity</th></tr></thead>
<tbody>${d.new_hte.filter((r) => r.name).map((r) => `<tr><td>${esc(r.name)}</td><td>${fmt(r.notarized)}</td><td>${fmt(r.valid)}</td><td>${duration(r.notarized, r.valid)}</td></tr>`).join("") || blankRow(4)}</tbody></table></div>
<div class="sub">2. Renewed Partnerships</div>
<p class="cap in"><b>Table 3.</b> Renewed partnerships with Host Training Establishments (HTEs) that have an existing MOA but expired during the reporting period of the College of Computing and Information Science, ${qWord}.</p>
<div class="in"><table><thead><tr><th>Name of HTE</th><th>Date Expired</th><th>Date Renewed/Notarized</th><th>Valid Until</th><th>Duration of Validity</th></tr></thead>
<tbody>${d.renewed.filter((r) => r.name).map((r) => `<tr><td>${esc(r.name)}</td><td>${fmt(r.expired)}</td><td>${fmt(r.renewed)}</td><td>${fmt(r.valid)}</td><td>${duration(r.renewed, r.valid)}</td></tr>`).join("") || blankRow(5)}</tbody></table></div>
${d.engagements.some((a) => a.title || a.text) ? `<div class="sub">3. Industry Engagement Activities and Linkages</div>
${d.engagements.filter((a) => a.title || a.text).map((a) => `<div class="act"><b>Activity Title:</b> ${esc(a.title)}<br><b>Date Conducted:</b> ${fmt(a.date)}</div>${figs(a.photos, "one")}<div class="in">${P(a.text)}</div>`).join("")}` : ""}

${ybar("C. Student Internship Deployment")}
<p class="cap in"><b>Table 4.</b> Number of students from the College of Computing and Information Sciences deployed for internship to various Host Training Establishments (HTEs), by degree program, during the ${esc(d.term)} (${qWord}).</p>
<div class="in"><table><thead><tr><th style="width:44%">Name of HTE</th><th>Number of Students Deployed</th><th>Category of HTE<br><small>(industry, government agency, NGO, research institution, IT company, hospital, school, etc.)</small></th><th>Internship Modalities<br><small>(On-site, Hybrid, Virtual, Project-based, etc.)</small></th></tr></thead>
<tbody>${t4rows || blankRow(4)}</tbody></table>
${P(d.deploy_note)}</div>
${d.orientation || d.orientation_photos.length ? `<div class="sub">PRE-Deployment Orientation</div>${figs(d.orientation_photos, "one")}<div class="in">${P(d.orientation)}</div>` : ""}

${ybar("D. Monitoring, Supervision, and Student Support")}
<div class="in">${P(d.monitoring)}</div>
${figs(d.monitoring_photos)}

${ybar("E. Highlights of Activities Conducted")}
<div class="in">${P(d.activities_intro)}</div>
${d.activities.filter((a) => a.title || a.text).map((a, i) => `<div class="sub">${i + 1}. ${esc(a.title)}</div>${figs(a.photos)}<div class="in">${P(a.text)}</div>`).join("")}

${bar("3. Best Practices")}
${P(d.best_intro)}
${d.best.filter((b) => b.title || b.text).map((b, i) => `<div class="plan"><b>${"abcdefghij"[i] || i + 1}. ${esc(b.title)}</b>${P(b.text)}</div>`).join("")}

${bar("4. Challenges Encountered and Solutions Implemented")}
${P(d.challenges_intro)}
<table><thead><tr><th style="width:30%;text-align:left">Challenge</th><th style="width:33%;text-align:left">Description</th><th style="text-align:left">Solution Implemented</th></tr></thead>
<tbody>${d.challenges.filter((c) => c.challenge || c.description || c.solution).map((c) => `<tr><td>${esc(c.challenge).replace(/\n/g, "<br>")}</td><td>${esc(c.description).replace(/\n/g, "<br>")}</td><td>${esc(c.solution).replace(/\n/g, "<br>")}</td></tr>`).join("") || blankRow(3)}</tbody></table>

${bar("5. Future Plans and Initiatives")}
${P(d.plans_intro)}
${d.plans.filter((g) => g.title || g.text).map((g, i) => `<div class="plan in"><b>${"abcdefghij"[i] || i + 1}. ${esc(g.title)}</b>${P(g.text)}</div>`).join("")}
${P(d.closing)}

<div class="sign">
  <div>Prepared by:<b>${esc(d.prepared.name)}</b>${esc(d.prepared.title)}</div>
  <div>Noted by:<b>${esc(d.noted.name)}</b>${esc(d.noted.title)}</div>
</div>
</td></tr></tbody></table>
</body></html>`;
}

const QR_CSS = `
  .ix-page .qr { display: flex; flex-direction: column; gap: 14px; }
  .ix-page .ix-content .qr-bar { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; padding: 14px 18px !important; }
  .ix-page .qr-bar .ix-field { min-width: 150px; }
  .ix-page .qr-acts { margin-left: auto; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .ix-page .qr-saved { font-size: 12px; color: #94a3b8; margin-right: 4px; }
  .ix-page .ix-content .qr-sec { padding: 16px 18px !important; display: flex; flex-direction: column; gap: 10px; }
  .ix-page .qr-sec h3 { margin: 0; font-size: 15px; font-weight: 700; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .ix-page .qr-sec h3 em { font-style: normal; font-size: 12px; font-weight: 800; color: #fff; background: #4d9a2a; border-radius: 6px; padding: 2px 8px; }
  .ix-page .qr-sec h4 { margin: 6px 0 0; font-size: 12.5px; font-weight: 700; color: #4b5563; }
  .ix-page .qr-sub { color: #2f6f2c !important; font-size: 13px !important; }
  .ix-page .qr-lbl { font-size: 12.5px; font-weight: 600; color: #4b5563; }
  .ix-page .qr-line { display: grid; grid-template-columns: 220px 1fr; gap: 10px; align-items: center; }
  .ix-page .qr-auto { font-size: 11px; font-weight: 600; color: #15803d; background: #e6f7ee; padding: 2px 9px; border-radius: 99px; }
  .ix-page .qr-hint { margin: 0; font-size: 12.5px; color: #6b7280; }
  .ix-page .qr-fixed summary { cursor: pointer; font-size: 13px; font-weight: 600; color: #4b5563; }
  .ix-page .qr-fixed-body { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
  .ix-page .qr-fixed-body > * { width: 100%; }
  .ix-page .qr-sec textarea.ix-input, .ix-page .qr-sec input.ix-input:not(.qr-num) { display: block; width: 100%; max-width: 100%; box-sizing: border-box; }
  .ix-page .qr-sec textarea.ix-input { resize: vertical; min-height: 0; height: auto; padding: 9px 12px; line-height: 1.5; }
  /* text boxes grow with what is typed (no small scrollbar inside the box) */
  .ix-page .qr-sec textarea.ix-input { field-sizing: content; min-height: 64px !important; max-height: none !important; overflow: hidden; }
  .ix-page .qr-t { width: 100%; border-collapse: collapse; font-size: 13px; }
  .ix-page .qr-t th { text-align: left; background: #eef9d9; color: #2f5d18; font-weight: 700; padding: 7px 8px; border: 1px solid #dbe9c4; }
  .ix-page .qr-t td { padding: 4px 6px; border: 1px solid #eee6df; }
  .ix-page .qr-t .c { text-align: center; }
  .ix-page .qr-t .ix-input, .ix-page .qr-t .ix-select { height: 34px; }
  .ix-page .qr-num { width: 90px; text-align: center; margin: 0 auto; }
  .ix-page .qr-dur { font-size: 12.5px; color: #475569; white-space: nowrap; }
  .ix-page .qr-group td { background: #fdf3c4; font-weight: 800; color: #6b5300; }
  .ix-page .qr-none { color: #94a3b8; font-style: italic; text-align: center; padding: 10px !important; margin: 0; }
  .ix-page .qr-x { width: 28px; height: 28px; border-radius: 8px; border: 1px solid #f1d5c9; background: #fff; color: #c2410c; font-size: 18px; line-height: 1; cursor: pointer; }
  .ix-page .qr-two { display: grid; grid-template-columns: 1fr 200px; gap: 8px; }
  .ix-page .qr-item { position: relative; display: flex; flex-direction: column; gap: 8px; padding: 12px 44px 12px 12px; border: 1px dashed #eadfd8; border-radius: 10px; }
  .ix-page .qr-item > .qr-x { position: absolute; top: 10px; right: 10px; }
  .ix-page .qr-item.three { display: grid; grid-template-columns: 1fr 1fr 1fr; }
  @media (max-width: 800px) { .ix-page .qr-item.three, .ix-page .qr-two, .ix-page .qr-line { grid-template-columns: 1fr; } }
  .ix-page .qr-photos { display: flex; flex-wrap: wrap; gap: 10px; }
  .ix-page .qr-photos figure { position: relative; margin: 0; width: 200px; display: flex; flex-direction: column; gap: 6px; }
  .ix-page .qr-photos img { width: 100%; height: 120px; object-fit: cover; border-radius: 8px; border: 1px solid #eee; }
  .ix-page .qr-photos .qr-x { position: absolute; top: 6px; right: 6px; }
  .ix-page .qr-add-photo { width: 200px; height: 120px; display: flex; align-items: center; justify-content: center; gap: 8px; flex-direction: column;
    border: 1.5px dashed #f0b896; border-radius: 8px; color: #c2410c; font-size: 12.5px; font-weight: 600; cursor: pointer; background: #fff9f5; }
  .ix-page .qr-sign { flex-direction: row !important; gap: 18px !important; flex-wrap: wrap; }
  .ix-page .qr-sign > div { flex: 1 1 260px; display: flex; flex-direction: column; gap: 8px; }
  .ix-page .qr-row { display: flex; justify-content: flex-end; gap: 8px; }
  .ix-page .qr-layout { display: grid; grid-template-columns: 270px minmax(0, 1fr); gap: 16px; align-items: start; }
  .ix-page .ix-content .qr-nav { position: sticky; top: 12px; padding: 14px 12px !important; display: flex; flex-direction: column; gap: 2px; }
  .ix-page .qr-prog { display: flex; justify-content: space-between; align-items: baseline; font-size: 12.5px; margin: 0 4px 6px; }
  .ix-page .qr-prog span { color: #64748b; }
  .ix-page .qr-prog-bar { height: 7px; border-radius: 4px; background: #f1e7e1; margin: 0 4px 10px; overflow: hidden; }
  .ix-page .qr-prog-bar i { display: block; width: 0; height: 100% !important; min-width: 0; border: 0; margin: 0; background: #ea580c; border-radius: inherit; transition: width .3s; }
  .ix-page .qr-nav-i { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 10px; border: 0; border-radius: 9px; background: transparent;
    font: inherit; font-size: 13px; color: #334155; text-align: left; cursor: pointer; }
  .ix-page .qr-nav-i:hover { background: #f8f9fb; }
  .ix-page .qr-nav-i.on { background: #fff4ee; color: #c2410c; font-weight: 700; box-shadow: inset 3px 0 0 #ea580c; }
  .ix-page .qr-nav-i > i, .ix-page .qr-nav-key i { width: 20px; height: 20px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
    font-style: normal; font-size: 11px; font-weight: 800; flex: none; }
  .ix-page .qr-nav-i > i.ok, .ix-page .qr-nav-key i.ok { background: #16a34a; color: #fff; }
  .ix-page .qr-nav-i > i.part, .ix-page .qr-nav-key i.part { background: #fde68a; color: #92400e; }
  .ix-page .qr-nav-i > i.none, .ix-page .qr-nav-key i.none { background: #eef0f4; color: #94a3b8; }
  .ix-page .qr-nav-key { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; margin: 10px 4px 0; font-size: 11.5px; color: #94a3b8; }
  .ix-page .qr-nav-key i { width: 16px; height: 16px; font-size: 9.5px; margin-left: 4px; }
  .ix-page .qr-main { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
  .ix-page .qr-row { justify-content: space-between !important; }
  @media (max-width: 900px) { .ix-page .qr-layout { grid-template-columns: 1fr; } .ix-page .ix-content .qr-nav { position: static; } }

  .ix-page .qr-sec > .ix-b { align-self: flex-start; }
`;