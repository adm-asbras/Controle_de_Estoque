const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const { createApp } = require("../src/server");
const Product = require("../src/models/Product");

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

function signSession() {
  process.env.JWT_SECRET = "csrf-test-secret";
  return jwt.sign({ id: "u-csrf", username: "alice", role: "admin" }, process.env.JWT_SECRET);
}

function remember(object, key, value) {
  const original = object[key];
  object[key] = value;
  return () => {
    object[key] = original;
  };
}

test("POST /api/auth/logout retorna 403 sem cabecalho CSRF", async () => {
  const token = signSession();

  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: {
        Cookie: `access_token=${encodeURIComponent(token)}`
      }
    });
    const body = await res.json();

    assert.equal(res.status, 403);
    assert.deepEqual(body, { error: "CSRF token invalido ou ausente" });
  });
});

test("POST /api/auth/logout aceita quando cookie e header CSRF coincidem", async () => {
  const token = signSession();
  const csrfToken = "csrf-fixed-test-token";

  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: {
        "X-CSRF-Token": csrfToken,
        Cookie: `access_token=${encodeURIComponent(token)}; csrf_token=${csrfToken}`
      }
    });

    assert.equal(res.status, 204);
  });
});

test("PUT /api/products/:id retorna 403 sem cabecalho CSRF", async () => {
  const token = signSession();

  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/products/507f1f77bcf86cd799439011`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: `access_token=${encodeURIComponent(token)}`
      },
      body: JSON.stringify({ name: "Caneta Azul" })
    });
    const body = await res.json();

    assert.equal(res.status, 403);
    assert.deepEqual(body, { error: "CSRF token invalido ou ausente" });
  });
});

test("PUT /api/products/:id aceita quando cookie e header CSRF coincidem", async () => {
  const token = signSession();
  const csrfToken = "csrf-products-test-token";
  const productId = "507f1f77bcf86cd799439011";
  const updatedProduct = {
    _id: productId,
    name: "Caneta Azul",
    sector: "Escritorio",
    unit: "Un",
    minQty: 2,
    qty: 8
  };
  const restoreFindByIdAndUpdate = remember(Product, "findByIdAndUpdate", async () => updatedProduct);

  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/products/${productId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          Cookie: `access_token=${encodeURIComponent(token)}; csrf_token=${csrfToken}`
        },
        body: JSON.stringify({ name: "Caneta Azul" })
      });
      const body = await res.json();

      assert.equal(res.status, 200);
      assert.equal(body._id, productId);
      assert.equal(body.name, "Caneta Azul");
    });
  } finally {
    restoreFindByIdAndUpdate();
  }
});
