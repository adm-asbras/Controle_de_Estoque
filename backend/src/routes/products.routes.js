const express = require("express");
const Product = require("../models/Product");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { auditLog } = require("../utils/audit");
const { asyncHandler } = require("../utils/async-handler");
const { sanitizeText, validateProductPayload } = require("../utils/validation");

const router = express.Router();

// Lista produtos (todos autenticados), com filtro opcional de setor.
router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const sector = sanitizeText(req.query?.sector || "", 20);
  const filter = sector ? { sector } : {};
  const products = await Product.find(filter).sort({ sector: 1, name: 1 });
  res.json(products);
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
  if (!updated) return res.status(404).json({ error: "Produto nao encontrado" });
  auditLog(req, "product.update", { productId: updated._id.toString(), name: updated.name });
  res.json(updated);
}));

// Remove produto por id (somente admin).
router.delete("/:id", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const deleted = await Product.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ error: "Produto nao encontrado" });
  auditLog(req, "product.delete", { productId: deleted._id.toString(), name: deleted.name });
  res.status(204).send();
}));

module.exports = router;
