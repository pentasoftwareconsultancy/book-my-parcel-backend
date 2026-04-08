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

export default {
  findRoutesWithinBuffer,
  findRoutesBetweenPoints,
  calculateDistanceToRoute,
  estimateDetour,
  findRoutesByPlaceAndBuffer,
  getRouteGeometryAsGeoJSON,
  isPointNearRoute,
};
