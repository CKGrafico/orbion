export type LogLevel = "debug" | "info" | "warn" | "error";

export type SerializableValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | SerializableValue[]
  | { [key: string]: SerializableValue };

export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, SerializableValue>;
  module?: string;
}
