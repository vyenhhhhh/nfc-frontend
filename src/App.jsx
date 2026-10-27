//App.jsx
import { useState, useEffect, useRef } from "react";
import schoolLogo from "./assets/logo.png";      // CCIS logo
import csuLogo from "./assets/csu-logo.png";      // CSU seal
import campus from "./assets/campus.jpg";        // same photo as the login page
import { API, STORAGE } from "./config.js";
import { createPhoneReader, createHelperReader, phoneNfcSupported } from "./kioskReaders.js";

const RESET_MS = 6000; // how long the result stays on screen
const MIN_READING_MS = 650; // the shortest time "Reading your card..." shows (smooth, no flash)
// Secret that proves this screen is a real kiosk.
// Each kiosk gets its own key from the admin (Accounts → Kiosks): opening the setup link
// (…/?kiosk_key=XXXX) once saves it on this device. Without one, VITE_KIOSK_KEY from the .env is used
// (the same value as KIOSK_KEY in the Laravel .env = the main CCIS kiosk).
const KIOSK_STORE = "mytrack.kioskKey";
const kioskKey = () => {
  try {
    const url = new URL(window.location.href);
    const fromLink = url.searchParams.get("kiosk_key");
    if (fromLink) {
      localStorage.setItem(KIOSK_STORE, fromLink.trim());
      url.searchParams.delete("kiosk_key");                          // don't leave the key in the address bar
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
    return localStorage.getItem(KIOSK_STORE) || import.meta.env.VITE_KIOSK_KEY || "";
  } catch {
    return import.meta.env.VITE_KIOSK_KEY || "";
  }
};
const KIOSK_KEY = kioskKey();
// The NFC reader "types" a whole UID in a few milliseconds. A person typing is much slower,
// so a gap longer than this between keys means someone is typing by hand → ignore it.
const MAX_KEY_GAP_MS = 60;

// Which card reader this kiosk uses. Saved on the device; a link can set it: …/?reader=phone
//   auto    = ACR122U helper if it is running, the phone's NFC on an Android phone, else the old USB reader
//   phone   = Android phone/tablet NFC (Chrome)      acr122u = ACR122U with the helper program
//   usb     = only the old USB reader (types the UID, can't write the one-time code)
const READER_STORE = "mytrack.reader";
const readerMode = () => {
  try {
    const url = new URL(window.location.href);
    const fromLink = url.searchParams.get("reader");
    if (fromLink && ["auto", "phone", "acr122u", "usb"].includes(fromLink)) {
      localStorage.setItem(READER_STORE, fromLink);
      url.searchParams.delete("reader");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
    return localStorage.getItem(READER_STORE) || "auto";
  } catch {
    return "auto";
  }
};
const READER_MODE = readerMode();

// ── Offline taps ── when the internet (or the server) is down, the kiosk keeps the tap on this device
// with the time it really happened, and sends it by itself when it is back online.
const QUEUE_STORE = "mytrack.offlineTaps";
const NAME_STORE = "mytrack.cardNames";      // last names seen per card, to greet interns while offline
const readJson = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || "") ?? d; } catch { return d; } };
const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };
const loadQueue = () => { const q = readJson(QUEUE_STORE, []); return Array.isArray(q) ? q : []; };
const cachedName = (uid) => readJson(NAME_STORE, {})[uid] || null;
const rememberName = (uid, name, photo) => {
  if (!uid || !name) return;
  const m = readJson(NAME_STORE, {});
  m[uid] = { name, photo: photo || null };
  const keys = Object.keys(m);
  if (keys.length > 600) keys.slice(0, keys.length - 600).forEach((k) => delete m[k]);
  writeJson(NAME_STORE, m);
};
const manilaTime = (d) => d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true, timeZone: "Asia/Manila" });
const manilaDate = (d) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

