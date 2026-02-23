import sequelize from "../../config/database.config.js";
import Booking from "./booking.model.js";
import BookingStatusLog from "./bookingStatusLog.model.js";
import { BOOKING_STATUS, BOOKING_TRANSITIONS } from "../../middlewares/role.middleware.js";

export async function updateBookingStatus(bookingId, newStatus, userId, extraData = {}) {

  return await sequelize.transaction(async (t) => {
    const booking = await Booking.findByPk(bookingId, { transaction: t });

    if (!booking) throw new Error("Booking not found");

    const currentStatus = booking.status;

    const allowedTransitions = BOOKING_TRANSITIONS[currentStatus] || [];

    if (!allowedTransitions.includes(newStatus)) {
      throw new Error(`Cannot change status from ${currentStatus} to ${newStatus}`);

    }

    if (newStatus === BOOKING_STATUS.CONFIRMED) {
      booking.traveller_id = extraData.travellerId;
      booking.trip_id = extraData.tripId;
    }

    //update status

    booking.status = newStatus;

    await booking.save({ transaction: t });

    //log status change

    await BookingStatusLog.create({
      booking_id: booking.id,
      status: newStatus,
      changed_by: userId,
    },
      { transaction: t }
    );

    return booking;



  })

}