// ─── Haversine Distance Calculation ─────────────────────────────────────────
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

// ─── Estimate Detour (Simple Approximation) ────────────────────────────────
export function estimateDetourSimple(route, pickupLat, pickupLng, dropLat, dropLng) {
  try {
    // Distance from route origin to pickup
    const originToPickup = haversineDistance(
      route.originAddress.latitude,
      route.originAddress.longitude,
      pickupLat,
      pickupLng
    );

    // Distance from route destination to drop
    const destToDrop = haversineDistance(
      route.destAddress.latitude,
      route.destAddress.longitude,
      dropLat,
      dropLng
    );

    // Simple approximation: sum of deviations
    const estimatedDetour = originToPickup + destToDrop;
    return estimatedDetour;
  } catch (error) {
    console.error("[Detour] Error estimating detour:", error.message);
    return Infinity;
  }
}

// ─── Calculate Detour Percentage ───────────────────────────────────────────
export function calculateDetourPercentage(detourKm, routeDistanceKm) {
  if (routeDistanceKm === 0) return 0;
  return (detourKm / routeDistanceKm) * 100;
}

// ─── Check if Detour is Acceptable ─────────────────────────────────────────
export function isDetourAcceptable(detourKm, detourPercentage, maxDetourKm = 50, maxDetourPercentage = 20) {
  return detourKm <= maxDetourKm && detourPercentage <= maxDetourPercentage;
}

// ─── Calculate Match Score ─────────────────────────────────────────────────
export function calculateMatchScore(detourPercentage, travellerRating = 5, maxRating = 5) {
  // Score based on detour (0-100) and rating (0-100)
  const detourScore = Math.max(0, 100 - detourPercentage);
  const ratingScore = (travellerRating / maxRating) * 100;

  // Weighted average: 70% detour, 30% rating
  const matchScore = detourScore * 0.7 + ratingScore * 0.3;
  return Math.round(matchScore * 100) / 100;
}
