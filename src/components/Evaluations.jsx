//Evaluations.jsx
// Intern evaluation by the HTE supervisor, two ways:
//   "Fill in MYTRACK"        rate each item 1-5, write strengths / what to improve, recommendation
//   "Upload the paper form"  the signed paper evaluation, scanned or photographed (PDF / JPG / PNG)
// Supervisors see their own interns; the coordinator sees everyone and can upload a paper form
// that the supervisor handed in. One evaluation per intern: submitting again replaces it.
import { useState, useEffect } from "react";
import { Icon, Msg, Spinner, Badge, Avatar, esc } from "./DashKit.jsx";
import { API, STORAGE } from "../config.js";

const REC = { hire: "Would hire / absorb this intern", recommend: "Recommended for employment", none: "No recommendation" };

export default function Evaluations({ interns = [], user }) {
  const [crit, setCrit] = useState(null);       // { criteria, scale }
  const [evals, setEvals] = useState(null);
  const [ready, setReady] = useState(true);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState(null);       // intern id
  const [msg, setMsg] = useState(null);

  const load = () => Promise.all([
    fetch(`${API}/evaluations/criteria`, { headers: { Accept: "application/json" } }).then((r) => r.json()),
    fetch(`${API}/evaluations`, { headers: { Accept: "application/json" } }).then((r) => r.json()),
  ]).then(([c, e]) => {
    setCrit({ criteria: c?.criteria || [], scale: c?.scale || {} });
    setEvals(Array.isArray(e?.evaluations) ? e.evaluations : []);
    setReady(e?.ready !== false);
  }).catch(() => { setCrit({ criteria: [], scale: {} }); setEvals([]); });
  useEffect(() => { load(); }, []);

  const mine = interns.filter((i) => i.role === "intern" || !i.role)
    .filter((i) => user?.role !== "supervisor" || String(i.supervisor_id) === String(user.id));
  const byIntern = Object.fromEntries((evals || []).map((e) => [e.intern_id, e]));
  const shown = mine.filter((i) => !q || `${i.name} ${i.student_id || ""} ${i.placement || ""}`.toLowerCase().includes(q.toLowerCase()));
  const done = mine.filter((i) => byIntern[i.id]).length;
  const cur = mine.find((i) => i.id === pick) || null;

  if (!crit || !evals) return <Spinner />;
  return (
    <div className="ev">
      <style>{EV_CSS}</style>
      {!ready && <div className="ix-alert"><Icon name="warn" size={16} /> Run "php artisan migrate" on the server to turn on evaluations.</div>}
      <Msg msg={msg} />
      <div className="ev-split">
        <div className="ix-card ev-list">
          <div className="ev-list-h">
            <b>Interns</b><span className="ev-n">{done} of {mine.length} evaluated</span>
          </div>
          <input className="ix-input" placeholder="Search name, ID or HTE" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="ev-items">
            {shown.length === 0 && <div className="ev-empty">{mine.length ? "No match." : user?.role === "supervisor" ? "No interns are assigned to you yet." : "No interns yet."}</div>}
            {shown.map((i) => {
              const e = byIntern[i.id];
              return (
                <button key={i.id} type="button" className={pick === i.id ? "ev-item on" : "ev-item"} onClick={() => { setPick(i.id); setMsg(null); }}>
                  <Avatar name={i.name} photo={i.photo} size={34} />
                  <span className="ev-who"><b>{i.name}</b><small>{i.placement || "No placement"}</small></span>
                  {e ? <Badge label={e.mode === "paper" ? "Paper form" : `${Number(e.average).toFixed(2)} / 5`} type="approved" /> : <Badge label="Not yet" type="pending" />}
                </button>
              );
            })}
          </div>
        </div>
        <div className="ix-card ev-main">
          {!cur ? (
            <div className="ev-empty big"><Icon name="file" size={26} /><b>Choose an intern</b><span>Fill in the evaluation in MYTRACK, or upload the signed paper form.</span></div>
          ) : (
            <EvalPanel key={cur.id} intern={cur} existing={byIntern[cur.id]} crit={crit} user={user}
              onDone={(text) => { setMsg({ type: "success", text }); load(); }} onError={(text) => setMsg({ type: "error", text })} />
          )}
        </div>
      </div>
    </div>
  );
}

