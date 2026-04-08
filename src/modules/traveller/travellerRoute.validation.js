import Joi from "joi";

// Address schema (reusable for origin and destination)
const addressSchema = Joi.object({
  name: Joi.string().max(255).optional(),
  address: Joi.string().required(),
  city: Joi.string().required(),
  state: Joi.string().required(),
  pincode: Joi.string().pattern(/^\d{6}$/).required(),
  country: Joi.string().default("India"),
  phone: Joi.string().pattern(/^\d{10}$/).optional(), // Made optional - will fetch from profile
  alt_phone: Joi.string().pattern(/^\d{10}$/).optional(),
  place_id: Joi.string().allow(null).optional(),
  aadhar_no: Joi.string().pattern(/^\d{12}$/).optional(),
});

// Main route creation schema
export const createRouteSchema = Joi.object({
  origin: addressSchema.required(),
  destination: addressSchema.required(),
  
  // Scheduling
  departure_date: Joi.string().isoDate().required().when("is_recurring", {
    is: false,
    then: Joi.required(),
    otherwise: Joi.forbidden(),
  }),
  departure_time: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).required(),
  arrival_date: Joi.string().isoDate().optional(),
  arrival_time: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  
  // Recurring fields
  is_recurring: Joi.boolean().default(false),
  recurring_days: Joi.when("is_recurring", {
    is: true,
    then: Joi.array()
      .items(Joi.number().integer().min(0).max(6))
      .min(1)
      .required(),
    otherwise: Joi.forbidden(),
  }),
  recurring_start_date: Joi.when("is_recurring", {
    is: true,
    then: Joi.string().isoDate().required(),
    otherwise: Joi.forbidden(),
  }),
  recurring_end_date: Joi.when("is_recurring", {
    is: true,
    then: Joi.string().isoDate().optional(),
    otherwise: Joi.forbidden(),
  }),
  
  // Vehicle
  vehicle_type: Joi.string()
    .valid("bike", "car", "suv", "van", "truck", "tempo", "bus", "train")
    .required(),
  vehicle_number: Joi.string().max(20).optional(),
  
  // Transport mode (private vehicle, bus, train)
  transport_mode: Joi.string()
    .valid("private", "bus", "train")
    .optional()
    .default("private"),
  
  max_weight_kg: Joi.number().integer().min(1).max(10000).required(),
  
  // Transit details (for bus/train routes) - flexible schema
  transit_details: Joi.object().optional().allow(null),
  
  // Parcel preferences
  accepted_parcel_types: Joi.array()
    .items(Joi.string().valid(
      "documents",
      "electronics",
      "clothing",
      "food",
      "medicines",
      "books",
      "gifts",
      "others"
    ))
    .optional(),
  min_earning_per_delivery: Joi.number().min(0).optional(),
});
