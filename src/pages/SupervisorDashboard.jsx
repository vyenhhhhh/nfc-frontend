// SupervisorDashboard.jsx
// The HTE supervisor's workspace: sees only their own interns' attendance, approves overtime and
// forgotten time-outs first (the OJT coordinator gives the final decision), and certifies DTRs.
import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Shell, {
  Spinner, Badge, Table, Section, Avatar, Icon, PageHeader, Msg,
  InternMonitor, AnnouncementBoard, todayManila, fmtTime, greeting, liveRefresh, fmtMinutes,
} from "../components/DashKit.jsx";
import {
  HomeCalendar, Records, DTR, Reports, AdminProfile, adminCss, adminMatch, GroupPage, grpCss,
} from "./AdminDashboard.jsx";
import { internCss, cardUnify } from "./InternDashboard.jsx";
import { formalLayout } from "../components/formalLayout.js";
import { mdCss } from "../components/materialTheme.js";
import { API } from "../config.js";

const NAV = [
  { path: "/supervisor",           label: "Home",  icon: "home" },
  { path: "/supervisor/approvals", label: "Approvals",  icon: "inbox" },
  { path: "/supervisor/interns",   label: "Interns",    icon: "users" },
  { path: "/supervisor/reports",   label: "Reports",    icon: "chart" },
  { path: "/supervisor/profile",   label: "My Profile", icon: "user" },
];

/* Pages that hold several tabs (same as the admin and coordinator). The open tab is in the address,
   e.g. /supervisor/reports?tab=dtr. The first tab is the default. */
const GROUPS = {
  "/supervisor/interns": {
    title: "Interns",
    live: true,
    tabs: [
      { key: "monitor", label: "Monitor Interns",    icon: "users", sub: "Real-time status of your interns." },
      { key: "records", label: "Attendance Records", icon: "list",  sub: "Complete attendance log of your interns." },
    ],
  },
  "/supervisor/reports": {
    title: "Reports",
    tabs: [
      { key: "dtr",     label: "Generate DTR",        icon: "file",  sub: "View, print and certify your interns' Daily Time Records." },
      { key: "summary", label: "Consolidated Report", icon: "chart", sub: "Monthly attendance summary of your interns." },
    ],
  },
};

// The old addresses still work (bookmarks, links): they open the matching tab.
const OLD_PATHS = {
  "/supervisor/records": "/supervisor/interns?tab=records",
  "/supervisor/dtr":     "/supervisor/reports?tab=dtr",
};

