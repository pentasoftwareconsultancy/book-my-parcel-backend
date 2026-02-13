import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { upload } from "../../utils/fileUpload.util.js";
import { createParcel, getUserRequests } from "../parcel/parcel.controller.js";
import { updateBookingStatusController } from "../booking/booking.controller.js";

const router = express.Router();

// ==================== USER REQUESTS ====================
// Route: Create Parcel Request (Sender)
// POST /api/user/request
router.post(
  "/request",
  authMiddleware,
  upload.array("parcel_photos", 3), // max 3 photos
  createParcel
);

// UPDATE PARCEL STATUS
router.patch(
  "/request/:parcelId/status",
  authMiddleware,
  updateBookingStatusController
);

// Route: Get User's Requests
// GET /api/user/requests

router.get("/request",authMiddleware,getUserRequests);


// // Route: Get Specific Request
// // GET /api/user/requests/:id
// router.get("/requests/:id", authMiddleware, (req, res) => {
//   // TODO: Implement get request by id
//   res.json({ message: "Get request by ID endpoint - to be implemented" });
// });

// // Route: Search Requests
// // GET /api/user/requests/search
// router.get("/requests/search", authMiddleware, (req, res) => {
//   // TODO: Implement search requests
//   res.json({ message: "Search requests endpoint - to be implemented" });
// });

export default router;
