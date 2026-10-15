import winston from "winston";
import fs from "fs";
import path from "path";

const LOGS_DIR = path.resolve("logs");

if (!fs.existsSync(LOGS_DIR)) {

    fs.mkdirSync(LOGS_DIR, { recursive: true });

}

export const logger = winston.createLogger({

    level: "info",

    format: winston.format.combine(
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.printf(
            ({ timestamp, level, message }) =>
                `[${timestamp}] [${level.toUpperCase()}] ${message}`
        )
    ),

    transports: [

        new winston.transports.File({
            filename: path.join(LOGS_DIR, "tenderbook.log")
        }),

        new winston.transports.Console()

    ]

});
