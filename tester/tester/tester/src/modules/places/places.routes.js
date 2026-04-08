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
    return res.json({ predictions: [] });
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${key}&components=country:in&types=geocode&language=en`;
    const response = await fetch(url);
    const data = await response.json();

    return res.json({ predictions: data.predictions || [] });
  } catch (err) {
    console.error("[Places proxy] Error:", err.message);
    return res.json({ predictions: [] });
  }
});

// GET /api/places/geocode?address=<address>
// Proxies to Google Geocoding API (server-side, no CORS issues)
router.get("/geocode", async (req, res) => {
  const { address } = req.query;

  if (!address || address.trim().length < 3) {
    return res.status(400).json({ error: "Address is required" });
  }

  try {
    const result = await geocodeAddress(address);
    return res.json(result);
  } catch (err) {
    console.error("[Geocoding proxy] Error:", err.message);
    return res.status(500).json({ error: "Geocoding failed" });
  }
});

export default router;
