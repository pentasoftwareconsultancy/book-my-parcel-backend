import sequelize from "../../config/database.config.js";
import { Op } from "sequelize";
import Parcel from "../parcel/parcel.model.js";
import ParcelRequest from "./parcelRequest.model.js";
import ParcelAcceptance from "./parcelAcceptance.model.js";
import Booking from "../booking/booking.model.js";
import Address from "../parcel/address.model.js";
import User from "../user/user.model.js";
import TravellerProfile from "../traveller/travellerProfile.model.js";
import TravellerRoute from "../traveller/travellerRoute.model.js";
import { responseSuccess, responseError } from "../../utils/response.util.js";
import { sendToTraveller, sendToUser } from "../../services/notification.service.js";
import { matchParcelWithTravellers, runPeriodicMatching } from "../../services/matchingEngine.service.js";
import { getSortedAcceptancesByProximity } from "../../services/nearbyMatching.service.js";

// ─── POST /api/parcel/:id/find-travellers ──────────────────────────────────
export async function findTravellers(req, res) {
  try {
    const { id: parcelId } = req.params;

    // Verify parcel exists and belongs to user
    const parcel = await Parcel.findByPk(parcelId);
    if (!parcel) {
      return responseError(res, "Parcel not found", 404);
    }

    if (parcel.user_id !== req.user.id) {
      return responseError(res, "Unauthorized", 403);
    }

    // Run matching engine
    const result = await matchParcelWithTravellers(parcelId);

    if (!result.success) {
      return responseError(res, result.message || "Matching failed", 500);
    }

    // Update parcel status to MATCHING
    await parcel.update({ status: "MATCHING" });

    // Emit WebSocket event to user
    const io = req.app.get("io");
    if (io) {
      io.to(`user_${parcel.user_id}`).emit("parcel_matching", {
        parcel_id: parcelId,
        status: "MATCHING",
        requests_sent: result.requestsSent,
        message: "Finding nearby travellers for your parcel",
      });
      console.log(`[Socket] Emitted parcel_matching to user_${parcel.user_id}`);
    }

    // Send notifications to travellers
    if (result.requests && result.requests.length > 0) {
      const travellersToNotify = result.requests.map((r) => r.traveller_id);

      for (const travellerId of travellersToNotify) {
        await sendToTraveller(
          travellerId,
          "New Parcel Available",
          `A new parcel is available for delivery. Check your requests!`,
          {
            parcel_id: parcelId,
            type: "new_parcel_request",
          }
        );
      }
    }

    return responseSuccess(res, {
      parcel_id: parcelId,
      requests_sent: result.requestsSent,
      message: result.message,
    }, "Matching completed");
  } catch (error) {
    console.error("[Matching] Error finding travellers:", error.message);
    return responseError(res, error.message || "Failed to find travellers", 500);
  }
}

