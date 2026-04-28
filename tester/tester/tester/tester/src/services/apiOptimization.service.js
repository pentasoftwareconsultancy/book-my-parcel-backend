/**
 * API Optimization Service
 * Reduces API calls by pre-filtering and ranking candidates
 * Saves 70-90% on API costs
 */

import {
  estimateDetourGeometry,
  rankByDetour,
  filterByDetour,
  getDetourStatistics,
} from './detourEstimation.service.js';

/**
 * Pre-filter candidates using geometry-based detour estimation
 * Eliminates candidates with unacceptable detours before API calls
 * 
 * @param {Array<Object>} candidates - Array of candidate routes
 * @param {number} pickupLon - Pickup longitude
 * @param {number} pickupLat - Pickup latitude
 * @param {number} dropLon - Drop longitude
 * @param {number} dropLat - Drop latitude
 * @param {number} maxDetourKm - Maximum acceptable detour
 * @param {number} detourRatioThreshold - Maximum detour ratio
 * @returns {Promise<Array>} Filtered candidates
 */
export async function preFilterCandidates(
  candidates,
  pickupLon,
  pickupLat,
  dropLon,
  dropLat,
  maxDetourKm = 50,
  detourRatioThreshold = 0.2
) {
  try {
    if (!Array.isArray(candidates) || candidates.length === 0) {
      console.log('[APIOptimization] No candidates to pre-filter');
      return [];
    }

    console.log(`[APIOptimization] Pre-filtering ${candidates.length} candidates`);

    // Rank by detour
    const ranked = await rankByDetour(
      candidates,
      pickupLon,
      pickupLat,
      dropLon,
      dropLat
    );

    // Filter by threshold
    const filtered = filterByDetour(
      ranked,
      maxDetourKm,
      detourRatioThreshold
    );

    console.log(
      `[APIOptimization] Pre-filtering result: ${candidates.length} → ${filtered.length} candidates (${((1 - filtered.length / candidates.length) * 100).toFixed(0)}% reduction)`
    );

    return filtered;
  } catch (error) {
    console.error('[APIOptimization] Error pre-filtering candidates:', error);
    return candidates; // Fallback to all candidates
  }
}

/**
 * Select top N candidates for API calls
 * Prioritizes candidates with lowest estimated detour
 * 
 * @param {Array<Object>} candidates - Array of candidates (should be ranked by detour)
 * @param {number} maxCandidates - Maximum candidates to select
 * @returns {Array} Top N candidates
 */
export function selectTopCandidates(candidates, maxCandidates = 10) {
  if (!Array.isArray(candidates)) {
    return [];
  }

  if (candidates.length <= maxCandidates) {
    console.log(`[APIOptimization] All ${candidates.length} candidates selected (below max)`);
    return candidates;
  }

  const selected = candidates.slice(0, maxCandidates);
  console.log(
    `[APIOptimization] Selected top ${maxCandidates} of ${candidates.length} candidates`
  );

  return selected;
}

/**
 * Calculate API call reduction
 * 
 * @param {number} originalCount - Original number of candidates
 * @param {number} optimizedCount - Number of candidates after optimization
 * @returns {Object} Reduction stats {calls_saved, reduction_percent, cost_saved}
 */
export function calculateAPIReduction(originalCount, optimizedCount, costPerCall = 0.01) {
  if (originalCount <= 0) {
    return null;
  }

  const calls_saved = originalCount - optimizedCount;
  const reduction_percent = (calls_saved / originalCount) * 100;
  const cost_saved = calls_saved * costPerCall;

  console.log(
    `[APIOptimization] API reduction: ${originalCount} → ${optimizedCount} calls, saved ${calls_saved} calls (${reduction_percent.toFixed(0)}%), cost saved: $${cost_saved.toFixed(4)}`
  );

  return {
    calls_saved,
    reduction_percent: parseFloat(reduction_percent.toFixed(2)),
    cost_saved: parseFloat(cost_saved.toFixed(4)),
    original_count: originalCount,
    optimized_count: optimizedCount,
  };
}

/**
 * Prepare candidates for API calls
 * Combines pre-filtering and top selection
 * 
 * @param {Array<Object>} candidates - Array of candidate routes
 * @param {number} pickupLon - Pickup longitude
 * @param {number} pickupLat - Pickup latitude
 * @param {number} dropLon - Drop longitude
 * @param {number} dropLat - Drop latitude
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Prepared candidates and stats
 */