function EvalPanel({ intern, existing, crit, user, onDone, onError }) {
  const canSystem = user?.role === "supervisor" || user?.role === "admin" || user?.role === "ojt_coordinator";
  const [mode, setMode] = useState(existing ? "view" : "choose");
  const [r, setR] = useState(() => existing?.ratings || {});
  const [f, setF] = useState({ strengths: existing?.strengths || "", improvements: existing?.improvements || "", comments: existing?.comments || "", recommendation: existing?.recommendation || "" });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const all = crit.criteria.every((c) => r[c.key] >= 1);
  const avg = crit.criteria.length ? crit.criteria.reduce((s, c) => s + (r[c.key] || 0), 0) / crit.criteria.length : 0;

  const submit = async (kind) => {
    setBusy(true);
    try {
      let res;
      if (kind === "paper") {
        const fd = new FormData();
        fd.append("intern_id", intern.id); fd.append("mode", "paper"); fd.append("file", file);
        if (f.comments) fd.append("comments", f.comments);
        res = await fetch(`${API}/evaluations`, { method: "POST", headers: { Accept: "application/json" }, body: fd });
      } else {
        res = await fetch(`${API}/evaluations`, {
          method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ intern_id: intern.id, mode: "system", ratings: r, ...f, recommendation: f.recommendation || null }),
        });
      }
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d.errors && Object.values(d.errors)[0]?.[0]) || d.message || "Couldn't save the evaluation.");
      onDone(d.message);
    } catch (err) {
      onError(err instanceof TypeError ? "Couldn't reach the server." : err.message);
    } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm(`Remove the evaluation of ${intern.name}?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`${API}/evaluations/${existing.id}`, { method: "DELETE", headers: { Accept: "application/json" } });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || "Couldn't remove it.");
      onDone(d.message);
    } catch (err) { onError(err.message); } finally { setBusy(false); }
  };

  const print = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(printHtml(intern, existing, crit));
    w.document.close(); setTimeout(() => w.print(), 300);
  };

  return (
    <div className="ev-panel">
      <div className="ev-head">
        <Avatar name={intern.name} photo={intern.photo} size={44} />
        <div><h3>{intern.name}</h3><small>{[intern.student_id, intern.program, intern.placement].filter(Boolean).join(" · ")}</small></div>
      </div>

      {mode === "view" && existing && (
        <>
          <div className="ev-done">
            <Icon name="check" size={16} />
            <span>{existing.mode === "paper" ? "Signed paper form uploaded" : `Evaluated in MYTRACK · average ${Number(existing.average).toFixed(2)} / 5`}
              {" "}by <b>{existing.evaluator_name}</b> on {new Date(String(existing.updated_at).replace(" ", "T")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
          </div>
          {existing.mode === "system" ? (
            <div className="ev-rows">
              {crit.criteria.map((c) => (
                <div key={c.key} className="ev-row ro"><span>{c.label}</span><b>{existing.ratings?.[c.key]} <small>{crit.scale[existing.ratings?.[c.key]]}</small></b></div>
              ))}
              {existing.strengths && <p className="ev-note"><b>Strengths:</b> {existing.strengths}</p>}
              {existing.improvements && <p className="ev-note"><b>To improve:</b> {existing.improvements}</p>}
              {existing.comments && <p className="ev-note"><b>Comments:</b> {existing.comments}</p>}
              {existing.recommendation && <p className="ev-note"><b>Recommendation:</b> {REC[existing.recommendation]}</p>}
            </div>
          ) : (
            <a className="ix-b ghost sm" href={`${STORAGE}${existing.file_path}`} target="_blank" rel="noopener noreferrer"><Icon name="eye" size={14} /> Open {existing.original_name || "the form"}</a>
          )}
          <div className="ev-acts">
            {existing.mode === "system" && <button type="button" className="ix-b ghost sm" onClick={print}><Icon name="print" size={14} /> Print</button>}
            <button type="button" className="ix-b ghost sm" disabled={busy} onClick={() => setMode("choose")}>Replace</button>
            <button type="button" className="ix-b danger sm" disabled={busy} onClick={remove}>Remove</button>
          </div>
        </>
      )}

      {mode === "choose" && (
        <div className="ev-choose">
          {canSystem && (
            <button type="button" onClick={() => setMode("system")}>
              <Icon name="pencil" size={22} /><b>Fill in MYTRACK</b><span>Rate {crit.criteria.length} items from 1 to 5 and add comments.</span>
            </button>
          )}
          <button type="button" onClick={() => setMode("paper")}>
            <Icon name="upload" size={22} /><b>Upload the signed paper form</b><span>A scan or a clear photo (PDF, JPG or PNG, up to 10 MB).</span>
          </button>
          {existing && <button type="button" className="ev-cancel" onClick={() => setMode("view")}>Cancel</button>}
        </div>
      )}

      {mode === "system" && (
        <>
          <div className="ev-scale">{[5, 4, 3, 2, 1].map((n) => <span key={n}><b>{n}</b> {crit.scale[n]}</span>)}</div>
          <div className="ev-rows">
            {crit.criteria.map((c) => (
              <div key={c.key} className="ev-row">
                <span>{c.label}{c.hint && <small>{c.hint}</small>}</span>
                <div className="ev-rate" role="radiogroup" aria-label={c.label}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={r[c.key] === n} className={r[c.key] === n ? "on" : ""} title={crit.scale[n]}
                      onClick={() => setR((x) => ({ ...x, [c.key]: n }))}>{n}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="ev-fields">
            <label>Strengths<textarea className="ix-input" rows={2} value={f.strengths} onChange={(e) => setF((x) => ({ ...x, strengths: e.target.value }))} /></label>
            <label>Areas to improve<textarea className="ix-input" rows={2} value={f.improvements} onChange={(e) => setF((x) => ({ ...x, improvements: e.target.value }))} /></label>
            <label>Other comments<textarea className="ix-input" rows={2} value={f.comments} onChange={(e) => setF((x) => ({ ...x, comments: e.target.value }))} /></label>
            <label>Recommendation
              <select className="ix-select" value={f.recommendation} onChange={(e) => setF((x) => ({ ...x, recommendation: e.target.value }))}>
                <option value="">Choose (optional)</option>
                {Object.entries(REC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
          </div>
          <div className="ev-acts">
            <span className="ev-avg">{all ? `Average: ${avg.toFixed(2)} / 5` : `${crit.criteria.filter((c) => r[c.key]).length} of ${crit.criteria.length} rated`}</span>
            <button type="button" className="ix-b ghost sm" onClick={() => setMode(existing ? "view" : "choose")}>Back</button>
            <button type="button" className="ix-b primary sm" disabled={!all || busy} onClick={() => submit("system")}>{busy ? "Saving..." : "Submit evaluation"}</button>
          </div>
        </>
      )}

      {mode === "paper" && (
        <>
          <label className="ev-drop">
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <Icon name="upload" size={22} />
            <b>{file ? file.name : "Choose the scanned form"}</b>
            <span>{file ? `${Math.round(file.size / 1024)} KB` : "PDF, JPG or PNG, up to 10 MB"}</span>
          </label>
          <label className="ev-fields one">Note (optional)<textarea className="ix-input" rows={2} value={f.comments} onChange={(e) => setF((x) => ({ ...x, comments: e.target.value }))} /></label>
          <div className="ev-acts">
            <button type="button" className="ix-b ghost sm" onClick={() => setMode(existing ? "view" : "choose")}>Back</button>
            <button type="button" className="ix-b primary sm" disabled={!file || busy || file.size > 10 * 1024 * 1024} onClick={() => submit("paper")}>{busy ? "Uploading..." : "Upload form"}</button>
          </div>
        </>
      )}
    </div>
  );
}

function printHtml(intern, e, crit) {
  const rows = crit.criteria.map((c) => `<tr><td>${esc(c.label)}</td>${[5, 4, 3, 2, 1].map((n) => `<td class="c">${e.ratings?.[c.key] === n ? "✔" : ""}</td>`).join("")}</tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Evaluation - ${esc(intern.name)}</title><style>
    @page { size: A4; margin: 16mm; } body { font-family: Arial, sans-serif; font-size: 11pt; color: #111; }
    h1 { font-size: 15pt; text-align: center; margin: 0 0 4px; } .sub { text-align: center; margin: 0 0 14px; color: #444; }
    .info td { padding: 2px 8px 2px 0; } table.r { width: 100%; border-collapse: collapse; margin-top: 10px; }
    table.r th, table.r td { border: 1px solid #555; padding: 4px 6px; } table.r th { background: #eee; } .c { text-align: center; width: 9%; }
    .box { border: 1px solid #555; padding: 6px 8px; min-height: 40px; margin-top: 6px; } .sig { margin-top: 30mm; display: flex; justify-content: space-between; }
    .sig div { width: 45%; text-align: center; border-top: 1px solid #000; padding-top: 4px; }
  </style></head><body>
    <h1>STUDENT TRAINEE PERFORMANCE EVALUATION</h1><p class="sub">Caraga State University · College of Computing and Information Sciences</p>
    <table class="info"><tr><td>Name:</td><td><b>${esc(intern.name)}</b></td><td>Student ID:</td><td>${esc(intern.student_id || "")}</td></tr>
      <tr><td>Program:</td><td>${esc(intern.program || "")}</td><td>HTE:</td><td>${esc(intern.placement || "")}</td></tr></table>
    <table class="r"><thead><tr><th>Criteria</th>${[5, 4, 3, 2, 1].map((n) => `<th class="c">${n}<br><small>${esc(crit.scale[n] || "")}</small></th>`).join("")}</tr></thead><tbody>${rows}
      <tr><td><b>Average</b></td><td colspan="5" class="c"><b>${Number(e.average).toFixed(2)} / 5</b></td></tr></tbody></table>
    <p><b>Strengths</b></p><div class="box">${esc(e.strengths || "")}</div>
    <p><b>Areas to improve</b></p><div class="box">${esc(e.improvements || "")}</div>
    <p><b>Other comments</b></p><div class="box">${esc(e.comments || "")}</div>
    <p><b>Recommendation:</b> ${esc(REC[e.recommendation] || "—")}</p>
    <div class="sig"><div>${esc(e.evaluator_name || "")}<br><small>HTE Supervisor (signature over printed name)</small></div><div>Date</div></div>
  </body></html>`;
}

const EV_CSS = `
  .ix-page .ev-split { display: grid; grid-template-columns: minmax(260px, 340px) 1fr; gap: 14px; align-items: start; }
  @media (max-width: 900px) { .ix-page .ev-split { grid-template-columns: 1fr; } }
  .ix-page .ix-content .ev-list, .ix-page .ix-content .ev-main { padding: 14px 16px !important; }
  .ix-page .ev-list { display: flex; flex-direction: column; gap: 10px; }
  .ix-page .ev-list-h { display: flex; align-items: center; justify-content: space-between; }
  .ix-page .ev-n { font-size: 11.5px; color: #6b7280; background: #f3ede9; padding: 2px 9px; border-radius: 99px; }
  .ix-page .ev-items { display: flex; flex-direction: column; max-height: 560px; overflow-y: auto; margin: 0 -6px; }
  .ix-page .ev-item { display: flex; align-items: center; gap: 10px; padding: 9px 8px; border: 0; background: none; border-radius: 10px; cursor: pointer; text-align: left; font: inherit; }
  .ix-page .ev-item:hover { background: #fff7f2; } .ix-page .ev-item.on { background: #fdeadf; }
  .ix-page .ev-who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .ix-page .ev-who b { font-size: 13px; } .ix-page .ev-who small { font-size: 11.5px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ix-page .ev-empty { padding: 20px; text-align: center; color: #94a3b8; font-size: 13px; }
  .ix-page .ev-empty.big { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 60px 20px; color: #6b7280; }
  .ix-page .ev-empty.big b { color: #111827; font-size: 15px; }
  .ix-page .ev-panel { display: flex; flex-direction: column; gap: 14px; }
  .ix-page .ev-head { display: flex; align-items: center; gap: 12px; }
  .ix-page .ev-head h3 { margin: 0; font-size: 17px; } .ix-page .ev-head small { color: #6b7280; font-size: 12.5px; }
  .ix-page .ev-done { display: flex; gap: 8px; align-items: flex-start; padding: 10px 12px; border-radius: 10px; background: #e6f7ee; color: #166534; font-size: 13px; }
  .ix-page .ev-choose { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media (max-width: 640px) { .ix-page .ev-choose { grid-template-columns: 1fr; } }
  .ix-page .ev-choose > button { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 18px; border-radius: 14px; border: 1.5px solid #f1ddd2;
    background: #fffaf7; cursor: pointer; text-align: left; font: inherit; color: #c2410c; }
  .ix-page .ev-choose > button:hover { border-color: #e8582a; }
  .ix-page .ev-choose b { color: #111827; font-size: 14.5px; } .ix-page .ev-choose span { color: #6b7280; font-size: 12.5px; }
  .ix-page .ev-choose .ev-cancel { grid-column: 1 / -1; align-items: center; padding: 8px; border-style: dashed; color: #6b7280; }
  .ix-page .ev-scale { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 11.5px; color: #6b7280; }
  .ix-page .ev-scale b { color: #c2410c; }
  .ix-page .ev-rows { display: flex; flex-direction: column; border: 1px solid #f1ece9; border-radius: 12px; overflow: hidden; }
  .ix-page .ev-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 12px; }
  .ix-page .ev-row + .ev-row { border-top: 1px solid #f1ece9; }
  .ix-page .ev-row > span { font-size: 13px; font-weight: 600; display: flex; flex-direction: column; min-width: 0; }
  .ix-page .ev-row > span small { font-weight: 400; font-size: 11.5px; color: #94a3b8; }
  .ix-page .ev-row.ro b { font-size: 14px; color: #c2410c; white-space: nowrap; } .ix-page .ev-row.ro b small { font-size: 11px; color: #6b7280; font-weight: 500; }
  .ix-page .ev-rate { display: inline-flex; gap: 4px; flex: none; }
  .ix-page .ev-rate button { width: 34px; height: 34px; border-radius: 9px; border: 1px solid #e5e7eb; background: #fff; font: inherit; font-weight: 700; cursor: pointer; color: #374151; }
  .ix-page .ev-rate button:hover { border-color: #e8582a; } .ix-page .ev-rate button.on { background: #e8582a; border-color: #e8582a; color: #fff; }
  .ix-page .ev-note { margin: 0; padding: 8px 12px; font-size: 13px; border-top: 1px solid #f1ece9; }
  .ix-page .ev-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .ix-page .ev-fields.one { grid-template-columns: 1fr; }
  @media (max-width: 640px) { .ix-page .ev-fields { grid-template-columns: 1fr; } }
  .ix-page .ev-fields label, .ix-page label.ev-fields { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; font-weight: 600; color: #374151; }
  .ix-page .ev-fields textarea { height: auto; padding: 8px 10px; resize: vertical; }
  .ix-page .ev-acts { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
  .ix-page .ev-avg { margin-right: auto; font-size: 13px; font-weight: 700; color: #c2410c; }
  .ix-page .ev-drop { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 26px; border: 1.5px dashed #f0b896; border-radius: 14px;
    background: #fff9f5; color: #c2410c; cursor: pointer; text-align: center; }
  .ix-page .ev-drop b { color: #111827; } .ix-page .ev-drop span { font-size: 12px; color: #6b7280; }
`;