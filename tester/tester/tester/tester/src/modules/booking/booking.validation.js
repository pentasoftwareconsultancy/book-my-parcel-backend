import Joi from "joi";

// Validate OTP format
export const otpSchema = Joi.object({
  otp: Joi.string()
    .length(4)
    .pattern(/^\d{4}$/)
    .required()
    .messages({
      "string.length": "OTP must be exactly 4 digits",
      "string.pattern.base": "OTP must contain only numbers",
      "any.required": "OTP is required",
    }),
});

// Validate booking ID in params
export const bookingIdSchema = Joi.object({
  bookingId: Joi.string()
    .uuid()
    .required()
    .messages({
      "string.guid": "Invalid booking ID format",
      "any.required": "Booking ID is required",
    }),
});

// Middleware: Joi schema validation factory
export function validateRequest(schema, source = "body") {
  return (req, res, next) => {
    const data = source === "params" ? req.params : req.body;
    const { error, value } = schema.validate(data, { abortEarly: false });
    
    if (error) {
      console.error(`[Validation] ${source} validation errors:`, error.details);
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: error.details.map((d) => ({
          field: d.path.join("."),
          message: d.message,
        })),
      });
    }
    
    // Replace with validated value
    if (source === "params") {
      req.params = value;
    } else {
      req.body = value;
    }
    
    next();
  };
}
