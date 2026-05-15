/**
 * Cost Tracking Service
 * Tracks API usage and calculates cost savings
 * Provides metrics for monitoring and optimization
 */

import sequelize from "../config/database.config.js";

/**
 * Track an API call
 * 
 * @param {string} matchingRequestId - Matching request UUID
 * @param {string} apiType - Type of API (routes, geocoding, places)
 * @param {number} costUsd - Cost in USD
 * @param {number} apiCallsSaved - Number of API calls saved
 * @returns {Promise<boolean>} True if tracked successfully
 */
export async function trackAPICall(
  matchingRequestId,
  apiType,
  costUsd = 0.01,
  apiCallsSaved = 0
) {
  try {
    if (!matchingRequestId || !apiType) {
      console.warn('[CostTracking] Invalid parameters for tracking');
      return false;
    }

    await sequelize.query(
      `
      INSERT INTO cost_tracking (
        matching_request_id,
        api_type,
        cost_usd,
        api_calls_saved
      ) VALUES (
        :matchingRequestId,
        :apiType,
        :costUsd,
        :apiCallsSaved
      )
      `,
      {
        replacements: {
          matchingRequestId,
          apiType,
          costUsd,
          apiCallsSaved,
        },
      }
    );

    console.log(
      `[CostTracking] Tracked API call: ${apiType}, cost: $${costUsd.toFixed(4)}, saved: ${apiCallsSaved}`
    );
    return true;
  } catch (error) {
    console.error('[CostTracking] Error tracking API call:', error);
    return false;
  }
}

/**
 * Calculate cost savings for a matching request
 * 
 * @param {number} originalApiCalls - Original number of API calls
 * @param {number} optimizedApiCalls - Number of API calls after optimization
 * @param {number} costPerCall - Cost per API call in USD
 * @returns {Object} Savings calculation
 */
export function calculateCostSavings(
  originalApiCalls,
  optimizedApiCalls,
  costPerCall = 0.01
) {
  if (originalApiCalls <= 0) {
    return null;
  }

  const calls_saved = originalApiCalls - optimizedApiCalls;
  const cost_saved = calls_saved * costPerCall;
  const savings_percent = (calls_saved / originalApiCalls) * 100;

  console.log(
    `[CostTracking] Cost savings: ${calls_saved} calls saved, $${cost_saved.toFixed(4)} saved (${savings_percent.toFixed(0)}%)`
  );

  return {
    original_calls: originalApiCalls,
    optimized_calls: optimizedApiCalls,
    calls_saved,
    original_cost: originalApiCalls * costPerCall,
    optimized_cost: optimizedApiCalls * costPerCall,
    cost_saved: parseFloat(cost_saved.toFixed(4)),
    savings_percent: parseFloat(savings_percent.toFixed(2)),
  };
}

/**
 * Get cost metrics for a time period
 * 
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Object>} Cost metrics
 */
