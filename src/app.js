import express from "express";
import routes from "./routes.js";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import trackingSocket from "./socket/trackingSocket.js";

const app = express();
const server = http.createServer(app);

export const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  },
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  trackingSocket(io, socket);
});

/* ✅ CORS configuration */
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://book-my-parcel-frontend.vercel.app/api",
  "https://book-my-parcel-frontend.vercel.app"
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

app.use(express.json());

app.use("/api", routes);
app.use("/uploads", express.static("uploads"));

app.get("/", (req, res) => {
  res.status(200).json({ message: "Book My Parcel Backend is running!" });
});

export { app, server };