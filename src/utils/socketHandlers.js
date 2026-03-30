import { expireOldRequests } from "../services/matchingEngine.service.js";

export function setupSocketHandlers(io) {
  io.on("connection", (socket) => {
    console.log(`[Socket] User connected: ${socket.id}`);

    // ─── Heartbeat/Keepalive ──────────────────────────────────────────────
    socket.on("ping", () => {
      socket.emit("pong");
    });

    // ─── Join user room (for OTP / general notifications) ────────────────
    // Frontend emits either "join_user" or "join_user_room" — handle both
    const joinUserRoom = (userId) => {
      const room = `user_${userId}`;
      socket.join(room);
      console.log(`[Socket] User ${socket.id} joined room ${room}`);
    };
    socket.on("join_user", joinUserRoom);
    socket.on("join_user_room", joinUserRoom);

    // ─── Leave user room ──────────────────────────────────────────────────
    socket.on("leave_user", (userId) => {
      const room = `user_${userId}`;
      socket.leave(room);
      console.log(`[Socket] User ${socket.id} left room ${room}`);
    });

    // ─── Join parcel room ─────────────────────────────────────────────────
    socket.on("join_parcel", (parcelId) => {
      const room = `parcel_${parcelId}`;
      socket.join(room);
      console.log(`[Socket] User ${socket.id} joined room ${room}`);
    });

    // ─── Leave parcel room ────────────────────────────────────────────────
    socket.on("leave_parcel", (parcelId) => {
      const room = `parcel_${parcelId}`;
      socket.leave(room);
      console.log(`[Socket] User ${socket.id} left room ${room}`);
    });

    // ─── Join traveller requests room ─────────────────────────────────────
    socket.on("join_traveller_requests", (travellerId) => {
      const room = `traveller_requests_${travellerId}`;
      socket.join(room);
      console.log(`[Socket] Traveller ${socket.id} joined room ${room}`);
    });

    // ─── Leave traveller requests room ────────────────────────────────────
    socket.on("leave_traveller_requests", (travellerId) => {
      const room = `traveller_requests_${travellerId}`;
      socket.leave(room);
      console.log(`[Socket] Traveller ${socket.id} left room ${room}`);
    });

    // ─── Join live tracking room (both user and traveller join this) ──────
    socket.on("join-booking", (bookingId) => {
      const room = `booking_${bookingId}`;
      socket.join(room);
      console.log(`[Socket] ${socket.id} joined booking room ${room}`);
    });

    // ─── Traveller sends live location → forwarded to user ────────────────
    socket.on("traveller-location", ({ bookingId, lat, lng }) => {
      if (!bookingId || lat == null || lng == null) {
        console.warn(`[Socket] Invalid traveller-location payload:`, { bookingId, lat, lng });
        return;
      }
      const room = `booking_${bookingId}`;
      // socket.to = broadcast to everyone in room EXCEPT the sender
      socket.to(room).emit("location-update", {
        lat,
        lng,
        timestamp: Date.now(),
      });
      console.log(`[Socket] Location → room ${room}: ${lat}, ${lng}`);
    });

    // ─── Disconnect ───────────────────────────────────────────────────────
    socket.on("disconnect", () => {
      console.log(`[Socket] User disconnected: ${socket.id}`);
    });
  });

  // ─── Periodic task: Expire old requests every 5 minutes ──────────────
  setInterval(async () => {
    try {
      const expiredCount = await expireOldRequests();
      if (expiredCount > 0) {
        console.log(`[Socket] Expired ${expiredCount} old requests`);
      }
    } catch (error) {
      console.error("[Socket] Error expiring requests:", error.message);
    }
  }, 5 * 60 * 1000);
}

// ─── Helpers — call these from controllers via req.app.get("io") ──────────────

export function emitNewAcceptance(io, parcelId, data) {
  io.to(`parcel_${parcelId}`).emit("new_acceptance", data);
  console.log(`[Socket] Emitted new_acceptance to parcel_${parcelId}`);
}

export function emitParcelSelected(io, parcelId, data) {
  io.to(`parcel_${parcelId}`).emit("parcel_selected", data);
  console.log(`[Socket] Emitted parcel_selected to parcel_${parcelId}`);
}

export function emitTravellerSelected(io, travellerId, data) {
  io.to(`traveller_requests_${travellerId}`).emit("traveller_selected", data);
  console.log(`[Socket] Emitted traveller_selected to traveller_requests_${travellerId}`);
}

export function emitNewRequest(io, travellerId, data) {
  io.to(`traveller_requests_${travellerId}`).emit("new_request", data);
  console.log(`[Socket] Emitted new_request to traveller_requests_${travellerId}`);
}

export function emitRequestExpired(io, travellerId, requestId) {
  io.to(`traveller_requests_${travellerId}`).emit("request_expired", { request_id: requestId });
  console.log(`[Socket] Emitted request_expired to traveller_requests_${travellerId}`);
}

export function emitOtpEvent(io, userId, event, data) {
  io.to(`user_${userId}`).emit(event, data);
  console.log(`[Socket] Emitted ${event} to user_${userId}`);
}

export function emitBookingEvent(io, bookingId, event, data) {
  io.to(`booking_${bookingId}`).emit(event, data);
  console.log(`[Socket] Emitted ${event} to booking_${bookingId}`);
}