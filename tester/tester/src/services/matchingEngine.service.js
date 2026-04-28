import sequelize from "../config/database.config.js";
import { Op } from "sequelize";
import { Parcel, Address, TravellerRoute, TravellerProfile, ParcelRequest } from "../modules/associations.js";
import { computeRoute } from "./googleMaps.service.js";
import { 
  findRoutesBetweenPoints, 
  findRoutesWithinBuffer,
  isParcelNearTransitRoute,
  calculateTransitDetour,
  haversineDistance as calculateDistance
} from "./spatialMatching.service.js";

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
    // Skip if pickup and delivery are the same city (same-city deliveries not supported yet)
    if (parcelData.pickup.city === parcelData.delivery.city) {
      console.log(`[Matching] Skipping same-city parcel: ${parcelData.pickup.city} → ${parcelData.delivery.city}`);
      return [];
    }

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
      const arrayMatches = await sequelize.query(
        `
        SELECT id FROM traveller_routes
        WHERE localities_passed @> :pickupLocality
          AND localities_passed @> :deliveryLocality
        `,
        {
          replacements: {
            pickupLocality: JSON.stringify([parcelData.pickup.locality]),
            deliveryLocality: JSON.stringify([parcelData.delivery.locality]),
          },
          type: sequelize.QueryTypes.SELECT,
        }
      );

      arrayMatches.forEach((match) => candidates.add(match.id));
      console.log(`[Matching] JSONB array matches: ${arrayMatches.length}`);
    }

    // Method C: City-level JSONB matching (broader fallback)
    if (candidates.size < 10 && parcelData.pickup.city && parcelData.delivery.city) {
      const cityMatches = await sequelize.query(
        `
        SELECT id FROM traveller_routes
        WHERE cities_passed @> :pickupCity
          AND cities_passed @> :deliveryCity
        `,
        {
          replacements: {
            pickupCity: JSON.stringify([parcelData.pickup.city]),
            deliveryCity: JSON.stringify([parcelData.delivery.city]),
          },
          type: sequelize.QueryTypes.SELECT,
        }
      );

      cityMatches.forEach((match) => candidates.add(match.id));
      console.log(`[Matching] City-level matches: ${cityMatches.length}`);
    }

    // Method D: Spatial matching (geographic proximity fallback)
    if (candidates.size < 15 && parcelData.pickup.lat && parcelData.pickup.lng && parcelData.delivery.lat && parcelData.delivery.lng) {
      console.log(`[Matching] Attempting spatial matching between (${parcelData.pickup.lat}, ${parcelData.pickup.lng}) and (${parcelData.delivery.lat}, ${parcelData.delivery.lng})`);
      
      const spatialMatches = await findRoutesBetweenPoints(
        parcelData.pickup.lng,
        parcelData.pickup.lat,
        parcelData.delivery.lng,
        parcelData.delivery.lat
      );

      spatialMatches.forEach((match) => candidates.add(match.id));
      console.log(`[Matching] Spatial matches: ${spatialMatches.length}`);
    }

    // Method E: Buffer-based spatial matching (even broader fallback)
    if (candidates.size < 20 && parcelData.pickup.lat && parcelData.pickup.lng) {
      console.log(`[Matching] Attempting buffer-based spatial matching around pickup point (${parcelData.pickup.lat}, ${parcelData.pickup.lng})`);
      
      const bufferMatches = await findRoutesWithinBuffer(
        parcelData.pickup.lng,
        parcelData.pickup.lat,
        DEFAULT_BUFFER_KM
      );

      bufferMatches.forEach((match) => candidates.add(match.id));
      console.log(`[Matching] Buffer-based matches: ${bufferMatches.length}`);
    }

    console.log(`[Matching] Total unique candidates found: ${candidates.size}`);
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
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`; // HH:MM format

  return routes.filter((route) => {
    if (!route.is_recurring) {
      // One-time route: departure_date must be >= today AND time must be in future
      const departureDate = new Date(route.departure_date);
      
      // If departure is in the past (before today), reject
      if (departureDate < today) {
        console.log(`[Matching] One-time route ${route.id}: departure date ${route.departure_date} is in the past`);
        return false;
      }
      
      // If departure is today, check if time has already passed
      if (departureDate.getTime() === today.getTime() && route.departure_time) {
        // Compare times (HH:MM format)
        if (route.departure_time <= currentTime) {
          console.log(`[Matching] One-time route ${route.id}: departure time ${route.departure_time} has already passed`);
          return false;
        }
      }
      
      return true;
    } else {
      // Recurring route: check date range and day of week AND time hasn't passed
      const startDate = new Date(route.recurring_start_date);
      const endDate = route.recurring_end_date ? new Date(route.recurring_end_date) : null;

      const inDateRange = today >= startDate && (!endDate || today <= endDate);
      const dayMatches = route.recurring_days && route.recurring_days.includes(dayOfWeek);

      // If today matches but time has passed, move to next week's occurrence
      let timeMatches = true;
      if (dayMatches && today.getTime() === new Date().getTime() && route.departure_time) {
        if (route.departure_time <= currentTime) {
          // Today's departure has passed, but since it's recurring, next week's will be available
          timeMatches = true; // Still return true because next week occurrence is valid
          console.log(`[Matching] Recurring route ${route.id}: Today's ${route.departure_time} passed, but next week's available`);
        }
      }

      return inDateRange && dayMatches && timeMatches;
    }
  });
}

// ─── Step 3.5: Apply Transport Mode Filters ────────────────────────────────
/**
 * Filter routes based on transport_mode and proximity requirements
 * - Private routes: continue with existing logic
 * - Public transport (bus/train): check if parcel is near transit stops
 * @param {Array} routes - Routes to filter
 * @param {Object} parcelData - Parcel location data
 * @returns {Array} Filtered routes
 */
function applyTransportModeFilters(routes, parcelData) {
  console.log(`[Matching] Applying transport mode filters to ${routes.length} routes`);

  return routes.filter((route) => {
    // Default to private for routes without transport_mode (backward compatibility)
    const transportMode = route.transport_mode || 'private';

    if (transportMode === 'private') {
      // Private routes continue with existing matching logic
      console.log(`[Matching] Route ${route.id} is private vehicle - will use standard proximity matching`);
      return true;
    }

    // PUBLIC TRANSPORT ROUTES (bus, train)
    if (transportMode === 'bus' || transportMode === 'train') {
      // If route has explicit stops data (from transit API), use transit-specific matching
      if (route.stops_passed && Array.isArray(route.stops_passed) && route.stops_passed.length > 0) {
        // Check if both pickup and drop are near transit stops (2km walking distance)
        const isEligible = isParcelNearTransitRoute(
          parcelData.pickup.lat,
          parcelData.pickup.lng,
          parcelData.delivery.lat,
          parcelData.delivery.lng,
          route.stops_passed,
          2000 // 2 km walking distance
        );

        if (isEligible) {
          console.log(`[Matching] Route ${route.id} (${transportMode}): Parcel is within walking distance of stops ✓`);
          return true;
        } else {
          // Transit-specific matching failed - FALLBACK to private route approach
          console.log(`[Matching] Route ${route.id} (${transportMode}): Parcel NOT within stops distance, FALLING BACK to private route matching (geographic proximity)`);
          // Continue to spatial/polyline matching in next step (return true = pass this filter)
          return true;
        }
      } else {
        // No explicit stops data: Use route geometry/polyline matching
        // This handles user-created bus/train routes that don't have transit stop API data
        // Note: Direction verification is only possible with explicit stops (transit API data)
        console.log(`[Matching] Route ${route.id} (${transportMode}): No explicit stops data, using route geometry matching (direction cannot be verified)`);
        return true; // Will be matched using standard polyline proximity in next step
      }
    }

    // Unknown transport mode - skip
    console.warn(`[Matching] Route ${route.id} has unknown transport_mode: ${transportMode}`);
    return false;
  });
}

// ─── Step 4: Apply Capacity & Preference Filters ────────────────────────────
function applyCapacityAndPreferenceFilters(routes, parcelData) {
  console.log(`[Matching] Applying capacity filters - Parcel weight: ${parcelData.weight}kg, type: ${parcelData.parcel_type}`);
  
  return routes.filter((route) => {
    console.log(`[Matching] Checking route ${route.id}: capacity=${route.available_capacity_kg}kg, accepted_types=${JSON.stringify(route.accepted_parcel_types)}, min_earning=${route.min_earning_per_delivery}`);
    
    // TEMPORARILY DISABLED: Capacity check
    // if (parcelData.weight > route.available_capacity_kg) {
    //   console.log(`[Matching] Route ${route.id} rejected: weight ${parcelData.weight}kg > capacity ${route.available_capacity_kg}kg`);
    //   return false;
    // }

    // TEMPORARILY DISABLED: Parcel type check
    // if (route.accepted_parcel_types && route.accepted_parcel_types.length > 0) {
    //   if (!route.accepted_parcel_types.includes(parcelData.parcel_type)) {
    //     console.log(`[Matching] Route ${route.id} rejected: parcel type ${parcelData.parcel_type} not in accepted types`);
    //     return false;
    //   }
    // }

    // Keep minimum earning check (optional)
    // Skip price validation if parcel doesn't have a price quote yet
    if (route.min_earning_per_delivery) {
      if (parcelData.price_quote === null) {
        console.log(`[Matching] Route ${route.id} - parcel has no price quote, skipping min earning check`);
      } else if (parcelData.price_quote < route.min_earning_per_delivery) {
        console.log(`[Matching] Route ${route.id} rejected: price ${parcelData.price_quote} < min earning ${route.min_earning_per_delivery}`);
        return false;
      }
    }

    console.log(`[Matching] Route ${route.id} passed capacity/preference filters`);
    return true;
  });
}

// ─── Step 6: Sort and Select Top Candidates ────────────────────────────────
async function selectTopCandidates(routes, parcelData) {
  const routesWithEstimates = await Promise.all(
    routes.map(async (route) => {
      const transportMode = route.transport_mode || 'private';
      let estimatedDetour;

      if (transportMode === 'private') {
        // Private route: use Haversine distance to route origin/destination
        estimatedDetour = calculateDetourForPrivateRoute(route, parcelData);
      } else if (transportMode === 'bus' || transportMode === 'train') {
        // Transit route: If stops data available, use walking distance to stops
        if (route.stops_passed && Array.isArray(route.stops_passed) && route.stops_passed.length > 0) {
          const transitDetour = calculateTransitDetour(
            parcelData.pickup.lat,
            parcelData.pickup.lng,
            parcelData.delivery.lat,
            parcelData.delivery.lng,
            route.stops_passed
          );
          estimatedDetour = transitDetour ? transitDetour.totalWalkingKm : Infinity;
        } else {
          // No explicit stops: Treat as private route (user-created bus/train routes)
          estimatedDetour = calculateDetourForPrivateRoute(route, parcelData);
        }
      } else {
        estimatedDetour = Infinity;
      }

      return {
        ...route.toJSON(),
        estimatedDetour,
        transportMode,
      };
    })
  );

  return routesWithEstimates
    .sort((a, b) => a.estimatedDetour - b.estimatedDetour)
    .slice(0, MAX_CANDIDATES);
}

/**
 * Calculate estimated detour for a private vehicle route
 * @param {Object} route - Route object
 * @param {Object} parcelData - Parcel location data
 * @returns {number} Estimated detour in km
 */
function calculateDetourForPrivateRoute(route, parcelData) {
  try {
    // Simple approximation: use Haversine distance
    const pickupToOrigin = calculateDistance(
      parcelData.pickup.lat,
      parcelData.pickup.lng,
      Number(route.originAddress?.latitude || route['originAddress.latitude']),
      Number(route.originAddress?.longitude || route['originAddress.longitude'])
    );

    const deliveryToDestination = calculateDistance(
      parcelData.delivery.lat,
      parcelData.delivery.lng,
      Number(route.destAddress?.latitude || route['destAddress.latitude']),
      Number(route.destAddress?.longitude || route['destAddress.longitude'])
    );

    return pickupToOrigin + deliveryToDestination;
  } catch (error) {
    console.error("[Matching] Error calculating detour for private route:", error.message);
    return Infinity;
  }
}

// ─── Step 7: Calculate Exact Detour Using Routes API (Private) or Walking Distance (Transit) ──
async function calculateExactDetour(route, parcelData) {
  try {
    const transportMode = route.transportMode || route.transport_mode || 'private';

    // TRANSIT ROUTES: Use walking distance to stops (if available)
    if (transportMode === 'bus' || transportMode === 'train') {
      if (route.stops_passed && Array.isArray(route.stops_passed) && route.stops_passed.length > 0) {
        const transitDetour = calculateTransitDetour(
          parcelData.pickup.lat,
          parcelData.pickup.lng,
          parcelData.delivery.lat,
          parcelData.delivery.lng,
          route.stops_passed
        );

        if (transitDetour) {
          console.log(`[Matching] Transit detour for route ${route.id} (${transportMode}): ${transitDetour.totalWalkingKm}km`);
          return {
            detourKm: transitDetour.totalWalkingKm,
            detourPercentage: 0, // Walking distance doesn't have a percentage (not comparable to route distance)
            isTransitWalkingDistance: true,
          };
        } else {
          // If we can't calculate walking distance, fallback to estimated detour
          return {
            detourKm: route.estimatedDetour || Infinity,
            detourPercentage: 0,
            isTransitWalkingDistance: false,
          };
        }
      }
      // Bus/train without explicit stops: treat as private route
    }

    // PRIVATE ROUTES or BUS/TRAIN routes without stops: Use Google Routes API or fallback
    if (!process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY === "your_google_api_key_here") {
      return null;
    }

    const routeResult = await computeRoute(
      { lat: Number(parcelData.pickup.lat), lng: Number(parcelData.pickup.lng) },
      { lat: Number(parcelData.delivery.lat), lng: Number(parcelData.delivery.lng) }
    );

    const parcelRoute = routeResult.routes?.[0];
    if (!parcelRoute || !parcelRoute.distanceMeters) {
      return null; 
    }

    const parcelDistance = parcelRoute.distanceMeters / 1000;
    const routeDistance = Number(route.total_distance_km) || 0;
    const detourKm = parcelDistance - routeDistance;
    const detourPercentage = routeDistance > 0 ? (detourKm / routeDistance) * 100 : 0;

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

  console.log(`[createParcelRequests] Creating requests for parcel ${parcelId} with ${candidates.length} candidates`);

  for (const candidate of candidates) {
    try {
      console.log(`[createParcelRequests] Creating request for traveller ${candidate.travellerProfile.user_id}, route ${candidate.id}`);
      
      const request = await ParcelRequest.create({
        parcel_id: parcelId,
        traveller_id: candidate.travellerProfile.user_id,
        route_id: candidate.id,
        match_score: candidate.matchScore || null,
        detour_km: candidate.detourKm || null,
        detour_percentage: candidate.detourPercentage || null,
        status: "SENT",
        expires_at: expiresAt,
      });

      console.log(`[createParcelRequests] ✅ Created request ${request.id} for parcel ${parcelId}`);
      requests.push(request);
    } catch (error) {
      console.error(`[Matching] Error creating request for traveller ${candidate.travellerProfile.user_id}:`, error.message);
    }
  }

  console.log(`[createParcelRequests] Created ${requests.length} requests for parcel ${parcelId}`);
  return requests;
}

// ─── Main Matching Engine ──────────────────────────────────────────────────
export async function matchParcelWithTravellers(parcelId) {
  try {
    console.log(`[Matching] Starting match for parcel ${parcelId}`);

    // Step 0: Update parcel status to MATCHING
    await Parcel.update(
      { status: "MATCHING" },
      { where: { id: parcelId } }
    );
    console.log(`[Matching] Updated parcel ${parcelId} status to MATCHING`);

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
        { 
          model: TravellerProfile, 
          as: "travellerProfile",
          attributes: ["id", "user_id"]
        },
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

    // Step 3.5: Apply transport mode filters (proximity to stops for transit routes)
    routes = applyTransportModeFilters(routes, parcelData);
    console.log(`[Matching] After transport mode filters: ${routes.length} routes`);

    if (routes.length === 0) {
      console.log(`[Matching] No routes match transport mode requirements for parcel ${parcelId}`);
      return { success: true, requestsSent: 0, message: "No routes match parcel location and transport requirements" };
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
    const MAX_TRANSIT_WALKING_KM = 4; // 4 km walking distance for transit routes (2km each direction)

    for (const candidate of topCandidates) {
      const detourInfo = await calculateExactDetour(candidate, parcelData);
      const transportMode = candidate.transportMode || candidate.transport_mode || 'private';

      if (!detourInfo) {
        // If exact detour calculation fails, use estimated detour
        if (candidate.estimatedDetour <= 100) {
          const detourPercentage = (candidate.estimatedDetour / candidate.total_distance_km) * 100;
          finalCandidates.push({
            ...candidate,
            detourKm: candidate.estimatedDetour,
            detourPercentage: detourPercentage,
            matchScore: Math.max(0, 100 - detourPercentage),
          });
        }
        continue;
      }

      // Handle transit vs private routes differently
      if (detourInfo.isTransitWalkingDistance) {
        // TRANSIT ROUTES: Check walking distance threshold
        if (detourInfo.detourKm <= MAX_TRANSIT_WALKING_KM) {
          finalCandidates.push({
            ...candidate,
            detourKm: detourInfo.detourKm,
            detourPercentage: 0, // Not applicable for transit
            matchScore: Math.max(50, 100 - (detourInfo.detourKm / MAX_TRANSIT_WALKING_KM) * 50), // Score based on walking distance
          });
        } else {
          console.log(`[Matching] Candidate ${candidate.id} (${transportMode}) rejected: walking distance ${detourInfo.detourKm}km exceeds threshold ${MAX_TRANSIT_WALKING_KM}km`);
        }
      } else {
        // PRIVATE ROUTES: Check percentage and absolute threshold
        if (detourInfo.detourPercentage !== undefined || detourInfo.detourPercentage !== null) {
          if (detourInfo.detourPercentage <= MAX_DETOUR_PERCENTAGE && detourInfo.detourKm <= MAX_DETOUR_KM) {
            finalCandidates.push({
              ...candidate,
              detourKm: detourInfo.detourKm,
              detourPercentage: detourInfo.detourPercentage,
              matchScore: 100 - detourInfo.detourPercentage,
            });
          } else {
            console.log(`[Matching] Candidate ${candidate.id} rejected: detour ${detourInfo.detourPercentage.toFixed(1)}% / ${detourInfo.detourKm}km exceeds thresholds`);
          }
        } else {
          // Fallback: use estimated detour
          if (candidate.estimatedDetour <= 100) {
            const detourPercentage = (candidate.estimatedDetour / candidate.total_distance_km) * 100;
            finalCandidates.push({
              ...candidate,
              detourKm: candidate.estimatedDetour,
              detourPercentage: detourPercentage,
              matchScore: Math.max(0, 100 - detourPercentage),
            });
          }
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
          [Op.lt]: now,
        },
      },
    }
  );

  console.log(`[Matching] Expired ${result[0]} old requests`);
  return result[0];
}

// ─── Match Route with Existing Parcels ─────────────────────────────────────
/**
 * When a new route is created, check if it matches any existing parcels
 * that are still in MATCHING status
 */
export async function matchRouteWithExistingParcels(routeId) {
  try {
    console.log(`[Matching] Checking route ${routeId} against existing parcels`);

    // Find all parcels that are still looking for travellers
    // Using only valid enum values from the Parcel model
    const matchingParcels = await Parcel.findAll({
      where: {
        status: {
          [Op.in]: ["CREATED", "MATCHING"] // Only use valid enum values
        },
        createdAt: {
          [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days instead of 24 hours
        },
      },
      attributes: ["id", "status", "createdAt"],
    });

    console.log(`[Matching] Found ${matchingParcels.length} parcels in matching-eligible status`);
    
    // Log details of found parcels
    matchingParcels.forEach(parcel => {
      console.log(`[Matching] Parcel ${parcel.id}: status=${parcel.status}, created=${parcel.createdAt}`);
    });

    if (matchingParcels.length === 0) {
      return { success: true, matchedParcels: 0, message: "No parcels in matching status" };
    }

    let totalMatched = 0;

    // For each parcel, run the matching engine
    for (const parcel of matchingParcels) {
      try {
        console.log(`[Matching] Attempting to match route ${routeId} with parcel ${parcel.id}`);
        const result = await matchParcelWithTravellers(parcel.id);
        if (result.success && result.requestsSent > 0) {
          totalMatched++;
          console.log(`[Matching] ✅ Route ${routeId} matched with parcel ${parcel.id} - ${result.requestsSent} requests sent`);
        } else {
          console.log(`[Matching] ❌ Route ${routeId} did not match with parcel ${parcel.id} - ${result.message}`);
        }
      } catch (error) {
        console.error(`[Matching] Error matching route ${routeId} with parcel ${parcel.id}:`, error.message);
        // Continue with other parcels even if one fails
      }
    }

    console.log(`[Matching] Route ${routeId} successfully matched with ${totalMatched} parcels`);

    return {
      success: true,
      matchedParcels: totalMatched,
      totalParcelsChecked: matchingParcels.length,
    };
  } catch (error) {
    console.error("[Matching] Error in matchRouteWithExistingParcels:", error.message);
    throw error;
  }
}
// ─── Periodic Matching Job ─────────────────────────────────────────────────
/**
 * Periodic job to match existing parcels with routes
 * This can be called by a cron job or scheduler
 */
export async function runPeriodicMatching() {
  try {
    console.log("[Matching] Starting periodic matching job");

    // Find all parcels that are still in MATCHING status from the last 24 hours
    // Using only valid enum values
    const matchingParcels = await Parcel.findAll({
      where: {
        status: {
          [Op.in]: ["CREATED", "MATCHING"] // Only valid enum values
        },
        createdAt: {
          [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
      attributes: ["id", "createdAt"],
      order: [["createdAt", "DESC"]], // Process newer parcels first
    });

    console.log(`[Matching] Found ${matchingParcels.length} parcels to re-match`);

    let totalMatched = 0;
    let totalProcessed = 0;

    for (const parcel of matchingParcels) {
      try {
        totalProcessed++;
        const result = await matchParcelWithTravellers(parcel.id);
        
        if (result.success && result.requestsSent > 0) {
          totalMatched++;
          console.log(`[Matching] Periodic job: Parcel ${parcel.id} matched with ${result.requestsSent} travellers`);
        }
        
        // Small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`[Matching] Error in periodic matching for parcel ${parcel.id}:`, error.message);
        // Continue with other parcels
      }
    }

    console.log(`[Matching] Periodic matching completed: ${totalMatched}/${totalProcessed} parcels found new matches`);

    return {
      success: true,
      totalProcessed,
      totalMatched,
      message: `Processed ${totalProcessed} parcels, found new matches for ${totalMatched}`,
    };
  } catch (error) {
    console.error("[Matching] Error in periodic matching job:", error.message);
    throw error;
  }
}