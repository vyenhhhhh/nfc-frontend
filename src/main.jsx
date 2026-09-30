import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import NFCTerminal          from "./App.jsx";
import Login                from "./pages/login.jsx";
import InternDashboard      from "./pages/InternDashboard.jsx";
import SupervisorDashboard  from "./pages/SupervisorDashboard.jsx";
import AdminDashboard       from "./pages/AdminDashboard.jsx";
import "./index.css";

function PrivateRoute({ children, roles }) {
  const user = JSON.parse(sessionStorage.getItem("user") || "null");
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/login" replace />;
  return children;
}


const internRoutes = [
  "/intern", "/intern/records", "/intern/hours",
  "/intern/online", "/intern/movs", "/intern/profile",
];

const supervisorRoutes = [
  "/supervisor", "/supervisor/pending", "/supervisor/interns",
  "/supervisor/records", "/supervisor/hours",
];
const adminRoutes = [
  "/admin", "/admin/interns", "/admin/records", "/admin/hours",
  "/admin/accounts", "/admin/dtr", "/admin/reports", "/admin/submissions",
];

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/"      element={<NFCTerminal />} />
        <Route path="/login" element={<Login />} />

        {internRoutes.map(p => (
          <Route key={p} path={p} element={
            <PrivateRoute roles={["intern"]}>
              <InternDashboard />
            </PrivateRoute>
          } />
        ))}

        {supervisorRoutes.map(p => (
          <Route key={p} path={p} element={
            <PrivateRoute roles={["supervisor"]}>
              <SupervisorDashboard />
            </PrivateRoute>
          } />
        ))}

        {adminRoutes.map(p => (
          <Route key={p} path={p} element={
            <PrivateRoute roles={["admin","ojt_coordinator"]}>
              <AdminDashboard />
            </PrivateRoute>
          } />
        ))}
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
