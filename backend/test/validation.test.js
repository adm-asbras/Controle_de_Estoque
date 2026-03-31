const test = require("node:test");
const assert = require("node:assert/strict");

const { validateDateOnly, validateMovementPayload, validateProductPayload } = require("../src/utils/validation");

test("validateDateOnly aceita data valida", () => {
  const parsed = validateDateOnly("2026-03-18");
  assert.ok(parsed instanceof Date);
  assert.equal(parsed.toISOString(), "2026-03-18T12:00:00.000Z");
});

test("validateDateOnly rejeita data impossivel", () => {
  const parsed = validateDateOnly("2026-02-31");
  assert.equal(parsed, null);
});

test("validateMovementPayload aceita payload valido", () => {
  const result = validateMovementPayload({
    productId: "507f1f77bcf86cd799439011",
    qty: 3,
    date: "2026-03-18"
  });

  assert.equal(result.ok, true);
  assert.equal(result.qty, 3);
  assert.equal(result.productId, "507f1f77bcf86cd799439011");
});

test("validateMovementPayload rejeita quantidade invalida", () => {
  const result = validateMovementPayload({
    productId: "507f1f77bcf86cd799439011",
    qty: 0,
    date: "2026-03-18"
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /Quantidade/);
});

test("validateProductPayload normaliza setor com acento", () => {
  const result = validateProductPayload({
    name: "Caneta",
    sector: "Escritório",
    unit: "Un",
    minQty: 1
  });

  assert.equal(result.ok, true);
  assert.equal(result.patch.sector, "Escritorio");
});

