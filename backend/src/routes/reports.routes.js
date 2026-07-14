const express = require("express");
const path = require("path");
const { Parser } = require("json2csv");
const PDFDocument = require("pdfkit");

const Product = require("../models/Product");
const Entry = require("../models/Entry");
const Exit = require("../models/Exit");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { auditLog } = require("../utils/audit");
const { asyncHandler } = require("../utils/async-handler");
const { sanitizeText } = require("../utils/validation");
const { calculateIdealQty } = require("../utils/stock-target");
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
  buildMovementCsvRows
} = require("../utils/report-data");

const router = express.Router();
const PRODUCT_SECTORS = ["Expediente", "Escritorio", "Limpeza", "Copa"];
const STOCK_STATUS_OPTIONS = ["all", "restock", "near", "attention"];
const ASBRAS_LOGO_PATH = path.join(__dirname, "..", "assets", "logo-asbras.png");
const PDF_COLORS = {
  navy: "#12344D",
  blue: "#1677B8",
  lightBlue: "#EAF4FA",
  border: "#C9DAE5",
  text: "#1E293B",
  muted: "#526579",
  success: "#18794E",
  warning: "#A16207",
  danger: "#B42318"
};

function isNearRestock(product) {
  const nearLimit = product.minQty + Math.max(1, Math.ceil(product.minQty * 0.2));
  return product.qty > product.minQty && product.qty <= nearLimit;
}

function matchesStockStatus(product, stockStatus) {
  const needsRestock = product.qty <= product.minQty;
  if (stockStatus === "restock") return needsRestock;
  if (stockStatus === "near") return isNearRestock(product);
  if (stockStatus === "attention") return needsRestock || isNearRestock(product);
  return true;
}

function getProductFiltersFromQuery(req, res) {
  const sector = sanitizeText(req.query?.sector || "", 20);
  const stockStatus = sanitizeText(req.query?.stockStatus || "all", 20).toLowerCase();

  if (sector && !PRODUCT_SECTORS.includes(sector)) {
    res.status(400).json({ error: "Categoria invalida" });
    return null;
  }
  if (!STOCK_STATUS_OPTIONS.includes(stockStatus)) {
    res.status(400).json({ error: "Situacao do estoque invalida" });
    return null;
  }

  return { sector, stockStatus };
}

function filterProducts(products, filters) {
  return products.filter((product) =>
    (!filters.sector || product.sector === filters.sector) && matchesStockStatus(product, filters.stockStatus)
  );
}

function filterMovementsByProduct(movements, filters) {
  return movements.filter(
    (movement) =>
      movement.product &&
      (!filters.sector || movement.product.sector === filters.sector) &&
      matchesStockStatus(movement.product, filters.stockStatus)
  );
}

function formatProductFilters(filters) {
  const statusLabels = {
    all: "Todos os produtos",
    restock: "Somente para repor",
    near: "Somente perto de repor",
    attention: "Para repor ou perto de repor"
  };
  return `Categoria: ${filters.sector || "Todas"}  |  Estoque: ${statusLabels[filters.stockStatus]}`;
}

async function addIdealQuantities(products) {
  const horizonDays = 60;
  const coverageDays = 30;
  const startDate = new Date(Date.now() - horizonDays * 24 * 60 * 60 * 1000);
  const exits = await Exit.aggregate([
    { $match: { date: { $gte: startDate } } },
    { $group: { _id: "$product", totalQty: { $sum: "$qty" } } }
  ]);
  const consumptionByProductId = new Map(exits.map((item) => [String(item._id), item.totalQty]));

  return products.map((product) => ({
    ...product,
    idealQty: calculateIdealQty(product, consumptionByProductId.get(String(product._id)) || 0, horizonDays, coverageDays)
  }));
}

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

function drawPdfHeader(doc, report) {
  const { width } = doc.page;
  doc.save();
  doc.rect(0, 0, width, 108).fill(PDF_COLORS.navy);
  doc.image(ASBRAS_LOGO_PATH, 40, 18, { fit: [58, 58] });
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(15).text("Sistema de controle de material da ASBRAS", 112, 26);
  doc.font("Helvetica").fontSize(9).fillColor("#D9E9F3").text(report.title, 112, 51);
  if (report.subtitle) doc.fontSize(8).text(report.subtitle, 112, 68, { width: 420 });
  doc.restore();
  doc.y = 132;
}

