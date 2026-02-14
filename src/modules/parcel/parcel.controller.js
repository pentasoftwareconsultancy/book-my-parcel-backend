import { createParcelRequest } from "./parcel.service.js";
import { responseSuccess, responseError } from "../../utils/response.util.js";
import { getUserParcelRequests } from "./parcel.service.js";

export const createParcel = async (req, res) => {
  try {
    const userId = req.user.id; // from auth
    const parcelData = { ...req.body, user_id: userId };

    const result = await createParcelRequest(parcelData, req.files);

    return responseSuccess(res, "Parcel request created successfully", result);
  } catch (error) {
    console.error("Parcel creation error:", error);
    return responseError(res, error.message || "Parcel request failed");
  }
};



export const getUserRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await getUserParcelRequests(userId);

    return responseSuccess(
      res,
      "Parcel requests fetched successfully",
      result
    );
  } catch (error) {
    console.error("Get parcel error:", error);
    return responseError(res, error.message || "Failed to fetch parcels");
  }
};
