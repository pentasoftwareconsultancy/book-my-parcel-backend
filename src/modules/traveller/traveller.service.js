import TravellerKYC from "./travellerKYC.model.js";
import User from "../user/user.model.js";
import { KYC_STATUS } from "../../middlewares/role.middleware.js";

/* SUBMIT / UPDATE KYC */
export const submitKYC = async (userId, body, files) => {

  delete body.status; // prevent manual status override

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
