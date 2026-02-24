

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
        errors.push("Name is required");
    } else {
        if (!/^[A-Za-z\s]+$/.test(userData.name))
            errors.push("Name must contain only letters");
        if (userData.name.trim().length < 2)
            errors.push("Name must be at least 2 characters");
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