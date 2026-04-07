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
    console.log("[Places] Autocomplete called with empty input");
    return res.json({ predictions: [] });
  }

  const key = process.env.GOOGLE_API_KEY;
  
  if (!key) {
    console.error("[Places] ❌ GOOGLE_API_KEY not set in .env");
    return res.status(500).json({ 
      error: "Google API Key not configured",
      predictions: [] 
    });
  }

  if (key === "your_google_api_key_here") {
    console.error("[Places] ❌ GOOGLE_API_KEY is still the default placeholder");
    return res.status(500).json({ 
      error: "Google API Key not configured properly",
      predictions: [] 
    });
  }

  try {
    console.log(`[Places] Autocomplete request for: "${input}"`);
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${key}&components=country:in&types=geocode&language=en`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      console.error(`[Places] ❌ Google API returned status ${response.status}:`, data);
      return res.status(response.status).json({ 
        error: data.error_message || "Google API error",
        predictions: [] 
      });
    }

    const predictions = data.predictions || [];
    console.log(`[Places] ✅ Got ${predictions.length} predictions from Google`);
    return res.json({ predictions });
  } catch (err) {
    console.error("[Places proxy] ❌ Error:", err.message);
    return res.status(500).json({ 
      error: "Failed to fetch suggestions",
      predictions: [] 
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

  try {
    const result = await geocodeAddress(address);
    return res.json(result);
  } catch (err) {
    console.error("[Geocoding proxy] Error:", err.message);
    return res.status(500).json({ error: "Geocoding failed" });
  }
});

export default router;
