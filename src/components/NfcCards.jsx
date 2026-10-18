// components/NfcCards.jsx
// Coordinator page: review NFC card requests and see the request history.
// PrintCards (exported) is used by the admin's "Print ID Cards" page.
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import logo from "../assets/logo.png";
import { Spinner, PageHeader, Badge, Table, Empty, Msg, Avatar, Icon, photoUrl, liveRefresh } from "./DashKit.jsx";
import { API } from "../config.js";


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

/* ───────────────────────── page ───────────────────────── */
export default function NfcCards({ user, interns, onRefresh }) {
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
      </div>

      {error && (
        <div className="ix-alert"><Icon name="warn" size={18} /> {error}</div>
      )}

      {tab === "requests" && (
        <Requests
          user={user} requests={open} loading={loading} error={error}
          refresh={fetchRequests} onRefresh={onRefresh}
        />
      )}
      {tab === "history" && <History requests={closed} loading={loading} />}
    </>
  );
}

/* ───────────────────────── requests tab (pending + approved) ───────────────────────── */
function Requests({ user, requests, loading, error, refresh, onRefresh }) {
  const [remarks, setRemarks] = useState({});
  const [uids, setUids] = useState({});
  const [scanningId, setScanningId] = useState(null);
  const [processing, setProcessing] = useState(null);
  const [msg, setMsg] = useState(null);
  const buffer = useRef("");

  // The NFC reader "types" the card UID and presses Enter
  useEffect(() => {
    if (scanningId === null) return;
    const onKey = (e) => {
      if (e.key === "Escape") { setScanningId(null); return; }
      if (e.key === "Enter") {
        e.preventDefault();
        const uid = buffer.current.trim();
        buffer.current = "";
        if (uid.length >= 4) {
          setUids((u) => ({ ...u, [scanningId]: uid }));
          setScanningId(null);
        }
      } else if (e.key.length === 1) {
        buffer.current += e.key;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scanningId]);

  const review = async (r, action) => {
    const uid = (uids[r.id] || "").trim();
    if (action === "link" && uid.length < 4) {
      setMsg({ type: "error", text: "Scan the card or type its UID first." });
      return;
    }
    const status = action === "reject" ? "rejected" : action === "link" || uid ? "issued" : "approved";
    setProcessing(r.id + action); setMsg(null);
    try {
      const res = await fetch(`${API}/supervisor/nfc-requests/${r.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ status, remarks: remarks[r.id] || "", uid: uid || null, reviewer_id: user.id }),
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

  if (loading) return <Spinner />;

  return (
    <>
      <Msg msg={msg} />

      {requests.length === 0 && !error ? (
        <div className="ix-card ix-allgood">
          <div className="ix-empty-icon"><Icon name="check" size={30} /></div>
          <div className="ix-empty-title" style={{ fontSize: 17 }}>All caught up!</div>
          <div className="ix-empty-sub">No card requests waiting. New applications will show up here.</div>
        </div>
      ) : (
        <div className="ix-list">
          {requests.map((r) => {
            const st = STATUS[r.status] || STATUS.pending;
            const scanning = scanningId === r.id;
            const uid = uids[r.id] || "";
            return (
              <div key={r.id} className="ix-sub">
                <div className="ix-sub-top">
                  <Avatar name={r.intern_name} photo={r.intern_photo} />
                  <div className="ix-ic-id">
                    <strong>{r.intern_name}</strong>
                    <span>{r.intern_email}</span>
                  </div>
                  <Badge label={st.label} type={st.type} />
                </div>

                <div className="nfc-req-meta">
                  <span className="ix-chip">{r.type || "NFC card"}</span>
                  {r.created_at && <span className="ix-muted">Applied {fmtDate(r.created_at)}</span>}
                </div>
                {r.notes && <div className="ix-desc" style={{ marginTop: 12 }}>{r.notes}</div>}

                <div className="nfc-review">
                  <div className="ix-field">
                    <label htmlFor={`nfc-uid-${r.id}`}>
                      Card UID {r.status === "pending" && <span className="ix-muted">(optional for now)</span>}
                    </label>
                    <div className="ix-row-gap">
                      <input
                        id={`nfc-uid-${r.id}`} type="text"
                        className={scanning ? "scanning" : ""}
                        placeholder="Scan the card or type the UID"
                        value={scanning ? "Waiting for card tap..." : uid}
                        readOnly={scanning}
                        onChange={(e) => setUids((u) => ({ ...u, [r.id]: e.target.value }))}
                      />
                      <button
                        type="button"
                        className={scanning ? "ix-b ghost" : "ix-b primary"}
                        onClick={(e) => { e.currentTarget.blur(); buffer.current = ""; setScanningId(scanning ? null : r.id); }}
                      >
                        <Icon name="nfc" size={16} /> {scanning ? "Cancel" : "Scan"}
                      </button>
                    </div>
                    {scanning && <div className="ix-hint info">Keep this window focused, then tap the card on the reader.</div>}
                  </div>

                  <div className="ix-review">
                    <input
                      type="text" className="ix-input" placeholder="Add remarks (optional)"
                      value={remarks[r.id] || ""}
                      onChange={(e) => setRemarks((x) => ({ ...x, [r.id]: e.target.value }))}
                    />
                    {r.status === "pending" && (
                      <button className="ix-b danger" onClick={() => review(r, "reject")} disabled={!!processing}>
                        {processing === r.id + "reject" ? "..." : "Reject"}
                      </button>
                    )}
                    {r.status === "pending" ? (
                      <button className="ix-b ok" onClick={() => review(r, "approve")} disabled={!!processing}>
                        {processing === r.id + "approve" ? "..." : uid.trim() ? "Approve & link card" : "Approve"}
                      </button>
                    ) : (
                      <button className="ix-b ok" onClick={() => review(r, "link")} disabled={!!processing}>
                        {processing === r.id + "link" ? "..." : "Link card"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
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

/* ───────────────────────── the card itself ───────────────────────── */
function CardFace({ u }) {
  const src = photoUrl(u.photo);
  // the card UID is never printed: anyone who saw it could use it to tap for this intern
  return (
    <div className="nfc-card">
      <div className="nfc-card-head">
        <img src={logo} alt="" className="nfc-logo" />
        <div>
          <strong>CARAGA STATE UNIVERSITY</strong>
          <span>College of Computing and Information Sciences</span>
        </div>
      </div>
      <div className="nfc-card-body">
        <div className="nfc-photo">
          {src ? <img src={src} alt="" /> : <b>{u.name?.charAt(0).toUpperCase() || "?"}</b>}
        </div>
        <div className="nfc-info">
          <span className="nfc-role">OJT INTERN</span>
          <strong className="nfc-name">{u.name}</strong>
          <span className="nfc-mail">{u.email}</span>
          <div className="nfc-uid">
            <small>ID NO.</small>
            <code>{u.student_id || "—"}</code>
          </div>
        </div>
      </div>
      <div className="nfc-card-foot">
        <Icon name="nfc" size={12} /> Tap to Track · OJT Attendance
      </div>
    </div>
  );
}

/* ───────────────────────── printing (admin) ─────────────────────────
   interns = the interns allowed to get a card; statusOf(u) = optional label for the chip */
export function PrintCards({ interns, statusOf }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [printList, setPrintList] = useState([]);

  const list = interns.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(search.toLowerCase()));
  const allSelected = list.length > 0 && list.every((u) => selected.includes(u.id));

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = () =>
    setSelected((s) =>
      allSelected ? s.filter((id) => !list.some((u) => u.id === id)) : [...new Set([...s, ...list.map((u) => u.id)])]
    );

  // Print once the cards (and their photos) are on the page
  useEffect(() => {
    if (!printList.length) return;
    const imgs = [...document.querySelectorAll(".nfc-print-area img")];
    Promise.all(
      imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; })))
    ).then(() => setTimeout(() => window.print(), 60));
    const done = () => setPrintList([]);
    window.addEventListener("afterprint", done);
    return () => window.removeEventListener("afterprint", done);
  }, [printList]);

  const doPrint = (arr) => { if (arr.length) setPrintList(arr); };

  return (
    <>
      <style>{nfcCss}</style>
      <div className="ix-toolbar">
        <div className="ix-search">
          <Icon name="search" size={16} />
          <input type="text" placeholder="Search intern..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button className="ix-b ghost" onClick={toggleAll} disabled={!list.length}>
          {allSelected ? "Clear selection" : "Select all"}
        </button>
        <button
          className="ix-b primary" disabled={!selected.length}
          onClick={() => doPrint(interns.filter((u) => selected.includes(u.id)))}
        >
          <Icon name="print" size={16} /> Print selected ({selected.length})
        </button>
      </div>

      {list.length === 0 ? (
        <div className="ix-card"><Empty icon="card" title="No cards to print" sub="Interns appear here once the OJT coordinator approves their NFC card request." /></div>
      ) : (
        <div className="nfc-grid">
          {list.map((u) => (
            <div key={u.id} className={selected.includes(u.id) ? "nfc-item on" : "nfc-item"}>
              <label className="nfc-check">
                <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggle(u.id)} />
                Select
              </label>
              <CardFace u={u} />
              <div className="nfc-item-foot">
                <span className={u.nfc_uid ? "ix-chip green" : "ix-chip"}>
                  {statusOf ? statusOf(u) : u.nfc_uid ? <><i /> Card linked</> : "No card yet"}
                </span>
                <button className="ix-b ghost sm" onClick={() => doPrint([u])}>
                  <Icon name="print" size={14} /> Print
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {printList.length > 0 &&
        createPortal(
          <div className="nfc-print-area">
            {printList.map((u) => <CardFace key={u.id} u={u} />)}
          </div>,
          document.body
        )}
    </>
  );
}

/* ───────────────────────── styles ───────────────────────── */
const nfcCss = `
  .nfc-req-meta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; font-size: 12.5px; }
  .nfc-review { margin-top: 16px; padding-top: 16px; border-top: 1px solid #f1f5f9; display: flex; flex-direction: column; gap: 14px; }

  .nfc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 20px; }
  .nfc-item { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 16px; background: #fff; border-radius: 22px; border: 2px solid transparent; box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.05); transition: border-color .15s, transform .2s; }
  .nfc-item:hover { transform: translateY(-2px); }
  .nfc-item.on { border-color: #e8582a; }
  .nfc-check { align-self: flex-start; display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: #64748b; cursor: pointer; }
  .nfc-check input { width: 16px; height: 16px; accent-color: #e8582a; cursor: pointer; }
  .nfc-item-foot { width: 85.6mm; max-width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 10px; }

  /* CR80 card: 85.6mm x 54mm */
  .nfc-card { width: 85.6mm; height: 54mm; border-radius: 4mm; background: #fff; border: 0.3mm solid #f1d5c7; box-shadow: 0 12px 30px rgba(15,23,42,0.14); display: flex; flex-direction: column; overflow: hidden; flex-shrink: 0; font-family: 'Poppins', 'Segoe UI', sans-serif; color: #0b1220; -webkit-print-color-adjust: exact; print-color-adjust: exact; break-inside: avoid; }
  .nfc-card-head { display: flex; align-items: center; gap: 2.4mm; padding: 2.2mm 4mm; background: linear-gradient(135deg, #f2864f, #e8582a); color: #fff; }
  .nfc-logo { height: 8mm; width: auto; background: #fff; border-radius: 1.6mm; padding: 0.6mm; }
  .nfc-card-head strong { display: block; font-size: 2.9mm; letter-spacing: 0.2mm; line-height: 1.15; }
  .nfc-card-head span { display: block; font-size: 2mm; opacity: 0.92; margin-top: 0.3mm; }
  .nfc-card-body { flex: 1; display: flex; align-items: center; gap: 4mm; padding: 2.6mm 4mm; min-height: 0; }
  .nfc-photo { width: 22mm; height: 22mm; border-radius: 2.4mm; overflow: hidden; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #f2864f, #e8582a); color: #fff; border: 0.5mm solid #fde1d5; }
  .nfc-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .nfc-photo b { font-size: 9mm; }
  .nfc-info { min-width: 0; display: flex; flex-direction: column; }
  .nfc-role { font-size: 2mm; font-weight: 700; letter-spacing: 0.4mm; color: #e8582a; }
  .nfc-name { font-size: 3.9mm; line-height: 1.15; font-weight: 800; margin-top: 0.4mm; }
  .nfc-mail { font-size: 2.2mm; color: #64748b; margin-top: 0.6mm; word-break: break-all; }
  .nfc-uid { margin-top: 1.8mm; padding: 1.1mm 2mm; background: #fff5ef; border-radius: 1.4mm; display: inline-flex; flex-direction: column; align-self: flex-start; }
  .nfc-uid small { font-size: 1.7mm; color: #94a3b8; font-weight: 700; letter-spacing: 0.3mm; }
  .nfc-uid code { font-size: 2.8mm; font-weight: 700; color: #0b1220; font-family: ui-monospace, monospace; }
  .nfc-card-foot { display: flex; align-items: center; gap: 1.6mm; padding: 1.5mm 4mm; background: #fafbfc; border-top: 0.3mm solid #f1f5f9; font-size: 2.2mm; color: #64748b; }
  .nfc-card-foot svg { color: #e8582a; }

  /* print: hide the whole app, show only the cards */
  .nfc-print-area { display: none; }
  @media print {
    @page { size: A4; margin: 10mm; }
    html, body { background: #fff !important; height: auto !important; overflow: visible !important; }
    body > *:not(.nfc-print-area) { display: none !important; }
    .nfc-print-area { display: grid !important; grid-template-columns: repeat(2, 85.6mm); gap: 6mm; justify-content: center; }
    .nfc-print-area .nfc-card { box-shadow: none; border: 0.3mm solid #cbd5e1; }
  }
  @media (max-width: 600px) {
    .nfc-grid { grid-template-columns: 1fr; }
  }
`;