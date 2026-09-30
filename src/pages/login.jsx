import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";
// 👇 your university photo (change the filename/extension if yours is different)
import campus from "../assets/campus.jpg";

const API = "http://localhost:8000/api";
const REMEMBER_KEY = "ojt_remember";
const REMEMBER_DAYS = 7;

const SLIDES = [
  { title: "One tap, one record", text: "Touch your NFC card to the reader. Your check-in or check-out is logged before you've put your card away." },
  { title: "Every tap has a fingerprint", text: "Each log gets its own unique UUID, so no record can be swapped, edited, or quietly forgotten." },
  { title: "Watch the hours add up", text: "See your OJT progress climb in real time, down to the last hour you've rendered." },
  { title: "Onsite, WFH, or output-based", text: "However you work, your hours are counted the way your setup needs them to be." },
  { title: "Goodbye, paper MOVs", text: "Upload your certificates and requirements once. Your coordinator reviews them online." },
];

const FAQS = [
  { q: "How do I check in and out?", a: "Tap your registered NFC card on the reader at your workplace. The time is recorded instantly with its own unique ID." },
  { q: "I forgot my password. What now?", a: "Reach out to your OJT coordinator. They can reset your account so you can get back in." },
  { q: "Can I log hours if I work from home?", a: "Yes. Onsite, Offsite/WFH, and Output-based interns are all supported. Your coordinator sets the work type that fits you." },
  { q: "What are MOVs?", a: "Means of Verification: the certificates and requirements you submit so your coordinator can confirm your OJT progress." },
  { q: "Who can see my attendance?", a: "You, your assigned supervisor, and your OJT coordinator." },
];

/* ── small icons ── */
const Icon = ({ d, size = 20, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d ? <path d={d} /> : children}
  </svg>
);
const HomeIcon = () => <Icon d="M3 11.5 12 4l9 7.5M5.5 10v10h13V10" />;
const InfoIcon = () => <Icon><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Icon>;
const HelpIcon = () => <Icon><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8M12 17h.01" /></Icon>;
const UserIcon = () => <Icon><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></Icon>;
const StaffIcon = () => <Icon><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" /></Icon>;

