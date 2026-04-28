import sequelize from "../../config/database.config.js";
import Parcel from "./parcel.model.js";
import { Op } from 'sequelize';
import TravellerProfile from '../traveller/travellerProfile.model.js';
import TravellerRoute from '../traveller/travellerRoute.model.js';
import User from '../user/user.model.js';
import UserProfile from '../user/userProfile.model.js';
import Address from "./address.model.js";
import Booking from "../booking/booking.model.js";
import ParcelAcceptance from "../matching/parcelAcceptance.model.js";
import Feedback from "../feedback/feedback.model.js";
import app from "../../app.js";
import { uploadFiles } from "../../utils/fileUpload.util.js";
import { BOOKING_STATUS, BOOKING_TRANSITIONS } from "../../utils/constants.js";
import { generateParcelId } from "../../utils/idGenerator.js";
import {
  validateAddress,
  geocodeAddress,
  getAddressDescriptors,
  getPlaceDetails,
  computeRoute,
  extractHierarchy,
  extractIntermediateCities,
} from "../../services/googleMaps.service.js";
import { calculatePrice } from "../../services/priceCalculation.service.js";
import { calculatePriceWithSurge } from "../../services/priceCalculation.service.js";
import { getPagination, getPagingData } from "../../utils/pagination.js";
import { refundPaymentForParcel } from "../payment/payment.service.js";
import twilioService from "../../services/twilio.service.js";
import { sendToUser, sendToTraveller } from "../../services/notification.service.js";

const weightMap = { small: 1, medium: 5, large: 10, extra_large: 20 };

// ─── Helper: Enrich address data via Google APIs ──────────────────────────────
// Performs geocoding, place details, and address descriptors calls.
// Returns enriched fields to be merged into the Address record.
// All API calls are done OUTSIDE the DB transaction to avoid holding locks.
async function enrichAddressWithGoogleData(addressData) {
  const { address, city, pincode, place_id } = addressData;
  const enriched = { ...addressData };

  // If any required field is missing, return as-is
  if (!address || !city || !pincode) {
    console.warn("[GoogleMaps] Missing required address fields:", { address, city, pincode });
    return enriched;
  }

  if (!process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY === "your_google_api_key_here") {
    return enriched; // Skip if key not configured
  }

  try {
    // 1. Validate address (best-effort, non-blocking) - uses separate API key
    let validationGranularity = null;
    const hasValidationKey = process.env.GOOGLE_ADDRESS_VALIDATION_API_KEY && 
                              process.env.GOOGLE_ADDRESS_VALIDATION_API_KEY !== "your_address_validation_api_key_here";
    
    if (hasValidationKey) {
      try {
        const validationResult = await validateAddress(`${address}, ${city}, ${pincode}`);
        validationGranularity =
          validationResult?.result?.verdict?.validationGranularity || null;
        // Map Google granularity to our ENUM
        if (validationGranularity) {
          if (["PREMISE", "SUB_PREMISE", "ROUTE"].includes(validationGranularity)) {
            enriched.validation_status = "VALID";
          } else if (validationGranularity === "BLOCK") {
            enriched.validation_status = "PARTIAL";
          } else {
            enriched.validation_status = "INFERRED";
          }
        }
      } catch (e) {
        console.warn("[GoogleMaps] Address validation skipped:", e.message);
      }
    }

    // 2. Geocode to get lat/lng and place_id
    const geocodeResult = await geocodeAddress(`${address}, ${city}, ${pincode}, India`);
    const firstResult = geocodeResult.results?.[0];

    if (!firstResult) {
      console.warn("[GoogleMaps] No geocode result found for:", { address, city, pincode });
      return enriched;
    }

    const location = firstResult.geometry?.location;
    const resolvedPlaceId = place_id || firstResult.place_id;

    enriched.latitude = location?.lat;
    enriched.longitude = location?.lng;
    enriched.place_id = resolvedPlaceId;
    enriched.formatted_address = firstResult.formatted_address;
    enriched.last_geocoded_at = new Date();

    // ✅ Extract plus_code from top-level geocode result
    if (geocodeResult.plus_code?.global_code) {
      enriched.plus_code = geocodeResult.plus_code.global_code;
    }

    // 3. Get place details for administrative hierarchy
    if (resolvedPlaceId) {
      try {
        const placeDetails = await getPlaceDetails(resolvedPlaceId);
        const hierarchy = extractHierarchy(placeDetails);
        if (hierarchy.district)    enriched.district    = hierarchy.district;
        if (hierarchy.taluka)      enriched.taluka      = hierarchy.taluka;
        if (hierarchy.locality)    enriched.locality    = hierarchy.locality;
        if (hierarchy.subLocality) enriched.sub_localities = [hierarchy.subLocality];
      } catch (e) {
        console.warn("[GoogleMaps] Place details skipped:", e.message);
      }
    }

    // 4. Get address descriptors (landmarks) via reverse geocoding
    if (location?.lat && location?.lng) {
      try {
        const descriptorResult = await getAddressDescriptors(location.lat, location.lng);
        // ✅ Correct field: address_descriptor (singular) with landmarks array
        const addressDescriptor = descriptorResult?.address_descriptor;
        if (addressDescriptor?.landmarks && Array.isArray(addressDescriptor.landmarks)) {
          enriched.landmarks = addressDescriptor.landmarks.slice(0, 5).map((lm) => ({
            name: lm.name,
            distance: lm.distanceMeters,
          }));
        }
      } catch (e) {
        console.warn("[GoogleMaps] Address descriptors skipped:", e.message);
      }
    }
  } catch (error) {
    console.error("[GoogleMaps] Address enrichment failed:", error.message);
    // Return partially enriched data rather than throwing
  }

  return enriched;
}

