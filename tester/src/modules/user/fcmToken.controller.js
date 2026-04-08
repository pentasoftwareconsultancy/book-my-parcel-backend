import { responseSuccess, responseError } from "../../utils/response.util.js";
import { storeFCMToken, removeFCMToken } from "../../services/notification.service.js";

// ─── POST /api/user/fcm-token - Store FCM token ────────────────────────────
export async function storeFCMTokenEndpoint(req, res) {
  try {
    const userId = req.user.id;
    const { token, device_type = "mobile" } = req.body;

    if (!token) {
      return responseError(res, "FCM token is required", 400);
    }

    const result = await storeFCMToken(userId, token, device_type);

    if (!result.success) {
      return responseError(res, result.error || "Failed to store FCM token", 500);
    }

    return responseSuccess(res, {
      message: result.message,
    }, "FCM token stored successfully");
  } catch (error) {
    console.error("[FCM] Error storing token:", error.message);
    return responseError(res, error.message || "Failed to store FCM token", 500);
  }
}

// ─── DELETE /api/user/fcm-token - Remove FCM token ────────────────────────
export async function removeFCMTokenEndpoint(req, res) {
  try {
    const userId = req.user.id;
    const { token } = req.body;

    if (!token) {
      return responseError(res, "FCM token is required", 400);
    }

    const result = await removeFCMToken(userId, token);

    if (!result.success) {
      return responseError(res, result.error || "Failed to remove FCM token", 500);
    }

    return responseSuccess(res, {
      message: result.message,
    }, "FCM token removed successfully");
  } catch (error) {
    console.error("[FCM] Error removing token:", error.message);
    return responseError(res, error.message || "Failed to remove FCM token", 500);
  }
}
