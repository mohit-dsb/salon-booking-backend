import winston from "winston";
import morgan from "morgan";
import { env } from "@/config/environment";

// Create Winston logger
const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.prettyPrint(),
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: "logs/combined.log",
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
});

// Morgan middleware for HTTP logging
export const morganMiddleware = morgan(":method :url :status :res[content-length] - :response-time ms", {
  stream: {
    write: (message: string) => logger.http(message.trim()),
  },
});

export { logger };
