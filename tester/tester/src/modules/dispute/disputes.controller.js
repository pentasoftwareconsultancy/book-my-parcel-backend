import { createDisputeService, getMyDisputesService } from "./disputes.service.js";
import { responseSuccess, responseError } from "../../utils/response.util.js";

// POST /api/dispute
export async function createDispute(req, res) {
  try {
    const { booking_id, dispute_type, description } = req.body;

    if (!booking_id || !dispute_type) {
      return responseError(res, "booking_id and dispute_type are required", 400);
    }

    const dispute = await createDisputeService({
      booking_id,
      dispute_type,
      description,
      user: req.user, // injected by authMiddleware — has id and activeRole
    });

    return responseSuccess(res, dispute, "Dispute raised successfully", 201);
  } catch (err) {
    const status =
      err.message.includes("not found")    ? 404 :
      err.message.includes("already")      ? 409 :
      err.message.includes("only be raised") ? 400 : 500;
    return responseError(res, err.message, status);
  }
}

// GET /api/dispute/my
export async function getMyDisputes(req, res) {
  try {
    const disputes = await getMyDisputesService(req.user.id);
    return responseSuccess(res, disputes, "Disputes fetched successfully");
  } catch (err) {
    return responseError(res, err.message, 500);
  }
}
