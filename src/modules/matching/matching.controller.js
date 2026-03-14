import sequelize from "../../config/database.config.js";
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
import { matchParcelWithTravellers } from "../../services/matchingEngine.service.js";

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

    return responseSuccess(res, "Matching completed", {
      parcel_id: parcelId,
      requests_sent: result.requestsSent,
      message: result.message,
    });
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
      req.app.get("io").to(`parcel_${request.parcel_id}`).emit("new_acceptance", {
        acceptance_id: acceptance.id,
        traveller_id: travellerId,
        detour_km: request.detour_km,
        detour_percentage: request.detour_percentage,
        acceptance_price: acceptance.acceptance_price,
      });
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

    return responseSuccess(res, "Request accepted successfully", {
      acceptance_id: acceptance.id,
      parcel_id: request.parcel_id,
      traveller_id: travellerId,
      acceptance_price: acceptance.acceptance_price,
    });
  } catch (error) {
    await t.rollback();
    console.error("[Matching] Error accepting request:", error.message);
    return responseError(res, error.message || "Failed to accept request", 500);
  }
}

// ─── GET /api/parcel/:id/acceptances ───────────────────────────────────────
export async function getAcceptances(req, res) {
  try {
    const { id: parcelId } = req.params;
    const { sort = "detour" } = req.query;

    // Verify parcel exists and belongs to user
    const parcel = await Parcel.findByPk(parcelId);
    if (!parcel) {
      return responseError(res, "Parcel not found", 404);
    }

    if (parcel.user_id !== req.user.id) {
      return responseError(res, "Unauthorized", 403);
    }

    // Get acceptances
    const acceptances = await ParcelAcceptance.findAll({
      where: { parcel_id: parcelId },
      include: [
        {
          model: ParcelRequest,
          attributes: ["detour_km", "detour_percentage", "match_score"],
        },
        {
          model: User,
          attributes: ["id", "email", "phone_number"],
          include: [
            {
              model: TravellerProfile,
              attributes: ["id", "rating", "total_deliveries", "profile_photo"],
            },
          ],
        },
      ],
      order: [
        sort === "rating"
          ? [{ "$User.travellerProfile.rating$": "DESC" }]
          : [{ "$ParcelRequest.detour_km$": "ASC" }],
      ],
    });

    const formattedAcceptances = acceptances.map((acc) => ({
      acceptance_id: acc.id,
      traveller: {
        id: acc.User.id,
        email: acc.User.email,
        phone: acc.User.phone_number,
        rating: acc.User.travellerProfile?.rating || 0,
        total_deliveries: acc.User.travellerProfile?.total_deliveries || 0,
        profile_photo: acc.User.travellerProfile?.profile_photo || null,
      },
      detour_km: acc.ParcelRequest.detour_km,
      detour_percentage: acc.ParcelRequest.detour_percentage,
      match_score: acc.ParcelRequest.match_score,
      acceptance_price: acc.acceptance_price,
      accepted_at: acc.accepted_at,
    }));

    return responseSuccess(res, "Acceptances retrieved successfully", formattedAcceptances);
  } catch (error) {
    console.error("[Matching] Error getting acceptances:", error.message);
    return responseError(res, error.message || "Failed to get acceptances", 500);
  }
}

