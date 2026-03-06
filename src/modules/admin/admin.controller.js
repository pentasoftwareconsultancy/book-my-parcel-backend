import { getAllUsers } from "./admin.service.js";
import { getAllBookings } from "./admin.service.js";
import { getTravelersForKYC, updateTravelerKYCStatus, getActiveBookingCountService, getTotalRevenueService } from "./admin.service.js";
import sequelize from "../../config/database.config.js";

import Booking from "../booking/booking.model.js";
import Parcel from "../parcel/parcel.model.js";
import User from "../user/user.model.js";
import TravellerTrip from "../traveller/travellerTrip.model.js";
import Payment from "../payment/payment.model.js";

import Role from "../user/role.model.js";

export const fetchAllUsers = async (req, res) => {
  try {
    const { page, limit, role } = req.query;

    const result = await getAllUsers({
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      role: role || null
    });

    res.status(200).json({
      success: true,
      message: "Users fetched successfully",
      ...result
    });
  } catch (error) {
    console.error("ADMIN FETCH ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

export const fetchAllBookings = async (req, res) => {
  try {
    const { page, limit, status } = req.query;

    const result = await getAllBookings({
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      status: status || null
    });

    res.status(200).json({
      success: true,
      message: "Bookings fetched successfully",
      ...result
    });
  } catch (error) {
    console.error("ADMIN BOOKINGS ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch bookings"
    });
  }
};

export const fetchTravelersForKYC = async (req, res) => {
  try {
    const { page, limit, status } = req.query;

    const result = await getTravelersForKYC({
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      status: status || null
    });

    res.status(200).json({
      success: true,
      message: "Travelers for KYC fetched successfully",
      ...result
    });
  } catch (error) {
    console.error("ADMIN TRAVELERS KYC ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch travelers for KYC"
    });
  }
};

export const updateKYCStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const result = await updateTravelerKYCStatus(id, status);

    res.status(200).json({
      success: true,
      message: "KYC status updated successfully",
      data: result
    });
  } catch (error) {
    console.error("ADMIN UPDATE KYC ERROR:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update KYC status"
    });
  }
};

export const getRecentBookings = async (req, res) => {
  try {
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
          as: "traveller_trip", // ✅ FIXED
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

    return res.status(200).json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch bookings",
    });
  }
};

// ---------------------------------- admin overview dashboard -------------------------------------------

export const getAdminUserRoleStats = async (req, res, next) => {
  try {
    const roles = await Role.findAll({
      where: {
        name: ["TRAVELLER", "INDIVIDUAL"],
      },
      attributes: [
        "name",
        [sequelize.fn("COUNT", sequelize.col("users.id")), "total_users"],
      ],
      include: [
        {
          model: User,
          as: "users",   // ✅ MUST MATCH ASSOCIATION ALIAS
          attributes: [],
          through: { attributes: [] }, // remove user_roles fields
        },
      ],
      group: ["roles.id"],
    });

    const stats = {
      travellers: 0,
      individuals: 0,
    };

    roles.forEach((role) => {
      const count = parseInt(role.get("total_users"));

      if (role.name === "TRAVELLER") {
        stats.travellers = count;
      }

      if (role.name === "INDIVIDUAL") {
        stats.individuals = count;
      }
    });

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Admin Role Stats Error:", error);
    next(error);
  }
};

export const getActiveBookingCount = async (req, res, next) => {
  try {
    const count = await getActiveBookingCountService();

    res.json({
      success: true,
      total_active_bookings: count,
    });
  } catch (error) {
    next(error);
  }
};

export const getTotalRevenue = async (req, res, next) => {
  try {
    const revenue = await getTotalRevenueService();

    res.json({
      success: true,
      total_revenue: revenue,
    });
  } catch (error) {
    next(error);
  }
};