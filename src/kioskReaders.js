//kioskReaders.js
// Card readers the kiosk can use. All of them call onCard({ uid, card, writer }):
//   uid    = the card's serial number (hex, e.g. "E2864A4A")
//   card   = what MYTRACK wrote on the card ("MT1.<id>.<one-time code>"), or null for a card not protected yet
//   writer = "webnfc" | "acr122u"  (these two can also WRITE the next one-time code on the card)
//
//  1. Phone (Web NFC): Chrome on an Android phone/tablet with NFC. Needs HTTPS (or the Chrome flag
//     "Insecure origins treated as secure" for the laptop's address while testing on Wi-Fi).
//  2. ACR122U: the small helper program on the kiosk PC (tools/acr122u-helper) reads and writes the card
//     and talks to this page on ws://127.0.0.1:47123.
//  3. The old USB reader that "types" the UID stays handled in App.jsx (it can't write).

export const CARD_MIME = "application/x-mytrack";
export const HELPER_URL = "ws://127.0.0.1:47123";

const hexUid = (s) => String(s || "").replace(/[^0-9a-f]/gi, "").toUpperCase();

// ───────────────────────── Phone (Web NFC) ─────────────────────────
export const phoneNfcSupported = () => typeof window !== "undefined" && "NDEFReader" in window;

export function createPhoneReader({ onCard, onStatus }) {
  let reader = null;
  let scanAbort = null;

  const start = async () => {
    if (!phoneNfcSupported()) {
      onStatus({ state: "unsupported", text: window.isSecureContext ? "This browser has no NFC (use Chrome on Android)" : "Phone NFC needs HTTPS (see the setup guide)" });
      return false;
    }
    try {
      reader = new window.NDEFReader();
      scanAbort = new AbortController();
      await reader.scan({ signal: scanAbort.signal });
      reader.onreading = (e) => {
        let card = null;
        for (const r of e.message?.records || []) {
          if (r.recordType === "mime" && r.mediaType === CARD_MIME && r.data) {
            card = new TextDecoder().decode(r.data).trim();
            break;
          }
        }
        onCard({ uid: hexUid(e.serialNumber), card, writer: "webnfc" });
      };
      reader.onreadingerror = () => onStatus({ state: "ready", text: "Phone NFC ready", flash: "Couldn't read the card. Hold it still on the back of the phone and try again." });
      onStatus({ state: "ready", text: "Phone NFC ready" });
      return true;
    } catch (err) {
      // the first time, Chrome needs a tap on a button to allow NFC
      onStatus({ state: err?.name === "NotAllowedError" ? "needs-permission" : "error", text: err?.name === "NotAllowedError" ? "Tap “Start NFC” to allow the card reader" : `NFC error: ${err?.message || err}` });
      return false;
    }
  };

  // writes the next one-time code on the card that is still on the phone
  const write = async (payload, ms = 3500) => {
    if (!reader) return { ok: false, error: "NFC is not running" };
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try {
      await reader.write(
        { records: [{ recordType: "mime", mediaType: CARD_MIME, data: new TextEncoder().encode(payload) }] },
        { signal: ctl.signal, overwrite: true },
      );
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err?.name === "AbortError" ? "The card was taken away too early" : (err?.message || String(err)) };
    } finally {
      clearTimeout(timer);
    }
  };

  const stop = () => { try { scanAbort?.abort(); } catch { /* ignore */ } reader = null; };
  return { kind: "phone", start, write, stop };
}

// ───────────────────────── ACR122U (helper program) ─────────────────────────
export function createHelperReader({ onCard, onStatus, url = HELPER_URL }) {
  let ws = null;
  let stopped = false;
  let retry = null;
  let seq = 0;
  const waiting = new Map();   // write id → resolve

  const connect = () => {
    if (stopped) return;
    try { ws = new WebSocket(url); } catch { schedule(); return; }
    ws.onopen = () => onStatus({ state: "connecting", text: "ACR122U helper connected, looking for the reader..." });
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type === "reader") {
        onStatus(m.connected ? { state: "ready", text: "ACR122U ready" } : { state: "error", text: "ACR122U helper is running, but no reader is plugged in" });
      } else if (m.type === "card") {
        if (m.error) onStatus({ state: "ready", text: "ACR122U ready", flash: "Couldn't read the card. Take it away and tap again." });
        else onCard({ uid: hexUid(m.uid), card: m.payload || null, writer: "acr122u" });
      } else if (m.type === "written") {
        const done = waiting.get(m.id);
        if (done) { waiting.delete(m.id); done({ ok: !!m.ok, error: m.error }); }
      }
    };
    ws.onclose = () => {
      waiting.forEach((done) => done({ ok: false, error: "The reader helper closed" }));
      waiting.clear();
      if (!stopped) { onStatus({ state: "offline", text: "ACR122U helper not running" }); schedule(); }
    };
    ws.onerror = () => { /* onclose follows */ };
  };
  const schedule = () => { clearTimeout(retry); retry = setTimeout(connect, 3000); };

  const start = async () => { stopped = false; connect(); return true; };

  const write = (payload, ms = 3500, uid = "") => new Promise((resolve) => {
    if (!ws || ws.readyState !== 1) { resolve({ ok: false, error: "The reader helper is not connected" }); return; }
    const id = ++seq;
    const timer = setTimeout(() => { waiting.delete(id); resolve({ ok: false, error: "The card was taken away too early" }); }, ms);
    waiting.set(id, (r) => { clearTimeout(timer); resolve(r); });
    ws.send(JSON.stringify({ type: "write", id, uid, payload }));
  });

  const stop = () => { stopped = true; clearTimeout(retry); try { ws?.close(); } catch { /* ignore */ } };
  return { kind: "acr122u", start, write, stop };
}