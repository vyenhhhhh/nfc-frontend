// components/NfcCards.jsx
// Coordinator page: review NFC card requests and see the request history.
// CardRequests (exported) is the admin's "Card Requests" page: approved cards to print in the printing app.
import { useState, useEffect, useRef } from "react";
import CardAlerts from "./CardAlerts.jsx";
import logo from "../assets/logo.png";          // CCIS logo (right side of the ID)
import csuLogo from "../assets/csu-logo.png";   // CSU seal (left side of the ID)
import campus from "../assets/campus.jpg";      // faded background of the ID
import { Spinner, PageHeader, Badge, Table, Empty, Msg, Avatar, Icon, photoUrl, liveRefresh, Inbox, OA_CSS, OaHistory, Drawer } from "./DashKit.jsx";
import { API } from "../config.js";
import { createHelperReader } from "../kioskReaders.js";


// where interns sign and claim their ID card (same text as the server notifications)
export const ID_OFFICE = "CCIS IT Staff office (3rd floor)";

const STATUS = {
  pending:  { label: "Pending",     type: "pending" },
  approved: { label: "Approved",    type: "onsite" },
  issued:   { label: "Card Issued", type: "approved" },
  rejected: { label: "Rejected",    type: "rejected" },
};

const friendly = (e) =>
  e instanceof SyntaxError || e instanceof TypeError
    ? "Couldn't reach the NFC card service. Check that the backend routes are set up."
    : e.message;

const fmtDate = (v) => {
  const d = new Date(v);
  return !v || isNaN(d) ? "—" : d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
};

/* ───────────────────────── Approvals → NFC Cards (OJT coordinator) ─────────────────────────
   Same layout as Online Attendance / Overtime: Waiting / Reviewed list on the left, the picked request on the right.
   The coordinator only approves or rejects; the admin prints and links the card. */
const NFC_STEP = (r) => r.status === "rejected" ? -1 : r.status === "issued" ? 4 : r.status === "approved" ? (r.printed_at ? 3 : 2) : 1;
const nfcBadge = (r, long) => r.status === "pending" ? <Badge label={long ? "Waiting for you" : "Waiting"} type="pending" />
  : r.status === "rejected" ? <Badge label="Rejected" type="rejected" />
  : r.status === "issued" ? <Badge label="Card issued" type="approved" />
  : <Badge label={r.printed_at ? "Printed · to claim" : "Approved · to print"} type="online" />;

