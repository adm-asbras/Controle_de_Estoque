const express = require("express");
const Entry = require("../models/Entry");
const Exit = require("../models/Exit");
const Product = require("../models/Product");
const StockRequest = require("../models/StockRequest");
const { requireAuth, requireAdmin, ADMIN_ROLES } = require("../middleware/auth");
const { auditLog } = require("../utils/audit");
const { asyncHandler } = require("../utils/async-handler");
const { runWithOptionalTransaction } = require("../utils/db-transaction");
const { sanitizeText, validateDateOnly } = require("../utils/validation");

const router = express.Router();

function createHttpError(status, message) {
  const err = new Error(message);
  err.statusCode = status;
  return err;
}

function parsePositiveInt(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 1) return null;
  return num;
}

function resolveRequestDate(value) {
  if (value == null || value === "") return new Date();
  return validateDateOnly(value);
}

function buildUnreadResponsesFilter(username) {
  return {
    requestedBy: username,
    status: { $in: ["approved", "rejected"] },
    reviewedAt: { $ne: null },
    responseSeenAt: null
  };
}

async function approveInsideTransaction(requestDoc, reviewer, reviewNote, session) {
  let movementId = null;

  if (requestDoc.type === "restock") {
    const product = await Product.findByIdAndUpdate(
      requestDoc.product,
      { $inc: { qty: requestDoc.qty } },
      { new: true, runValidators: true, session }
    );
    if (!product) throw createHttpError(404, "Produto não encontrado");

    const [entry] = await Entry.create([{
      product: product._id,
      qty: requestDoc.qty,
      createdBy: reviewer,
      date: requestDoc.requestDate
    }], { session });

    movementId = entry._id;
    requestDoc.entry = entry._id;
    requestDoc.exit = null;
  } else {
    const product = await Product.findOneAndUpdate(
      { _id: requestDoc.product, qty: { $gte: requestDoc.qty } },
      { $inc: { qty: -requestDoc.qty } },
      { new: true, runValidators: true, session }
    );

    if (!product) {
      const existingProduct = await Product.findById(requestDoc.product).select("_id qty").session(session);
      if (!existingProduct) throw createHttpError(404, "Produto não encontrado");
      throw createHttpError(400, `Estoque insuficiente. Disponível: ${existingProduct.qty}`);
    }

    const observation = sanitizeText(
      `Solicitação aprovada por ${reviewer}${reviewNote ? ` - ${reviewNote}` : ""}`,
      240
    );
    const [exitItem] = await Exit.create([{
      product: product._id,
      qty: requestDoc.qty,
      takenBy: requestDoc.requestedBy,
      observation,
      date: requestDoc.requestDate
    }], { session });

    movementId = exitItem._id;
    requestDoc.exit = exitItem._id;
    requestDoc.entry = null;
  }

  requestDoc.status = "approved";
  requestDoc.reviewedBy = reviewer;
  requestDoc.reviewNote = reviewNote;
  requestDoc.reviewedAt = new Date();
  requestDoc.responseSeenAt = null;
  await requestDoc.save({ session });

  const updated = await StockRequest.findById(requestDoc._id)
    .populate("product")
    .populate("entry")
    .populate("exit")
    .session(session);

  return { updated, movementId };
}

