import fs from "fs";
import path from "path";
import pino from "pino";
import { env, isDevelopment } from "./env.js";

const logsDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

function appendStream(filename: string) {
  return fs.createWriteStream(path.join(logsDir, filename), { flags: "a" });
}

const baseOptions: pino.LoggerOptions = {
  level: env.LOG_LEVEL,
  base: { service: "amayra-api", env: env.NODE_ENV },
  redact: {
    paths: [
      "password",
      "passwordHash",
      "req.headers.authorization",
      "req.headers.cookie",
      "body.password",
      "body.token",
      "body.idToken",
    ],
    censor: "[Redacted]",
  },
};

const streams: pino.StreamEntry[] = [
  { level: env.LOG_LEVEL, stream: appendStream("combined.log") },
  { level: "error", stream: appendStream("error.log") },
  { level: "warn", stream: appendStream("security.log") },
  { level: "info", stream: appendStream("access.log") },
];

if (isDevelopment) {
  streams.push({
    level: env.LOG_LEVEL,
    stream: pino.transport({
      target: "pino-pretty",
      options: { colorize: true, translateTime: "SYS:standard" },
    }),
  });
} else {
  streams.push({ level: env.LOG_LEVEL, stream: process.stdout });
}

export const logger = pino(baseOptions, pino.multistream(streams));
export const securityLogger = logger.child({ channel: "security" });
export const accessLogger = logger.child({ channel: "access" });

export function logSecurityEvent(event: string, meta: Record<string, unknown> = {}): void {
  securityLogger.warn({ event, ...meta }, event);
}
