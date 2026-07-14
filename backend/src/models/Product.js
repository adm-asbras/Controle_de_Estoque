const mongoose = require("mongoose");

// Produtos controlados no estoque.
const ProductSchema = new mongoose.Schema(
  {
    // Nome exibido para operacao e relatorios.
    name: { type: String, required: true, trim: true },
    // Setor/categoria fixa para padronizar filtros.
    sector: {
      type: String,
      required: true,
      enum: ["Expediente", "Escritorio", "Limpeza", "Copa"]
    },
    // Unidade de medida usada na movimentacao.
    unit: {
      type: String,
      required: true,
      enum: ["Un", "Pct", "Ltr", "Cx"],
      default: "Un"
    },
    // Quantidade minima para alerta de reposicao.
    minQty: { type: Number, required: true, min: 0 },
    idealQty: { type: Number, min: 0, default: null },
    // Quantidade atual em estoque.
    qty: { type: Number, required: true, min: 0, default: 0 }
  },
  { timestamps: true }
);

// Evita duplicar o mesmo produto dentro do mesmo setor
ProductSchema.index({ name: 1, sector: 1 }, { unique: true });

// Campo virtual para facilitar UI e relatorios.
ProductSchema.virtual("needsRestock").get(function () {
  return this.qty <= this.minQty;
});

// Inclui virtuais no retorno em JSON/objeto.
ProductSchema.set("toJSON", { virtuals: true });
ProductSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Product", ProductSchema);
