const STORAGE_KEY = "estoque.auth.session";

function loadSessionFromStorage() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.role || !parsed.username) return null;
    return {
      role: parsed.role,
      username: parsed.username,
      csrfToken: parsed.csrfToken || null,
      accessToken: parsed.accessToken || null
    };
  } catch (_) {
    return null;
  }
}

function persistSession(nextSession) {
  if (typeof window === "undefined") return;
  try {
    if (nextSession) {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch (_) {
    // Ignore storage failures (private modes can block it).
  }
}

let session = loadSessionFromStorage();
const listeners = new Set();

function notify() {
  listeners.forEach((listener) => listener());
}

// Estado de sessao em memoria.
// Em navegadores que bloqueiam cookie de terceiro (ex.: webview), usamos Bearer fallback.
export const auth = {
  getSession: () => session,
  getRole: () => session?.role || null,
  getUsername: () => session?.username || null,
  getCsrfToken: () => session?.csrfToken || null,
  getAccessToken: () => session?.accessToken || null,
  isLogged: () => !!session?.role && !!session?.username,
  saveSession: ({ role, username, csrfToken, accessToken } = {}) => {
    const nextRole = role ?? session?.role ?? null;
    const nextUsername = username ?? session?.username ?? null;
    const nextCsrf = csrfToken ?? session?.csrfToken ?? null;
    const nextAccessToken = accessToken ?? session?.accessToken ?? null;
    session = nextRole && nextUsername
      ? { role: nextRole, username: nextUsername, csrfToken: nextCsrf, accessToken: nextAccessToken }
      : null;
    persistSession(session);
    notify();
  },
  logout: () => {
    session = null;
    persistSession(session);
    notify();
  }
};

export function subscribeAuth(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
