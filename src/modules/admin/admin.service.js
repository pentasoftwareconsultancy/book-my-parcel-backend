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
import UserProfile from "../user/userProfile.model.js";

/**
 * Admin Fetch Users with Pagination + Role Filter
 * @param {number} page
 * @param {number} limit
 * @param {string} role
 */
// export const getAllUsers = async ({ page = 1, limit = 10 }) => {
//   const offset = (page - 1) * limit;

//   const users = await sequelize.query(
//     `
//     SELECT 
//       u.id,
//       up.name,
//       u.phone_number,
//       u.alternate_phone,
//       u.email,
//       u."createdAt",
//       u."updatedAt"
//     FROM users u
//     LEFT JOIN user_profiles up ON up.user_id = u.id
//     WHERE EXISTS (
//       SELECT 1 FROM user_roles ur
//       JOIN roles r ON ur.role_id = r.id
//       WHERE ur.user_id = u.id
//       AND r.name = 'INDIVIDUAL'
//     )
//     ORDER BY u."createdAt" DESC
//     LIMIT :limit OFFSET :offset
//     `,
//     {
//       replacements: { limit, offset },
//       type: QueryTypes.SELECT
//     }
//   );

//   const countResult = await sequelize.query(
//     `
//     SELECT COUNT(*) as total
//     FROM users u
//     WHERE EXISTS (
//       SELECT 1 FROM user_roles ur
//       JOIN roles r ON ur.role_id = r.id
//       WHERE ur.user_id = u.id
//       AND r.name = 'INDIVIDUAL'
//     )
//     `,
//     {
//       type: QueryTypes.SELECT
//     }
//   );

//   const total = parseInt(countResult[0].total);

//   return {
//     users,
//     pagination: {
//       total,
//       page: Number(page),
//       limit: Number(limit),
//       totalPages: Math.ceil(total / limit)
//     }
//   }; 
// };


export const getAllUsers = async ({ page = 1, limit = 10 }) => {
  const offset = (page - 1) * limit;

  const users = await sequelize.query(
    `
    SELECT 
      u.id,
      up.name,
      up.city,
      up.state,
      u.email,
      u.phone_number,
      u."createdAt",

      /* BOOKINGS COUNT */
      COUNT(DISTINCT b.id) AS bookings,

      /* TOTAL SPEND */
      COALESCE(SUM(p.amount), 0) AS total_spend,

      /* LAST BOOKING DATE */
      MAX(b."createdAt") AS last_booking,

      /* KYC STATUS */
      CASE 
        WHEN tk.status = 'APPROVED' THEN true
        ELSE false
      END AS kyc_verified

    FROM users u

    LEFT JOIN user_profiles up ON up.user_id = u.id

    LEFT JOIN bookings b ON b.user_id = u.id

    LEFT JOIN payments p ON p.booking_id = b.id 
    AND p.status = 'SUCCESS'

    LEFT JOIN traveller_kyc tk ON tk.user_id = u.id

    WHERE EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = u.id
      AND r.name = 'INDIVIDUAL'
    )

    GROUP BY u.id, up.name, up.city, up.state, u.email, u.phone_number, u."createdAt", tk.status

    ORDER BY u."createdAt" DESC
    LIMIT :limit OFFSET :offset
    `,
    {
      replacements: { limit, offset },
      type: QueryTypes.SELECT,
    }
  );

  return { users };
};

export const getAllBookings = async ({ page = 1, limit = 10 }) => {
  const offset = (page - 1) * limit;

  const query = `
    SELECT 
      b.id AS booking_id,
      b.status AS booking_status,
      b.amount,
      b."createdAt",

      up.name AS user_name,
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

    FROM booking b
    JOIN parcel p ON p.id = b.parcel_id
    JOIN users u ON u.id = p.user_id
    LEFT JOIN user_profiles up ON up.user_id = u.id
    LEFT JOIN address pa ON pa.id = p.pickup_address_id
    LEFT JOIN address da ON da.id = p.delivery_address_id

    ORDER BY b."createdAt" DESC
    LIMIT :limit OFFSET :offset
  `;

  const bookings = await sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { limit, offset },
  });

  const countResult = await sequelize.query(
    `SELECT COUNT(*) AS total FROM booking b JOIN parcel p ON p.id = b.parcel_id`,
    { type: QueryTypes.SELECT }
  );

  const total = parseInt(countResult[0].total);

  return {
    bookings,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit),
    },
  };
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
  
  // Update traveller profile status when KYC is approved/rejected
  if (status === KYC_STATUS.APPROVED) {
    const TravellerProfile = (await import("../traveller/travellerProfile.model.js")).default;
    await TravellerProfile.update(
      { status: "ACTIVE" },
      { where: { user_id: kyc.user_id } }
    );
  } else if (status === KYC_STATUS.REJECTED) {
    const TravellerProfile = (await import("../traveller/travellerProfile.model.js")).default;
    await TravellerProfile.update(
      { status: "INCOMPLETE" },
      { where: { user_id: kyc.user_id } }
    );
  }

  return kyc;
};

// -------------------------------------- admin overview dashboard ----------------------------------------

