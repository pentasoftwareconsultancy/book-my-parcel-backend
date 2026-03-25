import bookingService from "./booking.service.js";
import { responseSuccess, responseError } from "../../utils/response.util.js";

class BookingController {
  // POST /api/booking/:bookingId/start-pickup
  async startPickup(req, res) {
    try {
      const { bookingId } = req.params;
      const travellerId = req.user.id;

      const result = await bookingService.startPickup(bookingId, travellerId);

      return responseSuccess(res, result, "OTP sent to sender successfully");
    } catch (error) {
      console.error("Error in startPickup:", error);
      return responseError(res, error.message, 400);
    }
  }

  // POST /api/booking/:bookingId/verify-pickup
  async verifyPickup(req, res) {
    try {
      const { bookingId } = req.params;
      const { otp } = req.body;
      const travellerId = req.user.id;

      const result = await bookingService.verifyPickup(bookingId, travellerId, otp);

      return responseSuccess(res, result, "Pickup verified successfully");
    } catch (error) {
      console.error("Error in verifyPickup:", error);
      
      // Handle attempts remaining
      if (error.attemptsRemaining !== undefined) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INVALID_OTP",
            message: error.message,
            attempts_remaining: error.attemptsRemaining,
          },
        });
      }

      return responseError(res, error.message, 400);
    }
  }

  // POST /api/booking/:bookingId/start-delivery
  async startDelivery(req, res) {
    try {
      const { bookingId } = req.params;
      const travellerId = req.user.id;

      const result = await bookingService.startDelivery(bookingId, travellerId);

      return responseSuccess(res, result, "OTP sent to recipient successfully");
    } catch (error) {
      console.error("Error in startDelivery:", error);
      return responseError(res, error.message, 400);
    }
  }

  // POST /api/booking/:bookingId/verify-delivery
  async verifyDelivery(req, res) {
    try {
      const { bookingId } = req.params;
      const { otp } = req.body;
      const travellerId = req.user.id;

      const result = await bookingService.verifyDelivery(bookingId, travellerId, otp);

      return responseSuccess(res, result, "Delivery completed successfully");
    } catch (error) {
      console.error("Error in verifyDelivery:", error);
      
      // Handle attempts remaining
      if (error.attemptsRemaining !== undefined) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INVALID_OTP",
            message: error.message,
            attempts_remaining: error.attemptsRemaining,
          },
        });
      }

      return responseError(res, error.message, 400);
    }
  }
}

export default new BookingController();
