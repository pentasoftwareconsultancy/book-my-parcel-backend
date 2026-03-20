import sequelize from "../../config/database.config.js";
import TravellerRoute from "./travellerRoute.model.js";
import TravellerProfile from "./travellerProfile.model.js";
import Address from "../parcel/address.model.js";
import {
  geocodeAddress,
  getPlaceDetails,
  getAddressDescriptors,
  computeRoute,
  extractHierarchy,
  extractIntermediateCities,
} from "../../services/googleMaps.service.js";
import { extractAndStorePlaces } from "../../services/placeExtraction.service.js";
import polyline from "@mapbox/polyline";

// ─── Helper: Enrich address data via Google APIs ──────────────────────────────
// Reuses the same logic from parcel.service.js
async function enrichAddressWithGoogleData(addressData) {
  const { address, city, pincode, place_id } = addressData;
  const enriched = { ...addressData };

  if (!process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY === "your_google_api_key_here") {
    return enriched;
  }

  try {
    // Geocode to get lat/lng and place_id
    const geocodeResult = await geocodeAddress(`${address}, ${city}, ${pincode}, India`);
    const firstResult = geocodeResult.results?.[0];

    if (!firstResult) return enriched;

    const location = firstResult.geometry?.location;
    const resolvedPlaceId = place_id || firstResult.place_id;

    enriched.latitude = location?.lat;
    enriched.longitude = location?.lng;
    enriched.place_id = resolvedPlaceId;
    enriched.formatted_address = firstResult.formatted_address;
    enriched.last_geocoded_at = new Date();

    if (geocodeResult.plus_code?.global_code) {
      enriched.plus_code = geocodeResult.plus_code.global_code;
    }

    // Get place details for administrative hierarchy
    if (resolvedPlaceId) {
      try {
        const placeDetails = await getPlaceDetails(resolvedPlaceId);
        const hierarchy = extractHierarchy(placeDetails);
        if (hierarchy.district)    enriched.district    = hierarchy.district;
        if (hierarchy.taluka)      enriched.taluka      = hierarchy.taluka;
        if (hierarchy.locality)    enriched.locality    = hierarchy.locality;
        if (hierarchy.subLocality) enriched.sub_localities = [hierarchy.subLocality];
      } catch (e) {
        console.warn("[GoogleMaps] Place details skipped:", e.message);
      }
    }

    // Get address descriptors (landmarks)
    if (location?.lat && location?.lng) {
      try {
        const descriptorResult = await getAddressDescriptors(location.lat, location.lng);
        const addressDescriptor = descriptorResult?.address_descriptor;
        if (addressDescriptor?.landmarks && Array.isArray(addressDescriptor.landmarks)) {
          enriched.landmarks = addressDescriptor.landmarks.slice(0, 5).map((lm) => ({
            name: lm.name,
            distance: lm.distanceMeters,
          }));
        }
      } catch (e) {
        console.warn("[GoogleMaps] Address descriptors skipped:", e.message);
      }
    }
  } catch (error) {
    console.error("[GoogleMaps] Address enrichment failed:", error.message);
  }

  return enriched;
}

// ─── Helper: Get or create address in DB ──────────────────────────────────────
async function getOrCreateAddress(enrichedData, type, userId, transaction) {
  const { place_id, address, city, pincode } = enrichedData;

  // Look up by place_id first
  if (place_id) {
    const existing = await Address.findOne({ where: { place_id }, transaction });
    if (existing) {
      await existing.increment("usage_count", { transaction });
      return existing;
    }
  }

  // Fallback: look up by exact address/city/pincode
  const existingByFields = await Address.findOne({
    where: { address, city, pincode },
    transaction,
  });
  if (existingByFields) {
    await existingByFields.increment("usage_count", { transaction });
    return existingByFields;
  }

  // Create new address record
  const newAddress = await Address.create(
    {
      name:             enrichedData.name,
      address:          enrichedData.address,
      city:             enrichedData.city,
      state:            enrichedData.state,
      pincode:          enrichedData.pincode,
      country:          enrichedData.country,
      phone:            enrichedData.phone,
      alt_phone:        enrichedData.alt_phone || null,
      aadhar_no:        enrichedData.aadhar_no || null,
      type,
      user_profile_id:  userId,
      place_id:          enrichedData.place_id          || null,
      latitude:          enrichedData.latitude          || null,
      longitude:         enrichedData.longitude         || null,
      plus_code:         enrichedData.plus_code         || null,
      validation_status: enrichedData.validation_status || null,
      district:          enrichedData.district          || null,
      taluka:            enrichedData.taluka            || null,
      locality:          enrichedData.locality          || null,
      landmarks:         enrichedData.landmarks         || null,
      sub_localities:    enrichedData.sub_localities    || null,
      formatted_address: enrichedData.formatted_address || null,
      last_geocoded_at:  enrichedData.last_geocoded_at  || null,
    },
    { transaction }
  );

  return newAddress;
}

