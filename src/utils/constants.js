
export const ROLES = {
  INDIVIDUAL: "INDIVIDUAL",
  TRAVELLER: "TRAVELLER",
  ADMIN: "ADMIN"
};

export const KYC_STATUS = {
  NOT_STARTED: "NOT_STARTED",
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED"
};

export const KYC_TRANSITIONS = {
  NOT_STARTED: ["PENDING"],
  PENDING: ["APPROVED", "REJECTED"],
  APPROVED: [],
  REJECTED: [],
};

export const BOOKING_STATUS = {
  CREATED: "CREATED",
  MATCHING: "MATCHING",
  CONFIRMED: "CONFIRMED",
  PICKUP: "PICKUP",
  IN_TRANSIT: "IN_TRANSIT",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED"
};

/* Allowed booking status transitions */
export const BOOKING_TRANSITIONS = {
  CREATED:    ["CONFIRMED", "CANCELLED"],
  MATCHING:   ["CONFIRMED", "CANCELLED"],
  CONFIRMED:  ["PICKUP", "IN_TRANSIT", "CANCELLED"],
  PICKUP:     ["IN_TRANSIT", "CANCELLED"],
  IN_TRANSIT: ["DELIVERED"],
  DELIVERED:  [],
  CANCELLED:  [],
};

export const PARCEL_STATUS = {
  CREATED:          "CREATED",
  MATCHING:         "MATCHING",
  PARTNER_SELECTED: "PARTNER_SELECTED",
  CONFIRMED:        "CONFIRMED",
  PICKUP:           "PICKUP",
  IN_TRANSIT:       "IN_TRANSIT",
  DELIVERED:        "DELIVERED",
  CANCELLED:        "CANCELLED",
};

/* Allowed parcel status transitions */
export const PARCEL_TRANSITIONS = {
  CREATED:          ["MATCHING", "PARTNER_SELECTED", "CONFIRMED", "CANCELLED"],
  MATCHING:         ["PARTNER_SELECTED", "CONFIRMED", "CANCELLED"],
  PARTNER_SELECTED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED:        ["PICKUP", "IN_TRANSIT", "CANCELLED"],
  PICKUP:           ["IN_TRANSIT", "CANCELLED"],
  IN_TRANSIT:       ["DELIVERED"],
  DELIVERED:        [],
  CANCELLED:        [],
};

export const PAYMENT_STATUS = {
  CREATED:  "CREATED",
  PENDING:  "PENDING",
  SUCCESS:  "SUCCESS",
  FAILED:   "FAILED",
  REFUNDED: "REFUNDED"
};

/* Allowed payment status transitions */
export const PAYMENT_TRANSITIONS = {
  CREATED:  ["PENDING", "FAILED"],
  PENDING:  ["SUCCESS", "FAILED"],
  SUCCESS:  ["REFUNDED"],
  FAILED:   [],
  REFUNDED: [],
};

// ─── Transition guard ─────────────────────────────────────────────────────────
/**
 * Assert that a status transition is valid.
 * Throws an AppError-style Error (with a .statusCode property) if not.
 *
 * @param {string} current   - Current status value
 * @param {string} next      - Desired next status value
 * @param {object} map       - Transition map (e.g. BOOKING_TRANSITIONS)
 * @param {string} [entity]  - Label for the error message (e.g. "Booking")
 *
 * @example
 *   assertValidTransition(booking.status, "DELIVERED", BOOKING_TRANSITIONS, "Booking");
 */
export function assertValidTransition(current, next, map, entity = "Record") {
  const allowed = map[current];

  if (allowed === undefined) {
    const err = new Error(`${entity} has unknown status: "${current}"`);
    err.statusCode = 400;
    throw err;
  }

  if (!allowed.includes(next)) {
    const err = new Error(
      `${entity}: cannot transition from "${current}" to "${next}". ` +
      (allowed.length
        ? `Allowed next statuses: ${allowed.map((s) => `"${s}"`).join(", ")}.`
        : `"${current}" is a terminal status — no further transitions allowed.`)
    );
    err.statusCode = 400;
    throw err;
  }
}
