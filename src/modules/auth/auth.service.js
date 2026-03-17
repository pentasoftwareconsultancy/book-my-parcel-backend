import bcrypt from "bcrypt";
import sequelize from "../../config/database.config.js";
import User from "../user/user.model.js";
import Role from "../user/role.model.js";
import UserRole from "../user/userRole.model.js";
import TravellerKYC from "../traveller/travellerKYC.model.js";
import UserProfile from "../user/userProfile.model.js";
import TravellerProfile from "../traveller/travellerProfile.model.js";
import { KYC_STATUS, ROLES } from "../../utils/constants.js";
import { generateToken } from "../../utils/jwt.util.js";
import {
  validateSignupData,
  validateEmail,
  validatePhone,
  checkDuplicateEmail,
  checkDuplicatePhone
} from "../../utils/validation.util.js";

export { generateToken };

/**
 * ─────────────────────────────
 * SIGNUP
 * ─────────────────────────────
 */
export async function signup(userData) {

console.log("Signup data:", userData); 

  // 1️Validate
  validateSignupData(userData);

  // 2️ Hash password
  const hashedPassword = await bcrypt.hash(userData.password, 10);
  console.log("Hashed password:", hashedPassword); // Debug log

  return await sequelize.transaction(async (t) => {
    console.log("Transaction started"); // Debug log

    // 3️Check duplicate email
    const existingEmail = await User.findOne({
      where: { email: userData.email },
      transaction: t
    });
    console.log("Existing email check:", existingEmail); // Debug log
    if (existingEmail) throw new Error("Email already registered");


    // 4️Check duplicate phone
    const existingPhone = await User.findOne({
      where: { phone_number: userData.phone_number },
      transaction: t
    });
    console.log("Existing phone check:", existingPhone); // Debug log
    if (existingPhone) throw new Error("Phone number already registered");

    // 5️ Create User 
    const user = await User.create({
      email:           userData.email,
      password:        hashedPassword,
      phone_number:    userData.phone_number,
      alternate_phone: userData.alternate_phone || null,
    }, { transaction: t });

    console.log("User created:", user.id); // Debug log

    // 6 Create UserProfile 
    // ✅ full_name, address, city, state → user_profiles only
    await UserProfile.create({
      user_id:   user.id,
      name: userData.name || null,
      address:   userData.address   || null,
      city:      userData.city      || null,
      state:     userData.state     || null,
    }, { transaction: t });

    //  Create TravellerProfile 
    await TravellerProfile.create({
      user_id: user.id,
      status:  "INCOMPLETE",  
    }, { transaction: t });

    // 8️⃣ Create TravellerKYC 
    await TravellerKYC.create({
      user_id: user.id,
      status:  KYC_STATUS.NOT_STARTED,
    }, { transaction: t });

    //  Fetch BOTH roles from DB
    const [individualRole, travellerRole] = await Promise.all([
      Role.findOne({ where: { name: ROLES.INDIVIDUAL }, transaction: t }),
      Role.findOne({ where: { name: ROLES.TRAVELLER  }, transaction: t }),
    ]);

    if (!individualRole || !travellerRole) {
      throw new Error("Roles not found. Run seeder first.");
    }

    //  Assign BOTH roles 
    await UserRole.bulkCreate([
      { user_id: user.id, role_id: individualRole.id },
      { user_id: user.id, role_id: travellerRole.id  },
    ], { transaction: t });

    // Generate token
    const token = generateToken({ userId: user.id });

    return {
      token,
      user: {
        id:           user.id,
        email:        user.email,
        phone_number: user.phone_number,
      },
      roles:   [ROLES.INDIVIDUAL, ROLES.TRAVELLER],
      message: "Signup successful! You can login as Individual or Traveller.",
    };

  });
}


/**
 * ─────────────────────────────
 * LOGIN
 * ─────────────────────────────
 */
export async function login(email, password, loginRole) {

  // 1Find user — include roles + KYC only
  const user = await User.findOne({
    where: { email },
    attributes: { include: ["password"] },
    include: [
      {
        model: Role,
        as: "roles",
        through: { attributes: [] },
      },
      {
        model: TravellerKYC,
        as: "travellerKYC",
        attributes: ["status"],
      },
    ],
  });

  //  User not found
  if (!user) throw new Error("Email not registered");

  // 3️⃣ Verify password
  // const match = await bcrypt.compare(password.trim(), user.password);
  // if (!match) throw new Error("Invalid password");

  // 3️⃣ Verify password (plain text - TEMPORARY)
if (password.trim() !== user.password) {
  throw new Error("Invalid password");
}

  // 4️⃣ Get roles from DB
  const dbRoles = user.roles.map(r => r.name);

  // 5️⃣ Admin — always admin
  if (dbRoles.includes(ROLES.ADMIN)) {
    const token = generateToken({ userId: user.id });
    return {
      token,
      user: { id: user.id, email: user.email },
      activeRole: ROLES.ADMIN,
      roles: dbRoles,
      kycStatus: KYC_STATUS.NOT_STARTED,
    };
  }

  // 6️⃣ Verify requested role — NEVER create here
  if (!dbRoles.includes(loginRole)) {
    throw new Error(`You don't have ${loginRole} access`);
  }

  // 7️⃣ Generate token — only userId
  const token = generateToken({ userId: user.id });

  return {
    token,
    user: {
      id:           user.id,
      email:        user.email,
      phone_number: user.phone_number,
    },
    activeRole: loginRole,
    roles:      dbRoles,
    kycStatus:  user.travellerKYC?.status || KYC_STATUS.NOT_STARTED,
  };
}


