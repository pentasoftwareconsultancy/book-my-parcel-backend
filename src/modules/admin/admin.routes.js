import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import {
  fetchAllUsers,
  fetchAllBookings,
  fetchTravelersForKYC,
  updateKYCStatus,
  getAdminDashboard,
  getAllDisputesController,
  getAllPaymentsAdminController,
  getUserDetailsController,
  getTravelerDetailsController,
  getTabSettings,
  saveTabSettings,
  listEmailTemplates,
  updateEmailTemplateController,
} from "./admin.controller.js";
import { resolveDispute, updateDisputeStatus } from "../dispute/disputes.controller.js";
import { requireAdmin } from "../../middlewares/role.middleware.js";
import { sensitiveLimiter } from "../../middlewares/rateLimit.middleware.js";
import { validateStatus } from "../../utils/validation.util.js";
import paginationMiddleware from "../../middlewares/pagination.middleware.js";

const router = express.Router();

// ── Shared middleware stack for all admin routes ──────────────────────────────
const adminAuth = [authMiddleware, requireAdmin];

// ── General admin routes ──────────────────────────────────────────────────────
router.get("/users",                ...adminAuth, sensitiveLimiter,paginationMiddleware, fetchAllUsers);
router.get("/users/:id",            ...adminAuth, getUserDetailsController);
router.get("/travelers/:id",        ...adminAuth, getTravelerDetailsController);
router.get("/bookings",             ...adminAuth, sensitiveLimiter,paginationMiddleware, fetchAllBookings);
router.get("/travellers/kyc",       ...adminAuth, sensitiveLimiter,paginationMiddleware, fetchTravelersForKYC);
router.patch("/travellers/kyc/:id", ...adminAuth, sensitiveLimiter, validateStatus, updateKYCStatus);
router.get("/dashboardoverview",    ...adminAuth,paginationMiddleware, getAdminDashboard);
router.get("/disputes",             ...adminAuth,paginationMiddleware, getAllDisputesController);
router.get("/payments",             ...adminAuth, getAllPaymentsAdminController);

// ── Settings routes — specific routes BEFORE parameterised /:category ─────────
router.get("/settings/email-templates",     ...adminAuth, listEmailTemplates);
router.put("/settings/email-templates/:id", ...adminAuth, updateEmailTemplateController);
router.post("/settings/bulk-update",        ...adminAuth, saveTabSettings);
router.get("/settings/:category",           ...adminAuth, getTabSettings);

export default router;
