import initDatabase from "./src/config/db.init.js";
import sequelize from "./src/config/database.config.js";
import "./src/modules/associations.js";

const startServer = async () => {
  try {
    
    await initDatabase();

    
    await sequelize.authenticate();
    console.log("Application Connected to Database");

    
    await sequelize.sync({ alter: false });
    console.log("Tables Created with Relations");
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
};

startServer();
