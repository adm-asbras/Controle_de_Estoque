const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const { createApp } = require("../src/server");
const User = require("../src/models/User");
const Product = require("../src/models/Product");
const Entry = require("../src/models/Entry");
const Exit = require("../src/models/Exit");
const StockRequest = require("../src/models/StockRequest");

async function withServer(run) {
  const app = createApp();
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  try {
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

function signSession(role = "admin", username = "tester") {
  process.env.JWT_SECRET = "route-flow-secret";
  return jwt.sign({ id: "u-test", username, role }, process.env.JWT_SECRET);
}

function authHeadersWithCsrf(token) {
  const csrfToken = "test-csrf-token";
  return {
    "Content-Type": "application/json",
    "X-CSRF-Token": csrfToken,
    Cookie: `access_token=${encodeURIComponent(token)}; csrf_token=${csrfToken}`
  };
}

function remember(object, key, value) {
  const original = object[key];
  object[key] = value;
  return () => {
    object[key] = original;
  };
}

test("POST /api/auth/login autentica usuario valido", async () => {
  process.env.JWT_SECRET = "route-flow-secret";
  const passwordHash = await bcrypt.hash("Senha123", 10);
  const restoreFindOne = remember(User, "findOne", async ({ username }) => {
    if (username !== "alice") return null;
    return {
      _id: "507f1f77bcf86cd799439011",
      username: "alice",
      role: "admin",
      passwordHash
    };
  });

  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "alice", password: "Senha123" })
      });
      const body = await res.json();

      assert.equal(res.status, 200);
      assert.deepEqual(body, { username: "alice", role: "admin" });
      assert.match(res.headers.get("set-cookie") || "", /access_token=/);
    });
  } finally {
    restoreFindOne();
  }
});

test("POST /api/entries cria entrada e retorna produto atualizado", async () => {
  const token = signSession("admin", "gestor");
  const updatedProduct = {
    _id: "507f1f77bcf86cd799439012",
    name: "Papel A4",
    qty: 15,
    unit: "Cx",
    sector: "Expediente"
  };
  const createdEntry = {
    _id: "entry-1",
    product: updatedProduct._id,
    qty: 5,
    createdBy: "gestor"
  };

  const restoreProduct = remember(Product, "findByIdAndUpdate", async () => updatedProduct);
  const restoreEntryCreate = remember(Entry, "create", async () => createdEntry);
  const restoreEntryFind = remember(Entry, "findById", () => ({
    populate: async () => ({ ...createdEntry, product: updatedProduct })
  }));

  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/entries`, {
        method: "POST",
        headers: authHeadersWithCsrf(token),
        body: JSON.stringify({
          productId: updatedProduct._id,
          qty: 5,
          date: "2026-03-18"
        })
      });
      const body = await res.json();

      assert.equal(res.status, 201);
      assert.equal(body.product.qty, 15);
      assert.equal(body.entry.qty, 5);
      assert.equal(body.entry.createdBy, "gestor");
    });
  } finally {
    restoreProduct();
    restoreEntryCreate();
    restoreEntryFind();
  }
});

test("POST /api/exits bloqueia saida com estoque insuficiente para perfil com saida direta", async () => {
  const token = signSession("admin_limited", "operador");
  const restoreFindOneAndUpdate = remember(Product, "findOneAndUpdate", async () => null);
  const restoreFindById = remember(Product, "findById", () => ({
    select: async () => ({ _id: "507f1f77bcf86cd799439013", qty: 2 })
  }));

  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/exits`, {
        method: "POST",
        headers: authHeadersWithCsrf(token),
        body: JSON.stringify({
          productId: "507f1f77bcf86cd799439013",
          qty: 5,
          date: "2026-03-18"
        })
      });
      const body = await res.json();

      assert.equal(res.status, 400);
      assert.equal(body.error, "Estoque insuficiente. Disponível: 2");
    });
  } finally {
    restoreFindOneAndUpdate();
    restoreFindById();
  }
});

