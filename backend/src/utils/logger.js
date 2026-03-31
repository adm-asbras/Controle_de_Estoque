const winston = require("winston");

const isDevelopment = process.env.NODE_ENV !== "production";
const resolvedLevel = process.env.LOG_LEVEL || (isDevelopment ? "debug" : "info");

const developmentFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...meta } = info;
    const metadata = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `${timestamp} ${level}: ${message}${metadata}`;
  })
);

const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const logger = winston.createLogger({
  level: resolvedLevel,
  format: isDevelopment ? developmentFormat : productionFormat,
  defaultMeta: { service: "estoque-backend" },
  transports: [new winston.transports.Console()]
});

module.exports = { logger };
