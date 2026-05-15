import admin from "firebase-admin";
import sequelize from "../config/database.config.js";
import { createNotification } from "../modules/notification/notification.service.js";
import { sendEmail } from "./email.service.js";
import { sendWhatsApp } from "./whatsapp.service.js";
import app from "../app.js";

// ─── Fetch user contact details (phone, email, name) ──────────────────────
async function getUserContacts(userId) {
  try {
    const [row] = await sequelize.query(
      `SELECT u.email, u.phone_number, p.name
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE u.id = :userId
       LIMIT 1`,
      { replacements: { userId }, type: sequelize.QueryTypes.SELECT }
    );
    return row || {};
  } catch {
    return {};
  }
}

// Initialize Firebase Admin (assumes FIREBASE_SERVICE_ACCOUNT_KEY is set in .env)
let firebaseInitialized = false;

// FCM error codes that mean the token is permanently invalid and should be deleted
const INVALID_TOKEN_CODES = [
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
  "messaging/invalid-argument",
];

/**
 * Send a single FCM message and auto-delete the token if it's permanently invalid.
 * Returns the message ID on success, null on failure.
 */
async function sendFCMWithCleanup(token, message, userId) {
  try {
    return await admin.messaging().send({ ...message, token });
  } catch (err) {
    if (INVALID_TOKEN_CODES.some((code) => err.code === code || err.message?.includes(code))) {
      console.warn(`[Notification] Removing invalid FCM token for user ${userId}: ${token.slice(0, 20)}…`);
      // Fire-and-forget — don't block the notification flow
      sequelize
        .query(`DELETE FROM user_device_tokens WHERE token = :token`, {
          replacements: { token },
          type: sequelize.QueryTypes.DELETE,
        })
        .catch((dbErr) => console.error("[Notification] Failed to delete stale token:", dbErr.message));
    } else {
      console.error(`[Notification] FCM send failed for user ${userId}:`, err.message);
    }
    return null;
  }
}

function initializeFirebase() {
  if (firebaseInitialized) return;

  try {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) {
      console.warn("[Notification] Firebase service account key not configured");
      return;
    }

    const serviceAccount = JSON.parse(serviceAccountKey);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    firebaseInitialized = true;
    console.log("[Notification] Firebase initialized successfully");
  } catch (error) {
    console.error("[Notification] Failed to initialize Firebase:", error.message);
  }
}

// ─── Send Notification to Traveller ────────────────────────────────────────
export async function sendToTraveller(travellerId, title, body, data = {}) {
  // ── 1. Persist in-app notification + socket emit ───────────────────────
  try {
    const io = app.get("io");
    await createNotification(io, {
      user_id:   travellerId,
      role:      "traveller",
      type_code: data.type || "general",
      title,
      message:   body,
      meta:      Object.keys(data).length ? data : null,
    });
  } catch (dbErr) {
    console.error("[Notification] Failed to persist traveller notification:", dbErr.message);
  }

  // ── 2. Fetch contact details for external channels ─────────────────────
  const { email, phone_number, name } = await getUserContacts(travellerId);
  const displayName = name ? `${name} (Traveller)` : "Traveller";

  // ── 3. WhatsApp (best-effort) ──────────────────────────────────────────
  if (phone_number) {
    sendWhatsApp(phone_number, `Hi ${displayName},\n\n*${title}*\n${body}`).catch((err) =>
      console.error("[Notification] WhatsApp error for traveller:", err.message)
    );
  }

  // ── 4. Email (best-effort) ─────────────────────────────────────────────
  if (email) {
    sendEmail(email, title, body, data.emailSlug || null, { ...data, name: displayName }).catch((err) =>
      console.error("[Notification] Email error for traveller:", err.message)
    );
  }

  // ── 5. FCM push (best-effort) ──────────────────────────────────────────
  try {
    initializeFirebase();
    if (!firebaseInitialized) return { success: false, message: "Firebase not initialized" };

    const tokens = await sequelize.query(
      `SELECT token FROM user_device_tokens WHERE user_id = :userId AND device_type = 'mobile'`,
      { replacements: { userId: travellerId }, type: sequelize.QueryTypes.SELECT }
    );

    if (tokens.length === 0) return { success: false, message: "No device tokens found" };

    const message = { notification: { title, body }, data: { ...data, timestamp: new Date().toISOString() } };
    const results = await Promise.all(
      tokens.map((t) => sendFCMWithCleanup(t.token, message, travellerId))
    );
    const successCount = results.filter(Boolean).length;
    console.log(`[Notification] FCM sent to ${successCount}/${tokens.length} devices for traveller ${travellerId}`);
    return { success: true, sent: successCount, total: tokens.length };
  } catch (error) {
    console.error("[Notification] FCM error for traveller:", error.message);
    return { success: false, error: error.message };
  }
}

