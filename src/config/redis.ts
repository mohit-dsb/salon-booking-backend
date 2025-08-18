import { env } from "./environment";
import { logger } from "@/utils/logger";
import { createClient, RedisClientType } from "redis";

class RedisClient {
  private client: RedisClientType;
  private isConnected: boolean = false;

  constructor() {
    this.client = createClient({
      url: env.REDIS_URL,
      socket: {
        connectTimeout: 10000,
      },
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on("connect", () => {
      logger.info("Redis client connected");
      this.isConnected = true;
    });

    this.client.on("ready", () => {
      logger.info("Redis client ready");
    });

    this.client.on("error", (err) => {
      logger.error("Redis client error:", err);
      this.isConnected = false;
    });

    this.client.on("end", () => {
      logger.info("Redis client disconnected");
      this.isConnected = false;
    });

    this.client.on("reconnecting", () => {
      logger.info("Redis client reconnecting...");
    });
  }

  async connect(): Promise<void> {
    try {
      if (!this.isConnected) {
        await this.client.connect();
      }
    } catch (error) {
      logger.error("Failed to connect to Redis:", error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.isConnected) {
        await this.client.quit();
      }
    } catch (error) {
      logger.error("Failed to disconnect from Redis:", error);
      throw error;
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      if (!this.isConnected) {
        logger.warn("Redis not connected, skipping cache get");
        return null;
      }
      return await this.client.get(key);
    } catch (error) {
      logger.error(`Failed to get key ${key} from Redis:`, error);
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    try {
      if (!this.isConnected) {
        logger.warn("Redis not connected, skipping cache set");
        return false;
      }

      const options = ttlSeconds ? { EX: ttlSeconds } : undefined;
      await this.client.set(key, value, options);
      return true;
    } catch (error) {
      logger.error(`Failed to set key ${key} in Redis:`, error);
      return false;
    }
  }

  async del(key: string | string[]): Promise<boolean> {
    try {
      if (!this.isConnected) {
        logger.warn("Redis not connected, skipping cache delete");
        return false;
      }

      if (Array.isArray(key)) {
        await this.client.del(key);
      } else {
        await this.client.del(key);
      }
      return true;
    } catch (error) {
      logger.error(`Failed to delete key(s) from Redis:`, error);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Failed to check existence of key ${key} in Redis:`, error);
      return false;
    }
  }

  async flushPattern(pattern: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        logger.warn("Redis not connected, skipping pattern flush");
        return false;
      }

      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
      return true;
    } catch (error) {
      logger.error(`Failed to flush pattern ${pattern} from Redis:`, error);
      return false;
    }
  }

  async ping(): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }
      const result = await this.client.ping();
      return result === "PONG";
    } catch (error) {
      logger.error("Redis ping failed:", error);
      return false;
    }
  }

  getClient(): RedisClientType {
    return this.client;
  }

  isClientConnected(): boolean {
    return this.isConnected;
  }
}

// Create singleton instance
export const redisClient = new RedisClient();

// Helper function to parse cached JSON safely
export const parseFromCache = <T>(cachedValue: string | null): T | null => {
  if (!cachedValue) return null;

  try {
    return JSON.parse(cachedValue) as T;
  } catch (error) {
    logger.error("Failed to parse cached value:", error);
    return null;
  }
};

// Helper function to stringify for cache
export const stringifyForCache = (value: any): string => {
  return JSON.stringify(value);
};
