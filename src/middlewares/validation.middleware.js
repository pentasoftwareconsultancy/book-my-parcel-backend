import { body, validationResult } from "express-validator";
import Joi from "joi";

// ─── express-validator helpers ────────────────────────────────────────────────

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }
  next();
};

export const validateUser = [
  body("name")
    .trim()
    .notEmpty().withMessage("Name is required")
    .isLength({ min: 2, max: 50 }).withMessage("Name must be 2-50 characters")
    .matches(/^[A-Za-z\s]+$/).withMessage("Name must contain only letters"),

  body("email")
    .trim()
    .isEmail().withMessage("Invalid email format")
    .normalizeEmail(),

  body("phone")
    .trim()
    .matches(/^[6-9]\d{9}$/).withMessage("Invalid Indian phone number"),

  body("password")
    .isLength({ min: 8 }).withMessage("Password must be at least 8 characters")
    .matches(/[A-Z]/).withMessage("Must contain one uppercase letter")
    .matches(/[a-z]/).withMessage("Must contain one lowercase letter")
    .matches(/[0-9]/).withMessage("Must contain one number")
    .matches(/[@$!%*?&]/).withMessage("Must contain one special character"),

  handleValidation
];

export const validateKYC = [
  body("aadhaar")
    .trim()
    .matches(/^\d{12}$/).withMessage("Aadhaar must be 12 digits"),

  body("pan")
    .trim()
    .matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)
    .withMessage("Invalid PAN format"),

  body("drivingLicense")
    .trim()
    .matches(/^[A-Z]{2}\d{2}\s?\d{11}$/)
    .withMessage("Invalid Driving License format"),

  body("ifsc")
    .trim()
    .matches(/^[A-Z]{4}0[A-Z0-9]{6}$/)
    .withMessage("Invalid IFSC code"),

  body("accountNumber")
    .trim()
    .isLength({ min: 9, max: 18 })
    .withMessage("Account number must be 9-18 digits")
    .isNumeric().withMessage("Account number must contain only digits"),

  handleValidation
];

export const validateCommonFields = [
  body("dateOfBirth")
    .isISO8601().withMessage("Invalid date format (YYYY-MM-DD)")
    .custom(value => {
      const dob = new Date(value);
      if (dob >= new Date()) {
        throw new Error("Date of birth must be in the past");
      }
      return true;
    }),

  body("gender")
    .isIn(["MALE", "FEMALE", "OTHER"])
    .withMessage("Invalid gender value"),

  body("date")
    .optional()
    .isISO8601().withMessage("Invalid date format"),

  body("number")
    .optional()
    .isNumeric().withMessage("Must be a number"),

  body("earning")
    .optional()
    .isFloat({ min: 0 }).withMessage("Earning must be positive"),

  handleValidation
];

// ─── Joi: Parcel Request Schema ───────────────────────────────────────────────

const addressSchema = Joi.object({
  name:      Joi.string().min(2).max(100).optional().allow("", null),
  address:   Joi.string().min(5).max(300).required(),
  city:      Joi.string().min(2).max(100).required(),
  state:     Joi.string().min(2).max(100).required(),
  pincode:   Joi.string().pattern(/^\d{4,10}$/).required().messages({
    "string.pattern.base": "pincode must be 4-10 digits",
  }),
  country:   Joi.string().min(2).max(100).required(),
  phone:     Joi.string().pattern(/^[+]?[\d\s\-]{7,15}$/).required().messages({
    "string.pattern.base": "phone must be a valid phone number",
  }),
  alt_phone: Joi.string().pattern(/^[+]?[\d\s\-]{7,15}$|^$/).optional().allow("", null),
  aadhar_no: Joi.string().pattern(/^\d{12}$/).optional().allow("", null).messages({
    "string.pattern.base": "aadhar_no must be exactly 12 digits",
  }),
  aadhaar:   Joi.string().pattern(/^\d{12}$/).optional().allow("", null).messages({
    "string.pattern.base": "aadhaar must be exactly 12 digits",
  }),
  place_id:  Joi.string().max(500).optional().allow("", null),
  datetime:  Joi.string().optional().allow("", null), // pickup schedule field from frontend
});

export const parcelRequestSchema = Joi.object({
  package_size:   Joi.string().valid("small", "medium", "large", "extra_large").required(),
  weight:         Joi.number().min(0).optional(),
  length:         Joi.number().min(0).optional().allow(null),
  width:          Joi.number().min(0).optional().allow(null),
  height:         Joi.number().min(0).optional().allow(null),
  description:    Joi.string().max(500).optional().allow("", null),
  delivery_speed: Joi.string().optional(),
  parcel_type:    Joi.string().max(100).optional().allow("", null), // user content type e.g. "Documents"
  value:          Joi.number().min(0).optional().allow(null),
  notes:          Joi.string().max(500).optional().allow("", null),
  price_quote:    Joi.number().min(0).optional().allow(null),
  pickup_address:   addressSchema.required(),
  delivery_address: addressSchema.required(),
  // Optional fields for form flow
  form_step:              Joi.number().integer().min(1).max(3).optional().allow(null),
  selected_partner_id:    Joi.string().uuid().optional().allow("", null),
  selected_acceptance_id: Joi.string().uuid().optional().allow("", null),
}).options({ allowUnknown: false });

// ─── Middleware: Parse JSON strings from multipart form-data ──────────────────
// When the client sends a multipart/form-data request (for file uploads),
// nested objects like pickup_address arrive as JSON strings.
// This middleware parses them back into objects before validation.
export function parseJsonFields(...fieldNames) {
  return (req, _res, next) => {
    for (const field of fieldNames) {
      if (typeof req.body[field] === "string") {
        try {
          req.body[field] = JSON.parse(req.body[field]);
        } catch {
          // Leave as-is; Joi validation will catch the type error
        }
      }
    }
    next();
  };
}

// ─── Middleware: Joi schema validation factory ────────────────────────────────
export function validateRequest(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      console.error('[Validation] Request body:', JSON.stringify(req.body, null, 2));
      console.error('[Validation] Validation errors:', error.details);
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: error.details.map((d) => ({
          field:   d.path.join("."),
          message: d.message,
        })),
      });
    }
    req.body = value; // replace with Joi-sanitised value
    next();
  };
}