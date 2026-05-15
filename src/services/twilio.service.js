import twilio from "twilio";
import { sendWhatsApp } from "./whatsapp.service.js";

class TwilioService {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.phoneNumber = process.env.TWILIO_PHONE_NUMBER;
    this.smsEnabled = process.env.TWILIO_SMS_ENABLED === 'true';
    // Trial mode: all messages go to TEST_PHONE_NUMBER (Twilio free trial restriction)
    this.trialMode = process.env.TWILIO_TRIAL_MODE === 'true';
    this.testPhone = process.env.TEST_PHONE_NUMBER;

    if (this.accountSid && this.authToken) {
      this.client = twilio(this.accountSid, this.authToken);
    } else {
      console.warn("⚠️ Twilio credentials not configured. SMS will be skipped.");
    }

    if (!this.smsEnabled) {
      console.warn("⚠️ SMS sending is DISABLED. OTPs will only be logged to console.");
    }

    if (this.trialMode) {
      console.warn(`⚠️ Twilio TRIAL MODE — all SMS redirected to ${this.testPhone}`);
    }
  }

  // Format phone number to E.164 format
  formatPhoneNumber(phone) {
    if (!phone) return null;
    let cleaned = phone.replace(/[\s\-\(\)]/g, '');
    if (cleaned.startsWith('+')) return cleaned;
    if (cleaned.startsWith('91') && cleaned.length === 12) return `+${cleaned}`;
    if (cleaned.length === 10) return `+91${cleaned}`;
    return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
  }

  // In trial mode, always send to the verified test number
  resolveRecipient(to) {
    if (this.trialMode && this.testPhone) {
      const formatted = this.formatPhoneNumber(this.testPhone);
      if (formatted !== this.formatPhoneNumber(to)) {
        console.log(`[SMS] Trial mode: redirecting ${to} → ${formatted}`);
      }
      return formatted;
    }
    return this.formatPhoneNumber(to);
  }

  async sendSMS(to, message, { maxAttempts = 3, baseDelayMs = 1000 } = {}) {
    if (!to) {
      console.warn(`⚠️ [SMS] Cannot send SMS - phone number is null or empty`);
      console.log(`📱 [SMS] Message content: ${message}`);
      return { success: false, message: "Phone number is required", skipped: true };
    }

    if (!this.smsEnabled) {
      console.log(`📱 SMS (DISABLED - Logging Only): To: ${to}, Message: ${message}`);
      return { success: true, message: "SMS disabled - logged only", skipped: true };
    }

    if (!this.client) {
      console.log(`📱 SMS (Skipped - No Twilio): To: ${to}, Message: ${message}`);
      return { success: false, message: "Twilio not configured" };
    }

    const formattedPhone = this.resolveRecipient(to);
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log("[SMS] Sending:", {
          from: this.phoneNumber,
          to: formattedPhone,
          body: message
        });
        const result = await this.client.messages.create({
          body: message,
          from: this.phoneNumber,
          to: formattedPhone,
        });

        console.log(`✅ SMS sent to ${formattedPhone} (attempt ${attempt}). SID: ${result.sid}`);
        return { success: true, sid: result.sid };
      } catch (error) {
        lastError = error;

        const permanentCodes = [21211, 21614, 21408, 30003, 30004, 30005];
        if (permanentCodes.includes(error.code)) {
          console.error(`❌ SMS permanent failure to ${formattedPhone} (code ${error.code}): ${error.message}`);
          return { success: false, error: error.message, code: error.code, permanent: true };
        }

        if (attempt < maxAttempts) {
          const delay = baseDelayMs * Math.pow(2, attempt - 1);
          console.warn(`⚠️ SMS attempt ${attempt}/${maxAttempts} failed for ${formattedPhone}: ${error.message}. Retrying in ${delay}ms…`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    console.error(`❌ SMS failed after ${maxAttempts} attempts to ${formattedPhone}: ${lastError?.message}`);
    return { success: false, error: lastError?.message };
  }

  async sendPickupOTP(phone, otp, bookingRef, travellerName) {
    const message = `Book My Parcel: Your pickup OTP is ${otp}. Traveller ${travellerName} has arrived. Share this OTP to confirm parcel handover. Booking: ${bookingRef}`;

    // Send both SMS and WhatsApp in parallel
    const [smsResult, whatsappResult] = await Promise.allSettled([
      this.sendSMS(phone, message),
      sendWhatsApp(phone, message)
    ]);

    console.log("Pickup OTP Results:", {
      sms: smsResult.value,
      whatsapp: whatsappResult.value
    });
    return {
      sms: smsResult.status === 'fulfilled' ? smsResult.value : { success: false, error: smsResult.reason },
      whatsapp: whatsappResult.status === 'fulfilled' ? whatsappResult.value : { success: false, error: whatsappResult.reason }
    };
  }

  async sendDeliveryOTP(phone, otp, bookingRef, travellerName) {
    const message = `Book My Parcel: Your delivery OTP is ${otp}. Traveller ${travellerName} has arrived with your parcel. Share this OTP to confirm delivery. Booking: ${bookingRef}`;

    // Send both SMS and WhatsApp in parallel
    const [smsResult, whatsappResult] = await Promise.allSettled([
      this.sendSMS(phone, message),
      sendWhatsApp(phone, message)
    ]);

    console.log(`[Delivery OTP] SMS: ${smsResult.status}, WhatsApp: ${whatsappResult.status}`);

    return {
      sms: smsResult.status === 'fulfilled' ? smsResult.value : { success: false, error: smsResult.reason },
      whatsapp: whatsappResult.status === 'fulfilled' ? whatsappResult.value : { success: false, error: whatsappResult.reason }
    };
  }

  async sendTrackingLink(phone, trackingUrl, bookingRef) {
    const message = `Book My Parcel: Your parcel is on the way! 🚚\nTrack it live here: ${trackingUrl}\nBooking Ref: ${bookingRef}`;

    const [smsResult, whatsappResult] = await Promise.allSettled([
      this.sendSMS(phone, message),
      sendWhatsApp(phone, message)
    ]);

    console.log(`[Tracking Link] SMS: ${smsResult.status}, WhatsApp: ${whatsappResult.status}`);

    return {
      sms: smsResult.status === 'fulfilled' ? smsResult.value : { success: false, error: smsResult.reason },
      whatsapp: whatsappResult.status === 'fulfilled' ? whatsappResult.value : { success: false, error: whatsappResult.reason }
    };
  }
}

export default new TwilioService();
