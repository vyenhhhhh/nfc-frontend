//main.jsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import NFCTerminal             from "./App.jsx";
import Login                   from "./pages/login.jsx";
import InternDashboard         from "./pages/InternDashboard.jsx";
import OjtCoordinatorDashboard from "./pages/OjtCoordinatorDashboard.jsx";
import AdminDashboard          from "./pages/AdminDashboard.jsx";
import "./index.css";

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

        {/* anything else goes back to login */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);