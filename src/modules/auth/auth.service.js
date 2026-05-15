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
import { assignReferralCode, processReferralOnSignup } from "../../services/referral.service.js";
import { getOrCache } from "../../utils/cache.util.js";
import { invalidateUserCache } from "../../middlewares/auth.middleware.js";
import { auditLog } from "../../utils/auditLog.util.js";

export { generateToken };

/**
 * ─────────────────────────────
 * SIGNUP
 * ─────────────────────────────
 */
export async function signup(userData) {

  // 1️Validate
  validateSignupData(userData);

  // 2️ Hash password
  const hashedPassword = await bcrypt.hash(userData.password, 10);

  return await sequelize.transaction(async (t) => {

    // 3️Check duplicate email
    const existingEmail = await User.findOne({
      where: { email: userData.email },
      transaction: t
    });
    if (existingEmail) throw new Error("Email already registered");


    // 4️Check duplicate phone
    const existingPhone = await User.findOne({
      where: { phone_number: userData.phone_number },
      transaction: t
    });
    if (existingPhone) throw new Error("Phone number already registered");

    // 5️ Create User 
    const user = await User.create({
      email:           userData.email,
      password:        hashedPassword,
      phone_number:    userData.phone_number,
      alternate_phone: userData.alternate_phone || null,
    }, { transaction: t });

    // 6 Create UserProfile 
    // ✅ full_name, address, city, state → user_profiles only
    await UserProfile.create({
      user_id:   user.id,
      name: userData.name || null,
      address:   userData.address   || null,
      city:      userData.city      || null,
      state:     userData.state     || null,
    }, { transaction: t });

    // Assign a unique referral code to this user
    await assignReferralCode(user.id, t);

    // Process referral code if provided during signup (non-fatal)
    if (userData.referral_code) {
      // Run outside transaction so it doesn't block signup if referral fails
      setImmediate(() => processReferralOnSignup(user.id, userData.referral_code));
    }

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
    const token = await generateToken({ userId: user.id });

    auditLog({
      action:       "USER_SIGNUP",
      actorId:      user.id,
      actorRole:    "user",
      resourceType: "user",
      resourceId:   user.id,
      meta:         { email: user.email, roles: [ROLES.INDIVIDUAL, ROLES.TRAVELLER] },
    });

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
  const match = await bcrypt.compare(password.trim(), user.password);
  if (!match) throw new Error("Invalid password");

  // 4️⃣ Check password expiry
  try {
    const expiryDays = await getOrCache(
      "platform_settings:password_expiry_days",
      async () => {
        const result = await sequelize.query(
          `SELECT value FROM platform_settings WHERE key = 'password_expiry_days'`,
          { type: sequelize.QueryTypes.SELECT }
        );
        return parseInt(result[0]?.value || 90);
      },
      300 // 5 min TTL
    );
    if (user.password_changed_at && expiryDays > 0) {
      const daysSinceChange = (Date.now() - new Date(user.password_changed_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceChange > expiryDays) {
        throw new Error(`PASSWORD_EXPIRED:Your password expired ${Math.floor(daysSinceChange)} days ago. Please reset your password.`);
      }
    }
  } catch (err) {
    if (err.message.startsWith('PASSWORD_EXPIRED:')) throw err;
    console.warn("[Auth] Password expiry check failed (non-fatal):", err.message);
  }

  // 3️⃣ Verify password (plain text - TEMPORARY)
// if (password.trim() !== user.password) {
//   throw new Error("Invalid password");
// }

  // 4️⃣ Get roles from DB
  const dbRoles = user.roles.map(r => r.name);

  // 5️⃣ Admin — always admin
  if (dbRoles.includes(ROLES.ADMIN)) {
    const token = await generateToken({ userId: user.id, roles: dbRoles });
    auditLog({
      action:       "USER_LOGIN",
      actorId:      user.id,
      actorRole:    ROLES.ADMIN,
      resourceType: "user",
      resourceId:   user.id,
      meta:         { email: user.email, activeRole: ROLES.ADMIN },
    });
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
  const token = await generateToken({ userId: user.id });

  auditLog({
    action:       "USER_LOGIN",
    actorId:      user.id,
    actorRole:    loginRole,
    resourceType: "user",
    resourceId:   user.id,
    meta:         { email: user.email, activeRole: loginRole },
  });

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

  if (!user) {
    throw new Error("User not found");
  }

  // 🔥 EMAIL VALIDATION
  if (updateData.email && updateData.email !== user.email) {
    validateEmail(updateData.email);
    await checkDuplicateEmail(updateData.email, userId);
  }

  // 🔥 PHONE VALIDATION
  if (
    updateData.phone_number &&
    updateData.phone_number !== user.phone_number
  ) {
    validatePhone(updateData.phone_number);
    await checkDuplicatePhone(updateData.phone_number, userId);
  }

  // 1. Update USER table (only authentication fields)
  await user.update({
    email: updateData.email ?? user.email,
    phone_number: updateData.phone_number ?? user.phone_number,
    alternate_phone: updateData.alternate_phone ?? user.alternate_phone,
  });

  // 2. Update UserProfile table (personal info)
  const userProfile = await UserProfile.findOne({
    where: { user_id: userId },
  });

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

  // Invalidate the auth middleware cache so the next request re-reads from DB
  await invalidateUserCache(userId);

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
 * ─────────────────────────────
 * FORGOT PASSWORD — STEP 1
 * Send a 6-digit OTP to the user's registered phone number.
 * ─────────────────────────────
 */
export async function requestPasswordResetOtp(email) {
  const user = await User.findOne({ where: { email } });
  if (!user) throw new Error("No account found with that email address");

  if (!user.phone_number) throw new Error("No phone number on file for this account");

  // Generate OTP
  const otpConfig = (await import("../../config/otp.config.js")).default;
  const otp = Math.floor(
    Math.pow(10, otpConfig.OTP_LENGTH - 1) +
    Math.random() * (Math.pow(10, otpConfig.OTP_LENGTH) - Math.pow(10, otpConfig.OTP_LENGTH - 1))
  ).toString();

  const expiresAt = new Date(Date.now() + otpConfig.EXPIRY_MINUTES * 60 * 1000);

  // Store OTP on the user record (reuse booking otp fields pattern — store in a dedicated column)
  // We store in a JSON field on the user or use a simple in-memory approach via DB columns.
  // Using password_reset_otp and password_reset_otp_expires columns (added via migration or alter).
  await user.update({
    password_reset_otp: otp,
    password_reset_otp_expires: expiresAt,
  });

  // Send SMS
  const twilioService = (await import("../../services/twilio.service.js")).default;
  await twilioService.sendSMS(
    user.phone_number,
    `Book My Parcel: Your password reset OTP is ${otp}. Valid for ${otpConfig.EXPIRY_MINUTES} minutes. Do not share this with anyone.`
  );

  console.log(`[ForgotPassword] OTP for ${email}: ${otp}`); // dev log

  return {
    message: "OTP sent to your registered phone number",
    phone_hint: user.phone_number.slice(-4).padStart(user.phone_number.length, "*"),
  };
}

/**
 * ─────────────────────────────
 * FORGOT PASSWORD — STEP 2
 * Verify OTP and set new password.
 * ─────────────────────────────
 */
export async function resetPasswordWithOtp(email, otp, newPassword) {
  const user = await User.findOne({ where: { email } });

  if (!user) throw new Error("No account found with that email address");

  if (!user.password_reset_otp) throw new Error("No OTP requested. Please request a new one.");

  if (new Date() > new Date(user.password_reset_otp_expires)) {
    throw new Error("OTP has expired. Please request a new one.");
  }

  if (user.password_reset_otp !== otp.toString()) {
    throw new Error("Invalid OTP. Please check and try again.");
  }

  if (!newPassword || newPassword.length < 6) {
    throw new Error("New password must be at least 6 characters");
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await user.update({
    password: hashedPassword,
    password_changed_at: new Date(),
    password_reset_otp: null,
    password_reset_otp_expires: null,
  });

  await invalidateUserCache(user.id);

  auditLog({
    action:       "PASSWORD_RESET",
    actorId:      user.id,
    actorRole:    "user",
    resourceType: "user",
    resourceId:   user.id,
    meta:         { email },
  });

  return { message: "Password reset successfully. You can now log in." };
}

/**
 * UPDATE PASSWORD
 */
/**
 * LOGOUT
 * Blacklists the current JWT token in Redis so it cannot be reused.
 */
export async function logout(token, userId) {
  try {
    const { blacklistToken } = await import("../../redis/services/tokenBlacklist.service.js");
    await blacklistToken(token, userId);
    return { message: "Logged out successfully" };
  } catch (error) {
    console.error("[Auth] Logout error:", error.message);
    // Non-fatal — still return success even if blacklisting fails
    return { message: "Logged out successfully" };
  }
}

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
  await user.update({ password: hashedPassword, password_changed_at: new Date() });

  // Invalidate auth cache — next request will re-fetch from DB
  await invalidateUserCache(userId);

  auditLog({
    action:       "PASSWORD_CHANGED",
    actorId:      userId,
    actorRole:    "user",
    resourceType: "user",
    resourceId:   userId,
    meta:         {},
  });

  return { message: "Password updated successfully" };
}