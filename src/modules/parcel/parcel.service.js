import sequelize from "../../config/database.config.js";
import Parcel from "./parcel.model.js";
import Address from "./address.model.js";
import Booking from "../booking/booking.model.js";
import { uploadFiles } from "../../utils/fileUpload.util.js";
import { BOOKING_STATUS, BOOKING_TRANSITIONS } from "../../utils/constants.js";
import { generateParcelId } from "../../utils/idGenerator.js"; // ✅ only parcel ID

const weightMap = { small: 1, medium: 5, large: 10, extra_large: 20 };

export async function createParcelRequest(data, files) {
  const t = await sequelize.transaction();
  try {
    if (!data.weight) data.weight = weightMap[data.package_size] || 1;

    const photoPaths = files?.length ? await uploadFiles(files) : [];

    // ✅ Only parcel ID generated here
    const parcel_ref = await generateParcelId();

    const pickupAddress = await Address.create({
      ...data.pickup_address,
      type: "pickup",
      user_id: data.user_id,
    }, { transaction: t });

    const deliveryAddress = await Address.create({
      ...data.delivery_address,
      type: "delivery",
      user_id: data.user_id,
    }, { transaction: t });

    const parcel = await Parcel.create({
      user_id:             data.user_id,
      parcel_ref,          // ✅ BMP-PRC-0001
      package_size:        data.package_size,
      delivery_speed:      data.delivery_speed,
      weight:              data.weight,
      length:              data.length,
      width:               data.width,
      height:              data.height,
      description:         data.description,
      parcel_type:         data.parcel_type,
      value:               data.value,
      notes:               data.notes,
      photos:              photoPaths,
      pickup_address_id:   pickupAddress.id,
      delivery_address_id: deliveryAddress.id,
      selected_partner_id: data.selected_partner_id || null,
      price_quote:         data.price_quote || null,
      status:              BOOKING_STATUS.CREATED,
    }, { transaction: t });

    // ✅ NO booking here — booking created when traveler accepts

    await t.commit();
    return { parcel, pickupAddress, deliveryAddress };

  } catch (error) {
    await t.rollback();
    throw error;
  }
}

export async function getUserParcelRequests(userId) {
  const parcels = await Parcel.findAll({
    where: { user_id: userId },
    include: [
      { model: Address, as: "pickupAddress" },
      { model: Address, as: "deliveryAddress" },
      { model: Booking, as: "booking" },
    ],
    order: [["createdAt", "DESC"]],
  });
  return parcels;
}

export async function getParcelById(parcelId) {
  const parcel = await Parcel.findOne({
    where: { id: parcelId },
    include: [
      { model: Address, as: "pickupAddress" },
      { model: Address, as: "deliveryAddress" },
      { model: Booking, as: "booking" },
    ],
  });
  return parcel;
}