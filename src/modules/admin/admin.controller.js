import { getAllUsers } from "./admin.service.js";
import { getAllBookings } from "./admin.service.js";

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