export default function LoginForm({ variant = "student" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [slide, setSlide] = useState(0);
  const [othersOpen, setOthersOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState(null); // null | "about" | "faqs"
  const [faqOpen, setFaqOpen] = useState(0);
  const [isFull, setIsFull] = useState(false);
  const [remember, setRemember] = useState(false);
  const navigate = useNavigate();

  // Which role the person picked on the form: "intern" or "employee"
  const [role, setRole] = useState(variant === "student" ? "intern" : "employee");
  useEffect(() => {
    setRole(variant === "student" ? "intern" : "employee");
  }, [variant]);
  const isStudent = role === "intern";

  const pickRole = (r) => {
    setRole(r);
    setError(null);
  };

  const goByRole = (data) => {
    if (data.role === "intern") navigate("/intern");
    else if (data.role === "supervisor") navigate("/supervisor");
    else if (data.role === "admin" || data.role === "ojt_coordinator") navigate("/admin");
    else setError("Unknown role. Contact administrator.");
  };

  // If "Remember me" was ticked within the last 7 days, skip the login screen
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

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setPanel(null);
        setMenuOpen(false);
        setOthersOpen(false);
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
    setMenuOpen(false);
    setOthersOpen(false);
    setPanel(null);
    navigate(path);
  };
  const openPanel = (name) => {
    setMenuOpen(false);
    setOthersOpen(false);
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

      // Make sure the account matches the role that was picked
      if (isStudent && data.role !== "intern") {
        throw new Error("This isn't an intern account. Please select Employee instead.");
      }
      if (!isStudent && data.role === "intern") {
        throw new Error("This is an intern account. Please select Intern instead.");
      }

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

  const handleGoogle = () => {
    // Your backend starts the Google sign-in flow at this URL (e.g. Laravel Socialite)
    window.location.href = `${API}/auth/google?role=${isStudent ? "intern" : "employee"}`;
  };

  const sideItems = [
    { label: "Home", icon: <HomeIcon />, onClick: () => go(isStudent ? "/login" : "/login/staff"), active: true },
  ];

  return (
    <div className="lf-page">
      {/* ── Top navbar ── */}
      <header className="lf-nav">
        <button className="lf-logo-btn" onClick={() => go(isStudent ? "/login" : "/login/staff")} aria-label="Home">
          <img src={logo} alt="CSU CCIS" className="lf-nav-logo" />
          <span className={menuOpen ? "lf-brand-name show" : "lf-brand-name"} aria-hidden={!menuOpen}>
            CARAGA STATE<br />UNIVERSITY
          </span>
        </button>

        <button
          className="lf-icon-btn"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1e293b" strokeWidth="2.4" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
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
      </header>

      <div className="lf-body">
        {/* White sidebar: expands to show labels when the ☰ is pressed */}
        <div className={menuOpen ? "lf-strip open" : "lf-strip"} />
        {menuOpen && <div className="lf-backdrop" onClick={() => setMenuOpen(false)} />}
        <aside className={menuOpen ? "lf-side open" : "lf-side"} aria-label="Main navigation">
          {sideItems.map((it) => (
            <button
              key={it.label}
              className={it.active ? "lf-side-item active" : "lf-side-item"}
              onClick={it.onClick}
              title={it.label}
              tabIndex={0}
            >
              <span className="lf-side-icon">{it.icon}</span>
              <span className="lf-side-label">{it.label}</span>
            </button>
          ))}
          <div className="lf-side-foot">CSU CCIS OJT</div>
        </aside>

        <div className="lf-main">

          <div className="lf-split">
            {/* ── Left: hero with campus photo ── */}
            <section className="lf-hero">
              <div className="lf-hero-text">
                <div className="lf-title-row">
                  <div className="lf-nfc" aria-hidden="true">
                    <span className="lf-ring r1" />
                    <span className="lf-ring r2" />
                    <span className="lf-nfc-core">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
                        <path d="M8 8.5a5 5 0 0 1 0 7M12 6a8.5 8.5 0 0 1 0 12M16 3.5a12 12 0 0 1 0 17" />
                      </svg>
                    </span>
                  </div>
                  <h1>Tap in. Clock in.<br />Get on with your day.</h1>
                </div>

                <h2>OJT attendance, minus the paper trail.</h2>
                <p className="lf-desc">
                  No sign-in sheets, no lost logbooks. Tap your NFC card at the door and CSU CCIS OJT
                  records the moment, time-stamped, verified, and ready for your coordinator to see.
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

              <div className="lf-fade" />
              <img src={campus} alt="CSU CCIS building" className="lf-campus" />
            </section>

            {/* ── Right: login card ── */}
            <section className="lf-right">
              <span className="lf-orb o1" />
              <span className="lf-orb o2" />
              <div className="lf-card">
                <div className="lf-card-head">
                  <img src={logo} alt="" className="lf-card-logo" />
                  <div className="lf-brand">
                    CSU CCIS <span className="lf-underline">OJT</span>
                  </div>
                </div>
                <div className="lf-roles" role="radiogroup" aria-label="Select your role">
                  <span className={isStudent ? "lf-roles-thumb" : "lf-roles-thumb right"} aria-hidden="true" />
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isStudent}
                    className={isStudent ? "lf-role active" : "lf-role"}
                    onClick={() => pickRole("intern")}
                  >
                    <UserIcon /> Intern
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!isStudent}
                    className={!isStudent ? "lf-role active" : "lf-role"}
                    onClick={() => pickRole("employee")}
                  >
                    <StaffIcon /> Employee
                  </button>
                </div>
                <h3 className="lf-welcome">{isStudent ? "Welcome back!" : "Good to see you again."}</h3>
                <p className="lf-welcome-sub">
                  {isStudent
                    ? "Sign in to see how many hours you've logged so far."
                    : "Sign in to review your interns' hours and requirements."}
                </p>

                {error && (
                  <div className="lf-error" role="alert">
                    <span className="lf-error-dot">!</span> {error}
                  </div>
                )}

                <form onSubmit={handleLogin} className="lf-form">
                  <div className="lf-field">
                    <span className="lf-field-icon"><UserIcon /></span>
                    <div className="lf-field-body">
                      <label htmlFor="lf-email">Username</label>
                      <input
                        id="lf-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@carsu.edu.ph"
                        required
                        autoComplete="username"
                      />
                    </div>
                  </div>

                  <div className="lf-field">
                    <span className="lf-field-icon">
                      <Icon><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></Icon>
                    </span>
                    <div className="lf-field-body">
                      <label htmlFor="lf-pass">Password</label>
                      <input
                        id="lf-pass"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Your password"
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
                    <button type="button" className="lf-link" onClick={() => openPanel("forgot")}>
                      Forgot password?
                    </button>
                  </div>

                  <button type="submit" disabled={loading} className="lf-login-btn">
                    {loading ? "Signing in..." : "LOGIN"}
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

                <div className="lf-switch">
                  {isStudent
                    ? "Employee? Supervisors and coordinators, pick Employee above."
                    : "Intern? Students on OJT, pick Intern above."}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* ── About / FAQ panel ── */}
      {panel && (
        <div className="lf-modal-wrap" onClick={() => setPanel(null)}>
          <div className="lf-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button className="lf-modal-x" onClick={() => setPanel(null)} aria-label="Close">×</button>

            {panel === "about" && (
              <>
                <h3>About CSU CCIS OJT</h3>
                <p className="lf-modal-lead">Attendance tracking built for the way interns actually work.</p>
                <p>
                  This system replaces paper logbooks with a single NFC tap. Interns check in and out in
                  a second, supervisors see who is on duty, and coordinators can follow every intern's
                  progress toward their required hours without chasing signatures.
                </p>
                <p>
                  Every tap is saved with a unique UUID, and requirements (MOVs) are submitted and
                  reviewed online, so nothing gets lost between the workplace and the coordinator's desk.
                </p>
                <p className="lf-modal-note">Made for the College of Computing and Information Sciences, CSU.</p>
              </>
            )}

            {panel === "forgot" && (
              <>
                <h3>Forgot your password?</h3>
                <p className="lf-modal-lead">No worries, it happens to everyone.</p>
                <p>
                  {isStudent
                    ? "Message your OJT coordinator and ask for a password reset. Include your full name and the email you use to sign in."
                    : "Contact the system administrator and ask for a password reset. Include your full name and the email you use to sign in."}
                </p>
                <p>Once your account is reset, you'll get a new password you can use to sign in right away.</p>
                <p className="lf-modal-note">Signed up with Google? Use the "Sign in with Google" button instead. No password needed.</p>
              </>
            )}

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
                      {faqOpen === i && <p>{f.a}</p>}
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
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; width: 100%; }
  body { font-family: 'Poppins', 'Segoe UI', sans-serif; color: #0f172a; }
  button { font-family: inherit; }

  .lf-page { height: 100vh; min-height: 680px; display: flex; flex-direction: column; background: #fff; position: relative; }

  /* ───── Navbar ───── */
  .lf-nav {
    height: 75px; flex-shrink: 0; background: #fff;
    display: flex; align-items: center; gap: 10px;
    padding: 0 18px 0 15px; position: relative; z-index: 30;
    box-shadow: 0 4px 14px rgba(15,23,42,0.12);
  }
  .lf-logo-btn { background: none; border: none; cursor: pointer; display: flex; margin-right: 14px; }
  .lf-logo-btn { align-items: center; text-align: left; }
  .lf-nav-logo { height: 42px; width: auto; flex-shrink: 0; }
  .lf-brand-name {
    display: block; overflow: hidden; white-space: nowrap;
    max-width: 0; opacity: 0; margin-left: 0;
    font-size: 11.5px; font-weight: 800; line-height: 1.2; letter-spacing: .8px; color: #0b1220;
    transition: max-width .35s cubic-bezier(.2,.8,.2,1), opacity .25s, margin-left .35s;
  }
  .lf-brand-name.show { max-width: 170px; opacity: 1; margin-left: 10px; }
  .lf-icon-btn {
    background: none; border: none; cursor: pointer; padding: 8px; border-radius: 8px;
    display: flex; transition: background .15s;
  }
  .lf-icon-btn:hover { background: #fdeee7; }
  .lf-nav-links { display: flex; align-items: center; gap: 6px; margin-left: 8px; }
  .lf-nav-links > button, .lf-dropdown > button {
    color: #334155; font-size: 14px; background: none; border: none; cursor: pointer;
    display: flex; align-items: center; gap: 5px; padding: 8px 10px; border-radius: 8px;
    transition: color .15s, background .15s;
  }
  .lf-nav-links > button:hover, .lf-dropdown > button:hover { color: #e8582a; background: #fdeee7; }
  .lf-caret { border: 4px solid transparent; border-top-color: currentColor; margin-top: 4px; transition: transform .2s; }
  .lf-caret.up { transform: rotate(180deg); margin-top: -4px; }
  .lf-dropdown { position: relative; }
  .lf-click-away { position: fixed; inset: 0; z-index: 40; }
  .lf-menu {
    position: absolute; top: 40px; left: 0; background: #fff; min-width: 170px; z-index: 50;
    border-radius: 12px; box-shadow: 0 14px 40px rgba(15,23,42,0.16); padding: 6px;
    animation: lf-pop .16s ease-out;
  }
  .lf-menu button {
    display: block; width: 100%; text-align: left; background: none; border: none; cursor: pointer;
    padding: 9px 12px; border-radius: 8px; font-size: 13px; color: #1e293b;
  }
  .lf-menu button:hover { background: #fdeee7; color: #e8582a; }

  /* ───── Frame + sidebar ───── */
  .lf-body { flex: 1; display: flex; min-height: 0; position: relative; }
  /* the strip reserves the sidebar's space, so the page (and photo) shrink instead of being covered */
  .lf-strip { width: 65px; flex-shrink: 0; transition: width .3s cubic-bezier(.2,.8,.2,1); }
  .lf-strip.open { width: 236px; }
  .lf-backdrop { display: none; position: absolute; inset: 0; background: rgba(15,23,42,0.35); z-index: 18; animation: lf-fadein .2s; }
  .lf-side {
    position: absolute; top: 0; bottom: 0; left: 0; width: 65px; z-index: 20; overflow: hidden;
    background: #fff; box-shadow: 4px 0 18px rgba(15,23,42,0.10);
    display: flex; flex-direction: column; padding-top: 14px;
    transition: width .3s cubic-bezier(.2,.8,.2,1), box-shadow .3s;
  }
  .lf-side.open { width: 236px; }
  .lf-side-item {
    display: flex; align-items: center; gap: 16px; height: 48px; margin: 2px 10px;
    padding: 0 0 0 13px; border: none; background: none; cursor: pointer; color: #334155;
    border-radius: 12px; white-space: nowrap; text-align: left; transition: background .15s;
  }
  .lf-side-item:hover { background: #fdeee7; color: #e8582a; }
  .lf-side-item.active { background: #fdeee7; color: #e8582a; }
  .lf-side-item:focus-visible { outline: 2px solid #e8582a; outline-offset: 1px; }
  .lf-side-icon { display: flex; flex-shrink: 0; }
  .lf-side-label { font-size: 14px; font-weight: 600; opacity: 0; transform: translateX(-6px); transition: opacity .2s, transform .25s; }
  .lf-side.open .lf-side-label { opacity: 1; transform: none; transition-delay: .1s; }
  .lf-side-foot {
    margin-top: auto; padding: 18px 22px; font-size: 11px; letter-spacing: .5px; color: #94a3b8;
    white-space: nowrap; opacity: 0; transition: opacity .2s;
  }
  .lf-side.open .lf-side-foot { opacity: 1; transition-delay: .15s; }

  .lf-main { flex: 1; display: flex; flex-direction: column; min-width: 0; background: #eef2f3; }
  .lf-split { flex: 1; display: flex; min-height: 0; }

  /* ───── Hero ───── */
  .lf-hero { position: relative; flex: 1 1 0; min-width: 0; background: #fff; overflow: hidden; }
  .lf-hero-text { position: relative; z-index: 3; padding: 22px 44px 0; max-width: 780px; }
  .lf-title-row { display: flex; align-items: center; gap: 18px; }
  .lf-hero h1 { font-size: 30px; font-weight: 800; line-height: 1.15; letter-spacing: -0.4px; color: #0b1220; }
  .lf-hero h2 { font-size: 15px; font-weight: 600; margin-top: 14px; color: #e8582a; }
  .lf-desc { font-size: 13px; line-height: 1.6; color: #334155; margin-top: 6px; max-width: 560px; }

  /* NFC pulse badge: the one memorable moment */
  .lf-nfc { position: relative; width: 54px; height: 54px; flex-shrink: 0; }
  .lf-nfc-core {
    position: absolute; inset: 0; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, #f2864f, #e8582a); box-shadow: 0 8px 20px rgba(232,88,42,0.4);
  }
  .lf-ring { position: absolute; inset: 0; border-radius: 50%; border: 2px solid #e8582a; opacity: 0; animation: lf-pulse 2.6s ease-out infinite; }
  .lf-ring.r2 { animation-delay: 1.3s; }

  .lf-slide { margin-top: 20px; max-width: 470px; padding: 14px 16px 12px; background: rgba(255,255,255,0.82); backdrop-filter: blur(6px); border-radius: 14px; border: 1px solid #fde1d5; }
  .lf-slide-inner { animation: lf-slidein .5s ease-out; min-height: 66px; }
  .lf-slide-title { font-size: 14px; font-weight: 700; color: #0b1220; }
  .lf-slide-text { font-size: 12.5px; line-height: 1.55; color: #475569; margin-top: 2px; }
  .lf-dots { display: flex; gap: 6px; margin-top: 10px; }
  .lf-dot { width: 7px; height: 7px; border-radius: 99px; border: none; padding: 0; cursor: pointer; background: #f3c3b0; transition: width .3s, background .3s; }
  .lf-dot.active { width: 24px; background: #e8582a; }
  .lf-dot:focus-visible { outline: 2px solid #e8582a; outline-offset: 2px; }

  /* Photo position: change these two numbers to nudge the picture.
     --campus-lift  = gap under the photo (bigger = photo sits higher)
     --campus-height = how tall the photo box is */
  .lf-hero { --campus-lift: 3%; --campus-height: 90%; }
  .lf-fade { position: absolute; left: 0; right: 0; top: 0; height: 46%; z-index: 2; pointer-events: none;
    background: linear-gradient(180deg, #ffede2 50%, rgba(255,255,255,0) 100%); }
  .lf-campus {
    position: absolute; left: 0; right: 0; bottom: var(--campus-lift);
    width: 100%; height: var(--campus-height);
    object-fit: cover; object-position: center 30%; z-index: 1;
  }

  /* ───── Right side ───── */
  .lf-right { position: relative; flex: 0 0 440px; display: flex; align-items: center; justify-content: center; padding: 16px 24px; overflow: hidden; }
  .lf-orb { position: absolute; border-radius: 50%; pointer-events: none; }
  .lf-orb.o1 { width: 260px; height: 260px; top: -90px; right: -70px; background: radial-gradient(circle, rgba(242,134,79,0.35), rgba(242,134,79,0)); }
  .lf-orb.o2 { width: 300px; height: 300px; bottom: -120px; left: -90px; background: radial-gradient(circle, rgba(232,88,42,0.22), rgba(232,88,42,0)); }

  .lf-card {
    position: relative; margin: auto; background: #fff; width: 100%; max-width: 384px; border-radius: 24px;
    padding: 22px 28px 20px; box-shadow: 0 24px 60px rgba(15,23,42,0.10), 0 2px 6px rgba(15,23,42,0.05);
    animation: lf-rise .6s cubic-bezier(.2,.8,.2,1) both;
  }
  .lf-card-head { display: flex; align-items: center; justify-content: center; gap: 8px; }
  .lf-card-logo { width: 28px; height: 28px; object-fit: contain; }
  .lf-brand { font-size: 14px; font-weight: 700; }
  .lf-underline { border-bottom: 2px solid #e8582a; }
  .lf-roles { position: relative; display: grid; grid-template-columns: 1fr 1fr; margin-top: 12px; padding: 4px; background: #f1f5f9; border-radius: 14px; }
  .lf-roles-thumb { position: absolute; top: 4px; bottom: 4px; left: 4px; width: calc(50% - 4px); border-radius: 11px; background: linear-gradient(135deg, #f2733a, #e04a1a); box-shadow: 0 6px 14px rgba(232,88,42,0.35); transition: transform .3s cubic-bezier(.2,.8,.2,1); }
  .lf-roles-thumb.right { transform: translateX(100%); }
  .lf-role { position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; gap: 7px; padding: 10px 8px; border: none; background: none; cursor: pointer; font-size: 13px; font-weight: 600; color: #64748b; border-radius: 11px; transition: color .25s; }
  .lf-role svg { width: 17px; height: 17px; }
  .lf-role:hover { color: #e8582a; }
  .lf-role.active, .lf-role.active:hover { color: #fff; }
  .lf-role:focus-visible { outline: 2px solid #e8582a; outline-offset: 2px; }
  .lf-welcome { text-align: center; font-size: 20px; font-weight: 800; margin-top: 12px; letter-spacing: -0.3px; }
  .lf-welcome-sub { text-align: center; font-size: 12.5px; line-height: 1.5; color: #64748b; margin: 2px auto 14px; max-width: 320px; }

  .lf-error { background: #fef2f2; border: 1px solid #fca5a5; color: #dc2626; border-radius: 10px; padding: 9px 12px; font-size: 12px; display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
  .lf-error-dot { width: 16px; height: 16px; border-radius: 50%; background: #dc2626; color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; flex-shrink: 0; }

  .lf-form { display: flex; flex-direction: column; gap: 16px; }
  .lf-field { display: flex; align-items: flex-end; gap: 12px; color: #1e293b; }
  .lf-field-icon { flex-shrink: 0; padding-bottom: 5px; display: flex; transition: color .15s; }
  .lf-field:focus-within .lf-field-icon { color: #e8582a; }
  .lf-field-body { flex: 1; }
  .lf-field label { display: block; font-size: 10.5px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; margin-bottom: 2px; }
  .lf-field input { width: 100%; border: none; border-bottom: 1.5px solid #cbd5e1; background: transparent; padding: 6px 2px; font-size: 14px; font-family: inherit; color: #1e293b; transition: border-color .2s; }
  .lf-field input::placeholder { color: #b6c0cc; }
  .lf-field input:focus { outline: none; border-bottom-color: #e8582a; }

  /* Stop the browser's blue/gray autofill background */
  .lf-field input:-webkit-autofill,
  .lf-field input:-webkit-autofill:hover,
  .lf-field input:-webkit-autofill:focus,
  .lf-field input:-webkit-autofill:active {
    -webkit-box-shadow: 0 0 0 1000px #fff inset !important;
    -webkit-text-fill-color: #1e293b !important;
    caret-color: #1e293b;
    transition: background-color 9999s ease-in-out 0s;
  }
  .lf-field input:autofill {
    box-shadow: 0 0 0 1000px #fff inset !important;
    -webkit-text-fill-color: #1e293b !important;
  }
  .lf-eye { background: none; border: none; cursor: pointer; color: #64748b; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; margin-bottom: 0; border-radius: 8px; transition: color .15s, background .15s; }
  .lf-eye:hover { color: #e8582a; background: #fdeee7; }
  .lf-eye:focus-visible { outline: 2px solid #e8582a; outline-offset: 2px; }

  .lf-options { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: -4px; }
  .lf-check { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #475569; cursor: pointer; user-select: none; }
  .lf-check input { width: 16px; height: 16px; accent-color: #e8582a; cursor: pointer; flex-shrink: 0; }
  .lf-link { background: none; border: none; cursor: pointer; font-size: 12px; font-weight: 600; color: #e8582a; padding: 2px 0; white-space: nowrap; }
  .lf-link:hover { text-decoration: underline; }
  .lf-or { display: flex; align-items: center; gap: 12px; margin: 12px 0 10px; font-size: 11.5px; color: #94a3b8; }
  .lf-or::before, .lf-or::after { content: ""; flex: 1; height: 1px; background: #e2e8f0; }
  .lf-google {
    width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px; padding: 11px;
    background: #fff; border: 1.5px solid #e2e8f0; border-radius: 12px; font-size: 13.5px; font-weight: 600;
    color: #1e293b; cursor: pointer; transition: background .15s, border-color .15s, box-shadow .15s;
  }
  .lf-google:hover { background: #f8fafc; border-color: #cbd5e1; box-shadow: 0 4px 12px rgba(15,23,42,0.08); }
  .lf-google:focus-visible, .lf-link:focus-visible, .lf-check input:focus-visible { outline: 2px solid #e8582a; outline-offset: 2px; }

  .lf-login-btn {
    margin-top: 4px; padding: 12px; background: linear-gradient(135deg, #f2733a, #e04a1a); color: #fff; border: none;
    border-radius: 12px; font-size: 14px; font-weight: 700; letter-spacing: 1.2px; cursor: pointer;
    box-shadow: 0 10px 22px rgba(232,88,42,0.35); transition: transform .15s, box-shadow .15s;
  }
  .lf-login-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 14px 28px rgba(232,88,42,0.42); }
  .lf-login-btn:active:not(:disabled) { transform: translateY(0); }
  .lf-login-btn:disabled { opacity: .7; cursor: default; }
  .lf-login-btn:focus-visible, .lf-icon-btn:focus-visible, .lf-nav-links button:focus-visible, .lf-switch button:focus-visible, .lf-logo-btn:focus-visible { outline: 2px solid #e8582a; outline-offset: 2px; }

  .lf-switch { margin-top: 16px; text-align: center; font-size: 12px; line-height: 1.5; color: #94a3b8; }
  .lf-switch button { background: none; border: none; cursor: pointer; color: #e8582a; font-weight: 600; font-size: inherit; }
  .lf-switch button:hover { text-decoration: underline; }

  /* ───── About / FAQ modal ───── */
  .lf-modal-wrap { position: fixed; inset: 0; z-index: 100; background: rgba(15,23,42,0.5); display: flex; align-items: center; justify-content: center; padding: 20px; animation: lf-fadein .2s; }
  .lf-modal { position: relative; background: #fff; border-radius: 20px; max-width: 520px; width: 100%; max-height: 85vh; overflow: auto; padding: 30px 30px 26px; box-shadow: 0 30px 80px rgba(0,0,0,0.3); animation: lf-pop .25s ease-out; border-top: 5px solid #e8582a; }
  .lf-modal h3 { font-size: 20px; font-weight: 800; letter-spacing: -0.2px; }
  .lf-modal-lead { color: #e8582a; font-weight: 600; font-size: 13.5px; margin: 4px 0 14px; }
  .lf-modal p { font-size: 13.5px; line-height: 1.65; color: #475569; margin-bottom: 10px; }
  .lf-modal p.lf-modal-lead { color: #e8582a; }
  .lf-modal-note { font-size: 12px !important; color: #94a3b8 !important; margin-top: 14px; }
  .lf-modal-x { position: absolute; top: 12px; right: 14px; width: 32px; height: 32px; border-radius: 50%; border: none; background: #f1f5f9; font-size: 20px; line-height: 1; cursor: pointer; color: #475569; }
  .lf-modal-x:hover { background: #fdeee7; color: #e8582a; }

  .lf-faq { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
  .lf-faq-item { border: 1px solid #e8edf2; border-radius: 12px; overflow: hidden; transition: border-color .2s, background .2s; }
  .lf-faq-item.open { border-color: #f5b79f; background: #fffaf7; }
  .lf-faq-item button { width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 14px; background: none; border: none; cursor: pointer; text-align: left; font-size: 13.5px; font-weight: 600; color: #0f172a; }
  .lf-faq-plus { color: #e8582a; font-size: 18px; transition: transform .2s; }
  .lf-faq-item.open .lf-faq-plus { transform: rotate(45deg); }
  .lf-faq-item p { padding: 0 14px 12px; margin: 0; }

  /* ───── Motion ───── */
  @keyframes lf-pulse { 0% { transform: scale(1); opacity: .55; } 100% { transform: scale(2.1); opacity: 0; } }
  @keyframes lf-slidein { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  @keyframes lf-rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
  @keyframes lf-pop { from { opacity: 0; transform: translateY(-6px) scale(.98); } to { opacity: 1; transform: none; } }
  @keyframes lf-fadein { from { opacity: 0; } to { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) {
    .lf-ring, .lf-card, .lf-slide-inner, .lf-modal, .lf-menu { animation: none !important; }
    .lf-side, .lf-side-label, .lf-brand-name { transition: none !important; }
  }

  /* ───── Tablet / mobile ───── */
  @media (max-width: 900px) {
    .lf-page { height: auto; min-height: 100vh; }
    .lf-strip, .lf-strip.open { width: 0; }
    .lf-side { width: 0; }
    .lf-side.open { width: 236px; box-shadow: 10px 0 40px rgba(0,0,0,0.25); }
    .lf-backdrop { display: block; }
    .lf-split { flex-direction: column; }
    .lf-hero { flex: none; height: 560px; }
    .lf-right { flex: none; }
    .lf-fs-btn { display: none; }
  }
  @media (max-width: 520px) {
    .lf-hero { height: 540px; }
    .lf-hero-text { padding: 18px 20px 0; }
    .lf-hero h1 { font-size: 24px; }
    .lf-nav-links > button { padding: 8px 6px; }
    .lf-brand-name { font-size: 9.5px; letter-spacing: .4px; }
    .lf-brand-name.show { max-width: 110px; margin-left: 6px; }
  }

  /* Short screens: tighten up so the card never needs to scroll */
  @media (max-height: 900px) and (min-width: 901px) {
    .lf-switch { display: none; }
    .lf-card { padding: 18px 26px; }
    .lf-form { gap: 14px; }
  }
  @media (max-height: 780px) and (min-width: 901px) {
    .lf-welcome-sub { display: none; }
    .lf-welcome { margin-bottom: 12px; }
    .lf-roles { margin-top: 10px; }
  }
`;