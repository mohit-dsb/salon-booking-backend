import mongoose from "mongoose";
import { logger } from "@/utils/logger";
import { env } from "@/config/environment";

export class DatabaseConnection {
  public static async connect(): Promise<void> {
    try {
      const mongooseOptions: mongoose.ConnectOptions = {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        bufferCommands: false,
      };

      if (env.NODE_ENV === "production") {
        mongooseOptions.retryWrites = true;
        mongooseOptions.writeConcern = {
          w: "majority",
          wtimeout: 10000,
          j: true,
        };
      }

      await mongoose.connect(env.MONGODB_URI, mongooseOptions);

      logger.info("Database connected successfully");
    } catch (error) {
      logger.error("Database connection failed:", error);
      process.exit(1);
    }
  }

  public static async disconnect(): Promise<void> {
    try {
      await mongoose.disconnect();
      logger.info("Database disconnected successfully");
    } catch (error) {
      logger.error("Database disconnection failed:", error);
    }
  }
}
