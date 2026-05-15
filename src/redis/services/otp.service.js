/**
 * OTP Service
 *
 * Stores OTPs in Redis (not in the database).
 * - OTP is hashed with SHA-256 before storing
 * - TTL: 5 minutes (300 seconds)
 * - Max 5 verification attempts per OTP before blocking
 * - Key deleted immediately after successful verification
 *
 * Redis key schema:
 *   otp:{identifier}:{type}          → hashed OTP value   (TTL: 300s)
 *   otp_attempts:{identifier}:{type} → attempt counter    (TTL: 300s)
 *
 * The identifier is typically a phone number. A type suffix is kept so
 * pickup/delivery OTPs for the same phone can coexist safely.
 */

import crypto from "crypto";
import redis from "../redis.config.js";
import otpConfig from "../../config/otp.config.js";
import { generateOTP } from "../../modules/traveller/traveller.controller.js";

const OTP_TTL_SECONDS      = otpConfig.EXPIRY_MINUTES * 60; // default 5 min
const MAX_ATTEMPTS         = otpConfig.MAX_ATTEMPTS;         // default 5
const OTP_LENGTH           = otpConfig.OTP_LENGTH;           // default 4

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateRawOTP() {
  const min = Math.pow(10, OTP_LENGTH - 1);
  const max = Math.pow(10, OTP_LENGTH) - 1;
  return (Math.floor(Math.random() * (max - min + 1)) + min).toString();
}

function hashOTP(otp) {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

function normalizeIdentifier(identifier) {
  return String(identifier).trim();
}

function otpKey(identifier, type) {
  return `otp:${normalizeIdentifier(identifier)}:${type}`;
}

function attemptsKey(identifier, type) {
  return `otp_attempts:${normalizeIdentifier(identifier)}:${type}`;
}

// ─── Check Redis availability ──────────────────────────────────────────────────

function isRedisAvailable() {
  return redis !== null && redis.status === "ready";
}

// ─── Store OTP in Redis ────────────────────────────────────────────────────────

/**
 * Generate a new OTP, hash it, and store in Redis.
 * Returns the raw OTP (to be sent via SMS — never stored raw).
 *
 * @param {string} identifier
 * @param {"pickup"|"delivery"} type
 * @returns {string} raw OTP
 */
export async function storeOTP(identifier, type) {
  const raw    = generateRawOTP();
  const hashed = hashOTP(raw);

  if (isRedisAvailable()) {
    const key      = otpKey(identifier, type);
    const attKey   = attemptsKey(identifier, type);

    // Store hashed OTP with TTL
    await redis.set(key, hashed, "EX", OTP_TTL_SECONDS);

    // Reset attempt counter
    await redis.del(attKey);

    console.log(`[OTPService] OTP stored in Redis for ${identifier} type=${type}`);
  } else {
    // Redis unavailable — log warning, caller must handle fallback
    console.warn(`[OTPService] Redis unavailable — OTP for ${identifier}:${type} not cached`);
  }

  return raw; // Return raw OTP to be sent via SMS
}

// ─── Verify OTP from Redis ─────────────────────────────────────────────────────

/**
 * Verify an OTP against the Redis-stored hash.
 * Increments attempt counter on failure.
 * Deletes both keys on success.
 *
 * @param {string} identifier
 * @param {"pickup"|"delivery"} type
 * @param {string} rawOTP  — the OTP entered by the user
 * @returns {{ success: boolean, reason?: string }}
 */
export async function verifyOTP(identifier, type, rawOTP) {
  if (!isRedisAvailable()) {
    // Redis down — cannot verify securely, reject
    console.warn(`[OTPService] Redis unavailable — cannot verify OTP for ${identifier}:${type}`);
    return { success: false, reason: "OTP service temporarily unavailable. Please regenerate OTP." };
  }

  const key    = otpKey(identifier, type);
  const attKey = attemptsKey(identifier, type);

  // ── Check attempt count ────────────────────────────────────────────────────
  const attempts = parseInt(await redis.get(attKey) || "0", 10);
  if (attempts >= MAX_ATTEMPTS) {
    console.warn(`[OTPService] Max attempts exceeded for ${identifier} type=${type}`);
    return { success: false, reason: "Too many incorrect attempts. Please regenerate OTP." };
  }

  // ── Fetch stored hash ──────────────────────────────────────────────────────
  const storedHash = await redis.get(key);
  if (!storedHash) {
    return { success: false, reason: "OTP expired or not found. Please regenerate OTP." };
  }

  // ── Compare ────────────────────────────────────────────────────────────────
  const incomingHash = hashOTP(rawOTP);
  if (incomingHash !== storedHash) {
    // Increment attempt counter (keep same TTL as OTP key)
    const ttl = await redis.ttl(key);
    await redis.set(attKey, attempts + 1, "EX", ttl > 0 ? ttl : OTP_TTL_SECONDS);
    console.warn(`[OTPService] Invalid OTP attempt ${attempts + 1}/${MAX_ATTEMPTS} for ${identifier}`);
    return { success: false, reason: `Invalid OTP. ${MAX_ATTEMPTS - attempts - 1} attempts remaining.` };
  }

  // ── Success — delete both keys immediately ─────────────────────────────────
  await redis.del(key, attKey);
  console.log(`[OTPService] OTP verified and cleared for ${identifier} type=${type}`);
  return { success: true };
}

// ─── Delete OTP (e.g. on booking cancellation) ────────────────────────────────

/**
 * Remove OTP keys for a booking (e.g. when booking is cancelled).
 *
 * @param {string} identifier
 * @param {"pickup"|"delivery"|"all"} type
 */
export async function deleteOTP(identifier, type = "all") {
  if (!isRedisAvailable()) return;

  if (type === "all") {
    await redis.del(
      otpKey(identifier, "pickup"),
      otpKey(identifier, "delivery"),
      attemptsKey(identifier, "pickup"),
      attemptsKey(identifier, "delivery")
    );
  } else {
    await redis.del(otpKey(identifier, type), attemptsKey(identifier, type));
  }

  console.log(`[OTPService] OTP keys deleted for ${identifier} type=${type}`);
}

export default { storeOTP, verifyOTP, deleteOTP };
