const mongoose = require("mongoose");
require("dotenv").config({ path: ".env.local" });

async function testConnection() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not found in .env.local");
    process.exit(1);
  }

  console.log("Connecting to MongoDB...");
  try {
    await mongoose.connect(uri);
    console.log("Successfully connected to MongoDB!");
    
    // Check if we can reach the DB
    const admin = mongoose.connection.db.admin();
    const info = await admin.serverStatus();
    console.log("Server Version:", info.version);
    
    await mongoose.disconnect();
    console.log("Disconnected.");
  } catch (err) {
    console.error("Connection failed:", err);
    process.exit(1);
  }
}

testConnection();
