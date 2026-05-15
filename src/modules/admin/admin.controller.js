import { getAllUsers } from "./admin.service.js";
import { getAllBookings } from "./admin.service.js";
import {
  getTravelersForKYC,
  updateTravelerKYCStatus,
  getAdminDashboardService,
  getAllPaymentsAdminService,
  getUserDetailsService,
  getUserBookingsService,
  getUserPaymentsService,
  getTravelerDetailsService,
  getTravelerBookingsService,
  getTravelerPaymentsService,
} from "./admin.service.js";
import twilioService from "../../services/twilio.service.js";
import { sendToTraveller } from "../../services/notification.service.js";
import User from "../user/user.model.js";
import { getAllDisputes } from "./admin.service.js";
import { responseError, responseSuccess } from "../../utils/response.util.js";
import * as settingsService from "./admin.service.js";

export const fetchAllUsers = async (req, res) => {
  try {
    const { page, limit } = req.pagination;
    const { role } = req.query;

    const result = await getAllUsers({
      page,
      limit,
      role: role || null,
    });

    console.log("Pagination:", req.pagination);

    res.status(200).json({
      success: true,
      message: "Users fetched successfully",
      users: result.users,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("ADMIN FETCH ERROR:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const fetchAllBookings = async (req, res) => {
  try {
    const { page, limit } = req.pagination;
    const { status } = req.query;

    const result = await getAllBookings({
      page,
      limit,
      status: status || null,
    });
    res.status(200).json({
      success: true,
      message: "Bookings fetched successfully",
      ...result,
    });
  } catch (error) {
    console.error("ADMIN BOOKINGS ERROR:", error);
    res.status(500).json({ success: false, message: "Failed to fetch bookings" });
  }
};

export const fetchTravelersForKYC = async (req, res) => {
  try {
    const { page, limit } = req.pagination;
    const { status } = req.query;

    const result = await getTravelersForKYC({
      page,
      limit,
      status: status || null,
    });

    console.log("Successfully fetched travelers:", result.travelers.length);

    res.status(200).json({
      success: true,
      message: "Travelers for KYC fetched successfully",
      ...result,
    });
  } catch (error) {
    console.error("ADMIN TRAVELERS KYC ERROR:", error);
    res.status(200).json({
      success: true,
      message: "No travelers found",
      travelers: [],
      pagination: {
        total: 0,
        page: req.pagination?.page || 1,
        limit: req.pagination?.limit || 10,
        totalPages: 0,
      },
    });
  }
};

export const updateKYCStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const result = await updateTravelerKYCStatus(id, status);

    // ── Notify traveller via SMS + in-app notification ──────────────────
    try {
      const user = await User.findByPk(result.user_id);
      if (user) {
        const isApproved = status === "APPROVED";
        const isRejected = status === "REJECTED";

        const notifTitle = isApproved
          ? "KYC Approved 🎉"
          : isRejected
            ? "KYC Rejected"
            : "KYC Status Updated";

        const notifMessage = isApproved
          ? "Your KYC has been approved! You can now accept parcel requests and withdraw earnings."
          : isRejected
            ? "Your KYC was rejected. Please re-submit with correct documents."
            : `Your KYC status has been updated to ${status}.`;

        await sendToTraveller(result.user_id, notifTitle, notifMessage, {
          type: "kyc_status_update",
          kyc_status: status,
        });

        if (user.phone_number) {
          const smsMessage = isApproved
            ? `Book My Parcel: Your KYC has been approved! You can now start accepting parcel deliveries and earn money.`
            : isRejected
              ? `Book My Parcel: Your KYC was rejected. Please log in and re-submit your documents with correct information.`
              : `Book My Parcel: Your KYC status has been updated to ${status}.`;

          await twilioService.sendSMS(user.phone_number, smsMessage);
        }
      }
    } catch (notifErr) {
      console.error("[Admin] Failed to send KYC notification:", notifErr.message);
    }

    res.status(200).json({
      success: true,
      message: "KYC status updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("ADMIN UPDATE KYC ERROR:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update KYC status",
    });
  }
};

// ---------------------------------- admin overview dashboard -------------------------------------------

export const getAdminDashboard = async (req, res, next) => {
  try {
    const dashboard = await getAdminDashboardService(req.query);
    res.status(200).json({ success: true, data: dashboard });
  } catch (error) {
    console.error("Dashboard Error:", error);
    next(error);
  }
};

// ---------------------------------- GET DISPUTES -------------------------------------------

export const getAllDisputesController = async (req, res) => {
  try {
    const { page, limit } = req.pagination;
    const { status } = req.query;

    const result = await getAllDisputes({ page, limit, status });
    return responseSuccess(res, result, "Disputes fetched successfully");
  } catch (err) {
    return responseError(res, err.message);
  }
};

// ---------------------------------- GET SINGLE USER DETAILS -------------------------------------------

export const getUserDetailsController = async (req, res) => {
  try {
    const { id } = req.params;
    const [user, bookings, payments] = await Promise.all([
      getUserDetailsService(id),
      getUserBookingsService(id),
      getUserPaymentsService(id),
    ]);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.status(200).json({ success: true, data: { user, bookings, payments } });
  } catch (error) {
    console.error("GET USER DETAILS ERROR:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const getTravelerDetailsController = async (req, res) => {
  try {
    const { id } = req.params;
    const [traveler, bookings, payments] = await Promise.all([
      getTravelerDetailsService(id),
      getTravelerBookingsService(id),
      getTravelerPaymentsService(id),
    ]);
    if (!traveler) return res.status(404).json({ success: false, message: "Traveler not found" });
    res.status(200).json({ success: true, data: { traveler, bookings, payments } });
  } catch (error) {
    console.error("GET TRAVELER DETAILS ERROR:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ---------------------------------- GET ADMIN PAYMENTS -------------------------------------------

export const getAllPaymentsAdminController = async (req, res) => {
  try {
    const data = await getAllPaymentsAdminService();
    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    console.error("Admin Payment Controller Error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch payments" });
  }
};

// ---------------------------------- SETTINGS -------------------------------------------

const VALID_CATEGORIES = ["general", "payments", "notifications", "security"];

export const getTabSettings = async (req, res, next) => {
  try {
    const { category } = req.params;

    if (!VALID_CATEGORIES.includes(category.toLowerCase())) {
      return responseError(res, `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}`, 400);
    }

    const settings = await settingsService.getSettingsByCategory(category);

    const config = settings.reduce((acc, curr) => {
      let val = curr.value;
      if (curr.data_type === "number") val = Number(val);
      if (curr.data_type === "boolean") val = val === "true";
      acc[curr.key] = val;
      return acc;
    }, {});

    return responseSuccess(res, config, "Settings fetched successfully");
  } catch (error) {
    next(error);
  }
};

export const saveTabSettings = async (req, res, next) => {
  try {
    const { category, settings } = req.body;

    if (!category || !Array.isArray(settings) || settings.length === 0) {
      return responseError(res, "category and a non-empty settings array are required", 400);
    }

    if (!VALID_CATEGORIES.includes(category.toLowerCase())) {
      return responseError(res, `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}`, 400);
    }

    for (const item of settings) {
      if (!item.key || !item.category || item.value === undefined) {
        return responseError(res, "Each setting must have key, category, and value", 400);
      }
    }

    await settingsService.bulkUpdateSettings(settings);
    return responseSuccess(res, null, `${category} settings updated successfully`);
  } catch (error) {
    next(error);
  }
};

export const listEmailTemplates = async (req, res, next) => {
  try {
    const templates = await settingsService.getEmailTemplates();
    return responseSuccess(res, templates, "Email templates fetched successfully");
  } catch (error) {
    next(error);
  }
};

export const updateEmailTemplateController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { subject, body_html } = req.body;

    if (!subject || !body_html) {
      return responseError(res, "subject and body_html are required", 400);
    }

    if (!subject.trim() || subject.length > 255) {
      return responseError(res, "Subject must be 1-255 characters", 400);
    }

    if (!body_html.trim() || body_html.length > 50000) {
      return responseError(res, "Body HTML must be 1-50000 characters", 400);
    }

    const updated = await settingsService.updateEmailTemplate(id, { subject, body_html });
    return responseSuccess(res, updated, "Email template updated successfully");
  } catch (error) {
    if (error.message === "Email template not found") {
      return responseError(res, error.message, 404);
    }
    next(error);
  }
};
