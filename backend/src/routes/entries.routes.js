const express = require("express");
const Entry = require("../models/Entry");
const Product = require("../models/Product");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { auditLog } = require("../utils/audit");
const { validateMovementPayload } = require("../utils/validation");

const router = express.Router();

// Lista historico completo de entradas (admin).
router.get("/", requireAuth, requireAdmin, async (req, res) => {
  const entries = await Entry.find().populate("product").sort({ date: -1, createdAt: -1 });
  res.json(entries);
});

// Registra entrada e incrementa estoque do produto (admin).
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  const validated = validateMovementPayload(req.body || {});
  if (!validated.ok) return res.status(400).json({ error: validated.error });

  const product = await Product.findById(validated.productId);
  if (!product) return res.status(404).json({ error: "Produto nao encontrado" });

  product.qty += validated.qty;
  await product.save();

  const entry = await Entry.create({
    product: product._id,
    qty: validated.qty,
    createdBy: req.user.username,
    date: validated.date
  });
  const populated = await Entry.findById(entry._id).populate("product");
  auditLog(req, "entry.create", {
    entryId: entry._id.toString(),
    productId: product._id.toString(),
    qty: validated.qty
  });
  res.status(201).json({ entry: populated, product });
});

module.exports = router;
