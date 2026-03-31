const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { requireAuth, requireAccountManager } = require("../middleware/auth");
const { auditLog } = require("../utils/audit");
const {
  authCookieOptions,
  clearAuthCookieOptions,
  createCsrfToken,
  csrfCookieOptions,
  clearCsrfCookieOptions,
  parseCookies
} = require("../utils/security");
const { asyncHandler } = require("../utils/async-handler");
const { sanitizeText, validateCredentials } = require("../utils/validation");
const { sendPasswordResetEmail } = require("../utils/email");
const { logger } = require("../utils/logger");

const router = express.Router();

// Gera JWT com dados minimos de sessao.
function signUserToken(user) {
  return jwt.sign(
    { id: user._id.toString(), username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );
}

// Retorna hash SHA-256 para token de reset sem salvar valor puro no banco.
function hashResetToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Login com validacao de credenciais e emissao de cookie HttpOnly.
router.post("/login", asyncHandler(async (req, res) => {
  const username = sanitizeText(req.body?.username, 32);
  const password = req.body?.password;
  if (!username || !password) {
    return res.status(400).json({ error: "Usuário e senha são obrigatórios." });
  }

  const user = await User.findOne({ username });
  if (!user) {
    auditLog(req, "auth.login.failed", { username });
    return res.status(401).json({ error: "Credenciais inválidas" });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    auditLog(req, "auth.login.failed", { username });
    return res.status(401).json({ error: "Credenciais inválidas" });
  }

  const token = signUserToken(user);
  const csrfToken = createCsrfToken();
  res.cookie("access_token", token, authCookieOptions());
  res.cookie("csrf_token", csrfToken, csrfCookieOptions());
  auditLog(req, "auth.login.success", { username: user.username, role: user.role });
  res.json({ role: user.role, username: user.username, csrfToken });
}));

// Cadastro publico desativado por seguranca.
router.post("/register", asyncHandler(async (req, res) => {
  auditLog(req, "auth.register.blocked_public");
  return res.status(403).json({ message: "Cadastro público desativado. Solicite criação ao administrador." });
}));

// Cadastro de usuario por admin gestor de contas.
router.post("/admin/users", requireAuth, requireAccountManager, asyncHandler(async (req, res) => {
  try {
    const { username, password, email, role } = req.body || {};
    if (!username || !password || !email) {
      return res.status(400).json({ message: "Usuário, senha e e-mail são obrigatórios." });
    }

    const validated = validateCredentials({ username, email, password });
    if (!validated.ok) {
      return res.status(400).json({ message: validated.error });
    }

    const normalizedRole = ["admin", "admin_limited", "user"].includes(role) ? role : "user";
    const existingUser = await User.findOne({
      $or: [{ username: validated.username }, { email: validated.email }]
    });
    if (existingUser) {
      return res.status(400).json({ message: "Usuário ou e-mail já cadastrado." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({
      username: validated.username,
      email: validated.email,
      passwordHash,
      role: normalizedRole
    });
    await user.save();

    auditLog(req, "auth.admin_user_created", {
      createdUserId: user._id.toString(),
      createdUsername: user.username,
      createdRole: user.role
    });

    return res.status(201).json({
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      message: "Usuário criado com sucesso."
    });
  } catch (err) {
    return res.status(500).json({ message: "Erro ao cadastrar usuário." });
  }
}));

// Lista contas cadastradas para gestor de contas.
router.get("/admin/users", requireAuth, requireAccountManager, asyncHandler(async (req, res) => {
  const users = await User.find({}, "username email role createdAt").sort({ createdAt: -1 }).lean();
  return res.json(users);
}));

// Atualiza perfil de acesso de uma conta (somente gestor de contas).
router.put("/admin/users/:id/role", requireAuth, requireAccountManager, asyncHandler(async (req, res) => {
  const targetId = sanitizeText(req.params?.id, 40);
  const nextRole = sanitizeText(req.body?.role, 32);
  const allowedRoles = new Set(["user", "admin_limited", "admin"]);

  if (!targetId || !allowedRoles.has(nextRole)) {
    return res.status(400).json({ message: "Perfil de acesso inválido." });
  }
  if (targetId === req.user.id) {
    return res.status(400).json({ message: "Não é permitido alterar seu próprio acesso." });
  }

  const target = await User.findById(targetId);
  if (!target) return res.status(404).json({ message: "Usuário não encontrado." });

  // Evita perder o unico gestor de contas do sistema.
  if (target.role === "admin" && nextRole !== "admin") {
    const adminCount = await User.countDocuments({ role: "admin" });
    if (adminCount <= 1) {
      return res.status(400).json({ message: "Não é permitido remover o último gestor de contas." });
    }
  }

  target.role = nextRole;
  await target.save();
  auditLog(req, "auth.admin_user_role_updated", {
    targetUserId: target._id.toString(),
    targetUsername: target.username,
    role: target.role
  });
  return res.json({ id: target._id, username: target.username, role: target.role });
}));

// Exclui conta (somente gestor de contas).
router.delete("/admin/users/:id", requireAuth, requireAccountManager, asyncHandler(async (req, res) => {
  const targetId = sanitizeText(req.params?.id, 40);
  if (!targetId) return res.status(400).json({ message: "Identificador inválido." });
  if (targetId === req.user.id) {
    return res.status(400).json({ message: "Não é permitido excluir sua própria conta." });
  }

  const target = await User.findById(targetId);
  if (!target) return res.status(404).json({ message: "Usuário não encontrado." });

  // Evita excluir o unico gestor de contas do sistema.
  if (target.role === "admin") {
    const adminCount = await User.countDocuments({ role: "admin" });
    if (adminCount <= 1) {
      return res.status(400).json({ message: "Não é permitido excluir o último gestor de contas." });
    }
  }

  await User.findByIdAndDelete(targetId);
  auditLog(req, "auth.admin_user_deleted", {
    targetUserId: target._id.toString(),
    targetUsername: target.username,
    targetRole: target.role
  });
  return res.status(204).send();
}));

// Encerra sessao removendo cookie de acesso.
router.post("/logout", requireAuth, (req, res) => {
  auditLog(req, "auth.logout");
  res.clearCookie("access_token", clearAuthCookieOptions());
  res.clearCookie("csrf_token", clearCsrfCookieOptions());
  res.status(204).send();
});

// Retorna sessao atual para o frontend montar contexto.
router.get("/me", requireAuth, (req, res) => {
  const cookies = parseCookies(req.headers.cookie || "");
  let csrfToken = cookies.csrf_token || "";
  if (!csrfToken) {
    csrfToken = createCsrfToken();
    res.cookie("csrf_token", csrfToken, csrfCookieOptions());
  }
  res.json({ username: req.user.username, role: req.user.role, csrfToken });
});

// Permite trocar senha estando autenticado.
router.post("/change-password", requireAuth, asyncHandler(async (req, res) => {
  const currentPassword = req.body?.currentPassword || "";
  const newPassword = req.body?.newPassword || "";

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Senha atual e nova senha são obrigatórias." });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "Senha fraca. Mínimo de 6 caracteres." });
  }

  const user = await User.findById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: "Usuário não encontrado." });
  }

  const currentPasswordOk = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!currentPasswordOk) {
    auditLog(req, "auth.change_password.invalid_current", { userId: req.user.id });
    return res.status(400).json({ error: "Senha atual incorreta" });
  }

  const samePassword = await bcrypt.compare(newPassword, user.passwordHash);
  if (samePassword) {
    return res.status(400).json({ error: "A nova senha deve ser diferente da atual" });
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.passwordResetTokenHash = null;
  user.passwordResetExpiresAt = null;
  await user.save();

  auditLog(req, "auth.change_password.success", { userId: req.user.id });
  return res.json({ message: "Senha alterada com sucesso" });
}));

