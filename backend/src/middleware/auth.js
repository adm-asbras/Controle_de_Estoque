const jwt = require("jsonwebtoken");
const { parseCookies } = require("../utils/security");
const ADMIN_ROLES = new Set(["admin", "admin_limited"]);

// Valida token JWT (Bearer ou cookie) e injeta usuario em req.user.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const bearerToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  const cookieToken = parseCookies(req.headers.cookie || "").access_token || null;
  const token = bearerToken || cookieToken;

  if (!token) return res.status(401).json({ error: "Sem token" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Token invalido" });
  }
}

// Restringe acesso para perfil administrador.
function requireAdmin(req, res, next) {
  if (!ADMIN_ROLES.has(req.user?.role)) {
    return res.status(403).json({ error: "Acesso restrito a admin" });
  }
  next();
}

// Restringe acesso para admin que pode gerenciar contas.
function requireAccountManager(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Acesso restrito a gestor de contas" });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, requireAccountManager, ADMIN_ROLES };
