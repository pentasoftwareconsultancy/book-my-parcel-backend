// modules/tracking/parcelTracking.controller.js
import {
  initiateTracking,
  updateTravellerLocation,
  getTrackingByBookingId,
  completeDelivery,
} from "./parcelTracking.service.js";
import { getIO } from "../../config/socket.config.js";

export async function handleInitiateTracking(req, res) {
  try {
    const { booking_id, vehicle_type } = req.body;
    if (!booking_id) return res.status(400).json({ message: "booking_id is required" });

    const tracking = await initiateTracking(booking_id, vehicle_type);

    getIO().to(booking_id).emit("tracking_initiated", {
      booking_id,
      status:           tracking.status,
      encoded_polyline: tracking.encoded_polyline,
      distance_meters:  tracking.distance_meters,
      duration_seconds: tracking.duration_seconds,
      pickup_lat:       tracking.pickup_lat,
      pickup_lng:       tracking.pickup_lng,
      delivery_lat:     tracking.delivery_lat,
      delivery_lng:     tracking.delivery_lng,
    });

    return res.status(201).json({ message: "Tracking initiated", tracking });
  } catch (err) {
    console.error("handleInitiateTracking:", err.message);
    return res.status(500).json({ message: err.message });
  }
}

export async function handleUpdateLocation(req, res) {
  try {
    const { booking_id, lat, lng, speed, heading } = req.body;
    if (!booking_id || lat === undefined || lng === undefined) {
      return res.status(400).json({ message: "booking_id, lat, lng are required" });
    }

    const tracking = await updateTravellerLocation(booking_id, { lat, lng, speed, heading });

    getIO().to(booking_id).emit("location_updated", {
      booking_id,
      traveller_lat: tracking.traveller_lat,
      traveller_lng: tracking.traveller_lng,
      speed:         tracking.speed,
      heading:       tracking.heading,
      status:        tracking.status,
    });

    return res.status(200).json({ message: "Location updated", tracking });
  } catch (err) {
    console.error("handleUpdateLocation:", err.message);
    return res.status(500).json({ message: err.message });
  }
}

export async function handleGetTracking(req, res) {
  try {
    const { booking_id } = req.params;
    const tracking = await getTrackingByBookingId(booking_id);
    return res.status(200).json({ tracking });
  } catch (err) {
    console.error("handleGetTracking:", err.message);
    return res.status(404).json({ message: err.message });
  }
}

export async function handleCompleteDelivery(req, res) {
  try {
    const { booking_id } = req.body;
    if (!booking_id) return res.status(400).json({ message: "booking_id is required" });

    const tracking = await completeDelivery(booking_id);

    getIO().to(booking_id).emit("delivery_completed", {
      booking_id,
      status: tracking.status,
    });

    return res.status(200).json({ message: "Delivery completed", tracking });
  } catch (err) {
    console.error("handleCompleteDelivery:", err.message);
    return res.status(500).json({ message: err.message });
  }
}
// ```

// ---

// ## Verify your folder structure looks like this
// ```
// modules/tracking/
//   ├── parcelTracking.model.js       ← model only
//   ├── parcelTracking.service.js     ← service only
//   ├── parcelTracking.controller.js  ← controller only
//   ├── parcelTracking.routes.js      ← routes only
//   └── tracking.middleware.js        ← authorizeRoles only