const photoUrl = (p) => (!p ? null : /^https?:\/\//.test(p) ? p : STORAGE + p);

export default function App() {
  const [status, setStatus] = useState(null);   // last successful tap
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);  // accidental second tap within 5 minutes
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [time, setTime] = useState(new Date());
  const [photoBad, setPhotoBad] = useState(false);

  // card readers that can also write the one-time code (phone NFC / ACR122U)
  const [reader, setReader] = useState({ state: "idle", text: READER_MODE === "usb" ? "USB reader" : "Starting the card reader..." });
  const [readerFlash, setReaderFlash] = useState("");
  const writers = useRef({});        // { webnfc: phoneReader, acr122u: helperReader }
  const lastCard = useRef({ uid: "", at: 0 });
  const tapRef = useRef(null);       // the newest handleTap (the readers are set up once)
  const phoneRef = useRef(null);

  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(() => loadQueue().length);
  const syncing = useRef(false);

  const buffer = useRef("");
  const lastKey = useRef(0);
  const busy = useRef(false);
  const resetTimer = useRef(null);

  // this kiosk's name and who can tap here (set by the admin in Accounts → Kiosks)
  const [kiosk, setKiosk] = useState(null);   // { name, who } | { error }
  useEffect(() => {
    const load = () => fetch(`${API}/kiosk/info`, { headers: { Accept: "application/json", "X-Kiosk-Key": KIOSK_KEY } })
      .then(async (r) => { const d = await r.json().catch(() => ({})); setKiosk(r.ok ? d : { error: KIOSK_KEY ? "This device is not a registered kiosk" : "Kiosk not set up yet" }); })
      .catch(() => {});
    load();
    const iv = setInterval(load, 5 * 60 * 1000);   // picks up a new name from the admin
    return () => clearInterval(iv);
  }, []);

  // full screen (like F11). The button loses focus right after the click, so the reader's "Enter"
  // can't press it by accident.
  const [isFull, setIsFull] = useState(false);
  useEffect(() => {
    const on = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggleFull = (e) => {
    e.currentTarget.blur();
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
  };

  // clock
  useEffect(() => {
    const iv = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  // the NFC reader "types" the UID and presses Enter
  useEffect(() => {
    const onKey = (e) => {
      const t = performance.now();
      const gap = t - lastKey.current;
      lastKey.current = t;
      if (e.key === "Enter") {
        const uid = buffer.current.trim();
        buffer.current = "";
        if (uid.length >= 4 && gap <= MAX_KEY_GAP_MS) handleTap(uid);   // only the reader is this fast
      } else if (e.key.length === 1) {
        if (gap > MAX_KEY_GAP_MS) buffer.current = "";   // slow key = typed by hand: start over
        buffer.current += e.key;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line
  }, []);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  // start the phone NFC / ACR122U reader
  useEffect(() => {
    if (READER_MODE === "usb") return undefined;
    const onCard = ({ uid, card, writer }) => {
      if (!uid) return;
      const now = Date.now();
      if (lastCard.current.uid === uid && now - lastCard.current.at < 2500) return;   // the same card, still on the reader
      lastCard.current = { uid, at: now };
      tapRef.current?.(uid, { card, writer });
    };
    const onStatus = (st) => {
      setReader((r) => ({ ...r, ...st }));
      if (st.flash) { setReaderFlash(st.flash); setTimeout(() => setReaderFlash(""), 4000); }
    };
    const usePhone = READER_MODE === "phone" || (READER_MODE === "auto" && phoneNfcSupported());
    const useHelper = READER_MODE === "acr122u" || (READER_MODE === "auto" && !phoneNfcSupported());
    const started = [];
    if (usePhone) {
      const r = createPhoneReader({ onCard, onStatus });
      writers.current.webnfc = r; phoneRef.current = r; started.push(r);
      r.start();
    }
    if (useHelper) {
      const r = createHelperReader({ onCard, onStatus: (st) => {
        // in "auto" on a PC, no helper simply means the old USB reader is used
        if (READER_MODE === "auto" && st.state === "offline") { setReader({ state: "usb", text: "USB reader" }); return; }
        onStatus(st);
      } });
      writers.current.acr122u = r; started.push(r);
      r.start();
    }
    // keep the phone's screen on while it is the kiosk
    let lock = null;
    const wake = async () => { try { lock = await navigator.wakeLock?.request("screen"); } catch { /* not allowed */ } };
    if (usePhone) { wake(); document.addEventListener("visibilitychange", wake); }
    return () => {
      started.forEach((r) => r.stop());
      document.removeEventListener("visibilitychange", wake);
      try { lock?.release(); } catch { /* ignore */ }
    };
  }, []);

  // Chrome asks for NFC permission only after a button press
  const startPhoneNfc = async (e) => { e.currentTarget.blur(); await phoneRef.current?.start(); };

  // write the next one-time code on the card that is still on the reader, then tell the server
  const writeNextCode = async (writer, cw, uid) => {
    const w = writers.current[writer];
    if (!w || !cw?.payload) return { ok: false };
    const res = await w.write(cw.payload, 3500, uid);
    if (!res.ok) return res;
    for (let i = 0; i < 3; i++) {   // the card already has the new code: make sure the server hears it
      try {
        const r = await fetch(`${API}/tap/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", "X-Kiosk-Key": KIOSK_KEY },
          body: JSON.stringify({ card: cw.payload }),
        });
        if (r.ok || r.status === 409) break;
      } catch { /* retry */ }
      await new Promise((r) => setTimeout(r, 600));
    }
    return { ok: true };
  };

  const scheduleReset = () => {
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => { setStatus(null); setError(null); setWarning(null); }, RESET_MS);
  };

  // send the taps saved while offline, oldest first (their real time goes with them)
  const syncQueue = async () => {
    if (syncing.current) return;
    let q = loadQueue();
    if (!q.length) { setQueued(0); return; }
    syncing.current = true;
    try {
      while (q.length) {
        const t = q[0];
        let res;
        try {
          res = await fetch(`${API}/tap`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json", "X-Kiosk-Key": KIOSK_KEY },
            body: JSON.stringify({ uid: t.uid, offline_at: t.at }),
          });
        } catch { setOnline(false); break; }            // still offline: try again later
        if (res.status >= 500 || res.status === 429) { setOnline(res.status === 429); break; }
        setOnline(true);
        const d = await res.json().catch(() => ({}));
        q = loadQueue().filter((x) => x.id !== t.id);     // sent (recorded, or refused with a reason): done
        writeJson(QUEUE_STORE, q);
        setQueued(q.length);
        if (res.ok) {
          rememberName(t.uid, d.name, d.photo);
          setLog((prev) => prev.map((e) => (e.offlineId === t.id ? { ...d, synced: true } : e)));
        } else {
          setLog((prev) => prev.map((e) => (e.offlineId === t.id ? { ...e, action: "REFUSED", reason: d.message } : e)));
        }
        await new Promise((r) => setTimeout(r, 300));
      }
    } finally { syncing.current = false; }
  };
  const syncRef = useRef(syncQueue);
  syncRef.current = syncQueue;
  useEffect(() => {
    const go = () => syncRef.current();
    go();
    const iv = setInterval(go, 20000);
    window.addEventListener("online", go);
    return () => { clearInterval(iv); window.removeEventListener("online", go); };
  }, []);

  // the tap could not reach the server: keep it on this kiosk
  const saveOffline = (uid) => {
    const at = new Date();
    const t = { id: `${at.getTime()}-${Math.random().toString(36).slice(2, 7)}`, uid, at: at.toISOString() };
    const q = [...loadQueue(), t];
    writeJson(QUEUE_STORE, q);
    setQueued(q.length);
    setOnline(false);
    const known = cachedName(uid);
    const entry = { action: "OFFLINE", offlineId: t.id, uid, name: known?.name || null, photo: known?.photo || null,
      time: manilaTime(at), date: manilaDate(at), token: t.id };
    setLog((prev) => [entry, ...prev].slice(0, 50));
    return entry;
  };

  const handleTap = async (uid, extra = {}) => {
    if (busy.current) return;           // ignore double taps while one is processing
    busy.current = true;
    setLoading(true);
    setError(null);
    setWarning(null);
    setStatus(null);
    setPhotoBad(false);
    // keep "Reading your card..." up for a moment so the screen doesn't flash when the server is fast
    const t0 = performance.now();
    const hold = () => new Promise((r) => setTimeout(r, Math.max(0, MIN_READING_MS - (performance.now() - t0))));
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) throw new TypeError("offline");
      const res = await fetch(`${API}/tap`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", "X-Kiosk-Key": KIOSK_KEY },
        body: JSON.stringify({ uid, card: extra.card ?? null, writer: extra.writer ?? null }),
      });
      if (res.status >= 500) throw new TypeError("server down");   // the database can't be reached: keep the tap
      setOnline(true);
      const data = await res.json().catch(() => ({}));
      // phone / ACR122U: put the next one-time code on the card (the intern still holds it there)
      if (res.ok && data.card_write && extra.writer) {
        const w = await writeNextCode(extra.writer, data.card_write, uid);
        if (!w.ok) {
          data.note = [data.note, "Your time was recorded, but the card was moved away too soon to update it. It will update on your next tap."].filter(Boolean).join(" ");
        }
      }
      await hold();
      // nothing was recorded, just tell the intern why:
      //   DUPLICATE_TAP = tapped again within 5 minutes
      //   TAP_BLOCKED   = outside check-in hours, a weekend, or a holiday
      if (data.code === "DUPLICATE_TAP" || data.code === "TAP_BLOCKED") { setWarning(data); return; }
      if (!res.ok) throw new Error(data.message || "Server error");
      rememberName(uid, data.name, data.photo);
      setStatus(data);
      setLog((prev) => [data, ...prev].slice(0, 50));
      syncRef.current();                    // anything saved while offline goes now too
    } catch (err) {
      await hold();
      if (err instanceof TypeError) setStatus(saveOffline(uid));   // offline: saved on the kiosk, sent later
      else setError(err.message);
    } finally {
      setLoading(false);
      busy.current = false;
      scheduleReset();
    }
  };

  tapRef.current = handleTap;

  const isIn = status?.action === "CHECK_IN";
  const ins = log.filter((l) => l.action === "CHECK_IN").length;
  const outs = log.filter((l) => l.action === "CHECK_OUT").length;
  const src = photoUrl(status?.photo);

  const dateLabel = time.toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Manila" });

  const ampm = time.toLocaleTimeString("en-US", { hour: "numeric", timeZone: "Asia/Manila" }).slice(-2);
  const hour12 = time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Manila" }).replace(/\s?[AP]M$/, "");
  const mode = loading ? "reading" : status ? (status.action === "OFFLINE" ? "saved" : isIn ? "in" : "out") : warning ? "warn" : error ? "err" : "idle";
  const first = (n) => String(n || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="kq-page">
      <style>{css}</style>
      <img className="kq-bg" src={campus} alt="" />
      <div className="kq-shade" /><div className="kq-grain" />

      <div className="kq-wrap">
        {/* ───────── top bar: school · this kiosk · online ───────── */}
        <header className="kq-top kq-glass">
          <div className="kq-logos"><img src={csuLogo} alt="CSU" /><img src={schoolLogo} alt="CCIS" /></div>
          <div className="kq-brand"><b>Caraga State University</b><small>College of Computing and Information Sciences · MYTRACK</small></div>
          {kiosk?.error ? (
            <div className="kq-where bad"><span>{kiosk.error}. Ask the admin for this kiosk's setup link.</span></div>
          ) : kiosk ? (
            <div className="kq-where">
              <i><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></svg></i>
              <div><b>{kiosk.name}</b><small>{kiosk.who} can tap here</small></div>
            </div>
          ) : null}
          <div className={`kq-reader ${reader.state}`} title={reader.text}><i />{reader.text}</div>
          {online ? <div className="kq-live">Online</div> : <div className="kq-live off">Offline</div>}
          <button type="button" className="kq-full" onClick={toggleFull} title={isFull ? "Exit full screen (Esc)" : "Full screen (F11)"} aria-label={isFull ? "Exit full screen" : "Full screen"}>
            {isFull ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
            )}
          </button>
        </header>

        {/* ───────── left: clock, then the reader or the result ───────── */}
        <section className="kq-left">
          <div className="kq-clock">{hour12}<span>{ampm}</span></div>
          <div className="kq-date">{dateLabel}</div>

          <div className="kq-stage">
            {(mode === "idle" || mode === "reading") && (
              <div className="kq-idle">
                <div className={mode === "reading" ? "kq-scene reading" : "kq-scene"}>
                  <span className="kq-ring r3" /><span className="kq-ring r2" /><span className="kq-ring r1" />
                  <div className="kq-pad">
                    {mode === "reading" ? <div className="kq-spin" /> : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M8 8.5a5 5 0 0 1 0 7M12 6a8.5 8.5 0 0 1 0 12M16 3.5a12 12 0 0 1 0 17" /></svg>
                    )}
                    <span className="kq-led" />
                  </div>
                </div>
                <div className="kq-cta">
                  {mode === "reading" ? (
                    <><h1>Reading<br />your card...</h1><h2>Please keep it on the reader.</h2></>
                  ) : (
                    <>
                      <h1>Tap your<br />NFC card.</h1>
                      <h2>Time in when you arrive, time out when you leave.</h2>
                      <p>{writers.current.webnfc ? "Hold your ID card flat on the back of this phone until you see your name." : "Hold your ID card flat on the reader until you see your name."}</p>
                      <div className="kq-steps">
                        <div className="kq-glass"><b><em>1</em>Arrive</b>Tap to time in</div>
                        <div className="kq-glass"><b><em>2</em>Leave</b>Tap to time out</div>
                      </div>
                      {reader.state === "needs-permission" && (
                        <button type="button" className="kq-start" onClick={startPhoneNfc}>Start NFC</button>
                      )}
                      {readerFlash && <div className="kq-flash">{readerFlash}</div>}
                    </>
                  )}
                </div>
              </div>
            )}

            {(mode === "in" || mode === "out") && (
              <div className={`kq-result kq-glass ${mode}`} key={status.token}>
                <div className="kq-photo">
                  {src && !photoBad ? <img src={src} alt="" onError={() => setPhotoBad(true)} /> : <span>{first(status.name)}</span>}
                  <i><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg></i>
                </div>
                <div className="kq-res-text">
                  <div className="kq-k">{isIn ? "Time in recorded" : "Time out recorded"}</div>
                  <h1>{status.name || "Intern"}</h1>
                  <p>{isIn ? "Welcome! Have a good day at work." : "Thank you, see you next time!"}</p>
                  <div className="kq-meta">
                    <span>{isIn ? "Time in" : "Time out"} <b>{status.time}</b></span>
                    {status.date && <span>{status.date}</span>}
                    {status.uid && <span>Card ····{String(status.uid).slice(-4)}</span>}
                  </div>
                  {status.note && <div className="kq-note">{status.note}</div>}
                </div>
                <div className="kq-count"><i style={{ animationDuration: RESET_MS + "ms" }} /></div>
              </div>
            )}

            {mode === "saved" && (
              <div className="kq-result kq-glass saved" key={status.token}>
                <div className="kq-photo icon">
                  <svg width="58" height="58" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" /></svg>
                </div>
                <div className="kq-res-text">
                  <div className="kq-k">Saved on this kiosk</div>
                  <h1>{status.name || "Tap saved"}</h1>
                  <p>The kiosk is offline right now. Your tap was saved with the time <b>{status.time}</b> and will be sent automatically when the internet is back. No need to tap again.</p>
                  <div className="kq-meta"><span>Card ····{String(status.uid).slice(-4)}</span><span>{queued} waiting to send</span></div>
                </div>
                <div className="kq-count"><i style={{ animationDuration: RESET_MS + "ms" }} /></div>
              </div>
            )}

            {mode === "warn" && (
              <div className="kq-result kq-glass warn" key={"w" + warning.message}>
                <div className="kq-photo icon">
                  <svg width="58" height="58" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                </div>
                <div className="kq-res-text">
                  <div className="kq-k">{warning.code === "TAP_BLOCKED" ? "Not recorded" : "Already tapped"}</div>
                  {warning.name && <h1>{warning.name}</h1>}
                  <p>{warning.message}</p>
                </div>
                <div className="kq-count"><i style={{ animationDuration: RESET_MS + "ms" }} /></div>
              </div>
            )}

            {mode === "err" && (
              <div className="kq-result kq-glass err" key={error}>
                <div className="kq-photo icon">
                  <svg width="58" height="58" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v5M12 18h.01" /></svg>
                </div>
                <div className="kq-res-text">
                  <div className="kq-k">Card not accepted</div>
                  <h1 className="small">{error}</h1>
                  <p>If this keeps happening, tell your OJT coordinator or supervisor.</p>
                </div>
                <div className="kq-count"><i style={{ animationDuration: RESET_MS + "ms" }} /></div>
              </div>
            )}
          </div>

          <footer className="kq-foot">
            <span>MYTRACK · CSU CCIS OJT</span>
            {/* only while developing (npm run dev); it never appears in the built site */}
            {import.meta.env.DEV && (
              <button type="button" className="kq-test" onClick={(e) => { e.currentTarget.blur(); handleTap(import.meta.env.VITE_TEST_UID || "1248158722"); }} disabled={loading}>
                Simulate tap (test)
              </button>
            )}
            <span>Tapping for someone else is not allowed</span>
          </footer>
        </section>

        {/* ───────── right: taps on this kiosk ───────── */}
        <aside className="kq-side kq-glass">
          <div className="kq-side-h">
            <h3>Recent taps<small>On this kiosk since it was opened</small></h3>
            {log.length > 0 && <button type="button" className="kq-clear" onClick={(e) => { e.currentTarget.blur(); setLog([]); }}>Clear</button>}
          </div>
          {queued > 0 && (
            <div className="kq-queue"><b>{queued}</b> tap{queued === 1 ? "" : "s"} saved while offline · sent automatically when the internet is back</div>
          )}
          <div className="kq-nums">
            <div className="in"><b>{ins}</b><small>Time in</small></div>
            <div className="out"><b>{outs}</b><small>Time out</small></div>
          </div>
          <div className="kq-list">
            {log.length === 0 ? (
              <div className="kq-empty">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 8.5a5 5 0 0 1 0 7M12 6a8.5 8.5 0 0 1 0 12M16 3.5a12 12 0 0 1 0 17" /></svg>
                <b>No taps yet</b><small>Taps show up here as interns arrive.</small>
              </div>
            ) : log.map((e, i) => (
              <div key={e.token + i} className="kq-row">
                <span className="kq-av">{first(e.name)}</span>
                <div className="kq-row-t"><b>{e.name || e.uid}</b><small>{e.date}</small></div>
                <span className={e.action === "CHECK_IN" ? "kq-tag in" : e.action === "CHECK_OUT" ? "kq-tag out" : e.action === "OFFLINE" ? "kq-tag wait" : "kq-tag bad"}
                  title={e.reason || undefined}>
                  {e.action === "CHECK_IN" ? "IN" : e.action === "CHECK_OUT" ? "OUT" : e.action === "OFFLINE" ? "SAVED" : "NOT RECORDED"}
                </span>
                <time>{e.time}</time>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

const css = `
* { box-sizing: border-box; }
html, body, #root { margin: 0; height: 100%; }
.kq-page { --o: #f2733a; --o2: #e8582a; --peach: #ffb48f;
  position: fixed; inset: 0; overflow: hidden; background: #2a120a; color: #fff;
  font-family: 'Poppins', 'Segoe UI', system-ui, sans-serif; }
.kq-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 35%; }
.kq-shade { position: absolute; inset: 0; pointer-events: none; background:
  radial-gradient(circle at 62% 55%, rgba(242,115,58,.55), rgba(242,115,58,0) 38%),
  linear-gradient(105deg, rgba(26,11,5,.92) 0%, rgba(26,11,5,.70) 45%, rgba(150,52,20,.48) 100%),
  linear-gradient(0deg, rgba(26,11,5,.8) 0%, rgba(26,11,5,0) 45%); }
.kq-grain { position: absolute; inset: 0; pointer-events: none; opacity: .14; mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='.6'/></svg>"); }
.kq-glass { background: rgba(255,255,255,.12); backdrop-filter: blur(14px) saturate(140%); -webkit-backdrop-filter: blur(14px) saturate(140%);
  border: 1px solid rgba(255,255,255,.24); border-radius: 18px; box-shadow: 0 18px 40px rgba(0,0,0,.25); }
.kq-wrap { position: relative; z-index: 2; height: 100%; display: grid; grid-template-columns: minmax(0, 1fr) 360px; grid-template-rows: auto minmax(0, 1fr);
  gap: 24px 28px; padding: 24px 36px 26px; }

/* top bar */
.kq-top { grid-column: 1 / -1; display: flex; align-items: center; gap: 14px; padding: 12px 18px; min-width: 0; }
.kq-logos { display: flex; gap: 8px; flex: none; }
.kq-logos img { width: 42px; height: 42px; object-fit: contain; background: #fff; border-radius: 12px; padding: 3px; }
.kq-brand { min-width: 0; }
.kq-brand b { display: block; font-size: 17px; font-weight: 800; letter-spacing: -.2px; white-space: nowrap; }
.kq-brand small { font-size: 12px; color: rgba(255,255,255,.75); white-space: nowrap; }
.kq-where { margin-left: auto; display: flex; align-items: center; gap: 10px; padding: 7px 14px 7px 8px; border-radius: 14px;
  background: rgba(0,0,0,.18); border: 1px solid rgba(255,255,255,.18); min-width: 0; }
.kq-where i { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; flex: none; background: linear-gradient(135deg, #f2864f, #e8582a); }
.kq-where b { display: block; font-size: 13.5px; }
.kq-where small { font-size: 11.5px; color: var(--peach); }
.kq-where.bad { padding: 8px 14px; background: rgba(185,28,28,.35); border-color: rgba(252,165,165,.5); font-size: 12.5px; font-weight: 600; max-width: 420px; }
.kq-live { flex: none; display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 700; padding: 7px 13px; border-radius: 99px;
  background: rgba(34,197,94,.18); border: 1px solid rgba(134,239,172,.45); color: #bbf7d0; }
.kq-brand + .kq-live, .kq-brand + .kq-reader { margin-left: auto; }
/* which card reader this kiosk uses (phone NFC / ACR122U / USB) */
.kq-reader { flex: none; display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600; padding: 7px 13px; border-radius: 99px; max-width: 320px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.25); color: #fff; }
.kq-reader i { flex: none; width: 8px; height: 8px; border-radius: 50%; background: #fbbf24; }
.kq-reader.ready i { background: #4ade80; box-shadow: 0 0 8px #4ade80; }
.kq-reader.usb i { background: #93c5fd; }
.kq-reader:is(.error, .unsupported, .offline, .needs-permission) { background: rgba(185,28,28,.3); border-color: rgba(252,165,165,.5); }
.kq-reader:is(.error, .unsupported, .offline, .needs-permission) i { background: #f87171; }
.kq-start { margin-top: 18px; font: inherit; font-size: 18px; font-weight: 800; padding: 14px 30px; border-radius: 14px; border: 0; cursor: pointer;
  color: #7c2d12; background: #fff; box-shadow: 0 10px 30px rgba(0,0,0,.3); }
.kq-flash { margin-top: 14px; font-size: 14px; font-weight: 600; padding: 10px 14px; border-radius: 12px; background: rgba(185,28,28,.35); border: 1px solid rgba(252,165,165,.5); max-width: 420px; }
.kq-full { flex: none; width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; cursor: pointer; color: #fff;
  background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.28); transition: background .15s; }
.kq-full:hover { background: rgba(255,255,255,.24); }
.kq-full:focus-visible { outline: 2px solid var(--peach); outline-offset: 2px; }   /* no kiosk name yet */
.kq-live::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 10px #4ade80; animation: kq-blink 1.6s ease-in-out infinite; }

/* left */
.kq-left { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
.kq-clock { font-size: clamp(64px, 7vw, 104px); font-weight: 800; letter-spacing: -3px; line-height: 1; text-shadow: 0 4px 30px rgba(0,0,0,.35); font-variant-numeric: tabular-nums; }
.kq-clock span { font-size: .42em; letter-spacing: -1px; margin-left: 10px; color: var(--peach); }
.kq-date { font-size: 18px; font-weight: 600; color: var(--peach); margin-top: 8px; }
.kq-stage { flex: 1; display: flex; align-items: center; min-height: 0; padding: 10px 0; }
.kq-idle { display: flex; align-items: center; gap: clamp(28px, 5vw, 64px); }
.kq-scene { position: relative; width: 300px; height: 300px; flex: none; }
/* no backdrop blur on the pad: the rings animate behind it and a blur would be redrawn every frame (that was the lag) */
.kq-pad { position: absolute; left: 55px; top: 55px; width: 190px; height: 190px; border-radius: 52px; display: grid; place-items: center;
  background: linear-gradient(150deg, rgba(255,214,196,.34), rgba(255,255,255,.10)); border: 1px solid rgba(255,255,255,.45);
  box-shadow: 0 30px 60px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.5);
  transition: transform .35s cubic-bezier(.2,.8,.2,1), box-shadow .35s, border-color .35s; will-change: transform; }
.kq-scene.reading .kq-pad { transform: scale(.95); border-color: var(--peach); box-shadow: 0 18px 40px rgba(0,0,0,.35), 0 0 0 6px rgba(255,180,143,.18), inset 0 1px 0 rgba(255,255,255,.5); }
.kq-pad svg { transition: opacity .2s; }
.kq-pad svg { width: 70px; height: 70px; }
.kq-led { position: absolute; right: 20px; bottom: 20px; width: 11px; height: 11px; border-radius: 50%; background: var(--peach); box-shadow: 0 0 14px var(--peach); animation: kq-blink 2.4s ease-in-out infinite; }
.kq-ring { position: absolute; border: 2px solid rgba(255,255,255,.55); will-change: transform, opacity; backface-visibility: hidden; }
.kq-ring.r1 { left: 43px; top: 43px; width: 214px; height: 214px; border-radius: 62px; animation: kq-pulse 2.6s ease-out infinite; }
.kq-ring.r2 { left: 28px; top: 28px; width: 244px; height: 244px; border-radius: 74px; animation: kq-pulse 2.6s ease-out .35s infinite; }
.kq-ring.r3 { left: 12px; top: 12px; width: 276px; height: 276px; border-radius: 86px; animation: kq-pulse 2.6s ease-out .7s infinite; }
.kq-scene.reading .kq-ring { border-color: var(--peach); transition: border-color .3s; }
.kq-spin { width: 56px; height: 56px; border-radius: 50%; border: 5px solid rgba(255,255,255,.3); border-top-color: #fff; animation: kq-spin .8s linear infinite, kq-fade .2s ease-out; will-change: transform; }
.kq-cta h1 { margin: 0; font-size: clamp(36px, 3.6vw, 52px); font-weight: 800; letter-spacing: -1px; line-height: 1.05; text-shadow: 0 2px 24px rgba(0,0,0,.35); }
.kq-cta h2 { margin: 12px 0 0; font-size: 17px; font-weight: 600; color: var(--peach); }
.kq-cta p { margin: 8px 0 0; font-size: 14px; color: rgba(255,255,255,.82); max-width: 380px; line-height: 1.6; }
.kq-steps { display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
.kq-steps > div { padding: 10px 14px; font-size: 12.5px; line-height: 1.35; border-radius: 14px; }
.kq-steps b { display: block; font-size: 13.5px; }
.kq-steps em { font-style: normal; display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: #fff; color: var(--o2);
  font-size: 11px; font-weight: 800; margin-right: 6px; }

/* result card (after a tap) */
/* the result card has no live blur (it would be redrawn while it slides in); a darker glass instead */
.kq-result { position: relative; display: flex; align-items: center; gap: 30px; padding: 30px 34px 34px; max-width: 780px; width: 100%; overflow: hidden;
  backdrop-filter: none !important; -webkit-backdrop-filter: none !important; background: rgba(48,20,10,.62) !important;
  animation: kq-pop .45s cubic-bezier(.16,1,.3,1) both; will-change: transform, opacity; }
.kq-result .kq-photo { animation: kq-pop .5s cubic-bezier(.16,1,.3,1) .05s both; }
.kq-result .kq-photo i { animation: kq-badge .45s cubic-bezier(.34,1.56,.64,1) .25s both; }
.kq-result .kq-res-text > * { animation: kq-rise .4s cubic-bezier(.16,1,.3,1) both; }
.kq-result .kq-res-text > :nth-child(2) { animation-delay: .06s; }
.kq-result .kq-res-text > :nth-child(3) { animation-delay: .12s; }
.kq-result .kq-res-text > :nth-child(n+4) { animation-delay: .18s; }
.kq-photo { position: relative; width: 156px; height: 156px; flex: none; border-radius: 28px; display: grid; place-items: center;
  font-size: 64px; font-weight: 800; background: linear-gradient(135deg, #f2864f, #c2410c); border: 3px solid rgba(255,255,255,.7); }
.kq-photo img { width: 100%; height: 100%; object-fit: cover; border-radius: 25px; }
.kq-photo i { position: absolute; right: -12px; bottom: -12px; width: 50px; height: 50px; border-radius: 50%; display: grid; place-items: center;
  background: #22c55e; border: 4px solid #3a1a0e; }
.kq-result.out .kq-photo i { background: var(--o2); }
.kq-photo.icon { background: linear-gradient(135deg, #f59e0b, #b45309); }
.kq-result.err .kq-photo.icon { background: linear-gradient(135deg, #ef4444, #991b1b); }
.kq-res-text { min-width: 0; }
.kq-k { font-size: 13px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #86efac; }
.kq-result.out .kq-k { color: var(--peach); }
.kq-result.warn .kq-k { color: #fcd34d; }
.kq-result.err .kq-k { color: #fca5a5; }
.kq-res-text h1 { margin: 4px 0 0; font-size: clamp(30px, 3vw, 42px); font-weight: 800; letter-spacing: -.8px; line-height: 1.1; overflow-wrap: anywhere; }
.kq-res-text h1.small { font-size: 26px; letter-spacing: -.3px; }
.kq-res-text p { margin: 8px 0 0; font-size: 15px; line-height: 1.55; color: rgba(255,255,255,.88); }
.kq-meta { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
.kq-meta span { white-space: nowrap; font-size: 12.5px; padding: 6px 12px; border-radius: 10px; background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.2); }
.kq-meta b { color: var(--peach); }
.kq-note { margin-top: 12px; font-size: 13px; padding: 8px 12px; border-radius: 10px; background: rgba(0,0,0,.2); border-left: 3px solid var(--peach); }
.kq-count { position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: rgba(255,255,255,.12); }
.kq-count i { display: block; height: 100%; width: 100%; background: linear-gradient(90deg, #f2864f, #ffb48f); animation: kq-shrink linear forwards; transform-origin: left; will-change: transform; }
.kq-result.in .kq-count i { background: linear-gradient(90deg, #22c55e, #86efac); }

.kq-foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 11px; letter-spacing: .08em; font-weight: 600; color: rgba(255,255,255,.6); text-transform: uppercase; }
.kq-test { font: inherit; text-transform: none; letter-spacing: 0; font-size: 12px; padding: 6px 12px; border-radius: 10px; cursor: pointer;
  background: rgba(255,255,255,.14); color: #fff; border: 1px dashed rgba(255,255,255,.5); }

/* right: recent taps */
.kq-side { display: flex; flex-direction: column; gap: 14px; padding: 18px; min-height: 0; }
.kq-side-h { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.kq-side h3 { margin: 0; font-size: 16px; font-weight: 700; }
.kq-side h3 small { display: block; font-size: 11.5px; font-weight: 500; color: rgba(255,255,255,.7); }
.kq-clear { font: inherit; font-size: 11.5px; font-weight: 600; padding: 4px 10px; border-radius: 8px; cursor: pointer; color: #fff;
  background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.22); }
.kq-nums { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.kq-nums div { padding: 12px 14px; border-radius: 14px; background: rgba(255,255,255,.10); border: 1px solid rgba(255,255,255,.18); }
.kq-nums b { display: block; font-size: 30px; font-weight: 800; line-height: 1; }
.kq-nums small { font-size: 12px; color: rgba(255,255,255,.78); }
.kq-nums .in b { color: #86efac; } .kq-nums .out b { color: var(--peach); }
.kq-list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 2px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.3) transparent; }
.kq-row { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 12px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.12);
  animation: kq-rise .35s cubic-bezier(.16,1,.3,1) both; }
.kq-av { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; font-size: 14px; flex: none; background: linear-gradient(135deg, #f2864f, #e8582a); }
.kq-row-t { min-width: 0; flex: 1; }
.kq-row-t b { display: block; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kq-row-t small { font-size: 11px; color: rgba(255,255,255,.7); }
.kq-tag { font-size: 10.5px; font-weight: 700; padding: 3px 9px; border-radius: 99px; flex: none; }
.kq-tag.in { background: rgba(34,197,94,.22); color: #bbf7d0; } .kq-tag.out { background: rgba(255,180,143,.22); color: #ffd5c0; }
.kq-queue { font-size: 12px; line-height: 1.45; padding: 9px 12px; border-radius: 12px; background: rgba(251,191,36,.16); border: 1px solid rgba(253,230,138,.45); color: #fef3c7; }
.kq-queue b { font-size: 14px; color: #fde68a; }
.kq-tag.wait { background: rgba(251,191,36,.22); color: #fde68a; } .kq-tag.bad { background: rgba(248,113,113,.25); color: #fecaca; }
.kq-live.off { background: rgba(251,191,36,.18); border-color: rgba(253,230,138,.5); color: #fde68a; }
.kq-live.off::before { background: #fbbf24; box-shadow: 0 0 10px #fbbf24; }
.kq-result.saved .kq-photo.icon { background: linear-gradient(135deg, #fbbf24, #d97706); }
.kq-result.saved .kq-k { color: #fde68a; }
.kq-row time { font-size: 12px; font-weight: 700; flex: none; white-space: nowrap; }
.kq-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 4px;
  border: 1px dashed rgba(255,255,255,.25); border-radius: 14px; color: rgba(255,255,255,.8); padding: 20px; }
.kq-empty svg { color: var(--peach); margin-bottom: 6px; }
.kq-empty b { font-size: 14px; } .kq-empty small { font-size: 12px; color: rgba(255,255,255,.65); }

@keyframes kq-blink { 50% { opacity: .35; } }
@keyframes kq-pulse { 0% { opacity: 0; transform: scale(.92); } 25% { opacity: .65; } 100% { opacity: 0; transform: scale(1.1); } }
@keyframes kq-spin { to { transform: rotate(360deg); } }
@keyframes kq-in { from { opacity: 0; transform: translateY(10px) scale(.98); } }
@keyframes kq-shrink { from { transform: scaleX(1); } to { transform: scaleX(0); } }
@keyframes kq-pop { from { opacity: 0; transform: translateY(14px) scale(.96); } to { opacity: 1; transform: none; } }
@keyframes kq-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes kq-badge { from { opacity: 0; transform: scale(.3); } to { opacity: 1; transform: scale(1); } }
@keyframes kq-fade { from { opacity: 0; } }

/* smaller screens: the recent taps go under; phones (Android kiosk) show only the essentials */
@media (max-width: 1100px) {
  .kq-wrap { grid-template-columns: 1fr; grid-template-rows: auto auto minmax(0, 1fr); padding: 18px 20px; overflow-y: auto; }
  .kq-side { min-height: 260px; }
  .kq-brand small { display: none; }
}
@media (max-width: 700px) {
  .kq-top { flex-wrap: wrap; }
  .kq-where { margin-left: 0; order: 3; width: 100%; }
  .kq-reader { order: 4; max-width: 100%; }
  .kq-idle { flex-direction: column; text-align: center; gap: 10px; }
  .kq-scene { transform: scale(.72); margin: -40px 0; }
  .kq-left { min-height: auto; }
  .kq-stage { flex: none; padding: 26px 0 10px; }
  .kq-clock { font-size: 56px; }
  .kq-steps { justify-content: center; }
  .kq-result { flex-direction: column; text-align: center; padding: 24px 20px 28px; }
  .kq-meta { justify-content: center; }
  .kq-foot span:last-child { display: none; }
  .kq-foot { margin-top: 14px; }
}
@media (prefers-reduced-motion: reduce) {
  .kq-ring, .kq-led, .kq-live::before, .kq-result, .kq-result *, .kq-row { animation: none !important; }
  .kq-count i { animation: kq-shrink linear forwards !important; }
}
`;