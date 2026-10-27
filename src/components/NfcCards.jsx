// components/NfcCards.jsx
// Coordinator page: review NFC card requests and see the request history.
// CardRequests (exported) is the admin's "Card Requests" page: approved cards to print in the printing app.
import { useState, useEffect, useRef } from "react";
import CardAlerts from "./CardAlerts.jsx";
import logo from "../assets/logo.png";          // CCIS logo (right side of the ID)
import csuLogo from "../assets/csu-logo.png";   // CSU seal (left side of the ID)
import campus from "../assets/campus.jpg";      // faded background of the ID
import { Spinner, PageHeader, Badge, Table, Empty, Msg, Avatar, Icon, photoUrl, liveRefresh, Inbox } from "./DashKit.jsx";
import { API } from "../config.js";


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
        <Inbox
          items={requests}
          row={(r) => {
            const st = r.status === "approved" && r.printed_at ? { label: "Printed", type: "onsite" }
              : r.status === "approved" ? { label: "Approved", type: "pending" } : STATUS[r.status] || STATUS.pending;
            const p = preOf ? preOf(r) : null;
            return { name: r.intern_name, photo: r.intern_photo, sub: `${r.type || "NFC card"} · applied ${fmtDate(r.created_at)}`,
              tag: <Badge label={st.label} type={st.type} />, meta: p ? `Pre-internship ${p.approved}/${p.total}` : "" };
          }}
          detail={(r) => {
            const st = r.status === "approved" && r.printed_at ? { label: "Printed · waiting for claim", type: "onsite" }
              : r.status === "approved" ? { label: "Approved · waiting for print", type: "pending" } : STATUS[r.status] || STATUS.pending;
            const p = preOf ? preOf(r) : null;
            return (
              <>
                <div className="ibx-head"><Avatar name={r.intern_name} photo={r.intern_photo} size={48} />
                  <div><b>{r.intern_name}</b><small>{r.intern_email}</small></div>
                  <span style={{ marginLeft: "auto" }}><Badge label={st.label} type={st.type} /></span></div>
                <div className="ibx-kv ibx-sec">
                  <div><small>Request</small><b>{r.type || "NFC card"}</b></div>
                  <div><small>Applied</small><b>{fmtDate(r.created_at)}</b></div>
                  {p && <div><small>Pre-internship</small><b className={p.started ? "nfc-ok" : "nfc-not"}>{p.approved}/{p.total}{p.started ? " · started" : ""}</b></div>}
                </div>
                {r.notes && <div className="ibx-sec"><span>Intern's note</span><p>{r.notes}</p></div>}
                {r.status === "approved" && (
                  <div className="nfc-wait">
                    <Icon name="clock" size={16} />
                    <span>{r.printed_at
                      ? "Printed. The intern claims it at the office; the card becomes active when they pick it up."
                      : `Approved. The intern signs the ID card at the ${ID_OFFICE}; the admin prints it and links it when they claim it.`}</span>
                  </div>
                )}
                {r.status === "pending" && (
                  <div className="ibx-act">
                    <input type="text" className="ix-input" placeholder="Remarks (optional)" value={remarks[r.id] || ""}
                      onChange={(e) => setRemarks((x) => ({ ...x, [r.id]: e.target.value }))} />
                    <button className="ix-b danger" onClick={() => review(r, "reject")} disabled={!!processing}>
                      {processing === r.id + "reject" ? "..." : "Reject"}</button>
                    <button className="ix-b ok" onClick={() => review(r, "approve")} disabled={!!processing}>
                      {processing === r.id + "approve" ? "..." : "Approve"}</button>
                  </div>
                )}
              </>
            );
          }}
        />
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

/* ───────────────────────── the card itself ─────────────────────────
   CR80 size (85.6mm x 54mm, landscape). The card UID is never printed: anyone who saw it could tap for this intern. */
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
    return `${u.first_name.trim()} ${mi ? mi.toUpperCase() + ". " : ""}${u.last_name.trim()}`;
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
  const address = u.company_address || u.hte_address;      // shown when the system has it
  const emergency = [u.emergency_contact_name, u.emergency_contact_number].filter(Boolean).join(" · ");
  return (
    <div className="idc">
      <img src={campus} alt="" className="idc-bg" />
      <div className="idc-head">
        <img src={csuLogo} alt="Caraga State University" className="idc-logo" />
        <div className="idc-titles">
          <strong>CARAGA STATE UNIVERSITY</strong>
          <span>COLLEGE OF COMPUTING AND INFORMATION SCIENCES</span>
          <b>OJT INTERN IDENTIFICATION CARD</b>
        </div>
        <img src={logo} alt="CSU CCIS" className="idc-logo" />
      </div>

      <div className="idc-body">
        <div className="idc-photo">
          {src ? <img src={src} alt="" /> : <b>{u.name?.charAt(0).toUpperCase() || "?"}</b>}
        </div>
        <div className="idc-info">
          <span className="idc-role">Student Intern</span>
          <strong className={name.length > 30 ? "idc-name xlong" : name.length > 22 ? "idc-name long" : "idc-name"}>{name}</strong>
          <div className="idc-grid">
            <div><small>Student ID</small><span>{u.student_id || "—"}</span></div>
            <div><small>Year Level</small><span>{year}</span></div>
            <div><small>Course</small><span>{course}</span></div>
            <div><small>Birthday</small><span>{birthDate(u.date_of_birth)}</span></div>
            <div className="span2"><small>OJT Placement</small><span>{u.placement || "—"}</span></div>
            <div><small>Valid date</small><span>{longDate(settings.valid)}</span></div>
            {address
              ? <div className="span2"><small>Company Address</small><span>{address}</span></div>
              : <div className="span2"><small>In case of emergency</small><span>{emergency || "—"}</span></div>}
          </div>
        </div>
      </div>

      <div className="idc-sign">
        <div className="idc-sig">
          <i />
          <small>Signature of Intern</small>
        </div>
        <div className="idc-sig">
          {settings.signature ? <img src={settings.signature} alt="" /> : <i />}
          {settings.coordinator && <span>{settings.coordinator}</span>}
          <small>OJT Coordinator</small>
        </div>
      </div>
    </div>
  );
}

