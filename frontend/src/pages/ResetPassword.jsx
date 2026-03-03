import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import logo from "../assets/logo.avif";

// Tela de redefinicao de senha acessada por token no link de email.
export default function ResetPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const token = useMemo(() => new URLSearchParams(location.search).get("token") || "", [location.search]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!token) {
      setError("Token ausente no link.");
      return;
    }
    if (password.length < 6) {
      setError("A senha deve ter no mínimo 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não conferem.");
      return;
    }

    try {
      const data = await api.resetPassword({ token, newPassword: password });
      setSuccess(data?.message || "Senha redefinida com sucesso.");
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card card">
        <div className="hero">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img src={logo} alt="ASBRAS" style={{ width: 90, height: 90, borderRadius: 14 }} />
            <div>
              <h1 style={{ margin: 0 }}>Redefinir Senha</h1>
              <div className="small">Crie uma nova senha para sua conta.</div>
            </div>
          </div>
        </div>

        <div className="form">
          <h3>Nova senha</h3>
          {error && <p style={{ color: "var(--danger)", marginTop: 0 }}>{error}</p>}
          {success && <p style={{ color: "var(--accent)", marginTop: 0 }}>{success}</p>}

          <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
            <input
              type="password"
              placeholder="Nova senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <input
              type="password"
              placeholder="Confirmar nova senha"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <button>Salvar nova senha</button>
          </form>

          <div style={{ marginTop: 14, textAlign: "center" }} className="small">
            <Link to="/login" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 700 }}>
              Voltar ao login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