export async function prepareCandidatesForAPI(
  candidates,
  pickupLon,
  pickupLat,
  dropLon,
  dropLat,
  options = {}
) {
  try {
    const {
      maxDetourKm = 50,
      detourRatioThreshold = 0.2,
      maxCandidatesForAPI = 10,
      minCandidatesForAPI = 1,
    } = options;

    console.log('[APIOptimization] Preparing candidates for API calls');

    // Step 1: Pre-filter by detour
    const preFiltered = await preFilterCandidates(
      candidates,
      pickupLon,
      pickupLat,
      dropLon,
      dropLat,
      maxDetourKm,
      detourRatioThreshold
    );

    // Step 2: Ensure minimum candidates
    let forAPI = preFiltered;
    if (preFiltered.length < minCandidatesForAPI && candidates.length > 0) {
      console.log(
        `[APIOptimization] Pre-filtered candidates (${preFiltered.length}) below minimum (${minCandidatesForAPI}), using top candidates`
      );
      forAPI = selectTopCandidates(candidates, minCandidatesForAPI);
    }

    // Step 3: Select top N
    const selected = selectTopCandidates(forAPI, maxCandidatesForAPI);

    // Step 4: Calculate stats
    const stats = calculateAPIReduction(candidates.length, selected.length);
    const detourStats = getDetourStatistics(selected);

    return {
      candidates_for_api: selected,
      stats,
      detour_stats: detourStats,
      original_count: candidates.length,
      optimized_count: selected.length,
    };
  } catch (error) {
    console.error('[APIOptimization] Error preparing candidates:', error);
    return {
      candidates_for_api: selectTopCandidates(candidates, options.maxCandidatesForAPI || 10),
      stats: null,
      detour_stats: null,
      original_count: candidates.length,
      optimized_count: Math.min(candidates.length, options.maxCandidatesForAPI || 10),
    };
  }
}

/**
 * Compare estimated vs actual detours
 * Useful for validating estimation accuracy
 * 
 * @param {Array<Object>} candidates - Candidates with estimated_detour_km
 * @param {Array<Object>} apiResults - Results from API with actual_detour_km
 * @returns {Object} Comparison stats
 */
export function compareEstimatedVsActual(candidates, apiResults) {
  try {
    if (!Array.isArray(candidates) || !Array.isArray(apiResults)) {
      return null;
    }

    const comparisons = [];
    let totalError = 0;
    let totalAccuracy = 0;

    candidates.forEach((candidate) => {
      const apiResult = apiResults.find((r) => r.id === candidate.id);
      if (apiResult && apiResult.actual_detour_km) {
        const error = Math.abs(candidate.estimated_detour_km - apiResult.actual_detour_km);
        const errorPercent = (error / apiResult.actual_detour_km) * 100;
        const accuracy = Math.max(0, 100 - errorPercent);

        comparisons.push({
          route_id: candidate.id,
          estimated: candidate.estimated_detour_km,
          actual: apiResult.actual_detour_km,
          error,
          error_percent: errorPercent,
          accuracy,
        });

        totalError += error;
        totalAccuracy += accuracy;
      }
    });

    if (comparisons.length === 0) {
      return null;
    }

    const avgError = totalError / comparisons.length;
    const avgAccuracy = totalAccuracy / comparisons.length;

    console.log(
      `[APIOptimization] Estimation accuracy: ${avgAccuracy.toFixed(2)}% (avg error: ${avgError.toFixed(2)}km)`
    );

    return {
      comparisons,
      avg_error_km: parseFloat(avgError.toFixed(2)),
      avg_accuracy_percent: parseFloat(avgAccuracy.toFixed(2)),
      total_comparisons: comparisons.length,
    };
  } catch (error) {
    console.error('[APIOptimization] Error comparing estimates:', error);
    return null;
  }
}

/**
 * Get optimization metrics
 * 
 * @param {Object} optimizationResult - Result from prepareCandidatesForAPI
 * @returns {Object} Metrics for monitoring
 */
export function getOptimizationMetrics(optimizationResult) {
  if (!optimizationResult || !optimizationResult.stats) {
    return null;
  }

  const { stats, detour_stats, original_count, optimized_count } = optimizationResult;

  return {
    api_calls_saved: stats.calls_saved,
    reduction_percent: stats.reduction_percent,
    cost_saved_usd: stats.cost_saved,
    original_candidates: original_count,
    optimized_candidates: optimized_count,
    avg_detour_km: detour_stats?.avg,
    min_detour_km: detour_stats?.min,
    max_detour_km: detour_stats?.max,
    median_detour_km: detour_stats?.median,
  };
}

/**
 * Validate optimization configuration
 * 
 * @param {Object} config - Configuration object
 * @returns {boolean} True if valid
 */
export function validateConfig(config) {
  const required = [
    'maxDetourKm',
    'detourRatioThreshold',
    'maxCandidatesForAPI',
    'minCandidatesForAPI',
  ];

  for (const key of required) {
    if (config[key] === undefined || config[key] === null) {
      console.warn(`[APIOptimization] Missing config: ${key}`);
      return false;
    }
  }

  if (config.maxCandidatesForAPI < config.minCandidatesForAPI) {
    console.warn('[APIOptimization] maxCandidatesForAPI < minCandidatesForAPI');
    return false;
  }

  if (config.detourRatioThreshold < 0 || config.detourRatioThreshold > 1) {
    console.warn('[APIOptimization] detourRatioThreshold must be between 0 and 1');
    return false;
  }

  return true;
}

export default {
  preFilterCandidates,
  selectTopCandidates,
  calculateAPIReduction,
  prepareCandidatesForAPI,
  compareEstimatedVsActual,
  getOptimizationMetrics,
  validateConfig,
};
