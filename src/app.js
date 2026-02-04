import express from "express";
import routes from "./routes.js"; 
import cors from "cors";


const app = express();

app.use(cors({
  origin: "http://localhost:5173", // frontend URL
  credentials: true,              // if using cookies
}));

app.use(express.json());

// Routes
app.use("/api", routes); 

app.get("/", (req, res) => {
  res.status(200).json({ message: "Book My Parcel Backend is running!" });
});

export default app;
