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
    console.log("✅ Connected to database");

    await sequelize.sync({ force: false, alter: false });
    console.log("✅ Tables synced");

    await seedRoles();
    await createDefaultAdmin();

    const PORT = process.env.PORT || 3000;
    const server = createServer(app);

    const io = new Server(server, {
      pingTimeout: 120000,
      pingInterval: 30000,
      connectTimeout: 60000,
      upgradeTimeout: 10000,
      maxHttpBufferSize: 1e6,
      allowUpgrades: true,
      transports: ["websocket", "polling"],
    });

    // Make io accessible in controllers via req.app.get("io")
    app.set("io", io);

    // All socket event handlers live here
    setupSocketHandlers(io);

    server.listen(PORT, () => {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🔌 WebSocket server ready`);
      const smsEnabled = process.env.TWILIO_SMS_ENABLED === "true";
      console.log(`📱 SMS: ${smsEnabled ? "ENABLED — OTPs sent via Twilio" : "DISABLED — OTPs logged to console"}`);
      console.log(`${"=".repeat(60)}\n`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
};

startServer();