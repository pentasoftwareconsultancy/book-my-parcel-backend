import * as userService from "./user.service.js";
import { responseSuccess, responseError } from "../../utils/response.util.js";

/**
 * GET USER ORDERS
 * GET /api/user/dashboard/orders
 */
export const getUserOrders = async (req, res, next) => {
  try {
    const userId = req.user.id; // ✅ from JWT

    const data = await userService.fetchUserOrders(userId, req.query);

    return responseSuccess(res, data, "Orders fetched successfully");

  } catch (error) {
    console.error("getUserOrders ERROR:", error.message);
    next(error);
  }
};


/**
 * GET ORDER DETAILS
 * GET /api/user/orders/:bookingId
 */
export const getOrderDetails = async (req, res, next) => {
  try {
    const userId    = req.user.id;
    const bookingId = req.params.bookingId;

    if (!bookingId) {
      return responseError(res, "Booking ID is required", 400);
    }

    const data = await userService.fetchOrderDetails(userId, bookingId);

    return responseSuccess(res, data, "Order details fetched");

  } catch (error) {
    console.error("getOrderDetails ERROR:", error.message);
    if (error.message === "Order not found") {
      return responseError(res, "Order not found", 404);
    }
    next(error);
  }
};


/**
 * GET USER STATS
 * GET /api/user/dashboard/stats
 */
export const getUserStats = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const stats = await userService.fetchUserStats(userId);

    return responseSuccess(res, { stats }, "Stats fetched successfully");

  } catch (error) {
    console.error("getUserStats ERROR:", error.message);
    next(error);
  }
};


/**
 * GET PROFILE
 * GET /api/user/profile
 */
export const getProfileController = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const data = await userService.getProfile(userId);

    return responseSuccess(res, data, "Profile fetched");

  } catch (error) {
    console.error("getProfile ERROR:", error.message);
    next(error);
  }
};


/**
 * UPDATE PROFILE
 * PUT /api/user/profile
 */
export const updateUserProfileController = async (req, res, next) => {
  try {
    const userId = req.user.id;

    if (!req.body || Object.keys(req.body).length === 0) {
      return responseError(res, "No data provided", 400);
    }

    const data = await userService.updateProfile(userId, req.body);

    return responseSuccess(res, data, "Profile updated");

  } catch (error) {
    console.error("updateProfile ERROR:", error.message);
    next(error);
  }
};