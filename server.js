import dotenv from "dotenv";
dotenv.config();

import initDatabase from "./src/config/db.init.js";
import sequelize from "./src/config/database.config.js";
import "./src/modules/associations.js";
import app from "./src/app.js";
import { seedRoles } from "./src/utils/seedRoles.js";
import { createDefaultAdmin } from "./src/utils/createDefaultAdmin.js";
const startServer = async () => {
  try {
    await initDatabase();

    await sequelize.authenticate();
    console.log("Application Connected to Database");

    await sequelize.sync({ force: true});
    console.log("Tables Created with Relations");

    //STEP 4: Seed static roles
    await seedRoles();
    // STEP 5: Create default admin
    await createDefaultAdmin();

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
};

startServer();
