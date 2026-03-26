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
    
    // Initialize Socket.IO with extended timeout settings
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
      },
      // Connection timeout settings - increased for better stability
      pingTimeout: 120000,       // 2 minutes - how long to wait for pong before considering connection dead
      pingInterval: 30000,       // 30 seconds - how often to send ping packets
      connectTimeout: 60000,     // 1 minute - connection timeout before giving up
      // Upgrade timeout
      upgradeTimeout: 10000,     // 10 seconds - time to wait for upgrade from polling to websocket
      // Max HTTP buffer size
      maxHttpBufferSize: 1e6,    // 1MB
      // Allow upgrades
      allowUpgrades: true,
      // Transports
      transports: ['websocket', 'polling']
    });
    
    // Make io available to the app
    app.set("io", io);
    
    // Setup Socket.IO handlers
    setupSocketHandlers(io);
    
    server.listen(PORT, () => {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`🔌 WebSocket server is ready`);
      
      // SMS Configuration Status
      const smsEnabled = process.env.TWILIO_SMS_ENABLED === 'true';
      if (smsEnabled) {
        console.log(`📱 SMS: ENABLED - OTPs will be sent via Twilio`);
      } else {
        console.log(`📱 SMS: DISABLED - OTPs will only be logged to console`);
      }
      
      console.log(`${'='.repeat(60)}\n`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
};

startServer();
