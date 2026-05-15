// SERVICE FILE
// Services contain the business logic — they don't know about HTTP (req/res).
// Controllers call services. This separation means you can reuse the same
// logic from a cron job, a socket event, or a REST endpoint.

import sequelize from "../../config/database.config.js";
import Feedback from "./feedback.model.js";
import Booking from "../booking/booking.model.js";
import TravellerProfile from "../traveller/travellerProfile.model.js";
import Parcel from "../parcel/parcel.model.js";

// ─── Submit Feedback ──────────────────────────────────────────────────────────
export async function submitFeedback(userId, data) {
  const { booking_id, parcel_id, rating, tags, comment } = data;
 
  const booking = await Booking.findOne({
    where: { id: booking_id },
    include: [
      {
        model: Parcel,
        as: "parcel",
        attributes: ["id", "user_id"],
      },
    ],
  });

  if (!booking) throw new Error("Booking not found");

  if (booking.parcel.user_id !== userId) {
    throw new Error("Unauthorized: You can only rate your own deliveries");
  }

  if (booking.status !== "DELIVERED") {
    throw new Error("Feedback can only be submitted after delivery is completed");
  }

  // booking.traveller_id is the User.id of the traveller assigned to this booking
  const traveller_user_id = booking.traveller_id;
  if (!traveller_user_id) throw new Error("No traveller assigned to this booking");

  // Look up TravellerProfile by user_id to get the profile's own id
  // The feedbacks table stores TravellerProfile.id (not User.id) so we can
  // directly join feedbacks → traveller_profiles for the avg rating update
  const travellerProfile = await TravellerProfile.findOne({
    where: { user_id: traveller_user_id },
    attributes: ["id"],
  });
  if (!travellerProfile) throw new Error("Traveller profile not found");

  const traveller_id = travellerProfile.id;

  const existing = await Feedback.findOne({ where: { booking_id } });
  if (existing) throw new Error("Feedback already submitted for this delivery");

  const t = await sequelize.transaction();
  try {
    const feedback = await Feedback.create(
      {
        booking_id,
        parcel_id,
        user_id: userId,
        traveller_id,
        rating,
        tags: tags || [],
        comment: comment || null,
      },
      { transaction: t }
    );

    const [avgResult] = await sequelize.query(
      `SELECT 
         ROUND(AVG(rating)::numeric, 1) AS avg_rating,
         COUNT(*)::integer              AS total_count
       FROM feedbacks
       WHERE traveller_id = :traveller_id`,
      {
        replacements: { traveller_id },
        type: sequelize.QueryTypes.SELECT,
        transaction: t,
      }
    );

    await TravellerProfile.update(
      {
        rating: parseFloat(avgResult.avg_rating),
        total_deliveries: avgResult.total_count,
      },
      { where: { id: traveller_id }, transaction: t }
    );

    await t.commit();
    return feedback;
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

// ─── Get Feedback for a Booking ───────────────────────────────────────────────
// Used to check if the user already submitted feedback (to show/hide the button).
export async function getFeedbackByBooking(bookingId) {
  return Feedback.findOne({ where: { booking_id: bookingId } });
}

// ─── Get All Feedback for a Traveller ────────────────────────────────────────
// Used on the traveller's public profile to display their reviews.
export async function getTravellerFeedback(travellerId) {
  return Feedback.findAll({
    where: { traveller_id: travellerId },
    order: [["created_at", "DESC"]], // newest first
    limit: 50,                       // cap at 50 to avoid huge payloads
  });
}
