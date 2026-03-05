import { Op } from "sequelize";
import sequelize from "../../config/database.config.js";
import Booking from "../booking/booking.model.js";
import Parcel from "../parcel/parcel.model.js";
import Address from "../parcel/address.model.js";
import User from "./user.model.js";
import TravellerTrip from "../traveller/travellerTrip.model.js";
import * as userService from "./user.service.js";

export const getUserOrders = async (req, res, next) => {
  try {
    console.log("Fetching orders for user ID:", req.user.id);
    const userId = req.user.id;
    const { status, page = 1, limit = 10 } = req.query;
    console.log("Query params - status:", status, "page:", page, "limit:", limit);

    // Build where clause
    const whereClause = {};
    if (status) {
      whereClause.status = status;
    }
    console.log("Constructed where clause:", whereClause);

    // Fetch bookings with related data
    // const { count, rows: bookings } = await Booking.findAndCountAll({
    //   where: whereClause,
    //   include: [
    //     {
    //       model: Parcel,
    //       as: 'parcel',
    //       include: [
    //         {
    //           model: Address,
    //           as: 'pickupAddress',
    //           attributes: ['city', 'address', 'state']
    //         },
    //         {
    //           model: Address,
    //           as: 'deliveryAddress',
    //           attributes: ['city', 'address', 'state']
    //         }
    //       ]
    //     },
    //     {
    //       model: User,
    //       as: 'traveller',
    //       attributes: ['name', 'phone_number', 'rating'],
    //       required: false
    //     },
    //     {
    //       model: TravellerTrip,
    //       as: 'traveller_trip',
    //       attributes: ['id', 'vehicle_type', 'estimated_duration'],
    //       required: false
    //     }
    //   ],
    //   order: [['createdAt', 'DESC']],
    //   limit: parseInt(limit),
    //   offset: (parseInt(page) - 1) * parseInt(limit)
    // });

    const { count, rows: bookings } = await Booking.findAndCountAll({
      include: [
        {
          model: Parcel,
          as: "parcel",
          where: { user_id: userId }, // ✅ FILTER HERE
          required: true,
          include: [
            {
              model: Address,
              as: "pickupAddress",
              attributes: ["city", "address", "state"],
            },
            {
              model: Address,
              as: "deliveryAddress",
              attributes: ["city", "address", "state"],
            },
          ],
        },
        {
          model: User,
          as: "traveller",
          attributes: ["name", "phone_number", ],
          required: false,
        },
        {
          model: TravellerTrip,
          as: "traveller_trip",
          required: false,
        },
      ],
      order: [["createdAt", "DESC"]],
      limit : parseInt(limit),
      offset : (parseInt(page) - 1) * parseInt(limit)
    });
    // console.log("Fetched bookings count:", count);
    // console.log("Sample booking data:", bookings[0] ? bookings[0].toJSON() : "No bookings found");


    // Transform data for frontend
    const orders = bookings.map(booking => {
      const parcel = booking.parcel;
      const traveler = booking.traveller;

      return {
        id: booking.id,
        bookingId: `BMP${booking.id.substring(0, 8).toUpperCase()}`,
        trackingId: `BMP${booking.id.substring(0, 12).toUpperCase()}`,
        parcelId: `P${parcel.id.substring(0, 6).toUpperCase()}`,
        deliveryId: `D${booking.id.substring(0, 6).toUpperCase()}`,
        status: booking.status,
        amount: parcel.price_quote || 0,
        bookedDate: booking.createdAt.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        }),
        pickup: {
          city: parcel.pickupAddress?.city || '',
          address: parcel.pickupAddress?.address || ''
        },
        delivery: {
          city: parcel.deliveryAddress?.city || '',
          address: parcel.deliveryAddress?.address || ''
        },
        package: {
          size: parcel.package_size,
          weight: `${parcel.weight} kg`,
          eta: booking.traveller_trip?.estimated_duration || 'TBD'
        },
        traveler: traveler ? {
          name: traveler.name,
          rating: traveler.rating || 0,
          phone: traveler.phone_number
        } : {
          name: "Not Assigned",
          rating: 0,
          phone: "-"
        }
      };
    });

    res.json({
      success: true,
      message: "User orders fetched successfully",
      orders,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit))
      }
    });
  }  catch (error) {
  console.error("REAL ERROR:", error.message);
  console.error("ORIGINAL:", error.original);  // ← This is the actual Postgres error
  next(error);
}

};

export const getUserStats = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Get total bookings count
    const totalBookings = await Booking.count({
      where: { user_id: userId }
    });

    // Get bookings by status
    const statusCounts = await Booking.findAll({
      where: { user_id: userId },
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('status')), 'count']
      ],
      group: ['status']
    });

    // Calculate stats
    const stats = {
      totalOrders: totalBookings,
      active: 0,
      completed: 0,
      cancelled: 0,
      totalSpent: 0
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

    // Calculate total spent (this would need to be enhanced with actual payment data)
    // const parcelsWithPrice = await Parcel.findAll({
    //   where: { user_id: userId },
    //   attributes: ['price_quote']
    // });

    const bookings = await Booking.findAll({
      include: [
        {
          model: Parcel,
          as: "parcel",
          where: { user_id: userId },  // ✅ filter here
          required: true
        }
      ]
    });


   stats.totalSpent = bookings
  .map(b => b.parcel?.price_quote || 0)
  .reduce((sum, price) => sum + price, 0);

    res.json({
      success: true,
      message: "User stats fetched successfully",
      stats
    });
  } catch (error) {
    next(error);
  }
};


export const getProfileController = async (req, res) => {
  try {
    console.log("Fetching profile for user ID:", req.user.id);
    const userId = req.user.id;
    console.log("User ID from token:", userId);
    const data = await userService.getProfile(userId);
    console.log("Profile data fetched:", data);
    return res.status(200).json({ success: true, data });
  } catch (error) {
      console.error("Error fetching profile:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateUserProfileController = async (req, res) => {
  try {
    const userId = req.user.id;
    const data = await userService.updateProfile(userId, req.body);
    return res.status(200).json({ success: true, message: "Profile updated", data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

