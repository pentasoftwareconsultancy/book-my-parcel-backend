import { Op } from "sequelize";
import Booking from "../booking/booking.model.js";
import Parcel from "../parcel/parcel.model.js";
import Address from "../parcel/address.model.js";
import User from "./user.model.js";
import UserProfile from "./userProfile.model.js";
import TravellerTrip from "../traveller/travellerTrip.model.js";
import {
  validateEmail,
  validatePhone,
  checkDuplicateEmail,
  checkDuplicatePhone
} from "../../utils/validation.util.js";
import { getPagination,getPagingData } from "../../utils/pagination.js";

/**
 * ─────────────────────────────
 * GET USER ORDERS
 * ─────────────────────────────
 */
export async function fetchUserOrders(userId, query) {
  const { status, page = 1, limit = 20 } = query;

  // ✅ Status filter
  const whereClause = {};
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
        where: { user_id: userId },
        required: true,
        include: [
          {
            model: Address,
            as: "pickupAddress",
            attributes: ["id", "city", "address", "state"],
          },
          {
            model: Address,
            as: "deliveryAddress",
            attributes: ["id", "city", "address", "state"],
          },
        ],
      },
      {
        model: User,
        as: "traveller",
        attributes: ["id", "phone_number"],
        required: false,
        include: [
          {
            model: UserProfile,
            as: "profile",
            attributes: ["name"],
          },
        ],
      },
      {
        model: TravellerTrip,
        as: "traveller_trip",
        required: false,
      },
    ],
    order: [["createdAt", "DESC"]],
    limit: parsedLimit,   // ✅ FIXED
    offset,               // ✅ FIXED
  });

  // ✅ Transform data
  const orders = result.rows.map(booking => {
    const parcel = booking.parcel;
    const traveller = booking.traveller;

    return {
      id: booking.id,
      bookingId: `BMP${booking.id.substring(0, 8).toUpperCase()}`,
      trackingId: `BMP${booking.id.substring(0, 12).toUpperCase()}`,
      parcelId: `P${parcel.id.substring(0, 6).toUpperCase()}`,
      deliveryId: `D${booking.id.substring(0, 6).toUpperCase()}`,
      status: booking.status,
      amount: parcel.price_quote || 0,
      bookedDate: booking.createdAt.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      pickup: {
        city: parcel.pickupAddress?.city || "",
        address: parcel.pickupAddress?.address || "",
        state: parcel.pickupAddress?.state || "",
      },
      delivery: {
        city: parcel.deliveryAddress?.city || "",
        address: parcel.deliveryAddress?.address || "",
        state: parcel.deliveryAddress?.state || "",
      },
      package: {
        size: parcel.package_size || "",
        weight: `${parcel.weight} kg`,
        eta: booking.traveller_trip?.estimated_duration || "TBD",
      },
      traveller: traveller
        ? {
            name: traveller.profile?.name || "Unknown",
            phone: traveller.phone_number || "-",
            rating: 0,
          }
        : {
            name: "Not Assigned",
            phone: "-",
            rating: 0,
          },
    };
  });

  // ✅ Pagination
  const pagination = getPagingData(result, parsedPage, parsedLimit);

  return {
    orders,
    pagination,
  };
}


/**
 * ─────────────────────────────
 * GET ORDER DETAILS
 * ─────────────────────────────
 */
