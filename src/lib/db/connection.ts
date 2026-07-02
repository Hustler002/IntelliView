import mongoose from "mongoose";

/**
 * Cached Mongoose connection.
 *
 * In Next.js dev mode, hot-reload creates new module instances on every change.
 * Without caching, each reload opens a new MongoDB connection, eventually
 * exhausting the connection pool. We store the promise on `globalThis` so
 * the same connection is reused across hot reloads.
 */

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error(
    "MONGODB_URI is not defined. Add it to .env.local (see .env.example)."
  );
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

// Extend globalThis to hold our cache without TS complaining
declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = globalThis.mongooseCache ?? {
  conn: null,
  promise: null,
};
globalThis.mongooseCache = cached;

export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI!, {
      bufferCommands: false, // Fail fast if not connected, rather than silently queuing
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

export default connectDB;
