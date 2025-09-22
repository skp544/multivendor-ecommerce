import { IErrorHandler, ISuccessHandler } from "@/types";
import { v4 as uuidv4 } from "uuid";
import mongoose from "mongoose";
import { AppError } from "./AppError";
import { logger } from "./logger";
import sanitize from "sanitize-html"; // For input sanitization

interface ErrorResponse {
  success: boolean;
  errorCode: string;
  message: string;
  stack?: string;
  details?: Record<string, any>;
}

// Static error messages
const ERROR_MESSAGES = {
  validationFailed: "Validation failed",
  invalidField: (field: string, value: string) => `Invalid ${field}: ${value}`,
  invalidToken: "Invalid token. Please login again.",
  tokenExpired: "Your token has expired. Please login again.",
  rateLimitExceeded: "Too many requests. Please try again later.",
  duplicateEntry: "Duplicate entry found.",
};

export const errorHandler = ({
  req,
  res,
  statusCode = 500,
  message = "Internal Server Error",
  error,
}: IErrorHandler) => {
  const correlationId = req.headers["x-correlation-id"] || uuidv4();
  let errorDetails: Record<string, any> = {};
  let errorCode = `ERR-${statusCode}-${uuidv4().slice(0, 8)}`;

  // Mongoose Validation Error
  if (error instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    message = ERROR_MESSAGES.validationFailed;
    errorDetails = Object.values(error.errors).reduce(
      (acc, err: any) => ({
        ...acc,
        [err.path]: sanitize(err.message),
      }),
      {}
    );
    errorCode = "ERR-VALIDATION-400";
  }

  // Mongoose Cast Error
  if (error instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = ERROR_MESSAGES.invalidField(error.path, sanitize(error.value));
    errorCode = "ERR-CAST-400";
  }

  // JWT Errors
  if (error.name === "JsonWebTokenError") {
    statusCode = 401;
    message = ERROR_MESSAGES.invalidToken;
    errorCode = "ERR-JWT-INVALID-401";
  }

  if (error.name === "TokenExpiredError") {
    statusCode = 401;
    message = ERROR_MESSAGES.tokenExpired;
    errorCode = "ERR-JWT-EXPIRED-401";
  }

  // Rate Limit Error
  if (error.code === "RATE_LIMIT_EXCEEDED") {
    statusCode = 429;
    message = ERROR_MESSAGES.rateLimitExceeded;
    errorCode = "ERR-RATE-LIMIT-429";
    errorDetails = {
      retryAfter: error.retryAfter || 60,
    };
  }

  // Database Connection Error
  if (error.name === "MongoServerError" && error.code === 11000) {
    statusCode = 409;
    message = ERROR_MESSAGES.duplicateEntry;
    errorCode = "ERR-DUPLICATE-409";
    errorDetails = {
      field: Object.keys(error.keyValue)[0],
      value: sanitize(error.keyValue[Object.keys(error.keyValue)[0]]),
    };
  }

  // Custom App Error
  if (error instanceof AppError) {
    statusCode = error.statusCode;
    message = sanitize(error.message);
    errorCode = `ERR-APP-${error.statusCode}`;
    errorDetails = { isOperational: error.isOperational };
  }

  // Fallback for native errors
  if (error instanceof Error && !errorDetails.message) {
    message = sanitize(error.message);
  }

  // Structured logging
  logger.error({
    correlationId,
    method: req.method,
    url: req.originalUrl,
    message,
    statusCode,
    errorCode,
    ip: req.ip,
    userAgent: req.get("user-agent"),
    stack: process.env.NODE_ENV !== "production" ? error.stack : undefined,
    details: errorDetails,
    timestamp: new Date().toISOString(),
  });

  const response: ErrorResponse = {
    success: false,
    errorCode,
    message,
    ...(Object.keys(errorDetails).length > 0 && { details: errorDetails }),
    ...(process.env.NODE_ENV !== "production" && { stack: error.stack }),
  };

  res.status(statusCode).json(response);
};

export const successHandler = ({
  res,
  statusCode = 200,
  message = "Success",
  data = null,
}: ISuccessHandler) => {
  res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};
