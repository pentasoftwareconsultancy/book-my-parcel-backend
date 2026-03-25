import Booking from "./booking.model.js";
import Parcel from "../parcel/parcel.model.js";
import Address from "../parcel/address.model.js";
import User from "../user/user.model.js";
import TravellerProfile from "../traveller/travellerProfile.model.js";
import twilioService from "../../services/twilio.service.js";
import otpConfig from "../../config/otp.config.js";
import app from "../../app.js";

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
    return await Booking.findOne({
      where: { id: bookingId },
      include: [
        {
          model: Parcel,
          as: "parcel",
          include: [
            {
              model: Address,
              as: "pickupAddress",
              foreignKey: "pickup_address_id",
            },
            {
              model: Address,
              as: "deliveryAddress",
              foreignKey: "delivery_address_id",
            },
            {
              model: User,
              as: "user",
            },
          ],
        },
      ],
    });
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

    if (booking.status !== "CONFIRMED") {
      throw new Error(`Invalid status: Expected CONFIRMED, got ${booking.status}`);
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

    // Send SMS via Twilio
    await twilioService.sendPickupOTP(
      senderPhone,
      otp,
      booking.booking_ref,
      travellerName
    );

    // Emit WebSocket event to sender
    const senderId = booking.parcel.user_id;
    const io = this.getIO();
    if (io) {
      io.to(`user_${senderId}`).emit("pickup_otp_generated", {
        booking_id: booking.id,
        pickup_otp: otp,
        traveller_name: travellerName,
        traveller_phone: travellerProfile?.user?.phone,
        message: "Traveller has arrived at pickup location",
      });
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

    if (booking.status !== "PICKUP") {
      throw new Error(`Invalid status: Expected PICKUP, got ${booking.status}`);
    }

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

    // OTP is correct - update status to IN_TRANSIT
    await booking.update({
      status: "IN_TRANSIT",
      pickup_otp: null, // Clear OTP for security
      pickup_verified_at: new Date(),
      pickup_otp_attempts: 0,
    });

    // Emit WebSocket event
    const senderId = booking.parcel.user_id;
    const io = this.getIO();
    if (io) {
      io.to(`user_${senderId}`).emit("pickup_verified", {
        booking_id: booking.id,
        status: "IN_TRANSIT",
        pickup_verified_at: booking.pickup_verified_at,
      });
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

    if (booking.status !== "IN_TRANSIT") {
      throw new Error(`Invalid status: Expected IN_TRANSIT, got ${booking.status}`);
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

    // Send SMS via Twilio
    await twilioService.sendDeliveryOTP(
      recipientPhone,
      otp,
      booking.booking_ref,
      travellerName
    );

    // Emit WebSocket event to recipient (sender in this case, could be different)
    const senderId = booking.parcel.user_id;
    const io = this.getIO();
    if (io) {
      io.to(`user_${senderId}`).emit("delivery_otp_generated", {
        booking_id: booking.id,
        delivery_otp: otp,
        traveller_name: travellerName,
        traveller_phone: travellerProfile?.user?.phone,
        message: "Traveller has arrived at delivery location",
      });
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

    if (booking.status !== "IN_TRANSIT") {
      throw new Error(`Invalid status: Expected IN_TRANSIT, got ${booking.status}`);
    }

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
        // Lock OTP
        const lockUntil = new Date();
        lockUntil.setMinutes(lockUntil.getMinutes() + otpConfig.LOCKOUT_MINUTES);

        await booking.update({
          delivery_otp_attempts: newAttempts,
          delivery_otp_locked_until: lockUntil,
        });

        throw new Error("Maximum attempts exceeded. OTP has been locked for 15 minutes");
      }

      await booking.update({
        delivery_otp_attempts: newAttempts,
      });

      const attemptsRemaining = otpConfig.MAX_ATTEMPTS - newAttempts;
      const error = new Error("Invalid OTP. Please check with recipient and try again");
      error.attemptsRemaining = attemptsRemaining;
      throw error;
    }

    // OTP is correct - update status to DELIVERED
    await booking.update({
      status: "DELIVERED",
      delivery_otp: null, // Clear OTP for security
      delivered_at: new Date(),
      delivery_otp_attempts: 0,
    });

    // TODO: Release payment to traveller wallet
    // TODO: Update traveller's total_deliveries count

    // Send delivery confirmation SMS to sender
    try {
      const senderUser = await User.findByPk(booking.parcel.user_id);
      if (senderUser && senderUser.phone_number) {
        const deliveryAddress = booking.parcel.deliveryAddress;
        const message = `Your parcel has been successfully delivered to ${deliveryAddress.city}! Booking Ref: ${booking.booking_ref}. Thank you for using BookMyParcel.`;
        
        await twilioService.sendSMS(senderUser.phone_number, message);
        console.log(`✅ Delivery confirmation SMS sent to sender: ${senderUser.phone_number}`);
      }
    } catch (smsError) {
      console.error("❌ Failed to send delivery confirmation SMS:", smsError.message);
      // Don't throw error - delivery is already successful
    }

    // Emit WebSocket event
    const senderId = booking.parcel.user_id;
    const io = this.getIO();
    if (io) {
      io.to(`user_${senderId}`).emit("delivery_verified", {
        booking_id: booking.id,
        status: "DELIVERED",
        delivered_at: booking.delivered_at,
      });
    }

    return {
      booking_id: booking.id,
      status: "DELIVERED",
      message: "Delivery completed successfully!",
      delivered_at: booking.delivered_at,
      // earnings: 500, // TODO: Calculate from booking
    };
  }
}

export default new BookingService();
