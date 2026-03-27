// Carrega variaveis de ambiente no inicio da aplicacao.
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const path = require("path");
const { connectDB } = require("./db");
const { getAllowedOrigins } = require("./utils/security");
const { rejectNoSqlOperators } = require("./middleware/request-security");

const authRoutes = require("./routes/auth.routes");
const productsRoutes = require("./routes/products.routes");
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

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.length === 0) return callback(new Error("CORS bloqueado"), false);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error("Origin nao permitida no CORS"), false);
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"]
    })
  );

  app.use(express.json({ limit: "10kb" }));
  app.use(rejectNoSqlOperators);

  const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Muitas tentativas. Tente novamente em 15 minutos." }
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
  app.use("/api/entries", entriesRoutes);
  app.use("/api/exits", exitsRoutes);
  app.use("/api/reports", reportsRoutes);

  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err?.name === "CastError") {
      return res.status(400).json({ error: "Parametro invalido" });
    }
    if (err?.code === 11000) {
      return res.status(409).json({ error: "Registro duplicado" });
    }
    console.error("Erro:", err.message);
    res.status(500).json({ error: "Erro interno" });
  });

  return app;
}

async function startServer() {
  const app = createApp();
  const port = process.env.PORT || 4000;
  await connectDB(process.env.MONGO_URI);
  return app.listen(port, () => console.log(`API em http://localhost:${port}`));
}

if (require.main === module) {
  startServer().catch((e) => {
    console.error("Falha ao conectar no MongoDB:", e.message);
    process.exit(1);
  });
}

module.exports = { createApp, startServer };
