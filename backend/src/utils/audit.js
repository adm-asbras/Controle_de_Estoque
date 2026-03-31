const { logger } = require("./logger");

// Extrai IP real considerando cabecalho de proxy reverso.
function getRequestIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

// Registra evento de auditoria em formato estruturado JSON.
function auditLog(req, action, extra = {}) {
  const payload = {
    time: new Date().toISOString(),
    action,
    userId: req.user?.id || null,
    username: req.user?.username || null,
    role: req.user?.role || null,
    ip: getRequestIp(req),
    userAgent: req.headers["user-agent"] || "unknown",
    ...extra
  };

  logger.info("audit.event", payload);
}

module.exports = { auditLog };