// Solicita recuperacao de senha via email cadastrado.
router.post("/forgot-password", asyncHandler(async (req, res) => {
  const email = sanitizeText(req.body?.email, 120).toLowerCase();

  // Resposta generica para nao revelar se email existe.
  const genericOk = { message: "Se o e-mail existir, enviaremos um link para redefinição." };
  if (!email) return res.json(genericOk);

  const user = await User.findOne({ email });
  if (!user) {
    auditLog(req, "auth.forgot_password.unknown_email", { email });
    return res.json(genericOk);
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashResetToken(rawToken);
  const ttlMinutes = Number(process.env.RESET_TOKEN_TTL_MINUTES || 15);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  user.passwordResetTokenHash = tokenHash;
  user.passwordResetExpiresAt = expiresAt;
  await user.save();

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const resetLink = `${frontendUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;

  sendPasswordResetEmail(user.email, resetLink)
    .then(() => {
      auditLog(req, "auth.forgot_password.sent", { userId: user._id.toString() });
    })
    .catch((err) => {
      logger.error("auth.forgot_password.email_error", { errorMessage: err.message });
      auditLog(req, "auth.forgot_password.email_error", { userId: user._id.toString(), error: err.message });
    });

  return res.json(genericOk);
}));

// Redefine senha a partir de token temporario.
router.post("/reset-password", asyncHandler(async (req, res) => {
  const token = sanitizeText(req.body?.token, 256);
  const newPassword = req.body?.newPassword || "";

  if (!token || !newPassword) {
    return res.status(400).json({ error: "Token e nova senha são obrigatórios." });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "Senha fraca. Mínimo de 6 caracteres." });
  }

  const tokenHash = hashResetToken(token);
  const user = await User.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetExpiresAt: { $gt: new Date() }
  });

  if (!user) {
    auditLog(req, "auth.reset_password.invalid_token");
    return res.status(400).json({ error: "Token inválido ou expirado." });
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.passwordResetTokenHash = null;
  user.passwordResetExpiresAt = null;
  await user.save();

  auditLog(req, "auth.reset_password.success", { userId: user._id.toString() });
  return res.json({ message: "Senha redefinida com sucesso" });
}));

module.exports = router;
