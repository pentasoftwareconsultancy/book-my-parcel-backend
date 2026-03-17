export default function trackingSocket(io, socket) {

  // Join booking room
  socket.on("join-booking", (bookingId) => {
    console.log("JOIN EVENT RECEIVED:", bookingId);
    const room = `booking_${bookingId}`;

    socket.join(room);

    console.log("JOINED ROOM:", socket.id, room);

  });


  // Traveller sending location
  socket.on("traveller-location", ({ bookingId, lat, lng }) => {
    console.log("LOCATION RECEIVED:", bookingId, lat, lng);
    const room = `booking_${bookingId}`;

    io.to(room).emit("location-update", {
      lat,
      lng,
      timestamp: Date.now(),
    });

  });

}