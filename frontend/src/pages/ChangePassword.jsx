import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { auth } from "../auth";
import logo from "../assets/logo.avif";

// Tela de troca de senha para usuario autenticado.
export default function ChangePassword() {
  const backPath = auth.getRole() === "admin" ? "/admin/produtos" : "/usuario/saidas";
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("Preencha todos os campos.");
      return;
    }
    if (newPassword.length < 6) {
      setError("A nova senha deve ter no mínimo 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("As senhas não conferem.");
      return;
    }

    try {
      const data = await api.changePassword({ currentPassword, newPassword });
      setSuccess(data?.message || "Senha alterada com sucesso.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
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
              <h1 style={{ margin: 0 }}>Trocar Senha</h1>
              <div className="small">Atualize sua senha com segurança.</div>
            </div>
          </div>
        </div>

        <div className="form">
          <h3>Alterar senha</h3>
          {error && <p style={{ color: "var(--danger)", marginTop: 0 }}>{error}</p>}
          {success && <p style={{ color: "var(--accent)", marginTop: 0 }}>{success}</p>}

          <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
            <input
              type="password"
              placeholder="Senha atual"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <input
              type="password"
              placeholder="Nova senha"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
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
            <Link to={backPath} style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 700 }}>
              Voltar
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