// ─── POST /api/traveller/accept-request/:requestId ─────────────────────────
export async function acceptRequest(req, res) {
  const t = await sequelize.transaction();

  try {
    const { requestId } = req.params;
    const travellerId = req.user.id;

    // Find request
    const request = await ParcelRequest.findByPk(requestId, { transaction: t });
    if (!request) {
      await t.rollback();
      return responseError(res, "Request not found", 404);
    }

    // Verify request is still valid
    if (request.status !== "SENT") {
      await t.rollback();
      return responseError(res, `Request already ${request.status.toLowerCase()}`, 400);
    }

    if (new Date() > request.expires_at) {
      await t.rollback();
      return responseError(res, "Request has expired", 400);
    }

    // Verify traveller matches
    if (request.traveller_id !== travellerId) {
      await t.rollback();
      return responseError(res, "Unauthorized", 403);
    }

    // Get parcel details
    const parcel = await Parcel.findByPk(request.parcel_id, { transaction: t });
    if (!parcel) {
      await t.rollback();
      return responseError(res, "Parcel not found", 404);
    }

    // Create acceptance
    const acceptance = await ParcelAcceptance.create(
      {
        parcel_request_id: requestId,
        parcel_id: request.parcel_id,
        traveller_id: travellerId,
        acceptance_price: parcel.price_quote,
      },
      { transaction: t }
    );

    // Update request status
    await request.update(
      {
        status: "ACCEPTED",
        responded_at: new Date(),
      },
      { transaction: t }
    );

    await t.commit();

    // Emit WebSocket event (if socket.io is available)
    if (req.app.get("io")) {
      const io = req.app.get("io");
      
      // Notify parcel owner about new acceptance
      io.to(`parcel_${request.parcel_id}`).emit("new_acceptance", {
        acceptance_id: acceptance.id,
        traveller_id: travellerId,
        detour_km: request.detour_km,
        detour_percentage: request.detour_percentage,
        acceptance_price: acceptance.acceptance_price,
      });
      
      // Notify other travellers that this request is no longer available
      io.emit("request_accepted", {
        request_id: requestId,
        parcel_id: request.parcel_id,
        accepted_by: travellerId,
      });
      
      console.log(`[Socket] Emitted new_acceptance and request_accepted for request ${requestId}`);
    }

    // Notify parcel owner
    await sendToUser(
      parcel.user_id,
      "Traveller Accepted Your Parcel",
      "A traveller has accepted your parcel delivery request!",
      {
        parcel_id: request.parcel_id,
        type: "acceptance_received",
      }
    );

    return responseSuccess(res, {
      acceptance_id: acceptance.id,
      parcel_id: request.parcel_id,
      traveller_id: travellerId,
      acceptance_price: acceptance.acceptance_price,
    }, "Request accepted successfully");
  } catch (error) {
    await t.rollback();
    console.error("[Matching] Error accepting request:", error.message);
    return responseError(res, error.message || "Failed to accept request", 500);
  }
}

