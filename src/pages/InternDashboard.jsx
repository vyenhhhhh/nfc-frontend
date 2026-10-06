// InternDashboard.jsx
import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import Shell, {
  Spinner, PageHeader, StatCard, Badge, Table, Section, Empty, Msg, Icon, Ring, Avatar,
  calcHours, fmtTime, photoUrl, REQUIRED_HOURS,
} from "../components/DashKit.jsx";

import { formalLayout } from "../components/formalLayout.js";

const API = "http://localhost:8000/api";

const NAV = [
  { path: "/intern",         label: "Dashboard",     icon: "home" },
  { path: "/intern/records", label: "My Attendance", icon: "list" },
  { path: "/intern/hours",   label: "Total Hours",   icon: "clock" },
  { path: "/intern/online",  label: "Submit Online", icon: "upload" },
  { path: "/intern/movs",    label: "Submit MOV",    icon: "folder" },
  { path: "/intern/nfc",     label: "NFC Card",      icon: "card" },
];

export default function InternDashboard() {
  const user = JSON.parse(sessionStorage.getItem("user") || "{}");
  const { pathname: path } = useLocation();
  const navigate = useNavigate();

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecords();
    const iv = setInterval(fetchRecords, 5000);
    return () => clearInterval(iv);
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

  const uniqueDays = [...new Set(records.map((r) => r.date))].length;
  const totalHours = calcHours(records);
  const onsite = records.filter((r) => r.uid !== "ONLINE").length;
  const online = records.filter((r) => r.uid === "ONLINE").length;
  const lastTap = records[0];
  const firstName = user.name?.split(" ")[0] || "Intern";

  return (
    <Shell navItems={NAV} user={user}>
      <style>{internCss}</style>
      <style>{formalLayout}</style>
      {path === "/intern" && (
        <Home
          user={user} firstName={firstName} uniqueDays={uniqueDays} totalHours={totalHours}
          onsite={onsite} online={online} lastTap={lastTap} loading={loading} records={records}
          onApply={() => navigate("/intern/nfc")}
        />
      )}
      {path === "/intern/records" && <Records records={records} loading={loading} />}
      {path === "/intern/hours" && <Hours records={records} loading={loading} />}
      {path === "/intern/online" && <SubmitOnline user={user} />}
      {path === "/intern/movs" && <SubmitMov user={user} />}
      {path === "/intern/nfc" && <NfcApply user={user} />}
      {path === "/intern/profile" && <Profile user={user} uniqueDays={uniqueDays} totalHours={totalHours} />}
    </Shell>
  );
}

/* ───────────────────────── Home ───────────────────────── */

// Big profile picture. Falls back to a simple outline silhouette when there is no photo.
function ProfilePic({ user, size = 132 }) {
  const [bad, setBad] = useState(false);
  const src = photoUrl(user.photo);
  useEffect(() => setBad(false), [user.photo]);

  if (src && !bad) {
    return (
      <img
        className="intern-pic" src={src} alt="" width={size} height={size}
        style={{ width: size, height: size }} onError={() => setBad(true)}
      />
    );
  }
  return (
    <svg
      width={size} height={size} viewBox="0 0 100 100" fill="none" stroke="#e8582a"
      strokeWidth="5.5" strokeLinecap="round" role="img" aria-label="No profile photo"
    >
      <circle cx="50" cy="31" r="19" />
      <path d="M9 94c0-24 18-34 41-34s41 10 41 34" />
    </svg>
  );
}

// "2026-10-04" -> { label: "Oct 4", wk: "Sun" }. Falls back to the raw value.
function fmtDate(d) {
  const dt = new Date(String(d).slice(0, 10) + "T00:00:00");
  if (isNaN(dt)) return { label: d, wk: "" };
  return {
    label: dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    wk: dt.toLocaleDateString("en-US", { weekday: "short" }),
  };
}

// One of the five summary cards
function MiniStat({ icon, tone, label, value, hint, bar, live }) {
  return (
    <div className={`intern-mini ${tone}`}>
      <div className="intern-mini-top">
        <span className="intern-mini-icon"><Icon name={icon} size={16} /></span>
        <span className="intern-mini-label">{label}</span>
      </div>
      <div className="intern-mini-value">{value}</div>
      {bar !== undefined && (
        <div className="intern-mini-bar" aria-hidden="true"><i style={{ width: `${Math.min(bar, 100)}%` }} /></div>
      )}
      {hint && <div className="intern-mini-hint">{live && <i className="intern-live" />}{hint}</div>}
    </div>
  );
}