export default function SupervisorDashboard() {
  const user = JSON.parse(sessionStorage.getItem("user") || "{}");
  const { pathname: path, search, state } = useLocation();
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [interns, setInterns] = useState([]);
  const [overtime, setOvertime] = useState([]);        // my interns' overtime
  const [corrections, setCorrections] = useState([]);  // my interns' forgotten time-outs
  const [online, setOnline] = useState([]);            // my interns' online workdays
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
    return liveRefresh(fetchAll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAll = async () => {
    try {
      const [r, u, ot, tc, on] = await Promise.all([
        fetch(`${API}/admin/all-attendance`).then((r) => r.json()),
        fetch(`${API}/admin/users`).then((r) => r.json()),
        fetch(`${API}/supervisor/overtime`).then((r) => r.json()).catch(() => []),
        fetch(`${API}/supervisor/time-corrections`).then((r) => r.json()).catch(() => []),
        fetch(`${API}/supervisor/online`).then((r) => r.json()).catch(() => []),
      ]);
      if (Array.isArray(r)) setRecords([...r]);
      if (Array.isArray(u)) setInterns(u.filter((x) => x.role === "intern"));
      if (Array.isArray(ot)) setOvertime(ot);
      if (Array.isArray(tc)) setCorrections(tc);
      if (Array.isArray(on)) setOnline(on);
    } catch (err) {
      console.error("Poll error:", err);
    } finally {
      setLoading(false);
    }
  };

  // old address -> the new page + tab (keeps the "View all records" search, if any)
  useEffect(() => {
    if (OLD_PATHS[path]) navigate(OLD_PATHS[path], { replace: true, state });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // which tab is open on a grouped page
  const group = GROUPS[path];
  const asked = new URLSearchParams(search).get("tab");
  const tab = group ? (group.tabs.find((t) => t.key === asked) || group.tabs[0]) : null;
  const pickTab = (key) => navigate(`${path}?tab=${key}`, { replace: true });

  return (
    <Shell navItems={NAV} user={user}>
      {/* same order as the admin dashboard so every page looks identical */}
      <style>{adminCss}</style>
      <style>{internCss}</style>
      <style>{formalLayout}</style>
      <style>{mdCss}</style>
      <style>{cardUnify}</style>
      <style>{adminMatch}</style>
      <style>{svCss}</style>
      {path === "/supervisor" && (
        <Home
          user={user} records={records} interns={interns} loading={loading} go={navigate}
          toReview={overtime.filter((o) => o.ot_status === "pending").length + corrections.filter((c) => c.status === "pending").length
            + online.filter((o) => o.status === "pending").length}
        />
      )}
      {path === "/supervisor/approvals" && (
        <Approvals overtime={overtime} corrections={corrections} online={online} onRefresh={fetchAll} />
      )}
      {group && (
        <GroupPage group={group} tab={tab} onPick={pickTab}>
          {/* Interns */}
          {tab.key === "monitor" && (
            <InternMonitor
              interns={interns} records={records} loading={loading} onRefresh={fetchAll}
              recordsPath="/supervisor/interns?tab=records"
            />
          )}
          {tab.key === "records" && <Records records={records} loading={loading} />}
          {/* Reports */}
          {tab.key === "dtr" && <DTR interns={interns} records={records} canCertify />}
          {tab.key === "summary" && <Reports interns={interns} records={records} />}
        </GroupPage>
      )}
      {path === "/supervisor/profile" && <AdminProfile user={user} />}
    </Shell>
  );
}

/* ───────────────────────── Home ───────────────────────── */
function Home({ user, records, interns, loading, go, toReview = 0 }) {
  const today = todayManila();
  const todayRecs = records.filter((r) => r.date === today);
  const inNowAll = todayRecs.filter((r) => r.uid !== "ONLINE" && r.action === "CHECK_IN" && !r.checked_out_at);
  // one entry per person, in case someone has more than one open check-in
  const inNow = inNowAll.filter((r, i, a) => a.findIndex((x) => (x.user_id ?? x.name) === (r.user_id ?? r.name)) === i);
  const checkedIn = inNow.length;
  const pct = interns.length ? (checkedIn / interns.length) * 100 : 0;
  const first = user.name?.split(" ")[0] || "there";
  const dateLabel = new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" });

  const stats = [
    { icon: "users", tone: "orange", label: "Total interns", value: interns.length, hint: "under monitoring" },
    { icon: "tap", tone: "green", label: "Present now", value: checkedIn, hint: `of ${interns.length} interns`, bar: pct },
    { icon: "inbox", tone: "purple", label: "To review", value: toReview, hint: "online days, overtime, corrections" },
    { icon: "clock", tone: "blue", label: "Not in yet", value: Math.max(interns.length - checkedIn, 0), hint: "interns today" },
  ];

  const quick = [
    { icon: "inbox", label: "Approvals", to: "/supervisor/approvals" },
    { icon: "users", label: "Monitor", to: "/supervisor/interns" },
    { icon: "file", label: "DTR", to: "/supervisor/reports?tab=dtr" },
  ];

  return (
    <div className="adm-home">
      {/* ───── LEFT ───── */}
      <div className="adm-col">
        <div className="hv-hero">
          <span className="hv-blob a" aria-hidden="true" />
          <span className="hv-blob b" aria-hidden="true" />

          <div className="hv-hero-main">
            <span className={`hv-pill ${checkedIn > 0 ? "live" : "idle"}`}>
              <i aria-hidden="true" /> {checkedIn > 0 ? `${checkedIn} on the clock now` : "Nobody checked in yet"}
            </span>
            <h1>{greeting()}, {first}</h1>
            <p>Here's how your interns are doing today. {dateLabel}.</p>
          </div>

          <div className="hv-hero-side">
            <div className="hv-quick">
              {quick.map((q) => (
                <button key={q.to} type="button" onClick={() => go(q.to)}>
                  <Icon name={q.icon} size={14} /> {q.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="hv-stats">
          {stats.map((s) => (
            <div key={s.label} className={`hv-stat ${s.tone}`}>
              <span className="hv-stat-ic"><Icon name={s.icon} size={18} /></span>
              <div className="hv-stat-body">
                <small>{s.label}</small>
                <strong>{s.value}</strong>
                <em>{s.hint}</em>
                {s.bar !== undefined && <span className="hv-stat-bar"><i style={{ width: s.bar + "%" }} /></span>}
              </div>
            </div>
          ))}
        </div>

        <div className="adm-live hv-recent">
          <Section icon="clock" title="Today's Live Attendance" count={todayRecs.length} live>
            {loading ? <Spinner /> : (
              <Table
                headers={["Intern", "Type", "Action", "Time"]}
                rows={todayRecs.map((r) => [
                  <div className="ix-actions">
                    <Avatar name={r.name} photo={r.photo} size={32} />
                    <strong>{r.name}</strong>
                  </div>,
                  <Badge label={r.uid === "ONLINE" ? "Online" : "Onsite"} type={r.uid === "ONLINE" ? "online" : "onsite"} />,
                  <Badge label={r.action === "CHECK_IN" ? "IN" : "OUT"} type={r.action === "CHECK_IN" ? "in" : "out"} />,
                  <span className="adm-time">{fmtTime(r.checked_in_at)}</span>,
                ])}
                empty="No activity today yet."
              />
            )}
          </Section>
        </div>
      </div>

      {/* ───── RIGHT: calendar, on duty, announcements ───── */}
      <div className="adm-col">
        <HomeCalendar />

        <div className="ix-card adm-duty">
          <div className="adm-duty-head">
            <span className="adm-duty-icon"><Icon name="tap" size={18} /></span>
            <h2>On duty now</h2>
            <span className="ix-count">{checkedIn}</span>
          </div>
          {inNow.length === 0 ? (
            <div className="adm-duty-empty">
              <strong>Nobody is checked in.</strong>
              <p>Interns who tap in will show up here.</p>
            </div>
          ) : (
            <ul className="adm-duty-list">
              {inNow.slice(0, 6).map((r) => (
                <li key={r.user_id ?? r.name}>
                  <Avatar name={r.name} photo={r.photo} size={34} status="on" />
                  <span className="adm-duty-name">{r.name}</span>
                  <span className="adm-duty-time">since {fmtTime(r.checked_in_at)}</span>
                </li>
              ))}
              {inNow.length > 6 && <li className="adm-duty-more">+{inNow.length - 6} more</li>}
            </ul>
          )}
        </div>

        <AnnouncementBoard limit={3} />
      </div>
    </div>
  );
}
/* ───────────────────────── Approvals (first step) ─────────────────────────
   The supervisor sees the intern work, so they review overtime and forgotten time-outs first.
   Approve = sent to the OJT coordinator for the final decision. Reject = final. */
const clock = (v) => (v ? new Date(v).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }) : "—");
const day = (v) => String(v || "").slice(0, 10);
const STATUS = {
  pending: ["Waiting for you", "pending"],
  endorsed: ["Sent to coordinator", "online"],
  approved: ["Approved", "approved"],
  rejected: ["Rejected", "rejected"],
};
const statusBadge = (st) => <Badge label={(STATUS[st] || [st])[0]} type={(STATUS[st] || [null, "none"])[1]} />;

function Approvals({ overtime, corrections, online = [], onRefresh }) {
  const [tab, setTab] = useState("online");
  const [minutes, setMinutes] = useState({});
  const [remarks, setRemarks] = useState({});
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  const otPending = overtime.filter((o) => o.ot_status === "pending");
  const fixPending = corrections.filter((c) => c.status === "pending");
  const onPending = online.filter((o) => o.status === "pending");
  const reviewOnline = (o, status) =>
    send(`/supervisor/online/${o.id}/review`, { status, remarks: remarks["n" + o.id] || "" }, "n" + o.id + status);

  const send = async (url, body, key) => {
    setBusy(key); setMsg(null);
    try {
      const res = await fetch(`${API}${url}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Something went wrong.");
      setMsg({ type: "success", text: data.message });
      onRefresh();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    } finally {
      setBusy(null);
    }
  };

  const reviewOt = (o, status) => {
    const m = minutes[o.id] === undefined || minutes[o.id] === "" ? o.ot_minutes : Number(minutes[o.id]);
    if (status === "approved" && (!m || m < 1 || m > o.ot_minutes)) {
      setMsg({ type: "error", text: `Approve between 1 and ${o.ot_minutes} minutes.` });
      return;
    }
    send(`/supervisor/overtime/${o.id}/review`, { status, minutes: status === "approved" ? m : null, remarks: remarks["o" + o.id] || "" }, "o" + o.id + status);
  };
  const reviewFix = (c, status) =>
    send(`/supervisor/time-corrections/${c.id}/review`, { status, remarks: remarks["c" + c.id] || "" }, "c" + c.id + status);

  const remarkInput = (key) => (
    <input type="text" className="ix-input" placeholder="Remarks (optional)"
      value={remarks[key] || ""} onChange={(e) => setRemarks((r) => ({ ...r, [key]: e.target.value }))} />
  );
  const buttons = (onReject, onApprove, key) => (
    <>
      <button className="ix-b danger" onClick={onReject} disabled={!!busy}>{busy === key + "rejected" ? "..." : "Reject"}</button>
      <button className="ix-b ok" onClick={onApprove} disabled={!!busy}>{busy === key + "approved" ? "..." : "Approve"}</button>
    </>
  );
  const allGood = (text) => (
    <div className="ix-card ix-allgood">
      <div className="ix-empty-icon"><Icon name="check" size={30} /></div>
      <div className="ix-empty-title" style={{ fontSize: 17 }}>All caught up!</div>
      <div className="ix-empty-sub">{text}</div>
    </div>
  );

  return (
    <>
      <PageHeader title="Approvals" sub="Confirm your interns' online workdays, overtime and forgotten time-outs. Confirmed ones go to the OJT coordinator for the final decision." live />
      <Msg msg={msg} />
      {/* same underline tabs as the coordinator's Approvals page */}
      <style>{grpCss}</style>
      <div className="grp-tabs" role="tablist" aria-label="Approvals">
        {[
          { key: "online", label: "Online Attendance", icon: "inbox", n: onPending.length },
          { key: "overtime", label: "Overtime", icon: "clock", n: otPending.length },
          { key: "fix", label: "Time Corrections", icon: "pencil", n: fixPending.length },
        ].map((t) => (
          <button
            key={t.key} type="button" role="tab" aria-selected={tab === t.key}
            className={tab === t.key ? "grp-tab active" : "grp-tab"}
            onClick={() => setTab(t.key)}
          >
            <Icon name={t.icon} size={16} />
            <span>{t.label}</span>
            {t.n > 0 && <span className="grp-tab-n">{t.n > 99 ? "99+" : t.n}</span>}
          </button>
        ))}
      </div>

      {tab === "online" ? (
        <>
          {onPending.length === 0 ? allGood("No online workdays waiting for you.") : (
            <div className="sv-list">
              {onPending.map((o) => (
                <div key={o.id} className="ix-card sv-card">
                  <div className="sv-who">
                    <Avatar name={o.intern_name} photo={o.intern_photo} size={36} />
                    <div><strong>{o.intern_name}</strong><span>{day(o.date)} · worked from home</span></div>
                  </div>
                  <div className="sv-what" title={o.description}>{o.description}</div>
                  <div className="sv-actions">
                    {remarkInput("n" + o.id)}
                    {buttons(() => reviewOnline(o, "rejected"), () => reviewOnline(o, "approved"), "n" + o.id)}
                  </div>
                </div>
              ))}
            </div>
          )}
          <Section icon="inbox" title="Reviewed online workdays" count={online.length - onPending.length}>
            <Table
              headers={["Intern", "Date", "Tasks", "Status"]}
              rows={online.filter((o) => o.status !== "pending").map((o) => [
                <strong>{o.intern_name}</strong>,
                day(o.date),
                <span className="sv-reason" title={o.description}>{o.description}</span>,
                statusBadge(o.status),
              ])}
              empty="Nothing reviewed yet."
            />
          </Section>
        </>
      ) : tab === "overtime" ? (
        <>
          {otPending.length === 0 ? allGood("No overtime waiting for you.") : (
            <div className="sv-list">
              {otPending.map((o) => (
                <div key={o.id} className="ix-card sv-card">
                  <div className="sv-who">
                    <Avatar name={o.intern_name} photo={o.intern_photo} size={36} />
                    <div><strong>{o.intern_name}</strong><span>{day(o.date)} · In {clock(o.checked_in_at)} · Out {clock(o.checked_out_at)}</span></div>
                  </div>
                  <div className="sv-what"><strong>{fmtMinutes(o.ot_minutes)}</strong> after 5:00 PM</div>
                  <div className="sv-actions">
                    <input type="number" className="ix-input sv-min" min={1} max={o.ot_minutes} placeholder={`${o.ot_minutes} min`}
                      aria-label="Minutes to approve" value={minutes[o.id] ?? ""}
                      onChange={(e) => setMinutes((m) => ({ ...m, [o.id]: e.target.value }))} />
                    {remarkInput("o" + o.id)}
                    {buttons(() => reviewOt(o, "rejected"), () => reviewOt(o, "approved"), "o" + o.id)}
                  </div>
                </div>
              ))}
            </div>
          )}
          <Section icon="clock" title="Reviewed overtime" count={overtime.length - otPending.length}>
            <Table
              headers={["Intern", "Date", "Overtime", "You approved", "Status", "Final credit"]}
              rows={overtime.filter((o) => o.ot_status !== "pending").map((o) => [
                <strong>{o.intern_name}</strong>,
                day(o.date),
                fmtMinutes(o.ot_minutes),
                o.ot_endorsed_minutes ? fmtMinutes(o.ot_endorsed_minutes) : "—",
                statusBadge(o.ot_status),
                o.ot_status === "approved" ? fmtMinutes(o.ot_approved_minutes) : "—",
              ])}
              empty="Nothing reviewed yet."
            />
          </Section>
        </>
      ) : (
        <>
          {fixPending.length === 0 ? allGood("No time corrections waiting for you.") : (
            <div className="sv-list">
              {fixPending.map((c) => (
                <div key={c.id} className="ix-card sv-card">
                  <div className="sv-who">
                    <Avatar name={c.intern_name} photo={c.intern_photo} size={36} />
                    <div><strong>{c.intern_name}</strong><span>{day(c.date)} · In {clock(c.checked_in_at)} → asks Out {clock(c.requested_out)}</span></div>
                  </div>
                  <div className="sv-what" title={c.reason}>{c.reason}</div>
                  <div className="sv-actions">
                    {remarkInput("c" + c.id)}
                    {buttons(() => reviewFix(c, "rejected"), () => reviewFix(c, "approved"), "c" + c.id)}
                  </div>
                </div>
              ))}
            </div>
          )}
          <Section icon="pencil" title="Reviewed time corrections" count={corrections.length - fixPending.length}>
            <Table
              headers={["Intern", "Date", "Requested out", "Reason", "Status"]}
              rows={corrections.filter((c) => c.status !== "pending").map((c) => [
                <strong>{c.intern_name}</strong>,
                day(c.date),
                clock(c.requested_out),
                <span className="sv-reason" title={c.reason}>{c.reason}</span>,
                statusBadge(c.status),
              ])}
              empty="Nothing reviewed yet."
            />
          </Section>
        </>
      )}
    </>
  );
}

const svCss = `
.sv-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 18px; }
.ix-content .ix-card.sv-card { display: grid; grid-template-columns: 260px minmax(0, 1fr) minmax(320px, 440px); align-items: center; gap: 14px; padding: 12px 16px; }
.sv-who { display: flex; align-items: center; gap: 10px; min-width: 0; }
.sv-who > div { display: flex; flex-direction: column; min-width: 0; }
.sv-who strong { font-size: 13.5px; }
.sv-who span { font-size: 12px; color: #64748b; }
.sv-what { font-size: 13px; color: #334155; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sv-actions { display: flex; align-items: center; gap: 8px; }
.sv-actions .ix-input { flex: 1; min-width: 0; padding: 7px 10px; font-size: 12.5px; }
.sv-actions .sv-min { flex: 0 0 92px; }
.sv-actions .ix-b { padding: 7px 12px; font-size: 12.5px; }
.sv-reason { display: inline-block; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 1200px) { .ix-content .ix-card.sv-card { grid-template-columns: 1fr; } .sv-actions { flex-wrap: wrap; } }
`;