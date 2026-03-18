const test = require("node:test");
const assert = require("node:assert/strict");

const reportsRouter = require("../src/routes/reports.routes");

const {
  parseDateOnly,
  getUtcRangeFromDateStrings,
  getDateFilterFromQuery,
  parseMonthsFilterFromQuery,
  formatMonthsFilterLabel
} = reportsRouter.__testables;

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

test("parseDateOnly rejeita datas impossiveis", () => {
  assert.equal(parseDateOnly("2026-02-31"), null);
  assert.equal(parseDateOnly("2026-13-10"), null);
});

test("getUtcRangeFromDateStrings monta intervalo inclusivo", () => {
  const range = getUtcRangeFromDateStrings("2026-03-01", "2026-03-31");
  assert.equal(range.$gte.toISOString(), "2026-03-01T00:00:00.000Z");
  assert.equal(range.$lte.toISOString(), "2026-03-31T23:59:59.999Z");
});

test("getDateFilterFromQuery rejeita startDate maior que endDate", () => {
  const req = { query: { startDate: "2026-03-31", endDate: "2026-03-01" } };
  const res = createRes();

  const result = getDateFilterFromQuery(req, res);

  assert.equal(result, null);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "startDate nao pode ser maior que endDate" });
});

test("parseMonthsFilterFromQuery aceita meses validos", () => {
  const req = { query: { months: "1,3,2,3", year: "2026" } };
  const res = createRes();

  const result = parseMonthsFilterFromQuery(req, res);

  assert.deepEqual(result, { year: 2026, months: [1, 2, 3] });
});

test("formatMonthsFilterLabel gera rotulo amigavel", () => {
  const label = formatMonthsFilterLabel({ year: 2026, months: [1, 2, 3] });
  assert.equal(label, "Janeiro, Fevereiro, Marco / 2026");
});
