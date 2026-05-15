/**
 * Polyline Decoder Service
 * Decodes Google Maps encoded polylines to coordinates
 * Converts coordinates to PostGIS LINESTRING format
 */

/**
 * Decode Google Maps encoded polyline
 * Reference: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 * 
 * @param {string} encoded - Encoded polyline string from Google Maps API
 * @returns {Array<[number, number]>} Array of [latitude, longitude] coordinates
 */
export function decodePolyline(encoded) {
  if (!encoded || typeof encoded !== 'string') {
    console.warn('[PolylineDecoder] Invalid encoded polyline');
    return [];
  }

  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte;

    // Decode latitude
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    result = 0;
    shift = 0;

    // Decode longitude
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push([lat / 1e5, lng / 1e5]); // [latitude, longitude]
  }

  console.log(`[PolylineDecoder] Decoded ${points.length} points from polyline`);
  return points;
}

/**
 * Create PostGIS LINESTRING from coordinates
 * Format: LINESTRING(lon1 lat1, lon2 lat2, ...)
 * Note: PostGIS uses (longitude, latitude) order
 * 
 * @param {Array<[number, number]>} coordinates - Array of [latitude, longitude]
 * @returns {string} WKT LINESTRING format
 */
export function createLineString(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    console.warn('[PolylineDecoder] Invalid coordinates for LINESTRING');
    return null;
  }

  // Convert [lat, lng] to (lng lat) for PostGIS
  const points = coordinates
    .map(([lat, lng]) => `${lng} ${lat}`)
    .join(', ');

  const linestring = `LINESTRING(${points})`;
  console.log(`[PolylineDecoder] Created LINESTRING with ${coordinates.length} points`);
  return linestring;
}

/**
 * Decode polyline and create LINESTRING in one step
 * 
 * @param {string} encodedPolyline - Encoded polyline from Google Maps
 * @returns {string} WKT LINESTRING format
 */
export function polylineToLineString(encodedPolyline) {
  try {
    const coordinates = decodePolyline(encodedPolyline);
    if (coordinates.length < 2) {
      console.error('[PolylineDecoder] Not enough coordinates to create LINESTRING');
      return null;
    }
    return createLineString(coordinates);
  } catch (error) {
    console.error('[PolylineDecoder] Error converting polyline to LINESTRING:', error);
    return null;
  }
}

/**
 * Get bounding box from coordinates
 * Useful for quick spatial filtering
 * 
 * @param {Array<[number, number]>} coordinates - Array of [latitude, longitude]
 * @returns {Object} Bounding box {minLat, maxLat, minLng, maxLng}
 */
export function getBoundingBox(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return null;
  }

  let minLat = coordinates[0][0];
  let maxLat = coordinates[0][0];
  let minLng = coordinates[0][1];
  let maxLng = coordinates[0][1];

  for (const [lat, lng] of coordinates) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  }

  return { minLat, maxLat, minLng, maxLng };
}

/**
 * Calculate route length in kilometers
 * Uses Haversine formula for great-circle distance
 * 
 * @param {Array<[number, number]>} coordinates - Array of [latitude, longitude]
 * @returns {number} Total distance in kilometers
 */
export function calculateRouteLength(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return 0;
  }

  const R = 6371; // Earth's radius in km
  let totalDistance = 0;

  for (let i = 0; i < coordinates.length - 1; i++) {
    const [lat1, lng1] = coordinates[i];
    const [lat2, lng2] = coordinates[i + 1];

    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    totalDistance += distance;
  }

  console.log(`[PolylineDecoder] Calculated route length: ${totalDistance.toFixed(2)} km`);
  return totalDistance;
}

/**
 * Simplify polyline by removing points that are too close
 * Useful for reducing storage and improving performance
 * 
 * @param {Array<[number, number]>} coordinates - Array of [latitude, longitude]
 * @param {number} minDistanceKm - Minimum distance between points in km
 * @returns {Array<[number, number]>} Simplified coordinates
 */
export function simplifyPolyline(coordinates, minDistanceKm = 0.1) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return coordinates;
  }

  const simplified = [coordinates[0]];
  const R = 6371; // Earth's radius in km

  for (let i = 1; i < coordinates.length; i++) {
    const [lat1, lng1] = simplified[simplified.length - 1];
    const [lat2, lng2] = coordinates[i];

    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    if (distance >= minDistanceKm) {
      simplified.push([lat2, lng2]);
    }
  }

  console.log(
    `[PolylineDecoder] Simplified polyline from ${coordinates.length} to ${simplified.length} points`
  );
  return simplified;
}

/**
 * Validate polyline format
 * 
 * @param {string} encoded - Encoded polyline string
 * @returns {boolean} True if valid
 */
export function isValidPolyline(encoded) {
  if (!encoded || typeof encoded !== 'string') {
    return false;
  }

  // Polyline should contain printable ASCII characters
  return /^[\x20-\x7E]+$/.test(encoded);
}

/**
 * Get sample points from polyline (for preview/display)
 * Returns evenly spaced points along the route
 * 
 * @param {Array<[number, number]>} coordinates - Array of [latitude, longitude]
 * @param {number} maxPoints - Maximum number of points to return
 * @returns {Array<[number, number]>} Sample coordinates
 */
export function getSamplePoints(coordinates, maxPoints = 10) {
  if (!Array.isArray(coordinates) || coordinates.length <= maxPoints) {
    return coordinates;
  }

  const samples = [];
  const step = Math.floor(coordinates.length / maxPoints);

  for (let i = 0; i < coordinates.length; i += step) {
    samples.push(coordinates[i]);
  }

  // Always include the last point
  if (samples[samples.length - 1] !== coordinates[coordinates.length - 1]) {
    samples.push(coordinates[coordinates.length - 1]);
  }

  return samples;
}

export default {
  decodePolyline,
  createLineString,
  polylineToLineString,
  getBoundingBox,
  calculateRouteLength,
  simplifyPolyline,
  isValidPolyline,
  getSamplePoints,
};
