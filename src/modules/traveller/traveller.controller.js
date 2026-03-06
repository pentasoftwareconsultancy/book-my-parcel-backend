import * as travellerService from "./traveller.service.js";
import { ROLES } from "../../utils/constants.js";
import Booking from "../booking/booking.model.js";
import Parcel from "../parcel/parcel.model.js";
import Address from "../parcel/address.model.js";
import User from "../user/user.model.js";
import TravellerTrip from "./travellerTrip.model.js";
import sequelize from "../../config/database.config.js";
import UserProfile from "../user/userProfile.model.js";

/* SUBMIT KYC */
export const submitKYC = async (req, res, next) => {
  try {
    const userId = req.user.id;
    console.log("User ID from token:", userId);

    const data = await travellerService.submitKYC(
      userId,
      req.body,
      req.files
    );

    res.status(200).json({
  success: true,
  message: "KYC Submitted",
  data
});

  } catch (err) {
    next(err);
  }
};


/* GET MY KYC */
export const getMyKYC = async (req, res, next) => {
  try {
    const data = await travellerService.getMyKYC(req.user.id);
    res.status(200).json({
  success: true,
  data
});

  } catch (err) {
    next(err);
  }
};

/* UPDATE FULL KYC (Traveller) */
export const updateTravellerKYC = async (req, res, next) => {
  try {

    const data = await travellerService.updateTravellerKYC(
      req.user.id,
      req.body,
      req.files
    );

    res.status(200).json({
      success: true,
      message: "KYC Updated Successfully",
      data
    });

  } catch (err) {
    next(err);
  }
};


/* GET ALL KYC - ADMIN */
export const getAllKYCs = async (req, res, next) => {
  try {

    const data = await travellerService.getAllKYCs();

    res.status(200).json({
      success: true,
      count: data.length,
      data
    });

  } catch (err) {
    next(err);
  }
};

// update 

export const updateKYCStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const data = await travellerService.updateKYCStatus(id, status);

    res.status(200).json({
      success: true,
      message: "KYC status updated",
      data
    });

  } catch (err) {
    next(err);
  }
};

/*
 GET NEARBY TRAVELERS
 */
// export const getNearbyTravelers = async (req, res, next) => {
//   try {
//     const { pickupCity, deliveryCity, page, limit, vehicleType } = req.query;
    
//     const result = await travellerService.getNearbyTravelers(
//       pickupCity,
//       deliveryCity,
//       {
//         page: page ? parseInt(page) : 1,
//         limit: limit ? parseInt(limit) : 10,
//         vehicleType: vehicleType || null
//       }
//     );

//     res.status(200).json({
//       success: true,
//       message: "Nearby travelers fetched successfully",
//       ...result
//     });

//   } catch (err) {
//     next(err);
//   }
// };



export const getNearbyTravelers = async (
  pickupCity,
  deliveryCity,
  { page = 1, limit = 10, vehicleType = null }
) => {

  const offset = (page - 1) * limit;

  const whereProfile = {};
  if (pickupCity) {
    whereProfile.city = pickupCity;
  }

  const whereTrip = {};
  if (vehicleType) {
    whereTrip.vehicle_type = vehicleType;
  }

  const { count, rows } = await User.findAndCountAll({
    include: [
      {
        model: UserProfile,
        as: "profile",           // MUST match association
        where: whereProfile,
        required: true
      },
      {
        model: TravellerTrip,
        as: "traveller_trip",    // MUST match your alias
        where: whereTrip,
        required: false
      }
    ],
    limit,
    offset
  });

  return {
    travelers: rows,
    pagination: {
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit)
    }
  };
};

/**
 * GET TRAVELER DASHBOARD DELIVERIES
 */
