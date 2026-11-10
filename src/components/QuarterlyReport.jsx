//QuarterlyReport.jsx
// Coordinator → Reports → Quarterly Report: the CCIS "Unit Performance Review Report"
// (form F-PLN-006, Rev.003 — the 2026 layout).
// Table 1 (enrolled / deployed per program) and Table 4 (interns per HTE) are counted by the system;
// everything else is typed here, saved per quarter, and printed (or saved as PDF) in the college's layout.
import { Fragment, useState, useEffect, useMemo, useRef } from "react";
import { Icon, Msg, Spinner, programKey, esc, HTE_CATEGORIES, Drawer, Table, Badge, Modal } from "./DashKit.jsx";
import { API } from "../config.js";
import csuLogo from "../assets/csu-logo.png";
import bpLogo from "../assets/bagong-pilipinas.png";     // Bagong Pilipinas, beside the CSU logo on the cover
import isoLogo from "../assets/iso-cert.jpg";            // SOCOTEC ISO 9001 / PAB certification mark

const Q_NAMES = ["1ST", "2ND", "3RD", "4TH"];
// what to do in each part, in one sentence (shown at the top of the part)
const JOB = { check: "Check", write: "Write", sign: "Sign" };
const HOW = {
  s1: "Already filled in from the college's report. Just add the office's structure picture; change the text only if the office updated it.",
  s2a: "The system counted these from the interns' records. Check that the numbers are right; you don't need to type anything.",
  s2b: "Write the MOAs signed or renewed this quarter and any meetings with partners. Leave it empty if there were none.",
  s2c: "The system listed the interns per HTE. Just pick each HTE's category.",
  s2d: "The system wrote this from the quarter's records. Read it and change anything that is not right.",
  s2e: "Write the activities you held this quarter. You can also click the school events and announcements the system found.",
  s3: "Write what worked well this quarter, in one or two sentences each.",
  s4: "Write the problems that came up this quarter and what you did about each.",
  s5: "Write what you plan to do next.",
  sign: "Type who prepared and who noted the report. This is needed before you can print or download it.",
};
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
// the parts of the report, named and grouped as in the college's table of contents
const SECTIONS = [
  { key: "s1", n: "1", job: "check", label: "Objectives, Unit Profile and Quality Objectives" },
  { key: "s2a", n: "A", group: "2", job: "check", label: "Consolidated Internship Statistics" },
  { key: "s2b", n: "B", group: "2", job: "write", label: "Industry and Institutional Partnerships" },
  { key: "s2c", n: "C", group: "2", job: "check", label: "Student Internship Deployment" },
  { key: "s2d", n: "D", group: "2", job: "check", label: "Monitoring, Supervision and Support" },
  { key: "s2e", n: "E", group: "2", job: "write", label: "Highlights of Activities" },
  { key: "s3", n: "3", job: "write", label: "Best Practices" },
  { key: "s4", n: "4", job: "write", label: "Challenges and Solutions" },
  { key: "s5", n: "5", job: "write", label: "Future Plans and Initiatives" },
  { key: "sign", n: "", job: "sign", label: "Prepared by / Noted by" },
];
// the categories used in the CCIS quarterly reports (Table 4)
const CATEGORIES = HTE_CATEGORIES;   // shared with Partner HTEs (the category is set once on the HTE)
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

