import User from "../modules/user/user.model.js";
import TravellerProfile from "../modules/traveller/travellerProfile.model.js";
import { Op } from "sequelize";

// ==========================================
//         SIGNUP VALIDATION
// ==========================================

export function validateSignupData(userData) {
    const errors = [];

    // ✅ Email
    if (!userData.email) {
        errors.push("Email is required");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userData.email)) {
        errors.push("Enter valid email address");
    }

    // ✅ Password — same rules as frontend
    if (!userData.password) {
        errors.push("Password is required");
    } else {
        if (userData.password.length < 8)
            errors.push("Password must be at least 8 characters long");
        if (!/[A-Z]/.test(userData.password))
            errors.push("Password must contain at least one uppercase letter");
        if (!/[a-z]/.test(userData.password))
            errors.push("Password must contain at least one lowercase letter");
        if (!/[0-9]/.test(userData.password))
            errors.push("Password must contain at least one number");
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(userData.password))
            errors.push("Password must contain at least one special character");
    }

    // ✅ Phone — Indian mobile (starts with 6-9, exactly 10 digits)
    if (!userData.phone_number) {
        errors.push("Mobile number is required");
    } else if (!/^[6-9]\d{9}$/.test(userData.phone_number)) {
        errors.push("Enter valid 10 digit Indian mobile number");
    }

    // ✅ Alternate phone — only if provided
    if (userData.alternate_phone && !/^[6-9]\d{9}$/.test(userData.alternate_phone)) {
        errors.push("Enter valid 10 digit Indian mobile number for alternate phone");
    }

    // ✅ Name — only letters and spaces, min 2 characters
    if (!userData.name || !userData.name.trim()) {
        errors.push("Full name is required");
    } else {
        if (!/^[A-Za-z\s]+$/.test(userData.name))
            errors.push("Full name must contain only letters");
        if (userData.name.trim().length < 2)
            errors.push("Full name must be at least 2 characters");
    }

    if (errors.length > 0) {
        const error = new Error(errors.join(", "));
        error.statusCode = 400;
        throw error;
    }
}


// ==========================================
//         KYC SUBMIT VALIDATION
// ==========================================

export const validateKYC = (req, res, next) => {
    const {
        first_name,
        last_name,
        dob,
        gender,
        aadhar_number,
        pan_number
    } = req.body;

    const errors = [];

    if (!first_name) errors.push("First name required");
    if (!last_name) errors.push("Last name required");

    // ✅ DOB — valid date + past date + age 18-100
    if (!dob) {
        errors.push("DOB required");
    } else {
        const dobDate = new Date(dob);
        const today = new Date();

        if (isNaN(dobDate.getTime())) {
            errors.push("Invalid date of birth format");
        } else if (dobDate >= today) {
            errors.push("Date of birth must be in the past");
        } else {
            const age = today.getFullYear() - dobDate.getFullYear();
            if (age < 18) errors.push("You must be at least 18 years old");
            if (age > 100) errors.push("Invalid date of birth");
        }
    }

    // ✅ Gender — was never validated before
    const allowedGenders = ["MALE", "FEMALE", "OTHER"];
    if (!gender || !allowedGenders.includes(gender.toUpperCase()))
        errors.push("Gender is required (MALE, FEMALE, OTHER)");

    if (!aadhar_number || !/^\d{12}$/.test(aadhar_number))
        errors.push("Valid Aadhar required (exactly 12 digits)");

    if (!pan_number || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan_number))
        errors.push("Valid PAN required (e.g. ABCDE1234F)");

    if (errors.length > 0)
        return res.status(400).json({ errors });

    next();
};


// ==========================================
//         KYC STATUS UPDATE VALIDATION
// ==========================================

export const validateStatus = (req, res, next) => {
    const { status, rejection_reason } = req.body;

    const allowed = ["PENDING", "APPROVED", "REJECTED"];

    if (!status || !allowed.includes(status))
        return res.status(400).json({ error: "Invalid status value" });

    // ✅ Rejection reason required when status is REJECTED
    if (status === "REJECTED" && (!rejection_reason || rejection_reason.trim() === ""))
        return res.status(400).json({ error: "Rejection reason is required when status is REJECTED" });

    next();
};






//   travell profile   validation 



// ✅ Email Format Validation
export const validateEmail = (email) => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!regex.test(email)) {
    throw new Error("Invalid email format");
  }
};

// ✅ Indian Phone Validation (10 digits)
export const validatePhone = (phone) => {
  const regex = /^[6-9]\d{9}$/;
  if (!regex.test(phone)) {
    throw new Error("Invalid phone number");
  }
};

// ✅ Check Duplicate Email in BOTH tables
export const checkDuplicateEmail = async (email, userId = null) => {
  const userExists = await User.findOne({
    where: {
      email,
      ...(userId && { id: { [Op.ne]: userId } }),
    },
  });

  const travellerExists = await TravellerProfile.findOne({
    where: {
      email,
      ...(userId && { user_id: { [Op.ne]: userId } }),
    },
  });

  if (userExists || travellerExists) {
    throw new Error("Email already exists");
  }
};

// ✅ Check Duplicate Phone in BOTH tables
export const checkDuplicatePhone = async (phone, userId = null) => {
  const userExists = await User.findOne({
    where: {
      phone_number: phone,
      ...(userId && { id: { [Op.ne]: userId } }),
    },
  });

  const travellerExists = await TravellerProfile.findOne({
    where: {
      phone_number: phone,
      ...(userId && { user_id: { [Op.ne]: userId } }),
    },
  });

  if (userExists || travellerExists) {
    throw new Error("Phone number already exists");
  }
};


// ==========================================
//         ROUTE VALIDATION
// ==========================================

export const validateRoute = (req, res, next) => {
  const {
    originCity,
    originState,
    destinationCity,
    destinationState,
    departureDate,
    departureTime,
    arrivalDate,
    arrivalTime,
    vehicleType,
    acceptedParcelTypes
  } = req.body;

  const errors = [];

  // Form 1: Route Details
  if (!originCity?.trim()) errors.push("Origin city is required");
  if (!originState?.trim()) errors.push("Origin state is required");
  if (!destinationCity?.trim()) errors.push("Destination city is required");
  if (!destinationState?.trim()) errors.push("Destination state is required");
  
  if (!departureDate) errors.push("Departure date is required");
  if (!departureTime) errors.push("Departure time is required");
  if (!arrivalDate) errors.push("Arrival date is required");
  if (!arrivalTime) errors.push("Arrival time is required");

  // Form 2: Vehicle & Capacity
  if (!vehicleType?.trim()) errors.push("Vehicle type is required");

  // Form 3: Parcel Preferences
  if (!acceptedParcelTypes || acceptedParcelTypes.length === 0) {
    errors.push("At least one parcel type must be selected");
  }

  if (errors.length > 0) {
    return res.status(400).json({ success: false, errors });
  }

  next();
};
