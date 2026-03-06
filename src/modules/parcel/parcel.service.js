import sequelize from "../../config/database.config.js";
import Parcel from "./parcel.model.js";
import { Op } from 'sequelize';
import TravellerProfile from '../traveller/travellerProfile.model.js';
import TravellerRoute from '../traveller/travellerRoute.model.js';
import User from '../user/user.model.js';
import UserProfile from '../user/userProfile.model.js';
import Address from "./address.model.js";
import Booking from "../booking/booking.model.js";
import { uploadFiles } from "../../utils/fileUpload.util.js";
import { BOOKING_STATUS ,BOOKING_TRANSITIONS} from "../../middlewares/role.middleware.js";

// Map package size to weight (example)
const weightMap = { small: 1, medium: 5, large: 10, extra_large: 20 };

export async function createParcelRequest(data, files) {
  const t = await sequelize.transaction();
  try {
    // Calculate weight if not provided
    if (!data.weight) data.weight = weightMap[data.package_size] || 1;

    // Upload photos
    const photoPaths = files?.length ? await uploadFiles(files) : [];

    // Create pickup address
    const pickupAddress = await Address.create(
      {
        ...data.pickup_address,
        type: "pickup",
        user_id: data.user_id,
      },
      { transaction: t }
    );

    // Create delivery address
    const deliveryAddress = await Address.create(
      {
        ...data.delivery_address,
        type: "delivery",
        user_id: data.user_id,
      },
      { transaction: t }
    );

    // Create parcel
    const parcel = await Parcel.create(
      {
        user_id: data.user_id,
        package_size: data.package_size,
        delivery_speed: data.delivery_speed,
        weight: data.weight,
        length: data.length,
        width: data.width,
        height: data.height,
        description: data.description,
        parcel_type: data.parcel_type,
        value: data.value,
        notes: data.notes,
        photos: photoPaths,
        pickup_address_id: pickupAddress.id,
        delivery_address_id: deliveryAddress.id,
        selected_partner_id: data.selected_partner_id || null,
        price_quote: data.price_quote || null,
        status: BOOKING_STATUS.CREATED,
      },
      { transaction: t }
    );

    // Create corresponding booking
    const booking = await Booking.create(
      {
        parcel_id: parcel.id,
        status: BOOKING_STATUS.CREATED,
      },
      { transaction: t }
    );

    await t.commit();
    return { parcel, booking, pickupAddress, deliveryAddress };
  } catch (error) {
    await t.rollback();
    throw error;
  }
}


export async function getUserParcelRequests(userId) {
  const parcels = await Parcel.findAll({
    where: { user_id: userId },
    include: [
      {
        model: Address,
        as: "pickupAddress",
      },
      {
        model: Address,
        as: "deliveryAddress",
      },
      {
        model: Booking, // Include booking data
        as: "booking",
      },
    ],
    order: [["createdAt", "DESC"]],
  });

  return parcels;
}

// New function to get a single parcel by ID
export async function getParcelById(parcelId) {
  const parcel = await Parcel.findOne({
    where: { id: parcelId },
    include: [
      {
        model: Address,
        as: "pickupAddress",
      },
      {
        model: Address,
        as: "deliveryAddress",
      },
      {
        model: Booking, // Include booking data
        as: "booking",
      },
    ],
  });

  return parcel;
}



export const getMatchingParcelsForTraveller = async (userId, options = {}) => {
  const { page = 1, limit = 10 } = options;
  const offset = (page - 1) * limit;

  try {
    // Step 1: Get traveller's profile
    const travellerProfile = await TravellerProfile.findOne({
      where: { user_id: userId }
    });

    if (!travellerProfile) {
      console.log('No traveller profile found');
      return { parcels: [], pagination: { total: 0, page, limit, totalPages: 0 } };
    }

    // Step 2: Get traveller's active routes
    const routes = await TravellerRoute.findAll({
      where: { 
        traveller_profile_id: travellerProfile.id,
        status: 'ACTIVE'
      }
    });

    if (routes.length === 0) {
      console.log('No active routes found');
      return { parcels: [], pagination: { total: 0, page, limit, totalPages: 0 } };
    }

    // Step 3: Build city matching conditions
    const pickupCities = [];
    const deliveryCities = [];

    routes.forEach(route => {
      pickupCities.push(route.origin_city);
      deliveryCities.push(route.destination_city);
      
      if (route.stops && Array.isArray(route.stops)) {
        route.stops.forEach(stop => {
          if (stop.city) {
            pickupCities.push(stop.city);
            deliveryCities.push(stop.city);
          }
        });
      }
    });

    console.log('Pickup cities:', pickupCities);
    console.log('Delivery cities:', deliveryCities);

    // Step 4: Find matching parcels with city filtering in SQL
    const { count, rows: parcels } = await Parcel.findAndCountAll({
      where: {
        status: {
          [Op.in]: ['CREATED', 'MATCHING']
        }
      },
      include: [
        {
          model: Address,
          as: 'pickupAddress',
          where: {
            city: {
              [Op.in]: pickupCities
            }
          },
          required: true
        },
        {
          model: Address,
          as: 'deliveryAddress',
          where: {
            city: {
              [Op.in]: deliveryCities
            }
          },
          required: true
        },
        {
          model: User,
          attributes: ['id', 'name', 'phone_number'],
          required: false
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']],
      distinct: true
    });

    return {
      parcels,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    };
  } catch (error) {
    console.error('Error in getMatchingParcelsForTraveller:', error);
    return { 
      parcels: [], 
      pagination: { total: 0, page: parseInt(page), limit: parseInt(limit), totalPages: 0 } 
    };
  }
};


  
