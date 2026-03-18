const mongoose = require("mongoose");

// Registro de entradas (reposicao/adicao de estoque).
const EntrySchema = new mongoose.Schema(
  {
    // Produto movimentado.
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    // Quantidade adicionada.
    qty: { type: Number, required: true, min: 1 },
    // Usuario que lancou a entrada.
    createdBy: { type: String, required: true, trim: true },
    // Data de referencia da movimentacao.
    date: { type: Date, required: true }
  },
  // createdAt/updatedAt para auditoria.
  { timestamps: true }
);

// Acelera consultas por produto e periodos em listagens/relatorios.
EntrySchema.index({ date: -1, createdAt: -1 });
EntrySchema.index({ product: 1, date: -1 });
EntrySchema.index({ createdBy: 1, date: -1 });

module.exports = mongoose.model("Entry", EntrySchema);
