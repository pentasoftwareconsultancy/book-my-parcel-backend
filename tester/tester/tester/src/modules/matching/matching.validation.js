import Joi from "joi";

export const selectTravellerSchema = Joi.object({
  traveller_id: Joi.string().uuid().required().messages({
    "string.guid": "traveller_id must be a valid UUID",
  }),
  acceptance_price: Joi.number().min(0).optional().messages({
    "number.base": "acceptance_price must be a number",
    "number.min": "acceptance_price must be non-negative",
  }),
}).options({ allowUnknown: false });

export const storeFCMTokenSchema = Joi.object({
  token: Joi.string().required().messages({
    "string.empty": "FCM token is required",
  }),
  device_type: Joi.string().valid("mobile", "web").default("mobile"),
}).options({ allowUnknown: false });