// ─── Helper: Get or create address in DB ──────────────────────────────────────
// Tries to find an existing address (by place_id or by exact fields).
// If found, increments usage_count and returns it.
// If not found, creates a new record with the enriched data.
async function getOrCreateAddress(enrichedData, type, userId, transaction) {
  const { place_id, address, city, pincode } = enrichedData;

  // 1. Look up by place_id (most reliable cache key)
  if (place_id) {
    const existing = await Address.findOne({ where: { place_id }, transaction });
    if (existing) {
      await existing.increment("usage_count", { transaction });
      return existing;
    }
  }

  // 2. Fallback: look up by exact address/city/pincode combo
  const existingByFields = await Address.findOne({
    where: { address, city, pincode },
    transaction,
  });
  if (existingByFields) {
    await existingByFields.increment("usage_count", { transaction });
    return existingByFields;
  }

  // 3. Create new address record
  const newAddress = await Address.create(
    {
      name:             enrichedData.name,
      address:          enrichedData.address,
      city:             enrichedData.city,
      state:            enrichedData.state,
      pincode:          enrichedData.pincode,
      country:          enrichedData.country,
      phone:            enrichedData.phone,
      alt_phone:        enrichedData.alt_phone || null,
      aadhar_no:        enrichedData.aadhar_no || null,
      type,
      user_profile_id:  null, // Don't set user_profile_id for parcel addresses
      // Enriched fields (may be null if Google API not configured)
      place_id:          enrichedData.place_id          || null,
      latitude:          enrichedData.latitude          || null,
      longitude:         enrichedData.longitude         || null,
      plus_code:         enrichedData.plus_code         || null,
      validation_status: enrichedData.validation_status || null,
      district:          enrichedData.district          || null,
      taluka:            enrichedData.taluka            || null,
      locality:          enrichedData.locality          || null,
      landmarks:         enrichedData.landmarks         || null,
      sub_localities:    enrichedData.sub_localities    || null,
      formatted_address: enrichedData.formatted_address || null,
      last_geocoded_at:  enrichedData.last_geocoded_at  || null,
    },
    { transaction }
  );

  return newAddress;
}

// ─── Main Service Functions ───────────────────────────────────────────────────