// ─── Helper: Sample points along polyline ─────────────────────────────────────
function samplePointsAlongPolyline(encodedPolyline, intervalKm = 5) {
  try {
    const decoded = polyline.decode(encodedPolyline);
    const points = [];
    let accumulatedDistance = 0;
    
    points.push(decoded[0]); // Always include start
    
    for (let i = 1; i < decoded.length; i++) {
      const [lat1, lng1] = decoded[i - 1];
      const [lat2, lng2] = decoded[i];
      const segmentDist = haversineDistance(lat1, lng1, lat2, lng2);
      accumulatedDistance += segmentDist;
      
      if (accumulatedDistance >= intervalKm) {
        points.push(decoded[i]);
        accumulatedDistance = 0;
      }
    }
    
    points.push(decoded[decoded.length - 1]); // Always include end
    return points;
  } catch (error) {
    console.error("[Polyline] Sampling failed:", error.message);
    return [];
  }
}

// ─── Helper: Haversine distance ───────────────────────────────────────────────
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ─── Helper: Extract intermediate data from sampled points ────────────────────
async function extractIntermediateData(sampledPoints) {
  const localities = new Set();
  const pincodes = new Set();
  const talukas = new Set();
  const cities = new Set();
  const landmarks = [];

  for (const [lat, lng] of sampledPoints) {
    try {
      const descriptorResult = await getAddressDescriptors(lat, lng);
      
      // Extract from address components
      const results = descriptorResult.results || [];
      for (const result of results) {
        const components = result.address_components || [];
        for (const comp of components) {
          const types = comp.types || [];
          if (types.includes("postal_code")) pincodes.add(comp.long_name);
          if (types.includes("locality")) cities.add(comp.long_name);
          if (types.includes("sublocality") || types.includes("sublocality_level_1")) {
            localities.add(comp.long_name);
          }
          if (types.includes("administrative_area_level_3")) talukas.add(comp.long_name);
        }
      }
      
      // Extract landmarks
      const addressDescriptor = descriptorResult.address_descriptor;
      if (addressDescriptor?.landmarks && Array.isArray(addressDescriptor.landmarks)) {
        for (const lm of addressDescriptor.landmarks.slice(0, 3)) {
          if (lm.name && typeof lm.name === 'string') {
            landmarks.push({
              name: lm.name.trim(),
              distanceMeters: lm.distanceMeters,
            });
          }
        }
      }
    } catch (error) {
      console.warn(`[GoogleMaps] Failed to extract data for point [${lat}, ${lng}]:`, error.message);
    }
  }

  return {
    localities: Array.from(localities),
    pincodes: Array.from(pincodes),
    talukas: Array.from(talukas),
    cities: Array.from(cities),
    landmarks: landmarks.slice(0, 10), // Limit to 10 unique landmarks
  };
}

