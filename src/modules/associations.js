/* AUTH */
import User from "./user/user.model.js";
import Role from "./user/role.model.js";
import UserRole from "./user/userRole.model.js";

/* USER */
import UserProfile from "../modules/user/userProfile.model.js";

/* TRAVELLER */
import TravellerProfile from "./traveller/travellerProfile.model.js";
import TravellerTrip from "../modules/traveller/travellerTrip.model.js";
import AadhaarVerification from "../modules/traveller/aadhaarVerification.model.js";
import TravellerKYC from "./traveller/travellerKYC.model.js";

/* PARCEL */
import Parcel from "./parcel/parcel.model.js";
import ParcelProof from "../modules/parcel/parcelProof.model.js";

/* BOOKING */
import Booking from "../modules/booking/booking.model.js";
import BookingStatusLog from "../modules/booking/bookingStatusLog.model.js";
import PendingPayment from "../modules/booking/pendingPayment.model.js";

/* PAYMENT */
import Payment from "../modules/payment/payment.model.js";
import Wallet from "../modules/payment/wallet.model.js";
import WalletTransaction from "../modules/payment/walletTransaction.model.js";
import Refund from "../modules/payment/refund.model.js";

/* TRACKING */
import ParcelTracking from "../modules/tracking/parcelTracking.model.js";

/* FEEDBACK */
import Feedback from "../modules/feedback/feedback.model.js";

/* DISPUTE */
import Dispute from "../modules/dispute/disputes.model.js";
/* NOTIFICATION */
import Notification from "./notification/notification.model.js";

/* ADDRESS */
import Address from "./parcel/address.model.js";

// Route
import TravellerRoute from "./traveller/travellerRoute.model.js";
import RoutePlace from "./traveller/routePlace.model.js";

/* MATCHING */
import ParcelRequest from "./matching/parcelRequest.model.js";
import ParcelAcceptance from "./matching/parcelAcceptance.model.js";

/* USER DEVICE TOKENS */
import UserDeviceToken from "./user/userDeviceToken.model.js";

/* ===========================
   USER ↔ ROLE (MANY TO MANY)
   =========================== */
User.belongsToMany(Role, {
  through: UserRole,
  foreignKey: "user_id",
  otherKey: "role_id",
  onDelete: "CASCADE",
  as: "roles"
});

Role.belongsToMany(User, {
  through: UserRole,
  foreignKey: "role_id",
  otherKey: "user_id",
  onDelete: "CASCADE",
  as: "users"
});

/* ===========================
   USER ↔ USER PROFILE (1–1)
   =========================== */
User.hasOne(UserProfile, { foreignKey: "user_id", onDelete: "CASCADE", as: "profile" });
UserProfile.belongsTo(User, { foreignKey: "user_id" });

/* ===========================
   USER ↔ TRAVELLER PROFILE (1–1)
   =========================== */
User.hasOne(TravellerProfile, { foreignKey: "user_id", onDelete: "CASCADE", as: "travellerProfile" });
TravellerProfile.belongsTo(User, { foreignKey: "user_id", as: "user" });

/* ===========================
   TRAVELLER PROFILE ↔ AADHAAR (1–1)
   =========================== */
TravellerProfile.hasOne(AadhaarVerification, {
  foreignKey: "traveller_id",
  onDelete: "CASCADE",
});
AadhaarVerification.belongsTo(TravellerProfile, {
  foreignKey: "traveller_id",
});

/* ===========================
   TRAVELLER PROFILE ↔ TRIPS (1–N)
   =========================== */
TravellerProfile.hasMany(TravellerTrip, {
  foreignKey: "traveller_id",
  onDelete: "CASCADE",
});
TravellerTrip.belongsTo(TravellerProfile, {
  foreignKey: "traveller_id",
});

/* ===========================
   USER ↔ PARCEL (1–N)
   =========================== */
User.hasMany(Parcel, { foreignKey: "user_id", onDelete: "CASCADE" });
Parcel.belongsTo(User, { foreignKey: "user_id" });

/* ===========================
   PARCEL ↔ BOOKING (1–1)
   =========================== */
Parcel.hasOne(Booking, {
  foreignKey: "parcel_id",
  onDelete: "CASCADE",
  as: "booking"
});
Booking.belongsTo(Parcel, {
  foreignKey: "parcel_id",
  as: "parcel"
});

/* ===========================
   TRIP ↔ BOOKING (1–N)
   =========================== */
TravellerTrip.hasMany(Booking, {
  foreignKey: "trip_id",
  onDelete: "CASCADE",
});
Booking.belongsTo(TravellerTrip, {
  foreignKey: "trip_id",
  as: "traveller_trip"
});

/* ===========================
   TRAVELLER(USER) ↔ BOOKING (1–N)
   =========================== */