// the quarter a new report is usually for: the one that just ended during the first month of a new quarter
// (that is when its report is written), else the current quarter
const suggestQuarter = () => {
  const firstMonth = (Number(today.slice(5, 7)) - 1) % 3 === 0;
  if (firstMonth) return nowQuarter === 1 ? [nowYear - 1, 4] : [nowYear, nowQuarter - 1];
  return [nowYear, nowQuarter];
};
const qTitle = (y, q) => `${Q_WORD[q - 1]} quarter ${y}`;
const when = (t) => (t ? new Date(String(t).replace(" ", "T")).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—");

/* Coordinator → Reports → Quarterly Report: the list of reports first (Draft / Ready), then one report's form */
export default function QuarterlyReport({ user, supervisors = [], interns = [] }) {
  // ?q=2026-3 (from the reminder) opens that quarter's report straight away
  const [open, setOpen] = useState(() => {
    const m = /^(\d{4})-([1-4])$/.exec(new URLSearchParams(window.location.search).get("q") || "");
    return m ? [Number(m[1]), Number(m[2])] : null;
  });
  const [list, setList] = useState(null);
  const [adding, setAdding] = useState(null);     // [year, quarter] in the "New quarterly report" window
  const [lmsg, setLmsg] = useState(null);
  const loadList = () => {
    fetch(`${API}/coordinator/quarterly-reports`, { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : [])).then((rows) => setList(Array.isArray(rows) ? rows : []))
      .catch(() => { setList([]); setLmsg({ type: "error", text: "Couldn't reach the server." }); });
  };
  useEffect(() => { if (!open) loadList(); }, [open]);
  const go = (y, q, mode = "edit") => {
    setOpen([y, q, mode]);
    const u = new URL(window.location.href); u.searchParams.set("q", `${y}-${q}`); window.history.replaceState(null, "", u);
  };
  const back = () => {
    setOpen(null);
    const u = new URL(window.location.href); u.searchParams.delete("q"); window.history.replaceState(null, "", u);
  };

  if (open) return <ReportForm key={open.join("-")} user={user} supervisors={supervisors} interns={interns} year={open[0]} quarter={open[1]}
    view={open[2] === "view"} onMode={(m) => setOpen([open[0], open[1], m])} onBack={back} />;

  const exists = (y, q) => (list || []).some((r) => r.year === y && r.quarter === q);
  return (
    <div className="qr">
      <style>{QR_CSS}</style>
      <div className="qr-listhead">
        <p>One report for each quarter. View a report to see it as it prints, or Edit it to check, write and sign it.</p>
        <button type="button" className="ix-b primary" onClick={() => setAdding(suggestQuarter())}><Icon name="plus" size={14} /> New quarterly report</button>
      </div>
      <Msg msg={lmsg} />
      {!list ? <Spinner /> : (
        <Table
          headers={["Quarter", "Status", "Last saved", ""]}
          empty="No quarterly reports yet. Click New quarterly report to start one."
          rows={list.map((r) => {
            const ready = r.total ? r.done >= r.total : false;
            return [
              <span className="qr-lq"><b>{qTitle(r.year, r.quarter)}</b><small>{Q_MONTHS[r.quarter - 1]}</small></span>,
              <span className="qr-lst">{ready ? <Badge label="Ready" type="approved" /> : <Badge label="Draft" type="pending" />}
                {!ready && r.total ? <small>{r.done} of {r.total} parts done</small> : null}</span>,
              <span className="qr-lq"><span>{when(r.updated_at)}</span>{r.updated_by_name && <small>by {r.updated_by_name}</small>}</span>,
              <span className="qr-lacts">
                <button type="button" className="ix-b ghost sm" onClick={() => go(r.year, r.quarter, "view")} title="See the report as it will print"><Icon name="eye" size={14} /> View</button>
                <button type="button" className="ix-b ghost sm" onClick={() => go(r.year, r.quarter)} title="Check, write and sign the report"><Icon name="pencil" size={14} /> Edit</button>
              </span>,
            ];
          })}
        />
      )}
      {adding && (
        <Modal title="New quarterly report" sub="Pick the quarter the report is for." onClose={() => setAdding(null)}>
          <div className="qr-newq">
            <div className="ix-field"><label>Year</label>
              <select className="ix-select" value={adding[0]} onChange={(e) => setAdding([Number(e.target.value), adding[1]])}>
                {Array.from({ length: 6 }, (_, i) => nowYear - 4 + i).map((y) => <option key={y}>{y}</option>)}
              </select></div>
            <div className="ix-field"><label>Quarter</label>
              <select className="ix-select" value={adding[1]} onChange={(e) => setAdding([adding[0], Number(e.target.value)])}>
                {[1, 2, 3, 4].map((q) => <option key={q} value={q}>{Q_WORD[q - 1]} quarter ({Q_MONTHS[q - 1]})</option>)}
              </select></div>
            {exists(adding[0], adding[1]) && <p className="qr-newq-note"><Icon name="info" size={14} /> This quarter already has a report. It will open the saved one.</p>}
            <div className="qr-newq-btns">
              <button type="button" className="ix-b ghost" onClick={() => setAdding(null)}>Cancel</button>
              <button type="button" className="ix-b primary" onClick={() => { const [y, q] = adding; setAdding(null); go(y, q); }}>
                {exists(adding[0], adding[1]) ? "Open the report" : "Start the report"}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* View: the printed report shown page by page (A4), like the DTR preview: the page scrolls, not a box inside it.
   The pages are laid out on screen from the same HTML that is printed, so they match the print closely. */
const PAGER = `<style>@media screen {
  html, body { background: transparent; }
  body > .run-head, body > .run-hex, body > .run-dots, body > .run-foot, body > .run-hex2, body > table.page { display: none !important; }
  .pv { display: flex; flex-direction: column; align-items: center; padding: 4px 0 8px; }
  .pv-sheet { display: flex; flex-direction: column; align-items: center; }
  .pv-page { position: relative; width: 210mm; height: 297mm; background: #fff; box-shadow: 0 2px 14px rgba(0,0,0,.14); overflow: hidden; }
  .pv-page > .cover, .pv-page > .toc { height: 297mm; }
  .pv-page .pv-deco { position: absolute !important; }
  .pv-body { position: absolute; top: 30mm; bottom: 24mm; left: 26mm; right: 18mm; overflow: hidden; }
  .pv-no { margin: 8px 0 18px; font: 600 12px Arial, sans-serif; color: #6b7280; }
}</style>
<script>(function () {
  function paginate() {
    var td = document.querySelector("table.page > tbody > tr > td");
    if (!td) return done(0);
    var deco = ["run-head", "run-hex", "run-dots", "run-foot", "run-hex2"].map(function (c) { return document.querySelector("body > ." + c); }).filter(Boolean);
    var wrap = document.createElement("div"); wrap.className = "pv"; document.body.appendChild(wrap);
    var pages = [], box = null;
    function page() { var p = document.createElement("div"); p.className = "pv-page"; wrap.appendChild(p); pages.push(p); return p; }
    ["cover", "toc"].forEach(function (c) { var el = document.querySelector("body > ." + c); if (el) page().appendChild(el); });
    function body() {
      var p = page();
      deco.forEach(function (d) { var c = d.cloneNode(true); c.classList.add("pv-deco"); p.appendChild(c); });
      box = document.createElement("div"); box.className = "pv-body"; p.appendChild(box);
    }
    function over() { return box.scrollHeight > box.clientHeight + 1; }
    var KEEPS = ["bar", "ybar", "sub", "cap", "act"];   // headings and captions stay with what follows
    var KEEP = { test: function (c) { return String(c).split(" ").some(function (x) { return KEEPS.indexOf(x) >= 0; }); } };
    function tableOf(el) { return el.tagName === "TABLE" ? el : (el.children.length === 1 && el.firstElementChild.tagName === "TABLE" ? el.firstElementChild : null); }
    function split(el) {
      var tb = tableOf(el); if (!tb || !tb.tBodies[0]) return;
      var rows = Array.prototype.slice.call(tb.tBodies[0].rows), moved = [];
      while (over() && rows.length > 1) { var r = rows.pop(); moved.unshift(r); r.remove(); }
      if (!moved.length) return;
      var tb2 = tb.cloneNode(false);
      if (tb.tHead) tb2.appendChild(tb.tHead.cloneNode(true));
      var b2 = document.createElement("tbody"); moved.forEach(function (r) { b2.appendChild(r); }); tb2.appendChild(b2);
      var el2 = tb === el ? tb2 : el.cloneNode(false); if (el2 !== tb2) el2.appendChild(tb2);
      body(); box.appendChild(el2);
      if (over()) split(el2);
    }
    function place(el) {
      box.appendChild(el);
      if (!over()) return;
      if (box.children.length === 1) return split(el);           // alone and still too tall: split its table
      el.remove();
      var carry = [];
      while (box.children.length > 1 && KEEP.test(box.lastElementChild.className || "")) carry.unshift(box.removeChild(box.lastElementChild));
      body(); carry.forEach(function (c) { box.appendChild(c); }); box.appendChild(el);
      if (over()) split(el);
    }
    var nodes = Array.prototype.slice.call(td.childNodes).filter(function (n) { return n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim()); });
    body();
    nodes.forEach(function (n) {
      if (n.nodeType === 3) { var p = document.createElement("p"); p.textContent = n.textContent; n = p; }
      place(n);
    });
    // empty last page (nothing left to place) is dropped
    if (box && !box.children.length) { pages.pop().remove(); }
    pages.forEach(function (p, i) {
      var s = document.createElement("div"); s.className = "pv-sheet"; p.parentNode.insertBefore(s, p); s.appendChild(p);
      var n = document.createElement("div"); n.className = "pv-no"; n.textContent = "Page " + (i + 1) + " of " + pages.length; s.appendChild(n);
    });
    done(pages.length);
  }
  function done(n) { parent.postMessage({ qrPages: n, qrH: document.documentElement.scrollHeight }, "*"); }
  if (document.readyState === "complete") paginate(); else window.addEventListener("load", paginate);
})();<\/script>`;

function PagedView({ html, title }) {
  const ref = useRef(null);
  const [h, setH] = useState(1200);
  const [n, setN] = useState(null);
  useEffect(() => {
    const on = (e) => {
      if (!ref.current || e.source !== ref.current.contentWindow || !e.data || e.data.qrH == null) return;
      setH(e.data.qrH + 4); setN(e.data.qrPages);
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, []);
  const doc = useMemo(() => html.replace("</body>", `${PAGER}</body>`), [html]);
  return (
    <div className="qr-view">
      {n != null && <div className="qr-view-n">{n} page{n === 1 ? "" : "s"} · A4</div>}
      <iframe ref={ref} title={title} srcDoc={doc} style={{ height: h }} scrolling="no" />
    </div>
  );
}

/* one quarter's report: the parts to check, write and sign, then Print / Word */
function ReportForm({ user, supervisors = [], interns: allInterns = [], year, quarter, onBack, view = false, onMode }) {
  const [srv, setSrv] = useState(null);           // { period, interns, enrolled, program_hours, data, updated_at }
  const [d, setD] = useState(blank(user, year, quarter));
  const [feed, setFeed] = useState({ cal: [], ann: [] });   // the quarter's school events and announcements (for 2.E)
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
  useEffect(() => {
    const get = (u) => fetch(`${API}${u}`, { headers: { Accept: "application/json" } }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    Promise.all([get("/calendar"), get("/announcements")]).then(([c, a]) => setFeed({
      cal: (Array.isArray(c) ? c : c?.events || []).filter((e) => !e.hte_key),
      ann: Array.isArray(a) ? a : [],
    }));
  }, []);

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
        // the coordinator's modality per intern (On-site / Hybrid / Virtual); older data falls back to the work mode
        const LBL = { onsite: "On-site", hybrid: "Hybrid", virtual: "Virtual", project: "Project-based" };
        const mods = [...new Set(arr.map((i) => LBL[i.modality] || (i.work_mode === "offsite" ? "Virtual" : "On-site")))];
        const autoMod = MODALITIES.filter((m) => mods.includes(m)).join(", ");
        // a CSU / CCIS office is an academic / university office unless the coordinator picked something else
        const uni = /^(CSU|CCIS|Caraga State University)\b/i.test(h);
        // what Partner HTEs knows about this HTE (category and modality set on its supervisor account)
        const hk = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
        const sup = supervisors.filter((s) => hk(s.placement) === hk(h));
        const setCat = sup.map((s) => s.hte_category).find(Boolean);
        const setMod = LBL[sup.map((s) => s.hte_modality).find((m) => LBL[m])];
        return { hte: h, n: arr.length, cat: d.hte_cat?.[h] || setCat || (uni ? "Educational Institution" : ""), mod: d.hte_mod?.[h] || setMod || autoMod };
      });
      return { p, rows };
    }).filter((g) => g.rows.length);
    const htes = [...new Set(placed.map((i) => i.placement.trim()))];
    return { total: list.length, unplaced: list.length - placed.length, t1, t4, htes };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srv, d.enrolled, d.hte_cat, d.hte_mod, supervisors]);

  const save = async () => {
    setBusy("save"); setMsg(null);
    try {
      const res = await fetch(`${API}/coordinator/quarterly-report`, {
        method: "PUT", headers: { "Content-Type": "application/json", Accept: "application/json" },
        // how many parts are done is saved too, so the list can show Draft or Ready
        body: JSON.stringify({ year, quarter, data: { ...d, _progress: { done: doneN, total: SECTIONS.length } } }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message || "Couldn't save.");
      setDirty(false); setSrv((s) => ({ ...s, updated_at: j.updated_at, data: { ...d, _progress: { done: doneN, total: SECTIONS.length } } }));
      setMsg({ type: "success", text: "Saved." });
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    } finally { setBusy(null); }
  };

  // the parts that usually stay the same: profile, structure, categories, best practices, challenges, plans, signatories
  const [copyOpen, setCopyOpen] = useState(false);   // the "Copy from another quarter" page
  const copyFrom = (src, keys, label) => {
    setD((x) => ({ ...x, ...Object.fromEntries(keys.filter((k) => src[k] !== undefined).map((k) => [k, src[k]])) }));
    setDirty(true); setCopyOpen(false);
    setMsg({ type: "success", text: `Copied from ${label}. Check what changed this quarter, then save.` });
  };
  const copyPrevious = async (only = null) => {
    const py = quarter === 1 ? year - 1 : year, pq = quarter === 1 ? 4 : quarter - 1;
    setBusy("copy"); setMsg(null);
    try {
      const res = await fetch(`${API}/coordinator/quarterly-report?year=${py}&quarter=${pq}`, { headers: { Accept: "application/json" } });
      const j = await res.json();
      if (!j?.data) throw new Error(`There is no saved report for the ${Q_WORD[pq - 1]} quarter of ${py}.`);
      const src = j.data.v === 2 ? j.data : fromOld(j.data);
      const keep = only || ["objectives", "objectives_list", "profile", "structure", "quality", "hte_cat", "hte_mod", "best_intro", "best",
        "challenges_intro", "challenges", "plans_intro", "plans", "closing", "prepared", "noted"];
      if (only && !only.some((k) => src[k] !== undefined)) throw new Error(`Q${pq} ${py} has nothing saved for this section.`);
      setD((x) => ({ ...x, ...Object.fromEntries(keep.filter((k) => src[k] !== undefined).map((k) => [k, src[k]])) }));
      setDirty(true);
      setMsg({ type: "success", text: only ? `Copied this section from Q${pq} ${py}. Edit what changed, then save.` : `Copied the profile, HTE categories, best practices, challenges, plans and signatories from Q${pq} ${py}. Check them, then save.` });
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    } finally { setBusy(null); }
  };

  // printing or downloading needs the signatories (the office returns an unsigned report)
  const ready = () => {
    if (!(String(d.prepared?.name || "").trim() && String(d.noted?.name || "").trim())) {
      setSec("sign");
      setMsg({ type: "error", text: "Fill in \"Prepared by\" and \"Noted by\" first: the report can't be printed or downloaded without them." });
      return false;
    }
    return true;
  };
  const word = async () => {
    if (!ready()) return;
    setBusy("word"); setMsg(null);
    try {
      const blob = await wordFile(reportHtml({ year, quarter, d, t, word: true }));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `CCIS_UPR_Report_Q${quarter}_${year}.doc`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      setMsg({ type: "success", text: "Downloaded. Open it in Word to make last-minute changes, then save it as .docx or PDF." });
    } catch (err) {
      setMsg({ type: "error", text: err.message || "Couldn't make the Word file." });
    } finally { setBusy(null); }
  };
  const print = () => {
    if (!ready()) return;
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
  const checked = (k) => !!d.checked?.[k];
  const check = (k, v = true) => set("checked", { ...(d.checked || {}), [k]: v });
  const status = {
    s1: filled(d.objectives) && filled(d.profile) && filled(d.quality) ? (d.structure ? "ok" : "part") : "part",
    s2a: !t.t1.length ? "none" : checked("s2a") ? "ok" : "part",
    s2b: any(d.new_hte, (r) => filled(r.name)) || any(d.renewed, (r) => filled(r.name)) || any(d.engagements, (a) => filled(a.title)) ? "ok" : "none",
    s2c: !t.t4.length ? "none" : t.t4.every((g) => g.rows.every((r) => r.cat)) && checked("s2c") && filled(d.orientation) ? "ok" : "part",
    s2d: filled(d.monitoring) ? "ok" : "none",
    s2e: any(d.activities, (a) => filled(a.title)) ? "ok" : "none",
    s3: any(d.best, (b) => filled(b.title)) ? "ok" : "none",
    s4: any(d.challenges, (c) => filled(c.challenge)) ? (d.challenges.every((c) => !filled(c.challenge) || filled(c.solution)) ? "ok" : "part") : "none",
    s5: any(d.plans, (g) => filled(g.title)) ? "ok" : "none",
    sign: filled(d.prepared?.name) && filled(d.noted?.name) ? "ok" : filled(d.prepared?.name) || filled(d.noted?.name) ? "part" : "none",
  };
  const doneN = SECTIONS.filter((x) => status[x.key] === "ok").length;
  // the list's Draft / Ready comes from the count saved with the report: when a saved report's count is
  // missing or out of date (saved before this was kept), save it again quietly so the list shows the truth
  useEffect(() => {
    if (!srv || !srv.data || dirty || busy) return;
    const p = srv.data._progress;
    if (p && p.done === doneN && p.total === SECTIONS.length) return;
    const data = { ...d, _progress: { done: doneN, total: SECTIONS.length } };
    fetch(`${API}/coordinator/quarterly-report`, {
      method: "PUT", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ year, quarter, data }),
    }).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (j) setSrv((x) => (x ? { ...x, data: { ...(x.data || {}), _progress: data._progress }, updated_at: j.updated_at || x.updated_at } : x));
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srv, doneN, dirty]);
  // what is left, in words (shown above the section list)
  const todo = {
    s1: !d.structure && "add the office's structure picture",
    s2a: t.t1.length && !checked("s2a") && "check the counted numbers",
    s2b: status.s2b === "none" && "add new / renewed MOAs (or leave empty)",
    s2c: t.t4.length && (t.t4.some((g) => g.rows.some((r) => !r.cat)) ? "pick each HTE's category" : !checked("s2c") ? "check the counted table" : !filled(d.orientation) && "describe the orientation"),
    s2d: status.s2d === "none" && "describe the monitoring",
    s2e: status.s2e === "none" && "add at least one activity",
    s3: status.s3 === "none" && "answer the questions",
    s4: status.s4 !== "ok" && (status.s4 === "part" ? "add the solution" : "answer the questions"),
    s5: status.s5 === "none" && "answer the questions",
    sign: status.sign !== "ok" && "fill in the signatories (needed to print)",
  };
  const left = SECTIONS.filter((x) => todo[x.key]);

  // ── suggestions from the system's own data ──
  const inQ = (v) => { const x = String(v || "").slice(0, 10); return srv?.period && x >= srv.period.from && x <= srv.period.to; };
  const htes = useMemo(() => {
    const map = new Map();
    supervisors.forEach((s) => {
      const name = String(s.placement || "").trim(); if (!name) return;
      const k = name.toLowerCase();
      const r = map.get(k) || { name, valid: "" };
      const v = s.moa_valid_until ? String(s.moa_valid_until).slice(0, 10) : "";
      if (v && (!r.valid || v > r.valid)) r.valid = v;
      map.set(k, r);
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [supervisors]);
  const listed = new Set([...d.new_hte, ...d.renewed].map((r) => String(r.name || "").trim().toLowerCase()).filter(Boolean));
  const htePick = htes.filter((h) => !listed.has(h.name.toLowerCase()));
  const nSup = new Set(allInterns.filter((i) => i.supervisor_id).map((i) => String(i.supervisor_id))).size;
  const qLong = `${Q_WORD[quarter - 1]} quarter of ${year}`;
  const monitorText = `During the ${qLong}, ${t.total} intern${t.total === 1 ? " was" : "s were"} deployed to ${t.htes.length} Host Training Establishment${t.htes.length === 1 ? "" : "s"} and monitored through the MYTRACK OJT management system. Daily attendance was recorded by tapping the NFC card at the ACR122U kiosk, and the coordinator followed each intern's hours in real time. Online workdays and overtime were first confirmed by the HTE supervisor before the coordinator's final approval${nSup ? `, with ${nSup} HTE supervisor${nSup === 1 ? "" : "s"} assigned to the interns` : ""}. Internship requirements were submitted and reviewed through the system for the pre-, during- and post-internship phases.`;
  const todayIso = today;
  const expired = htes.filter((h) => h.valid && h.valid < todayIso);
  const soon = htes.filter((h) => h.valid && h.valid >= todayIso && (new Date(h.valid) - new Date(todayIso)) / 86400000 <= 60);
  const noSup = allInterns.filter((i) => !i.supervisor_id).length;
  // Only what the records show is offered (★): expiring MOAs and interns without a supervisor.
  // Best practices, other challenges and future plans are the coordinator's own judgment, so the system
  // offers no ready-made sentences for them; she writes them (or copies last quarter's and edits them).
  const IDEAS = {
    best: [],
    challenges: [
      ...(expired.length || soon.length ? [{ sys: true, challenge: "Expiring or expired MOAs", description: `${expired.length ? `${expired.length} partner HTE MOA${expired.length === 1 ? " has" : "s have"} expired` : ""}${expired.length && soon.length ? " and " : ""}${soon.length ? `${soon.length} will expire within 60 days` : ""}.`, solution: "" }] : []),
      ...(noSup ? [{ sys: true, challenge: "Interns without an assigned HTE supervisor", description: `${noSup} intern${noSup === 1 ? " had" : "s had"} no HTE supervisor in the system, so their requests could not be confirmed.`, solution: "" }] : []),
    ],
    plans: [],
  };
  const has = (k, title) => (d[k] || []).some((x) => String(x.title || x.challenge || "").trim().toLowerCase() === title.toLowerCase());
  // add an idea: fills the first empty item, else adds a new one
  const addIdea = (k, idea) => {
    const list = d[k] || [];
    const empty = list.findIndex((x) => !Object.values(x).some((v) => String(v || "").trim()));
    const { sys, ...row } = idea;   // eslint-disable-line no-unused-vars
    set(k, empty >= 0 ? list.map((x, i) => (i === empty ? { ...x, ...row } : x)) : [...list, row]);
  };
  // the quarter's school events and announcements, for 2.E
  const fromFeed = [
    ...feed.cal.filter((e) => e.scope === "school_event" && inQ(e.date)).map((e) => ({ src: `cal:${e.id}`, title: e.title, date: String(e.date).slice(0, 10), text: e.description || "", kind: "School event" })),
    ...feed.ann.filter((a) => inQ(a.created_at)).map((a) => ({ src: `ann:${a.id}`, title: a.title, date: String(a.created_at).slice(0, 10), text: a.body || "", kind: "Announcement" })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const usedSrc = new Set((d.activities || []).map((a) => a.src).filter(Boolean));

  if (!srv) return <Spinner />;

  // View: the report exactly as it prints, read-only (Open to change it)
  if (view) {
    return (
      <div className="qr">
        <style>{QR_CSS}</style>
        <div className="ix-card qr-bar">
          <div className="qr-title">
            <button type="button" className="qr-back" onClick={onBack}><Icon name="menu" size={14} /> Back to the list</button>
            <h3>{qTitle(year, quarter)} <small>{Q_MONTHS[quarter - 1]}</small></h3>
            {doneN === SECTIONS.length ? <Badge label="Ready" type="approved" /> : <Badge label="Draft" type="pending" />}
          </div>
          <div className="qr-acts">
            <span className="qr-saved">{srv.updated_at ? `Saved ${new Date(String(srv.updated_at).replace(" ", "T")).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "Nothing saved for this quarter"}</span>
            <button type="button" className="ix-b ghost sm" onClick={() => onMode && onMode("edit")}><Icon name="pencil" size={14} /> Edit</button>
            <button type="button" className="ix-b ghost sm" disabled={!!busy} onClick={word}><Icon name="download" size={14} /> {busy === "word" ? "Making..." : "Word"}</button>
            <button type="button" className="ix-b primary sm" onClick={print}><Icon name="print" size={14} /> Print / PDF</button>
          </div>
        </div>
        <Msg msg={msg} />
        {doneN < SECTIONS.length && <div className="qr-viewnote"><Icon name="info" size={14} /> This report is still a draft: {SECTIONS.length - doneN} part{SECTIONS.length - doneN === 1 ? " is" : "s are"} not finished yet. Click <b>Edit</b> to finish {SECTIONS.length - doneN === 1 ? "it" : "them"}.</div>}
        <PagedView html={reportHtml({ year, quarter, d, t })} title={`Quarterly report, ${qTitle(year, quarter)}`} />
      </div>
    );
  }

  return (
    <div className="qr">
      <style>{QR_CSS}</style>
      <div className="ix-card qr-bar">
        <div className="qr-title">
          <button type="button" className="qr-back" onClick={() => { if (!dirty || window.confirm("You have changes that are not saved. Leave without saving?")) onBack(); }}>
            <Icon name="menu" size={14} /> Back to the list</button>
          <h3>{qTitle(year, quarter)} <small>{Q_MONTHS[quarter - 1]}</small></h3>
          {doneN === SECTIONS.length ? <Badge label="Ready" type="approved" /> : <Badge label="Draft" type="pending" />}
        </div>
        <div className="qr-acts">
          <span className="qr-saved">{dirty ? "Not saved yet" : srv.updated_at ? `Saved ${new Date(String(srv.updated_at).replace(" ", "T")).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "Nothing saved for this quarter"}</span>
          {!srv.updated_at && <button type="button" className="ix-b ghost sm" disabled={!!busy} onClick={() => setCopyOpen(true)}><Icon name="file" size={14} /> Copy from another quarter</button>}
          <button type="button" className="ix-b ghost sm" disabled={!!busy} onClick={save}>{busy === "save" ? "Saving..." : "Save"}</button>
          <button type="button" className="ix-b ghost sm" disabled={!!busy} onClick={word}><Icon name="download" size={14} /> {busy === "word" ? "Making..." : "Word"}</button>
          <button type="button" className="ix-b primary sm" onClick={print}><Icon name="print" size={14} /> Print / PDF</button>
        </div>
      </div>
      <Msg msg={msg} />
      {copyOpen && <CopyDrawer year={year} quarter={quarter} nowYear={nowYear} onClose={() => setCopyOpen(false)} onCopy={copyFrom} />}
      {srv.ready === false && <div className="ix-alert"><Icon name="warn" size={16} /> Run "php artisan migrate" on the server so the report can be saved.</div>}
      <div className="qr-layout">
      {/* the sections, with how far each one is */}
      <nav className="ix-card qr-nav" aria-label="Report sections">
        <div className="qr-steps"><b>How it works</b>
          <span><small className="qr-job check">Check</small> what the system filled in</span>
          <span><small className="qr-job write">Write</small> the parts only you know</span>
          <span><small className="qr-job sign">Sign</small> then Print or Word</span></div>
        <div className="qr-prog"><b>Report progress</b><span>{doneN} of {SECTIONS.length} done</span></div>
        <div className="qr-prog-bar"><i style={{ width: `${(doneN / SECTIONS.length) * 100}%` }} /></div>
        {left.length > 0 ? (
          <div className="qr-left"><b>Left to do</b>
            <ul>{left.slice(0, 4).map((x) => <li key={x.key}><button type="button" onClick={() => go(SECTIONS.indexOf(x))}>{x.n ? `${x.group ? "2." : ""}${x.n}` : "✎"} · {todo[x.key]}</button></li>)}</ul>
            {left.length > 4 && <small>and {left.length - 4} more</small>}
          </div>
        ) : <div className="qr-left ok"><b>✓ Ready to print or download</b></div>}
        {SECTIONS.map((x, i) => {
          const st = status[x.key];
          return (
            <Fragment key={x.key}>
              {x.group && SECTIONS[i - 1]?.group !== x.group && <div className="qr-nav-g"><em>{x.group}</em>Initiatives and Achievements</div>}
              <button type="button" className={`qr-nav-i${x.group ? " sub" : ""}${sec === x.key ? " on" : ""}`} onClick={() => go(i)} title={st === "ok" ? "Done" : st === "part" ? "Needs checking" : "Empty"}>
                {x.n ? <em>{x.n}</em> : <em className="blank" />}
                <span>{x.label}<small className={`qr-job ${x.job}`}>{JOB[x.job]}</small></span>
                <i className={st}>{st === "ok" ? "✓" : st === "part" ? "!" : ""}</i>
              </button>
            </Fragment>
          );
        })}
        <small className="qr-nav-key">
          <span><i className="ok">✓</i> done</span><span><i className="part">!</i> needs checking</span><span><i className="none" /> empty</span>
        </small>
      </nav>
      <div className="qr-main">

      {/* 1. A–C: the parts that rarely change */}
      {HOW[sec] && <div className={`qr-how ${SECTIONS.find((x) => x.key === sec)?.job}`}><small className={`qr-job ${SECTIONS.find((x) => x.key === sec)?.job}`}>{JOB[SECTIONS.find((x) => x.key === sec)?.job]}</small> {HOW[sec]}</div>}
      {sec === "s1" && (
      <Sec n="1" title="Objectives, Unit Profile and Quality Objectives">
        <div className="qr-fixed">
          {!d.structure && <div className="qr-todo"><Icon name="warn" size={14} /> Add the picture of the office's functional structure to finish this section.</div>}
          {/* the text from the college's report, editable in place (open a part to change it) */}
          <div className="qr-read qr-edit1">
            <details open><summary>A. Objectives</summary>
              <textarea className="ix-input" rows={4} value={d.objectives} onChange={(e) => set("objectives", e.target.value)} />
              <label className="qr-lbl">"Specifically, this UPR Report seeks to:" (one per line)</label>
              <textarea className="ix-input" rows={4} value={d.objectives_list} onChange={(e) => set("objectives_list", e.target.value)} />
            </details>
            <details><summary>B. Unit Profile</summary>
              <textarea className="ix-input" rows={8} value={d.profile} onChange={(e) => set("profile", e.target.value)} />
            </details>
            <details><summary>C. Quality Objectives of the Office <small>(one per line)</small></summary>
              <textarea className="ix-input" rows={7} value={d.quality} onChange={(e) => set("quality", e.target.value)} />
            </details>
          </div>
          <label className="qr-lbl">Functional structure of the Office (picture)</label>
          <Photos onError={(text) => setMsg({ type: "error", text })} list={d.structure ? [d.structure] : []} max={1} onChange={(l) => set("structure", l[0] || null)} />
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
        {t.t1.some((r) => r.deployed < r.enrolled) && !String(d.t1_note || "").trim() && (
          <button type="button" className="qr-sugg" onClick={() => set("t1_note", `${t.t1.filter((r) => r.deployed < r.enrolled).map((r) => `${r.enrolled - r.deployed} ${r.p} student${r.enrolled - r.deployed === 1 ? " was" : "s were"}`).join(" and ")} not yet deployed during the ${qLong}.`)}>
            <Icon name="pencil" size={13} /> Write the note for me</button>
        )}
        <Checked on={checked("s2a")} onChange={(v) => check("s2a", v)} />
      </Sec>
      )}

      {/* 2.B partnerships */}
      {sec === "s2b" && (
      <Sec n="2.B" title="Strengthening Industry and Institutional Partnerships">
        {htePick.length > 0 && (
          <div className="qr-from">
            <div className="qr-from-h"><b>From Partner HTEs</b><small>Add an HTE as new or renewed; its MOA date is filled in. Fill in the notarized date.</small></div>
            <ul>{htePick.map((h) => (
              <li key={h.name}>
                <span><b>{h.name}</b><small>{h.valid ? `MOA valid until ${h.valid}` : "No MOA date yet"}</small></span>
                <button type="button" className="ix-b ghost sm" onClick={() => addRow("new_hte", { name: h.name, notarized: "", valid: h.valid })}>+ New</button>
                <button type="button" className="ix-b ghost sm" onClick={() => addRow("renewed", { name: h.name, expired: "", renewed: "", valid: h.valid })}>+ Renewed</button>
              </li>
            ))}</ul>
          </div>
        )}
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
                      {!MODALITIES.includes(r.mod) && <option>{r.mod}</option>}{MODALITIES.map((m) => <option key={m}>{m}</option>)}</select></td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        )}
        <p className="qr-hint">The modality comes from each intern's internship modality (on-site, hybrid, virtual or project-based). The category of an HTE is remembered for next time.{t.unplaced ? ` ${t.unplaced} intern${t.unplaced === 1 ? "" : "s"} with no placement set are not listed.` : ""}</p>
        <textarea className="ix-input" rows={2} placeholder="Note under the table (optional)" value={d.deploy_note} onChange={(e) => set("deploy_note", e.target.value)} />
        {t.t4.length > 0 && <Checked on={checked("s2c")} onChange={(v) => check("s2c", v)} />}
        <Sub>Pre-Deployment Orientation</Sub>
        <Photos onError={(text) => setMsg({ type: "error", text })} list={d.orientation_photos} max={3} onChange={(l) => set("orientation_photos", l)} />
        <textarea className="ix-input" rows={5} placeholder="What the orientation covered (policies, requirements, do's and don'ts, GAD session…)" value={d.orientation} onChange={(e) => set("orientation", e.target.value)} />
      </Sec>
      )}

      {/* 2.D monitoring */}
      {sec === "s2d" && (
      <Sec n="2.D" title="Monitoring, Supervision, and Student Support">
        <div className="qr-from">
          <div className="qr-from-h"><b>Written from this quarter's data</b><small>Use it as it is, or add your monitoring visits after it.</small></div>
          <p className="qr-suggp">{monitorText}</p>
          <button type="button" className="ix-b ghost sm" onClick={() => set("monitoring", filled(d.monitoring) ? `${d.monitoring.trim()}\n\n${monitorText}` : monitorText)}>
            {filled(d.monitoring) ? "+ Add it below my text" : "Use this text"}</button>
        </div>
        <label className="qr-lbl">Were there monitoring visits? Where, why, and what was found?</label>
        <textarea className="ix-input" rows={5} placeholder="e.g. Visited DICT Caraga on May 5 to check the interns' tasks and talk with their supervisor…" value={d.monitoring} onChange={(e) => set("monitoring", e.target.value)} />
        <Photos onError={(text) => setMsg({ type: "error", text })} list={d.monitoring_photos} max={6} onChange={(l) => set("monitoring_photos", l)} />
      </Sec>
      )}

      {/* 2.E activities */}
      {sec === "s2e" && (
      <Sec n="2.E" title="Highlights of Activities Conducted">
        <textarea className="ix-input" rows={2} value={d.activities_intro} onChange={(e) => set("activities_intro", e.target.value)} />
        <div className="qr-from">
          <div className="qr-from-h"><b>From this quarter's calendar and announcements</b><small>School events on the Calendar and announcements you posted. Tick the ones that belong in the report, then add photos.</small></div>
          {fromFeed.length === 0 ? <p className="qr-suggp mut">No school events or announcements from {srv.period?.from} to {srv.period?.to}.</p> : (
            <ul>{fromFeed.map((f) => {
              const on = usedSrc.has(f.src);
              return (
                <li key={f.src}>
                  <label className="qr-tick"><input type="checkbox" checked={on} onChange={() => set("activities", on
                    ? d.activities.filter((a) => a.src !== f.src)
                    : [...d.activities.filter((a) => filled(a.title) || filled(a.text) || (a.photos || []).length), { src: f.src, title: f.title, text: f.text, photos: [] }])} />
                    <span><b>{f.title}</b><small>{f.kind} · {f.date}</small></span></label>
                </li>
              );
            })}</ul>
          )}
        </div>
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
        <Guide onCopy={() => copyPrevious(["best_intro", "best"])} ideas={IDEAS.best.filter((x) => !has("best", x.title))} label={(x) => x.title} onIdea={(x) => addIdea("best", x)} />
        <textarea className="ix-input" rows={2} value={d.best_intro} onChange={(e) => set("best_intro", e.target.value)} />
        {d.best.map((b, i) => (
          <div key={i} className="qr-item">
            <label className="qr-q"><em>{"abcdefghij"[i] || i + 1}</em> What worked well this quarter?</label>
            <input className="ix-input" placeholder="e.g. Conducted the Student Internship Debriefing Program" value={b.title} onChange={(e) => setRow("best", i, "title", e.target.value)} />
            <label className="qr-q">What exactly was done, and how did it help?</label>
            <textarea className="ix-input" rows={3} placeholder="One or two sentences are enough" value={b.text} onChange={(e) => setRow("best", i, "text", e.target.value)} />
            <button type="button" className="qr-x" aria-label="Remove" onClick={() => delRow("best", i)}>×</button>
          </div>
        ))}
        <button type="button" className="ix-b ghost sm" onClick={() => addRow("best", { title: "", text: "" })}>+ Add best practice</button>
      </Sec>
      )}

      {/* 4 challenges */}
      {sec === "s4" && (
      <Sec n="4" title="Challenges Encountered and Solutions Implemented">
        <Guide onCopy={() => copyPrevious(["challenges_intro", "challenges"])} ideas={IDEAS.challenges.filter((x) => !has("challenges", x.challenge))} label={(x) => x.challenge} onIdea={(x) => addIdea("challenges", x)} note="★ = found in this quarter's data (MOA dates, supervisor assignments)." />
        <textarea className="ix-input" rows={2} value={d.challenges_intro} onChange={(e) => set("challenges_intro", e.target.value)} />
        {d.challenges.map((c, i) => (
          <div key={i} className="qr-item three">
            <div><label className="qr-q">What problem came up?</label>
              <textarea className="ix-input" rows={3} placeholder="e.g. Late submission of requirements" value={c.challenge} onChange={(e) => setRow("challenges", i, "challenge", e.target.value)} /></div>
            <div><label className="qr-q">Who or what did it affect?</label>
              <textarea className="ix-input" rows={3} placeholder="e.g. 5 interns missed the deadline" value={c.description} onChange={(e) => setRow("challenges", i, "description", e.target.value)} /></div>
            <div><label className="qr-q">What did you do about it?</label>
              <textarea className="ix-input" rows={3} placeholder="e.g. Sent reminders and set clear due dates" value={c.solution} onChange={(e) => setRow("challenges", i, "solution", e.target.value)} /></div>
            <button type="button" className="qr-x" aria-label="Remove" onClick={() => delRow("challenges", i)}>×</button>
          </div>
        ))}
        <button type="button" className="ix-b ghost sm" onClick={() => addRow("challenges", { challenge: "", description: "", solution: "" })}>+ Add challenge</button>
      </Sec>
      )}

      {/* 5 plans */}
      {sec === "s5" && (
      <Sec n="5" title="Future Plans and Initiatives">
        <Guide onCopy={() => copyPrevious(["plans_intro", "plans", "closing"])} ideas={IDEAS.plans.filter((x) => !has("plans", x.title))} label={(x) => x.title} onIdea={(x) => addIdea("plans", x)} />
        <textarea className="ix-input" rows={2} value={d.plans_intro} onChange={(e) => set("plans_intro", e.target.value)} />
        {d.plans.map((g, i) => (
          <div key={i} className="qr-item">
            <label className="qr-q"><em>{"abcdefghij"[i] || i + 1}</em> What will the college do next?</label>
            <input className="ix-input" placeholder="e.g. Expand local and international internship opportunities" value={g.title} onChange={(e) => setRow("plans", i, "title", e.target.value)} />
            <label className="qr-q">How, and by when?</label>
            <textarea className="ix-input" rows={3} placeholder="One or two sentences are enough" value={g.text} onChange={(e) => setRow("plans", i, "text", e.target.value)} />
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
          : <span className="qr-end"><button type="button" className="ix-b ghost" onClick={word}><Icon name="download" size={14} /> Download Word</button>
            <button type="button" className="ix-b primary" onClick={print}><Icon name="print" size={14} /> Print / PDF</button></span>}
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
/* "Copy from another quarter": pick a saved quarter, see what it has, tick the parts to copy.
   The counted parts (2.A, 2.C tables, 2.D) are never copied: the system counts them again for this quarter. */
const COPY_PARTS = [
  { id: "p1", label: "1 · Objectives, unit profile and quality objectives", keys: ["objectives", "objectives_list", "profile", "structure", "quality"],
    peek: (s) => (s.structure ? "Text and the structure picture" : "Text (no structure picture)") },
  { id: "p2c", label: "2.C · HTE categories and modalities", keys: ["hte_cat", "hte_mod"],
    peek: (s) => `${Object.keys(s.hte_cat || {}).length} HTE${Object.keys(s.hte_cat || {}).length === 1 ? "" : "s"} with a category` },
  { id: "p3", label: "3 · Best practices", keys: ["best_intro", "best"], peek: (s) => titles(s.best, "title") },
  { id: "p4", label: "4 · Challenges and solutions", keys: ["challenges_intro", "challenges"], peek: (s) => titles(s.challenges, "challenge") },
  { id: "p5", label: "5 · Future plans and initiatives", keys: ["plans_intro", "plans", "closing"], peek: (s) => titles(s.plans, "title") },
  { id: "ps", label: "Prepared by / Noted by", keys: ["prepared", "noted"],
    peek: (s) => [s.prepared?.name, s.noted?.name].filter((x) => String(x || "").trim()).join(" · ") || "Empty" },
];
function titles(list, k) {
  const t = (list || []).map((x) => String(x?.[k] || "").trim()).filter(Boolean);
  return t.length ? `${t.length}: ${t.slice(0, 2).join("; ")}${t.length > 2 ? "; …" : ""}` : "Empty";
}
const hasPart = (s, p) => p.keys.some((k) => {
  const v = s?.[k];
  if (Array.isArray(v)) return v.some((x) => Object.values(x || {}).some((y) => String(y || "").trim()));
  if (v && typeof v === "object") return Object.values(v).some((y) => String(y || "").trim());
  return String(v || "").trim() !== "";
});
function CopyDrawer({ year, quarter, nowYear, onClose, onCopy }) {
  const [sy, setSy] = useState(quarter === 1 ? year - 1 : year);
  const [sq, setSq] = useState(quarter === 1 ? 4 : quarter - 1);
  const [src, setSrc] = useState(undefined);   // undefined = loading, null = nothing saved
  const [pick, setPick] = useState({});
  useEffect(() => {
    let off = false;
    setSrc(undefined);
    fetch(`${API}/coordinator/quarterly-report?year=${sy}&quarter=${sq}`, { headers: { Accept: "application/json" } })
      .then((r) => r.json()).then((j) => {
        if (off) return;
        const data = j?.data ? (j.data.v === 2 ? j.data : fromOld(j.data)) : null;
        setSrc(data);
        setPick(Object.fromEntries(COPY_PARTS.map((p) => [p.id, !!data && hasPart(data, p)])));
      }).catch(() => { if (!off) setSrc(null); });
    return () => { off = true; };
  }, [sy, sq]);
  const same = sy === year && sq === quarter;
  const chosen = COPY_PARTS.filter((p) => pick[p.id]);
  const label = `the ${Q_WORD[sq - 1]} quarter of ${sy}`;
  return (
    <Drawer inPage icon="file" kicker="Quarterly Report" title="Copy from another quarter" onClose={onClose}
      footer={(close) => (<>
        <button type="button" className="ix-b ghost" onClick={close}>Cancel</button>
        <button type="button" className="ix-b primary" disabled={!src || same || !chosen.length}
          onClick={() => onCopy(src, chosen.flatMap((p) => p.keys), label)}>
          Copy {chosen.length || ""} part{chosen.length === 1 ? "" : "s"}</button>
      </>)}>
      <div className="qr-cp">
        <p className="qr-cp-lead">Start this quarter from a report you already saved. Pick the quarter, tick the parts you want, then edit what changed.</p>
        <div className="qr-cp-row">
          <div className="ix-field"><label>Copy from year</label>
            <select className="ix-select" value={sy} onChange={(e) => setSy(Number(e.target.value))}>
              {Array.from({ length: 6 }, (_, i) => nowYear - 4 + i).map((y) => <option key={y}>{y}</option>)}
            </select></div>
          <div className="ix-field"><label>Quarter</label>
            <select className="ix-select" value={sq} onChange={(e) => setSq(Number(e.target.value))}>
              {[1, 2, 3, 4].map((q) => <option key={q} value={q}>{Q_WORD[q - 1]} quarter</option>)}
            </select></div>
        </div>
        {same ? <div className="qr-cp-none">This is the quarter you are working on. Pick another one.</div>
          : src === undefined ? <Spinner />
          : src === null ? <div className="qr-cp-none">Nothing saved for {label}. Pick another quarter.</div>
          : (<>
            <small className="qr-cp-h">Parts to copy</small>
            {COPY_PARTS.map((p) => {
              const has = hasPart(src, p);
              return (
                <label key={p.id} className={`qr-cp-part${has ? "" : " off"}`}>
                  <input type="checkbox" disabled={!has} checked={!!pick[p.id]} onChange={(e) => setPick((x) => ({ ...x, [p.id]: e.target.checked }))} />
                  <span><b>{p.label}</b><small>{has ? p.peek(src) : "Nothing saved in this part"}</small></span>
                </label>
              );
            })}
            <small className="qr-cp-note">The ticked parts replace what this quarter has now. The counted numbers (2.A, the interns per HTE in 2.C, and 2.D) are never copied: the system counts them again for this quarter. MOAs and activities (2.B, 2.E) are not copied either, because they change every quarter.</small>
          </>)}
      </div>
    </Drawer>
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
// "the system counted this: does it look right?"
function Checked({ on, onChange }) {
  return on
    ? <div className="qr-chk on"><Icon name="check" size={14} /> You checked this table. <button type="button" onClick={() => onChange(false)}>Undo</button></div>
    : <div className="qr-chk"><span>The system counted this table. Does it look right?</span><button type="button" className="ix-b primary sm" onClick={() => onChange(true)}><Icon name="check" size={14} /> Looks right</button></div>;
}
// short guide above sections 3–5: copy last quarter's, or start from an idea
function Guide({ onCopy, ideas, label, onIdea, note }) {
  return (
    <div className="qr-guide">
      <div className="qr-guide-h"><span>Answer the questions below; the report puts your answers in its format.</span>
        <button type="button" className="ix-b ghost sm" onClick={onCopy}>Use last quarter's</button></div>
      {ideas.length > 0 && (
        <div className="qr-ideas"><small>Found in this quarter&apos;s records:</small>
          {ideas.map((x) => <button key={label(x)} type="button" className={x.sys ? "sys" : ""} onClick={() => onIdea(x)}>{x.sys ? "★" : "+"} {label(x)}</button>)}
          {note && ideas.some((x) => x.sys) && <small className="mut">{note}</small>}
        </div>
      )}
    </div>
  );
}

/* the report as a Word file: one web page with its pictures inside (MHTML), which Word opens and can save as .docx */
const b64utf8 = (str) => { const bytes = new TextEncoder().encode(str); let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(bin); };
const wrap76 = (b) => b.replace(/.{1,76}/g, "$&\r\n");
async function wordFile(html) {
  const parts = [];
  const srcs = [...new Set([...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]))];
  for (const src of srcs) {
    let mime = "image/png", data = "";
    const m = /^data:([^;]+);base64,(.*)$/.exec(src);
    if (m) { mime = m[1]; data = m[2]; }
    else {
      const blob = await fetch(src).then((r) => (r.ok ? r.blob() : null)).catch(() => null);
      if (!blob || !/^image\//.test(blob.type)) { html = html.split(`src="${src}"`).join('src="" style="display:none"'); continue; }
      mime = blob.type;
      data = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.readAsDataURL(blob); });
    }
    const name = `file:///C:/mytrack/image${parts.length + 1}.${(mime.split("/")[1] || "png").replace("jpeg", "jpg")}`;
    parts.push({ src, name, mime, data });
  }
  parts.forEach((p) => { html = html.split(`src="${p.src}"`).join(`src="${p.name}"`); });
  const B = "----=_MYTRACK_REPORT";
  const out = [
    "MIME-Version: 1.0", `Content-Type: multipart/related; boundary="${B}"; type="text/html"`, "",
    `--${B}`, "Content-Type: text/html; charset=\"utf-8\"", "Content-Transfer-Encoding: base64", "Content-Location: file:///C:/mytrack/report.htm", "",
    wrap76(b64utf8(html)),
    ...parts.flatMap((p) => [`--${B}`, `Content-Type: ${p.mime}`, "Content-Transfer-Encoding: base64", `Content-Location: ${p.name}`, "", wrap76(p.data)]),
    `--${B}--`, "",
  ].join("\r\n");
  return new Blob([out], { type: "application/msword" });
}

/* ───────── the printed report (same layout as the 2026 CCIS template, F-PLN-006 Rev.003) ───────── */
function reportHtml({ year, quarter, d, t, word = false }) {
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

  const content = `${bar("1. A. Objectives")}
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
`;
  if (word) return wordHtml({ year, quarter, qName, content, logo: abs(csuLogo), bp: abs(bpLogo), iso: abs(isoLogo) });

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
  .cover .logos { display: flex; align-items: center; gap: 12px; }
  .cover .logos img { height: 70px; } .cover .logos img.bp { height: 58px; } .cover .logos img.iso { height: 54px; }
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
  <div class="logos"><img src="${abs(csuLogo)}" alt=""><img class="bp" src="${abs(bpLogo)}" alt=""><img class="iso" src="${abs(isoLogo)}" alt=""></div>
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
${content}
</td></tr></tbody></table>
</body></html>`;
}

/* the same report for Word: no page decorations (Word can't place them), a simple cover, the same sections */
function wordHtml({ year, quarter, qName, content: raw, logo, bp, iso }) {
  // Word ignores display:block on <b>, so the signatories get their own lines
  const content = raw.replace(/<div>(Prepared by:|Noted by:)<b>([\s\S]*?)<\/b>([\s\S]*?)<\/div>/g, '<p>$1</p><p><br><br><b>$2</b><br>$3</p>');
  const boxes = Q_NAMES.map((n, i) => `<p class="qb">${i + 1 === quarter ? "&#9632;" : "&#9633;"} ${n} QUARTER</p>`).join("");
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>Unit Performance Review Report - ${qName}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
  @page Section1 { size: 8.27in 11.69in; margin: 1in 0.9in 1in 1in; mso-header-margin: .5in; mso-footer-margin: .5in; }
  div.Section1 { page: Section1; }
  body { font-family: Arial, sans-serif; font-size: 10.5pt; color: #111; }
  p { margin: 0 0 6pt; text-align: justify; line-height: 1.35; }
  .cover { text-align: center; }
  .cover h1 { margin: 90pt 0 6pt; font-family: Georgia, serif; font-size: 26pt; color: #4f8a2a; }
  .cover .year { font-family: "Times New Roman", serif; font-size: 22pt; font-weight: bold; margin: 18pt 0; text-align: center; }
  .cover .qb { text-align: center; font-size: 13pt; margin: 2pt 0; }
  .cover .band { margin-top: 60pt; padding: 10pt; background: #4f8a2a; color: #f4e7a1; font-family: "Times New Roman", serif; font-size: 15pt; text-align: center; }
  .cover .form { margin-top: 30pt; font-family: "Courier New", monospace; font-size: 9pt; text-align: left; }
  .bar { margin: 14pt 0 8pt; padding: 4pt 6pt; background: #6abf45; color: #fff; font-family: Verdana, sans-serif; font-weight: bold; font-size: 12pt; text-transform: uppercase; }
  .ybar { margin: 12pt 0 6pt 14pt; padding: 3pt 6pt; background: #f7e36b; color: #2f6f2c; font-family: Verdana, sans-serif; font-weight: bold; font-size: 11pt; }
  .sub { margin: 10pt 0 4pt 14pt; font-weight: bold; }
  .in, .act { margin-left: 14pt; }
  .cap { font-size: 10pt; margin: 8pt 0 2pt; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; margin-bottom: 6pt; }
  th { border: 1px solid #333; padding: 3pt 5pt; font-weight: bold; text-align: center; }
  td { border: 1px solid #333; padding: 2pt 5pt; vertical-align: top; text-align: left; }
  td p { text-align: left; }
  table.light th { background: #f2f2f2; text-align: left; }
  tr.grp td { background: #f7d94c; font-weight: bold; }
  .c { text-align: center; }
  .figs { text-align: center; margin: 6pt 0; }
  .figs figure { display: inline-block; margin: 4pt; text-align: center; }
  .figs img { width: 3in; } .figs.one img { width: 5in; }
  .figs figcaption { font-size: 9pt; }
  .struct { text-align: center; } .struct img { width: 6in; }
  .plan b { display: block; margin: 6pt 0 3pt; }
  .sign { margin-top: 30pt; } .sign div { margin-bottom: 26pt; } .sign b { display: block; margin-top: 24pt; text-transform: uppercase; }
</style></head><body><div class="Section1">
<div class="cover">
  <p style="text-align:left"><img src="${logo}" width="50" height="70" alt="">&nbsp;&nbsp;<img src="${bp}" width="61" height="58" alt="">&nbsp;&nbsp;<img src="${iso}" width="92" height="54" alt=""></p>
  <h1>UNIT PERFORMANCE<br>REVIEW REPORT</h1>
  <p class="year">${year}</p>
  ${boxes}
  <p class="band">COLLEGE OF COMPUTING AND<br>INFORMATION SCIENCES</p>
  <p class="form">F-PLN-006, Rev.003, 08/30/2024</p>
</div>
<br clear="all" style="page-break-before:always">
${content}
</div></body></html>`;
}

const QR_CSS = `
.qr-lacts { display: inline-flex; gap: 8px; justify-content: flex-end; width: 100%; }
.qr-view { background: #eef0f3; border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px 16px 4px; margin-top: 12px; overflow-x: auto; }
.qr-view-n { text-align: center; font-size: 12px; font-weight: 600; color: #6b7280; margin-bottom: 8px; }
.qr-view iframe { display: block; width: 100%; min-width: 820px; border: 0; background: transparent; }
.qr-viewnote { display: flex; gap: 6px; align-items: center; margin-top: 12px; font-size: 13px; color: #92400e; background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 9px 12px; }
.qr-edit1 details > textarea, .qr-edit1 details > .qr-lbl { margin-top: 8px; }
.qr-edit1 summary small { font-weight: 500; color: #9ca3af; }
.qr-listhead { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.qr-listhead p { margin: 0; color: #6b7280; font-size: 13.5px; }
.qr-lq { display: flex; flex-direction: column; gap: 2px; } .qr-lq small, .qr-lst small { color: #9ca3af; font-size: 12px; }
.qr-lst { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.qr-newq { display: grid; gap: 12px; } .qr-newq .ix-field { margin: 0; }
.qr-newq-note { display: flex; gap: 6px; align-items: center; margin: 0; font-size: 13px; color: #92400e; background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 8px 10px; }
.qr-newq-btns { display: flex; justify-content: flex-end; gap: 8px; }
.qr-title { display: grid; grid-template-columns: auto auto; justify-content: start; align-items: center; column-gap: 10px; row-gap: 6px; min-width: 0; }
.qr-title .qr-back { grid-column: 1 / -1; }
.qr-title h3 { margin: 0; font-size: 17px; text-transform: capitalize; } .qr-title h3 small { font-size: 12.5px; font-weight: 500; color: #9ca3af; text-transform: none; margin-left: 4px; }
.qr-back { display: inline-flex; align-items: center; gap: 6px; justify-self: start; border: 0; background: none; padding: 0; font: inherit; font-size: 13px; font-weight: 600; color: #ea580c; cursor: pointer; }
.qr-back:hover { text-decoration: underline; }
  .ix-page .qr { display: flex; flex-direction: column; gap: 14px; }
  .ix-page .ix-content .qr-bar { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px 16px; flex-wrap: wrap; padding: 14px 18px !important; }
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
  .ix-page .qr-fixed-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
  .ix-page .qr-fixed-top .qr-hint { margin: 0; }
  .ix-page .qr-fixed-top .ix-b { flex: none; }
  .ix-page .qr-todo { display: flex; align-items: center; gap: 8px; margin: 10px 0 4px; padding: 8px 12px; border-radius: 10px; font-size: 13px; font-weight: 600;
    background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
  .ix-page .qr-read { display: flex; flex-direction: column; gap: 8px; margin: 10px 0 12px; }
  .ix-page .qr-read details { border: 1px solid #eceff3; border-radius: 12px; padding: 10px 14px; background: #fafbfc; }
  .ix-page .qr-read summary { cursor: pointer; font-size: 14px; font-weight: 700; color: #3f7d20; }
  .ix-page .qr-read p, .ix-page .qr-read li { font-size: 13.5px; line-height: 1.6; color: #374151; margin: 8px 0 0; }
  .ix-page .qr-read ol, .ix-page .qr-read ul { margin: 6px 0 0; padding-left: 20px; }
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
  .qr-cp { display: flex; flex-direction: column; gap: 12px; }
  .qr-cp-lead { margin: 0; font-size: 13px; color: #475569; line-height: 1.5; }
  .qr-cp-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .qr-cp-h { font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #64748b; margin-top: 4px; }
  .qr-cp-part { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 10px; cursor: pointer; background: #fff; }
  .qr-cp-part:has(input:checked) { border-color: #e8582a; background: #fff8f4; }
  .qr-cp-part.off { opacity: .55; cursor: default; }
  .qr-cp-part input { margin-top: 3px; accent-color: #e8582a; }
  .qr-cp-part span { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .qr-cp-part b { font-size: 13px; color: #111827; } .qr-cp-part small { font-size: 12px; color: #64748b; overflow-wrap: anywhere; }
  .qr-cp-none { padding: 14px; border-radius: 10px; background: #f8fafc; border: 1px dashed #d6d9de; font-size: 13px; color: #475569; text-align: center; }
  .qr-cp-note { font-size: 12px; color: #64748b; line-height: 1.5; }
  .ix-page .qr-job { display: inline-block; margin-left: 6px; padding: 1px 7px; border-radius: 99px; font-size: 10.5px; font-weight: 700; vertical-align: 1px; }
  .ix-page .qr-nav-i span .qr-job { display: table; margin: 3px 0 0; }
  .ix-page .qr-job.check { background: #e8f1fe; color: #1d4ed8; } .ix-page .qr-job.write { background: #fff1ea; color: #c2410c; } .ix-page .qr-job.sign { background: #e6f7ee; color: #15803d; }
  .ix-page .qr-steps { display: flex; flex-direction: column; gap: 5px; padding: 0 2px 12px; margin-bottom: 10px; border-bottom: 1px solid #eef0f4; font-size: 12.5px; color: #475569; }
  .ix-page .qr-steps b { font-size: 13px; color: #111827; } .ix-page .qr-steps .qr-job { margin: 0 4px 0 0; min-width: 40px; text-align: center; }
  .ix-page .qr-how { display: flex; align-items: baseline; gap: 6px; margin: 0 0 12px; padding: 10px 14px; border-radius: 10px; font-size: 13px; line-height: 1.45; color: #334155; background: #f8fafc; border: 1px solid #eef0f4; }
  .ix-page .qr-how .qr-job { margin: 0; flex: none; }
  .ix-page .qr-nav-i { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border: 0; border-radius: 9px; background: transparent;
    font: inherit; font-size: 13.5px; line-height: 1.3; color: #374151; text-align: left; cursor: pointer; }
  .ix-page .qr-nav-i span { flex: 1; min-width: 0; }
  .ix-page .qr-nav-i > em, .ix-page .qr-nav-g em { flex: none; width: 18px; font-style: normal; font-weight: 700; color: #9ca3af; font-size: 12.5px; }
  .ix-page .qr-nav-i.sub { padding-left: 24px; font-size: 13px; }
  .ix-page .qr-nav-i:hover { background: #f8f9fb; }
  .ix-page .qr-nav-i.on { background: #fff4ee; color: #c2410c; font-weight: 700; }
  .ix-page .qr-nav-i.on > em { color: #e8582a; }
  .ix-page .qr-nav-g { display: flex; align-items: center; gap: 10px; padding: 10px 10px 4px; font-size: 13.5px; font-weight: 700; color: #1f2937; }
  .ix-page .qr-nav-i > i, .ix-page .qr-nav-key i { width: 18px; height: 18px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
    font-style: normal; font-size: 10.5px; font-weight: 800; flex: none; }
  .ix-page .qr-nav-i > i.ok, .ix-page .qr-nav-key i.ok { background: #16a34a; color: #fff; }
  .ix-page .qr-nav-i > i.part, .ix-page .qr-nav-key i.part { background: #fde68a; color: #92400e; }
  .ix-page .qr-nav-i > i.none, .ix-page .qr-nav-key i.none { background: transparent; border: 1.5px solid #d6dae1; }
  .ix-page .qr-nav-key { display: flex; align-items: center; gap: 6px 14px; flex-wrap: wrap; margin: 12px 10px 0; padding-top: 10px; border-top: 1px solid #f1f3f6; font-size: 11.5px; color: #94a3b8; }
  .ix-page .qr-nav-key > span { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
  .ix-page .qr-nav-key i { width: 14px; height: 14px; font-size: 8.5px; flex: none; }
  .ix-page .qr-main { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
  .ix-page .qr-row { justify-content: space-between !important; }
  @media (max-width: 900px) { .ix-page .qr-layout { grid-template-columns: 1fr; } .ix-page .ix-content .qr-nav { position: static; } }

  .ix-page .qr-sec > .ix-b { align-self: flex-start; }
  /* left to do */
  .ix-page .qr-left { margin: 0 4px 10px; padding: 10px 12px; border-radius: 10px; background: #fffbeb; border: 1px solid #fde68a; font-size: 12.5px; }
  .ix-page .qr-left.ok { background: #f0fdf4; border-color: #bbf7d0; color: #15803d; }
  .ix-page .qr-left b { display: block; margin-bottom: 4px; color: #92400e; } .ix-page .qr-left.ok b { color: #15803d; margin: 0; }
  .ix-page .qr-left ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .ix-page .qr-left li button { border: 0; background: none; padding: 2px 0; font: inherit; font-size: 12px; color: #78350f; text-align: left; cursor: pointer; }
  .ix-page .qr-left li button:hover { color: #c2410c; text-decoration: underline; }
  .ix-page .qr-left small { color: #a16207; }
  /* "the system counted this" check */
  .ix-page .qr-chk { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; border-radius: 10px; background: #fffbeb; border: 1px solid #fde68a; font-size: 13px; color: #92400e; font-weight: 600; }
  .ix-page .qr-chk.on { justify-content: flex-start; background: #f0fdf4; border-color: #bbf7d0; color: #15803d; }
  .ix-page .qr-chk.on button { border: 0; background: none; font: inherit; font-size: 12.5px; color: #64748b; text-decoration: underline; cursor: pointer; margin-left: auto; }
  /* suggestions from the system */
  .ix-page .qr-from { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: 12px; background: #f6faf2; border: 1px solid #dcebcf; }
  .ix-page .qr-from-h { display: flex; flex-direction: column; gap: 2px; } .ix-page .qr-from-h b { font-size: 13.5px; color: #2f6f2c; } .ix-page .qr-from-h small { font-size: 12px; color: #4b5563; }
  .ix-page .qr-from ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .ix-page .qr-from li { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 10px; background: #fff; border: 1px solid #e5eedc; }
  .ix-page .qr-from li > span { flex: 1; min-width: 0; display: flex; flex-direction: column; } .ix-page .qr-from li small, .ix-page .qr-tick small { font-size: 12px; color: #6b7280; }
  .ix-page .qr-tick { flex: 1; display: flex; align-items: center; gap: 10px; cursor: pointer; } .ix-page .qr-tick > span { display: flex; flex-direction: column; }
  .ix-page .qr-tick input { width: 17px; height: 17px; accent-color: #e8582a; }
  .ix-page .qr-suggp { margin: 0; font-size: 13px; line-height: 1.55; color: #374151; } .ix-page .qr-suggp.mut { color: #94a3b8; }
  .ix-page .qr-from > .ix-b, .ix-page .qr-sugg { align-self: flex-start; }
  .ix-page .qr-sugg { display: inline-flex; align-items: center; gap: 6px; border: 0; background: none; padding: 0; font: inherit; font-size: 12.5px; font-weight: 700; color: #ea580c; cursor: pointer; }
  /* guided questions */
  .ix-page .qr-guide { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border-radius: 12px; background: #fafbfc; border: 1px solid #eef0f4; }
  .ix-page .qr-guide-h { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12.5px; color: #4b5563; }
  .ix-page .qr-ideas { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; } .ix-page .qr-ideas small { font-size: 12px; color: #6b7280; font-weight: 600; } .ix-page .qr-ideas small.mut { font-weight: 500; color: #94a3b8; width: 100%; }
  .ix-page .qr-ideas button { border: 1px dashed #f0b896; background: #fff9f5; color: #c2410c; border-radius: 99px; padding: 4px 10px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
  .ix-page .qr-ideas button:hover { background: #fff1e8; }
  .ix-page .qr-ideas button.sys { border-style: solid; border-color: #fcd34d; background: #fffbeb; color: #92400e; }
  .ix-page .qr-from li b, .ix-page .qr-tick b { font-size: 13.5px !important; font-weight: 700; color: #1f2937; line-height: 1.3; }
  .ix-page .qr-q { font-size: 12.5px; font-weight: 700; color: #374151; display: flex; align-items: center; gap: 6px; }
  .ix-page .qr-q em { font-style: normal; width: 20px; height: 20px; border-radius: 6px; background: #4d9a2a; color: #fff; font-size: 11px; display: inline-flex; align-items: center; justify-content: center; }
  .ix-page .qr-item.three > div { display: flex; flex-direction: column; gap: 6px; }
  .ix-page .qr-end { display: inline-flex; gap: 8px; }
`;