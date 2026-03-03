import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../api";
import logo from "../assets/logo.avif";

// Tela de cadastro de novos usuarios.
export default function Register() {
  const [form, setForm] = useState({
    username: "",
    password: "",
    confirmPassword: "",
    email: ""
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  // Valida formulario localmente e chama endpoint de registro.
  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (!form.username || !form.password || !form.email) {
      setError("Preencha todos os campos");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("As senhas nao conferem");
      return;
    }

    if (form.password.length < 6) {
      setError("A senha deve ter no mínimo 6 caracteres");
      return;
    }

    try {
      await api.register({
        username: form.username,
        password: form.password,
        email: form.email
      });

      setSuccess(true);
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
              <h1 style={{ margin: 0 }}>Criar Conta</h1>
              <div className="small">Registre-se para acessar o controle de estoque</div>
            </div>
          </div>
        </div>

        <div className="form">
          <h3>Cadastro</h3>
          {error && <p style={{ color: "var(--danger)", marginTop: 0 }}>{error}</p>}
          {success && <p style={{ color: "var(--accent)", marginTop: 0 }}>Cadastro realizado, redirecionando...</p>}

          <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
            <input
              type="text"
              placeholder="Usuário"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
            <input
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <input
              type="password"
              placeholder="Senha"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <input
              type="password"
              placeholder="Confirmar Senha"
              value={form.confirmPassword}
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
            />

            <button>Cadastrar</button>
          </form>

          <div style={{ marginTop: 14, textAlign: "center" }} className="small">
            Ja tem conta?{" "}
            <Link to="/login" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 700 }}>
              Faça login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
