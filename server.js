import dotenv from "dotenv";
dotenv.config();

import { createServer } from "http";
import { Server } from "socket.io";
import initDatabase from "./src/config/db.init.js";
import sequelize from "./src/config/database.config.js";
import "./src/modules/associations.js";
import app from "./src/app.js";
import { seedRoles } from "./src/utils/seedRoles.js";
import { createDefaultAdmin } from "./src/utils/createDefaultAdmin.js";
import { setupSocketHandlers } from "./src/utils/socketHandlers.js";
const startServer = async () => {
  try {
    await initDatabase();

    await sequelize.authenticate();
    console.log("Application Connected to Database");

    await sequelize.sync({ force: false, alter: false }); // Don't auto-alter schema to avoid constraint errors
    console.log("Tables Created with Relations");

    //STEP 4: Seed static roles
    await seedRoles();
    // STEP 5: Create default admin
    await createDefaultAdmin();

    const PORT = process.env.PORT || 3000;
    
    // Create HTTP server
    const server = createServer(app);
    
    // Initialize Socket.IO
    const io = new Server(server, {
      cors: {
        origin: [
          "http://localhost:5173",
          "http://localhost:3000",
          "http://127.0.0.1:5173",
          "http://127.0.0.1:3000"
        ],
        methods: ["GET", "POST"],
        credentials: true
      }
    });
    
    // Make io available to the app
    app.set("io", io);
    
    // Setup Socket.IO handlers
    setupSocketHandlers(io);
    
    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`WebSocket server is ready`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
};

startServer();
