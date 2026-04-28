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

// Separate limiters for login and signup
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 5 : 50, // 50 for dev, 5 for prod
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: "Too many login attempts. Please wait 15 minutes and try again."
  }
});

export const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 10 : 100, // 100 for dev, 10 for prod
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: "Too many signup attempts. Please wait 15 minutes and try again."
  }
});

export const sensitiveLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 20 : 200, // 200 for dev, 20 for prod
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
  max: process.env.NODE_ENV === 'production' ? 5 : 50, // 50 for dev, 5 for prod
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
  max: process.env.NODE_ENV === 'production' ? 10 : 100, // 100 for dev, 10 for prod
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many OTP verification attempts. Please try again later."
  }
});