export async function fetchOrderDetails(userId, bookingId) {

  const booking = await Booking.findOne({
    where: { id: bookingId },
    include: [
      {
        model: Parcel,
        as: "parcel",
        where: { user_id: userId }, // ✅ security — only own orders
        required: true,
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
        ],
      },
      {
        model: User,
        as: "traveller",
        attributes: ["id", "phone_number"],
        required: false,
        include: [{
          model: UserProfile,
          as: "profile",
          attributes: ["name", "avatar_url"],
        }],
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

  if (!booking) throw new Error("Order not found");

  const parcel    = booking.parcel;
  const traveller = booking.traveller;
  const trip      = booking.traveller_trip;

  return {
    id:         booking.id,
    bookingId:  `BMP${booking.id.substring(0, 8).toUpperCase()}`,
    trackingId: `BMP${booking.id.substring(0, 12).toUpperCase()}`,
    status:     booking.status,
    bookedDate: booking.createdAt.toLocaleDateString("en-US", {
      month: "short",
      day:   "numeric",
      year:  "numeric",
    }),
    parcel: {
      id:           `P${parcel.id.substring(0, 6).toUpperCase()}`,
      package_size: parcel.package_size || null,
      weight:       parcel.weight       || null,
      length:       parcel.length       || null,
      width:        parcel.width        || null,
      height:       parcel.height       || null,
      description:  parcel.description  || null,
      parcel_type:  parcel.parcel_type  || null,
      value:        parcel.value        || null,
      notes:        parcel.notes        || null,
      price_quote:  parcel.price_quote  || 0,
    },
    pickup: {
      city:    parcel.pickupAddress?.city    || "",
      address: parcel.pickupAddress?.address || "",
      state:   parcel.pickupAddress?.state   || "",
      pincode: parcel.pickupAddress?.pincode || "",
    },
    delivery: {
      city:    parcel.deliveryAddress?.city    || "",
      address: parcel.deliveryAddress?.address || "",
      state:   parcel.deliveryAddress?.state   || "",
      pincode: parcel.deliveryAddress?.pincode || "",
    },
    traveller: traveller ? {
      id:         traveller.id,
      name:       traveller.profile?.name      || "Unknown",
      phone:      traveller.phone_number        || "-",
      avatar_url: traveller.profile?.avatar_url || null,
      rating:     0,
    } : {
      id:         null,
      name:       "Not Assigned",
      phone:      "-",
      avatar_url: null,
      rating:     0,
    },
    trip: trip ? {
      id:               trip.id,
      source_city:      trip.source_city      || "",
      destination_city: trip.destination_city || "",
      available_weight: trip.available_weight || 0,
      status:           trip.status           || "",
    } : null,
  };
}


/**
 * ─────────────────────────────
 * GET USER STATS
 * ─────────────────────────────
 */
export async function fetchUserStats(userId) {

  const bookings = await Booking.findAll({
    include: [{
      model: Parcel,
      as: "parcel",
      where: { user_id: userId }, // ✅ filter via parcel
      required: true,
      attributes: ["price_quote"],
    }],
    attributes: ["id", "status"],
  });

  const stats = {
    totalOrders: bookings.length,
    active:      0,
    completed:   0,
    cancelled:   0,
    totalSpent:  0,
  };

  bookings.forEach(booking => {
    const status = booking.status;

    if (["CREATED", "MATCHING", "CONFIRMED", "IN_TRANSIT"].includes(status)) {
      stats.active += 1;
    } else if (status === "DELIVERED") {
      stats.completed += 1;
      stats.totalSpent += booking.parcel?.price_quote || 0;
    } else if (status === "CANCELLED") {
      stats.cancelled += 1;
    }
  });

  return stats;
}


/**
 * ─────────────────────────────
 * GET USER PROFILE
 * ─────────────────────────────
 */
export async function getProfile(userId) {

  const user = await User.findOne({
    where: { id: userId },
    attributes: ["id", "email", "phone_number", "alternate_phone"],
    include: [{
      model: UserProfile,
      as: "profile",
      attributes: [
        "name", "address", "city", "state",
        "pincode", "lat", "lng", "avatar_url"
      ],
    }],
  });

  if (!user) throw new Error("User not found");

  return {
    id:              user.id,
    email:           user.email,
    phone_number:    user.phone_number,
    alternate_phone: user.alternate_phone  || null,
    name:            user.profile?.name       || null,
    address:         user.profile?.address    || null,
    city:            user.profile?.city       || null,
    state:           user.profile?.state      || null,
    pincode:         user.profile?.pincode    || null,
    lat:             user.profile?.lat        || null,
    lng:             user.profile?.lng        || null,
    avatar_url:      user.profile?.avatar_url || null,
  };
}


/**
 * ─────────────────────────────
 * UPDATE USER PROFILE
 * ─────────────────────────────
 */
export async function updateProfile(userId, data) {

  const user = await User.findByPk(userId);
  if (!user) throw new Error("User not found");

  // ✅ Email validation if changed
  if (data.email && data.email !== user.email) {
    validateEmail(data.email);
    await checkDuplicateEmail(data.email, userId);
  }

  // ✅ Phone validation if changed
  if (data.phone_number && data.phone_number !== user.phone_number) {
    validatePhone(data.phone_number);
    await checkDuplicatePhone(data.phone_number, userId);
  }

  // ✅ Update users table — contact only
  await user.update({
    email:           data.email           ?? user.email,
    phone_number:    data.phone_number    ?? user.phone_number,
    alternate_phone: data.alternate_phone ?? user.alternate_phone,
  });

  // ✅ Update user_profiles — personal info
  await UserProfile.update(
    {
      name:       data.name       ?? undefined,
      address:    data.address    ?? undefined,
      city:       data.city       ?? undefined,
      state:      data.state      ?? undefined,
      pincode:    data.pincode    ?? undefined,
      lat:        data.lat        ?? undefined,
      lng:        data.lng        ?? undefined,
      avatar_url: data.avatar_url ?? undefined,
    },
    { where: { user_id: userId } }
  );

  return await getProfile(userId);
}