
import { Op } from "sequelize";
import TravellerKYC from "./travellerKYC.model.js";
import TravellerRoute from "./travellerRoute.model.js";
import User from "../user/user.model.js";
import UserProfile from "../user/userProfile.model.js";
import Booking from "../booking/booking.model.js";
import Parcel from "../parcel/parcel.model.js";
import Address from "../parcel/address.model.js";
import ParcelRequest from "../matching/parcelRequest.model.js";
import { to12h } from "../../utils/time.util.js";
import sequelize from "../../config/database.config.js";
import {
  KYC_STATUS,
  BOOKING_TRANSITIONS,
  PARCEL_TRANSITIONS,
  assertValidTransition,
} from "../../utils/constants.js";
import { getPagination, getPagingData } from "../../utils/pagination.js";
import PendingPayment from "../booking/pendingPayment.model.js";
import { invalidateKycCache } from "../../redis/cache/kycStatusCache.service.js";
import otpService from "../../redis/services/otp.service.js";
import twilioService from "../../services/twilio.service.js";



/* ─────────────────────────────
   GET ALL KYC (ADMIN)
───────────────────────────── */
export const getAllKYCs = async (query = {}) => {
  const { getPagination, getPagingData } = await import("../../utils/pagination.js");
  const { page = 1, limit = 10 } = query;
  const { limit: parsedLimit, offset, page: parsedPage } = getPagination(page, limit);

  const result = await TravellerKYC.findAndCountAll({
    order: [["createdAt", "DESC"]],
    limit: parsedLimit,
    offset,
  });

  return getPagingData(result, parsedPage, parsedLimit);
};


/* ─────────────────────────────
   UPDATE KYC STATUS (ADMIN)
───────────────────────────── */
export const updateKYCStatus = async (kycId, status) => {

  const kyc = await TravellerKYC.findByPk(kycId);
  if (!kyc) throw new Error("KYC record not found");

  if (!Object.values(KYC_STATUS).includes(status)) {
    throw new Error("Invalid status value");
  }

  await kyc.update({ status });

  // Invalidate KYC cache
  const travellerProfile = await TravellerProfile.findOne({ where: { user_id: kyc.user_id } });
  if (travellerProfile) {
    await invalidateKycCache(travellerProfile.id);
  }

  return kyc;
};


/* ─────────────────────────────
   FETCH TRAVELLER DELIVERIES  ✅ NEW
───────────────────────────── */

