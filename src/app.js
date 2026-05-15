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
    // Content Security Policy — restricts which sources browsers trust.
    // This is an API-only server (no HTML), so the policy is intentionally
    // tight: only allow same-origin requests and the Razorpay checkout script.
    contentSecurityPolicy: {
      directives: {
        defaultSrc:     ["'self'"],
        scriptSrc:      ["'self'", "https://checkout.razorpay.com"],
        connectSrc:     ["'self'", "https://api.razorpay.com", "https://lumberjack.razorpay.com"],
        imgSrc:         ["'self'", "data:", "https:"],
        styleSrc:       ["'self'", "'unsafe-inline'"], // needed for Razorpay iframe
        frameSrc:       ["https://api.razorpay.com", "https://checkout.razorpay.com"],  // Razorpay payment iframe
        objectSrc:      ["'none'"],
        upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null,
      },
    },
    // Allow cross-origin resource sharing for the frontend
    crossOriginEmbedderPolicy: false,
    // Prevent browsers from MIME-sniffing
    noSniff: true,
    // Clickjacking protection — use SAMEORIGIN so Razorpay's iframe can render
    frameguard: { action: "sameorigin" },
    // HSTS — only enforce in production (avoids breaking local HTTP dev)
    hsts: process.env.NODE_ENV === "production"
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
    // Hide X-Powered-By: Express
    hidePoweredBy: true,
  })
);

// ── CORS ──────────────────────────────────────────────────────────────────────
// Load allowed origins from env (comma-separated) with sensible defaults.
// Example: ALLOWED_ORIGINS=https://myapp.com,https://staging.myapp.com
const envOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : [];

const defaultOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
];

const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])];

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
// Mount routes at both /api (legacy) and /api/v1 (versioned)
app.use("/api", routes);
app.use("/api/v1", routes);

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Backend is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    database: process.env.DATABASE_URL ? "External DB" : "Local DB",
    port: process.env.PORT || 3000,
    api_version: "v1",
  });
});

app.get("/api/db-test", async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({
      success: true,
      message: "Database connection successful",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Database connection failed",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

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

export default app;
