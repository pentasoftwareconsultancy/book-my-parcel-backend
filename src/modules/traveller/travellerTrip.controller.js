import {
  createTripService,
  getAllTripsService,
  getTripByIdService,
} from "./travellerTrip.service.js";

// POST - Create Traveller Trip
export const createTravellerTrip = async (req, res) => {
  try {
    const {
      traveller_id,
      source_city,
      destination_city,
      available_weight,
      status,
    } = req.body;

    if (!traveller_id || !source_city || !destination_city) {
      return res.status(400).json({
        success: false,
        message: "traveller_id, source_city and destination_city are required",
      });
    }

    const trip = await createTripService({
      traveller_id,
      source_city,
      destination_city,
      available_weight,
      status: status || "ACTIVE",
    });

    return res.status(201).json({
      success: true,
      data: trip,
    });
  } catch (error) {
    console.error("Create Traveller Trip Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// GET - All Traveller Trips
export const getAllTravellerTrips = async (req, res) => {
  try {
    const trips = await getAllTripsService();

    return res.status(200).json({
      success: true,
      count: trips.length,
      data: trips,
    });
  } catch (error) {
    console.error("Get All Trips Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// GET - Single Trip By ID
export const getTravellerTripById = async (req, res) => {
  try {
    const { id } = req.params;

    const trip = await getTripByIdService(id);

    if (!trip) {
      return res.status(404).json({
        success: false,
        message: "Trip not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: trip,
    });
  } catch (error) {
    console.error("Get Trip Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};