import sequelize from "../../config/database.config.js";
import Parcel from "./parcel.model.js";
import { Op } from 'sequelize';
import TravellerProfile from '../traveller/travellerProfile.model.js';
import TravellerRoute from '../traveller/travellerRoute.model.js';
import User from '../user/user.model.js';
import UserProfile from '../user/userProfile.model.js';
import Address from "./address.model.js";
import Booking from "../booking/booking.model.js";
import { uploadFiles } from "../../utils/fileUpload.util.js";
import { BOOKING_STATUS, BOOKING_TRANSITIONS } from "../../utils/constants.js";
import { generateParcelId } from "../../utils/idGenerator.js";
import {
  validateAddress,
  geocodeAddress,
  getAddressDescriptors,
  getPlaceDetails,
  computeRoute,
  extractHierarchy,
  extractIntermediateCities,
} from "../../services/googleMaps.service.js";

const weightMap = { small: 1, medium: 5, large: 10, extra_large: 20 };

// ─── Helper: Enrich address data via Google APIs ──────────────────────────────
// Performs geocoding, place details, and address descriptors calls.
// Returns enriched fields to be merged into the Address record.
// All API calls are done OUTSIDE the DB transaction to avoid holding locks.
async function enrichAddressWithGoogleData(addressData) {
  const { address, city, pincode, place_id } = addressData;
  const enriched = { ...addressData };

  // If any required field is missing, return as-is
  if (!address || !city || !pincode) {
    console.warn("[GoogleMaps] Missing required address fields:", { address, city, pincode });
    return enriched;
  }

  if (!process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY === "your_google_api_key_here") {
    return enriched; // Skip if key not configured
  }

  try {
    // 1. Validate address (best-effort, non-blocking) - uses separate API key
    let validationGranularity = null;
    const hasValidationKey = process.env.GOOGLE_ADDRESS_VALIDATION_API_KEY && 
                              process.env.GOOGLE_ADDRESS_VALIDATION_API_KEY !== "your_address_validation_api_key_here";
    
    if (hasValidationKey) {
      try {
        const validationResult = await validateAddress(`${address}, ${city}, ${pincode}`);
        validationGranularity =
          validationResult?.result?.verdict?.validationGranularity || null;
        // Map Google granularity to our ENUM
        if (validationGranularity) {
          if (["PREMISE", "SUB_PREMISE", "ROUTE"].includes(validationGranularity)) {
            enriched.validation_status = "VALID";
          } else if (validationGranularity === "BLOCK") {
            enriched.validation_status = "PARTIAL";
          } else {
            enriched.validation_status = "INFERRED";
          }
        }
      } catch (e) {
        console.warn("[GoogleMaps] Address validation skipped:", e.message);
      }
    }

    // 2. Geocode to get lat/lng and place_id
    const geocodeResult = await geocodeAddress(`${address}, ${city}, ${pincode}, India`);
    const firstResult = geocodeResult.results?.[0];

    if (!firstResult) {
      console.warn("[GoogleMaps] No geocode result found for:", { address, city, pincode });
      return enriched;
    }

    const location = firstResult.geometry?.location;
    const resolvedPlaceId = place_id || firstResult.place_id;

    enriched.latitude = location?.lat;
    enriched.longitude = location?.lng;
    enriched.place_id = resolvedPlaceId;
    enriched.formatted_address = firstResult.formatted_address;
    enriched.last_geocoded_at = new Date();

    // ✅ Extract plus_code from top-level geocode result
    if (geocodeResult.plus_code?.global_code) {
      enriched.plus_code = geocodeResult.plus_code.global_code;
    }

    // 3. Get place details for administrative hierarchy
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

    // 4. Get address descriptors (landmarks) via reverse geocoding
    if (location?.lat && location?.lng) {
      try {
        const descriptorResult = await getAddressDescriptors(location.lat, location.lng);
        // ✅ Correct field: address_descriptor (singular) with landmarks array
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
    // Return partially enriched data rather than throwing
  }

  return enriched;
}

// ─── Helper: Get or create address in DB ──────────────────────────────────────
// Tries to find an existing address (by place_id or by exact fields).
// If found, increments usage_count and returns it.
// If not found, creates a new record with the enriched data.
async function getOrCreateAddress(enrichedData, type, userId, transaction) {
  const { place_id, address, city, pincode } = enrichedData;

  // 1. Look up by place_id (most reliable cache key)
  if (place_id) {
    const existing = await Address.findOne({ where: { place_id }, transaction });
    if (existing) {
      await existing.increment("usage_count", { transaction });
      return existing;
    }
  }

  // 2. Fallback: look up by exact address/city/pincode combo
  const existingByFields = await Address.findOne({
    where: { address, city, pincode },
    transaction,
  });
  if (existingByFields) {
    await existingByFields.increment("usage_count", { transaction });
    return existingByFields;
  }

  // 3. Create new address record
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
      user_profile_id:  null, // Don't set user_profile_id for parcel addresses
      // Enriched fields (may be null if Google API not configured)
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

// ─── Main Service Functions ───────────────────────────────────────────────────

export async function createParcelRequest(data, files) {
  // Sanitize data: convert empty strings to null or defaults
  if (!data.weight) data.weight = weightMap[data.package_size] || 1;
  
  // Sanitize numeric fields
  data.length = data.length && !isNaN(data.length) ? Number(data.length) : null;
  data.width = data.width && !isNaN(data.width) ? Number(data.width) : null;
  data.height = data.height && !isNaN(data.height) ? Number(data.height) : null;
  data.value = data.value && !isNaN(data.value) ? Number(data.value) : null;
  data.price_quote = data.price_quote && !isNaN(data.price_quote) ? Number(data.price_quote) : null;

  const photoPaths = files?.length ? await uploadFiles(files) : [];
  const parcel_ref = await generateParcelId();

  // ── Step 1: Enrich addresses via Google APIs (OUTSIDE transaction) ──
  const [pickupEnriched, deliveryEnriched] = await Promise.all([
    enrichAddressWithGoogleData(data.pickup_address),
    enrichAddressWithGoogleData(data.delivery_address),
  ]);

  // ── Step 2: Compute route if coordinates are available ──
  let routeDistance    = null;
  let routeDuration    = null;
  let intermediateCities = null;
  let routeGeometry    = null;

  if (
    pickupEnriched.latitude && pickupEnriched.longitude &&
    deliveryEnriched.latitude && deliveryEnriched.longitude &&
    process.env.GOOGLE_API_KEY &&
    process.env.GOOGLE_API_KEY !== "your_google_api_key_here"
  ) {
    try {
      const routeResult = await computeRoute(
        { lat: Number(pickupEnriched.latitude), lng: Number(pickupEnriched.longitude) },
        { lat: Number(deliveryEnriched.latitude), lng: Number(deliveryEnriched.longitude) }
      );

      const route = routeResult.routes?.[0];
      if (route) {
        routeDistance = route.distanceMeters / 1000;
        // Duration comes as "3600s" – strip the trailing 's' and convert to minutes
        routeDuration = parseFloat(route.duration?.replace("s", "") || "0") / 60;
        routeGeometry = route.polyline?.encodedPolyline || null;

        const steps = route.legs?.[0]?.steps || [];
        intermediateCities = extractIntermediateCities(steps);
        // route_distance_km is the source of truth for short/long classification in Phase 2
      }
    } catch (error) {
      console.error("[GoogleMaps] Route calculation failed:", error.message);
      // Continue without route data
    }
  }

  // ── Step 3: DB transaction – create addresses and parcel ──
  const t = await sequelize.transaction();
  try {
    const pickupAddress   = await getOrCreateAddress(pickupEnriched,   "pickup",   data.user_id, t);
    const deliveryAddress = await getOrCreateAddress(deliveryEnriched, "delivery", data.user_id, t);

    const parcel = await Parcel.create(
      {
        user_id:               data.user_id,
        parcel_ref,
        package_size:          data.package_size,
        weight:                data.weight,
        length:                data.length     || null,
        width:                 data.width      || null,
        height:                data.height     || null,
        description:           data.description || null,
        parcel_type:           data.parcel_type  || null, // user's content type e.g. "Documents"
        value:                 data.value      || null,
        notes:                 data.notes      || null,
        photos:                photoPaths,
        pickup_address_id:     pickupAddress.id,
        delivery_address_id:   deliveryAddress.id,
        selected_partner_id:   data.selected_partner_id || null,
        price_quote:           data.price_quote || null,
        route_distance_km:     routeDistance,
        route_duration_minutes: routeDuration,
        intermediate_cities:   intermediateCities,
        route_geometry:        routeGeometry,
        status:                BOOKING_STATUS.CREATED,
      },
      { transaction: t }
    );

    await t.commit();
    return { parcel, pickupAddress, deliveryAddress };
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

export async function getUserParcelRequests(userId) {
  const parcels = await Parcel.findAll({
    where: { user_id: userId },
    include: [
      { model: Address, as: "pickupAddress" },
      { model: Address, as: "deliveryAddress" },
      { model: Booking, as: "booking" },
    ],
    order: [["createdAt", "DESC"]],
  });
  return parcels;
}

export async function getParcelById(parcelId) {
  const parcel = await Parcel.findOne({
    where: { id: parcelId },
    include: [
      { model: Address, as: "pickupAddress" },
      { model: Address, as: "deliveryAddress" },
      { model: Booking, as: "booking" },
    ],
  });
  return parcel;
}