export async function createParcelRequest(data, files) {
  // Sanitize data: convert empty strings to null or defaults
  if (!data.weight) data.weight = weightMap[data.package_size] || 1;
  
  // Sanitize numeric fields
  data.length = data.length && !isNaN(data.length) ? Number(data.length) : null;
  data.width = data.width && !isNaN(data.width) ? Number(data.width) : null;
  data.height = data.height && !isNaN(data.height) ? Number(data.height) : null;
  data.value = data.value && !isNaN(data.value) ? Number(data.value) : null;
  data.price_quote = data.price_quote && !isNaN(data.price_quote) ? Number(data.price_quote) : null;

  const photoPaths = files?.length ? await uploadFiles(files) : [];

  // ── Step 1: Enrich addresses via Google APIs (OUTSIDE transaction) ──
  const [pickupEnriched, deliveryEnriched] = await Promise.all([
    enrichAddressWithGoogleData(data.pickup_address),
    enrichAddressWithGoogleData(data.delivery_address),
  ]);

  // ── Step 2: Compute route if coordinates are available ──
  let routeDistance    = null;
  let routeDuration    = null;
  let intermediateCities = null;
  let routeGeometry    = null;
  let suggestedPrice   = null;

  if (
    pickupEnriched.latitude && pickupEnriched.longitude &&
    deliveryEnriched.latitude && deliveryEnriched.longitude &&
    process.env.GOOGLE_API_KEY &&
    process.env.GOOGLE_API_KEY !== "your_google_api_key_here"
  ) {
    try {
      const routeResult = await computeRoute(
        { lat: Number(pickupEnriched.latitude), lng: Number(pickupEnriched.longitude) },
        { lat: Number(deliveryEnriched.latitude), lng: Number(deliveryEnriched.longitude) }
      );

      const route = routeResult.routes?.[0];
      if (route) {
        routeDistance = route.distanceMeters / 1000;
        // Duration comes as "3600s" – strip the trailing 's' and convert to minutes
        routeDuration = parseFloat(route.duration?.replace("s", "") || "0") / 60;
        routeGeometry = route.polyline?.encodedPolyline || null;

        const steps = route.legs?.[0]?.steps || [];
        intermediateCities = extractIntermediateCities(steps);
        // route_distance_km is the source of truth for short/long classification in Phase 2
        
        // ── Calculate estimated price with surge multiplier ──────────────────
        try {
          const priceResult = await calculatePriceWithSurge(
            routeDistance,
            data.weight || 1,
            data.length,
            data.width,
            data.height
          );
          suggestedPrice = priceResult.price;
          // Attach surge info to data so it can be returned to the FE
          data._surgeMultiplier = priceResult.surgeMultiplier;
          data._surgeReasons    = priceResult.surgeReasons;
          data._basePrice       = priceResult.basePrice;
          console.log(`[Price] ₹${suggestedPrice} (base ₹${priceResult.basePrice} × ${priceResult.surgeMultiplier}× surge: [${priceResult.surgeReasons.join(", ") || "none"}])`);
        } catch (priceError) {
          console.warn(`[Price] Failed to calculate price: ${priceError.message}`);
          // Fallback to sync calculation
          try { suggestedPrice = calculatePrice(routeDistance, data.weight || 1, data.length, data.width, data.height); } catch {}
        }
      }
    } catch (error) {
      console.error("[GoogleMaps] Route calculation failed:", error.message);
      // Continue without route data
    }
  }

  // ── Step 3: DB transaction with retry logic for duplicate parcel_ref ──
  let retryCount = 0;
  const maxRetries = 3;

  while (retryCount < maxRetries) {
    const parcel_ref = await generateParcelId();
    const t = await sequelize.transaction();
    
    try {
      const pickupAddress   = await getOrCreateAddress(pickupEnriched,   "pickup",   data.user_id, t);
      const deliveryAddress = await getOrCreateAddress(deliveryEnriched, "delivery", data.user_id, t);

      const parcel = await Parcel.create(
        {
          user_id:               data.user_id,
          parcel_ref,
          package_size:          data.package_size,
          weight:                data.weight,
          length:                data.length     || null,
          width:                 data.width      || null,
          height:                data.height     || null,
          description:           data.description || null,
          parcel_type:           data.parcel_type  || null, // user's content type e.g. "Documents"
          value:                 data.value      || null,
          notes:                 data.notes      || null,
          photos:                photoPaths,
          pickup_address_id:     pickupAddress.id,
          delivery_address_id:   deliveryAddress.id,
          selected_partner_id:   data.selected_partner_id || null,
          // Use calculated suggestedPrice as the final price_quote
          price_quote:           suggestedPrice || data.price_quote || null,
          route_distance_km:     routeDistance,
          route_duration_minutes: routeDuration,
          intermediate_cities:   intermediateCities,
          route_geometry:        routeGeometry,
          status:                BOOKING_STATUS.CREATED,
        },
        { transaction: t }
      );

      await t.commit();
      return {
        parcel,
        pickupAddress,
        deliveryAddress,
        suggestedPrice,
        surgeMultiplier: data._surgeMultiplier || 1,
        surgeReasons:    data._surgeReasons    || [],
        basePrice:       data._basePrice       || suggestedPrice,
      };
    } catch (error) {
      await t.rollback();
      
      // Check if it's a unique constraint error on parcel_ref
      if (error.name === 'SequelizeUniqueConstraintError' && 
          error.fields && error.fields.parcel_ref) {
        retryCount++;
        console.log(`[Parcel] Duplicate parcel_ref ${parcel_ref}, retrying... (${retryCount}/${maxRetries})`);
        
        if (retryCount >= maxRetries) {
          throw new Error('Failed to generate unique parcel reference after multiple attempts');
        }
        
        // Wait a bit before retrying to avoid race conditions
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }
      
      // For other errors, throw immediately
      throw error;
    }
  }
}

