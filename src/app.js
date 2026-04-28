import express from "express";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import cors from "cors";
import sequelize from "./config/database.config.js";
import routes from "./routes.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import { sanitizeBody } from "./middlewares/sanitize.middleware.js";

const app = express();

// ── Security headers (helmet) ─────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false, // Disabled — API-only server, no HTML served
    crossOriginEmbedderPolicy: false,
  })
);

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://172.17.208.1:5173",
  "http://192.168.1.110:5173",
  "http://172.17.208.1:5174",
  "http://192.168.1.110:5174",
  "https://book-my-parcel-frontend.vercel.app",
  "https://bmp-fe-uytr.vercel.app",
  "https://book-my-parcel-fr-git-e20a48-pentasoftwareconsultancys-projects.vercel.app",
  // Current frontend URLs
  "https://feature-bmp.vercel.app",
  "https://testing-bmp.vercel.app", 
  "https://stage-bmp.vercel.app",
  "https://prod-bmp.vercel.app",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // server-to-server / curl
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // Vercel preview deployments — exact suffix match
      if (origin.endsWith(".vercel.app")) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// ── Request logging ───────────────────────────────────────────────────────────
// Use 'combined' in production, 'dev' locally
const logFormat = process.env.NODE_ENV === "production" ? "combined" : "dev";
app.use(morgan(logFormat));

// ── Response compression ──────────────────────────────────────────────────────
app.use(compression());

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ── Input sanitization (strip null bytes, trim strings) ───────────────────────
app.use(sanitizeBody);

// ── Static uploads ────────────────────────────────────────────────────────────
app.use("/uploads", express.static("uploads"));

// ── API routes ────────────────────────────────────────────────────────────────
app.use("/api", routes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.status(200).json({
    message: "Book My Parcel Backend is running!",
    version: "1.0.0",
    env: process.env.NODE_ENV || "development",
  });
});

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Backend is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: process.env.DATABASE_URL ? 'External DB' : 'Local DB',
    port: process.env.PORT || 3000
  });
});

// Database connection test endpoint
app.get("/api/db-test", async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({
      success: true,
      message: "Database connection successful",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Database connection failed",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default app;