function createPdf(res, report) {
  const doc = new PDFDocument({ margin: 40, bufferPages: true });
  doc.pipe(res);
  doc.on("pageAdded", () => drawPdfHeader(doc, report));
  drawPdfHeader(doc, report);
  return doc;
}

function finalizePdf(doc) {
  const { start, count } = doc.bufferedPageRange();
  for (let index = start; index < start + count; index += 1) {
    doc.switchToPage(index);
    doc.save();
    doc.strokeColor(PDF_COLORS.border).moveTo(40, doc.page.height - 46).lineTo(doc.page.width - 40, doc.page.height - 46).stroke();
    doc.fillColor(PDF_COLORS.muted).font("Helvetica").fontSize(8);
    doc.text("ASBRAS • Sistema de controle de material", 40, doc.page.height - 36);
    doc.text(`Página ${index + 1} de ${count}`, doc.page.width - 130, doc.page.height - 36, { width: 90, align: "right" });
    doc.restore();
  }
  doc.end();
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
  if (products.length === 0) {
    doc.text("Nenhum produto encontrado para os filtros selecionados.");
    return;
  }

  let currentSector = null;
  doc.fontSize(11);

  products.forEach((product) => {
    if (product.sector !== currentSector) {
      currentSector = product.sector;
      doc.moveDown(0.5);
      doc.fontSize(13).text(`Categoria: ${currentSector}`);
      doc.fontSize(11);
    }
    const alert = product.qty <= product.minQty ? "REPOR" : isNearRestock(product) ? "PERTO DE REPOR" : "OK";
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

function writeEmptyState(doc, message) {
  doc.fillColor(PDF_COLORS.muted).font("Helvetica-Oblique").fontSize(10).text(message, { align: "center" });
  doc.fillColor(PDF_COLORS.text).font("Helvetica");
}

function writeSectionTitle(doc, title) {
  if (doc.y > doc.page.height - 110) doc.addPage();
  doc.fillColor(PDF_COLORS.blue).font("Helvetica-Bold").fontSize(11).text(title);
  doc.moveDown(0.35);
}

function writeTable(doc, columns, rows) {
  const left = 40;
  const tableWidth = doc.page.width - 80;
  const padding = 6;
  const drawHeader = () => {
    const headerY = doc.y;
    doc.rect(left, headerY, tableWidth, 22).fill(PDF_COLORS.blue);
    let x = left;
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(8);
    columns.forEach((column) => {
      doc.text(column.label, x + padding, headerY + 7, { width: column.width - padding * 2, align: column.align || "left" });
      x += column.width;
    });
    doc.y = headerY + 22;
  };

  drawHeader();
  rows.forEach((row, rowIndex) => {
    doc.font("Helvetica").fontSize(8);
    const heights = columns.map((column) => doc.heightOfString(String(row[column.key] ?? "-"), {
      width: column.width - padding * 2,
      align: column.align || "left"
    }));
    const rowHeight = Math.max(22, ...heights.map((height) => height + padding * 2));
    if (doc.y + rowHeight > doc.page.height - 64) {
      doc.addPage();
      drawHeader();
    }
    const rowY = doc.y;
    if (rowIndex % 2 === 0) doc.rect(left, rowY, tableWidth, rowHeight).fill(PDF_COLORS.lightBlue);
    let x = left;
    columns.forEach((column) => {
      const value = String(row[column.key] ?? "-");
      const color = column.color ? column.color(value, row) : PDF_COLORS.text;
      doc.fillColor(color).font(column.bold ? "Helvetica-Bold" : "Helvetica").fontSize(8)
        .text(value, x + padding, rowY + padding, { width: column.width - padding * 2, align: column.align || "left" });
      x += column.width;
    });
    doc.strokeColor(PDF_COLORS.border).lineWidth(0.35).moveTo(left, rowY + rowHeight).lineTo(left + tableWidth, rowY + rowHeight).stroke();
    doc.y = rowY + rowHeight;
  });
  doc.moveDown(0.65);
}

function getStockAlert(product) {
  if (product.qty <= product.minQty) return "REPOR";
  if (isNearRestock(product)) return "PERTO DE REPOR";
  return "OK";
}

function stockStatusColor(value) {
  if (value === "REPOR") return PDF_COLORS.danger;
  if (value === "PERTO DE REPOR") return PDF_COLORS.warning;
  return PDF_COLORS.success;
}

function writeStockReport(doc, products) {
  if (products.length === 0) return writeEmptyState(doc, "Nenhum produto encontrado para os filtros selecionados.");
  const grouped = new Map();
  products.forEach((product) => {
    if (!grouped.has(product.sector)) grouped.set(product.sector, []);
    grouped.get(product.sector).push(product);
  });
  grouped.forEach((items, sector) => {
    writeSectionTitle(doc, `Categoria: ${sector}`);
    writeTable(doc, [
      { key: "name", label: "PRODUTO", width: 190 },
      { key: "unit", label: "UN.", width: 50, align: "center" },
      { key: "qty", label: "ATUAL", width: 70, align: "right", bold: true },
      { key: "minQty", label: "MÍNIMO", width: 65, align: "right" },
      { key: "idealQty", label: "IDEAL", width: 75, align: "right", bold: true },
      { key: "status", label: "SITUAÇÃO", width: 105, align: "center", bold: true, color: stockStatusColor }
    ], items.map((product) => ({ ...product, status: getStockAlert(product) })));
  });
}

function writeEntriesReport(doc, entries) {
  if (entries.length === 0) return writeEmptyState(doc, "Nenhuma entrada encontrada para os filtros selecionados.");
  writeTable(doc, [
    { key: "date", label: "DATA", width: 70 },
    { key: "sector", label: "CATEGORIA", width: 105 },
    { key: "product", label: "PRODUTO", width: 180 },
    { key: "unit", label: "UN.", width: 55, align: "center" },
    { key: "qty", label: "QUANTIDADE", width: 110, align: "right", bold: true }
  ], entries.map((entry) => ({
    date: formatDateBR(entry.date),
    sector: entry.product?.sector || "-",
    product: entry.product?.name || "-",
    unit: entry.product?.unit || "-",
    qty: entry.qty
  })));
}

function writeExitsReport(doc, exits) {
  if (exits.length === 0) return writeEmptyState(doc, "Nenhuma saída encontrada para os filtros selecionados.");
  writeTable(doc, [
    { key: "date", label: "DATA", width: 56 },
    { key: "sector", label: "CATEGORIA", width: 76 },
    { key: "product", label: "PRODUTO", width: 112 },
    { key: "unit", label: "UN.", width: 39, align: "center" },
    { key: "qty", label: "QTD.", width: 45, align: "right", bold: true },
    { key: "takenBy", label: "RETIRADO POR", width: 90 },
    { key: "observation", label: "OBSERVAÇÃO", width: 82 }
  ], exits.map((exitItem) => ({
    date: formatDateBR(exitItem.date),
    sector: exitItem.product?.sector || "-",
    product: exitItem.product?.name || "-",
    unit: exitItem.product?.unit || "-",
    qty: exitItem.qty,
    takenBy: exitItem.takenBy || "-",
    observation: exitItem.observation || "-"
  })));
}

function writeCategorySummaryReport(doc, rows) {
  if (rows.length === 0) return writeEmptyState(doc, "Nenhuma movimentação encontrada para os filtros selecionados.");
  const grouped = new Map();
  rows.forEach((row) => {
    if (!grouped.has(row.sector)) grouped.set(row.sector, []);
    grouped.get(row.sector).push(row);
  });
  let total = 0;
  grouped.forEach((items, sector) => {
    writeSectionTitle(doc, `Categoria: ${sector}`);
    const subtotal = items.reduce((sum, item) => sum + item.qty, 0);
    total += subtotal;
    writeTable(doc, [
      { key: "product", label: "PRODUTO", width: 320 },
      { key: "unit", label: "UN.", width: 80, align: "center" },
      { key: "qty", label: "QUANTIDADE", width: 155, align: "right", bold: true }
    ], items);
    doc.fillColor(PDF_COLORS.muted).font("Helvetica-Bold").fontSize(9).text(`Subtotal da categoria: ${subtotal}`, { align: "right" });
    doc.moveDown(0.6);
  });
  doc.fillColor(PDF_COLORS.navy).font("Helvetica-Bold").fontSize(11).text(`TOTAL GERAL: ${total}`, { align: "right" });
  doc.moveDown(0.5);
  doc.fillColor(PDF_COLORS.text).font("Helvetica");
}

function writeStockMonthlyReport(doc, rows) {
  if (rows.length === 0) return writeEmptyState(doc, "Nenhuma movimentação encontrada para os meses selecionados.");
  const grouped = new Map();
  rows.forEach((row) => {
    if (!grouped.has(row.sector)) grouped.set(row.sector, []);
    grouped.get(row.sector).push(row);
  });
  let totalIn = 0;
  let totalOut = 0;
  let totalNet = 0;
  grouped.forEach((items, sector) => {
    writeSectionTitle(doc, `Categoria: ${sector}`);
    const subtotalIn = items.reduce((sum, item) => sum + item.inQty, 0);
    const subtotalOut = items.reduce((sum, item) => sum + item.outQty, 0);
    const subtotalNet = items.reduce((sum, item) => sum + item.netQty, 0);
    totalIn += subtotalIn;
    totalOut += subtotalOut;
    totalNet += subtotalNet;
    writeTable(doc, [
      { key: "name", label: "PRODUTO", width: 210 },
      { key: "unit", label: "UN.", width: 50, align: "center" },
      { key: "inQty", label: "ENTRADAS", width: 80, align: "right" },
      { key: "outQty", label: "SAÍDAS", width: 75, align: "right" },
      { key: "netQty", label: "SALDO", width: 75, align: "right", bold: true },
      { key: "idealQty", label: "IDEAL", width: 65, align: "right", bold: true }
    ], items.sort((a, b) => a.name.localeCompare(b.name)));
    doc.fillColor(PDF_COLORS.muted).font("Helvetica-Bold").fontSize(9)
      .text(`Subtotal: Entradas ${subtotalIn}  |  Saídas ${subtotalOut}  |  Saldo ${subtotalNet}`, { align: "right" });
    doc.moveDown(0.6);
  });
  doc.fillColor(PDF_COLORS.navy).font("Helvetica-Bold").fontSize(11)
    .text(`TOTAL GERAL: Entradas ${totalIn}  |  Saídas ${totalOut}  |  Saldo ${totalNet}`, { align: "right" });
  doc.moveDown(0.5);
  doc.fillColor(PDF_COLORS.text).font("Helvetica");
}

async function getPeriodMovements(Model, baseFilter, monthsFilter) {
  let movements = await Model.find(baseFilter).populate("product").sort({ date: -1 }).lean();
  if (monthsFilter) {
    movements = movements.filter((item) => isDateInMonthsFilter(item.date, monthsFilter));
  }
  return movements;
}

router.get("/stock.csv", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const filters = getProductFiltersFromQuery(req, res);
  if (!filters) return;
  const products = filterProducts(await Product.find().sort({ sector: 1, name: 1 }).lean(), filters);
  const csv = new Parser({ fields: ["sector", "name", "unit", "qty", "minQty", "needsRestock"] }).parse(
    buildStockCsvRows(products)
  );

  setCsvHeaders(res, "estoque.csv");
  auditLog(req, "report.stock.csv", { sector: filters.sector || "all", stockStatus: filters.stockStatus });
  res.send(csv);
}));

router.get("/stock.pdf", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const filters = getProductFiltersFromQuery(req, res);
  if (!filters) return;
  const monthsFilter = parseMonthsFilterFromQuery(req, res);
  if (monthsFilter === false) return;

  const products = filterProducts(await Product.find().sort({ sector: 1, name: 1 }).lean(), filters);
  const productsWithIdealQty = await addIdealQuantities(products);
  setPdfHeaders(res, "estoque.pdf");
  const doc = createPdf(res, {
    title: monthsFilter ? "Relatório de estoque consolidado por meses" : "Relatório de estoque atual",
    subtitle: monthsFilter ? `Período: ${formatMonthsFilterLabel(monthsFilter)}  |  ${formatProductFilters(filters)}` : `${formatProductFilters(filters)}  |  Ideal: cobertura para 30 dias`
  });

  auditLog(req, "report.stock.pdf", {
    sector: filters.sector || "all",
    stockStatus: filters.stockStatus,
    months: monthsFilter ? monthsFilter.months : null,
    year: monthsFilter ? monthsFilter.year : null
  });

  if (!monthsFilter) {
    writeStockReport(doc, productsWithIdealQty);
  } else {
    const range = getMonthsUtcRange(monthsFilter);
    const [entries, exits] = await Promise.all([
      Entry.find({ date: range }).lean(),
      Exit.find({ date: range }).lean()
    ]);
    writeStockMonthlyReport(doc, buildStockMovementRows(productsWithIdealQty, entries, exits, monthsFilter));
  }

  finalizePdf(doc);
}));

