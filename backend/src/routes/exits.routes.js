const express = require("express");
const Exit = require("../models/Exit");
const Product = require("../models/Product");
const { requireAuth } = require("../middleware/auth");
const { auditLog } = require("../utils/audit");
const { asyncHandler } = require("../utils/async-handler");
const { sanitizeText, validateMovementPayload } = require("../utils/validation");

const router = express.Router();

// Lista saidas: admin ve todas, usuario ve apenas as proprias.
router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const isAdmin = req.user.role === "admin" || req.user.role === "admin_limited";
  const filter = isAdmin ? {} : { takenBy: req.user.username };
  const exits = await Exit.find(filter).populate("product").sort({ date: -1, createdAt: -1 });
  res.json(exits);
}));

// Registra saida e decrementa estoque.
router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const validated = validateMovementPayload(req.body || {});
  if (!validated.ok) return res.status(400).json({ error: validated.error });

  const product = await Product.findOneAndUpdate(
    { _id: validated.productId, qty: { $gte: validated.qty } },
    { $inc: { qty: -validated.qty } },
    { new: true, runValidators: true }
  );

  if (!product) {
    const existingProduct = await Product.findById(validated.productId).select("_id qty");
    if (!existingProduct) return res.status(404).json({ error: "Produto nao encontrado" });
    return res.status(400).json({ error: `Estoque insuficiente. Disponivel: ${existingProduct.qty}` });
  }

  let exit;
  try {
    exit = await Exit.create({
      product: product._id,
      qty: validated.qty,
      takenBy: req.user.username,
      observation: sanitizeText(req.body?.observation || "", 240),
      date: validated.date
    });
  } catch (err) {
    await Product.findByIdAndUpdate(product._id, { $inc: { qty: validated.qty } });
    throw err;
  }

  const populated = await Exit.findById(exit._id).populate("product");
  auditLog(req, "exit.create", {
    exitId: exit._id.toString(),
    productId: product._id.toString(),
    qty: validated.qty
  });
  res.status(201).json({ exit: populated, product });
}));

module.exports = router;
