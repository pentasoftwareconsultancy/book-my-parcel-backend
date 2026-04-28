// CONTROLLER FILE
// Controllers are the bridge between HTTP and your business logic.
// They receive req/res from Express, extract what the service needs,
// call the service, and send back the HTTP response.
// They should contain NO business logic — just input/output handling.

import { submitFeedback, getFeedbackByBooking, getTravellerFeedback, updateFeedback } from "./feedback.service.js";
import { responseSuccess, responseError } from "../../utils/response.util.js";
// responseSuccess / responseError are shared helpers that format all API
// responses consistently: { success: true, data: ..., message: ... }

// ─── POST /feedback/submit ────────────────────────────────────────────────────
export async function submitFeedbackController(req, res) {
  try {
    // req.user is set by authMiddleware after verifying the JWT token.
    // We use req.user.id (not req.body.reviewer_id) so the client can't
    // spoof who is submitting the feedback.
    const userId = req.user.id;

    const feedback = await submitFeedback(userId, req.body);

    // 201 Created — the correct HTTP status when a new resource is created
    return responseSuccess(res, feedback, "Feedback submitted successfully", 201);
  } catch (error) {
    // Map known business-rule errors to 400 Bad Request
    // Unknown errors fall through to 500 Internal Server Error
    const status =
      error.message.includes("Unauthorized") ? 403 :
      error.message.includes("not found")    ? 404 :
      error.message.includes("already")      ? 409 : // 409 Conflict = duplicate resource
      error.message.includes("only be submitted") ? 400 : 500;

    return responseError(res, error.message, status);
  }
}

// ─── GET /feedback/booking/:bookingId ─────────────────────────────────────────
// Frontend calls this to check if feedback was already submitted,
// so it can show "Feedback Given" instead of the "Rate" button.
export async function getBookingFeedbackController(req, res) {
  try {
    const feedback = await getFeedbackByBooking(req.params.bookingId);
    return responseSuccess(res, feedback, "OK");
  } catch (error) {
    return responseError(res, error.message, 500);
  }
}

// ─── GET /feedback/traveller/:travellerId ─────────────────────────────────────
export async function getTravellerFeedbackController(req, res) {
  try {
    const feedbacks = await getTravellerFeedback(req.params.travellerId);
    return responseSuccess(res, feedbacks, "OK");
  } catch (error) {
    return responseError(res, error.message, 500);
  }
}

// ─── PUT /feedback/booking/:bookingId ─────────────────────────────────────────
export async function updateFeedbackController(req, res) {
  try {
    const feedback = await updateFeedback(req.user.id, req.params.bookingId, req.body);
    return responseSuccess(res, feedback, "Feedback updated successfully");
  } catch (error) {
    const status =
      error.message.includes("Unauthorized") ? 403 :
      error.message.includes("not found")    ? 404 : 500;
    return responseError(res, error.message, status);
  }
}
