//login.jsx
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";
import campus from "../assets/campus.jpg";
import { API } from "../config.js";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const REMEMBER_KEY = "ojt_remember";
const REMEMBER_DAYS = 7;

const SLIDES = [
  {
    title: "Simple and secure access",
    text: "Log in securely to access the features and information available for your account."
  },
  {
    title: "Everything in one place",
    text: "Access attendance records, submissions, notifications, and other tools through one system."
  },
  {
    title: "Real-time attendance tracking",
    text: "Attendance records are captured and updated in the system for easier monitoring and management."
  },
  {
    title: "Stay updated",
    text: "Receive important notifications and updates about attendance, submissions, requests, and other activities."
  },
  {
    title: "Less paperwork, easier management",
    text: "Submit and review documents online, making attendance and OJT-related processes more convenient."
  },
];

const FAQS = [
{
q: "What can I do in the system?",
a: "You can access the features available to your account, such as attendance records, submissions, notifications, and other OJT-related activities."
},
{
q: "I forgot my password. What should I do?",
a: "Click \"Forgot password?\" on the log in form and enter your ID number with your recovery code. No code? Choose \"Forgot recovery code?\" to get it by email, or ask the administrator to set a new password."
},
{
q: "How is attendance recorded?",
a: "Attendance can be recorded through the available attendance features, such as NFC time-in and time-out for registered users."
},
{
q: "What are MOVs?",
a: "MOVs, or Means of Verification, are documents and requirements submitted to support and verify OJT-related activities."
},
{
q: "Who can access my information?",
a: "Access depends on your account role and assigned permissions. Only authorized users can view or manage specific information."
},
];


/* ── small icons ── */
const Icon = ({ d, size = 20, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d ? <path d={d} /> : children}
  </svg>
);
const HomeIcon = () => <Icon d="M3 11.5 12 4l9 7.5M5.5 10v10h13V10" />;
const UserIcon = () => <Icon><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></Icon>;
const StaffIcon = () => <Icon><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" /></Icon>;
const MailIcon = () => <Icon><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 8 8 6 8-6" /></Icon>;
const LockIcon = () => <Icon><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></Icon>;
const WaveIcon = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <path d="M8 8.5a5 5 0 0 1 0 7M12 6a8.5 8.5 0 0 1 0 12M16 3.5a12 12 0 0 1 0 17" />
  </svg>
);

/* Forgot password flow: recover with your recovery code, or get the code by email */
function RecoverFlow({ onDone }) {
  const [step, setStep] = useState("verify"); // "verify" | "newpass" | "email"
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [pass, setPass] = useState(null);      // { reset_token, name } once step 1 matched
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const post = async (path, body) => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`${API}${path}`, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 429) throw new Error("Too many tries. Please wait a minute.");
      if (!res.ok) throw new Error((d.errors && Object.values(d.errors)[0]?.[0]) || d.message || "Something went wrong.");
      return d;
    } catch (err) {
      setMsg({ type: "error", text: err instanceof TypeError ? "Couldn't reach the server." : err.message });
      return null;
    } finally { setBusy(false); }
  };

  // Step 1: the ID number and the recovery code (date of birth is not accepted: others may know it)
  const verify = async (e) => {
    e.preventDefault();
    const d = await post("/recovery/verify", { identifier, code });
    if (d) { setPass(d); setStep("newpass"); }
  };

  // Step 2: shown only after step 1 matched
  const setNew = async (e) => {
    e.preventDefault();
    if (pw.length < 6) { setMsg({ type: "error", text: "New password must be at least 6 characters." }); return; }
    if (pw !== pw2) { setMsg({ type: "error", text: "The passwords don't match." }); return; }
    const d = await post("/recovery/reset", { reset_token: pass.reset_token, new_password: pw });
    if (d) { setMsg({ type: "success", text: d.message }); setTimeout(onDone, 2200); }
  };

  const sendEmail = async (e) => {
    e.preventDefault();
    const d = await post("/recovery/send-code", { identifier });
    if (d) setMsg({ type: "success", text: d.message });
  };

  const go = (s) => { setStep(s); setMsg(null); };
  const Msg = () => (msg ? <div className={msg.type === "success" ? "lf-rec-msg ok" : "lf-rec-msg err"} role="alert">{msg.text}</div> : null);

  return (
    <div className="lf-rec" key={step}>
      {step === "verify" && (
        <>
          <h3>Recover account</h3>
          <p className="lf-modal-lead">Enter your ID number and your recovery code.</p>
          <form onSubmit={verify}>
            <label>ID number (student or employee ID)</label>
            <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required autoComplete="username" placeholder="Your ID number" />

            <label>Recovery code</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} required placeholder="XXXX-XXXX" autoComplete="off" style={{ textTransform: "uppercase" }} />

            <Msg />
            <button type="submit" className="lf-rec-btn" disabled={busy}>{busy ? "Checking..." : "Continue"}</button>
          </form>
          <button type="button" className="lf-link lf-rec-alt" onClick={() => go("email")}>Forgot recovery code?</button>
        </>
      )}

      {step === "newpass" && (
        <>
          <h3>Set a new password</h3>
          <p className="lf-modal-lead">Verified{pass?.name ? `: ${pass.name}` : ""}. Choose a new password.</p>
          <form onSubmit={setNew}>
            <label>New password</label>
            <input type={showPw ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6} autoComplete="new-password" autoFocus />
            <label>Confirm new password</label>
            <input type={showPw ? "text" : "password"} value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={6} autoComplete="new-password" />
            <label className="lf-rec-check"><input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} /> Show passwords</label>
            <Msg />
            <button type="submit" className="lf-rec-btn" disabled={busy || msg?.type === "success"}>{busy ? "Saving..." : "Change password"}</button>
          </form>
        </>
      )}

      {step === "email" && (
        <>
          <h3>Get your recovery code</h3>
          <p className="lf-modal-lead">We'll email it to the address on your account. If you never had one, a new code is made for you.</p>
          <form onSubmit={sendEmail}>
            <label>ID number (student or employee ID)</label>
            <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required autoComplete="username" placeholder="Your ID number" />
            <Msg />
            <button type="submit" className="lf-rec-btn" disabled={busy}>{busy ? "Sending..." : "Send to my email"}</button>
          </form>
          <p className="lf-modal-note">Can't access your email? Ask the system administrator to help.</p>
          <button type="button" className="lf-link lf-rec-alt" onClick={() => go("verify")}>Back to recover account</button>
        </>
      )}
    </div>
  );
}

