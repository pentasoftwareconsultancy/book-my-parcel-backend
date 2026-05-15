import axios from "axios";
import dotenv from "dotenv";
import { getOrCache } from "../utils/cache.util.js";

dotenv.config();

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_ADDRESS_VALIDATION_API_KEY = process.env.GOOGLE_ADDRESS_VALIDATION_API_KEY || GOOGLE_API_KEY;

// Cache TTLs
const GEOCODE_TTL    = 60 * 60 * 24 * 7; // 7 days — addresses don't change
const PLACE_TTL      = 60 * 60 * 24;     // 24 hours — place details are stable
const ROUTE_TTL      = 60 * 60 * 6;      // 6 hours — routes change with road conditions

// ─── Address Validation API (India ML) ────────────────────────────────────────
export async function validateAddress(addressLine) {
  const apiKey = GOOGLE_ADDRESS_VALIDATION_API_KEY;
  const url = `https://addressvalidation.googleapis.com/v1:validateAddress?key=${apiKey}`;
  
  const payload = {
    address: {
      regionCode: "IN",
      addressLines: [addressLine]
    }
  };
  
  const response = await axios.post(url, payload);
  return response.data;
}

// ─── Geocoding API ────────────────────────────────────────────────────────────
export async function geocodeAddress(addressString) {
  if (!GOOGLE_API_KEY || GOOGLE_API_KEY === "your_google_api_key_here") {
    return {
      status: "REQUEST_DENIED",
      results: [],
      error_message: "GOOGLE_API_KEY is missing or placeholder.",
    };
  }

  // Normalise the key so minor whitespace differences don't cause cache misses
  const cacheKey = `geocode:${addressString.trim().toLowerCase().replace(/\s+/g, " ")}`;

  return getOrCache(cacheKey, async () => {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      addressString
    )}&region=IN&key=${GOOGLE_API_KEY}`;
    const response = await axios.get(url);
    if (response.data.status !== "OK" && response.data.status !== "ZERO_RESULTS") {
      console.warn(`[Geocoding] API returned status: ${response.data.status} for "${addressString}"`);
      return {
        status: response.data.status,
        results: [],
        error_message: response.data.error_message,
      };
    }
    return response.data;
  }, GEOCODE_TTL);
}

// Helper to extract global plus code from geocode response (if needed)
export function extractPlusCode(geocodeData) {
  return geocodeData.plus_code?.global_code || null;
}

// ─── Reverse Geocoding with Address Descriptors ───────────────────────────────
export async function getAddressDescriptors(lat, lng) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_API_KEY}&extra_computations=ADDRESS_DESCRIPTORS`;
  const response = await axios.get(url);
  return response.data;
}

// ─── Places API (New) – Place Details with containingPlaces ──────────────────
export async function getPlaceDetails(placeId) {
  const cacheKey = `place:${placeId}`;

  return getOrCache(cacheKey, async () => {
    const url = `https://places.googleapis.com/v1/places/${placeId}`;
    const response = await axios.get(url, {
      params: { key: GOOGLE_API_KEY },
      headers: {
        "X-Goog-FieldMask":
          "id,displayName,formattedAddress,addressComponents,containingPlaces,plusCode",
      },
    });
    return response.data;
  }, PLACE_TTL);
}

// ─── Routes API (Essentials) ─────────────────────────────────────────────────
export async function computeRoute(originLatLng, destLatLng, travelMode = "DRIVE") {
  // Round coordinates to 4 decimal places (~11m precision) so nearby points
  // share a cache entry instead of generating unique keys for every GPS jitter.
  const oLat = originLatLng.lat.toFixed(4);
  const oLng = originLatLng.lng.toFixed(4);
  const dLat = destLatLng.lat.toFixed(4);
  const dLng = destLatLng.lng.toFixed(4);

  // TRANSIT routes depend on real-time schedules — don't cache them.
  const shouldCache = travelMode !== "TRANSIT";
  const cacheKey = `route:${travelMode}:${oLat},${oLng}:${dLat},${dLng}`;

  const fetchRoute = async () => {
    let fieldMask = "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs.steps.navigationInstruction";
    if (travelMode === "TRANSIT") {
      fieldMask += ",routes.legs.steps.transitDetails";
    }

    const payload = {
      origin:      { location: { latLng: { latitude: originLatLng.lat, longitude: originLatLng.lng } } },
      destination: { location: { latLng: { latitude: destLatLng.lat,   longitude: destLatLng.lng   } } },
      travelMode,
      computeAlternativeRoutes: false,
      languageCode: "en-IN",
      units: "METRIC",
    };

    if (travelMode === "DRIVE") {
      payload.routingPreference = "TRAFFIC_UNAWARE";
      payload.routeModifiers = { avoidTolls: false, avoidHighways: false, avoidFerries: false };
    }

    const url = `https://routes.googleapis.com/directions/v2:computeRoutes?key=${GOOGLE_API_KEY}`;
    const response = await axios.post(url, payload, {
      headers: { "X-Goog-FieldMask": fieldMask },
    });
    return response.data;
  };

  if (shouldCache) {
    return getOrCache(cacheKey, fetchRoute, ROUTE_TTL);
  }
  return fetchRoute();
}

// ─── Routes API (Pro) - Compute Route Matrix with Traffic ──────────────────
export async function computeRouteMatrix(origins, destinations) {
  const url = `https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix?key=${GOOGLE_API_KEY}`;
  
  const payload = {
    origins: origins.map(origin => ({
      waypoint: {
        location: {
          latLng: {
            latitude: origin.lat,
            longitude: origin.lng,
          },
        },
      },
    })),
    destinations: destinations.map(dest => ({
      waypoint: {
        location: {
          latLng: {
            latitude: dest.lat,
            longitude: dest.lng,
          },
        },
      },
    })),
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE",
    languageCode: "en-IN",
    units: "METRIC",
  };

  const response = await axios.post(url, payload, {
    headers: {
      "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,status",
    },
  });
  
  return response.data;
}

// ─── Hierarchy Extractor ──────────────────────────────────────────────────────
// Parses Place Details API (new) addressComponents/containingPlaces into
// a flat hierarchy object: { district, taluka, locality, subLocality }
export function extractHierarchy(placeDetails) {
  const result = { district: null, taluka: null, locality: null, subLocality: null };
  if (!placeDetails) return result;

  // addressComponents is the primary source
  const components = placeDetails.addressComponents || [];
  for (const component of components) {
    const types = component.types || [];
    const longText = component.longText || "";

    if (types.includes("administrative_area_level_2")) result.district    = longText;
    if (types.includes("administrative_area_level_3")) result.taluka      = longText;
    if (types.includes("locality"))                    result.locality    = longText;
    if (types.includes("sublocality_level_1"))         result.subLocality = longText;
  }

  return result;
}

// ─── Intermediate Cities Extractor ───────────────────────────────────────────
// Parses route step instructions to extract city names the route passes through.
// Uses simple regex on navigation instruction text.
export function extractIntermediateCities(steps = []) {
  const cities = [];
  const seen = new Set();

  for (const step of steps) {
    const instruction = step.navigationInstruction?.instructions || "";
    const matches = instruction.match(
      /(?:towards?|enter(?:ing)?|in|toward)\s+([A-Za-z][A-Za-z\s]{2,30})/gi
    );
    if (matches) {
      for (const match of matches) {
        const city = match
          .replace(/^(towards?|enter(?:ing)?|in|toward)\s+/i, "")
          .trim();
        if (city && !seen.has(city.toLowerCase())) {
          seen.add(city.toLowerCase());
          cities.push(city);
        }
      }
    }
  }

  return cities;
}