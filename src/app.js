import express from "express";
import routes from "./routes.js";
import cors from "cors";

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "https://book-my-parcel-frontend.vercel.app",
  "https://book-my-parcel-fr-git-e20a48-pentasoftwareconsultancys-projects.vercel.app"
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || origin.includes("vercel.app") || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true
  })
);

app.use(express.json());

app.use("/api", routes);

app.use("/uploads", express.static("uploads"));

app.get("/", (req, res) => {
  res.status(200).json({ message: "Book My Parcel Backend is running!" });
});

export default app;
