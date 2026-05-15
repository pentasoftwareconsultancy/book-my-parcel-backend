import { computeRouteMatrix } from "./googleMaps.service.js";
import TravellerRoute from "../modules/traveller/travellerRoute.model.js";
import TravellerProfile from "../modules/traveller/travellerProfile.model.js";
import User from "../modules/user/user.model.js";
import { getOrCache } from "../utils/cache.util.js";

// Cache TTL for route matrix results — 5 minutes.
// Coordinates are rounded to 4dp in the key so GPS jitter doesn't bust the cache.
const MATRIX_CACHE_TTL = 5 * 60; // seconds (getOrCache uses seconds)

export async function getSortedAcceptancesByProximity(acceptances, pickupLocation) {
  try {
    // Extract traveller locations
    const travellerLocations = [];
    const travellerMap = new Map();
    
    for (const acceptance of acceptances) {
      const travellerId = acceptance.traveller.id;
      
      // Try to get location from traveller profile first
      let location = null;
      if (acceptance.traveller.travellerProfile?.last_known_location) {
        const coords = acceptance.traveller.travellerProfile.last_known_location.coordinates;
        location = { lat: coords[1], lng: coords[0] };
      } else {
        // Fallback: get location from their active route origin
        const activeRoute = await TravellerRoute.findOne({
          where: { 
            traveller_id: travellerId,
            status: 'ACTIVE'
          },
          order: [['created_at', 'DESC']]
        });
        
        if (activeRoute && activeRoute.origin_coordinates) {
          const coords = activeRoute.origin_coordinates.coordinates;
          location = { lat: coords[1], lng: coords[0] };
        }
      }
      
      if (location) {
        travellerLocations.push(location);
        travellerMap.set(travellerLocations.length - 1, acceptance);
      }
    }
    
    if (travellerLocations.length === 0) {
      console.warn('[NearbyMatching] No traveller locations found, returning original order');
      return acceptances;
    }
    
    // Prepare destinations (pickup point)
    const destinations = [pickupLocation];
    
    // Check cache first
    const cacheKey = `matrix:${
      travellerLocations.map(o => `${o.lat.toFixed(4)},${o.lng.toFixed(4)}`).join('|')
    }::${pickupLocation.lat.toFixed(4)},${pickupLocation.lng.toFixed(4)}`;

    let matrixResult = await getOrCache(cacheKey, async () => {
      return await computeRouteMatrix(travellerLocations, destinations);
    }, MATRIX_CACHE_TTL);
    
    // Process results and sort
    const sortedAcceptances = [];
    const unsortedAcceptances = [];
    
    if (matrixResult && matrixResult.length) {
      for (const element of matrixResult) {
        const originIndex = element.originIndex;
        const acceptance = travellerMap.get(originIndex);
        
        if (acceptance && element.status?.code === 0) { // OK status
          const durationSeconds = parseInt(element.duration?.replace('s', '') || '0');
          const distanceMeters = element.distanceMeters || 0;
          
          acceptance.drive_time_minutes = Math.ceil(durationSeconds / 60);
          acceptance.drive_distance_km = Math.round(distanceMeters / 1000 * 10) / 10;
          
          sortedAcceptances.push(acceptance);
        } else if (acceptance) {
          // Failed to get distance, add to unsorted
          unsortedAcceptances.push(acceptance);
        }
      }
    }
    
    // Sort by drive time (ascending)
    sortedAcceptances.sort((a, b) => (a.drive_time_minutes || 999) - (b.drive_time_minutes || 999));
    
    // Add acceptances without location data at the end
    const processedIds = new Set([...sortedAcceptances, ...unsortedAcceptances].map(acc => acc.traveller.id));
    const remainingAcceptances = acceptances.filter(acc => !processedIds.has(acc.traveller.id));
    
    return [...sortedAcceptances, ...unsortedAcceptances, ...remainingAcceptances];
    
  } catch (error) {
    console.error('[NearbyMatching] Error sorting by proximity:', error);
    return acceptances; // Return original order on error
  }
}