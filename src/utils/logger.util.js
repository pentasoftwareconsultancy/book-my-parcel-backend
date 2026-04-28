/**
 * Structured logger utility.
 * In production, logs are JSON for easy parsing by log aggregators.
 * In development, logs are human-readable.
 */

const isDev = process.env.NODE_ENV !== "production";

function formatMessage(level, message, meta = {}) {
  if (isDev) {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `[${level.toUpperCase()}] ${message}${metaStr}`;
  }
  return JSON.stringify({
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  });
}

export const logger = {
  info:  (msg, meta) => console.log(formatMessage("info",  msg, meta)),
  warn:  (msg, meta) => console.warn(formatMessage("warn",  msg, meta)),
  error: (msg, meta) => console.error(formatMessage("error", msg, meta)),
  debug: (msg, meta) => { if (isDev) console.log(formatMessage("debug", msg, meta)); },
};

export default logger;
