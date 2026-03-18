import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Nav from "./components/Nav";
import ProtectedRoute from "./components/ProtectedRoute";

import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ChangePassword from "./pages/ChangePassword";
import AdminProducts from "./pages/AdminProducts";
import AdminEntries from "./pages/AdminEntries";
import AdminReports from "./pages/AdminReports";
import AdminUsers from "./pages/AdminUsers";
import UserExits from "./pages/UserExits";

// Define o roteamento principal da SPA.
export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        {/* Barra superior fixa para navegacao e sessao. */}
        <Nav />
        <main className="app-main">
          <Routes>
            {/* Redireciona raiz para pagina de login. */}
            <Route path="/" element={<Navigate to="/login" replace />} />

            {/* Rotas publicas. */}
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Rotas privadas de administrador. */}
            <Route
              path="/admin/produtos"
              element={
                <ProtectedRoute role={["admin", "admin_limited"]}>
                  <AdminProducts />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/entradas"
              element={
                <ProtectedRoute role={["admin", "admin_limited"]}>
                  <AdminEntries />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/usuarios"
              element={
                <ProtectedRoute role="admin">
                  <AdminUsers />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/relatorios"
              element={
                <ProtectedRoute role={["admin", "admin_limited"]}>
                  <AdminReports />
                </ProtectedRoute>
              }
            />

            {/* Rota privada de usuario autenticado. */}
            <Route
              path="/usuario/saidas"
              element={
                <ProtectedRoute>
                  <UserExits />
                </ProtectedRoute>
              }
            />
            <Route
              path="/trocar-senha"
              element={
                <ProtectedRoute>
                  <ChangePassword />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </main>
        <footer className="app-footer">(c) Todos os direitos reservados.</footer>
      </div>
    </BrowserRouter>
  );
}
