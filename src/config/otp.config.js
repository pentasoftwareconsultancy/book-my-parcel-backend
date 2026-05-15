export default {
  OTP_LENGTH:       parseInt(process.env.OTP_LENGTH)           || 4,
  MAX_ATTEMPTS:     parseInt(process.env.OTP_MAX_ATTEMPTS)     || 5,
  EXPIRY_MINUTES:   parseInt(process.env.OTP_EXPIRY_MINUTES)   || 5,   // 5 min TTL in Redis
  LOCKOUT_MINUTES:  parseInt(process.env.OTP_LOCKOUT_MINUTES)  || 15,
};
