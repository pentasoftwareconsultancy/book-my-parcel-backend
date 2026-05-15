/**
 * Quick WhatsApp test script
 * Run: node scripts/testWhatsApp.js
 */
import dotenv from "dotenv";
dotenv.config();

import { sendWhatsApp } from "../src/services/whatsapp.service.js";

const result = await sendWhatsApp(
  process.env.TEST_PHONE_NUMBER,
  "🚀 *Book My Parcel* — WhatsApp notification test!\nIf you see this, WhatsApp is working correctly."
);

console.log("Result:", result);
process.exit(result.success ? 0 : 1);
