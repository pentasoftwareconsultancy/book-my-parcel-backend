import crypto from "crypto";
import RoutePlace from "../modules/traveller/routePlace.model.js";

/**
 * Extract and store places from intermediate route data
 * Converts locality/city/taluka/pincode arrays to RoutePlace records with Place IDs
 */
export async function extractAndStorePlaces(routeId, intermediateData, transaction) {
  try {
    const placesToInsert = [];

    // Extract localities
    if (intermediateData.localities && Array.isArray(intermediateData.localities)) {
      intermediateData.localities.forEach((locality) => {
        if (locality && locality.trim()) {
          placesToInsert.push({
            route_id: routeId,
            place_type: "locality",
            place_name: locality,
            place_id: generatePlaceId("locality", locality),
          });
        }
      });
    }

    // Extract cities
    if (intermediateData.cities && Array.isArray(intermediateData.cities)) {
      intermediateData.cities.forEach((city) => {
        if (city && city.trim()) {
          placesToInsert.push({
            route_id: routeId,
            place_type: "city",
            place_name: city,
            place_id: generatePlaceId("city", city),
          });
        }
      });
    }

    // Extract talukas
    if (intermediateData.talukas && Array.isArray(intermediateData.talukas)) {
      intermediateData.talukas.forEach((taluka) => {
        if (taluka && taluka.trim()) {
          placesToInsert.push({
            route_id: routeId,
            place_type: "taluka",
            place_name: taluka,
            place_id: generatePlaceId("taluka", taluka),
          });
        }
      });
    }

    // Extract pincodes
    if (intermediateData.pincodes && Array.isArray(intermediateData.pincodes)) {
      intermediateData.pincodes.forEach((pincode) => {
        if (pincode && pincode.trim()) {
          placesToInsert.push({
            route_id: routeId,
            place_type: "pincode",
            place_name: pincode,
            place_id: generatePlaceId("pincode", pincode),
          });
        }
      });
    }

    // Extract landmarks
    if (intermediateData.landmarks && Array.isArray(intermediateData.landmarks)) {
      intermediateData.landmarks.forEach((landmark) => {
        if (landmark && landmark.trim()) {
          placesToInsert.push({
            route_id: routeId,
            place_type: "landmark",
            place_name: landmark,
            place_id: generatePlaceId("landmark", landmark),
          });
        }
      });
    }

    // Bulk insert all places
    if (placesToInsert.length > 0) {
      await RoutePlace.bulkCreate(placesToInsert, { transaction });
      console.log(`[PlaceExtraction] Stored ${placesToInsert.length} places for route ${routeId}`);
    }

    return placesToInsert.length;
  } catch (error) {
    console.error("[PlaceExtraction] Error storing places:", error);
    throw error;
  }
}

/**
 * Generate a deterministic Place ID from place type and name
 * Format: {type}_{hash}
 * This ensures consistent IDs for the same place across different routes
 */
export function generatePlaceId(placeType, placeName) {
  // For now, use a simple hash-based approach
  // In production, integrate with Google Places API to get actual Place IDs
  const hash = crypto
    .createHash("sha256")
    .update(`${placeType}:${placeName}`)
    .digest("hex")
    .substring(0, 16);
  return `${placeType}_${hash}`;
}

/**
 * Find matching routes for a parcel using Place-ID based matching
 * Checks if parcel pickup and drop locations match route places
 */
export async function findMatchingRoutesByPlaceId(parcelData) {
  try {
    const pickupPlaceId = generatePlaceId("locality", parcelData.pickupCity);
    const dropPlaceId = generatePlaceId("locality", parcelData.dropCity);

    // Find routes that have both pickup and drop places
    const matchingRoutes = await RoutePlace.sequelize.query(
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
        type: RoutePlace.sequelize.QueryTypes.SELECT,
      }
    );

    return matchingRoutes.map((r) => r.route_id);
  } catch (error) {
    console.error("[PlaceMatching] Error finding matching routes:", error);
    throw error;
  }
}

/**
 * Find routes by place type and name
 * Useful for hierarchical matching (city → taluka → pincode)
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
 * Delete all places for a route (useful for updates)
 */
export async function deleteRoutePlaces(routeId, transaction) {
  try {
    const deleted = await RoutePlace.destroy({
      where: { route_id: routeId },
      transaction,
    });
    console.log(`[PlaceExtraction] Deleted ${deleted} places for route ${routeId}`);
    return deleted;
  } catch (error) {
    console.error("[PlaceExtraction] Error deleting route places:", error);
    throw error;
  }
}