export async function fetchTravellerDeliveries(travellerUserId, query) {
  const { status, page = 1, limit = 10 } = query;

  // ✅ Status filter
  const whereClause = { traveller_id: travellerUserId };
  if (status) {
    const statusArray = status.split(",").map(s => s.trim());
    whereClause.status = { [Op.in]: statusArray };
  }

  // ✅ Use common pagination
  const { limit: parsedLimit, offset, page: parsedPage } = getPagination(page, limit);

  // ✅ DB query
  const result = await Booking.findAndCountAll({
    where: whereClause,
    include: [
      {
        model: Parcel,
        as: "parcel",
        required: true,
        include: [
          {
            model: Address,
            as: "pickupAddress",
            attributes: ["city", "address", "state"],
          },
          {
            model: Address,
            as: "deliveryAddress",
            attributes: ["city", "address", "state"],
          },
          {
            model: User,
            as: "user",
            attributes: ["id", "phone_number"],
            include: [
              {
                model: UserProfile,
                as: "profile",
                attributes: ["name"],
              },
            ],
          },
        ],
      },
    ],
    order: [["createdAt", "DESC"]],
    limit: parsedLimit, // ✅ FIXED
    offset,             // ✅ FIXED
  });

  // ✅ Fetch detour & transport_mode from ParcelRequest for all bookings in one query
  const parcelIds = result.rows.map(b => b.parcel_id);
  const parcelRequests = parcelIds.length
    ? await ParcelRequest.findAll({
      where: { parcel_id: { [Op.in]: parcelIds }, traveller_id: travellerUserId },
      attributes: ["parcel_id", "detour_km", "detour_percentage", "route_id"],
      include: [{
        model: TravellerRoute,
        as: "route",
        attributes: ["transport_mode"],
        required: false,
      }],
    })
    : [];

  // Build a lookup map by parcel_id
  const requestMap = {};
  parcelRequests.forEach(pr => { requestMap[pr.parcel_id] = pr; });

  // ✅ Transform data
  const deliveries = result.rows.map(booking => {
    const parcel = booking.parcel;
    const sender = parcel?.user;
    const pr = requestMap[booking.parcel_id];

    return {
      id: booking.id,
      parcelId: parcel?.id,
      booking_ref: booking.booking_ref || `TEMP-${booking.id.substring(0, 8).toUpperCase()}`,
      parcel_ref: parcel?.parcel_ref || `BMP-${booking.id.substring(0, 3)}`,
      tracking_ref: booking.tracking_ref || `UBG-${booking.id.substring(0, 3)}`,
      bookingId: booking.booking_ref || `TEMP-${booking.id.substring(0, 8).toUpperCase()}`,
      trackingId: booking.tracking_ref || `TEMP-${booking.id.substring(0, 12).toUpperCase()}`,
      status: booking.status,
      customer: sender?.profile?.name || "Unknown Customer",
      customerPhone: sender?.phone_number || "",
      pickup: {
        city: parcel?.pickupAddress?.city || "",
        address: parcel?.pickupAddress?.address || "",
        state: parcel?.pickupAddress?.state || "",
      },
      drop: {
        city: parcel?.deliveryAddress?.city || "",
        address: parcel?.deliveryAddress?.address || "",
        state: parcel?.deliveryAddress?.state || "",
      },
      amount: parcel?.price_quote || 0,
      earnings: parcel?.price_quote || 0,
      bookedDate: booking.createdAt.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      package: {
        size: parcel?.package_size || "Medium",
        weight: `${parcel?.weight || 0} kg`,
        type: parcel?.parcel_type || "Standard",
      },
      weight: `${parcel?.weight || 0} kg`,
      parcelRef: parcel?.parcel_ref || "",
      urgent: parcel?.is_urgent || false,
      specialInstructions: parcel?.special_instructions || "",
      estimatedDeliveryTime: parcel?.estimated_delivery_time || "",
      assignedDate: booking.assigned_date,
      bookingRef: booking.booking_ref || "",
      paymentMode: booking.payment_mode || "PAY_NOW",
      // ✅ Detour & transport mode from linked ParcelRequest
      detour_km: pr ? Math.max(1, parseFloat(pr.detour_km) || 5) : 5, // Minimum 1km, default 5km
      detour_percentage: pr ? Math.max(1, parseFloat(pr.detour_percentage) || 10) : 10, // Minimum 1%, default 10%
      transport_mode: pr?.route?.transport_mode || "private",
      // OTP information
      pickup_otp: booking.pickup_otp || null,
      delivery_otp: booking.delivery_otp || null,
      pickupOTP: booking.pickup_otp || null,
      deliveryOTP: booking.delivery_otp || null,
    };
  });

  // ✅ Pagination (common util)
  const pagination = getPagingData(result, parsedPage, parsedLimit);

  return {
    deliveries,
    pagination,
  };
}

