const mongoose = require("mongoose");

// Detecta erros tipicos de ambiente Mongo sem suporte a transacao/sessao.
function isTransactionUnsupportedError(err) {
  const message = String(err?.message || "");
  return (
    /Transaction numbers are only allowed/i.test(message) ||
    /replica set/i.test(message) ||
    /topology does not support sessions/i.test(message) ||
    /Current topology does not support sessions/i.test(message)
  );
}

// Executa a operacao em transacao quando o banco suportar; caso contrario, usa fallback.
async function runWithOptionalTransaction(work, fallbackWork) {
  if (mongoose.connection.readyState !== 1) {
    return fallbackWork();
  }

  let session;
  try {
    session = await mongoose.startSession();
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (err) {
    if (typeof fallbackWork === "function" && isTransactionUnsupportedError(err)) {
      return fallbackWork();
    }
    throw err;
  } finally {
    if (session) {
      await session.endSession().catch(() => {});
    }
  }
}

module.exports = { runWithOptionalTransaction, isTransactionUnsupportedError };
