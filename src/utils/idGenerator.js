// src/utils/idGenerator.js

import { Op } from "sequelize";
import Booking from "../modules/booking/booking.model.js";
import Parcel from "../modules/parcel/parcel.model.js";

// ─── Helper: get next serial number ──────────────────────────────────────────
async function getNextSerial(Model, field, prefix) {
  // Get the highest existing serial number
  const records = await Model.findAll({
    where: {
      [field]: { [Op.like]: `${prefix}%` },
    },
    attributes: [field],
    order: [[field, "DESC"]],
    limit: 100, // Get top 100 to find the highest number
  });

  let maxSerial = 0;
  for (const record of records) {
    if (record[field]) {
      const serialStr = record[field].slice(prefix.length);
      const serial = parseInt(serialStr, 10);
      if (!isNaN(serial) && serial > maxSerial) {
        maxSerial = serial;
      }
    }
  }

  return String(maxSerial + 1).padStart(4, "0");
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