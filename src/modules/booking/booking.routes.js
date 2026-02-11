import express from "express";
import { sendParcel } from "./booking.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";


const router = express.Router();

// Create a new booking
router.post("/send-parcel", authMiddleware, sendParcel);

export default router;