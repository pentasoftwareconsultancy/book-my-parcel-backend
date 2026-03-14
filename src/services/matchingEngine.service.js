import sequelize from "../config/database.config.js";
import Parcel from "../modules/parcel/parcel.model.js";
import Address from "../modules/parcel/address.model.js";
import TravellerRoute from "../modules/traveller/travellerRoute.model.js";
import TravellerProfile from "../modules/traveller/travellerProfile.model.js";
import ParcelRequest from "../modules/matching/parcelRequest.model.js";
import RoutePlace from "../modules/traveller/routePlace.model.js";
import { computeRoute } from "./googleMaps.service.js";

const MAX_CANDIDATES = 20;
const MAX_DETOUR_PERCENTAGE = 20;
const MAX_DETOUR_KM = 50;
const DEFAULT_BUFFER_KM = 10;
const REQUEST_EXPIRY_MINUTES = 30;

// ─── Step 1: Fetch Parcel Data ──────────────────────────────────────────────
async function fetchParcelData(parcelId) {
  const parcel = await Parcel.findByPk(parcelId, {
    include: [
      { model: Address, as: "pickupAddress" },
      { model: Address, as: "deliveryAddress" },
    ],
  });

  if (!parcel) {
    throw new Error(`Parcel ${parcelId} not found`);
  }

  return {
    id: parcel.id,
    weight: parcel.weight,
    parcel_type: parcel.parcel_type,
    price_quote: parcel.price_quote,
    pickup: {
      lat: parcel.pickupAddress.latitude,
      lng: parcel.pickupAddress.longitude,
      place_id: parcel.pickupAddress.place_id,
      locality: parcel.pickupAddress.locality,
      city: parcel.pickupAddress.city,
      pincode: parcel.pickupAddress.pincode,
    },
    delivery: {
      lat: parcel.deliveryAddress.latitude,
      lng: parcel.deliveryAddress.longitude,
      place_id: parcel.deliveryAddress.place_id,
      locality: parcel.deliveryAddress.locality,
      city: parcel.deliveryAddress.city,
      pincode: parcel.deliveryAddress.pincode,
    },
  };
}

// ─── Step 2: Find Candidate Travellers (Geographic Matching) ────────────────
async function findCandidateTravellers(parcelData) {
  const candidates = new Set();

  try {
    // Method A: Place-ID matching via route_places table
    if (parcelData.pickup.place_id && parcelData.delivery.place_id) {
      const placeMatches = await sequelize.query(
        `
        SELECT DISTINCT rp1.route_id
        FROM route_places rp1
        WHERE rp1.place_id = :pickupPlaceId
          AND rp1.route_id IN (
            SELECT rp2.route_id
            FROM route_places rp2
            WHERE rp2.place_id = :deliveryPlaceId
          )
        `,
        {
          replacements: {
            pickupPlaceId: parcelData.pickup.place_id,
            deliveryPlaceId: parcelData.delivery.place_id,
          },
          type: sequelize.QueryTypes.SELECT,
        }
      );

      placeMatches.forEach((match) => candidates.add(match.route_id));
      console.log(`[Matching] Place-ID matches: ${placeMatches.length}`);
    }

    // Method B: JSONB array containment (fallback)
    if (candidates.size < 5 && parcelData.pickup.locality && parcelData.delivery.locality) {
      const arrayMatches = await TravellerRoute.findAll({
        attributes: ["id"],
        where: sequelize.where(
          sequelize.fn("jsonb_contains", sequelize.col("localities_passed"), `"${parcelData.pickup.locality}"`),
          true
        ),
        raw: true,
      });

      arrayMatches.forEach((match) => candidates.add(match.id));
      console.log(`[Matching] JSONB array matches: ${arrayMatches.length}`);
    }

    // Method C: City-level JSONB matching (broader fallback)
    if (candidates.size < 10 && parcelData.pickup.city && parcelData.delivery.city) {
      const cityMatches = await TravellerRoute.findAll({
        attributes: ["id"],
        where: sequelize.where(
          sequelize.fn("jsonb_contains", sequelize.col("cities_passed"), `"${parcelData.pickup.city}"`),
          true
        ),
        raw: true,
      });

      cityMatches.forEach((match) => candidates.add(match.id));
      console.log(`[Matching] City-level matches: ${cityMatches.length}`);
    }

    return Array.from(candidates);
  } catch (error) {
    console.error("[Matching] Error finding candidate travellers:", error.message);
    return [];
  }
}

