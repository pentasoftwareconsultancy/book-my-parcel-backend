/**
 * Spatial Matching Service
 * Uses PostGIS geometry to find routes near parcel locations
 * Implements buffer-based matching and distance calculations
 */

import sequelize from "../config/database.config.js";
import TravellerRoute from "../modules/traveller/travellerRoute.model.js";

/**
 * Find routes within buffer distance of a point
 * Uses ST_DWithin for efficient spatial queries
 * 
 * @param {number} longitude - Pickup longitude
 * @param {number} latitude - Pickup latitude
 * @param {number} bufferKm - Buffer distance in kilometers
 * @returns {Promise<Array>} Routes within buffer
 */
export async function findRoutesWithinBuffer(longitude, latitude, bufferKm = 5) {
  try {
    if (!longitude || !latitude || !bufferKm) {
      console.warn('[SpatialMatching] Invalid parameters for buffer search');
      return [];
    }

    // Convert km to degrees (approximate: 1 degree ≈ 111.32 km)
    const bufferDegrees = bufferKm / 111.32;

    console.log(
      `[SpatialMatching] Searching for routes within ${bufferKm}km of (${latitude}, ${longitude})`
    );

    const routes = await sequelize.query(
      `
      SELECT 
        id,
        traveller_profile_id,
        vehicle_type,
        max_weight_kg,
        available_capacity_kg,
        status,
        ST_Distance(
          route_geom,
          ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)
        ) * 111.32 as distance_km
      FROM traveller_routes
      WHERE route_geom IS NOT NULL
        AND status = 'ACTIVE'
        AND ST_DWithin(
          route_geom,
          ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326),
          :bufferDegrees
        )
      ORDER BY distance_km ASC
      `,
      {
        replacements: {
          longitude,
          latitude,
          bufferDegrees,
        },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    console.log(`[SpatialMatching] Found ${routes.length} routes within buffer`);
    return routes;
  } catch (error) {
    console.error('[SpatialMatching] Error finding routes within buffer:', error);
    throw error;
  }
}

/**
 * Find routes that pass near both pickup and drop points
 * Combines spatial matching for both locations
 * 
 * @param {number} pickupLon - Pickup longitude
 * @param {number} pickupLat - Pickup latitude
 * @param {number} dropLon - Drop longitude
 * @param {number} dropLat - Drop latitude
 * @param {number} bufferKm - Buffer distance in kilometers
 * @returns {Promise<Array>} Routes matching both locations
 */
export async function findRoutesBetweenPoints(
  pickupLon,
  pickupLat,
  dropLon,
  dropLat,
  bufferKm = 5
) {
  try {
    if (!pickupLon || !pickupLat || !dropLon || !dropLat) {
      console.warn('[SpatialMatching] Invalid coordinates for between-points search');
      return [];
    }

    const bufferDegrees = bufferKm / 111.32;

    console.log(
      `[SpatialMatching] Searching for routes between (${pickupLat}, ${pickupLon}) and (${dropLat}, ${dropLon})`
    );

    const routes = await sequelize.query(
      `
      SELECT 
        id,
        traveller_profile_id,
        vehicle_type,
        max_weight_kg,
        available_capacity_kg,
        status,
        ST_Distance(
          route_geom,
          ST_SetSRID(ST_MakePoint(:pickupLon, :pickupLat), 4326)
        ) * 111.32 as pickup_distance_km,
        ST_Distance(
          route_geom,
          ST_SetSRID(ST_MakePoint(:dropLon, :dropLat), 4326)
        ) * 111.32 as drop_distance_km
      FROM traveller_routes
      WHERE route_geom IS NOT NULL
        AND status = 'ACTIVE'
        AND ST_DWithin(
          route_geom,
          ST_SetSRID(ST_MakePoint(:pickupLon, :pickupLat), 4326),
          :bufferDegrees
        )
        AND ST_DWithin(
          route_geom,
          ST_SetSRID(ST_MakePoint(:dropLon, :dropLat), 4326),
          :bufferDegrees
        )
      ORDER BY (
        ST_Distance(route_geom, ST_SetSRID(ST_MakePoint(:pickupLon, :pickupLat), 4326)) +
        ST_Distance(route_geom, ST_SetSRID(ST_MakePoint(:dropLon, :dropLat), 4326))
      ) ASC
      `,
      {
        replacements: {
          pickupLon,
          pickupLat,
          dropLon,
          dropLat,
          bufferDegrees,
        },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    console.log(`[SpatialMatching] Found ${routes.length} routes between points`);
    return routes;
  } catch (error) {
    console.error('[SpatialMatching] Error finding routes between points:', error);
    throw error;
  }
}

/**
 * Calculate distance from a point to a route
 * 
 * @param {string} routeId - Route UUID
 * @param {number} longitude - Point longitude
 * @param {number} latitude - Point latitude
 * @returns {Promise<number>} Distance in kilometers
 */
export async function calculateDistanceToRoute(routeId, longitude, latitude) {
  try {
    if (!routeId || !longitude || !latitude) {
      console.warn('[SpatialMatching] Invalid parameters for distance calculation');
      return null;
    }

    const result = await sequelize.query(
      `
      SELECT 
        ST_Distance(
          route_geom,
          ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)
        ) * 111.32 as distance_km
      FROM traveller_routes
      WHERE id = :routeId
      `,
      {
        replacements: {
          routeId,
          longitude,
          latitude,
        },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const distance = result[0]?.distance_km || null;
    console.log(`[SpatialMatching] Distance from point to route: ${distance?.toFixed(2)} km`);
    return distance;
  } catch (error) {
    console.error('[SpatialMatching] Error calculating distance to route:', error);
    throw error;
  }
}

/**
 * Estimate detour for a parcel on a route
 * Uses geometry to estimate additional distance
 * 
 * @param {string} routeId - Route UUID
 * @param {number} pickupLon - Pickup longitude
 * @param {number} pickupLat - Pickup latitude
 * @param {number} dropLon - Drop longitude
 * @param {number} dropLat - Drop latitude
 * @returns {Promise<Object>} Detour estimation {pickup_distance, drop_distance, estimated_detour}
 */
export async function estimateDetour(routeId, pickupLon, pickupLat, dropLon, dropLat) {
  try {
    if (!routeId || !pickupLon || !pickupLat || !dropLon || !dropLat) {
      console.warn('[SpatialMatching] Invalid parameters for detour estimation');
      return null;
    }

    const result = await sequelize.query(
      `
      SELECT 
        ST_Distance(
          route_geom,
          ST_SetSRID(ST_MakePoint(:pickupLon, :pickupLat), 4326)
        ) * 111.32 as pickup_distance_km,
        ST_Distance(
          route_geom,
          ST_SetSRID(ST_MakePoint(:dropLon, :dropLat), 4326)
        ) * 111.32 as drop_distance_km,
        ST_Length(route_geom) * 111.32 as route_length_km
      FROM traveller_routes
      WHERE id = :routeId
      `,
      {
        replacements: {
          routeId,
          pickupLon,
          pickupLat,
          dropLon,
          dropLat,
        },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    if (!result[0]) {
      console.warn('[SpatialMatching] Route not found for detour estimation');
      return null;
    }

    const { pickup_distance_km, drop_distance_km, route_length_km } = result[0];
    const estimated_detour = pickup_distance_km + drop_distance_km;

    console.log(
      `[SpatialMatching] Detour estimation: pickup=${pickup_distance_km?.toFixed(2)}km, drop=${drop_distance_km?.toFixed(2)}km, total=${estimated_detour?.toFixed(2)}km`
    );

    return {
      pickup_distance_km: parseFloat(pickup_distance_km?.toFixed(2)),
      drop_distance_km: parseFloat(drop_distance_km?.toFixed(2)),
      estimated_detour: parseFloat(estimated_detour?.toFixed(2)),
      route_length_km: parseFloat(route_length_km?.toFixed(2)),
    };
  } catch (error) {
    console.error('[SpatialMatching] Error estimating detour:', error);
    throw error;
  }
}

/**
 * Find routes with combined Place-ID and spatial matching
 * First filters by Place-ID, then applies spatial buffer
 * 
 * @param {Object} parcelData - Parcel location data
 * @param {number} bufferKm - Buffer distance in kilometers
 * @returns {Promise<Array>} Matching routes
 */
export async function findRoutesByPlaceAndBuffer(parcelData, bufferKm = 5) {
  try {
    if (!parcelData || !parcelData.pickupLon || !parcelData.pickupLat) {
      console.warn('[SpatialMatching] Invalid parcel data for place and buffer search');
      return [];
    }

    const bufferDegrees = bufferKm / 111.32;

    console.log(
      `[SpatialMatching] Searching by Place-ID and spatial buffer (${bufferKm}km)`
    );

    // This query combines Place-ID matching with spatial buffer
    const routes = await sequelize.query(
      `
      SELECT DISTINCT
        tr.id,
        tr.traveller_profile_id,
        tr.vehicle_type,
        tr.max_weight_kg,
        tr.available_capacity_kg,
        tr.status,
        ST_Distance(
          tr.route_geom,
          ST_SetSRID(ST_MakePoint(:pickupLon, :pickupLat), 4326)
        ) * 111.32 as distance_km
      FROM traveller_routes tr
      WHERE tr.route_geom IS NOT NULL
        AND tr.status = 'ACTIVE'
        AND ST_DWithin(
          tr.route_geom,
          ST_SetSRID(ST_MakePoint(:pickupLon, :pickupLat), 4326),
          :bufferDegrees
        )
      ORDER BY distance_km ASC
      `,
      {
        replacements: {
          pickupLon: parcelData.pickupLon,
          pickupLat: parcelData.pickupLat,
          bufferDegrees,
        },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    console.log(`[SpatialMatching] Found ${routes.length} routes by place and buffer`);
    return routes;
  } catch (error) {
    console.error('[SpatialMatching] Error finding routes by place and buffer:', error);
    throw error;
  }
}

/**
 * Get route geometry as GeoJSON
 * Useful for frontend visualization
 * 
 * @param {string} routeId - Route UUID
 * @returns {Promise<Object>} GeoJSON FeatureCollection
 */
export async function getRouteGeometryAsGeoJSON(routeId) {
  try {
    if (!routeId) {
      console.warn('[SpatialMatching] Invalid route ID for GeoJSON');
      return null;
    }

    const result = await sequelize.query(
      `
      SELECT 
        id,
        ST_AsGeoJSON(route_geom) as geometry
      FROM traveller_routes
      WHERE id = :routeId
      `,
      {
        replacements: { routeId },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    if (!result[0]) {
      console.warn('[SpatialMatching] Route not found for GeoJSON');
      return null;
    }

    const { id, geometry } = result[0];
    const geoJSON = {
      type: 'Feature',
      id,
      geometry: JSON.parse(geometry),
      properties: {
        routeId: id,
      },
    };

    console.log(`[SpatialMatching] Generated GeoJSON for route ${routeId}`);
    return geoJSON;
  } catch (error) {
    console.error('[SpatialMatching] Error getting route geometry as GeoJSON:', error);
    throw error;
  }
}

/**
 * Check if point is within route buffer
 * 
 * @param {string} routeId - Route UUID
 * @param {number} longitude - Point longitude
 * @param {number} latitude - Point latitude
 * @param {number} bufferKm - Buffer distance in kilometers
 * @returns {Promise<boolean>} True if point is within buffer
 */
export async function isPointNearRoute(routeId, longitude, latitude, bufferKm = 5) {
  try {
    if (!routeId || !longitude || !latitude) {
      console.warn('[SpatialMatching] Invalid parameters for point-near-route check');
      return false;
    }

    const bufferDegrees = bufferKm / 111.32;

    const result = await sequelize.query(
      `
      SELECT 
        ST_DWithin(
          route_geom,
          ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326),
          :bufferDegrees
        ) as is_near
      FROM traveller_routes
      WHERE id = :routeId
      `,
      {
        replacements: {
          routeId,
          longitude,
          latitude,
          bufferDegrees,
        },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const isNear = result[0]?.is_near || false;
    console.log(`[SpatialMatching] Point near route: ${isNear}`);
    return isNear;
  } catch (error) {
    console.error('[SpatialMatching] Error checking if point is near route:', error);
    throw error;
  }
}

/**
 * Calculate Haversine distance between two geographic points
 * Used for walking distance calculations and stop proximity checks
 * 
 * @param {number} lat1 - First point latitude
 * @param {number} lng1 - First point longitude
 * @param {number} lat2 - Second point latitude
 * @param {number} lng2 - Second point longitude
 * @returns {number} Distance in kilometers
 */
export function haversineDistance(lat1, lng1, lat2, lng2) {
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

/**
 * Check if a point is within walking distance of any stop in a transit route
 * Used for bus/train routes instead of proximity to route geometry
 * 
 * @param {number} lat - Latitude of point (pickup or drop location)
 * @param {number} lng - Longitude of point
 * @param {Array} stops - Array of stop objects with `lat` and `lng` properties
 * @param {number} maxWalkingMeters - Max allowed walking distance (default 2000 = 2 km)
 * @returns {boolean} True if within walking distance of any stop
 */
export function isPointNearStop(lat, lng, stops, maxWalkingMeters = 2000) {
  try {
    if (!stops || !Array.isArray(stops) || stops.length === 0) {
      console.warn('[SpatialMatching] No stops provided for proximity check');
      return false;
    }

    const maxWalkingKm = maxWalkingMeters / 1000;
    const isNear = stops.some(stop => {
      if (!stop.lat || !stop.lng) {
        return false;
      }
      const distance = haversineDistance(lat, lng, stop.lat, stop.lng);
      return distance <= maxWalkingKm;
    });

    console.log(`[SpatialMatching] Point (${lat}, ${lng}) near stop: ${isNear}`);
    return isNear;
  } catch (error) {
    console.error('[SpatialMatching] Error checking point proximity to stops:', error);
    return false;
  }
}

/**
 * Check if both pickup and drop locations are within walking distance of transit stops
 * AND verify they are in the correct order (pickup before drop)
 * Used for validating parcel eligibility for bus/train routes
 * 
 * @param {number} pickupLat - Pickup latitude
 * @param {number} pickupLng - Pickup longitude
 * @param {number} dropLat - Drop latitude
 * @param {number} dropLng - Drop longitude
 * @param {Array} stops - Array of stop objects with `lat` and `lng` properties
 * @param {number} maxWalkingMeters - Max allowed walking distance (default 2000 = 2 km)
 * @returns {boolean} True if both locations are near stops in correct order
 */
export function isParcelNearTransitRoute(pickupLat, pickupLng, dropLat, dropLng, stops, maxWalkingMeters = 2000) {
  try {
    if (!stops || !Array.isArray(stops) || stops.length === 0) {
      console.warn('[SpatialMatching] No stops provided for transit route check');
      return false;
    }

    const maxWalkingKm = maxWalkingMeters / 1000;

    // Find nearest stop to pickup
    let pickupStopIndex = -1;
    let pickupMinDist = Infinity;
    stops.forEach((stop, idx) => {
      if (stop.lat && stop.lng) {
        const distance = haversineDistance(pickupLat, pickupLng, stop.lat, stop.lng);
        if (distance <= maxWalkingKm && distance < pickupMinDist) {
          pickupMinDist = distance;
          pickupStopIndex = idx;
        }
      }
    });

    // Find nearest stop to delivery
    let dropStopIndex = -1;
    let dropMinDist = Infinity;
    stops.forEach((stop, idx) => {
      if (stop.lat && stop.lng) {
        const distance = haversineDistance(dropLat, dropLng, stop.lat, stop.lng);
        if (distance <= maxWalkingKm && distance < dropMinDist) {
          dropMinDist = distance;
          dropStopIndex = idx;
        }
      }
    });

    // Both must be within walking distance
    const pickupNear = pickupStopIndex >= 0;
    const dropNear = dropStopIndex >= 0;

    if (!pickupNear || !dropNear) {
      console.log(`[SpatialMatching] Parcel not eligible: pickup near=${pickupNear}, drop near=${dropNear}`);
      return false;
    }

    // CRITICAL FIX: Verify correct order (pickup comes before drop in route)
    if (pickupStopIndex > dropStopIndex) {
      console.warn(`[SpatialMatching] REVERSE DIRECTION DETECTED: Pickup at stop #${pickupStopIndex} (${stops[pickupStopIndex]?.name}), Drop at stop #${dropStopIndex} (${stops[dropStopIndex]?.name})`);
      console.warn(`[SpatialMatching] Route goes backward - REJECTING parcel`);
      return false;
    }

    const isEligible = true;
    console.log(`[SpatialMatching] ✓ Parcel eligible: Pickup at stop #${pickupStopIndex} (${stops[pickupStopIndex]?.name}), Drop at stop #${dropStopIndex} (${stops[dropStopIndex]?.name})`);
    return isEligible;
  } catch (error) {
    console.error('[SpatialMatching] Error checking parcel eligibility for transit route:', error);
    return false;
  }
}

/**
 * Calculate walking distance from a point to the nearest stop
 * Used for computing detour distance for transit routes
 * 
 * @param {number} lat - Latitude of point
 * @param {number} lng - Longitude of point
 * @param {Array} stops - Array of stop objects with `lat` and `lng` properties
 * @returns {number} Walking distance to nearest stop in kilometers (or null if no stops)
 */
export function calculateWalkingDistanceToNearestStop(lat, lng, stops) {
  try {
    if (!stops || !Array.isArray(stops) || stops.length === 0) {
      console.warn('[SpatialMatching] No stops available for distance calculation');
      return null;
    }

    const distances = stops
      .filter(stop => stop.lat && stop.lng)
      .map(stop => ({
        distance: haversineDistance(lat, lng, stop.lat, stop.lng),
        stop: stop.name || 'Unknown Stop',
      }));

    if (distances.length === 0) {
      return null;
    }

    const nearest = distances.reduce((prev, curr) => 
      curr.distance < prev.distance ? curr : prev
    );

    console.log(`[SpatialMatching] Nearest stop to (${lat}, ${lng}): ${nearest.stop} (${nearest.distance.toFixed(2)}km away)`);
    return parseFloat(nearest.distance.toFixed(2));
  } catch (error) {
    console.error('[SpatialMatching] Error calculating walking distance to nearest stop:', error);
    return null;
  }
}

/**
 * Calculate total walking detour for a parcel on a transit route
 * Returns the sum of walking distances from pickup to nearest stop + drop to nearest stop
 * 
 * @param {number} pickupLat - Pickup latitude
 * @param {number} pickupLng - Pickup longitude
 * @param {number} dropLat - Drop latitude
 * @param {number} dropLng - Drop longitude
 * @param {Array} stops - Array of stop objects with `lat` and `lng` properties
 * @returns {Object} Walking detour details {pickupWalkingKm, dropWalkingKm, totalWalkingKm} or null if error
 */
export function calculateTransitDetour(pickupLat, pickupLng, dropLat, dropLng, stops) {
  try {
    if (!stops || !Array.isArray(stops) || stops.length === 0) {
      console.warn('[SpatialMatching] No stops available for transit detour calculation');
      return null;
    }

    const pickupWalkingKm = calculateWalkingDistanceToNearestStop(pickupLat, pickupLng, stops);
    const dropWalkingKm = calculateWalkingDistanceToNearestStop(dropLat, dropLng, stops);

    if (pickupWalkingKm === null || dropWalkingKm === null) {
      return null;
    }

    const totalWalkingKm = parseFloat((pickupWalkingKm + dropWalkingKm).toFixed(2));

    console.log(`[SpatialMatching] Transit detour: pickup=${pickupWalkingKm}km, drop=${dropWalkingKm}km, total=${totalWalkingKm}km`);
    return {
      pickupWalkingKm,
      dropWalkingKm,
      totalWalkingKm,
    };
  } catch (error) {
    console.error('[SpatialMatching] Error calculating transit detour:', error);
    return null;
  }
}

export default {
  findRoutesWithinBuffer,
  findRoutesBetweenPoints,
  calculateDistanceToRoute,
  estimateDetour,
  findRoutesByPlaceAndBuffer,
  getRouteGeometryAsGeoJSON,
  isPointNearRoute,
  haversineDistance,
  isPointNearStop,
  isParcelNearTransitRoute,
  calculateWalkingDistanceToNearestStop,
  calculateTransitDetour,
};
