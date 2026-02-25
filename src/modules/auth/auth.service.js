
import bcrypt from "bcrypt";
import sequelize from "../../config/database.config.js";
import User from "../user/user.model.js";
import Role from "../user/role.model.js";
import UserRole from "../user/userRole.model.js";
import TravellerKYC from "../traveller/travellerKYC.model.js";
import { ROLES, KYC_STATUS } from "../../middlewares/role.middleware.js";
import { generateToken } from "../../utils/jwt.util.js";
import UserProfile from "../user/userProfile.model.js";
import TravellerProfile from "../traveller/travellerProfile.model.js"

// Export generateToken for use in controllers
export { generateToken };

/**
 * SIGNUP
 */
export async function signup(userData, selectedRole) {
  
  const hashedPassword = await bcrypt.hash(userData.password, 10);

  return await sequelize.transaction(async (t) => {

    // ✅ 0️⃣ CHECK IF EMAIL ALREADY EXISTS
    const existingUser = await User.findOne({
      where: { email: userData.email },
      transaction: t
    });

    if (existingUser) {
      throw new Error("Email already exists");
    }
    // 1️⃣ Create user
    const { name, phone_number, alternate_phone, email, address, city, state } = userData;

    const user = await User.create(
      {
        name,
        phone_number,
        alternate_phone: alternate_phone || null,
        email,
        address: address || null,
        city,
        state,
        password: hashedPassword
      },
      { transaction: t }
    );
    console.log("User created with ID:", user.id);


    // 2️⃣ Create profile depending on role
    let travellerProfile;
    if (selectedRole === ROLES.TRAVELLER) {
      // Create TravellerProfile
      
      travellerProfile = await TravellerProfile.create(
        { user_id: user.id, 
           name: user.name,
          email: user.email,
           phone_number: user.phone_number,
          vehicle_type: null, 
          capacity_kg: null, 
          status: "PENDING" },
        { transaction: t }
      );
      console.log("TravellerProfile created for user:", travellerProfile.user_id);

      // Also create KYC entry
      await TravellerKYC.create(
        { user_id: user.id, status: KYC_STATUS.PENDING },
        { transaction: t }
      );
      console.log("Traveller KYC created.");
    } else {
      // Create UserProfile for regular users
      travellerProfile = await UserProfile.create(
        {
          user_id: user.id,
          full_name: name,
          address: address || null,
          city: city || null,
          alternate_phone: alternate_phone || null
        },
        { transaction: t }
      );
      console.log("UserProfile created for user:", user.id);
    }


    // 2️⃣ Helper to fetch role safely
    async function getRoleByName(roleName) {
      const role = await Role.findOne({ where: { name: roleName }, transaction: t });
      if (!role) throw new Error(`Role not found: ${roleName}`);
      return role;
    }
    console.log("Role fetcher initialized.");

    // 3️⃣ Assign roles
    const rolesToAssign = [];
    console.log("Assigning roles...");

    // Always assign INDIVIDUAL for non-admin
    if (selectedRole !== ROLES.ADMIN) {
      const individualRole = await getRoleByName(ROLES.INDIVIDUAL);
      rolesToAssign.push(individualRole);
      console.log("Individual role assigned.");
    }
    console.log("Selected Role:", selectedRole);

    // Assign TRAVELLER role if user selected Traveller
    if (selectedRole === ROLES.TRAVELLER) {
      const travellerRole = await getRoleByName(ROLES.TRAVELLER);
      rolesToAssign.push(travellerRole);
      console.log("Traveller role assigned.");

      // Create KYC entry
      await TravellerKYC.create(
        { user_id: user.id, status: KYC_STATUS.PENDING },
        { transaction: t }
      );
      console.log("Traveller KYC created.");
    }
    console.log("Roles to assign:", rolesToAssign.map(r => r.name));


    // 4️⃣ Store roles in UserRole table
    for (const role of rolesToAssign) {
      await UserRole.create(
        { user_id: user.id, role_id: role.id },
        { transaction: t }
      );
    }

    // 5️⃣ Generate token & return roles for frontend
    const kycStatus = selectedRole === ROLES.TRAVELLER ? KYC_STATUS.PENDING : KYC_STATUS.NOT_STARTED;

    console.log("Generating token for user ID:", user.id);

    const token = generateToken({ userId: user.id });  // correct
    console.log("Token generated.");

    return {
      user,
      travellerProfile,
      token,
      roles: rolesToAssign.map(r => r.name),
      kycStatus
    };


  });
}





/**
 * UPDATE PROFILE 
 */

