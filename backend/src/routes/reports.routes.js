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

const router = express.Router();

// Valida data textual no formato YYYY-MM-DD.
function parseDateOnly(dateStr) {
  if (typeof dateStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [year, month, day] = dateStr.split("-").map(Number);
  if (year < 2000 || year > 2100) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

// Converte intervalo de datas para filtro UTC inclusivo.
function getUtcRangeFromDateStrings(startDate, endDate) {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start || !end) return null;

  return {
    $gte: new Date(Date.UTC(start.year, start.month - 1, start.day, 0, 0, 0, 0)),
    $lte: new Date(Date.UTC(end.year, end.month - 1, end.day, 23, 59, 59, 999))
  };
}

// Monta filtro opcional por data a partir da querystring.
function getDateFilterFromQuery(req, res) {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) return {};

  const dateRange = getUtcRangeFromDateStrings(startDate, endDate);
  if (!dateRange) {
    res.status(400).json({ error: "startDate/endDate invalidas. Use YYYY-MM-DD" });
    return null;
  }
  if (dateRange.$gte > dateRange.$lte) {
    res.status(400).json({ error: "startDate nao pode ser maior que endDate" });
    return null;
  }

  return { date: dateRange };
}

// Formata data para exibicao pt-BR sem deslocamento de fuso.
function formatDateBR(date) {
  return new Date(date).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function parseMonthsFilterFromQuery(req, res) {
  const rawMonths = sanitizeText(req.query?.months || "", 120);
  const rawYear = req.query?.year;
  if (!rawMonths && !rawYear) return null;

  const year = Number(rawYear);
  if (!rawMonths || !Number.isInteger(year) || year < 2000 || year > 2100) {
    res.status(400).json({ error: "Para filtro por meses, informe months e year validos" });
    return false;
  }

  const months = [...new Set(rawMonths.split(",").map((v) => Number(v.trim())).filter((n) => Number.isInteger(n) && n >= 1 && n <= 12))]
    .sort((a, b) => a - b);
  if (months.length === 0) {
    res.status(400).json({ error: "months invalido. Use valores de 1 a 12" });
    return false;
  }
  if (months.length > 12) {
    res.status(400).json({ error: "months invalido. Maximo de 12 meses" });
    return false;
  }
  return { year, months };
}

function getMonthsUtcRange({ year, months }) {
  const minMonth = Math.min(...months);
  const maxMonth = Math.max(...months);
  return {
    $gte: new Date(Date.UTC(year, minMonth - 1, 1, 0, 0, 0, 0)),
    $lte: new Date(Date.UTC(year, maxMonth, 0, 23, 59, 59, 999))
  };
}

function isDateInMonthsFilter(dateValue, monthsFilter) {
  const d = new Date(dateValue);
  return d.getUTCFullYear() === monthsFilter.year && monthsFilter.months.includes(d.getUTCMonth() + 1);
}

function formatMonthsFilterLabel(monthsFilter) {
  const labels = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return `${monthsFilter.months.map((m) => labels[m - 1]).join(", ")} / ${monthsFilter.year}`;
}

// Renderiza consolidado por categoria com subtotal de cada categoria e total geral.
function renderCategorySummary(doc, rows) {
  if (!rows || rows.length === 0) {
    doc.text("Nenhuma movimentacao encontrada para os meses selecionados.");
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

/**
 * ADMIN ONLY
 * (Opcional) ?sector=Limpeza
 */
router.get("/stock.csv", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const sector = sanitizeText(req.query?.sector || "", 20);
  const filter = sector ? { sector } : {};

  const products = await Product.find(filter).sort({ sector: 1, name: 1 }).lean();
  const rows = products.map((p) => ({
    sector: p.sector,
    name: p.name,
    unit: p.unit,
    qty: p.qty,
    minQty: p.minQty,
    needsRestock: p.qty <= p.minQty ? "SIM" : "NAO"
  }));

  const parser = new Parser({ fields: ["sector", "name", "unit", "qty", "minQty", "needsRestock"] });
  const csv = parser.parse(rows);

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="estoque.csv"');
  auditLog(req, "report.stock.csv", { sector: sector || "all" });
  res.send(csv);
}));

// Gera PDF de estoque atual.
router.get("/stock.pdf", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const sector = sanitizeText(req.query?.sector || "", 20);
  const filter = sector ? { sector } : {};
  const monthsFilter = parseMonthsFilterFromQuery(req, res);
  if (monthsFilter === false) return;

  const products = await Product.find(filter).sort({ sector: 1, name: 1 }).lean();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'attachment; filename="estoque.pdf"');

  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(res);
  auditLog(req, "report.stock.pdf", {
    sector: sector || "all",
    months: monthsFilter ? monthsFilter.months : null,
    year: monthsFilter ? monthsFilter.year : null
  });

  if (!monthsFilter) {
    doc.fontSize(16).text("Relatorio de Estoque", { align: "center" });
  } else {
    doc.fontSize(16).text("Relatorio de Estoque (Consolidado por Meses)", { align: "center" });
    doc.fontSize(10).text(`Periodo: ${formatMonthsFilterLabel(monthsFilter)}`, { align: "center" });
  }
  doc.moveDown();

  let currentSector = null;
  doc.fontSize(11);

  if (!monthsFilter) {
    products.forEach((p) => {
      if (p.sector !== currentSector) {
        currentSector = p.sector;
        doc.moveDown(0.5);
        doc.fontSize(13).text(`Categoria: ${currentSector}`);
        doc.fontSize(11);
      }
      const alert = p.qty <= p.minQty ? "REPOR" : "OK";
      doc.text(`${p.name} (${p.unit}) | Qtd: ${p.qty} | Min: ${p.minQty} | ${alert}`);
    });
  } else {
    const range = getMonthsUtcRange(monthsFilter);
    const entries = await Entry.find({ date: range }).lean();
    const exits = await Exit.find({ date: range }).lean();

    const inByProduct = new Map();
    entries.forEach((e) => {
      if (!isDateInMonthsFilter(e.date, monthsFilter)) return;
      const key = e.product?.toString();
      inByProduct.set(key, (inByProduct.get(key) || 0) + e.qty);
    });
    const outByProduct = new Map();
    exits.forEach((e) => {
      if (!isDateInMonthsFilter(e.date, monthsFilter)) return;
      const key = e.product?.toString();
      outByProduct.set(key, (outByProduct.get(key) || 0) + e.qty);
    });

    const rows = products
      .map((p) => {
        const id = p._id.toString();
        const inQty = inByProduct.get(id) || 0;
        const outQty = outByProduct.get(id) || 0;
        return {
          sector: p.sector,
          name: p.name,
          unit: p.unit,
          inQty,
          outQty,
          netQty: inQty - outQty
        };
      })
      .filter((row) => row.inQty > 0 || row.outQty > 0);

    if (rows.length === 0) {
      doc.text("Nenhuma movimentacao encontrada para os meses selecionados.");
    } else {
      const grouped = new Map();
      rows.forEach((r) => {
        if (!grouped.has(r.sector)) grouped.set(r.sector, []);
        grouped.get(r.sector).push(r);
      });

      let totalIn = 0;
      let totalOut = 0;
      let totalNet = 0;

      for (const [sector, items] of grouped.entries()) {
        doc.moveDown(0.4);
        doc.font("Helvetica-Bold").fontSize(12).text(`Categoria: ${sector}`);
        doc.font("Helvetica-Bold").fontSize(10).text("Produto | Unidade | Entradas | Saidas | Saldo");
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
        doc.font("Helvetica-Bold").text(`Subtotal ${sector}: Entradas ${subIn} | Saidas ${subOut} | Saldo ${subNet}`);
        doc.font("Helvetica");
      }

      doc.moveDown(0.6);
      doc.font("Helvetica-Bold").text(`TOTAL GERAL: Entradas ${totalIn} | Saidas ${totalOut} | Saldo ${totalNet}`);
      doc.font("Helvetica");
    }
  }

  doc.end();
}));