// ─── Main Service: Create Traveller Route ─────────────────────────────────────
export async function createTravellerRoute(data, userId) {
  // Step 0: Get or create traveller profile
  let travellerProfile = await TravellerProfile.findOne({
    where: { user_id: userId },
    include: [{ association: "user", attributes: ["phone_number"] }],
  });

  if (!travellerProfile) {
    // Auto-create traveller profile with basic info from route data
    travellerProfile = await TravellerProfile.create({
      user_id: userId,
      vehicle_type: data.vehicle_type || 'car',
      vehicle_number: data.vehicle_number || null,
      capacity_kg: data.max_weight_kg || 50,
      status: 'ACTIVE',
      is_available: true,
    });
    
    // Assign TRAVELLER role to user if not already assigned
    const { User, Role, UserRole } = await import('../associations.js');
    const travellerRole = await Role.findOne({ where: { name: 'TRAVELLER' } });
    if (travellerRole) {
      const existingUserRole = await UserRole.findOne({
        where: { user_id: userId, role_id: travellerRole.id }
      });
      if (!existingUserRole) {
        await UserRole.create({
          user_id: userId,
          role_id: travellerRole.id
        });
        console.log(`[TravellerRoute] Assigned TRAVELLER role to user ${userId}`);
      }
    }
    
    // Fetch the created profile with user association
    travellerProfile = await TravellerProfile.findOne({
      where: { id: travellerProfile.id },
      include: [{ association: "user", attributes: ["phone_number"] }],
    });
    
    console.log(`[TravellerRoute] Auto-created traveller profile for user ${userId}`);
  }

  // Use profile phone if not provided in addresses
  const profilePhone = travellerProfile.user?.phone_number || travellerProfile.phone;
  if (!data.origin.phone && profilePhone) {
    data.origin.phone = profilePhone;
  }
  if (!data.destination.phone && profilePhone) {
    data.destination.phone = profilePhone;
  }

  // Step 1: Enrich addresses via Google APIs (outside transaction)
  const [originEnriched, destEnriched] = await Promise.all([
    enrichAddressWithGoogleData(data.origin),
    enrichAddressWithGoogleData(data.destination),
  ]);

  // Step 2: Compute route if coordinates are available
  let routeDistance = null;
  let routeDuration = null;
  let routeGeometry = null;
  let citiesFromSteps = [];
  let intermediateData = {
    localities: [],
    pincodes: [],
    talukas: [],
    cities: [],
    landmarks: [],
  };

  if (
    originEnriched.latitude && originEnriched.longitude &&
    destEnriched.latitude && destEnriched.longitude &&
    process.env.GOOGLE_API_KEY &&
    process.env.GOOGLE_API_KEY !== "your_google_api_key_here"
  ) {
    try {
      const routeResult = await computeRoute(
        { lat: Number(originEnriched.latitude), lng: Number(originEnriched.longitude) },
        { lat: Number(destEnriched.latitude), lng: Number(destEnriched.longitude) }
      );

      const route = routeResult.routes?.[0];
      if (route) {
        routeDistance = route.distanceMeters / 1000;
        routeDuration = parseFloat(route.duration?.replace("s", "") || "0") / 60;
        routeGeometry = route.polyline?.encodedPolyline || null;

        // Extract cities from navigation instructions
        const steps = route.legs?.[0]?.steps || [];
        citiesFromSteps = extractIntermediateCities(steps);

        // Sample points along polyline and extract intermediate data
        if (routeGeometry) {
          const sampledPoints = samplePointsAlongPolyline(routeGeometry, 10); // Sample every 10km
          if (sampledPoints.length > 0) {
            intermediateData = await extractIntermediateData(sampledPoints);
          }
        }
      }
    } catch (error) {
      console.error("[GoogleMaps] Route calculation failed:", error.message);
    }
  }

  // Merge cities from steps with cities from sampled points
  const allCities = new Set([...citiesFromSteps, ...intermediateData.cities]);
  intermediateData.cities = Array.from(allCities);

  // Step 3: DB transaction – create addresses and route
  const t = await sequelize.transaction();
  try {
    // Traveller profile already fetched above
    const originAddress = await getOrCreateAddress(originEnriched, "origin", userId, t);
    const destAddress = await getOrCreateAddress(destEnriched, "destination", userId, t);

    // Set available_capacity_kg to max_weight_kg initially
    const availableCapacity = data.max_weight_kg;

    const route = await TravellerRoute.create(
      {
        traveller_profile_id: travellerProfile.id,
        origin_address_id: originAddress.id,
        dest_address_id: destAddress.id,
        departure_date: data.departure_date || null,
        departure_time: data.departure_time,
        arrival_date: data.arrival_date || null,
        arrival_time: data.arrival_time || null,
        is_recurring: data.is_recurring || false,
        recurring_days: data.recurring_days || null,
        recurring_start_date: data.recurring_start_date || null,
        recurring_end_date: data.recurring_end_date || null,
        vehicle_type: data.vehicle_type,
        vehicle_number: data.vehicle_number || null,
        max_weight_kg: data.max_weight_kg,
        available_capacity_kg: availableCapacity,
        accepted_parcel_types: data.accepted_parcel_types || null,
        min_earning_per_delivery: data.min_earning_per_delivery || null,
        route_geometry: routeGeometry,
        total_distance_km: routeDistance,
        total_duration_minutes: routeDuration,
        localities_passed: intermediateData.localities,
        pincodes_covered: intermediateData.pincodes,
        talukas_passed: intermediateData.talukas,
        cities_passed: intermediateData.cities,
        landmarks_nearby: intermediateData.landmarks,
        status: "ACTIVE",
      },
      { transaction: t }
    );

    // Phase 3: Extract and store places for Place-ID based matching
    await extractAndStorePlaces(route.id, intermediateData, t);

    await t.commit();
    return { route, originAddress, destAddress };
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

// ─── Get traveller routes ─────────────────────────────────────────────────────
export async function getTravellerRoutes(userId) {
  const travellerProfile = await TravellerProfile.findOne({
    where: { user_id: userId },
  });

  if (!travellerProfile) {
    throw new Error("Traveller profile not found");
  }

  const routes = await TravellerRoute.findAll({
    where: { traveller_profile_id: travellerProfile.id },
    include: [
      { model: Address, as: "originAddress" },
      { model: Address, as: "destAddress" },
    ],
    order: [["created_at", "DESC"]],
  });

  return routes;
}

// ─── Get route by ID ──────────────────────────────────────────────────────────
export async function getRouteById(routeId) {
  const route = await TravellerRoute.findOne({
    where: { id: routeId },
    include: [
      { model: Address, as: "originAddress" },
      { model: Address, as: "destAddress" },
      { model: TravellerProfile, as: "travellerProfile" },
    ],
  });

  return route;
}
