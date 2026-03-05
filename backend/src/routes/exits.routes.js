const express = require("express");
const Exit = require("../models/Exit");
const Product = require("../models/Product");
const { requireAuth } = require("../middleware/auth");
const { auditLog } = require("../utils/audit");
const { sanitizeText, validateMovementPayload } = require("../utils/validation");

const router = express.Router();

// Lista saidas: admin ve todas, usuario ve apenas as proprias.
router.get("/", requireAuth, async (req, res) => {
  const isAdmin = req.user.role === "admin";
  const filter = isAdmin ? {} : { takenBy: req.user.username };
  const exits = await Exit.find(filter).populate("product").sort({ date: -1, createdAt: -1 });
  res.json(exits);
});

// Registra saida e decrementa estoque.
router.post("/", requireAuth, async (req, res) => {
  const validated = validateMovementPayload(req.body || {});
  if (!validated.ok) return res.status(400).json({ error: validated.error });

  const product = await Product.findById(validated.productId);
  if (!product) return res.status(404).json({ error: "Produto nao encontrado" });
  if (product.qty < validated.qty) {
    return res.status(400).json({ error: `Estoque insuficiente. Disponivel: ${product.qty}` });
  }

  product.qty -= validated.qty;
  await product.save();

  const exit = await Exit.create({
    product: product._id,
    qty: validated.qty,
    takenBy: req.user.username,
    observation: sanitizeText(req.body?.observation || "", 240),
    date: validated.date
  });

  const populated = await Exit.findById(exit._id).populate("product");
  auditLog(req, "exit.create", {
    exitId: exit._id.toString(),
    productId: product._id.toString(),
    qty: validated.qty
  });
  res.status(201).json({ exit: populated, product });
});

module.exports = router;
