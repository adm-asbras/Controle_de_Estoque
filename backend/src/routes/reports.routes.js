const express = require("express");
const { Parser } = require("json2csv");
const PDFDocument = require("pdfkit");

const Product = require("../models/Product");
const Entry = require("../models/Entry");
const Exit = require("../models/Exit");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { auditLog } = require("../utils/audit");
const { asyncHandler } = require("../utils/async-handler");
const { sanitizeText } = require("../utils/validation");
const {
  parseDateOnly,
  getUtcRangeFromDateStrings,
  parseMonthsFilter,
  getMonthsUtcRange,
  isDateInMonthsFilter,
  formatMonthsFilterLabel,
  formatDateBR
} = require("../utils/report-filters");
const {
  buildStockCsvRows,
  buildStockMovementRows,
  buildCategoryAggregateRows,
  buildMovementCsvRows,
  renderCategorySummary
} = require("../utils/report-data");

const router = express.Router();

// Traduz query de datas para filtro Mongo ou devolve erro amigavel na resposta.
function getDateFilterFromQuery(req, res) {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) return {};

  const dateRange = getUtcRangeFromDateStrings(startDate, endDate);
  if (!dateRange) {
    res.status(400).json({ error: "startDate/endDate invalidas. Use YYYY-MM-DD" });
    return null;
  }
  if (dateRange.$gte > dateRange.$lte) {
    res.status(400).json({ error: "startDate n\u00E3o pode ser maior que endDate" });
    return null;
  }

  return { date: dateRange };
}

// Traduz query de meses/ano para estrutura validada ou devolve erro amigavel.
function parseMonthsFilterFromQuery(req, res) {
  const result = parseMonthsFilter(
    sanitizeText(req.query?.months || "", 120),
    req.query?.year
  );
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return false;
  }
  return result.value;
}

function setPdfHeaders(res, filename) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
}

function setCsvHeaders(res, filename) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
}

function createPdf(res) {
  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(res);
  return doc;
}

function writeEntriesTable(doc, entries) {
  const col1 = 50, col2 = 120, col3 = 240, col4 = 360, col5 = 440;
  doc.fontSize(10).font("Helvetica-Bold");
  doc.text("Data", col1, doc.y, { width: col2 - col1 });
  doc.text("Categoria", col2, doc.y - 14, { width: col3 - col2 });
  doc.text("Produto", col3, doc.y - 14, { width: col4 - col3 });
  doc.text("Unidade", col4, doc.y - 14, { width: col5 - col4 });
  doc.text("Quantidade", col5, doc.y - 14);
  doc.moveTo(50, doc.y + 2).lineTo(550, doc.y + 2).stroke();
  doc.moveDown();

  doc.font("Helvetica");
  entries.forEach((entry) => {
    doc.text(formatDateBR(entry.date), col1, doc.y, { width: col2 - col1 });
    doc.text(entry.product?.sector || "-", col2, doc.y - 14, { width: col3 - col2 });
    doc.text(entry.product?.name || "-", col3, doc.y - 14, { width: col4 - col3 });
    doc.text(entry.product?.unit || "-", col4, doc.y - 14, { width: col5 - col4 });
    doc.text(String(entry.qty), col5, doc.y - 14);
    doc.moveDown();
  });
}

function writeExitsTable(doc, exits) {
  const col1 = 35, col2 = 95, col3 = 165, col4 = 250, col5 = 305, col6 = 360, col7 = 430;
  doc.fontSize(10).font("Helvetica-Bold");
  doc.text("Data", col1, doc.y, { width: col2 - col1 });
  doc.text("Categoria", col2, doc.y - 14, { width: col3 - col2 });
  doc.text("Produto", col3, doc.y - 14, { width: col4 - col3 });
  doc.text("Unidade", col4, doc.y - 14, { width: col5 - col4 });
  doc.text("Quantidade", col5, doc.y - 14, { width: col6 - col5 });
  doc.text("Retirado por", col6, doc.y - 14, { width: col7 - col6 });
  doc.text("Observa\u00E7\u00E3o", col7, doc.y - 14);
  doc.moveTo(35, doc.y + 2).lineTo(560, doc.y + 2).stroke();
  doc.moveDown();

  doc.font("Helvetica");
  exits.forEach((exitItem) => {
    doc.text(formatDateBR(exitItem.date), col1, doc.y, { width: col2 - col1 });
    doc.text(exitItem.product?.sector || "-", col2, doc.y - 14, { width: col3 - col2 });
    doc.text(exitItem.product?.name || "-", col3, doc.y - 14, { width: col4 - col3 });
    doc.text(exitItem.product?.unit || "-", col4, doc.y - 14, { width: col5 - col4 });
    doc.text(String(exitItem.qty), col5, doc.y - 14, { width: col6 - col5 });
    doc.text(exitItem.takenBy || "-", col6, doc.y - 14, { width: col7 - col6 });
    doc.text(exitItem.observation || "-", col7, doc.y - 14);
    doc.moveDown();
  });
}