// Express interest in parcel request (new flow)
export async function expressInterest(req, res) {
  const t = await sequelize.transaction();

  try {
    const { requestId } = req.params;
    const travellerId = req.user.id;

    console.log(`[DEBUG] Express Interest - RequestId: ${requestId}, TravellerId: ${travellerId}`);

    // Find request
    const request = await ParcelRequest.findByPk(requestId, { transaction: t });
    if (!request) {
      console.log(`[DEBUG] Request not found: ${requestId}`);
      await t.rollback();
      return responseError(res, "Request not found", 404);
    }

    console.log(`[DEBUG] Found request - Status: ${request.status}, Traveller: ${request.traveller_id}, Expires: ${request.expires_at}`);

    // Verify request is still valid
    if (request.status !== "SENT") {
      console.log(`[DEBUG] Request status invalid: ${request.status}`);
      await t.rollback();
      return responseError(res, `Request already ${request.status.toLowerCase()}`, 400);
    }

    if (new Date() > request.expires_at) {
      console.log(`[DEBUG] Request expired: ${request.expires_at} vs ${new Date()}`);
      await t.rollback();
      return responseError(res, "Request has expired", 400);
    }

    // Verify traveller matches
    if (request.traveller_id !== travellerId) {
      console.log(`[DEBUG] Traveller mismatch: ${request.traveller_id} vs ${travellerId}`);
      await t.rollback();
      return responseError(res, "Unauthorized", 403);
    }

    // Get parcel details
    const parcel = await Parcel.findByPk(request.parcel_id, { transaction: t });
    if (!parcel) {
      await t.rollback();
      return responseError(res, "Parcel not found", 404);
    }

    // Create acceptance record (same as before, but status is INTERESTED)
    const acceptance = await ParcelAcceptance.create(
      {
        parcel_request_id: requestId,
        parcel_id: request.parcel_id,
        traveller_id: travellerId,
        acceptance_price: parcel.price_quote,
      },
      { transaction: t }
    );

    // Update request status to INTERESTED (not ACCEPTED)
    await request.update(
      {
        status: "INTERESTED",
        responded_at: new Date(),
      },
      { transaction: t }
    );

    await t.commit();

    // Emit WebSocket event (if socket.io is available)
    if (req.app.get("io")) {
      const io = req.app.get("io");
      
      // Notify parcel owner about new interest
      io.to(`parcel_${request.parcel_id}`).emit("new_interest", {
        acceptance_id: acceptance.id,
        traveller_id: travellerId,
        detour_km: request.detour_km,
        detour_percentage: request.detour_percentage,
        acceptance_price: acceptance.acceptance_price,
      });
      
      console.log(`[Socket] Emitted new_interest for request ${requestId}`);
    }

    // Notify parcel owner
    await sendToUser(
      parcel.user_id,
      "Traveller Interested in Your Parcel",
      "A traveller has expressed interest in delivering your parcel!",
      {
        parcel_id: request.parcel_id,
        type: "interest_received",
      }
    );

    return responseSuccess(res, {
      acceptance_id: acceptance.id,
      parcel_id: request.parcel_id,
      traveller_id: travellerId,
      acceptance_price: acceptance.acceptance_price,
      message: "Your wave has been sent to the user! We will inform you if the user selects or rejects you."
    }, "Interest expressed successfully");
  } catch (error) {
    await t.rollback();
    console.error("[Matching] Error expressing interest:", error.message);
    return responseError(res, error.message || "Failed to express interest", 500);
  }
}
export async function rejectRequest(req, res) {
  const t = await sequelize.transaction();

  try {
    const { requestId } = req.params;
    const travellerId = req.user.id;

    // Find request
    const request = await ParcelRequest.findByPk(requestId, { transaction: t });
    if (!request) {
      await t.rollback();
      return responseError(res, "Request not found", 404);
    }

    // Verify request is still valid
    if (request.status !== "SENT") {
      await t.rollback();
      return responseError(res, `Request already ${request.status.toLowerCase()}`, 400);
    }

    // Verify traveller matches
    if (request.traveller_id !== travellerId) {
      await t.rollback();
      return responseError(res, "Unauthorized", 403);
    }

    // Update request status to rejected
    await request.update(
      {
        status: "REJECTED",
        responded_at: new Date(),
      },
      { transaction: t }
    );

    await t.commit();

    return responseSuccess(res, {
      request_id: requestId,
      status: "REJECTED",
    }, "Request rejected successfully");
  } catch (error) {
    await t.rollback();
    console.error("[Matching] Error rejecting request:", error.message);
    return responseError(res, error.message || "Failed to reject request", 500);
  }
}