User.hasMany(Booking, {
  foreignKey: "traveller_id",
  as: "travellerBookings",
});
Booking.belongsTo(User, {
  foreignKey: "traveller_id",
  as: "traveller",
});


/* ===========================
   BOOKING ↔ STATUS LOG (1–N)
   =========================== */
Booking.hasMany(BookingStatusLog, {
  foreignKey: "booking_id",
  onDelete: "CASCADE",
});
BookingStatusLog.belongsTo(Booking, {
  foreignKey: "booking_id",
});


/* ===========================
   BOOKING ↔ PENDING PAYMENT (1–N)
   =========================== */
Booking.hasMany(PendingPayment, {
  foreignKey: "booking_id",
  onDelete: "CASCADE",
  as: "pendingPayments",
});
PendingPayment.belongsTo(Booking, {
  foreignKey: "booking_id",
  as: "booking",
});


/* ===========================
   BOOKING ↔ PAYMENT (1–1)
   =========================== */
Booking.hasOne(Payment, { foreignKey: "booking_id", onDelete: "CASCADE" });
Payment.belongsTo(Booking, { foreignKey: "booking_id" });

/* ===========================
   PAYMENT ↔ REFUND (1–1)
   =========================== */
Payment.hasOne(Refund, { foreignKey: "payment_id", onDelete: "CASCADE" });
Refund.belongsTo(Payment, { foreignKey: "payment_id" });

/* ===========================
   USER ↔ WALLET (1–1)
   =========================== */
User.hasOne(Wallet, { foreignKey: "user_id", onDelete: "CASCADE" });
Wallet.belongsTo(User, { foreignKey: "user_id" });

/* ===========================
   WALLET ↔ TRANSACTIONS (1–N)
   =========================== */
Wallet.hasMany(WalletTransaction, {
  foreignKey: "wallet_id",
  onDelete: "CASCADE",
});
WalletTransaction.belongsTo(Wallet, {
  foreignKey: "wallet_id",
});

/* ===========================
   BOOKING ↔ TRACKING (1–N)
   =========================== */
Booking.hasMany(ParcelTracking, {
  foreignKey: "booking_id",
  onDelete: "CASCADE",
});
ParcelTracking.belongsTo(Booking, {
  foreignKey: "booking_id",
});

/* ===========================
   BOOKING ↔ PARCEL PROOFS (1–N)
   =========================== */
Booking.hasMany(ParcelProof, {
  foreignKey: "booking_id",
  onDelete: "CASCADE",
});
ParcelProof.belongsTo(Booking, {
  foreignKey: "booking_id",
});


// Add associations
TravellerProfile.hasMany(TravellerRoute, {
  foreignKey: "traveller_profile_id",
  as: "routes"
});

TravellerRoute.belongsTo(TravellerProfile, {
  foreignKey: "traveller_profile_id",
  as: "travellerProfile"
});

// Phase 2: TravellerRoute ↔ Address associations
TravellerRoute.belongsTo(Address, { as: "originAddress", foreignKey: "origin_address_id" });
TravellerRoute.belongsTo(Address, { as: "destAddress", foreignKey: "dest_address_id" });
Address.hasMany(TravellerRoute, { as: "originRoutes", foreignKey: "origin_address_id" });
Address.hasMany(TravellerRoute, { as: "destRoutes", foreignKey: "dest_address_id" });

// Phase 3: TravellerRoute ↔ RoutePlace associations (Place-ID matching)
TravellerRoute.hasMany(RoutePlace, {
  foreignKey: "route_id",
  as: "places",
  onDelete: "CASCADE"
});
RoutePlace.belongsTo(TravellerRoute, {
  foreignKey: "route_id",
  as: "route"
});
// // travellerkyc

User.hasOne(TravellerKYC, {
  foreignKey: "user_id",
  as: "travellerKYC",
  onDelete: "CASCADE"
});

TravellerKYC.belongsTo(User, {
  foreignKey: "user_id",
  as: "User"
});

/* ===========================
   PARCEL ↔ ADDRESS (PICKUP & DELIVERY)
   =========================== */

Parcel.belongsTo(Address, { as: "pickupAddress", foreignKey: "pickup_address_id" });
Parcel.belongsTo(Address, { as: "deliveryAddress", foreignKey: "delivery_address_id" });
Address.hasMany(Parcel, { as: "pickupParcels", foreignKey: "pickup_address_id" });
Address.hasMany(Parcel, { as: "deliveryParcels", foreignKey: "delivery_address_id" });




