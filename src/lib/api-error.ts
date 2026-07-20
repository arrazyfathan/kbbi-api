export const API_ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  UPSTREAM_TIMEOUT: "UPSTREAM_TIMEOUT",
  UPSTREAM_UNAVAILABLE: "UPSTREAM_UNAVAILABLE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  RATE_LIMITED: "RATE_LIMITED",
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

export type ApiErrorDetails = Array<{
  field: string;
  location: "body" | "params" | "query";
  reason: string;
}>;

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly details?: ApiErrorDetails;
  readonly cause?: unknown;

  constructor(
    message: string,
    options: {
      statusCode: number;
      code: ApiErrorCode;
      details?: ApiErrorDetails;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.details = options.details;
    this.cause = options.cause;
  }
}

export function validationError(message: string, details?: ApiErrorDetails): ApiError {
  return new ApiError(message, {
    statusCode: 400,
    code: API_ERROR_CODES.VALIDATION_ERROR,
    details,
  });
}

export function notFoundError(message: string): ApiError {
  return new ApiError(message, {
    statusCode: 404,
    code: API_ERROR_CODES.NOT_FOUND,
  });
}

export function rateLimitedError(message = "Too many requests"): ApiError {
  return new ApiError(message, {
    statusCode: 429,
    code: API_ERROR_CODES.RATE_LIMITED,
  });
}

export function upstreamUnavailableError(message = "Upstream service is unavailable", cause?: unknown): ApiError {
  return new ApiError(message, {
    statusCode: 502,
    code: API_ERROR_CODES.UPSTREAM_UNAVAILABLE,
    cause,
  });
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
