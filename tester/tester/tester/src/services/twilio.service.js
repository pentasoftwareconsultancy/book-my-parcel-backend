import twilio from "twilio";

class TwilioService {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.phoneNumber = process.env.TWILIO_PHONE_NUMBER;
    this.smsEnabled = process.env.TWILIO_SMS_ENABLED === 'true'; // Add flag to enable/disable SMS
    
    if (this.accountSid && this.authToken) {
      this.client = twilio(this.accountSid, this.authToken);
    } else {
      console.warn("⚠️ Twilio credentials not configured. SMS will be skipped.");
    }
    
    if (!this.smsEnabled) {
      console.warn("⚠️ SMS sending is DISABLED. OTPs will only be logged to console.");
    }
  }

  // Format phone number to E.164 format
  formatPhoneNumber(phone) {
    if (!phone) return null;
    
    // Remove all spaces, dashes, and parentheses
    let cleaned = phone.replace(/[\s\-\(\)]/g, '');
    
    // If already has +, return as is
    if (cleaned.startsWith('+')) {
      return cleaned;
    }
    
    // If starts with country code without +, add it
    if (cleaned.startsWith('91') && cleaned.length === 12) {
      return `+${cleaned}`;
    }
    
    // Assume Indian number if 10 digits
    if (cleaned.length === 10) {
      return `+91${cleaned}`;
    }
    
    // Return as is if we can't determine format
    return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
  }

  async sendSMS(to, message) {
    // Validate phone number
    if (!to) {
      console.warn(`⚠️ [SMS] Cannot send SMS - phone number is null or empty`);
      console.log(`📱 [SMS] Message content: ${message}`);
      return { success: false, message: "Phone number is required", skipped: true };
    }
    
    // Check if SMS is disabled
    if (!this.smsEnabled) {
      console.log(`📱 SMS (DISABLED - Logging Only): To: ${to}, Message: ${message}`);
      return { success: true, message: "SMS disabled - logged only", skipped: true };
    }
    
    if (!this.client) {
      console.log(`📱 SMS (Skipped - No Twilio): To: ${to}, Message: ${message}`);
      return { success: false, message: "Twilio not configured" };
    }

    try {
      // Format phone number
      const formattedPhone = this.formatPhoneNumber(to);
      
      const result = await this.client.messages.create({
        body: message,
        from: this.phoneNumber,
        to: formattedPhone,
      });

      console.log(`✅ SMS sent successfully to ${formattedPhone}. SID: ${result.sid}`);
      return { success: true, sid: result.sid };
    } catch (error) {
      console.error(`❌ Failed to send SMS to ${to}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async sendPickupOTP(phone, otp, bookingRef, travellerName) {
    const message = `Book My Parcel: Your pickup OTP is ${otp}. Traveller ${travellerName} has arrived. Share this OTP to confirm parcel handover. Booking: ${bookingRef}`;
    return await this.sendSMS(phone, message);
  }

  async sendDeliveryOTP(phone, otp, bookingRef, travellerName) {
    const message = `Book My Parcel: Your delivery OTP is ${otp}. Traveller ${travellerName} has arrived with your parcel. Share this OTP to confirm delivery. Booking: ${bookingRef}`;
    return await this.sendSMS(phone, message);
  }
}

export default new TwilioService();