export const getTravelerDeliveries = async (req, res, next) => {
  try {
    const travelerId = req.user.id;
    const { status, page = 1, limit = 10 } = req.query;
    
    // Build where clause
    const whereClause = { traveller_id: travelerId };
    if (status) {
      whereClause.status = status;
    }
    
    // Fetch bookings with related data
    const { count, rows: bookings } = await Booking.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Parcel,
          as: 'parcel',
          include: [
            {
              model: Address,
              as: 'pickupAddress',
              attributes: ['city', 'address', 'state']
            },
            {
              model: Address,
              as: 'deliveryAddress',
              attributes: ['city', 'address', 'state']
            }
          ]
        },
        {
          model: User,
          as: 'traveller',
          attributes: ['name', 'phone_number'],
          required: false
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });
    
    // Transform data for frontend
    const deliveries = bookings.map(booking => {
      const parcel = booking.parcel;
      const traveler = booking.traveller;
      
      return {
        id: booking.id,
        bookingId: `BMP${booking.id.substring(0, 8).toUpperCase()}`,
        trackingId: `BMP${booking.id.substring(0, 12).toUpperCase()}`,
        status: booking.status,
        customer: traveler?.name || 'Unknown Customer',
        pickup: parcel.pickupAddress?.city || '',
        drop: parcel.deliveryAddress?.city || '',
        amount: parcel.price_quote || 0,
        bookedDate: booking.createdAt.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric', 
          year: 'numeric' 
        }),
        package: {
          size: parcel.package_size,
          weight: `${parcel.weight} kg`
        }
      };
    });
    
    res.json({
      success: true,
      message: "Traveler deliveries fetched successfully",
      deliveries,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET TRAVELER DASHBOARD STATS
 */
export const getTravelerStats = async (req, res, next) => {
  try {
    const travelerId = req.user.id;
    
    // Get total deliveries count
    const totalDeliveries = await Booking.count({
      where: { traveller_id: travelerId }
    });
    
    // Get deliveries by status
    const statusCounts = await Booking.findAll({
      where: { traveller_id: travelerId },
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('status')), 'count']
      ],
      group: ['status']
    });
    
    // Calculate stats
    const stats = {
      totalEarnings: 0,
      active: 0,
      completed: 0,
      cancelled: 0,
      rating: 4.8 // This would come from user rating in real implementation
    };
    
    // Populate status counts
    statusCounts.forEach(item => {
      const status = item.status;
      const count = parseInt(item.get('count'));
      
      if (status === 'IN_TRANSIT' || status === 'CONFIRMED' || status === 'MATCHING') {
        stats.active += count;
      } else if (status === 'DELIVERED') {
        stats.completed += count;
      } else if (status === 'CANCELLED') {
        stats.cancelled += count;
      }
    });
    
    // Calculate total earnings (this would need to be enhanced with actual payment data)
    const parcelsWithPrice = await Parcel.findAll({
      include: [{
        model: Booking,
        where: { traveller_id: travelerId },
        attributes: []
      }],
      attributes: ['price_quote']
    });
    
    stats.totalEarnings = parcelsWithPrice
      .filter(p => p.price_quote)
      .reduce((sum, parcel) => sum + parcel.price_quote, 0);
    
    res.json({
      success: true,
      message: "Traveler stats fetched successfully",
      stats
    });
  } catch (error) {
    next(error);
  }
};
/* CREATE ROUTE */
export const createRoute = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const data = await travellerService.createRoute(userId, req.body);
    
    res.status(201).json({
      success: true,
      message: "Route created successfully",
      data
    });
  } catch (err) {
    next(err);
  }
};

/* GET MY ROUTES */
export const getMyRoutes = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 10 } = req.query;
    
    const data = await travellerService.getMyRoutes(userId, { status, page, limit });
    
    res.status(200).json({
      success: true,
      data
    });
  } catch (err) {
    next(err);
  }
};

/* GET ROUTE BY ID */
export const getRouteById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = await travellerService.getRouteById(id);
    
    res.status(200).json({
      success: true,
      data
    });
  } catch (err) {
    next(err);
  }
};

/* UPDATE ROUTE */
export const updateRoute = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const data = await travellerService.updateRoute(id, userId, req.body);
    
    res.status(200).json({
      success: true,
      message: "Route updated successfully",
      data
    });
  } catch (err) {
    next(err);
  }
};

/* DELETE ROUTE */
export const deleteRoute = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    await travellerService.deleteRoute(id, userId);
    
    res.status(200).json({
      success: true,
      message: "Route deleted successfully"
    });
  } catch (err) {
    next(err);
  }
};
