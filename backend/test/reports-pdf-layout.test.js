const test = require("node:test");
const assert = require("node:assert/strict");
const { PassThrough } = require("node:stream");

const reportsRouter = require("../src/routes/reports.routes");

const { createPdf, finalizePdf, writeStockReport } = reportsRouter.__testables;

test("relatorio em PDF inclui layout institucional e logo", async () => {
  const response = new PassThrough();
  const chunks = [];
  response.on("data", (chunk) => chunks.push(chunk));

  const completed = new Promise((resolve, reject) => {
    response.on("end", resolve);
    response.on("error", reject);
  });

  const doc = createPdf(response, {
    title: "Relatório de estoque atual",
    subtitle: "Categoria: Todas  |  Estoque: Todos os produtos"
  });
  let extraPages = 0;
  doc.on("pageAdded", () => {
    extraPages += 1;
  });
  writeStockReport(doc, [{ name: "Papel A4", sector: "Escritorio", unit: "Pct", qty: 4, minQty: 5, idealQty: 8 }]);
  finalizePdf(doc);

  await completed;
  const pdf = Buffer.concat(chunks);
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  assert.ok(pdf.length > 5000);
  assert.equal(extraPages, 0);
});
