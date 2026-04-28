import dotenv from "dotenv";
dotenv.config();
import { createServer } from "http";
import { Server } from "socket.io";
import { validateEnv } from "./src/config/env.config.js";
import initDatabase from "./src/config/db.init.js";
import sequelize from "./src/config/database.config.js";
import "./src/modules/associations.js";
import app from "./src/app.js";
import { seedRoles } from "./src/utils/seedRoles.js";
import { createDefaultAdmin } from "./src/utils/createDefaultAdmin.js";
import { setupSocketHandlers } from "./src/utils/socketHandlers.js";
import runMigrations from "./src/utils/runMigrations.js";
import verifyAndAddMissingColumns from "./src/utils/verifyColumns.js";
import { runAutoCancelJob } from "./src/jobs/autoCancel.job.js";
import { runPaymentReleaseJob } from "./src/jobs/paymentRelease.job.js";

const startServer = async () => {
  try {
    // Validate env vars before anything else
    validateEnv();

    await initDatabase();
    await sequelize.authenticate();
    console.log("✅ Connected to database");

    // Run all pending database migrations
    await runMigrations();

    // Verify all columns exist (safety check)
    await verifyAndAddMissingColumns();

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
      allowUpgrades: false,
      transports: ["websocket", "polling"],
    });

    // Make io accessible in controllers via req.app.get("io")
    app.set("io", io);


    // All socket event handlers live here
    setupSocketHandlers(io);

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🔌 WebSocket server ready`);
      const smsEnabled = process.env.TWILIO_SMS_ENABLED === "false";
      console.log(`📱 SMS: ${smsEnabled ? "ENABLED — OTPs sent via Twilio" : "DISABLED — OTPs logged to console"}`);
      console.log(`${"=".repeat(60)}\n`);
    });

    // ── Background jobs ──────────────────────────────────────────────────────
    const AUTO_CANCEL_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
    const PAYMENT_RELEASE_INTERVAL_MS = 10 * 60 * 1000; // every 10 minutes

    // Guard flags — prevent overlapping runs
    let autoCancelRunning = false;
    let paymentReleaseRunning = false;

    // Wrapper: checks DB health before running, prevents overlap
    const safeRun = async (name, flag, job, setFlag) => {
      if (flag) {
        console.warn(`[${name}] Previous run still in progress — skipping this tick`);
        return;
      }
      try {
        await sequelize.authenticate(); // quick DB ping
      } catch (dbErr) {
        console.error(`[${name}] DB unavailable — skipping run:`, dbErr.message);
        return;
      }
      setFlag(true);
      try {
        await job();
      } catch (err) {
        console.error(`[${name}] Job failed:`, err.message);
      } finally {
        setFlag(false);
      }
    };

    const runAutoCancelSafe = () => safeRun("AutoCancel", autoCancelRunning, runAutoCancelJob, (v) => { autoCancelRunning = v; });
    const runPaymentReleaseSafe = () => safeRun("PaymentRelease", paymentReleaseRunning, runPaymentReleaseJob, (v) => { paymentReleaseRunning = v; });

    // Initial run after a short delay (let DB settle after sync)
    setTimeout(() => {
      runAutoCancelSafe();
      runPaymentReleaseSafe();
    }, 15_000);

    setInterval(runAutoCancelSafe, AUTO_CANCEL_INTERVAL_MS);
    setInterval(runPaymentReleaseSafe, PAYMENT_RELEASE_INTERVAL_MS);

    console.log(`AutoCancel job scheduled every ${AUTO_CANCEL_INTERVAL_MS / 60000} min`);
    console.log(`PaymentRelease job scheduled every ${PAYMENT_RELEASE_INTERVAL_MS / 60000} min`);
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
};

startServer();