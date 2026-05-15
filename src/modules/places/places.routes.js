import express from "express";
import { geocodeAddress } from "../../services/googleMaps.service.js";
import { generalLimiter } from "../../middlewares/rateLimit.middleware.js";

const router = express.Router();

// Apply rate limiting to all places routes (public endpoints)
router.use(generalLimiter);

// GET /api/places/autocomplete?input=<text>
// Proxies to Google Places Autocomplete (server-side, no CORS issues)
router.get("/autocomplete", async (req, res) => {
  const { input } = req.query;

  if (!input || input.trim().length < 2) {
    return res.json({ predictions: [] });
  }

  const key = process.env.GOOGLE_API_KEY;
  if (!key || key === "your_google_api_key_here") {
    return res.json({
      predictions: [],
      status: "REQUEST_DENIED",
      error_message: "GOOGLE_API_KEY is missing or placeholder.",
    });
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${key}&components=country:in&types=geocode&language=en`;
    const response = await fetch(url);
    const data = await response.json();

    return res.json({
      predictions: data.predictions || [],
      status: data.status || "UNKNOWN_ERROR",
      error_message: data.error_message || undefined,
    });
  } catch (err) {
    console.error("[Places proxy] Error:", err.message);
    return res.json({
      predictions: [],
      status: "UNKNOWN_ERROR",
      error_message: err.message,
    });
  }
});

// GET /api/places/geocode?address=<address>
// Proxies to Google Geocoding API (server-side, no CORS issues)
router.get("/geocode", async (req, res) => {
  const { address } = req.query;

  if (!address || address.trim().length < 3) {
    return res.status(400).json({ error: "Address is required" });
  }

  const key = process.env.GOOGLE_API_KEY;
  if (!key || key === "your_google_api_key_here") {
    return res.json({
      status: "REQUEST_DENIED",
      results: [],
      error_message: "GOOGLE_API_KEY is missing or placeholder.",
    });
  }

  try {
    const result = await geocodeAddress(address);
    return res.json(result);
  } catch (err) {
    console.error("[Geocoding proxy] Error:", err.message);
    return res.json({
      status: "UNKNOWN_ERROR",
      results: [],
      error_message: err.message,
    });
  }
});

// GET /api/places/maps-key
// Returns the Maps JS API key for frontend map rendering (server-controlled)
router.get("/maps-key", (req, res) => {
  const key = process.env.GOOGLE_API_KEY;
  if (!key || key === "your_google_api_key_here") {
    return res.status(503).json({ success: false, error: "Maps API key not configured" });
  }
  return res.json({ success: true, key });
});

// POST /api/places/directions
// Proxies a directions request to Google Routes API (server-side, keeps API key off client)
// Body: { origin: { lat, lng }, destination: { lat, lng }, travelMode?: "DRIVE"|"TWO_WHEELER"|"WALK" }
router.post("/directions", async (req, res) => {
  const { origin, destination, travelMode = "DRIVE" } = req.body;

  if (!origin?.lat || !origin?.lng || !destination?.lat || !destination?.lng) {
    return res.status(400).json({ success: false, error: "origin and destination {lat, lng} are required" });
  }

  try {
    const { computeRoute } = await import("../../services/googleMaps.service.js");
    const data = await computeRoute(
      { lat: Number(origin.lat), lng: Number(origin.lng) },
      { lat: Number(destination.lat), lng: Number(destination.lng) },
      travelMode
    );

    const route = data.routes?.[0];
    if (!route) {
      return res.status(404).json({ success: false, error: "No route found" });
    }

    return res.json({
      success: true,
      encodedPolyline: route.polyline?.encodedPolyline || null,
      distanceMeters: route.distanceMeters || null,
      durationSeconds: route.duration ? parseInt(route.duration) : null,
    });
  } catch (err) {
    console.error("[Directions proxy] Error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
