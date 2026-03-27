const express = require("express");
const Exit = require("../models/Exit");
const Product = require("../models/Product");
const { requireAuth } = require("../middleware/auth");
const { auditLog } = require("../utils/audit");
const { asyncHandler } = require("../utils/async-handler");
const { runWithOptionalTransaction } = require("../utils/db-transaction");
const { sanitizeText, validateMovementPayload } = require("../utils/validation");

const router = express.Router();

function createHttpError(status, message) {
  const err = new Error(message);
  err.statusCode = status;
  return err;
}

async function createExitWithTransaction(validated, username, observation) {
  return runWithOptionalTransaction(
    async (session) => {
      const product = await Product.findOneAndUpdate(
        { _id: validated.productId, qty: { $gte: validated.qty } },
        { $inc: { qty: -validated.qty } },
        { new: true, runValidators: true, session }
      );

      if (!product) {
        const existingProduct = await Product.findById(validated.productId).select("_id qty").session(session);
        if (!existingProduct) throw createHttpError(404, "Produto nao encontrado");
        throw createHttpError(400, `Estoque insuficiente. Disponivel: ${existingProduct.qty}`);
      }

      const [exitItem] = await Exit.create([{
        product: product._id,
        qty: validated.qty,
        takenBy: username,
        observation,
        date: validated.date
      }], { session });

      const populated = await Exit.findById(exitItem._id).populate("product").session(session);
      return { exit: populated, product };
    },
    async () => {
      const product = await Product.findOneAndUpdate(
        { _id: validated.productId, qty: { $gte: validated.qty } },
        { $inc: { qty: -validated.qty } },
        { new: true, runValidators: true }
      );

      if (!product) {
        const existingProduct = await Product.findById(validated.productId).select("_id qty");
        if (!existingProduct) throw createHttpError(404, "Produto nao encontrado");
        throw createHttpError(400, `Estoque insuficiente. Disponivel: ${existingProduct.qty}`);
      }

      let exitItem;
      try {
        exitItem = await Exit.create({
          product: product._id,
          qty: validated.qty,
          takenBy: username,
          observation,
          date: validated.date
        });
      } catch (err) {
        await Product.findByIdAndUpdate(product._id, { $inc: { qty: validated.qty } });
        throw err;
      }

      const populated = await Exit.findById(exitItem._id).populate("product");
      return { exit: populated, product };
    }
  );
}

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
  const observation = sanitizeText(req.body?.observation || "", 240);

  let result;
  try {
    result = await createExitWithTransaction(validated, req.user.username, observation);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    throw err;
  }

  auditLog(req, "exit.create", {
    exitId: result.exit._id.toString(),
    productId: result.product._id.toString(),
    qty: validated.qty
  });
  res.status(201).json(result);
}));

module.exports = router;