export async function getUserParcelRequests(userId, query = {}) {
  const { page = 1, limit = 20 } = query;
  const { limit: parsedLimit, offset, page: parsedPage } = getPagination(page, limit);

  const result = await Parcel.findAndCountAll({
    where: { user_id: userId },
    include: [
      { model: Address, as: "pickupAddress" },
      { model: Address, as: "deliveryAddress" },
      { model: Booking, as: "booking" },
      {
        model: ParcelAcceptance,
        as: "acceptances",
        include: [
          {
            model: User,
            as: "traveller",
            attributes: ["id", "email", "phone_number"],
            include: [
              {
                model: TravellerProfile,
                as: "travellerProfile",
                attributes: ["rating", "total_deliveries", "vehicle_type", "vehicle_number"]
              },
              {
                model: UserProfile,
                as: "profile",
                attributes: ["name"]
              }
            ]
          }
        ]
      }
    ],
    order: [["createdAt", "DESC"]],
    limit: parsedLimit,
    offset,
    distinct: true,
    subQuery: false, // prevents Sequelize from wrapping in subquery which strips includes
  });

  // Attach feedback data for DELIVERED parcels
  const bookingIds = result.rows.map((p) => p.booking?.id).filter(Boolean);

  let feedbackMap = {};
  if (bookingIds.length > 0) {
    const feedbacks = await Feedback.findAll({
      where: { booking_id: bookingIds },
      attributes: ["booking_id", "rating", "comment"],
    });
    feedbacks.forEach((f) => { feedbackMap[f.booking_id] = f; });
  }

  const parcels = result.rows.map((p) => {
    const plain = p.toJSON();
    if (plain.booking?.id) {
      const fb = feedbackMap[plain.booking.id];
      plain.has_feedback      = !!fb;
      plain.existing_feedback = fb ? { rating: fb.rating, comment: fb.comment } : null;
    } else {
      plain.has_feedback      = false;
      plain.existing_feedback = null;
    }
    return plain;
  });

  // returns { total, page, limit, totalPages, data: [...] }
  return getPagingData({ count: result.count, rows: parcels }, parsedPage, parsedLimit);
}