// Latest 3 records. Rows share the card's height equally, so nothing ever needs to scroll.
function RecentAttendance({ records, loading }) {
  const recent = records.slice(0, 3);
  return (
    <section className="ix-section intern-recent">
      <header>
        <span className="ix-section-icon"><Icon name="list" size={16} /></span>
        <h2>Recent Attendance</h2>
        <span className="ix-count">{records.length}</span>
      </header>

      <div className="intern-rt" role="table" aria-label="Recent attendance">
        <div className="intern-rt-head" role="row">
          {["Date", "Type", "Action", "Time In", "Time Out"].map((h) => (
            <span key={h} role="columnheader">{h}</span>
          ))}
        </div>

        {loading ? (
          <Spinner />
        ) : recent.length === 0 ? (
          <Empty icon="tap" title="No records yet" sub="When you tap in or out, your records will appear here." />
        ) : (
          recent.map((r, i) => {
            const dt = fmtDate(r.date);
            const isIn = r.action === "CHECK_IN";
            return (
              <div className={`intern-rt-row ${isIn ? "is-in" : "is-out"}`} role="row" key={`${r.date}-${r.action}-${i}`}>
                <span role="cell" className="intern-date">
                  <b>{dt.label}</b>
                  {dt.wk && <em>{dt.wk}</em>}
                </span>
                <span role="cell">
                  <Badge label={r.uid === "ONLINE" ? "Online" : "Onsite"} type={r.uid === "ONLINE" ? "online" : "onsite"} />
                </span>
                <span role="cell">
                  <Badge label={isIn ? "IN" : "OUT"} type={isIn ? "in" : "out"} />
                </span>
                <span role="cell" className="intern-time">{fmtTime(r.checked_in_at)}</span>
                <span role="cell" className="intern-time">{r.checked_out_at ? fmtTime(r.checked_out_at) : <span className="ix-muted">—</span>}</span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

// Measures the Home layout at its natural size, then scales it uniformly so it
// always fills the window exactly (like an automatic browser zoom). Phones and
// narrow windows keep the normal stacked, scrollable layout.
function FitToScreen({ children }) {
  const wrapRef = useRef(null);
  const innerRef = useRef(null);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const inner = innerRef.current;
    if (!wrap || !inner) return undefined;

    const MIN = 0.55;
    const MAX = 1.3;
    let raf = 0;

    const reset = () => {
      inner.style.width = "";
      inner.style.transform = "";
      wrap.style.height = "";
    };

    const fit = () => {
      if (window.innerWidth <= 1100) { reset(); return; }
      const avail = window.innerHeight - wrap.getBoundingClientRect().top - 20;
      let s = 1;
      // the layout reflows when its width changes, so settle on a stable scale
      for (let i = 0; i < 5; i++) {
        inner.style.width = `${100 / s}%`;
        const natural = inner.offsetHeight;
        if (!natural) break;
        const next = Math.min(MAX, Math.max(MIN, avail / natural));
        if (Math.abs(next - s) < 0.004) { s = next; break; }
        s = next;
      }
      inner.style.width = `${100 / s}%`;
      inner.style.transform = `scale(${s})`;
      wrap.style.height = `${inner.offsetHeight * s}px`;
    };

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fit);
    };

    fit();
    window.addEventListener("resize", schedule);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    ro?.observe(inner);
    document.fonts?.ready?.then(schedule);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      ro?.disconnect();
    };
  }, []);

  return (
    <div ref={wrapRef} className="intern-fit-wrap">
      <div ref={innerRef} className="intern-fit">{children}</div>
    </div>
  );
}

function Home({
  user,
  firstName,
  uniqueDays,
  totalHours,
  onsite,
  online,
  lastTap,
  loading,
  records,
  onApply,
}) {
  const ringSize = 160;
  const ringStroke = 15;
  const picSize = 116;

  const needsCardWarning =
    user.work_mode !== "offsite" &&
    user.tracking_type !== "output" &&
    !user.has_card;

  const pct = (totalHours / REQUIRED_HOURS) * 100;

  const left = Math.max(
    Math.round((REQUIRED_HOURS - totalHours) * 10) / 10,
    0
  );

  // Next 25% milestone, shown as a friendly nudge
  const nextMilestone = [25, 50, 75, 100].find((m) => pct < m);
  const hrsToMilestone = nextMilestone
    ? Math.max(Math.round(((nextMilestone / 100) * REQUIRED_HOURS - totalHours) * 10) / 10, 0)
    : 0;

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const fullName = user.name || firstName || "Intern";
  const nameParts = fullName.trim().split(" ");
  const first = user.first_name || nameParts[0] || "—";
  const middle = user.middle_name || "—";
  const last =
    user.last_name ||
    (nameParts.length > 1 ? nameParts[nameParts.length - 1] : "—");

  const lastIn = lastTap?.action === "CHECK_IN";
  const lastTime = lastTap
    ? fmtTime(lastTap.action === "CHECK_OUT" && lastTap.checked_out_at ? lastTap.checked_out_at : lastTap.checked_in_at)
    : "";

  return (
    <FitToScreen>
    <div className="intern-home">
      {/* ───── LEFT COLUMN: profile, stats, recent attendance ───── */}
      <div className="intern-home-left">
        <div className="ix-card intern-profile">
          <span className="intern-profile-glow" aria-hidden="true" />

          <div className="intern-profile-pic">
            <span className="intern-pic-wrap"><ProfilePic user={user} size={picSize} /></span>
            <span className="intern-role-pill">OJT intern</span>
          </div>

          <div className="intern-profile-info">
            <div className="intern-greet">{greet}, {firstName} 👋</div>
            <div className="intern-names">
              <div><small>First name</small><span className="v">{first}</span></div>
              <div><small>Middle name</small><span className="v">{middle}</span></div>
              <div><small>Last name</small><span className="v">{last}</span></div>
            </div>
            <div className="intern-contact">
              <span className="intern-chip"><small>Placement</small>{user.ojt_placement || user.placement || "CCIS"}</span>
              <span className="intern-chip"><small>Contact</small>{user.contact_number || "—"}</span>
              <span className="intern-chip"><small>Email</small>{user.email || "—"}</span>
            </div>
          </div>

          <div className="intern-profile-ring">
            <Ring pct={Math.min(pct, 100)} size={ringSize} stroke={ringStroke} track="rgba(255,255,255,0.18)" color="#ffb48f">
              <strong className="dark">{Math.min(pct, 100).toFixed(1)}%</strong>
              <span className="dark">complete</span>
            </Ring>
            <div className="intern-ring-stats">
              <div><strong>{totalHours}</strong><span>hrs completed</span></div>
              <div><strong>{REQUIRED_HOURS}</strong><span>hrs required</span></div>
              <div><strong>{left}</strong><span>hrs remaining</span></div>
              {nextMilestone && (
                <div className="intern-milestone">
                  {hrsToMilestone}h to the {nextMilestone}% mark
                </div>
              )}
            </div>
          </div>
        </div>

        {needsCardWarning && (
          <div className="ix-alert">
            <Icon name="warn" size={18} />
            No NFC card linked to your account yet.
            <button className="ix-b primary sm" onClick={onApply}>
              Apply for a card
            </button>
          </div>
        )}

        <div className="intern-five-stats">
          <MiniStat icon="calendar" tone="orange" label="Days present" value={uniqueDays} hint="days logged" />
          <MiniStat icon="clock" tone="blue" label="Total hours" value={totalHours + "h"} hint={`${Math.min(pct, 100).toFixed(0)}% of ${REQUIRED_HOURS}h`} bar={pct} />
          <MiniStat icon="tap" tone="green" label="Onsite taps" value={onsite} hint="NFC card taps" />
          <MiniStat icon="globe" tone="purple" label="Online logs" value={online} hint="remote days" />

          <div className={`intern-mini ${lastTap && !lastIn ? "orange" : "green"}`}>
            <div className="intern-mini-top">
              <span className="intern-mini-icon"><Icon name="clock" size={16} /></span>
              <span className="intern-mini-label">Last tap</span>
            </div>
            {lastTap ? (
              <>
                <div className="intern-mini-value action">{lastIn ? "Checked in" : "Checked out"}</div>
                <div className="intern-mini-hint">{lastIn && <i className="intern-live" />}{lastTap.date} · {lastTime}</div>
              </>
            ) : (
              <>
                <div className="intern-mini-value action">None yet</div>
                <div className="intern-mini-hint">No tap recorded</div>
              </>
            )}
          </div>
        </div>

        <RecentAttendance records={records} loading={loading} />
      </div>

      {/* ───── RIGHT COLUMN: calendar + announcement ───── */}
      <div className="intern-home-right">
        <HomeCalendar />

        <div className="ix-card intern-announce">
          <div className="intern-announce-head">
            <span className="intern-announce-icon"><Icon name="bell" size={18} /></span>
            <h2>Announcements</h2>
          </div>
          <div className="intern-announce-empty">
            <strong>No announcements yet.</strong>
            <p>Important OJT announcements will appear here.</p>
          </div>
        </div>
      </div>
    </div>
    </FitToScreen>
  );
}

/* ───────────────────────── Home Calendar ───────────────────────── */
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function HomeCalendar() {
  const [events, setEvents] = useState([]);
  const [viewDate, setViewDate] = useState(new Date());

  useEffect(() => {
    const load = () =>
      fetch(`${API}/calendar`, { headers: { Accept: "application/json" } })
        .then((res) => res.json())
        .then((data) => { if (Array.isArray(data)) setEvents(data); })
        .catch(() => { /* calendar just shows no holidays */ });
    load();
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
  }, []);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = viewDate.toLocaleString("en-US", { month: "long" });

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const isToday = (d) => d === now.getDate() && month === now.getMonth() && year === now.getFullYear();
  const keyOf = (d) => `${year}-${pad(month + 1)}-${pad(d)}`;
  // slice(0, 10) so both "2026-10-15" and "2026-10-15T00:00:00Z" work
  const eventOf = (d) => events.find((e) => String(e.date).slice(0, 10) === keyOf(d));

  // Next holiday from today onward
  const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const upcoming = events
    .map((e) => ({ ...e, k: String(e.date).slice(0, 10) }))
    .filter((e) => e.k >= todayKey)
    .sort((a, b) => a.k.localeCompare(b.k))[0];
  const upcomingLabel = upcoming
    ? new Date(upcoming.k + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "";

  return (
    <div className="ix-card intern-cal">
      <div className="intern-cal-head">
        <button className="intern-cal-nav" onClick={() => setViewDate(new Date(year, month - 1, 1))} aria-label="Previous month">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <strong>{monthName} {year}</strong>
        <button className="intern-cal-nav" onClick={() => setViewDate(new Date(year, month + 1, 1))} aria-label="Next month">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </div>

      <button className="intern-cal-today" onClick={() => setViewDate(new Date())}>Jump to today</button>

      <div className="intern-cal-grid">
        {DOW.map((d) => <div key={d} className="intern-cal-dow">{d}</div>)}

        {Array.from({ length: firstDay }, (_, i) => <div key={`blank-${i}`} />)}

        {Array.from({ length: daysInMonth }, (_, i) => {
          const d = i + 1;
          const ev = eventOf(d);
          const cls = ["intern-cal-day", isToday(d) && "today", ev && "event"].filter(Boolean).join(" ");
          return (
            <div
              key={d} className={cls} title={ev ? ev.title : undefined}
              aria-label={`${monthName} ${d}${ev ? ", " + ev.title : ""}`}
            >
              {d}
              {ev && <i className="cal-dot" />}
            </div>
          );
        })}
      </div>

      <div className="intern-cal-legend">
        <span><i className="dot orange" /> Today</span>
        <span><i className="dot amber" /> Holiday / Non-working</span>
      </div>
      {upcoming && (
        <div className="intern-cal-next">
          <Icon name="calendar" size={15} />
          <span>Next break: <strong>{upcoming.title}</strong> on {upcomingLabel}</span>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Records ───────────────────────── */
function Records({ records, loading }) {
  const [filter, setFilter] = useState("all");
  const filtered =
    filter === "all" ? records
      : filter === "onsite" ? records.filter((r) => r.uid !== "ONLINE")
        : records.filter((r) => r.uid === "ONLINE");

  return (
    <>
      <PageHeader title="My Attendance Records" sub="Your complete attendance log, updated in real time." live />
      <div className="ix-pills">
        {["all", "onsite", "online"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={filter === f ? "ix-pill active" : "ix-pill"}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      <div className="ix-card flush">
        {loading ? <Spinner /> : (
          <Table
            headers={["Date", "Type", "Action", "Time In", "Time Out", "Token"]}
            rows={filtered.map((r) => [
              r.date,
              <Badge label={r.uid === "ONLINE" ? "Online" : "Onsite"} type={r.uid === "ONLINE" ? "online" : "onsite"} />,
              <Badge label={r.action === "CHECK_IN" ? "IN" : "OUT"} type={r.action === "CHECK_IN" ? "in" : "out"} />,
              fmtTime(r.checked_in_at),
              fmtTime(r.checked_out_at),
              <span className="ix-mono">{r.token?.substring(0, 36)}…</span>,
            ])}
            empty="No records match this filter."
          />
        )}
      </div>
    </>
  );
}

/* ───────────────────────── Hours ───────────────────────── */
function Hours({ records, loading }) {
  const totalHours = calcHours(records);
  const uniqueDays = [...new Set(records.map((r) => r.date))].length;
  const avgHours = uniqueDays > 0 ? (totalHours / uniqueDays).toFixed(1) : 0;
  const pct = Math.min((totalHours / REQUIRED_HOURS) * 100, 100);

  const byDate = {};
  records.forEach((r) => {
    if (!byDate[r.date]) byDate[r.date] = { checkin: null, checkout: null };
    if (r.checked_in_at && !byDate[r.date].checkin) byDate[r.date].checkin = r.checked_in_at;
    if (r.checked_out_at && !byDate[r.date].checkout) byDate[r.date].checkout = r.checked_out_at;
  });

  const dailyRows = Object.entries(byDate)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, t]) => {
      const hrs = t.checkin && t.checkout
        ? ((new Date(t.checkout) - new Date(t.checkin)) / 3600000).toFixed(2)
        : "—";
      return [
        date,
        fmtTime(t.checkin),
        t.checkout ? fmtTime(t.checkout) : <span className="ix-muted">No checkout</span>,
        hrs !== "—" ? <strong>{hrs} hrs</strong> : "—",
      ];
    });

  return (
    <>
      <PageHeader title="Total Hours Summary" sub="Your computed OJT hours, day by day." />
      <div className="ix-stats">
        <StatCard label="Total Days" value={uniqueDays} icon="calendar" tone="orange" />
        <StatCard label="Total Hours" value={totalHours + "h"} icon="clock" tone="blue" />
        <StatCard label="Average / Day" value={avgHours + "h"} icon="tap" tone="green" />
        <StatCard label="Required" value={REQUIRED_HOURS + "h"} icon="folder" tone="purple" sub="Standard OJT requirement" />
      </div>

      <div className="ix-card">
        <div className="ix-card-label">OJT progress · {REQUIRED_HOURS} hours</div>
        <div className="ix-bar">
          <div className="ix-bar-fill" style={{ width: pct + "%" }} />
          {[25, 50, 75].map((m) => <i key={m} style={{ left: m + "%" }} />)}
        </div>
        <div className="ix-bar-marks"><span>0</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
        <div className="ix-bar-caption">
          <strong>{totalHours}h</strong> completed · <strong>{Math.max(Math.round((REQUIRED_HOURS - totalHours) * 10) / 10, 0)}h</strong> remaining
        </div>
      </div>

      <div className="ix-card flush" style={{ marginTop: "1.25rem" }}>
        {loading ? <Spinner /> : <Table headers={["Date", "Time In", "Time Out", "Hours Worked"]} rows={dailyRows} empty="No hours logged yet." />}
      </div>
    </>
  );
}

/* ───────────────────────── Submit Online ───────────────────────── */
function SubmitOnline({ user }) {
  const [form, setForm] = useState({ date: "", description: "" });
  const [submitting, setSub] = useState(false);
  const [msg, setMsg] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault(); setSub(true); setMsg(null);
    try {
      const res = await fetch(`${API}/intern/submit-online`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, ...form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setMsg({ type: "success", text: data.message });
      setForm({ date: "", description: "" });
    } catch (err) { setMsg({ type: "error", text: err.message }); }
    finally { setSub(false); }
  };

  return (
    <>
      <PageHeader title="Submit Online Attendance" sub="For asynchronous or remote workdays." />
      <div className="ix-card narrow">
        <div className="ix-note">
          <Icon name="info" size={18} />
          Submit your attendance for days you worked remotely. Your OJT coordinator will review and approve or reject it.
        </div>
        <Msg msg={msg} />
        <form onSubmit={handleSubmit} className="ix-form">
          <div className="ix-field">
            <label htmlFor="ix-date">Date of work</label>
            <input
              id="ix-date" type="date" value={form.date} required
              max={new Date().toISOString().split("T")[0]}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </div>
          <div className="ix-field">
            <label htmlFor="ix-desc">Tasks completed</label>
            <textarea
              id="ix-desc" rows={6} value={form.description} required
              placeholder="Describe in detail what you worked on that day..."
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <button type="submit" disabled={submitting} className="ix-btn">
            {submitting ? "Submitting..." : "Submit for Coordinator Approval"}
          </button>
        </form>
      </div>
    </>
  );
}

/* ───────────────────────── Submit MOV ───────────────────────── */
function SubmitMov({ user }) {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [movs, setMovs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => { fetchMovs(); /* eslint-disable-next-line */ }, []);

  const fetchMovs = async () => {
    try {
      const res = await fetch(`${API}/intern/my-movs?user_id=${user.id}`);
      const data = await res.json();
      setMovs(Array.isArray(data) ? data : []);
    } finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setMsg({ type: "error", text: "Please select a file." }); return; }
    setSubmitting(true); setMsg(null);
    try {
      const fd = new FormData();
      fd.append("user_id", user.id);
      fd.append("title", title);
      fd.append("file", file);
      const res = await fetch(`${API}/intern/submit-mov`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setMsg({ type: "success", text: data.message });
      setTitle(""); setFile(null);
      fetchMovs();
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    } finally { setSubmitting(false); }
  };

  return (
    <>
      <PageHeader title="Submit MOV" sub="Upload documents, certificates, or forms for your coordinator to review." />
      <div className="ix-card narrow" style={{ marginBottom: "1.5rem" }}>
        <Msg msg={msg} />
        <form onSubmit={handleSubmit} className="ix-form">
          <div className="ix-field">
            <label htmlFor="ix-title">Document title</label>
            <input
              id="ix-title" type="text" required placeholder="e.g. Endorsement Letter, MOA Copy"
              value={title} onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="ix-field">
            <label>File</label>
            <label className={file ? "ix-drop has-file" : "ix-drop"}>
              <input
                type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={(e) => setFile(e.target.files[0] || null)}
              />
              <span className="ix-drop-icon"><Icon name={file ? "file" : "upload"} size={22} /></span>
              <span className="ix-drop-text">
                {file ? file.name : "Click to choose a file"}
                <small>{file ? "Click to change" : "PDF, JPG, PNG, DOC or DOCX"}</small>
              </span>
            </label>
          </div>
          <button type="submit" disabled={submitting} className="ix-btn">
            {submitting ? "Uploading..." : "Submit MOV"}
          </button>
        </form>
      </div>

      <Section icon="folder" title="My Submissions" count={movs.length}>
        {loading ? <Spinner /> : (
          <Table
            headers={["Title", "File", "Status", "Remarks", "Submitted"]}
            rows={movs.map((m) => [
              <strong>{m.title}</strong>,
              <a className="ix-link" href={`http://localhost:8000/storage/${m.file_path}`} target="_blank" rel="noopener noreferrer">
                {m.original_name}
              </a>,
              <Badge
                label={m.status.charAt(0).toUpperCase() + m.status.slice(1)}
                type={m.status === "approved" ? "approved" : m.status === "rejected" ? "rejected" : "pending"}
              />,
              m.remarks || "—",
              new Date(m.created_at).toLocaleDateString("en-PH"),
            ])}
            empty="No submissions yet."
          />
        )}
      </Section>
    </>
  );
}

/* ───────────────────────── NFC card application ───────────────────────── */
const STEPS = ["Submitted", "Approved", "Card issued"];
const DONE_COUNT = { pending: 1, approved: 2, issued: 3 };
const STATUS_TEXT = {
  pending: "Waiting for your OJT coordinator to review your request.",
  approved: "Approved! Your card is being prepared. Your OJT coordinator will link it to your account.",
  issued: "Your card has been issued and linked to your account.",
};

function NfcApply({ user }) {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [type, setType] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    try {
      const res = await fetch(`${API}/intern/nfc-request?user_id=${user.id}`, { headers: { Accept: "application/json" } });
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
    const iv = setInterval(load, 8000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const req = info?.request;
  const status = req?.status;
  const hasCard = !!info?.has_card;
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
      load();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof SyntaxError ? "The NFC card service isn't available yet." : err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader title="NFC Card" sub="Apply for your attendance card and track its status." />
      {loading ? <Spinner /> : error ? (
        <div className="ix-alert"><Icon name="warn" size={18} /> {error}</div>
      ) : (
        <div className="ix-stack">
          <div className="ix-card narrow">
            <div className="ix-nfc-status">
              <div className={hasCard ? "ix-nfc-badge ok" : "ix-nfc-badge"}><Icon name="card" size={26} /></div>
              <div>
                <strong>{hasCard ? "Your NFC card is linked" : "No NFC card yet"}</strong>
                <span>
                  {hasCard
                    ? `Card ID ending ${String(info.uid || "").slice(-4) || "••••"}. Tap it on the reader to log your attendance.`
                    : "Apply below and your OJT coordinator will get your card ready."}
                </span>
              </div>
            </div>
          </div>

          {req && (
            <div className="ix-card narrow">
              <div className="ix-card-label">Your latest request</div>
              <div className="ix-req-meta">
                <span className="ix-chip">{req.type || "NFC card"}</span>
                {req.created_at && (
                  <span className="ix-muted">
                    Applied {new Date(req.created_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}
                  </span>
                )}
              </div>

              {status === "rejected" ? (
                <div className="ix-msg error" style={{ marginTop: 14, marginBottom: 0 }}>
                  Your request wasn't approved.{req.remarks ? ` Remarks: ${req.remarks}` : ""} You can apply again below.
                </div>
              ) : (
                <>
                  <ol className="ix-steps">
                    {STEPS.map((label, i) => {
                      const done = DONE_COUNT[status] ?? 0;
                      return (
                        <li key={label} className={i < done ? "done" : i === done ? "current" : ""}>
                          <span className="ix-step-dot">{i < done ? <Icon name="check" size={16} /> : i + 1}</span>
                          <span>{label}</span>
                        </li>
                      );
                    })}
                  </ol>
                  <div className="ix-step-text">{STATUS_TEXT[status]}</div>
                  {req.remarks && <div className="ix-remarks" style={{ marginTop: 6 }}>Remarks: {req.remarks}</div>}
                </>
              )}
            </div>
          )}

          {!active && (
            <div className="ix-card narrow">
              <div className="ix-card-label">{hasCard ? "Request a replacement" : "Apply for your card"}</div>
              <Msg msg={msg} />
              <form onSubmit={submit} className="ix-form" style={{ marginTop: 14 }}>
                {types.length > 1 ? (
                  <div className="ix-field">
                    <label htmlFor="nfc-type">Reason</label>
                    <select id="nfc-type" value={chosen} onChange={(e) => setType(e.target.value)}>
                      {types.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                ) : (
                  <div className="ix-field">
                    <label>Request type</label>
                    <span className="ix-chip" style={{ alignSelf: "flex-start" }}>{chosen}</span>
                  </div>
                )}
                <div className="ix-field">
                  <label htmlFor="nfc-notes">Notes <span className="ix-muted">(optional)</span></label>
                  <textarea
                    id="nfc-notes" rows={4} value={notes} maxLength={500}
                    placeholder="Anything your OJT coordinator should know?"
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
                <div className="ix-note" style={{ margin: 0 }}>
                  <Icon name="info" size={18} />
                  Your OJT coordinator reviews requests and links the card to your account. You'll see the progress here.
                </div>
                <button type="submit" disabled={submitting} className="ix-btn">
                  {submitting ? "Submitting..." : "Submit Application"}
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ───────────────────────── Profile ───────────────────────── */
function Profile({ user, uniqueDays, totalHours }) {
  const pct = (totalHours / REQUIRED_HOURS) * 100;
  return (
    <>
      <PageHeader title="My Profile" sub="Your account information." />
      <div className="ix-profile">
        <div className="ix-card ix-profile-card">
          <div className="ix-profile-avatar"><Avatar name={user.name} photo={user.photo} size={96} /></div>
          <h2>{user.name}</h2>
          <p>{user.email}</p>
          <Badge label="OJT Intern" type="onsite" />
          <dl>
            {[
              ["User ID", "#" + user.id],
              ["Role", "OJT Intern"],
              ["Days done", uniqueDays + " days"],
              ["Hours", totalHours + " hours"],
            ].map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
        </div>

        <div className="ix-card">
          <div className="ix-card-label">OJT progress</div>
          <div className="ix-profile-ring">
            <Ring pct={pct} size={170} stroke={15} track="#fde3d6" color="#e8582a">
              <strong className="dark">{Math.min(pct, 100).toFixed(1)}%</strong>
              <span className="dark">complete</span>
            </Ring>
            <div className="ix-profile-ring-text">
              <div><strong>{totalHours}</strong> hrs completed</div>
              <div><strong>{REQUIRED_HOURS}</strong> hrs required</div>
              <div><strong>{Math.max(Math.round((REQUIRED_HOURS - totalHours) * 10) / 10, 0)}</strong> hrs remaining</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ───────────────────────── intern-only styles ───────────────────────── */
const internCss = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Figtree:wght@400;500;600;700&display=swap');

/* ═════════ SHARED LOOK (all intern pages) ═════════ */
.ix-main {
  --o: #e8582a; --o2: #f2733a; --ink: #1b1410; --mut: #7a6c64; --line: #f3e3da;
  --display: 'Bricolage Grotesque', 'Figtree', 'Segoe UI', sans-serif;
  background:
    radial-gradient(560px 380px at 94% -4%, rgba(242,115,58,0.22), transparent 70%),
    radial-gradient(520px 400px at -4% 104%, rgba(255,181,140,0.38), transparent 70%),
    #fff6f6;
}
.ix-content { font-family: 'Figtree', 'Segoe UI', sans-serif; }
.ix-content h1, .ix-content h2 { font-family: var(--display); }

/* cards: rounder, warmer shadow */
.ix-content .ix-card,
.ix-content .ix-section {
  border-radius: 20px;
  border: 1px solid rgba(255,255,255,0.85);
  box-shadow: 0 12px 32px rgba(150,52,20,0.08), 0 1px 2px rgba(27,20,16,0.04);
}
.ix-content .ix-card.flush,
.ix-content .ix-section { overflow: hidden; }

/* tables: soft header, airy rows, warm hover */
.ix-content table { width: 100%; border-collapse: separate; border-spacing: 0; }
.ix-content thead th {
  background: #fff6f1; color: #8a6a5c; font-size: 12.5px; font-weight: 600; text-align: left;
  letter-spacing: 0; text-transform: none; padding: 14px 20px; border-bottom: 1px solid var(--line);
  white-space: nowrap;
}
.ix-content tbody td {
  padding: 15px 20px; font-size: 13.5px; color: #3a2e28; border-bottom: 1px solid #f8eee8;
  vertical-align: middle;
}
.ix-content tbody tr { transition: background .15s; }
.ix-content tbody tr:hover td { background: #fffaf6; }
.ix-content tbody tr:last-child td { border-bottom: none; }
.ix-content tbody td:first-child { font-weight: 600; color: var(--ink); }
.ix-content .ix-badge { border-radius: 99px; font-weight: 700; }

/* pills + buttons */
.ix-content .ix-pill { border-radius: 99px; }
.ix-content .ix-pill.active { background: linear-gradient(135deg, var(--o2), #e04a1a); color: #fff; box-shadow: 0 8px 18px rgba(232,88,42,0.3); }

/* ═════════ HOME PAGE ═════════ */

.ix-main:has(.intern-home) { padding: 14px 18px 18px; }
.ix-content:has(.intern-home) { max-width: none; }

.intern-home {
  --card-radius: 0px;
  --card-border: 1px solid rgba(255,255,255,0.85);
  --card-shadow: 0 14px 34px rgba(150,52,20,0.09), 0 1px 2px rgba(27,20,16,0.04);
  --home-gap: 5px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(380px, 29vw, 496px);
  gap: var(--home-gap);
  align-items: stretch;
}
.intern-home-left,
.intern-home-right {
  display: flex;
  flex-direction: column;
  gap: var(--home-gap);
  min-width: 0;
  min-height: 0;
}
.intern-home .ix-alert { margin-bottom: 0; border-radius: 16px; }

.intern-home .intern-profile,
.intern-home .intern-recent,
.intern-home .intern-cal,
.intern-home .intern-announce,
.intern-home .intern-mini {
  border-radius: var(--card-radius);
  border: var(--card-border);
  box-shadow: var(--card-shadow);
}

/* ── profile hero: the one bold card ── */
.intern-home .ix-card.intern-profile {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 22px 30px;
  padding: 24px 30px;
  flex: none;
  color: #fff;
  background: linear-gradient(125deg, #2a120a 0%, #7a2a12 52%, #e8582a 135%);
}
.intern-profile::before {
  content: ""; position: absolute; inset: 0; pointer-events: none; opacity: .13; mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='.6'/></svg>");
}
.intern-home .intern-profile .intern-profile-glow {
  position: absolute; right: -90px; top: -120px; width: 380px; height: 380px; border-radius: 50%; pointer-events: none; z-index: 0;
  background: radial-gradient(circle, rgba(255,160,110,0.5), rgba(255,160,110,0) 65%);
}
.intern-profile > *:not(.intern-profile-glow) { position: relative; z-index: 1; }

.intern-profile-pic {
  width: 150px; flex-shrink: 0;
  display: flex; flex-direction: column; align-items: center; gap: 14px;
}
.intern-pic-wrap {
  display: block; line-height: 0; border-radius: 50%; overflow: hidden; background: #fff4ee;
  box-shadow: 0 0 0 4px rgba(255,255,255,0.9), 0 0 0 9px rgba(255,255,255,0.18), 0 16px 34px rgba(0,0,0,0.35);
}
.intern-pic { border-radius: 50%; object-fit: cover; display: block; }
.intern-role-pill {
  padding: 5px 14px; border-radius: 99px; white-space: nowrap;
  background: rgba(255,255,255,0.16); border: 1px solid rgba(255,255,255,0.35);
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  color: #fff; font-size: 12.5px; font-weight: 600;
}
.intern-profile-info { flex: 1 1 260px; min-width: 0; }
.intern-greet { font-size: 14px; font-weight: 600; color: #ffb48f; margin-bottom: 10px; }
.intern-names { display: grid; grid-template-columns: repeat(3, minmax(0, auto)); justify-content: start; gap: 6px 28px; }
.intern-names > div { min-width: 0; }
.intern-names small, .intern-chip small { display: block; font-size: 11.5px; font-weight: 500; color: rgba(255,255,255,0.62); }
.intern-names .v {
  display: block; font-family: var(--display); font-size: clamp(18px, 1.55vw, 26px); font-weight: 800; letter-spacing: -0.3px;
  line-height: 1.15; text-transform: uppercase; overflow-wrap: anywhere;
}
.intern-contact { margin-top: 18px; display: flex; flex-wrap: wrap; gap: 8px; }
.intern-chip {
  min-width: 0; max-width: 100%; padding: 7px 14px; border-radius: 14px; overflow-wrap: anywhere;
  background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.2);
  font-size: clamp(13px, 1vw, 15px); font-weight: 600; line-height: 1.3; color: #fff;
}
.intern-profile-ring { display: flex; align-items: center; gap: 22px; flex-shrink: 0; }
.intern-profile .ix-ring-center strong.dark { color: #fff; font-family: var(--display); font-size: 30px; }
.intern-profile .ix-ring-center span.dark { color: rgba(255,255,255,0.72); }
.intern-ring-stats { display: flex; flex-direction: column; gap: 14px; }
.intern-ring-stats strong { display: block; font-family: var(--display); font-size: 19px; font-weight: 800; color: #fff; line-height: 1.2; }
.intern-ring-stats span { display: block; font-size: 12.5px; color: rgba(255,255,255,0.7); margin-top: 1px; }
.intern-milestone {
  align-self: flex-start; padding: 5px 12px; border-radius: 99px; white-space: nowrap;
  background: #fff; color: #b8400f; font-size: 12px; font-weight: 700;
  box-shadow: 0 8px 18px rgba(0,0,0,0.22);
}

/* ── five summary cards ── */
.intern-five-stats {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--home-gap);
  flex-shrink: 0;
}
.intern-mini {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 15px 16px;
  background: #fff;
  transition: transform .2s, box-shadow .2s;
}
.intern-mini::after {
  content: "";
  position: absolute; right: -28px; top: -28px; width: 96px; height: 96px; border-radius: 50%;
  background: var(--tint); opacity: .75; pointer-events: none;
}
.intern-mini:hover { transform: translateY(-3px); box-shadow: 0 20px 38px rgba(150,52,20,0.14); }
.intern-mini.orange { --tint: #fdeee7; --fg: #e8582a; --grad: linear-gradient(135deg, #f2864f, #e8582a); }
.intern-mini.blue   { --tint: #e8f1fd; --fg: #2563eb; --grad: linear-gradient(135deg, #5b8def, #2563eb); }
.intern-mini.green  { --tint: #e6f7ee; --fg: #16a34a; --grad: linear-gradient(135deg, #3ecf7d, #16a34a); }
.intern-mini.purple { --tint: #f0eafd; --fg: #7c3aed; --grad: linear-gradient(135deg, #a07af2, #7c3aed); }
.intern-mini-top { position: relative; z-index: 1; display: flex; align-items: center; gap: 9px; min-width: 0; }
.intern-mini-icon {
  width: 32px; height: 32px; flex-shrink: 0; border-radius: 11px; display: flex; align-items: center; justify-content: center;
  background: var(--grad); color: #fff; box-shadow: 0 8px 16px color-mix(in srgb, var(--fg) 32%, transparent);
}
.intern-mini-label { font-size: 12.5px; font-weight: 600; color: var(--mut); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.intern-mini-value { position: relative; z-index: 1; font-family: var(--display); font-size: 30px; font-weight: 800; letter-spacing: -.6px; line-height: 1.1; color: var(--ink); }
.intern-mini-value.action { font-size: 18px; letter-spacing: -.2px; color: var(--fg); padding: 5px 0; }
.intern-mini-hint { position: relative; z-index: 1; display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: #9a8c84; line-height: 1.35; }
.intern-mini-bar { position: relative; z-index: 1; height: 5px; border-radius: 99px; background: var(--tint); overflow: hidden; }
.intern-mini-bar i { display: block; height: 100%; border-radius: 99px; background: var(--grad); transition: width .6s cubic-bezier(.2,.8,.2,1); }
.intern-live { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; flex-shrink: 0; box-shadow: 0 0 0 0 rgba(34,197,94,0.5); animation: intern-live 2s ease-out infinite; }
@keyframes intern-live { 0% { box-shadow: 0 0 0 0 rgba(34,197,94,0.5); } 100% { box-shadow: 0 0 0 9px rgba(34,197,94,0); } }

/* ── recent attendance: rows share the card height, nothing scrolls ── */
.intern-recent { margin-bottom: 0; flex: 1 0 auto; min-height: 0; display: flex; flex-direction: column; background: #fff; overflow: hidden; }
.intern-rt { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.intern-rt-head,
.intern-rt-row {
  display: grid;
  grid-template-columns: 1.3fr 1fr .8fr 1.1fr 1.1fr;
  align-items: center;
  gap: 10px;
  padding: 0 22px;
}
.intern-rt-head { padding-top: 11px; padding-bottom: 11px; background: #fff6f1; font-size: 12.5px; font-weight: 600; color: #8a6a5c; }
.intern-rt-row { position: relative; flex: 1 0 auto; min-height: 58px; border-top: 1px solid #f8eee8; font-size: 13.5px; color: #3a2e28; transition: background .15s; }
.intern-rt-row::before {
  content: ""; position: absolute; left: 0; top: 22%; bottom: 22%; width: 4px; border-radius: 0 4px 4px 0;
  background: #22c55e; opacity: .9;
}
.intern-rt-row.is-out::before { background: #e8582a; }
.intern-rt-row:hover { background: #fffaf6; }
.intern-date { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
.intern-date b { padding: 4px 11px; border-radius: 10px; background: #fff0e8; color: #c2481c; font-size: 13px; font-weight: 700; white-space: nowrap; }
.intern-date em { font-style: normal; font-size: 12.5px; color: #9a8c84; }
.intern-time { font-variant-numeric: tabular-nums; font-weight: 600; }
.intern-rt .ix-badge { font-size: 12.5px; padding: 5px 15px; border-radius: 99px; }

/* ── calendar ── */
.intern-cal { padding: 20px 22px 18px; flex-shrink: 0; background: #fff; }
.intern-cal-head { display: flex; align-items: center; justify-content: space-between; }
.intern-cal-head strong { font-family: var(--display); font-size: 23px; font-weight: 800; letter-spacing: -.4px; }
.intern-cal-nav {
  width: 40px; height: 40px; border-radius: 14px; border: 1.5px solid #f1e2d9; background: #fffaf7;
  color: #6b5a50; display: flex; align-items: center; justify-content: center; cursor: pointer;
  transition: all .15s;
}
.intern-cal-nav:hover { border-color: #e8582a; color: #e8582a; background: #fdeee7; }
.intern-cal-today {
  display: block; margin: 12px auto 6px; padding: 7px 20px; border-radius: 99px;
  border: 1.5px solid #f1e2d9; background: #fffaf7; font-size: 14px; font-weight: 600; color: #3a2e28;
  cursor: pointer; transition: all .15s;
}
.intern-cal-today:hover { border-color: #e8582a; color: #e8582a; background: #fdeee7; }
.intern-cal-nav:focus-visible, .intern-cal-today:focus-visible { outline: 2px solid #e8582a; outline-offset: 2px; }
.intern-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); row-gap: 4px; }
.intern-cal-dow { text-align: center; font-size: 13.5px; font-weight: 600; color: #a1857a; padding: 10px 0; }
.intern-cal-day {
  position: relative; height: 52px; margin: 0 3px; border-radius: 16px;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; font-weight: 500; color: #2b211c; transition: background .15s;
}
.intern-cal-day:hover { background: #fff3ec; }
.intern-cal-day.today {
  background: linear-gradient(135deg, #f2733a, #e04a1a); color: #fff; font-weight: 800;
  box-shadow: 0 10px 20px rgba(232,88,42,0.35);
}
.intern-cal-day.event { background: #fff4d6; color: #b45309; font-weight: 800; }
.intern-cal-day.today.event { background: linear-gradient(135deg, #f2733a, #e04a1a); color: #fff; }
.cal-dot { position: absolute; bottom: 7px; width: 6px; height: 6px; border-radius: 50%; background: #f59e0b; }
.intern-cal-day.today .cal-dot { background: #fff; }
.intern-cal-legend {
  margin-top: 14px; padding-top: 14px; border-top: 1px dashed #f1ddd1;
  display: flex; align-items: center; gap: 20px; flex-wrap: wrap; font-size: 14px; color: #7a6c64;
}
.intern-cal-legend span { display: inline-flex; align-items: center; gap: 7px; }
.intern-cal-legend .dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.intern-cal-legend .dot.orange { background: #e8582a; }
.intern-cal-legend .dot.amber { background: #f59e0b; }
.intern-cal-next {
  margin-top: 12px; display: flex; align-items: center; gap: 8px; padding: 9px 12px; border-radius: 12px;
  background: #fff8e6; color: #92520b; font-size: 13px; line-height: 1.35;
}
.intern-cal-next svg { flex-shrink: 0; }

/* ── announcement ── */
.intern-announce { flex: 1 1 auto; min-height: 150px; padding: 20px 24px; background: linear-gradient(160deg, #fff 55%, #fff1e9); }
.intern-announce-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.intern-announce-icon {
  width: 38px; height: 38px; border-radius: 13px; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #f2864f, #e8582a); color: #fff; box-shadow: 0 8px 16px rgba(232,88,42,0.32);
}
.intern-announce h2 { font-size: 22px; font-weight: 800; letter-spacing: -.3px; color: var(--ink); margin: 0; }
.intern-announce-empty { padding: 14px 16px; border-radius: 14px; border: 1.5px dashed #f2cdb9; background: rgba(255,255,255,0.7); }
.intern-announce-empty strong { font-size: 14.5px; color: #3a2e28; }
.intern-announce-empty p { margin-top: 4px; font-size: 13px; color: #9a8c84; }

/* ═════════ OTHER INTERN PAGES ═════════ */
.ix-grid-2 { display: grid; grid-template-columns: 300px 1fr; gap: 20px; align-items: start; }
.ix-stack { display: flex; flex-direction: column; gap: 20px; }
.ix-card.narrow { max-width: 580px; width: 100%; }
.ix-card .ix-note { margin: 0 0 18px; }

.ix-last { padding: 22px 20px; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
.ix-last-date { font-size: 20px; font-weight: 800; margin-top: 8px; }
.ix-last-time { font-size: 14px; color: #64748b; font-family: ui-monospace, monospace; }

.ix-bar { position: relative; margin-top: 16px; height: 14px; border-radius: 99px; background: #fbeee7; overflow: hidden; }
.ix-bar i { position: absolute; top: 0; bottom: 0; width: 2px; background: #fff; opacity: .9; }
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
.ix-profile-avatar .ix-av { box-shadow: 0 12px 26px rgba(232,88,42,0.38); }
.ix-profile-card h2 { font-size: 19px; font-weight: 800; }
.ix-profile-card p { font-size: 13px; color: #7a6c64; margin: 3px 0 10px; }
.ix-profile-card dl { margin-top: 18px; padding-top: 16px; border-top: 1px dashed #f1ddd1; text-align: left; }
.ix-profile-card dl div { display: flex; justify-content: space-between; margin-bottom: 11px; }
.ix-profile-card dt { font-size: 12px; color: #a1857a; }
.ix-profile-card dd { font-size: 13px; font-weight: 600; color: #1e293b; }
.ix-profile-ring { display: flex; align-items: center; gap: 32px; margin-top: 20px; flex-wrap: wrap; }
.ix-profile-ring-text { display: flex; flex-direction: column; gap: 10px; font-size: 13.5px; color: #7a6c64; }
.ix-profile-ring-text strong { color: var(--ink); font-size: 18px; }
.ix-profile .ix-ring-center .dark { color: #0b1220; opacity: 1; }
.ix-profile .ix-ring-center span.dark { color: #64748b; }

/* ═════════ AUTO-FIT (replaces the old height tiers) ═════════ */
.intern-fit-wrap { position: relative; }
.intern-fit { transform-origin: top left; }
.ix-main:has(.intern-home) { overflow-x: hidden; overflow-y: auto; }

/* ═════════ BOTTOM ALIGNMENT ═════════
   Both columns stretch to the same height. The last card in each column
   (Recent Attendance on the left, Announcements on the right) soaks up any
   extra space, so their bottom edges always line up. */
.intern-home { align-items: stretch; }
.intern-home .intern-home-left,
.intern-home .intern-home-right { align-self: stretch; height: 100%; }
.intern-home .intern-recent,
.intern-home .intern-announce {
  margin: 0;
  box-sizing: border-box;
  flex: 1 0 auto;   /* grow to fill the column, never shrink below content */
}
.intern-home .intern-announce { min-height: 150px; }  /* raise/lower to give Announcements more/less room */

/* ═════════ RESPONSIVE ═════════ */
@media (max-width: 1100px) {
  .intern-home { grid-template-columns: 1fr; height: auto; min-height: 0; }
  .intern-five-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .intern-rt-row { min-height: 56px; flex: none; }
  .intern-recent { flex: none; }
}
@media (max-width: 700px) {
  .intern-five-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .intern-profile { justify-content: center; text-align: center; }
  .intern-names { justify-content: center; }
  .intern-contact { justify-content: center; }
  .intern-profile-ring { flex-direction: column; }
  .intern-cal-day { height: 42px; font-size: 17px; margin: 0 1px; }
  .intern-rt-head, .intern-rt-row { padding: 0 12px; gap: 6px; font-size: 12px; }
  .intern-date em { display: none; }
}
@media (max-width: 1000px) {
  .ix-profile { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .intern-live { animation: none; }
  .intern-mini, .intern-mini-bar i { transition: none; }
}
`;