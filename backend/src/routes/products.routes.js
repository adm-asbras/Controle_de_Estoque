const express = require("express");
const Entry = require("../models/Entry");
const Exit = require("../models/Exit");
const Product = require("../models/Product");
const StockRequest = require("../models/StockRequest");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { auditLog } = require("../utils/audit");
const { asyncHandler } = require("../utils/async-handler");
const { sanitizeText, validateProductPayload } = require("../utils/validation");

const router = express.Router();

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

// Lista produtos (todos autenticados), com filtro opcional de setor.
router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const sector = sanitizeText(req.query?.sector || "", 20);
  const filter = sector ? { sector } : {};
  const products = await Product.find(filter).sort({ sector: 1, name: 1 });
  res.json(products);
}));

// Sugere quantidade de reposicao com base no consumo recente.
router.get("/recommendations", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const horizonDays = clampInt(req.query?.horizonDays, 60, 7, 180);
  const coverageDays = clampInt(req.query?.coverageDays, 30, 7, 120);
  const startDate = new Date(Date.now() - horizonDays * 24 * 60 * 60 * 1000);

  const [products, exitsAgg] = await Promise.all([
    Product.find().sort({ sector: 1, name: 1 }),
    Exit.aggregate([
      { $match: { date: { $gte: startDate } } },
      { $group: { _id: "$product", totalQty: { $sum: "$qty" }, movementCount: { $sum: 1 } } }
    ])
  ]);

  const consumptionByProductId = new Map(
    exitsAgg.map((row) => [String(row._id), { totalQty: row.totalQty, movementCount: row.movementCount }])
  );

  const items = products
    .map((product) => {
      const usage = consumptionByProductId.get(String(product._id)) || { totalQty: 0, movementCount: 0 };
      const avgDailyConsumption = usage.totalQty / horizonDays;
      const projectedNeed = avgDailyConsumption * coverageDays;
      const targetStock = Math.max(product.minQty, Math.ceil(projectedNeed + product.minQty));
      const suggestedQty = Math.max(targetStock - product.qty, 0);
      const daysToStockout = avgDailyConsumption > 0 ? Math.floor(product.qty / avgDailyConsumption) : null;

      let urgency = "baixa";
      if (product.qty <= product.minQty) urgency = "alta";
      else if (daysToStockout != null && daysToStockout <= Math.floor(coverageDays / 2)) urgency = "media";

      return {
        productId: product._id,
        productName: product.name,
        sector: product.sector,
        unit: product.unit,
        qty: product.qty,
        minQty: product.minQty,
        totalConsumedInWindow: usage.totalQty,
        movementCountInWindow: usage.movementCount,
        avgDailyConsumption: Number(avgDailyConsumption.toFixed(2)),
        daysToStockout,
        targetStock,
        suggestedQty,
        urgency
      };
    })
    .filter((item) => item.suggestedQty > 0 || item.urgency !== "baixa")
    .sort((a, b) => {
      const urgencyOrder = { alta: 0, media: 1, baixa: 2 };
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency] || b.suggestedQty - a.suggestedQty;
    });

  res.json({
    horizonDays,
    coverageDays,
    generatedAt: new Date(),
    items
  });
}));

// Historico completo consolidado de um item.
router.get("/:id/history", requireAuth, asyncHandler(async (req, res) => {
  const productId = sanitizeText(req.params?.id, 40);
  if (!productId) return res.status(400).json({ error: "Identificador inválido." });

  const product = await Product.findById(productId);
  if (!product) return res.status(404).json({ error: "Produto não encontrado" });

  const [entries, exits, requests] = await Promise.all([
    Entry.find({ product: product._id }).sort({ date: -1, createdAt: -1 }).limit(200),
    Exit.find({ product: product._id }).sort({ date: -1, createdAt: -1 }).limit(200),
    StockRequest.find({ product: product._id }).sort({ createdAt: -1 }).limit(200)
  ]);

  const entryEvents = entries.map((entry) => ({
    id: `entry-${entry._id}`,
    source: "entry",
    type: "entrada",
    date: entry.date,
    qtyDelta: entry.qty,
    actor: entry.createdBy,
    details: "Entrada registrada"
  }));

  const exitEvents = exits.map((exitItem) => ({
    id: `exit-${exitItem._id}`,
    source: "exit",
    type: "saida",
    date: exitItem.date,
    qtyDelta: -exitItem.qty,
    actor: exitItem.takenBy,
    details: exitItem.observation || "Saída registrada"
  }));

  const requestEvents = requests.map((requestItem) => ({
    id: `request-${requestItem._id}`,
    source: "request",
    type: "solicitacao",
    date: requestItem.reviewedAt || requestItem.createdAt,
    qtyDelta: requestItem.type === "restock" ? requestItem.qty : -requestItem.qty,
    actor: requestItem.requestedBy,
    status: requestItem.status,
    details:
      requestItem.status === "pending"
        ? "Solicitação pendente"
        : requestItem.status === "approved"
        ? `Solicitação aprovada por ${requestItem.reviewedBy || "-"}`
        : `Solicitação rejeitada por ${requestItem.reviewedBy || "-"}`
  }));

  const events = [...entryEvents, ...exitEvents, ...requestEvents].sort((a, b) => {
    const aTime = new Date(a.date).getTime();
    const bTime = new Date(b.date).getTime();
    return bTime - aTime;
  });

  res.json({
    product,
    events
  });
}));

// Cria produto novo (somente admin).
router.post("/", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const validated = validateProductPayload(req.body || {});
  if (!validated.ok) return res.status(400).json({ error: validated.error });

  const created = await Product.create(validated.patch);
  auditLog(req, "product.create", { productId: created._id.toString(), name: created.name });
  res.status(201).json(created);
}));

// Atualiza campos parciais de produto (somente admin).
router.put("/:id", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const validated = validateProductPayload(req.body || {}, { partial: true });
  if (!validated.ok) return res.status(400).json({ error: validated.error });

  const updated = await Product.findByIdAndUpdate(req.params.id, validated.patch, {
    new: true,
    runValidators: true
  });
  if (!updated) return res.status(404).json({ error: "Produto não encontrado" });
  auditLog(req, "product.update", { productId: updated._id.toString(), name: updated.name });
  res.json(updated);
}));

// Remove produto por id (somente admin).
router.delete("/:id", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const deleted = await Product.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ error: "Produto não encontrado" });
  auditLog(req, "product.delete", { productId: deleted._id.toString(), name: deleted.name });
  res.status(204).send();
}));

module.exports = router;
