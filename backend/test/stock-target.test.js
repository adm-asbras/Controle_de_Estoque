const test = require("node:test");
const assert = require("node:assert/strict");

const { calculateIdealQty } = require("../src/utils/stock-target");

test("calculateIdealQty respeita o minimo quando nao ha consumo", () => {
  assert.equal(calculateIdealQty({ minQty: 5 }, 0, 60, 30), 5);
});

test("calculateIdealQty inclui estoque minimo e cobertura de consumo", () => {
  assert.equal(calculateIdealQty({ minQty: 5 }, 20, 60, 30), 15);
});
