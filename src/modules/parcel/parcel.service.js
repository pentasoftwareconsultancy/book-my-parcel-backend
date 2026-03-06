import sequelize from "../../config/database.config.js";
import Parcel from "./parcel.model.js";
import Address from "./address.model.js";
import Booking from "../booking/booking.model.js";
import { uploadFiles } from "../../utils/fileUpload.util.js";
import { BOOKING_STATUS ,BOOKING_TRANSITIONS} from "../../utils/constants.js";

// Map package size to weight (example)
const weightMap = { small: 1, medium: 5, large: 10, extra_large: 20 };

export async function createParcelRequest(data, files) {
  const t = await sequelize.transaction();
  try {
    // Calculate weight if not provided
    if (!data.weight) data.weight = weightMap[data.package_size] || 1;

    // Upload photos
    const photoPaths = files?.length ? await uploadFiles(files) : [];

    // Create pickup address
    const pickupAddress = await Address.create(
      {
        ...data.pickup_address,
        type: "pickup",
        user_id: data.user_id,
      },
      { transaction: t }
    );

    // Create delivery address
    const deliveryAddress = await Address.create(
      {
        ...data.delivery_address,
        type: "delivery",
        user_id: data.user_id,
      },
      { transaction: t }
    );

    // Create parcel
    const parcel = await Parcel.create(
      {
        user_id: data.user_id,
        package_size: data.package_size,
        delivery_speed: data.delivery_speed,
        weight: data.weight,
        length: data.length,
        width: data.width,
        height: data.height,
        description: data.description,
        parcel_type: data.parcel_type,
        value: data.value,
        notes: data.notes,
        photos: photoPaths,
        pickup_address_id: pickupAddress.id,
        delivery_address_id: deliveryAddress.id,
        selected_partner_id: data.selected_partner_id || null,
        price_quote: data.price_quote || null,
        status: BOOKING_STATUS.CREATED,
      },
      { transaction: t }
    );

    // Create corresponding booking
    const booking = await Booking.create(
      {
        parcel_id: parcel.id,
        status: BOOKING_STATUS.CREATED,
      },
      { transaction: t }
    );

    await t.commit();
    return { parcel, booking, pickupAddress, deliveryAddress };
  } catch (error) {
    await t.rollback();
    throw error;
  }
}


export async function getUserParcelRequests(userId) {
  const parcels = await Parcel.findAll({
    where: { user_id: userId },
    include: [
      {
        model: Address,
        as: "pickupAddress",
      },
      {
        model: Address,
        as: "deliveryAddress",
      },
      {
        model: Booking, // Include booking data
        as: "booking",
      },
    ],
    order: [["createdAt", "DESC"]],
  });

  return parcels;
}

// New function to get a single parcel by ID
export async function getParcelById(parcelId) {
  const parcel = await Parcel.findOne({
    where: { id: parcelId },
    include: [
      {
        model: Address,
        as: "pickupAddress",
      },
      {
        model: Address,
        as: "deliveryAddress",
      },
      {
        model: Booking, // Include booking data
        as: "booking",
      },
    ],
  });

  return parcel;
}
