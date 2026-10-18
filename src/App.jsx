//App.jsx
import { useState, useEffect, useRef } from "react";
import schoolLogo from "./assets/logo.png";
import { API, STORAGE } from "./config.js";

const RESET_MS = 6000; // how long the result stays on screen
// Secret that proves this screen is the real kiosk (same value as KIOSK_KEY in the Laravel .env)
const KIOSK_KEY = import.meta.env.VITE_KIOSK_KEY || "";
// The NFC reader "types" a whole UID in a few milliseconds. A person typing is much slower,
// so a gap longer than this between keys means someone is typing by hand → ignore it.
const MAX_KEY_GAP_MS = 60;

const photoUrl = (p) => (!p ? null : /^https?:\/\//.test(p) ? p : STORAGE + p);

export default function App() {
  const [status, setStatus] = useState(null);   // last successful tap
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);  // accidental second tap within 5 minutes
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [time, setTime] = useState(new Date());
  const [photoBad, setPhotoBad] = useState(false);

  const buffer = useRef("");
  const lastKey = useRef(0);
  const busy = useRef(false);
  const resetTimer = useRef(null);

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

  const scheduleReset = () => {
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => { setStatus(null); setError(null); setWarning(null); }, RESET_MS);
  };

  const handleTap = async (uid) => {
    if (busy.current) return;           // ignore double taps while one is processing
    busy.current = true;
    setLoading(true);
    setError(null);
    setWarning(null);
    setStatus(null);
    setPhotoBad(false);
    try {
      const res = await fetch(`${API}/tap`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", "X-Kiosk-Key": KIOSK_KEY },
        body: JSON.stringify({ uid }),
      });
      const data = await res.json().catch(() => ({}));
      // nothing was recorded, just tell the intern why:
      //   DUPLICATE_TAP = tapped again within 5 minutes
      //   TAP_BLOCKED   = outside check-in hours, a weekend, or a holiday
      if (data.code === "DUPLICATE_TAP" || data.code === "TAP_BLOCKED") { setWarning(data); return; }
      if (!res.ok) throw new Error(data.message || "Server error");
      setStatus(data);
      setLog((prev) => [data, ...prev].slice(0, 50));
    } catch (err) {
      setError(err instanceof TypeError ? "Can't reach the server. Please tell the OJT coordinator." : err.message);
    } finally {
      setLoading(false);
      busy.current = false;
      scheduleReset();
    }
  };

  const isIn = status?.action === "CHECK_IN";
  const ins = log.filter((l) => l.action === "CHECK_IN").length;
  const outs = log.length - ins;
  const src = photoUrl(status?.photo);

  const dateLabel = time.toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Manila" });
  const clock = time.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Manila" });

  return (
    <div className="kx-page">
      <style>{css}</style>

      <div className="kx-layout">
        {/* ───────── LEFT: scanner ───────── */}
        <section className="kx-main">
          <header className="kx-head">
            <img src={schoolLogo} alt="CSU logo" className="kx-logo" />
            <div className="kx-brand">
              <strong>Caraga State University</strong>
              <span>College of Computing and Information Sciences</span>
            </div>
            <div className="kx-live"><i /> Online</div>
          </header>

          <div className="kx-clock">
            <div className="kx-time">{clock}</div>
            <div className="kx-date">{dateLabel}</div>
          </div>

          <div className="kx-stage">
            {/* idle / reading */}
            {!status && !error && !warning && (
              <div className={loading ? "kx-scan reading" : "kx-scan"}>
                <div className="kx-ring">
                  <span className="kx-wave w1" /><span className="kx-wave w2" /><span className="kx-wave w3" />
                  <div className="kx-core">
                    {loading ? (
                      <div className="kx-spin" />
                    ) : (
                      <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M8 8.5a5 5 0 0 1 0 7M12 6a8.5 8.5 0 0 1 0 12M16 3.5a12 12 0 0 1 0 17" />
                      </svg>
                    )}
                  </div>
                </div>
                <h1>{loading ? "Reading your card..." : "Tap your NFC card"}</h1>
                <p>{loading ? "Please wait a moment." : "Hold your card on the reader to log your attendance."}</p>
              </div>
            )}

            {/* success */}
            {status && !loading && (
              <div className={isIn ? "kx-result in" : "kx-result out"} key={status.token}>
                <div className="kx-photo">
                  {src && !photoBad
                    ? <img src={src} alt="" onError={() => setPhotoBad(true)} />
                    : <span>{(status.name || "?").charAt(0).toUpperCase()}</span>}
                  <i className="kx-tick">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
                  </i>
                </div>
                <span className="kx-chip">{isIn ? "Checked in" : "Checked out"}</span>
                <h2>{isIn ? "Welcome," : "Goodbye,"} <b>{status.name || "Intern"}</b></h2>
                <div className="kx-when">
                  <strong>{status.time}</strong>
                  <span>{status.date}</span>
                </div>
                {status.note && <div className="kx-note">{status.note}</div>}
                <small className="kx-uid">Card ····{String(status.uid || "").slice(-4)}</small>
                <div className="kx-count"><i style={{ animationDuration: RESET_MS + "ms" }} /></div>
              </div>
            )}

            {/* duplicate tap warning */}
            {warning && !loading && (
              <div className="kx-result warn" key={"w" + warning.message}>
                <div className="kx-photo warn">
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                </div>
                <span className="kx-chip">{warning.code === "TAP_BLOCKED" ? "Check-in closed" : "Already tapped"}</span>
                {warning.name && <h2><b>{warning.name}</b></h2>}
                <p className="kx-warn-text">{warning.message}</p>
                <div className="kx-count"><i style={{ animationDuration: RESET_MS + "ms" }} /></div>
              </div>
            )}

            {/* error */}
            {error && !loading && (
              <div className="kx-result err" key={error}>
                <div className="kx-photo bad">
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v5M12 18h.01" /></svg>
                </div>
                <span className="kx-chip">Card not accepted</span>
                <h2>{error}</h2>
                <div className="kx-count"><i style={{ animationDuration: RESET_MS + "ms" }} /></div>
              </div>
            )}
          </div>

          <footer className="kx-foot">
            <span>MYTRACK · CSU CCIS OJT</span>
            {/* only while developing (npm run dev); it never appears in the built site */}
            {import.meta.env.DEV && (
              <button type="button" className="kx-test" onClick={() => handleTap(import.meta.env.VITE_TEST_UID || "1248158722")} disabled={loading}>
                Simulate tap (test)
              </button>
            )}
          </footer>
        </section>

        {/* ───────── RIGHT: log ───────── */}
        <aside className="kx-side">
          <div className="kx-side-head">
            <div>
              <h3>Attendance log</h3>
              <p>This kiosk, this session</p>
            </div>
            <span className="kx-count-pill">{log.length}</span>
          </div>

          <div className="kx-stats">
            <div className="in"><strong>{ins}</strong><span>Checked in</span></div>
            <div className="out"><strong>{outs}</strong><span>Checked out</span></div>
          </div>

          <div className="kx-list">
            {log.length === 0 ? (
              <div className="kx-empty">
                <div className="kx-empty-ic">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></svg>
                </div>
                <strong>No taps yet</strong>
                <span>Taps will appear here as interns arrive.</span>
              </div>
            ) : (
              log.map((e, i) => (
                <div key={e.token + i} className="kx-row">
                  <span className={e.action === "CHECK_IN" ? "kx-tag in" : "kx-tag out"}>
                    {e.action === "CHECK_IN" ? "IN" : "OUT"}
                  </span>
                  <div className="kx-row-text">
                    <strong>{e.name || e.uid}</strong>
                    <small>{e.date}</small>
                  </div>
                  <time>{e.time}</time>
                </div>
              ))
            )}
          </div>

          {log.length > 0 && (
            <button type="button" className="kx-clear" onClick={() => setLog([])}>Clear log</button>
          )}
        </aside>
      </div>
    </div>
  );
}

