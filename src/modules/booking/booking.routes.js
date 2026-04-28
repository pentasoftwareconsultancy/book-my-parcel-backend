import express from "express";
import bookingController from "./booking.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { validateRequest, otpSchema, bookingIdSchema } from "./booking.validation.js";
import { otpGenerationLimiter, otpVerificationLimiter, generalLimiter } from "../../middlewares/rateLimit.middleware.js";
import ChatMessage from "./chatMessage.model.js";
import DeliveryAttempt from "./deliveryAttempt.model.js";
import { upload } from "../../utils/fileUpload.util.js";
import twilioService from "../../services/twilio.service.js";
import { sendToUser } from "../../services/notification.service.js";
import User from "../user/user.model.js";
import Parcel from "../parcel/parcel.model.js";
import Booking from "./booking.model.js";
import Address from "../parcel/address.model.js";

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// Pickup flow
router.post(
  "/:bookingId/start-pickup",
  otpGenerationLimiter,
  validateRequest(bookingIdSchema, "params"),
  bookingController.startPickup
);

router.post(
  "/:bookingId/verify-pickup",
  otpVerificationLimiter,
  validateRequest(bookingIdSchema, "params"),
  validateRequest(otpSchema, "body"),
  bookingController.verifyPickup
);

// Delivery flow
router.post(
  "/:bookingId/start-delivery",
  otpGenerationLimiter,
  validateRequest(bookingIdSchema, "params"),
  bookingController.startDelivery
);

router.post(
  "/:bookingId/verify-delivery",
  otpVerificationLimiter,
  validateRequest(bookingIdSchema, "params"),
  validateRequest(otpSchema, "body"),
  bookingController.verifyDelivery
);

// Cancellation - Traveller cancels booking
router.post(
  "/:bookingId/cancel",
  generalLimiter,
  validateRequest(bookingIdSchema, "params"),
  bookingController.cancelBooking
);

// Payment reception - Pay After Delivery payment reception
router.post(
  "/:bookingId/receive-payment",
  generalLimiter,
  validateRequest(bookingIdSchema, "params"),
  bookingController.receivePayment
);

// ── Chat history ──────────────────────────────────────────────────────────────
// GET /api/booking/:bookingId/chat — load last 100 messages for a booking
router.get("/:bookingId/chat", generalLimiter, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const limit  = Math.min(parseInt(req.query.limit)  || 100, 200);
    const offset = parseInt(req.query.offset) || 0;

    const messages = await ChatMessage.findAll({
      where: { booking_id: bookingId },
      order: [["createdAt", "ASC"]],
      limit,
      offset,
      attributes: ["id", "booking_id", "sender_id", "sender_role", "message", "is_read", "createdAt"],
    });

    return res.status(200).json({ success: true, data: messages });
  } catch (err) {
    console.error("GET chat history:", err.message);
    return res.status(500).json({ success: false, message: "Failed to load chat history" });
  }
});

// ── Delivery attempt (recipient unavailable) ──────────────────────────────────
// POST /api/booking/:bookingId/delivery-attempt
// Traveller logs a failed delivery attempt and optionally reschedules
router.post(
  "/:bookingId/delivery-attempt",
  authMiddleware,
  generalLimiter,
  upload.single("attempt_photo"),
  async (req, res) => {
    try {
      const { bookingId } = req.params;
      const travellerId = req.user.id;
      const { reason = "recipient_unavailable", notes, rescheduled_at } = req.body;
      const MAX_ATTEMPTS = 3;

      // Verify booking belongs to this traveller and is IN_TRANSIT
      const booking = await Booking.findOne({
        where: { id: bookingId, traveller_id: travellerId },
        include: [
          {
            model: Parcel,
            as: "parcel",
            include: [{ model: Address, as: "deliveryAddress", attributes: ["city", "phone"] }],
          },
        ],
      });

      if (!booking) {
        return res.status(404).json({ success: false, message: "Booking not found" });
      }
      if (booking.status !== "IN_TRANSIT") {
        return res.status(400).json({ success: false, message: `Cannot log attempt for booking in status: ${booking.status}` });
      }

      // Count existing attempts
      const existingAttempts = await DeliveryAttempt.count({ where: { booking_id: bookingId } });
      const attemptNumber = existingAttempts + 1;

      // Build photo URL if uploaded
      const baseUrl = process.env.BASE_URL || "http://localhost:3000";
      const photoUrl = req.file ? `${baseUrl}/uploads/${req.file.filename}` : null;

      // Create attempt record
      const attempt = await DeliveryAttempt.create({
        booking_id:     bookingId,
        traveller_id:   travellerId,
        attempt_number: attemptNumber,
        reason,
        notes:          notes || null,
        photo_url:      photoUrl,
        rescheduled_at: rescheduled_at ? new Date(rescheduled_at) : null,
      });

      // Notify sender
      const senderUser = await User.findByPk(booking.parcel.user_id);
      const city = booking.parcel.deliveryAddress?.city || "delivery location";

      await sendToUser(
        booking.parcel.user_id,
        `Delivery Attempt ${attemptNumber} Failed`,
        `Your traveller attempted delivery at ${city} but the recipient was unavailable. ${rescheduled_at ? `Rescheduled for ${new Date(rescheduled_at).toLocaleString("en-IN")}` : "Please ensure someone is available."}`,
        { type: "delivery_attempt_failed", booking_id: bookingId, attempt_number: attemptNumber }
      );

      if (senderUser?.phone_number) {
        await twilioService.sendSMS(
          senderUser.phone_number,
          `Book My Parcel: Delivery attempt ${attemptNumber} failed at ${city}. Reason: ${reason.replace(/_/g, " ")}. ${rescheduled_at ? `Next attempt: ${new Date(rescheduled_at).toLocaleString("en-IN")}` : "Please contact your traveller."}`
        );
      }

      // Auto-cancel after MAX_ATTEMPTS
      if (attemptNumber >= MAX_ATTEMPTS) {
        await booking.update({ status: "CANCELLED" });
        await booking.parcel.update({ status: "CANCELLED" });

        await sendToUser(
          booking.parcel.user_id,
          "Booking Auto-Cancelled",
          `After ${MAX_ATTEMPTS} failed delivery attempts, your booking has been cancelled. A refund will be processed.`,
          { type: "booking_auto_cancelled", booking_id: bookingId }
        );

        // Trigger refund
        const { refundPaymentForParcel } = await import("../payment/payment.service.js");
        setImmediate(() => refundPaymentForParcel(booking.parcel_id, `Auto-cancelled after ${MAX_ATTEMPTS} failed delivery attempts`));

        return res.status(200).json({
          success: true,
          message: `Attempt ${attemptNumber} logged. Booking auto-cancelled after ${MAX_ATTEMPTS} failed attempts.`,
          attempt,
          auto_cancelled: true,
        });
      }

      return res.status(201).json({
        success: true,
        message: `Delivery attempt ${attemptNumber} logged. Sender has been notified.`,
        attempt,
        attempts_remaining: MAX_ATTEMPTS - attemptNumber,
      });
    } catch (err) {
      console.error("POST delivery-attempt:", err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
  }
);

// GET /api/booking/:bookingId/delivery-attempts — view all attempts for a booking
router.get("/:bookingId/delivery-attempts", authMiddleware, generalLimiter, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const attempts = await DeliveryAttempt.findAll({
      where: { booking_id: bookingId },
      order: [["attempted_at", "ASC"]],
    });
    return res.status(200).json({ success: true, data: attempts });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
