const { isDateInMonthsFilter } = require("./report-filters");

// Monta linhas de estoque atual para exportacao CSV.
function buildStockCsvRows(products) {
  return products.map((p) => ({
    sector: p.sector,
    name: p.name,
    unit: p.unit,
    qty: p.qty,
    minQty: p.minQty,
    needsRestock: p.qty <= p.minQty ? "SIM" : "NAO"
  }));
}

// Consolida movimentacoes por produto para relatorios mensais de estoque.
function buildStockMovementRows(products, entries, exits, monthsFilter) {
  const inByProduct = new Map();
  entries.forEach((entry) => {
    if (!isDateInMonthsFilter(entry.date, monthsFilter)) return;
    const key = entry.product?.toString();
    inByProduct.set(key, (inByProduct.get(key) || 0) + entry.qty);
  });

  const outByProduct = new Map();
  exits.forEach((exitItem) => {
    if (!isDateInMonthsFilter(exitItem.date, monthsFilter)) return;
    const key = exitItem.product?.toString();
    outByProduct.set(key, (outByProduct.get(key) || 0) + exitItem.qty);
  });

  return products
    .map((product) => {
      const id = product._id.toString();
      const inQty = inByProduct.get(id) || 0;
      const outQty = outByProduct.get(id) || 0;
      return {
        sector: product.sector,
        name: product.name,
        unit: product.unit,
        inQty,
        outQty,
        netQty: inQty - outQty
      };
    })
    .filter((row) => row.inQty > 0 || row.outQty > 0);
}

// Consolida entradas ou saidas populadas por produto para resumo por categoria.
function buildCategoryAggregateRows(movements) {
  const aggregate = new Map();
  movements.forEach((movement) => {
    if (!movement.product?._id) return;
    const key = movement.product._id.toString();
    if (!aggregate.has(key)) {
      aggregate.set(key, {
        sector: movement.product.sector || "-",
        product: movement.product.name || "-",
        unit: movement.product.unit || "-",
        qty: 0
      });
    }
    aggregate.get(key).qty += movement.qty;
  });

  return [...aggregate.values()].sort((a, b) => (a.sector + a.product).localeCompare(b.sector + b.product));
}

// Monta linhas CSV para entradas/saidas populadas.
function buildMovementCsvRows(movements, { includeExitFields = false } = {}) {
  return movements.map((movement) => ({
    date: new Date(movement.date).toISOString().slice(0, 10),
    sector: movement.product?.sector || "",
    product: movement.product?.name || "",
    unit: movement.product?.unit || "",
    qty: movement.qty,
    ...(includeExitFields
      ? {
          takenBy: movement.takenBy,
          observation: movement.observation || ""
        }
      : {})
  }));
}

// Renderiza consolidado por categoria com subtotal de cada categoria e total geral.
function renderCategorySummary(doc, rows) {
  if (!rows || rows.length === 0) {
    doc.text("Nenhuma movimenta\u00E7\u00E3o encontrada para os meses selecionados.");
    return;
  }

  const grouped = new Map();
  rows.forEach((row) => {
    if (!grouped.has(row.sector)) grouped.set(row.sector, []);
    grouped.get(row.sector).push(row);
  });

  let totalGeral = 0;
  for (const [sector, items] of grouped.entries()) {
    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").fontSize(12).text(`Categoria: ${sector}`);
    doc.font("Helvetica-Bold").fontSize(10).text("Produto | Unidade | Quantidade");
    doc.font("Helvetica");

    let subtotal = 0;
    items
      .sort((a, b) => a.product.localeCompare(b.product))
      .forEach((item) => {
        subtotal += item.qty;
        doc.text(`${item.product} | ${item.unit} | ${item.qty}`);
      });

    totalGeral += subtotal;
    doc.font("Helvetica-Bold").text(`Subtotal ${sector}: ${subtotal}`);
    doc.font("Helvetica");
  }

  doc.moveDown(0.6);
  doc.font("Helvetica-Bold").text(`TOTAL GERAL: ${totalGeral}`);
  doc.font("Helvetica");
}

module.exports = {
  buildStockCsvRows,
  buildStockMovementRows,
  buildCategoryAggregateRows,
  buildMovementCsvRows,
  renderCategorySummary
};
