import express from "express";
import routes from "./routes.js"; 
import cors from "cors";
import adminRoutes from "./modules/admin/admin.routes.js";

const app = express();

app.use(cors({
  origin: "http://localhost:5173", // frontend URL
  credentials: true,              // if using cookies
}));

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
