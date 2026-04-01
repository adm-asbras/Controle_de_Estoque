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
const CSRF_HEADER = "X-CSRF-Token";

function getCookie(name) {
  if (typeof document === "undefined") return "";
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escapedName}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function buildAuthHeader(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const isPublicAuthRoute =
    normalizedPath === "/api/auth/login" ||
    normalizedPath === "/api/auth/register" ||
    normalizedPath === "/api/auth/forgot-password" ||
    normalizedPath === "/api/auth/reset-password";
  if (isPublicAuthRoute) return {};
  const accessToken = auth.getAccessToken();
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

// Garante que sempre montamos um caminho absoluto coerente para a API.
function buildUrl(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (API_URL.endsWith("/api") && normalizedPath.startsWith("/api/")) {
    return `${API_URL}${normalizedPath.slice(4)}`;
  }
  return `${API_URL}${normalizedPath}`;
}

// Wrapper padrao de fetch para JSON usando cookie e fallback Bearer.
async function refreshCsrfFromSession() {
  const res = await fetch(buildUrl("/api/auth/me"), {
    credentials: "include",
    headers: buildAuthHeader("/api/auth/me")
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const data = await res.json().catch(() => null);
  if (data && data.username && data.role) auth.saveSession(data);
  return data?.csrfToken || null;
}

async function request(path, options = {}, retry = true) {
  const method = (options.method || "GET").toUpperCase();
  const isMutating = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const isPublicAuthRoute =
    normalizedPath === "/api/auth/login" ||
    normalizedPath === "/api/auth/register" ||
    normalizedPath === "/api/auth/forgot-password" ||
    normalizedPath === "/api/auth/reset-password";
  const authHeader = buildAuthHeader(normalizedPath);

  let csrfToken = isMutating ? (auth.getCsrfToken() || getCookie("csrf_token")) : "";
  if (isMutating && !csrfToken && !isPublicAuthRoute) {
    csrfToken = (await refreshCsrfFromSession()) || getCookie("csrf_token");
  }
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...authHeader,
    ...(csrfToken ? { [CSRF_HEADER]: csrfToken } : {}),
    ...(options.headers || {})
  };

  const res = await fetch(buildUrl(path), {
    ...options,
    credentials: "include",
    headers
  });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (res.status === 403 && retry && String(data?.error || "").toLowerCase().includes("csrf")) {
    await refreshCsrfFromSession();
    return request(path, options, false);
  }
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
  listProductRecommendations: (params = {}) => {
    const query = new URLSearchParams();
    if (params.horizonDays != null) query.set("horizonDays", String(params.horizonDays));
    if (params.coverageDays != null) query.set("coverageDays", String(params.coverageDays));
    return request(`/api/products/recommendations${query.toString() ? `?${query.toString()}` : ""}`);
  },
  getProductHistory: (id) => request(`/api/products/${id}/history`),
  createProduct: (body) => request("/api/products", { method: "POST", body: JSON.stringify(body) }),
  updateProduct: (id, body) => request(`/api/products/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteProduct: (id) => request(`/api/products/${id}`, { method: "DELETE" }),

  listRequests: (status) => request(status ? `/api/requests?status=${encodeURIComponent(status)}` : "/api/requests"),
  createRequest: (body) => request("/api/requests", { method: "POST", body: JSON.stringify(body) }),
  reviewRequest: (id, body) => request(`/api/requests/${id}/review`, { method: "PUT", body: JSON.stringify(body) }),
  getUnreadRequestResponsesCount: () => request("/api/requests/unread-responses/count"),
  markUnreadRequestResponsesSeen: () => request("/api/requests/unread-responses/mark-seen", { method: "POST" }),
  markRequestResponseSeen: (id) => request(`/api/requests/unread-responses/${id}/mark-seen`, { method: "POST" }),

  listEntries: () => request("/api/entries"),
  createEntry: (body) => request("/api/entries", { method: "POST", body: JSON.stringify(body) }),

  listExits: () => request("/api/exits"),
  createExit: (body) => request("/api/exits", { method: "POST", body: JSON.stringify(body) })
};

// Download de arquivos binarios (PDF/CSV) usando cookie e fallback Bearer.
export async function downloadFile(path, filename) {
  const res = await fetch(buildUrl(path), {
    credentials: "include",
    headers: buildAuthHeader(path)
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

