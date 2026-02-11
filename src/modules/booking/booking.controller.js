import { createSendParcel } from "./booking.service.js";

export const sendParcel = async (req, res) => {
  try {
    const userId = req.user.id; // from auth middleware
    const result = await createSendParcel(userId, req.body);

    res.status(201).json({
      success: true,
      message: "Parcel booked successfully",
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