// ─── GET /api/parcel/:id/acceptances ───────────────────────────────────────
export async function getAcceptances(req, res) {
  try {
    const { id: parcelId } = req.params;
    const { sort = "detour", include_pending = "false" } = req.query;
    const includePending = include_pending === "true";

    // Verify parcel exists and belongs to user
    const parcel = await Parcel.findByPk(parcelId, {
      include: [
        {
          model: Address,
          as: "pickupAddress",
          attributes: ["latitude", "longitude", "address", "city"]
        },
        {
          model: Address,
          as: "deliveryAddress", 
          attributes: ["latitude", "longitude", "address", "city"]
        }
      ]
    });
    
    if (!parcel) {
      return responseError(res, "Parcel not found", 404);
    }

    if (parcel.user_id !== req.user.id) {
      return responseError(res, "Unauthorized", 403);
    }

    // Get acceptances with proper sorting
    let orderClause;
    if (sort === "rating") {
      orderClause = [
        [{ model: User, as: "traveller" }, { model: TravellerProfile, as: "travellerProfile" }, "rating", "DESC"]
      ];
    } else {
      orderClause = [
        [{ model: ParcelRequest, as: "request" }, "detour_km", "ASC"]
      ];
    }

    const acceptances = await ParcelAcceptance.findAll({
      where: { parcel_id: parcelId },
      include: [
        {
          model: ParcelRequest,
          as: "request",
          attributes: ["detour_km", "detour_percentage", "match_score", "status"],
          where: { status: "INTERESTED" }, // Only show interested travellers
        },
        {
          model: User,
          as: "traveller",
          attributes: ["id", "email", "phone_number"],
          include: [
            {
              model: TravellerProfile,
              as: "travellerProfile",
              attributes: ["id", "vehicle_type", "capacity_kg", "status", "rating", "total_deliveries", "profile_photo", "last_known_location"],
            },
          ],
        },
      ],
      order: orderClause,
    });

    let formattedAcceptances = acceptances.map((acc) => ({
      acceptance_id: acc.id,
      type: "accepted",
      traveller: {
        id: acc.traveller.id,
        email: acc.traveller.email,
        phone: acc.traveller.phone_number,
        rating: acc.traveller.travellerProfile?.rating || 4.8,
        total_deliveries: acc.traveller.travellerProfile?.total_deliveries || 0,
        profile_photo: acc.traveller.travellerProfile?.profile_photo || null,
        vehicle_type: acc.traveller.travellerProfile?.vehicle_type || null,
        capacity_kg: acc.traveller.travellerProfile?.capacity_kg || null,
        travellerProfile: acc.traveller.travellerProfile
      },
      detour_km: acc.request.detour_km,
      detour_percentage: acc.request.detour_percentage,
      match_score: acc.request.match_score,
      acceptance_price: acc.acceptance_price,
      accepted_at: acc.accepted_at,
    }));

    // Get pending requests if requested
    let pendingRequests = [];
    if (includePending) {
      const pendingParcelRequests = await ParcelRequest.findAll({
        where: { 
          parcel_id: parcelId,
          status: "SENT"
        },
        include: [
          {
            model: User,
            as: "traveller",
            attributes: ["id", "email", "phone_number"],
            include: [
              {
                model: TravellerProfile,
                as: "travellerProfile",
                attributes: ["id", "vehicle_type", "capacity_kg", "status", "rating", "total_deliveries", "profile_photo", "last_known_location"],
              },
            ],
          },
        ],
        order: [["sent_at", "DESC"]],
      });

      pendingRequests = pendingParcelRequests.map((req) => ({
        request_id: req.id,
        type: "pending",
        traveller: {
          id: req.traveller.id,
          email: req.traveller.email,
          phone: req.traveller.phone_number,
          rating: req.traveller.travellerProfile?.rating || 4.8,
          total_deliveries: req.traveller.travellerProfile?.total_deliveries || 0,
          profile_photo: req.traveller.travellerProfile?.profile_photo || null,
          vehicle_type: req.traveller.travellerProfile?.vehicle_type || null,
          capacity_kg: req.traveller.travellerProfile?.capacity_kg || null,
          travellerProfile: req.traveller.travellerProfile
        },
        detour_km: req.detour_km,
        detour_percentage: req.detour_percentage,
        match_score: req.match_score,
        sent_at: req.sent_at,
        expires_at: req.expires_at,
      }));
    }

    // Handle nearby sorting for short-distance parcels
    if (sort === "nearby" && parcel.route_distance_km <= 50) {
      const pickupLocation = {
        lat: parseFloat(parcel.pickupAddress.latitude),
        lng: parseFloat(parcel.pickupAddress.longitude)
      };
      
      formattedAcceptances = await getSortedAcceptancesByProximity(formattedAcceptances, pickupLocation);
    }

    const responseData = {
      acceptances: formattedAcceptances,
      pending_requests: pendingRequests,
      sort_by: sort,
      parcel_distance_km: parcel.route_distance_km,
      pickup_location: parcel.pickupAddress ? {
        lat: parseFloat(parcel.pickupAddress.latitude),
        lng: parseFloat(parcel.pickupAddress.longitude)
      } : null,
      drop_location: parcel.deliveryAddress ? {
        lat: parseFloat(parcel.deliveryAddress.latitude),
        lng: parseFloat(parcel.deliveryAddress.longitude)
      } : null
    };

    return responseSuccess(res, responseData, "Acceptances retrieved successfully");
  } catch (error) {
    console.error("[Matching] Error getting acceptances:", error.message);
    return responseError(res, error.message || "Failed to get acceptances", 500);
  }
}

