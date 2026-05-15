import sequelize from "../../config/database.config.js";
import { QueryTypes } from "sequelize";
// Fixed database queries for TravelerApproval page
import TravellerKYC from "../traveller/travellerKYC.model.js";
import User from "../user/user.model.js";
import { KYC_STATUS } from "../../utils/constants.js";
import Role from "../user/role.model.js";
import UserRole from "../user/userRole.model.js";
import Booking from "../booking/booking.model.js";
import Payment from "../payment/payment.model.js";
import Parcel from "../parcel/parcel.model.js";
import UserProfile from "../user/userProfile.model.js";
import { auditLog } from "../../utils/auditLog.util.js";
import { invalidateKycCache } from "../../redis/cache/kycStatusCache.service.js";
import { invalidateSettingsCache } from "../../redis/cache/platformSettingsCache.service.js";


export const getAllUsers = async ({ page = 1, limit = 100 }) => {
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
      COALESCE(SUM(CASE WHEN p.status = 'SUCCESS' THEN p.amount ELSE 0 END), 0) AS total_spend,

      /* LAST BOOKING DATE */
      MAX(b."createdAt") AS last_booking,

      /* KYC STATUS */
      CASE 
        WHEN tk.status = 'APPROVED' THEN true
        ELSE false
      END AS kyc_verified

    FROM users u

    LEFT JOIN user_profiles up ON up.user_id = u.id

    LEFT JOIN parcel parc ON parc.user_id = u.id

    LEFT JOIN booking b ON b.parcel_id = parc.id

    LEFT JOIN payments p ON p.booking_id = b.id

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

  const countResult = await sequelize.query(`
    SELECT COUNT(*) AS total
    FROM users u
    WHERE EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = u.id AND r.name = 'INDIVIDUAL'
    )
  `, { type: QueryTypes.SELECT });

  return {
    users,
    pagination: {
      total: parseInt(countResult[0].total),
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(parseInt(countResult[0].total) / limit),
    },
  };
};

/**
 * Get all bookings for the admin panel.
 *
 * Supports two pagination modes — pass whichever suits the call site:
 *
 *   OFFSET mode (default, backward-compatible):
 *     getAllBookings({ page: 2, limit: 20 })
 *     Returns a `pagination` object with { total, page, limit, totalPages }.
 *
 *   Cursor mode (efficient for large tables — avoids full-table scans):
 *     getAllBookings({ cursor: '<opaque base64url string>', limit: 20 })
 *     When `cursor` is provided, OFFSET is replaced with a
 *     WHERE b."createdAt" < :cursor_time condition so Postgres can use the
 *     index on `booking."createdAt"` directly.
 *     Returns a `pagination` object with { next_cursor, has_more, count }.
 *     The caller should store `next_cursor` and pass it back on the next
 *     request to advance the page.
 */