// ─── POST /api/parcel/:id/select-traveller ─────────────────────────────────
export async function selectTraveller(req, res) {
  const t = await sequelize.transaction();

  try {
    const { id: parcelId } = req.params;
    const { traveller_id, acceptance_price } = req.body;

    // Verify parcel exists and belongs to user
    const parcel = await Parcel.findByPk(parcelId, { transaction: t });
    if (!parcel) {
      await t.rollback();
      return responseError(res, "Parcel not found", 404);
    }

    if (parcel.user_id !== req.user.id) {
      await t.rollback();
      return responseError(res, "Unauthorized", 403);
    }

    // Verify parcel is still available
    if (!["CREATED", "MATCHING"].includes(parcel.status)) {
      await t.rollback();
      return responseError(res, `Parcel is already ${parcel.status.toLowerCase()}`, 400);
    }

    // Verify acceptance exists
    const acceptance = await ParcelAcceptance.findOne(
      {
        where: {
          parcel_id: parcelId,
          traveller_id,
        },
        include: [{ model: ParcelRequest }],
      },
      { transaction: t }
    );

    if (!acceptance) {
      await t.rollback();
      return responseError(res, "Traveller has not accepted this parcel", 400);
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

    // Update parcel
    const finalPrice = acceptance_price || parcel.price_quote;
    await parcel.update(
      {
        status: "CONFIRMED",
        selected_partner_id: traveller_id,
        price_quote: finalPrice,
      },
      { transaction: t }
    );

    // Create or update booking
    let booking = await Booking.findOne(
      { where: { parcel_id: parcelId } },
      { transaction: t }
    );

    if (!booking) {
      const bookingRef = `BK-${new Date().getFullYear()}-${String(parcelId).slice(0, 8).toUpperCase()}`;
      booking = await Booking.create(
        {
          parcel_id: parcelId,
          traveller_id,
          status: "CONFIRMED",
          booking_ref: bookingRef,
        },
        { transaction: t }
      );
    } else {
      await booking.update(
        {
          traveller_id,
          status: "CONFIRMED",
        },
        { transaction: t }
      );
    }

    // Reject other acceptances
    const otherAcceptances = await ParcelAcceptance.findAll(
      {
        where: {
          parcel_id: parcelId,
          traveller_id: { [sequelize.Op.ne]: traveller_id },
        },
        include: [{ model: ParcelRequest }],
      },
      { transaction: t }
    );

    for (const otherAcc of otherAcceptances) {
      await otherAcc.ParcelRequest.update(
        { status: "REJECTED" },
        { transaction: t }
      );

      // Notify rejected travellers
      await sendToTraveller(
        otherAcc.traveller_id,
        "Parcel Assigned",
        "The parcel has been assigned to another traveller.",
        {
          parcel_id: parcelId,
          type: "parcel_assigned_to_other",
        }
      );
    }

    await t.commit();

    // Emit WebSocket event
    if (req.app.get("io")) {
      req.app.get("io").to(`parcel_${parcelId}`).emit("parcel_selected", {
        parcel_id: parcelId,
        traveller_id,
        booking_id: booking.id,
        booking_ref: booking.booking_ref,
        final_price: finalPrice,
      });
    }

    // Notify selected traveller
    await sendToTraveller(
      traveller_id,
      "Parcel Confirmed",
      "Your parcel delivery has been confirmed!",
      {
        parcel_id: parcelId,
        booking_id: booking.id,
        type: "parcel_confirmed",
      }
    );

    return responseSuccess(res, "Traveller selected successfully", {
      booking_id: booking.id,
      booking_ref: booking.booking_ref,
      parcel_id: parcelId,
      traveller_id,
      final_price: finalPrice,
      status: "CONFIRMED",
    });
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
          attributes: ["id", "parcel_ref", "weight", "parcel_type", "price_quote"],
          include: [
            { model: Address, as: "pickupAddress", attributes: ["city", "locality", "formatted_address"] },
            { model: Address, as: "deliveryAddress", attributes: ["city", "locality", "formatted_address"] },
          ],
        },
        {
          model: TravellerRoute,
          attributes: ["id", "total_distance_km", "total_duration_minutes"],
        },
      ],
      order: [["sent_at", "DESC"]],
    });

    const formattedRequests = requests.map((req) => ({
      request_id: req.id,
      parcel: {
        id: req.Parcel.id,
        parcel_ref: req.Parcel.parcel_ref,
        weight: req.Parcel.weight,
        type: req.Parcel.parcel_type,
        price_quote: req.Parcel.price_quote,
        pickup: {
          city: req.Parcel.pickupAddress.city,
          locality: req.Parcel.pickupAddress.locality,
          address: req.Parcel.pickupAddress.formatted_address,
        },
        delivery: {
          city: req.Parcel.deliveryAddress.city,
          locality: req.Parcel.deliveryAddress.locality,
          address: req.Parcel.deliveryAddress.formatted_address,
        },
      },
      route: {
        id: req.TravellerRoute.id,
        distance_km: req.TravellerRoute.total_distance_km,
        duration_minutes: req.TravellerRoute.total_duration_minutes,
      },
      detour_km: req.detour_km,
      detour_percentage: req.detour_percentage,
      match_score: req.match_score,
      status: req.status,
      sent_at: req.sent_at,
      expires_at: req.expires_at,
    }));

    return responseSuccess(res, "Requests retrieved successfully", formattedRequests);
  } catch (error) {
    console.error("[Matching] Error getting traveller requests:", error.message);
    return responseError(res, error.message || "Failed to get requests", 500);
  }
}
