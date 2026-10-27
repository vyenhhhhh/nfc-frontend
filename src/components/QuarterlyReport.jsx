//QuarterlyReport.jsx
// Coordinator → Reports → Quarterly Report: the CCIS "Unit Performance Review Report".
// The deployment tables are counted from the quarter's attendance; everything else is typed here,
// saved per quarter, and printed (or saved as PDF) in the same layout as the college's template.
import { useState, useEffect, useMemo } from "react";
import { Icon, Msg, Spinner, programKey, esc } from "./DashKit.jsx";
import { API } from "../config.js";
import csuLogo from "../assets/csu-logo.png";
import ccisLogo from "../assets/logo.png";

const Q_NAMES = ["1ST", "2ND", "3RD", "4TH"];
const nowYear = Number(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }).slice(0, 4));
const nowQuarter = Math.floor((Number(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }).slice(5, 7)) - 1) / 3) + 1;

const blank = (me) => ({
  moa_intro: "",
  new_hte: [],                 // { name, entered, notarized, valid }
  moa_note: "",
  ongoing: [],                 // { agency, initiated }
  within: {},                  // placement name → true/false (inside the university), when changed by hand
  deployed_note: "",
  within_note: "",
  highlights: "",
  photos: [],                  // { src (small JPEG), caption }
  best_intro: "In line with the targets of the Office of the Student Internship Program, the Internship Coordinator of the College of Computing and Information Sciences (CCIS) focused on:",
  best: [{ title: "", text: "" }],
  challenges_intro: "",
  challenges: [{ challenge: "", solutions: "" }],
  goals_intro: "",
  goals: [{ title: "", text: "" }],
  goals_outro: "",
  prepared: { name: me?.name || "", title: "College of Computing and Information Sciences SIP Coordinator" },
  noted: { name: "", title: "Dean, College of Computing and Information Sciences" },
});

// a photo → a small JPEG (keeps the saved report light)
const shrink = (file, max = 1100) => new Promise((resolve, reject) => {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    resolve(c.toDataURL("image/jpeg", 0.78));
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file is not a picture.")); };
  img.src = url;
});