router.get("/entries.pdf", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const productFilters = getProductFiltersFromQuery(req, res);
  if (!productFilters) return;
  const monthsFilter = parseMonthsFilterFromQuery(req, res);
  if (monthsFilter === false) return;
  if (monthsFilter && (req.query?.startDate || req.query?.endDate)) {
    return res.status(400).json({ error: "Use filtro por datas OU por meses, nao ambos" });
  }

  const filter = getDateFilterFromQuery(req, res);
  if (filter === null) return;

  const baseFilter = monthsFilter ? { date: getMonthsUtcRange(monthsFilter) } : filter;
  const entries = filterMovementsByProduct(
    await getPeriodMovements(Entry, baseFilter, monthsFilter),
    productFilters
  );
  const { startDate, endDate } = req.query;

  setPdfHeaders(res, "entradas.pdf");
  const periodLabel = monthsFilter
    ? `Período: ${formatMonthsFilterLabel(monthsFilter)}`
    : startDate && endDate ? `Período: ${formatDateBR(startDate)} a ${formatDateBR(endDate)}` : "Período: Todos os registros";
  const doc = createPdf(res, { title: "Relatório de entradas", subtitle: `${periodLabel}  |  ${formatProductFilters(productFilters)}` });
  auditLog(req, "report.entries.pdf", {
    startDate: startDate || null,
    endDate: endDate || null,
    sector: productFilters.sector || "all",
    stockStatus: productFilters.stockStatus,
    months: monthsFilter ? monthsFilter.months : null,
    year: monthsFilter ? monthsFilter.year : null
  });

  if (!monthsFilter) {
    writeEntriesReport(doc, entries);
  } else {
    writeCategorySummaryReport(doc, buildCategoryAggregateRows(entries));
  }

  finalizePdf(doc);
}));

