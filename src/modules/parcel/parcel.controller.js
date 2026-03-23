import { createParcelRequest } from "./parcel.service.js";
import { responseSuccess, responseError } from "../../utils/response.util.js";
import { getUserParcelRequests, getParcelById as getServiceParcelById } from "./parcel.service.js";

export const createParcel = async (req, res) => {
  try {
    const userId = req.user.id; // from auth
    const parcelData = { ...req.body, user_id: userId };

    const result = await createParcelRequest(parcelData, req.files);

    // Return the parcel ID and booking ID to frontend
    return responseSuccess(res, "Parcel request created successfully", {
      id: result.parcel.id,
      // bookingId: result.booking.id,
      parcel: result.parcel,
      booking: result.booking,
      pickupAddress: result.pickupAddress,
      deliveryAddress: result.deliveryAddress
    });
  } catch (error) {
    console.error("Parcel creation error:", error);
    return responseError(res, error.message || "Parcel request failed");
  }
};


export const getUserRequests = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log("🔥 Fetching orders for userId:", userId); // ← ADD THIS
    
    const result = await getUserParcelRequests(userId);
    console.log("🔥 Found parcels:", result.length);       // ← ADD THIS
    
    return responseSuccess(res, "Parcel requests fetched successfully", result);
  } catch (error) {
    console.error("Get parcel error:", error);
    return responseError(res, error.message || "Failed to fetch parcels");
  }
};

// Controller to get a single parcel by ID
export const getParcelById = async (req, res) => {
  try {
    const { id } = req.params;
    console.log("Fetching parcel with ID:", id);
    const result = await getServiceParcelById(id);
    console.log("Parcel fetched:", result);

    if (!result) {
      return responseError(res, "Parcel not found", 404);
    }
    console.log("Parcel details:", result);

    return responseSuccess(
      res,
      "Parcel fetched successfully",
      result
    );
  } catch (error) {
    console.error("Get parcel error:", error);
    return responseError(res, error.message || "Failed to fetch parcel");
  }
};
