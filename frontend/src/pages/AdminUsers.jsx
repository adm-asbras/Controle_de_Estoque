import { useEffect, useState } from "react";
import { api } from "../api";
import { auth } from "../auth";

// Tela administrativa para criacao de usuarios.
// Somente o gestor de contas deve acessar este fluxo.
export default function AdminUsers() {
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "user"
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [busyUserId, setBusyUserId] = useState("");
  const currentUsername = auth.getUsername();

  // Busca a lista atual de usuarios cadastrados.
  async function loadUsers() {
    setLoadingUsers(true);
    try {
      const data = await api.listUsers();
      setUsers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingUsers(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  // Cria uma nova conta depois de validar o formulario localmente.
  async function createUser(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!form.username || !form.email || !form.password) {
      setError("Preencha todos os campos obrigatorios");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("As senhas nao conferem");
      return;
    }
    if (form.password.length < 6) {
      setError("A senha deve ter no minimo 6 caracteres");
      return;
    }

    try {
      const data = await api.adminCreateUser({
        username: form.username,
        email: form.email,
        password: form.password,
        role: form.role
      });
      setSuccess(`Usuario ${data.username} criado com sucesso`);
      setForm({
        username: "",
        email: "",
        password: "",
        confirmPassword: "",
        role: "user"
      });
      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  // Atualiza o papel de acesso do usuario escolhido.
  async function changeRole(userId, role) {
    setError("");
    setSuccess("");
    setBusyUserId(userId);
    try {
      await api.updateUserRole(userId, { role });
      setSuccess("Acesso atualizado com sucesso");
      await loadUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyUserId("");
    }
  }

  // Remove uma conta existente apos confirmacao do operador.
  async function removeUser(userId, username) {
    setError("");
    setSuccess("");
    const ok = window.confirm(`Confirma excluir a conta de ${username}?`);
    if (!ok) return;

    setBusyUserId(userId);
    try {
      await api.deleteUser(userId);
      setSuccess("Conta excluida com sucesso");
      await loadUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyUserId("");
    }
  }

  return (
    <div className="container" style={{ paddingTop: 16, paddingBottom: 16 }}>
      <h2 className="page-title">Gestao de Contas</h2>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      {success && <p style={{ color: "var(--accent)" }}>{success}</p>}

      <div className="grid two accounts-grid">
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Criar nova conta</h3>
          <form onSubmit={createUser} style={{ display: "grid", gap: 10 }}>
            <input
              type="text"
              placeholder="Usuario"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            />
            <input
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            <input
              type="password"
              placeholder="Senha"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
            <input
              type="password"
              placeholder="Confirmar senha"
              value={form.confirmPassword}
              onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
            />
            <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="user">Usuario</option>
              <option value="admin_limited">Administrador (sem cadastro)</option>
              <option value="admin">Administrador (gestao de contas)</option>
            </select>
            <button>Criar usuario</button>
          </form>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Contas cadastradas</h3>
          {loadingUsers ? (
            <p className="small" style={{ marginTop: 0 }}>Carregando contas...</p>
          ) : users.length === 0 ? (
            <p className="small" style={{ marginTop: 0 }}>Nenhuma conta cadastrada ainda.</p>
          ) : (
            <div className="accounts-scroll">
              <div className="accounts-list">
                {users.map((u) => {
                  const isSelf = u.username === currentUsername;
                  const disabled = busyUserId === u._id || isSelf;
                  const roleBadgeClass =
                    u.role === "admin"
                      ? "badge warn"
                      : u.role === "admin_limited"
                      ? "badge"
                      : "badge ok";
                  const roleBadgeLabel =
                    u.role === "admin" ? "Gestor de contas" : u.role === "admin_limited" ? "Administrador" : "Usuario";

                  return (
                    <div key={u._id} className="account-item">
                      <div className="account-header">
                        <div>
                          <div className="account-name">
                            {u.username}
                            {isSelf ? <span className="small"> (voce)</span> : null}
                          </div>
                          <div className="small">{u.email}</div>
                        </div>
                        <span className={roleBadgeClass}>{roleBadgeLabel}</span>
                      </div>

                      <div className="account-controls">
                        <div className="account-control">
                          <label className="small">Acesso</label>
                          <select
                            value={u.role}
                            disabled={disabled}
                            onChange={(e) => changeRole(u._id, e.target.value)}
                          >
                            <option value="user">Usuario</option>
                            <option value="admin_limited">Administrador (sem cadastro)</option>
                            <option value="admin">Administrador (gestor de contas)</option>
                          </select>
                        </div>
                        <button
                          className="secondary"
                          disabled={disabled}
                          onClick={() => removeUser(u._id, u.username)}
                          title={isSelf ? "Voce nao pode excluir sua propria conta" : "Excluir conta"}
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="small" style={{ marginTop: 10 }}>
            Permissao atual: somente gestor de contas pode alterar acesso ou excluir contas.
          </div>
        </div>
      </div>
    </div>
  );
}