// ─── POST /api/parcel/:id/select-traveller ─────────────────────────────────
export async function selectTraveller(req, res) {
  console.log('🎯 selectTraveller called with:', {
    parcelId: req.params.id,
    body: req.body,
    userId: req.user.id
  });

  const t = await sequelize.transaction();

  try {
    const { id: parcelId } = req.params;
    const { traveller_id, acceptance_price } = req.body;

    // Verify parcel exists and belongs to user
    const parcel = await Parcel.findByPk(parcelId, { 
      include: [
        { model: Address, as: "pickupAddress" },
        { model: Address, as: "deliveryAddress" }
      ],
      transaction: t 
    });
    if (!parcel) {
      await t.rollback();
      return responseError(res, "Parcel not found", 404);
    }

    if (parcel.user_id !== req.user.id) {
      await t.rollback();
      return responseError(res, "Unauthorized", 403);
    }

    // Verify parcel is still available
    if (!["CREATED", "MATCHING", "PARTNER_SELECTED"].includes(parcel.status)) {
      await t.rollback();
      return responseError(res, `Parcel is already ${parcel.status.toLowerCase()}`, 400);
    }

    // Verify acceptance exists and is in INTERESTED status
    const acceptance = await ParcelAcceptance.findOne(
      {
        where: {
          parcel_id: parcelId,
          traveller_id,
        },
        include: [{ 
          model: ParcelRequest, 
          as: "request",
          where: { status: "INTERESTED" } // Only allow selection of interested travellers
        }],
      },
      { transaction: t }
    );

    if (!acceptance) {
      await t.rollback();
      return responseError(res, "Traveller has not expressed interest in this parcel", 400);
    }

    // Get traveller profile
    const travellerProfile = await TravellerProfile.findOne(
      { where: { user_id: traveller_id } },
      { transaction: t }
    );

    if (!travellerProfile) {
      await t.rollback();
      return responseError(res, "Traveller profile not found", 404);
    }

    // Update parcel with selection (but don't create booking yet)
    const finalPrice = acceptance_price || parcel.price_quote;
    await parcel.update(
      {
        status: "PARTNER_SELECTED", // New status to indicate selection but not confirmed
        selected_partner_id: traveller_id,
        selected_acceptance_id: acceptance.id,
        price_quote: finalPrice,
        form_step: 2, // Move to step 2
      },
      { transaction: t }
    );

    // NOTE: Booking will be created later in Step 3 when payment is confirmed

    // Update selected traveller's request status to SELECTED
    await acceptance.request.update(
      { status: "SELECTED" },
      { transaction: t }
    );

    // Reject other acceptances and update their status to NOT_SELECTED
    const otherAcceptances = await ParcelAcceptance.findAll(
      {
        where: {
          parcel_id: parcelId,
          traveller_id: { [Op.ne]: traveller_id },
        },
        include: [{ model: ParcelRequest, as: "request" }],
      },
      { transaction: t }
    );

    // Store rejected traveler IDs for WebSocket notifications
    const rejectedTravellerIds = [];

    for (const otherAcc of otherAcceptances) {
      await otherAcc.request.update(
        { status: "NOT_SELECTED" },
        { transaction: t }
      );

      rejectedTravellerIds.push(otherAcc.traveller_id);

      // Notify rejected travellers via push notification
      await sendToTraveller(
        otherAcc.traveller_id,
        "Parcel Assigned to Another Traveller",
        "Thank you for your interest. The parcel has been assigned to another traveller.",
        {
          parcel_id: parcelId,
          type: "parcel_not_selected",
        }
      );
    }

    await t.commit();

    // Emit WebSocket events AFTER commit
    if (req.app.get("io")) {
      const io = req.app.get("io");
      
      console.log('🔌 Emitting WebSocket events for traveller selection (not booking yet):', {
        parcelId,
        travellerId: traveller_id,
        parcelRoom: `parcel_${parcelId}`,
        travellerRoom: `traveller_requests_${traveller_id}`
      });
      
      // Emit to parcel room (for parcel owner)
      io.to(`parcel_${parcelId}`).emit("parcel_selected", {
        parcel_id: parcelId,
        parcel_uuid: parcelId,
        parcel_ref: parcel.parcel_ref,
        traveller_id,
        final_price: finalPrice,
        status: "PARTNER_SELECTED", // Indicate selection but not booking yet
      });
      console.log(`🔌 Emitted parcel_selected to room parcel_${parcelId}`);

      // Emit specific notification to selected traveller (selection notification, not booking)
      const travellerSelectedData = {
        parcel_id: parcelId,
        parcel_uuid: parcelId,
        parcel_ref: parcel.parcel_ref,
        request_id: acceptance.request.id,
        final_price: finalPrice,
        status: "SELECTED", // Status for the traveller
        message: "You have been selected! Waiting for payment confirmation...",
        parcel_details: {
          pickup_address: parcel.pickupAddress,
          delivery_address: parcel.deliveryAddress,
          pickup_city: parcel.pickupAddress?.city,
          delivery_city: parcel.deliveryAddress?.city,
          weight: parcel.weight,
          size: parcel.package_size,
          price: finalPrice,
          pickup_date: parcel.pickup_date,
        }
      };
      
      io.to(`traveller_requests_${traveller_id}`).emit("traveller_selected", travellerSelectedData);
      console.log(`🔌 Emitted traveller_selected to room traveller_requests_${traveller_id}`, travellerSelectedData);

      // Emit rejection notifications to all other travellers
      for (const rejectedId of rejectedTravellerIds) {
        const rejectedRequest = otherAcceptances.find(acc => acc.traveller_id === rejectedId)?.request;
        io.to(`traveller_requests_${rejectedId}`).emit("request_not_selected", {
          parcel_id: parcelId,
          parcel_uuid: parcelId, // Add explicit UUID for matching
          parcel_ref: parcel.parcel_ref, // Add parcel_ref for better matching
          request_id: rejectedRequest?.id,
          message: "This parcel has been assigned to another traveller",
          status: "NOT_SELECTED"
        });
        console.log(`[WebSocket] Emitted request_not_selected to traveller_requests_${rejectedId}`);
      }
    }

    // Notify selected traveller (selection only, not booking confirmation)
    await sendToTraveller(
      traveller_id,
      "You've Been Selected!",
      "You have been selected for this parcel. We'll notify you once the booking is confirmed after payment.",
      {
        parcel_id: parcelId,
        type: "parcel_selected_pending_payment",
      }
    );

    return responseSuccess(res, {
      parcel_id: parcelId,
      traveller_id,
      final_price: finalPrice,
      status: "PARTNER_SELECTED",
      message: "Traveller selected successfully. Booking will be created after payment confirmation."
    }, "Traveller selected successfully");
  } catch (error) {
    await t.rollback();
    console.error("[Matching] Error selecting traveller:", error.message);
    return responseError(res, error.message || "Failed to select traveller", 500);
  }
}

