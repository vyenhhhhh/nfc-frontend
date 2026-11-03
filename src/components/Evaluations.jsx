//Evaluations.jsx
// The internship grade (CCIS "Internship Grading Criteria", OJT/Practicum IS 197 · IT 197 · CS 197):
//   Part 1 · HTE supervisor appraisal   60%  Attendance & Punctuality 15 · Performance 50 · General Attitude 35
//   Part 2 · SIP coordinator evaluation 40%  Narrative/Technical Report 25 (rubric) · Timely Submission 10 · Compliance 5
//   Final grade (%) = supervisor total × 0.60 + coordinator total
// Supervisor: rates their own interns (Part 1).
// OJT coordinator: sees Part 1, rates Part 2, then releases the grade to the intern.
// Intern: <MyGrade /> shows the grade once it is released.
// The signed paper evaluation form is still uploaded by the intern as a post-internship requirement.
import { useState, useEffect } from "react";
import { Icon, Msg, Spinner, Badge, Avatar, OA_CSS, esc } from "./DashKit.jsx";
import { API } from "../config.js";
import { fileHref, openFile } from "../files.js";

const J = { Accept: "application/json" };
const num = (v, d = 2) => (v === null || v === undefined || v === "" ? "—" : Number(v).toFixed(d).replace(/\.?0+$/, (m) => (m.startsWith(".") ? "" : m)));
const fmt = (v) => (v === null || v === undefined ? "—" : Number(v).toFixed(2));
const day = (v) => (v ? new Date(String(v).replace(" ", "T")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
const DOC_LABEL = {
  narrative_report: "Narrative report", evaluation_forms: "Signed evaluation form", performance_appraisal: "Performance appraisal",
  supervisor_feedback_form: "Supervisor feedback form", certificate_of_completion: "Certificate of completion", dtr: "DTR",
};

// supervisor appraisal = form F-OSIP-PAR-004 Part I: points of a category = sum of its ratings (null until all rated)
const supCat = (cat, r) => {
  const v = cat.items.map((it) => r[it.key]).filter((x) => x >= 1);
  return v.length < cat.items.length ? null : v.reduce((a, b) => a + b, 0);
};
// final % → numerical grade and adjectival rating (the form's rating scale, ojt.grading.equivalents)
const eqOf = (cfg, final) => {
  if (final === null || final === undefined) return null;
  const p = Math.round(Number(final));
  return (cfg?.equivalents || []).find((e) => p >= e.min) || null;
};
const eqText = (cfg, final) => { const e = eqOf(cfg, final); return e ? `${e.grade} · ${e.rating}` : ""; };
const supTotal = (cfg, r) => {
  const parts = (cfg?.supervisor || []).map((c) => supCat(c, r));
  return parts.some((x) => x === null) ? null : parts.reduce((a, b) => a + b, 0);
};
const coordCat = (cat, r) => (cat.items.every((it) => r[it.key] >= 1) ? cat.items.reduce((s, it) => s + (r[it.key] / 5) * it.weight, 0) : null);
const coordTotal = (cfg, r) => {
  const parts = (cfg?.coordinator || []).map((c) => coordCat(c, r));
  return parts.some((x) => x === null) ? null : parts.reduce((a, b) => a + b, 0);
};
const share = (cfg) => (cfg?.supervisor_share ?? 60) / 100;

function Rate({ value, onChange, scale, disabled, label }) {
  return (
    <div className="gr-rate" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} disabled={disabled}
          className={value === n ? "on" : ""} title={scale?.[n]} onClick={() => onChange(n)}>{n}</button>
      ))}
    </div>
  );
}