export default function QuarterlyReport({ user }) {
  const [year, setYear] = useState(nowYear);
  const [quarter, setQuarter] = useState(nowQuarter);
  const [srv, setSrv] = useState(null);           // { period, interns, university_words, updated_at }
  const [d, setD] = useState(blank(user));
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
      setD({ ...blank(user), ...(j.data || {}) });
      setDirty(false);
    } catch (err) {
      setSrv({ interns: [], period: null, error: true });
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [year, quarter]);

  const set = (k, v) => { setD((x) => ({ ...x, [k]: v })); setDirty(true); };
  const setRow = (k, i, f, v) => set(k, d[k].map((r, j) => (j === i ? { ...r, [f]: v } : r)));
  const addRow = (k, row) => set(k, [...d[k], row]);
  const delRow = (k, i) => set(k, d[k].filter((_, j) => j !== i));

  // ── the numbers, from the quarter's attendance ──
  const words = srv?.university_words || ["CSU", "Caraga State University"];
  const autoWithin = (p) => words.some((w) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i").test(p));
  const isWithin = (p) => (d.within && p in d.within ? !!d.within[p] : autoWithin(p));
  const t = useMemo(() => {
    const list = srv?.interns || [];
    const placed = list.filter((i) => (i.placement || "").trim());
    const hte = placed.filter((i) => !isWithin(i.placement.trim()));
    const uni = placed.filter((i) => isWithin(i.placement.trim()));
    const count = (arr, key) => {
      const m = new Map();
      arr.forEach((i) => { const k = key(i); m.set(k, (m.get(k) || 0) + 1); });
      return [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
    };
    const byProgram = count(hte, (i) => programKey(i.program) || "No program");
    const byHte = count(hte, (i) => i.placement.trim());
    const byOffice = count(uni, (i) => i.placement.trim()).map(([office, n]) => [office,
      [...new Set(uni.filter((i) => i.placement.trim() === office).map((i) => programKey(i.program)).filter(Boolean))].join(" and "), n]);
    const places = count(placed, (i) => i.placement.trim()).map(([p, n]) => ({ p, n, within: isWithin(p) }));
    return { total: list.length, unplaced: list.length - placed.length, hte: hte.length, uni: uni.length, byProgram, byHte, byOffice, places };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srv, d.within]);

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

  // the write-ups that usually stay the same: best practices, challenges, goals, signatories
  const copyPrevious = async () => {
    const py = quarter === 1 ? year - 1 : year, pq = quarter === 1 ? 4 : quarter - 1;
    setBusy("copy"); setMsg(null);
    try {
      const res = await fetch(`${API}/coordinator/quarterly-report?year=${py}&quarter=${pq}`, { headers: { Accept: "application/json" } });
      const j = await res.json();
      if (!j?.data) throw new Error(`There is no saved report for the ${Q_NAMES[pq - 1].toLowerCase()} quarter of ${py}.`);
      const keep = ["ongoing", "within", "best_intro", "best", "challenges_intro", "challenges", "goals_intro", "goals", "goals_outro", "prepared", "noted"];
      setD((x) => ({ ...x, ...Object.fromEntries(keep.filter((k) => k in j.data).map((k) => [k, j.data[k]])) }));
      setDirty(true);
      setMsg({ type: "success", text: `Copied the best practices, challenges, goals and signatories from Q${pq} ${py}. Check them, then save.` });
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    } finally { setBusy(null); }
  };

  const addPhotos = async (files) => {
    const room = 6 - d.photos.length;
    const add = [];
    for (const f of [...files].slice(0, room)) {
      try { add.push({ src: await shrink(f), caption: "" }); } catch (err) { setMsg({ type: "error", text: err.message }); }
    }
    if (add.length) set("photos", [...d.photos, ...add]);
  };

  const print = () => {
    const w = window.open("", "_blank");
    if (!w) { setMsg({ type: "error", text: "Allow pop-ups for this site to print the report." }); return; }
    w.document.write(reportHtml({ year, quarter, d, t }));
    w.document.close();
    setTimeout(() => w.print(), 600);   // wait for the logos and photos
  };

  if (!srv) return <Spinner />;

  const Row = ({ children }) => <div className="qr-row">{children}</div>;
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
            {[1, 2, 3, 4].map((q) => <option key={q} value={q}>{Q_NAMES[q - 1]} quarter ({["Jan–Mar", "Apr–Jun", "Jul–Sep", "Oct–Dec"][q - 1]})</option>)}
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

      {/* 1.1 MOAs */}
      <section className="ix-card qr-sec">
        <h3><em>1.1</em> Notarized Memorandum of Agreements (MOAs) between CSU and partner agencies</h3>
        <textarea className="ix-input" rows={3} placeholder="What happened with partnerships / MOAs this quarter..." value={d.moa_intro} onChange={(e) => set("moa_intro", e.target.value)} />
        <h4>Table 1. New HTE partners initiated by CCIS</h4>
        <table className="qr-t">
          <thead><tr><th>Name of HTE</th><th>Date entered</th><th>Date notarized</th><th>Valid until</th><th /></tr></thead>
          <tbody>
            {d.new_hte.length === 0 && <tr><td colSpan={5} className="qr-none">None (prints as “NONE”)</td></tr>}
            {d.new_hte.map((r, i) => (
              <tr key={i}>
                <td><input className="ix-input" value={r.name} onChange={(e) => setRow("new_hte", i, "name", e.target.value)} /></td>
                <td><input type="date" className="ix-input" value={r.entered} onChange={(e) => setRow("new_hte", i, "entered", e.target.value)} /></td>
                <td><input type="date" className="ix-input" value={r.notarized} onChange={(e) => setRow("new_hte", i, "notarized", e.target.value)} /></td>
                <td><input type="date" className="ix-input" value={r.valid} onChange={(e) => setRow("new_hte", i, "valid", e.target.value)} /></td>
                <td><button type="button" className="qr-x" aria-label="Remove row" onClick={() => delRow("new_hte", i)}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="ix-b ghost sm" onClick={() => addRow("new_hte", { name: "", entered: "", notarized: "", valid: "" })}>+ Add HTE</button>
        <textarea className="ix-input" rows={2} placeholder="Notes on ongoing MOA reviews (optional)" value={d.moa_note} onChange={(e) => set("moa_note", e.target.value)} />
        <h4>Table 2. Initiated partner HTEs with ongoing review of MOA</h4>
        <table className="qr-t">
          <thead><tr><th>Agency</th><th>Date initiated</th><th /></tr></thead>
          <tbody>
            {d.ongoing.length === 0 && <tr><td colSpan={3} className="qr-none">None</td></tr>}
            {d.ongoing.map((r, i) => (
              <tr key={i}>
                <td><input className="ix-input" value={r.agency} onChange={(e) => setRow("ongoing", i, "agency", e.target.value)} /></td>
                <td><input type="date" className="ix-input" value={r.initiated} onChange={(e) => setRow("ongoing", i, "initiated", e.target.value)} /></td>
                <td><button type="button" className="qr-x" aria-label="Remove row" onClick={() => delRow("ongoing", i)}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="ix-b ghost sm" onClick={() => addRow("ongoing", { agency: "", initiated: "" })}>+ Add agency</button>
      </section>

      {/* 1.2 + 1.3 deployment: counted by the system */}
      <section className="ix-card qr-sec">
        <h3><em>1.2</em> Students deployed to HTE partners <span className="qr-auto">counted from attendance</span></h3>
        <p className="qr-hint">{t.total} intern{t.total === 1 ? "" : "s"} had attendance from {srv.period?.from} to {srv.period?.to}: {t.hte} at HTE partners, {t.uni} within the university{t.unplaced ? `, ${t.unplaced} with no placement set (not counted)` : ""}.</p>
        <div className="qr-two">
          <div>
            <h4>Table 3. Interns deployed per program</h4>
            <SmallTable head={["Program", "No. of students"]} rows={t.byProgram} total={t.hte} />
          </div>
          <div>
            <h4>Table 4. HTE offices where interns were placed</h4>
            <SmallTable head={["Name of HTE", "No. of students"]} rows={t.byHte} />
          </div>
        </div>
        <textarea className="ix-input" rows={2} placeholder="Note under the tables (optional)" value={d.deployed_note} onChange={(e) => set("deployed_note", e.target.value)} />

        <h3 style={{ marginTop: 18 }}><em>1.3</em> Students deployed within the university</h3>
        <textarea className="ix-input" rows={2} placeholder="e.g. With the requested internship program, students were allowed to take their OJT within the campus." value={d.within_note} onChange={(e) => set("within_note", e.target.value)} />
        <h4>Table 5. Interns with placement within the university</h4>
        <SmallTable head={["Office", "Program", "No. of students"]} rows={t.byOffice} total={t.uni} />
        {t.places.length > 0 && (
          <details className="qr-places">
            <summary>Which placements are inside the university? <span>(names with “{words.join("” or “")}” are, by default)</span></summary>
            <div className="qr-chips">
              {t.places.map(({ p, n, within }) => (
                <label key={p} className={within ? "on" : ""}>
                  <input type="checkbox" checked={within} onChange={(e) => set("within", { ...d.within, [p]: e.target.checked })} /> {p} <b>{n}</b>
                </label>
              ))}
            </div>
          </details>
        )}
      </section>

      {/* 1.4 highlights */}
      <section className="ix-card qr-sec">
        <h3><em>1.4</em> Highlights of the activities conducted</h3>
        <textarea className="ix-input" rows={6} placeholder="Activities, partnerships, monitoring done this quarter..." value={d.highlights} onChange={(e) => set("highlights", e.target.value)} />
        <div className="qr-photos">
          {d.photos.map((ph, i) => (
            <figure key={i}>
              <img src={ph.src} alt="" />
              <input className="ix-input" placeholder={`Figure ${i + 1}: caption`} value={ph.caption} onChange={(e) => setRow("photos", i, "caption", e.target.value)} />
              <button type="button" className="qr-x" aria-label="Remove photo" onClick={() => delRow("photos", i)}>×</button>
            </figure>
          ))}
          {d.photos.length < 6 && (
            <label className="qr-add-photo">
              <input type="file" accept="image/*" multiple hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
              <Icon name="camera" size={20} /> Add screenshot / photo
            </label>
          )}
        </div>
      </section>

      {/* 2 best practices */}
      <section className="ix-card qr-sec">
        <h3><em>2</em> Best practices</h3>
        <textarea className="ix-input" rows={2} value={d.best_intro} onChange={(e) => set("best_intro", e.target.value)} />
        {d.best.map((b, i) => (
          <div key={i} className="qr-item">
            <input className="ix-input" placeholder="e.g. Partnership Building" value={b.title} onChange={(e) => setRow("best", i, "title", e.target.value)} />
            <textarea className="ix-input" rows={3} placeholder="What was done" value={b.text} onChange={(e) => setRow("best", i, "text", e.target.value)} />
            <button type="button" className="qr-x" aria-label="Remove" onClick={() => delRow("best", i)}>×</button>
          </div>
        ))}
        <button type="button" className="ix-b ghost sm" onClick={() => addRow("best", { title: "", text: "" })}>+ Add best practice</button>
      </section>

      {/* 3 challenges */}
      <section className="ix-card qr-sec">
        <h3><em>3</em> Challenges encountered and solutions implemented</h3>
        <textarea className="ix-input" rows={2} placeholder="Introduction (optional)" value={d.challenges_intro} onChange={(e) => set("challenges_intro", e.target.value)} />
        {d.challenges.map((c, i) => (
          <div key={i} className="qr-item two">
            <textarea className="ix-input" rows={3} placeholder="Challenge" value={c.challenge} onChange={(e) => setRow("challenges", i, "challenge", e.target.value)} />
            <textarea className="ix-input" rows={3} placeholder="Solutions made (one per line)" value={c.solutions} onChange={(e) => setRow("challenges", i, "solutions", e.target.value)} />
            <button type="button" className="qr-x" aria-label="Remove" onClick={() => delRow("challenges", i)}>×</button>
          </div>
        ))}
        <button type="button" className="ix-b ghost sm" onClick={() => addRow("challenges", { challenge: "", solutions: "" })}>+ Add challenge</button>
      </section>

      {/* 4 goals */}
      <section className="ix-card qr-sec">
        <h3><em>4</em> Future goals and initiatives</h3>
        <textarea className="ix-input" rows={2} placeholder="Introduction (optional)" value={d.goals_intro} onChange={(e) => set("goals_intro", e.target.value)} />
        {d.goals.map((g, i) => (
          <div key={i} className="qr-item">
            <input className="ix-input" placeholder="e.g. Strengthen International Partnerships" value={g.title} onChange={(e) => setRow("goals", i, "title", e.target.value)} />
            <textarea className="ix-input" rows={2} placeholder="Details" value={g.text} onChange={(e) => setRow("goals", i, "text", e.target.value)} />
            <button type="button" className="qr-x" aria-label="Remove" onClick={() => delRow("goals", i)}>×</button>
          </div>
        ))}
        <button type="button" className="ix-b ghost sm" onClick={() => addRow("goals", { title: "", text: "" })}>+ Add goal</button>
        <textarea className="ix-input" rows={2} placeholder="Closing paragraph (optional)" value={d.goals_outro} onChange={(e) => set("goals_outro", e.target.value)} />
      </section>

      <section className="ix-card qr-sec qr-sign">
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
      </section>
      <Row>
        <span />
        <button type="button" className="ix-b primary" disabled={!!busy} onClick={save}>{busy === "save" ? "Saving..." : "Save report"}</button>
      </Row>
    </div>
  );
}

function SmallTable({ head, rows, total }) {
  return (
    <table className="qr-t sm">
      <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>
        {rows.length === 0 && <tr><td colSpan={head.length} className="qr-none">None this quarter</td></tr>}
        {rows.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>)}
        {total !== undefined && <tr className="qr-total"><td colSpan={head.length - 1}>TOTAL</td><td>{total}</td></tr>}
      </tbody>
    </table>
  );
}

/* ───────── the printed report (same layout as the CCIS template) ───────── */
function reportHtml({ year, quarter, d, t }) {
  const abs = (u) => new URL(u, window.location.href).href;
  const P = (s) => String(s || "").trim().split(/\n{2,}/).filter(Boolean).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const fmt = (v) => (v ? new Date(v + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "-");
  const table = (cap, head, rows, total, widths = []) => `
    <p class="cap">${cap}</p>
    <table><thead><tr>${head.map((h, i) => `<th${widths[i] ? ` style="width:${widths[i]}"` : ""}${i ? ' class="c"' : ""}>${h}</th>`).join("")}</tr></thead><tbody>
      ${rows.length ? rows.map((r) => `<tr>${r.map((c, i) => `<td${i ? ' class="c"' : ""}>${esc(c)}</td>`).join("")}</tr>`).join("") : `<tr><td>NONE</td>${head.slice(1).map(() => '<td class="c">-</td>').join("")}</tr>`}
      ${total !== undefined ? `<tr class="total"><td colspan="${head.length - 1}">TOTAL</td><td class="c">${total}</td></tr>` : ""}
    </tbody></table>`;
  const qBoxes = Q_NAMES.map((n, i) => `<div class="qb"><span class="${i + 1 === quarter ? "on" : ""}"></span>${n.replace(/(\d)(\D+)/, "$1<sup>$2</sup>")} QUARTER</div>`).join("");
  const sec = (n, title) => `<div class="bar"><b>${n}.</b> ${title}</div>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>Unit Performance Review Report - Q${quarter} ${year}</title>
<style>
  @page { size: A4 portrait; margin: 16mm 16mm 18mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #111; line-height: 1.45; }
  .cover { height: 260mm; position: relative; page-break-after: always; overflow: hidden; }
  .cover .logos { display: flex; gap: 10px; align-items: center; }
  .cover .logos img { height: 64px; }
  .cover .deco { position: absolute; border: 3px solid #f5a623; transform: rotate(45deg); border-radius: 10px; }
  .cover .deco.g { border-color: #7cb342; }
  .cover h1 { margin: 220px 0 0; text-align: center; font-family: Georgia, 'Times New Roman', serif; font-size: 30pt; line-height: 1.25; color: #3d6b1f; letter-spacing: .5px; }
  .cover hr { width: 62%; margin: 8px auto 0; border: 0; border-top: 2px solid #333; }
  .cover .year { margin: 60px 0 0 58%; font-weight: 800; font-size: 15pt; }
  .cover .year small { display: block; font-size: 13pt; font-weight: 700; }
  .cover .qb { display: flex; align-items: center; gap: 8px; margin: 4px 0 0 -28px; font-size: 14pt; font-weight: 500; }
  .cover .qb span { width: 40px; height: 18px; border: 1.5px solid #333; border-radius: 4px; }
  .cover .qb span.on { background: #f5a623; border-color: #c27c0e; }
  .cover .band { position: absolute; right: -10mm; bottom: 22mm; width: 120mm; padding: 14px 18px 14px 30px; border-radius: 40px 0 0 40px;
    background: linear-gradient(90deg, #7cb342, #33a532); color: #ffeb3b; font-weight: 900; font-size: 14pt; text-align: center; text-shadow: 0 1px 0 #2e5d17; }
  .head { text-align: right; font-weight: 700; font-size: 10pt; letter-spacing: .5px; margin-bottom: 8mm; }
  .bar { margin: 16px 0 10px; padding: 4px 10px; background: linear-gradient(90deg, #66cc33, #9be15d); border: 1px solid #3d8b1f; font-weight: 800; text-transform: uppercase; color: #123d0b; }
  h2 { margin: 16px 0 6px 20px; font-size: 13.5pt; }
  h2 b { margin-right: 6px; }
  p { margin: 0 0 8px; text-align: justify; }
  .indent { margin-left: 20px; }
  .cap { margin: 10px 0 2px; font-size: 9.5pt; text-align: left; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; page-break-inside: avoid; }
  th { background: #d6f26b; text-align: left; padding: 3px 6px; border: 1px solid #555; }
  td { padding: 3px 6px; border: 1px solid #555; vertical-align: top; }
  .c { text-align: center; }
  .total td { background: #9be15d; font-weight: 800; }
  ul { margin: 4px 0 8px 18px; padding: 0 0 0 14px; }
  li { margin: 0 0 4px; }
  .figs { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin: 8px 0; }
  .figs figure { margin: 0; width: 80%; text-align: center; page-break-inside: avoid; }
  .figs img { max-width: 100%; max-height: 95mm; border: 1px solid #ccc; }
  .figs figcaption { font-size: 10pt; margin-top: 3px; }
  .sign { margin-top: 18mm; page-break-inside: avoid; }
  .sign div { margin-bottom: 12mm; }
  .sign b { display: block; margin-top: 10mm; text-transform: uppercase; }
</style></head><body>
<div class="cover">
  <div class="logos"><img src="${abs(csuLogo)}" alt=""><img src="${abs(ccisLogo)}" alt=""></div>
  <i class="deco" style="width:110px;height:110px;right:40px;top:30px"></i>
  <i class="deco g" style="width:70px;height:70px;right:-10px;top:150px"></i>
  <i class="deco" style="width:90px;height:90px;left:-30px;bottom:20px"></i>
  <h1>UNIT PERFORMANCE<br>REVIEW REPORT</h1><hr>
  <div class="year">YEAR ${year}${qBoxes}</div>
  <div class="band">COLLEGE OF COMPUTING AND<br>INFORMATION SCIENCES</div>
</div>

<div class="head">QUARTERLY REPORT</div>
${sec(1, "Initiatives and achievements (highlights of accomplishments)")}
<h2><b>1.1</b> Number of Notarized Memorandum of Agreements (MoAs) between Caraga State University (CSU) and Partner Agencies</h2>
<div class="indent">${P(d.moa_intro)}
${table("Table 1. New HTE partner initiated by the College of Computing and Information Sciences (CCIS)", ["Name of HTE", "Date Entered", "Date Notarized", "Valid Until"],
  d.new_hte.filter((r) => r.name).map((r) => [r.name, fmt(r.entered), fmt(r.notarized), fmt(r.valid)]), undefined, ["46%"])}
${P(d.moa_note)}
${table("Table 2. Initiated partner HTEs with ongoing review of MoA.", ["Agency", "Date Initiated"], d.ongoing.filter((r) => r.agency).map((r) => [r.agency, fmt(r.initiated)]), undefined, ["70%"])}
</div>
<h2><b>1.2</b> Number of Students Deployed to HTE Partners</h2>
<div class="indent">
${table("Table 3. Number of student interns deployed per Program.", ["Program", "No of students"], t.byProgram, t.hte, ["70%"])}
${table("Table 4. Host Training Establishment (HTE) offices where student interns were placed.", ["Name of HTE", "No of students"], t.byHte, undefined, ["70%"])}
${P(d.deployed_note)}
</div>
<h2><b>1.3</b> Number of Students Deployed within the University</h2>
<div class="indent">${P(d.within_note)}
${table("Table 5. Number of student interns with placement within the university.", ["Office", "Program", "No of students"], t.byOffice, t.uni, ["38%", "38%"])}
</div>
<h2><b>1.4</b> Highlights of the Activities Conducted</h2>
<div class="indent">${P(d.highlights)}
${d.photos.length ? `<div class="figs">${d.photos.map((ph, i) => `<figure><img src="${ph.src}" alt=""><figcaption>Figure ${i + 1}: ${esc(ph.caption || "")}</figcaption></figure>`).join("")}</div>` : ""}
</div>

${sec(2, "Best practices")}
<div class="indent">${P(d.best_intro)}
<ul>${d.best.filter((b) => b.title || b.text).map((b) => `<li><b>${esc(b.title)}</b>${b.text ? `<br>${esc(b.text).replace(/\n/g, "<br>")}` : ""}</li>`).join("")}</ul>
</div>

${sec(3, "Challenges encountered and solutions implemented")}
<div class="indent">${P(d.challenges_intro)}
<table><thead><tr><th style="width:50%">CHALLENGES ENCOUNTERED</th><th>SOLUTIONS MADE</th></tr></thead><tbody>
${d.challenges.filter((c) => c.challenge || c.solutions).map((c) => `<tr><td>${esc(c.challenge).replace(/\n/g, "<br>")}</td><td><ul>${String(c.solutions || "").split(/\n/).map((x) => x.replace(/^[-•*]\s*/, "").trim()).filter(Boolean).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></td></tr>`).join("") || "<tr><td>-</td><td>-</td></tr>"}
</tbody></table>
</div>

${sec(4, "Future goals and initiatives")}
<div class="indent">${P(d.goals_intro)}
<ul>${d.goals.filter((g) => g.title || g.text).map((g) => `<li><b>${esc(g.title)}</b>${g.text ? ` – ${esc(g.text)}` : ""}</li>`).join("")}</ul>
${P(d.goals_outro)}
</div>

<div class="sign">
  <div>Prepared by:<b>${esc(d.prepared.name)}</b>${esc(d.prepared.title)}</div>
  <div>Noted by:<b>${esc(d.noted.name)}</b>${esc(d.noted.title)}</div>
</div>
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
  .ix-page .qr-auto { font-size: 11px; font-weight: 600; color: #15803d; background: #e6f7ee; padding: 2px 9px; border-radius: 99px; }
  .ix-page .qr-hint { margin: 0; font-size: 12.5px; color: #6b7280; }
  .ix-page .qr-sec textarea.ix-input { resize: vertical; min-height: 0; height: auto; padding: 9px 12px; line-height: 1.5; }
  .ix-page .qr-t { width: 100%; border-collapse: collapse; font-size: 13px; }
  .ix-page .qr-t th { text-align: left; background: #eef9d9; color: #2f5d18; font-weight: 700; padding: 7px 8px; border: 1px solid #dbe9c4; }
  .ix-page .qr-t td { padding: 4px 6px; border: 1px solid #eee6df; }
  .ix-page .qr-t.sm td { padding: 7px 8px; }
  .ix-page .qr-t .ix-input { height: 34px; }
  .ix-page .qr-total td { background: #f2fae6; font-weight: 800; }
  .ix-page .qr-none { color: #94a3b8; font-style: italic; text-align: center; padding: 10px !important; }
  .ix-page .qr-x { width: 28px; height: 28px; border-radius: 8px; border: 1px solid #f1d5c9; background: #fff; color: #c2410c; font-size: 18px; line-height: 1; cursor: pointer; }
  .ix-page .qr-two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media (max-width: 900px) { .ix-page .qr-two { grid-template-columns: 1fr; } }
  .ix-page .qr-places summary { cursor: pointer; font-size: 12.5px; font-weight: 600; color: #374151; }
  .ix-page .qr-places summary span { font-weight: 400; color: #94a3b8; }
  .ix-page .qr-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .ix-page .qr-chips label { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; padding: 5px 10px; border-radius: 99px; border: 1px solid #e5e7eb; background: #fff; cursor: pointer; }
  .ix-page .qr-chips label.on { border-color: #86c35a; background: #f2fae6; }
  .ix-page .qr-chips b { font-size: 11px; color: #6b7280; }
  .ix-page .qr-item { display: grid; grid-template-columns: 1fr 28px; gap: 6px 8px; align-items: start; padding: 10px; border: 1px dashed #eadfd8; border-radius: 10px; }
  .ix-page .qr-item > .qr-x { grid-column: 2; grid-row: 1; }
  .ix-page .qr-item > textarea { grid-column: 1; }
  .ix-page .qr-item.two { grid-template-columns: 1fr 1fr 28px; }
  .ix-page .qr-item.two > textarea { grid-column: auto; }
  .ix-page .qr-item.two > .qr-x { grid-column: 3; }
  @media (max-width: 700px) { .ix-page .qr-item.two { grid-template-columns: 1fr 28px; } .ix-page .qr-item.two > .qr-x { grid-column: 2; grid-row: 1; } }
  .ix-page .qr-photos { display: flex; flex-wrap: wrap; gap: 10px; }
  .ix-page .qr-photos figure { position: relative; margin: 0; width: 220px; display: flex; flex-direction: column; gap: 6px; }
  .ix-page .qr-photos img { width: 100%; height: 130px; object-fit: cover; border-radius: 8px; border: 1px solid #eee; }
  .ix-page .qr-photos .qr-x { position: absolute; top: 6px; right: 6px; }
  .ix-page .qr-add-photo { width: 220px; height: 130px; display: flex; align-items: center; justify-content: center; gap: 8px; flex-direction: column;
    border: 1.5px dashed #f0b896; border-radius: 8px; color: #c2410c; font-size: 12.5px; font-weight: 600; cursor: pointer; background: #fff9f5; }
  .ix-page .qr-sign { flex-direction: row !important; gap: 18px !important; flex-wrap: wrap; }
  .ix-page .qr-sign > div { flex: 1 1 260px; display: flex; flex-direction: column; gap: 8px; }
  .ix-page .qr-row { display: flex; justify-content: space-between; }
  .ix-page .qr-sec > .ix-b { align-self: flex-start; }
`;