test("POST /api/exits bloqueia saida direta para usuario comum", async () => {
  const token = signSession("user", "operador");

  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/exits`, {
      method: "POST",
      headers: authHeadersWithCsrf(token),
      body: JSON.stringify({
        productId: "507f1f77bcf86cd799439013",
        qty: 1,
        date: "2026-03-18"
      })
    });
    const body = await res.json();

    assert.equal(res.status, 403);
    assert.equal(body.error, "Saída direta não permitida para este perfil. Use Solicitações.");
  });
});

test("POST /api/entries faz rollback do estoque se falhar ao gravar entrada", async () => {
  const token = signSession("admin", "gestor");
  const calls = [];
  const updatedProduct = {
    _id: "507f1f77bcf86cd799439014",
    name: "Detergente",
    qty: 20,
    unit: "Un",
    sector: "Limpeza"
  };

  const restoreProduct = remember(Product, "findByIdAndUpdate", async (...args) => {
    calls.push(args);
    if (calls.length === 1) return updatedProduct;
    return { _id: updatedProduct._id, qty: 15 };
  });
  const restoreEntryCreate = remember(Entry, "create", async () => {
    throw new Error("falha ao gravar entrada");
  });

  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/entries`, {
        method: "POST",
        headers: authHeadersWithCsrf(token),
        body: JSON.stringify({
          productId: updatedProduct._id,
          qty: 5,
          date: "2026-03-18"
        })
      });
      const body = await res.json();

      assert.equal(res.status, 500);
      assert.deepEqual(body, { error: "Erro interno" });
      assert.equal(calls.length, 2);
      assert.deepEqual(calls[1][1], { $inc: { qty: -5 } });
    });
  } finally {
    restoreProduct();
    restoreEntryCreate();
  }
});

test("POST /api/exits faz rollback do estoque se falhar ao gravar saida", async () => {
  const token = signSession("admin_limited", "operador");
  const rollbackCalls = [];
  const updatedProduct = {
    _id: "507f1f77bcf86cd799439015",
    name: "Copo",
    qty: 8,
    unit: "Pct",
    sector: "Copa"
  };

  const restoreFindOneAndUpdate = remember(Product, "findOneAndUpdate", async () => updatedProduct);
  const restoreFindByIdAndUpdate = remember(Product, "findByIdAndUpdate", async (...args) => {
    rollbackCalls.push(args);
    return { _id: updatedProduct._id, qty: 10 };
  });
  const restoreExitCreate = remember(Exit, "create", async () => {
    throw new Error("falha ao gravar saida");
  });

  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/exits`, {
        method: "POST",
        headers: authHeadersWithCsrf(token),
        body: JSON.stringify({
          productId: updatedProduct._id,
          qty: 2,
          date: "2026-03-18"
        })
      });
      const body = await res.json();

      assert.equal(res.status, 500);
      assert.deepEqual(body, { error: "Erro interno" });
      assert.equal(rollbackCalls.length, 1);
      assert.deepEqual(rollbackCalls[0][1], { $inc: { qty: 2 } });
    });
  } finally {
    restoreFindOneAndUpdate();
    restoreFindByIdAndUpdate();
    restoreExitCreate();
  }
});

test("PUT /api/requests/:id/review ao aprovar retirada cria saida para entrar nos relatorios", async () => {
  const token = signSession("admin", "gestor");
  const requestId = "507f1f77bcf86cd799439020";
  const productId = "507f1f77bcf86cd799439021";
  const requestDate = new Date("2026-03-22T12:00:00.000Z");
  const requestDoc = {
    _id: requestId,
    type: "exit",
    product: productId,
    qty: 3,
    requestedBy: "operador",
    requestDate,
    status: "pending",
    reviewedBy: null,
    reviewNote: "",
    reviewedAt: null,
    exit: null,
    entry: null,
    async save() {}
  };
  const populatedPayload = {
    _id: requestId,
    status: "approved",
    product: { _id: productId },
    exit: { _id: "exit-from-request" }
  };

  let stockRequestFindCalls = 0;
  let createdExitPayload = null;

  const restoreStockRequestFindById = remember(StockRequest, "findById", () => {
    stockRequestFindCalls += 1;
    if (stockRequestFindCalls === 1) return requestDoc;
    return {
      populate: () => ({
        populate: () => ({
          populate: async () => populatedPayload
        })
      })
    };
  });
  const restoreProductFindOneAndUpdate = remember(Product, "findOneAndUpdate", async () => ({
    _id: productId,
    qty: 10
  }));
  const restoreExitCreate = remember(Exit, "create", async (payload) => {
    createdExitPayload = payload;
    return { _id: "exit-from-request" };
  });

  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/requests/${requestId}/review`, {
        method: "PUT",
        headers: authHeadersWithCsrf(token),
        body: JSON.stringify({ decision: "approve", reviewNote: "ok" })
      });
      const body = await res.json();

      assert.equal(res.status, 200);
      assert.equal(body.status, "approved");
      assert.equal(requestDoc.status, "approved");
      assert.equal(createdExitPayload.qty, 3);
      assert.equal(createdExitPayload.product, productId);
      assert.equal(createdExitPayload.takenBy, "operador");
      assert.equal(new Date(createdExitPayload.date).toISOString(), requestDate.toISOString());
    });
  } finally {
    restoreStockRequestFindById();
    restoreProductFindOneAndUpdate();
    restoreExitCreate();
  }
});

