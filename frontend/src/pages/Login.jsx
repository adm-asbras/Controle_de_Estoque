import { useState } from "react";
import { api } from "../api";
import { auth } from "../auth";
import { useNavigate, Link } from "react-router-dom";
import logo from "../assets/logo.avif";

// Tela de autenticacao inicial.
export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  // Envia credenciais para API e redireciona conforme perfil.
  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      const data = await api.login({ username, password });
      auth.saveSession(data);
      if (data.role === "admin" || data.role === "admin_limited") navigate("/admin/produtos");
      else navigate("/solicitacoes");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card card">
        <div className="hero">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img src={logo} alt="ASBRAS" style={{ width: 100, height: 100, borderRadius: 14 }} />
            <div>
              <h1 style={{ margin: 0 }}>Controle de Estoque</h1>
              <div className="small">Controle de entradas, saídas, mínimo em estoque e relatório para acompanhamento</div>
            </div>
          </div>

          <p style={{ marginTop: 12 }}>
            Organize os materiais por categoria e receba alerta quando atingir o mínimo.
          </p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <span className="badge ok">{"\u26A0\uFE0F"} Alerta de reposição</span>
            <span className="badge">{"\u{1F4DA}"} Categorias</span>
            <span className="badge">{"\u{1F4C4}"} Relatórios PDF</span>
          </div>
        </div>

        <div className="form">
          <h3>Acessar</h3>
          {error && <p style={{ color: "var(--danger)", marginTop: 0 }}>{error}</p>}

          <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Usuário" />
            <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha" type="password" />

            <button>Entrar</button>
          </form>

          <div style={{ marginTop: 14, textAlign: "center" }}>
            <div className="small">
              Esqueceu a senha?{" "}
              <Link to="/forgot-password" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 700 }}>
                Recuperar acesso
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
