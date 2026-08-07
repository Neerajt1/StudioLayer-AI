import { createRequire } from "node:module";
import pino, { type Logger } from "pino";

const require = createRequire(import.meta.url);
const isProduction = process.env.NODE_ENV === "production";

const baseOptions = {
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
};

function createLogger(): Logger {
  if (isProduction) {
    return pino(baseOptions);
  }

  // Loaded only in development — not bundled; avoids worker transports under node --watch.
  const pretty = require("pino-pretty") as typeof import("pino-pretty");
  return pino(baseOptions, pretty({ colorize: true, sync: true }));
}

let loggerInstance: Logger | undefined;

function getLogger(): Logger {
  if (!loggerInstance) {
    loggerInstance = createLogger();
  }
  return loggerInstance;
}

export const logger: Logger = new Proxy({} as Logger, {
  get(_target, prop, receiver) {
    const instance = getLogger();
    const value = Reflect.get(instance, prop, instance);
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(instance)
      : value;
  },
});