// Gera PDF de entradas com filtro opcional por periodo.
router.get("/entries.pdf", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const monthsFilter = parseMonthsFilterFromQuery(req, res);
  if (monthsFilter === false) return;
  if (monthsFilter && (req.query?.startDate || req.query?.endDate)) {
    return res.status(400).json({ error: "Use filtro por datas OU por meses, nao ambos" });
  }

  const filter = getDateFilterFromQuery(req, res);
  if (filter === null) return;

  const baseFilter = monthsFilter ? { date: getMonthsUtcRange(monthsFilter) } : filter;
  let entries = await Entry.find(baseFilter).populate("product").sort({ date: -1 }).lean();
  if (monthsFilter) {
    entries = entries.filter((e) => isDateInMonthsFilter(e.date, monthsFilter));
  }
  const { startDate, endDate } = req.query;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'attachment; filename="entradas.pdf"');

  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(res);
  auditLog(req, "report.entries.pdf", {
    startDate: startDate || null,
    endDate: endDate || null,
    months: monthsFilter ? monthsFilter.months : null,
    year: monthsFilter ? monthsFilter.year : null
  });

  if (!monthsFilter) {
    doc.fontSize(16).text("Relatorio de Entradas", { align: "center" });
  } else {
    doc.fontSize(16).text("Relatorio de Entradas (Consolidado por Meses)", { align: "center" });
    doc.fontSize(10).text(`Periodo: ${formatMonthsFilterLabel(monthsFilter)}`, { align: "center" });
  }
  if (!monthsFilter && startDate && endDate) {
    doc.fontSize(10).text(`Periodo: ${formatDateBR(startDate)} a ${formatDateBR(endDate)}`, { align: "center" });
  }
  doc.moveDown(0.5);

  if (!monthsFilter) {
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
    entries.forEach((e) => {
      const date = formatDateBR(e.date);
      const sector = e.product?.sector || "-";
      const product = e.product?.name || "-";
      const qty = e.qty.toString();
      const unit = e.product?.unit || "-";

      doc.text(date, col1, doc.y, { width: col2 - col1 });
      doc.text(sector, col2, doc.y - 14, { width: col3 - col2 });
      doc.text(product, col3, doc.y - 14, { width: col4 - col3 });
      doc.text(unit, col4, doc.y - 14, { width: col5 - col4 });
      doc.text(qty, col5, doc.y - 14);
      doc.moveDown();
    });
  } else {
    const aggregate = new Map();
    entries.forEach((e) => {
      if (!e.product?._id) return;
      const key = e.product._id.toString();
      if (!aggregate.has(key)) {
        aggregate.set(key, {
          sector: e.product.sector || "-",
          product: e.product.name || "-",
          unit: e.product.unit || "-",
          qty: 0
        });
      }
      aggregate.get(key).qty += e.qty;
    });

    const rows = [...aggregate.values()].sort((a, b) => (a.sector + a.product).localeCompare(b.sector + b.product));
    renderCategorySummary(doc, rows);
  }

  doc.end();
}));

