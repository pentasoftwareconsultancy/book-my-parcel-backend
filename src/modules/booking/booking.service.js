import sequelize from "../../config/database.config.js";
import Booking from "./booking.model.js";
import Parcel from "../parcel/parcel.model.js";
import Address from "../parcel/address.model.js";
import User from "../user/user.model.js";
import TravellerProfile from "../traveller/travellerProfile.model.js";
import twilioService from "../../services/twilio.service.js";
import otpConfig from "../../config/otp.config.js";
import app from "../../app.js";
import ParcelTracking from "../tracking/parcelTracking.model.js";
import TravellerTrip from "../traveller/travellerTrip.model.js";
import TravellerRoute from "../traveller/travellerRoute.model.js";
import { creditWalletService } from "../payment/wallet.service.js";
import { refundPaymentForParcel } from "../payment/payment.service.js";
import PendingPayment from "./pendingPayment.model.js";
import { createNotification } from "../notification/notification.service.js";
import { creditReferralOnFirstDelivery } from "../../services/referral.service.js";
import {
  BOOKING_TRANSITIONS,
  PARCEL_TRANSITIONS,
  assertValidTransition,
} from "../../utils/constants.js";
import { auditLog } from "../../utils/auditLog.util.js";


class BookingService {
  // Get io instance
  getIO() {
    return app.get("io");
  }
  // Generate random OTP
  generateOTP() {
    const length = otpConfig.OTP_LENGTH;
    return Math.floor(Math.random() * Math.pow(10, length))
      .toString()
      .padStart(length, "0");
  }

  // Get booking with all related data
  async getBookingWithDetails(bookingId) {
    const booking = await Booking.findOne({
      where: { id: bookingId },
      include: [
        {
          model: Parcel,
          as: "parcel",
          include: [
            { model: Address, as: "pickupAddress",  foreignKey: "pickup_address_id" },
            { model: Address, as: "deliveryAddress", foreignKey: "delivery_address_id" },
            { model: User, as: "user" },
          ],
        },
        {
          model: TravellerTrip,
          as: "traveller_trip",
          include: [
            {
              model: TravellerProfile,
              foreignKey: "traveller_id",   // TravellerTrip.traveller_id → TravellerProfile.user_id
              include: [
                {
                  model: TravellerRoute,
                  as: "routes",
                  where: { status: "ACTIVE" },
                  required: false,          // don't fail if no active route
                  limit: 1,
                },
              ],
            },
          ],
        },
      ],
    });
    
    return booking;
  }

