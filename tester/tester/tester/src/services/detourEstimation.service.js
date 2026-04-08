/**
 * Detour Estimation Service
 * Uses geometry to estimate detours without calling expensive APIs
 * Provides lower-bound estimation for pre-filtering
 */

import sequelize from "../config/database.config.js";

/**
 * Estimate detour using geometry (lower-bound)
 * Calculates distance from pickup and drop to route
 * 
 * @param {string} routeId - Route UUID
 * @param {number} pickupLon - Pickup longitude
 * @param {number} pickupLat - Pickup latitude
 * @param {number} dropLon - Drop longitude
 * @param {number} dropLat - Drop latitude
 * @returns {Promise<Object>} Detour estimation {estimated_detour_km, pickup_distance_km, drop_distance_km}
 */
export async function estimateDetourGeometry(
  routeId,
  pickupLon,
  pickupLat,
  dropLon,
  dropLat
) {
  try {
    if (!routeId || !pickupLon || !pickupLat || !dropLon || !dropLat) {
      console.warn('[DetourEstimation] Invalid parameters for detour estimation');
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
      WHERE id = :routeId AND route_geom IS NOT NULL
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
      console.warn('[DetourEstimation] Route not found or has no geometry');
      return null;
    }

    const { pickup_distance_km, drop_distance_km, route_length_km } = result[0];
    const estimated_detour_km = pickup_distance_km + drop_distance_km;

    console.log(
      `[DetourEstimation] Estimated detour: ${estimated_detour_km.toFixed(2)}km (pickup: ${pickup_distance_km.toFixed(2)}km, drop: ${drop_distance_km.toFixed(2)}km)`
    );

    return {
      estimated_detour_km: parseFloat(estimated_detour_km.toFixed(2)),
      pickup_distance_km: parseFloat(pickup_distance_km.toFixed(2)),
      drop_distance_km: parseFloat(drop_distance_km.toFixed(2)),
      route_length_km: parseFloat(route_length_km.toFixed(2)),
    };
  } catch (error) {
    console.error('[DetourEstimation] Error estimating detour:', error);
    return null;
  }
}

/**
 * Calculate detour ratio (detour / route_length)
 * Useful for comparing detours across different route lengths
 * 
 * @param {number} estimatedDetour - Estimated detour in km
 * @param {number} routeLength - Route length in km
 * @returns {number} Detour ratio (0-1)
 */
export function calculateDetourRatio(estimatedDetour, routeLength) {
  if (!estimatedDetour || !routeLength || routeLength === 0) {
    return 0;
  }

  const ratio = estimatedDetour / routeLength;
  console.log(`[DetourEstimation] Detour ratio: ${(ratio * 100).toFixed(2)}%`);
  return ratio;
}

/**
 * Check if detour is acceptable based on threshold
 * 
 * @param {number} estimatedDetour - Estimated detour in km
 * @param {number} maxDetourKm - Maximum acceptable detour in km
 * @param {number} detourRatioThreshold - Maximum detour ratio (0-1)
 * @param {number} routeLength - Route length in km
 * @returns {boolean} True if detour is acceptable
 */
export function isDetourAcceptable(
  estimatedDetour,
  maxDetourKm = 50,
  detourRatioThreshold = 0.2,
  routeLength = null
) {
  if (!estimatedDetour) {
    return false;
  }

  // Check absolute detour
  if (estimatedDetour > maxDetourKm) {
    console.log(
      `[DetourEstimation] Detour ${estimatedDetour.toFixed(2)}km exceeds max ${maxDetourKm}km`
    );
    return false;
  }

  // Check detour ratio if route length provided
  if (routeLength && routeLength > 0) {
    const ratio = calculateDetourRatio(estimatedDetour, routeLength);
    if (ratio > detourRatioThreshold) {
      console.log(
        `[DetourEstimation] Detour ratio ${(ratio * 100).toFixed(2)}% exceeds threshold ${(detourRatioThreshold * 100).toFixed(2)}%`
      );
      return false;
    }
  }

  console.log(`[DetourEstimation] Detour is acceptable`);
  return true;
}

