import dotenv from "dotenv";
import { cleanEnv, str, port, num, bool } from "envalid";

dotenv.config();

export const env = cleanEnv(process.env, {
  NODE_ENV: str({ choices: ["development", "test", "production"] }),
  PORT: port({ default: 3000 }),
  MONGODB_URI: str(),
  LOG_LEVEL: str({ default: "info", choices: ["error", "warn", "info", "debug"] }),
  RATE_LIMIT_WINDOW_MS: num({ default: 15 * 60 * 1000 }),
  RATE_LIMIT_MAX_REQUESTS: num({ default: 100 }),
  SWAGGER_ENABLED: bool({ default: false }),
});
