import { Link, NavLink, useNavigate } from "react-router-dom";
import { auth } from "../auth";
import { api } from "../api";
import logo from "../assets/logo.avif";

// Cabecalho global com navegacao por perfil.
export default function Nav() {
  const navigate = useNavigate();
  const logged = auth.isLogged();
  const role = auth.getRole();
  const user = auth.getUsername();
  const roleLabel = (role || "user").toUpperCase();
  const userLabel = user || "-";
  const docsUrl = `${import.meta.env.VITE_API_URL}/docs`;

  // Faz logout no backend e limpa sessao local.
  async function logout() {
    try {
      await api.logout();
    } catch (_) {
      // Session can already be expired; local cleanup still applies.
    }
    auth.logout();
    navigate("/login");
  }

  // Classe padrao para links ativos/inativos.
  const cls = ({ isActive }) => "navlink" + (isActive ? " active" : "");

  return (
    <div className="header">
      <div className="nav-full">
        <div className="nav">
          <div className="nav-left">
            <img src={logo} alt="ASBRAS" className="brand-logo" style={{ width: 45, height: 45 }} />
            <div className="brand-text">
              <div className="title">ASBRAS</div>
              <div className="subtitle">Associação Brasileira de Atenção à Assistência em Saúde</div>
            </div>
          </div>

          <div className="nav-center">
            {logged && role === "admin" && (
              <>
                <NavLink to="/admin/produtos" className={cls}>Produtos</NavLink>
                <NavLink to="/admin/entradas" className={cls}>Entradas</NavLink>
                <NavLink to="/admin/relatorios" className={cls}>Relatorios</NavLink>
              </>
            )}
          </div>

          <div className="nav-right">
            {logged && (
              <div className="rightbox">
                <a href={docsUrl} target="_blank" rel="noopener noreferrer" className="navlink">Documentação</a>
                <Link to="/trocar-senha" className="navlink">Trocar senha</Link>
                <span className="badge">{roleLabel}</span>
                <span><b>{userLabel}</b></span>
                <button className="secondary" onClick={logout}>Sair</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}