/**
 * Rank candidates by estimated detour
 * Lower detour = better ranking
 * 
 * @param {Array<Object>} candidates - Array of {id, route_length_km, ...}
 * @param {number} pickupLon - Pickup longitude
 * @param {number} pickupLat - Pickup latitude
 * @param {number} dropLon - Drop longitude
 * @param {number} dropLat - Drop latitude
 * @returns {Promise<Array>} Candidates ranked by detour
 */
export async function rankByDetour(
  candidates,
  pickupLon,
  pickupLat,
  dropLon,
  dropLat
) {
  try {
    if (!Array.isArray(candidates) || candidates.length === 0) {
      console.warn('[DetourEstimation] No candidates to rank');
      return [];
    }

    console.log(`[DetourEstimation] Ranking ${candidates.length} candidates by detour`);

    // Estimate detour for each candidate
    const withDetours = await Promise.all(
      candidates.map(async (candidate) => {
        const detour = await estimateDetourGeometry(
          candidate.id,
          pickupLon,
          pickupLat,
          dropLon,
          dropLat
        );

        if (!detour) {
          return { ...candidate, estimated_detour_km: Infinity };
        }

        return {
          ...candidate,
          estimated_detour_km: detour.estimated_detour_km,
          detour_ratio: calculateDetourRatio(detour.estimated_detour_km, candidate.route_length_km),
        };
      })
    );

    // Sort by detour (ascending)
    const sorted = withDetours.sort(
      (a, b) => a.estimated_detour_km - b.estimated_detour_km
    );

    console.log(
      `[DetourEstimation] Ranked candidates: ${sorted.map((c) => c.estimated_detour_km.toFixed(2)).join(', ')} km`
    );

    return sorted;
  } catch (error) {
    console.error('[DetourEstimation] Error ranking candidates:', error);
    return candidates;
  }
}

/**
 * Filter candidates by detour threshold
 * 
 * @param {Array<Object>} candidates - Array of candidates with estimated_detour_km
 * @param {number} maxDetourKm - Maximum acceptable detour
 * @param {number} detourRatioThreshold - Maximum detour ratio
 * @returns {Array} Filtered candidates
 */
export function filterByDetour(
  candidates,
  maxDetourKm = 50,
  detourRatioThreshold = 0.2
) {
  if (!Array.isArray(candidates)) {
    return [];
  }

  const filtered = candidates.filter((candidate) => {
    return isDetourAcceptable(
      candidate.estimated_detour_km,
      maxDetourKm,
      detourRatioThreshold,
      candidate.route_length_km
    );
  });

  console.log(
    `[DetourEstimation] Filtered ${candidates.length} candidates to ${filtered.length} by detour threshold`
  );

  return filtered;
}

/**
 * Get detour statistics for a set of candidates
 * 
 * @param {Array<Object>} candidates - Array of candidates with estimated_detour_km
 * @returns {Object} Statistics {min, max, avg, median}
 */
export function getDetourStatistics(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  const detours = candidates
    .map((c) => c.estimated_detour_km)
    .filter((d) => d !== undefined && d !== null)
    .sort((a, b) => a - b);

  if (detours.length === 0) {
    return null;
  }

  const min = detours[0];
  const max = detours[detours.length - 1];
  const avg = detours.reduce((a, b) => a + b, 0) / detours.length;
  const median = detours[Math.floor(detours.length / 2)];

  console.log(
    `[DetourEstimation] Detour stats: min=${min.toFixed(2)}km, max=${max.toFixed(2)}km, avg=${avg.toFixed(2)}km, median=${median.toFixed(2)}km`
  );

  return {
    min: parseFloat(min.toFixed(2)),
    max: parseFloat(max.toFixed(2)),
    avg: parseFloat(avg.toFixed(2)),
    median: parseFloat(median.toFixed(2)),
    count: detours.length,
  };
}