// ─── Send Notification to User ─────────────────────────────────────────────
export async function sendToUser(userId, title, body, data = {}) {
  // ── 1. Persist in-app notification + socket emit ───────────────────────
  try {
    const io = app.get("io");
    await createNotification(io, {
      user_id:   userId,
      role:      "user",
      type_code: data.type || "general",
      title,
      message:   body,
      meta:      Object.keys(data).length ? data : null,
    });
  } catch (dbErr) {
    console.error("[Notification] Failed to persist user notification:", dbErr.message);
  }

  // ── 2. Fetch contact details for external channels ─────────────────────
  const { email, phone_number, name } = await getUserContacts(userId);
  const displayName = name ? `${name} (User)` : "User";

  // ── 3. WhatsApp (best-effort) ──────────────────────────────────────────
  if (phone_number) {
    sendWhatsApp(phone_number, `Hi ${displayName},\n\n*${title}*\n${body}`).catch((err) =>
      console.error("[Notification] WhatsApp error for user:", err.message)
    );
  }

  // ── 4. Email (best-effort) ─────────────────────────────────────────────
  if (email) {
    sendEmail(email, title, body, data.emailSlug || null, { ...data, name: displayName }).catch((err) =>
      console.error("[Notification] Email error for user:", err.message)
    );
  }

  // ── 5. FCM push (best-effort) ──────────────────────────────────────────
  try {
    initializeFirebase();
    if (!firebaseInitialized) return { success: false, message: "Firebase not initialized" };

    const tokens = await sequelize.query(
      `SELECT token FROM user_device_tokens WHERE user_id = :userId`,
      { replacements: { userId }, type: sequelize.QueryTypes.SELECT }
    );

    if (tokens.length === 0) return { success: false, message: "No device tokens found" };

    const message = { notification: { title, body }, data: { ...data, timestamp: new Date().toISOString() } };
    const results = await Promise.all(
      tokens.map((t) => sendFCMWithCleanup(t.token, message, userId))
    );
    const successCount = results.filter(Boolean).length;
    console.log(`[Notification] FCM sent to ${successCount}/${tokens.length} devices for user ${userId}`);
    return { success: true, sent: successCount, total: tokens.length };
  } catch (error) {
    console.error("[Notification] FCM error for user:", error.message);
    return { success: false, error: error.message };
  }
}

// ─── Send Multicast Notification ───────────────────────────────────────────
export async function sendMulticast(userIds, title, body, data = {}) {
  try {
    initializeFirebase();

    if (!firebaseInitialized) {
      console.warn("[Notification] Firebase not initialized, skipping FCM");
      return { success: false, message: "Firebase not initialized" };
    }

    const placeholders = userIds.map(() => "?").join(",");
    const tokens = await sequelize.query(
      `SELECT token FROM user_device_tokens WHERE user_id IN (${placeholders})`,
      {
        replacements: userIds,
        type: sequelize.QueryTypes.SELECT,
      }
    );

    if (tokens.length === 0) {
      console.log(`[Notification] No FCM tokens found for ${userIds.length} users`);
      return { success: false, message: "No device tokens found" };
    }

    const message = {
      notification: {
        title,
        body,
      },
      data: {
        ...data,
        timestamp: new Date().toISOString(),
      },
    };

    const results = await Promise.all(
      tokens.map((t) => sendFCMWithCleanup(t.token, message, "multicast"))
    );

    const successCount = results.filter((r) => r !== null).length;
    console.log(`[Notification] Sent to ${successCount}/${tokens.length} devices`);

    return { success: true, sent: successCount, total: tokens.length };
  } catch (error) {
    console.error("[Notification] Error sending multicast:", error.message);
    return { success: false, error: error.message };
  }
}

// ─── Store FCM Token ───────────────────────────────────────────────────────
export async function storeFCMToken(userId, token, deviceType = "mobile") {
  try {
    // Check if token already exists
    const existing = await sequelize.query(
      `SELECT id FROM user_device_tokens WHERE user_id = :userId AND token = :token`,
      {
        replacements: { userId, token },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    if (existing.length > 0) {
      console.log(`[Notification] Token already stored for user ${userId}`);
      return { success: true, message: "Token already exists" };
    }

    // Insert new token
    await sequelize.query(
      `INSERT INTO user_device_tokens (id, user_id, token, device_type, created_at) 
       VALUES (gen_random_uuid(), :userId, :token, :deviceType, NOW())`,
      {
        replacements: { userId, token, deviceType },
        type: sequelize.QueryTypes.INSERT,
      }
    );

    console.log(`[Notification] Stored FCM token for user ${userId}`);
    return { success: true, message: "Token stored" };
  } catch (error) {
    console.error("[Notification] Error storing FCM token:", error.message);
    return { success: false, error: error.message };
  }
}

// ─── Remove FCM Token ──────────────────────────────────────────────────────
export async function removeFCMToken(userId, token) {
  try {
    await sequelize.query(
      `DELETE FROM user_device_tokens WHERE user_id = :userId AND token = :token`,
      {
        replacements: { userId, token },
        type: sequelize.QueryTypes.DELETE,
      }
    );

    console.log(`[Notification] Removed FCM token for user ${userId}`);
    return { success: true, message: "Token removed" };
  } catch (error) {
    console.error("[Notification] Error removing FCM token:", error.message);
    return { success: false, error: error.message };
  }
}
