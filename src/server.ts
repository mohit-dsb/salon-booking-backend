import { app } from "./app";
import { logger } from "@/utils/logger";
import { env } from "@/config/environment";
import { DatabaseConnection } from "@/config/database";

(async () => {
  try {
    await DatabaseConnection.connect();
    const server = app.listen(env.PORT, () => {
      logger.info(`Server running on port ${env.PORT} [${env.NODE_ENV}]`);
    });

    // Graceful shutdown
    const shutdown = async () => {
      logger.info("Gracefully shutting down...");
      await DatabaseConnection.disconnect();
      server.close(() => {
        logger.info("Server closed");
        process.exit(0);
      });
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Handle uncaught exceptions/unhandled rejections
    process.on("uncaughtException", (err) => {
      logger.error("Uncaught Exception:", err);
      shutdown();
    });

    process.on("unhandledRejection", (reason) => {
      logger.error("Unhandled Rejection:", reason);
      shutdown();
    });
  } catch (error) {
    logger.error("Startup error:", error);
    process.exit(1);
  }
})();
