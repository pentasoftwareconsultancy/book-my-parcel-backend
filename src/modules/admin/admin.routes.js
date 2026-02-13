import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { fetchAllUsers } from "./admin.controller.js";
import { fetchAllBookings } from "./admin.controller.js";

const router = express.Router();

router.get("/users", authMiddleware, fetchAllUsers);
router.get("/bookings", authMiddleware, fetchAllBookings);

export default router;