export async function getParcelById(parcelId) {
  try {
    // Accept both database ID and parcel reference (e.g., BMP-002)
    // First try parcel_ref (most common case when navigating from UI)
    let parcel = await Parcel.findOne({
      where: { parcel_ref: parcelId },
      include: [
        { model: Address, as: "pickupAddress" },
        { model: Address, as: "deliveryAddress" },
        { 
          model: Booking, 
          as: "booking",
          required: false, // Make booking optional
          include: [
            {
              model: User,
              as: "traveller",
              required: false, // Make traveller optional
              attributes: ["id", "email", "phone_number"],
              include: [
                {
                  model: UserProfile,
                  as: "profile",
                  required: false,
                  attributes: ["name"]
                },
                {
                  model: TravellerProfile,
                  as: "travellerProfile",
                  required: false, // Make profile optional
                  attributes: ["rating", "total_deliveries", "vehicle_type", "vehicle_number"]
                }
              ]
            }
          ]
        },
      ],
    });

    // Fallback to database ID if parcel_ref didn't match
    if (!parcel) {
      parcel = await Parcel.findOne({
        where: { id: parcelId },
        include: [
          { model: Address, as: "pickupAddress" },
          { model: Address, as: "deliveryAddress" },
          { 
            model: Booking, 
            as: "booking",
            required: false, // Make booking optional
            include: [
              {
                model: User,
                as: "traveller",
                required: false, // Make traveller optional
                attributes: ["id", "email", "phone_number"],
                include: [
                  {
                    model: UserProfile,
                    as: "profile",
                    required: false,
                    attributes: ["name"]
                  },
                  {
                    model: TravellerProfile,
                    as: "travellerProfile",
                    required: false, // Make profile optional
                    attributes: ["rating", "total_deliveries", "vehicle_type", "vehicle_number"]
                  }
                ]
              }
            ]
          },
        ],
      });
    }

    return parcel;
  } catch (error) {
    console.error(`[getParcelById] Error fetching parcel ${parcelId}:`, error.message);
    console.error(`[getParcelById] Stack:`, error.stack);
    throw error;
  }
}


