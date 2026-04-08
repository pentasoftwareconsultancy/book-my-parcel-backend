import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { generalLimiter } from "../../middlewares/rateLimit.middleware.js";
import { validateRequest } from "../../middlewares/validation.middleware.js";
import { createRouteSchema } from "./travellerRoute.validation.js";
import {
  createRoute,
  getRoutes,
  getRoute,
  updateRoute,
  deleteRoute,
} from "./travellerRoute.controller.js";

const router = express.Router();

// Apply rate limiting and authentication to all routes
router.use(generalLimiter);
router.use(authMiddleware);

// POST /api/traveller/routes - Create a new route
router.post("/", validateRequest(createRouteSchema), createRoute);

// GET /api/traveller/routes - Get all routes for authenticated traveller
router.get("/", getRoutes);

// GET /api/traveller/routes/:id - Get specific route by ID
router.get("/:id", getRoute);

// PUT /api/traveller/routes/:id - Update a route
router.put("/:id", updateRoute);

// DELETE /api/traveller/routes/:id - Delete a route
router.delete("/:id", deleteRoute);

export default router;
