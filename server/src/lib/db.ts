import mongoose from "mongoose";

/**
 * Mongoose connection for the worker server.
 *
 * Unlike the Next.js cached connection, this is a simple one-shot connect
 * since the worker server doesn't hot-reload.
 */

let isConnected = false;

export async function connectDB(): Promise<void> {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not defined in environment variables");
  }

  await mongoose.connect(uri, {
    bufferCommands: false,
  });

  isConnected = true;
  console.log("[DB] Connected to MongoDB");
}
