import rateLimit from "express-rate-limit";

// More lenient limits for development
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000, // Increased to 2000 for development testing
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests, please try again later."
  }
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Try again after 15 minutes."
  }
});

export const sensitiveLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many attempts on sensitive route."
  }
});

// More lenient limiter for parcel creation (users may need to retry with corrections)
export const parcelCreationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200, // Increased to 200 for development testing
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Only count failed requests
  message: {
    success: false,
    message: "Too many parcel creation attempts. Please try again in a few minutes."
  }
});

// OTP generation limiter (prevent spam)
export const otpGenerationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // Max 5 OTP requests per 5 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many OTP requests. Please try again in a few minutes."
  }
});

// OTP verification limiter (prevent brute force)
export const otpVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 verification attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many OTP verification attempts. Please try again later."
  }
});