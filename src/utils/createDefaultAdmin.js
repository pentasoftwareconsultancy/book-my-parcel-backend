// import Admin from "../modules/admin/admin.model.js";
// import bcrypt from "bcryptjs";

// export const createDefaultAdmin = async () => {
//   const exists = await Admin.findOne({
//     where: { email: "admin1@gmail.com" }
//   });

//   if (!exists) {
//     const hashedPassword = await bcrypt.hash("admin1234", 10);

//     await Admin.create({
//       name: "Super Admin",
//       email: "admin1@gmail.com",
//       password: hashedPassword
//     });

//     console.log("✅ Default Admin Created");
//   } else {
//     console.log("ℹ️ Admin already exists");
//   }
// };



import bcrypt from "bcrypt";
import User from "../modules/user/user.model.js";
import Role from "../modules/user/role.model.js";
import UserRole from "../modules/user/userRole.model.js";
import { ROLES } from "../middlewares/role.middleware.js";

export const createDefaultAdmin = async () => {
  const existingAdmin = await User.findOne({
    where: { email: "priti@gmail.com" }
  });

  if (existingAdmin) {
    console.log("Admin already exists");
    return;
  }

  const hashedPassword = await bcrypt.hash("admin123", 10);

  const adminUser = await User.create({
    name: "Super Admin",
    email: "priti@gmail.com",
    password: hashedPassword,
    phone_number: "9999999999",
    city: "Pune",
    state: "Maharashtra"
  });

  const adminRole = await Role.findOne({
    where: { name: ROLES.ADMIN }
  });

  await UserRole.create({
    user_id: adminUser.id,
    role_id: adminRole.id
  });

  console.log("Default admin created");
};
