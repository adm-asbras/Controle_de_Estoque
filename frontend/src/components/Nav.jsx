import { Link, NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState, useSyncExternalStore } from "react";
import { auth, subscribeAuth } from "../auth";
import { api } from "../api";
import logo from "../assets/logo.avif";

// Cabecalho superior + barra lateral com navegacao por perfil.
export default function Nav() {
  const navigate = useNavigate();
  const session = useSyncExternalStore(subscribeAuth, auth.getSession, auth.getSession);
  const logged = !!session;
  const role = session?.role || null;
  const isAccountManager = role === "admin";
  const isAdmin = role === "admin" || role === "admin_limited";
  const user = session?.username || null;
  const roleLabel =
    role === "admin"
      ? "ADMIN GESTOR"
      : role === "admin_limited"
      ? "ADMIN"
      : "USUÁRIO";
  const userLabel = user || "-";
  const apiUrl = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");
  const docsUrl = apiUrl ? `${apiUrl}/docs` : "/docs";
  const [showExtraActions, setShowExtraActions] = useState(false);
  const [requestsAlertCount, setRequestsAlertCount] = useState(0);

  useEffect(() => {
    if (!logged) {
      setRequestsAlertCount(0);
      return undefined;
    }

    let active = true;
    let timer = null;

    async function refreshRequestsAlertCount() {
      try {
        if (isAdmin) {
          const pending = await api.listRequests("pending");
          if (!active) return;
          setRequestsAlertCount(Array.isArray(pending) ? pending.length : 0);
        } else {
          const data = await api.getUnreadRequestResponsesCount();
          if (!active) return;
          setRequestsAlertCount(Number(data?.count || 0));
        }
      } catch (_) {
        if (!active) return;
      } finally {
        if (active) timer = setTimeout(refreshRequestsAlertCount, 20000);
      }
    }

    function onRequestsAlertUpdated() {
      if (!active) return;
      refreshRequestsAlertCount();
    }

    window.addEventListener("requests-alert-updated", onRequestsAlertUpdated);
    refreshRequestsAlertCount();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      window.removeEventListener("requests-alert-updated", onRequestsAlertUpdated);
    };
  }, [logged, isAdmin]);

  if (!logged) return null;

  // Faz logout remoto quando possivel e sempre limpa o estado local ao final.
  async function logout() {
    try {
      await api.logout();
    } catch (_) {
      // Session can already be expired; local cleanup still applies.
    }
    auth.logout();
    navigate("/login");
  }

  const formatRequestsAlertCount = requestsAlertCount > 99 ? "99+" : String(requestsAlertCount);
  // Monta o menu dinamicamente para cada perfil.
  const links = isAdmin
    ? [
        { to: "/admin/produtos", label: "Produtos", icon: "📦" },
        { to: "/admin/entradas", label: "Entradas", icon: "📥" },
        { to: "/solicitacoes", label: "Solicitações", icon: "📝" },
        ...(role === "admin_limited" ? [{ to: "/usuario/saidas", label: "Saídas", icon: "📤" }] : []),
        ...(isAccountManager ? [{ to: "/admin/usuarios", label: "Gestão de Contas", icon: "👥" }] : []),
        { to: "/admin/relatorios", label: "Relatórios", icon: "📊" }
      ]
    : [
        { to: "/solicitacoes", label: "Solicitações", icon: "📝" }
      ];

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
              {links.map((item) => {
                const isRequestsLink = item.to === "/solicitacoes";
                const hasRequestsAlert = isRequestsLink && requestsAlertCount > 0;
                const requestsAlertTitle = isAdmin
                  ? `${requestsAlertCount} solicitações pendentes`
                  : `${requestsAlertCount} solicitação(ões) respondida(s)`;

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => `navlink${isActive ? " active" : ""}${hasRequestsAlert ? " attention" : ""}`}
                  >
                    <span className="navlink-icon">{item.icon}</span>
                    <span className="navlink-label">
                      <span>{item.label}</span>
                      {hasRequestsAlert ? (
                        <span className="nav-alert-badge" title={requestsAlertTitle}>
                          {formatRequestsAlertCount}
                        </span>
                      ) : null}
                    </span>
                  </NavLink>
                );
              })}
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
            {/* Atalhos secundarios ficam recolhidos para reduzir ruido visual. */}
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
