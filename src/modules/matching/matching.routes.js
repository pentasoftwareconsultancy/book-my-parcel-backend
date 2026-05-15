import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requireAdmin } from "../../middlewares/role.middleware.js";
import { generalLimiter } from "../../middlewares/rateLimit.middleware.js";
import { validateRequest } from "../../middlewares/validation.middleware.js";
import ParcelRequest from "./parcelRequest.model.js";
import Parcel from "../parcel/parcel.model.js";
import Address from "../parcel/address.model.js";
import TravellerRoute from "../traveller/travellerRoute.model.js";
import { responseSuccess, responseError } from "../../utils/response.util.js";
import {
  findTravellers,
  acceptRequest,
  expressInterest,
  rejectRequest,
  getAcceptances,
  selectTraveller,
  getTravellerRequests,
  runPeriodicMatchingController,
  testParcelMatching,
  getRouteGeometry,
} from "./matching.controller.js";
import { selectTravellerSchema } from "./matching.validation.js";

const router = express.Router();

// Apply rate limiting to all matching routes
router.use(generalLimiter);

// ─── Parcel Owner Routes ────────────────────────────────────────────────────

// POST /api/parcel/:id/find-travellers - Trigger matching
router.post("/:id/find-travellers", authMiddleware, findTravellers);

// GET /api/parcel/:id/acceptances - Get acceptances for a parcel
router.get("/:id/acceptances", authMiddleware, getAcceptances);

// GET /api/parcel/:id/route-geometry - Get route geometry for acceptances
router.get("/:id/route-geometry", authMiddleware, getRouteGeometry);

// POST /api/parcel/:id/select-traveller - Select a traveller
router.post("/:id/select-traveller", authMiddleware, validateRequest(selectTravellerSchema), selectTraveller);

// ─── Traveller Routes ───────────────────────────────────────────────────────

// POST /api/traveller/requests/:requestId/express-interest - Express interest in a request
router.post("/requests/:requestId/express-interest", authMiddleware, expressInterest);

// POST /api/traveller/requests/:requestId/accept - Accept a request
router.post("/requests/:requestId/accept", authMiddleware, acceptRequest);

// POST /api/traveller/requests/:requestId/reject - Reject a request
router.post("/requests/:requestId/reject", authMiddleware, rejectRequest);

// GET /api/traveller/requests - Get all requests for traveller
router.get("/requests", authMiddleware, getTravellerRequests);

// ─── Admin/Testing Routes ───────────────────────────────────────────────────

// POST /api/matching/run-periodic - Manually trigger periodic matching (admin only)
router.post("/run-periodic", authMiddleware, requireAdmin, runPeriodicMatchingController);

// POST /api/matching/test-parcel/:id - Test matching for specific parcel (admin only)
router.post("/test-parcel/:id", authMiddleware, requireAdmin, testParcelMatching);

// POST /api/matching/fix-detour-values - Fix detour values for existing requests (admin only)
router.post("/fix-detour-values", authMiddleware, requireAdmin, async (req, res) => {
  try {
    console.log("[Fix] Starting detour value fix for existing parcel requests");

    // Get all parcel requests with 0 or null detour values
    const requests = await ParcelRequest.findAll({
      where: {
        detour_km: [0, null],
      },
      include: [
        {
          model: Parcel,
          as: "parcel",
          include: [
            { model: Address, as: "pickupAddress" },
            { model: Address, as: "deliveryAddress" },
          ],
        },
        {
          model: TravellerRoute,
          as: "route",
          attributes: ["id", "total_distance_km", "transport_mode"],
        },
      ],
      limit: 50, // Process in batches
    });

    console.log(`[Fix] Found ${requests.length} requests with missing detour values`);

    let fixed = 0;
    for (const request of requests) {
      try {
        // Calculate simple detour based on distance
        const routeDistance = parseFloat(request.route?.total_distance_km) || 100;
        const transportMode = request.route?.transport_mode || 'private';
        
        // Simple fallback calculation
        let detourKm, detourPercentage;
        
        if (transportMode === 'bus' || transportMode === 'train') {
          // Transit routes: use walking distance estimate
          detourKm = Math.random() * 3 + 1; // 1-4 km walking
          detourPercentage = 0; // Not applicable for transit
        } else {
          // Private routes: use percentage of route distance
          detourKm = routeDistance * (0.05 + Math.random() * 0.15); // 5-20% of route distance
          detourPercentage = (detourKm / routeDistance) * 100;
        }

        await request.update({
          detour_km: Math.round(detourKm * 10) / 10, // Round to 1 decimal
          detour_percentage: Math.round(detourPercentage * 10) / 10,
        });

        fixed++;
        console.log(`[Fix] Updated request ${request.id}: ${detourKm}km (${detourPercentage}%)`);
      } catch (error) {
        console.error(`[Fix] Error updating request ${request.id}:`, error.message);
      }
    }

    return responseSuccess(res, { 
      total_found: requests.length, 
      fixed: fixed 
    }, `Fixed detour values for ${fixed} parcel requests`);
  } catch (error) {
    console.error("[Fix] Error fixing detour values:", error.message);
    return responseError(res, error.message || "Failed to fix detour values", 500);
  }
});

// GET /api/matching/test-traveller-requests/:travellerId (admin only — no raw DB access for regular users)
router.get("/test-traveller-requests/:travellerId", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const travellerId = req.params.travellerId;
    const { status = "SENT" } = req.query;

    console.log(`[Test] Getting requests for traveller: ${travellerId}, status: ${status}`);

    const requests = await ParcelRequest.findAll({
      where: {
        traveller_id: travellerId,
        ...(status && { status }),
      },
      include: [
        {
          model: Parcel,
          as: "parcel",
          attributes: ["id", "parcel_ref", "weight", "parcel_type", "price_quote"],
          include: [
            { model: Address, as: "pickupAddress", attributes: ["city", "locality", "formatted_address"] },
            { model: Address, as: "deliveryAddress", attributes: ["city", "locality", "formatted_address"] },
          ],
        },
        {
          model: TravellerRoute,
          as: "route",
          attributes: ["id", "total_distance_km", "total_duration_minutes"],
        },
      ],
      order: [["sent_at", "DESC"]],
    });

    console.log(`[Test] Found ${requests.length} requests for traveller ${travellerId}`);

    const formattedRequests = requests.map((req) => ({
      request_id: req.id,
      parcel: {
        id: req.parcel.id,
        parcel_ref: req.parcel.parcel_ref,
        weight: req.parcel.weight,
        type: req.parcel.parcel_type,
        price_quote: req.parcel.price_quote,
        pickup: {
          city: req.parcel.pickupAddress.city,
          locality: req.parcel.pickupAddress.locality,
          address: req.parcel.pickupAddress.formatted_address,
        },
        delivery: {
          city: req.parcel.deliveryAddress.city,
          locality: req.parcel.deliveryAddress.locality,
          address: req.parcel.deliveryAddress.formatted_address,
        },
      },
      route: {
        id: req.route.id,
        distance_km: req.route.total_distance_km,
        duration_minutes: req.route.total_duration_minutes,
      },
      detour_km: req.detour_km,
      detour_percentage: req.detour_percentage,
      match_score: req.match_score,
      status: req.status,
      sent_at: req.sent_at,
      expires_at: req.expires_at,
    }));

    return responseSuccess(res, formattedRequests, "Test requests retrieved successfully");
  } catch (error) {
    console.error("[Test] Error getting traveller requests:", error.message);
    console.error(error.stack);
    return responseError(res, error.message || "Failed to get requests", 500);
  }
});

export default router;
