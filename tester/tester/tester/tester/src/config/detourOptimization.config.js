/**
 * Detour Optimization Configuration
 * Settings for Phase C optimization
 */

export const detourOptimizationConfig = {
  // Enable/disable optimization
  ENABLE_OPTIMIZATION: process.env.ENABLE_DETOUR_OPTIMIZATION !== 'false',

  // Maximum acceptable detour in kilometers
  MAX_DETOUR_KM: parseInt(process.env.MAX_DETOUR_KM) || 50,

  // Maximum detour ratio (detour / route_length)
  // 0.2 = 20% (detour should not exceed 20% of route length)
  DETOUR_RATIO_THRESHOLD: parseFloat(process.env.DETOUR_RATIO_THRESHOLD) || 0.2,

  // Maximum number of candidates to call API for
  MAX_CANDIDATES_FOR_API: parseInt(process.env.MAX_CANDIDATES_FOR_API) || 10,

  // Minimum number of candidates to call API for
  // Ensures we always call API for at least this many candidates
  MIN_CANDIDATES_FOR_API: parseInt(process.env.MIN_CANDIDATES_FOR_API) || 1,

  // Cache time-to-live in minutes
  CACHE_TTL_MINUTES: parseInt(process.env.CACHE_TTL_MINUTES) || 1440, // 24 hours

  // Cost per API call in USD
  COST_PER_API_CALL: parseFloat(process.env.COST_PER_API_CALL) || 0.01,

  // Enable cost tracking
  ENABLE_COST_TRACKING: process.env.ENABLE_COST_TRACKING !== 'false',

  // Enable cache
  ENABLE_CACHE: process.env.ENABLE_CACHE !== 'false',

  // Log optimization metrics
  LOG_METRICS: process.env.LOG_OPTIMIZATION_METRICS !== 'false',

  // Validation
  validate() {
    const errors = [];

    if (this.MAX_CANDIDATES_FOR_API < this.MIN_CANDIDATES_FOR_API) {
      errors.push('MAX_CANDIDATES_FOR_API must be >= MIN_CANDIDATES_FOR_API');
    }

    if (this.DETOUR_RATIO_THRESHOLD < 0 || this.DETOUR_RATIO_THRESHOLD > 1) {
      errors.push('DETOUR_RATIO_THRESHOLD must be between 0 and 1');
    }

    if (this.MAX_DETOUR_KM < 0) {
      errors.push('MAX_DETOUR_KM must be >= 0');
    }

    if (this.CACHE_TTL_MINUTES < 0) {
      errors.push('CACHE_TTL_MINUTES must be >= 0');
    }

    if (this.COST_PER_API_CALL < 0) {
      errors.push('COST_PER_API_CALL must be >= 0');
    }

    if (errors.length > 0) {
      console.error('[DetourOptimizationConfig] Validation errors:');
      errors.forEach((error) => console.error(`  - ${error}`));
      return false;
    }

    return true;
  },

  // Get configuration summary
  getSummary() {
    return {
      enabled: this.ENABLE_OPTIMIZATION,
      max_detour_km: this.MAX_DETOUR_KM,
      detour_ratio_threshold: this.DETOUR_RATIO_THRESHOLD,
      max_candidates_for_api: this.MAX_CANDIDATES_FOR_API,
      min_candidates_for_api: this.MIN_CANDIDATES_FOR_API,
      cache_ttl_minutes: this.CACHE_TTL_MINUTES,
      cost_per_api_call: this.COST_PER_API_CALL,
      cost_tracking_enabled: this.ENABLE_COST_TRACKING,
      cache_enabled: this.ENABLE_CACHE,
    };
  },
};

// Validate on load
if (!detourOptimizationConfig.validate()) {
  console.warn('[DetourOptimizationConfig] Configuration validation failed');
}

console.log('[DetourOptimizationConfig] Loaded:', detourOptimizationConfig.getSummary());

export default detourOptimizationConfig;
