const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const { createApp } = require("../src/server");

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

test("GET /health responde com ok", async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/health`);
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.deepEqual(body, { ok: true });
  });
});

test("GET /api/auth/me aceita sessao via cookie", async () => {
  process.env.JWT_SECRET = "integration-secret";
  const token = jwt.sign({ id: "u99", username: "carol", role: "admin" }, process.env.JWT_SECRET);

  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: {
        Cookie: `access_token=${encodeURIComponent(token)}`
      }
    });
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.username, "carol");
    assert.equal(body.role, "admin");
    assert.match(body.csrfToken || "", /^[a-f0-9]{64}$/);
  });
});

test("GET /api/auth/me rejeita requisicao sem sessao", async () => {
  process.env.JWT_SECRET = "integration-secret";

  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/auth/me`);
    const body = await res.json();

    assert.equal(res.status, 401);
    assert.deepEqual(body, { error: "Sem token" });
  });
});
