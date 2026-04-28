import { getAllUsers } from "./admin.service.js";
import { getAllBookings } from "./admin.service.js";
import { getTravelersForKYC, updateTravelerKYCStatus, getAdminDashboardService,getAllPaymentsAdminService } from "./admin.service.js";
import twilioService from "../../services/twilio.service.js";
import { sendToTraveller } from "../../services/notification.service.js";
import User from "../user/user.model.js";
import { getAllDisputes } from "./admin.service.js";
import { responseError,responseSuccess } from "../../utils/response.util.js";

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

    // ── Notify traveller via SMS + in-app notification ──────────────────
    try {
      const user = await User.findByPk(result.user_id);
      if (user) {
        const isApproved = status === "APPROVED";
        const isRejected = status === "REJECTED";

        // In-app notification (always)
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

        // SMS notification (best-effort)
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
      // Non-fatal — KYC update already succeeded
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

    res.status(200).json({
      success: true,
      data: dashboard
    });

  } catch (error) {
    console.error("Dashboard Error:", error);
    next(error);
  }
};

// ---------------------------------- GET DISPUTES -------------------------------------------

export const getAllDisputesController = async (req, res) => {
  try {
    const { page, limit, status } = req.query;

    const result = await getAllDisputes({
      page,
      limit,
      status,
    });

    return responseSuccess(res, result, "Disputes fetched successfully");
  } catch (err) {
    return responseError(res, err.message);
  }
};


//GET ADMIN CONTROLLER FOR PAYMENTS
export const getAllPaymentsAdminController = async (req, res) => {
  try {
    const data = await getAllPaymentsAdminService();

    res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error("Admin Payment Controller Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch payments",
    });
  }
};