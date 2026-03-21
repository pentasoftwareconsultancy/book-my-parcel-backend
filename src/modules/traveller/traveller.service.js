
import { Op } from "sequelize";
import TravellerKYC from "./travellerKYC.model.js";
import TravellerRoute from "./travellerRoute.model.js";
import TravellerProfile from "./travellerProfile.model.js";
import TravellerTrip from "./travellerTrip.model.js";
import User from "../user/user.model.js";
import UserProfile from "../user/userProfile.model.js";
import Booking from "../booking/booking.model.js";
import Parcel from "../parcel/parcel.model.js";
import Address from "../parcel/address.model.js";
import ParcelRequest from "../matching/parcelRequest.model.js";
import { KYC_STATUS } from "../../utils/constants.js";


/* ─────────────────────────────
   SUBMIT KYC
───────────────────────────── */



/* ─────────────────────────────
   GET MY KYC
───────────────────────────── */
// export const getMyKYC = async (userId) => {
//   return await TravellerKYC.findOne({ where: { user_id: userId } });
// };


/* ─────────────────────────────
   GET ALL KYC (ADMIN)
───────────────────────────── */
export const getAllKYCs = async () => {
  return await TravellerKYC.findAll({
    order: [["createdAt", "DESC"]],
  });
};


/* ─────────────────────────────
   UPDATE KYC (Traveller)
───────────────────────────── */
// export const updateTravellerKYC = async (userId, body, files) => {

//   const existing = await TravellerKYC.findOne({ where: { user_id: userId } });
//   if (!existing) throw new Error("KYC record not found");
//   if (existing.status === KYC_STATUS.APPROVED) {
//     throw new Error("Approved KYC cannot be modified");
//   }

//   const payload = { ...body, status: KYC_STATUS.PENDING };

//   if (files?.aadharFront)  payload.aadhar_front  = files.aadharFront[0].path;
//   if (files?.aadharBack)   payload.aadhar_back   = files.aadharBack[0].path;
//   if (files?.panFront)     payload.pan_front     = files.panFront[0].path;
//   if (files?.panBack)      payload.pan_back      = files.panBack[0].path;
//   if (files?.drivingPhoto) payload.driving_photo = files.drivingPhoto[0].path;
//   if (files?.selfie)       payload.selfie        = files.selfie[0].path;

//   await existing.update(payload);
//   return existing;
// };


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
   GET NEARBY TRAVELERS
───────────────────────────── */
// export const getNearbyTravelers = async (pickupCity, deliveryCity, options = {}) => {

//   const { page = 1, limit = 10, vehicleType = null } = options; // ✅ from options
//   const offset = (page - 1) * limit;

//   const whereClause = { status: KYC_STATUS.APPROVED };

//   try {
//     const { count, rows: kycRecords } = await TravellerKYC.findAndCountAll({
//       where: whereClause,
//       include: [{
//         model: User,
//         as: "User",
//         attributes: ["id", "phone_number", "is_active"],
//         include: [{
//           model: UserProfile,
//           as: "profile",
//           attributes: ["name", "city", "state"],
//         }],
//       }],
//       limit:  Number(limit),
//       offset: Number(offset),
//       order:  [["createdAt", "DESC"]],
//     });

//     const travelers = kycRecords.map(kyc => {
//       const user = kyc.User;
//       return {
//         id:          user.id,
//         name:        user.profile?.name  || "Unknown",
//         city:        user.profile?.city  || "",
//         state:       user.profile?.state || "",
//         verified:    user.is_active,
//         rating:      (Math.random() * (5.0 - 4.0) + 4.0).toFixed(1),
//         reviews:     Math.floor(Math.random() * 500) + 50,
//         trips:       Math.floor(Math.random() * 400) + 20,
//         avgResponse: `${Math.floor(Math.random() * 20) + 5} min`,
//         deliveryTag: Math.random() > 0.5 ? "Today" : "Tomorrow",
//         from:        pickupCity   || user.profile?.city || "City", // ✅ pickupCity from param
//         to:          deliveryCity || "Destination",                // ✅ deliveryCity from param
//         vehicleType: vehicleType  || ["Car", "Bike", "Mini Truck"][Math.floor(Math.random() * 3)],
//         duration:    `${Math.floor(Math.random() * 3) + 3}–${Math.floor(Math.random() * 3) + 4} hours`,
//         price:       Math.floor(Math.random() * 100) + 80,
//       };
//     });

//     return {
//       travelers,
//       pagination: {
//         total:      count,
//         page:       Number(page),
//         limit:      Number(limit),
//         totalPages: Math.ceil(count / Number(limit)),
//       },
//     };

//   } catch (error) {
//     throw new Error(`Failed to fetch nearby travelers: ${error.message}`);
//   }
// };


