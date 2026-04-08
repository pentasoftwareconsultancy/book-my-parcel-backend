import sequelize from "../../config/database.config.js";
import { QueryTypes } from "sequelize";
import TravellerKYC from "../traveller/travellerKYC.model.js";
import User from "../user/user.model.js";
import { KYC_STATUS } from "../../utils/constants.js";
import Role from "../user/role.model.js";
import UserRole from "../user/userRole.model.js";
import Booking from "../booking/booking.model.js";
import BookingStatusLog from "../booking/bookingStatusLog.model.js";
import Payment from "../payment/payment.model.js";
import Parcel from "../parcel/parcel.model.js";
import TravellerTrip from "../traveller/travellerTrip.model.js";

/**
 * Admin Fetch Users with Pagination + Role Filter
 * @param {number} page
 * @param {number} limit
 * @param {string} role
 */
export const getAllUsers = async ({ page = 1, limit = 10 }) => {
  const offset = (page - 1) * limit;

  const users = await sequelize.query(
    `
    SELECT 
      u.id,
      u.name,
      u.phone_number,
      u.alternate_phone,
      u.email,
      u."createdAt",
      u."updatedAt"
    FROM users u
    WHERE EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = u.id
      AND r.name = 'INDIVIDUAL'
    )
    ORDER BY u."createdAt" DESC
    LIMIT :limit OFFSET :offset
    `,
    {
      replacements: { limit, offset },
      type: QueryTypes.SELECT
    }
  );

  const countResult = await sequelize.query(
    `
    SELECT COUNT(*) as total
    FROM users u
    WHERE EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = u.id
      AND r.name = 'INDIVIDUAL'
    )
    `,
    {
      type: QueryTypes.SELECT
    }
  );

  const total = parseInt(countResult[0].total);

  return {
    users,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit)
    }
  };
};

export const getAllBookings = async ({ page = 1, limit = 10 }) => {
  const offset = (page - 1) * limit;

  const query = `
    SELECT 
      b.id AS booking_id,
      b.status AS booking_status,
      b.amount,
      b."createdAt",

      u.id AS user_id,
      u.name AS user_name,
      u.phone_number,
      u.email,

      p.id AS parcel_id,
      p.weight,
      p.parcel_type,
      p.description,
      p.status AS parcel_status,

      pa.address AS pickup_address,
      pa.city AS pickup_city,
      pa.state AS pickup_state,
      pa.pincode AS pickup_pincode,

      da.address AS delivery_address,
      da.city AS delivery_city,
      da.state AS delivery_state,
      da.pincode AS delivery_pincode

    FROM bookings b
    JOIN users u ON u.id = b.user_id
    JOIN parcels p ON p.id = b.parcel_id
    JOIN address pa ON pa.id = b.pickup_address_id
    JOIN address da ON da.id = b.delivery_address_id

    ORDER BY b."createdAt" DESC
    LIMIT :limit OFFSET :offset
  `;

  return await sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { limit, offset },
  });
};

/**
 * Get travelers for KYC approval with pagination
 * @param {number} page
 * @param {number} limit
 * @param {string} status
 */
export const getTravelersForKYC = async ({ page = 1, limit = 10, status = null }) => {
  const offset = (page - 1) * limit;

  // Build where clause for KYC status filtering
  let whereClause = "";
  let replacements = { limit, offset };

  if (status) {
    whereClause = "WHERE kyc.status = :status";
    replacements.status = status;
  }

  // Query to get travelers with their KYC status
  const travelers = await sequelize.query(
    `
    SELECT 
      u.id AS user_id,
      u.name,
      u.email,
      u.phone_number,
      u."createdAt" AS user_created_at,
      kyc.id AS kyc_id,
      kyc.status AS kyc_status,
      kyc.address,
      kyc.aadhar_front,
      kyc.aadhar_back,
      kyc.pan_front,
      kyc.pan_back,
      kyc.driving_photo,
      kyc.selfie,
      kyc.created_at AS kyc_created_at,
      kyc.updated_at AS kyc_updated_at
    FROM users u
    JOIN traveller_kyc kyc ON u.id = kyc.user_id
    ${whereClause}
    ORDER BY kyc.created_at DESC
    LIMIT :limit OFFSET :offset
    `,
    {
      replacements,
      type: QueryTypes.SELECT
    }
  );

  // Count total travelers for pagination
  const countResult = await sequelize.query(
    `
    SELECT COUNT(*) as total 
    FROM traveller_kyc kyc
    JOIN users u ON u.id = kyc.user_id
    ${whereClause}
    `,
    {
      replacements: status ? { status } : {},
      type: QueryTypes.SELECT
    }
  );

  const total = parseInt(countResult[0].total);

  return {
    travelers,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit)
    }
  };
};

/**
 * Update traveler KYC status
 * @param {string} kycId
 * @param {string} status
 */
