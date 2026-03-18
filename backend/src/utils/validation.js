// Regras centrais de validacao para entradas da API.
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

// Valida credenciais de cadastro.
function validateCredentials({ username, email, password }) {
  const cleanUsername = sanitizeText(username, 32);
  const cleanEmail = sanitizeText(email, 120).toLowerCase();

  if (!USERNAME_REGEX.test(cleanUsername)) {
    return { ok: false, error: "username invalido. Use 3-32 caracteres (letras, numeros, . _ -)" };
  }
  if (!EMAIL_REGEX.test(cleanEmail)) {
    return { ok: false, error: "email invalido" };
  }
  if (!PASSWORD_REGEX.test(password || "")) {
    return {
      ok: false,
      error: "senha fraca. Minimo 6 caracteres"
    };
  }

  return { ok: true, username: cleanUsername, email: cleanEmail };
}

// Valida payload de produto para create/update.
function validateProductPayload(body, { partial = false } = {}) {
  const patch = {};

  if (!partial || body.name != null) {
    const name = sanitizeText(body.name, 80);
    if (!name) return { ok: false, error: "name obrigatorio" };
    patch.name = name;
  }

  if (!partial || body.sector != null) {
    const sector = normalizeSector(body.sector);
    if (!ALLOWED_SECTORS.has(sector)) return { ok: false, error: "sector invalido" };
    patch.sector = sector;
  }

  if (!partial || body.unit != null) {
    const unit = sanitizeText(body.unit, 10);
    if (!ALLOWED_UNITS.has(unit)) return { ok: false, error: "unit invalida" };
    patch.unit = unit;
  }

  if (!partial || body.minQty != null) {
    const minQty = parseNonNegativeInt(body.minQty);
    if (minQty == null) return { ok: false, error: "minQty invalido" };
    patch.minQty = minQty;
  }

  if (body.qty != null) {
    const qty = parseNonNegativeInt(body.qty);
    if (qty == null) return { ok: false, error: "qty invalida" };
    patch.qty = qty;
  } else if (!partial) {
    patch.qty = 0;
  }

  return { ok: true, patch };
}

// Valida payload comum de entradas/saidas.
function validateMovementPayload(body) {
  const productId = sanitizeText(body.productId, 40);
  const qty = parsePositiveInt(body.qty);
  const date = validateDateOnly(body.date);

  if (!productId) return { ok: false, error: "productId obrigatorio" };
  if (qty == null) return { ok: false, error: "qty deve ser inteiro >= 1" };
  if (!date) return { ok: false, error: "date invalida. Use YYYY-MM-DD" };

  return { ok: true, productId, qty, date };
}

module.exports = {
  sanitizeText,
  validateDateOnly,
  validateCredentials,
  validateProductPayload,
  validateMovementPayload
};
