import log from "electron-log";
import { app } from "electron";
import path from "node:path";

log.transports.file.level = "info";
log.transports.file.maxSize = 5 * 1024 * 1024; // 5MB per file
log.transports.file.resolvePathFn = () =>
  path.join(app?.getPath?.("userData") ?? process.cwd(), "logs", "main.log");
log.transports.file.format = "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}";

if (process.env.NODE_ENV === "development") {
  log.transports.console.level = "debug";
  log.transports.console.format = "[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}";
} else {
  log.transports.console.level = false;
}

const envLevel = process.env.LOG_LEVEL;
if (envLevel && ["debug", "info", "warn", "error"].includes(envLevel)) {
  log.transports.file.level = envLevel as "debug" | "info" | "warn" | "error";
}

export const logger = log.scope("app");

export function createLogger(module: string) {
  return log.scope(module);
}

export default logger;
