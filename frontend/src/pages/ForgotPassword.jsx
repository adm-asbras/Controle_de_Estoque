import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import logo from "../assets/logo.avif";

// Tela para solicitar link de redefinicao de senha por email.
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      const data = await api.forgotPassword({ email });
      setSuccess(data?.message || "Se o email existir, enviaremos um link.");
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
              <h1 style={{ margin: 0 }}>Esqueci Minha Senha</h1>
              <div className="small">Informe o email cadastrado para receber o link de redefinição.</div>
            </div>
          </div>
        </div>

        <div className="form">
          <h3>Recuperar acesso</h3>
          {error && <p style={{ color: "var(--danger)", marginTop: 0 }}>{error}</p>}
          {success && <p style={{ color: "var(--accent)", marginTop: 0 }}>{success}</p>}

          <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
            <input
              type="email"
              placeholder="Seu email cadastrado"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button>Enviar link</button>
          </form>

          <div style={{ marginTop: 14, textAlign: "center" }} className="small">
            Lembrou a senha?{" "}
            <Link to="/login" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 700 }}>
              Voltar ao login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
