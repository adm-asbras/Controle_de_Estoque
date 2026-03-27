// Valida data textual no formato YYYY-MM-DD.
function parseDateOnly(dateStr) {
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

  return { year, month, day };
}

// Converte intervalo textual para um range UTC inclusivo.
function getUtcRangeFromDateStrings(startDate, endDate) {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start || !end) return null;

  return {
    $gte: new Date(Date.UTC(start.year, start.month - 1, start.day, 0, 0, 0, 0)),
    $lte: new Date(Date.UTC(end.year, end.month - 1, end.day, 23, 59, 59, 999))
  };
}

// Interpreta filtro por meses/ano e devolve estrutura validada.
function parseMonthsFilter(rawMonths, rawYear) {
  if (!rawMonths && !rawYear) return { ok: true, value: null };

  const year = Number(rawYear);
  if (!rawMonths || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return { ok: false, error: "Para filtro por meses, informe months e year validos" };
  }

  const months = [...new Set(
    String(rawMonths)
      .split(",")
      .map((v) => Number(v.trim()))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 12)
  )].sort((a, b) => a - b);

  if (months.length === 0) {
    return { ok: false, error: "months invalido. Use valores de 1 a 12" };
  }

  return { ok: true, value: { year, months } };
}

// Gera o intervalo mais amplo necessario para buscar todos os meses escolhidos.
function getMonthsUtcRange({ year, months }) {
  const minMonth = Math.min(...months);
  const maxMonth = Math.max(...months);
  return {
    $gte: new Date(Date.UTC(year, minMonth - 1, 1, 0, 0, 0, 0)),
    $lte: new Date(Date.UTC(year, maxMonth, 0, 23, 59, 59, 999))
  };
}

// Filtra novamente em memoria para garantir que apenas os meses pedidos permanecam.
function isDateInMonthsFilter(dateValue, monthsFilter) {
  const d = new Date(dateValue);
  return d.getUTCFullYear() === monthsFilter.year && monthsFilter.months.includes(d.getUTCMonth() + 1);
}

// Texto amigavel exibido no cabecalho dos relatorios mensais.
function formatMonthsFilterLabel(monthsFilter) {
  const labels = ["Janeiro", "Fevereiro", "Mar\u00E7o", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return `${monthsFilter.months.map((m) => labels[m - 1]).join(", ")} / ${monthsFilter.year}`;
}

// Formata data para exibicao pt-BR sem deslocamento de fuso.
function formatDateBR(date) {
  return new Date(date).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

module.exports = {
  parseDateOnly,
  getUtcRangeFromDateStrings,
  parseMonthsFilter,
  getMonthsUtcRange,
  isDateInMonthsFilter,
  formatMonthsFilterLabel,
  formatDateBR
};