// ─── GET /api/traveller/requests ────────────────────────────────────────────
export async function getTravellerRequests(req, res) {
  try {
    const travellerId = req.user.id;
    const { status = "SENT" } = req.query;

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

    const formattedRequests = requests.map((req) => {
      // Debug logging
      console.log(`[getTravellerRequests] Request ${req.id}:`, {
        parcel_id: req.parcel.id,
        pickup_city: req.parcel.pickupAddress?.city,
        delivery_city: req.parcel.deliveryAddress?.city,
        route_id: req.route?.id
      });

      return {
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
      };
    });

    return responseSuccess(res, formattedRequests, "Requests retrieved successfully");
  } catch (error) {
    console.error("[Matching] Error getting traveller requests:", error.message);
    console.error(error.stack);
    return responseError(res, error.message || "Failed to get requests", 500);
  }
}
// ─── POST /api/matching/run-periodic ──────────────────────────────────────
/**
 * Manually trigger periodic matching (useful for testing or admin)
 */
export async function runPeriodicMatchingController(req, res) {
  try {
    console.log("[Matching] Manual periodic matching triggered");

    const result = await runPeriodicMatching();

    return responseSuccess(res, {
      totalProcessed: result.totalProcessed,
      totalMatched: result.totalMatched,
    }, result.message);
  } catch (error) {
    console.error("[Matching] Error in periodic matching:", error.message);
    return responseError(res, error.message || "Failed to run periodic matching", 500);
  }
}
// ─── GET /api/parcel/:id/route-geometry ───────────────────────────────────
/**
 * Get route geometry for acceptances (for map visualization)
 */