/**
 * Compare estimated detour with actual detour
 * Useful for validating estimation accuracy
 * 
 * @param {number} estimated - Estimated detour in km
 * @param {number} actual - Actual detour in km
 * @returns {Object} Comparison {error_km, error_percent, accuracy}
 */
export function compareDetours(estimated, actual) {
  if (!estimated || !actual) {
    return null;
  }

  const error_km = Math.abs(estimated - actual);
  const error_percent = (error_km / actual) * 100;
  const accuracy = Math.max(0, 100 - error_percent);

  console.log(
    `[DetourEstimation] Comparison: estimated=${estimated.toFixed(2)}km, actual=${actual.toFixed(2)}km, error=${error_km.toFixed(2)}km (${error_percent.toFixed(2)}%), accuracy=${accuracy.toFixed(2)}%`
  );

  return {
    error_km: parseFloat(error_km.toFixed(2)),
    error_percent: parseFloat(error_percent.toFixed(2)),
    accuracy: parseFloat(accuracy.toFixed(2)),
  };
}

/**
 * Estimate detour for multiple candidates in batch
 * More efficient than calling estimateDetourGeometry individually
 * 
 * @param {Array<string>} routeIds - Array of route IDs
 * @param {number} pickupLon - Pickup longitude
 * @param {number} pickupLat - Pickup latitude
 * @param {number} dropLon - Drop longitude
 * @param {number} dropLat - Drop latitude
 * @returns {Promise<Object>} Map of routeId -> detour estimation
 */
export async function estimateDetourBatch(
  routeIds,
  pickupLon,
  pickupLat,
  dropLon,
  dropLat
) {
  try {
    if (!Array.isArray(routeIds) || routeIds.length === 0) {
      console.warn('[DetourEstimation] No route IDs for batch estimation');
      return {};
    }

    console.log(`[DetourEstimation] Batch estimating detour for ${routeIds.length} routes`);

    const result = await sequelize.query(
      `
      SELECT 
        tr.id,
        ST_Distance(
          tr.route_geom,
          ST_SetSRID(ST_MakePoint(:pickupLon, :pickupLat), 4326)
        ) * 111.32 as pickup_distance_km,
        ST_Distance(
          tr.route_geom,
          ST_SetSRID(ST_MakePoint(:dropLon, :dropLat), 4326)
        ) * 111.32 as drop_distance_km,
        ST_Length(tr.route_geom) * 111.32 as route_length_km
      FROM traveller_routes tr
      WHERE tr.id = ANY(:routeIds) AND tr.route_geom IS NOT NULL
      `,
      {
        replacements: {
          routeIds,
          pickupLon,
          pickupLat,
          dropLon,
          dropLat,
        },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const estimations = {};
    result.forEach((row) => {
      const estimated_detour_km = row.pickup_distance_km + row.drop_distance_km;
      estimations[row.id] = {
        estimated_detour_km: parseFloat(estimated_detour_km.toFixed(2)),
        pickup_distance_km: parseFloat(row.pickup_distance_km.toFixed(2)),
        drop_distance_km: parseFloat(row.drop_distance_km.toFixed(2)),
        route_length_km: parseFloat(row.route_length_km.toFixed(2)),
      };
    });

    console.log(`[DetourEstimation] Batch estimation complete: ${Object.keys(estimations).length} routes`);

    return estimations;
  } catch (error) {
    console.error('[DetourEstimation] Error in batch estimation:', error);
    return {};
  }
}

export default {
  estimateDetourGeometry,
  calculateDetourRatio,
  isDetourAcceptable,
  rankByDetour,
  filterByDetour,
  getDetourStatistics,
  compareDetours,
  estimateDetourBatch,
};
