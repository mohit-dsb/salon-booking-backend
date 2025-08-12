import "reflect-metadata";
import { app } from "./app";
import { logger } from "@/utils/logger";
import { env } from "@/config/environment";

(async () => {
  try {
    const server = app.listen(env.PORT, () => {
      logger.info(`Server running on port ${env.PORT} [${env.NODE_ENV}]`);
    });

    // Graceful shutdown
    const shutdown = async () => {
      logger.info("Gracefully shutting down...");

      server.close(() => {
        logger.info("Server closed");
        process.exit(0);
      });
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Handle uncaught exceptions/unhandled rejections
    process.on("uncaughtException", (err: Error) => {
      logger.error("Uncaught Exception:", err);
      shutdown();
    });

    process.on("unhandledRejection", (reason: unknown) => {
      logger.error("Unhandled Rejection:", reason);
      shutdown();
    });
  } catch (error) {
    logger.error("Startup error:", error);
    process.exit(1);
  }
})();
