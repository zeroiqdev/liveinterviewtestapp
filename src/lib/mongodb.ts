import mongoose from "mongoose";
import dns from "dns";

// Resolve DNS SRV lookup issues on macOS / local ISP DNS
try {
  dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
} catch {
  // Ignore
}

let cached = (global as any).mongoose;

if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null, failedAt: 0 };
}

// A failed connect costs the full server-selection timeout. During an outage,
// fail fast for this long instead of making every caller wait it out again.
const RETRY_AFTER_FAILURE_MS = 30_000;

async function dbConnect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("Please define the MONGODB_URI environment variable inside .env.local");
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise && cached.failedAt && Date.now() - cached.failedAt < RETRY_AFTER_FAILURE_MS) {
    throw new Error("MongoDB connection failed recently; retrying shortly");
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
    };

    cached.promise = mongoose.connect(uri, opts).then((mongoose) => {
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    cached.failedAt = Date.now();
    throw e;
  }

  return cached.conn;
}

export default dbConnect;
