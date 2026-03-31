// Regras centrais de validacao para entradas da API.
const { z } = require("zod");

const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,32}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^.{6,128}$/;

const ALLOWED_SECTORS = new Set(["Expediente", "Escritorio", "Limpeza", "Copa"]);
const ALLOWED_UNITS = new Set(["Un", "Pct", "Ltr", "Cx"]);

function normalizeSector(value) {
  const cleanValue = sanitizeText(value, 20);
  return cleanValue === "Escritório" ? "Escritorio" : cleanValue;
}

// Remove controle invisivel e aplica trim/tamanho maximo.
function sanitizeText(value, maxLen = 120) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, maxLen);
}

// Faz parse seguro de inteiro positivo.
function parsePositiveInt(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 1) return null;
  return num;
}

// Faz parse seguro de inteiro nao negativo.
function parseNonNegativeInt(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0) return null;
  return num;
}

function getSchemaErrorMessage(result, fallbackMessage = "Dados inválidos.") {
  if (result.success) return "";
  return result.error.issues[0]?.message || fallbackMessage;
}

function buildParsedSchema(parser, message) {
  return z
    .any()
    .transform((value) => parser(value))
    .refine((value) => value != null, { message });
}

// Valida data no formato YYYY-MM-DD e converte para UTC.
function validateDateOnly(dateStr) {
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
  return parsed;
}

const credentialsSchema = z.object({
  username: z
    .any()
    .transform((value) => sanitizeText(value, 32))
    .refine((value) => USERNAME_REGEX.test(value), {
      message: "Nome de usuário inválido. Use de 3 a 32 caracteres (letras, números, . _ -)."
    }),
  email: z
    .any()
    .transform((value) => sanitizeText(value, 120).toLowerCase())
    .refine((value) => EMAIL_REGEX.test(value), { message: "E-mail inválido." }),
  password: z
    .any()
    .transform((value) => (typeof value === "string" ? value : ""))
    .refine((value) => PASSWORD_REGEX.test(value), { message: "Senha fraca. Mínimo de 6 caracteres." })
});

const productNameSchema = z
  .any()
  .transform((value) => sanitizeText(value, 80))
  .refine((value) => Boolean(value), { message: "Nome do produto é obrigatório." });

const sectorSchema = z
  .any()
  .transform((value) => normalizeSector(value))
  .refine((value) => ALLOWED_SECTORS.has(value), { message: "Setor inválido." });

const unitSchema = z
  .any()
  .transform((value) => sanitizeText(value, 10))
  .refine((value) => ALLOWED_UNITS.has(value), { message: "Unidade inválida." });

const minQtySchema = buildParsedSchema(parseNonNegativeInt, "Quantidade mínima inválida.");
const qtySchema = buildParsedSchema(parseNonNegativeInt, "Quantidade inválida.");

const movementSchema = z.object({
  productId: z
    .any()
    .transform((value) => sanitizeText(value, 40))
    .refine((value) => Boolean(value), { message: "Produto é obrigatório." }),
  qty: buildParsedSchema(parsePositiveInt, "Quantidade deve ser um número inteiro maior ou igual a 1."),
  date: z
    .any()
    .transform((value) => validateDateOnly(value))
    .refine((value) => value instanceof Date, { message: "Data inválida. Use YYYY-MM-DD." })
});

// Valida credenciais de cadastro.
function validateCredentials({ username, email, password }) {
  const result = credentialsSchema.safeParse({ username, email, password });
  if (!result.success) return { ok: false, error: getSchemaErrorMessage(result) };
  return { ok: true, username: result.data.username, email: result.data.email };
}

// Valida payload de produto para create/update.
function validateProductPayload(body, { partial = false } = {}) {
  const patch = {};
  const safeBody = body || {};

  if (!partial || safeBody.name != null) {
    const result = productNameSchema.safeParse(safeBody.name);
    if (!result.success) return { ok: false, error: getSchemaErrorMessage(result, "Nome do produto é obrigatório.") };
    patch.name = result.data;
  }

  if (!partial || safeBody.sector != null) {
    const result = sectorSchema.safeParse(safeBody.sector);
    if (!result.success) return { ok: false, error: getSchemaErrorMessage(result, "Setor inválido.") };
    patch.sector = result.data;
  }

  if (!partial || safeBody.unit != null) {
    const result = unitSchema.safeParse(safeBody.unit);
    if (!result.success) return { ok: false, error: getSchemaErrorMessage(result, "Unidade inválida.") };
    patch.unit = result.data;
  }

  if (!partial || safeBody.minQty != null) {
    const result = minQtySchema.safeParse(safeBody.minQty);
    if (!result.success) return { ok: false, error: getSchemaErrorMessage(result, "Quantidade mínima inválida.") };
    patch.minQty = result.data;
  }

  if (safeBody.qty != null) {
    const result = qtySchema.safeParse(safeBody.qty);
    if (!result.success) return { ok: false, error: getSchemaErrorMessage(result, "Quantidade inválida.") };
    patch.qty = result.data;
  } else if (!partial) {
    patch.qty = 0;
  }

  return { ok: true, patch };
}

// Valida payload comum de entradas/saidas.
function validateMovementPayload(body) {
  const result = movementSchema.safeParse(body || {});
  if (!result.success) return { ok: false, error: getSchemaErrorMessage(result) };
  return {
    ok: true,
    productId: result.data.productId,
    qty: result.data.qty,
    date: result.data.date
  };
}

module.exports = {
  sanitizeText,
  validateDateOnly,
  validateCredentials,
  validateProductPayload,
  validateMovementPayload
};
