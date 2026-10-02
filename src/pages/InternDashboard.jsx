// InternDashboard.jsx
import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Shell, {
  Spinner, PageHeader, StatCard, Badge, Table, Section, Empty, Msg, Hero, Icon, Ring, Avatar,
  calcHours, fmtTime, greeting, REQUIRED_HOURS,
} from "../components/DashKit.jsx";

const API = "http://localhost:8000/api";

const NAV = [
  { path: "/intern",         label: "Dashboard",          icon: "home" },
  { path: "/intern/records", label: "My Attendance", icon: "list" },
  { path: "/intern/hours",   label: "Total Hours",   icon: "clock" },
  { path: "/intern/online",  label: "Submit Online", icon: "upload" },
  { path: "/intern/movs",    label: "Submit MOV",    icon: "folder" },
  { path: "/intern/nfc",     label: "NFC Card",      icon: "card" },
  { path: "/intern/profile", label: "My Profile",    icon: "user" },
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
function cheer(pct) {
  if (pct <= 0) return "Every tap counts. Your first one is waiting.";
  if (pct < 25) return "Great start! The hours are beginning to add up.";
  if (pct < 50) return "You're building real momentum. Keep tapping in!";
  if (pct < 75) return "Past the halfway mark. Look how far you've come.";
  if (pct < 100) return "Almost there. The finish line is in sight!";
  return "You did it! Your required hours are complete. 🎉";
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
  const needsCardWarning =
    user.work_mode !== "offsite" &&
    user.tracking_type !== "output" &&
    !user.has_card;

  const pct = (totalHours / REQUIRED_HOURS) * 100;

  const left = Math.max(
    Math.round((REQUIRED_HOURS - totalHours) * 10) / 10,
    0
  );

  // Get name parts
  const fullName = user.name || firstName || "Intern";
  const nameParts = fullName.trim().split(" ");

  const first =
    user.first_name || nameParts[0] || "—";

  const middle =
    user.middle_name || "—";

  const last =
    user.last_name ||
    (nameParts.length > 1
      ? nameParts[nameParts.length - 1]
      : "—");

  return (
    <div className="intern-home-page">
      {/* TOP SECTION */}
      <div className="intern-top">

        {/* PROFILE CARD */}
        <div className="intern-profile-card ix-card">

          <div className="intern-profile-avatar">
            <Avatar
              name={user.name}
              photo={user.photo}
              size={120}
            />
            <Badge label="OJT INTERN" type="onsite" />
          </div>

          <div className="intern-profile-info">

            <div className="intern-name-line">
              <div>
                <div className="intern-info-line">
                  <strong>First Name:</strong> {first}
                </div>

                <div className="intern-info-line">
                  <strong>Middle Name:</strong> {middle}
                </div>

                <div className="intern-info-line">
                  <strong>Last Name:</strong> {last}
                </div>
              </div>

              
            </div>

            <div className="intern-contact">

              <div>
                <strong>OJT Placement:</strong>{" "}
                {user.ojt_placement || user.placement || "CCIS"}
              </div>

              <div>
                <strong>Contact Number:</strong>{" "}
                {user.contact_number || "—"}
              </div>

              <div>
                <strong>Email:</strong>{" "}
                {user.email || "—"}
              </div>

            </div>
          </div>
        </div>

        {/* PROGRESS CARD */}
        <div className="intern-progress-card ix-card">

          <div className="intern-ring">
            <Ring
              pct={Math.min(pct, 100)}
              size={155}
              stroke={14}
              track="#fde3d6"
              color="#e8582a"
            >
              <strong className="dark">
                {Math.min(pct, 100).toFixed(1)}%
              </strong>

              <span className="dark">
                complete
              </span>
            </Ring>
          </div>

          <div className="intern-progress-details">

            <div>
              <strong>{totalHours}</strong>
              <span>hrs completed</span>
            </div>

            <div>
              <strong>{REQUIRED_HOURS}</strong>
              <span>hrs required</span>
            </div>

            <div>
              <strong>{left}</strong>
              <span>hrs remaining</span>
            </div>

          </div>
        </div>

      </div>

      {/* NFC WARNING */}
      {needsCardWarning && (
        <div className="ix-alert">
          <Icon name="warn" size={18} />
          No NFC card linked to your account yet.

          <button
            className="ix-b primary sm"
            onClick={onApply}
          >
            Apply for a card
          </button>
        </div>
      )}

      {/* BOTTOM SECTION */}
<div className="intern-bottom">

  {/* LEFT SIDE */}
  <div>

    {/* STATS */}
    {/* 5 SUMMARY CARDS */}
<div className="intern-five-stats">

  <StatCard
    label="Days Present"
    value={uniqueDays}
    icon="calendar"
    tone="orange"
  />

  <StatCard
    label="Total Hours"
    value={totalHours + "h"}
    icon="clock"
    tone="blue"
  />

  <StatCard
    label="Onsite Taps"
    value={onsite}
    icon="tap"
    tone="green"
  />

  <StatCard
    label="Online Logs"
    value={online}
    icon="globe"
    tone="purple"
  />

  {/* 5TH CARD - LAST RECORDED TAP */}
  <div className="intern-last-tap ix-card">

    <div className="intern-last-tap-label">
      <Icon name="clock" size={15} />
      <span>Last Recorded Tap</span>
    </div>

    {lastTap ? (
      <>
        <Badge
          label={
            lastTap.action === "CHECK_IN"
              ? "CHECK IN"
              : "CHECK OUT"
          }
          type={
            lastTap.action === "CHECK_IN"
              ? "in"
              : "out"
          }
        />

        <strong className="intern-last-tap-date">
          {lastTap.date}
        </strong>

        <span className="intern-last-tap-time">
          {fmtTime(lastTap.checked_in_at)}
        </span>
      </>
    ) : (
      <span className="intern-last-tap-empty">
        No tap recorded
      </span>
    )}

  </div>

</div>

    {/* RECENT ATTENDANCE */}
    <div style={{ marginTop: "12px" }}>
      <Section
        icon="list"
        title="Recent Attendance"
        count={records.length}
      >
        {loading ? (
          <Spinner />
        ) : (
          <Table
            headers={[
              "Date",
              "Type",
              "Action",
              "Time In",
              "Time Out",
            ]}
            rows={records.slice(0, 4).map((r) => [
              r.date,

              <Badge
                label={
                  r.uid === "ONLINE"
                    ? "Online"
                    : "Onsite"
                }
                type={
                  r.uid === "ONLINE"
                    ? "online"
                    : "onsite"
                }
              />,

              <Badge
                label={
                  r.action === "CHECK_IN"
                    ? "IN"
                    : "OUT"
                }
                type={
                  r.action === "CHECK_IN"
                    ? "in"
                    : "out"
                }
              />,

              fmtTime(r.checked_in_at),
              fmtTime(r.checked_out_at),
            ])}
            empty="When you tap in or out, your records will appear here."
          />
        )}
      </Section>
    </div>

  </div>

  {/* RIGHT SIDE */}
  <div className="intern-right">

    <HomeCalendar />

    <Section
      icon="info"
      title="Announcement"
    >
      <div className="intern-announcement">
        <strong>No announcements yet.</strong>
        <p>
          Important OJT announcements will appear here.
        </p>
      </div>
    </Section>

  </div>

</div>
    </div>
  );
}
/* ───────────────────────── Home Calendar ───────────────────────── */

function HomeCalendar() {
  const [events, setEvents] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    fetch(`${API}/calendar`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setEvents(data);
        }
      })
      .catch((err) => {
        console.error("Calendar error:", err);
      });
  }, []);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthName = currentDate.toLocaleString("default", {
    month: "long",
  });

  const today = new Date();

  const isToday = (day) => {
    return (
      day === today.getDate() &&
      month === today.getMonth() &&
      year === today.getFullYear()
    );
  };

  const getEvent = (day) => {
    const dateString =
      `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    return events.find((event) => event.date === dateString);
  };

  return (
    <div className="ix-card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <button
          className="ix-b ghost sm"
          onClick={() =>
            setCurrentDate(new Date(year, month - 1, 1))
          }
        >
          ←
        </button>

        <strong>
          {monthName} {year}
        </strong>

        <button
          className="ix-b ghost sm"
          onClick={() =>
            setCurrentDate(new Date(year, month + 1, 1))
          }
        >
          →
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: "4px",
        }}
      >
        {["S", "M", "T", "W", "T", "F", "S"].map((day, i) => (
          <div
            key={i}
            style={{
              textAlign: "center",
              fontSize: "11px",
              fontWeight: 700,
              color: "#94a3b8",
              padding: "5px",
            }}
          >
            {day}
          </div>
        ))}

        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}

        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const event = getEvent(day);

          return (
            <div
              key={day}
              title={event ? event.title : ""}
              style={{
                minHeight: "34px",
                padding: "3px",
                borderRadius: "7px",
                textAlign: "center",
                background: event
                  ? "#fff3cd"
                  : isToday(day)
                  ? "#e8f1ff"
                  : "transparent",
                border: isToday(day)
                  ? "1px solid #8ab4f8"
                  : "1px solid transparent",
                fontSize: "12px",
              }}
            >
              <strong>{day}</strong>

              {event && (
                <div
                  style={{
                    fontSize: "7px",
                    marginTop: "3px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {event.title}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: "14px",
          fontSize: "11px",
          color: "#64748b",
        }}
      >
        🟡 Holiday / Non-working day
      </div>
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
          Submit your attendance for days you worked remotely. Your supervisor will review and approve or reject it.
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
            {submitting ? "Submitting..." : "Submit for Supervisor Approval"}
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
  pending: "Waiting for your supervisor to review your request.",
  approved: "Approved! Your card is being prepared. Your supervisor will link it to your account.",
  issued: "Your card has been issued and linked to your account.",
};

function NfcApply({ user }) {
  const [info, setInfo] = useState(null); // { has_card, uid, request }
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
          {/* current card */}
          <div className="ix-card narrow">
            <div className="ix-nfc-status">
              <div className={hasCard ? "ix-nfc-badge ok" : "ix-nfc-badge"}><Icon name="card" size={26} /></div>
              <div>
                <strong>{hasCard ? "Your NFC card is linked" : "No NFC card yet"}</strong>
                <span>
                  {hasCard
                    ? `Card ID ending ${String(info.uid || "").slice(-4) || "••••"}. Tap it on the reader to log your attendance.`
                    : "Apply below and your supervisor will get your card ready."}
                </span>
              </div>
            </div>
          </div>

          {/* latest request */}
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

          {/* application form */}
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
                    placeholder="Anything your supervisor should know?"
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
                <div className="ix-note" style={{ margin: 0 }}>
                  <Icon name="info" size={18} />
                  Your supervisor reviews requests and links the card to your account. You'll see the progress here.
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
.intern-five-stats {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  width: 100%;
  margin-bottom: 12px;
  align-items: stretch;
}

.intern-five-stats > * {
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
} 

.intern-last-tap {
  min-height: 100%;
  padding: 16px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  box-sizing: border-box;
  overflow: hidden;
}

.intern-last-tap-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 700;
  color: #94a3b8;
  white-space: nowrap;
}

.intern-last-tap-date {
  font-size: 12px;
  color: #1e293b;
}

.intern-last-tap-time {
  font-size: 11px;
  color: #64748b;
}

.intern-last-tap-empty {
  font-size: 11px;
  color: #94a3b8;
}

.intern-top {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(360px, 0.65fr);
    gap: 20px;
    margin-bottom: 20px;
  }

  .intern-profile-card {
  height: 185px;
  min-height: 185px;
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 22px;
  box-sizing: border-box;
}

  .intern-profile-avatar {
    width: 125px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .intern-profile-avatar .ix-av {
    box-shadow: 0 10px 25px rgba(232, 88, 42, 0.18);
  }

  .intern-profile-info {
    flex: 1;
  }

  .intern-name-line {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
  }

  .intern-info-line {
    font-size: 14px;
    line-height: 1.35;
    color: #1e293b;
  }

  .intern-info-line strong {
    font-weight: 500;
  }



  .intern-contact {
    margin-top: 14px;
    font-size: 12px;
    line-height: 1.45;
    color: #334155;
  }

  .intern-contact strong {
    font-weight: 500;
  }

  .intern-progress-card {
  height: 185px;
  min-height: 185px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 18px;
  box-sizing: border-box;
}

  .intern-ring {
    flex-shrink: 0;
  }

  .intern-progress-details {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .intern-progress-details div {
    display: flex;
    flex-direction: column;
  }

  .intern-progress-details strong {
    font-size: 17px;
    color: #0b1220;
  }

  .intern-progress-details span {
    font-size: 13px;
    color: #64748b;
  }

  .intern-bottom {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 380px;
    gap: 20px;
    align-items: start;
  }

  .intern-bottom .ix-card {
    margin-bottom: 0;
  }

  .intern-bottom > div:first-child .ix-stats {
    margin-bottom: 20px;
  }
    .intern-right {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.intern-login {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.intern-login strong {
  font-size: 14px;
  color: #1e293b;
}

.intern-login span {
  font-size: 13px;
  color: #64748b;
}
.intern-announcement {
  padding: 20px;
  min-height: 130px;
}

.intern-announcement strong {
  font-size: 16px;
  color: #1e293b;
}

.intern-announcement p {
  margin-top: 8px;
  font-size: 13px;
  color: #64748b;
}

.intern-home-page {
  height: calc(100vh - 110px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.intern-home-page .intern-top {
  flex-shrink: 0;
}

.intern-home-page .intern-bottom {
  flex: 1;
}

.intern-home-page .intern-bottom > div:first-child,
.intern-home-page .intern-right {
  min-height: 0;
}

  
  .ix-grid-2 { display: grid; grid-template-columns: 300px 1fr; gap: 20px; align-items: start; }
  .ix-stack { display: flex; flex-direction: column; gap: 20px; }
  .ix-card.narrow { max-width: 580px; width: 100%; }
  .ix-card .ix-note { margin: 0 0 18px; }

  .ix-last { padding: 22px 20px; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
  .ix-last-date { font-size: 20px; font-weight: 800; margin-top: 8px; }
  .ix-last-time { font-size: 14px; color: #64748b; font-family: ui-monospace, monospace; }

  .ix-bar { position: relative; margin-top: 16px; height: 14px; border-radius: 99px; background: #f1f5f9; overflow: hidden; }
  .ix-bar i { position: absolute; top: 0; bottom: 0; width: 2px; background: #fff; opacity: .9; }
  .ix-bar-marks { display: flex; justify-content: space-between; font-size: 10.5px; color: #94a3b8; margin-top: 6px; }
  .ix-bar-caption { font-size: 13px; color: #64748b; margin-top: 12px; }
  .ix-bar-caption strong { color: #0b1220; }

  .ix-field textarea { resize: vertical; line-height: 1.6; }
  .ix-btn { padding: 13px; border: none; border-radius: 12px; cursor: pointer; color: #fff; font-size: 14px; font-weight: 700; letter-spacing: .3px; background: linear-gradient(135deg, #f2733a, #e04a1a); box-shadow: 0 10px 22px rgba(232,88,42,0.32); transition: transform .15s, box-shadow .15s; }
  .ix-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 14px 28px rgba(232,88,42,0.4); }
  .ix-btn:disabled { opacity: .7; cursor: default; }
  .ix-btn:focus-visible { outline: 2px solid #e8582a; outline-offset: 2px; }

  .ix-drop { position: relative; display: flex; align-items: center; gap: 14px; padding: 18px; border: 2px dashed #f5b79f; border-radius: 14px; background: #fffaf7; cursor: pointer; transition: all .15s; }
  .ix-drop:hover { border-color: #e8582a; background: #fff5ef; }
  .ix-drop.has-file { border-style: solid; border-color: #e8582a; }
  .ix-field .ix-drop input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; padding: 0; border: 0; background: transparent; box-shadow: none; }
  .ix-drop-icon { width: 46px; height: 46px; border-radius: 14px; background: #fdeee7; color: #e8582a; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .ix-drop-text { display: flex; flex-direction: column; font-size: 13.5px; font-weight: 600; color: #1e293b; min-width: 0; word-break: break-all; }
  .ix-drop-text small { font-size: 11.5px; font-weight: 400; color: #94a3b8; margin-top: 2px; }

  /* NFC application */
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

  /* profile */
  .ix-profile { display: grid; grid-template-columns: 300px 1fr; gap: 20px; align-items: start; }
  .ix-profile-card { text-align: center; }
  .ix-profile-avatar { display: flex; justify-content: center; margin-bottom: 14px; }
  .ix-profile-avatar .ix-av { box-shadow: 0 12px 26px rgba(232,88,42,0.38); }
  .ix-profile-card h2 { font-size: 18px; font-weight: 800; }
  .ix-profile-card p { font-size: 13px; color: #64748b; margin: 3px 0 10px; }
  .ix-profile-card dl { margin-top: 18px; padding-top: 16px; border-top: 1px solid #f1f5f9; text-align: left; }
  .ix-profile-card dl div { display: flex; justify-content: space-between; margin-bottom: 11px; }
  .ix-profile-card dt { font-size: 12px; color: #94a3b8; }
  .ix-profile-card dd { font-size: 13px; font-weight: 600; color: #1e293b; }
  .ix-profile-ring { display: flex; align-items: center; gap: 32px; margin-top: 20px; flex-wrap: wrap; }
  .ix-profile-ring-text { display: flex; flex-direction: column; gap: 10px; font-size: 13.5px; color: #64748b; }
  .ix-profile-ring-text strong { color: #0b1220; font-size: 18px; }
  .ix-ring-center .dark { color: #0b1220; opacity: 1; }
  .ix-ring-center span.dark { color: #64748b; }
  .intern-home-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 380px;
    gap: 20px;
    align-items: start;
  }

.intern-last-tap-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 9px;
  font-weight: 700;
  color: #94a3b8;
  letter-spacing: 0.3px;
}

.intern-last-tap-date {
  font-size: 12px;
  color: #1e293b;
}

.intern-last-tap-time {
  font-size: 11px;
  color: #64748b;
}

.intern-last-tap-empty {
  font-size: 11px;
  color: #94a3b8;
}

@media (max-width: 1200px) {
  .intern-five-stats {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 700px) {
  .intern-five-stats {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 1000px) {
  .intern-top,
  .intern-bottom {
    grid-template-columns: 1fr;
  }
  .intern-profile-card,
  .intern-progress-card {
    height: auto;
    min-height: 185px;
  }
}
`;