import Dispute from "./disputes.model.js";
import Booking from "../booking/booking.model.js";

// ─── Create Dispute ───────────────────────────────────────────────────────────
export async function createDisputeService({ booking_id, dispute_type, description, user }) {
  // Booking must exist
  const booking = await Booking.findByPk(booking_id);
  if (!booking) throw new Error("Booking not found");

  // Only allow disputes on active/completed bookings
  const allowedStatuses = ["CONFIRMED", "PICKUP", "IN_TRANSIT", "DELIVERED"];
  if (!allowedStatuses.includes(booking.status)) {
    throw new Error("Disputes can only be raised for active or completed bookings");
  }

  // One dispute per user per booking
  const existing = await Dispute.findOne({ where: { booking_id, raised_by: user.id } });
  if (existing) throw new Error("You have already raised a dispute for this booking");

  // Determine role from activeRole on the JWT user object
  const role = user.activeRole === "TRAVELLER" ? "TRAVELLER" : "USER";

  const dispute = await Dispute.create({
    booking_id,
    raised_by: user.id,
    role,
    dispute_type,
    description: description || null,
    status: "OPEN",
  });

  return dispute;
}

// ─── Get My Disputes ──────────────────────────────────────────────────────────
export async function getMyDisputesService(userId) {
  return Dispute.findAll({
    where: { raised_by: userId },
    order: [["created_at", "DESC"]],
  });
}
