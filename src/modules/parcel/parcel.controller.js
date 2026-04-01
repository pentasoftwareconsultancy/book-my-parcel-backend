import { createParcelRequest } from "./parcel.service.js";
import { responseSuccess, responseError } from "../../utils/response.util.js";
import { getUserParcelRequests, getParcelById as getServiceParcelById } from "./parcel.service.js";
import { matchParcelWithTravellers } from "../../services/matchingEngine.service.js";
import { sendToTraveller } from "../../services/notification.service.js";

export const createParcel = async (req, res) => {
  try {
    const userId = req.user.id; // from auth
    const parcelData = { ...req.body, user_id: userId };

    const result = await createParcelRequest(parcelData, req.files);

    // Trigger matching asynchronously (don't wait for it)
    setImmediate(async () => {
      try {
        const matchResult = await matchParcelWithTravellers(result.parcel.id);
        console.log(`[Parcel] Matching triggered for parcel ${result.parcel.id}: ${matchResult.requestsSent} requests sent`);

        // Send notifications to travellers
        if (matchResult.requests && matchResult.requests.length > 0) {
          for (const request of matchResult.requests) {
            await sendToTraveller(
              request.traveller_id,
              "New Parcel Available",
              `A new parcel is available for delivery from ${result.pickupAddress.city} to ${result.deliveryAddress.city}`,
              {
                parcel_id: result.parcel.id,
                type: "new_parcel_request",
              }
            );
          }
        }
      } catch (error) {
        console.error(`[Parcel] Error triggering matching for parcel ${result.parcel.id}:`, error.message);
      }
    });

    // Return the parcel ID and booking ID to frontend
    return responseSuccess(res, {
      id: result.parcel.id,
      parcel: result.parcel,
      suggestedPrice: result.suggestedPrice,
      pickupAddress: result.pickupAddress,
      deliveryAddress: result.deliveryAddress
    }, "Parcel request created successfully");
  } catch (error) {
    console.error("Parcel creation error:", error.message);
    console.error("Stack trace:", error.stack);
    console.error("Full error:", error);
    return responseError(res, error.message || "Parcel request failed");
  }
};


export const getUserRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await getUserParcelRequests(userId);

    return responseSuccess(
      res,
      result,
      "Parcel requests fetched successfully"
    );
  } catch (error) {
    console.error("Get parcel error:", error);
    return responseError(res, error.message || "Failed to fetch parcels");
  }
};

// Controller to get a single parcel by ID
export const getParcelById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await getServiceParcelById(id);

    if (!result) {
      return responseError(res, "Parcel not found", 404);
    }

    return responseSuccess(
      res,
      result,
      "Parcel fetched successfully"
    );
  } catch (error) {
    console.error("Get parcel error:", error);
    return responseError(res, error.message || "Failed to fetch parcel");
  }
};


// Update parcel form step
export const updateParcelStep = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const stepData = req.body;

    // First verify the parcel belongs to the user
    const parcel = await getServiceParcelById(id);
    
    if (!parcel) {
      return responseError(res, "Parcel not found", 404);
    }

    if (parcel.user_id !== userId) {
      return responseError(res, "Unauthorized", 403);
    }

    // Import the service function
    const { updateParcelStep: updateStep } = await import("./parcel.service.js");
    const updatedParcel = await updateStep(id, stepData, req); // Pass req for WebSocket access

    return responseSuccess(
      res,
      updatedParcel,
      "Parcel step updated successfully"
    );
  } catch (error) {
    console.error("Update parcel step error:", error);
    return responseError(res, error.message || "Failed to update parcel step");
  }
};

// Cancel parcel (User cancels their own parcel)
export const cancelParcel = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { reason = "other", details = "" } = req.body;

    // Import the service function
    const { cancelParcelRequest } = await import("./parcel.service.js");
    const result = await cancelParcelRequest(id, userId, { reason, details }, req);

    return responseSuccess(
      res,
      result,
      "Parcel cancelled successfully"
    );
  } catch (error) {
    console.error("Cancel parcel error:", error);
    return responseError(res, error.message || "Failed to cancel parcel", 400);
  }
};
