// modules/tracking/parcelTracking.routes.js
import express from "express";
import {
  handleInitiateTracking,
  handleUpdateLocation,
  handleGetTracking,
  handleCompleteDelivery,
} from "./parcelTracking.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js"; // unchanged, just imported
import { authorizeRoles } from "./tracking.middleware.js";            // your own

const router = express.Router();

router.use(authMiddleware);

router.post  ("/initiate",    authorizeRoles("TRAVELLER"),           handleInitiateTracking);
router.patch ("/location",    authorizeRoles("TRAVELLER"),           handleUpdateLocation);
router.get   ("/:booking_id", authorizeRoles("INDIVIDUAL", "ADMIN"), handleGetTracking);
router.patch ("/complete",    authorizeRoles("TRAVELLER"),           handleCompleteDelivery);

export default router;