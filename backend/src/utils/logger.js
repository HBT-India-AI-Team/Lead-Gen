import winston from 'winston';
import fs from 'fs';
import path from 'path';

// Structured (JSON) logging for project-level jobs/services (src/jobs/**,
// src/services/**, src/repositories/**). Distinct from
// src/automation/utils/logger.js, which backs the scraper's own
// logs/tenderbook.log and is not reused here, mirroring the same
// independence already established for src/utils/retry.js.

const LOGS_DIR = path.resolve('logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const consoleFormat = winston.format.printf(({ timestamp, level, message, label, ...meta }) => {
  const { stack, ...rest } = meta;
  const metaStr = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
  return `[${timestamp}] [${label}] ${level.toUpperCase()}: ${message}${metaStr}${stack ? `\n${stack}` : ''}`;
});

/** Creates a JSON-structured logger scoped to `label`, writing to logs/{label}.log and the console. */
export function createLogger(label) {
  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.label({ label }),
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true })
    ),
    transports: [
      new winston.transports.File({
        filename: path.join(LOGS_DIR, `${label}.log`),
        format: winston.format.combine(winston.format.json())
      }),
      new winston.transports.Console({
        format: winston.format.combine(consoleFormat)
      })
    ]
  });
}
