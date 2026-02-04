import dotenv from "dotenv";
dotenv.config();

import initDatabase from "./src/config/db.init.js";
import sequelize from "./src/config/database.config.js";
import "./src/modules/associations.js";
import app from "./src/app.js";
import { seedRoles } from "./src/utils/seedRoles.js";

const startServer = async () => {
  try {
    // STEP 1: Ensure DB exists
    await initDatabase();

    // STEP 2: Connect Sequelize to app DB
    await sequelize.authenticate();
    console.log("Application Connected to Database");

    // STEP 3: Sync tables
    await sequelize.sync({ alter: true });
    console.log("Tables Created with Relations");

    //STEP 4: Seed static roles
    await seedRoles();

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
