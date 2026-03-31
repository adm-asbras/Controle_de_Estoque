// Carrega variaveis de ambiente no inicio da aplicacao.
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const path = require("path");
const { connectDB } = require("./db");
const { getAllowedOrigins, isProduction } = require("./utils/security");
const { rejectNoSqlOperators, requireCsrf } = require("./middleware/request-security");
const { logger } = require("./utils/logger");

const authRoutes = require("./routes/auth.routes");
const productsRoutes = require("./routes/products.routes");
const requestsRoutes = require("./routes/requests.routes");
const entriesRoutes = require("./routes/entries.routes");
const exitsRoutes = require("./routes/exits.routes");
const reportsRoutes = require("./routes/reports.routes");

// Monta a aplicacao Express sem iniciar o servidor.
// Isso facilita testes e deixa o bootstrap separado da configuracao.
function createApp() {
  const app = express();
  const allowedOrigins = getAllowedOrigins();

  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(requireHttpsInProduction);
  app.use(
    morgan(":method :url :status :res[content-length] - :response-time ms", {
      skip: (req) => req.path === "/health" || req.path.startsWith("/docs"),
      stream: {
        write: (message) => logger.info("http.request", { line: message.trim() })
      }
    })
  );

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.length === 0) return callback(new Error("CORS bloqueado"), false);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error("Origin nao permitida no CORS"), false);
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"]
    })
  );

  app.use(express.json({ limit: "10kb" }));
  app.use(express.urlencoded({ extended: false, limit: "10kb" }));
  app.use(rejectNoSqlOperators);
  app.use(requireCsrf);

  const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Muitas tentativas. Tente novamente em 15 minutos." },
    keyGenerator: (req) => {
      const rawUser = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
      const userPart = rawUser ? `user:${rawUser}` : "user:anon";
      return `${req.ip}|${userPart}`;
    }
  });
  app.use("/api/auth/login", authRateLimit);

  const passwordRecoveryRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Muitas tentativas. Tente novamente em 15 minutos." }
  });
  app.use("/api/auth/forgot-password", passwordRecoveryRateLimit);
  app.use("/api/auth/reset-password", passwordRecoveryRateLimit);
  app.use("/api/auth/change-password", passwordRecoveryRateLimit);

  const defaultWindowMs = 15 * 60 * 1000;
  const apiRateLimit = rateLimit({
    windowMs: Number(process.env.API_RATE_LIMIT_WINDOW_MS || defaultWindowMs),
    max: Number(process.env.API_RATE_LIMIT_MAX || 300),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Muitas requisições. Tente novamente em alguns minutos." },
    skip: (req) => req.path === "/health" || req.path.startsWith("/docs")
  });
  app.use("/api", apiRateLimit);

  app.get("/", (req, res) =>
    res.json({
      ok: true,
      service: "controle-de-estoque-api",
      health: "/health",
      docs: "/docs"
    })
  );
  app.get("/health", (req, res) => res.json({ ok: true }));

  const docsDirCandidates = ["Documentacao", "Documenta\u00E7\u00E3o"].map((folder) =>
    path.resolve(__dirname, "..", "..", folder)
  );
  const docsDir = docsDirCandidates.find((folder) => fs.existsSync(folder)) || docsDirCandidates[0];
  app.use("/docs", express.static(docsDir));
  app.get("/docs", (req, res) => {
    if (!fs.existsSync(docsDir)) {
      return res.status(404).send("Pasta de documenta\u00E7\u00E3o nao encontrada.");
    }

    const files = fs
      .readdirSync(docsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);

    const links = files
      .map((file) => `<li><a href="/docs/${encodeURIComponent(file)}" target="_blank" rel="noopener noreferrer">${file}</a></li>`)
      .join("");

    return res
      .type("html")
      .send(`<!doctype html><html><head><meta charset="utf-8"><title>Documenta\u00E7\u00E3o</title></head><body><h1>Documenta\u00E7\u00E3o</h1><ul>${links || "<li>Nenhum arquivo encontrado.</li>"}</ul></body></html>`);
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/products", productsRoutes);
  app.use("/api/requests", requestsRoutes);
  app.use("/api/entries", entriesRoutes);
  app.use("/api/exits", exitsRoutes);
  app.use("/api/reports", reportsRoutes);

  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
      return res.status(400).json({ error: "JSON inválido." });
    }
    if (err?.name === "CastError") {
      return res.status(400).json({ error: "Parametro invalido" });
    }
    if (err?.code === 11000) {
      return res.status(409).json({ error: "Registro duplicado" });
    }
    logger.error("request.error", {
      path: req.originalUrl,
      method: req.method,
      errorMessage: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: "Erro interno" });
  });

  return app;
}

function shouldEnforceHttps() {
  const raw = String(process.env.ENFORCE_HTTPS || "true").toLowerCase();
  return !["0", "false", "off", "no"].includes(raw);
}

function requireHttpsInProduction(req, res, next) {
  if (!isProduction() || !shouldEnforceHttps()) return next();

  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (req.secure || forwardedProto === "https") return next();

  const host = req.headers.host;
  if ((req.method === "GET" || req.method === "HEAD") && host) {
    return res.redirect(301, `https://${host}${req.originalUrl}`);
  }
  return res.status(426).json({ error: "HTTPS obrigatorio em producao." });
}

function assertSecurityConfig() {
  if (!isProduction()) return;
  if (!process.env.JWT_SECRET || String(process.env.JWT_SECRET).length < 32) {
    throw new Error("JWT_SECRET inseguro. Em produção, use no mínimo 32 caracteres.");
  }
  if (getAllowedOrigins().length === 0) {
    throw new Error("CORS_ORIGIN/FRONTEND_URL não configurados para produção.");
  }
}

async function startServer() {
  assertSecurityConfig();
  const app = createApp();
  const port = process.env.PORT || 4000;
  await connectDB(process.env.MONGO_URI);
  return app.listen(port, () => logger.info(`API em http://localhost:${port}`));
}

if (require.main === module) {
  startServer().catch((e) => {
    logger.error("server.start.failed", { errorMessage: e.message, stack: e.stack });
    process.exit(1);
  });
}

module.exports = { createApp, startServer };
