import {
  getNotificationsService,
  markOneReadService,
  markAllReadService,
  deleteNotificationService,
} from "./notification.service.js";
import { responseSuccess, responseError } from "../../utils/response.util.js";

// GET /api/notifications/count — returns accurate unread count from DB (cache-busted)
export async function getUnreadCount(req, res) {
  try {
    // Always invalidate cache first so we get a fresh DB count
    const { invalidateNotificationCount, getNotificationCount } = await import("../../redis/cache/notificationCountCache.service.js");
    await invalidateNotificationCount(req.user.id);
    const count = await getNotificationCount(req.user.id);
    return responseSuccess(res, { unread_count: count }, "Unread count fetched");
  } catch (err) {
    return responseError(res, err.message, 500);
  }
}

// GET /api/notifications?role=&page=&limit=
export async function getNotifications(req, res) {
  try {
    const { role, page = 1, limit = 20 } = req.query;

    if (!role) return responseError(res, "role query param is required", 400);

    const VALID_ROLES = ["user", "traveller", "admin"];
    if (!VALID_ROLES.includes(role)) {
      return responseError(res, `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`, 400);
    }

    const safeLimit = Math.min(parseInt(limit) || 20, 100); // cap at 100

    const data = await getNotificationsService({
      user_id: req.user.id,
      role,
      page,
      limit: safeLimit,
    });

    return responseSuccess(res, data, "Notifications fetched");
  } catch (err) {
    return responseError(res, err.message, 500);
  }
}

// PATCH /api/notifications/:id/read
export async function markOneRead(req, res) {
  try {
    const notification = await markOneReadService(req.params.id, req.user.id);
    // Emit real-time count update
    const io = req.app.get("io");
    if (io) io.to(`user_${req.user.id}`).emit("notification_read", { id: req.params.id });
    return responseSuccess(res, notification, "Marked as read");
  } catch (err) {
    const status = err.message.includes("not found") ? 404 : 500;
    return responseError(res, err.message, status);
  }
}

// PATCH /api/notifications/read-all
export async function markAllRead(req, res) {
  try {
    const { role } = req.body;
    if (!role) return responseError(res, "role is required", 400);
    await markAllReadService(req.user.id, role);
    // Emit real-time count reset
    const io = req.app.get("io");
    if (io) io.to(`user_${req.user.id}`).emit("notifications_read_all");
    return responseSuccess(res, null, "All notifications marked as read");
  } catch (err) {
    return responseError(res, err.message, 500);
  }
}

// DELETE /api/notifications/:id
export async function deleteNotification(req, res) {
  try {
    await deleteNotificationService(req.params.id, req.user.id);
    return responseSuccess(res, null, "Notification deleted");
  } catch (err) {
    const status = err.message.includes("not found") ? 404 : 500;
    return responseError(res, err.message, status);
  }
}
