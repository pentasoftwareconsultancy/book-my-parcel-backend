import sequelize from "../../config/database.config.js";
import { QueryTypes } from "sequelize";

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
    whereClause = "WHERE role = :role";
    replacements.role = role;
  }

  // Fetch users
  const users = await sequelize.query(
    `
    SELECT * FROM users
    ${whereClause}
    ORDER BY createdAt DESC
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
    SELECT COUNT(*) as total FROM users
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