export async function getCostMetrics(startDate, endDate) {
  try {
    const result = await sequelize.query(
      `
      SELECT 
        api_type,
        COUNT(*) as call_count,
        SUM(cost_usd) as total_cost,
        AVG(cost_usd) as avg_cost,
        SUM(api_calls_saved) as total_calls_saved
      FROM cost_tracking
      WHERE created_at >= :startDate AND created_at <= :endDate
      GROUP BY api_type
      `,
      {
        replacements: {
          startDate,
          endDate,
        },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const metrics = {
      period: {
        start: startDate,
        end: endDate,
      },
      by_api_type: {},
      totals: {
        total_calls: 0,
        total_cost: 0,
        total_calls_saved: 0,
      },
    };

    result.forEach((row) => {
      metrics.by_api_type[row.api_type] = {
        call_count: parseInt(row.call_count),
        total_cost: parseFloat(row.total_cost),
        avg_cost: parseFloat(row.avg_cost),
        calls_saved: parseInt(row.total_calls_saved),
      };

      metrics.totals.total_calls += parseInt(row.call_count);
      metrics.totals.total_cost += parseFloat(row.total_cost);
      metrics.totals.total_calls_saved += parseInt(row.total_calls_saved);
    });

    console.log(
      `[CostTracking] Metrics: ${metrics.totals.total_calls} calls, $${metrics.totals.total_cost.toFixed(2)} cost, ${metrics.totals.total_calls_saved} calls saved`
    );

    return metrics;
  } catch (error) {
    console.error('[CostTracking] Error getting cost metrics:', error);
    return null;
  }
}

/**
 * Generate cost report for a time period
 * 
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Object>} Cost report
 */
export async function generateCostReport(startDate, endDate) {
  try {
    const metrics = await getCostMetrics(startDate, endDate);
    if (!metrics) {
      return null;
    }

    const report = {
      title: 'Cost Tracking Report',
      period: metrics.period,
      summary: {
        total_api_calls: metrics.totals.total_calls,
        total_cost_usd: parseFloat(metrics.totals.total_cost.toFixed(2)),
        total_calls_saved: metrics.totals.total_calls_saved,
        avg_cost_per_call: metrics.totals.total_calls > 0 
          ? parseFloat((metrics.totals.total_cost / metrics.totals.total_calls).toFixed(4))
          : 0,
      },
      by_api_type: metrics.by_api_type,
      generated_at: new Date(),
    };

    console.log(`[CostTracking] Generated report: ${JSON.stringify(report.summary)}`);

    return report;
  } catch (error) {
    console.error('[CostTracking] Error generating report:', error);
    return null;
  }
}

/**
 * Get daily cost trend
 * 
 * @param {number} days - Number of days to look back
 * @returns {Promise<Array>} Daily cost data
 */
export async function getDailyCostTrend(days = 30) {
  try {
    const result = await sequelize.query(
      `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as call_count,
        SUM(cost_usd) as total_cost,
        SUM(api_calls_saved) as calls_saved
      FROM cost_tracking
      WHERE created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      `,
      { type: sequelize.QueryTypes.SELECT }
    );

    const trend = result.map((row) => ({
      date: row.date,
      call_count: parseInt(row.call_count),
      total_cost: parseFloat(row.total_cost),
      calls_saved: parseInt(row.calls_saved),
    }));

    console.log(`[CostTracking] Daily trend: ${trend.length} days`);

    return trend;
  } catch (error) {
    console.error('[CostTracking] Error getting daily trend:', error);
    return [];
  }
}

/**
 * Get cost savings summary
 * 
 * @param {number} days - Number of days to look back
 * @returns {Promise<Object>} Savings summary
 */
export async function getCostSavingsSummary(days = 30) {
  try {
    const result = await sequelize.query(
      `
      SELECT 
        COUNT(*) as total_calls,
        SUM(cost_usd) as total_cost,
        SUM(api_calls_saved) as total_calls_saved,
        AVG(api_calls_saved) as avg_calls_saved_per_request
      FROM cost_tracking
      WHERE created_at >= NOW() - INTERVAL '${days} days'
      `,
      { type: sequelize.QueryTypes.SELECT }
    );

    const data = result[0] || {};
    const totalCost = parseFloat(data.total_cost) || 0;
    const callsSaved = parseInt(data.total_calls_saved) || 0;
    const costSaved = callsSaved * 0.01; // Assuming $0.01 per call

    const summary = {
      period_days: days,
      total_api_calls: parseInt(data.total_calls) || 0,
      total_cost_usd: parseFloat(totalCost.toFixed(2)),
      total_calls_saved: callsSaved,
      total_cost_saved_usd: parseFloat(costSaved.toFixed(2)),
      avg_calls_saved_per_request: parseFloat(data.avg_calls_saved_per_request) || 0,
      savings_percent: data.total_calls > 0 
        ? parseFloat(((callsSaved / data.total_calls) * 100).toFixed(2))
        : 0,
    };

    console.log(
      `[CostTracking] Savings summary: $${summary.total_cost_saved_usd} saved (${summary.savings_percent}%)`
    );

    return summary;
  } catch (error) {
    console.error('[CostTracking] Error getting savings summary:', error);
    return null;
  }
}

/**
 * Get cost per matching request
 * 
 * @param {string} matchingRequestId - Matching request UUID
 * @returns {Promise<Object>} Cost breakdown
 */
export async function getCostPerRequest(matchingRequestId) {
  try {
    const result = await sequelize.query(
      `
      SELECT 
        api_type,
        COUNT(*) as call_count,
        SUM(cost_usd) as total_cost,
        SUM(api_calls_saved) as calls_saved
      FROM cost_tracking
      WHERE matching_request_id = :matchingRequestId
      GROUP BY api_type
      `,
      {
        replacements: { matchingRequestId },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const breakdown = {
      matching_request_id: matchingRequestId,
      by_api_type: {},
      total_cost: 0,
      total_calls_saved: 0,
    };

    result.forEach((row) => {
      breakdown.by_api_type[row.api_type] = {
        call_count: parseInt(row.call_count),
        total_cost: parseFloat(row.total_cost),
        calls_saved: parseInt(row.calls_saved),
      };

      breakdown.total_cost += parseFloat(row.total_cost);
      breakdown.total_calls_saved += parseInt(row.calls_saved);
    });

    breakdown.total_cost = parseFloat(breakdown.total_cost.toFixed(4));

    console.log(`[CostTracking] Cost per request: $${breakdown.total_cost.toFixed(4)}`);

    return breakdown;
  } catch (error) {
    console.error('[CostTracking] Error getting cost per request:', error);
    return null;
  }
}

/**
 * Clear old cost tracking records
 * Should be called periodically for maintenance
 * 
 * @param {number} daysToKeep - Number of days to keep (default: 90)
 * @returns {Promise<number>} Number of records deleted
 */
export async function clearOldRecords(daysToKeep = 90) {
  try {
    const result = await sequelize.query(
      `DELETE FROM cost_tracking WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'`
    );

    console.log(`[CostTracking] Cleared old records: ${result[0]?.rowCount || 0} deleted`);

    return result[0]?.rowCount || 0;
  } catch (error) {
    console.error('[CostTracking] Error clearing old records:', error);
    return 0;
  }
}

export default {
  trackAPICall,
  calculateCostSavings,
  getCostMetrics,
  generateCostReport,
  getDailyCostTrend,
  getCostSavingsSummary,
  getCostPerRequest,
  clearOldRecords,
};
