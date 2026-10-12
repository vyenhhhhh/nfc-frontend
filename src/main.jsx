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

/* ── Sends the sign-in token with every request to the Laravel API ──
   If the server says the session is over (401), go back to the login page. */
const API_BASE = "http://localhost:8000/api";
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input?.url || "";
  if (!url.startsWith(API_BASE)) return realFetch(input, init);

  let token = null;
  try { token = JSON.parse(sessionStorage.getItem("user") || "null")?.token || null; } catch { /* ignore */ }

  const headers = new Headers(init.headers || (typeof input !== "string" ? input.headers : undefined));
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);

  const res = await realFetch(input, { ...init, headers });

  const open = /\/(login|recovery)\b/.test(url) || url.endsWith("/tap");
  if (res.status === 401 && !open) {
    sessionStorage.removeItem("user");
    try { localStorage.removeItem("ojt_remember"); } catch { /* ignore */ }
    if (window.location.pathname !== "/login" && window.location.pathname !== "/") window.location.href = "/login";
  }
  return res;
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
  "/intern/online",
  "/intern/movs",
  "/intern/nfc",
  "/intern/calendar",
  "/intern/profile",
  "/intern/notifications",
];

const coordinatorRoutes = [
  "/coordinator",
  "/coordinator/pending",
  "/coordinator/submissions",
  "/coordinator/interns",
  "/coordinator/records",
  "/coordinator/hours",
  "/coordinator/nfc",
  "/coordinator/dtr",
  "/coordinator/reports",
  "/coordinator/announcements",
  "/coordinator/profile",
];

const adminRoutes = [
  "/admin",
  "/admin/interns",
  "/admin/records",
  "/admin/hours",
  "/admin/accounts",
  "/admin/calendar",
  "/admin/dtr",
  "/admin/reports",
  "/admin/profile",
];

const supervisorRoutes = [
  "/supervisor",
  "/supervisor/interns",
  "/supervisor/records",
  "/supervisor/dtr",
  "/supervisor/reports",
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