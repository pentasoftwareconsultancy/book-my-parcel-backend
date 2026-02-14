
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

export const BOOKING_STATUS = {
  CREATED: "CREATED",
  MATCHING: "MATCHING",
  CONFIRMED: "CONFIRMED",
  IN_TRANSIT: "IN_TRANSIT",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED"
};



// for role confirmation

export const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }
    next();
  };
};
