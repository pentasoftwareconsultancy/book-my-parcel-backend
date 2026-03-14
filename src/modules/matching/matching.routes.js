import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { validateRequest } from "../../middlewares/validation.middleware.js";
import {
  findTravellers,
  acceptRequest,
  getAcceptances,
  selectTraveller,
  getTravellerRequests,
} from "./matching.controller.js";
import { selectTravellerSchema } from "./matching.validation.js";

const router = express.Router();

// ─── Parcel Owner Routes ────────────────────────────────────────────────────

// POST /api/parcel/:id/find-travellers - Trigger matching
router.post("/:id/find-travellers", authMiddleware, findTravellers);

// GET /api/parcel/:id/acceptances - Get acceptances for a parcel
router.get("/:id/acceptances", authMiddleware, getAcceptances);

// POST /api/parcel/:id/select-traveller - Select a traveller
router.post("/:id/select-traveller", authMiddleware, validateRequest(selectTravellerSchema), selectTraveller);

// ─── Traveller Routes ───────────────────────────────────────────────────────

// POST /api/traveller/requests/:requestId/accept - Accept a request
router.post("/requests/:requestId/accept", authMiddleware, acceptRequest);

// GET /api/traveller/requests - Get all requests for traveller
router.get("/requests", authMiddleware, getTravellerRequests);

export default router;
