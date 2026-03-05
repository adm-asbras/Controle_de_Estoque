import { Link, NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import { auth } from "../auth";
import { api } from "../api";
import logo from "../assets/logo.avif";

// Cabecalho superior + barra lateral com navegacao por perfil.
export default function Nav() {
  const navigate = useNavigate();
  const logged = auth.isLogged();
  const role = auth.getRole();
  const isAccountManager = role === "admin";
  const isAdmin = role === "admin" || role === "admin_limited";
  const user = auth.getUsername();
  const roleLabel = isAdmin ? "ADMIN" : "USUÁRIO";
  const userLabel = user || "-";
  const apiUrl = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");
  const docsUrl = apiUrl ? `${apiUrl}/docs` : "/docs";
  const [showExtraActions, setShowExtraActions] = useState(false);

  if (!logged) return null;

  async function logout() {
    try {
      await api.logout();
    } catch (_) {
      // Session can already be expired; local cleanup still applies.
    }
    auth.logout();
    navigate("/login");
  }

  const cls = ({ isActive }) => "navlink" + (isActive ? " active" : "");
  const normalizeLabel = (label) =>
    ({
      Saidas: "Saídas",
      "Gestao de Contas": "Gestão de Contas",
      Relatorios: "Relatórios"
    }[label] || label);
  const links = isAdmin
    ? [
        { to: "/admin/produtos", label: "Produtos", icon: "📦" },
        { to: "/admin/entradas", label: "Entradas", icon: "📥" },
        ...(role === "admin_limited" ? [{ to: "/usuario/saidas", label: "Saidas", icon: "📤" }] : []),
        ...(isAccountManager ? [{ to: "/admin/usuarios", label: "Gestao de Contas", icon: "👥" }] : []),
        { to: "/admin/relatorios", label: "Relatorios", icon: "📊" }
      ]
    : [{ to: "/usuario/saidas", label: "Saidas", icon: "📤" }];

  return (
    <>
      <header className="header top-header">
        <div className="top-header-inner">
          <div className="brand-block">
            <img src={logo} alt="ASBRAS" className="brand-logo" />
            <div className="brand-text">
              <div className="title">ASBRAS</div>
              <div className="subtitle">Associação Brasileira de Atenção à Assistência em Saúde</div>
            </div>
          </div>

          <div className="top-actions">
            <span className="session-pill">{roleLabel}</span>
          </div>
        </div>
      </header>

      <aside className="left-sidebar">
        <div className="sidebar-inner">
          <div className="sidebar-user">
            <div className="session-user">👤 {userLabel}</div>
          </div>

          <div className="nav-section-title">Menu</div>
          <div className="menu-primary">
            <nav className="menu-track">
              {links.map((item) => (
                <NavLink key={item.to} to={item.to} className={cls}>
                  <span className="navlink-icon">{item.icon}</span>
                  <span>{normalizeLabel(item.label)}</span>
                </NavLink>
              ))}
            </nav>

            <button
              type="button"
              className="menu-actions-toggle"
              onClick={() => setShowExtraActions((v) => !v)}
              aria-expanded={showExtraActions}
              aria-controls="menu-extra-actions"
              title={showExtraActions ? "Ocultar ações" : "Mostrar ações"}
            >
              {showExtraActions ? "⌄" : "›"}
            </button>
          </div>

          <div id="menu-extra-actions" className={`menu-actions ${showExtraActions ? "open" : "closed"}`}>
            <a href={docsUrl} target="_blank" rel="noopener noreferrer" className="action-link">
              <span className="action-icon">📘</span>
              <span>Documentação</span>
            </a>
            <Link to="/trocar-senha" className="action-link">
              <span className="action-icon">🔐</span>
              <span>Trocar senha</span>
            </Link>
            <button className="secondary logout-btn" onClick={logout}>
              <span className="action-icon">🚪</span>
              <span>Sair</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