export const getAllBookings = async ({ page = 1, limit = 10, cursor = null } = {}) => {
  const safeLimit = Math.min(Math.max(1, parseInt(limit) || 10), 100);

  // ── Cursor mode ────────────────────────────────────────────────────────────
  if (cursor) {
    let cursorTime = null;
    let cursorId = null;
    try {
      const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
      cursorTime = decoded.createdAt ? new Date(decoded.createdAt) : null;
      cursorId = decoded.id || null;
    } catch {
      // Malformed cursor — fall through to a first-page result
    }

    // Seek condition: rows strictly older than the cursor record, with id
    // tie-break for rows that share the exact same createdAt timestamp.
    const cursorClause = cursorTime
      ? `AND (b."createdAt" < :cursor_time
             OR (b."createdAt" = :cursor_time AND b.id < :cursor_id))`
      : "";

    const query = `
      SELECT 
        b.id AS booking_id,
        b.booking_ref,
        b.status::text AS booking_status,
        COALESCE(b.amount, pay.amount, p.price_quote) AS amount,
        b."createdAt",

        up.name AS user_name,
        u.phone_number,
        u.email,

        tp.name AS partner_name,
        tu.phone_number AS partner_phone,

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
      LEFT JOIN users tu ON tu.id = b.traveller_id
      LEFT JOIN user_profiles tp ON tp.user_id = tu.id
      LEFT JOIN payments pay ON pay.booking_id = b.id
      LEFT JOIN address pa ON pa.id = p.pickup_address_id
      LEFT JOIN address da ON da.id = p.delivery_address_id

      WHERE 1=1 ${cursorClause}
      ORDER BY b."createdAt" DESC, b.id DESC
      LIMIT :limit
    `;

    const replacements = { limit: safeLimit };
    if (cursorTime) {
      replacements.cursor_time = cursorTime;
      replacements.cursor_id = cursorId;
    }

    const bookings = await sequelize.query(query, {
      type: QueryTypes.SELECT,
      replacements,
    });

    const hasMore = bookings.length === safeLimit;
    const lastRow = bookings[bookings.length - 1];
    const nextCursor = hasMore && lastRow
      ? Buffer.from(JSON.stringify({ id: lastRow.booking_id, createdAt: lastRow.createdAt })).toString("base64url")
      : null;

    return {
      bookings,
      pagination: {
        next_cursor: nextCursor,
        has_more: hasMore,
        count: bookings.length,
      },
    };
  }

  // ── OFFSET mode (backward-compatible) ─────────────────────────────────────
  const offset = (Math.max(parseInt(page) || 1, 1) - 1) * safeLimit;

  const query = `
    SELECT 
      b.id AS booking_id,
      b.booking_ref,
      b.status::text AS booking_status,
      COALESCE(b.amount, pay.amount, p.price_quote) AS amount,
      b."createdAt",

      up.name AS user_name,
      u.phone_number,
      u.email,

      tp.name AS partner_name,
      tu.phone_number AS partner_phone,

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
    LEFT JOIN users tu ON tu.id = b.traveller_id
    LEFT JOIN user_profiles tp ON tp.user_id = tu.id
    LEFT JOIN payments pay ON pay.booking_id = b.id
    LEFT JOIN address pa ON pa.id = p.pickup_address_id
    LEFT JOIN address da ON da.id = p.delivery_address_id

    ORDER BY b."createdAt" DESC
    LIMIT :limit OFFSET :offset
  `;

  const bookings = await sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: { limit: safeLimit, offset },
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
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
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

  try {
    console.log('Starting getTravelersForKYC with params:', { page, limit, status, offset });

    // Build the WHERE clause for status filtering
    let whereClause = '';
    let replacements = { limit, offset };
    
    if (status) {
      whereClause = 'WHERE kyc.status = :status';
      replacements.status = status;
    }

    // Main query to get KYC records with user details
    const travelers = await sequelize.query(
      `
      SELECT 
        kyc.id AS kyc_id,
        kyc.user_id,
        kyc.status AS kyc_status,
        kyc.created_at AS kyc_created_at,
        kyc.updated_at AS kyc_updated_at,
        
        -- User basic info
        u.email,
        u.phone_number,
        u."createdAt" AS user_created_at,
        
        -- Name from KYC (preferred) or user profile (fallback)
        COALESCE(
          CASE 
            WHEN kyc.first_name IS NOT NULL AND kyc.last_name IS NOT NULL 
            THEN CONCAT(kyc.first_name, ' ', kyc.last_name)
            WHEN kyc.first_name IS NOT NULL 
            THEN kyc.first_name
            ELSE NULL
          END,
          up.name,
          u.email
        ) AS name,
        
        -- Location from user profile
        up.city,
        up.state
        
      FROM traveller_kyc kyc
      LEFT JOIN users u ON u.id = kyc.user_id
      LEFT JOIN user_profiles up ON up.user_id = kyc.user_id
      ${whereClause}
      ORDER BY kyc.created_at DESC
      LIMIT :limit OFFSET :offset
      `,
      {
        replacements,
        type: QueryTypes.SELECT
      }
    );

    console.log('KYC query executed successfully, found records:', travelers.length);

    // Count total travelers for pagination
    const countResult = await sequelize.query(
      `
      SELECT COUNT(*) as total 
      FROM traveller_kyc kyc
      ${whereClause}
      `,
      {
        replacements: status ? { status } : {},
        type: QueryTypes.SELECT
      }
    );

    const total = parseInt(countResult[0].total);
    console.log('Total count:', total);

    return {
      travelers,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    console.error('Detailed error in getTravelersForKYC:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    // Return empty result instead of throwing to prevent 500 error
    return {
      travelers: [],
      pagination: {
        total: 0,
        page: Number(page),
        limit: Number(limit),
        totalPages: 0
      }
    };
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

    LEFT JOIN user_profiles up   -- ✅ ADD THIS
  ON u.id = up.user_id
  
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

  auditLog({
    action:       `KYC_${status}`,
    actorId:      null,
    actorRole:    "admin",
    resourceType: "traveller_kyc",
    resourceId:   kycId,
    meta:         { user_id: kyc.user_id, new_status: status },
  });

  // Invalidate KYC cache so next request re-fetches from DB
  await invalidateKycCache(kyc.user_id);

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
  const limit = parseInt(params.limit) || 10;
  const offset = (page - 1) * limit;

  const rows = await sequelize.query(`
    SELECT
      b.id AS booking_id,
      b.booking_ref,
      b.status AS booking_status,
      COALESCE(b.amount, pay.amount, p.price_quote) AS amount,
      b."createdAt",
      up.name AS user_name,
      tp.name AS partner_name,
      pa.city AS pickup_city,
      da.city AS delivery_city
    FROM booking b
    LEFT JOIN parcel p ON p.id = b.parcel_id
    LEFT JOIN users u ON u.id = p.user_id
    LEFT JOIN user_profiles up ON up.user_id = u.id
    LEFT JOIN users t ON t.id = b.traveller_id
    LEFT JOIN user_profiles tp ON tp.user_id = t.id
    LEFT JOIN payments pay ON pay.booking_id = b.id
    LEFT JOIN address pa ON pa.id = p.pickup_address_id
    LEFT JOIN address da ON da.id = p.delivery_address_id
    ORDER BY b."createdAt" DESC
    LIMIT :limit OFFSET :offset
  `, { type: QueryTypes.SELECT, replacements: { limit, offset } });

  const countResult = await sequelize.query(
    `SELECT COUNT(*) AS total FROM booking`,
    { type: QueryTypes.SELECT }
  );

  const total = parseInt(countResult[0].total);

  return {
    data: rows,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
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
    where: {
      status: ["CREATED", "MATCHING", "CONFIRMED", "PICKUP", "IN_TRANSIT"],
    },
  });
};

export const getTotalRevenueService = async () => {
  const result = await Payment.findOne({
    where: { status: "SUCCESS" },
    attributes: [[sequelize.fn("SUM", sequelize.col("amount")), "total_revenue"]],
    raw: true,
  });
  return parseFloat(result?.total_revenue) || 0;
};

export const getRecentUserService = async (params = {}) => {
  const page = parseInt(params.page) || 1;
  const limit = parseInt(params.limit) || 10;
  const offset = (page - 1) * limit;

  const sqlQuery = `
    SELECT
      u.id,
      up.name AS full_name,
      u.email,
      u."createdAt"
    FROM users u
    INNER JOIN user_profiles up ON up.user_id = u.id
    WHERE EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = u.id AND r.name = 'INDIVIDUAL'
    )
    ORDER BY u."createdAt" DESC
    LIMIT :limit OFFSET :offset
  `;

  const countQuery = `
    SELECT COUNT(*) AS total FROM users u
    WHERE EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = u.id AND r.name = 'INDIVIDUAL'
    )
  `;

  const [users, countResult] = await Promise.all([
    sequelize.query(sqlQuery, { type: QueryTypes.SELECT, replacements: { limit, offset } }),
    sequelize.query(countQuery, { type: QueryTypes.SELECT }),
  ]);

  return {
    data: users,
    pagination: { total: parseInt(countResult[0].total), page, limit, totalPages: Math.ceil(parseInt(countResult[0].total) / limit) },
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
    recentUsers: recentUsers.data,
    recentTravellers: recentTravellers.data,
    recentBookings: recentBookings.data
  };
};

// ─── GET SINGLE USER DETAILS ───────────────────────────────────────────────
export const getUserDetailsService = async (userId) => {
  const rows = await sequelize.query(`
    SELECT
      u.id,
      up.name,
      u.email,
      u.phone_number,
      up.city,
      up.state,
      u."createdAt",
      CASE WHEN tk.status = 'APPROVED' THEN true ELSE false END AS kyc_verified,
      tk.status AS kyc_status,
      COUNT(DISTINCT b.id) AS total_bookings,
      COALESCE(SUM(CASE WHEN pay.status = 'SUCCESS' THEN pay.amount ELSE 0 END), 0) AS total_spent
    FROM users u
    LEFT JOIN user_profiles up ON up.user_id = u.id
    LEFT JOIN traveller_kyc tk ON tk.user_id = u.id
    LEFT JOIN parcel parc ON parc.user_id = u.id
    LEFT JOIN booking b ON b.parcel_id = parc.id
    LEFT JOIN payments pay ON pay.booking_id = b.id
    WHERE u.id = :userId
    GROUP BY u.id, up.name, u.email, u.phone_number, up.city, up.state, u."createdAt", tk.status
  `, { type: QueryTypes.SELECT, replacements: { userId } });

  return rows[0] || null;
};

export const getUserBookingsService = async (userId) => {
  return await sequelize.query(`
    SELECT
      b.id AS booking_id,
      b.booking_ref,
      b.status::text AS booking_status,
      COALESCE(b.amount, parc.price_quote) AS amount,
      b."createdAt",
      pa.address AS pickup_address, pa.city AS pickup_city, pa.state AS pickup_state,
      da.address AS delivery_address, da.city AS delivery_city, da.state AS delivery_state,
      tp.name AS partner_name,
      t.phone_number AS partner_phone,
      parc.parcel_ref, parc.parcel_type, parc.weight, parc.description, parc.status::text AS parcel_status
    FROM booking b
    JOIN parcel parc ON parc.id = b.parcel_id
    LEFT JOIN address pa ON pa.id = parc.pickup_address_id
    LEFT JOIN address da ON da.id = parc.delivery_address_id
    LEFT JOIN users t ON t.id = b.traveller_id
    LEFT JOIN user_profiles tp ON tp.user_id = t.id
    WHERE parc.user_id = :userId

    UNION ALL

    SELECT
      NULL AS booking_id,
      NULL AS booking_ref,
      parc.status::text AS booking_status,
      parc.price_quote AS amount,
      parc."createdAt",
      pa.address AS pickup_address, pa.city AS pickup_city, pa.state AS pickup_state,
      da.address AS delivery_address, da.city AS delivery_city, da.state AS delivery_state,
      NULL AS partner_name,
      NULL AS partner_phone,
      parc.parcel_ref, parc.parcel_type, parc.weight, parc.description, parc.status::text AS parcel_status
    FROM parcel parc
    LEFT JOIN address pa ON pa.id = parc.pickup_address_id
    LEFT JOIN address da ON da.id = parc.delivery_address_id
    WHERE parc.user_id = :userId
      AND parc.status = 'CANCELLED'
      AND NOT EXISTS (SELECT 1 FROM booking b2 WHERE b2.parcel_id = parc.id)

    ORDER BY "createdAt" DESC
  `, { type: QueryTypes.SELECT, replacements: { userId } });
};

export const getUserPaymentsService = async (userId) => {
  return await sequelize.query(`
    SELECT
      p.id AS payment_id,
      p.amount,
      p.status AS payment_status,
      p."createdAt",
      b.id AS booking_id
    FROM payments p
    JOIN booking b ON b.id = p.booking_id
    JOIN parcel parc ON parc.id = b.parcel_id
    WHERE parc.user_id = :userId
    ORDER BY p."createdAt" DESC
  `, { type: QueryTypes.SELECT, replacements: { userId } });
};

export const getAllDisputes = async ({ page = 1, limit = 10, status = null }) => {
  const offset = (page - 1) * limit;
  let whereClause = "";
  let replacements = { limit, offset };

  if (status) {
    whereClause = "WHERE d.status = :status";
    replacements.status = status;
  }

  const disputes = await sequelize.query(
    `SELECT
      d.id AS dispute_id, d.dispute_type, d.description,
      d.status AS dispute_status, d.role, d."created_at",
      b.id AS booking_id, b.status AS booking_status, b.amount,
      u.id AS raised_by_id, up.name AS raised_by_name, u.email, u.phone_number,
      p.id AS parcel_id, p.parcel_type, p.weight,
      pa.address AS pickup_address, pa.city AS pickup_city,
      da.address AS delivery_address, da.city AS delivery_city
    FROM disputes d
    LEFT JOIN booking b ON b.id = d.booking_id
    LEFT JOIN users u ON u.id = d.raised_by
    LEFT JOIN user_profiles up ON up.user_id = u.id
    LEFT JOIN parcel p ON p.id = b.parcel_id
    LEFT JOIN address pa ON pa.id = p.pickup_address_id
    LEFT JOIN address da ON da.id = p.delivery_address_id
    ${whereClause}
    ORDER BY d."created_at" DESC
    LIMIT :limit OFFSET :offset`,
    { type: QueryTypes.SELECT, replacements }
  );

  const countResult = await sequelize.query(
    `SELECT COUNT(*) AS total FROM disputes d ${whereClause}`,
    { type: QueryTypes.SELECT, replacements: status ? { status } : {} }
  );

  const total = parseInt(countResult[0].total);

  return {
    disputes,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit),
    },
  };
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

// ---------------------------------- TRAVELER DETAILS SERVICES -------------------------------------------

export const getTravelerDetailsService = async (userId) => {
  const rows = await sequelize.query(`
    SELECT
      u.id,
      COALESCE(
        CASE 
          WHEN tk.first_name IS NOT NULL AND tk.last_name IS NOT NULL 
          THEN CONCAT(tk.first_name, ' ', tk.last_name)
          WHEN tk.first_name IS NOT NULL 
          THEN tk.first_name
          ELSE NULL
        END,
        up.name,
        u.email
      ) AS name,
      u.email,
      u.phone_number,
      up.city,
      up.state,
      u."createdAt",
      CASE WHEN tk.status = 'APPROVED' THEN true ELSE false END AS kyc_verified,
      tk.status AS kyc_status,
      tk.dob,
      tk.gender,
      tk.address AS kyc_address,
      tk.aadhar_number,
      tk.pan_number,
      tk.driving_number,
      tk.aadhar_front,
      tk.aadhar_back,
      tk.pan_front,
      tk.pan_back,
      tk.driving_photo,
      tk.selfie,
      tk.account_number,
      tk.account_holder,
      tk.ifsc,
      tk.bank_name,
      tk.bank_verified,
      tp.vehicle_type,
      tp.vehicle_number AS license_number,
      COUNT(DISTINCT b.id) AS total_deliveries,
      COUNT(DISTINCT CASE WHEN b.status = 'DELIVERED' THEN b.id END) AS completed_deliveries,
      COALESCE(SUM(CASE WHEN pay.status = 'SUCCESS' THEN pay.amount * 0.9 ELSE 0 END), 0) AS total_earnings,
      COUNT(DISTINCT tr.id) AS active_routes,
      COALESCE(AVG(f.rating), 0) AS average_rating,
      COUNT(DISTINCT f.id) AS total_reviews
    FROM users u
    LEFT JOIN user_profiles up ON up.user_id = u.id
    LEFT JOIN traveller_profiles tp ON tp.user_id = u.id
    LEFT JOIN traveller_kyc tk ON tk.user_id = u.id
    LEFT JOIN booking b ON b.traveller_id = u.id
    LEFT JOIN payments pay ON pay.booking_id = b.id
    LEFT JOIN traveller_routes tr ON tr.traveller_profile_id = tp.id AND tr.status = 'ACTIVE'
    LEFT JOIN feedbacks f ON f.traveller_id = u.id
    WHERE u.id = :userId
    GROUP BY u.id, up.name, u.email, u.phone_number, up.city, up.state, u."createdAt",
      tk.status, tk.first_name, tk.last_name, tk.dob, tk.gender, tk.address,
      tk.aadhar_number, tk.pan_number, tk.driving_number,
      tk.aadhar_front, tk.aadhar_back, tk.pan_front, tk.pan_back, tk.driving_photo, tk.selfie,
      tk.account_number, tk.account_holder, tk.ifsc, tk.bank_name, tk.bank_verified,
      tp.vehicle_type, tp.vehicle_number
  `, { type: QueryTypes.SELECT, replacements: { userId } });

  return rows[0] || null;
};

export const getTravelerBookingsService = async (userId) => {
  const rows = await sequelize.query(`
    SELECT
      b.id AS booking_id,
      b.booking_ref,
      b.status AS booking_status,
      b.amount,
      b."createdAt",
      parc.parcel_ref,
      parc.parcel_type,
      parc.weight,
      pickup_addr.city AS pickup_city,
      pickup_addr.state AS pickup_state,
      pickup_addr.address AS pickup_address,
      delivery_addr.city AS delivery_city,
      delivery_addr.state AS delivery_state,
      delivery_addr.address AS delivery_address,
      sender_profile.name AS sender_name,
      sender.email AS sender_email,
      sender.phone_number AS sender_phone
    FROM booking b
    LEFT JOIN parcel parc ON parc.id = b.parcel_id
    LEFT JOIN address pickup_addr ON pickup_addr.id = parc.pickup_address_id
    LEFT JOIN address delivery_addr ON delivery_addr.id = parc.delivery_address_id
    LEFT JOIN users sender ON sender.id = parc.user_id
    LEFT JOIN user_profiles sender_profile ON sender_profile.user_id = sender.id
    WHERE b.traveller_id = :userId
    ORDER BY b."createdAt" DESC
  `, { type: QueryTypes.SELECT, replacements: { userId } });

  return rows;
};

export const getTravelerPaymentsService = async (userId) => {
  const rows = await sequelize.query(`
    SELECT
      pay.id,
      pay.amount * 0.9 AS amount,
      pay.status,
      pay.razorpay_payment_id,
      pay.razorpay_order_id,
      pay."createdAt",
      b.booking_ref,
      b.payment_mode,
      parc.parcel_ref
    FROM payments pay
    LEFT JOIN booking b ON b.id = pay.booking_id
    LEFT JOIN parcel parc ON parc.id = b.parcel_id
    WHERE b.traveller_id = :userId
    ORDER BY pay."createdAt" DESC
  `, { type: QueryTypes.SELECT, replacements: { userId } });

  return rows;
};

export const getSettingsByCategory = async (category) => {
  return await sequelize.query(
    `SELECT key, value, data_type FROM platform_settings WHERE category ILIKE :category`,
    {
      replacements: { category: category.trim() },
      type: QueryTypes.SELECT,
    }
  );
};

export const bulkUpdateSettings = async (settingsArray) => {
  const transaction = await sequelize.transaction();
  try {
    for (const item of settingsArray) {
      await sequelize.query(
        `INSERT INTO platform_settings (key, value, category, data_type)
         VALUES (:key, :value, :category, :data_type)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        {
          replacements: {
            key: item.key,
            value: String(item.value),
            category: item.category.toUpperCase(),
            data_type: item.data_type || "string",
          },
          type: QueryTypes.INSERT,
          transaction,
        }
      );
    }
    await transaction.commit();
    // Invalidate platform settings cache so next request re-fetches from DB
    await invalidateSettingsCache();
    return true;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export const getEmailTemplates = async () => {
  return await sequelize.query(
    `SELECT id, slug, name, subject, body_html, updated_at FROM email_templates ORDER BY id ASC`,
    { type: QueryTypes.SELECT }
  );
};

export const updateEmailTemplate = async (id, { subject, body_html }) => {
  const [updated] = await sequelize.query(
    `UPDATE email_templates SET subject = :subject, body_html = :body_html, updated_at = NOW()
     WHERE id = :id RETURNING id, slug, name, subject, body_html, updated_at`,
    {
      replacements: { id: parseInt(id), subject, body_html },
      type: QueryTypes.SELECT,
    }
  );
  if (!updated) throw new Error("Email template not found");
  return updated;
};
