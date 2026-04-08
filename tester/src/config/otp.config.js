export default {
  OTP_LENGTH: parseInt(process.env.OTP_LENGTH) || 4,
  MAX_ATTEMPTS: parseInt(process.env.OTP_MAX_ATTEMPTS) || 3,
  EXPIRY_MINUTES: parseInt(process.env.OTP_EXPIRY_MINUTES) || 30,
  LOCKOUT_MINUTES: parseInt(process.env.OTP_LOCKOUT_MINUTES) || 15,
};