async function approveWithoutTransaction(requestDoc, reviewer, reviewNote) {
  if (requestDoc.type === "restock") {
    const product = await Product.findByIdAndUpdate(
      requestDoc.product,
      { $inc: { qty: requestDoc.qty } },
      { new: true, runValidators: true }
    );
    if (!product) throw createHttpError(404, "Produto não encontrado");

    let entry;
    try {
      entry = await Entry.create({
        product: product._id,
        qty: requestDoc.qty,
        createdBy: reviewer,
        date: requestDoc.requestDate
      });
    } catch (err) {
      await Product.findByIdAndUpdate(product._id, { $inc: { qty: -requestDoc.qty } });
      throw err;
    }

    try {
      requestDoc.status = "approved";
      requestDoc.reviewedBy = reviewer;
      requestDoc.reviewNote = reviewNote;
      requestDoc.reviewedAt = new Date();
      requestDoc.responseSeenAt = null;
      requestDoc.entry = entry._id;
      requestDoc.exit = null;
      await requestDoc.save();
    } catch (err) {
      await Product.findByIdAndUpdate(product._id, { $inc: { qty: -requestDoc.qty } });
      await Entry.findByIdAndDelete(entry._id);
      throw err;
    }

    const updated = await StockRequest.findById(requestDoc._id).populate("product").populate("entry").populate("exit");
    return { updated, movementId: entry._id };
  }

  const product = await Product.findOneAndUpdate(
    { _id: requestDoc.product, qty: { $gte: requestDoc.qty } },
    { $inc: { qty: -requestDoc.qty } },
    { new: true, runValidators: true }
  );

  if (!product) {
    const existingProduct = await Product.findById(requestDoc.product).select("_id qty");
    if (!existingProduct) throw createHttpError(404, "Produto não encontrado");
    throw createHttpError(400, `Estoque insuficiente. Disponível: ${existingProduct.qty}`);
  }

  const observation = sanitizeText(
    `Solicitação aprovada por ${reviewer}${reviewNote ? ` - ${reviewNote}` : ""}`,
    240
  );

  let exitItem;
  try {
    exitItem = await Exit.create({
      product: product._id,
      qty: requestDoc.qty,
      takenBy: requestDoc.requestedBy,
      observation,
      date: requestDoc.requestDate
    });
  } catch (err) {
    await Product.findByIdAndUpdate(product._id, { $inc: { qty: requestDoc.qty } });
    throw err;
  }

  try {
    requestDoc.status = "approved";
    requestDoc.reviewedBy = reviewer;
    requestDoc.reviewNote = reviewNote;
    requestDoc.reviewedAt = new Date();
    requestDoc.responseSeenAt = null;
    requestDoc.exit = exitItem._id;
    requestDoc.entry = null;
    await requestDoc.save();
  } catch (err) {
    await Product.findByIdAndUpdate(product._id, { $inc: { qty: requestDoc.qty } });
    await Exit.findByIdAndDelete(exitItem._id);
    throw err;
  }

  const updated = await StockRequest.findById(requestDoc._id).populate("product").populate("entry").populate("exit");
  return { updated, movementId: exitItem._id };
}

// Lista solicitacoes: admin ve todas, usuario ve apenas as proprias.
router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const status = sanitizeText(req.query?.status || "", 16);
  const allowedStatuses = new Set(["pending", "approved", "rejected"]);
  const isAdmin = ADMIN_ROLES.has(req.user?.role);

  const filter = isAdmin ? {} : { requestedBy: req.user.username };
  if (allowedStatuses.has(status)) {
    filter.status = status;
  }

  const requests = await StockRequest.find(filter)
    .populate("product")
    .populate("entry")
    .populate("exit")
    .sort({ createdAt: -1 });

  res.json(requests);
}));

// Retorna quantidade de respostas pendentes de leitura para o solicitante.
router.get("/unread-responses/count", requireAuth, asyncHandler(async (req, res) => {
  if (ADMIN_ROLES.has(req.user?.role)) {
    return res.json({ count: 0 });
  }

  const count = await StockRequest.countDocuments(buildUnreadResponsesFilter(req.user.username));
  return res.json({ count });
}));

// Marca respostas de solicitacoes como lidas pelo solicitante.
router.post("/unread-responses/mark-seen", requireAuth, asyncHandler(async (req, res) => {
  if (ADMIN_ROLES.has(req.user?.role)) {
    return res.json({ updated: 0 });
  }

  const result = await StockRequest.updateMany(
    buildUnreadResponsesFilter(req.user.username),
    { $set: { responseSeenAt: new Date() } }
  );
  const updated = Number(result?.modifiedCount || 0);
  auditLog(req, "request.responses.mark_seen", { updated });
  return res.json({ updated });
}));

// Marca uma resposta especifica como lida pelo solicitante.
router.post("/unread-responses/:id/mark-seen", requireAuth, asyncHandler(async (req, res) => {
  if (ADMIN_ROLES.has(req.user?.role)) {
    return res.json({ updated: 0 });
  }

  const requestId = sanitizeText(req.params?.id, 40);
  if (!requestId) {
    return res.status(400).json({ error: "Identificador invalido." });
  }

  const result = await StockRequest.updateOne(
    { _id: requestId, ...buildUnreadResponsesFilter(req.user.username) },
    { $set: { responseSeenAt: new Date() } }
  );
  const updated = Number(result?.modifiedCount || 0);
  auditLog(req, "request.response.mark_seen", { requestId, updated });
  return res.json({ updated });
}));

