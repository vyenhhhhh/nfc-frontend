//Evaluations.jsx
// The internship grade (CCIS "Internship Grading Criteria", OJT/Practicum IS 197 · IT 197 · CS 197):
//   Part 1 · HTE supervisor appraisal   60%  Attendance & Punctuality 15 · Performance 50 · General Attitude 35
//   Part 2 · SIP coordinator evaluation 40%  Narrative/Technical Report 25 (rubric) · Timely Submission 10 · Compliance 5
//   Final grade (%) = supervisor total × 0.60 + coordinator total
// Supervisor: rates their own interns (Part 1).
// OJT coordinator: sees Part 1, rates Part 2, then releases the grade to the intern.
// Intern: <MyGrade /> shows the grade once it is released.
// The signed paper evaluation form is still uploaded by the intern as a post-internship requirement.
import { Fragment, useState, useEffect } from "react";
import { Icon, Msg, Spinner, Badge, Avatar, OA_CSS, esc, confirmBox } from "./DashKit.jsx";
import { API } from "../config.js";
import { fileHref, openFile } from "../files.js";
import ReviewQueue from "./ReviewQueue.jsx";
// the header pictures of the printed appraisal form (taken from the official F-OSIP-PAR-004 rev.2 .docx)
import formHeaderCsu from "../assets/form-csu-header.jpg";
import formHeaderBp from "../assets/bagong-pilipinas.png";
import formHeaderIso from "../assets/iso-cert.jpg";

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
  const [prog, setProg] = useState("all");
  const [hte, setHte] = useState("all");
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
  const progOf = (i) => { const p = String(i.program || "").toUpperCase(); return /BSIT|INFORMATION\s+TECH/.test(p) ? "BSIT" : /BSIS|INFORMATION\s+SYS/.test(p) ? "BSIS" : /BSCS|COMPUTER\s+SCI/.test(p) ? "BSCS" : ""; };
  const htes = [...new Set(rows.map((i) => String(i.placement || "").trim()).filter(Boolean))].sort();
  const keep = (i) => (prog === "all" || progOf(i) === prog) && (hte === "all" || String(i.placement || "").trim() === hte);
  // the coordinator's grade sheet: every intern (with the filters), as a CSV for Excel / Google Sheets
  const exportCsv = () => {
    const cell = (v) => { const t = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const head = ["Intern", "Student ID", "Program", "HTE", "HTE supervisor", "Hours rendered", "Appraisal (of 100)", "Coordinator (of 40)", "Final grade (%)", "Equivalent", "Status"];
    const body = rows.filter(keep).map((i) => [i.name, i.student_id || "", progOf(i) || i.program || "", i.placement || "", i.supervisor_name || "",
      i.hours ?? "", i.appraisal?.score ?? "", i.grade?.coordinator_score ?? "", i.grade?.final_grade ?? "",
      i.grade?.equivalent ? `${i.grade.equivalent.grade} (${i.grade.equivalent.rating})` : "",
      i.grade?.finalized_at ? "Released" : i.appraisal ? "Ready to grade" : "Supervisor pending"]);
    const blob = new Blob(["\uFEFF" + [head, ...body].map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `Internship_grades_${new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  };
  // an appraisal is finished only when every item is rated (the server gives no score before that)
  const finished = (i) => i.appraisal?.score !== null && i.appraisal?.score !== undefined;
  const itemsAll = (cfg?.supervisor || []).reduce((s, c) => s + c.items.length, 0);
  const itemsRated = (i) => (cfg?.supervisor || []).reduce((s, c) => s + c.items.filter((it) => (i.appraisal?.ratings || {})[it.key] >= 1).length, 0);
  const supText = (i) => finished(i) ? `${fmt(i.appraisal.score)} / 100` : i.appraisal ? `Not finished · ${itemsRated(i)} of ${itemsAll} rated` : "Not yet";
  const badge = (i) => {
    if (coord) {
      if (i.grade?.finalized_at) return <Badge label={`${fmt(i.grade.final_grade)}% · ${eqOf(cfg, i.grade.final_grade)?.grade || ""}`} type="approved" />;
      if (!i.appraisal) return <Badge label="Supervisor pending" type="pending" />;
      if (!finished(i)) return <Badge label="Appraisal not finished" type="pending" />;
      // the grade can be released only once the required hours are complete
      if ((Number(i.hours) || 0) + 0.01 < (Number(i.required_hours) || 0)) return <Badge label="Hours not complete" type="pending" />;
      return <Badge label="Ready to grade" type="online" />;
    }
    return finished(i) ? <Badge label={`${fmt(i.appraisal.score)} / 100`} type="approved" />
      : i.appraisal ? <Badge label="Not finished" type="pending" /> : i.draft ? <Badge label="Draft" type="pending" /> : <Badge label="Not yet" type="pending" />;
  };

  // same layout as the Approvals pages: tabs · a table of interns · the grading in a drawer
  const progShown = keep;
  return (
    <>
      <style>{OA_CSS + GR_CSS}</style>
      {!ready && <div className="ix-alert"><Icon name="warn" size={16} /> Run "php artisan migrate" on the server to turn on grading.</div>}
      <Msg msg={msg} />
      <ReviewQueue
        tabs={[
          { key: "todo", label: coord ? "To grade" : "To rate", items: todo.filter(progShown), hot: true,
            empty: ["All caught up", rows.length === 0 ? (coord ? "No interns yet." : "No interns are assigned to you yet.") : "Every intern here is done."] },
          { key: "done", label: coord ? "Released" : "Rated", items: done.filter(progShown),
            empty: [coord ? "No grades released yet" : "No appraisals yet", coord ? "Grades you release show here." : "Interns you rate show here."] },
        ]}
        rowKey={(i) => i.id}
        searchText={(i) => `${i.name} ${i.student_id || ""} ${i.placement || ""}`}
        openLabel={(t) => (t === "todo" ? (coord && user?.role !== "admin" ? "Grade" : coord ? "View" : "Rate") : "View")}
        toolbar={rows.length > 0 && (
          <>
            <select className="ix-select" value={prog} onChange={(e) => setProg(e.target.value)} aria-label="Program">
              <option value="all">All programs</option>
              {["BSIT", "BSCS", "BSIS"].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            {htes.length > 1 && (
              <select className="ix-select" value={hte} onChange={(e) => setHte(e.target.value)} aria-label="HTE">
                <option value="all">All HTEs</option>
                {htes.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            )}
            {coord && <button type="button" className="ix-b ghost sm" onClick={exportCsv} title="Save the grade sheet for Excel / Google Sheets"><Icon name="download" size={14} /> Export</button>}
          </>
        )}
        columns={[
          { label: "Intern", render: (i) => (
            <span className="rq2-who"><Avatar name={i.name} photo={i.photo} size={32} /><span><b>{i.name}</b><small>{[i.student_id, progOf(i)].filter(Boolean).join(" · ")}</small></span></span>) },
          { label: "HTE", className: "rq2-hide-sm", render: (i) => <span className="rq2-muted">{i.placement || "—"}</span> },
          { label: "Hours", render: (i) => <span className="rq2-muted">{num(i.hours, 1)}h / {num(i.required_hours, 0)}h</span> },
          { label: "Supervisor (60%)", render: (i) => <span className="rq2-muted">{supText(i)}</span> },
          ...(coord ? [{ label: "Final grade", render: (i) => <span className="rq2-main">{i.grade?.final_grade != null ? `${fmt(i.grade.final_grade)}%` : "—"}</span> }] : []),
          { label: "Status", render: badge },
        ]}
        drawer={(i) => ({
          icon: "chart",
          kicker: [i.student_id, i.program, i.placement].filter(Boolean).join(" · ") || "Internship grade",
          title: i.name,
          actions: badge(i),
          body: (
            <div className="gr gr-drawer">
              <style>{OA_CSS + GR_CSS}</style>
              <div className="oa-kv">
                <div><small>Hours rendered</small><b>{num(i.hours, 1)}h <em>/ {num(i.required_hours, 0)}h</em></b></div>
                <div><small>Days present</small><b>{i.attendance?.days ?? 0}</b></div>
                <div><small>Late time ins</small><b className={i.attendance?.late ? "warn" : ""}>{i.attendance?.late ?? 0}<em> after 8:00 AM</em></b></div>
                <div><small>{coord ? "HTE supervisor" : "Grade"}</small><b>{coord ? i.supervisor_name || "None assigned" : i.grade?.finalized_at ? "Released" : "Not released"}</b></div>
              </div>
              {coord
                ? <CoordPanel key={i.id} intern={i} cfg={cfg} viewOnly={user?.role === "admin"} onDone={(t) => { setMsg({ type: "success", text: t }); load(); }} onError={(t) => setMsg({ type: "error", text: t })} />
                : <SupervisorPanel key={i.id} intern={i} cfg={cfg} onDone={(t) => { setMsg({ type: "success", text: t }); load(); }} onError={(t) => setMsg({ type: "error", text: t })} />}
            </div>
          ),
        })}
      />
    </>
  );
}

/* ───────── HTE supervisor: the appraisal (60%) ───────── */
function SupervisorPanel({ intern, cfg, onDone, onError }) {
  const ex = intern.appraisal;
  const dr = !ex ? intern.draft : null;   // a saved draft (not submitted yet): the supervisor continues from it
  const src = ex || dr;
  const locked = !!intern.grade?.finalized_at;
  const [r, setR] = useState(() => src?.ratings || {});
  const [f, setF] = useState({ strengths: src?.strengths || "", improvements: src?.improvements || "", comments: src?.comments || "" });
  const [edit, setEdit] = useState(!ex);
  const [share, setShare] = useState(src ? src.share_comments !== false : true);
  const [busy, setBusy] = useState("");
  const total = supTotal(cfg, r);
  const rated = (cfg.supervisor || []).reduce((s, c) => s + c.items.filter((it) => r[it.key] >= 1).length, 0);
  const items = (cfg.supervisor || []).reduce((s, c) => s + c.items.length, 0);

  // draft = save what is rated so far without sending it (it does not count until it is submitted)
  const submit = async (draft = false) => {
    setBusy(draft ? "draft" : "submit");
    try {
      const res = await fetch(`${API}/evaluations`, {
        method: "POST", headers: { ...J, "Content-Type": "application/json" },
        body: JSON.stringify({ intern_id: intern.id, mode: "system", ratings: r, share_comments: share, draft, ...f }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d.errors && Object.values(d.errors)[0]?.[0]) || d.message || "Couldn't save the appraisal.");
      if (!draft) setEdit(false);
      onDone(d.message || (draft ? "Draft saved." : "Appraisal saved."));
    } catch (e) { onError(e instanceof TypeError ? "Couldn't reach the server." : e.message); } finally { setBusy(""); }
  };

  return (
    <>
      {locked && <div className="oa-done ok"><Icon name="check" size={14} /><span>The OJT coordinator released this intern's grade, so your appraisal can no longer be changed.</span></div>}
      {dr && !locked && (
        <div className="oa-done"><Icon name="pencil" size={14} /><span>Draft saved on {day(dr.updated_at)}. It is not sent to the OJT coordinator until you click Submit appraisal.</span></div>
      )}
      {!edit && ex && !locked && (
        <div className="oa-done"><Icon name="check" size={14} /><span>You rated {intern.name} on {day(ex.updated_at)}. You can still change it until the coordinator releases the grade.</span></div>
      )}
      {/* laid out like the paper form F-OSIP-PAR-004 rev.2: the header, then Part I (criteria × 1–5), total points */}
      <div className="pf-form">
        <div className="pf-title">STUDENT-TRAINEE'S PERFORMANCE APPRAISAL REPORT</div>
        <div className="pf-info">
          <div><small>Student-Trainee/Program/Year Level</small><b>{intern.name}{intern.program ? ` · ${intern.program}` : ""}</b></div>
          <div><small>Name of Company</small><b>{intern.placement || "—"}</b></div>
          <div><small>Semester/ No. of Training Hours</small><b>{[intern.semester, `${num(intern.hours, 1)} hrs`].filter(Boolean).join(" · ")}</b></div>
          <div><small>Address of Company</small><b>{intern.hte_address || "—"}</b></div>
        </div>
        <p className="pf-dir"><b>Part I – DIRECTION:</b> Please rate by {edit && !locked ? "clicking" : "checking"} the appropriate column that best describes the performance of the above student trainee. Five (5) being the highest and One (1) the lowest.</p>
        <table className="pf-tb">
          <thead><tr><th>CRITERIA</th>{[1, 2, 3, 4, 5].map((n) => <th key={n} className="c" title={cfg.scale?.[n]}>{n}</th>)}</tr></thead>
          <tbody>
            {(cfg.supervisor || []).map((cat) => {
              const sc = supCat(cat, r);
              return (
                <Fragment key={cat.key}>
                  <tr className="cat"><td colSpan={6}>{cat.label.toUpperCase()}<span>{sc === null ? "—" : num(sc)} / {cat.weight}</span></td></tr>
                  {cat.key === "attendance" && (
                    <tr className="hint"><td colSpan={6}><Icon name="clock" size={12} /> From the attendance log: {intern.attendance?.days ?? 0} days present, {intern.attendance?.late ?? 0} late time ins.</td></tr>
                  )}
                  {cat.items.map((it, i) => (
                    <tr key={it.key} className={r[it.key] >= 1 ? "" : "todo"}>
                      <td className="it">{i + 1}. {it.label}</td>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <td key={n} className="c">
                          {edit && !locked
                            ? <button type="button" className={r[it.key] === n ? "pf-ck on" : "pf-ck"} aria-label={`${it.label}: ${n}`} aria-pressed={r[it.key] === n}
                                onClick={() => setR((x) => ({ ...x, [it.key]: n }))}>{r[it.key] === n ? "✔" : ""}</button>
                            : <span className="pf-mark">{r[it.key] === n ? "✔" : ""}</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              );
            })}
            <tr className="tot"><td>TOTAL POINTS:</td><td colSpan={5} className="c">{total === null ? `${rated} of ${items} rated` : `${num(total)} / 100`}</td></tr>
          </tbody>
        </table>
      </div>
      <div className="gr-fields">
        {[["strengths", "Strengths"], ["improvements", "Weaknesses"], ["comments", "Comment / suggestions"]].map(([k, l]) => (
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
            {!ex && <button type="button" className="ix-b ghost" disabled={!!busy || rated === 0} onClick={() => submit(true)}>{busy === "draft" ? "Saving..." : "Save draft"}</button>}
            <button type="button" className="ix-b primary" disabled={total === null || !!busy} onClick={() => submit(false)}>{busy === "submit" ? "Saving..." : ex ? "Save changes" : "Submit appraisal"}</button>
          </>
        ) : <button type="button" className="ix-b ghost" onClick={() => setEdit(true)}><Icon name="pencil" size={14} /> Change ratings</button>)}
      </div>
    </>
  );
}

/* ───────── OJT coordinator: Part 2 (40%) and the final grade ───────── */
function CoordPanel({ intern, cfg, onDone, onError, viewOnly = false }) {
  const g = intern.grade;
  const ap = intern.appraisal;
  const isReleased = !!g?.finalized_at;
  const released = isReleased || viewOnly;   // the admin only views the grade (grading is the coordinator's job)
  const [r, setR] = useState(() => g?.ratings || {});
  const [remarks, setRemarks] = useState(g?.remarks || "");
  const [busy, setBusy] = useState("");
  const supScore = ap?.score ?? null;
  const cTotal = coordTotal(cfg, r);
  const final = supScore === null || cTotal === null ? null : supScore * share(cfg) + cTotal;
  const docs = Object.entries(intern.docs || {});
  // the grade is released only after the intern has completed the required hours (the server checks it too)
  const hoursLeft = Math.max((Number(intern.required_hours) || 0) - (Number(intern.hours) || 0), 0);
  const hoursDone = hoursLeft <= 0.01;

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
    if (!(await confirmBox({ title: "Reopen this grade?", message: `Reopen the grade of ${intern.name}? They won't see it until you release it again.`, ok: "Yes, reopen" }))) return;
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
          <p className="gr-hint warn"><Icon name="clock" size={13} /> {intern.supervisor_name ? `Waiting for ${intern.supervisor_name} to rate this intern in their account.` : "This intern has no HTE supervisor yet. Assign one in HTEs → Supervisors."}</p>
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
            : `${num(supScore * share(cfg))} from the supervisor + ${num(cTotal)} from ${viewOnly ? "the coordinator" : "you"}`}{isReleased ? ` · released ${day(g.finalized_at)}` : viewOnly ? " · not released yet" : ""}
            {!released && !hoursDone && <> · <span style={{ color: "#c2410c", fontWeight: 600 }}>release after the hours are complete ({num(hoursLeft, 1)}h left)</span></>}</small>
        </div>
        <button type="button" className="ix-b ghost" onClick={print}><Icon name="print" size={14} /> Print</button>
        {viewOnly ? null : released ? (
          <button type="button" className="ix-b ghost" disabled={!!busy} onClick={reopen}>{busy === "reopen" ? "..." : "Reopen"}</button>
        ) : (
          <>
            <button type="button" className="ix-b ghost" disabled={!!busy} onClick={() => save(false)}>{busy === "save" ? "Saving..." : "Save draft"}</button>
            <button type="button" className="ix-b primary" disabled={!!busy || final === null || !hoursDone} onClick={() => save(true)}
              title={hoursDone ? "" : `${intern.name} still has ${num(hoursLeft, 1)}h left of ${num(intern.required_hours, 0)}h. You can save a draft now and release the grade once the hours are complete.`}>
              {busy === "release" ? "Releasing..." : "Release grade"}</button>
          </>
        )}
      </div>
    </>
  );
}

/* ───────── Intern: the released grade ───────── */
// the sidebar count on My Grade: a released grade the intern has not opened yet (remembered on this browser)
const gradeSeenKey = () => { try { return `grade_seen_${JSON.parse(sessionStorage.getItem("user") || "{}").id || ""}`; } catch { return "grade_seen_"; } };
export const gradeIsNew = (g) => {
  if (!g?.released || !g.released_at) return false;
  try { return localStorage.getItem(gradeSeenKey()) !== String(g.released_at); } catch { return false; }
};
const markGradeSeen = (g) => {
  if (!g?.released || !g.released_at) return;
  try { localStorage.setItem(gradeSeenKey(), String(g.released_at)); } catch { /* private mode: the count just stays */ }
  window.dispatchEvent(new Event("grade-seen"));   // the sidebar removes the count right away
};

export function MyGrade() {
  const [d, setD] = useState(null);
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    fetch(`${API}/my-grade`, { headers: J }).then((r) => r.json()).then((g) => { setD(g); markGradeSeen(g); }).catch(() => setD({ released: false }));
    fetch(`${API}/grades/criteria`, { headers: J }).then((r) => (r.ok ? r.json() : null)).then(setCfg).catch(() => setCfg(null));
  }, []);
  const supPct = cfg?.supervisor_share ?? 60;
  // while loading: the same card with a spinner, so the page does not jump from one message to another
  if (!d) return (
    <section className="ix-card gr-mine gr-box"><style>{GR_CSS}</style><header>Internship grade</header><div className="gr-load"><Spinner /></div></section>
  );
  if (!d.released) {
    const steps = [
      { t: `HTE supervisor's appraisal (${supPct}%)`, s: d.appraisal_done ? "Done" : "Waiting for your HTE supervisor", ok: !!d.appraisal_done },
      { t: `OJT coordinator's evaluation (${100 - supPct}%)`, s: "Narrative report, timely submission and compliance with the requirements", ok: false },
      { t: "Grade released", s: "You will get a notification when your grade is out", ok: false },
    ];
    return (
      <section className="ix-card gr-mine gr-box">
        <style>{GR_CSS}</style>
        <header>Internship grade</header>
        {/* same centered note as My DTR ("No DTR displayed yet"), with the steps under it */}
        <div className="gr-wait">
          <span className="gr-wait-ic"><Icon name="clock" size={26} /></span>
          <strong>Not released yet</strong>
          <p>{d.appraisal_done ? "Your HTE supervisor's appraisal is in. Your OJT coordinator will release your grade after checking your narrative report."
            : `Your HTE supervisor rates you (${supPct}%), then your OJT coordinator checks your narrative report and requirements (${100 - supPct}%).`}</p>
          <ol className="gr-steps">
            {steps.map((x, i) => (
              <li key={i} className={x.ok ? "ok" : ""}>
                <i>{x.ok ? <Icon name="check" size={13} /> : i + 1}</i>
                <span><b>{x.t}</b><small>{x.s}</small></span>
              </li>
            ))}
          </ol>
        </div>
      </section>
    );
  }
  return (
    <section className="ix-card pf-card gr-mine">
      <style>{GR_CSS}</style>
      <header>Internship grade</header>
      {(
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
/* The printed form = the official "STUDENT-TRAINEE'S PERFORMANCE APPRAISAL REPORT" F-OSIP-PAR-004, Rev. 2,
   built from the measurements of the .docx itself (src/assets/…F-OSIP-PAR-004 rev.2.docx):
   A4; margins top 36 · left 12.5 · right 7.5 mm; the header pictures at their exact places on the page;
   table columns 85.1 · 12.9 · 2.0 · 12.9 · 15.1 · 15.3 · 44.0 mm and the same row heights;
   the form number at the bottom left in italic Calibri.
   Page 2 (Part II / III and the rating scale) is printed when the coordinator's part is given. */
function printForm(intern, cfg, ratings, notes, coord, final) {
  const w = window.open("", "_blank");
  if (!w) return;
  const ck = (k, n) => (ratings[k] === n ? "&#10003;" : "");
  const total = supTotal(cfg, ratings);
  const coordTot = coord ? coordTotal(cfg, coord.r) : null;
  const eq = eqOf(cfg, final);
  const now = new Date(); const sy0 = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
  const sy = `${sy0}–${sy0 + 1}`;
  const img = (u) => (u ? new URL(u, window.location.href).href : "");

  // the header, placed exactly like the .docx header (positions from the top-left of the page)
  const header = `
    <img class="h-csu" src="${img(formHeaderCsu)}" alt="">
    <img class="h-bp" src="${img(formHeaderBp)}" alt="">
    <img class="h-iso" src="${img(formHeaderIso)}" alt="">
    <div class="h-osip">OFFICE OF THE STUDENT INTERNSHIP PROGRAM</div>
    <div class="ft">F-OSIP-PAR-004, Rev. 2, 01-16-2024</div>`;

  // 1 = cols 2+3 (12.9 + 2.0), 2 = col 4, 3 = col 5, 4 = col 6, 5 = col 7
  const cells = (k) => [1, 2, 3, 4, 5].map((n) => `<td class="c"${n === 1 ? ' colspan="2"' : ""}>${k ? ck(k, n) : ""}</td>`).join("");
  const rows = (cfg.supervisor || []).map((c) => `<tr class="r"><td class="cat">${esc(c.label.toUpperCase())}</td>${cells(null)}</tr>` +
    c.items.map((it, i) => `<tr class="r"><td class="it"><span class="no">${i + 1}.</span>${esc(it.label)}</td>${cells(it.key)}</tr>`).join("")).join("");

  // the form's own rating scale (1.00 … 5.00, Inc, Drp)
  const SCALE = [["1.00", "98 – 100", "Excellent"], ["1.25", "94 – 97", "Superior"], ["1.50", "90 – 93", "Very Good"], ["1.75", "88 – 89", "Meritorious"],
    ["2.00", "85 – 87", "Very Satisfactory"], ["2.50", "80 – 82", "Satisfactory"], ["2.75", "78 – 79", "Fairly Satisfactory"], ["3.00", "75 – 77", "Passing"],
    ["4.00", "70 – 74", "Conditional Failure"], ["5.00", "Below 70", "Failure"], ["Inc", "", "Incomplete"], ["Drp", "", "Dropped"]];

  const page1 = `
  <section class="pg">${header}
    <div class="body">
      <table class="f">
        <colgroup><col style="width:85.1mm"><col style="width:12.9mm"><col style="width:2mm"><col style="width:12.9mm"><col style="width:15.1mm"><col style="width:15.3mm"><col style="width:44mm"></colgroup>
        <tr style="height:14.6mm"><td colspan="7" class="title">STUDENT-TRAINEE’S PERFORMANCE APPRAISAL REPORT</td></tr>
        <tr style="height:10.5mm"><td colspan="3" class="lbl">Student-Trainee/Program/Year Level<span>${esc(intern.name)}${intern.program ? ` · ${esc(intern.program)}` : ""}</span></td>
          <td colspan="4" class="lbl">Name of Company<span>${esc(intern.placement || "")}</span></td></tr>
        <tr style="height:9.7mm"><td colspan="3" class="lbl">Semester/ No. of Training Hours<span>${esc(intern.semester || "")}${intern.semester ? " · " : ""}${num(intern.hours, 1)} hrs</span></td>
          <td colspan="4" class="lbl">Address of Company<span>${esc(intern.hte_address || "")}</span></td></tr>
        <tr style="height:8.1mm"><td colspan="7" class="dir"><b>Part I – DIRECTION:</b> Please rate by checking the appropriate column that best describes the performance of the above student
          trainee. Please use the ratings as follows: Five <b>(5)</b> being the highest and One <b>(1)</b> the lowest.</td></tr>
        <tr style="height:5.6mm" class="hd"><td>CRITERIA</td><td colspan="2">1</td><td>2</td><td>3</td><td>4</td><td>5</td></tr>
        ${rows}
        <tr class="r tot"><td colspan="7"><span>TOTAL POINTS:</span>${total === null ? "" : `<b>${num(total)}</b>`}</td></tr>
        <tr style="height:16.2mm"><td colspan="7" class="box"><b>STRENGTHS:</b><div>${esc(notes.strengths || "")}</div></td></tr>
        <tr style="height:16.2mm"><td colspan="7" class="box"><b>WEAKNESSES:</b><div>${esc(notes.improvements || "")}</div></td></tr>
        <tr style="height:24.3mm"><td colspan="7" class="box"><b>COMMENT/SUGGESTIONS:</b><div>${esc(notes.comments || "")}</div></td></tr>
        <tr style="height:20.3mm"><td colspan="7" class="rated">
          <div class="rb">Rated by:</div>
          <div class="sg">${esc(notes.evaluator_name || "")}</div>
          <div class="rl">Training Supervisor</div></td></tr>
      </table>
    </div>
  </section>`;

  const page2 = coord ? `
  <section class="pg">${header}
    <div class="body">
      <table class="f p2">
        <colgroup><col style="width:70.1mm"><col style="width:31.8mm"><col style="width:35mm"><col style="width:50.5mm"></colgroup>
        <tr style="height:4mm"><td colspan="4"><b>Part II –</b> To be accomplished by the OJT Coordinator/Director:</td></tr>
        <tr style="height:4.9mm"><td colspan="2">Name of student-trainee: ${esc(intern.name)}</td><td colspan="2">Course/Year: ${esc(intern.program || "")}</td></tr>
        <tr style="height:4.1mm"><td colspan="2">Name of Company: ${esc(intern.placement || "")}</td><td>Semester: ${esc(intern.semester || "")}</td><td>S.Y.: ${sy}</td></tr>
        <tr style="height:17.1mm"><td colspan="4" class="p3">
          <div><b>Part III –</b> In-Plant Performance Appraisal<span class="ul w1"></span>60% =<span class="ul w2">${total === null ? "" : num(total * 0.6)}</span></div>
          <div class="in">OJT Coordinator Performance Appraisal and other requirements<span class="ul w3"></span><u>40%</u> =<span class="ul w2">${coordTot === null ? "" : num(coordTot)}</span></div>
          <div class="rt">Total: 100%</div>
          <div class="rt">Final Grade: <span class="ul w2">${final === null ? "" : `${fmt(final)}${eq ? ` (${eq.grade})` : ""}`}</span></div></td></tr>
        <tr style="height:6.1mm"><td colspan="4" class="nb">Rating Scale:</td></tr>
        <tr style="height:58.8mm"><td colspan="4" class="scale">
          <table><tr class="sh"><td>Numerical Grade Equivalent</td><td>Rating</td><td>Adjectival Grade</td></tr>
            ${SCALE.map(([g, r, a]) => `<tr><td>${g}</td><td>${r}</td><td>${a}</td></tr>`).join("")}</table></td></tr>
        <tr style="height:17.8mm"><td colspan="4" class="rater"><div>Rater:</div><div class="sg2"></div><div>OJT Coordinator/Director</div></td></tr>
      </table>
    </div>
  </section>` : "";

  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Performance Appraisal - ${esc(intern.name)}</title><style>
    @page { size: 210mm 297mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: "Times New Roman", Times, serif; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .pg { position: relative; width: 210mm; height: 297mm; overflow: hidden; page-break-after: always; }
    .pg:last-child { page-break-after: auto; }
    /* header (exact places from the .docx) */
    .h-csu { position: absolute; left: 6.05mm; top: 4.08mm; width: 98.3mm; height: 32mm; }
    .h-bp { position: absolute; left: 132.98mm; top: 6.35mm; width: 23.8mm; height: 27.5mm; }
    .h-iso { position: absolute; left: 158.2mm; top: 4.28mm; width: 43.4mm; height: 30.8mm; }
    .h-osip { position: absolute; left: 23.5mm; top: 30.8mm; width: 99.1mm; height: 4.7mm; font-weight: bold; font-size: 12pt; line-height: 4.7mm; white-space: nowrap; }
    .ft { position: absolute; left: 12.35mm; top: 272.7mm; font-family: Calibri, Carlito, Arial, sans-serif; font-style: italic; font-size: 10pt; }
    /* the body: margins top 36 · left 12.5 (+0.4 table indent) · right 7.5 mm */
    .body { position: absolute; top: 36mm; left: 12.9mm; width: 187.3mm; }
    table.f { width: 187.3mm; border-collapse: collapse; table-layout: fixed; }
    table.f td { border: 1px solid #000; padding: 0 1.9mm; font-size: 12pt; vertical-align: top; }
    td.title { text-align: center; vertical-align: middle; font-weight: bold; }
    td.lbl { font-weight: bold; padding-top: .6mm; } td.lbl span { display: block; font-weight: normal; font-size: 10pt; margin-top: .3mm; }
    td.dir { font-size: 10pt !important; line-height: 1.12; padding-top: .3mm !important; }
    tr.hd td { text-align: center; font-weight: bold; vertical-align: middle; }
    tr.r td { height: 4.1mm; padding-top: 0; padding-bottom: 0; font-size: 10pt; line-height: 1; vertical-align: middle; }
    td.cat { font-weight: bold; }
    td.it { padding-left: 12.6mm !important; } td.it .no { display: inline-block; width: 6mm; }
    td.c { text-align: center; font-size: 10pt; }
    tr.tot td { text-align: left; font-weight: bold; } tr.tot td span { margin-left: 112mm; } tr.tot td b { margin-left: 3mm; }
    td.box { font-size: 10pt !important; padding-top: .4mm !important; } td.box b { font-weight: bold; } td.box div { font-weight: normal; margin-top: .6mm; line-height: 1.25; }
    td.rated { position: relative; font-size: 10pt !important; }
    td.rated .rb { position: absolute; left: 140mm; top: 5.5mm; }
    td.rated .sg { position: absolute; left: 132mm; top: 12.6mm; width: 32mm; height: 3.4mm; border-bottom: .5px solid #555; font-size: 8pt; text-align: center; line-height: 3.4mm; }
    td.rated .rl { position: absolute; left: 132mm; top: 16.4mm; width: 32mm; text-align: center; font-size: 5pt; }
    /* page 2 */
    table.p2 td { font-size: 10pt; vertical-align: middle; }
    td.p3 { vertical-align: top !important; padding-top: .4mm !important; line-height: 1.3; }
    td.p3 .in { padding-left: 13mm; } td.p3 .rt { text-align: right; padding-right: 33mm; }
    .ul { display: inline-block; border-bottom: 1px solid #000; vertical-align: bottom; height: 3.8mm; text-align: center; font-weight: bold; }
    .ul.w1 { width: 66mm; } .ul.w2 { width: 27mm; } .ul.w3 { width: 25mm; }
    td.nb { vertical-align: top !important; padding-top: .4mm !important; border-bottom: 0 !important; }
    td.scale { border-top: 0 !important; vertical-align: top !important; }
    td.scale table { width: 160mm; margin-left: 13mm; border-collapse: collapse; }
    td.scale table td { border: 0; padding: 0; height: 3.9mm; font-size: 10pt; text-align: center; width: 33%; }
    td.scale table tr.sh td { font-weight: bold; }
    td.rater { vertical-align: top !important; padding-top: .8mm !important; } td.rater .sg2 { width: 45mm; border-bottom: 1px solid #000; height: 5mm; }
  </style></head><body>${page1}${page2}</body></html>`);
  w.document.close();
  // print once the header pictures have loaded
  const go = () => setTimeout(() => w.print(), 150);
  const imgs = [...w.document.images];
  let n = imgs.length;
  if (!n) go(); else imgs.forEach((im) => { if (im.complete) { if (--n === 0) go(); } else { im.onload = im.onerror = () => { if (--n === 0) go(); }; } });
}

const GR_CSS = `
.gr-box { width: 100%; display: flex !important; flex-direction: column; justify-content: flex-start !important; align-items: stretch !important; gap: 0 !important; }
.gr-box > * { flex: none !important; margin-top: 0 !important; margin-bottom: 0 !important; }
.gr-box .gr-steps { margin: 4px 18px 18px !important; }
.gr-load { padding: 28px 0; }
.gr-steps { list-style: none; margin: 2px 18px 18px; padding: 14px 0 0; border-top: 1px solid #f1f3f6; display: grid; gap: 12px; }
.gr-steps li { display: flex; gap: 12px; align-items: flex-start; }
.gr-steps i { flex: none; width: 26px; height: 26px; border-radius: 50%; display: inline-grid; place-items: center; font-style: normal; font-size: 12px; font-weight: 800; background: #f3f4f6; color: #6b7280; }
.gr-steps li.ok i { background: #dcfce7; color: #15803d; }
.gr-steps b { display: block; font-size: 13.5px; color: #1f2937; } .gr-steps small { font-size: 12.5px; color: #6b7280; }
.gr-filters { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 10px; }
.gr-filters .ix-select { flex: 1 1 120px; min-width: 0; height: 34px; font-size: 13px; }
.gr-filters .ix-b { flex: none; }
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
/* the supervisor's appraisal, laid out like the paper form F-OSIP-PAR-004 */
.pf-form { flex: none; border: 1px solid #d6d9de; border-radius: 10px; overflow: hidden; background: #fff; }
.pf-title { padding: 10px 12px; text-align: center; font-size: 13px; font-weight: 800; letter-spacing: .02em; color: #111827; border-bottom: 1px solid #d6d9de; }
.pf-info { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #d6d9de; }
.pf-info > div { padding: 7px 12px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.pf-info > div:nth-child(odd) { border-right: 1px solid #d6d9de; } .pf-info > div:nth-child(-n+2) { border-bottom: 1px solid #eef0f4; }
.pf-info small { font-size: 11px; font-weight: 700; color: #374151; } .pf-info b { font-size: 12.5px; font-weight: 500; color: #111827; overflow-wrap: anywhere; }
.pf-dir { margin: 0; padding: 8px 12px; font-size: 12px; line-height: 1.5; color: #374151; border-bottom: 1px solid #d6d9de; }
.pf-tb { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.pf-tb th { background: #f8f9fb; font-size: 11.5px; font-weight: 800; color: #111827; padding: 6px 8px; border-bottom: 1px solid #d6d9de; text-align: left; }
.pf-tb td { padding: 0 8px; height: 30px; border-bottom: 1px solid #eef0f4; color: #1f2937; }
.pf-tb .c { width: 44px; text-align: center; padding: 0; border-left: 1px solid #eef0f4; }
.pf-tb tr.cat td { background: #f8f9fb; font-weight: 800; font-size: 11.5px; letter-spacing: .02em; color: #111827; height: 28px; }
.pf-tb tr.cat td span { float: right; font-weight: 600; color: #6b7280; letter-spacing: 0; }
.pf-tb tr.hint td { font-size: 11.5px; color: #6b7280; height: 24px; }
.pf-tb td.it { padding-left: 18px; }
.pf-tb tr.todo td.it { color: #b45309; }
.pf-ck { width: 100%; height: 30px; border: 0; background: transparent; cursor: pointer; font: inherit; font-size: 14px; font-weight: 800; color: #15803d; padding: 0 !important; }
.pf-ck:hover { background: #fff4ee; } .pf-ck.on { background: #e9f8ef; }
.pf-mark { font-size: 14px; font-weight: 800; color: #15803d; }
.pf-tb tr.tot td { background: #f8f9fb; font-weight: 800; text-align: right; height: 32px; border-bottom: 0; } .pf-tb tr.tot td.c { text-align: center; }
/* grading inside the drawer (Interns → Grades) */
.gr-drawer { display: flex; flex-direction: column; gap: 12px; min-height: 100%; }
.ix-drawer .gr-bar { bottom: -16px !important; margin: auto -20px -16px !important; }
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
/* "Not released yet": the same centered note as My DTR, in the middle of the card, the steps under it */
.gr-wait { display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important;
  padding: 48px 20px 36px; text-align: center; color: #6b7280; }
.gr-box > .gr-wait { flex: 1 0 auto !important; }
.gr-wait-ic { width: 56px; height: 56px; margin: 0 auto 12px; border-radius: 50%; background: #fdeee7; color: #e8582a; display: flex; align-items: center; justify-content: center; flex: none; }
.gr-wait > strong { display: block; font-size: 15px; color: #1f2937; }
.gr-wait > p { margin: 4px 0 0; font-size: 13px; max-width: 520px; line-height: 1.5; }
.gr-box .gr-wait .gr-steps { margin: 22px 0 0 !important; padding: 16px 0 0; width: 100%; max-width: 460px; text-align: left; }
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