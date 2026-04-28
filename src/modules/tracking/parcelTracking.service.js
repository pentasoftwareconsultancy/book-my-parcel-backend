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
  let tracking = await ParcelTracking.findOne({ where: { booking_id } });

  if (!tracking) {
    // Pull real pickup/delivery coords from the booking's parcel addresses
    const { default: Booking } = await import("../booking/booking.model.js");
    const { default: Parcel }  = await import("../parcel/parcel.model.js");
    const { default: Address } = await import("../parcel/address.model.js");

    const booking = await Booking.findByPk(booking_id, {
      include: [{
        model: Parcel,
        as: "parcel",
        include: [
          { model: Address, as: "pickupAddress" },
          { model: Address, as: "deliveryAddress" },
        ],
      }],
    });

    const pickupLat  = Number(booking?.parcel?.pickupAddress?.latitude)  || lat;
    const pickupLng  = Number(booking?.parcel?.pickupAddress?.longitude) || lng;
    const deliveryLat = Number(booking?.parcel?.deliveryAddress?.latitude)  || lat;
    const deliveryLng = Number(booking?.parcel?.deliveryAddress?.longitude) || lng;

    tracking = await ParcelTracking.create({
      booking_id,
      pickup_lat:   pickupLat,
      pickup_lng:   pickupLng,
      delivery_lat: deliveryLat,
      delivery_lng: deliveryLng,
      traveller_lat: lat,
      traveller_lng: lng,
      speed,
      heading,
      status: "in_transit",
    });
    console.log(`[Tracking] Auto-created tracking record for booking ${booking_id}`);
    return tracking;
  }

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

/* ─────────────────────────────────────────────────────────────
   5. CALCULATE ETA
   Uses remaining distance (straight-line from traveller to
   delivery) and average speed to estimate arrival time.
   Falls back to stored duration_seconds if no live location.
───────────────────────────────────────────────────────────── */
export function calculateETA(tracking) {
  try {
    const deliveryLat = Number(tracking.delivery_lat);
    const deliveryLng = Number(tracking.delivery_lng);
    const travellerLat = Number(tracking.traveller_lat);
    const travellerLng = Number(tracking.traveller_lng);

    // No live location yet — use stored route duration
    if (!travellerLat || !travellerLng) {
      if (tracking.duration_seconds) {
        const etaMs = Date.now() + tracking.duration_seconds * 1000;
        return {
          eta_minutes: Math.round(tracking.duration_seconds / 60),
          eta_timestamp: new Date(etaMs).toISOString(),
          source: "route_duration",
        };
      }
      return null;
    }

    // Haversine distance in km from traveller to delivery
    const R = 6371;
    const dLat = ((deliveryLat - travellerLat) * Math.PI) / 180;
    const dLng = ((deliveryLng - travellerLng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((travellerLat * Math.PI) / 180) *
        Math.cos((deliveryLat * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    const remainingKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    // Use live speed if available, otherwise assume 30 km/h average
    const speedKmh = tracking.speed > 2 ? tracking.speed * 3.6 : 30; // speed stored in m/s
    const etaMinutes = Math.round((remainingKm / speedKmh) * 60);
    const etaMs = Date.now() + etaMinutes * 60 * 1000;

    return {
      eta_minutes: etaMinutes,
      eta_timestamp: new Date(etaMs).toISOString(),
      remaining_km: Math.round(remainingKm * 10) / 10,
      source: "live_location",
    };
  } catch {
    return null;
  }
}

/* ─────────────────────────────────────────────────────────────
   6. UPLOAD PROOF OF DELIVERY / PICKUP
   Saves the uploaded photo URL to parcel_proofs table.
───────────────────────────────────────────────────────────── */
export async function saveProofPhoto(booking_id, type, imageUrl) {
  const { default: ParcelProof } = await import("../parcel/parcelProof.model.js");

  const proof = await ParcelProof.create({
    booking_id,
    type,       // "PICKUP" | "DELIVERY"
    image_url: imageUrl,
  });

  console.log(`[Tracking] Proof saved: ${type} for booking ${booking_id} → ${imageUrl}`);
  return proof;
}
