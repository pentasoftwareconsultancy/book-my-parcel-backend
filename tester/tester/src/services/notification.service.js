import admin from "firebase-admin";
import sequelize from "../config/database.config.js";

// Initialize Firebase Admin (assumes FIREBASE_SERVICE_ACCOUNT_KEY is set in .env)
let firebaseInitialized = false;

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
  try {
    initializeFirebase();

    if (!firebaseInitialized) {
      console.warn("[Notification] Firebase not initialized, skipping FCM");
      return { success: false, message: "Firebase not initialized" };
    }

    // Get FCM tokens for traveller
    const tokens = await sequelize.query(
      `SELECT token FROM user_device_tokens WHERE user_id = :userId AND device_type = 'mobile'`,
      {
        replacements: { userId: travellerId },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    if (tokens.length === 0) {
      console.log(`[Notification] No FCM tokens found for traveller ${travellerId}`);
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
      tokens.map((t) =>
        admin
          .messaging()
          .send({
            ...message,
            token: t.token,
          })
          .catch((error) => {
            console.error(`[Notification] Failed to send to token ${t.token}:`, error.message);
            return null;
          })
      )
    );

    const successCount = results.filter((r) => r !== null).length;
    console.log(`[Notification] Sent to ${successCount}/${tokens.length} devices for traveller ${travellerId}`);

    return { success: true, sent: successCount, total: tokens.length };
  } catch (error) {
    console.error("[Notification] Error sending to traveller:", error.message);
    return { success: false, error: error.message };
  }
}

// ─── Send Notification to User ─────────────────────────────────────────────
export async function sendToUser(userId, title, body, data = {}) {
  try {
    initializeFirebase();

    if (!firebaseInitialized) {
      console.warn("[Notification] Firebase not initialized, skipping FCM");
      return { success: false, message: "Firebase not initialized" };
    }

    // Get FCM tokens for user
    const tokens = await sequelize.query(
      `SELECT token FROM user_device_tokens WHERE user_id = :userId`,
      {
        replacements: { userId },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    if (tokens.length === 0) {
      console.log(`[Notification] No FCM tokens found for user ${userId}`);
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
      tokens.map((t) =>
        admin
          .messaging()
          .send({
            ...message,
            token: t.token,
          })
          .catch((error) => {
            console.error(`[Notification] Failed to send to token ${t.token}:`, error.message);
            return null;
          })
      )
    );

    const successCount = results.filter((r) => r !== null).length;
    console.log(`[Notification] Sent to ${successCount}/${tokens.length} devices for user ${userId}`);

    return { success: true, sent: successCount, total: tokens.length };
  } catch (error) {
    console.error("[Notification] Error sending to user:", error.message);
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
      tokens.map((t) =>
        admin
          .messaging()
          .send({
            ...message,
            token: t.token,
          })
          .catch((error) => {
            console.error(`[Notification] Failed to send to token ${t.token}:`, error.message);
            return null;
          })
      )
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