  // Start pickup process
  async startPickup(bookingId, travellerId) {
    const booking = await this.getBookingWithDetails(bookingId);

    if (!booking) {
      throw new Error("Booking not found");
    }

    if (booking.traveller_id !== travellerId) {
      throw new Error("Unauthorized: You don't own this booking");
    }

    // Allow CONFIRMED or PICKUP status (for resend OTP)
    // CONFIRMED → PICKUP is a valid first transition
    // PICKUP → PICKUP is allowed as a resend — skip the guard for resend case
    if (booking.status !== "PICKUP") {
      assertValidTransition(booking.status, "PICKUP", BOOKING_TRANSITIONS, "Booking");
    }

    // Check if OTP is locked
    if (booking.pickup_otp_locked_until && new Date() < new Date(booking.pickup_otp_locked_until)) {
      const remainingTime = Math.ceil((new Date(booking.pickup_otp_locked_until) - new Date()) / 60000);
      throw new Error(`OTP is locked. Please try again in ${remainingTime} minutes`);
    }

    // Generate OTP
    const otp = this.generateOTP();

    // Update booking - Change status to PICKUP and store OTP
    await booking.update({
      status: "PICKUP",
      pickup_otp: otp,
      pickup_otp_generated_at: new Date(),
      pickup_otp_attempts: 0,
      pickup_otp_locked_until: null,
    });

    // Get traveller name
    const travellerProfile = await TravellerProfile.findOne({
      where: { user_id: travellerId },
      include: [{ model: User, as: "user" }],
    });
    const travellerName = travellerProfile?.user?.name || "Traveller";

    // Get sender phone from pickup address
    const senderPhone = booking.parcel.pickupAddress.phone;
    const senderName = booking.parcel.pickupAddress.name;
    
    // Validate phone number exists
    if (!senderPhone) {
      console.warn(`⚠️ [OTP] Pickup address has no phone number. OTP: ${otp} (Booking: ${booking.booking_ref})`);
      console.log(`📱 [OTP] Pickup OTP generated: ${otp} (No phone number available)`);
    } else {
      // Send SMS via Twilio
      const smsResult = await twilioService.sendPickupOTP(
        senderPhone,
        otp,
        booking.booking_ref,
        travellerName
      );
      
      if (smsResult.skipped) {
        console.log(`📱 [OTP] Pickup OTP generated: ${otp} (SMS disabled - check console for OTP)`);
      } else if (smsResult.success) {
        console.log(`✅ [OTP] Pickup OTP sent via SMS to ${senderPhone}`);
      } else {
        console.warn(`⚠️ [OTP] Failed to send SMS, but OTP generated: ${otp}`);
      }
    }

    // Emit WebSocket event to sender AND traveller
    const senderId = booking.parcel.user_id;
    const io = this.getIO();
    if (io) {
      const eventData = {
        booking_id: booking.id,
        pickup_otp: otp,
        traveller_name: travellerName,
        traveller_phone: travellerProfile?.user?.phone,
        message: "Traveller has arrived at pickup location",
      };
      const travellerEventData = {
        booking_id: booking.id,
        traveller_name: travellerName,
        traveller_phone: travellerProfile?.user?.phone,
        message: "OTP has been sent to the sender. Please collect it from them.",
      };
      
      // Log room information for debugging
      const senderRoom = `user_${senderId}`;
      const travellerRoom = `user_${travellerId}`;
      const senderClients = io.sockets.adapter.rooms.get(senderRoom);
      const travellerClients = io.sockets.adapter.rooms.get(travellerRoom);
      
      console.log(`[WebSocket] Attempting to emit pickup_otp_generated:`);
      console.log(`  - Sender room: ${senderRoom} (${senderClients?.size || 0} clients)`);
      console.log(`  - Traveller room: ${travellerRoom} (${travellerClients?.size || 0} clients)`);
      
      // Emit to sender (user who created the parcel)
      io.to(senderRoom).emit("pickup_otp_generated", eventData);
      console.log(`[WebSocket] Emitted pickup_otp_generated to ${senderRoom}`);
      
      // Emit to traveller
      io.to(travellerRoom).emit("pickup_otp_generated", travellerEventData);
      console.log(`[WebSocket] Emitted pickup_otp_generated to ${travellerRoom}`);
    }

    return {
      booking_id: booking.id,
      message: "OTP sent to sender via SMS. Please collect OTP from sender.",
      sender_phone: senderPhone,
      sender_name: senderName,
    };
  }

