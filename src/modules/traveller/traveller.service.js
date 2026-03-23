
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
      customer:   sender?.profile?.name || "Unknown Customer", // ✅ fixed
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
        size:   parcel?.package_size || "",
        weight: `${parcel?.weight} kg`,
      },
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
   ROUTE SERVICES
───────────────────────────── */

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