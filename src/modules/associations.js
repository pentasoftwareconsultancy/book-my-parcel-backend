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

/* PAYMENT */
import Payment from "../modules/payment/payment.model.js";
import Wallet from "../modules/payment/wallet.model.js";
import WalletTransaction from "../modules/payment/walletTransaction.model.js";
import Refund from "../modules/payment/refund.model.js";

/* TRACKING */
import ParcelTracking from "../modules/tracking/parcelTracking.model.js";

/* ADDRESS */
import Address from "./parcel/address.model.js";

// Route
import TravellerRoute from "./traveller/travellerRoute.model.js";

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
  onDelete: "CASCADE"
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
  Address
};