// ─── Update Parcel Form Step ──────────────────────────────────────────────────
export async function updateParcelStep(parcelId, stepData, req = null) {
  const t = await sequelize.transaction();
  
  try {
    const parcel = await Parcel.findByPk(parcelId, {
      include: [
        { model: Address, as: "pickupAddress" },
        { model: Address, as: "deliveryAddress" }
      ],
      transaction: t
    });
    
    if (!parcel) {
      await t.rollback();
      throw new Error('Parcel not found');
    }

    const updateData = {};
    
    // Update form step if provided
    if (stepData.form_step !== undefined) {
      updateData.form_step = stepData.form_step;
    }
    
    // Update selected acceptance if provided
    if (stepData.selected_acceptance_id !== undefined) {
      updateData.selected_acceptance_id = stepData.selected_acceptance_id;
    }
    
    // Update selected partner if provided (for backward compatibility)
    if (stepData.selected_partner_id !== undefined) {
      updateData.selected_partner_id = stepData.selected_partner_id;
    }

    // ✅ NEW: Generate Booking ID when Step 3 is completed (payment)
    let booking = null;
    if (stepData.form_step === 3) {
      console.log(`[updateParcelStep] Step 3 completed - Creating booking and confirming traveller selection`);
      
      // Update parcel status to CONFIRMED when payment is done
      updateData.status = "CONFIRMED";
      
      // Check if booking already exists
      booking = await Booking.findOne({ 
        where: { parcel_id: parcelId },
        transaction: t 
      });
      
      // Use selected_partner_id from stepData (MUST be provided) or from parcel as fallback
      const selectedPartnerId = stepData.selected_partner_id || parcel.selected_partner_id;
      
      if (!selectedPartnerId) {
        console.warn(`⚠️ [updateParcelStep] No traveller ID provided for booking creation!`);
        console.warn(`   - stepData.selected_partner_id: ${stepData.selected_partner_id}`);
        console.warn(`   - parcel.selected_partner_id: ${parcel.selected_partner_id}`);
      }
      const paymentMode = stepData.payment_mode || 'PAY_NOW';
      
      if (!booking && selectedPartnerId) {
        // Generate Booking ID
        const { generateBookingId } = await import("../../utils/idGenerator.js");
        const bookingRef = await generateBookingId();
        
        // Create booking with Booking ID (but NO tracking ID yet)
        booking = await Booking.create({
          parcel_id: parcelId,
          traveller_id: selectedPartnerId,
          status: "CONFIRMED",
          booking_ref: bookingRef,
          tracking_ref: null, // Will be generated when IN_TRANSIT
          payment_mode: paymentMode, // Track whether it's pay now or pay after delivery
        }, { transaction: t });
        
        console.log(`[updateParcelStep] Booking created with ID: ${bookingRef} for traveller: ${selectedPartnerId}`);
      } else if (booking && !booking.booking_ref) {
        // Update existing booking with Booking ID
        const { generateBookingId } = await import("../../utils/idGenerator.js");
        const bookingRef = await generateBookingId();
        await booking.update({ booking_ref: bookingRef }, { transaction: t });
        console.log(`[updateParcelStep] Booking updated with ID: ${bookingRef}`);
      }
    }

    await parcel.update(updateData, { transaction: t });
    await t.commit();
    
    // ✅ NEW: Emit WebSocket events when Step 3 is completed (booking confirmed)
    const selectedPartnerId = stepData.selected_partner_id || parcel.selected_partner_id;
    if (stepData.form_step === 3 && booking && selectedPartnerId && req?.app?.get("io")) {
      const io = req.app.get("io");
      
      console.log('🔌 Emitting WebSocket events for booking confirmation (Step 3):', {
        parcelId,
        bookingId: booking.id,
        bookingRef: booking.booking_ref,
        travellerId: selectedPartnerId
      });
      
      // Emit booking confirmation to selected traveller
      const confirmationMessage = "Booking confirmed! Payment received. Proceed to pickup.";
      
      const bookingConfirmedData = {
        booking_id: booking.id,
        booking_ref: booking.booking_ref,
        parcel_id: parcelId,
        parcel_uuid: parcelId,
        parcel_ref: parcel.parcel_ref,
        final_price: parcel.price_quote,
        status: "CONFIRMED",
        payment_mode: booking.payment_mode,
        message: confirmationMessage,
        parcel_details: {
          pickup_address: parcel.pickupAddress,
          delivery_address: parcel.deliveryAddress,
          pickup_city: parcel.pickupAddress?.city,
          delivery_city: parcel.deliveryAddress?.city,
          weight: parcel.weight,
          size: parcel.package_size,
          price: parcel.price_quote,
          pickup_date: parcel.pickup_date,
        }
      };
      
      io.to(`traveller_requests_${selectedPartnerId}`).emit("booking_confirmed", bookingConfirmedData);
      console.log(`🔌 Emitted booking_confirmed to room traveller_requests_${selectedPartnerId}`, bookingConfirmedData);
      
      // Emit to parcel room (for parcel owner)
      io.to(`parcel_${parcelId}`).emit("parcel_booking_confirmed", {
        parcel_id: parcelId,
        booking_id: booking.id,
        booking_ref: booking.booking_ref,
        traveller_id: parcel.selected_partner_id,
        status: "CONFIRMED",
      });
      console.log(`🔌 Emitted parcel_booking_confirmed to room parcel_${parcelId}`);
      
      // Send push notification to traveller
      const { sendToTraveller } = await import("../../services/notification.service.js");
      await sendToTraveller(
        parcel.selected_partner_id,
        "Booking Confirmed!",
        `Your booking ${booking.booking_ref} has been confirmed. Payment received successfully.`,
        {
          parcel_id: parcelId,
          booking_id: booking.id,
          booking_ref: booking.booking_ref,
          type: "booking_confirmed",
        }
      );
    }
    
    console.log(`[updateParcelStep] Updated parcel ${parcelId} to step ${stepData.form_step}`);
    
    return parcel;
  } catch (error) {
    await t.rollback();
    console.error(`[updateParcelStep] Error updating parcel ${parcelId}:`, error.message);
    throw error;
  }
}