export async function fetchTravellerParcelRequests(travellerUserId, query = {}) {
  try {
    const { status, page = 1, limit = 10 } = query;

    // ✅ Where clause
    const whereClause = { traveller_id: travellerUserId };
    if (status) {
      const statusArray = status.split(",").map(s => s.trim());
      whereClause.status = { [Op.in]: statusArray };
    }

    // ✅ Common pagination
    const { limit: parsedLimit, offset, page: parsedPage } = getPagination(page, limit);

    // ✅ DB query - Get all requests first
    const allRequests = await ParcelRequest.findAll({
      where: whereClause,
      include: [
        {
          model: Parcel,
          as: "parcel",
          required: true,
          include: [
            {
              model: Address,
              as: "pickupAddress",
              attributes: ["city", "address", "state"],
            },
            {
              model: Address,
              as: "deliveryAddress",
              attributes: ["city", "address", "state"],
            },
            {
              model: User,
              as: "user",
              attributes: ["id", "phone_number"],
              include: [
                {
                  model: UserProfile,
                  as: "profile",
                  attributes: ["name"],
                },
              ],
            },
          ],
        },
        {
          model: TravellerRoute,
          as: "route",
          required: true, // exclude requests with no route
          where: {
            // Only show requests for routes that haven't departed yet.
            // Routes with null departure_date (recurring or undated) are always shown.
            [Op.or]: [
              { departure_date: null },
              { is_recurring: true },
              { departure_date: { [Op.gt]: new Date().toISOString().slice(0, 10) } },
              {
                departure_date: new Date().toISOString().slice(0, 10),
                departure_time: { [Op.gt]: new Date().toTimeString().slice(0, 8) },
              },
            ],
          },
          attributes: ["id", "vehicle_type", "max_weight_kg", "status", "departure_date", "departure_time", "arrival_date", "arrival_time", "is_recurring"],
          include: [
            {
              model: Address,
              as: "originAddress",
              attributes: ["city", "state"],
            },
            {
              model: Address,
              as: "destAddress",
              attributes: ["city", "state"],
            },
          ],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    // ✅ Group by parcel_id and keep only the best match (lowest detour)
    const parcelMap = new Map();
    for (const request of allRequests) {
      const parcelId = request.parcel?.id;
      if (!parcelId) continue;

      const existing = parcelMap.get(parcelId);
      if (!existing || (request.detour_km && (!existing.detour_km || request.detour_km < existing.detour_km))) {
        parcelMap.set(parcelId, request);
      }
    }

    // ✅ Convert to array and apply pagination
    const uniqueRequests = Array.from(parcelMap.values());
    const totalCount = uniqueRequests.length;
    const paginatedRequests = uniqueRequests.slice(offset, offset + parsedLimit);

    // ✅ Transform
    const requests = paginatedRequests.map(request => {
      const parcel = request.parcel;
      const sender = parcel?.user;

      return {
        id: request.id,
        parcelId: parcel?.id,
        // ✅ Use consistent field names that frontend expects
        parcel_ref: parcel?.parcel_ref || `BMP-${request.id.substring(0, 3)}`,
        requestId: `REQ${request.id.substring(0, 8).toUpperCase()}`,
        status: request.status,
        customer: sender?.profile?.name || "Unknown Customer",
        customerPhone: sender?.phone_number || "",
        pickup: {
          city: parcel?.pickupAddress?.city || "",
          address: parcel?.pickupAddress?.address || "",
          state: parcel?.pickupAddress?.state || "",
        },
        drop: {
          city: parcel?.deliveryAddress?.city || "",
          address: parcel?.deliveryAddress?.address || "",
          state: parcel?.deliveryAddress?.state || "",
        },
        amount: parcel?.price_quote || 0,
        earnings: parcel?.price_quote || 0, // ✅ Add earnings field
        sentDate: request.sent_at?.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        respondedDate: request.responded_at?.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        package: {
          size: parcel?.package_size || "Medium",
          weight: `${parcel?.weight || 0} kg`,
          type: parcel?.parcel_type || "Standard",
        },
        weight: `${parcel?.weight || 0} kg`, // ✅ Add top-level weight field
        matchScore: request.match_score,
        detourKm: request.detour_km,
        detour_km: Math.max(1, parseFloat(request.detour_km) || 8), // Minimum 1km, default 8km
        detourPercentage: request.detour_percentage,
        detour_percentage: Math.max(1, parseFloat(request.detour_percentage) || 15), // Minimum 1%, default 15%
        expiresAt: request.expires_at,
        route: {
          id: request.route?.id,
          vehicleType: request.route?.vehicle_type,
          maxWeight: request.route?.max_weight_kg,
          status: request.route?.status,
          departure_date: request.route?.departure_date,
          departure_time: to12h(request.route?.departure_time),
          arrival_date: request.route?.arrival_date,
          arrival_time: to12h(request.route?.arrival_time),
          origin: request.route?.originAddress
            ? `${request.route.originAddress.city}, ${request.route.originAddress.state}`
            : "Unknown Origin",
          destination: request.route?.destAddress
            ? `${request.route.destAddress.city}, ${request.route.destAddress.state}`
            : "Unknown Destination",
        },
        parcelRef: parcel?.parcel_ref || "", // ✅ Keep for backward compatibility
        urgent: parcel?.is_urgent || false,
        specialInstructions: parcel?.special_instructions || "",
      };
    });

    // ✅ Pagination (manual calculation for unique parcels)
    const pagination = {
      currentPage: parsedPage,
      totalPages: Math.ceil(totalCount / parsedLimit),
      totalItems: totalCount,
      itemsPerPage: parsedLimit,
      hasNextPage: parsedPage < Math.ceil(totalCount / parsedLimit),
      hasPrevPage: parsedPage > 1,
    };

    return {
      requests,
      pagination,
    };
  } catch (error) {
    console.error("Error in fetchTravellerParcelRequests:", error);
    throw error;
  }
}


/* ─────────────────────────────
   FETCH TRAVELLER STATS  ✅ NEW
───────────────────────────── */
export async function fetchTravellerStats(travellerUserId) {

  // Get platform fee percentage for calculations
  const { getPlatformFeePercent } = await import("../../redis/cache/platformSettingsCache.service.js");
  const platformFeePercent = await getPlatformFeePercent();

  // Get all bookings for status counts
  const bookings = await Booking.findAll({
    where: { traveller_id: travellerUserId },
    attributes: ["id", "status", "createdAt", "delivered_at"],
    include: [{
      model: Parcel,
      as: "parcel",
      attributes: ["price_quote"],
      required: false,
    }],
  });

  // Get actual wallet balance and all transactions
  const { getWalletBalanceService } = await import("../payment/wallet.service.js");
  const WalletTransaction = (await import("../payment/walletTransaction.model.js")).default;
  const Wallet = (await import("../payment/wallet.model.js")).default;

  const walletData = await getWalletBalanceService(travellerUserId);
  const actualWalletBalance = walletData.balance || 0;

  // Get wallet to fetch all transactions
  const wallet = await Wallet.findOne({ where: { user_id: travellerUserId } });

  let totalEarnings = 0;
  let todayEarnings = 0;

  if (wallet) {
    // Calculate total earnings from all CREDIT transactions
    const allCredits = await WalletTransaction.findAll({
      where: {
        wallet_id: wallet.id,
        type: 'CREDIT'
      },
      attributes: ['amount', 'createdAt']
    });

    totalEarnings = allCredits.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);

    // Calculate today's earnings from CREDIT transactions
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayCredits = allCredits.filter(tx => {
      const txDate = new Date(tx.createdAt);
      return txDate >= today && txDate < tomorrow;
    });

    todayEarnings = todayCredits.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
  }

  const stats = {
    totalDeliveries: bookings.length,
    active: 0,
    completed: 0,
    cancelled: 0,
    totalEarnings: totalEarnings,      // Total from all CREDIT transactions
    earningsInWallet: actualWalletBalance,  // Actual wallet balance (total credits - debits)
    earningsPending: 0,     // No longer used (PAD removed)
    rating: 4.8,    // static for now
  };

  // Count booking statuses
  bookings.forEach(booking => {
    const status = booking.status;

    if (["CREATED", "MATCHING", "CONFIRMED", "IN_TRANSIT"].includes(status)) {
      stats.active += 1;
    } else if (status === "DELIVERED") {
      stats.completed += 1;
    } else if (status === "CANCELLED") {
      stats.cancelled += 1;
    }
  });

  stats.todayEarnings = todayEarnings;

  console.log(`[fetchTravellerStats] Stats calculated:`, {
    totalDeliveries: stats.totalDeliveries,
    active: stats.active,
    completed: stats.completed,
    totalEarnings: stats.totalEarnings,
    earningsInWallet: stats.earningsInWallet,
    todayEarnings: stats.todayEarnings,
    platformFeePercent: platformFeePercent,
  });

  return stats;
}


/* ─────────────────────────────
   FETCH TRAVELLER BOOKING DETAILS  ✅ NEW
───────────────────────────── */
export async function fetchTravellerBookingDetails(travellerUserId, bookingId) {
  // ✅ Get booking with all details — verify traveller owns this booking
  const booking = await Booking.findOne({
    where: {
      id: bookingId,
      traveller_id: travellerUserId  // ✅ Security: only fetch own bookings
    },
    include: [
      {
        model: Parcel,
        as: "parcel",
        include: [
          {
            model: Address,
            as: "pickupAddress",
            attributes: ["id", "city", "address", "state", "pincode"],
          },
          {
            model: Address,
            as: "deliveryAddress",
            attributes: ["id", "city", "address", "state", "pincode"],
          },
          {
            model: User,
            as: "user",
            attributes: ["id", "phone_number"],
            include: [{
              model: UserProfile,
              as: "profile",
              attributes: ["name", "avatar_url"],
            }],
          },
        ],
      },
      {
        model: TravellerTrip,
        as: "traveller_trip",
        required: false,
        attributes: [
          "id",
          "source_city",
          "destination_city",
          "available_weight",
          "status",
        ],
      },
    ],
  });

  if (!booking) {
    throw new Error("Booking not found or not assigned to this traveller");
  }

  const parcel = booking.parcel;
  const user = parcel?.user;
  const trip = booking.traveller_trip;

  return {
    id: booking.id,
    deliveryId: booking.id,  // ✅ For compatibility
    booking_ref: booking.booking_ref || `BMP${booking.id.substring(0, 8).toUpperCase()}`,
    parcel_ref: booking.parcel_ref || `P${parcel?.id?.substring(0, 6).toUpperCase() || 'UNKNOWN'}`,
    tracking_ref: booking.tracking_ref || `UBG-${booking.id.substring(0, 12).toUpperCase()}`,
    status: booking.status,
    bookedDate: booking.createdAt?.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }) || "",
    amount: parcel?.price_quote || 0,
    pickup: {
      city: parcel?.pickupAddress?.city || "",
      address: parcel?.pickupAddress?.address || "",
      state: parcel?.pickupAddress?.state || "",
      pincode: parcel?.pickupAddress?.pincode || "",
    },
    delivery: {
      city: parcel?.deliveryAddress?.city || "",
      address: parcel?.deliveryAddress?.address || "",
      state: parcel?.deliveryAddress?.state || "",
      pincode: parcel?.deliveryAddress?.pincode || "",
    },
    user: user ? {
      id: user.id,
      name: user.profile?.name || "Unknown",
      phone: user.phone_number || "—",
      avatar_url: user.profile?.avatar_url || null,
    } : {
      id: null,
      name: "Unknown",
      phone: "—",
      avatar_url: null,
    },
    parcel: parcel ? {
      id: `P${parcel.id.substring(0, 6).toUpperCase()}`,
      package_size: parcel.package_size || null,
      weight: parcel.weight || null,
      length: parcel.length || null,
      width: parcel.width || null,
      height: parcel.height || null,
      description: parcel.description || null,
      parcel_type: parcel.parcel_type || null,
      value: parcel.value || null,
      notes: parcel.notes || null,
      price_quote: parcel.price_quote || 0,
    } : {},
    trip: trip ? {
      id: trip.id,
      source_city: trip.source_city || "",
      destination_city: trip.destination_city || "",
      available_weight: trip.available_weight || 0,
      status: trip.status || "",
    } : null,
  };
}


/* ─────────────────────────────
   DELIVERY STATUS TRANSITIONS & OTP  ✅ NEW
───────────────────────────── */

/**
 * Generate OTP for pickup/delivery verification.
 * OTP is stored hashed in Redis (TTL 5 min) — NOT in the database.
 * Raw OTP is sent to the customer via SMS.
 */
export async function generateOTP(bookingId, type) {
  const booking = await Booking.findByPk(bookingId, {
    include: [{
      model: Parcel,
      as: "parcel",
      include: [{
        model: User,
        as: "user",
        attributes: ["phone_number"],
      }],
    }],
  });

  if (!booking) throw new Error("Booking not found");

  const customerPhone = booking.parcel?.user?.phone_number;
  if (!customerPhone) {
    throw new Error("Customer phone number not found for OTP generation");
  }

  // Store hashed OTP in Redis — returns raw OTP for SMS delivery
  const rawOTP = await otpService.storeOTP(customerPhone, type);

  // Send OTP via SMS to the customer (best-effort, non-fatal)

  if (customerPhone) {
    try {
      if (type === "pickup") {
        await twilioService.sendPickupOTP(
          customerPhone,
          rawOTP,
          booking.booking_ref || bookingId,
          "Your traveller"
        );
      } else {
        await twilioService.sendDeliveryOTP(
          customerPhone,
          rawOTP,
          booking.booking_ref || bookingId,
          "Your traveller"
        );
      }
    } catch (smsErr) {
      console.warn(`[generateOTP] SMS send failed (non-fatal): ${smsErr.message}`);
    }
  }

  console.log(`[generateOTP] OTP generated for booking ${bookingId} type=${type}`);

  // Never return the raw OTP in the response — it was sent via SMS
  return { message: `OTP sent to customer via SMS`, expiresIn: 300 };
}

/**
 * Verify OTP and update booking status
 */
export async function verifyOTPAndUpdateStatus(bookingId, otp, type, travellerUserId) {
  const booking = await Booking.findByPk(bookingId, {
    include: [{
      model: Parcel,
      as: "parcel",
      required: true,
      include: [{
        model: User,
        as: "user",
        attributes: ["phone_number"],
      }]
    }]
  });

  if (!booking) {
    throw new Error("Booking not found");
  }

  if (booking.traveller_id !== travellerUserId) {
    throw new Error("Unauthorized: Not your booking");
  }

  const customerPhone = booking.parcel?.user?.phone_number;
  if (!customerPhone) {
    throw new Error("Customer phone number not found for OTP verification");
  }

  // ── Verify OTP via Redis (hashed comparison) ──────────────────────────────
  const verification = await otpService.verifyOTP(customerPhone, type, otp);
  if (!verification.success) {
    throw new Error(verification.reason || "Invalid OTP");
  }

  // ── Validate status transition ─────────────────────────────────────────────
  let newStatus;
  if (type === "pickup") {
    if (booking.status !== "PICKUP") {
      throw new Error("Invalid status transition for pickup OTP");
    }
    newStatus = "IN_TRANSIT";
  } else if (type === "delivery") {
    if (booking.status !== "IN_TRANSIT") {
      throw new Error("Invalid status transition for delivery OTP");
    }
    newStatus = "DELIVERED";
  } else {
    throw new Error("Invalid OTP type");
  }

  // ── Update booking and parcel status ──────────────────────────────────────
  await Promise.all([
    booking.update({ status: newStatus }),
    booking.parcel.update({ status: newStatus }),
  ]);

  console.log(`✅ ${type} OTP verified - Status updated to ${newStatus}`);

  return {
    success: true,
    newStatus,
    message: `${type === 'pickup' ? 'Pickup' : 'Delivery'} confirmed successfully`
  };
}

/**
 * Update booking status (for non-OTP transitions)
 */
export async function updateBookingStatus(bookingId, newStatus, travellerUserId) {
  const booking = await Booking.findByPk(bookingId, {
    include: [{
      model: Parcel,
      as: "parcel",
      required: true,
      include: [{
        model: User,
        as: "user",
        attributes: ["phone_number"],
      }]
    }]
  });

  if (!booking) {
    throw new Error("Booking not found");
  }

  if (booking.traveller_id !== travellerUserId) {
    throw new Error("Unauthorized: Not your booking");
  }

  const currentStatus = booking.status;

  // Use the shared transition guard — single source of truth
  assertValidTransition(currentStatus, newStatus, BOOKING_TRANSITIONS, "Booking");

  // Also validate the parcel transition
  assertValidTransition(booking.parcel.status, newStatus, PARCEL_TRANSITIONS, "Parcel");

  // For PICKUP status, pre-generate both OTPs in Redis
  let otpData = null;
  if (newStatus === "PICKUP") {
    const customerPhone = booking.parcel?.user?.phone_number;
    if (!customerPhone) {
      throw new Error("Customer phone number not found for OTP generation");
    }

    // Store both OTPs in Redis — raw values are delivered by the separate SMS flow
    await Promise.all([
      otpService.storeOTP(customerPhone, "pickup"),
      otpService.storeOTP(customerPhone, "delivery"),
    ]);

    await booking.update({ status: newStatus });

    // OTPs are NOT returned in the API response — they are sent via SMS
    otpData = { message: "OTPs generated and sent to customer via SMS", expiresIn: 300 };

    console.log(`[updateBookingStatus] OTPs stored in Redis for booking ${bookingId}`);
  } else {
    await booking.update({ status: newStatus });
  }

  // Also update parcel status
  await booking.parcel.update({ status: newStatus });

  console.log(`📋 Status updated: ${currentStatus} → ${newStatus}`);

  return {
    success: true,
    newStatus,
    otpData,
    message: `Status updated to ${newStatus}`
  };
}

/* ─────────────────────────────
   FETCH PENDING PAY-AFTER-DELIVERY PAYMENTS ✅
───────────────────────────── */
export async function fetchPendingPayments(travellerUserId) {
  try {
    const pendingPayments = await PendingPayment.findAll({
      where: {
        traveller_id: travellerUserId,
        status: ["PENDING_RECEIPT", "RECEIVED"],
      },
      include: [{
        model: Booking,
        as: "booking",
        attributes: ["booking_ref", "tracking_ref", "status"],
        required: true,
      }],
      order: [["createdAt", "DESC"]],
    });

    return pendingPayments.map(payment => ({
      id: payment.id,
      booking_id: payment.booking_id,
      booking_ref: payment.booking?.booking_ref,
      tracking_ref: payment.booking?.tracking_ref,
      amount: payment.amount,
      status: payment.status,
      created_at: payment.createdAt,
      received_at: payment.received_at,
    }));
  } catch (error) {
    console.error("❌ Error fetching pending payments:", error.message);
    throw error;
  }
}