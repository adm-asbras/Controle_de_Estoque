const express = require("express");
const Entry = require("../models/Entry");
const Product = require("../models/Product");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { auditLog } = require("../utils/audit");
const { asyncHandler } = require("../utils/async-handler");
const { runWithOptionalTransaction } = require("../utils/db-transaction");
const { validateMovementPayload } = require("../utils/validation");

const router = express.Router();

function createHttpError(status, message) {
  const err = new Error(message);
  err.statusCode = status;
  return err;
}

async function createEntryWithTransaction(validated, username) {
  return runWithOptionalTransaction(
    async (session) => {
      const product = await Product.findByIdAndUpdate(
        validated.productId,
        { $inc: { qty: validated.qty } },
        { new: true, runValidators: true, session }
      );
      if (!product) throw createHttpError(404, "Produto nao encontrado");

      const [entry] = await Entry.create([{
        product: product._id,
        qty: validated.qty,
        createdBy: username,
        date: validated.date
      }], { session });

      const populated = await Entry.findById(entry._id).populate("product").session(session);
      return { entry: populated, product };
    },
    async () => {
      const product = await Product.findByIdAndUpdate(
        validated.productId,
        { $inc: { qty: validated.qty } },
        { new: true, runValidators: true }
      );
      if (!product) throw createHttpError(404, "Produto nao encontrado");

      let entry;
      try {
        entry = await Entry.create({
          product: product._id,
          qty: validated.qty,
          createdBy: username,
          date: validated.date
        });
      } catch (err) {
        await Product.findByIdAndUpdate(product._id, { $inc: { qty: -validated.qty } });
        throw err;
      }

      const populated = await Entry.findById(entry._id).populate("product");
      return { entry: populated, product };
    }
  );
}

// Lista historico completo de entradas (admin).
router.get("/", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const entries = await Entry.find().populate("product").sort({ date: -1, createdAt: -1 });
  res.json(entries);
}));

// Registra entrada e incrementa estoque do produto (admin).
router.post("/", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const validated = validateMovementPayload(req.body || {});
  if (!validated.ok) return res.status(400).json({ error: validated.error });

  let result;
  try {
    result = await createEntryWithTransaction(validated, req.user.username);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    throw err;
  }

  auditLog(req, "entry.create", {
    entryId: result.entry._id.toString(),
    productId: result.product._id.toString(),
    qty: validated.qty
  });
  res.status(201).json(result);
}));

module.exports = router;