// ─── Cancel Parcel (User cancels their own parcel) ─────────────────────────────
export async function cancelParcelRequest(parcelId, userId, cancellationData = {}, req = null) {
  const { reason = "other", details = "" } = cancellationData;
  
  try {
    const parcel = await Parcel.findByPk(parcelId, {
      include: [
        { model: User, as: "user" },
        { model: Booking, as: "booking" },
        { model: Address, as: "pickupAddress",   foreignKey: "pickup_address_id" },
        { model: Address, as: "deliveryAddress", foreignKey: "delivery_address_id" },
      ],
    });
    
    if (!parcel) {
      throw new Error("Parcel not found");
    }

    if (parcel.user_id !== userId) {
      throw new Error("Unauthorized: You don't own this parcel");
    }

    // Check if parcel can be cancelled
    const cancellableStatuses = ["CREATED", "MATCHING", "PARTNER_SELECTED", "CONFIRMED"];
    if (!cancellableStatuses.includes(parcel.status)) {
      throw new Error(`Cannot cancel parcel with status: ${parcel.status}. Can only cancel CREATED, MATCHING, PARTNER_SELECTED, or CONFIRMED status.`);
    }

    // Update parcel status to CANCELLED
    await parcel.update({ status: "CANCELLED" });

    // If there's a booking with this parcel, cancel it too
    const booking = parcel.booking;
    if (booking && !["DELIVERED", "CANCELLED"].includes(booking.status)) {
      await booking.update({ status: "CANCELLED" });
    }

    // Attempt Razorpay refund if payment was made (non-fatal — cancellation proceeds regardless)
    const refundResult = await refundPaymentForParcel(parcelId, `Cancelled by user: ${reason}`);
    if (refundResult.refunded) {
      console.log(`[Cancellation] ✅ Refund of ₹${refundResult.amount} issued (Razorpay ID: ${refundResult.refundId})`);
    }

    // Log cancellation
    console.log(`📋 [Cancellation] Parcel cancelled:`, {
      parcel_id: parcelId,
      parcel_ref: parcel.parcel_ref,
      user_id: userId,
      previous_status: parcel.status,
      new_status: "CANCELLED",
      reason,
      details,
    });

    // Emit WebSocket event to both user and traveller
    const io = app.get("io");
    
    if (io) {
      const cancelData = {
        parcel_id: parcelId,
        parcel_ref: parcel.parcel_ref,
        booking_id: booking?.id,
        booking_ref: booking?.booking_ref,
        status: "CANCELLED",
        cancelled_by: "user",
        reason,
        cancelled_at: new Date(),
      };

      // Emit to user's room so they see the parcel removed
      const userRoom = `user_${userId}`;
      io.to(userRoom).emit("parcel_cancelled", cancelData);
      console.log(`[WebSocket] Emitted parcel_cancelled to user ${userRoom}`);

      // Emit to traveller's room if booking exists
      if (booking) {
        const travellerRoom = `user_${booking.traveller_id}`;
        io.to(travellerRoom).emit("booking_cancelled", cancelData);
        console.log(`[WebSocket] Emitted booking_cancelled to traveller ${travellerRoom}`);
      }
    }

    // ── SMS + push notifications (best-effort, non-fatal) ─────────────────
    try {
      const fromCity = parcel.pickupAddress?.city  || "pickup";
      const toCity   = parcel.deliveryAddress?.city || "delivery";

      // Notify sender (in-app)
      await sendToUser(
        userId,
        "Parcel Cancelled",
        `Your parcel ${parcel.parcel_ref || parcelId} (${fromCity} → ${toCity}) has been cancelled.`,
        { type: "parcel_cancelled", parcel_id: parcelId }
      );

      // Notify traveller if a booking existed
      if (booking?.traveller_id) {
        await sendToTraveller(
          booking.traveller_id,
          "Booking Cancelled",
          `The sender cancelled parcel ${parcel.parcel_ref || parcelId} (${fromCity} → ${toCity}). Booking ref: ${booking.booking_ref || "N/A"}.`,
          { type: "booking_cancelled", booking_id: booking.id }
        );

        // SMS to traveller
        const travellerUser = await User.findByPk(booking.traveller_id);
        if (travellerUser?.phone_number) {
          await twilioService.sendSMS(
            travellerUser.phone_number,
            `Book My Parcel: The sender has cancelled booking ${booking.booking_ref || ""}. Parcel: ${fromCity} → ${toCity}. No action needed.`
          );
        }
      }
    } catch (notifErr) {
      console.error("[cancelParcelRequest] Notification failed (non-fatal):", notifErr.message);
    }

    return {
      success: true,
      parcel_id: parcelId,
      parcel_ref: parcel.parcel_ref,
      status: "CANCELLED",
      message: "Parcel cancelled successfully",
      cancelled_at: new Date(),
    };
  } catch (error) {
    console.error(`[cancelParcelRequest] Error cancelling parcel:`, error.message);
    throw error;
  }
}