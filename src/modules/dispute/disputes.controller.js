import { createDisputeService, getMyDisputesService, getDisputesAgainstMeService, getUserDisputesAgainstMeService, resolveDisputeService, updateDisputeStatusService } from "./disputes.service.js";
import { responseSuccess, responseError } from "../../utils/response.util.js";

// POST /api/dispute
export async function createDispute(req, res) {
  try {
    const { booking_id, dispute_type, description, role } = req.body;

    if (!booking_id || !dispute_type) {
      return responseError(res, "booking_id and dispute_type are required", 400);
    }

    const dispute = await createDisputeService({
      booking_id,
      dispute_type,
      description,
      role: role || undefined,  // ✅ Allow frontend to specify role
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
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    const disputes = await getMyDisputesService(req.user.id, {
      page,
      limit,
    });

    return responseSuccess(res, disputes, "Disputes fetched successfully");
  } catch (err) {
    return responseError(res, err.message, 500);
  }
}

// GET /api/dispute/against-me (for Travellers)
export async function getDisputesAgainstMe(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    const disputes = await getDisputesAgainstMeService(req.user.id, {
      page,
      limit,
    });

    return responseSuccess(res, disputes, "Disputes against you fetched successfully");
  } catch (err) {
    return responseError(res, err.message, 500);
  }
}

// GET /api/user/disputes/against-me (for Users — disputes raised by travellers)
export async function getUserDisputesAgainstMe(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    const disputes = await getUserDisputesAgainstMeService(req.user.id, {
      page,
      limit,
    });

    return responseSuccess(res, disputes, "Traveller disputes fetched successfully");
  } catch (err) {
    return responseError(res, err.message, 500);
  }
}

// PATCH /api/admin/disputes/:id/resolve  (admin only — wired via admin.routes.js)
export async function resolveDispute(req, res) {
  try {
    const { id: disputeId } = req.params;
    const { resolution, admin_note } = req.body;

    if (!resolution) {
      return responseError(res, "resolution is required", 400);
    }

    const result = await resolveDisputeService({
      disputeId,
      resolution,
      admin_note: admin_note || "",
      adminId: req.user.id,
    });

    return responseSuccess(res, result, "Dispute resolved successfully");
  } catch (err) {
    const status = err.statusCode || (
      err.message.includes("not found")  ? 404 :
      err.message.includes("already")    ? 409 :
      err.message.includes("Invalid")    ? 400 : 500
    );
    return responseError(res, err.message, status);
  }
}

// PATCH /api/admin/disputes/:id/status  (admin only — move to IN_PROGRESS)
export async function updateDisputeStatus(req, res) {
  try {
    const { id: disputeId } = req.params;
    const { status } = req.body;

    if (!status) {
      return responseError(res, "status is required", 400);
    }

    const result = await updateDisputeStatusService({
      disputeId,
      status,
      adminId: req.user.id,
    });

    return responseSuccess(res, result, "Dispute status updated successfully");
  } catch (err) {
    const code = err.statusCode || (err.message.includes("not found") ? 404 : 500);
    return responseError(res, err.message, code);
  }
}