/* Back of the ID card: emergency contact, card rules, and where to return a found card */
export const CARD_RULES = [
  "This card is the property of CSU – CCIS and is not transferable.",
  "Tap only your own card. Tapping for another intern is not allowed.",
  "Bring this card with you every OJT day.",
  "Report a lost or damaged card to your OJT Coordinator right away.",
];
export function CardBack({ u, settings = {} }) {
  return (
    <div className="idc idc-back">
      <img src={campus} alt="" className="idc-bg" />
      <div className="idb-band">
        <img src={csuLogo} alt="" />
        <span><b>CARAGA STATE UNIVERSITY</b><small>College of Computing and Information Sciences</small></span>
        <em>OJT INTERN ID</em>
      </div>

      <div className="idb-body">
        <div className="idb-left">
          <div className="idb-emg">
            <small>In case of emergency</small>
            <strong>{u.emergency_contact_name || "—"}{u.emergency_contact_relation ? ` (${u.emergency_contact_relation})` : ""}</strong>
            <b>{u.emergency_contact_number || "—"}</b>
          </div>
          <div className="idb-found">
            <small>If found, please return to</small>
            <p>{ID_OFFICE}, College of Computing and Information Sciences, Caraga State University, Ampayon, Butuan City</p>
            {settings.contact && <p className="idb-contact">{settings.contact}</p>}
          </div>
        </div>
        <div className="idb-rules">
          <small>Card rules</small>
          <ol>{CARD_RULES.map((r) => <li key={r}>{r}</li>)}</ol>
        </div>
      </div>

      {/* bottom strip: how the card is used (the valid date is on the front) */}
      <div className="idb-foot">
        <span className="idb-tap">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7.5a6.5 6.5 0 0 1 0 9M10.5 5a10 10 0 0 1 0 14M14 2.8a13.5 13.5 0 0 1 0 18.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><circle cx="4" cy="12" r="1.6" fill="currentColor" /></svg>
          <span><b>NFC attendance card</b><small>Tap at the MYTRACK kiosk when you arrive and when you leave</small></span>
        </span>
        <img src={logo} alt="CSU CCIS" className="idb-ccis" />
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
    return () => window.removeEventListener("keydown", onKey);
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
  const pv = shown.find((x) => String(x.u.id) === String(preview)) || (typeof window !== "undefined" && !window.matchMedia("(max-width: 900px)").matches ? shown[0] : null) || null;
  const [showDetail, setShowDetail] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const what = sel.length ? `${sel.length} selected` : `all ${shown.length}`;

  return (
    <>
      <style>{nfcCss}</style>
      <div className="ix-pills">
        {STAGES.map((t) => (
          <button key={t.key} className={stage === t.key ? "ix-pill active" : "ix-pill"} onClick={() => changeStage(t.key)}>
            {t.label} <span className="ix-pill-count">{count(t.key)}</span>
          </button>
        ))}
      </div>
      <p className="idq-help">
        {stage === "toprint" && `Approved interns come to the ${ID_OFFICE} to sign. Make the cards in your printing app after they sign, then mark them as printed so they're told to claim it.`}
        {stage === "tolink" && "Printed cards. Scan each card and click Link. You can do this ahead of time; the card only becomes active when the intern claims it."}
        {stage === "toclaim" && "Linked and waiting for the intern. When they pick it up, click Claimed: the card becomes active and their taps start counting. Interns with missing pre-internship requirements can't claim yet."}
        {stage === "released" && "Cards already linked to the intern's account."}
      </p>

      <div className="ix-toolbar idq-toolbar">
        <div className="ix-search">
          <Icon name="search" size={16} />
          <input type="text" placeholder="Search name, ID, course or placement..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="idq-actions">
          <button className="ix-b ghost" onClick={downloadCsv} disabled={!shown.length} title={`Download ${what} as a CSV for Excel or the printing app`}>
            <Icon name="download" size={16} /> List (CSV)
          </button>
          <button className="ix-b ghost" onClick={downloadPhotos} disabled={!shown.length || !!busy}>
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
      <div className="idq-hint">{sel.length ? `${sel.length} selected. The buttons use only these.` : "Tick interns to choose; with none ticked, the buttons use everyone in this tab."}</div>
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
              {pv && (() => {
                const { u, r, stage: st } = pv;
                const { course, year } = courseOf(u.program);
                const [bl, bt] = STAGE_BADGE[st];
                return (
                  <div className="ibx-d" key={u.id}>
                    <div className="ibx-head"><Avatar name={u.name} photo={u.photo} size={48} />
                      <div><b>{u.name}</b><small>{u.email}{u.photo ? "" : " · no photo yet"}</small></div>
                      <span style={{ marginLeft: "auto" }}><Badge label={bl} type={bt} /></span></div>

                    {st !== "released" && r?.pre_missing > 0 && (
                      <div className="nfc-wait"><Icon name="warn" size={16} />
                        <span>Pre-internship {r.pre_total - r.pre_missing}/{r.pre_total}: the card can be printed and linked now, but it can only be claimed once every requirement is approved.</span></div>
                    )}

                    <div className="ibx-kv ibx-sec">
                      <div><small>Student ID</small><b>{u.student_id || "—"}</b></div>
                      <div><small>Course</small><b>{course}{year !== "—" ? ` · ${year}` : ""}</b></div>
                      <div><small>Birthday</small><b>{birthDate(u.date_of_birth)}</b></div>
                      <div><small>Placement</small><b>{u.placement || "—"}</b></div>
                      <div><small>Approved</small><b>{r ? fmtDate(r.reviewed_at || r.updated_at) : "—"}</b></div>
                      <div><small>Printed</small><b>{r?.printed_at ? fmtDate(r.printed_at) : "—"}</b></div>
                    </div>

                    <div className="ibx-sec idq-card">
                      <span>Card preview <small className="ix-muted">· a guide for the printing app</small>
                        <button type="button" className="idq-set-btn" onClick={() => setShowSettings((v) => !v)}>
                          <Icon name="settings" size={13} /> {showSettings ? "Hide card settings" : "Card settings"}</button></span>
                      <div className="idq-card-row">
                        <div className="idq-faces">
                          <div><small className="idq-face-l">Front</small><div className="idc-preview"><CardFace u={u} settings={settings} /></div></div>
                          <div><small className="idq-face-l">Back</small><div className="idc-preview"><CardBack u={u} settings={settings} /></div></div>
                        </div>
                        {showSettings && (
                          <div className="idq-settings">
                            <small className={`idq-save ${saveState}`}>
                              {saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved for every computer" : saveState === "error" ? "Couldn't save to the server (kept on this computer only)" : "Saved for every computer"}
                            </small>
                            <div className="idc-set">
                              <label htmlFor="idc-valid">Valid until</label>
                              <input id="idc-valid" type="date" className="ix-input" value={settings.valid} onChange={(e) => setS("valid", e.target.value)} />
                            </div>
                            <div className="idc-set">
                              <label htmlFor="idc-coord">OJT Coordinator</label>
                              <input id="idc-coord" type="text" className="ix-input" placeholder="e.g. Juana Dela Cruz, MSc"
                                value={settings.coordinator} onChange={(e) => setS("coordinator", e.target.value)} />
                            </div>
                            <div className="idc-set">
                              <label htmlFor="idc-contact">Office contact on the back <span className="ix-muted">(optional)</span></label>
                              <input id="idc-contact" type="text" className="ix-input" placeholder="e.g. (085) 342-1234 · ccis@carsu.edu.ph"
                                value={settings.contact} onChange={(e) => setS("contact", e.target.value)} />
                            </div>
                            <div className="idc-set">
                              <label>Coordinator's signature <span className="ix-muted">(optional)</span></label>
                              <div className="idc-sig-pick">
                                <label className="ix-b ghost sm">
                                  <input type="file" accept="image/png,image/jpeg" onChange={pickSignature} hidden />
                                  <Icon name="upload" size={14} /> {settings.signature ? "Change" : "Upload"}
                                </label>
                                {settings.signature && (
                                  <>
                                    <img src={settings.signature} alt="Signature" />
                                    <button type="button" className="ix-b ghost sm" onClick={() => setS("signature", "")}>Remove</button>
                                  </>
                                )}
                              </div>
                              {sigMsg && <small className="idc-err">{sigMsg}</small>}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

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
  /* ── ID card: CR80 85.6mm x 54mm, landscape ── */
  .idc { position: relative; width: 85.6mm; height: 54mm; border-radius: 3mm; overflow: hidden; flex-shrink: 0;
    background: #fdf8f5; color: #1f2333; font-family: 'Inter', 'Segoe UI', Arial, sans-serif; display: flex; flex-direction: column;
    padding: 2.4mm 3.6mm 2mm; box-sizing: border-box; box-shadow: 0 12px 30px rgba(15,23,42,0.14); border: 0.2mm solid #eadfd8;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; break-inside: avoid; }
  .idc-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .13; filter: grayscale(.3); pointer-events: none; }
  .idc::before { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(253,248,245,.55), rgba(253,248,245,.25) 40%, rgba(253,248,245,.6)); pointer-events: none; }
  .idc > *:not(.idc-bg) { position: relative; z-index: 1; }

  .idc-head { display: flex; align-items: center; justify-content: space-between; gap: 2mm; }
  .idc-logo { height: 11mm; width: 11mm; object-fit: contain; flex-shrink: 0; }
  .idc-titles { flex: 1; text-align: center; display: flex; flex-direction: column; align-items: center; min-width: 0; }
  .idc-titles strong { font-family: 'Montserrat', 'Poppins', sans-serif; font-size: 3.5mm; font-weight: 700; letter-spacing: .15mm; line-height: 1.1; color: #262a3a; }
  .idc-titles span { font-size: 1.45mm; letter-spacing: .12mm; margin-top: .5mm; color: #3b3f50; }
  .idc-titles b { font-family: 'Montserrat', 'Poppins', sans-serif; font-size: 2mm; font-weight: 700; letter-spacing: .2mm; margin-top: 1mm; color: #262a3a; }

  .idc-body { flex: 1; display: flex; gap: 0; margin-top: 1.8mm; min-height: 0; }
  .idc-photo { width: 20.5mm; height: 26mm; flex-shrink: 0; overflow: hidden; background: #fff; display: flex; align-items: center; justify-content: center;
    border-right: 0.5mm solid #e8582a; padding-right: 0; margin-right: 2.6mm; box-shadow: 0.5mm 0 0 #fdf8f5; }
  .idc-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .idc-photo b { font-size: 9mm; color: #e8582a; }
  .idc-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .idc-role { font-size: 2.1mm; color: #4b4f60; line-height: 1; }
  /* the name is never cut: a fixed line height (in mm, so browser zoom can't squeeze it) and a smaller size for long names */
  .idc-name { display: block; font-family: 'Arial', 'Inter', sans-serif; font-size: 4.4mm; font-weight: 700; color: #14123f;
    line-height: 5.8mm !important; height: auto !important; min-height: 5.8mm; letter-spacing: -.1mm;
    white-space: nowrap; overflow: visible !important; text-overflow: clip; margin-top: .3mm; padding: 0; }
  .idc-name.long { font-size: 3.6mm; line-height: 5mm !important; min-height: 5mm; }
  .idc-name.xlong { font-size: 3mm; line-height: 4.4mm !important; min-height: 4.4mm; }
  .idc-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1.5mm 2mm; margin-top: 1.4mm; }
  .idc-grid > div { min-width: 0; display: flex; flex-direction: column; }
  .idc-grid .span2 { grid-column: span 2; }
  .idc-grid small { font-size: 1.55mm; color: #6b6f80; line-height: 1.2; }
  .idc-grid span { font-size: 2.1mm; color: #1f2333; line-height: 1.2; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }

  .idc-sign { display: flex; justify-content: space-between; align-items: flex-end; padding: 0 3mm 0 20mm; height: 6.5mm; }
  .idc-sig { display: flex; flex-direction: column; align-items: center; min-width: 20mm; }
  .idc-sig i { display: block; width: 20mm; height: 4mm; border-bottom: 0.15mm solid #9a9db0; }
  .idc-sig img { height: 4.6mm; max-width: 24mm; object-fit: contain; margin-bottom: -.8mm; }
  .idc-sig span { font-size: 1.5mm; color: #1f2333; line-height: 1.1; }
  .idc-sig small { font-size: 1.4mm; color: #6b6f80; line-height: 1.2; }

  /* the card keeps its own spacing: page styles (line heights, margins, image boxes) can't stretch it */
  .idc .idc-photo { margin-right: 2.6mm !important; }
  .idc .idc-head { height: 11mm !important; align-items: center !important; gap: 2.4mm !important; }
  .idc .idc-logo { width: 10.5mm !important; height: 10.5mm !important; padding: 0 !important; border: 0 !important; border-radius: 0 !important;
    background: none !important; box-shadow: none !important; object-fit: contain !important; mix-blend-mode: multiply; }
  .idc .idc-titles { justify-content: center !important; gap: 0 !important; }
  .idc .idc-titles > * { display: block !important; margin: 0 !important; padding: 0 !important; white-space: nowrap; }
  .idc .idc-titles strong { font-size: 3.5mm !important; line-height: 4.2mm !important; }
  .idc .idc-titles span { font-size: 1.45mm !important; line-height: 2mm !important; margin-top: .3mm !important; }
  .idc .idc-titles b { font-size: 2mm !important; line-height: 2.6mm !important; margin-top: .9mm !important; padding: .2mm 2mm !important;
    border-top: .15mm solid #e8582a; border-bottom: .15mm solid #e8582a; }
  .idc .idc-body { margin-top: 1.6mm !important; overflow: hidden; }
  .idc .idc-role { line-height: 2.6mm !important; }
  .idc .idc-grid { margin-top: 1mm !important; gap: 1.1mm 2mm !important; }
  .idc .idc-grid small { line-height: 2mm !important; }
  .idc .idc-grid span { line-height: 2.6mm !important; }
  .idc .idc-sign { flex-shrink: 0; height: 6mm !important; }

  /* ── back of the card ── */
  .idc.idc-back { padding: 0 !important; }
  .idc .idb-band { display: flex; align-items: center; gap: 1.8mm; height: 8.6mm; padding: 0 3.6mm; flex-shrink: 0;
    background: linear-gradient(90deg, #e8582a, #f2864f); color: #fff; }
  .idc .idb-band img { width: 6mm !important; height: 6mm !important; object-fit: contain; padding: .4mm; border-radius: 50%; background: #fff; flex-shrink: 0; }
  .idc .idb-band span { display: flex; flex-direction: column; min-width: 0; flex: 1; }
  .idc .idb-band b { font-family: 'Montserrat', 'Poppins', sans-serif; font-size: 2.3mm; line-height: 2.8mm; letter-spacing: .12mm; white-space: nowrap; }
  .idc .idb-band small { font-size: 1.35mm; line-height: 1.8mm; opacity: .95; white-space: nowrap; }
  .idc .idb-band em { font-style: normal; font-family: 'Montserrat', 'Poppins', sans-serif; font-size: 1.7mm; font-weight: 700; letter-spacing: .2mm;
    padding: .5mm 1.6mm; border: .15mm solid rgba(255,255,255,.85); border-radius: 1mm; white-space: nowrap; }
  .idc .idb-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1.08fr; gap: 3mm; padding: 2.6mm 3.6mm 2.8mm; }
  .idc .idb-left { display: flex; flex-direction: column; gap: 2.2mm; min-width: 0; }
  .idc .idb-body small { display: block; font-size: 1.45mm !important; line-height: 1.9mm !important; font-weight: 700; letter-spacing: .12mm; text-transform: uppercase; color: #c2410c; }
  .idc .idb-emg { padding: 1.6mm 2mm; border-left: .7mm solid #e8582a; background: rgba(255,255,255,.75); border-radius: 0 1.2mm 1.2mm 0; }
  .idc .idb-emg strong { display: block; margin-top: .5mm; font-size: 2.5mm; line-height: 3.1mm; color: #14123f;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .idc .idb-emg b { display: block; font-size: 2.7mm; line-height: 3.3mm; color: #14123f; letter-spacing: .1mm; }
  .idc .idb-found p { margin: .5mm 0 0 !important; font-size: 1.65mm !important; line-height: 2.2mm !important; color: #3b3f50; }
  .idc .idb-found p.idb-contact { font-weight: 700; color: #1f2333; }
  .idc .idb-rules { min-width: 0; padding-left: 3mm; border-left: .15mm solid #e6d6cc; }
  .idc .idb-rules ol { margin: .8mm 0 0; padding: 0 0 0 3mm; display: flex; flex-direction: column; gap: 1.1mm; }
  .idc .idb-rules li { font-size: 1.65mm !important; line-height: 2.2mm !important; color: #2b2f40; padding-left: .3mm; }
  .idc .idb-rules li::marker { color: #e8582a; font-weight: 700; }
  .idc .idb-body { padding-bottom: 1.6mm !important; }
  .idc .idb-foot { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 3mm;
    margin: 0 3.6mm; padding: 1.8mm 0 2.4mm; border-top: .15mm solid #e6d6cc; }
  .idc .idb-tap { display: flex; align-items: center; gap: 1.6mm; min-width: 0; }
  .idc .idb-tap svg { width: 5.2mm; height: 5.2mm; flex-shrink: 0; padding: .9mm; border-radius: 1.4mm; color: #fff;
    background: linear-gradient(135deg, #f2864f, #e8582a); box-sizing: border-box; }
  .idc .idb-tap > span { display: flex; flex-direction: column; min-width: 0; }
  .idc .idb-tap b { font-size: 1.9mm !important; line-height: 2.4mm !important; color: #14123f; }
  .idc .idb-tap small { font-size: 1.45mm !important; line-height: 1.9mm !important; color: #5b5f70; white-space: nowrap; }
  .idc .idb-ccis { width: 6.4mm !important; height: 6.4mm !important; object-fit: contain; flex-shrink: 0; mix-blend-mode: multiply;
    padding: 0 !important; border: 0 !important; background: none !important; box-shadow: none !important; }
  .idq-faces { display: flex; flex-wrap: wrap; gap: 14px; }
  .idq-face-l { display: block; margin-bottom: 4px; font-size: 11px; font-weight: 700; letter-spacing: .4px; text-transform: uppercase; color: #94a3b8; }

  /* on screen the preview is shown bigger so it can be read */
  .idc-preview { zoom: 1.3; }

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
  .ix-page .mon-split.ibx-split.idq-split { height: calc(100vh / var(--fit, 1) - 320px); min-height: 400px; }
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
  .ix-page .mon-detail .idc-preview { zoom: 1.15; }
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