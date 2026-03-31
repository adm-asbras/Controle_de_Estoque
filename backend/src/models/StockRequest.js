const mongoose = require("mongoose");

// Solicitacoes de retirada/reposicao com aprovacao administrativa.
const StockRequestSchema = new mongoose.Schema(
  {
    // Tipo da solicitacao.
    type: { type: String, enum: ["exit", "restock"], required: true },
    // Produto alvo da solicitacao.
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    // Quantidade solicitada.
    qty: { type: Number, required: true, min: 1 },
    // Usuario solicitante.
    requestedBy: { type: String, required: true, trim: true, maxlength: 32 },
    // Observacao opcional de contexto.
    observation: { type: String, trim: true, maxlength: 240, default: "" },
    // Data de referencia desejada para a movimentacao.
    requestDate: { type: Date, required: true },
    // Estado do fluxo de aprovacao.
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    // Usuario que avaliou a solicitacao.
    reviewedBy: { type: String, trim: true, maxlength: 32, default: "" },
    // Comentario da avaliacao.
    reviewNote: { type: String, trim: true, maxlength: 240, default: "" },
    // Momento de avaliacao final.
    reviewedAt: { type: Date, default: null },
    // Momento em que o solicitante visualizou a resposta.
    responseSeenAt: { type: Date, default: null },
    // Vinculos opcionais para movimentacao efetivada.
    entry: { type: mongoose.Schema.Types.ObjectId, ref: "Entry", default: null },
    exit: { type: mongoose.Schema.Types.ObjectId, ref: "Exit", default: null }
  },
  { timestamps: true }
);

StockRequestSchema.index({ product: 1, createdAt: -1 });
StockRequestSchema.index({ requestedBy: 1, createdAt: -1 });
StockRequestSchema.index({ status: 1, createdAt: -1 });
StockRequestSchema.index({ requestedBy: 1, responseSeenAt: 1, reviewedAt: -1 });

module.exports = mongoose.model("StockRequest", StockRequestSchema);