function writeStockSnapshot(doc, products) {
  let currentSector = null;
  doc.fontSize(11);

  products.forEach((product) => {
    if (product.sector !== currentSector) {
      currentSector = product.sector;
      doc.moveDown(0.5);
      doc.fontSize(13).text(`Categoria: ${currentSector}`);
      doc.fontSize(11);
    }
    const alert = product.qty <= product.minQty ? "REPOR" : "OK";
    doc.text(`${product.name} (${product.unit}) | Qtd: ${product.qty} | Min: ${product.minQty} | ${alert}`);
  });
}

function writeStockMonthlySummary(doc, rows) {
  if (rows.length === 0) {
    doc.text("Nenhuma movimenta\u00E7\u00E3o encontrada para os meses selecionados.");
    return;
  }

  const grouped = new Map();
  rows.forEach((row) => {
    if (!grouped.has(row.sector)) grouped.set(row.sector, []);
    grouped.get(row.sector).push(row);
  });

  let totalIn = 0;
  let totalOut = 0;
  let totalNet = 0;

  for (const [sector, items] of grouped.entries()) {
    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").fontSize(12).text(`Categoria: ${sector}`);
    doc.font("Helvetica-Bold").fontSize(10).text("Produto | Unidade | Entradas | Sa\u00EDdas | Saldo");
    doc.font("Helvetica");

    let subIn = 0;
    let subOut = 0;
    let subNet = 0;
    items
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((item) => {
        subIn += item.inQty;
        subOut += item.outQty;
        subNet += item.netQty;
        doc.text(`${item.name} | ${item.unit} | ${item.inQty} | ${item.outQty} | ${item.netQty}`);
      });

    totalIn += subIn;
    totalOut += subOut;
    totalNet += subNet;
    doc.font("Helvetica-Bold").text(`Subtotal ${sector}: Entradas ${subIn} | Sa\u00EDdas ${subOut} | Saldo ${subNet}`);
    doc.font("Helvetica");
  }

  doc.moveDown(0.6);
  doc.font("Helvetica-Bold").text(`TOTAL GERAL: Entradas ${totalIn} | Sa\u00EDdas ${totalOut} | Saldo ${totalNet}`);
  doc.font("Helvetica");
}

async function getPeriodMovements(Model, baseFilter, monthsFilter) {
  let movements = await Model.find(baseFilter).populate("product").sort({ date: -1 }).lean();
  if (monthsFilter) {
    movements = movements.filter((item) => isDateInMonthsFilter(item.date, monthsFilter));
  }
  return movements;
}

router.get("/stock.csv", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const sector = sanitizeText(req.query?.sector || "", 20);
  const filter = sector ? { sector } : {};
  const products = await Product.find(filter).sort({ sector: 1, name: 1 }).lean();
  const csv = new Parser({ fields: ["sector", "name", "unit", "qty", "minQty", "needsRestock"] }).parse(
    buildStockCsvRows(products)
  );

  setCsvHeaders(res, "estoque.csv");
  auditLog(req, "report.stock.csv", { sector: sector || "all" });
  res.send(csv);
}));

router.get("/stock.pdf", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const sector = sanitizeText(req.query?.sector || "", 20);
  const filter = sector ? { sector } : {};
  const monthsFilter = parseMonthsFilterFromQuery(req, res);
  if (monthsFilter === false) return;

  const products = await Product.find(filter).sort({ sector: 1, name: 1 }).lean();
  setPdfHeaders(res, "estoque.pdf");
  const doc = createPdf(res);

  auditLog(req, "report.stock.pdf", {
    sector: sector || "all",
    months: monthsFilter ? monthsFilter.months : null,
    year: monthsFilter ? monthsFilter.year : null
  });

  if (!monthsFilter) {
    doc.fontSize(16).text("Relat\u00F3rio de Estoque", { align: "center" });
    doc.moveDown();
    writeStockSnapshot(doc, products);
  } else {
    doc.fontSize(16).text("Relat\u00F3rio de Estoque (Consolidado por Meses)", { align: "center" });
    doc.fontSize(10).text(`Per\u00EDodo: ${formatMonthsFilterLabel(monthsFilter)}`, { align: "center" });
    doc.moveDown();

    const range = getMonthsUtcRange(monthsFilter);
    const [entries, exits] = await Promise.all([
      Entry.find({ date: range }).lean(),
      Exit.find({ date: range }).lean()
    ]);
    writeStockMonthlySummary(doc, buildStockMovementRows(products, entries, exits, monthsFilter));
  }

  doc.end();
}));

