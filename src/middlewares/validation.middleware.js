import { body, validationResult } from "express-validator";

// Common error handler
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