export default function Evaluations({ user }) {
  const coord = user?.role === "ojt_coordinator" || user?.role === "admin";
  const [cfg, setCfg] = useState(null);
  const [rows, setRows] = useState(null);
  const [ready, setReady] = useState(true);
  const [view, setView] = useState("todo");
  const [sel, setSel] = useState(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState(null);

  const load = () => Promise.all([
    fetch(`${API}/grades/criteria`, { headers: J }).then((r) => r.json()),
    fetch(`${API}/grades`, { headers: J, cache: "no-store" }).then((r) => r.json()),
  ]).then(([c, g]) => {
    setCfg(c || {});
    setRows(Array.isArray(g?.interns) ? g.interns : []);
    setReady(g?.ready !== false);
  }).catch(() => { setCfg({}); setRows([]); });
  useEffect(() => { load(); }, []);

  if (!cfg || !rows) return <Spinner />;

  const isDone = (i) => (coord ? !!i.grade?.finalized_at : i.appraisal?.score !== null && i.appraisal?.score !== undefined);
  const todo = rows.filter((i) => !isDone(i));
  const done = rows.filter(isDone);
  const sq = q.trim().toLowerCase();
  const list = (view === "todo" ? todo : done).filter((i) => !sq || `${i.name} ${i.student_id || ""} ${i.placement || ""}`.toLowerCase().includes(sq));
  const cur = rows.find((i) => i.id === sel) || null;

  const badge = (i) => {
    if (coord) {
      if (i.grade?.finalized_at) return <Badge label={`${fmt(i.grade.final_grade)}% · ${eqOf(cfg, i.grade.final_grade)?.grade || ""}`} type="approved" />;
      if (!i.appraisal) return <Badge label="Supervisor pending" type="pending" />;
      return <Badge label="Ready to grade" type="online" />;
    }
    return i.appraisal ? <Badge label={`${fmt(i.appraisal.score)} / 100`} type="approved" /> : <Badge label="Not yet" type="pending" />;
  };

  return (
    <>
      <style>{OA_CSS + GR_CSS}</style>
      {!ready && <div className="ix-alert"><Icon name="warn" size={16} /> Run "php artisan migrate" on the server to turn on grading.</div>}
      <Msg msg={msg} />
      <div className={open && cur ? "oa gr oa-open" : "oa gr"}>
        <div className="oa-list">
          <div className="oa-switch" role="tablist" aria-label="Show">
            <button type="button" role="tab" aria-selected={view === "todo"} className={view === "todo" ? "on" : ""} onClick={() => { setView("todo"); setSel(null); }}>
              {coord ? "To grade" : "To rate"} <span className={todo.length ? "oa-n hot" : "oa-n"}>{todo.length}</span>
            </button>
            <button type="button" role="tab" aria-selected={view === "done"} className={view === "done" ? "on" : ""} onClick={() => { setView("done"); setSel(null); }}>
              {coord ? "Released" : "Rated"} <span className="oa-n">{done.length}</span>
            </button>
          </div>
          {rows.length > 6 && (
            <div className="oa-search">
              <Icon name="search" size={14} />
              <input type="search" placeholder="Search intern" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search intern" />
            </div>
          )}
          <div className="oa-items" role="list">
            {list.length === 0 ? (
              <div className="oa-none">
                <span className="oa-none-ic"><Icon name="check" size={18} /></span>
                <b>{sq ? "No match" : view === "todo" ? "All caught up" : coord ? "No grades released yet" : "No appraisals yet"}</b>
                <small>{sq ? "Try another name." : rows.length === 0 ? (coord ? "No interns yet." : "No interns are assigned to you yet.") : view === "todo" ? "Every intern here is done." : coord ? "Grades you release show here." : "Interns you rate show here."}</small>
              </div>
            ) : list.map((i) => (
              <button key={i.id} type="button" role="listitem" className={cur && cur.id === i.id ? "oa-item on" : "oa-item"}
                onClick={() => { setSel(i.id); setOpen(true); setMsg(null); }}>
                <Avatar name={i.name} photo={i.photo} size={34} />
                <span className="oa-who"><b>{i.name}</b><small>{i.placement || "No placement yet"}</small></span>
                {badge(i)}
              </button>
            ))}
          </div>
        </div>

        <div className="oa-detail">
          {!cur ? (
            <div className="oa-blank">
              <span className="oa-none-ic"><Icon name="pencil" size={20} /></span>
              <b>Pick an intern</b>
              <small>{coord ? "See the supervisor's appraisal (60%), rate your part (40%), then release the final grade."
                : "Rate the intern's attendance, performance and attitude. This is 60% of their internship grade."}</small>
            </div>
          ) : (
            <>
              <button type="button" className="oa-back" onClick={() => setOpen(false)}><Icon name="menu" size={14} /> Back to the list</button>
              <div className="oa-head">
                <Avatar name={cur.name} photo={cur.photo} size={46} />
                <div className="oa-hn"><b>{cur.name}</b><small>{[cur.student_id, cur.program, cur.placement].filter(Boolean).join(" · ")}</small></div>
                {badge(cur)}
              </div>
              <div className="oa-kv">
                <div><small>Hours rendered</small><b>{num(cur.hours, 1)}h <em>/ {num(cur.required_hours, 0)}h</em></b></div>
                <div><small>Days present</small><b>{cur.attendance?.days ?? 0}</b></div>
                <div><small>Late time ins</small><b className={cur.attendance?.late ? "warn" : ""}>{cur.attendance?.late ?? 0}<em> after 8:00 AM</em></b></div>
                <div><small>{coord ? "HTE supervisor" : "Grade"}</small><b>{coord ? cur.supervisor_name || "None assigned" : cur.grade?.finalized_at ? "Released" : "Not released"}</b></div>
              </div>
              {coord
                ? <CoordPanel key={cur.id} intern={cur} cfg={cfg} onDone={(t) => { setMsg({ type: "success", text: t }); load(); }} onError={(t) => setMsg({ type: "error", text: t })} />
                : <SupervisorPanel key={cur.id} intern={cur} cfg={cfg} onDone={(t) => { setMsg({ type: "success", text: t }); load(); }} onError={(t) => setMsg({ type: "error", text: t })} />}
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ───────── HTE supervisor: the appraisal (60%) ───────── */
function SupervisorPanel({ intern, cfg, onDone, onError }) {
  const ex = intern.appraisal;
  const locked = !!intern.grade?.finalized_at;
  const [r, setR] = useState(() => ex?.ratings || {});
  const [f, setF] = useState({ strengths: ex?.strengths || "", improvements: ex?.improvements || "", comments: ex?.comments || "" });
  const [edit, setEdit] = useState(!ex);
  const [share, setShare] = useState(ex ? ex.share_comments !== false : true);
  const [busy, setBusy] = useState(false);
  const total = supTotal(cfg, r);
  const rated = (cfg.supervisor || []).reduce((s, c) => s + c.items.filter((it) => r[it.key] >= 1).length, 0);
  const items = (cfg.supervisor || []).reduce((s, c) => s + c.items.length, 0);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${API}/evaluations`, {
        method: "POST", headers: { ...J, "Content-Type": "application/json" },
        body: JSON.stringify({ intern_id: intern.id, mode: "system", ratings: r, share_comments: share, ...f }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d.errors && Object.values(d.errors)[0]?.[0]) || d.message || "Couldn't save the appraisal.");
      setEdit(false); onDone(d.message || "Appraisal saved.");
    } catch (e) { onError(e instanceof TypeError ? "Couldn't reach the server." : e.message); } finally { setBusy(false); }
  };

  return (
    <>
      {locked && <div className="oa-done ok"><Icon name="check" size={14} /><span>The OJT coordinator released this intern's grade, so your appraisal can no longer be changed.</span></div>}
      {!edit && ex && !locked && (
        <div className="oa-done"><Icon name="check" size={14} /><span>You rated {intern.name} on {day(ex.updated_at)}. You can still change it until the coordinator releases the grade.</span></div>
      )}
      <div className="gr-scale">{[5, 4, 3, 2, 1].map((n) => <span key={n}><b>{n}</b> {cfg.scale?.[n]}</span>)}</div>
      {(cfg.supervisor || []).map((cat) => {
        const sc = supCat(cat, r);
        return (
          <section key={cat.key} className="gr-sec">
            <header><b>{cat.label}</b><span className="gr-w">{cat.items.length} items</span><span className="gr-sc">{sc === null ? "—" : num(sc)} / {cat.weight} pts</span></header>
            {cat.key === "attendance" && (
              <p className="gr-hint"><Icon name="clock" size={13} /> From the attendance log: {intern.attendance?.days ?? 0} days present, {intern.attendance?.late ?? 0} late time ins.</p>
            )}
            {cat.items.map((it) => (
              <div key={it.key} className="gr-row">
                <span>{it.label}</span>
                {edit && !locked ? <Rate value={r[it.key]} scale={cfg.scale} label={it.label} onChange={(n) => setR((x) => ({ ...x, [it.key]: n }))} />
                  : <b className="gr-val">{r[it.key] || "—"} <small>{cfg.scale?.[r[it.key]] || ""}</small></b>}
              </div>
            ))}
          </section>
        );
      })}
      <div className="gr-fields">
        {[["strengths", "Strengths"], ["improvements", "Weaknesses"], ["comments", "Comments / suggestions"]].map(([k, l]) => (
          edit && !locked
            ? <label key={k}>{l}<textarea className="ix-input" rows={2} value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} /></label>
            : f[k] ? <p key={k} className="gr-note"><b>{l}:</b> {f[k]}</p> : null
        ))}
      </div>
      {edit && !locked && (
        <label className="gr-share"><input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} /> Let the intern read my strengths and weaknesses after the grade is released</label>
      )}
      <div className="gr-bar">
        <div className="gr-total">
          <b>{total === null ? `${rated} of ${items} rated` : `${num(total)} / 100 points`}</b>
          <small>{total === null ? "Rate every item to see the total points." : `Total points × 60% = ${num(total * share(cfg))} of the final grade.`}</small>
        </div>
        {ex && !edit && <button type="button" className="ix-b ghost" onClick={() => printForm(intern, cfg, ex.ratings || {}, { ...f, evaluator_name: ex.evaluator_name }, null, null)}><Icon name="print" size={14} /> Print form</button>}
        {!locked && (edit ? (
          <>
            {ex && <button type="button" className="ix-b ghost" onClick={() => { setR(ex.ratings || {}); setEdit(false); }}>Cancel</button>}
            <button type="button" className="ix-b primary" disabled={total === null || busy} onClick={submit}>{busy ? "Saving..." : ex ? "Save changes" : "Submit appraisal"}</button>
          </>
        ) : <button type="button" className="ix-b ghost" onClick={() => setEdit(true)}><Icon name="pencil" size={14} /> Change ratings</button>)}
      </div>
    </>
  );
}

/* ───────── OJT coordinator: Part 2 (40%) and the final grade ───────── */
function CoordPanel({ intern, cfg, onDone, onError }) {
  const g = intern.grade;
  const ap = intern.appraisal;
  const released = !!g?.finalized_at;
  const [r, setR] = useState(() => g?.ratings || {});
  const [remarks, setRemarks] = useState(g?.remarks || "");
  const [busy, setBusy] = useState("");
  const supScore = ap?.score ?? null;
  const cTotal = coordTotal(cfg, r);
  const final = supScore === null || cTotal === null ? null : supScore * share(cfg) + cTotal;
  const docs = Object.entries(intern.docs || {});

  const save = async (finalize) => {
    setBusy(finalize ? "release" : "save");
    try {
      const res = await fetch(`${API}/grades/${intern.id}`, {
        method: "PUT", headers: { ...J, "Content-Type": "application/json" },
        body: JSON.stringify({ ratings: r, remarks, finalize }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || "Couldn't save the grade.");
      onDone(d.message);
    } catch (e) { onError(e instanceof TypeError ? "Couldn't reach the server." : e.message); } finally { setBusy(""); }
  };
  const reopen = async () => {
    if (!window.confirm(`Reopen the grade of ${intern.name}? They won't see it until you release it again.`)) return;
    setBusy("reopen");
    try {
      const res = await fetch(`${API}/grades/${intern.id}/reopen`, { method: "POST", headers: J });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || "Couldn't reopen it.");
      onDone(d.message);
    } catch (e) { onError(e.message); } finally { setBusy(""); }
  };
  const print = () => {
    printForm(intern, cfg, ap?.ratings || {}, ap || {}, { r, remarks }, final);
  };

  return (
    <>
      {/* Part 1: the supervisor's appraisal */}
      <section className="gr-sec">
        <header><b>HTE supervisor appraisal</b><span className="gr-w">60%</span>
          <span className="gr-sc">{supScore === null ? "Waiting" : `${num(supScore)} / 100 points`}</span></header>
        {!ap ? (
          <p className="gr-hint warn"><Icon name="clock" size={13} /> {intern.supervisor_name ? `Waiting for ${intern.supervisor_name} to rate this intern in their account.` : "This intern has no HTE supervisor yet. Assign one in Supervisors."}</p>
        ) : (
          <>
            {(cfg.supervisor || []).map((cat) => {
              const sc = ap.categories?.[cat.key];
              return (
                <div key={cat.key} className="gr-barrow">
                  <span>{cat.label}</span>
                  <i><em style={{ width: `${sc === null || sc === undefined ? 0 : (sc / cat.weight) * 100}%` }} /></i>
                  <b>{num(sc)} / {cat.weight}</b>
                </div>
              );
            })}
            <p className="gr-hint">Rated by {ap.evaluator_name} on {day(ap.updated_at)} · counts as <b>{num(supScore * share(cfg))}%</b> of the final grade.</p>
            {(ap.strengths || ap.improvements) && (
              <p className="gr-note">{ap.strengths && <><b>Strengths:</b> {ap.strengths} </>}{ap.improvements && <><b>Weaknesses:</b> {ap.improvements}</>}</p>
            )}
          </>
        )}
      </section>

      {/* documents to look at while grading */}
      <div className="gr-docs">
        {docs.length === 0 ? <span className="gr-hint">No post-internship documents uploaded yet (narrative report, signed evaluation form).</span>
          : docs.map(([k, d]) => (
            <a key={k} className="gr-doc" href={fileHref(d.file_path)} onClick={(e) => openFile(d.file_path, e)} target="_blank" rel="noopener noreferrer">
              <Icon name="file" size={14} /> {DOC_LABEL[k] || k} <small className={`st ${d.status}`}>{d.status}</small>
            </a>
          ))}
      </div>

      {/* Part 2: the coordinator's evaluation */}
      {(cfg.coordinator || []).map((cat) => {
        const sc = coordCat(cat, r);
        const one = cat.items.length === 1;
        return (
          <section key={cat.key} className="gr-sec">
            <header><b>{cat.label}</b><span className="gr-w">{cat.weight}%</span>
              {one && (released ? <b className="gr-val gr-inline">{r[cat.items[0].key] || "—"} <small>{cfg.scale?.[r[cat.items[0].key]] || ""}</small></b>
                : <Rate value={r[cat.items[0].key]} scale={cfg.scale} label={cat.label} onChange={(n) => setR((x) => ({ ...x, [cat.items[0].key]: n }))} />)}
              <span className={one ? "gr-sc gr-sc-one" : "gr-sc"}>{sc === null ? "—" : num(sc)} / {cat.weight}</span></header>
            {!one && cat.items.map((it) => (
              <div key={it.key} className="gr-row">
                <span>{it.label} <em className="gr-sub">{it.weight}%</em>
                  {it.levels && r[it.key] && <small>{it.levels[r[it.key]]}</small>}</span>
                {released ? <b className="gr-val">{r[it.key] || "—"} <small>{cfg.scale?.[r[it.key]] || ""}</small></b>
                  : <Rate value={r[it.key]} scale={it.levels || cfg.scale} label={it.label} onChange={(n) => setR((x) => ({ ...x, [it.key]: n }))} />}
              </div>
            ))}
          </section>
        );
      })}
      {released ? (remarks && <p className="gr-note"><b>Remarks:</b> {remarks}</p>) : (
        <label className="gr-fields one">Remarks (optional)<textarea className="ix-input" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></label>
      )}

      <div className="gr-bar">
        <div className="gr-total big">
          <b>{final === null ? "—" : `${fmt(final)}%`}{final !== null && <em className="gr-eq">{eqText(cfg, final)}</em>}</b>
          <small>{final === null
            ? (supScore === null ? "Final grade appears when the supervisor's appraisal is in." : "Rate every item to see the final grade.")
            : `${num(supScore * share(cfg))} from the supervisor + ${num(cTotal)} from you`}{released ? ` · released ${day(g.finalized_at)}` : ""}</small>
        </div>
        <button type="button" className="ix-b ghost" onClick={print}><Icon name="print" size={14} /> Print</button>
        {released ? (
          <button type="button" className="ix-b ghost" disabled={!!busy} onClick={reopen}>{busy === "reopen" ? "..." : "Reopen"}</button>
        ) : (
          <>
            <button type="button" className="ix-b ghost" disabled={!!busy} onClick={() => save(false)}>{busy === "save" ? "Saving..." : "Save draft"}</button>
            <button type="button" className="ix-b primary" disabled={!!busy || final === null} onClick={() => save(true)}>{busy === "release" ? "Releasing..." : "Release grade"}</button>
          </>
        )}
      </div>
    </>
  );
}

/* ───────── Intern: the released grade ───────── */
export function MyGrade() {
  const [d, setD] = useState(null);
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    fetch(`${API}/my-grade`, { headers: J }).then((r) => r.json()).then(setD).catch(() => setD({ released: false }));
    fetch(`${API}/grades/criteria`, { headers: J }).then((r) => (r.ok ? r.json() : null)).then(setCfg).catch(() => setCfg(null));
  }, []);
  if (!d) return null;
  const supPct = cfg?.supervisor_share ?? 60;
  return (
    <section className="ix-card pf-card gr-mine">
      <style>{GR_CSS}</style>
      <header>Internship grade</header>
      {!d.released ? (
        <div className="gr-wait">
          <span className="oa-none-ic"><Icon name="clock" size={18} /></span>
          <div><b>Not released yet</b>
            <small>{d.appraisal_done ? "Your HTE supervisor's appraisal is in. Your OJT coordinator will release your grade after checking your narrative report."
              : "Your HTE supervisor rates you (60%), then your OJT coordinator checks your narrative report and requirements (40%)."}</small></div>
        </div>
      ) : (
        <>
          <div className="gr-final"><b>{fmt(d.final_grade)}%</b>
            {d.equivalent && <span className="gr-eqbig"><b>{d.equivalent.grade}</b>{d.equivalent.rating}</span>}
            <small>Released {day(d.released_at)}</small></div>
          <div className="gr-tblwrap">
            <table className="gr-tbl">
              <thead><tr><th>Category</th><th>Points</th><th>Counts as</th></tr></thead>
              <tbody>
                <tr className="grp"><td>HTE supervisor appraisal <span className="gr-w">{supPct}%</span>{d.supervisor?.by && <small>Rated by {d.supervisor.by}</small>}</td><td>{num(d.supervisor?.score)} / 100</td><td>{num((d.supervisor?.score || 0) * (supPct / 100))}</td></tr>
                {(cfg?.supervisor || []).map((c) => (
                  <tr key={c.key} className="item"><td>{c.label}</td><td>{num(d.supervisor?.categories?.[c.key])} / {c.weight}</td><td /></tr>
                ))}
                <tr className="grp"><td>OJT coordinator evaluation <span className="gr-w gr-w2">{100 - supPct}%</span>{d.coordinator?.by && <small>Graded by {d.coordinator.by}</small>}</td><td>{num(d.coordinator?.score)} / {100 - supPct}</td><td>{num(d.coordinator?.score)}</td></tr>
                {(cfg?.coordinator || []).map((c) => (
                  <tr key={c.key} className="item"><td>{c.label}</td><td>{num(d.coordinator?.categories?.[c.key])} / {c.weight}</td><td /></tr>
                ))}
                <tr className="tot"><td>Final grade</td><td /><td>{fmt(d.final_grade)}%</td></tr>
              </tbody>
            </table>
          </div>
          {d.supervisor?.strengths && <p className="gr-note"><b>Strengths:</b> {d.supervisor.strengths}</p>}
          {d.supervisor?.improvements && <p className="gr-note"><b>Weaknesses:</b> {d.supervisor.improvements}</p>}
          {d.remarks && <p className="gr-note"><b>Coordinator's remarks:</b> {d.remarks}</p>}
        </>
      )}
    </section>
  );
}

/* The official form F-OSIP-PAR-004 rev.2 "Student-Trainee's Performance Appraisal Report", filled in.
   Page 1 (Part I) = the supervisor's ratings · page 2 (Parts II-III) = the coordinator's computation and the grade.
   coord = null prints page 1 only (the supervisor's copy). */
function printForm(intern, cfg, ratings, notes, coord, final) {
  const w = window.open("", "_blank");
  if (!w) return;
  const ck = (k, n) => (ratings[k] === n ? "✔" : "");
  const rows = (cfg.supervisor || []).map((c) => `<tr class="cat"><td colspan="6">${esc(c.label.toUpperCase())}</td></tr>` +
    c.items.map((it, i) => `<tr><td class="it">${i + 1}. ${esc(it.label)}</td>${[1, 2, 3, 4, 5].map((n) => `<td class="c">${ck(it.key, n)}</td>`).join("")}</tr>`).join("")).join("");
  const total = supTotal(cfg, ratings);
  const coordTot = coord ? coordTotal(cfg, coord.r) : null;
  const eq = eqOf(cfg, final);
  const scale = (cfg.equivalents || []).map((e, i, all) => {
    const hi = i === 0 ? 100 : all[i - 1].min - 1;
    return `<tr><td class="c">${e.grade}</td><td class="c">${e.min === 0 ? "Below 70" : `${e.min} – ${hi}`}</td><td>${esc(e.rating)}</td></tr>`;
  }).join("") + `<tr><td class="c">Inc</td><td></td><td>Incomplete</td></tr><tr><td class="c">Drp</td><td></td><td>Dropped</td></tr>`;
  const head = `<div class="hd"><b>CARAGA STATE UNIVERSITY</b><br>OFFICE OF THE STUDENT INTERNSHIP PROGRAM</div>`;
  const foot = `<div class="ft">F-OSIP-PAR-004, Rev. 2, 01-16-2024</div>`;
  const hours = `${num(intern.hours, 1)} hrs`;
  const page2 = coord ? `
  <section class="pg">${head}
    <p class="part"><b>Part II – To be accomplished by the OJT Coordinator/Director:</b></p>
    <table class="info"><tr><td>Name of student-trainee: <u>${esc(intern.name)}</u></td><td>Course/Year: <u>${esc(intern.program || "")}</u></td></tr>
      <tr><td>Name of Company: <u>${esc(intern.placement || "")}</u></td><td>Semester: <u>${esc(intern.semester || "")}</u> &nbsp; S.Y.: <u>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u></td></tr></table>
    <p class="part"><b>Part III</b></p>
    <table class="p3">
      <tr><td>In-Plant Performance Appraisal</td><td class="c">${total === null ? "" : num(total)}</td><td class="c">60% =</td><td class="c"><b>${total === null ? "" : num(total * 0.6)}</b></td></tr>
      ${(cfg.coordinator || []).map((c) => `<tr class="sub"><td>&nbsp;&nbsp;&nbsp;${esc(c.label)} (${c.weight}%)</td><td class="c">${num(coordCat(c, coord.r))}</td><td></td><td></td></tr>`).join("")}
      <tr><td>OJT Coordinator Performance Appraisal and other requirements</td><td class="c">${coordTot === null ? "" : num(coordTot)}</td><td class="c">40% =</td><td class="c"><b>${coordTot === null ? "" : num(coordTot)}</b></td></tr>
      <tr><td></td><td></td><td class="c">Total: 100%</td><td class="c"><b>${final === null ? "" : fmt(final)}</b></td></tr>
    </table>
    <p class="fg">Final Grade: <u>&nbsp;${eq ? `${eq.grade} (${esc(eq.rating)})` : ""}&nbsp;</u></p>
    ${coord.remarks ? `<p><b>Remarks:</b> ${esc(coord.remarks)}</p>` : ""}
    <p><b>Rating Scale:</b></p>
    <table class="sc"><tr><th>Numerical Grade Equivalent</th><th>Rating</th><th>Adjectival Grade</th></tr>${scale}</table>
    <div class="sig r"><span></span><div>OJT Coordinator/Director</div><small>Rater</small></div>
    ${foot}</section>` : "";
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Performance Appraisal - ${esc(intern.name)}</title><style>
    @page { size: A4; margin: 14mm 16mm; } body { font-family: Arial, sans-serif; font-size: 10pt; color: #111; margin: 0; }
    .pg { position: relative; min-height: 265mm; page-break-after: always; } .pg:last-child { page-break-after: auto; }
    .hd { text-align: center; font-size: 10.5pt; margin-bottom: 6px; } h1 { text-align: center; font-size: 12.5pt; margin: 4px 0 10px; }
    table { width: 100%; border-collapse: collapse; } td, th { border: 1px solid #333; padding: 3px 6px; vertical-align: top; }
    table.info td { width: 50%; } .c { text-align: center; width: 9%; } .it { padding-left: 16px; } tr.cat td { font-weight: bold; background: #f2f2f2; }
    .dir { margin: 8px 0; font-size: 9.5pt; } .tot td { font-weight: bold; } .box { border: 1px solid #333; min-height: 14mm; padding: 4px 6px; margin-top: -1px; }
    .sig { margin-top: 12mm; width: 62mm; text-align: center; } .sig.r { margin-left: auto; } .sig span { display: block; border-bottom: 1px solid #000; height: 16px; font-weight: bold; }
    .sig div { font-size: 9.5pt; } .sig small { font-size: 8.5pt; color: #444; }
    .ft { position: absolute; bottom: 0; left: 0; font-size: 8pt; color: #444; } .part { margin: 10px 0 4px; }
    table.p3 td { border: 0; padding: 4px 6px; } table.p3 tr td:first-child { width: 60%; } table.p3 td.c { width: 13%; border-bottom: 1px solid #333; }
    table.p3 tr.sub td { font-size: 9pt; color: #444; } table.p3 tr.sub td.c { border-bottom: 1px dotted #999; }
    .fg { font-size: 12pt; text-align: right; margin: 8px 0 12px; } table.sc { width: 80%; margin: 0 auto; } table.sc td.c, table.sc th { width: 30%; white-space: nowrap; } table.sc th:last-child { width: 40%; } table.sc th { background: #f2f2f2; font-size: 9pt; } table.sc td { font-size: 9pt; padding: 2px 6px; }
  </style></head><body>
  <section class="pg">${head}
    <h1>STUDENT-TRAINEE'S PERFORMANCE APPRAISAL REPORT</h1>
    <table class="info"><tr><td>Student-Trainee/Program/Year Level:<br><b>${esc(intern.name)}</b> · ${esc(intern.program || "")}</td><td>Name of Company:<br><b>${esc(intern.placement || "")}</b></td></tr>
      <tr><td>Semester/ No. of Training Hours:<br>${esc(intern.semester || "")}${intern.semester ? " · " : ""}${hours}</td><td>Address of Company:<br>&nbsp;</td></tr></table>
    <p class="dir"><b>Part I – DIRECTION:</b> Please rate by checking the appropriate column that best describes the performance of the above student trainee. Please use the ratings as follows: Five (5) being the highest and One (1) the lowest.</p>
    <table><tr><th>CRITERIA</th>${[1, 2, 3, 4, 5].map((n) => `<th class="c">${n}</th>`).join("")}</tr>${rows}
      <tr class="tot"><td style="text-align:right">TOTAL POINTS:</td><td colspan="5" class="c">${total === null ? "" : num(total)}</td></tr></table>
    <div class="box"><b>STRENGTHS:</b> ${esc(notes.strengths || "")}</div>
    <div class="box"><b>WEAKNESSES:</b> ${esc(notes.improvements || "")}</div>
    <div class="box"><b>COMMENT/SUGGESTIONS:</b> ${esc(notes.comments || "")}</div>
    <div class="sig r"><small>Rated by:</small><span>${esc(notes.evaluator_name || "")}</span><div>Training Supervisor</div></div>
    ${foot}</section>${page2}
  </body></html>`);
  w.document.close(); setTimeout(() => w.print(), 300);
}

const GR_CSS = `
.gr .oa-detail { gap: 12px; }
.gr .oa-kv b em { font-style: normal; font-weight: 500; font-size: 12px; color: #64748b; margin-left: 2px; }
.gr .oa-kv b.warn { color: #b45309; }
.gr-scale { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; color: #64748b; padding: 8px 12px; border-radius: 10px; background: #fafbfc; border: 1px solid #eef0f4; flex: none; }
.gr-scale b { color: #c2410c; }
.gr-sec { border: 1px solid #eef0f4; border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; flex: none; }
.gr-sec > header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.gr-sec > header b { font-size: 14px; color: #0f172a; }
.gr-w { font-size: 11px; font-weight: 700; color: #c2410c; background: #fff1ea; padding: 2px 8px; border-radius: 99px; }
.gr-sec > header .gr-rate { margin-left: auto; }
.gr-sc-one { margin-left: 12px !important; min-width: 52px; text-align: right; }
.gr-inline { margin-left: auto; }
.gr-ph { margin: 10px 0 2px; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #64748b; display: flex; gap: 8px; align-items: center; }
.gr-ph span { color: #c2410c; background: #fff1ea; padding: 1px 7px; border-radius: 99px; letter-spacing: 0; }
.gr-sc { margin-left: auto; font-size: 13px; font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums; }
.gr-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 0; border-top: 1px dashed #f0f1f4; }
.gr-row:first-of-type { border-top: 0; }
.gr-row > span { min-width: 0; font-size: 13px; color: #1e293b; display: flex; flex-direction: column; line-height: 1.3; }
.gr-row > span small { font-size: 11.5px; color: #c2410c; margin-top: 2px; }
.gr-sub { font-style: normal; font-size: 11px; color: #94a3b8; }
.gr-rate { display: flex; gap: 4px; flex: none; }
.gr-rate button { width: 34px; height: 34px; border-radius: 9px; border: 1px solid #e5e7eb; background: #fff; font: inherit; font-weight: 700; font-size: 13px; color: #374151; cursor: pointer; padding: 0; }
.gr-rate button:hover:not(:disabled) { border-color: #e8582a; color: #c2410c; }
.gr-rate button.on { background: #e8582a; border-color: #e8582a; color: #fff; }
.gr-val { font-size: 14px; color: #c2410c; white-space: nowrap; } .gr-val small { font-size: 11px; color: #64748b; font-weight: 500; }
.gr-hint { margin: 2px 0; font-size: 12px; color: #64748b; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; line-height: 1.4; }
.gr-hint.warn { color: #b45309; }
.gr-note { margin: 0; font-size: 12.5px; color: #334155; line-height: 1.5; }
.gr-fields { display: flex; flex-direction: column; gap: 8px; flex: none; }
.gr-fields label, label.gr-fields { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; font-weight: 600; color: #374151; }
.gr-fields textarea { height: auto !important; min-height: 56px; resize: vertical; }
.gr-barrow { display: grid; grid-template-columns: minmax(0, 250px) minmax(0, 1fr) 70px; align-items: center; gap: 10px; font-size: 12.5px; color: #334155; padding: 3px 0; }
.gr-barrow i { height: 8px; border-radius: 99px; background: #f1f2f5; overflow: hidden; }
.gr-barrow i em { display: block; height: 100%; border-radius: 99px; background: #e8582a; }
.gr-barrow b { text-align: right; font-variant-numeric: tabular-nums; color: #0f172a; }
.gr-docs { display: flex; flex-wrap: wrap; gap: 6px; flex: none; }
.gr-doc { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid #e5e7eb; background: #fff; font-size: 12px; font-weight: 600; color: #334155; text-decoration: none; }
.gr-doc:hover { border-color: #e8582a; color: #c2410c; }
.gr-doc .st { font-size: 10.5px; font-weight: 700; text-transform: capitalize; color: #b45309; }
.gr-doc .st.approved { color: #15803d; } .gr-doc .st.rejected { color: #b91c1c; }
.gr-bar { position: sticky; bottom: -18px; margin: auto -20px -18px; padding: 12px 20px; background: #fff; border-top: 1px solid #eef0f4; display: flex; align-items: center; gap: 8px; flex: none; z-index: 2; }
.gr-total { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.25; }
.gr-total b { font-size: 16px; color: #0f172a; font-variant-numeric: tabular-nums; }
.gr-total.big b { font-size: 24px; color: #c2410c; }
.gr-total small { font-size: 12px; color: #64748b; }
.gr-eq { font-style: normal; font-size: 13px; font-weight: 700; color: #15803d; background: #dcfce7; padding: 2px 9px; border-radius: 99px; margin-left: 10px; vertical-align: middle; letter-spacing: 0; }
.gr-eqbig { display: inline-flex; align-items: baseline; gap: 6px; font-size: 13px; font-weight: 600; color: #15803d; background: #dcfce7; padding: 4px 12px; border-radius: 99px; }
.gr-eqbig b { font-size: 16px; }
/* intern's card */
.gr-mine > header { font-weight: 700; }
.gr-wait { display: flex; gap: 12px; align-items: flex-start; padding: 14px 18px; }
.gr-wait b { display: block; font-size: 14px; } .gr-wait small { font-size: 12.5px; color: #64748b; line-height: 1.45; }
.gr-wait .oa-none-ic { width: 38px; height: 38px; border-radius: 50%; background: #fff1ea; color: #ea580c; display: inline-flex; align-items: center; justify-content: center; flex: none; }
.gr-final { display: flex; align-items: baseline; gap: 10px; padding: 14px 18px 4px; }
.gr-final b { font-size: 34px; color: #c2410c; letter-spacing: -1px; } .gr-final small { color: #64748b; font-size: 12.5px; }
.gr-parts { padding: 6px 18px; display: flex; flex-direction: column; gap: 2px; }
.gr-share { display: flex; gap: 8px; align-items: center; font-size: 12.5px; color: #475569; flex: none; }
.gr-cov { display: block; font-size: 11px; color: #94a3b8; line-height: 1.3; margin-top: 1px; }
.gr-formula { margin: 8px 0 2px; padding: 8px 12px; border-radius: 10px; background: #fff1ea; color: #7c2d12; font-size: 12.5px; }
.gr-tblwrap { padding: 6px 18px 8px; overflow-x: auto; }
.gr-tbl { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
.gr-tbl th { font-size: 10.5px; letter-spacing: .07em; text-transform: uppercase; color: #64748b; font-weight: 700; text-align: right; padding: 4px 0 8px; }
.gr-tbl th:first-child, .gr-tbl td:first-child { text-align: left; }
.gr-tbl td { text-align: right; padding: 9px 0; border-top: 1px solid #eef0f4; color: #0f172a; white-space: nowrap; }
.gr-tbl td:first-child { white-space: normal; }
.gr-tbl tr.grp td { background: #f6f7f9; font-weight: 700; padding: 9px 10px; border-top: 0; }
.gr-tbl tr.grp td small { display: block; font-size: 11px; font-weight: 500; color: #64748b; margin-top: 2px; }
.gr-tbl tr.item td:first-child { padding-left: 16px; }
.gr-tbl tr.tot td { border-top: 2px solid #0f172a; font-weight: 700; font-size: 14px; padding-top: 12px; }
.gr-tbl tr.tot td:last-child { color: #c2410c; font-size: 16px; }
.gr-w2 { color: #1d4ed8; background: #eaf1ff; }
.gr-mine .gr-note { padding: 2px 18px; }
.gr-mine .gr-note:last-child { padding-bottom: 16px; }
@media (max-width: 640px) {
  .gr-row { flex-direction: column; align-items: stretch; }
  .gr-sec > header { flex-wrap: wrap; } .gr-sec > header .gr-rate { order: 5; flex: 1 1 100%; }
  .gr-rate { justify-content: space-between; } .gr-rate button { flex: 1; height: 40px; }
  .gr-barrow { grid-template-columns: minmax(0, 1fr) 64px; } .gr-barrow i { grid-column: 1 / -1; grid-row: 2; }
  .gr-bar { flex-wrap: wrap; position: sticky; bottom: 0; margin: 8px -14px -14px; padding: 10px 14px; box-shadow: 0 -6px 16px rgba(15,23,42,.06); } .gr-bar .gr-total { flex: 1 1 100%; } .gr-bar .ix-b { flex: 1; }
  .gr .oa-kv { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
`;