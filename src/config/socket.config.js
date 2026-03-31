// config/socket.config.js
import { Server } from "socket.io";

let io;

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: "*" },         // tighten in production
  });

  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    // Both traveller + individual join the same room by booking_id
    socket.on("join_tracking", ({ booking_id }) => {
      socket.join(booking_id);
      console.log(`Socket ${socket.id} joined room: ${booking_id}`);
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected:", socket.id);
    });
  });

  return io;
}

export function getIO() {
  if (!io) throw new Error("Socket.IO not initialised yet");
  return io;
}