  // Verify pickup OTP
  async verifyPickup(bookingId, travellerId, otp) {
    const booking = await this.getBookingWithDetails(bookingId);

    if (!booking) {
      throw new Error("Booking not found");
    }

    if (booking.traveller_id !== travellerId) {
      throw new Error("Unauthorized: You don't own this booking");
    }

    assertValidTransition(booking.status, "IN_TRANSIT", BOOKING_TRANSITIONS, "Booking");

    // Check if OTP is locked
    if (booking.pickup_otp_locked_until && new Date() < new Date(booking.pickup_otp_locked_until)) {
      const remainingTime = Math.ceil((new Date(booking.pickup_otp_locked_until) - new Date()) / 60000);
      throw new Error(`OTP is locked. Please try again in ${remainingTime} minutes`);
    }

    // Check OTP expiry
    const otpAge = (new Date() - new Date(booking.pickup_otp_generated_at)) / 60000;
    if (otpAge > otpConfig.EXPIRY_MINUTES) {
      throw new Error("OTP has expired. Please request a new one");
    }

    // Verify OTP
    if (booking.pickup_otp !== otp) {
      const newAttempts = booking.pickup_otp_attempts + 1;

      if (newAttempts >= otpConfig.MAX_ATTEMPTS) {
        // Lock OTP
        const lockUntil = new Date();
        lockUntil.setMinutes(lockUntil.getMinutes() + otpConfig.LOCKOUT_MINUTES);

        await booking.update({
          pickup_otp_attempts: newAttempts,
          pickup_otp_locked_until: lockUntil,
        });

        throw new Error("Maximum attempts exceeded. OTP has been locked for 15 minutes");
      }

      await booking.update({
        pickup_otp_attempts: newAttempts,
      });

      const attemptsRemaining = otpConfig.MAX_ATTEMPTS - newAttempts;
      const error = new Error("Invalid OTP. Please check with sender and try again");
      error.attemptsRemaining = attemptsRemaining;
      throw error;
    }

    // ✅ OTP is correct - Generate Tracking ID and update status to IN_TRANSIT
    const updateData = {
      status: "IN_TRANSIT",
      pickup_otp: null, // Clear OTP for security
      pickup_verified_at: new Date(),
      pickup_otp_attempts: 0,
    };
    
    // Generate Tracking ID if not already generated
    if (!booking.tracking_ref) {
      const { generateTrackingId } = await import("../../utils/idGenerator.js");
      const trackingRef = await generateTrackingId();
      updateData.tracking_ref = trackingRef;
      console.log(`[Booking] Tracking ID generated: ${trackingRef}`);
    }
    
    await booking.update(updateData);

    // ✅ Create ParcelTracking row after OTP verified
    try {
      const pickupAddress   = booking.parcel.pickupAddress;
      const deliveryAddress = booking.parcel.deliveryAddress;

      // Get vehicle_type from the traveller's active route
      const activeRoute = booking.traveller_trip
        ?.TravellerProfile                // Sequelize uses model name as key if no alias set
        ?.routes?.[0];

      const vehicleType = activeRoute?.vehicle_type ?? "bike"; // fallback to bike

      const missingCoords =
        !pickupAddress?.latitude  || !pickupAddress?.longitude ||
        !deliveryAddress?.latitude || !deliveryAddress?.longitude;

      if (missingCoords) {
        console.warn("[Tracking] Missing coordinates on addresses — skipping ParcelTracking creation");
      } else {
        await ParcelTracking.create({
          booking_id:   booking.id,
          vehicle_type: vehicleType,
          pickup_lat:   pickupAddress.latitude,
          pickup_lng:   pickupAddress.longitude,
          delivery_lat: deliveryAddress.latitude,
          delivery_lng: deliveryAddress.longitude,
          status:       "in_transit",     // matches your ENUM: initiated|picked_up|in_transit|delivered|failed
        });
        console.log(`[Tracking] ParcelTracking created for booking ${booking.id}, vehicle: ${vehicleType}`);
      }
    } catch (trackingError) {
      console.error("[Tracking] Failed to create ParcelTracking:", trackingError.message);
      // ⚠️ Intentionally not re-throwing — OTP verification already succeeded
    }

    // Emit WebSocket event to sender AND traveller
    const senderId = booking.parcel.user_id;
    const io = this.getIO();
    if (io) {
      const eventData = {
        booking_id: booking.id,
        status: "IN_TRANSIT",
        pickup_verified_at: booking.pickup_verified_at,
      };
      
      // Log room information for debugging
      const senderRoom = `user_${senderId}`;
      const travellerRoom = `user_${travellerId}`;
      const senderClients = io.sockets.adapter.rooms.get(senderRoom);
      const travellerClients = io.sockets.adapter.rooms.get(travellerRoom);
      
      console.log(`[WebSocket] Attempting to emit pickup_verified:`);
      console.log(`  - Sender room: ${senderRoom} (${senderClients?.size || 0} clients)`);
      console.log(`  - Traveller room: ${travellerRoom} (${travellerClients?.size || 0} clients)`);
      
      // Emit to sender (user who created the parcel)
      io.to(senderRoom).emit("pickup_verified", eventData);
      console.log(`[WebSocket] Emitted pickup_verified to ${senderRoom}`);
      
      // Emit to traveller
      io.to(travellerRoom).emit("pickup_verified", eventData);
      console.log(`[WebSocket] Emitted pickup_verified to ${travellerRoom}`);
    }

    // ── Persist notifications ──────────────────────────────────────────────
    const io2 = this.getIO();
    // Notify user: parcel picked up
    await createNotification(io2, {
      user_id:   booking.parcel.user_id,
      role:      "user",
      type_code: "parcel_picked_up",
      title:     "Parcel Picked Up",
      message:   `Your parcel has been picked up by the traveller. Booking ref: ${booking.booking_ref}`,
      meta:      { booking_id: booking.id, booking_ref: booking.booking_ref },
    });
    // Notify traveller: delivery started
    await createNotification(io2, {
      user_id:   travellerId,
      role:      "traveller",
      type_code: "delivery_started",
      title:     "Pickup Verified",
      message:   `Pickup verified for booking ${booking.booking_ref}. Head to the delivery address.`,
      meta:      { booking_id: booking.id, booking_ref: booking.booking_ref },
    });

    // ── Send tracking link via SMS & WhatsApp ──────────────────────────────
    try {
      const senderUser = await User.findByPk(booking.parcel.user_id);
      if (senderUser?.phone_number) {
        // Tracking page accepts the booking UUID directly
        const trackingUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/track/${booking.id}`;
        await twilioService.sendTrackingLink(senderUser.phone_number, trackingUrl, booking.booking_ref);
        console.log(`✅ [Tracking] Tracking link sent to sender ${senderUser.phone_number}: ${trackingUrl}`);
      }
    } catch (smsError) {
      console.error("[Tracking] Failed to send tracking link (non-fatal):", smsError.message);
    }

    return {
      booking_id: booking.id,
      status: "IN_TRANSIT",
      message: "Pickup verified! You can now proceed to delivery.",
      pickup_verified_at: booking.pickup_verified_at,
    };
  }

  // Start delivery process
  async startDelivery(bookingId, travellerId) {
    const booking = await this.getBookingWithDetails(bookingId);

    if (!booking) {
      throw new Error("Booking not found");
    }

    if (booking.traveller_id !== travellerId) {
      throw new Error("Unauthorized: You don't own this booking");
    }

    // startDelivery is called while IN_TRANSIT — it stays IN_TRANSIT (just generates OTP)
    // so we validate the booking is in the right state without a full transition check
    if (booking.status !== "IN_TRANSIT") {
      throw new Error(`Cannot start delivery: booking must be IN_TRANSIT, got "${booking.status}"`);
    }

    // Check if OTP is locked
    if (booking.delivery_otp_locked_until && new Date() < new Date(booking.delivery_otp_locked_until)) {
      const remainingTime = Math.ceil((new Date(booking.delivery_otp_locked_until) - new Date()) / 60000);
      throw new Error(`OTP is locked. Please try again in ${remainingTime} minutes`);
    }

    // Generate OTP
    const otp = this.generateOTP();

    // Update booking - Status remains IN_TRANSIT
    await booking.update({
      delivery_otp: otp,
      delivery_otp_generated_at: new Date(),
      delivery_otp_attempts: 0,
      delivery_otp_locked_until: null,
    });

    // Get traveller name
    const travellerProfile = await TravellerProfile.findOne({
      where: { user_id: travellerId },
      include: [{ model: User, as: "user" }],
    });
    const travellerName = travellerProfile?.user?.name || "Traveller";

    // Get recipient phone from delivery address
    const recipientPhone = booking.parcel.deliveryAddress.phone;
    const recipientName = booking.parcel.deliveryAddress.name;
    
    // Validate phone number exists
    if (!recipientPhone) {
      console.warn(`⚠️ [OTP] Delivery address has no phone number. OTP: ${otp} (Booking: ${booking.booking_ref})`);
      console.log(`📱 [OTP] Delivery OTP generated: ${otp} (No phone number available)`);
    } else {
      // Send SMS via Twilio
      const smsResult = await twilioService.sendDeliveryOTP(
        recipientPhone,
        otp,
        booking.booking_ref,
        travellerName
      );
      
      if (smsResult.skipped) {
        console.log(`📱 [OTP] Delivery OTP generated: ${otp} (SMS disabled - check console for OTP)`);
      } else if (smsResult.success) {
        console.log(`✅ [OTP] Delivery OTP sent via SMS to ${recipientPhone}`);
      } else {
        console.warn(`⚠️ [OTP] Failed to send SMS, but OTP generated: ${otp}`);
      }
    }

    // Emit WebSocket event to sender AND traveller
    const senderId = booking.parcel.user_id;
    const io = this.getIO();
    if (io) {
      const eventData = {
        booking_id: booking.id,
        delivery_otp: otp,
        traveller_name: travellerName,
        traveller_phone: travellerProfile?.user?.phone,
        message: "Traveller has arrived at delivery location",
      };
      const travellerEventData = {
        booking_id: booking.id,
        traveller_name: travellerName,
        traveller_phone: travellerProfile?.user?.phone,
        message: "OTP has been sent to the recipient. Please collect it from them.",
      };
      
      // Log room information for debugging
      const senderRoom = `user_${senderId}`;
      const travellerRoom = `user_${travellerId}`;
      const senderClients = io.sockets.adapter.rooms.get(senderRoom);
      const travellerClients = io.sockets.adapter.rooms.get(travellerRoom);
      
      console.log(`[WebSocket] Attempting to emit delivery_otp_generated:`);
      console.log(`  - Sender room: ${senderRoom} (${senderClients?.size || 0} clients)`);
      console.log(`  - Traveller room: ${travellerRoom} (${travellerClients?.size || 0} clients)`);
      
      // Emit to sender (user who created the parcel)
      io.to(senderRoom).emit("delivery_otp_generated", eventData);
      console.log(`[WebSocket] Emitted delivery_otp_generated to ${senderRoom}`);
      
      // Emit to traveller
      io.to(travellerRoom).emit("delivery_otp_generated", travellerEventData);
      console.log(`[WebSocket] Emitted delivery_otp_generated to ${travellerRoom}`);
    }

    return {
      booking_id: booking.id,
      message: "OTP sent to recipient via SMS. Please collect OTP from recipient.",
      recipient_phone: recipientPhone,
      recipient_name: recipientName,
    };
  }

  // Verify delivery OTP
  async verifyDelivery(bookingId, travellerId, otp) {
    const booking = await this.getBookingWithDetails(bookingId);

    if (!booking) {
      throw new Error("Booking not found");
    }

    if (booking.traveller_id !== travellerId) {
      throw new Error("Unauthorized: You don't own this booking");
    }

    assertValidTransition(booking.status, "DELIVERED", BOOKING_TRANSITIONS, "Booking");

    // Check if OTP is locked
    if (booking.delivery_otp_locked_until && new Date() < new Date(booking.delivery_otp_locked_until)) {
      const remainingTime = Math.ceil((new Date(booking.delivery_otp_locked_until) - new Date()) / 60000);
      throw new Error(`OTP is locked. Please try again in ${remainingTime} minutes`);
    }

    // Check OTP expiry
    const otpAge = (new Date() - new Date(booking.delivery_otp_generated_at)) / 60000;
    if (otpAge > otpConfig.EXPIRY_MINUTES) {
      throw new Error("OTP has expired. Please request a new one");
    }

    // Verify OTP
    if (booking.delivery_otp !== otp) {
      const newAttempts = booking.delivery_otp_attempts + 1;

      if (newAttempts >= otpConfig.MAX_ATTEMPTS) {
        const lockUntil = new Date();
        lockUntil.setMinutes(lockUntil.getMinutes() + otpConfig.LOCKOUT_MINUTES);
        await booking.update({
          delivery_otp_attempts: newAttempts,
          delivery_otp_locked_until: lockUntil,
        });
        throw new Error("Maximum attempts exceeded. OTP has been locked for 15 minutes");
      }

      await booking.update({ delivery_otp_attempts: newAttempts });

      const attemptsRemaining = otpConfig.MAX_ATTEMPTS - newAttempts;
      const error = new Error("Invalid OTP. Please check with recipient and try again");
      error.attemptsRemaining = attemptsRemaining;
      throw error;
    }

    // ── OTP correct: mark DELIVERED + credit wallet atomically ───────────────
    //
    // Both writes are inside one transaction. If the wallet credit fails the
    // booking stays IN_TRANSIT and the traveller can retry — no "delivered but
    // unpaid" state is ever persisted.
    //
    // creditWalletService accepts an externalTransaction so it participates in
    // this transaction instead of opening its own.
    const fullAmount = Number(booking.parcel?.price_quote) || 0;
    const deliveredAt = new Date();

    // Calculate platform fee and partner amount
    const { getPlatformFeePercent } = await import("../../redis/cache/platformSettingsCache.service.js");
    const platformFeePercent = await getPlatformFeePercent();
    const platformFee = Math.round(fullAmount * (platformFeePercent / 100));
    const partnerAmount = fullAmount - platformFee;

    await sequelize.transaction(async (t) => {
      // 1. Mark booking as DELIVERED
      await booking.update(
        {
          status: "DELIVERED",
          delivery_otp: null,       // clear OTP for security
          delivered_at: deliveredAt,
          delivery_otp_attempts: 0,
        },
        { transaction: t }
      );

      // 2. Credit traveller wallet with partner amount (after platform fee deduction)
      if (partnerAmount > 0 && booking.traveller_id) {
        await creditWalletService(
          booking.traveller_id,
          partnerAmount,
          `Delivery payment for booking ${booking.booking_ref} (Amount: ₹${fullAmount}, Platform fee: ₹${platformFee})`,
          t  // pass the external transaction — wallet service will NOT commit/rollback
        );
      }
    });

    // ── Post-transaction side-effects (non-fatal) ─────────────────────────
    // These run after the transaction commits. A failure here does NOT
    // roll back the delivery — the booking is already DELIVERED and paid.

    // Referral bonus (fire-and-forget)
    setImmediate(() => creditReferralOnFirstDelivery(booking.parcel.user_id));

    // Delivery confirmation SMS to sender
    try {
      const senderUser = await User.findByPk(booking.parcel.user_id);
      if (senderUser?.phone_number) {
        const city = booking.parcel.deliveryAddress?.city || "destination";
        await twilioService.sendSMS(
          senderUser.phone_number,
          `Your parcel has been successfully delivered to ${city}! Booking Ref: ${booking.booking_ref}. Thank you for using BookMyParcel.`
        );
      }
    } catch (smsError) {
      console.error("[Delivery] SMS confirmation failed (non-fatal):", smsError.message);
    }

    // WebSocket events
    const senderId = booking.parcel.user_id;
    const io = this.getIO();
    if (io) {
      const eventData = {
        booking_id: booking.id,
        status: "DELIVERED",
        delivered_at: deliveredAt,
      };
      io.to(`user_${senderId}`).emit("delivery_verified", eventData);
      io.to(`user_${travellerId}`).emit("delivery_verified", eventData);
      console.log(`[WebSocket] Emitted delivery_verified to user_${senderId} and user_${travellerId}`);
    }

    // Persist notifications
    const io2 = this.getIO();
    await createNotification(io2, {
      user_id:   booking.parcel.user_id,
      role:      "user",
      type_code: "parcel_delivered",
      title:     "Parcel Delivered Successfully",
      message:   `Your parcel has been delivered successfully. Booking ref: ${booking.booking_ref}`,
      meta:      { booking_id: booking.id, booking_ref: booking.booking_ref },
    });
    await createNotification(io2, {
      user_id:   travellerId,
      role:      "traveller",
      type_code: "delivery_completed",
      title:     "Delivery Completed",
      message:   `You successfully delivered parcel ${booking.booking_ref}. ₹${partnerAmount} has been credited to your wallet.`,
      meta:      { booking_id: booking.id, booking_ref: booking.booking_ref, amount_credited: partnerAmount },
    });

    console.log(`✅ [Delivery] Booking ${booking.booking_ref} marked DELIVERED. ₹${partnerAmount} credited to traveller ${travellerId}.`);

    return {
      booking_id: booking.id,
      status: "DELIVERED",
      message: "Delivery completed successfully!",
      delivered_at: deliveredAt,
    };
  }

  // Traveller cancels booking
  async cancelBooking(bookingId, travellerId, cancellationData = {}) {
    const { reason = "other", details = "" } = cancellationData;
    
    const booking = await this.getBookingWithDetails(bookingId);

    if (!booking) {
      throw new Error("Booking not found");
    }

    if (booking.traveller_id !== travellerId) {
      throw new Error("Unauthorized: You don't own this booking");
    }

    // Validate the CANCELLED transition is allowed from current status
    assertValidTransition(booking.status, "CANCELLED", BOOKING_TRANSITIONS, "Booking");

    // Update booking status to CANCELLED
    await booking.update({
      status: "CANCELLED",
    });

    // Update parcel status to CANCELLED
    await booking.parcel.update({
      status: "CANCELLED",
    });

    auditLog({
      action:       "BOOKING_CANCELLED",
      actorId:      travellerId,
      actorRole:    "traveller",
      resourceType: "booking",
      resourceId:   booking.id,
      meta:         { parcel_id: booking.parcel_id, reason, booking_ref: booking.booking_ref },
    });

    // Restore route capacity when booking is cancelled
    try {
      const parcelWeight = booking.parcel?.weight;
      if (parcelWeight && booking.trip_id) {
        await TravellerRoute.increment(
          "available_capacity_kg",
          { by: Math.ceil(parcelWeight), where: { id: booking.trip_id } }
        );
        console.log(`[Booking] Restored ${Math.ceil(parcelWeight)} kg capacity to route ${booking.trip_id}`);
      }
    } catch (capErr) {
      console.warn("[Booking] Failed to restore route capacity (non-fatal):", capErr.message);
    }

    // Attempt refund for PAY_NOW bookings (non-fatal — cancellation already succeeded)
    try {
      const { refunded, amount: refundedAmount } = await refundPaymentForParcel(
        booking.parcel_id,
        `Booking cancelled by traveller: ${reason}`
      );
      if (refunded) {
        console.log(`[Cancellation] Refund of ₹${refundedAmount} initiated for booking ${booking.booking_ref}`);
      }
    } catch (refundErr) {
      console.warn("[Cancellation] Refund attempt failed (non-fatal):", refundErr.message);
    }

    // Log cancellation
    console.log(`📋 [Cancellation] Booking cancelled:`, {
      booking_id: booking.id,
      parcel_id: booking.parcel_id,
      traveller_id: travellerId,
      previous_status: booking.status,
      new_status: "CANCELLED",
      reason,
      details,
    });

    // Emit WebSocket event to sender (user)
    const senderId = booking.parcel.user_id;
    const io = this.getIO();
    if (io) {
      const travellerProfile = await TravellerProfile.findOne({
        where: { user_id: travellerId },
        include: [{ model: User, as: "user" }],
      });
      const travellerName = travellerProfile?.user?.name || "Traveller";

      const eventData = {
        booking_id: booking.id,
        parcel_id: booking.parcel_id,
        status: "CANCELLED",
        cancelled_by: "traveller",
        traveller_name: travellerName,
        reason,
        cancelled_at: new Date(),
      };

      const senderRoom = `user_${senderId}`;
      const travellerRoom = `user_${travellerId}`;
      
      io.to(senderRoom).emit("booking_cancelled", eventData);
      console.log(`[WebSocket] Emitted booking_cancelled to sender ${senderRoom}`);
      
      // Notify traveller as well
      io.to(travellerRoom).emit("booking_cancelled", eventData);
      console.log(`[WebSocket] Emitted booking_cancelled to traveller ${travellerRoom}`);
    }

    // ── Persist notifications ──────────────────────────────────────────────
    const io2 = this.getIO();
    await createNotification(io2, {
      user_id:   booking.parcel.user_id,
      role:      "user",
      type_code: "booking_cancelled",
      title:     "Booking Cancelled",
      message:   `Your booking ${booking.booking_ref} has been cancelled by the traveller.`,
      meta:      { booking_id: booking.id, booking_ref: booking.booking_ref, reason },
    });

    return {
      success: true,
      booking_id: booking.id,
      parcel_id: booking.parcel_id,
      status: "CANCELLED",
      message: "Booking cancelled successfully",
      cancelled_at: new Date(),
    };
  }

  // POST /api/booking/:bookingId/receive-payment (Traveller confirms cash/UPI receipt for PAD bookings)
  async receivePayment(bookingId, travellerId) {
    // PAY_AFTER_DELIVERY mode has been removed - all payments are PAY_NOW
    throw new Error("Pay After Delivery mode is no longer supported. All bookings use PAY_NOW mode.");
  }
}

export default new BookingService();
