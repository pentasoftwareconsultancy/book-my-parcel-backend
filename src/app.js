import express from "express";
import routes from "./routes.js";
import cors from "cors";
import adminRoutes from "./modules/admin/admin.routes.js";

const app = express();

/* ✅ CORS configuration */
const allowedOrigins = [
  "http://localhost:5173",
  "https://book-my-parcel-frontend.vercel.app/api"
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

// Routes
app.use("/api", routes);

// admin login
app.use("/admin", adminRoutes);

app.use("/uploads", express.static("uploads"));

app.get("/", (req, res) => {
  res.status(200).json({ message: "Book My Parcel Backend is running!" });
});

export default app;
