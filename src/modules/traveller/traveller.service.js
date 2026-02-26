import TravellerKYC from "./travellerKYC.model.js";
import User from "../user/user.model.js";
import { KYC_STATUS } from "../../middlewares/role.middleware.js";
import TravellerRoute from "./travellerRoute.model.js";
import TravellerProfile from "./travellerProfile.model.js";
/* SUBMIT / UPDATE KYC */
export const submitKYC = async (userId, body, files) => {

  delete body.status; // prevent manual status override

// Validate Aadhar
if (body.aadhar_number) {
  const cleaned = body.aadhar_number.replace(/\s/g, '');
  if (!/^\d{12}$/.test(cleaned) && !cleaned.includes('X')) {
    throw new Error("Invalid Aadhar number format. Must be 12 digits.");
  }
  body.aadhar_number = cleaned;
}

// Validate PAN
if (body.pan_number) {
  const cleaned = body.pan_number.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(cleaned) && !cleaned.includes('X')) {
    throw new Error("Invalid PAN format. Must be like ABCDE1234F.");
  }
  body.pan_number = cleaned;
}


  const payload = {
    user_id: userId,
    ...body,

    aadhar_front: files?.aadharFront?.[0]?.path,
    aadhar_back: files?.aadharBack?.[0]?.path,
    pan_front: files?.panFront?.[0]?.path,
    pan_back: files?.panBack?.[0]?.path,
    driving_photo: files?.drivingPhoto?.[0]?.path,
    selfie: files?.selfie?.[0]?.path,

    status: KYC_STATUS.PENDING
  };

  const existing = await TravellerKYC.findOne({
    where: { user_id: userId }
  });

  if (existing) {

    if (existing.status === KYC_STATUS.APPROVED) {
      throw new Error("Approved KYC cannot be modified");
    }

    await existing.update(payload);
    return existing;
  }

  return await TravellerKYC.create(payload);
};



/* GET MY KYC */
export const getMyKYC = async (userId) => {
  return await TravellerKYC.findOne({
    where: { user_id: userId }
  });
};

/* GET ALL KYC (ADMIN) */
export const getAllKYCs = async () => {
  return await TravellerKYC.findAll({
    order: [["createdAt", "DESC"]]
  });
};

/* FULL UPDATE KYC (Traveller) */
export const updateTravellerKYC = async (userId, body, files) => {

  const existing = await TravellerKYC.findOne({
    where: { user_id: userId }
  });

  if (!existing) {
    throw new Error("KYC record not found");
  }

  if (existing.status === KYC_STATUS.APPROVED) {
    throw new Error("Approved KYC cannot be modified");
  }

  const payload = {
    ...body,
    status: KYC_STATUS.PENDING
  };

  // Update all file fields (if provided)
  if (files?.aadharFront)
    payload.aadhar_front = files.aadharFront[0].path;

  if (files?.aadharBack)
    payload.aadhar_back = files.aadharBack[0].path;

  if (files?.panFront)
    payload.pan_front = files.panFront[0].path;

  if (files?.panBack)
    payload.pan_back = files.panBack[0].path;

  if (files?.drivingPhoto)
    payload.driving_photo = files.drivingPhoto[0].path;

  if (files?.selfie)
    payload.selfie = files.selfie[0].path;

  await existing.update(payload);

  return existing;
};


/* UPDATE STATUS (ADMIN ONLY — controller already checks role) */
export const updateKYCStatus = async (kycId, status) => {

  const kyc = await TravellerKYC.findByPk(kycId);

  if (!kyc) {
    throw new Error("KYC record not found");
  }

  const validStatuses = Object.values(KYC_STATUS);

  if (!validStatuses.includes(status)) {
    throw new Error("Invalid status value");
  }

  await kyc.update({ status });

  return kyc;
};

/**
 * GET NEARBY TRAVELERS
 * Fetch travelers with approved KYC within a certain distance
 */
export const getNearbyTravelers = async (pickupCity, deliveryCity, options = {}) => {
  const { page = 1, limit = 10, vehicleType = null } = options;
  const offset = (page - 1) * limit;

  // Build where clause for filtering
  let whereClause = {
    status: KYC_STATUS.APPROVED
  };

  // If we have specific cities, we could filter by them
  // For now, we'll fetch all approved travelers

  try {
    const { count, rows: kycRecords } = await TravellerKYC.findAndCountAll({
      where: whereClause,
      include: [{
        model: User,
        as: 'User',
        attributes: ['id', 'name', 'city', 'state', 'is_active', 'is_verified']
      }],
      limit,
      offset,
      order: [['created_at', 'DESC']]
    });

    // Transform the data to match frontend expectations
    const travelers = kycRecords.map(kyc => {
      const user = kyc.User;
      return {
        id: user.id,
        name: user.name,
        verified: user.is_verified,
        rating: Math.random() * (5.0 - 4.0) + 4.0, // Mock rating between 4.0-5.0
        reviews: Math.floor(Math.random() * 500) + 50, // Mock reviews 50-550
        trips: Math.floor(Math.random() * 400) + 20, // Mock trips 20-420
        avgResponse: `${Math.floor(Math.random() * 20) + 5} min`, // Mock response time 5-25 min
        deliveryTag: Math.random() > 0.5 ? "Today" : "Tomorrow",
        from: pickupCity || user.city || "City",
        to: deliveryCity || "Destination",
        vehicleType: vehicleType || ["Car", "Bike", "Mini Truck"][Math.floor(Math.random() * 3)],
        duration: `${Math.floor(Math.random() * 3) + 3}–${Math.floor(Math.random() * 3) + 4} hours`,
        price: Math.floor(Math.random() * 100) + 80, // Mock price 80-180
        avatarBg: ["bg-gradient-to-br from-[#FFB347] to-[#FF6B6B]", "bg-gradient-to-br from-[#FF9AEB] to-[#FF6FD8]", "bg-gradient-to-br from-[#FFC371] to-[#FF5F6D]"][Math.floor(Math.random() * 3)],
        mapX: `${Math.floor(Math.random() * 60) + 20}%`, // Mock position 20-80%
        mapY: `${Math.floor(Math.random() * 50) + 25}%` // Mock position 25-75%
      };
    });

    return {
      travelers,
      pagination: {
        total: count,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(count / limit)
      }
    };
  } catch (error) {
    throw new Error(`Failed to fetch nearby travelers: ${error.message}`);
  }
};