router.get("/entries.pdf", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const monthsFilter = parseMonthsFilterFromQuery(req, res);
  if (monthsFilter === false) return;
  if (monthsFilter && (req.query?.startDate || req.query?.endDate)) {
    return res.status(400).json({ error: "Use filtro por datas OU por meses, nao ambos" });
  }

  const filter = getDateFilterFromQuery(req, res);
  if (filter === null) return;

  const baseFilter = monthsFilter ? { date: getMonthsUtcRange(monthsFilter) } : filter;
  const entries = await getPeriodMovements(Entry, baseFilter, monthsFilter);
  const { startDate, endDate } = req.query;

  setPdfHeaders(res, "entradas.pdf");
  const doc = createPdf(res);
  auditLog(req, "report.entries.pdf", {
    startDate: startDate || null,
    endDate: endDate || null,
    months: monthsFilter ? monthsFilter.months : null,
    year: monthsFilter ? monthsFilter.year : null
  });

  if (!monthsFilter) {
    doc.fontSize(16).text("Relat\u00F3rio de Entradas", { align: "center" });
  } else {
    doc.fontSize(16).text("Relat\u00F3rio de Entradas (Consolidado por Meses)", { align: "center" });
    doc.fontSize(10).text(`Per\u00EDodo: ${formatMonthsFilterLabel(monthsFilter)}`, { align: "center" });
  }
  if (!monthsFilter && startDate && endDate) {
    doc.fontSize(10).text(`Per\u00EDodo: ${formatDateBR(startDate)} a ${formatDateBR(endDate)}`, { align: "center" });
  }
  doc.moveDown(0.5);

  if (!monthsFilter) {
    writeEntriesTable(doc, entries);
  } else {
    renderCategorySummary(doc, buildCategoryAggregateRows(entries));
  }

  doc.end();
}));

router.get("/exits.pdf", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const monthsFilter = parseMonthsFilterFromQuery(req, res);
  if (monthsFilter === false) return;
  if (monthsFilter && (req.query?.startDate || req.query?.endDate)) {
    return res.status(400).json({ error: "Use filtro por datas OU por meses, nao ambos" });
  }

  const filter = getDateFilterFromQuery(req, res);
  if (filter === null) return;

  const baseFilter = monthsFilter ? { date: getMonthsUtcRange(monthsFilter) } : filter;
  const exits = await getPeriodMovements(Exit, baseFilter, monthsFilter);
  const { startDate, endDate } = req.query;

  setPdfHeaders(res, "saidas.pdf");
  const doc = createPdf(res);
  auditLog(req, "report.exits.pdf", {
    startDate: startDate || null,
    endDate: endDate || null,
    months: monthsFilter ? monthsFilter.months : null,
    year: monthsFilter ? monthsFilter.year : null
  });

  if (!monthsFilter) {
    doc.fontSize(16).text("Relat\u00F3rio de Sa\u00EDdas", { align: "center" });
  } else {
    doc.fontSize(16).text("Relat\u00F3rio de Sa\u00EDdas (Consolidado por Meses)", { align: "center" });
    doc.fontSize(10).text(`Per\u00EDodo: ${formatMonthsFilterLabel(monthsFilter)}`, { align: "center" });
  }
  if (!monthsFilter && startDate && endDate) {
    doc.fontSize(10).text(`Per\u00EDodo: ${formatDateBR(startDate)} a ${formatDateBR(endDate)}`, { align: "center" });
  }
  doc.moveDown(0.5);

  if (!monthsFilter) {
    writeExitsTable(doc, exits);
  } else {
    renderCategorySummary(doc, buildCategoryAggregateRows(exits));
  }

  doc.end();
}));

router.get("/entries.csv", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const filter = getDateFilterFromQuery(req, res);
  if (filter === null) return;

  const entries = await Entry.find(filter).populate("product").sort({ date: -1 }).lean();
  const csv = new Parser({ fields: ["date", "sector", "product", "unit", "qty"] }).parse(
    buildMovementCsvRows(entries)
  );

  setCsvHeaders(res, "entradas.csv");
  auditLog(req, "report.entries.csv", {
    startDate: req.query?.startDate || null,
    endDate: req.query?.endDate || null
  });
  res.send(csv);
}));

router.get("/exits.csv", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const filter = getDateFilterFromQuery(req, res);
  if (filter === null) return;

  const exits = await Exit.find(filter).populate("product").sort({ date: -1 }).lean();
  const csv = new Parser({ fields: ["date", "sector", "product", "unit", "qty", "takenBy", "observation"] }).parse(
    buildMovementCsvRows(exits, { includeExitFields: true })
  );

  setCsvHeaders(res, "saidas.csv");
  auditLog(req, "report.exits.csv", {
    startDate: req.query?.startDate || null,
    endDate: req.query?.endDate || null
  });
  res.send(csv);
}));

router.__testables = {
  parseDateOnly,
  getUtcRangeFromDateStrings,
  getDateFilterFromQuery,
  parseMonthsFilterFromQuery,
  getMonthsUtcRange,
  isDateInMonthsFilter,
  formatMonthsFilterLabel
};

module.exports = router;
