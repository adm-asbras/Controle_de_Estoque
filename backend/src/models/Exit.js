const mongoose = require("mongoose");

// Registro de saidas (consumo/retirada de estoque).
const ExitSchema = new mongoose.Schema(
  {
    // Produto movimentado.
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    // Quantidade retirada.
    qty: { type: Number, required: true, min: 1 },
    // Usuario responsavel pela retirada.
    takenBy: { type: String, required: true, trim: true, maxlength: 32 },
    // Observacao opcional da retirada.
    observation: { type: String, trim: true, default: "", maxlength: 240 },
    // Data de referencia da movimentacao.
    date: { type: Date, required: true }
  },
  // createdAt/updatedAt para rastreabilidade.
  { timestamps: true }
);

// Acelera consultas por produto, usuario e periodos em listagens/relatorios.
ExitSchema.index({ date: -1, createdAt: -1 });
ExitSchema.index({ product: 1, date: -1 });
ExitSchema.index({ takenBy: 1, date: -1 });

module.exports = mongoose.model("Exit", ExitSchema);