export async function updateProfile(userId, updateData) {
  // 1️⃣ Find user
  const user = await User.findByPk(userId);

  if (!user) {
    throw new Error("User not found");
  }

  // 2️⃣ Update USER table
  await user.update({
    name: updateData.name ?? user.name,
    email: updateData.email ?? user.email,
    phone_number: updateData.phone_number ?? user.phone_number,
    address: updateData.address ?? user.address,
    city: updateData.city ?? user.city,
    state: updateData.state ?? user.state,
  });

  // 3️⃣ Check if TravellerProfile exists
  const travellerProfile = await TravellerProfile.findOne({
    where: { user_id: userId },
  });

  if (travellerProfile) {
    await travellerProfile.update({
      name: updateData.name ?? travellerProfile.name,
      email: updateData.email ?? travellerProfile.email,
      phone_number:
        updateData.phone_number ?? travellerProfile.phone_number,
      vehicle_type:
        updateData.vehicle_type ?? travellerProfile.vehicle_type,
      capacity_kg:
        updateData.capacity_kg ?? travellerProfile.capacity_kg,
      status: updateData.status ?? travellerProfile.status,
    });
  }

  return {
    user,
    travellerProfile: travellerProfile || null,
  };
}




/**
 * LOGIN
 */
export async function login(email, password) {
  console.log("Attempting login for email:", email);

  // ✅ Correct include: use model reference, not string, with alias
  const user = await User.findOne({
    where: { email },
    attributes: { include: ["password"] },
    include: [

      { model: UserProfile, as: "profile" },
      { model: TravellerProfile, as: "travellerProfile" },
      { model: Role, through: { attributes: [] } },
      { model: TravellerKYC, as: "travellerKYC" }

    ],
  });



  console.log("User fetched from DB:", user ? user.id : "not found");

  if (!user) throw new Error("User not found");

  console.log("Verifying password for user ID:", user.id);
  const match = await bcrypt.compare(password, user.password);

  console.log("Password match result for user ID:", user.id, match);
  if (!match) throw new Error("Invalid password");

  console.log("Generating token for user ID:", user.id);
  const token = generateToken({ userId: user.id }); // only id
  console.log("Token generated for user ID:", user.id);

  const roles = user.roles.map(r => r.name);
  console.log("User roles:", roles);

  const kycStatus = user.TravellerKYC?.status || KYC_STATUS.NOT_STARTED;
  console.log("KYC Status for user ID:", user.id, kycStatus);

  return { user, token, roles, kycStatus };
}

/**
 * BECOME TRAVELLER
 */
export async function becomeTraveller(userId) {
  console.log("User requesting to become Traveller:", userId);
  return await sequelize.transaction(async (t) => {
    console.log("Transaction started for user ID:", userId);
    // 1️⃣ Fetch user with roles and KYC
    const user = await User.findByPk(userId, {
      include: [
        { model: Role },
        { model: TravellerKYC, as: "travellerKYC" }
      ],
      transaction: t
    });
    console.log("User fetched in transaction:", user ? user.id : "not found");

    if (!user) throw new Error("User not found");
    console.log("User found:", user.id);

    // 2️⃣ Check if user already has Traveller role
    const hasTraveller = user.Roles?.some(
      r => r.name === ROLES.TRAVELLER
    );
    console.log("User has Traveller role:", hasTraveller);

    // 3️⃣ Assign Traveller role if not present
    if (!hasTraveller) {
      const travellerRole = await Role.findOne({
        where: { name: ROLES.TRAVELLER },
        transaction: t
      });
      console.log("Traveller role fetched:", travellerRole ? travellerRole.id : "not found");
      if (!travellerRole) {
        throw new Error("Traveller role not found in DB");
      }
      console.log("Assigning Traveller role to user:", user.id);
      await UserRole.create(
        {
          user_id: user.id,
          role_id: travellerRole.id
        },
        { transaction: t }
      );
      console.log("Traveller role assigned to user:", user.id);

    }

    // 4️⃣ Create KYC record if missing
    const kyc = await TravellerKYC.findOne({
      where: { user_id: user.id },
      transaction: t
    });
    console.log("Traveller KYC fetched for user:", user.id, kyc ? "exists" : "not found");


    if (!kyc) {
      await TravellerKYC.create(
        {
          user_id: user.id,
          status: KYC_STATUS.NOT_STARTED
        },
        { transaction: t }
      );

    }
    console.log("Traveller KYC ensured for user:", user.id);

    // ✅ 5️⃣ Ensure TravellerProfile exists
    let travellerProfile = await TravellerProfile.findOne({ where: { user_id: user.id }, transaction: t });
    if (!travellerProfile) {
      travellerProfile = await TravellerProfile.create({ user_id: user.id }, { transaction: t });
      console.log("TravellerProfile created for user:", user.id);
    }

    // 5️⃣ Fetch updated roles
    const roles = await Role.findAll({
      include: {
        model: User,
        where: { id: user.id }
      },
      transaction: t
    });
    console.log("Updated roles fetched for user:", user.id, roles.map(r => r.name));

    // 6️⃣ Generate fresh token (optional but recommended)
    const token = generateToken({ userId: user.id })
    console.log("New token generated for user:", user.id);

    return {
      user,
      token,
      roles: roles.map(r => r.name),
      kycStatus: KYC_STATUS.NOT_STARTED
    };

  });
}


