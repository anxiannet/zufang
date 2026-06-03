type LogLevel = "INFO" | "ERROR" | "RETRY" | "SKIP";

function write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
  console.log(`[${level}] ${message}${suffix}`);
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => write("INFO", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write("ERROR", message, meta),
  retry: (message: string, meta?: Record<string, unknown>) => write("RETRY", message, meta),
  skip: (message: string, meta?: Record<string, unknown>) => write("SKIP", message, meta)
};