// Cria solicitacao de retirada/reposicao.
router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const type = sanitizeText(req.body?.type, 20);
  const productId = sanitizeText(req.body?.productId, 40);
  const qty = parsePositiveInt(req.body?.qty);
  const requestDate = resolveRequestDate(req.body?.date);
  const observation = sanitizeText(req.body?.observation || "", 240);

  if (!new Set(["exit", "restock"]).has(type)) {
    return res.status(400).json({ error: "Tipo de solicitação inválido." });
  }
  if (!productId) {
    return res.status(400).json({ error: "Produto é obrigatório." });
  }
  if (qty == null) {
    return res.status(400).json({ error: "Quantidade deve ser um número inteiro maior ou igual a 1." });
  }
  if (!requestDate) {
    return res.status(400).json({ error: "Data inválida. Use YYYY-MM-DD." });
  }

  const product = await Product.findById(productId).select("_id");
  if (!product) return res.status(404).json({ error: "Produto não encontrado" });

  const created = await StockRequest.create({
    type,
    product: product._id,
    qty,
    requestedBy: req.user.username,
    observation,
    requestDate
  });

  const payload = await StockRequest.findById(created._id).populate("product").populate("entry").populate("exit");
  auditLog(req, "request.create", {
    requestId: created._id.toString(),
    productId: product._id.toString(),
    type,
    qty
  });
  res.status(201).json(payload);
}));

// Aprova/rejeita solicitacao pendente.
router.put("/:id/review", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const requestId = sanitizeText(req.params?.id, 40);
  const decision = sanitizeText(req.body?.decision, 20);
  const reviewNote = sanitizeText(req.body?.reviewNote || "", 240);

  if (!requestId) return res.status(400).json({ error: "Identificador inválido." });
  if (!new Set(["approve", "reject"]).has(decision)) {
    return res.status(400).json({ error: "Decisão inválida." });
  }

  let result;
  try {
    result = await runWithOptionalTransaction(
      async (session) => {
        const requestDoc = await StockRequest.findById(requestId).session(session);
        if (!requestDoc) throw createHttpError(404, "Solicitação não encontrada");
        if (requestDoc.status !== "pending") {
          throw createHttpError(400, "Somente solicitações pendentes podem ser avaliadas");
        }

        if (decision === "reject") {
          requestDoc.status = "rejected";
          requestDoc.reviewedBy = req.user.username;
          requestDoc.reviewNote = reviewNote;
          requestDoc.reviewedAt = new Date();
          requestDoc.responseSeenAt = null;
          await requestDoc.save({ session });

          const updated = await StockRequest.findById(requestDoc._id)
            .populate("product")
            .populate("entry")
            .populate("exit")
            .session(session);
          return { updated, movementId: null };
        }

        return approveInsideTransaction(requestDoc, req.user.username, reviewNote, session);
      },
      async () => {
        const requestDoc = await StockRequest.findById(requestId);
        if (!requestDoc) throw createHttpError(404, "Solicitação não encontrada");
        if (requestDoc.status !== "pending") {
          throw createHttpError(400, "Somente solicitações pendentes podem ser avaliadas");
        }

        if (decision === "reject") {
          requestDoc.status = "rejected";
          requestDoc.reviewedBy = req.user.username;
          requestDoc.reviewNote = reviewNote;
          requestDoc.reviewedAt = new Date();
          requestDoc.responseSeenAt = null;
          await requestDoc.save();
          const updated = await StockRequest.findById(requestDoc._id).populate("product").populate("entry").populate("exit");
          return { updated, movementId: null };
        }

        return approveWithoutTransaction(requestDoc, req.user.username, reviewNote);
      }
    );
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    throw err;
  }

  auditLog(req, "request.review", {
    requestId,
    decision,
    movementId: result.movementId ? result.movementId.toString() : null
  });
  return res.json(result.updated);
}));

module.exports = router;