// Route Service

/* CREATE ROUTE */
export const createRoute = async (userId, body) => {
  // Find traveller profile
  const profile = await TravellerProfile.findOne({
    where: { user_id: userId }
  });

  if (!profile) {
    throw new Error("Traveller profile not found. Please complete your profile first.");
  }

  // Create route
  const route = await TravellerRoute.create({
    traveller_profile_id: profile.id,
    origin_city: body.originCity,
    origin_state: body.originState,
    stops: body.stops || [],
    destination_city: body.destinationCity,
    destination_state: body.destinationState,
    departure_date: body.departureDate,
    departure_time: body.departureTime,
    arrival_date: body.arrivalDate,
    arrival_time: body.arrivalTime,
    is_recurring: body.isRecurring || false,
    recurring_days: body.recurringDays || [],
    vehicle_type: body.vehicleType,
    vehicle_number: body.vehicleNumber,
    max_weight_kg: body.maxWeightKg,
    available_space_description: body.availableSpaceDescription,
    accepted_parcel_types: body.acceptedParcelTypes || [],
    min_earning_per_delivery: body.minEarningPerDelivery,
  });

  return route;
};

/* GET MY ROUTES */
export const getMyRoutes = async (userId, options = {}) => {
  const { status, page = 1, limit = 10 } = options;
  const offset = (page - 1) * limit;

  // Find traveller profile
  const profile = await TravellerProfile.findOne({
    where: { user_id: userId }
  });

  if (!profile) {
    return { routes: [], pagination: { total: 0, page: 1, limit, totalPages: 0 } };
  }

  // Build where clause
  const whereClause = { traveller_profile_id: profile.id };
  if (status) {
    whereClause.status = status;
  }

  const { count, rows: routes } = await TravellerRoute.findAndCountAll({
    where: whereClause,
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [['created_at', 'DESC']]
  });

  return {
    routes,
    pagination: {
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(count / limit)
    }
  };
};

/* GET ROUTE BY ID */
export const getRouteById = async (routeId) => {
  const route = await TravellerRoute.findByPk(routeId, {
    include: [{
      model: TravellerProfile,
      as: 'travellerProfile',
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'phone_number']
      }]
    }]
  });

  if (!route) {
    throw new Error("Route not found");
  }

  return route;
};

/* UPDATE ROUTE */
export const updateRoute = async (routeId, userId, body) => {
  const route = await TravellerRoute.findByPk(routeId, {
    include: [{
      model: TravellerProfile,
      as: 'travellerProfile'
    }]
  });

  if (!route) {
    throw new Error("Route not found");
  }

  // Verify ownership
  if (route.travellerProfile.user_id !== userId) {
    throw new Error("Unauthorized to update this route");
  }

  // Update route
  await route.update({
    origin_city: body.originCity,
    origin_state: body.originState,
    stops: body.stops,
    destination_city: body.destinationCity,
    destination_state: body.destinationState,
    departure_date: body.departureDate,
    departure_time: body.departureTime,
    arrival_date: body.arrivalDate,
    arrival_time: body.arrivalTime,
    is_recurring: body.isRecurring,
    recurring_days: body.recurringDays,
    vehicle_type: body.vehicleType,
    vehicle_number: body.vehicleNumber,
    max_weight_kg: body.maxWeightKg,
    available_space_description: body.availableSpaceDescription,
    accepted_parcel_types: body.acceptedParcelTypes,
    min_earning_per_delivery: body.minEarningPerDelivery,
    status: body.status,
  });

  return route;
};

/* DELETE ROUTE */
export const deleteRoute = async (routeId, userId) => {
  const route = await TravellerRoute.findByPk(routeId, {
    include: [{
      model: TravellerProfile,
      as: 'travellerProfile'
    }]
  });

  if (!route) {
    throw new Error("Route not found");
  }

  // Verify ownership
  if (route.travellerProfile.user_id !== userId) {
    throw new Error("Unauthorized to delete this route");
  }

  await route.destroy();
};
