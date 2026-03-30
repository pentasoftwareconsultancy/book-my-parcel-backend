// modules/tracking/parcelTracking.service.js
import ParcelTracking from "./parcelTracking.model.js";
import { fetchRouteFromGoogle } from "../../services/googleRoutes.service.js";

/* ─────────────────────────────────────────────────────────────
   1. INITIATE TRACKING
   Called when traveller accepts parcel after OTP.
   Uses DUMMY pickup/delivery coords for now.
   Calls Google Routes API and stores everything in one row.
───────────────────────────────────────────────────────────── */
export async function initiateTracking(booking_id) {

  const tracking = await ParcelTracking.findOne({
    where: { booking_id },
  });

  if (!tracking) throw new Error("Tracking record not found");

  const routeData = await fetchRouteFromGoogle(
    tracking.pickup_lat,
    tracking.pickup_lng,
    tracking.delivery_lat,
    tracking.delivery_lng,
    tracking.vehicle_type
  );

  await tracking.update({
    encoded_polyline: routeData.encodedPolyline,
    distance_meters: routeData.distanceMeters,
    duration_seconds: routeData.durationSeconds,
    status: "picked_up",
  });

  return tracking;
}

/* ─────────────────────────────────────────────────────────────
   2. UPDATE TRAVELLER LIVE LOCATION
   Called every ~5s from frontend via socket.
   Updates traveller_lat, traveller_lng, speed, heading.
───────────────────────────────────────────────────────────── */
export async function updateTravellerLocation(booking_id, { lat, lng, speed = 0, heading = 0 }) {
  const tracking = await ParcelTracking.findOne({ where: { booking_id } });
  if (!tracking) throw new Error("Tracking record not found for this booking");

  await tracking.update({
    traveller_lat: lat,
    traveller_lng: lng,
    speed,
    heading,
    status: "in_transit",
  });

  return tracking;
}

/* ─────────────────────────────────────────────────────────────
   3. GET TRACKING BY BOOKING ID
   Called once on mount by individual's frontend to get
   the route + current traveller position.
───────────────────────────────────────────────────────────── */
export async function getTrackingByBookingId(booking_id) {

  const tracking = await ParcelTracking.findOne({
    where: { booking_id }
  });

  if (!tracking) {
    throw new Error("No tracking found for this booking");
  }

  // If route already exists → return immediately
  if (tracking.encoded_polyline) {
    return tracking;
  }

  // Otherwise call Google Routes API
  const routeData = await fetchRouteFromGoogle(
    tracking.pickup_lat,
    tracking.pickup_lng,
    tracking.delivery_lat,
    tracking.delivery_lng,
    tracking.vehicle_type
  );

  // Store route in DB
  await tracking.update({
    encoded_polyline: routeData.encodedPolyline,
    distance_meters: routeData.distanceMeters,
    duration_seconds: routeData.durationSeconds
  });

  return tracking;
}

/* ─────────────────────────────────────────────────────────────
   4. COMPLETE DELIVERY
   Marks the tracking row as delivered.
───────────────────────────────────────────────────────────── */
export async function completeDelivery(booking_id) {
  const tracking = await ParcelTracking.findOne({ where: { booking_id } });
  if (!tracking) throw new Error("Tracking record not found");

  await tracking.update({ status: "delivered", speed: 0 });
  return tracking;
}