const css = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Figtree:wght@400;500;600;700&display=swap');

* { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #root { height: 100%; }
body { background: #ffede5; }

.kx-page {
  --o: #e8582a; --o2: #f2733a; --ink: #1b1410; --mut: #8a7468;
  --disp: 'Bricolage Grotesque', 'Figtree', sans-serif;
  height: 100vh; min-height: 620px; padding: 20px; display: flex; align-items: center; justify-content: center;
  font-family: 'Figtree', 'Segoe UI', sans-serif; color: var(--ink);
  background:
    radial-gradient(620px 420px at 92% -6%, rgba(242,115,58,.28), transparent 70%),
    radial-gradient(560px 420px at -6% 106%, rgba(255,181,140,.5), transparent 70%),
    #ffede5;
}
.kx-layout { width: 100%; max-width: 1180px; height: 100%; max-height: 760px; display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 18px; }

/* thin orange scrollbar, same as the dashboards */
.kx-page * { scrollbar-width: thin; scrollbar-color: #e8582a #fdeee7; }
.kx-page *::-webkit-scrollbar { width: 6px; height: 6px; }
.kx-page *::-webkit-scrollbar-track { background: #fdeee7; border-radius: 99px; }
.kx-page *::-webkit-scrollbar-thumb { background: #e8582a; border-radius: 99px; }
.kx-page *::-webkit-scrollbar-thumb:hover { background: #d94a1c; }

/* ───── main card ───── */
.kx-main {
  position: relative; overflow: hidden; display: flex; flex-direction: column; padding: 22px 28px 18px;
  background: #fff; border-radius: 24px; box-shadow: 0 18px 44px rgba(150,52,20,.14), 0 1px 2px rgba(27,20,16,.04);
}
.kx-main::before {
  content: ""; position: absolute; left: 0; right: 0; top: 0; height: 5px;
  background: linear-gradient(90deg, #f2733a, #ffb48f, #f59e0b, #f2733a);
}
.kx-head { display: flex; align-items: center; gap: 14px; }
.kx-logo { width: 58px; height: 58px; object-fit: contain; flex-shrink: 0; }
.kx-brand { display: flex; flex-direction: column; min-width: 0; padding-left: 14px; border-left: 1px solid #f1e2d9; }
.kx-brand strong { font-family: var(--disp); font-size: 22px; font-weight: 800; letter-spacing: -.4px; line-height: 1.1; }
.kx-brand span { font-size: 12.5px; color: var(--mut); margin-top: 3px; }
.kx-live { margin-left: auto; display: inline-flex; align-items: center; gap: 7px; padding: 5px 13px; border-radius: 99px; background: #ecfdf3; color: #15803d; font-size: 12px; font-weight: 700; }
.kx-live i { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; animation: kx-blink 1.6s ease-in-out infinite; }

.kx-clock { text-align: center; margin-top: 14px; }
.kx-time { font-family: var(--disp); font-size: 54px; font-weight: 800; letter-spacing: -1.5px; line-height: 1; font-variant-numeric: tabular-nums; color: var(--o); }
.kx-date { font-size: 14px; font-weight: 600; color: var(--mut); margin-top: 6px; }

.kx-stage { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; }

/* idle scanner */
.kx-scan { text-align: center; display: flex; flex-direction: column; align-items: center; }
.kx-scan h1 { font-family: var(--disp); font-size: 30px; font-weight: 800; letter-spacing: -.6px; margin-top: 26px; }
.kx-scan p { font-size: 14.5px; color: var(--mut); margin-top: 6px; }
.kx-ring { position: relative; width: 170px; height: 170px; display: flex; align-items: center; justify-content: center; }
.kx-core {
  position: relative; z-index: 2; width: 112px; height: 112px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  color: #fff; background: linear-gradient(135deg, #f2733a, #e04a1a); box-shadow: 0 16px 32px rgba(232,88,42,.38);
}
.kx-wave { position: absolute; inset: 0; border-radius: 50%; border: 2px solid rgba(232,88,42,.45); animation: kx-wave 2.8s ease-out infinite; }
.kx-wave.w2 { animation-delay: .9s; }
.kx-wave.w3 { animation-delay: 1.8s; }
.kx-scan.reading .kx-wave { animation-duration: 1.2s; }
.kx-spin { width: 40px; height: 40px; border-radius: 50%; border: 4px solid rgba(255,255,255,.35); border-top-color: #fff; animation: kx-spin .8s linear infinite; }

/* result */
.kx-result { position: relative; width: 100%; max-width: 440px; padding: 26px 24px 30px; text-align: center; border-radius: 22px; animation: kx-pop .35s cubic-bezier(.2,.8,.2,1); overflow: hidden; }
.kx-result.in  { background: linear-gradient(160deg, #f0fdf4 0%, #dcfce7 100%); border: 1.5px solid #86efac; }
.kx-result.out { background: linear-gradient(160deg, #fff7f1 0%, #ffe6d8 100%); border: 1.5px solid #f9b898; }
.kx-result.err { background: linear-gradient(160deg, #fff5f5 0%, #fde2e2 100%); border: 1.5px solid #fca5a5; }
.kx-result.warn { background: linear-gradient(160deg, #fffbeb 0%, #fef3c7 100%); border: 1.5px solid #fcd34d; }
.kx-photo {
  position: relative; width: 104px; height: 104px; margin: 0 auto 14px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; font-family: var(--disp); font-size: 44px; font-weight: 800; color: #fff;
  background: linear-gradient(135deg, #f2864f, #e8582a); box-shadow: 0 12px 26px rgba(232,88,42,.3); border: 4px solid #fff;
}
.kx-photo img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block; }
.kx-photo.bad { background: #dc2626; box-shadow: 0 12px 26px rgba(220,38,38,.3); }
.kx-photo.warn { background: #f59e0b; box-shadow: 0 12px 26px rgba(245,158,11,.3); }
.kx-tick { position: absolute; right: -2px; bottom: -2px; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; border: 3px solid #fff; background: #16a34a; }
.kx-result.out .kx-tick { background: #e8582a; }
.kx-chip { display: inline-block; padding: 5px 16px; border-radius: 99px; font-size: 12.5px; font-weight: 800; letter-spacing: .6px; text-transform: uppercase; color: #fff; background: #16a34a; }
.kx-result.out .kx-chip { background: #e8582a; }
.kx-result.err .kx-chip { background: #dc2626; }
.kx-result.warn .kx-chip { background: #d97706; }
.kx-warn-text { margin-top: 10px; font-size: 15px; font-weight: 600; line-height: 1.45; color: #92400e; }
.kx-note { display: inline-block; margin-top: 10px; padding: 6px 12px; border-radius: 10px; background: rgba(255,255,255,.75); font-size: 13px; font-weight: 600; color: #6b4a1f; }
.kx-result h2 { font-family: var(--disp); font-size: 22px; font-weight: 600; margin-top: 12px; line-height: 1.25; overflow-wrap: anywhere; }
.kx-result h2 b { display: block; font-size: 30px; font-weight: 800; letter-spacing: -.6px; }
.kx-result.err h2 { font-size: 17px; font-weight: 700; color: #b42318; }
.kx-when { margin-top: 14px; display: flex; flex-direction: column; gap: 2px; }
.kx-when strong { font-size: 26px; font-weight: 800; font-variant-numeric: tabular-nums; }
.kx-when span { font-size: 13px; color: #6b5a50; }
.kx-uid { display: block; margin-top: 8px; font-size: 11.5px; color: #8a7468; font-family: ui-monospace, monospace; }
.kx-count { position: absolute; left: 0; right: 0; bottom: 0; height: 5px; background: rgba(0,0,0,.06); }
.kx-count i { display: block; height: 100%; width: 100%; transform-origin: left; background: rgba(0,0,0,.22); animation-name: kx-shrink; animation-timing-function: linear; animation-fill-mode: forwards; }

.kx-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-top: 12px; border-top: 1px dashed #f1ddd1; font-size: 11.5px; font-weight: 700; letter-spacing: .06em; color: var(--mut); }
.kx-test { padding: 7px 14px; border-radius: 10px; border: 1.5px solid #f1e2d9; background: #fffaf7; color: #6b5a50; font: inherit; font-size: 12px; font-weight: 600; letter-spacing: 0; cursor: pointer; transition: all .15s; }
.kx-test:hover:not(:disabled) { border-color: var(--o); color: var(--o); background: #fdeee7; }
.kx-test:disabled { opacity: .55; cursor: default; }

/* ───── log panel ───── */
.kx-side { display: flex; flex-direction: column; min-height: 0; padding: 20px; background: #fff; border-radius: 24px; box-shadow: 0 18px 44px rgba(150,52,20,.14), 0 1px 2px rgba(27,20,16,.04); }
.kx-side-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.kx-side-head h3 { font-family: var(--disp); font-size: 20px; font-weight: 800; letter-spacing: -.3px; }
.kx-side-head p { font-size: 12px; color: var(--mut); margin-top: 2px; }
.kx-count-pill { min-width: 34px; text-align: center; padding: 4px 12px; border-radius: 99px; background: #fdeee7; color: #c2410c; font-size: 13px; font-weight: 800; }
.kx-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 16px 0 14px; }
.kx-stats div { display: flex; flex-direction: column; padding: 10px 14px; border-radius: 14px; }
.kx-stats .in { background: #e6f7ee; } .kx-stats .out { background: #fdeee7; }
.kx-stats strong { font-family: var(--disp); font-size: 26px; font-weight: 800; line-height: 1.1; }
.kx-stats .in strong { color: #15803d; } .kx-stats .out strong { color: #d94a1c; }
.kx-stats span { font-size: 12px; font-weight: 600; color: #6b5a50; }

.kx-list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 4px; }
.kx-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 14px; background: #fffaf6; border: 1px solid #f8eee8; animation: kx-slide .3s ease-out; flex-shrink: 0; }
.kx-tag { flex-shrink: 0; min-width: 42px; text-align: center; padding: 4px 9px; border-radius: 99px; font-size: 11px; font-weight: 800; letter-spacing: .4px; }
.kx-tag.in { background: #dcfce7; color: #15803d; } .kx-tag.out { background: #fde5d8; color: #d94a1c; }
.kx-row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.kx-row-text strong { font-size: 13.5px; font-weight: 700; color: #3a2e28; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kx-row-text small { font-size: 11px; color: #9a8c84; }
.kx-row time { flex-shrink: 0; font-size: 12px; font-weight: 600; color: #6b5a50; font-variant-numeric: tabular-nums; }
.kx-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 4px; padding: 20px; border: 1.5px dashed #f2cdb9; border-radius: 16px; background: rgba(255,255,255,.7); }
.kx-empty-ic { width: 54px; height: 54px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: #fdeee7; color: var(--o); margin-bottom: 6px; }
.kx-empty strong { font-size: 14.5px; color: #3a2e28; }
.kx-empty span { font-size: 12.5px; color: #9a8c84; }
.kx-clear { margin-top: 12px; padding: 9px; border-radius: 12px; border: 1.5px solid #f1e2d9; background: #fffaf7; color: #6b5a50; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .15s; }
.kx-clear:hover { border-color: var(--o); color: var(--o); background: #fdeee7; }

/* ───── motion ───── */
@keyframes kx-spin { to { transform: rotate(360deg); } }
@keyframes kx-blink { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
@keyframes kx-wave { 0% { transform: scale(.7); opacity: .9; } 100% { transform: scale(1.5); opacity: 0; } }
@keyframes kx-pop { from { opacity: 0; transform: translateY(10px) scale(.96); } to { opacity: 1; transform: none; } }
@keyframes kx-slide { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
@keyframes kx-shrink { from { transform: scaleX(1); } to { transform: scaleX(0); } }
@media (prefers-reduced-motion: reduce) {
  .kx-wave, .kx-live i, .kx-result, .kx-row, .kx-spin { animation: none !important; }
  .kx-count i { animation-duration: 0s !important; }
}

/* ───── smaller screens ───── */
@media (max-width: 960px) {
  .kx-page { height: auto; min-height: 100vh; align-items: flex-start; }
  .kx-layout { grid-template-columns: 1fr; max-height: none; height: auto; }
  .kx-main { min-height: 560px; }
  .kx-side { max-height: 420px; }
}
@media (max-width: 560px) {
  .kx-page { padding: 12px; }
  .kx-main { padding: 18px 16px 14px; }
  .kx-brand strong { font-size: 17px; }
  .kx-live { display: none; }
  .kx-time { font-size: 42px; }
}
`;