export const updateTravelerKYCStatus = async (kycId, status) => {
  const kyc = await TravellerKYC.findByPk(kycId);
  
  if (!kyc) {
    throw new Error("KYC record not found");
  }

  const validStatuses = Object.values(KYC_STATUS);
  if (!validStatuses.includes(status)) {
    throw new Error("Invalid status value");
  }

  await kyc.update({ status });
  
  // Also update user's kyc_verified status if approved
  if (status === KYC_STATUS.APPROVED) {
    const user = await User.findByPk(kyc.user_id);
    if (user) {
      await user.update({ kyc_verified: true });
    }
  }

  return kyc;
};

// -------------------------------------- admin overview dashboard ----------------------------------------

export const getRecentBookingsService = async () => {
  const bookings = await Booking.findAll({
    order: [["createdAt", "DESC"]],
    limit: 20,
    include: [
      {
        model: Parcel,
        as: "parcel",
        attributes: ["id"],
        include: [
          {
            model: User,
            as: "user",
            attributes: ["id", "name"],
          },
        ],
      },
      {
        model: User,
        as: "traveller",
        attributes: ["id", "name"],
      },
      {
        model: TravellerTrip,
        as: "traveller_trip",
        attributes: ["source_city", "destination_city"],
      },
      {
        model: Payment,
        attributes: ["amount"],
      },
    ],
  });

  const formatted = bookings.map((b) => ({
    bookingId: b.id,
    user: b.parcel?.user?.name || "N/A",
    partner: b.traveller?.name || "Not assigned",
    route: b.traveller_trip
      ? `${b.traveller_trip.source_city} → ${b.traveller_trip.destination_city}`
      : "N/A",
    status: b.status,
    amount: b.Payment?.amount || 0,
  }));

  return formatted;
};

export const getRoleWiseUserCountService = async () => {

  const result = await sequelize.query(`
    SELECT 
      r.name,
      COUNT(ur.user_id) AS total_users
    FROM roles r
    LEFT JOIN user_roles ur ON ur.role_id = r.id
    WHERE r.name IN ('TRAVELLER', 'INDIVIDUAL')
    GROUP BY r.name
  `,{
    type: QueryTypes.SELECT
  });

  return result;
};

export const getActiveBookingCountService = async () => {
  return await Booking.count({
    include: [
      {
        model: BookingStatusLog,
        where: { status: "ACTIVE" },
        attributes: [],
      },
    ],
    distinct: true,
  });
};

export const getTotalRevenueService = async () => {
  const result = await Payment.findOne({
    where: { status: "SUCCESS" }, // change if your status value differs
    attributes: [
      [sequelize.fn("SUM", sequelize.col("amount")), "total_revenue"],
    ],
    raw: true,
  });

  return result.total_revenue || 0;
};

export const getRecentUserService = async (params = {}) => {
  const page = parseInt(params.page) || 1;
  const limit = parseInt(params.limit) || 10;
  const offset = (page - 1) * limit;

  const sqlQuery = `
    SELECT
      u.id,
      up.full_name,
      u.email,
      u."createdAt"
    FROM users u
    INNER JOIN user_profiles up
      ON u.id = up.user_id
    ORDER BY u."createdAt" DESC
    LIMIT :limit OFFSET :offset
  `;

  const users = await sequelize.query(sqlQuery, {
    type: QueryTypes.SELECT,
    replacements: { limit, offset }
  });

  return users;
};

export const getRecentTravellerService = async (params = {}) => {
  const page = parseInt(params.page) || 1;
  const limit = parseInt(params.limit) || 10;
  const offset = (page - 1) * limit;

  const sqlQuery = `
    SELECT
      tp.id AS traveller_profile_id,
      tp.name,
      tp.email,
      tp.status,
      tp."createdAt"
    FROM traveller_profiles tp
    ORDER BY tp."createdAt" DESC
    LIMIT :limit OFFSET :offset
  `;

  const travellers = await sequelize.query(sqlQuery, {
    type: QueryTypes.SELECT,
    replacements: { limit, offset },
  });

  return travellers;
};

export const getAdminDashboardService = async (params = {}) => {

  const [
    roleStats,
    activeBookings,
    totalRevenue,
    recentUsers,
    recentTravellers,
    recentBookings
  ] = await Promise.all([
    getRoleWiseUserCountService(),
    getActiveBookingCountService(),
    getTotalRevenueService(),
    getRecentUserService(params),
    getRecentTravellerService(params),
    getRecentBookingsService(params)
  ]);

  const stats = {
    travellers: 0,
    individuals: 0
  };

  roleStats.forEach((role) => {
    const count = parseInt(role.total_users);

    if (role.name === "TRAVELLER") stats.travellers = count;
    if (role.name === "INDIVIDUAL") stats.individuals = count;
  });

  return {
    stats: {
      ...stats,
      activeBookings,
      totalRevenue
    },
    recentUsers,
    recentTravellers,
    recentBookings
  };
};