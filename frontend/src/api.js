import { auth } from "./auth";

const rawApiUrl = (import.meta.env.VITE_API_URL || "").trim();

// Normaliza a URL-base para aceitar dominio puro, localhost ou URL completa.
function normalizeApiUrl(value) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value.replace(/\/+$/, "");
  if (/^localhost(?::\d+)?$/i.test(value)) return `http://${value}`;
  return `https://${value}`;
}

const API_URL = normalizeApiUrl(rawApiUrl);

// Garante que sempre montamos um caminho absoluto coerente para a API.
function buildUrl(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (API_URL.endsWith("/api") && normalizedPath.startsWith("/api/")) {
    return `${API_URL}${normalizedPath.slice(4)}`;
  }
  return `${API_URL}${normalizedPath}`;
}

// Wrapper padrao de fetch para JSON usando cookie de sessao.
async function request(path, options = {}) {
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {})
  };

  const res = await fetch(buildUrl(path), {
    ...options,
    credentials: "include",
    headers
  });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || data?.message || "Erro na requisicao");
  return data;
}

// Cliente de API consumido pelas telas.
export const api = {
  login: (body) => request("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),
  // Cadastro publico continua exposto aqui apenas se a UI voltar a usar essa tela.
  register: (body) => request("/api/auth/register", { method: "POST", body: JSON.stringify(body) }),
  adminCreateUser: (body) => request("/api/auth/admin/users", { method: "POST", body: JSON.stringify(body) }),
  listUsers: () => request("/api/auth/admin/users"),
  updateUserRole: (id, body) => request(`/api/auth/admin/users/${id}/role`, { method: "PUT", body: JSON.stringify(body) }),
  deleteUser: (id) => request(`/api/auth/admin/users/${id}`, { method: "DELETE" }),
  forgotPassword: (body) => request("/api/auth/forgot-password", { method: "POST", body: JSON.stringify(body) }),
  resetPassword: (body) => request("/api/auth/reset-password", { method: "POST", body: JSON.stringify(body) }),
  changePassword: (body) => request("/api/auth/change-password", { method: "POST", body: JSON.stringify(body) }),
  me: () => request("/api/auth/me"),
  logout: () => request("/api/auth/logout", { method: "POST" }),

  listProducts: (sector) => request(sector ? `/api/products?sector=${encodeURIComponent(sector)}` : "/api/products"),
  createProduct: (body) => request("/api/products", { method: "POST", body: JSON.stringify(body) }),
  updateProduct: (id, body) => request(`/api/products/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteProduct: (id) => request(`/api/products/${id}`, { method: "DELETE" }),

  listEntries: () => request("/api/entries"),
  createEntry: (body) => request("/api/entries", { method: "POST", body: JSON.stringify(body) }),

  listExits: () => request("/api/exits"),
  createExit: (body) => request("/api/exits", { method: "POST", body: JSON.stringify(body) })
};

// Download de arquivos binarios (PDF/CSV) usando cookie de sessao.
export async function downloadFile(path, filename) {
  const res = await fetch(buildUrl(path), {
    credentials: "include",
    headers: {}
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || "Falha ao baixar arquivo");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