// Gera PDF de saidas com filtro opcional por periodo.
router.get("/exits.pdf", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const monthsFilter = parseMonthsFilterFromQuery(req, res);
  if (monthsFilter === false) return;
  if (monthsFilter && (req.query?.startDate || req.query?.endDate)) {
    return res.status(400).json({ error: "Use filtro por datas OU por meses, nao ambos" });
  }

  const filter = getDateFilterFromQuery(req, res);
  if (filter === null) return;

  const baseFilter = monthsFilter ? { date: getMonthsUtcRange(monthsFilter) } : filter;
  let exits = await Exit.find(baseFilter).populate("product").sort({ date: -1 }).lean();
  if (monthsFilter) {
    exits = exits.filter((e) => isDateInMonthsFilter(e.date, monthsFilter));
  }
  const { startDate, endDate } = req.query;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'attachment; filename="saidas.pdf"');

  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(res);
  auditLog(req, "report.exits.pdf", {
    startDate: startDate || null,
    endDate: endDate || null,
    months: monthsFilter ? monthsFilter.months : null,
    year: monthsFilter ? monthsFilter.year : null
  });

  if (!monthsFilter) {
    doc.fontSize(16).text("Relatorio de Saidas", { align: "center" });
  } else {
    doc.fontSize(16).text("Relatorio de Saidas (Consolidado por Meses)", { align: "center" });
    doc.fontSize(10).text(`Periodo: ${formatMonthsFilterLabel(monthsFilter)}`, { align: "center" });
  }
  if (!monthsFilter && startDate && endDate) {
    doc.fontSize(10).text(`Periodo: ${formatDateBR(startDate)} a ${formatDateBR(endDate)}`, { align: "center" });
  }
  doc.moveDown(0.5);

  if (!monthsFilter) {
    const col1 = 35, col2 = 95, col3 = 165, col4 = 250, col5 = 305, col6 = 360, col7 = 430;
    doc.fontSize(10).font("Helvetica-Bold");
    doc.text("Data", col1, doc.y, { width: col2 - col1 });
    doc.text("Categoria", col2, doc.y - 14, { width: col3 - col2 });
    doc.text("Produto", col3, doc.y - 14, { width: col4 - col3 });
    doc.text("Unidade", col4, doc.y - 14, { width: col5 - col4 });
    doc.text("Quantidade", col5, doc.y - 14, { width: col6 - col5 });
    doc.text("Retirado por", col6, doc.y - 14, { width: col7 - col6 });
    doc.text("Observacao", col7, doc.y - 14);
    doc.moveTo(35, doc.y + 2).lineTo(560, doc.y + 2).stroke();
    doc.moveDown();

    doc.font("Helvetica");
    exits.forEach((e) => {
      const date = formatDateBR(e.date);
      const sector = e.product?.sector || "-";
      const product = e.product?.name || "-";
      const qty = e.qty.toString();
      const unit = e.product?.unit || "-";
      const takenBy = e.takenBy || "-";
      const observation = e.observation || "-";

      doc.text(date, col1, doc.y, { width: col2 - col1 });
      doc.text(sector, col2, doc.y - 14, { width: col3 - col2 });
      doc.text(product, col3, doc.y - 14, { width: col4 - col3 });
      doc.text(unit, col4, doc.y - 14, { width: col5 - col4 });
      doc.text(qty, col5, doc.y - 14, { width: col6 - col5 });
      doc.text(takenBy, col6, doc.y - 14, { width: col7 - col6 });
      doc.text(observation, col7, doc.y - 14);
      doc.moveDown();
    });
  } else {
    const aggregate = new Map();
    exits.forEach((e) => {
      if (!e.product?._id) return;
      const key = e.product._id.toString();
      if (!aggregate.has(key)) {
        aggregate.set(key, {
          sector: e.product.sector || "-",
          product: e.product.name || "-",
          unit: e.product.unit || "-",
          qty: 0
        });
      }
      aggregate.get(key).qty += e.qty;
    });

    const rows = [...aggregate.values()].sort((a, b) => (a.sector + a.product).localeCompare(b.sector + b.product));
    renderCategorySummary(doc, rows);
  }

  doc.end();
}));

