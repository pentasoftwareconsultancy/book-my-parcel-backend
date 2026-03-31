import express from "express";
import routes from "./routes.js";
import cors from "cors";
import { errorHandler } from "./middlewares/error.middleware.js";

const app = express();

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

// Error handling middleware (must be last)
app.use(errorHandler);

export default app;
