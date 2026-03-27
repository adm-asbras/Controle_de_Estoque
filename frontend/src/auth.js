const KEY_ROLE = "estoque_role";
const KEY_USER = "estoque_user";

// Estado de sessao minimo salvo no navegador para UX.
// O token real fica no cookie HttpOnly; aqui guardamos apenas dados de exibicao.
export const auth = {
  getRole: () => localStorage.getItem(KEY_ROLE),
  getUsername: () => localStorage.getItem(KEY_USER),
  isLogged: () => !!localStorage.getItem(KEY_ROLE) && !!localStorage.getItem(KEY_USER),
  saveSession: ({ role, username }) => {
    localStorage.setItem(KEY_ROLE, role);
    localStorage.setItem(KEY_USER, username);
  },
  logout: () => {
    localStorage.removeItem(KEY_ROLE);
    localStorage.removeItem(KEY_USER);
  }
};
