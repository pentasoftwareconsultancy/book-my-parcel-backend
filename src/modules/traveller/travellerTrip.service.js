import TravellerTrip from "./travellerTrip.model.js";

// Create Trip
export const createTripService = async (data) => {
  return await TravellerTrip.create(data);
};

// Get All Trips (Latest First)
export const getAllTripsService = async () => {
  return await TravellerTrip.findAll({
    order: [["createdAt", "DESC"]],
  });
};

// Get Trip By ID
export const getTripByIdService = async (id) => {
  return await TravellerTrip.findByPk(id);
};