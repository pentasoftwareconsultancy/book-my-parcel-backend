/**
 * Environment variable validation.
 * Called once at server startup — crashes fast if required vars are missing.
 */

const REQUIRED = [
  "JWT_SECRET",
  "DB_HOST",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
];

const RECOMMENDED = [
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "GOOGLE_API_KEY",
  "BASE_URL",
];

export function validateEnv() {
  const missing = REQUIRED.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error("❌ Missing required environment variables:");
    missing.forEach((key) => console.error(`   - ${key}`));
    console.error("\nCopy .env.example to .env and fill in the values.");
    process.exit(1);
  }

  const missingRecommended = RECOMMENDED.filter((key) => !process.env[key]);
  if (missingRecommended.length > 0) {
    console.warn("⚠️  Missing recommended environment variables (some features may not work):");
    missingRecommended.forEach((key) => console.warn(`   - ${key}`));
  }

  // Validate JWT_SECRET strength
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.warn("⚠️  JWT_SECRET is too short (< 32 chars). Use a longer secret in production.");
  }

  console.log("✅ Environment variables validated");
}