// ─── Step 3: Apply Temporal Filters ────────────────────────────────────────
function applyTemporalFilters(routes, parcelData) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOfWeek = now.getDay();

  return routes.filter((route) => {
    if (!route.is_recurring) {
      // One-time route: departure_date must be >= today
      const departureDate = new Date(route.departure_date);
      return departureDate >= today;
    } else {
      // Recurring route: check date range and day of week
      const startDate = new Date(route.recurring_start_date);
      const endDate = route.recurring_end_date ? new Date(route.recurring_end_date) : null;

      const inDateRange = today >= startDate && (!endDate || today <= endDate);
      const dayMatches = route.recurring_days && route.recurring_days.includes(dayOfWeek);

      return inDateRange && dayMatches;
    }
  });
}

// ─── Step 4: Apply Capacity & Preference Filters ────────────────────────────
function applyCapacityAndPreferenceFilters(routes, parcelData) {
  return routes.filter((route) => {
    // Capacity check
    if (parcelData.weight > route.available_capacity_kg) {
      return false;
    }

    // Parcel type check
    if (route.accepted_parcel_types && route.accepted_parcel_types.length > 0) {
      if (!route.accepted_parcel_types.includes(parcelData.parcel_type)) {
        return false;
      }
    }

    // Minimum earning check
    if (route.min_earning_per_delivery && parcelData.price_quote < route.min_earning_per_delivery) {
      return false;
    }

    return true;
  });
}

// ─── Step 5: Estimate Detour Using Geometry ────────────────────────────────
async function estimateDetour(route, parcelData) {
  try {
    // Simple approximation: use Haversine distance
    const pickupToOrigin = haversineDistance(
      parcelData.pickup.lat,
      parcelData.pickup.lng,
      route.originAddress.latitude,
      route.originAddress.longitude
    );

    const deliveryToDestination = haversineDistance(
      parcelData.delivery.lat,
      parcelData.delivery.lng,
      route.destAddress.latitude,
      route.destAddress.longitude
    );

    const estimatedDetour = pickupToOrigin + deliveryToDestination;
    return estimatedDetour;
  } catch (error) {
    console.error("[Matching] Error estimating detour:", error.message);
    return Infinity;
  }
}

// ─── Helper: Haversine Distance ─────────────────────────────────────────────
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

// ─── Step 6: Sort and Select Top Candidates ────────────────────────────────
async function selectTopCandidates(routes, parcelData) {
  const routesWithEstimates = await Promise.all(
    routes.map(async (route) => ({
      ...route,
      estimatedDetour: await estimateDetour(route, parcelData),
    }))
  );

  return routesWithEstimates
    .sort((a, b) => a.estimatedDetour - b.estimatedDetour)
    .slice(0, MAX_CANDIDATES);
}

// ─── Step 7: Calculate Exact Detour Using Routes API ───────────────────────
async function calculateExactDetour(route, parcelData) {
  try {
    if (!process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY === "your_google_api_key_here") {
      return null;
    }

    const routeResult = await computeRoute(
      { lat: Number(parcelData.pickup.lat), lng: Number(parcelData.pickup.lng) },
      { lat: Number(parcelData.delivery.lat), lng: Number(parcelData.delivery.lng) }
    );

    const parcelRoute = routeResult.routes?.[0];
    if (!parcelRoute) {
      return null;
    }

    const parcelDistance = parcelRoute.distanceMeters / 1000;
    const detourKm = parcelDistance - route.total_distance_km;
    const detourPercentage = (detourKm / route.total_distance_km) * 100;

    return {
      detourKm: Math.max(0, detourKm),
      detourPercentage: Math.max(0, detourPercentage),
    };
  } catch (error) {
    console.error("[Matching] Error calculating exact detour:", error.message);
    return null;
  }
}

// ─── Step 8: Create Parcel Requests ────────────────────────────────────────
async function createParcelRequests(parcelId, candidates) {
  const requests = [];
  const expiresAt = new Date(Date.now() + REQUEST_EXPIRY_MINUTES * 60 * 1000);

  for (const candidate of candidates) {
    try {
      const request = await ParcelRequest.create({
        parcel_id: parcelId,
        traveller_id: candidate.traveller_profile_id,
        route_id: candidate.id,
        match_score: candidate.matchScore || null,
        detour_km: candidate.detourKm || null,
        detour_percentage: candidate.detourPercentage || null,
        status: "SENT",
        expires_at: expiresAt,
      });

      requests.push(request);
    } catch (error) {
      console.error(`[Matching] Error creating request for traveller ${candidate.traveller_profile_id}:`, error.message);
    }
  }

  return requests;
}

