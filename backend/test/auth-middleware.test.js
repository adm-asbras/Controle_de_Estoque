const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const { requireAuth } = require("../src/middleware/auth");

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

test("requireAuth aceita JWT via cookie", () => {
  process.env.JWT_SECRET = "test-secret";
  const token = jwt.sign({ id: "u1", username: "alice", role: "admin" }, process.env.JWT_SECRET);
  const req = { headers: { cookie: `access_token=${encodeURIComponent(token)}` } };
  const res = createRes();
  let called = false;

  requireAuth(req, res, () => {
    called = true;
  });

  assert.equal(called, true);
  assert.equal(req.user.username, "alice");
  assert.equal(req.user.role, "admin");
});

test("requireAuth aceita JWT via Authorization Bearer", () => {
  process.env.JWT_SECRET = "test-secret";
  const token = jwt.sign({ id: "u2", username: "bob", role: "user" }, process.env.JWT_SECRET);
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = createRes();
  let called = false;

  requireAuth(req, res, () => {
    called = true;
  });

  assert.equal(called, true);
  assert.equal(req.user.username, "bob");
  assert.equal(req.user.role, "user");
});

test("requireAuth rejeita quando nao ha token", () => {
  process.env.JWT_SECRET = "test-secret";
  const req = { headers: {} };
  const res = createRes();
  let called = false;

  requireAuth(req, res, () => {
    called = true;
  });

  assert.equal(called, false);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: "Sem token" });
});
