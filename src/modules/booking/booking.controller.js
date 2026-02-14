import { updateBookingStatus } from "./booking.service.js";

export async function updateBookingStatusController(req, res) {
  try {
    // 1️⃣ Get booking ID from URL
    const { bookingId } = req.params;

    // 2️⃣ Get new status from body
    const { status, travellerId, tripId } = req.body;

    // 3️⃣ Logged-in user (who is changing status)
    const userId = req.user.id;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }

    // 4️⃣ Call Service
    const updatedBooking = await updateBookingStatus(
      bookingId,
      status,
      userId,
      { travellerId, tripId }   // extra data
    );

    // 5️⃣ Success response
    return res.status(200).json({
      success: true,
      message: "Booking status updated successfully",
      data: updatedBooking,
    });

  } catch (error) {
    console.error("Update Booking Status Error:", error);

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}
