
import bcrypt from "bcrypt";
import User from "../modules/user/user.model.js";
import Role from "../modules/user/role.model.js";
import UserRole from "../modules/user/userRole.model.js";
import { ROLES } from "./constants.js";

export const createDefaultAdmin = async () => {
  const existingAdmin = await User.findOne({
    where: { email: "priti.admin@gmail.com" }
  });

  if (existingAdmin) {
    console.log("Admin already exists");
    return;
  }

  const hashedPassword = await bcrypt.hash("Admin@123", 10);

  const adminUser = await User.create({
    name: "Super Admin",
    email: "priti.admin@gmail.com",
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
