/**
 * Price Calculation Service
 * Calculates suggested delivery price based on distance, weight, and dimensions
 * 
 * Formula: Price = Base + (Distance × Distance Rate) + (Billable Weight × Weight Rate)
 * - Billable Weight = max(Actual Weight, Volume Weight)
 * - Volume Weight = (Length × Width × Height) / 6000
 * 
 * Example: 50 km, 2 kg, 30×20×15 cm
 * - Volume Weight = (30×20×15)/6000 = 1.5 kg
 * - Billable Weight = max(2, 1.5) = 2 kg
 * - Price = ₹50 + (50 × 0.5) + (2 × 10) = ₹80
 */

const PRICING_CONFIG = {
  BASE_PRICE: 50,           // ₹50 base for every delivery
  DISTANCE_RATE: 0.5,       // ₹0.5 per km
  WEIGHT_RATE: 10,          // ₹10 per kg
  VOLUME_DIVISOR: 6000,     // Divisor for volumetric weight calculation
};

/**
 * Calculate volumetric weight from dimensions
 * @param {number} lengthCm - Length in centimeters
 * @param {number} widthCm - Width in centimeters
 * @param {number} heightCm - Height in centimeters
 * @returns {number} Volumetric weight in kg
 */
function calculateVolumetricWeight(lengthCm, widthCm, heightCm) {
  // Only calculate if all dimensions are provided and valid
  if (!lengthCm || !widthCm || !heightCm) {
    return 0;
  }

  const length = Number(lengthCm) || 0;
  const width = Number(widthCm) || 0;
  const height = Number(heightCm) || 0;

  if (length <= 0 || width <= 0 || height <= 0) {
    return 0;
  }

  // Volume in cm³ / divisor = weight in kg
  const volumeWeight = (length * width * height) / PRICING_CONFIG.VOLUME_DIVISOR;
  return volumeWeight;
}

/**
 * Calculate estimated delivery price
 * @param {number} distanceKm - Distance in kilometers
 * @param {number} weightKg - Actual weight in kilograms
 * @param {number} lengthCm - Length in centimeters (optional)
 * @param {number} widthCm - Width in centimeters (optional)
 * @param {number} heightCm - Height in centimeters (optional)
 * @returns {number} Calculated price in rupees
 */
export function calculatePrice(distanceKm, weightKg, lengthCm, widthCm, heightCm) {
  // Validate distance and weight
  if (typeof distanceKm !== 'number' || distanceKm < 0) {
    throw new Error('Invalid distance: must be a non-negative number');
  }
  if (typeof weightKg !== 'number' || weightKg < 0) {
    throw new Error('Invalid weight: must be a non-negative number');
  }

  // Calculate volumetric weight
  const volumetricWeight = calculateVolumetricWeight(lengthCm, widthCm, heightCm);

  // Use the higher of actual weight or volumetric weight (billable weight)
  const billableWeight = Math.max(weightKg, volumetricWeight);

  // Calculate price: Base + (Distance × Rate) + (Billable Weight × Rate)
  const distanceCost = distanceKm * PRICING_CONFIG.DISTANCE_RATE;
  const weightCost = billableWeight * PRICING_CONFIG.WEIGHT_RATE;
  const totalPrice = PRICING_CONFIG.BASE_PRICE + distanceCost + weightCost;

  // Round to nearest rupee
  return Math.round(totalPrice);
}

/**
 * Get pricing configuration (for frontend debugging/info)
 * @returns {object} Pricing rates and base price
 */
export function getPricingConfig() {
  return PRICING_CONFIG;
}

export default {
  calculatePrice,
  getPricingConfig,
  calculateVolumetricWeight,
};