// ─── Main Matching Engine ──────────────────────────────────────────────────
export async function matchParcelWithTravellers(parcelId) {
  try {
    console.log(`[Matching] Starting match for parcel ${parcelId}`);

    // Step 1: Fetch parcel data
    const parcelData = await fetchParcelData(parcelId);
    console.log(`[Matching] Parcel data fetched: ${parcelData.pickup.city} → ${parcelData.delivery.city}`);

    // Step 2: Find candidate travellers
    const candidateRouteIds = await findCandidateTravellers(parcelData);
    console.log(`[Matching] Found ${candidateRouteIds.length} candidate routes`);

    if (candidateRouteIds.length === 0) {
      console.log(`[Matching] No candidates found for parcel ${parcelId}`);
      return { success: true, requestsSent: 0, message: "No matching travellers found" };
    }

    // Fetch full route data
    let routes = await TravellerRoute.findAll({
      where: { id: candidateRouteIds },
      include: [
        { model: Address, as: "originAddress" },
        { model: Address, as: "destAddress" },
      ],
    });

    console.log(`[Matching] Fetched ${routes.length} full route records`);

    // Step 3: Apply temporal filters
    routes = applyTemporalFilters(routes, parcelData);
    console.log(`[Matching] After temporal filters: ${routes.length} routes`);

    if (routes.length === 0) {
      console.log(`[Matching] No routes available at this time for parcel ${parcelId}`);
      return { success: true, requestsSent: 0, message: "No available routes at this time" };
    }

    // Step 4: Apply capacity & preference filters
    routes = applyCapacityAndPreferenceFilters(routes, parcelData);
    console.log(`[Matching] After capacity/preference filters: ${routes.length} routes`);

    if (routes.length === 0) {
      console.log(`[Matching] No routes match capacity/preference for parcel ${parcelId}`);
      return { success: true, requestsSent: 0, message: "No routes match parcel requirements" };
    }

    // Step 6: Sort and select top candidates
    const topCandidates = await selectTopCandidates(routes, parcelData);
    console.log(`[Matching] Selected top ${topCandidates.length} candidates`);

    // Step 7: Calculate exact detour for top candidates
    const finalCandidates = [];
    for (const candidate of topCandidates) {
      const detourInfo = await calculateExactDetour(candidate, parcelData);

      if (detourInfo) {
        if (detourInfo.detourPercentage <= MAX_DETOUR_PERCENTAGE && detourInfo.detourKm <= MAX_DETOUR_KM) {
          finalCandidates.push({
            ...candidate,
            detourKm: detourInfo.detourKm,
            detourPercentage: detourInfo.detourPercentage,
            matchScore: 100 - detourInfo.detourPercentage,
          });
        }
      } else {
        // If exact detour calculation fails, use estimated detour
        if (candidate.estimatedDetour <= MAX_DETOUR_KM) {
          finalCandidates.push({
            ...candidate,
            detourKm: candidate.estimatedDetour,
            detourPercentage: (candidate.estimatedDetour / candidate.total_distance_km) * 100,
            matchScore: 100 - (candidate.estimatedDetour / candidate.total_distance_km) * 100,
          });
        }
      }
    }

    console.log(`[Matching] Final candidates after detour check: ${finalCandidates.length}`);

    if (finalCandidates.length === 0) {
      console.log(`[Matching] No candidates within acceptable detour for parcel ${parcelId}`);
      return { success: true, requestsSent: 0, message: "No candidates within acceptable detour" };
    }

    // Step 8: Create parcel requests
    const requests = await createParcelRequests(parcelId, finalCandidates);
    console.log(`[Matching] Created ${requests.length} parcel requests`);

    return {
      success: true,
      requestsSent: requests.length,
      requests: requests.map((r) => ({
        id: r.id,
        traveller_id: r.traveller_id,
        route_id: r.route_id,
        detour_km: r.detour_km,
        detour_percentage: r.detour_percentage,
        expires_at: r.expires_at,
      })),
    };
  } catch (error) {
    console.error("[Matching] Error in matching engine:", error.message);
    throw error;
  }
}

// ─── Get Active Requests for Traveller ──────────────────────────────────────
export async function getActiveRequestsForTraveller(travellerId) {
  const now = new Date();

  const requests = await ParcelRequest.findAll({
    where: {
      traveller_id: travellerId,
      status: "SENT",
      expires_at: {
        [sequelize.Op.gt]: now,
      },
    },
    include: [
      {
        model: Parcel,
        attributes: ["id", "parcel_ref", "weight", "parcel_type", "price_quote"],
        include: [
          { model: Address, as: "pickupAddress", attributes: ["city", "locality", "formatted_address"] },
          { model: Address, as: "deliveryAddress", attributes: ["city", "locality", "formatted_address"] },
        ],
      },
      {
        model: TravellerRoute,
        attributes: ["id", "total_distance_km", "total_duration_minutes"],
      },
    ],
    order: [["sent_at", "DESC"]],
  });

  return requests;
}

// ─── Expire Old Requests ────────────────────────────────────────────────────
export async function expireOldRequests() {
  const now = new Date();

  const result = await ParcelRequest.update(
    { status: "EXPIRED" },
    {
      where: {
        status: "SENT",
        expires_at: {
          [sequelize.Op.lt]: now,
        },
      },
    }
  );

  console.log(`[Matching] Expired ${result[0]} old requests`);
  return result[0];
}
