import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { generalLimiter } from "../../middlewares/rateLimit.middleware.js";
import {
  getNotifications,
  markOneRead,
  markAllRead,
  deleteNotification,
} from "./notification.controller.js";

const router = express.Router();

router.use(generalLimiter);
router.use(authMiddleware);

// GET    /api/notifications?role=user&page=1&limit=20
router.get("/", getNotifications);

// PATCH  /api/notifications/read-all   ← must be before /:id to avoid conflict
router.patch("/read-all", markAllRead);

// PATCH  /api/notifications/:id/read
router.patch("/:id/read", markOneRead);

// DELETE /api/notifications/:id
router.delete("/:id", deleteNotification);

export default router;
