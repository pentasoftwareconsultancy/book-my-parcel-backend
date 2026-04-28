
import { Op } from "sequelize";
import TravellerKYC from "./travellerKYC.model.js";
import TravellerRoute from "./travellerRoute.model.js";
import User from "../user/user.model.js";
import UserProfile from "../user/userProfile.model.js";
import Booking from "../booking/booking.model.js";
import Parcel from "../parcel/parcel.model.js";
import Address from "../parcel/address.model.js";
import ParcelRequest from "../matching/parcelRequest.model.js";
import { KYC_STATUS } from "../../utils/constants.js";
import { getPagination, getPagingData } from "../../utils/pagination.js";
import PendingPayment from "../booking/pendingPayment.model.js";



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

  // ✅ Transform data
  const deliveries = result.rows.map(booking => {
    const parcel = booking.parcel;
    const sender = parcel?.user;

    return {
      id: booking.id,
      parcelId: parcel?.id,
      // ✅ Use consistent field names that frontend expects
      booking_ref: booking.booking_ref || `TEMP-${booking.id.substring(0, 8).toUpperCase()}`,
      parcel_ref: parcel?.parcel_ref || `BMP-${booking.id.substring(0, 3)}`,
      tracking_ref: booking.tracking_ref || `UBG-${booking.id.substring(0, 3)}`,
      // ✅ Keep legacy fields for backward compatibility
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
      earnings: parcel?.price_quote || 0, // ✅ Add earnings field
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
      weight: `${parcel?.weight || 0} kg`, // ✅ Add top-level weight field
      parcelRef: parcel?.parcel_ref || "", // ✅ Keep for backward compatibility
      urgent: parcel?.is_urgent || false,
      specialInstructions: parcel?.special_instructions || "",
      estimatedDeliveryTime: parcel?.estimated_delivery_time || "",
      assignedDate: booking.assigned_date,
      bookingRef: booking.booking_ref || "", // ✅ Keep for backward compatibility
      paymentMode: booking.payment_mode || "PAY_NOW",
      // OTP information
      pickup_otp: booking.pickup_otp || null,
      delivery_otp: booking.delivery_otp || null,
      pickupOTP: booking.pickup_otp || null, // ✅ Keep for backward compatibility
      deliveryOTP: booking.delivery_otp || null, // ✅ Keep for backward compatibility
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

    console.log("Fetching parcel requests with where clause:", whereClause);

    // ✅ DB query
    const result = await ParcelRequest.findAndCountAll({
      where: whereClause,
      distinct: true, // ✅ IMPORTANT (fix duplicate count issue)
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
          attributes: ["id", "vehicle_type", "max_weight_kg", "status"],
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
      limit: parsedLimit, // ✅ FIXED
      offset,             // ✅ FIXED
    });

    console.log(`Found ${result.count} parcel requests for traveller ${travellerUserId}`);

    // ✅ Transform
    const requests = result.rows.map(request => {
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
        detour_km: request.detour_km, // ✅ Add underscore version
        detourPercentage: request.detour_percentage,
        detour_percentage: request.detour_percentage, // ✅ Add underscore version
        expiresAt: request.expires_at,
        route: {
          id: request.route?.id,
          vehicleType: request.route?.vehicle_type,
          maxWeight: request.route?.max_weight_kg,
          status: request.route?.status,
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

    // ✅ Pagination (common)
    const pagination = getPagingData(result, parsedPage, parsedLimit);

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

  // ✅ Single query — get all bookings with parcel price and payment mode
  const bookings = await Booking.findAll({
    where: { traveller_id: travellerUserId },
    attributes: ["id", "status", "createdAt"],
    include: [{
      model: Parcel,
      as: "parcel",
      attributes: ["price_quote"],
      required: false,
    }],
  });

  // ✅ Fetch pending pay-after-delivery payments (only PENDING_RECEIPT)
  const PendingPayment = (await import("../booking/pendingPayment.model.js")).default;
  const pendingPayments = await PendingPayment.findAll({
    where: {
      traveller_id: travellerUserId,
      status: "PENDING_RECEIPT",  // Only pending payments awaiting receipt
    },
    attributes: ["amount", "status"],
  });

  const stats = {
    totalDeliveries: bookings.length,
    active:          0,
    completed:       0,
    cancelled:       0,
    totalEarnings:   0,
    earningsInWallet: 0,
    earningsPending:  0,
    rating:          4.8, // static for now
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let todayEarnings = 0;

  bookings.forEach(booking => {
    const status = booking.status;
    const paymentMode = booking.payment_mode || "PAY_NOW";
    const amount = booking.parcel?.price_quote || 0;
    
    // Check if booking is from today
    const bookingDate = new Date(booking.createdAt);
    bookingDate.setHours(0, 0, 0, 0);
    const isToday = bookingDate.getTime() === today.getTime();

    if (["CREATED", "MATCHING", "CONFIRMED", "IN_TRANSIT"].includes(status)) {
      stats.active += 1;
    } else if (status === "DELIVERED") {
      // ✅ Delivery complete — count earnings for both payment modes
      stats.completed += 1;
      
      // ✅ Count total earnings (both PAY_NOW and PAY_AFTER_DELIVERY when delivered)
      stats.totalEarnings += amount;
      if (isToday) {
        todayEarnings += amount;
      }

      // ⚠️ Only add to earningsInWallet if it's PAY_NOW (actually credited to wallet)
      if (paymentMode === "PAY_NOW") {
        stats.earningsInWallet += amount;
      }
      // For PAY_AFTER_DELIVERY: earnings counted in total but NOT in wallet (stays with system)
      
    } else if (status === "CANCELLED") {
      stats.cancelled += 1;
    }
  });

  // ✅ Only track pending payments separately - DO NOT count in totalEarnings yet
  // Pending payments will be counted when status changes to DELIVERED (after receivePayment)
  pendingPayments.forEach(payment => {
    stats.earningsPending += payment.amount;
    // ⚠️ NOT adding to totalEarnings or todayEarnings - those are only for received payments
  });

  stats.todayEarnings = todayEarnings;

  console.log(`[fetchTravellerStats] Stats calculated:`, {
    totalDeliveries: stats.totalDeliveries,
    active: stats.active,
    completed: stats.completed,
    totalEarnings: stats.totalEarnings,
    earningsInWallet: stats.earningsInWallet,
    earningsPending: stats.earningsPending,
    todayEarnings: stats.todayEarnings,
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
 * Generate OTP for pickup/delivery verification
 */
export async function generateOTP(bookingId, type) {
  // Generate 4-digit OTP
  const otp = Math.floor(1000 + Math.random() * 9000).toString();

  // In production, store OTP in Redis with expiration
  // For now, we'll store in booking record or separate OTP table

  const booking = await Booking.findByPk(bookingId);
  if (!booking) {
    throw new Error("Booking not found");
  }

  // Store OTP in booking record (you might want a separate OTP table)
  const otpField = type === 'pickup' ? 'pickup_otp' : 'delivery_otp';
  await booking.update({ [otpField]: otp });

  // TODO: Send OTP via SMS/WhatsApp to customer
  console.log(`📱 OTP ${otp} generated for ${type} - Booking: ${bookingId}`);

  return { otp, expiresIn: 300 }; // 5 minutes
}

/**
 * Verify OTP and update booking status
 */
export async function verifyOTPAndUpdateStatus(bookingId, otp, type, travellerUserId) {
  const booking = await Booking.findByPk(bookingId, {
    include: [{
      model: Parcel,
      as: "parcel",
      required: true
    }]
  });

  if (!booking) {
    throw new Error("Booking not found");
  }

  if (booking.traveller_id !== travellerUserId) {
    throw new Error("Unauthorized: Not your booking");
  }

  // Check OTP
  const otpField = type === 'pickup' ? 'pickup_otp' : 'delivery_otp';
  const storedOTP = booking[otpField];

  if (!storedOTP || storedOTP !== otp) {
    throw new Error("Invalid OTP");
  }

  // Update status based on type
  let newStatus;
  if (type === 'pickup') {
    if (booking.status !== 'PICKUP') {
      throw new Error("Invalid status transition for pickup OTP");
    }
    newStatus = 'IN_TRANSIT';
  } else if (type === 'delivery') {
    if (booking.status !== 'IN_TRANSIT') {
      throw new Error("Invalid status transition for delivery OTP");
    }
    newStatus = 'DELIVERED';
  } else {
    throw new Error("Invalid OTP type");
  }

  // Update both booking and parcel status
  await Promise.all([
    booking.update({
      status: newStatus,
      [otpField]: null // Clear OTP after verification
    }),
    booking.parcel.update({ status: newStatus })
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
      required: true
    }]
  });

  if (!booking) {
    throw new Error("Booking not found");
  }

  if (booking.traveller_id !== travellerUserId) {
    throw new Error("Unauthorized: Not your booking");
  }

  // Validate status transitions
  const validTransitions = {
    'CONFIRMED': ['PICKUP', 'CANCELLED'],
    'PICKUP': ['IN_TRANSIT', 'CANCELLED'],
    'IN_TRANSIT': ['DELIVERED', 'CANCELLED']
  };

  const currentStatus = booking.status;
  if (!validTransitions[currentStatus] || !validTransitions[currentStatus].includes(newStatus)) {
    throw new Error(`Invalid status transition from ${currentStatus} to ${newStatus}`);
  }

  // For PICKUP status, generate both pickup and delivery OTPs
  let otpData = null;
  if (newStatus === 'PICKUP') {
    const pickupOTP = Math.floor(1000 + Math.random() * 9000).toString();
    const deliveryOTP = Math.floor(1000 + Math.random() * 9000).toString();

    // Update booking with both OTPs
    await booking.update({
      status: newStatus,
      pickup_otp: pickupOTP,
      delivery_otp: deliveryOTP
    });

    otpData = {
      pickupOTP,
      deliveryOTP,
      expiresIn: 300
    };

    console.log(`📱 OTPs generated - Pickup: ${pickupOTP}, Delivery: ${deliveryOTP}`);
  } else {
    // For other transitions, just update status
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