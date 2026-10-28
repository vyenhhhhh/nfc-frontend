// components/DashBoard.jsx
// The dashboard home shared by every role (intern, coordinator, supervisor, admin).
// Same look as the other pages:
//   - the slim white header (page icon, greeting, date, quick buttons)
//   - one thin summary strip with the main numbers
//   - three columns of white cards: left (today / to do), middle (attendance), right (calendar, announcements)
// Only the look: every role passes its own numbers and lists.
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Icon, Avatar, PageHeader, fmtTime, todayManila, calcHours, requiredHoursFor, liveRefresh } from "./DashKit.jsx";
import { API } from "../config.js";

/* ═════════════════════════ layout ═════════════════════════ */

// <DashLayout title sub status actions strip lead left right> middle </DashLayout>
//   status  = { text, tone: "live" | "warn" | "" }   small chip in the header
//   actions = [{ icon, label, run, primary }]
//   strip   = [{ label, value, sub, tone: "green" | "orange" | "" , onClick }]
//   lead    = optional wide first cell of the strip (e.g. the intern's hours progress)
export function DashLayout({ title, sub, status, actions = [], strip = [], lead, left, right, children }) {
  const cols = ["dbx-grid", left ? "has-left" : "", right ? "has-right" : ""].join(" ");
  return (
    <div className="dbx">
      <style>{dbCss}</style>
      <PageHeader title={title} sub={sub}>
        {actions.map((a) => (
          <button key={a.label} type="button" className={`ix-b ${a.primary ? "primary" : "ghost"} sm dbx-act`} onClick={a.run}>
            <Icon name={a.icon} size={14} /> <span>{a.label}</span>
          </button>
        ))}
        {status && <span className={`dbx-status ${status.tone || ""}`}><i />{status.text}</span>}
      </PageHeader>

      {(lead || strip.length > 0) && (
        <div className={`dbx-sum${lead ? " has-lead" : ""}${strip.some((s) => s.icon) ? " tiles" : ""}`} style={{ "--n": strip.length }}>
          {lead && <div className="dbx-lead">{lead}</div>}
          {strip.map((s) => {
            const Tag = s.onClick ? "button" : "div";
            return (
              <Tag key={s.label} type={s.onClick ? "button" : undefined} className={`dbx-num ${s.tone || ""}${s.onClick ? " click" : ""}`} onClick={s.onClick}>
                {s.icon && <span className="dbx-num-ic" aria-hidden="true"><Icon name={s.icon} size={18} /></span>}
                <small>{s.label}</small>
                <b>{s.value}</b>
                {s.sub && <em>{s.sub}</em>}
              </Tag>
            );
          })}
        </div>
      )}

      <div className={cols}>
        {left && <div className="dbx-col dbx-left">{left}</div>}
        <div className="dbx-col dbx-mid">{children}</div>
        {right && <div className="dbx-col dbx-side">{right}</div>}
      </div>
    </div>
  );
}

// White card with a small title row: <Panel title count link onLink grow>...</Panel>
export function Panel({ title, count, link, onLink, grow, className = "", children }) {
  return (
    <section className={`dbx-card${grow ? " grow" : ""} ${className}`}>
      {title && (
        <header className="dbx-ch">
          <b>{title}</b>
          {count !== undefined && count !== null && <span className="dbx-n">{count}</span>}
          {link && <button type="button" className="dbx-link" onClick={onLink}>{link} ›</button>}
        </header>
      )}
      {children}
    </section>
  );
}

// One list row: icon (or avatar), title + caption, tag on the right
export function DashRow({ icon, tone = "", avatar, title, sub, tag, tagTone = "", right, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} className={`dbx-it${onClick ? " click" : ""}`} onClick={onClick}>
      {avatar ? <Avatar name={avatar.name} photo={avatar.photo} size={30} status={avatar.status} />
        : <span className={`dbx-ic ${tone}`}><Icon name={icon} size={15} /></span>}
      <span className="dbx-tx"><b>{title}</b>{sub && <small>{sub}</small>}</span>
      {tag && <span className={`dbx-tag ${tagTone}`}>{tag}</span>}
      {right}
    </Tag>
  );
}

export function DashEmpty({ title, sub }) {
  return <div className="dbx-empty"><strong>{title}</strong>{sub && <p>{sub}</p>}</div>;
}

// 7 AM – 7 PM line with the worked part(s) filled in
const dayPos = (v) => {
  const t = new Date(v);
  return Math.max(0, Math.min(100, ((t.getHours() + t.getMinutes() / 60) - 7) / 12 * 100));
};
export function TimeLine({ parts = [], tone = "" }) {
  return (
    <span className={`dbx-line ${tone}`} aria-hidden="true">
      {parts.map((p, i) => {
        const a = dayPos(p.in);
        const b = p.out ? dayPos(p.out) : dayPos(Date.now());
        return <i key={i} className={p.out ? "" : "open"} style={{ left: a + "%", width: Math.max(1.5, b - a) + "%" }} />;
      })}
    </span>
  );
}

export const hm = (v) => (v ? fmtTime(v).replace(/:\d\d(?= )/, "") : "—");

