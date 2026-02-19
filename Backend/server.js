require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const visitorRoutes = require("./routes");

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || "0.0.0.0";
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/visitorDB";
const NODE_ENV = process.env.NODE_ENV || "development";
const CORS_ORIGINS = String(process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable("x-powered-by");

// Basic security headers without introducing extra dependencies.
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

const corsOptions = {
  origin(origin, callback) {
    // Allow non-browser and same-origin requests without Origin header.
    if (!origin) return callback(null, true);

    if (!CORS_ORIGINS.length) return callback(null, true);
    if (CORS_ORIGINS.includes(origin)) return callback(null, true);

    return callback(new Error("CORS not allowed for this origin."));
  },
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  
  res.json({
    status: "ok",
    uptime: Math.floor(process.uptime()),
    env: NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

app.use("/api", visitorRoutes);
app.use("/api", (_req, res) => {
  res.status(404).json({ message: "API route not found. Restart backend and try again." });
});

const frontendPath = path.join(__dirname, "..", "Frontend");
app.use(express.static(frontendPath));

app.get("/", (_req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

app.use((err, _req, res, _next) => {
  console.error("Unhandled server error:", err);
  if (String(err.message || "").toLowerCase().includes("cors")) {
    return res.status(403).json({ message: "Blocked by CORS policy." });
  }
  res.status(500).json({ message: "Internal server error." });
});

let server;

async function startServer() {
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    });

    console.log("MongoDB connected");
    server = app.listen(PORT, HOST, () => {
      console.log(`RICO Visitor System running at http://${HOST}:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error.message);
    process.exit(1);
  }
}

function gracefulShutdown(signal) {
  console.log(`Received ${signal}. Closing server...`);
  const closeServer = server
    ? new Promise((resolve) => server.close(resolve))
    : Promise.resolve();

  closeServer
    .then(() => mongoose.connection.close(false))
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Graceful shutdown error:", error.message);
      process.exit(1);
    });
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

startServer();
