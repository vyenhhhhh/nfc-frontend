//main.jsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import NFCTerminal             from "./App.jsx";
import Login                   from "./pages/login.jsx";
import InternDashboard         from "./pages/InternDashboard.jsx";
import OjtCoordinatorDashboard from "./pages/OjtCoordinatorDashboard.jsx";
import AdminDashboard          from "./pages/AdminDashboard.jsx";
import SupervisorDashboard     from "./pages/SupervisorDashboard.jsx";
import "./index.css";
import "./fit.js";            // same proportions on every laptop (see fit.js)
import { API } from "./config.js";

/* ── Sends the sign-in token with every request to the Laravel API ──
   If the server says the session is over (401), go back to the login page.

   Speed-up: many parts of a page ask for the same data at the same time (for example /me).
   Identical GET requests made within a few seconds share ONE trip to the server, so the
   page loads with far fewer requests. Any save (POST / PATCH / PUT / DELETE) clears this
   short memory, so changes always show right away. */
const API_BASE = API;
const realFetch = window.fetch.bind(window);
const SHARE_MS = 3000;                 // identical GETs within 3 seconds share one answer
const shared = new Map();              // key -> { t, p: Promise<{status, statusText, headers, body}> }

/* Several backend copies (php artisan serve on different ports) answer requests side by side.
   Set VITE_API_PORTS=8000,8001,8002,8003 in the React .env and start the same ports with
   start-servers.bat in the backend folder. Without the setting, everything goes to VITE_API_URL. */
const PORTS = String(import.meta.env.VITE_API_PORTS || "").split(",").map((p) => p.trim()).filter(Boolean);
let nextPort = 0;
const spread = (url) => {
  if (PORTS.length < 2) return url;
  try {
    const u = new URL(url);
    u.port = PORTS[nextPort++ % PORTS.length];
    return u.toString();
  } catch { return url; }
};

// if one of the servers is closed, try the next port instead of failing
const fetchSpread = async (url, input, init) => {
  if (typeof input !== "string" || PORTS.length < 2) return realFetch(input, init);
  // only reading is retried; a save is sent once, so it can never be saved twice
  const tries = String(init?.method || "GET").toUpperCase() === "GET" ? PORTS.length : 1;
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await realFetch(spread(url), init); }
    catch (err) { lastErr = err; if (init?.signal?.aborted) break; }
  }
  throw lastErr;
};

const tokenOf = () => {
  try { return JSON.parse(sessionStorage.getItem("user") || "null")?.token || null; } catch { return null; }
};

const handle401 = (res, url) => {
  const open = /\/(login|recovery)\b/.test(url) || url.endsWith("/tap");
  if (res.status === 401 && !open) {
    sessionStorage.removeItem("user");
    try { localStorage.removeItem("ojt_remember"); } catch { /* ignore */ }
    if (window.location.pathname !== "/login" && window.location.pathname !== "/") window.location.href = "/login";
  }
};

window.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input?.url || "";
  if (!url.startsWith(API_BASE)) return realFetch(input, init);

  const token = tokenOf();
  const headers = new Headers(init.headers || (typeof input !== "string" ? input.headers : undefined));
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);

  const method = String(init.method || (typeof input !== "string" ? input.method : "") || "GET").toUpperCase();
  const shareable = method === "GET" && init.cache !== "no-store" && !/\/live\b/.test(url);

  if (!shareable) {
    const res = await fetchSpread(url, input, { ...init, headers });
    if (method !== "GET") shared.clear();   // something was saved: forget the shared answers
    handle401(res, url);
    return res;
  }

  const key = `${token || ""}|${url}`;
  const now = Date.now();
  let hit = shared.get(key);
  if (!hit || now - hit.t > SHARE_MS) {
    const p = fetchSpread(url, input, { ...init, headers }).then(async (res) => {
      handle401(res, url);
      return { status: res.status, statusText: res.statusText, headers: [...res.headers.entries()], body: await res.blob() };
    });
    hit = { t: now, p };
    shared.set(key, hit);
    p.then((d) => { if (d.status >= 400) shared.delete(key); }, () => shared.delete(key));
  }
  const d = await hit.p;
  // every caller gets its own copy of the answer
  const noBody = [204, 205, 304].includes(d.status);
  return new Response(noBody ? null : d.body, { status: d.status, statusText: d.statusText, headers: d.headers });
};

function PrivateRoute({ children, roles }) {
  const user = JSON.parse(sessionStorage.getItem("user") || "null");
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/login" replace />;
  return children;
}

const internRoutes = [
  "/intern",
  "/intern/records",
  "/intern/hours",
  "/intern/dtr",
  "/intern/requests",
  "/intern/online",
  "/intern/movs",
  "/intern/nfc",
  "/intern/profile",
];

const coordinatorRoutes = [
  "/coordinator",
  "/coordinator/approvals",
  // old addresses below still work: they open the matching tab
  "/coordinator/pending",
  "/coordinator/submissions",
  "/coordinator/overtime",
  "/coordinator/corrections",
  "/coordinator/interns",
  "/coordinator/records",
  "/coordinator/nfc",
  "/coordinator/dtr",
  "/coordinator/reports",
  "/coordinator/announcements",
  "/coordinator/calendar",
  "/coordinator/supervisors",
  "/coordinator/hours",
  "/coordinator/profile",
];

const adminRoutes = [
  "/admin",
  "/admin/interns",
  "/admin/records",
  "/admin/accounts",
  "/admin/cards",
  "/admin/hours",
  "/admin/calendar",
  "/admin/dtr",
  "/admin/reports",
  "/admin/profile",
];

const supervisorRoutes = [
  "/supervisor",
  "/supervisor/approvals",
  "/supervisor/interns",
  "/supervisor/records",
  "/supervisor/dtr",
  "/supervisor/reports",
  "/supervisor/calendar",
  "/supervisor/profile",
];

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/"      element={<NFCTerminal />} />
        <Route path="/login" element={<Login />} />

        {internRoutes.map((p) => (
          <Route key={p} path={p} element={
            <PrivateRoute roles={["intern"]}>
              <InternDashboard />
            </PrivateRoute>
          } />
        ))}

        {coordinatorRoutes.map((p) => (
          <Route key={p} path={p} element={
            <PrivateRoute roles={["ojt_coordinator"]}>
              <OjtCoordinatorDashboard />
            </PrivateRoute>
          } />
        ))}

        {adminRoutes.map((p) => (
          <Route key={p} path={p} element={
            <PrivateRoute roles={["admin"]}>
              <AdminDashboard />
            </PrivateRoute>
          } />
        ))}

        {supervisorRoutes.map((p) => (
          <Route key={p} path={p} element={
            <PrivateRoute roles={["supervisor"]}>
              <SupervisorDashboard />
            </PrivateRoute>
          } />
        ))}

        {/* anything else goes back to login */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);