/* ─────────────────────────────
   FETCH TRAVELLER DELIVERIES  ✅ NEW
───────────────────────────── */
export async function fetchTravellerDeliveries(travellerUserId, query) {

  const { status, page = 1, limit = 10 } = query;

  // ✅ Fix status — convert comma string to array
  const whereClause = { traveller_id: travellerUserId };
  if (status) {
    const statusArray = status.split(",").map(s => s.trim());
    whereClause.status = { [Op.in]: statusArray };
  }

  const { count, rows: bookings } = await Booking.findAndCountAll({
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
            as: "user",                        // ✅ parcel owner = sender
            attributes: ["id", "phone_number"],
            include: [{
              model: UserProfile,
              as: "profile",
              attributes: ["name"],            // ✅ name from user_profiles
            }],
          },
        ],
      },
    ],
    order: [["createdAt", "DESC"]],
    limit:  parseInt(limit),
    offset: (parseInt(page) - 1) * parseInt(limit),
  });

  const deliveries = bookings.map(booking => {
    const parcel = booking.parcel;
    const sender = parcel?.user; // ✅ sender = parcel owner

    return {
      id:         booking.id,
      bookingId:  `BMP${booking.id.substring(0, 8).toUpperCase()}`,
      trackingId: `BMP${booking.id.substring(0, 12).toUpperCase()}`,
      status:     booking.status,
      customer:   sender?.profile?.name || "Unknown Customer",
      customerPhone: sender?.phone_number || "",
      pickup: {
        city:    parcel?.pickupAddress?.city    || "",
        address: parcel?.pickupAddress?.address || "",
        state:   parcel?.pickupAddress?.state   || "",
      },
      drop: {
        city:    parcel?.deliveryAddress?.city    || "",
        address: parcel?.deliveryAddress?.address || "",
        state:   parcel?.deliveryAddress?.state   || "",
      },
      amount:     parcel?.price_quote || 0,
      bookedDate: booking.createdAt.toLocaleDateString("en-US", {
        month: "short",
        day:   "numeric",
        year:  "numeric",
      }),
      package: {
        size:   parcel?.package_size || "Medium",
        weight: `${parcel?.weight || 0} kg`,
        type:   parcel?.parcel_type || "Standard",
      },
      // Additional useful information
      parcelRef: parcel?.parcel_ref || "",
      urgent: parcel?.is_urgent || false,
      specialInstructions: parcel?.special_instructions || "",
      estimatedDeliveryTime: parcel?.estimated_delivery_time || "",
      // Booking specific info
      assignedDate: booking.assigned_date,
      bookingRef: booking.booking_ref || "",
      // OTP information
      pickupOTP: booking.pickup_otp || null,
      deliveryOTP: booking.delivery_otp || null,
    };
  });

  return {
    deliveries,
    pagination: {
      total:      count,
      page:       parseInt(page),
      limit:      parseInt(limit),
      totalPages: Math.ceil(count / parseInt(limit)),
    },
  };
}

// New function to fetch parcel requests for dashboard
export async function fetchTravellerParcelRequests(travellerUserId, query = {}) {
  try {
    const { status, page = 1, limit = 10 } = query;

    // Build where clause for parcel requests
    const whereClause = { traveller_id: travellerUserId };
    if (status) {
      const statusArray = status.split(",").map(s => s.trim());
      whereClause.status = { [Op.in]: statusArray };
    }

    console.log('Fetching parcel requests with where clause:', whereClause);

    const { count, rows: parcelRequests } = await ParcelRequest.findAndCountAll({
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
              include: [{
                model: UserProfile,
                as: "profile",
                attributes: ["name"],
              }],
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
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    console.log(`Found ${count} parcel requests for traveller ${travellerUserId}`);

    const requests = parcelRequests.map(request => {
      const parcel = request.parcel;
      const sender = parcel?.user;

      return {
        id: request.id,
        parcelId: parcel?.id,
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
        // Request specific info
        matchScore: request.match_score,
        detourKm: request.detour_km,
        detourPercentage: request.detour_percentage,
        expiresAt: request.expires_at,
        route: {
          id: request.route?.id,
          vehicleType: request.route?.vehicle_type,
          maxWeight: request.route?.max_weight_kg,
          status: request.route?.status,
          origin: request.route?.originAddress ? 
            `${request.route.originAddress.city}, ${request.route.originAddress.state}` : 
            "Unknown Origin",
          destination: request.route?.destAddress ? 
            `${request.route.destAddress.city}, ${request.route.destAddress.state}` : 
            "Unknown Destination",
        },
        // Additional parcel info
        parcelRef: parcel?.parcel_ref || "",
        urgent: parcel?.is_urgent || false,
        specialInstructions: parcel?.special_instructions || "",
      };
    });

    return {
      requests,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit)),
      },
    };
  } catch (error) {
    console.error('Error in fetchTravellerParcelRequests:', error);
    throw error;
  }
}


