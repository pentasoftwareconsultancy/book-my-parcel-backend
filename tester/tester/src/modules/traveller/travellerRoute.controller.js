import {
  createTravellerRoute,
  getTravellerRoutes,
  getRouteById,
  updateTravellerRoute,
  deleteTravellerRoute,
} from "./travellerRoute.service.js";
import { responseSuccess, responseError } from "../../utils/response.util.js";
import { matchRouteWithExistingParcels } from "../../services/matchingEngine.service.js";

// Create a new traveller route
export async function createRoute(req, res) {
  try {
    const userId = req.user.id;
    const { route, originAddress, destAddress } = await createTravellerRoute(req.body, userId);

    // Generate route reference (optional, can be added to service)
    const routeRef = `TR-${new Date().getFullYear()}-${String(route.id).slice(0, 8).toUpperCase()}`;

    // Trigger matching with existing parcels in the background
    setImmediate(async () => {
      try {
        const matchResult = await matchRouteWithExistingParcels(route.id);
        console.log(`[TravellerRoute] Route ${route.id} matched with ${matchResult.matchedParcels} existing parcels`);
      } catch (error) {
        console.error(`[TravellerRoute] Error matching route ${route.id} with existing parcels:`, error.message);
      }
    });

    return responseSuccess(res, {
      id: route.id,
      route_ref: routeRef,
      origin: {
        id: originAddress.id,
        formatted_address: originAddress.formatted_address || 
          `${originAddress.address}, ${originAddress.city}, ${originAddress.pincode}`,
      },
      destination: {
        id: destAddress.id,
        formatted_address: destAddress.formatted_address || 
          `${destAddress.address}, ${destAddress.city}, ${destAddress.pincode}`,
      },
      departure_time: route.departure_time,
      departure_date: route.departure_date,
      is_recurring: route.is_recurring,
      recurring_days: route.recurring_days,
      recurring_start_date: route.recurring_start_date,
      recurring_end_date: route.recurring_end_date,
      vehicle_type: route.vehicle_type,
      vehicle_number: route.vehicle_number,
      transport_mode: route.transport_mode,
      stops_passed: route.stops_passed,
      max_weight_kg: route.max_weight_kg,
      available_capacity_kg: route.available_capacity_kg,
      accepted_parcel_types: route.accepted_parcel_types,
      min_earning_per_delivery: route.min_earning_per_delivery,
      total_distance_km: route.total_distance_km,
      total_duration_minutes: route.total_duration_minutes,
      localities_passed: route.localities_passed,
      pincodes_covered: route.pincodes_covered,
      talukas_passed: route.talukas_passed,
      cities_passed: route.cities_passed,
      landmarks_nearby: route.landmarks_nearby,
      status: route.status,
      created_at: route.created_at,
    }, "Route created successfully");
  } catch (error) {
    console.error("[TravellerRoute] Create error:", error);
    return responseError(res, error.message, 500);
  }
}

// Get all routes for the authenticated traveller
export async function getRoutes(req, res) {
  try {
    const userId = req.user.id;
    const routes = await getTravellerRoutes(userId);

    return responseSuccess(res, routes, "Routes retrieved successfully");
  } catch (error) {
    console.error("[TravellerRoute] Get routes error:", error);
    return responseError(res, error.message, 500);
  }
}

// Get a specific route by ID
export async function getRoute(req, res) {
  try {
    const { id } = req.params;
    const route = await getRouteById(id);

    if (!route) {
      return responseError(res, "Route not found", 404);
    }

    return responseSuccess(res, route, "Route retrieved successfully");
  } catch (error) {
    console.error("[TravellerRoute] Get route error:", error);
    return responseError(res, error.message, 500);
  }
}

// Update a specific route by ID
export async function updateRoute(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const route = await updateTravellerRoute(id, userId, req.body);
    return responseSuccess(res, route, "Route updated successfully");
  } catch (error) {
    console.error("[TravellerRoute] Update route error:", error);
    const status = error.message.includes("not found") || error.message.includes("unauthorized") ? 404 : 500;
    return responseError(res, error.message, status);
  }
}

// Delete a specific route by ID
export async function deleteRoute(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const result = await deleteTravellerRoute(id, userId);
    return responseSuccess(res, result, result.message);
  } catch (error) {
    console.error("[TravellerRoute] Delete route error:", error);
    const status = error.message.includes("not found") || error.message.includes("unauthorized") ? 404 : 500;
    return responseError(res, error.message, status);
  }
}
