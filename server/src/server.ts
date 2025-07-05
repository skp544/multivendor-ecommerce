import express from "express";
import "dotenv/config";
import cors from "cors";
import connectDB from "./db/db";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection
connectDB();

// Routes
app.get("/", (req, res) => {
  res.send("Welcome to the Multivendor E-commerce API");
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on  http://localhost:${PORT}`);
});
