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
  // validateEmail,
  // validatePhone,
  // checkDuplicateEmail,
  // checkDuplicatePhone
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
  const match = await bcrypt.compare(password.trim(), user.password);
  if (!match) throw new Error("Invalid password");

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