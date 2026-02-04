import { sequelize, connectDB } from "./database.config.js";
import { Role } from "../modules/auth/role.model.js";
import "../modules/auth/user.model.js";
import "../modules/auth/userRoles.model.js";
import "../modules/auth/travellerKYC.model.js";
import { ALL_ROLES, KYC_STATUS } from "../middlewares/role.middleware.js";
import { relationships } from "../utils/tablerelationship.util.js";


export async function initDB() {
    try {
        await connectDB();
        console.log("✅ DB Connected");


        relationships();

        const isReset = process.env.RESET_DB === "true"; 
        const isProd = process.env.NODE_ENV === "production";

        if (isReset && !isProd) {
            console.log("⚠️ RESET_DB=true — dropping and recreating tables");
            await sequelize.sync({ force: true, logging: false });
        } else {
            console.log("⚡ Syncing tables without dropping (safe mode)");
            await sequelize.sync({ logging: false });
        }

        // Seed Roles safely
        for (const roleName of ALL_ROLES) {
            await Role.findOrCreate({ where: { name: roleName } });
        }

        console.log("🎉 BMP DB Initialization complete!");
    } catch (err) {
        console.error("❌ DB initialization failed:", err.message);
        process.exit(1);
    }
}
