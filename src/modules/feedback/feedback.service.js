import sequelize from "../../config/database.config.js";
import Feedback from "./feedback.model.js";
import Booking from "../booking/booking.model.js";
import TravellerProfile from "../traveller/travellerProfile.model.js";
import Parcel from "../parcel/parcel.model.js";
import User from "../user/user.model.js";

// ─── Submit Feedback ──────────────────────────────────────────────────────────
export async function submitFeedback(userId, data) {
  const { booking_id, parcel_id, rating, tags, comment } = data;

  // Validate rating range
  const numRating = Number(rating);
  if (!numRating || numRating < 1 || numRating > 5) {
    throw new Error("Rating must be between 1 and 5");
  }
 
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

// ─── Update Existing Feedback ─────────────────────────────────────────────────
export async function updateFeedback(userId, bookingId, data) {
  const { rating, tags, comment } = data;

  const feedback = await Feedback.findOne({ where: { booking_id: bookingId } });
  if (!feedback) throw new Error("Feedback not found");
  if (feedback.user_id !== userId) throw new Error("Unauthorized");

  await feedback.update({
    rating,
    tags: tags || feedback.tags,
    comment: comment ?? feedback.comment,
  });

  // Recalculate traveller's average rating
  const [avgResult] = await sequelize.query(
    `SELECT ROUND(AVG(rating)::numeric, 1) AS avg_rating, COUNT(*)::integer AS total_count
     FROM feedbacks WHERE traveller_id = :traveller_id`,
    { replacements: { traveller_id: feedback.traveller_id }, type: sequelize.QueryTypes.SELECT }
  );

  await TravellerProfile.update(
    { rating: parseFloat(avgResult.avg_rating) },
    { where: { id: feedback.traveller_id } }
  );

  return feedback;
}
// Used on the traveller's public profile to display their reviews.
export async function getTravellerFeedback(travellerId) {
  return Feedback.findAll({
    where: { traveller_id: travellerId },
    include: [
      {
        model: User,
        as: "reviewer",
        attributes: ["id", "name", "email", "phone"],
        required: false, // LEFT JOIN in case user is deleted
      },
    ],
    order: [["createdAt", "DESC"]], // newest first (use camelCase for Sequelize)
    limit: 50,                       // cap at 50 to avoid huge payloads
  });
}