export function NfcReview({ user, onRefresh, preOf }) {
  const [requests, setRequests] = useState(null);
  const [msg, setMsg] = useState(null);
  const [view, setView] = useState("waiting");
  const [sel, setSel] = useState(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [remarks, setRemarks] = useState({});
  const [busy, setBusy] = useState(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alerts, setAlerts] = useState(0);

  const load = async () => {
    try {
      const res = await fetch(`${API}/supervisor/nfc-requests`, { headers: { Accept: "application/json" } });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || "Could not load card requests.");
      setRequests(Array.isArray(d) ? d : []);
    } catch (e) { setRequests((x) => x || []); setMsg({ type: "error", text: friendly(e) }); }
  };
  useEffect(() => { load(); return liveRefresh(load); }, []);
  useEffect(() => {
    const f = () => fetch(`${API}/card-flags`, { headers: { Accept: "application/json" } })
      .then((r) => r.json()).then((d) => setAlerts((d?.flags || []).filter((x) => !x.resolved_at).length)).catch(() => {});
    f(); const iv = setInterval(f, 60000); return () => clearInterval(iv);
  }, []);

  if (!requests) return <Spinner />;
  const waiting = requests.filter((r) => r.status === "pending");
  const reviewed = requests.filter((r) => r.status !== "pending")
    .sort((a, b) => String(b.reviewed_at || b.updated_at || "").localeCompare(String(a.reviewed_at || a.updated_at || "")));
  const sq = q.trim().toLowerCase();
  const list = (view === "waiting" ? waiting : reviewed).filter((r) => !sq || `${r.intern_name} ${r.intern_email || ""}`.toLowerCase().includes(sq));
  const cur = list.find((r) => r.id === sel) || list[0] || null;
  const pick = (v) => { setView(v); setSel(null); setOpen(false); setQ(""); };

  const decide = async (r, action) => {
    setBusy(r.id + action); setMsg(null);
    try {
      const res = await fetch(`${API}/supervisor/nfc-requests/${r.id}/review`, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ status: action, remarks: remarks[r.id] || "", reviewer_id: user?.id }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || "Something went wrong.");
      setMsg({ type: "success", text: d.message || "Request updated." });
      setSel(null); setOpen(false);
      load(); onRefresh && onRefresh();
    } catch (e) { setMsg({ type: "error", text: friendly(e) }); }
    finally { setBusy(null); }
  };

  const steps = (r) => {
    const st = NFC_STEP(r);
    const L = ["Intern applied", "You approve", "Admin prints", "Card claimed"];
    return (
      <ol className="oa-steps">
        {L.map((t, i) => {
          const cls = st < 0 ? (i === 0 ? "done" : i === 1 ? "bad" : "") : i < st ? "done" : i === st ? "now" : "";
          return (
            <li key={t} className={cls}>
              <i>{cls === "done" ? <Icon name="check" size={11} /> : cls === "bad" ? <Icon name="x" size={11} /> : i + 1}</i>
              <span>{cls === "bad" ? "Rejected" : t}</span>
            </li>
          );
        })}
      </ol>
    );
  };

  return (
    <>
      <Msg msg={msg} />
      <div className={open && cur ? "oa oa-open" : "oa"}>
        <style>{OA_CSS}</style>
        <style>{NFCR_CSS}</style>
        <div className="oa-list">
          <div className="oa-switch" role="tablist" aria-label="Show">
            <button type="button" role="tab" aria-selected={view === "waiting"} className={view === "waiting" ? "on" : ""} onClick={() => pick("waiting")}>
              Waiting <span className={waiting.length ? "oa-n hot" : "oa-n"}>{waiting.length}</span>
            </button>
            <button type="button" role="tab" aria-selected={view === "reviewed"} className={view === "reviewed" ? "on" : ""} onClick={() => pick("reviewed")}>
              Reviewed <span className="oa-n">{reviewed.length}</span>
            </button>
          </div>
          {(view === "waiting" ? waiting : reviewed).length > 6 && (
            <div className="oa-search"><Icon name="search" size={14} />
              <input type="search" placeholder="Search intern" value={q} onChange={(e) => { setQ(e.target.value); setSel(null); }} aria-label="Search intern" /></div>
          )}
          <div className="oa-items" role="list">
            {list.length === 0 ? (
              <div className="oa-none">
                <span className="oa-none-ic"><Icon name="check" size={18} /></span>
                <b>{sq ? "No match" : view === "waiting" ? "All caught up" : "Nothing reviewed yet"}</b>
                <small>{sq ? "Try another name." : view === "waiting" ? "No card requests waiting for you." : "Requests you approve or reject show here."}</small>
              </div>
            ) : list.map((r) => (
              <button key={r.id} type="button" role="listitem" className={cur && cur.id === r.id ? "oa-item on" : "oa-item"}
                onClick={() => { setSel(r.id); setOpen(true); }}>
                <Avatar name={r.intern_name} photo={r.intern_photo} size={34} />
                <span className="oa-who"><b>{r.intern_name}</b><small>{r.type || "NFC card"} · {fmtDate(r.created_at)}</small></span>
                {view === "reviewed" && nfcBadge(r)}
              </button>
            ))}
          </div>
          <button type="button" className="nfcr-alerts" onClick={() => setAlertsOpen(true)}>
            <Icon name="warn" size={14} /> Card alerts {alerts > 0 && <span className="oa-n hot">{alerts}</span>}
          </button>
        </div>

        <div className="oa-detail">
          {!cur ? (
            <div className="oa-blank">
              <span className="oa-none-ic"><Icon name="card" size={20} /></span>
              <b>{view === "waiting" ? "No card requests waiting" : "Nothing to show yet"}</b>
              <small>{view === "waiting" && reviewed.length ? "Open Reviewed to see the requests already checked." : "When an intern applies for an NFC card, it shows here."}</small>
            </div>
          ) : (() => {
            const p = preOf ? preOf(cur) : null;
            return (
              <>
                <button type="button" className="oa-back" onClick={() => setOpen(false)}><Icon name="menu" size={14} /> Back to the list</button>
                <div className="oa-head">
                  <Avatar name={cur.intern_name} photo={cur.intern_photo} size={46} />
                  <div className="oa-hn"><b>{cur.intern_name}</b><small>{cur.intern_email || "NFC card request"}</small></div>
                  {nfcBadge(cur, true)}
                </div>
                <div className="oa-kv">
                  <div><small>Request</small><b>{cur.type || "NFC card"}</b></div>
                  <div><small>Applied</small><b>{fmtDate(cur.created_at)}</b></div>
                  <div><small>Pre-internship</small><b className={p ? (p.started ? "nfcr-ok" : "nfcr-not") : ""}>{p ? `${p.approved}/${p.total}${p.started ? " · started" : ""}` : "—"}</b></div>
                  <div><small>{view === "waiting" ? "Card on file" : "Reviewed"}</small><b>{view === "waiting" ? (cur.uid ? "Has a card" : "None yet") : fmtDate(cur.reviewed_at || cur.updated_at)}</b></div>
                </div>
                <div className="oa-tasks">
                  <span>Intern's note</span>
                  <p>{cur.notes || "—"}</p>
                </div>
                {p && !p.started && cur.status === "pending" && (
                  <div className="oa-done"><Icon name="warn" size={14} /><span>Pre-internship requirements are not complete yet ({p.approved}/{p.total}). The card can be printed, but the intern can claim it only when every requirement is approved.</span></div>
                )}
                {steps(cur)}
                <OaHistory name={cur.intern_name}
                  rows={requests.filter((x) => x.id !== cur.id && (x.user_id ? x.user_id === cur.user_id : x.intern_name === cur.intern_name))
                    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 10)
                    .map((x) => ({ id: x.id, when: fmtDate(x.created_at), text: x.type || "NFC card", badge: nfcBadge(x) }))}
                  onPick={(x) => { const w = waiting.some((y) => y.id === x.id); setView(w ? "waiting" : "reviewed"); setQ(""); setSel(x.id); }} />
                {cur.status === "pending" ? (
                  <div className="oa-act">
                    <input type="text" className="ix-input" placeholder="Remarks (optional)" value={remarks[cur.id] || ""}
                      onChange={(e) => setRemarks((x) => ({ ...x, [cur.id]: e.target.value }))} />
                    <button className="ix-b danger" onClick={() => decide(cur, "rejected")} disabled={!!busy}>{busy === cur.id + "rejected" ? "..." : "Reject"}</button>
                    <button className="ix-b ok" onClick={() => decide(cur, "approved")} disabled={!!busy}>{busy === cur.id + "approved" ? "..." : "Approve"}</button>
                  </div>
                ) : (
                  <div className={cur.status === "rejected" ? "oa-done bad" : cur.status === "issued" ? "oa-done ok" : "oa-done"}>
                    <Icon name={cur.status === "rejected" ? "x" : cur.status === "issued" ? "check" : "clock"} size={14} />
                    <span>{cur.status === "rejected" ? "Rejected." : cur.status === "issued" ? `Card issued${cur.uid ? "" : ""}. It is active.`
                      : cur.printed_at ? "Approved and printed. Waiting for the intern to claim it." : "Approved. Waiting for the admin to print it."}
                      {cur.remarks ? <> Remarks: <em>{cur.remarks}</em></> : null}
                      {cur.reviewer_name ? <small> · {cur.reviewer_name}</small> : null}</span>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
      {alertsOpen && (
        <Drawer inPage title="Card alerts" kicker="NFC cards" icon="warn" onClose={() => setAlertsOpen(false)}>
          <div className="nfcr-ca"><CardAlerts /></div>
        </Drawer>
      )}
    </>
  );
}

const NFCR_CSS = `
.nfcr-alerts { flex: none; display: flex; align-items: center; gap: 8px; margin: 6px; padding: 9px 12px; border: 1px dashed #f3c48b; border-radius: 10px;
  background: #fffaf2; font: inherit; font-size: 12.5px; font-weight: 700; color: #92400e; cursor: pointer; }
.nfcr-alerts:hover { background: #fff4e5; }
.nfcr-alerts .oa-n { margin-left: auto; }
.nfcr-ok { color: #15803d !important; } .nfcr-not { color: #b45309 !important; }
.nfcr-ca .ix-table-wrap, .nfcr-ca table { overflow-x: auto; max-width: 100%; }
.nfcr-ca .ix-card { margin: 0 !important; border: 0 !important; box-shadow: none !important; padding: 0 !important; }
`;

/* ───────────────────────── page ───────────────────────── */
export default function NfcCards({ user, interns, onRefresh, preOf }) {
  const [tab, setTab] = useState("requests");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchRequests = async () => {
    try {
      const res = await fetch(`${API}/supervisor/nfc-requests`, { headers: { Accept: "application/json" } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not load card requests.");
      setRequests(Array.isArray(data) ? data : []);
      setError(null);
    } catch (e) {
      setError(friendly(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
    return liveRefresh(fetchRequests);
  }, []);

  const open = requests.filter((r) => r.status === "pending" || r.status === "approved");
  const closed = requests.filter((r) => r.status === "issued" || r.status === "rejected");
  const pendingCount = requests.filter((r) => r.status === "pending").length;

  // open copied-card alerts (one-time card codes), shown as a count on the tab
  const [alerts, setAlerts] = useState(0);
  useEffect(() => {
    const load = () => fetch(`${API}/card-flags`, { headers: { Accept: "application/json" } })
      .then((r) => r.json()).then((d) => setAlerts((d?.flags || []).filter((f) => !f.resolved_at).length)).catch(() => {});
    load();
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
  }, []);

  return (
    <>
      <style>{nfcCss}</style>
      <PageHeader title="NFC Cards" sub="Review card requests and check the history. ID cards are printed by the admin." />
      <div className="ix-pills">
        <button className={tab === "requests" ? "ix-pill active" : "ix-pill"} onClick={() => setTab("requests")}>
          Card Requests {pendingCount > 0 && <span className="ix-pill-count">{pendingCount}</span>}
        </button>
        <button className={tab === "history" ? "ix-pill active" : "ix-pill"} onClick={() => setTab("history")}>
          History <span className="ix-pill-count">{closed.length}</span>
        </button>
        <button className={tab === "alerts" ? "ix-pill active" : "ix-pill"} onClick={() => setTab("alerts")}>
          Card Alerts {alerts > 0 && <span className="ix-pill-count">{alerts}</span>}
        </button>
      </div>

      {error && (
        <div className="ix-alert"><Icon name="warn" size={18} /> {error}</div>
      )}

      {tab === "requests" && (
        <Requests
          user={user} requests={open} loading={loading} error={error}
          refresh={fetchRequests} onRefresh={onRefresh} preOf={preOf}
        />
      )}
      {tab === "history" && <History requests={closed} loading={loading} />}
      {tab === "alerts" && <CardAlerts />}
    </>
  );
}

/* ───────────────────────── requests tab (pending + approved) ───────────────────────── */
function Requests({ user, requests, loading, error, refresh, onRefresh, preOf }) {
  const [remarks, setRemarks] = useState({});
  const [processing, setProcessing] = useState(null);
  const [msg, setMsg] = useState(null);

  // the coordinator approves or rejects; the admin prints the card and links it (Card Requests page)
  const review = async (r, action) => {
    const status = action === "reject" ? "rejected" : "approved";
    setProcessing(r.id + action); setMsg(null);
    try {
      const res = await fetch(`${API}/supervisor/nfc-requests/${r.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ status, remarks: remarks[r.id] || "", reviewer_id: user.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Something went wrong.");
      setMsg({ type: "success", text: data.message || "Request updated." });
      refresh();
      onRefresh && onRefresh();
    } catch (e) {
      setMsg({ type: "error", text: friendly(e) });
    } finally {
      setProcessing(null);
    }
  };

  const [q, setQ] = useState("");
  const [show, setShow] = useState("all");          // all | pending | approved | printed
  const sq = q.trim().toLowerCase();
  const stOf = (r) => (r.status === "approved" && r.printed_at ? "printed" : r.status === "approved" ? "approved" : "pending");
  const ST = { pending: { label: "Pending", type: "pending" }, approved: { label: "Approved · to print", type: "online" }, printed: { label: "Printed · to claim", type: "onsite" } };
  const shown = requests
    .filter((r) => show === "all" || stOf(r) === show)
    .filter((r) => `${r.intern_name} ${r.intern_email} ${r.type || ""}`.toLowerCase().includes(sq))
    .sort((a, b) => (stOf(a) === "pending") === (stOf(b) === "pending")
      ? String(a.created_at).localeCompare(String(b.created_at)) : stOf(a) === "pending" ? -1 : 1);

  if (loading) return <Spinner />;

  return (
    <>
      <Msg msg={msg} />
      <div className="ix-toolbar">
        <div className="ix-search">
          <Icon name="search" size={16} />
          <input type="text" placeholder="Search name or request..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="ix-select" value={show} onChange={(e) => setShow(e.target.value)} aria-label="Filter by status">
          <option value="all">All requests</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved · to print</option>
          <option value="printed">Printed · to claim</option>
        </select>
        <span className="ix-chip">{shown.length} requests</span>
      </div>
      <div className="ix-card flush nfc-req-table">
        <Table
          headers={["Intern", "Request", "Applied", "Pre-internship", "Status", "Remarks", ""]}
          rows={shown.map((r) => {
            const st = ST[stOf(r)];
            const p = preOf ? preOf(r) : null;
            const pending = stOf(r) === "pending";
            return [
              <div className="ix-actions">
                <Avatar name={r.intern_name} photo={r.intern_photo} size={30} />
                <span className="nfc-who"><strong>{r.intern_name}</strong><small>{r.intern_email}</small></span>
              </div>,
              <span className="nfc-reqcol"><span className="ix-chip">{r.type || "NFC card"}</span>
                {r.notes && <small title={r.notes}>“{r.notes}”</small>}</span>,
              fmtDate(r.created_at),
              p ? <span className={p.started ? "nfc-ok" : "nfc-not"}>{p.approved}/{p.total}{p.started ? " · started" : ""}</span> : <span className="ix-muted">—</span>,
              <Badge label={st.label} type={st.type} />,
              pending ? (
                <input type="text" className="ix-input nfc-rem" placeholder="Remarks (optional)" value={remarks[r.id] || ""}
                  onChange={(e) => setRemarks((x) => ({ ...x, [r.id]: e.target.value }))} />
              ) : <span className="os-remarks">{r.remarks || "—"}</span>,
              pending ? (
                <span className="nfc-acts">
                  <button className="ix-b danger sm" onClick={() => review(r, "reject")} disabled={!!processing}>
                    {processing === r.id + "reject" ? "..." : "Reject"}</button>
                  <button className="ix-b ok sm" onClick={() => review(r, "approve")} disabled={!!processing}>
                    {processing === r.id + "approve" ? "..." : "Approve"}</button>
                </span>
              ) : (
                <span className="nfc-next" title={r.printed_at
                  ? "The intern claims it at the office; the card becomes active when they pick it up."
                  : `The intern signs the ID card at the ${ID_OFFICE}; the admin prints it and links it when they claim it.`}>
                  <Icon name="clock" size={13} /> {r.printed_at ? "Waiting for claim" : "Waiting for print"}
                </span>
              ),
            ];
          })}
          empty={requests.length ? "No requests match." : "No card requests waiting. New applications will show up here."}
        />
      </div>
      <style>{`
        .nfc-who { display: flex; flex-direction: column; line-height: 1.25; min-width: 0; }
        .nfc-who small { font-size: 12px; color: #64748b; }
        .nfc-reqcol { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; max-width: 170px; }
        .nfc-reqcol small { font-size: 12px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px; }
        .nfc-rem { width: 100%; min-width: 120px; max-width: 220px; padding: 7px 10px !important; font-size: 13px !important; }
        .nfc-req-table { overflow-x: auto; }
        .nfc-req-table td:nth-child(6) { width: 22%; }
        .nfc-acts { display: inline-flex; gap: 6px; white-space: nowrap; }
        .nfc-next { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 600; color: #64748b; white-space: nowrap; }
        .nfc-ok { color: #15803d; font-weight: 700; } .nfc-not { color: #b45309; font-weight: 700; }
      `}</style>
    </>
  );
}

/* ───────────────────────── history tab (issued + rejected) ───────────────────────── */
function History({ requests, loading }) {
  const [q, setQ] = useState("");
  const [result, setResult] = useState("all");
  const sq = q.trim().toLowerCase();

  const shown = requests
    .filter((r) => result === "all" || r.status === result)
    .filter((r) => `${r.intern_name} ${r.intern_email} ${r.uid || ""}`.toLowerCase().includes(sq))
    .sort((a, b) => String(b.reviewed_at || b.updated_at).localeCompare(String(a.reviewed_at || a.updated_at)));

  if (loading) return <Spinner />;

  return (
    <>
      <div className="ix-toolbar">
        <div className="ix-search">
          <Icon name="search" size={16} />
          <input type="text" placeholder="Search name or card UID..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="ix-select" value={result} onChange={(e) => setResult(e.target.value)} aria-label="Filter by result">
          <option value="all">All results</option>
          <option value="issued">Card issued</option>
          <option value="rejected">Rejected</option>
        </select>
        <span className="ix-chip">{shown.length} records</span>
      </div>
      <div className="ix-card flush">
        <Table
          headers={["Intern", "Request", "Result", "Card UID", "Remarks", "Reviewed by", "Reviewed"]}
          rows={shown.map((r) => {
            const st = STATUS[r.status] || STATUS.pending;
            return [
              <div className="ix-actions">
                <Avatar name={r.intern_name} photo={r.intern_photo} size={30} />
                <strong>{r.intern_name}</strong>
              </div>,
              <span className="ix-chip">{r.type || "NFC card"}</span>,
              <Badge label={st.label} type={st.type} />,
              r.uid ? <span className="ix-mono">{r.uid}</span> : <span className="ix-muted">—</span>,
              <span className="os-remarks">{r.remarks || "—"}</span>,
              r.reviewer_name || "—",
              fmtDate(r.reviewed_at || r.updated_at),
            ];
          })}
          empty="No closed requests yet."
        />
      </div>
    </>
  );
}

/* ───────────────────────── the card itself ─────────────────────────
   CR80 size (54mm x 85.6mm, portrait). The card UID is never printed: anyone who saw it could tap for this intern. */
const CARD_KEY = "mytrack.idcard";
const defaultValid = () => {                       // end of the school year: June 30
  const d = new Date(); const y = d.getMonth() >= 5 ? d.getFullYear() + 1 : d.getFullYear();
  return `${y}-06-30`;
};
export const loadCardSettings = () => {
  try { return { valid: defaultValid(), coordinator: "", signature: "", contact: "", ...JSON.parse(localStorage.getItem(CARD_KEY) || "{}") }; }
  catch { return { valid: defaultValid(), coordinator: "", signature: "", contact: "" }; }
};
const longDate = (v) => {
  const d = new Date(v + (String(v).length === 10 ? "T00:00:00" : ""));
  return !v || isNaN(d) ? "—" : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};
const birthDate = (v) => {
  const m = String(v || "").slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[2]} - ${m[3]} - ${m[1]}` : "—";
};
// "Vivien Pujeda Hermoso" -> "Vivien P. Hermoso"
const cardName = (u) => {
  if (u.first_name && u.last_name) {
    const mi = (u.middle_name || "").trim().charAt(0);
    const ext = (u.name_extension || "").trim();
    return `${u.first_name.trim()} ${mi ? mi.toUpperCase() + ". " : ""}${u.last_name.trim()}${ext ? " " + ext : ""}`;
  }
  const p = String(u.name || "").trim().split(/\s+/);
  return p.length > 2 ? `${p.slice(0, -2).join(" ")} ${p[p.length - 2].charAt(0)}. ${p[p.length - 1]}` : u.name || "";
};
// "BSIT - 4" -> { course: "BSIT", year: "4th year" }
const courseOf = (program) => {
  const m = String(program || "").match(/^([A-Za-z]+)\s*-?\s*(\d)?/);
  const n = m?.[2] ? Number(m[2]) : null;
  const sfx = n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
  return { course: m?.[1]?.toUpperCase() || "—", year: n ? `${n}${sfx} year` : "—" };
};

export function CardFace({ u, settings = {} }) {
  const src = photoUrl(u.photo);
  const name = cardName(u);
  const { course, year } = courseOf(u.program);
  return (
    <div className="idc idc-p">
      <img src={campus} alt="" className="idc-bg" />
      <svg className="idc-curve" viewBox="0 0 540 400" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0H540V300Q270 400 0 300Z" fill="#e8582a" /></svg>
      <span className="idc-tap">TAP TO LOG ATTENDANCE</span>
      <div className="idc-logos">
        <img src={csuLogo} alt="Caraga State University" />
        <img src={logo} alt="CSU CCIS" className="idc-ccis" />
      </div>
      <div className="idc-uni">Caraga State University · CCIS</div>
      <div className="idc-photo">
        {src ? <img src={src} alt="" /> : <b>{u.name?.charAt(0).toUpperCase() || "?"}</b>}
      </div>

      <div className="idc-main">
        <span className="idc-role">STUDENT INTERN</span>
        <strong className={`idc-name ${name.length > 28 ? "n4" : name.length > 25 ? "n3" : name.length > 20 ? "n2" : name.length > 16 ? "n1" : ""}`}>{name}</strong>
        <span className="idc-sub">{course} · {year} · Student ID: {u.student_id || "—"}</span>
        <hr className="idc-line" />
        <div className="idc-fact"><b>OJT placement</b><span className={(u.placement || "").length > 60 ? "pl3" : (u.placement || "").length > 34 ? "pl2" : ""}>{u.placement || "—"}</span></div>
        <div className="idc-fact"><b>Valid until</b><span>{longDate(settings.valid)}</span></div>
      </div>

      <div className="idc-signbox">
        <i />
        <small>Signature Intern</small>
      </div>
    </div>
  );
}

/* Back of the ID card: card rules, emergency contact, where to return a found card, coordinator signature */
export const CARD_RULES = [
  "This card belongs to CSU CCIS and cannot be transferred.",
  "Tap only your own card.",
  "Bring it every OJT day.",
  "Report a lost or damaged card to your OJT Coordinator right away.",
];
export function CardBack({ u, settings = {} }) {
  return (
    <div className="idc idc-p idc-back">
      <div className="idb-bar" />
      <div className="idb-body">
        <h4>CARD RULES</h4>
        <ol>{CARD_RULES.map((r, i) => <li key={r}><span>{i + 1}.</span>{r}</li>)}</ol>

        <div className="idb-emg">
          <h5>IN CASE OF EMERGENCY</h5>
          <p>Name: {u.emergency_contact_name || "—"}{u.emergency_contact_relation ? ` (${u.emergency_contact_relation})` : ""}</p>
          <p>Contact no: {u.emergency_contact_number || "—"}</p>
        </div>

        <div className="idb-found">
          <h5>IF FOUND, PLEASE RETURN TO</h5>
          <p>CCIS Technical Room (3<sup>rd</sup> floor)</p>
          <p>College of Computing and Information Sciences</p>
          <p>Caraga State University - Main Campus</p>
          <p>KM 7, Ampayon, Butuan City 8600</p>
          {settings.contact && <p className="idb-contact">{settings.contact}</p>}
        </div>
      </div>

      <div className="idb-coord">
        {settings.signature ? <img src={settings.signature} alt="" /> : <span className="idb-nosig" />}
        <i />
        <b>{settings.coordinator || "Jhoanna Victoria S. Pitao, MSc"}</b>
        <small>OJT Coordinator</small>
      </div>
    </div>
  );
}

/* Front and back of the card, scaled to whatever room the panel has (any screen size): measured, then scaled as one piece */
const FAN_W = 470, FAN_H = 350;          // natural size of the pair (px)
function CardFan({ u, settings }) {
  const box = useRef(null);
  const [k, setK] = useState(0.8);
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const fit = () => {
      const w = el.clientWidth - 28, h = el.clientHeight - 28;
      if (w > 0 && h > 0) setK(Math.max(0.3, Math.min(1.7, w / FAN_W, h / FAN_H)));
    };
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    ro && ro.observe(el);
    window.addEventListener("resize", fit);
    return () => { ro && ro.disconnect(); window.removeEventListener("resize", fit); };
  }, []);
  return (
    <div className="idq-fan" ref={box} title="Front and back of the card">
      <div className="idq-fit" style={{ width: FAN_W * k, height: FAN_H * k }}>
        <div className="idq-pair" style={{ width: FAN_W, height: FAN_H, transform: `scale(${k})` }}>
          <div className="idq-fc front"><CardFace u={u} settings={settings} /></div>
          <div className="idq-fc back"><CardBack u={u} settings={settings} /></div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── card requests (admin) ─────────────────────────
   ID cards are printed outside MYTRACK, in the card printer's own app. Here the admin:
   • sees the interns whose NFC card request was approved,
   • downloads their details (CSV) and photos for the printing app,
   • marks the cards as printed (the intern and the coordinator are notified),
   • can preview a card in the CSU design.
   requests = /supervisor/nfc-requests rows; interns = admin user rows (for student ID, course, birthday...). */
// To print → (printed) To link → (UID saved, can be done in advance) Ready to claim → (intern picks it up) Released
const STEP_SUB = { toprint: "Download and print", tolink: "Tap the new card", toclaim: "Intern picks it up", released: "Card is active" };
const STAGES = [
  { key: "toprint",  label: "To print" },
  { key: "tolink",   label: "To link" },
  { key: "toclaim",  label: "Ready to claim" },
  { key: "released", label: "Released" },
];
const STAGE_BADGE = {
  toprint: ["To print", "pending"], tolink: ["Printed", "onsite"], toclaim: ["Ready to claim", "onsite"], released: ["Released", "approved"],
};

const csvCell = (v) => `"${String(v === "—" ? "" : v ?? "").replace(/"/g, '""')}"`;   // blanks stay blank in the sheet
const fileSafe = (v) => String(v || "").trim().replace(/[^\w.-]+/g, "_").slice(0, 60) || "intern";
const saveBlob = (blob, name) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};

export function CardRequests({ requests, interns, onChanged }) {
  const [stage, setStage] = useState("toprint");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState([]);
  const [preview, setPreview] = useState(null);       // user id whose card is shown
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [uids, setUids] = useState({});                 // request id -> typed / scanned UID
  const [scanningId, setScanningId] = useState(null);
  const buffer = useRef("");
  // valid date, coordinator name, signature and office contact (preview + CSV).
  // Saved on the server, so every computer (and your partner's laptop) shows the same card;
  // this browser keeps a copy so the preview shows right away.
  const [settings, setSettings] = useState(loadCardSettings);
  const [saveState, setSaveState] = useState("");   // "" | saving | saved | error
  const saveTimer = useRef(null);
  useEffect(() => {
    fetch(`${API}/admin/settings/id-card`, { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.settings) return;
        setSettings((x) => {
          const n = { ...x, ...Object.fromEntries(Object.entries(d.settings).filter(([, v]) => v !== null && v !== undefined)) };
          if (!n.valid) n.valid = x.valid;
          try { localStorage.setItem(CARD_KEY, JSON.stringify(n)); } catch { /* ignore */ }
          return n;
        });
      })
      .catch(() => {});
    return () => clearTimeout(saveTimer.current);
  }, []);
  const saveToServer = (n) => {
    clearTimeout(saveTimer.current);
    setSaveState("saving");
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API}/admin/settings/id-card`, {
          method: "PUT", headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ valid: n.valid || null, coordinator: n.coordinator || "", contact: n.contact || "", signature: n.signature || "" }),
        });
        setSaveState(res.ok ? "saved" : "error");
      } catch { setSaveState("error"); }
    }, 700);
  };
  const setS = (k, v) => setSettings((x) => {
    const n = { ...x, [k]: v };
    try { localStorage.setItem(CARD_KEY, JSON.stringify(n)); } catch { /* private window: keep it for this visit only */ }
    saveToServer(n);
    return n;
  });
  const [sigMsg, setSigMsg] = useState("");
  const pickSignature = (e) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/") || f.size > 600 * 1024) { setSigMsg("Use a PNG or JPG under 600 KB."); return; }
    const r = new FileReader();
    r.onload = () => { setSigMsg(""); setS("signature", r.result); };
    r.readAsDataURL(f);
  };

  // the NFC reader "types" the card UID and presses Enter
  useEffect(() => {
    if (scanningId === null) return;
    const onKey = (e) => {
      if (e.key === "Escape") { setScanningId(null); return; }
      if (e.key === "Enter") {
        e.preventDefault();
        const uid = buffer.current.trim(); buffer.current = "";
        if (uid.length >= 4) { setUids((u) => ({ ...u, [scanningId]: uid })); setScanningId(null); }
      } else if (e.key.length === 1) buffer.current += e.key;
    };
    window.addEventListener("keydown", onKey);
    // ACR122U with the helper program: the card is not typed, the helper sends it (the same way the kiosk reads it)
    let helper = null;
    try {
      helper = createHelperReader({
        onCard: ({ uid }) => {
          const v = String(uid || "").trim().toUpperCase();
          if (v.length >= 4) { setUids((u) => ({ ...u, [scanningId]: v })); setScanningId(null); }
        },
        onStatus: () => {},
      });
      helper.start();
    } catch { /* no helper: the typing reader still works */ }
    return () => { window.removeEventListener("keydown", onKey); try { helper?.stop(); } catch { /* ignore */ } };
  }, [scanningId]);

  // one request: link = save the card UID (can be done before the intern comes; the card isn't active yet),
  // unlink = remove a wrong UID, claim = the intern picked it up (the card becomes active → Released)
  const act = async (r, what) => {
    const uid = (uids[r.id] || "").trim();
    if (what === "link" && uid.length < 4) { setMsg({ type: "error", text: "Scan the card or type its UID first." }); return; }
    setBusy(what + r.id); setMsg(null);
    try {
      const res = await fetch(`${API}/admin/nfc-requests/${r.id}/${what === "claim" ? "claim" : "link"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(what === "claim" ? {} : { uid: what === "link" ? uid : "" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Couldn't update the card.");
      setMsg({ type: "success", text: data?.message || "Updated." });
      if (what === "link") setUids((u) => { const n = { ...u }; delete n[r.id]; return n; });
      onChanged && onChanged();
    } catch (e) {
      setMsg({ type: "error", text: e instanceof TypeError ? "Couldn't reach the server." : e.message });
    } finally { setBusy(null); }
  };

  // newest request of each intern
  const latest = {};
  [...requests].sort((a, b) => b.id - a.id).forEach((r) => { if (!latest[r.user_id]) latest[r.user_id] = r; });
  const byId = Object.fromEntries(interns.map((u) => [String(u.id), u]));

  const rows = [];
  Object.values(latest).forEach((r) => {
    if (!["approved", "issued"].includes(r.status)) return;
    const u = byId[String(r.user_id)] || { id: r.user_id, name: r.intern_name, email: r.intern_email, photo: r.intern_photo };
    // the newest request decides (a replacement card goes through the same steps even if an old card is linked)
    const st = r.status === "issued" ? "released" : !r.printed_at ? "toprint" : r.uid ? "toclaim" : "tolink";
    rows.push({ u, r, stage: st });
  });
  // interns whose card was linked without a request still count as released
  interns.forEach((u) => { if (u.nfc_uid && !latest[u.id]) rows.push({ u, r: null, stage: "released" }); });
  rows.sort((a, b) => String(b.r?.reviewed_at || b.r?.updated_at || "").localeCompare(String(a.r?.reviewed_at || a.r?.updated_at || "")));

  const count = (k) => rows.filter((x) => x.stage === k).length;
  const sq = q.trim().toLowerCase();
  const shown = rows.filter((x) => x.stage === stage)
    .filter((x) => `${x.u.name} ${x.u.email} ${x.u.student_id || ""} ${x.u.program || ""} ${x.u.placement || ""}`.toLowerCase().includes(sq));
  const shownIds = shown.map((x) => x.u.id);
  const sel = selected.filter((id) => shownIds.includes(id));
  const allOn = shown.length > 0 && shown.every((x) => sel.includes(x.u.id));
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = () => setSelected((s) => (allOn ? s.filter((id) => !shownIds.includes(id)) : [...new Set([...s, ...shownIds])]));
  const pick = sel.length ? shown.filter((x) => sel.includes(x.u.id)) : shown;   // nothing ticked = everything in this tab
  const changeStage = (k) => { setStage(k); setSelected([]); setMsg(null); };

  const photoName = (u, ext = "jpg") => `${fileSafe(u.student_id || u.name)}.${ext}`;

  const downloadCsv = () => {
    const head = ["Student ID", "Name on card", "Last name", "First name", "Middle name", "Course", "Year level", "Birthday",
      "OJT placement", "Email", "Emergency contact", "Emergency number", "Valid until", "Photo file", "Status", "Approved on", "Printed on"];
    const lines = pick.map(({ u, r, stage: st }) => {
      const { course, year } = courseOf(u.program);
      return [u.student_id, cardName(u), u.last_name, u.first_name, u.middle_name, course, year, birthDate(u.date_of_birth),
        u.placement, u.email, u.emergency_contact_name, u.emergency_contact_number, longDate(settings.valid),
        u.photo ? photoName(u) : "", STAGE_BADGE[st][0], r ? fmtDate(r.reviewed_at || r.updated_at) : "", r?.printed_at ? fmtDate(r.printed_at) : ""]
        .map(csvCell).join(",");
    });
    // the BOM makes Excel read the names (ñ, é...) correctly
    saveBlob(new Blob(["﻿" + [head.map(csvCell).join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" }),
      `id-cards-${stage}-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const downloadPhotos = async () => {
    const withPhoto = pick.filter((x) => x.u.photo);
    if (!withPhoto.length) { setMsg({ type: "error", text: "None of these interns has a profile photo yet." }); return; }
    setBusy("photos"); setMsg(null);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      let missed = 0;
      await Promise.all(withPhoto.map(async ({ u }) => {
        try {
          const res = await fetch(photoUrl(u.photo));
          if (!res.ok) throw new Error();
          const blob = await res.blob();
          const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
          zip.file(photoName(u, ext), blob);
        } catch { missed += 1; }
      }));
      saveBlob(await zip.generateAsync({ type: "blob" }), `id-card-photos-${new Date().toISOString().slice(0, 10)}.zip`);
      const noPhoto = pick.length - withPhoto.length;
      setMsg(missed || noPhoto
        ? { type: "error", text: `Downloaded ${withPhoto.length - missed} photo(s).${missed ? ` ${missed} couldn't be fetched.` : ""}${noPhoto ? ` ${noPhoto} intern(s) have no photo yet.` : ""}` }
        : { type: "success", text: `Downloaded ${withPhoto.length} photo(s), named by Student ID.` });
    } catch {
      setMsg({ type: "error", text: "Couldn't make the photo download. Check that jszip is installed (npm install jszip)." });
    } finally { setBusy(null); }
  };

  const mark = async (printed, only) => {
    const ids = (only || pick).map((x) => x.r?.id).filter(Boolean);
    if (!ids.length) return;
    setBusy(printed ? "mark" : "undo"); setMsg(null);
    try {
      const res = await fetch(`${API}/admin/nfc-requests/printed`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ ids, printed }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Couldn't update the cards.");
      setMsg({ type: "success", text: data?.message || "Updated." });
      setSelected([]);
      onChanged && onChanged();
    } catch (e) {
      setMsg({ type: "error", text: e instanceof TypeError ? "Couldn't reach the server." : e.message });
    } finally { setBusy(null); }
  };

  // the intern shown on the right: the one clicked, or the first one in this tab
  const pv = shown.find((x) => String(x.u.id) === String(preview)) || null;     // nothing is shown until an intern is clicked
  const [showDetail, setShowDetail] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const what = sel.length ? `${sel.length} selected` : `all ${shown.length}`;

  return (
    <>
      <style>{nfcCss}</style>
      {/* stages as simple tabs (the count shows what needs doing), then search and actions in one row */}
      <div className="idq-tabs" role="tablist" aria-label="Card stages">
        {STAGES.map((t) => {
          const n = count(t.key);
          return (
            <button key={t.key} type="button" role="tab" aria-selected={stage === t.key} title={STEP_SUB[t.key]}
              className={stage === t.key ? "idq-tab on" : "idq-tab"} onClick={() => changeStage(t.key)}>
              {t.label}<span className={n && t.key !== "released" ? "idq-n hot" : "idq-n"}>{n}</span>
            </button>
          );
        })}
      </div>

      <div className="ix-toolbar idq-toolbar">
        <div className="ix-search">
          <Icon name="search" size={16} />
          <input type="text" placeholder="Search name, ID, course or placement..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="idq-actions">
          <button className="ix-b ghost" onClick={downloadCsv} disabled={!shown.length} title={`Download ${what} as a CSV for Excel or the printing app`}>
            <Icon name="download" size={16} /> List (CSV)
          </button>
          <button className="ix-b ghost" onClick={downloadPhotos} disabled={!shown.length || !!busy} title={`Download ${what} photos`}>
            <Icon name="download" size={16} /> {busy === "photos" ? "Preparing..." : "Photos"}
          </button>
          {stage === "toprint" && (
            <button className="ix-b primary" onClick={() => mark(true)} disabled={!shown.length || !!busy}>
              <Icon name="check" size={16} /> {busy === "mark" ? "Saving..." : `Mark as printed (${sel.length || shown.length})`}
            </button>
          )}
          {stage === "tolink" && (
            <button className="ix-b ghost" onClick={() => mark(false)} disabled={!shown.length || !!busy}>
              {busy === "undo" ? "Saving..." : `Back to To print (${sel.length || shown.length})`}
            </button>
          )}
        </div>
      </div>
      <Msg msg={msg} />

      {/* list on the left, the selected intern's card on the right (phones: one at a time) */}
      {shown.length === 0 ? (
        <div className="ix-card"><Empty icon="card"
          title={q ? "No intern matches your search." : stage === "toprint" ? "No cards to print" : stage === "tolink" ? "No printed cards to link" : stage === "toclaim" ? "No cards waiting to be claimed" : "No released cards yet"}
          sub={stage === "toprint" && !q ? "Interns appear here once the OJT coordinator approves their NFC card request." : undefined} /></div>
      ) : (
        <div className={showDetail && pv ? "mon show-detail" : "mon"}>
          <div className="mon-split ibx-split idq-split">
            <div className="mon-list" role="list">
              <label className="idq-all"><input type="checkbox" checked={allOn} onChange={toggleAll} /> Select all ({shown.length})</label>
              {shown.map((x) => {
                const { u, r, stage: st } = x;
                const [bl, bt] = STAGE_BADGE[st];
                const on = sel.includes(u.id);
                return (
                  <div key={u.id} role="listitem" className={pv && pv.u.id === u.id ? "mon-item idq-row on" : on ? "mon-item idq-row ck" : "mon-item idq-row"}>
                    <input type="checkbox" checked={on} onChange={() => toggle(u.id)} aria-label={`Select ${u.name}`} />
                    <button type="button" className="idq-open" onClick={() => { setPreview(u.id); setShowDetail(true); }}>
                      <Avatar name={u.name} photo={u.photo} size={32} />
                      <span className="mon-who">
                        <b>{u.name}</b>
                        <small>{[u.student_id, courseOf(u.program).course].filter((v) => v && v !== "—").join(" · ") || u.email}</small>
                      </span>
                      <span className="mon-right">
                        <Badge label={bl} type={bt} />
                        <small>{st !== "released" && r?.pre_missing > 0 ? <span className="nfc-not">Pre {r.pre_total - r.pre_missing}/{r.pre_total}</span>
                          : fmtDate(st === "toprint" ? r?.reviewed_at || r?.updated_at : r?.printed_at || r?.updated_at)}</small>
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mon-detail">
              <button type="button" className="mon-back" onClick={() => setShowDetail(false)}><Icon name="menu" size={14} /> Back to the list</button>
              {!pv && (
                <div className="idq-none">
                  <Icon name="card" size={30} />
                  <b>Select an intern</b>
                  <span>Click a name in the list, or search for one, to see the ID card preview.</span>
                </div>
              )}
              {pv && (() => {
                const { u, r, stage: st } = pv;
                const { course, year } = courseOf(u.program);
                const [bl, bt] = STAGE_BADGE[st];
                return (
                  <div className="ibx-d idq-two" key={u.id}>
                    <div className="idq-rail">
                      <Avatar name={u.name} photo={u.photo} size={64} />
                      <div className="idq-who"><b>{u.name}</b><small>{u.email}{u.photo ? "" : " · no photo yet"}</small></div>
                      <span className="idq-st"><Badge label={bl} type={bt} /></span>
                      <dl className="idq-dl">
                        <dt>Student ID</dt><dd>{u.student_id || "—"}</dd>
                        <dt>Course</dt><dd>{course}{year !== "—" ? ` · ${year}` : ""}</dd>
                        <dt>Placement</dt><dd>{u.placement || "—"}</dd>
                        <dt>Birthday</dt><dd>{birthDate(u.date_of_birth)}</dd>
                        <dt>Approved</dt><dd>{r ? fmtDate(r.reviewed_at || r.updated_at) : "—"}</dd>
                        <dt>Printed</dt><dd>{r?.printed_at ? fmtDate(r.printed_at) : "—"}</dd>
                      </dl>
                    </div>

                    <div className="idq-main">
                      {st !== "released" && r?.pre_missing > 0 && (
                        <div className="nfc-wait"><Icon name="warn" size={16} />
                          <span>Pre-internship {r.pre_total - r.pre_missing}/{r.pre_total}: the card can be printed and linked now, but it can only be claimed once every requirement is approved.</span></div>
                      )}
                      <CardFan u={u} settings={settings} />
                    {/* what to do next for this card */}
                    {st === "toprint" && r && (
                      <div className="ibx-act">
                        <span className="idq-act-text">Printed this card after the intern signed?</span>
                        <button className="ix-b primary" onClick={() => mark(true, [pv])} disabled={!!busy}>
                          <Icon name="check" size={15} /> {busy === "mark" ? "Saving..." : "Mark as printed"}</button>
                      </div>
                    )}
                    {st === "tolink" && r && (
                      <div className="ibx-act">
                        <input type="text" className={scanningId === r.id ? "ix-input scanning" : "ix-input"}
                          placeholder="Scan the card or type its UID" aria-label={`Card UID for ${u.name}`}
                          value={scanningId === r.id ? "Tap the card on the reader..." : uids[r.id] || ""} readOnly={scanningId === r.id}
                          onChange={(e) => setUids((x) => ({ ...x, [r.id]: e.target.value }))} />
                        <button type="button" className="ix-b ghost" onClick={(e) => { e.currentTarget.blur(); buffer.current = ""; setScanningId(scanningId === r.id ? null : r.id); }}>
                          <Icon name={scanningId === r.id ? "x" : "nfc"} size={15} /> {scanningId === r.id ? "Cancel" : "Scan"}</button>
                        <button type="button" className="ix-b primary" onClick={() => act(r, "link")} disabled={!!busy || (uids[r.id] || "").trim().length < 4}>
                          {busy === "link" + r.id ? "..." : "Link card"}</button>
                        <button type="button" className="ix-b ghost sm" onClick={() => mark(false, [pv])} disabled={!!busy}>Back to To print</button>
                      </div>
                    )}
                    {st === "toclaim" && r && (
                      <div className="ibx-act">
                        <span className="idq-uid"><Icon name="nfc" size={13} /> {r.uid}</span>
                        <button type="button" className="ix-b ghost" onClick={() => act(r, "unlink")} disabled={!!busy}>
                          {busy === "unlink" + r.id ? "..." : "Change card"}</button>
                        <span style={{ flex: 1 }} />
                        <button type="button" className="ix-b primary" onClick={() => act(r, "claim")} disabled={!!busy || r.pre_missing > 0}
                          title={r.pre_missing > 0 ? "Not all pre-internship requirements are approved yet" : "The intern picked up the card"}>
                          <Icon name="check" size={15} /> {busy === "claim" + r.id ? "..." : "Claimed"}</button>
                      </div>
                    )}
                    {st === "released" && <div className="ibx-note"><Icon name="check" size={13} /> The card is active. {u.nfc_uid ? `UID ${u.nfc_uid}` : ""}</div>}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ───────────────────────── styles ───────────────────────── */
/* the ID card (front and back): also used on the intern's NFC Card page */
export const idCardCss = `
  /* ── ID card: CR80, portrait 54mm x 85.6mm (lanyard badge) ── */
  .idc { position: relative; width: 54mm; height: 85.6mm; border-radius: 3mm; overflow: hidden; flex-shrink: 0; box-sizing: border-box;
    background: #fff; color: #1b1f2a; font-family: 'Poppins', 'Inter', 'Segoe UI', Arial, sans-serif;
    box-shadow: 0 12px 30px rgba(15,23,42,0.16); border: 0.2mm solid #eadfd8;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; break-inside: avoid; }
  .idc *, .idc *::before, .idc *::after { box-sizing: border-box; }
  .idc img { max-width: none; }
  .idc-bg { position: absolute; left: 0; right: 0; bottom: 0; width: 100%; height: 48%; object-fit: cover; object-position: center bottom; opacity: .13; filter: grayscale(.3); pointer-events: none;
    -webkit-mask-image: linear-gradient(180deg, transparent, #000 45%); mask-image: linear-gradient(180deg, transparent, #000 45%); }
  .idc-curve { position: absolute; left: 0; top: 0; width: 100%; height: 34mm; display: block; }
  .idc .idc-tap { position: absolute; left: 1.6mm; top: 1.2mm; font-size: 1.25mm !important; line-height: 1.6mm !important; font-weight: 700 !important; letter-spacing: .1mm !important; color: rgba(110,30,5,.35); white-space: nowrap !important; }
  .idc .idc-logos { position: absolute; left: 0; right: 0; top: 4mm; display: flex; justify-content: center; align-items: center; gap: 2.2mm; }
  .idc .idc-logos img { height: 8mm !important; width: auto !important; padding: 0 !important; border: 0 !important; border-radius: 0 !important; background: none !important; box-shadow: none !important; object-fit: contain; }
  .idc .idc-logos img.idc-ccis { mix-blend-mode: multiply; }
  .idc .idc-uni { position: absolute; left: 0; right: 0; top: 12.6mm; text-align: center; color: #fff; font-size: 2.2mm !important; line-height: 3mm !important; font-weight: 500 !important; white-space: nowrap !important; margin: 0; }
  .idc .idc-photo { position: absolute; left: 50%; top: 16.6mm; width: 22mm; height: 22mm; margin-left: -11mm; border-radius: 50%; overflow: hidden;
    border: .9mm solid #fff; background: #ffe6d9; box-shadow: 0 .6mm 2mm rgba(0,0,0,.18); display: flex; align-items: center; justify-content: center; }
  .idc .idc-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .idc .idc-photo b { font-size: 9mm !important; color: #e8582a; }

  .idc .idc-main { position: absolute; left: 4mm; right: 4mm; top: 41.2mm; display: flex; flex-direction: column; align-items: center; text-align: center; }
  .idc .idc-main > * { margin: 0; padding: 0; }
  .idc .idc-role { display: inline-block; padding: .9mm 4mm; border-radius: 99px; background: #e8582a; color: #fff; font-size: 2.1mm !important; line-height: 2.8mm !important; font-weight: 700 !important; letter-spacing: .25mm !important; }
  /* the name is never cut: fixed line heights (in mm, so browser zoom can't squeeze it) and a smaller size for long names */
  .idc .idc-name { display: block; width: 100%; margin-top: 1.6mm !important; font-size: 4.6mm !important; line-height: 5.8mm !important; font-weight: 700 !important; color: #1b1f2a; letter-spacing: -.1mm !important; white-space: nowrap !important; overflow: visible; }
  .idc .idc-name.n1 { font-size: 3.9mm !important; line-height: 5.4mm !important; }
  .idc .idc-name.n2 { font-size: 3.3mm !important; line-height: 5mm !important; }
  .idc .idc-name.n3 { font-size: 2.8mm !important; line-height: 4.6mm !important; }
  .idc .idc-name.n4 { font-size: 3mm !important; line-height: 3.6mm !important; white-space: normal !important; margin-top: 1.2mm !important; }
  .idc .idc-sub { display: block; width: 100%; margin-top: .3mm !important; font-size: 1.85mm !important; line-height: 2.8mm !important; color: #6b7280; white-space: nowrap !important; }
  .idc .idc-line { width: 100%; height: 0; border: 0; border-top: .2mm solid #e5e7eb; margin: 1.8mm 0 0 !important; }
  .idc .idc-fact { width: 100%; margin-top: 1.6mm !important; display: flex; flex-direction: column; align-items: center; }
  .idc .idc-fact b { font-size: 2.1mm !important; line-height: 2.9mm !important; font-weight: 700 !important; color: #1b1f2a; }
  .idc .idc-fact span { font-size: 2.15mm !important; line-height: 2.9mm !important; color: #1b1f2a; max-height: 5.8mm; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .idc .idc-fact span.pl2 { font-size: 1.9mm !important; line-height: 2.5mm !important; max-height: 5mm; }
  .idc .idc-fact span.pl3 { font-size: 1.7mm !important; line-height: 2.2mm !important; max-height: 6.6mm; -webkit-line-clamp: 3; }
  .idc .idc-fact + .idc-fact { margin-top: 1.3mm !important; }

  .idc .idc-signbox { position: absolute; left: 0; right: 0; bottom: 1.8mm; display: flex; flex-direction: column; align-items: center; }
  .idc .idc-signbox i { display: block; width: 24mm; height: 0; border-top: .25mm solid #1b1f2a; }
  .idc .idc-signbox small { margin-top: .4mm; font-size: 1.7mm !important; line-height: 2.4mm !important; color: #6b7280; }

  /* ── back of the card ── */
  .idc .idb-bar { position: absolute; left: 0; right: 0; top: 0; height: 1.8mm; background: #e8582a; }
  .idc .idb-body { position: absolute; left: 3.4mm; right: 3.4mm; top: 5mm; }
  .idc .idb-body h4 { margin: 0 0 1mm !important; padding: 0 !important; font-size: 2.9mm !important; line-height: 3.8mm !important; font-weight: 800 !important; color: #e8582a; }
  .idc .idb-body h5 { margin: 0 0 .8mm !important; padding: 0 !important; font-size: 1.95mm !important; line-height: 2.6mm !important; font-weight: 700 !important; color: #e8582a; letter-spacing: .05mm !important; }
  .idc .idb-body ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .7mm; }
  .idc .idb-body li { margin: 0; padding: 0; font-size: 2mm !important; line-height: 2.8mm !important; color: #1b1f2a; }
  .idc .idb-body li span { margin-right: .6mm; }
  .idc .idb-emg { margin-top: 3.4mm; padding: 1.8mm 2mm; border-radius: 2mm; background: #fff3ee; }
  .idc .idb-emg p { margin: 0 !important; font-size: 2mm !important; line-height: 2.8mm !important; color: #1b1f2a; }
  .idc .idb-found { margin-top: 3.2mm; }
  .idc .idb-found p { margin: 0 !important; font-size: 1.85mm !important; line-height: 3mm !important; white-space: nowrap !important; color: #1b1f2a; }
  .idc .idb-found p sup { font-size: 1.2mm !important; line-height: 0 !important; }
  .idc .idb-found p.idb-contact { margin-top: .8mm !important; font-weight: 700 !important; }
  .idc .idb-coord { position: absolute; left: 0; right: 0; bottom: 2.6mm; display: flex; flex-direction: column; align-items: center; text-align: center; }
  .idc .idb-coord img { height: 6mm; max-width: 26mm; object-fit: contain; margin-bottom: -1.6mm; position: relative; z-index: 1; }
  .idc .idb-coord .idb-nosig { display: block; height: 4.4mm; }
  .idc .idb-coord i { display: block; width: 24mm; height: 0; border-top: .25mm solid #1b1f2a; }
  .idc .idb-coord b { margin-top: .7mm; font-size: 2.2mm !important; line-height: 3mm !important; font-weight: 700 !important; color: #1b1f2a; white-space: nowrap !important; }
  .idc .idb-coord small { font-size: 1.8mm !important; line-height: 2.5mm !important; color: #6b7280; }
  .idq-faces { display: flex; flex-wrap: wrap; gap: 14px; }
  .idq-face-l { display: block; margin-bottom: 4px; font-size: 11px; font-weight: 700; letter-spacing: .4px; text-transform: uppercase; color: #94a3b8; }

  /* on screen the preview is shown bigger so it can be read */
  .idc-preview { zoom: 1.15; }

  .idc-settings { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 14px 18px; padding: 14px 18px !important; margin-bottom: 16px; }
  .idc-set { display: flex; flex-direction: column; gap: 6px; min-width: 180px; }
  .idc-set.grow { flex: 1; min-width: 240px; }
  .idc-set > label { font-size: 12px; font-weight: 600; color: #475569; }
  .idc-sig-pick { display: flex; align-items: center; gap: 8px; min-height: 38px; }
  .idc-sig-pick > label { cursor: pointer; }
  .idc-sig-pick img { height: 30px; max-width: 110px; object-fit: contain; border: 1px dashed #e2e8f0; border-radius: 6px; padding: 2px 6px; background: #fff; }
  .idc-err { color: #dc2626; font-size: 11.5px; }

`;

const nfcCss = `
  .ix-page .idq-steps { display: flex; align-items: stretch; gap: 6px; margin: 0 0 12px; overflow-x: auto; }
  .ix-page .idq-step { flex: 1 1 0; min-width: 170px; display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid #e8ebf0; border-radius: 12px;
    background: #fff; font: inherit; text-align: left; cursor: pointer; }
  .ix-page .idq-step:hover { border-color: #fdba74; }
  .ix-page .idq-step i { flex: none; width: 26px; height: 26px; border-radius: 50%; background: #eef0f4; color: #64748b; font-style: normal; font-size: 12px; font-weight: 800;
    display: inline-flex; align-items: center; justify-content: center; }
  .ix-page .idq-step.past i { background: #e9f8ef; color: #15803d; }
  .ix-page .idq-step.on { border-color: #ea580c; background: #fff4ee; box-shadow: inset 0 -3px 0 #ea580c; }
  .ix-page .idq-step.on i { background: #ea580c; color: #fff; }
  .ix-page .idq-st { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.25; }
  .ix-page .idq-st b { font-size: 13.5px; color: #0f172a; white-space: nowrap; }
  .ix-page .idq-step.on .idq-st b { color: #c2410c; }
  .ix-page .idq-st small { font-size: 11.5px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ix-page .idq-n { flex: none; min-width: 24px; height: 22px; padding: 0 7px; border-radius: 11px; background: #eef0f4; color: #475569; font-size: 11.5px; font-weight: 800;
    display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; }
  .ix-page .idq-n.hot { background: #ef4444; color: #fff; }
  .ix-page .idq-ar { flex: none; align-self: center; font-size: 20px; color: #cbd5e1; }
  .ix-page .idq-ar.past { color: #ea580c; }
  .ix-page .idq-steps + .idq-help { margin: 0 0 12px; }

  .nfc-req-meta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; font-size: 12.5px; }
  .nfc-pre { display: inline-flex; align-items: center; gap: 5px; padding: 2px 9px; border-radius: 99px; font-size: 11.5px; font-weight: 700; background: #fef3c7; color: #92400e; }
  .nfc-pre.done { background: #dcf5e6; color: #146c3a; }
  .nfc-ok { color: #15803d; } .nfc-not { color: #b45309; }
  .nfc-wait { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border-radius: 10px; background: #fff7ed; border: 1px solid #fde4cc; color: #9a3412; font-size: 12.5px; line-height: 1.45; }
  .nfc-wait svg { flex-shrink: 0; margin-top: 1px; }
  .nfc-review { margin-top: 16px; padding-top: 16px; border-top: 1px solid #f1f5f9; display: flex; flex-direction: column; gap: 14px; }

${idCardCss}
  /* card requests list */
  .idq-help { margin: -4px 0 12px; font-size: 12.5px; color: #64748b; }
  .idq-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .idq-toolbar .ix-search { flex: 1; min-width: 220px; }
  .idq-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .idq-hint { margin: 6px 2px 12px; font-size: 11.5px; color: #94a3b8; }
  .idq-table .ix-table-wrap { max-height: calc(5 * 58px + 44px); overflow: auto; }
  .idq-table thead th { position: sticky; top: 0; z-index: 1; }
  .idq-table tbody tr.on td { background: #fff6f1; }
  .idq-ck { width: 36px; }
  .ix-page .mon-split.ibx-split.idq-split { height: calc(100vh / var(--fit, 1) - 285px); min-height: 420px; }
  .idq-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin: 0 0 12px; }
  .idq-tab { display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 14px; border-radius: 99px; border: 1px solid #e3e6ea; background: #fff;
    font: inherit; font-size: 13px; font-weight: 600; color: #475569; cursor: pointer; }
  .idq-tab:hover { border-color: #fdba74; }
  .idq-tab.on { border-color: #ea580c; background: #fff4ee; color: #c2410c; }
  .idq-tab .idq-n { min-width: 22px; height: 20px; padding: 0 6px; border-radius: 10px; background: #eef0f4; color: #475569; font-size: 11.5px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; }
  .idq-tab.on .idq-n { background: #ea580c; color: #fff; }
  .idq-tab .idq-n.hot { background: #ef4444; color: #fff; }
  .idq-toolbar { margin-bottom: 12px !important; }
  .idq-two { display: grid !important; grid-template-columns: 220px minmax(0, 1fr); gap: 16px !important; align-items: stretch; padding: 16px !important; }
  .idq-rail { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; border-right: 1px solid #e7e9ee; padding-right: 18px; min-height: 100%; }
  .idq-who { display: flex; flex-direction: column; gap: 2px; min-width: 0; max-width: 100%; }
  .idq-who b { font-size: 15px; line-height: 1.3; color: #0f172a; }
  .idq-who small { font-size: 11.5px; color: #6b7280; word-break: break-all; }
  .idq-dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 7px 14px; margin: 6px 0 0; font-size: 12px; width: 100%; }
  .idq-dl dt { color: #6b7280; } .idq-dl dd { margin: 0; font-weight: 600; color: #0f172a; word-break: break-word; }
  .idq-main { min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 12px; }
  .idq-fan { flex: 1 1 0; min-height: 220px; display: flex; align-items: center; justify-content: center; border-radius: 12px; background: #f3eeea; overflow: hidden; padding: 14px; box-sizing: border-box; }
  .idq-fit { position: relative; flex: none; }
  .idq-pair { position: absolute; left: 0; top: 0; transform-origin: 0 0; display: flex; align-items: center; justify-content: center; gap: 22px; }
  .idq-fc { flex: none; }
  .idq-fc.front { transform: rotate(-2deg); position: relative; z-index: 2; }
  .idq-fc.back { transform: translateY(6px) rotate(3deg); position: relative; z-index: 1; }
    @media (max-width: 1250px) { .idq-two { grid-template-columns: 1fr; } .idq-rail { border-right: 0; padding-right: 0; border-bottom: 1px solid #e7e9ee; padding-bottom: 12px; } }
  .idq-body { display: flex; gap: 22px; align-items: flex-start; flex-wrap: wrap; }
  .idq-body .idq-faces { flex: none; gap: 16px; flex-wrap: nowrap; }
  .ix-page .mon-detail .ibx-d.idq-two { height: 100%; min-height: 0; box-sizing: border-box; }
  .idq-none { height: 100%; min-height: 260px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; text-align: center; color: #94a3b8; padding: 24px; }
  .idq-none b { color: #475569; font-size: 15px; } .idq-none span { font-size: 12.5px; max-width: 280px; line-height: 1.5; }
  .idq-right { flex: 1 1 280px; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
  .idq-right .ibx-kv { grid-template-columns: 1fr 1fr !important; }
  .idq-right .idq-set-btn { align-self: flex-start; }
  @media (max-width: 900px) { .ix-page .mon-split.ibx-split.idq-split { height: auto; min-height: 0; } }
  .idq-all { display: flex; align-items: center; gap: 8px; padding: 8px 14px; font-size: 11.5px; font-weight: 600; color: #64748b; border-bottom: 1px solid #f1ece9; position: sticky; top: 0; background: #fff; z-index: 1; cursor: pointer; }
  .idq-all input, .idq-row > input { width: 15px; height: 15px; accent-color: #e8582a; cursor: pointer; flex-shrink: 0; }
  .ix-page .mon-item.idq-row { display: flex; align-items: center; gap: 10px; padding: 0 0 0 14px; cursor: default; }
  .ix-page .mon-item.idq-row.ck { background: #fffaf7; }
  .idq-open { flex: 1; min-width: 0; display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; align-items: center; gap: 10px;
    padding: 9px 14px 9px 0; border: 0; background: none; text-align: left; cursor: pointer; font-family: inherit; }
  .idq-card > span { display: flex !important; align-items: center; gap: 6px; }
  .idq-set-btn { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; border: 0; background: none; cursor: pointer; font: 600 11.5px inherit; font-family: inherit; color: #c2410c; text-transform: none; letter-spacing: 0; }
  .idq-card-row { display: flex; gap: 18px; flex-wrap: wrap; align-items: flex-start; }
  .ix-page .mon-detail .idc-preview { zoom: 1.05; }
  .idq-act-text { flex: 1; font-size: 12.5px; color: #64748b; }
  .idq-link { display: flex; align-items: center; gap: 6px; min-width: 250px; }
  .idq-link .ix-input { height: 34px; min-width: 0; flex: 1; font-size: 12.5px; }
  .idq-link .ix-input.scanning { border-color: #e8582a; background: #fff6f1; }
  .idq-pre { display: inline-flex; align-items: center; gap: 4px; margin-top: 3px; padding: 2px 8px; border-radius: 99px; background: #fef3c7; color: #92400e; font-size: 10.5px; font-weight: 600; font-style: normal; align-self: flex-start; white-space: nowrap; }
  .idq-uid { display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px; border-radius: 8px; background: #f1f5f9; font: 600 12px ui-monospace, monospace; color: #334155; }
  .idq-ck input { width: 16px; height: 16px; accent-color: #e8582a; cursor: pointer; }
  .idq-who { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .idq-who span { display: flex; flex-direction: column; min-width: 0; }
  .idq-who small { font-size: 11.5px; color: #94a3b8; }
  .idq-place { display: inline-block; max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; vertical-align: middle; }
  .idq-date { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 3px; }
  .idq-date small { font-size: 11px; color: #94a3b8; }
  .ix-content .ix-card.idq-preview { padding: 16px 18px !important; margin-bottom: 16px; }
  .idq-preview-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
  .idq-preview-head h3 { margin: 0; font-size: 15px; font-weight: 700; }
  .idq-preview-head small { font-size: 12px; color: #94a3b8; }
  .idq-preview-body { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; }
  .idq-save { font-size: 11.5px; color: #15803d; font-weight: 600; }
  .idq-save.saving { color: #94a3b8; }
  .idq-save.error { color: #dc2626; }
  .idq-settings { flex: 1; min-width: 220px; max-width: 420px; display: flex; flex-direction: column; gap: 12px; }

  @media (max-width: 600px) {
    .idc-preview { zoom: 1; }
    .idq-actions { width: 100%; }
    .idq-actions .ix-b { flex: 1; justify-content: center; }
    .idq-table .ix-table-wrap { max-height: none; }
  }
`;