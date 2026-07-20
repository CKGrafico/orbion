import { injectable } from "inversify-hooks";
import type { LogEntry } from "../../../../shared/log";
import type { ILogService } from "../interfaces";

@injectable()
export class LogService implements ILogService {
  private write(level: LogEntry["level"], message: string, context?: Record<string, unknown>): void {
    const entry: LogEntry = { level, message, context, module: "renderer" };
    window.api?.log?.write(entry);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.write("debug", message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.write("info", message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.write("warn", message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.write("error", message, context);
  }
}
