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
    console.log(`🔍 [DEBUG] getBookingWithDetails called with bookingId: ${bookingId}`);
    
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
    
    console.log(`🔍 [DEBUG] Booking query result:`, booking ? 'FOUND' : 'NOT FOUND');
    if (booking) {
      console.log(`🔍 [DEBUG] Found booking:`, {
        id: booking.id,
        status: booking.status,
        traveller_id: booking.traveller_id,
        parcel_id: booking.parcel_id,
        hasParcel: !!booking.parcel,
        hasPickupAddress: !!booking.parcel?.pickupAddress
      });
    }
    
    return booking;
  }

  // Start pickup process
  async startPickup(bookingId, travellerId) {
    console.log(`🔍 [DEBUG] startPickup called with:`, { bookingId, travellerId });
    
    const booking = await this.getBookingWithDetails(bookingId);
    console.log(`🔍 [DEBUG] Booking found:`, booking ? 'YES' : 'NO');
    
    if (booking) {
      console.log(`🔍 [DEBUG] Booking details:`, {
        id: booking.id,
        status: booking.status,
        traveller_id: booking.traveller_id,
        parcel_id: booking.parcel_id
      });
    }

    if (!booking) {
      console.error(`❌ [DEBUG] Booking not found for ID: ${bookingId}`);
      throw new Error("Booking not found");
    }

    if (booking.traveller_id !== travellerId) {
      console.error(`❌ [DEBUG] Unauthorized access:`, {
        booking_traveller_id: booking.traveller_id,
        request_traveller_id: travellerId
      });
      throw new Error("Unauthorized: You don't own this booking");
    }

    // Allow CONFIRMED or PICKUP status (for resend)
    if (!["CONFIRMED", "PICKUP"].includes(booking.status)) {
      console.error(`❌ [DEBUG] Invalid status:`, {
        current_status: booking.status,
        expected: ["CONFIRMED", "PICKUP"]
      });
      throw new Error(`Invalid status: Expected CONFIRMED or PICKUP, got ${booking.status}`);
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
      io.to(travellerRoom).emit("pickup_otp_generated", eventData);
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
      io.to(travellerRoom).emit("delivery_otp_generated", eventData);
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
        
        const smsResult = await twilioService.sendSMS(senderUser.phone_number, message);
        
        if (smsResult.skipped) {
          console.log(`📱 [Delivery Confirmation] SMS disabled - would have sent to: ${senderUser.phone_number}`);
        } else if (smsResult.success) {
          console.log(`✅ [Delivery Confirmation] SMS sent to sender: ${senderUser.phone_number}`);
        } else {
          console.warn(`⚠️ [Delivery Confirmation] Failed to send SMS to sender: ${senderUser.phone_number}`);
        }
      }
    } catch (smsError) {
      console.error("❌ [Delivery Confirmation] Error sending SMS:", smsError.message);
      // Don't throw error - delivery is already successful
    }

    // Emit WebSocket event to sender AND traveller
    const senderId = booking.parcel.user_id;
    const io = this.getIO();
    if (io) {
      const eventData = {
        booking_id: booking.id,
        status: "DELIVERED",
        delivered_at: booking.delivered_at,
      };
      
      // Log room information for debugging
      const senderRoom = `user_${senderId}`;
      const travellerRoom = `user_${travellerId}`;
      const senderClients = io.sockets.adapter.rooms.get(senderRoom);
      const travellerClients = io.sockets.adapter.rooms.get(travellerRoom);
      
      console.log(`[WebSocket] Attempting to emit delivery_verified:`);
      console.log(`  - Sender room: ${senderRoom} (${senderClients?.size || 0} clients)`);
      console.log(`  - Traveller room: ${travellerRoom} (${travellerClients?.size || 0} clients)`);
      
      // Emit to sender (user who created the parcel)
      io.to(senderRoom).emit("delivery_verified", eventData);
      console.log(`[WebSocket] Emitted delivery_verified to ${senderRoom}`);
      
      // Emit to traveller
      io.to(travellerRoom).emit("delivery_verified", eventData);
      console.log(`[WebSocket] Emitted delivery_verified to ${travellerRoom}`);
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
