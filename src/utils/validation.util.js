

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


// ==========================================
//         ADD ROUTE VALIDATION (ALL 3 FORMS)
// ==========================================

export const validateAddRoute = (req, res, next) => {
    const {
        // Form 1: Route Details
        originCity,
        originState,
        destinationCity,
        destinationState,
        departureDate,
        departureTime,
        arrivalDate,
        arrivalTime,
        isRecurring,
        recurringDays,
        stops,
        
        // Form 2: Vehicle & Capacity
        vehicleType,
        vehicleNumber,
        maxWeightKg,
        availableSpaceDescription,
        
        // Form 3: Parcel Preferences
        acceptedParcelTypes,
        minEarningPerDelivery
    } = req.body;

    const errors = [];

    // ========== FORM 1: ROUTE DETAILS ==========
    
    if (!originCity || !originCity.trim()) 
        errors.push("Origin city is required");
    if (!originState || !originState.trim()) 
        errors.push("Origin state is required");
    if (!destinationCity || !destinationCity.trim()) 
        errors.push("Destination city is required");
    if (!destinationState || !destinationState.trim()) 
        errors.push("Destination state is required");

    if (!departureDate) {
        errors.push("Departure date is required");
    } else {
        const depDate = new Date(departureDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (isNaN(depDate.getTime())) {
            errors.push("Invalid departure date format");
        } else if (depDate < today) {
            errors.push("Departure date cannot be in the past");
        }
    }

    if (!departureTime || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(departureTime)) 
        errors.push("Valid departure time is required (HH:MM format)");

    if (!arrivalDate) {
        errors.push("Arrival date is required");
    } else {
        const arrDate = new Date(arrivalDate);
        const depDate = new Date(departureDate);
        
        if (isNaN(arrDate.getTime())) {
            errors.push("Invalid arrival date format");
        } else if (arrDate < depDate) {
            errors.push("Arrival date cannot be before departure date");
        }
    }

    if (!arrivalTime || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(arrivalTime)) 
        errors.push("Valid arrival time is required (HH:MM format)");

    if (isRecurring === true) {
        if (!recurringDays || !Array.isArray(recurringDays) || recurringDays.length === 0) {
            errors.push("Recurring days are required when route is recurring");
        } else {
            const validDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
            const invalidDays = recurringDays.filter(day => !validDays.includes(day));
            if (invalidDays.length > 0) 
                errors.push(`Invalid recurring days: ${invalidDays.join(", ")}`);
        }
    }

    if (stops && !Array.isArray(stops)) {
        errors.push("Stops must be an array");
    }

    // ========== FORM 2: VEHICLE & CAPACITY ==========
    
    const validVehicleTypes = ["Bike/Scooter", "Car", "SUV", "Bus", "Train", "Van", "Mini Truck", "Metro", "Aeroplane"];
    if (!vehicleType || !validVehicleTypes.includes(vehicleType)) 
        errors.push(`Vehicle type is required (${validVehicleTypes.join(", ")})`);

    if (vehicleNumber && vehicleNumber.trim() && !/^[A-Z]{2}[0-9]{1,2}[A-Z]{1,2}[0-9]{4}$/.test(vehicleNumber.replace(/\s/g, ''))) {
        errors.push("Invalid vehicle number format (e.g., MH12AB1234)");
    }

    if (maxWeightKg !== undefined && maxWeightKg !== null && maxWeightKg !== "") {
        const weight = Number(maxWeightKg);
        if (isNaN(weight) || weight <= 0) 
            errors.push("Max weight must be a positive number");
        if (weight > 1000) 
            errors.push("Max weight cannot exceed 1000 kg");
    }

    if (availableSpaceDescription && availableSpaceDescription.length > 500) {
        errors.push("Available space description cannot exceed 500 characters");
    }

    // ========== FORM 3: PARCEL PREFERENCES ==========
    
    if (acceptedParcelTypes && Array.isArray(acceptedParcelTypes) && acceptedParcelTypes.length > 0) {
        const validParcelTypes = ["Documents", "Electronics", "Clothes", "Food Items", "Medicines", "Others"];
        const invalidTypes = acceptedParcelTypes.filter(type => !validParcelTypes.includes(type));
        if (invalidTypes.length > 0) 
            errors.push(`Invalid parcel types: ${invalidTypes.join(", ")}`);
    }

    if (minEarningPerDelivery !== undefined && minEarningPerDelivery !== null && minEarningPerDelivery !== "") {
        const earning = Number(minEarningPerDelivery);
        if (isNaN(earning) || earning < 0) 
            errors.push("Minimum earning must be a non-negative number");
        if (earning > 100000) 
            errors.push("Minimum earning cannot exceed ₹100,000");
    }

    if (errors.length > 0)
        return res.status(400).json({ success: false, errors });

    next();
};


// ==========================================
//         UPDATE ROUTE VALIDATION
// ==========================================

export const validateUpdateRoute = (req, res, next) => {
    const {
        // Form 1: Route Details
        originCity,
        originState,
        destinationCity,
        destinationState,
        departureDate,
        departureTime,
        arrivalDate,
        arrivalTime,
        isRecurring,
        recurringDays,
        stops,
        
        // Form 2: Vehicle & Capacity
        vehicleType,
        vehicleNumber,
        maxWeightKg,
        availableSpaceDescription,
        
        // Form 3: Parcel Preferences
        acceptedParcelTypes,
        minEarningPerDelivery,
        
        // Status
        status
    } = req.body;

    const errors = [];

    // ========== FORM 1: ROUTE DETAILS (if provided) ==========
    
    if (originCity !== undefined && (!originCity || !originCity.trim())) 
        errors.push("Origin city cannot be empty");
    if (originState !== undefined && (!originState || !originState.trim())) 
        errors.push("Origin state cannot be empty");
    if (destinationCity !== undefined && (!destinationCity || !destinationCity.trim())) 
        errors.push("Destination city cannot be empty");
    if (destinationState !== undefined && (!destinationState || !destinationState.trim())) 
        errors.push("Destination state cannot be empty");

    if (departureDate !== undefined) {
        const depDate = new Date(departureDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (isNaN(depDate.getTime())) {
            errors.push("Invalid departure date format");
        } else if (depDate < today) {
            errors.push("Departure date cannot be in the past");
        }
    }

    if (departureTime !== undefined && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(departureTime)) 
        errors.push("Valid departure time is required (HH:MM format)");

    if (arrivalDate !== undefined) {
        const arrDate = new Date(arrivalDate);
        
        if (isNaN(arrDate.getTime())) {
            errors.push("Invalid arrival date format");
        } else if (departureDate) {
            const depDate = new Date(departureDate);
            if (arrDate < depDate) {
                errors.push("Arrival date cannot be before departure date");
            }
        }
    }

    if (arrivalTime !== undefined && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(arrivalTime)) 
        errors.push("Valid arrival time is required (HH:MM format)");

    if (isRecurring === true) {
        if (!recurringDays || !Array.isArray(recurringDays) || recurringDays.length === 0) {
            errors.push("Recurring days are required when route is recurring");
        } else {
            const validDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
            const invalidDays = recurringDays.filter(day => !validDays.includes(day));
            if (invalidDays.length > 0) 
                errors.push(`Invalid recurring days: ${invalidDays.join(", ")}`);
        }
    }

    if (stops !== undefined && !Array.isArray(stops)) {
        errors.push("Stops must be an array");
    }

    // ========== FORM 2: VEHICLE & CAPACITY (if provided) ==========
    
    if (vehicleType !== undefined) {
        const validVehicleTypes = ["Bike/Scooter", "Car", "SUV", "Bus", "Train", "Van", "Mini Truck", "Metro", "Aeroplane"];
        if (!validVehicleTypes.includes(vehicleType)) 
            errors.push(`Vehicle type must be one of: ${validVehicleTypes.join(", ")}`);
    }

    if (vehicleNumber !== undefined && vehicleNumber && vehicleNumber.trim() && !/^[A-Z]{2}[0-9]{1,2}[A-Z]{1,2}[0-9]{4}$/.test(vehicleNumber.replace(/\s/g, ''))) {
        errors.push("Invalid vehicle number format (e.g., MH12AB1234)");
    }

    if (maxWeightKg !== undefined && maxWeightKg !== null && maxWeightKg !== "") {
        const weight = Number(maxWeightKg);
        if (isNaN(weight) || weight <= 0) 
            errors.push("Max weight must be a positive number");
        if (weight > 1000) 
            errors.push("Max weight cannot exceed 1000 kg");
    }

    if (availableSpaceDescription !== undefined && availableSpaceDescription && availableSpaceDescription.length > 500) {
        errors.push("Available space description cannot exceed 500 characters");
    }

    // ========== FORM 3: PARCEL PREFERENCES (if provided) ==========
    
    if (acceptedParcelTypes !== undefined) {
        if (!Array.isArray(acceptedParcelTypes)) {
            errors.push("Accepted parcel types must be an array");
        } else if (acceptedParcelTypes.length > 0) {
            const validParcelTypes = ["Documents", "Electronics", "Clothes", "Food Items", "Medicines", "Others"];
            const invalidTypes = acceptedParcelTypes.filter(type => !validParcelTypes.includes(type));
            if (invalidTypes.length > 0) 
                errors.push(`Invalid parcel types: ${invalidTypes.join(", ")}`);
        }
    }

    if (minEarningPerDelivery !== undefined && minEarningPerDelivery !== null && minEarningPerDelivery !== "") {
        const earning = Number(minEarningPerDelivery);
        if (isNaN(earning) || earning < 0) 
            errors.push("Minimum earning must be a non-negative number");
        if (earning > 100000) 
            errors.push("Minimum earning cannot exceed ₹100,000");
    }

    if (status !== undefined) {
        const validStatuses = ["ACTIVE", "INACTIVE", "COMPLETED"];
        if (!validStatuses.includes(status)) 
            errors.push(`Status must be one of: ${validStatuses.join(", ")}`);
    }

    if (errors.length > 0)
        return res.status(400).json({ success: false, errors });

    next();
};