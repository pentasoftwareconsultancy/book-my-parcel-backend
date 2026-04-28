/**
 * Input sanitization middleware.
 * Strips null bytes and trims string values in req.body recursively.
 * Does NOT strip HTML — React already escapes on render.
 * Runs after body-parser, before routes.
 */

function sanitizeValue(value) {
  if (typeof value === "string") {
    // Remove null bytes (common in injection attacks)
    return value.replace(/\0/g, "").trim();
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value !== null && typeof value === "object") {
    return sanitizeObject(value);
  }
  return value;
}

function sanitizeObject(obj) {
  const result = {};
  for (const key of Object.keys(obj)) {
    result[key] = sanitizeValue(obj[key]);
  }
  return result;
}

export function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeObject(req.body);
  }
  next();
}