// Today's attendance, one row per intern (first time in, last time out, line of the day)
export function TodayPeople({ records, limit = 9 }) {
  const map = new Map();
  records.forEach((r) => {
    const k = r.user_id ?? r.name;
    if (!map.has(k)) map.set(k, { key: k, name: r.name, photo: r.photo, online: false, parts: [] });
    const p = map.get(k);
    if (r.uid === "ONLINE") p.online = true;
    if (r.checked_in_at) p.parts.push({ in: r.checked_in_at, out: r.checked_out_at || null });
  });
  const people = [...map.values()].map((p) => {
    p.parts.sort((a, b) => new Date(a.in) - new Date(b.in));
    p.first = p.parts[0]?.in;
    p.open = p.parts.some((x) => !x.out);
    p.last = p.open ? null : p.parts[p.parts.length - 1]?.out;
    return p;
  }).sort((a, b) => (b.open - a.open) || (new Date(a.first) - new Date(b.first)));

  if (!people.length) return <DashEmpty title="No activity today yet." sub="Interns who time in will show up here." />;
  return (
    <ul className="dbx-rows">
      {people.slice(0, limit).map((p) => (
        <li key={p.key} className="dbx-person">
          <Avatar name={p.name} photo={p.photo} size={30} status={p.open ? "on" : undefined} />
          <b className="dbx-name">{p.name}</b>
          <span className={`dbx-tag ${p.online ? "purple" : "blue"}`}>{p.online ? "Online" : "Onsite"}</span>
          <span className="dbx-time">{hm(p.first)} → {p.open ? <em className="in">in</em> : hm(p.last)}</span>
          <TimeLine parts={p.parts} tone="green" />
        </li>
      ))}
      {people.length > limit && <li className="dbx-more">+{people.length - limit} more</li>}
    </ul>
  );
}

/* ═════════════════════════ Needs attention (staff dashboards) ═════════════════════════
   Interns who need a follow-up:
     - a time in with no time out on an earlier day (last 7 days)
     - no attendance for 3 or more workdays in a row (weekends and holidays don't count)
     - no NFC card yet (only for onsite interns who tap)
     - required hours completed (ready for post-internship)
   Clicking a name opens that intern in Monitor Interns. */
