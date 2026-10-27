//CardAlerts.jsx
import { useState, useEffect } from "react";
import { Icon, Spinner, Badge, Table, Msg } from "./DashKit.jsx";
import { API } from "../config.js";

/* Copied / tampered card alerts. Every tap on a phone or ACR122U kiosk checks the card's one-time code
   and writes a new one; an old or missing code means a copied card (see CardSecurity.php). */
export default function CardAlerts() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const load = () => fetch(`${API}/card-flags`, { headers: { Accept: "application/json" } })
    .then((r) => r.json()).then((d) => setData(d && Array.isArray(d.flags) ? d : { flags: [], cards: { total: 0, secured: 0 } }))
    .catch(() => setData({ flags: [], cards: { total: 0, secured: 0 } }));
  useEffect(() => { load(); const iv = setInterval(load, 30000); return () => clearInterval(iv); }, []);

  const resolve = async (f, action) => {
    if (action === "reset" && !window.confirm(`Reset ${f.intern_name || "this"} card? Do this only after checking the intern has the real card with them. The card gets a new code on its next tap at a phone or ACR122U kiosk.`)) return;
    setBusy(f.id + action); setMsg(null);
    try {
      const res = await fetch(`${API}/card-flags/${f.id}/resolve`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ action }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message || "Something went wrong.");
      setMsg({ type: "success", text: d.message }); load();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
    } finally { setBusy(null); }
  };

  const REASON = {
    old_token: "Old one-time code (copied card)",
    missing_token: "No code on the card (copied or erased)",
    copied_to_other_card: "Card data found on another card",
    unknown_card: "Unknown or replaced card",
  };
  const when = (v) => (v ? new Date(String(v).replace(" ", "T")).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");
  const flags = (data?.flags || []).filter((f) => showDone || !f.resolved_at);
  const open = (data?.flags || []).filter((f) => !f.resolved_at).length;

  return (
    <div className="ix-card ca-card">
      <style>{CA_CSS}</style>
      <h3>
        <Icon name="warn" size={16} /> Card alerts <span className="ca-n">{open}</span>
        {data?.cards && <span className="ca-sec">{data.cards.secured} of {data.cards.total} cards protected</span>}
      </h3>
      <p className="ca-hint" style={{ margin: "0 0 10px" }}>
        {data && data.ready === false
          ? "Run the latest migration on the server to turn this on."
          : "Phone and ACR122U kiosks write a new one-time code on the card at every tap. A copied card has an old code, so it is refused and shows up here."}
      </p>
      <Msg msg={msg} />
      {!data ? <Spinner /> : (
        <>
          <Table
            headers={["When", "Intern", "What happened", "Kiosk", ""]}
            empty={showDone ? "No card alerts yet." : "No open card alerts."}
            rows={flags.map((f) => [
              when(f.created_at),
              f.intern_name ? <span><b>{f.intern_name}</b>{f.student_id ? <small className="ca-sub">{f.student_id}</small> : null}</span> : <span>UID {f.uid}</span>,
              <span title={f.details || ""}>{REASON[f.reason] || f.reason}</span>,
              f.kiosk || "—",
              f.resolved_at ? <Badge label={f.resolution === "reset" ? "Card reset" : "Dismissed"} type="approved" /> : (
                <span className="ca-acts">
                  <button type="button" className="ix-b ghost sm" disabled={!!busy} onClick={() => resolve(f, "dismiss")}>Dismiss</button>
                  {f.nfc_card_id && <button type="button" className="ix-b primary sm" disabled={!!busy} onClick={() => resolve(f, "reset")}>Reset card</button>}
                </span>
              ),
            ])}
          />
          <button type="button" className="ix-b ghost sm" style={{ marginTop: 10 }} onClick={() => setShowDone((v) => !v)}>
            {showDone ? "Hide closed alerts" : "Show closed alerts"}
          </button>
        </>
      )}
    </div>
  );
}

const CA_CSS = `
  .ix-page .ix-content .ca-card { padding: 16px 18px !important; }
  .ix-page .ca-card h3 { margin: 0 0 4px; font-size: 14.5px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
  .ix-page .ca-n { font-size: 11px; padding: 1px 8px; border-radius: 99px; background: #f3ede9; color: #6b5b52; }
  .ix-page .ca-sec { margin-left: auto; font-size: 11.5px; font-weight: 600; color: #15803d; background: #e6f7ee; padding: 2px 10px; border-radius: 99px; }
  .ix-page .ca-hint { display: block; font-size: 11.5px; color: #94a3b8; }
  .ix-page .ca-sub { display: block; font-size: 11px; color: #94a3b8; }
  .ix-page .ca-acts { display: inline-flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
`;