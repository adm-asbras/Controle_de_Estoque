const nodemailer = require("nodemailer");

// Construtor de transporte SMTP baseado em variaveis de ambiente.
function createTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secureOverride = process.env.SMTP_SECURE;
  const forceIpv4 = String(process.env.SMTP_FORCE_IPV4 || "").toLowerCase() === "true";

  if (!host || !port || !user || !pass) return null;

  const secure =
    typeof secureOverride === "string" && secureOverride.length
      ? secureOverride.toLowerCase() === "true"
      : port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    ...(forceIpv4 ? { family: 4 } : {}),
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 8000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 8000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 12000)
  });
}

// Envia email com link de redefinicao de senha.
async function sendPasswordResetEmail(toEmail, resetLink) {
  const transport = createTransport();
  if (!transport) {
    throw new Error("SMTP nao configurado no ambiente");
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await transport.sendMail({
    from,
    to: toEmail,
    subject: "Recuperacao de senha - Controle de Estoque",
    text: `Recebemos uma solicitacao para redefinir sua senha. Acesse: ${resetLink}\n\nSe nao foi voce, ignore este email.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5">
        <h2>Recuperacao de senha</h2>
        <p>Recebemos uma solicitacao para redefinir sua senha.</p>
        <p><a href="${resetLink}">Clique aqui para redefinir sua senha</a></p>
        <p>Se nao foi voce, ignore este email.</p>
      </div>
    `
  });
}

module.exports = { sendPasswordResetEmail };