/**
 * GET PROFILE
 */
export async function getUserProfile(userId) {
  const user = await User.findByPk(userId, {
    include: [
      { model: UserProfile, as: "profile" },
      { model: TravellerProfile, as: "travellerProfile" },
      { model: Role, as: "roles", through: { attributes: [] } },
      { model: TravellerKYC, as: "travellerKYC" }
    ],
  });

  if (!user) throw new Error("User not found");

  return {
    user,
    roles: user.roles.map(r => r.name),
    kycStatus: user.travellerKYC?.status || KYC_STATUS.NOT_STARTED
  };
}




/**
 * UPDATE PROFILE 
 */

export async function updateProfile(userId, updateData) {
  const user = await User.findByPk(userId);
  console.log("Updating profile for user:", userId, "with data:", updateData); // Debug log

  if (!user) {
    throw new Error("User not found");
  }

  // 🔥 EMAIL VALIDATION
  if (updateData.email && updateData.email !== user.email) {
    validateEmail(updateData.email);
    await checkDuplicateEmail(updateData.email, userId);
  }

  console.log("Email validation passed"); // Debug log

  // 🔥 PHONE VALIDATION
  if (
    updateData.phone_number &&
    updateData.phone_number !== user.phone_number
  ) {
    validatePhone(updateData.phone_number);
    await checkDuplicatePhone(updateData.phone_number, userId);
  }
  console.log("Phone validation passed"); // Debug log

  // 1. Update USER table (only authentication fields)
  await user.update({
    email: updateData.email ?? user.email,
    phone_number: updateData.phone_number ?? user.phone_number,
    alternate_phone: updateData.alternate_phone ?? user.alternate_phone,
  });

  console.log("User table updated"); // Debug log
  // 2. Update UserProfile table (personal info)
  const userProfile = await UserProfile.findOne({
    where: { user_id: userId },
  });
  console.log("UserProfile found:", !!userProfile); // Debug log

  if (userProfile) {
    await userProfile.update({
      name: updateData.name ?? userProfile.name,
      address: updateData.address ?? userProfile.address,
      city: updateData.city ?? userProfile.city,
      state: updateData.state ?? userProfile.state,
      pincode: updateData.pincode ?? userProfile.pincode,
      avatar_url: updateData.avatar_url ?? userProfile.avatar_url,
    });
  }

  console.log("UserProfile updated"); // Debug log

  // 3. Update TravellerProfile table (vehicle info)
  const travellerProfile = await TravellerProfile.findOne({
    where: { user_id: userId },
  });

  if (travellerProfile) {
    await travellerProfile.update({
      vehicle_type: updateData.vehicle_type ?? travellerProfile.vehicle_type,
      vehicle_number: updateData.vehicle_number ?? travellerProfile.vehicle_number,
      vehicle_model: updateData.vehicle_model ?? travellerProfile.vehicle_model,
      capacity_kg: updateData.capacity_kg ?? travellerProfile.capacity_kg,
      status: updateData.status ?? travellerProfile.status,
      is_available: updateData.is_available ?? travellerProfile.is_available,
    });
  }
  console.log("TravellerProfile updated"); // Debug log

  return {
    user,
    userProfile: userProfile || null,
    travellerProfile: travellerProfile || null,
  };
}

/**
 * UPLOAD/UPDATE PROFILE PHOTO
 */
export async function uploadProfilePhoto(userId, file) {
  if (!file) {
    throw new Error("No file provided");
  }

  const userProfile = await UserProfile.findOne({
    where: { user_id: userId }
  });

  if (!userProfile) {
    throw new Error("User profile not found");
  }

  const photoPath = `/uploads/profiles/${file.filename}`;
  
  await userProfile.update({ avatar_url: photoPath });

  return { avatar_url: photoPath };
}

/**
 * UPDATE PASSWORD
 */
export async function updatePassword(userId, oldPassword, newPassword) {
  const user = await User.findByPk(userId, {
    attributes: { include: ["password"] }
  });

  if (!user) {
    throw new Error("User not found");
  }

  const match = await bcrypt.compare(oldPassword, user.password);
  if (!match) {
    throw new Error("Current password is incorrect");
  }

  if (newPassword.length < 6) {
    throw new Error("New password must be at least 6 characters");
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await user.update({ password: hashedPassword });

  return { message: "Password updated successfully" };
}