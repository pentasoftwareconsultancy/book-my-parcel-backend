import express from "express";

const router = express.Router();

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

export default router;