/* ─────────────────────────────
   FETCH TRAVELLER STATS  ✅ NEW
───────────────────────────── */
export async function fetchTravellerStats(travellerUserId) {

  // ✅ Single query — get all bookings with parcel price
  const bookings = await Booking.findAll({
    where: { traveller_id: travellerUserId },
    attributes: ["id", "status"],
    include: [{
      model: Parcel,
      as: "parcel",
      attributes: ["price_quote"],
      required: false,
    }],
  });

  const stats = {
    totalDeliveries: bookings.length,
    active:          0,
    completed:       0,
    cancelled:       0,
    totalEarnings:   0,
    rating:          4.8, // static for now
  };

  bookings.forEach(booking => {
    const status = booking.status;
    if (["CREATED", "MATCHING", "CONFIRMED", "IN_TRANSIT"].includes(status)) {
      stats.active += 1;
    } else if (status === "DELIVERED") {
      stats.completed     += 1;
      stats.totalEarnings += booking.parcel?.price_quote || 0;
    } else if (status === "CANCELLED") {
      stats.cancelled += 1;
    }
  });

  return stats;
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
    if (booking.status !== 'PICKUP') {
      throw new Error("Invalid status transition for delivery OTP");
    }
    // Delivery OTP verification from PICKUP goes directly to IN_TRANSIT (final delivered state)
    newStatus = 'IN_TRANSIT';
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

export const createRoute = async (userId, body) => {
  const profile = await TravellerProfile.findOne({ where: { user_id: userId } });
  if (!profile) {
    throw new Error("Traveller profile not found. Please complete your profile first.");
  }

  return await TravellerRoute.create({
    traveller_profile_id:        profile.id,
    origin_city:                 body.originCity,
    origin_state:                body.originState,
    stops:                       body.stops || [],
    destination_city:            body.destinationCity,
    destination_state:           body.destinationState,
    departure_date:              body.departureDate,
    departure_time:              body.departureTime,
    arrival_date:                body.arrivalDate,
    arrival_time:                body.arrivalTime,
    is_recurring:                body.isRecurring || false,
    recurring_days:              body.recurringDays || [],
    vehicle_type:                body.vehicleType,
    vehicle_number:              body.vehicleNumber,
    max_weight_kg:               body.maxWeightKg,
    available_space_description: body.availableSpaceDescription,
    accepted_parcel_types:       body.acceptedParcelTypes || [],
    min_earning_per_delivery:    body.minEarningPerDelivery,
  });
};


export const getMyRoutes = async (userId, options = {}) => {
  const { status, page = 1, limit = 10 } = options;
  const offset = (page - 1) * limit;

  const profile = await TravellerProfile.findOne({ where: { user_id: userId } });
  if (!profile) {
    return { routes: [], pagination: { total: 0, page: 1, limit, totalPages: 0 } };
  }

  const whereClause = { traveller_profile_id: profile.id };
  if (status) whereClause.status = status;

  const { count, rows: routes } = await TravellerRoute.findAndCountAll({
    where: whereClause,
    limit:  parseInt(limit),
    offset: parseInt(offset),
    order:  [["createdAt", "DESC"]],
  });

  return {
    routes,
    pagination: {
      total:      count,
      page:       parseInt(page),
      limit:      parseInt(limit),
      totalPages: Math.ceil(count / limit),
    },
  };
};


export const getRouteById = async (routeId) => {
  const route = await TravellerRoute.findByPk(routeId, {
    include: [{
      model: TravellerProfile,
      as: "travellerProfile",
      include: [{
        model: User,
        as: "user",
        attributes: ["id", "phone_number"],      // ✅ no name from users
        include: [{
          model: UserProfile,
          as: "profile",
          attributes: ["name"],                  // ✅ name from user_profiles
        }],
      }],
    }],
  });

  if (!route) throw new Error("Route not found");
  return route;
};


export const updateRoute = async (routeId, userId, body) => {
  const route = await TravellerRoute.findByPk(routeId, {
    include: [{ model: TravellerProfile, as: "travellerProfile" }],
  });

  if (!route) throw new Error("Route not found");
  if (route.travellerProfile.user_id !== userId) {
    throw new Error("Unauthorized to update this route");
  }

  await route.update({
    origin_city:                 body.originCity,
    origin_state:                body.originState,
    stops:                       body.stops,
    destination_city:            body.destinationCity,
    destination_state:           body.destinationState,
    departure_date:              body.departureDate,
    departure_time:              body.departureTime,
    arrival_date:                body.arrivalDate,
    arrival_time:                body.arrivalTime,
    is_recurring:                body.isRecurring,
    recurring_days:              body.recurringDays,
    vehicle_type:                body.vehicleType,
    vehicle_number:              body.vehicleNumber,
    max_weight_kg:               body.maxWeightKg,
    available_space_description: body.availableSpaceDescription,
    accepted_parcel_types:       body.acceptedParcelTypes,
    min_earning_per_delivery:    body.minEarningPerDelivery,
    status:                      body.status,
  });

  return route;
};


export const deleteRoute = async (routeId, userId) => {
  const route = await TravellerRoute.findByPk(routeId, {
    include: [{ model: TravellerProfile, as: "travellerProfile" }],
  });

  if (!route) throw new Error("Route not found");
  if (route.travellerProfile.user_id !== userId) {
    throw new Error("Unauthorized to delete this route");
  }

  await route.destroy();
};