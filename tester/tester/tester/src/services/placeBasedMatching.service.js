/**
 * Place-ID Based Matching Service
 * Matches parcels to traveller routes using Google Place IDs
 * Replaces string-based array matching with exact Place-ID matching
 */

import sequelize from "../config/database.config.js";
import RoutePlace from "../modules/traveller/routePlace.model.js";
import TravellerRoute from "../modules/traveller/travellerRoute.model.js";
import { generatePlaceId } from "./placeExtraction.service.js";

/**
 * Find matching routes for a parcel using Place-ID matching
 * Checks if parcel pickup and drop locations match route places
 */
export async function findMatchingRoutesByPlaceId(parcelData) {
  try {
    // Generate Place IDs for parcel locations
    const pickupPlaceId = generatePlaceId("locality", parcelData.pickupCity);
    const dropPlaceId = generatePlaceId("locality", parcelData.dropCity);

    console.log(`[PlaceMatching] Searching for routes with pickup: ${pickupPlaceId}, drop: ${dropPlaceId}`);

    // Find routes that have both pickup and drop places
    const matchingRoutes = await sequelize.query(
      `
      SELECT DISTINCT rp1.route_id
      FROM route_places rp1
      WHERE rp1.place_id = :pickupPlaceId
        AND rp1.route_id IN (
          SELECT rp2.route_id
          FROM route_places rp2
          WHERE rp2.place_id = :dropPlaceId
        )
      `,
      {
        replacements: {
          pickupPlaceId,
          dropPlaceId,
        },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const routeIds = matchingRoutes.map((r) => r.route_id);
    console.log(`[PlaceMatching] Found ${routeIds.length} matching routes`);

    return routeIds;
  } catch (error) {
    console.error("[PlaceMatching] Error finding matching routes:", error);
    throw error;
  }
}

/**
 * Find routes by place type and name (hierarchical matching)
 * Useful for city-level or taluka-level matching
 */
export async function findRoutesByPlaceType(placeType, placeName) {
  try {
    const placeId = generatePlaceId(placeType, placeName);

    const routes = await RoutePlace.findAll({
      where: {
        place_type: placeType,
        place_id: placeId,
      },
      attributes: ["route_id"],
      raw: true,
    });

    return routes.map((r) => r.route_id);
  } catch (error) {
    console.error("[PlaceMatching] Error finding routes by place type:", error);
    throw error;
  }
}

/**
 * Hierarchical matching: Try locality first, then city, then taluka
 * Returns routes that match at any level
 */
export async function findRoutesByHierarchy(pickupCity, dropCity) {
  try {
    const results = {
      localityMatches: [],
      cityMatches: [],
      talukaMatches: [],
    };

    // Try locality-level matching first
    const localityPickup = await findRoutesByPlaceType("locality", pickupCity);
    const localityDrop = await findRoutesByPlaceType("locality", dropCity);
    results.localityMatches = localityPickup.filter((id) => localityDrop.includes(id));

    // If no locality matches, try city-level
    if (results.localityMatches.length === 0) {
      const cityPickup = await findRoutesByPlaceType("city", pickupCity);
      const cityDrop = await findRoutesByPlaceType("city", dropCity);
      results.cityMatches = cityPickup.filter((id) => cityDrop.includes(id));
    }

    // If still no matches, try taluka-level
    if (results.localityMatches.length === 0 && results.cityMatches.length === 0) {
      const talukaPickup = await findRoutesByPlaceType("taluka", pickupCity);
      const talukaDrop = await findRoutesByPlaceType("taluka", dropCity);
      results.talukaMatches = talukaPickup.filter((id) => talukaDrop.includes(id));
    }

    const allMatches = [
      ...results.localityMatches,
      ...results.cityMatches,
      ...results.talukaMatches,
    ];

    console.log(
      `[PlaceMatching] Hierarchical matching: ${results.localityMatches.length} locality, ${results.cityMatches.length} city, ${results.talukaMatches.length} taluka matches`
    );

    return {
      matchedRouteIds: allMatches,
      matchLevel: results.localityMatches.length > 0 ? "locality" : results.cityMatches.length > 0 ? "city" : "taluka",
    };
  } catch (error) {
    console.error("[PlaceMatching] Error in hierarchical matching:", error);
    throw error;
  }
}

/**
 * Get all places for a route, grouped by type
 */
export async function getRoutePlaces(routeId) {
  try {
    const places = await RoutePlace.findAll({
      where: { route_id: routeId },
      attributes: ["place_type", "place_name", "place_id"],
      raw: true,
    });

    const grouped = {
      localities: [],
      cities: [],
      talukas: [],
      pincodes: [],
      landmarks: [],
    };

    places.forEach((place) => {
      const key = `${place.place_type}s`;
      if (grouped[key]) {
        grouped[key].push({
          name: place.place_name,
          id: place.place_id,
        });
      }
    });

    return grouped;
  } catch (error) {
    console.error("[PlaceMatching] Error getting route places:", error);
    throw error;
  }
}

/**
 * Find routes with capacity and date filters
 * Combines Place-ID matching with other filters
 */
export async function findMatchingRoutesWithFilters(parcelData, filters = {}) {
  try {
    // Step 1: Place-ID based matching
    const placeMatchedRouteIds = await findMatchingRoutesByPlaceId(parcelData);

    if (placeMatchedRouteIds.length === 0) {
      console.log("[PlaceMatching] No routes matched by place");
      return [];
    }

    // Step 2: Apply additional filters (capacity, date, vehicle type, etc.)
    const query = {
      where: {
        id: placeMatchedRouteIds,
        status: "ACTIVE",
      },
    };

    // Add capacity filter
    if (filters.maxWeight) {
      query.where.available_capacity_kg = {
        [sequelize.Op.gte]: filters.maxWeight,
      };
    }

    // Add date filter for non-recurring routes
    if (filters.departureDate && !filters.isRecurring) {
      query.where.departure_date = filters.departureDate;
    }

    // Add vehicle type filter
    if (filters.vehicleType) {
      query.where.vehicle_type = filters.vehicleType;
    }

    // Add parcel type filter
    if (filters.parcelType) {
      query.where = {
        ...query.where,
        [sequelize.Op.and]: sequelize.where(
          sequelize.fn("jsonb_contains", sequelize.col("accepted_parcel_types"), `"${filters.parcelType}"`),
          true
        ),
      };
    }

    const matchedRoutes = await TravellerRoute.findAll(query);

    console.log(`[PlaceMatching] After filters: ${matchedRoutes.length} routes matched`);

    return matchedRoutes;
  } catch (error) {
    console.error("[PlaceMatching] Error finding matching routes with filters:", error);
    throw error;
  }
}

/**
 * Compare old array-based matching with new Place-ID matching
 * Useful for validation during migration
 */
export async function compareMatchingMethods(parcelData) {
  try {
    // Old method: array containment
    const oldMatches = await sequelize.query(
      `
      SELECT id FROM traveller_routes
      WHERE localities_passed @> ARRAY[:locality]
        AND localities_passed @> ARRAY[:dropCity]
      `,
      {
        replacements: {
          locality: parcelData.pickupCity,
          dropCity: parcelData.dropCity,
        },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    // New method: Place-ID matching
    const newMatches = await findMatchingRoutesByPlaceId(parcelData);

    console.log(`[PlaceMatching] Comparison:`);
    console.log(`  Old method (array): ${oldMatches.length} matches`);
    console.log(`  New method (Place-ID): ${newMatches.length} matches`);

    return {
      oldMethod: oldMatches.map((r) => r.id),
      newMethod: newMatches,
      difference: newMatches.filter((id) => !oldMatches.map((r) => r.id).includes(id)),
    };
  } catch (error) {
    console.error("[PlaceMatching] Error comparing methods:", error);
    throw error;
  }
}
