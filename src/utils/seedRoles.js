// src/utils/seedRoles.js
import Role from "../modules/user/role.model.js";
import { ROLES } from "../middlewares/role.middleware.js";

export async function seedRoles() {
  for (const roleName of Object.values(ROLES)) {
    await Role.findOrCreate({
      where: { name: roleName },
    });
  }
  console.log("Static roles seeded:", Object.values(ROLES));
}