export default function LoginForm({ variant = "student" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [slide, setSlide] = useState(0);
  const [loginOpen, setLoginOpen] = useState(false);
  const [panel, setPanel] = useState(null); // null | "about" | "faqs" | "forgot"
  // the log-in box slides to "Recover account" (and back) instead of opening a separate window
  const [dropView, setDropView] = useState("login");   // "login" | "recover"
  const [dropH, setDropH] = useState(null);
  const loginPane = useRef(null);
  const recoverPane = useRef(null);
  useEffect(() => {
    const el = dropView === "login" ? loginPane.current : recoverPane.current;
    if (!el) return undefined;
    const fit = () => setDropH(el.offsetHeight);
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  });
  const [faqOpen, setFaqOpen] = useState(-1);   // every question starts closed
  const [isFull, setIsFull] = useState(false);
  const [remember, setRemember] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const navigate = useNavigate();

  const goByRole = (data) => {
  if (data.role === "intern") navigate("/intern");
  else if (data.role === "admin") navigate("/admin");
  else if (data.role === "ojt_coordinator") navigate("/coordinator");
  else if (data.role === "supervisor") navigate("/supervisor");
  else setError("Unknown role. Contact administrator.");
};

  // If "Remember me" was ticked within the last 7 days, skip the login screen
  // load Google's sign-in script once
  useEffect(() => {
    if (document.getElementById("gsi-script")) return;
    const sc = document.createElement("script");
    sc.id = "gsi-script"; sc.src = "https://accounts.google.com/gsi/client"; sc.async = true;
    document.head.appendChild(sc);
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(REMEMBER_KEY) || "null");
      if (saved && saved.user && saved.expires > Date.now()) {
        sessionStorage.setItem("user", JSON.stringify(saved.user));
        goByRole(saved.user);
      } else if (saved) {
        localStorage.removeItem(REMEMBER_KEY);
      }
    } catch {
      localStorage.removeItem(REMEMBER_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const iv = setInterval(() => setSlide((n) => (n + 1) % SLIDES.length), 5000);
    return () => clearInterval(iv);
  }, []);

  // the demo card taps in, then out, then in again… (flips each time the 6s animation repeats)
  const [demoIn, setDemoIn] = useState(true);

  // Live clock for the little "checked in" demo in the hero
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setLoginOpen(false);
        setPanel(null);
      }
    };
    const onFs = () => setIsFull(!!document.fullscreenElement);
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, []);

  const go = (path) => {
    setPanel(null);
    navigate(path);
  };
  const openPanel = (name) => {
    setFaqOpen(-1);
    setPanel(name);
  };
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Login failed.");

      sessionStorage.setItem("user", JSON.stringify(data));
      if (remember) {
        localStorage.setItem(
          REMEMBER_KEY,
          JSON.stringify({ user: data, expires: Date.now() + REMEMBER_DAYS * 24 * 60 * 60 * 1000 })
        );
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }
      goByRole(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Sign in with Google (popup). The backend checks the token and finds the account by email.
  const handleGoogle = () => {
    setError(null);
    const g = window.google?.accounts?.oauth2;
    if (!GOOGLE_CLIENT_ID) return setError("Google sign-in is not set up yet.");
    if (!g) return setError("Google sign-in could not load. Check your internet and try again.");
    g.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: "openid email profile",
      callback: async (resp) => {
        if (!resp?.access_token) return setError("Google sign-in was cancelled.");
        setLoading(true);
        try {
          const res = await fetch(`${API}/login/google`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ access_token: resp.access_token }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.message || "Google sign-in failed.");
          sessionStorage.setItem("user", JSON.stringify(data));
          if (remember) {
            localStorage.setItem(REMEMBER_KEY, JSON.stringify({ user: data, expires: Date.now() + REMEMBER_DAYS * 24 * 60 * 60 * 1000 }));
          }
          goByRole(data);
        } catch (err) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      },
    }).requestAccessToken();
  };

  const clock = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <div className="lf-page">
      {/* ── Top navbar ── */}
      <header className="lf-nav">
        <button className="lf-logo-btn" onClick={() => go("/login")} aria-label="Home">
          <img src={logo} alt="CSU CCIS" className="lf-nav-logo" />
          <span className="lf-brand-name show">
            CSU CCIS<br />MYTRACK
          </span>
        </button>

        <button className="lf-icon-btn lf-fs-btn" aria-label="Toggle fullscreen" onClick={toggleFullscreen}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1e293b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            {isFull ? <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
          </svg>
        </button>

        <nav className="lf-nav-links">
          <button onClick={() => openPanel("about")}>About</button>
          <button onClick={() => openPanel("faqs")}>FAQs</button>
        </nav>

        <button
          className={loginOpen ? "lf-login-link open" : "lf-login-link"}
          aria-expanded={loginOpen}
          onClick={() => { setDropView("login"); setTimeout(() => document.getElementById("lf-email")?.focus(), 50); }}
        >
          <UserIcon /> Log in
        </button>
      </header>

      <div className="lf-body">
        {/* no sidebar on the login page: it only had "Home" (the logo goes home too) */}
        <div className="lf-main">
          {/* ── Log in dropdown (opened from the navbar) ── */}
          <div className="lf-split">
            {/* ── Left: hero with campus photo ── */}
            <section className="lf-hero">
              <img src={campus} alt="CSU CCIS building" className="lf-campus" />
              <div className="lf-shade" />
              <div className="lf-grain" />

              <div className="lf-hero-text">
                <h1>Simple. Secure. Connected.</h1> <h2>Manage your OJT activities with ease.</h2> 
                <p className="lf-desc"> Access attendance, submissions, 
                  notifications, and other OJT features in one convenient system. 
                </p>

                <div className="lf-slide" aria-live="polite">
                  <div key={slide} className="lf-slide-inner">
                    <div className="lf-slide-title">{SLIDES[slide].title}</div>
                    <div className="lf-slide-text">{SLIDES[slide].text}</div>
                  </div>
                  <div className="lf-dots">
                    {SLIDES.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setSlide(i)}
                        className={i === slide ? "lf-dot active" : "lf-dot"}
                        aria-label={`Show tip ${i + 1}: ${SLIDES[i].title}`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* The one big moment: a card taps the reader, the time in lands */}
              <div className="lf-scene" aria-hidden="true">
                <div className={demoIn ? "lf-toast" : "lf-toast out"} onAnimationIteration={() => setDemoIn((v) => !v)}>
                  <span className="lf-toast-ok">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                  </span>
                  <span className="lf-toast-body">
                    <b>{demoIn ? "Time in" : "Time out"} <em>{clock}</em></b>
                    <small>Student ID 221-02399</small>
                  </span>
                </div>

                {/* a plain white NFC reader (ACR122U-like) lying on the desk, with its USB cable */}
                <svg className="lf-cable" viewBox="0 0 1000 560" aria-hidden="true">
                  <defs>
                    <linearGradient id="lfCable" x1="0" x2="1"><stop offset="0" stopColor="#d9d3cd" /><stop offset=".5" stopColor="#fff" /><stop offset="1" stopColor="#cfc8c1" /></linearGradient>
                  </defs>
                  <path d="M834 256 C 800 210, 730 185, 685 235 S 600 420, 565 560" fill="none" stroke="rgba(40,12,4,.35)" strokeWidth="13" strokeLinecap="round" transform="translate(4,8)" />
                  <path d="M834 256 C 800 210, 730 185, 685 235 S 600 420, 565 560" fill="none" stroke="url(#lfCable)" strokeWidth="11" strokeLinecap="round" />
                  <path d="M834 256 C 800 210, 730 185, 685 235 S 600 420, 565 560" fill="none" stroke="rgba(255,255,255,.75)" strokeWidth="2" strokeLinecap="round" transform="translate(-2,-2)" />
                </svg>
                <div className="lf-reader">
                  <span className="lf-reader-shadow" />
                  <div className="lf-reader-3d">
                    <div className="lf-reader-top">
                      <span className="lf-reader-ring" />
                      <span className="lf-reader-ring r2" />
                      <span className="lf-reader-led" />
                      <span className="lf-reader-waves"><WaveIcon size={50} /></span>
                    </div>
                  </div>
                </div>

                <div className="lf-tapcard">
                  <div className="lf-tapcard-top">
                    <img src={logo} alt="" />
                    <span className="lf-chip" />
                  </div>
                  <div className="lf-tapcard-lines">
                    <span />
                    <span />
                  </div>
                </div>
              </div>
            </section>

            {/* ── Right: info panel (the login form now lives in the navbar dropdown) ── */}
            <section className="lf-right">
              <span className="lf-orb o1" />
              <span className="lf-orb o2" />
              <span className="lf-orb o3" />
              <div className="lf-card lf-formcard">
                <span className="lf-hello">Welcome back</span>
                <h3 className="lf-welcome">Log in to your account</h3>
                <p className="lf-welcome-sub">Interns, coordinators, supervisors and admins.</p>
             <div className="lf-dv" style={{ height: dropH ?? "auto" }}>
              <div className={`lf-dv-track ${dropView}`}>
              <div className="lf-dv-pane" ref={loginPane} aria-hidden={dropView !== "login"} inert={dropView !== "login" ? "" : undefined}>
              {error && (
                <div className="lf-error" role="alert">
                  <span className="lf-error-dot">!</span> {error}
                </div>
              )}
                <form onSubmit={handleLogin} className="lf-form">
                  <div className="lf-field">
                    <span className="lf-field-icon"><MailIcon /></span>
                    <div className="lf-field-body">
                      <label htmlFor="lf-email">Email</label>
                      <input
                        id="lf-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        style={{ fontSize: email.length > 34 ? 12.5 : email.length > 26 ? 13.5 : undefined }}
                        title={email || undefined}
                        placeholder="Email address"
                        required
                        autoComplete="username"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="lf-field">
                    <span className="lf-field-icon"><LockIcon /></span>
                    <div className="lf-field-body">
                      <label htmlFor="lf-pass">Password</label>
                      <input
                        id="lf-pass"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password"
                        required
                        autoComplete="current-password"
                      />
                    </div>
                    <button
                      type="button"
                      className="lf-eye"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <Icon size={20}>
                          <path d="M17.9 17.9A10.4 10.4 0 0 1 12 19.5C5.5 19.5 2 12 2 12a18 18 0 0 1 4.1-5.1M9.9 4.6A9.7 9.7 0 0 1 12 4.5c6.5 0 10 7.5 10 7.5a18 18 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2" />
                          <path d="M3 3l18 18" />
                        </Icon>
                      ) : (
                        <Icon size={20}>
                          <path d="M2 12s3.5-7.5 10-7.5S22 12 22 12s-3.5 7.5-10 7.5S2 12 2 12z" />
                          <circle cx="12" cy="12" r="3" />
                        </Icon>
                      )}
                    </button>
                  </div>

                  <div className="lf-options">
                    <label className="lf-check" htmlFor="lf-remember">
                      <input
                        id="lf-remember"
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                      />
                      Remember me for 7 days
                    </label>
                    <button type="button" className="lf-link" onClick={() => setDropView("recover")}>
                      Forgot password?
                    </button>
                  </div>

                  <button type="submit" disabled={loading} className="lf-login-btn">
                    {loading ? (
                      <>
                        <span className="lf-spinner" aria-hidden="true" /> Logging in...
                      </>
                    ) : (
                      <>
                        <WaveIcon size={18} /> Log in
                      </>
                    )}
                  </button>
                </form>

                <div className="lf-or"><span>or</span></div>

                <button type="button" className="lf-google" onClick={handleGoogle}>
                  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  </svg>
                  Sign in with Google
                </button>
              </div>

              {/* ── Recover account: slides in from the right ── */}
              <div className="lf-dv-pane" ref={recoverPane} aria-hidden={dropView !== "recover"} inert={dropView !== "recover" ? "" : undefined}>
                <button type="button" className="lf-dv-back" onClick={() => setDropView("login")}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                  Back to log in
                </button>
                {dropView === "recover" && <RecoverFlow onDone={() => setDropView("login")} />}
              </div>
              </div>
             </div>
                <div className="lf-switch">Need help? Contact your OJT coordinator.</div>
              </div>
            </section>

          </div>
        </div>
      </div>

      {/* ── About / FAQ / Forgot panel ── */}
      {panel && (
        <div className="lf-modal-wrap" onClick={() => setPanel(null)}>
          <div className="lf-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button className="lf-modal-x" onClick={() => setPanel(null)} aria-label="Close">×</button>

            {panel === "about" && (
              <>
                <h3>About CSU CCIS OJT</h3>
                <p className="lf-modal-lead">Attendance tracking built for the way interns actually work.</p>
                <p>
                  This system replaces paper logbooks with a single NFC tap. Interns time in and time out in
                  a second, admins see who is on duty, and coordinators can follow every intern's
                  progress toward their required hours without chasing signatures.
                </p>
                <p>
                  Every tap is saved with a unique UUID, and requirements (MOVs) are submitted and
                  reviewed online, so nothing gets lost between the workplace and the coordinator's desk.
                </p>
                <p className="lf-modal-note">Made for the College of Computing and Information Sciences, CSU.</p>
              </>
            )}

            {panel === "forgot" && <RecoverFlow onDone={() => setPanel(null)} />}

            {panel === "faqs" && (
              <>
                <h3>Frequently asked questions</h3>
                <p className="lf-modal-lead">Quick answers before you ask your coordinator.</p>
                <div className="lf-faq">
                  {FAQS.map((f, i) => (
                    <div key={f.q} className={faqOpen === i ? "lf-faq-item open" : "lf-faq-item"}>
                      <button onClick={() => setFaqOpen(faqOpen === i ? -1 : i)} aria-expanded={faqOpen === i}>
                        <span>{f.q}</span>
                        <span className="lf-faq-plus">+</span>
                      </button>
                      {/* the answer slides down / up (height animates from 0 to its real size) */}
                      <div className="lf-faq-a" aria-hidden={faqOpen !== i}><div><p>{f.a}</p></div></div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style>{css}</style>
    </div>
  );
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; width: 100%; }
  body { font-family: 'Poppins', 'Segoe UI', sans-serif; color: #1b1410; }
  button { font-family: inherit; }

  .lf-page {
    --o: #e8582a; --o2: #f2733a; --o-soft: #fdeee7; --o-glow: rgba(232,88,42,0.35);
    --ink: #1b1410; --mut: #6f625b; --line: #eadfd8; --field: #f6f2ef;
    --display: 'Poppins', 'Segoe UI', sans-serif;
    height: calc(100vh / var(--fit, 1)); min-height: 640px; display: flex; flex-direction: column; background: #fff; position: relative;
    font-family: 'Poppins', 'Segoe UI', sans-serif;
  }

  /* ───── Navbar ───── */
  .lf-nav {
    height: 75px; flex-shrink: 0; background: #fff;
    display: flex; align-items: center; gap: 10px;
    padding: 0 18px 0 15px; position: relative; z-index: 30;
    box-shadow: 0 4px 14px rgba(27,20,16,0.10);
  }
  .lf-logo-btn { background: none; border: none; cursor: pointer; display: flex; margin-right: 14px; align-items: center; text-align: left; }
  .lf-nav-logo { height: 60px; width: auto; flex-shrink: 0; }
  .lf-brand-name {
    display: block; overflow: hidden; white-space: nowrap;
    max-width: 0; opacity: 0; margin-left: 0;
    font-family: var(--display); font-size: 11.5px; font-weight: 800; line-height: 1.2; letter-spacing: .6px; color: var(--ink);
    transition: max-width .35s cubic-bezier(.2,.8,.2,1), opacity .25s, margin-left .35s;
  }
  .lf-brand-name.show { max-width: 170px; opacity: 1; margin-left: 10px; }
  .lf-icon-btn {
    background: none; border: none; cursor: pointer; padding: 8px; border-radius: 10px;
    display: flex; transition: background .15s;
  }
  .lf-icon-btn:hover { background: var(--o-soft); }
  .lf-nav-links { display: flex; align-items: center; gap: 6px; margin-left: 8px; }
  .lf-nav-links > button {
    color: #3d322c; font-size: 14px; font-weight: 500; background: none; border: none; cursor: pointer;
    padding: 8px 12px; border-radius: 10px; transition: color .15s, background .15s;
  }
  .lf-nav-links > button:hover { color: var(--o); background: var(--o-soft); }

  /* ───── Frame + sidebar ───── */
  .lf-body { flex: 1; display: flex; min-height: 0; position: relative; }
  .lf-strip { width: 65px; flex-shrink: 0; transition: width .3s cubic-bezier(.2,.8,.2,1); }
  .lf-strip.open { width: 236px; }
  .lf-backdrop { display: none; position: absolute; inset: 0; background: rgba(27,20,16,0.4); z-index: 18; animation: lf-fadein .2s; }
  .lf-side {
    position: absolute; top: 0; bottom: 0; left: 0; width: 65px; z-index: 20; overflow: hidden;
    background: #fff; box-shadow: 4px 0 18px rgba(27,20,16,0.08);
    display: flex; flex-direction: column; padding-top: 14px;
    transition: width .3s cubic-bezier(.2,.8,.2,1), box-shadow .3s;
  }
  .lf-side.open { width: 236px; }
  .lf-side-item {
    display: flex; align-items: center; gap: 16px; height: 48px; margin: 2px 10px;
    padding: 0 0 0 13px; border: none; background: none; cursor: pointer; color: #3d322c;
    border-radius: 12px; white-space: nowrap; text-align: left; transition: background .15s;
  }
  .lf-side-item:hover, .lf-side-item.active { background: var(--o-soft); color: var(--o); }
  .lf-side-item:focus-visible { outline: 2px solid var(--o); outline-offset: 1px; }
  .lf-side-icon { display: flex; flex-shrink: 0; }
  .lf-side-label { font-size: 14px; font-weight: 600; opacity: 0; transform: translateX(-6px); transition: opacity .2s, transform .25s; }
  .lf-side.open .lf-side-label { opacity: 1; transform: none; transition-delay: .1s; }
  .lf-side-foot {
    margin-top: auto; padding: 18px 22px; font-size: 11px; letter-spacing: .5px; color: #a89b93;
    white-space: nowrap; opacity: 0; transition: opacity .2s;
  }
  .lf-side.open .lf-side-foot { opacity: 1; transition-delay: .15s; }

  /* same look as the dashboards' sidebar (DashKit): compact items, orange bar on the active one */
  .lf-strip { width: 64px; }
  .lf-strip.open { width: 240px; }
  .lf-side { width: 64px; padding-top: 12px; box-shadow: none; }
  .lf-side.open { width: 240px; box-shadow: 6px 0 20px rgba(15,23,42,0.06); }
  .lf-side-item {
    position: relative; gap: 14px; height: 42px; margin: 2px 8px; padding: 0 0 0 14px;
    border-radius: 6px; color: #4b5563; overflow: visible;
  }
  .lf-side-item:hover { background: #f3f4f6; color: #111827; }
  .lf-side-item.active, .lf-side-item.active:hover { background: #fdf1ea; color: #c2410c; }
  .lf-side-item.active::before {
    content: ""; position: absolute; left: -8px; top: 7px; bottom: 7px; width: 3px;
    border-radius: 0 4px 4px 0; background: #e8582a;
  }
  .lf-side-icon svg { width: 18px; height: 18px; }
  .lf-side-label { font-size: 13.5px; font-weight: 500; }
  .lf-side-foot {
    padding: 14px 18px; border-top: 1px solid #eceef1; font-size: 10.5px; font-weight: 600;
    letter-spacing: .06em; color: #6b7280;
  }

  /* ── same dark-orange sidebar as the dashboards ── */
  .lf-strip { width: 76px; }
  .lf-strip.open { width: 252px; }
  .lf-side { width: 76px; padding: 14px 0 0; background: #9a3412; color: #ffe9de; box-shadow: none; }
  .lf-side.open { width: 252px; box-shadow: 6px 0 20px rgba(0,0,0,.18); }
  .lf-side-item { width: 100%; height: 40px; margin: 0; padding: 0 0 0 calc((76px - 18px) / 2); gap: 13px; border-radius: 0; color: #ffe9de; }
  .lf-side.open .lf-side-item { padding-left: 24px; }
  .lf-side-item:hover { background: rgba(255,255,255,.06); color: #fff; }
  .lf-side-item.active, .lf-side-item.active:hover { background: #7c2d12; color: #fff; box-shadow: inset 4px 0 0 #ffb48f; }
  .lf-side-item.active::before { display: none; }
  .lf-side-item.active .lf-side-icon { color: #ffd2bc; }
  .lf-side-item:focus-visible { outline: 2px solid #ffd2bc; outline-offset: -2px; }
  .lf-side-icon svg { stroke-width: 1.7; }
  .lf-side-label { font-size: 13.5px; font-weight: 500; }
  .lf-side-item.active .lf-side-label { font-weight: 600; }
  .lf-side-foot { border-top: 1px solid rgba(255,255,255,.1); color: #f6c3a8; padding: 14px 22px; }

  .lf-main { flex: 1; display: flex; flex-direction: column; min-width: 0; background: #f7f3f0; }
  .lf-split { flex: 1; display: flex; min-height: 0; }

  /* ───── Hero: photo with a warm colour grade ───── */
  .lf-hero { position: relative; flex: 1 1 0; min-width: 0; background: #2a120a; overflow: hidden; color: #fff; }
  .lf-campus { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 75%; }
  .lf-shade {
    position: absolute; inset: 0; pointer-events: none;
    background:
      radial-gradient(circle at 76% 48%, rgba(242,115,58,0.55), rgba(242,115,58,0) 42%),
      linear-gradient(105deg, rgba(26,11,5,0.90) 0%, rgba(26,11,5,0.66) 45%, rgba(150,52,20,0.42) 100%),
      linear-gradient(0deg, rgba(26,11,5,0.75) 0%, rgba(26,11,5,0) 45%);
  }
  .lf-grain {
    position: absolute; inset: 0; pointer-events: none; opacity: .14; mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='.6'/></svg>");
  }

  .lf-hero-text {
    position: relative; z-index: 3; height: 100%; max-width: 540px;
    padding: 40px 48px 34px; display: flex; flex-direction: column;
  }
  .lf-hero h1 { font-family: var(--display); font-size: clamp(32px, 3.4vw, 48px); font-weight: 800; line-height: 1.06; letter-spacing: -0.8px; text-shadow: 0 2px 24px rgba(0,0,0,0.35); }
  .lf-hero h2 { font-size: 16px; font-weight: 600; margin-top: 16px; color: #ffb48f; }
  .lf-desc { font-size: 13.5px; line-height: 1.65; color: rgba(255,255,255,0.84); margin-top: 8px; max-width: 440px; }

  .lf-slide {
    margin-top: auto; max-width: 460px; padding: 16px 18px 14px;
    background: rgba(255,255,255,0.12); backdrop-filter: blur(14px) saturate(140%); -webkit-backdrop-filter: blur(14px) saturate(140%);
    border-radius: 18px; border: 1px solid rgba(255,255,255,0.26);
    box-shadow: 0 18px 40px rgba(0,0,0,0.25);
  }
  .lf-slide-inner { animation: lf-slidein .5s ease-out; min-height: 70px; }
  .lf-slide-title { font-family: var(--display); font-size: 15.5px; font-weight: 700; }
  .lf-slide-text { font-size: 13px; line-height: 1.55; color: rgba(255,255,255,0.82); margin-top: 3px; }
  .lf-dots { display: flex; gap: 6px; margin-top: 12px; }
  .lf-dot { width: 7px; height: 7px; border-radius: 99px; border: none; padding: 0; cursor: pointer; background: rgba(255,255,255,0.4); transition: width .3s, background .3s; }
  .lf-dot.active { width: 26px; background: #fff; }
  .lf-dot:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }

  /* ── The tap scene ── */
  .lf-scene {
    position: absolute; z-index: 3; right: clamp(24px, 5vw, 68px); top: 56%;
    width: 300px; height: 330px; margin-top: -135px;
  }
  /* white reader seen at an angle (like an ACR122U on a desk) */
  .lf-cable { position: absolute; left: -710px; top: -60px; width: 1000px; height: 560px; z-index: 0; overflow: visible; pointer-events: none; }
  .lf-reader { position: absolute; left: 48px; top: 142px; width: 210px; height: 240px; z-index: 1; perspective: 760px; }
  .lf-reader-shadow { position: absolute; left: 6px; right: -16px; bottom: -4px; height: 64px; border-radius: 50%; background: rgba(40,12,4,.55); filter: blur(18px); }
  .lf-reader-3d { position: absolute; left: 18px; top: 0; width: 174px; height: 234px; transform: rotateX(52deg) rotateZ(-18deg); transform-style: preserve-3d; }
  .lf-reader-top {
    position: absolute; inset: 0; border-radius: 24px;
    background: linear-gradient(160deg, #ffffff 0%, #f4f1ee 45%, #e4dfda 100%);
    box-shadow: inset 0 1px 0 #fff, inset 0 -3px 8px rgba(0,0,0,.06),
      0 3px 0 #d9d3cd, 0 6px 0 #cfc8c1, 0 9px 0 #c4bcb5, 0 12px 0 #b8afa7, 0 34px 40px rgba(40,12,4,.45);
  }
  .lf-reader-top::before { content: ""; position: absolute; inset: 11px; border-radius: 16px; border: 1.5px solid rgba(0,0,0,.07); }
  .lf-reader-waves { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #e8582a; }
  .lf-reader-led {
    position: absolute; top: 18px; left: 50%; margin-left: -15px; width: 30px; height: 6px; border-radius: 3px;
    background: #ffb48f; box-shadow: 0 0 12px #ffb48f; animation: lf-led 6s ease-in-out infinite;
  }
  .lf-reader-ring {
    position: absolute; inset: 0; border-radius: 24px; border: 2px solid rgba(232,88,42,.7);
    opacity: 0; animation: lf-ring 6s ease-out infinite;
  }
  .lf-reader-ring.r2 { animation-delay: .35s; }

  .lf-tapcard {
    position: absolute; left: 50px; top: 78px; width: 200px; height: 124px; z-index: 2;
    border-radius: 18px; padding: 14px 16px;
    background: linear-gradient(135deg, #fff 0%, #ffe6d9 100%);
    box-shadow: 0 28px 50px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.7);
    display: flex; flex-direction: column; justify-content: space-between;
    transform: translate(70px,-90px) rotate(10deg); opacity: 0;
    animation: lf-card 6s cubic-bezier(.4,0,.2,1) infinite;
  }
  .lf-tapcard-top { display: flex; align-items: center; justify-content: space-between; }
  .lf-tapcard-top img { height: 34px; width: auto; object-fit: contain; }
  .lf-chip { width: 32px; height: 24px; border-radius: 6px; background: linear-gradient(135deg, #f9c46b, #e3902b); box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12); }
  .lf-tapcard-lines span { display: block; height: 7px; border-radius: 99px; background: rgba(232,88,42,0.28); }
  .lf-tapcard-lines span + span { width: 55%; margin-top: 7px; background: rgba(27,20,16,0.12); }

  .lf-toast {
    position: absolute; left: 20px; right: 20px; top: 0; z-index: 3;
    display: flex; align-items: center; gap: 11px; padding: 11px 14px;
    background: #fff; color: var(--ink); border-radius: 16px; box-shadow: 0 18px 40px rgba(0,0,0,0.35);
    opacity: 0; animation: lf-toast 6s ease-out infinite;
  }
  .lf-toast-ok { width: 28px; height: 28px; border-radius: 50%; background: #22a06b; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background .2s; }
  .lf-toast.out .lf-toast-ok { background: #e8582a; }   /* check-out: orange */
  .lf-toast-body { display: flex; flex-direction: column; line-height: 1.25; }
  .lf-toast-body b { font-size: 13.5px; font-weight: 700; }
  .lf-toast-body small { font-size: 11.5px; color: var(--mut); }
  .lf-toast-body b em { font-style: normal; font-weight: 600; color: var(--o); margin-left: 4px; }

  /* ───── Right side ───── */
  /* the card is centred with margin:auto, so on a short screen it scrolls instead of being cut off */
  .lf-right { position: relative; flex: 0 0 460px; display: flex; justify-content: center; padding: 16px 24px; overflow-x: hidden; overflow-y: auto;
    /* the soft orange glows are drawn in the background (as separate shapes they made the panel scroll) */
    background:
      radial-gradient(150px 150px at calc(100% - 70px) 40px, rgba(242,134,79,0.40), rgba(242,134,79,0) 100%),
      radial-gradient(170px 170px at 60px calc(100% - 30px), rgba(232,88,42,0.22), rgba(232,88,42,0) 100%),
      radial-gradient(80px 80px at calc(100% - 30px) calc(100% - 170px), rgba(255,190,150,0.45), rgba(255,190,150,0) 100%),
      linear-gradient(160deg, #fffaf7 0%, #ffeee4 100%); }
  .lf-right > .lf-orb { display: none; }
  .lf-orb { position: absolute; border-radius: 50%; pointer-events: none; }
  .lf-orb.o1 { width: 300px; height: 300px; top: -110px; right: -80px; background: radial-gradient(circle, rgba(242,134,79,0.45), rgba(242,134,79,0)); }
  .lf-orb.o2 { width: 340px; height: 340px; bottom: -140px; left: -110px; background: radial-gradient(circle, rgba(232,88,42,0.28), rgba(232,88,42,0)); }
  .lf-orb.o3 { width: 160px; height: 160px; bottom: 90px; right: -50px; background: radial-gradient(circle, rgba(255,190,150,0.5), rgba(255,190,150,0)); }

  .lf-card {
    position: relative; margin: auto; flex-shrink: 0; background: rgba(255,255,255,0.92); width: 100%; max-width: 400px; border-radius: 10px;
    padding: 24px 30px 22px;
    box-shadow: 0 30px 70px rgba(150,52,20,0.16), 0 2px 8px rgba(27,20,16,0.05);
    backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    animation: lf-rise .6s cubic-bezier(.2,.8,.2,1) both;
  }
  .lf-card-head { display: flex; align-items: center; justify-content: center; gap: 8px; }
  .lf-card-logo { width: 30px; height: 30px; object-fit: contain; }
  .lf-brand { font-family: var(--display); font-size: 15px; font-weight: 800; letter-spacing: -0.1px; }
  .lf-underline { border-bottom: 2.5px solid var(--o); }

  .lf-roles { position: relative; display: grid; grid-template-columns: 1fr 1fr; margin-top: 14px; padding: 4px; background: var(--field); border-radius: 16px; }
  .lf-roles-thumb { position: absolute; top: 4px; bottom: 4px; left: 4px; width: calc(50% - 4px); border-radius: 12px; background: linear-gradient(135deg, var(--o2), #e04a1a); box-shadow: 0 8px 16px var(--o-glow); transition: transform .3s cubic-bezier(.2,.8,.2,1); }
  .lf-roles-thumb.right { transform: translateX(100%); }
  .lf-role { position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; gap: 7px; padding: 10px 8px; border: none; background: none; cursor: pointer; font-size: 13.5px; font-weight: 600; color: var(--mut); border-radius: 12px; transition: color .25s; }
  .lf-role svg { width: 17px; height: 17px; }
  .lf-role:hover { color: var(--o); }
  .lf-role.active, .lf-role.active:hover { color: #fff; }
  .lf-role:focus-visible { outline: 2px solid var(--o); outline-offset: 2px; }

  .lf-welcome { text-align: center; font-family: var(--display); font-size: 25px; font-weight: 800; margin-top: 16px; letter-spacing: -0.5px; }
  .lf-welcome-sub { text-align: center; font-size: 13px; line-height: 1.5; color: var(--mut); margin: 3px auto 16px; max-width: 320px; }

  .lf-error { background: #fef2f2; border: 1px solid #fca5a5; color: #dc2626; border-radius: 12px; padding: 10px 12px; font-size: 12.5px; display: flex; align-items: center; gap: 8px; margin-bottom: 14px; animation: lf-pop .2s ease-out; }
  .lf-error-dot { width: 16px; height: 16px; border-radius: 50%; background: #dc2626; color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; flex-shrink: 0; }

  .lf-form { display: flex; flex-direction: column; gap: 12px; }
  .lf-field {
    display: flex; align-items: center; gap: 12px; color: #8a7d75;
    background: var(--field); border: 1.5px solid transparent; border-radius: 16px; padding: 0 8px 0 16px;
    transition: background .2s, border-color .2s, box-shadow .2s, color .2s;
  }
  /* white fields; a light border when idle, orange when active */
  .lf-field { background: #fff; border-color: #e9e0da; }
  .lf-field:hover { border-color: #dccfc7; }
  .lf-field:focus-within { background: #fff; border-color: var(--o); color: var(--o); box-shadow: 0 0 0 4px rgba(232,88,42,0.14); }
  .lf-field-icon { flex-shrink: 0; display: flex; }
  .lf-field-body { flex: 1; padding: 9px 0 8px; min-width: 0; }
  .lf-field label { display: block; font-size: 11.5px; font-weight: 600; color: var(--mut); margin-bottom: 1px; }
  .lf-field input { width: 100%; border: none; background: transparent; padding: 2px 0; font-size: 14.5px; font-family: inherit; color: var(--ink); }
  .lf-field input::placeholder { color: #b9aea7; }
  .lf-field input:focus { outline: none; }

  /* Stop the browser's blue/gray autofill background */
  /* (no white box: the saved-password fill stays see-through, so the field is gray, or white when clicked) */
  .lf-field input:-webkit-autofill,
  .lf-field input:-webkit-autofill:hover,
  .lf-field input:-webkit-autofill:focus,
  .lf-field input:-webkit-autofill:active {
    -webkit-box-shadow: none !important; box-shadow: none !important;
    -webkit-text-fill-color: #1b1410 !important;
    caret-color: #1b1410;
    background-color: transparent !important;
    transition: background-color 600000s 0s, color 600000s 0s;
  }
  .lf-field input:autofill { box-shadow: none !important; background-color: transparent !important; }
  /* long emails: smaller text, and "..." when it still doesn't fit */
  .lf-field input { text-overflow: ellipsis; }
  .lf-eye { background: none; border: none; cursor: pointer; color: #8a7d75; display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 10px; transition: color .15s, background .15s; flex-shrink: 0; }
  .lf-eye:hover { color: var(--o); background: var(--o-soft); }
  .lf-eye:focus-visible { outline: 2px solid var(--o); outline-offset: 2px; }

  .lf-options { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 2px 0; }
  .lf-check { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--mut); cursor: pointer; user-select: none; }
  .lf-check input { width: 16px; height: 16px; accent-color: var(--o); cursor: pointer; flex-shrink: 0; }
  .lf-link { background: none; border: none; cursor: pointer; font-size: 12.5px; font-weight: 600; color: var(--o); padding: 2px 0; white-space: nowrap; }
  .lf-link:hover { text-decoration: underline; }

  .lf-login-btn {
    position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; gap: 9px;
    margin-top: 2px; padding: 14px; background: linear-gradient(135deg, var(--o2), #e04a1a); color: #fff; border: none;
    border-radius: 16px; font-size: 15px; font-weight: 700; letter-spacing: .2px; cursor: pointer;
    box-shadow: 0 14px 28px var(--o-glow); transition: transform .15s, box-shadow .15s;
  }
  .lf-login-btn::after {
    content: ""; position: absolute; top: 0; bottom: 0; left: -60%; width: 40%;
    background: linear-gradient(100deg, transparent, rgba(255,255,255,0.35), transparent);
    transform: skewX(-20deg); transition: left .6s ease;
  }
  .lf-login-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 18px 34px rgba(232,88,42,0.45); }
  .lf-login-btn:hover:not(:disabled)::after { left: 120%; }
  .lf-login-btn:active:not(:disabled) { transform: translateY(0); }
  .lf-login-btn:disabled { opacity: .75; cursor: default; }
  .lf-spinner { width: 16px; height: 16px; border-radius: 50%; border: 2.5px solid rgba(255,255,255,0.4); border-top-color: #fff; animation: lf-spin .7s linear infinite; }

  .lf-or { display: flex; align-items: center; gap: 12px; margin: 14px 0 12px; font-size: 12px; color: #a89b93; }
  .lf-or::before, .lf-or::after { content: ""; flex: 1; height: 1px; background: var(--line); }
  .lf-google {
    width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px; padding: 12px;
    background: #fff; border: 1.5px solid var(--line); border-radius: 16px; font-size: 14px; font-weight: 600;
    color: var(--ink); cursor: pointer; transition: background .15s, border-color .15s, box-shadow .15s, transform .15s;
  }
  .lf-google:hover { background: #fffaf7; border-color: #f2c7b3; box-shadow: 0 8px 18px rgba(150,52,20,0.10); transform: translateY(-1px); }
  .lf-google:focus-visible, .lf-link:focus-visible, .lf-check input:focus-visible,
  .lf-login-btn:focus-visible, .lf-icon-btn:focus-visible, .lf-nav-links button:focus-visible, .lf-logo-btn:focus-visible { outline: 2px solid var(--o); outline-offset: 2px; }

  .lf-switch { margin-top: 16px; text-align: center; font-size: 12.5px; line-height: 1.5; color: #a89b93; }

  /* ───── About / FAQ modal ───── */
  .lf-modal-wrap { position: fixed; inset: 0; z-index: 100; background: rgba(15,12,10,0.65); backdrop-filter: none; -webkit-backdrop-filter: none; display: flex; align-items: center; justify-content: center; padding: 20px; animation: lf-fadein .2s; }
  .lf-modal { position: relative; background: #fff; border-radius: 6px; max-width: 520px; width: 100%; max-height: 85vh; overflow: auto; padding: 32px 32px 28px; box-shadow: 0 30px 80px rgba(0,0,0,0.3); animation: lf-pop .25s ease-out; border-top: 5px solid var(--o); }
  .lf-modal h3 { font-family: var(--display); font-size: 22px; font-weight: 800; letter-spacing: -0.3px; }
  .lf-modal-lead { color: var(--o); font-weight: 600; font-size: 14px; margin: 4px 0 14px; }
  .lf-modal p { font-size: 14px; line-height: 1.65; color: #5a4e47; margin-bottom: 10px; }
  .lf-modal p.lf-modal-lead { color: var(--o); }
  .lf-modal-note { font-size: 12.5px !important; color: #a89b93 !important; margin-top: 14px; }
  .lf-modal-x { position: absolute; top: 14px; right: 16px; width: 32px; height: 32px; border-radius: 50%; border: none; background: var(--field); font-size: 20px; line-height: 1; cursor: pointer; color: #5a4e47; }
  .lf-modal-x:hover { background: var(--o-soft); color: var(--o); }

  .lf-faq { display: flex; flex-direction: column; gap: 0; margin-top: 4px; }
  .lf-faq-item { border: 0; border-bottom: 1px solid #f1ebe7; border-radius: 0; overflow: hidden; transition: background .2s; }
  .lf-faq-item:last-child { border-bottom: 0; }
  .lf-faq-item.open { background: #fffaf7; }
  .lf-faq-item button { width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 13px 15px; background: none; border: none; cursor: pointer; text-align: left; font-size: 14px; font-weight: 600; color: var(--ink); }
  .lf-faq-plus { color: var(--o); font-size: 18px; transition: transform .2s; }
  .lf-faq-item.open .lf-faq-plus { transform: rotate(45deg); }
  .lf-faq-item p { padding: 0 15px 12px; margin: 0; }
  .lf-faq-a { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows .3s cubic-bezier(.2,.8,.2,1), opacity .25s ease; }
  .lf-faq-a > div { overflow: hidden; min-height: 0; }
  .lf-faq-a p { transform: translateY(-6px); transition: transform .3s cubic-bezier(.2,.8,.2,1); }
  .lf-faq-item.open .lf-faq-a { grid-template-rows: 1fr; opacity: 1; }
  .lf-faq-item.open .lf-faq-a p { transform: none; }
  .lf-faq-plus { transition: transform .3s cubic-bezier(.2,.8,.2,1) !important; }
  @media (prefers-reduced-motion: reduce) { .lf-faq-a, .lf-faq-a p { transition: none; } }


  /* ───── Recover account ───── */
  .lf-rec form { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
  .lf-rec label { font-size: 12px; font-weight: 600; color: var(--mut); margin-top: 4px; }
  .lf-rec input[type="text"], .lf-rec input[type="password"], .lf-rec input[type="date"], .lf-rec input:not([type]) {
    width: 100%; padding: 11px 13px; border: 1.5px solid var(--line); border-radius: 12px; background: var(--field);
    font-size: 14px; font-family: inherit; color: var(--ink);
  }
  .lf-rec input:focus { outline: none; background: #fff; border-color: var(--o); box-shadow: 0 0 0 4px rgba(232,88,42,0.14); }
  .lf-rec-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; background: var(--field); border-radius: 12px; margin-top: 8px; }
  .lf-rec-tabs button { padding: 8px; border: 0; border-radius: 9px; background: transparent; font-weight: 600; font-size: 13px; color: var(--mut); cursor: pointer; }
  .lf-rec-tabs button.on { background: #fff; color: var(--o); box-shadow: 0 2px 8px rgba(27,20,16,.08); }
  .lf-rec-check { display: flex; align-items: center; gap: 8px; font-weight: 500 !important; cursor: pointer; }
  .lf-rec-btn { margin-top: 8px; padding: 13px; border: 0; border-radius: 14px; cursor: pointer; color: #fff; font-size: 14.5px; font-weight: 700; background: linear-gradient(135deg, var(--o2), #e04a1a); box-shadow: 0 10px 22px var(--o-glow); }
  .lf-rec-btn:disabled { opacity: .7; cursor: default; }
  .lf-rec-msg { border-radius: 12px; padding: 10px 12px; font-size: 13px; line-height: 1.45; }
  .lf-rec-msg.ok { background: #e6f7ee; color: #15803d; }
  .lf-rec-msg.err { background: #fef2f2; color: #dc2626; }
  .lf-rec-alt { display: block; margin: 14px auto 0; }


  /* ───── Log in dropdown ───── */
  .lf-main { position: relative; }
  .lf-login-link {
    margin-left: auto; display: inline-flex; align-items: center; gap: 8px; padding: 9px 14px;
    background: none; border: none; border-radius: 10px; cursor: pointer;
    font-size: 14px; font-weight: 600; color: #3d322c; transition: color .15s, background .15s;
  }
  .lf-login-link svg { width: 17px; height: 17px; }
  .lf-login-link:hover, .lf-login-link.open { color: var(--o); background: var(--o-soft); }
  .lf-login-link:focus-visible { outline: 2px solid var(--o); outline-offset: 2px; }
  .lf-drop {
    position: absolute; top: 0; right: 24px; z-index: 25; width: 400px; max-width: calc(100% - 24px);
    background: #fff; border-radius: 0 0 10px 10px; padding: 22px 22px 20px;
    box-shadow: 0 24px 60px rgba(27,20,16,0.28), 0 2px 8px rgba(27,20,16,0.08);
    animation: lf-pop .2s ease-out;
  }
  .lf-drop .lf-form { gap: 12px; }
  /* log in ⇄ recover account: two panes side by side; the box slides and changes height smoothly */
  .lf-dv { overflow: hidden; margin: -4px -6px; padding: 4px 6px; transition: height .35s cubic-bezier(.2,.8,.2,1); }
  .lf-dv-track { display: flex; width: 200%; align-items: flex-start; transition: transform .4s cubic-bezier(.2,.8,.2,1); }
  .lf-dv-track.recover { transform: translateX(-50%); }
  .lf-dv-pane { width: 50%; flex: none; padding: 0 6px 6px; transition: opacity .3s; }
  /* same white fields as the log-in form */
  .lf-drop .lf-rec input:not([type="checkbox"]) { background: #fff !important; border: 1.5px solid #e9e0da !important; }
  .lf-drop .lf-rec input:not([type="checkbox"]):focus { border-color: var(--o) !important; }
  .lf-dv-track.login > .lf-dv-pane:last-child, .lf-dv-track.recover > .lf-dv-pane:first-child { opacity: 0; }
  .lf-dv-back { display: inline-flex; align-items: center; gap: 4px; margin: -4px 0 6px -4px; padding: 4px 8px 4px 4px; border: 0; background: none;
    border-radius: 8px; color: var(--mut); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
  .lf-dv-back:hover { color: var(--o); background: var(--o-soft); }
  .lf-drop .lf-rec { animation: lf-slidein .3s ease-out; }
  .lf-drop .lf-rec h3 { margin: 0; font-size: 18px; }
  .lf-drop .lf-rec .lf-rec-btn { padding: 10px 14px; font-size: 14px; border-radius: 12px; }
  @media (prefers-reduced-motion: reduce) { .lf-dv, .lf-dv-track, .lf-dv-pane { transition: none; } }
  /* smaller Sign in / Google buttons in the log-in box */
  .lf-drop .lf-login-btn { padding: 10px 14px; font-size: 14px; border-radius: 12px; box-shadow: 0 8px 18px var(--o-glow); }
  .lf-drop .lf-login-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 10px 22px rgba(232,88,42,0.35); }
  .lf-drop .lf-google { padding: 9px 14px; font-size: 13.5px; border-radius: 12px; }
  .lf-drop .lf-or { margin: 10px 0 9px; }
  /* the picture always covers its box without being squashed */
  .lf-campus { object-fit: cover; object-position: center 75%; }


  /* ───── Info panel (right) ───── */
  .lf-info { max-width: 410px; }
  .lf-info .lf-welcome { margin-top: 12px; font-size: 22px; }
  .lf-info .lf-welcome-sub { margin: 4px auto 12px; }
  .lf-now { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 12.5px; color: var(--mut); background: var(--field); border-radius: 99px; padding: 7px 14px; }
  .lf-now b { color: var(--ink); font-weight: 700; }
  .lf-now-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 6px #22c55e; }
  .lf-info-h { margin: 16px 0 8px; font-family: var(--display); font-size: 13px; font-weight: 800; letter-spacing: .3px; text-transform: uppercase; color: var(--o); }
  .lf-steps { list-style: none; display: flex; flex-direction: column; gap: 10px; }
  .lf-steps li { display: flex; gap: 12px; align-items: flex-start; }
  .lf-steps li > span { flex-shrink: 0; width: 26px; height: 26px; border-radius: 50%; background: var(--o-soft); color: var(--o); font-weight: 800; font-size: 13px; display: flex; align-items: center; justify-content: center; }
  .lf-steps b { display: block; font-size: 13.5px; }
  .lf-steps small { display: block; margin-top: 1px; font-size: 12px; line-height: 1.45; color: var(--mut); }
  /* "Who uses it": four tiles of the same size — icon on the left, name and what they do on the right */
  .lf-roles-grid { display: grid; grid-template-columns: 1fr 1fr; grid-auto-rows: 1fr; gap: 8px; }
  .lf-roles-grid > div {
    display: grid; grid-template-columns: 18px minmax(0, 1fr); grid-template-rows: auto auto; column-gap: 10px; row-gap: 1px;
    align-content: center; padding: 10px 12px; background: var(--field); border-radius: 10px; color: var(--o); min-width: 0;
  }
  .lf-roles-grid svg { grid-column: 1; grid-row: 1 / span 2; align-self: center; width: 18px; height: 18px; }
  .lf-roles-grid b { grid-column: 2; font-size: 12.5px; line-height: 1.3; color: var(--ink); }
  .lf-roles-grid small { grid-column: 2; font-size: 11px; line-height: 1.35; color: var(--mut); }
  .lf-info-cta { width: 100%; margin-top: 16px; }
  @media (max-height: 1000px) and (min-width: 901px) {
    .lf-info .lf-welcome-sub, .lf-now { display: none; }
    .lf-info .lf-welcome { font-size: 20px; margin-top: 10px; }
    .lf-info-h { margin: 12px 0 7px; font-size: 12px; }
    .lf-steps { gap: 8px; }
    .lf-steps small { font-size: 11.5px; line-height: 1.4; }
    .lf-roles-grid > div { padding: 8px 11px; }
    .lf-info-cta { margin-top: 14px; }
  }

  /* ───── Motion ───── */
  @keyframes lf-slidein { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  @keyframes lf-rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
  @keyframes lf-pop { from { opacity: 0; transform: translateY(-6px) scale(.98); } to { opacity: 1; transform: none; } }
  @keyframes lf-fadein { from { opacity: 0; } to { opacity: 1; } }
  @keyframes lf-spin { to { transform: rotate(360deg); } }

  /* 6s loop: card glides in, taps the reader, check-in confirms, card leaves */
  @keyframes lf-card {
    0%   { transform: translate(70px,-90px) rotate(10deg); opacity: 0; }
    14%  { opacity: 1; }
    30%  { transform: translate(0,-8px) rotate(-5deg); opacity: 1; }
    37%  { transform: translate(0,12px) rotate(-5deg); opacity: 1; }
    45%  { transform: translate(0,-2px) rotate(-5deg); opacity: 1; }
    78%  { transform: translate(0,-2px) rotate(-5deg); opacity: 1; }
    92%, 100% { transform: translate(-70px,-80px) rotate(-14deg); opacity: 0; }
  }
  @keyframes lf-ring {
    0%, 36% { transform: scale(1); opacity: 0; }
    38%     { transform: scale(1); opacity: .8; }
    62%, 100% { transform: scale(1.7); opacity: 0; }
  }
  @keyframes lf-led {
    0%, 36% { background: #ffb48f; box-shadow: 0 0 12px #ffb48f; }
    38%, 82% { background: #3ddc97; box-shadow: 0 0 14px #3ddc97; }
    92%, 100% { background: #ffb48f; box-shadow: 0 0 12px #ffb48f; }
  }
  /* the result shows the moment the card touches the reader (~37%), together with the green LED */
  @keyframes lf-toast {
    0%, 37% { opacity: 0; transform: translateY(10px) scale(.97); }
    41%     { opacity: 1; transform: translateY(0) scale(1); }
    82%     { opacity: 1; transform: translateY(0) scale(1); }
    90%, 100% { opacity: 0; transform: translateY(-8px) scale(.98); }
  }

  @media (prefers-reduced-motion: reduce) {
    .lf-card, .lf-slide-inner, .lf-modal, .lf-error, .lf-reader-ring, .lf-reader-led { animation: none !important; }
    .lf-tapcard { animation: none !important; opacity: 1; transform: translate(0,-2px) rotate(-5deg); }
    .lf-toast { animation: none !important; opacity: 1; }
    .lf-reader-led { background: #3ddc97; box-shadow: 0 0 14px #3ddc97; }
    .lf-side, .lf-side-label, .lf-brand-name, .lf-login-btn, .lf-login-btn::after { transition: none !important; }
  }

  /* ───── Medium screens: no room for the tap scene beside the text ───── */
  @media (min-width: 901px) and (max-width: 1240px) {
    .lf-scene { display: none; }
  }

  /* ───── Tablet / mobile ───── */
  @media (max-width: 900px) {
    .lf-page { height: auto; min-height: 100vh; }
    .lf-strip, .lf-strip.open { width: 0; }
    .lf-side { width: 0; }
    .lf-side.open { width: 236px; box-shadow: 10px 0 40px rgba(0,0,0,0.25); }
    .lf-backdrop { display: block; }
    .lf-split { flex-direction: column; }
    .lf-hero { flex: none; height: 580px; }
    .lf-right { flex: none; }
    .lf-fs-btn { display: none; }
  }
  @media (max-width: 700px) {
    .lf-scene { display: none; }
  }
  @media (max-width: 520px) {
    .lf-hero { height: 560px; }
    .lf-hero-text { padding: 26px 22px 24px; }
    .lf-nav-links > button { padding: 8px 6px; }
    .lf-brand-name { font-size: 9.5px; letter-spacing: .3px; }
    .lf-brand-name.show { max-width: 110px; margin-left: 6px; }
    .lf-right { padding: 20px 14px; }
    .lf-card { padding: 22px 20px 20px; }
  }

  /* Short screens: tighten up so the card never needs to scroll */
  @media (max-height: 900px) and (min-width: 901px) {
    .lf-switch { display: none; }
    .lf-card { padding: 20px 26px; }
    .lf-form { gap: 10px; }
  }
  @media (max-height: 780px) and (min-width: 901px) {
    .lf-welcome-sub { display: none; }
    .lf-welcome { margin-bottom: 12px; }
    .lf-roles { margin-top: 10px; }
    .lf-field-body { padding: 7px 0 6px; }
  }

  /* ═══════ Same look as the dashboards ═══════
     gray page, the logo in a white tile, one white rounded panel with the content inside,
     cards with a thin gray border, solid orange buttons */
  .lf-page { background: #f3f4f6 !important; }
  .lf-nav { background: transparent !important; box-shadow: none !important; height: 72px; padding: 0 22px 0 18px; }
  .lf-nav-logo { width: 42px; height: 42px; object-fit: contain; padding: 4px; box-sizing: border-box; background: #fff;
    border: 1px solid #e7e9ee; border-radius: 12px; box-shadow: 0 1px 2px rgba(15,23,42,.05); }
  .lf-brand-name { color: #111827; }
  .lf-icon-btn { width: 40px; height: 40px; align-items: center; justify-content: center; background: #fff; border: 1px solid #e7e9ee; border-radius: 12px; }
  .lf-icon-btn:hover { background: #fff7f2; border-color: #f6c9b3; }
  .lf-nav-links > button { color: #374151; font-weight: 500; }
  .lf-nav-links > button:hover { background: #fff; color: #c2410c; }
  .lf-login-link { background: #e8582a !important; color: #fff !important; border-radius: 10px !important; height: 40px; padding: 0 16px !important; font-weight: 600; }
  .lf-login-link svg { stroke: #fff; }
  .lf-login-link:hover, .lf-login-link.open { background: #d44b20 !important; color: #fff !important; }

  /* the white panel (like the dashboard's) */
  .lf-body { padding: 0 12px 12px; }
  .lf-main { background: #fff; border: 1px solid #e7e9ee; border-radius: 18px; overflow: hidden; }
  .lf-split { gap: 14px; padding: 14px; }
  .lf-hero { border-radius: 14px; }
  .lf-right { flex-basis: 440px; padding: 0; background: #fff !important; }
  .lf-card { max-width: none; height: 100%; margin: 0; display: flex; flex-direction: column; justify-content: center;
    background: #fff; border: 1px solid #e7e9ee; border-radius: 16px; box-shadow: none; backdrop-filter: none; -webkit-backdrop-filter: none; padding: 24px 28px; }
  .lf-card-logo { width: 34px; height: 34px; padding: 3px; border: 1px solid #e7e9ee; border-radius: 10px; background: #fff; }
  .lf-underline { border-bottom: 0; }
  .lf-welcome { font-weight: 700; color: #111827; }
  .lf-info-h { color: #8b919b !important; letter-spacing: .07em; font-size: 11px !important; }
  /* steps and role tiles like the dashboard's small tiles */
  .lf-steps > li > span:first-child, .lf-steps li > span:first-child { background: #fff3ec !important; border: 1px solid #fbe0d2 !important; color: #e8582a !important; box-shadow: none !important; }
  .lf-roles-grid > * { background: #fafafb !important; border: 1px solid #eef0f3 !important; border-radius: 12px !important; box-shadow: none !important; }
  .lf-roles-grid svg { color: #e8582a; }
  /* solid orange button like "Submit MOV" on the dashboard */
  .lf-login-btn { background: #e8582a !important; background-image: none !important; box-shadow: 0 1px 2px rgba(232,88,42,.25) !important; border-radius: 12px !important; }
  .lf-login-btn:hover:not(:disabled) { background: #d44b20 !important; transform: none !important; }
  .lf-field { border-radius: 12px; border-color: #e3e5ea; }
  .lf-google { border-radius: 12px; border-color: #e3e5ea; }

  /* the log-in box: a floating card like the dashboard's slide-in panel */
  .lf-drop { top: 10px; right: 22px; border-radius: 18px; border: 1px solid #e7e9ee; box-shadow: 0 24px 60px rgba(17,24,39,.18); }

  /* the hero's bottom slide card: same rounded glass, smaller radius to match */
  .lf-slide { border-radius: 14px !important; }

  @media (max-width: 900px) {
    .lf-body { padding: 0 8px 8px; }
    .lf-split { padding: 8px; gap: 8px; }
    .lf-card { height: auto; }
    .lf-nav-logo { width: 36px; height: 36px; padding: 3px; border-radius: 10px; }
    .lf-login-link { height: 36px; padding: 0 12px !important; white-space: nowrap; flex-shrink: 0; }
    .lf-nav { gap: 6px; padding: 0 10px; }
    .lf-nav-links { margin-left: auto; }
    .lf-main { overflow: visible; }
    .lf-right { flex: none !important; height: auto !important; overflow: visible !important; }
    .lf-card { margin: 0 !important; }
  }

  /* ═══ Layout C: the form lives on the page (right card), no dropdown ═══ */
  .lf-login-link { display: none !important; }
  .lf-formcard { justify-content: center; gap: 0; padding: 28px 34px !important; }
  .lf-hello { align-self: flex-start; display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: 99px; background: #fff3ec; color: #c2410c; font-size: 11.5px; font-weight: 600; margin-bottom: 10px; }
  .lf-formcard .lf-welcome { text-align: left; margin: 0; font-size: 26px; }
  .lf-formcard .lf-welcome-sub { text-align: left; margin: 4px 0 18px; max-width: none; }
  .lf-formcard .lf-dv { width: 100%; }
  .lf-formcard .lf-switch { display: block !important; text-align: center; margin-top: 14px; font-size: 12px; color: #6b7280; }
  .lf-formcard .lf-dv-pane { padding-bottom: 6px; }
  @media (max-width: 900px) {
    .lf-formcard { padding: 22px 20px !important; }
    /* phones: the form first, the photo below it */
    .lf-right { order: -1; }
    .lf-hero { height: 420px !important; }
  }

  /* ═══ Spacing that doesn't depend on the project's global h1/h2/p styles ═══ */
  .lf-hero .lf-hero-text h1 { color: #fff !important; margin: 0 !important; line-height: 1.06 !important; }
  .lf-hero .lf-hero-text h2 { margin: 14px 0 0 !important; line-height: 1.35 !important; font-size: 16px !important; font-weight: 600 !important; color: #ffb48f !important; }
  .lf-hero .lf-hero-text .lf-desc { margin: 6px 0 0 !important; line-height: 1.6 !important; }
  .lf-formcard .lf-welcome { margin: 0 !important; line-height: 1.2 !important; color: #111827 !important; }
  .lf-formcard .lf-welcome-sub { margin: 6px 0 20px !important; line-height: 1.45 !important; display: block !important; color: #6b7280 !important; font-size: 13px !important; }
  .lf-formcard .lf-hello { margin-bottom: 12px !important; line-height: 1 !important; }
  .lf-formcard .lf-form { gap: 12px !important; }
  .lf-formcard .lf-field label { margin: 0 0 2px !important; line-height: 1.2 !important; }
  .lf-formcard .lf-field input { line-height: 1.3 !important; height: auto !important; }
  .lf-formcard .lf-field-body { padding: 9px 0 8px !important; }
  .lf-formcard .lf-or { margin: 14px 0 !important; }
  .lf-formcard .lf-switch { margin-top: 16px !important; line-height: 1.4 !important; }
  .lf-formcard .lf-login-btn { margin-top: 2px !important; }
  /* top bar: logo on the left; About, FAQs and full screen on the right */
  .lf-nav .lf-nav-links { margin-left: auto !important; order: 2; }
  .lf-nav .lf-fs-btn { order: 3; margin-left: 6px; }
`;