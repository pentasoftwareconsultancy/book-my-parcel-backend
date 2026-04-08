import { computeRouteMatrix } from "./googleMaps.service.js";
import TravellerRoute from "../modules/traveller/travellerRoute.model.js";
import TravellerProfile from "../modules/traveller/travellerProfile.model.js";
import User from "../modules/user/user.model.js";

// Simple in-memory cache for matrix results (5 minutes TTL)
const matrixCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(origins, destinations) {
  const originsStr = origins.map(o => `${o.lat.toFixed(4)},${o.lng.toFixed(4)}`).join('|');
  const destsStr = destinations.map(d => `${d.lat.toFixed(4)},${d.lng.toFixed(4)}`).join('|');
  return `${originsStr}::${destsStr}`;
}

function getCachedMatrix(cacheKey) {
  const cached = matrixCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedMatrix(cacheKey, data) {
  matrixCache.set(cacheKey, {
    data,
    timestamp: Date.now()
  });
  
  // Clean up old entries
  for (const [key, value] of matrixCache.entries()) {
    if (Date.now() - value.timestamp >= CACHE_TTL) {
      matrixCache.delete(key);
    }
  }
}

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
    const cacheKey = getCacheKey(travellerLocations, destinations);
    let matrixResult = getCachedMatrix(cacheKey);
    
    if (!matrixResult) {
      // Call Google Distance Matrix API
      matrixResult = await computeRouteMatrix(travellerLocations, destinations);
      setCachedMatrix(cacheKey, matrixResult);
    }
    
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