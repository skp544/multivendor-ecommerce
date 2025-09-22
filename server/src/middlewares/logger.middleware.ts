import { v4 as uuidv4 } from "uuid";
import { logger } from "@/utils/logger";
import { NextFunction, Request, Response } from "express";
import sanitize from "sanitize-html";

// Sensitive query/body parameters to mask
const SENSITIVE_PARAMS = ["password", "token", "apiKey", "secret"];

// Routes to skip logging (e.g., health checks, static files)
const SKIP_LOGGING_ROUTES = ["/health", "/ping", "/static"];

// Sampling rate for high-traffic scenarios (1.0 = log all, 0.1 = log 10%)
const LOG_SAMPLING_RATE = process.env.LOG_SAMPLING_RATE
  ? parseFloat(process.env.LOG_SAMPLING_RATE)
  : 1.0;

interface LogData {
  correlationId: string;
  method: string;
  url: string;
  ip: string;
  userAgent?: string;
  query?: Record<string, any>;
  body?: Record<string, any>;
  statusCode?: number;
  responseTime?: number;
  timestamp: string;
}

export const logRequest = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Skip logging for specified routes (partial match for paths like /static/*)
    if (
      SKIP_LOGGING_ROUTES.some((route) => req.originalUrl.startsWith(route))
    ) {
      return next();
    }

    // Skip logging based on sampling rate
    if (LOG_SAMPLING_RATE < 1.0 && Math.random() > LOG_SAMPLING_RATE) {
      return next();
    }

    // Generate or use existing correlation ID
    const correlationId = (req.headers["x-correlation-id"] ||
      req.headers["correlation-id"] ||
      uuidv4()) as string;
    req.headers["x-correlation-id"] = correlationId;

    // Start time for performance measurement
    const startTime = process.hrtime();

    // Mask sensitive query parameters
    const sanitizedQuery: Record<string, any> = { ...req.query };
    SENSITIVE_PARAMS.forEach((param) => {
      if (sanitizedQuery[param]) {
        sanitizedQuery[param] = "****";
      }
    });

    // Mask sensitive body parameters (only in development for POST/PUT)
    let sanitizedBody: Record<string, any> | undefined;
    if (
      process.env.NODE_ENV !== "production" &&
      ["POST", "PUT"].includes(req.method) &&
      req.body &&
      typeof req.body === "object"
    ) {
      sanitizedBody = { ...req.body };
      SENSITIVE_PARAMS.forEach((param) => {
        if (sanitizedBody && sanitizedBody[param]) {
          sanitizedBody[param] = sanitize(sanitizedBody[param]);
        }
      });
    }

    // Prepare initial log data
    const logData: LogData = {
      correlationId,
      method: req.method,
      url: req.originalUrl,
      ip: req.ip!,
      userAgent: req.get("user-agent"),
      query:
        Object.keys(sanitizedQuery).length > 0 ? sanitizedQuery : undefined,
      body: sanitizedBody,
      timestamp: new Date().toISOString(),
    };

    // Capture response status and timing
    res.on("finish", () => {
      const [seconds, nanoseconds] = process.hrtime(startTime);
      const responseTime = (seconds * 1000 + nanoseconds / 1e6).toFixed(2); // Convert to milliseconds

      logData.statusCode = res.statusCode;
      logData.responseTime = Number(responseTime);

      // Log level based on status code
      const logLevel = res.statusCode >= 400 ? "error" : "info";

      // Structured logging
      logger[logLevel]({
        ...logData,
        ...(process.env.NODE_ENV !== "production" && { headers: req.headers }),
      });
    });

    next();
  } catch (err) {
    // Log middleware errors to prevent crashes
    logger.error({
      correlationId: req.headers["x-correlation-id"] || uuidv4(),
      message: "Error in logRequest middleware",
      error: err instanceof Error ? err.message : "Unknown error",
      stack:
        process.env.NODE_ENV !== "production"
          ? err instanceof Error
            ? err.stack
            : undefined
          : undefined,
      timestamp: new Date().toISOString(),
    });
    next(err); // Pass error to error handler
  }
};
