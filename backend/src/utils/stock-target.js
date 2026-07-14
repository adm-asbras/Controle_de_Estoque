function calculateIdealQty(product, totalConsumed, horizonDays, coverageDays) {
  const averageDailyConsumption = totalConsumed / horizonDays;
  const projectedNeed = averageDailyConsumption * coverageDays;
  return Math.max(product.minQty, Math.ceil(projectedNeed + product.minQty));
}

module.exports = { calculateIdealQty };
