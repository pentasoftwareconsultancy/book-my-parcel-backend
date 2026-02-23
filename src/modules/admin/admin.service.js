import sequelize from "../../config/database.config.js";
import { QueryTypes } from "sequelize";
import TravellerKYC from "../traveller/travellerKYC.model.js";
import User from "../user/user.model.js";
import { KYC_STATUS } from "../../middlewares/role.middleware.js";

/**
 * Admin Fetch Users with Pagination + Role Filter
 * @param {number} page
 * @param {number} limit
 * @param {string} role
 */
export const getAllUsers = async ({ page = 1, limit = 10, role = null }) => {
  const offset = (page - 1) * limit;

  let whereClause = "";
  let replacements = { limit, offset };

  if (role) {
    // Role filtering requires joining with user_roles and roles tables
    whereClause = `
      WHERE EXISTS (
        SELECT 1 FROM user_roles ur 
        JOIN roles r ON ur.role_id = r.id 
        WHERE ur.user_id = u.id AND r.name = :role
      )
    `;
    replacements.role = role;
  }

  // Fetch users
  const users = await sequelize.query(
    `
    SELECT 
      u.id,
      u.name,
      u.phone_number,
      u.alternate_phone,
      u.email,
      u.address,
      u.city,
      u.state,
      u.password,
      u.is_active,
      u.is_verified,
      u."createdAt",
      u."updatedAt",
      CASE 
        WHEN EXISTS (
          SELECT 1 FROM traveller_kyc tk 
          WHERE tk.user_id = u.id AND tk.status = 'APPROVED'
        ) THEN true 
        ELSE false 
      END as kyc_verified
    FROM users u
    ${whereClause}
    ORDER BY u."createdAt" DESC
    LIMIT :limit OFFSET :offset
    `,
    {
      replacements,
      type: QueryTypes.SELECT
    }
  );

  // Count total users (for pagination meta)
  const countResult = await sequelize.query(
    `
    SELECT COUNT(*) as total FROM users u
    ${whereClause}
    `,
    {
      replacements: role ? { role } : {},
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
      u.city,
      u.state,
      u."createdAt" AS user_created_at,
      kyc.id AS kyc_id,
      kyc.status AS kyc_status,
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

