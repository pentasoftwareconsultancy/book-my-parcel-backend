import Notification from "./notification.model.js";
import { getPagination,getPagingData } from "../../utils/pagination.js";

// ─── Create & emit ────────────────────────────────────────────────────────────
/**
 * Creates a notification row and emits "new_notification" via Socket.io.
 * Call this from any service (booking, payment, matching, etc.)
 *
 * @param {object} io         - Socket.io server instance (req.app.get("io"))
 * @param {object} payload
 * @param {string} payload.user_id
 * @param {string} payload.role     - "user" | "traveller" | "admin"
 * @param {string} payload.type_code
 * @param {string} payload.title
 * @param {string} payload.message
 * @param {object} [payload.meta]
 */
export async function createNotification(io, { user_id, role, type_code, title, message, meta = null }) {
  const notification = await Notification.create({
    user_id,
    role,
    type_code,
    title,
    message,
    meta,
  });

  // Emit to the user's personal room (user_<id>) — frontend joins this on login
  if (io) {
    io.to(`user_${user_id}`).emit("new_notification", notification);
  }

  return notification;
}

// ─── Get paginated notifications ──────────────────────────────────────────────
export async function getNotificationsService({ user_id, role, page = 1, limit = 20 }) {
  const { limit: parsedLimit, offset, page: parsedPage } = getPagination(page, limit);

  const result = await Notification.findAndCountAll({
    where: { user_id, role },
    order: [["created_at", "DESC"]],
    limit: parsedLimit,
    offset,
  });

  return getPagingData(result, parsedPage, parsedLimit);
}

  // ─── Mark one as read ─────────────────────────────────────────────────────────
  export async function markOneReadService(id, user_id) {
    const notification = await Notification.findOne({ where: { id, user_id } });
    if (!notification) throw new Error("Notification not found");

    await notification.update({ is_read: true });
    return notification;
  }

  // ─── Mark all as read ─────────────────────────────────────────────────────────
  export async function markAllReadService(user_id, role) {
    await Notification.update(
      { is_read: true },
      { where: { user_id, role, is_read: false } }
    );
  }

  // ─── Delete one ───────────────────────────────────────────────────────────────
  export async function deleteNotificationService(id, user_id) {
    const notification = await Notification.findOne({ where: { id, user_id } });
    if (!notification) throw new Error("Notification not found");

    await notification.destroy();
  }
  