export const getRecentBookingsService = async (params = {}) => {
  const page = parseInt(params.page) || 1;
  const limit = parseInt(params.limit) || 20;
  const offset = (page - 1) * limit;

  const bookings = await Booking.findAndCountAll({
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true,
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

  const formatted = bookings.rows.map((b) => ({
    bookingId: b.id,
    user: b.parcel?.user?.name || "N/A",
    partner: b.traveller?.name || "Not assigned",
    route: b.traveller_trip
      ? `${b.traveller_trip.source_city} → ${b.traveller_trip.destination_city}`
      : "N/A",
    status: b.status,
    amount: b.Payment?.amount || 0,
  }));

  return {
    data: formatted,
    pagination: {
      total: bookings.count,
      page,
      limit,
      totalPages: Math.ceil(bookings.count / limit),
    },
  };
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
      up.name,
      u.email,
      u."createdAt"
    FROM users u
    INNER JOIN user_profiles up
      ON u.id = up.user_id
    ORDER BY u."createdAt" DESC
    LIMIT :limit OFFSET :offset
  `;

  const countQuery = `SELECT COUNT(*) AS total FROM users u INNER JOIN user_profiles up ON u.id = up.user_id`;

  const [users, countResult] = await Promise.all([
    sequelize.query(sqlQuery, { type: QueryTypes.SELECT, replacements: { limit, offset } }),
    sequelize.query(countQuery, { type: QueryTypes.SELECT }),
  ]);

  const total = parseInt(countResult[0].total);

  return {
    data: users,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

export const getRecentTravellerService = async (params = {}) => {
  const page = parseInt(params.page) || 1;
  const limit = parseInt(params.limit) || 10;
  const offset = (page - 1) * limit;

  const sqlQuery = `
    SELECT
      tp.id AS traveller_profile_id,
      up.name,
      u.email,
      tp.status,
      tp."createdAt"
    FROM traveller_profiles tp
    JOIN users u ON u.id = tp.user_id
    LEFT JOIN user_profiles up ON up.user_id = tp.user_id
    ORDER BY tp."createdAt" DESC
    LIMIT :limit OFFSET :offset
  `;

  const countQuery = `SELECT COUNT(*) AS total FROM traveller_profiles`;

  const [travellers, countResult] = await Promise.all([
    sequelize.query(sqlQuery, { type: QueryTypes.SELECT, replacements: { limit, offset } }),
    sequelize.query(countQuery, { type: QueryTypes.SELECT }),
  ]);

  const total = parseInt(countResult[0].total);

  return {
    data: travellers,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
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


//GET DISPUTES

export const getAllDisputes = async ({ page = 1, limit = 10, status = null }) => {
  const offset = (page - 1) * limit;

  console.log("Admin Service - Get All Disputes called with params:", { page, limit, status });

  let whereClause = "";
  let replacements = { limit, offset };

  console.log("Constructing SQL query with whereClause:", whereClause, "and replacements:", replacements);

  if (status) {
    whereClause = "WHERE d.status = :status";
    replacements.status = status;
  }
  

  const query = `
    SELECT 
      d.id AS dispute_id,
      d.dispute_type,
      d.description,
      d.status AS dispute_status,
      d.role,
      d."created_at",

      -- Booking Info
      b.id AS booking_id,
      b.status AS booking_status,
      b.amount,

      -- Raised By (User/Traveller)
      u.id AS raised_by_id,
      up.name AS raised_by_name,
      u.email,
      u.phone_number,

      -- Parcel Info
      p.id AS parcel_id,
      p.parcel_type,
      p.weight,

      -- Pickup Address
      pa.address AS pickup_address,
      pa.city AS pickup_city,

      -- Delivery Address
      da.address AS delivery_address,
      da.city AS delivery_city

    FROM disputes d

    LEFT JOIN booking b ON b.id = d.booking_id
    LEFT JOIN users u ON u.id = d.raised_by
    LEFT JOIN user_profiles up ON up.user_id = u.id

    LEFT JOIN parcel p ON p.id = b.parcel_id
    LEFT JOIN address pa ON pa.id = p.pickup_address_id
    LEFT JOIN address da ON da.id = p.delivery_address_id

    ${whereClause}

    ORDER BY d."created_at" DESC
    LIMIT :limit OFFSET :offset
  `;

  console.log("Final SQL Query for fetching disputes:", query);
  console.log("With replacements:", replacements);


  const disputes = await sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements,
  });

  console.log("ABCD",`Fetched ${disputes.length} disputes from database`);

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM disputes d
    ${whereClause}
  `;

  console.log("Count Query for disputes:", countQuery, "with replacements:", status ? { status } : {});

  const countResult = await sequelize.query(countQuery, {
    type: QueryTypes.SELECT,
    replacements: status ? { status } : {},
  });
  console.log("Count result for disputes:", countResult);

  const total = parseInt(countResult[0].total);

  console.log(`Total disputes count: ${total}`);

  return {
    disputes,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit),
    },
  };
  console.log("Admin Service - Get All Disputes completed");
};

// GET ADMIN SERVICE PAYMENTS 
export const getAllPaymentsAdminService = async () => {
  try {
    const payments = await Payment.findAll({
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: Booking,
          attributes: ["id", "booking_ref", "status", "payment_mode"],
          include: [
            {
              model: Parcel,
              as: "parcel",
              attributes: ["id", "parcel_ref", "price_quote"],
              include: [
                {
                  model: User,
                  attributes: ["id", "email", "phone_number"],
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
              model: User,
              as: "traveller",
              attributes: ["id", "email", "phone_number"],
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
    });

    return payments;
  } catch (error) {
    console.error("Admin Payment Service Error:", error);
    throw error;
  }
};