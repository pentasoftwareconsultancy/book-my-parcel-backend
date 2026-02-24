import { getAllUsers } from "./admin.service.js";
import { getAllBookings } from "./admin.service.js";
import { getTravelersForKYC, updateTravelerKYCStatus } from "./admin.service.js";

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
