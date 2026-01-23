import initDatabase from "./src/config/db.init.js";
import sequelize from "./src/config/database.config.js";
import "./src/modules/associations.js";

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
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
};

startServer();