export {
  User,
  Role,
  UserRole,
  UserProfile,
  TravellerProfile,
  TravellerTrip,
  AadhaarVerification,
  TravellerKYC,
  Parcel,
  ParcelProof,
  Booking,
  BookingStatusLog,
  Payment,
  Wallet,
  WalletTransaction,
  Refund,
  ParcelTracking,
  Address,
  TravellerRoute,
  RoutePlace,
  ParcelRequest,
  ParcelAcceptance,
  UserDeviceToken,
  Feedback,
  Notification,
  Dispute,
};



/* ===========================
   PHASE 3: PARCEL REQUEST & ACCEPTANCE
   =========================== */

// ParcelRequest ↔ Parcel (N-1)
ParcelRequest.belongsTo(Parcel, { foreignKey: "parcel_id", as: "parcel" });
Parcel.hasMany(ParcelRequest, { foreignKey: "parcel_id", as: "requests" });

// ParcelRequest ↔ TravellerRoute (N-1)
ParcelRequest.belongsTo(TravellerRoute, { foreignKey: "route_id", as: "route" });
TravellerRoute.hasMany(ParcelRequest, { foreignKey: "route_id", as: "parcelRequests" });

// ParcelRequest ↔ User (N-1) - for traveller
ParcelRequest.belongsTo(User, { foreignKey: "traveller_id", as: "traveller" });
User.hasMany(ParcelRequest, { foreignKey: "traveller_id", as: "parcelRequests" });

// ParcelAcceptance ↔ ParcelRequest (1-1)
ParcelAcceptance.belongsTo(ParcelRequest, { foreignKey: "parcel_request_id", as: "request" });
ParcelRequest.hasOne(ParcelAcceptance, { foreignKey: "parcel_request_id", as: "acceptance" });

// ParcelAcceptance ↔ Parcel (N-1)
ParcelAcceptance.belongsTo(Parcel, { foreignKey: "parcel_id", as: "parcel" });
Parcel.hasMany(ParcelAcceptance, { foreignKey: "parcel_id", as: "acceptances" });

// ParcelAcceptance ↔ User (N-1) - for traveller
ParcelAcceptance.belongsTo(User, { foreignKey: "traveller_id", as: "traveller" });
User.hasMany(ParcelAcceptance, { foreignKey: "traveller_id", as: "acceptedParcels" });

/* ===========================
   USER ↔ DEVICE TOKENS (1–N)
   =========================== */
User.hasMany(UserDeviceToken, { foreignKey: "user_id", onDelete: "CASCADE", as: "deviceTokens" });
UserDeviceToken.belongsTo(User, { foreignKey: "user_id", as: "user" });

/* ===========================
   FEEDBACK ASSOCIATIONS
   =========================== */

// Feedback ↔ Booking (1-1)
// One booking can have at most one feedback (unique constraint on booking_id)
// hasOne on Booking side means: "a booking has one feedback"
Booking.hasOne(Feedback, { foreignKey: "booking_id", as: "feedback", onDelete: "CASCADE" });
Feedback.belongsTo(Booking, { foreignKey: "booking_id", as: "booking" });

// Feedback ↔ Parcel (N-1)
// Many feedbacks could reference the same parcel (recurring scenario)
// but in practice it's 1-1 since booking_id is unique
Parcel.hasMany(Feedback, { foreignKey: "parcel_id", as: "feedbacks" });
Feedback.belongsTo(Parcel, { foreignKey: "parcel_id", as: "parcel" });

// Feedback ↔ TravellerProfile (N-1)
// A traveller can receive many feedbacks over time
TravellerProfile.hasMany(Feedback, { foreignKey: "traveller_id", as: "feedbacks" });
Feedback.belongsTo(TravellerProfile, { foreignKey: "traveller_id", as: "travellerProfile" });

// Feedback ↔ User (reviewer) (N-1)
// A user can submit feedback for multiple deliveries
User.hasMany(Feedback, { foreignKey: "user_id", as: "submittedFeedbacks" });
Feedback.belongsTo(User, { foreignKey: "user_id", as: "reviewer" });

/* ===========================
   USER ↔ NOTIFICATIONS (1–N)
   =========================== */
User.hasMany(Notification, { foreignKey: "user_id", onDelete: "CASCADE", as: "notifications" });
Notification.belongsTo(User, { foreignKey: "user_id", as: "user" });

/* ===========================
   DISPUTE ASSOCIATIONS (1–N)
   =========================== */
// Dispute ↔ Booking (N-1)
Dispute.belongsTo(Booking, { foreignKey: "booking_id", as: "booking" });
Booking.hasMany(Dispute, { foreignKey: "booking_id", as: "disputes", onDelete: "CASCADE" });

// Dispute ↔ User (raised_by) (N-1)
Dispute.belongsTo(User, { foreignKey: "raised_by", as: "raisedBy" });
User.hasMany(Dispute, { foreignKey: "raised_by", as: "raisedDisputes", onDelete: "CASCADE" });