export async function getRouteGeometry(req, res) {
  try {
    const { id: parcelId } = req.params;

    // Verify parcel exists and belongs to user
    const parcel = await Parcel.findByPk(parcelId);
    if (!parcel) {
      return responseError(res, "Parcel not found", 404);
    }

    if (parcel.user_id !== req.user.id) {
      return responseError(res, "Unauthorized", 403);
    }

    // Get acceptances with route geometry
    const acceptances = await ParcelAcceptance.findAll({
      where: { parcel_id: parcelId },
      include: [
        {
          model: ParcelRequest,
          as: "request",
          include: [
            {
              model: TravellerRoute,
              as: "route",
              attributes: ["id"],
            }
          ]
        },
        {
          model: User,
          as: "traveller",
          attributes: ["id", "email"],
        },
      ],
    });

    // Get route geometries from database
    const routeGeometries = [];
    for (const acceptance of acceptances) {
      const routeId = acceptance.request?.route?.id;
      if (routeId) {
        try {
          const geometry = await sequelize.query(
            `SELECT 
              id,
              ST_AsGeoJSON(route_geom) as geometry,
              ST_AsText(ST_StartPoint(route_geom)) as start_point,
              ST_AsText(ST_EndPoint(route_geom)) as end_point
            FROM traveller_routes
            WHERE id = :routeId`,
            {
              replacements: { routeId },
              type: sequelize.QueryTypes.SELECT,
            }
          );

          if (geometry[0]) {
            const startPoint = geometry[0].start_point ? 
              geometry[0].start_point.match(/POINT\(([^ ]+) ([^ ]+)\)/) : null;
            const endPoint = geometry[0].end_point ? 
              geometry[0].end_point.match(/POINT\(([^ ]+) ([^ ]+)\)/) : null;

            routeGeometries.push({
              acceptance_id: acceptance.id,
              traveller_id: acceptance.traveller_id,
              traveller_email: acceptance.traveller.email,
              route_id: routeId,
              geometry: JSON.parse(geometry[0].geometry),
              start_point: startPoint ? {
                lng: parseFloat(startPoint[1]),
                lat: parseFloat(startPoint[2])
              } : null,
              end_point: endPoint ? {
                lng: parseFloat(endPoint[1]), 
                lat: parseFloat(endPoint[2])
              } : null,
            });
          }
        } catch (error) {
          console.error(`[Matching] Error getting geometry for route ${routeId}:`, error.message);
        }
      }
    }

    return responseSuccess(res, {
      parcel_id: parcelId,
      route_geometries: routeGeometries,
    }, "Route geometries retrieved successfully");
  } catch (error) {
    console.error("[Matching] Error getting route geometry:", error.message);
    return responseError(res, error.message || "Failed to get route geometry", 500);
  }
}

// ─── POST /api/matching/test-parcel/:id ────────────────────────────────────
/**
 * Manually trigger matching for a specific parcel (useful for testing)
 */
export async function testParcelMatching(req, res) {
  try {
    const { id } = req.params;
    console.log(`[Matching] Manual matching triggered for parcel ${id}`);

    const result = await matchParcelWithTravellers(id);

    return responseSuccess(res, {
      parcelId: id,
      requestsSent: result.requestsSent,
      message: result.message,
      requests: result.requests || [],
    }, `Matching completed for parcel ${id}`);
  } catch (error) {
    console.error(`[Matching] Error in manual parcel matching for ${req.params.id}:`, error.message);
    return responseError(res, error.message || "Failed to match parcel", 500);
  }
}