router.get("/exits.pdf", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const productFilters = getProductFiltersFromQuery(req, res);
  if (!productFilters) return;
  const monthsFilter = parseMonthsFilterFromQuery(req, res);
  if (monthsFilter === false) return;
  if (monthsFilter && (req.query?.startDate || req.query?.endDate)) {
    return res.status(400).json({ error: "Use filtro por datas OU por meses, nao ambos" });
  }

  const filter = getDateFilterFromQuery(req, res);
  if (filter === null) return;

  const baseFilter = monthsFilter ? { date: getMonthsUtcRange(monthsFilter) } : filter;
  const exits = filterMovementsByProduct(
    await getPeriodMovements(Exit, baseFilter, monthsFilter),
    productFilters
  );
  const { startDate, endDate } = req.query;

  setPdfHeaders(res, "saidas.pdf");
  const periodLabel = monthsFilter
    ? `Período: ${formatMonthsFilterLabel(monthsFilter)}`
    : startDate && endDate ? `Período: ${formatDateBR(startDate)} a ${formatDateBR(endDate)}` : "Período: Todos os registros";
  const doc = createPdf(res, { title: "Relatório de saídas", subtitle: `${periodLabel}  |  ${formatProductFilters(productFilters)}` });
  auditLog(req, "report.exits.pdf", {
    startDate: startDate || null,
    endDate: endDate || null,
    sector: productFilters.sector || "all",
    stockStatus: productFilters.stockStatus,
    months: monthsFilter ? monthsFilter.months : null,
    year: monthsFilter ? monthsFilter.year : null
  });

  if (!monthsFilter) {
    writeExitsReport(doc, exits);
  } else {
    writeCategorySummaryReport(doc, buildCategoryAggregateRows(exits));
  }

  finalizePdf(doc);
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
  formatMonthsFilterLabel,
  isNearRestock,
  matchesStockStatus,
  getProductFiltersFromQuery,
  createPdf,
  finalizePdf,
  writeStockReport,
  addIdealQuantities
};

module.exports = router;
