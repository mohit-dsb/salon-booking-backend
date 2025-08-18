import { logger } from "@/utils/logger";
import { env } from "@/config/environment";
import { redisClient, parseFromCache, stringifyForCache } from "@/config/redis";

export class CacheService {
  private defaultTTL: number;

  constructor() {
    this.defaultTTL = env.CACHE_TTL;
    redisClient.connect();
  }

  // Generic cache get method
  async get<T>(key: string): Promise<T | null> {
    try {
      const cachedValue = await redisClient.get(key);
      if (!cachedValue) {
        logger.debug(`Cache miss for key: ${key}`);
        return null;
      }

      logger.debug(`Cache hit for key: ${key}`);
      return parseFromCache<T>(cachedValue);
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  // Generic cache set method
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
    try {
      const ttl = ttlSeconds || this.defaultTTL;
      const success = await redisClient.set(key, stringifyForCache(value), ttl);

      if (success) {
        logger.debug(`Cache set for key: ${key}, TTL: ${ttl}s`);
      }

      return success;
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
      return false;
    }
  }

  // Delete cache entries
  async delete(key: string | string[]): Promise<boolean> {
    try {
      const success = await redisClient.del(key);
      logger.debug(`Cache delete for key(s): ${Array.isArray(key) ? key.join(", ") : key}`);
      return success;
    } catch (error) {
      logger.error(`Cache delete error:`, error);
      return false;
    }
  }

  // Invalidate cache patterns (for when data changes)
  async invalidatePattern(pattern: string): Promise<boolean> {
    try {
      const success = await redisClient.flushPattern(pattern);
      logger.debug(`Cache pattern invalidated: ${pattern}`);
      return success;
    } catch (error) {
      logger.error(`Cache pattern invalidation error for ${pattern}:`, error);
      return false;
    }
  }

  // Health check
  async healthCheck(): Promise<{ status: string; connected: boolean }> {
    try {
      const connected = redisClient.isClientConnected();
      const pingSuccess = connected ? await redisClient.ping() : false;

      return {
        status: connected && pingSuccess ? "healthy" : "unhealthy",
        connected: connected && pingSuccess,
      };
    } catch (error) {
      logger.error("Cache health check failed:", error);
      return {
        status: "unhealthy",
        connected: false,
      };
    }
  }
}

// Create singleton instance
export const cacheService = new CacheService();
