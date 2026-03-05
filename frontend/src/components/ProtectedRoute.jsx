import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { auth } from "../auth";
import { api } from "../api";

// Guard de rota: valida sessao no backend antes de renderizar tela protegida.
export default function ProtectedRoute({ role, children }) {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    // Evita setState apos desmontar durante requisicoes em andamento.
    let active = true;
    api
      .me()
      .then((session) => {
        if (!active) return;
        auth.saveSession({ ...session, token: auth.getToken() });
        setStatus("ok");
      })
      .catch(() => {
        if (!active) return;
        auth.logout();
        setStatus("denied");
      });
    return () => {
      active = false;
    };
  }, []);

  // Enquanto valida sessao, evita piscar conteudo protegido.
  if (status === "checking") return null;
  // Sem sessao valida, volta para login.
  if (status === "denied") return <Navigate to="/login" replace />;
  // Se a rota exige role/roles, confirma permissao.
  const currentRole = auth.getRole();
  if (Array.isArray(role) && role.length > 0 && !role.includes(currentRole)) {
    return <Navigate to="/login" replace />;
  }
  if (typeof role === "string" && role && currentRole !== role) {
    return <Navigate to="/login" replace />;
  }
  return children;
}
