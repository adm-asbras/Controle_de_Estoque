let session = null;
const listeners = new Set();

function notify() {
  listeners.forEach((listener) => listener());
}

// Estado de sessao em memoria.
// A autorizacao real continua no backend (cookie HttpOnly + validacao por rota).
export const auth = {
  getSession: () => session,
  getRole: () => session?.role || null,
  getUsername: () => session?.username || null,
  getCsrfToken: () => session?.csrfToken || null,
  isLogged: () => !!session?.role && !!session?.username,
  saveSession: ({ role, username, csrfToken } = {}) => {
    const nextRole = role ?? session?.role ?? null;
    const nextUsername = username ?? session?.username ?? null;
    const nextCsrf = csrfToken ?? session?.csrfToken ?? null;
    session = nextRole && nextUsername ? { role: nextRole, username: nextUsername, csrfToken: nextCsrf } : null;
    notify();
  },
  logout: () => {
    session = null;
    notify();
  }
};

export function subscribeAuth(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
