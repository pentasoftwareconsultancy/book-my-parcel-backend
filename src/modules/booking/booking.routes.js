import express from "express";
import { updateBookingStatusController } from "./booking.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.patch(
  "/:bookingId/status",
  authMiddleware,
  updateBookingStatusController
);

export default router;