// Gera CSV de entradas.
router.get("/entries.csv", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const filter = getDateFilterFromQuery(req, res);
  if (filter === null) return;

  const entries = await Entry.find(filter).populate("product").sort({ date: -1 }).lean();
  const rows = entries.map((e) => ({
    date: new Date(e.date).toISOString().slice(0, 10),
    sector: e.product?.sector || "",
    product: e.product?.name || "",
    unit: e.product?.unit || "",
    qty: e.qty
  }));

  const parser = new Parser({ fields: ["date", "sector", "product", "unit", "qty"] });
  const csv = parser.parse(rows);

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="entradas.csv"');
  auditLog(req, "report.entries.csv", {
    startDate: req.query?.startDate || null,
    endDate: req.query?.endDate || null
  });
  res.send(csv);
}));

// Gera CSV de saidas.
router.get("/exits.csv", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const filter = getDateFilterFromQuery(req, res);
  if (filter === null) return;

  const exits = await Exit.find(filter).populate("product").sort({ date: -1 }).lean();
  const rows = exits.map((e) => ({
    date: new Date(e.date).toISOString().slice(0, 10),
    sector: e.product?.sector || "",
    product: e.product?.name || "",
    unit: e.product?.unit || "",
    qty: e.qty,
    takenBy: e.takenBy,
    observation: e.observation || ""
  }));

  const parser = new Parser({ fields: ["date", "sector", "product", "unit", "qty", "takenBy", "observation"] });
  const csv = parser.parse(rows);

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="saidas.csv"');
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
