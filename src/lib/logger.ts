import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: process.env.NODE_ENV !== "test",
          ignore: "pid,hostname",
          translateTime: "SYS:standard",
        },
      },
});

export default logger;
