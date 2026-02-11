import sequelize from "../../config/database.config.js";
import Address from "../parcel/address.model.js";
import Parcel from "../parcel/parcel.model.js";
import Booking from "./booking.model.js";

export async function createSendParcel(userId, data) {
  return await sequelize.transaction(async (t) => {

    // 1️⃣ Pickup Address
    const pickupAddress = await Address.create(
      {
        user_id: userId,
        type: "PICKUP",
        ...data.pickup,
      },
      { transaction: t }
    );

    // 2️⃣ Delivery Address
    const deliveryAddress = await Address.create(
      {
        user_id: userId,
        type: "DELIVERY",
        ...data.delivery,
      },
      { transaction: t }
    );

    // 3️⃣ Parcel
    const parcel = await Parcel.create(
      {
        user_id: userId,
        ...data.parcel,
        status: "CREATED",
      },
      { transaction: t }
    );

    // 4️⃣ Booking
    const booking = await Booking.create(
      {
        user_id: userId,
        parcel_id: parcel.id,
        pickup_address_id: pickupAddress.id,
        delivery_address_id: deliveryAddress.id,
        amount: data.amount,
        status: "CREATED",
      },
      { transaction: t }
    );

    return {
      booking_id: booking.id,
      parcel_id: parcel.id,
    };
  });
}
