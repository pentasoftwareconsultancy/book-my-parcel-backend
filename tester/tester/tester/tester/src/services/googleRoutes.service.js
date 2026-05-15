// modules/tracking/googleRoutes.service.js
import axios from "axios";

const VEHICLE_MAP = {
  bike:  "TWO_WHEELER",
  car:   "DRIVE",
  truck: "DRIVE",
  walk:  "WALK",
};

export async function fetchRouteFromGoogle(pickupLat, pickupLng, deliveryLat, deliveryLng, vehicleType = "bike") {
  const travelMode = VEHICLE_MAP[vehicleType] || "TWO_WHEELER";

  const response = await axios.post(
    "https://routes.googleapis.com/directions/v2:computeRoutes", // ← correct Routes API URL
    {
      origin:      { location: { latLng: { latitude: pickupLat,   longitude: pickupLng   } } },
      destination: { location: { latLng: { latitude: deliveryLat, longitude: deliveryLng } } },
      travelMode,
      polylineQuality: "HIGH_QUALITY",
      computeAlternativeRoutes: false,
      units: "METRIC",
    },
    {
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": process.env.GOOGLE_ROUTES_API, // ← process.env, matches .env exactly
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
      },
    }
  );

  const route = response.data.routes?.[0];
  if (!route) throw new Error("No route returned from Google Routes API");

  return {
    encodedPolyline: route.polyline.encodedPolyline,
    distanceMeters:  route.distanceMeters,
    durationSeconds: parseInt(route.duration),
  };
}