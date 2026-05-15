/**
 * Audit logging utility.
 *
 * Writes structured audit entries to the application logger (console in dev,
 * file/external service in prod). Each entry includes:
 *   - timestamp
 *   - actor (user ID + role)
 *   - action (e.g. "PAYMENT_VERIFIED", "KYC_APPROVED")
 *   - resource (entity type + ID)
 *   - metadata (any extra context)
 *   - ip address
 *   - request ID (if available)
 *
 * Non-fatal — a logging failure must never break the operation being audited.
 */

export function auditLog({ action, actorId, actorRole, resourceType, resourceId, meta = {}, req = null }) {
  try {
    const entry = {
      timestamp:    new Date().toISOString(),
      action,
      actor: {
        id:   actorId   || "system",
        role: actorRole || "system",
      },
      resource: {
        type: resourceType,
        id:   resourceId,
      },
      meta,
      ip:         req?.ip || req?.headers?.["x-forwarded-for"] || null,
      request_id: req?.headers?.["x-request-id"] || null,
    };

    // In production, send to external logging service (Datadog, CloudWatch, etc.)
    // For now, write to stdout in a structured format that log aggregators can parse.
    console.log(`[AUDIT] ${JSON.stringify(entry)}`);
  } catch (err) {
    // Never let audit logging break the main operation
    console.warn("[Audit] Failed to write audit log:", err.message);
  }
}
