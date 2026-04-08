
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
  IN_TRANSIT: "IN_TRANSIT",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED"
};


/* Allowed transitions */
export const BOOKING_TRANSITIONS = {
  CREATED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["IN_TRANSIT", "CANCELLED"],
  IN_TRANSIT: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: []
};

// for role confirmation

export const PAYMENT_STATUS = {
  CREATED: "CREATED",     // Order created
  PENDING: "PENDING",     // Waiting payment
  SUCCESS: "SUCCESS",     // Paid successfully
  FAILED: "FAILED",       // Payment failed
  REFUNDED: "REFUNDED"    // Optional future use
};

/* Allowed transitions */
export const PAYMENT_TRANSITIONS = {
  CREATED: ["PENDING", "FAILED"],
  PENDING: ["SUCCESS", "FAILED"],
  SUCCESS: ["REFUNDED"],
  FAILED: [],
  REFUNDED: []
};