const ABSENT_DAYS = 3;
const dayShift = (iso, n) => new Date(new Date(iso + "T12:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);
const isWeekend = (iso) => { const d = new Date(iso + "T12:00:00Z").getUTCDay(); return d === 0 || d === 6; };

export function NeedsAttention({ interns, records, monitorPath, limit = 6 }) {
  const go = useNavigate();
  const [holidays, setHolidays] = useState({});
  const [lateReports, setLateReports] = useState([]);   // reports past due: [{ id, title, due_date, user_ids }]
  useEffect(() => {
    const load = () =>
      fetch(`${API}/staff/reports/overdue`, { headers: { Accept: "application/json" } })
        .then((r) => r.json())
        .then((d) => { if (Array.isArray(d)) setLateReports(d); })
        .catch(() => {});
    load();
    return liveRefresh(load);
  }, []);
  useEffect(() => {
    const load = () =>
      fetch(`${API}/calendar`, { headers: { Accept: "application/json" } })
        .then((r) => r.json())
        .then((list) => {
          if (!Array.isArray(list)) return;
          const m = {};
          list.forEach((e) => { if (e.off !== false && !e.hte_key) m[String(e.date).slice(0, 10)] = true; });   // university No-OJT days
          setHolidays(m);
        })
        .catch(() => {});
    load();
    return liveRefresh(load);
  }, []);

  const today = todayManila();
  const weekAgo = dayShift(today, -7);
  const items = [];
  interns.forEach((u) => {
    const recs = records.filter((r) => r.user_id === u.id);
    const output = u.tracking_type === "output";
    const name = u.name || "Intern";
    // time in with no time out on an earlier day
    const open = recs.filter((r) => r.date < today && r.date >= weekAgo && r.uid !== "ONLINE" && r.action === "CHECK_IN" && !r.checked_out_at)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (open) {
      const d = new Date(open.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      items.push({ key: `fix${u.id}`, u, rank: 1, icon: "clock", tone: "amber", title: name, sub: `No time out on ${d}`, tag: "Fix", tagTone: "amber" });
    }
    // workdays in a row with no attendance, counted back from yesterday (today isn't over yet)
    if (!output && recs.length) {
      const days = new Set(recs.map((r) => r.date));
      let n = 0;
      let d = dayShift(today, -1);
      for (let i = 0; i < 60; i++, d = dayShift(d, -1)) {
        if (isWeekend(d) || holidays[d]) continue;
        if (days.has(d)) break;
        n++;
      }
      if (n >= ABSENT_DAYS) items.push({ key: `abs${u.id}`, u, rank: 0, icon: "warn", tone: "red", title: name, sub: `No attendance for ${n >= 60 ? "60+" : n} workdays in a row`, tag: "Absent", tagTone: "red" });
    }
    // no NFC card yet (only when the list tells us)
    if ("nfc_uid" in u && !u.nfc_uid && !output && u.work_mode !== "offsite") {
      items.push({ key: `card${u.id}`, u, rank: 2, icon: "card", tone: "blue", title: name, sub: "No NFC card yet", tag: "Card", tagTone: "blue" });
    }
    // a report the coordinator asked for, past its due date, not sent yet
    lateReports.filter((rp) => (rp.user_ids || []).map(Number).includes(Number(u.id))).forEach((rp) => {
      const d = new Date(String(rp.due_date).slice(0, 10) + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
      items.push({ key: `rep${rp.id}-${u.id}`, u, rank: 0.5, icon: "file", tone: "red", title: name, sub: `"${rp.title}" not sent · due ${d}`, tag: "Report", tagTone: "red" });
    });
    // required hours done
    if (!output && calcHours(recs) >= requiredHoursFor(u.program)) {
      items.push({ key: `done${u.id}`, u, rank: 3, icon: "check", tone: "green", title: name, sub: `Completed ${requiredHoursFor(u.program)}h · ready for post-internship`, tag: "Done", tagTone: "green" });
    }
  });
  items.sort((a, b) => a.rank - b.rank || String(a.title).localeCompare(String(b.title)));

  const openIntern = (u) => go(monitorPath, { state: { search: u.name } });
  return (
    <Panel title="Needs attention" count={items.length} link={items.length > limit ? "See all" : undefined} onLink={() => go(monitorPath)} grow>
      {items.length === 0 ? (
        <DashEmpty title="Everyone is on track" sub="No missing time outs, absences, late reports or pending cards." />
      ) : (
        <>
          {items.slice(0, limit).map((x) => (
            <DashRow key={x.key} avatar={{ name: x.u.name, photo: x.u.photo }} title={x.title} sub={x.sub}
              tag={x.tag} tagTone={x.tagTone} onClick={() => openIntern(x.u)} />
          ))}
          {items.length > limit && <div className="dbx-more">+{items.length - limit} more</div>}
        </>
      )}
    </Panel>
  );
}

/* ═════════════════════════ styles ═════════════════════════ */
export const dbCss = `
.ix-page .ix-content:has(> .dbx) { max-width: 1560px; }
.ix-page .ix-content .dbx { --dbx-ink: #1c1410; --dbx-mut: #8a7a71; --dbx-line: #eceef1; --dbx-soft: #f4f1ee;
  display: flex; flex-direction: column; gap: 12px; }
.ix-page .ix-content .dbx > .ix-ph { margin-bottom: 2px !important; }
/* no page icon next to the greeting on the dashboards */
.ix-page .ix-content .dbx > .ix-ph .ix-ph-ic { display: none !important; }

/* header extras */
.ix-page .ix-content .dbx .dbx-act { height: 30px; padding: 0 12px; font-size: 12px; gap: 6px; border-radius: 8px; }
.ix-page .ix-content .dbx-status { display: inline-flex; align-items: center; gap: 7px; padding: 4px 11px; border-radius: 99px; font-size: 11px; font-weight: 600;
  background: #f3f4f6; color: #6b7280; white-space: nowrap; max-width: 300px; overflow: hidden; text-overflow: ellipsis; }
.ix-page .ix-content .dbx-status i { width: 7px; height: 7px; border-radius: 50%; background: #9ca3af; flex-shrink: 0; }
.ix-page .ix-content .dbx-status.live { background: #ecfdf3; color: #15803d; }
.ix-page .ix-content .dbx-status.live i { background: #22c55e; animation: ix-blink 1.6s ease-in-out infinite; }
.ix-page .ix-content .dbx-status.warn { background: #fffbeb; color: #b45309; }
.ix-page .ix-content .dbx-status.warn i { background: #f59e0b; }

/* summary strip */
.ix-page .ix-content .dbx-sum { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); background: var(--ix-surface, #fff); border: 1px solid var(--dbx-line);
  border-radius: 14px; overflow: hidden; }
.ix-page .ix-content .dbx-sum.has-lead { grid-template-columns: minmax(280px, 2fr) repeat(var(--n), minmax(0, 1fr)); }
.ix-page .ix-content .dbx-sum > * { padding: 11px 16px; min-width: 0; }
.ix-page .ix-content .dbx-sum > * + * { border-left: 1px solid #f1ece9; }
.ix-page .ix-content .dbx-num { display: flex; flex-direction: column; align-items: flex-start; background: none; border: 0; font-family: inherit; text-align: left; }
.ix-page .ix-content .dbx-num.click { cursor: pointer; transition: background .15s; }
.ix-page .ix-content .dbx-num.click:hover { background: #fffaf7; }
.ix-page .ix-content .dbx-num small { font-size: 11px; color: var(--dbx-mut); white-space: nowrap; }
.ix-page .ix-content .dbx-num b { font-size: 18px; line-height: 1.3; font-weight: 700; color: var(--dbx-ink); white-space: nowrap; }
.ix-page .ix-content .dbx-num em { font-style: normal; font-size: 11px; color: #a99d96; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.ix-page .ix-content .dbx-num.green b { color: #15803d; }
.ix-page .ix-content .dbx-num.orange b { color: #c2410c; }
.ix-page .ix-content .dbx-pt { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; color: #64748b; font-size: 12px; }
.ix-page .ix-content .dbx-pt b { font-size: 18px; color: #111827; }
.ix-page .ix-content .dbx-pt strong { color: #e8582a; font-size: 13px; }
.ix-page .ix-content .dbx-bar { position: relative; height: 8px; border-radius: 99px; background: #fbe7dd; margin: 6px 0 4px; overflow: hidden; }
.ix-page .ix-content .dbx-bar i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 99px; background: linear-gradient(90deg, #f2864f, #e8582a); }
.ix-page .ix-content .dbx-bar em { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--ix-surface, #fff); }
.ix-page .ix-content .dbx-lead small { font-size: 11px; color: var(--dbx-mut); }

/* three columns */
.ix-page .ix-content .dbx-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; align-items: stretch;
  min-height: calc(100vh / var(--fit, 1) - 286px); }   /* fills the screen; taller content just scrolls the page */
.ix-page .ix-content .dbx-grid.has-right { grid-template-columns: minmax(0, 1fr) 300px; }
.ix-page .ix-content .dbx-grid.has-left.has-right { grid-template-columns: minmax(280px, 330px) minmax(0, 1fr) 300px; }
.ix-page .ix-content .dbx-col { display: flex; flex-direction: column; gap: 12px; min-width: 0; min-height: 0; }

.ix-page .ix-content .dbx-col > :last-child { flex: 1; }
.ix-page .ix-content .dbx-col > * { margin: 0 !important; }

/* white cards */
.ix-page .ix-content .dbx-card { background: var(--ix-surface, #fff); border: 1px solid var(--dbx-line); border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; min-width: 0; }
.ix-page .ix-content .dbx-card.grow { flex: 1; }
.ix-page .ix-content .dbx-ch { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid #f1ece9; min-height: 42px; box-sizing: border-box; }
.ix-page .ix-content .dbx-card > .dbx-ch + * { border-top: 0; }
.ix-page .ix-content .dbx-card > * + .dbx-ch { border-top: 1px solid #f1ece9; }
.ix-page .ix-content .dbx-ch b { font-size: 13px; font-weight: 700; color: var(--dbx-ink); }
.ix-page .ix-content .dbx-n { font-size: 10.5px; font-weight: 700; background: #f3ede9; color: #6b5b52; padding: 1px 7px; border-radius: 99px; }
.ix-page .ix-content .dbx-link { margin-left: auto; background: none; border: 0; padding: 0; cursor: pointer; font: inherit; font-size: 11.5px; font-weight: 600; color: #c2410c; }
.ix-page .ix-content .dbx-link:hover { text-decoration: underline; }

/* list rows */
.ix-page .ix-content .dbx-it { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 8px 14px;
  border: 0; border-bottom: 1px solid var(--dbx-soft); background: none; width: 100%; text-align: left; font-family: inherit; color: inherit; }
.ix-page .ix-content .dbx-it.click { cursor: pointer; transition: background .12s; }
.ix-page .ix-content .dbx-card > .dbx-it:last-child { border-bottom: 0; }
.ix-page .ix-content .dbx-it.click:hover { background: #fffaf7; }
.ix-page .ix-content .dbx-it:has(> :nth-child(4)) { grid-template-columns: 30px minmax(0, 1fr) auto auto; }
.ix-page .ix-content .dbx-tx { min-width: 0; display: flex; flex-direction: column; }
.ix-page .ix-content .dbx-tx b { font-size: 12.5px; font-weight: 600; color: var(--dbx-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ix-page .ix-content .dbx-tx small { font-size: 11px; color: var(--dbx-mut); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ix-page .ix-content .dbx-ic { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; background: #fff1ea; color: #e8582a; }
.ix-page .ix-content .dbx-ic.green { background: #ecfdf3; color: #16a34a; }
.ix-page .ix-content .dbx-ic.amber { background: #fef3c7; color: #b45309; }
.ix-page .ix-content .dbx-ic.red { background: #fef2f2; color: #dc2626; }
.ix-page .ix-content .dbx-ic.blue { background: #eef4ff; color: #2563eb; }
.ix-page .ix-content .dbx-ic.purple { background: #f4f0ff; color: #7c3aed; }
.ix-page .ix-content .dbx-tag { font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 6px; background: #f3ede9; color: #6b5b52; white-space: nowrap; text-align: center; }
.ix-page .ix-content .dbx-tag.blue { background: #e8f0ff; color: #2563eb; }
.ix-page .ix-content .dbx-tag.purple { background: #f1ebff; color: #7c3aed; }
.ix-page .ix-content .dbx-tag.amber { background: #fef3c7; color: #b45309; }
.ix-page .ix-content .dbx-tag.green { background: #dcfce7; color: #15803d; }
.ix-page .ix-content .dbx-tag.red { background: #fee2e2; color: #b91c1c; }
.ix-page .ix-content .dbx-tag.orange { background: #fff1ea; color: #c2410c; }
.ix-page .ix-content .dbx-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 2px;
  margin: 12px; padding: 22px 14px; border: 1.5px dashed #e5e7eb; border-radius: 12px; }
.ix-page .ix-content .dbx-empty strong { font-size: 12.5px; color: #374151; }
.ix-page .ix-content .dbx-empty p { margin: 0; font-size: 11.5px; color: var(--dbx-mut); }

/* day / person rows with the 7 AM – 7 PM line */
.ix-page .ix-content .dbx-rows { list-style: none; margin: 0; padding: 0; }
.ix-page .ix-content .dbx-rows > li { display: grid; align-items: center; gap: 10px; padding: 6px 14px; border-bottom: 1px solid var(--dbx-soft); min-height: 44px; box-sizing: border-box; }
.ix-page .ix-content .dbx-day { grid-template-columns: 34px 58px 150px minmax(60px, 1fr) 46px; }
.ix-page .ix-content .dbx-person { grid-template-columns: 30px minmax(110px, 190px) 58px 130px minmax(60px, 1fr); }
.ix-page .ix-content .dbx-dd { width: 32px; height: 32px; border-radius: 9px; background: #fff1ea; color: #c2410c; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1; }
.ix-page .ix-content .dbx-dd b { font-size: 12.5px; }
.ix-page .ix-content .dbx-dd small { font-size: 8.5px; font-weight: 700; letter-spacing: .03em; }
.ix-page .ix-content .dbx-dd.today { background: #e8582a; color: #fff; }
.ix-page .ix-content .dbx-name { font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ix-page .ix-content .dbx-time { font-size: 12px; color: #374151; white-space: nowrap; }
.ix-page .ix-content .dbx-time em { font-style: normal; font-weight: 700; color: #15803d; }
.ix-page .ix-content .dbx-time em.miss { color: #b45309; }
.ix-page .ix-content .dbx-hrs { text-align: right; font-weight: 700; font-size: 12.5px; }
.ix-page .ix-content .dbx-line { position: relative; height: 9px; border-radius: 99px;
  background: repeating-linear-gradient(90deg, #f3ede9 0 calc(25% - 1px), #e9e2dd calc(25% - 1px) 25%); }
.ix-page .ix-content .dbx-line i { position: absolute; top: 0; bottom: 0; border-radius: 99px; background: linear-gradient(90deg, #f2864f, #e8582a); }
.ix-page .ix-content .dbx-line.green i, .ix-page .ix-content .dbx-line i.open { background: linear-gradient(90deg, #4ade80, #16a34a); }
.ix-page .ix-content .dbx-more { display: block !important; text-align: center; font-size: 11.5px; color: var(--dbx-mut); min-height: 0 !important; padding: 8px !important; }

/* intern: finish line */
.ix-page .ix-content .dbx-fin { flex: 0 0 auto !important; }
.ix-page .ix-content .dbx-fin-body { display: grid; grid-template-columns: 132px minmax(0, 1fr); gap: 20px; align-items: center; padding: 14px 18px; }
.ix-page .ix-content .dbx-ring { width: 132px; height: 132px; border-radius: 50%; display: grid; place-items: center;
  background: conic-gradient(#e8582a 0 calc(var(--p) * 1%), #fbe7dd calc(var(--p) * 1%) 100%); }
.ix-page .ix-content .dbx-ring > div { width: 104px; height: 104px; border-radius: 50%; background: var(--ix-surface, #fff); display: flex; flex-direction: column; align-items: center; justify-content: center; }
.ix-page .ix-content .dbx-ring b { font-size: 24px; line-height: 1.1; }
.ix-page .ix-content .dbx-ring small { font-size: 10.5px; color: var(--dbx-mut); }
.ix-page .ix-content .dbx-eta > small { display: block; font-size: 11.5px; color: var(--dbx-mut); }
.ix-page .ix-content .dbx-eta-big { font-size: 20px; font-weight: 700; margin: 1px 0; }
.ix-page .ix-content .dbx-eta-big em { font-style: normal; color: #e8582a; }
.ix-page .ix-content .dbx-ms { position: relative; height: 62px; margin: 12px 22px 0; }
.ix-page .ix-content .dbx-ms-track { position: absolute; left: 0; right: 0; top: 11px; height: 3px; border-radius: 3px; background: #f3ede9; }
.ix-page .ix-content .dbx-ms-fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 3px; background: #e8582a; }
.ix-page .ix-content .dbx-ms > div { position: absolute; top: 0; transform: translateX(-50%); z-index: 1; display: flex; flex-direction: column; align-items: center; gap: 1px; }
.ix-page .ix-content .dbx-ms i { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: var(--ix-surface, #fff); border: 2px solid #e9e2dd;
  font-style: normal; font-size: 9.5px; font-weight: 700; color: #a99d96; box-sizing: border-box; }
.ix-page .ix-content .dbx-ms .ok i { background: #e8582a; border-color: #e8582a; color: #fff; }
.ix-page .ix-content .dbx-ms .next i { border-color: #e8582a; color: #e8582a; }
.ix-page .ix-content .dbx-ms b { font-size: 11px; }
.ix-page .ix-content .dbx-ms small { font-size: 10px; color: var(--dbx-mut); white-space: nowrap; }
.ix-page .ix-content .dbx-fin-foot { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-top: 1px solid #f1ece9; }
.ix-page .ix-content .dbx-fin-foot > div { padding: 8px 18px; }
.ix-page .ix-content .dbx-fin-foot > div + div { border-left: 1px solid #f1ece9; }
.ix-page .ix-content .dbx-fin-foot small { display: block; font-size: 10.5px; color: var(--dbx-mut); }
.ix-page .ix-content .dbx-fin-foot b { font-size: 14px; }
@media (max-width: 640px) {
  .ix-page .ix-content .dbx-fin-body { grid-template-columns: 1fr; justify-items: center; text-align: center; }
  .ix-page .ix-content .dbx-eta { width: 100%; }
  .ix-page .ix-content .dbx-fin-foot > div { padding: 8px 12px; }
}

/* intern: recent taps (one row per time in / time out) */
.ix-page .ix-content .dbx-tap { grid-template-columns: 34px minmax(0, 1fr) 62px 80px 76px; }
.ix-page .ix-content .dbx-tap-day { font-size: 12.5px; font-weight: 600; color: var(--dbx-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ix-page .ix-content .dbx-tap-time { text-align: right; font-size: 13px; font-weight: 700; white-space: nowrap; }
@media (max-width: 640px) { .ix-page .ix-content .dbx-tap { grid-template-columns: 34px minmax(0, 1fr) auto auto; } .ix-page .ix-content .dbx-tap > .dbx-tag.blue, .ix-page .ix-content .dbx-tap > .dbx-tag.purple { display: none; } }

/* the rows share the card's height evenly, so there is no blank under the last one */
.ix-page .ix-content .dbx-card > .dbx-rows.dbx-fill { flex: 1; display: flex; flex-direction: column; }
.ix-page .ix-content .dbx-rows.dbx-fill > li { flex: 1; }
.ix-page .ix-content .dbx-rows.dbx-fill > li:last-child { border-bottom: 0; }

/* intern: today card */
.ix-page .ix-content .dbx-today { padding: 14px; }
.ix-page .ix-content .dbx-state { display: flex; align-items: center; gap: 12px; }
.ix-page .ix-content .dbx-dot { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; background: #f3f4f6; color: #9ca3af; flex-shrink: 0; }
.ix-page .ix-content .dbx-dot.live { background: #ecfdf3; color: #16a34a; }
.ix-page .ix-content .dbx-dot.warn { background: #fffbeb; color: #d97706; }
.ix-page .ix-content .dbx-state b { display: block; font-size: 14.5px; }
.ix-page .ix-content .dbx-state small { display: block; font-size: 11.5px; line-height: 1.4; color: var(--dbx-mut); }
.ix-page .ix-content .dbx-state > div { min-width: 0; }
/* the Today card keeps its own height; the week strip sits at its bottom when it is the only card */
.ix-page .ix-content .dbx-today { flex: 0 0 auto; }
.ix-page .ix-content .dbx-col > .dbx-today:last-child { flex: 1; justify-content: space-between; }

/* Getting started (new interns) */
.ix-page .ix-content .dbx-gs-bar { height: 5px; margin: 10px 14px 4px; border-radius: 99px; background: #fbe7dd; overflow: hidden; }
.ix-page .ix-content .dbx-gs-bar i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #f2864f, #e8582a); }
.ix-page .ix-content .dbx-gs-list { list-style: none; margin: 0; padding: 0; }
.ix-page .ix-content .dbx-gs-list li { display: grid; grid-template-columns: 26px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 10px 14px; border-bottom: 1px solid var(--dbx-soft); }
.ix-page .ix-content .dbx-gs-list li:last-child { border-bottom: 0; }
.ix-page .ix-content .dbx-gs-list .dbx-tx b, .ix-page .ix-content .dbx-gs-list .dbx-tx small { white-space: normal; }
.ix-page .ix-content .dbx-gs-list .dbx-tx small { line-height: 1.4; }
.ix-page .ix-content .dbx-gs-dot { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-size: 11.5px; font-weight: 700;
  background: #fff1ea; color: #e8582a; border: 1.5px solid #f6c7b0; }
.ix-page .ix-content .dbx-gs-list li.done .dbx-gs-dot { background: #16a34a; color: #fff; border-color: #16a34a; }
.ix-page .ix-content .dbx-gs-list li.wait .dbx-gs-dot { background: #fef3c7; color: #b45309; border-color: #fcd34d; }
.ix-page .ix-content .dbx-gs-list li.done .dbx-tx b { color: #6b7280; }
.ix-page .ix-content .dbx-gs-list .ix-b.sm { height: 28px; padding: 0 12px; font-size: 11.5px; }
.ix-page .ix-content .dbx-kv { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
.ix-page .ix-content .dbx-kv > div { background: var(--ix-surface-2, #fafbfc); border: 1px solid #f1ece9; border-radius: 10px; padding: 7px 10px; min-width: 0; }
.ix-page .ix-content .dbx-kv small { display: block; font-size: 10.5px; color: var(--dbx-mut); }
.ix-page .ix-content .dbx-kv b { font-size: 13.5px; white-space: nowrap; }
.ix-page .ix-content .dbx-wkcap { margin-top: 12px; font-size: 11px; color: var(--dbx-mut); }
.ix-page .ix-content .dbx-wk { display: flex; gap: 6px; margin-top: 6px; }
.ix-page .ix-content .dbx-wk span { flex: 1; height: 36px; border-radius: 9px; background: #f3ede9; display: flex; flex-direction: column; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700; color: #a99d96; }
.ix-page .ix-content .dbx-wk span b { display: block; font-size: 11px; line-height: 1.2; }
.ix-page .ix-content .dbx-wk span.full { background: #e8582a; color: #fff; }
.ix-page .ix-content .dbx-wk span.part { background: #f8b391; color: #fff; }
.ix-page .ix-content .dbx-wk span.now { background: #4ade80; color: #fff; }
.ix-page .ix-content .dbx-wk span.is-today { outline: 2px solid #1c1410; outline-offset: 1px; }

/* right column: the calendar and announcement cards become plain white cards */
.ix-page .ix-content .dbx-side > .ix-card { background: var(--ix-surface, #fff) !important; border: 1px solid var(--dbx-line) !important; border-radius: 14px !important; box-shadow: none !important; }
.ix-page .ix-content .dbx-side > .ix-card.adm-cal { padding: 12px 14px !important; }
.ix-page .ix-content .dbx-side > .ix-card.adm-duty { padding: 12px 14px !important; display: flex; flex-direction: column; }
.ix-page .ix-content .dbx-side .adm-duty-head { margin: 0 0 8px !important; padding: 0 !important; background: none !important; border: 0 !important; box-shadow: none !important; }
.ix-page .ix-content .dbx-side .adm-cal-grid > div:empty { background: none !important; }
.ix-page .ix-content .dbx-side .adm-duty-head h2 { font-size: 13px !important; }
.ix-page .ix-content .dbx-side .adm-duty-icon { width: 26px !important; height: 26px !important; border-radius: 8px !important; }
.ix-page .ix-content .dbx-side .adm-duty-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.ix-page .ix-content .dbx-side .ann-list { flex: 1; }
/* compact calendar (same look as the mockup) */
.ix-page .ix-content .dbx-side .adm-cal-head strong { font-size: 13.5px !important; font-weight: 700 !important; letter-spacing: 0 !important; }
.ix-page .ix-content .dbx-side .adm-cal-nav { width: 26px !important; height: 26px !important; border-radius: 8px !important; }
.ix-page .ix-content .dbx-side .adm-cal-nav svg { width: 13px; height: 13px; }
.ix-page .ix-content .dbx-side .adm-cal-today { display: none !important; }
.ix-page .ix-content .dbx-side .adm-cal-grid { margin-top: 8px !important; gap: 3px !important; row-gap: 3px !important; border: 0 !important; background: none !important; }
.ix-page .ix-content .dbx-side .adm-cal-grid > * { border: 0 !important; box-shadow: none !important; }
.ix-page .ix-content .dbx-side .adm-cal-dow { font-size: 0 !important; padding: 2px 0 4px !important; background: none !important; color: #a99d96 !important; }
.ix-page .ix-content .dbx-side .adm-cal-dow::first-letter { font-size: 10px; font-weight: 700; }
.ix-page .ix-content .dbx-side .adm-cal-day { height: 28px !important; min-height: 0 !important; margin: 0 !important; border-radius: 7px !important; font-size: 11.5px !important; font-weight: 500;
  background: transparent; box-shadow: none !important; }
.ix-page .ix-content .dbx-side .adm-cal-day.today { background: #e8582a !important; color: #fff !important; font-weight: 700 !important; }
.ix-page .ix-content .dbx-side .adm-cal-day.event { background: #fff7e0 !important; color: #b45309 !important; font-weight: 700 !important; }
.ix-page .ix-content .dbx-side .adm-cal-dot { bottom: 3px !important; width: 4px !important; height: 4px !important; }
.ix-page .ix-content .dbx-side .adm-cal-legend { display: none !important; }
.ix-page .ix-content .dbx-side .adm-cal-next { margin-top: 10px !important; padding: 7px 10px !important; font-size: 11.5px !important; border-radius: 10px !important; }
.ix-page .ix-content .dbx-side .ann-list li { padding: 10px 12px !important; }
.ix-page .ix-content .dbx-side .ann-list li strong { font-size: 12.5px; }
.ix-page .ix-content .dbx-side .ann-list li p { font-size: 11.5px; margin: 2px 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.ix-page .adm-cal-next.none { background: #f7f3f0 !important; color: #8a7a71 !important; border-color: #efe7e2 !important; }

/* smaller screens */

/* first row a little shorter (Not checked in · My OJT finish line · Calendar) */
/* calendar: roomy day boxes (it no longer has to match the cards beside it) */
.ix-page .ix-content .dbx-side > .ix-card.adm-cal { padding: 14px 14px 12px !important; }
.ix-page .ix-content .dbx-side .adm-cal-grid { margin-top: 10px !important; row-gap: 4px !important; }
.ix-page .ix-content .dbx-side .adm-cal-dow { padding: 0 0 4px !important; }
.ix-page .ix-content .dbx-side .adm-cal-day { height: 32px !important; font-size: 12px !important; }
.ix-page .ix-content .dbx-side .adm-cal-dot { bottom: 3px !important; }
.ix-page .ix-content .dbx-side .adm-cal-next { margin-top: 10px !important; padding: 7px 10px !important; font-size: 11.5px !important; }
.ix-page .ix-content .dbx-fin-body { grid-template-columns: 108px minmax(0, 1fr); gap: 18px; padding: 10px 18px; }
.ix-page .ix-content .dbx-ring { width: 108px; height: 108px; }
.ix-page .ix-content .dbx-ring > div { width: 84px; height: 84px; }
.ix-page .ix-content .dbx-ring b { font-size: 20px; }
.ix-page .ix-content .dbx-ring small { font-size: 9.5px; }
.ix-page .ix-content .dbx-eta-big { font-size: 18px; }
.ix-page .ix-content .dbx-fin-foot > div { padding: 6px 18px; }
.ix-page .ix-content .dbx-fin-foot b { font-size: 13px; }
.ix-page .ix-content .dbx-today { padding: 12px 14px; }
.ix-page .ix-content .dbx-dot { width: 36px; height: 36px; border-radius: 11px; }
.ix-page .ix-content .dbx-kv { margin-top: 10px; }
.ix-page .ix-content .dbx-kv > div { padding: 5px 10px; }
.ix-page .ix-content .dbx-wkcap { margin-top: 10px; }
.ix-page .ix-content .dbx-wk span { height: auto; min-height: 34px; padding: 4px 0; gap: 1px; line-height: 1.2; text-align: center; box-sizing: border-box; }

/* Not checked in: the icon looks like the Announcements icon (orange with a white icon) */
.ix-page .ix-content .dbx-dot, .ix-page .ix-content .dbx-dot.live, .ix-page .ix-content .dbx-dot.warn {
  background: linear-gradient(135deg, #f2864f, #e8582a); color: #fff; box-shadow: 0 8px 16px rgba(232,88,42,0.3); }

/* wide screens: the cards line up in two rows, so the first card of each column
   (e.g. Not checked in · My OJT finish line · Calendar) starts and ends at the same line */
@media (min-width: 1251px) {
  .ix-page .ix-content .dbx-grid.has-left.has-right { grid-template-rows: auto 1fr; }
  /* intern (two cards in the middle): every card keeps its own height, no blank stretched to the bottom */
  .ix-page .ix-content .dbx-grid.has-left.has-right:has(> .dbx-mid > :nth-child(2)) { grid-template-rows: auto auto; min-height: 0; align-content: start; }
  .ix-page .ix-content .dbx-grid.has-left.has-right > .dbx-col:not(.dbx-side) { display: contents; }
  .ix-page .ix-content .dbx-grid.has-left.has-right > .dbx-left > * { grid-column: 1; }
  .ix-page .ix-content .dbx-grid.has-left.has-right > .dbx-mid > * { grid-column: 2; }
  /* the right column (calendar + announcements) keeps its own heights */
  .ix-page .ix-content .dbx-grid.has-left.has-right > .dbx-side { grid-column: 3; grid-row: 1 / 3; }
  .ix-page .ix-content .dbx-grid.has-left.has-right > .dbx-side > * { grid-row: auto !important; }
  .ix-page .ix-content .dbx-grid.has-left.has-right > .dbx-col > :nth-child(1) { grid-row: 1; }
  .ix-page .ix-content .dbx-grid.has-left.has-right > .dbx-col > :nth-child(2) { grid-row: 2; }
  .ix-page .ix-content .dbx-grid.has-left.has-right > .dbx-col > :only-child { grid-row: 1 / 3; }
  .ix-page .ix-content .dbx-grid.has-left.has-right .dbx-fin { display: flex; flex-direction: column; }
  .ix-page .ix-content .dbx-grid.has-left.has-right .dbx-fin-body { flex: 1; }
}
@media (max-width: 1250px) {
  .ix-page .ix-content .dbx-grid.has-left.has-right { height: auto; min-height: 0; }
  .ix-page .ix-content .dbx-grid.has-left.has-right { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .ix-page .ix-content .dbx-grid.has-left.has-right > .dbx-mid { grid-column: 1 / -1; grid-row: 1; }
  .ix-page .ix-content .dbx-sum.has-lead { grid-template-columns: repeat(var(--n), minmax(0, 1fr)); }
  .ix-page .ix-content .dbx-sum.has-lead > .dbx-lead { grid-column: 1 / -1; border-bottom: 1px solid #f1ece9; }
  .ix-page .ix-content .dbx-sum.has-lead > .dbx-lead + * { border-left: 0; }
}
@media (max-width: 900px) {
  .ix-page .ix-content .dbx-grid.has-right, .ix-page .ix-content .dbx-grid.has-left.has-right { grid-template-columns: minmax(0, 1fr); }
  .ix-page .ix-content .dbx-grid { min-height: 0; height: auto; }
  .ix-page .ix-content .dbx-grid.has-left.has-right > .dbx-mid { grid-row: auto; grid-column: auto; }
  .ix-page .ix-content .dbx-sum, .ix-page .ix-content .dbx-sum.has-lead { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ix-page .ix-content .dbx-sum > * { border-left: 0 !important; border-top: 1px solid #f1ece9; }
  .ix-page .ix-content .dbx-sum > *:nth-child(even of .dbx-num) { border-left: 1px solid #f1ece9 !important; }
  .ix-page .ix-content .dbx-sum > :first-child { border-top: 0; }
  .ix-page .ix-content .dbx-sum:not(.has-lead) > :nth-child(2) { border-top: 0; }
}
@media (max-width: 640px) {
  .ix-page .ix-content .dbx .ix-ph-right .dbx-act span { display: none; }
  .ix-page .ix-content .dbx .ix-ph-right .dbx-act { padding: 0 9px; }
  .ix-page .ix-content .dbx-status { display: none; }
  .ix-page .ix-content .dbx-sum > * { padding: 9px 12px; }
  .ix-page .ix-content .dbx-num b { font-size: 16px; }
  .ix-page .ix-content .dbx-day { grid-template-columns: 34px minmax(0, 1fr) 44px; row-gap: 4px; }
  .ix-page .ix-content .dbx-day > .dbx-tag { display: none; }
  .ix-page .ix-content .dbx-day > .dbx-line { grid-column: 2 / 3; grid-row: 2; }
  .ix-page .ix-content .dbx-day > .dbx-hrs { grid-row: 1 / 3; grid-column: 3; }
  .ix-page .ix-content .dbx-person { grid-template-columns: 30px minmax(0, 1fr) auto; row-gap: 4px; }
  .ix-page .ix-content .dbx-person > .dbx-tag { display: none; }
  .ix-page .ix-content .dbx-person > .dbx-line { grid-column: 2 / -1; grid-row: 2; }
  .ix-page .ix-content .dbx-person > .ix-avatar, .ix-page .ix-content .dbx-person > :first-child { grid-row: 1 / 3; }
}
`;