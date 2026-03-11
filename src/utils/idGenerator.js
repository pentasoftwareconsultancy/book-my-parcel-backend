// src/utils/idGenerator.js

import { Op } from "sequelize";
import Booking from "../modules/booking/booking.model.js";
import Parcel from "../modules/parcel/parcel.model.js";

// ─── Helper: get next serial number ──────────────────────────────────────────
async function getNextSerial(Model, field, prefix) {
  const lastRecord = await Model.findOne({
    where: {
      [field]: { [Op.like]: `${prefix}%` },
    },
    order: [["createdAt", "DESC"]],
  });

  let next = 1;
  if (lastRecord?.[field]) {
    const last = parseInt(lastRecord[field].slice(-4), 10);
    if (!isNaN(last)) next = last + 1;
  }
  return String(next).padStart(4, "0");
}

// ─── Parcel ID → BMP-PRC-0001 ────────────────────────────────────────────────
export async function generateParcelId() {
  const serial = await getNextSerial(Parcel, "parcel_ref", "BMP-PRC-");
  return `BMP-PRC-${serial}`;
}

// ─── Booking ID → IND091-0001 ────────────────────────────────────────────────
export async function generateBookingId() {
  const serial = await getNextSerial(Booking, "booking_ref", "IND091-");
  return `IND091-${serial}`;
}

// ─── Tracking ID → UBG-0001 ──────────────────────────────────────────────────
export async function generateTrackingId() {
  const serial = await getNextSerial(Booking, "tracking_ref", "UBG-");
  return `UBG-${serial}`;
}

// ─── Delivery ID → DEL-0001 ──────────────────────────────────────────────────
export async function generateDeliveryId() {
  const serial = await getNextSerial(Booking, "delivery_ref", "DEL-");
  return `DEL-${serial}`;
}