import { expireOldRequests } from "../services/matchingEngine.service.js";

export function setupSocketHandlers(io) {
  io.on("connection", (socket) => {
    console.log(`[Socket] User connected: ${socket.id}`);

    // ─── Join parcel room ──────────────────────────────────────────────────
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

    // ─── Disconnect ────────────────────────────────────────────────────────
    socket.on("disconnect", () => {
      console.log(`[Socket] User disconnected: ${socket.id}`);
    });
  });

  // ─── Periodic task: Expire old requests ────────────────────────────────
  setInterval(async () => {
    try {
      const expiredCount = await expireOldRequests();
      if (expiredCount > 0) {
        console.log(`[Socket] Expired ${expiredCount} old requests`);
      }
    } catch (error) {
      console.error("[Socket] Error expiring requests:", error.message);
    }
  }, 5 * 60 * 1000); // Every 5 minutes
}

// ─── Emit new acceptance to parcel owner ───────────────────────────────────
export function emitNewAcceptance(io, parcelId, acceptanceData) {
  const room = `parcel_${parcelId}`;
  io.to(room).emit("new_acceptance", acceptanceData);
  console.log(`[Socket] Emitted new_acceptance to room ${room}`);
}

// ─── Emit parcel selected to all subscribers ────────────────────────────────
export function emitParcelSelected(io, parcelId, selectionData) {
  const room = `parcel_${parcelId}`;
  io.to(room).emit("parcel_selected", selectionData);
  console.log(`[Socket] Emitted parcel_selected to room ${room}`);
}

// ─── Emit traveller selected notification ──────────────────────────────────
export function emitTravellerSelected(io, travellerId, selectionData) {
  const room = `traveller_requests_${travellerId}`;
  io.to(room).emit("traveller_selected", selectionData);
  console.log(`[Socket] Emitted traveller_selected to room ${room}`);
}

// ─── Emit new request to traveller ──────────────────────────────────────────
export function emitNewRequest(io, travellerId, requestData) {
  const room = `traveller_requests_${travellerId}`;
  io.to(room).emit("new_request", requestData);
  console.log(`[Socket] Emitted new_request to room ${room}`);
}

// ─── Emit request expired to traveller ──────────────────────────────────────
export function emitRequestExpired(io, travellerId, requestId) {
  const room = `traveller_requests_${travellerId}`;
  io.to(room).emit("request_expired", { request_id: requestId });
  console.log(`[Socket] Emitted request_expired to room ${room}`);
}
