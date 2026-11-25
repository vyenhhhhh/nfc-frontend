//CardAlerts.jsx
import { useState, useEffect } from "react";
import { Icon, Spinner, Badge, Table, Msg, confirmBox } from "./DashKit.jsx";
import { API } from "../config.js";

/* Copied / tampered card alerts. Every tap on an ACR122U kiosk checks the card's one-time code
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
    if (action === "reset" && !(await confirmBox({ title: "Reset this card?", message: `Reset ${f.intern_name || "this"} card? Do this only with the intern's real card in front of you, and have them tap it at the kiosk right away: the first card tapped after a reset gets the new code. If you think the card was copied, give a replacement card instead.`, ok: "Yes, reset" }))) return;
    if (action === "dismiss" && f.nfc_card_id && !(await confirmBox({ title: "Dismiss this alert?", message: `The card is unlocked and works again with the code it has now. Dismiss only if you are sure it was a false alarm.`, ok: "Yes, dismiss" }))) return;
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
      <div className="ca-in">
      <h3>
        <Icon name="warn" size={16} /> Card alerts <span className="ca-n">{open}</span>
        {data?.cards && <span className="ca-sec">{data.cards.secured} of {data.cards.total} cards protected</span>}
      </h3>
      <p className="ca-hint">
        {data && data.ready === false
          ? "Run the latest migration on the server to turn this on."
          : "ACR122U kiosks write a new one-time code on the card at every tap. A copied card has an old code, so it is refused and shows up here. The card is then locked (the real card and any copy) until you reset it, dismiss the alert, or release a replacement card."}
      </p>
      <Msg msg={msg} />
      {!data ? <Spinner /> : (
        <>
          <div className={`ca-body${flags.length === 0 ? " empty" : ""}`}>
          <Table
            headers={["Intern", "What happened", ""]}
            empty={showDone ? "No card alerts yet." : "No open card alerts."}
            rows={flags.map((f) => [
              <span>{f.intern_name ? <><b>{f.intern_name}</b>{f.student_id ? <small className="ca-sub">{f.student_id}</small> : null}</> : <>UID {f.uid}</>}
                {!f.resolved_at && f.nfc_card_id && <span className="ca-lock"><Badge label="Card locked" type="rejected" /></span>}</span>,
              <span title={f.details || ""}>{REASON[f.reason] || f.reason}
                <small className="ca-sub">{when(f.created_at)} · {f.kiosk || "kiosk not named"} · card UID {f.uid}</small></span>,
              f.resolved_at ? <Badge label={f.resolution === "reset" ? "Card reset" : f.resolution === "replaced" ? "Card replaced" : "Dismissed"} type="approved" /> : (
                <span className="ca-acts">
                  {/* Dismiss is always the last button, so it lines up in every row */}
                  {f.nfc_card_id && <button type="button" className="ix-b primary sm" disabled={!!busy} onClick={() => resolve(f, "reset")}>Reset card</button>}
                  <button type="button" className="ix-b ghost sm" disabled={!!busy} onClick={() => resolve(f, "dismiss")}>Dismiss</button>
                </span>
              ),
            ])}
          />
          </div>
          <button type="button" className="ix-b ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => setShowDone((v) => !v)}>
            {showDone ? "Hide closed alerts" : "Show closed alerts"}
          </button>
        </>
      )}
      </div>
    </div>
  );
}

const CA_CSS = `
  /* works inside the slide-in panel and on a page: same border, radius and spacing as the other cards */
  .ca-card { box-sizing: border-box; padding: 0 !important; margin: 0 !important; overflow: hidden; background: #fff; border: 1px solid #e8ebf0 !important; border-radius: 12px; box-shadow: none; }
  .ca-card .ca-in { padding: 18px 20px 20px; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
  .ca-card .ca-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
  .ca-card .ca-body.empty { display: flex; flex-direction: column; justify-content: center; }
  .ca-card .ca-in > .ix-b { margin-top: 16px; flex: none; }
  /* no box in the slide-in panel: the content sits straight on the panel, the closed-alerts button at the bottom */
  .ix-drawer-body:has(.ca-card) .ca-card { border: 0 !important; border-radius: 0; background: transparent; }
  .ix-drawer-body:has(.ca-card) .ca-card .ca-in { padding: 4px 0 0; }
  /* inside the slide-in panel the card fills the panel down to the bottom, like the other pages */
  .ix-drawer-body:has(.ca-card) { display: flex; flex-direction: column; }
  .ix-drawer-body:has(.ca-card) > div { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
  .ix-drawer-body:has(.ca-card) .ca-card { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
  .ca-card h3 { margin: 0 0 6px; font-size: 14.5px; font-weight: 700; color: #111827; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .ca-n { font-size: 11px; padding: 1px 8px; border-radius: 99px; background: #f3f4f6; color: #4b5563; }
  .ca-sec { margin-left: auto; font-size: 11.5px; font-weight: 600; color: #15803d; background: #e6f7ee; padding: 2px 10px; border-radius: 99px; white-space: nowrap; }
  .ca-hint { display: block; margin: 0 0 16px; padding-bottom: 16px; border-bottom: 1px solid #eef0f3; font-size: 12px; line-height: 1.55; color: #8b919b; }
  .ca-sub { display: block; font-size: 11px; color: #94a3b8; }
  .ca-lock { display: block; margin-top: 6px; }
  .ca-acts { display: inline-flex; gap: 8px; flex-wrap: nowrap; justify-content: flex-end; align-items: center; }
  /* the buttons column: as narrow as its buttons, on one line, right-aligned in every row */
  .ca-card .ix-table td:last-child { width: 1%; white-space: nowrap; text-align: right; }
  .ca-card .ix-table td { vertical-align: middle; }
  .ca-card .ix-table { width: 100%; table-layout: auto; }
  .ca-card .ix-table td:not(:last-child), .ca-card .ix-table td:not(:last-child) * { white-space: normal !important; overflow-wrap: anywhere; }
  .ca-card .ix-table-wrap { overflow-x: visible; }
  .ca-card .ix-table td:first-child { min-width: 150px; }
  .ca-card .ix-table td:first-child b { white-space: nowrap !important; }
  .ca-card .ca-sub { line-height: 1.5; margin-top: 2px; }
`;