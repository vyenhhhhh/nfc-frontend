// InternDashboard.jsx
import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Shell, {
  Spinner, PageHeader, StatCard, Badge, Table, Section, Empty, Msg, Hero, Icon, Ring, Avatar,
  calcHours, fmtTime, greeting, REQUIRED_HOURS,
} from "../components/DashKit.jsx";

const API = "http://localhost:8000/api";

const NAV = [
  { path: "/intern",         label: "Home",          icon: "home" },
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

function Home({ user, firstName, uniqueDays, totalHours, onsite, online, lastTap, loading, records, onApply }) {
  const needsCardWarning = user.work_mode !== "offsite" && user.tracking_type !== "output" && !user.has_card;
  const pct = (totalHours / REQUIRED_HOURS) * 100;
  const left = Math.max(Math.round((REQUIRED_HOURS - totalHours) * 10) / 10, 0);

  return (
    <>
      <Hero
        tag="OJT Progress"
        title={`${greeting()}, ${firstName}!`}
        text={cheer(pct)}
        facts={[
          { v: totalHours + "h", l: "completed" },
          { v: left + "h", l: "to go" },
          { v: uniqueDays, l: "days present" },
        ]}
        ring={{ pct, top: pct.toFixed(0) + "%", bottom: `of ${REQUIRED_HOURS}h` }}
      />

      {needsCardWarning && (
        <div className="ix-alert">
          <Icon name="warn" size={18} />
          No NFC card linked to your account yet.
          <button className="ix-b primary sm" onClick={onApply}>Apply for a card</button>
        </div>
      )}

      <div className="ix-stats">
        <StatCard label="Days Present" value={uniqueDays} icon="calendar" tone="orange" />
        <StatCard label="Total Hours" value={totalHours + "h"} icon="clock" tone="blue" />
        <StatCard label="Onsite Taps" value={onsite} icon="tap" tone="green" />
        <StatCard label="Online Logs" value={online} icon="globe" tone="purple" />
      </div>

      <div className="ix-grid-2">
        <Section icon="clock" title="Last Recorded Tap">
          {lastTap ? (
            <div className="ix-last">
              <Badge
                label={lastTap.action === "CHECK_IN" ? "CHECK IN" : "CHECK OUT"}
                type={lastTap.action === "CHECK_IN" ? "in" : "out"}
              />
              <div className="ix-last-date">{lastTap.date}</div>
              <div className="ix-last-time">{fmtTime(lastTap.checked_in_at)}</div>
            </div>
          ) : (
            <Empty icon="tap" title="No tap recorded yet" sub="Your latest check-in or check-out will appear here." />
          )}
        </Section>

        <Section icon="list" title="Recent Attendance" count={records.length}>
          {loading ? <Spinner /> : (
            <Table
              headers={["Date", "Type", "Action", "Time In", "Time Out"]}
              rows={records.slice(0, 5).map((r) => [
                r.date,
                <Badge label={r.uid === "ONLINE" ? "Online" : "Onsite"} type={r.uid === "ONLINE" ? "online" : "onsite"} />,
                <Badge label={r.action === "CHECK_IN" ? "IN" : "OUT"} type={r.action === "CHECK_IN" ? "in" : "out"} />,
                fmtTime(r.checked_in_at),
                fmtTime(r.checked_out_at),
              ])}
              empty="When you tap in or out, your records will appear here."
            />
          )}
        </Section>
      </div>
    </>
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

  @media (max-width: 1000px) { .ix-grid-2, .ix-profile { grid-template-columns: 1fr; } }
`;