import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";
import campus from "../assets/campus.jpg";

const API = "http://localhost:8000/api";
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
a: "Contact your assigned administrator or coordinator to reset your account and regain access."
},
{
q: "How is attendance recorded?",
a: "Attendance can be recorded through the available attendance features, such as NFC check-in and check-out for registered users."
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

export default function LoginForm({ variant = "student" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [slide, setSlide] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState(null); // null | "about" | "faqs" | "forgot"
  const [faqOpen, setFaqOpen] = useState(0);
  const [isFull, setIsFull] = useState(false);
  const [remember, setRemember] = useState(false);
  const [now, setNow] = useState(() => new Date());
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
  else if (data.role === "admin") navigate("/admin");
  else if (data.role === "ojt_coordinator") navigate("/coordinator");
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

  // Live clock for the little "checked in" demo in the hero
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setPanel(null);
        setMenuOpen(false);
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
    setPanel(null);
    navigate(path);
  };
  const openPanel = (name) => {
    setMenuOpen(false);
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

  const clock = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <div className="lf-page">
      {/* ── Top navbar ── */}
      <header className="lf-nav">
        <button className="lf-logo-btn" onClick={() => go(isStudent ? "/login" : "/login/staff")} aria-label="Home">
          <img src={logo} alt="CSU CCIS" className="lf-nav-logo" />
          <span className={menuOpen ? "lf-brand-name show" : "lf-brand-name"} aria-hidden={!menuOpen}>
            CSU CCIS<br />MYTRACK
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
          <div className="lf-side-foot">MYTRACK</div>
        </aside>

        <div className="lf-main">
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

              {/* The one big moment: a card taps the reader, the check-in lands */}
              <div className="lf-scene" aria-hidden="true">
                <div className="lf-toast">
                  <span className="lf-toast-ok">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                  </span>
                  <span className="lf-toast-body">
                    <b>Checked in</b>
                    <small>{clock} · ID 221-02399</small>
                  </span>
                </div>

                <div className="lf-reader">
                  <span className="lf-reader-ring" />
                  <span className="lf-reader-ring r2" />
                  <span className="lf-reader-pad"><WaveIcon size={46} /></span>
                  <span className="lf-reader-led" />
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

            {/* ── Right: login card ── */}
            <section className="lf-right">
              <span className="lf-orb o1" />
              <span className="lf-orb o2" />
              <span className="lf-orb o3" />
              <div className="lf-card">
                <div className="lf-card-head">
                  <img src={logo} alt="" className="lf-card-logo" />
                  <div className="lf-brand">
                    <span className="lf-underline">MYTRACK</span>
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
                    <span className="lf-field-icon"><MailIcon /></span>
                    <div className="lf-field-body">
                      <label htmlFor="lf-email">Email</label>
                      <input
                        id="lf-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Username"
                        required
                        autoComplete="username"
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
                    <button type="button" className="lf-link" onClick={() => openPanel("forgot")}>
                      Forgot password?
                    </button>
                  </div>

                  <button type="submit" disabled={loading} className="lf-login-btn">
                    {loading ? (
                      <>
                        <span className="lf-spinner" aria-hidden="true" /> Signing in...
                      </>
                    ) : (
                      <>
                        <WaveIcon size={18} /> Sign in
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

                <div className="lf-switch">
                  {isStudent
                    ? "Employee? Admins and OJT coordinators, pick Employee above."
                    : "Intern? Students on OJT, pick Intern above."}
                </div>
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
                  This system replaces paper logbooks with a single NFC tap. Interns check in and out in
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
  @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Figtree:wght@400;500;600;700&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; width: 100%; }
  body { font-family: 'Figtree', 'Segoe UI', sans-serif; color: #1b1410; }
  button { font-family: inherit; }

  .lf-page {
    --o: #e8582a; --o2: #f2733a; --o-soft: #fdeee7; --o-glow: rgba(232,88,42,0.35);
    --ink: #1b1410; --mut: #6f625b; --line: #eadfd8; --field: #f6f2ef;
    --display: 'Bricolage Grotesque', 'Figtree', 'Segoe UI', sans-serif;
    height: 100vh; min-height: 680px; display: flex; flex-direction: column; background: #fff; position: relative;
    font-family: 'Figtree', 'Segoe UI', sans-serif;
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

  .lf-main { flex: 1; display: flex; flex-direction: column; min-width: 0; background: #f7f3f0; }
  .lf-split { flex: 1; display: flex; min-height: 0; }

  /* ───── Hero: photo with a warm colour grade ───── */
  .lf-hero { position: relative; flex: 1 1 0; min-width: 0; background: #2a120a; overflow: hidden; color: #fff; }
  .lf-campus { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 35%; }
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
    position: absolute; z-index: 3; right: clamp(24px, 5vw, 68px); top: 50%;
    width: 300px; height: 330px; margin-top: -165px;
  }
  .lf-reader { position: absolute; left: 75px; top: 160px; width: 150px; height: 150px; }
  .lf-reader-pad {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #fff;
    border-radius: 40px;
    background: linear-gradient(150deg, rgba(255,255,255,0.28), rgba(255,255,255,0.08));
    border: 1px solid rgba(255,255,255,0.42);
    backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    box-shadow: 0 24px 50px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.5);
  }
  .lf-reader-led {
    position: absolute; right: 16px; bottom: 16px; width: 9px; height: 9px; border-radius: 50%;
    background: #ffb48f; box-shadow: 0 0 12px #ffb48f; animation: lf-led 6s ease-in-out infinite;
  }
  .lf-reader-ring {
    position: absolute; inset: 0; border-radius: 40px; border: 2px solid rgba(255,255,255,0.8);
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
  .lf-toast-ok { width: 28px; height: 28px; border-radius: 50%; background: #22a06b; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .lf-toast-body { display: flex; flex-direction: column; line-height: 1.25; }
  .lf-toast-body b { font-size: 13.5px; font-weight: 700; }
  .lf-toast-body small { font-size: 11.5px; color: var(--mut); }

  /* ───── Right side ───── */
  .lf-right { position: relative; flex: 0 0 460px; display: flex; align-items: center; justify-content: center; padding: 16px 24px; overflow: hidden; background: linear-gradient(160deg, #fffaf7 0%, #ffeee4 100%); }
  .lf-orb { position: absolute; border-radius: 50%; pointer-events: none; }
  .lf-orb.o1 { width: 300px; height: 300px; top: -110px; right: -80px; background: radial-gradient(circle, rgba(242,134,79,0.45), rgba(242,134,79,0)); }
  .lf-orb.o2 { width: 340px; height: 340px; bottom: -140px; left: -110px; background: radial-gradient(circle, rgba(232,88,42,0.28), rgba(232,88,42,0)); }
  .lf-orb.o3 { width: 160px; height: 160px; bottom: 90px; right: -50px; background: radial-gradient(circle, rgba(255,190,150,0.5), rgba(255,190,150,0)); }

  .lf-card {
    position: relative; margin: auto; background: rgba(255,255,255,0.92); width: 100%; max-width: 400px; border-radius: 28px;
    padding: 24px 30px 22px; border: 1px solid rgba(255,255,255,0.9);
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
  .lf-field:hover { border-color: var(--line); }
  .lf-field:focus-within { background: #fff; border-color: var(--o); color: var(--o); box-shadow: 0 0 0 4px rgba(232,88,42,0.14); }
  .lf-field-icon { flex-shrink: 0; display: flex; }
  .lf-field-body { flex: 1; padding: 9px 0 8px; min-width: 0; }
  .lf-field label { display: block; font-size: 11.5px; font-weight: 600; color: var(--mut); margin-bottom: 1px; }
  .lf-field input { width: 100%; border: none; background: transparent; padding: 2px 0; font-size: 14.5px; font-family: inherit; color: var(--ink); }
  .lf-field input::placeholder { color: #b9aea7; }
  .lf-field input:focus { outline: none; }

  /* Stop the browser's blue/gray autofill background */
  .lf-field input:-webkit-autofill,
  .lf-field input:-webkit-autofill:hover,
  .lf-field input:-webkit-autofill:focus,
  .lf-field input:-webkit-autofill:active {
    -webkit-box-shadow: 0 0 0 1000px #fff inset !important;
    -webkit-text-fill-color: #1b1410 !important;
    caret-color: #1b1410;
    transition: background-color 9999s ease-in-out 0s;
  }
  .lf-field input:autofill { box-shadow: 0 0 0 1000px #fff inset !important; -webkit-text-fill-color: #1b1410 !important; }
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
  .lf-modal-wrap { position: fixed; inset: 0; z-index: 100; background: rgba(27,20,16,0.55); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; padding: 20px; animation: lf-fadein .2s; }
  .lf-modal { position: relative; background: #fff; border-radius: 24px; max-width: 520px; width: 100%; max-height: 85vh; overflow: auto; padding: 32px 32px 28px; box-shadow: 0 30px 80px rgba(0,0,0,0.3); animation: lf-pop .25s ease-out; border-top: 5px solid var(--o); }
  .lf-modal h3 { font-family: var(--display); font-size: 22px; font-weight: 800; letter-spacing: -0.3px; }
  .lf-modal-lead { color: var(--o); font-weight: 600; font-size: 14px; margin: 4px 0 14px; }
  .lf-modal p { font-size: 14px; line-height: 1.65; color: #5a4e47; margin-bottom: 10px; }
  .lf-modal p.lf-modal-lead { color: var(--o); }
  .lf-modal-note { font-size: 12.5px !important; color: #a89b93 !important; margin-top: 14px; }
  .lf-modal-x { position: absolute; top: 14px; right: 16px; width: 32px; height: 32px; border-radius: 50%; border: none; background: var(--field); font-size: 20px; line-height: 1; cursor: pointer; color: #5a4e47; }
  .lf-modal-x:hover { background: var(--o-soft); color: var(--o); }

  .lf-faq { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
  .lf-faq-item { border: 1px solid #efe6e0; border-radius: 14px; overflow: hidden; transition: border-color .2s, background .2s; }
  .lf-faq-item.open { border-color: #f5b79f; background: #fffaf7; }
  .lf-faq-item button { width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 13px 15px; background: none; border: none; cursor: pointer; text-align: left; font-size: 14px; font-weight: 600; color: var(--ink); }
  .lf-faq-plus { color: var(--o); font-size: 18px; transition: transform .2s; }
  .lf-faq-item.open .lf-faq-plus { transform: rotate(45deg); }
  .lf-faq-item p { padding: 0 15px 12px; margin: 0; }

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
    40%, 82% { background: #3ddc97; box-shadow: 0 0 14px #3ddc97; }
    92%, 100% { background: #ffb48f; box-shadow: 0 0 12px #ffb48f; }
  }
  @keyframes lf-toast {
    0%, 37% { opacity: 0; transform: translateY(14px) scale(.96); }
    43%     { opacity: 1; transform: translateY(0) scale(1); }
    80%     { opacity: 1; transform: translateY(0) scale(1); }
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
`;