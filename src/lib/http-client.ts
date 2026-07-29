import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";
import logger from "./logger";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 250;
const TRANSIENT_STATUSES = new Set([429, 502, 503, 504]);

const scraperHttpClient = axios.create({
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; KBBI-API/1.1; +https://github.com/arrazyfathan/kbbi-api)",
  },
  timeout: DEFAULT_TIMEOUT_MS,
});

type ScraperRequestOptions = {
  retries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  headers?: AxiosRequestConfig["headers"];
  upstream?: "kbbi" | "wikiquote";
};

type UpstreamMetadata = {
  upstream?: string;
  urlHost?: string;
  upstreamStatus?: number;
  durationMs?: number;
  attempts?: number;
  errorCode?: string;
};

export class UpstreamHttpError extends Error {
  readonly statusCode: number;
  readonly upstreamStatus?: number;
  readonly cause?: unknown;
  readonly upstream?: string;
  readonly urlHost?: string;
  readonly durationMs?: number;
  readonly attempts?: number;
  readonly errorCode?: string;

  constructor(
    message: string,
    options: { statusCode: number; upstreamStatus?: number; cause?: unknown } & UpstreamMetadata,
  ) {
    super(message);
    this.name = "UpstreamHttpError";
    this.statusCode = options.statusCode;
    this.upstreamStatus = options.upstreamStatus;
    this.cause = options.cause;
    this.upstream = options.upstream;
    this.urlHost = options.urlHost;
    this.durationMs = options.durationMs;
    this.attempts = options.attempts;
    this.errorCode = options.errorCode;
  }
}

export async function getScraperHtml(url: string, options: ScraperRequestOptions = {}): Promise<string> {
  const startedAt = Date.now();
  const metadata = {
    upstream: options.upstream ?? inferUpstream(url),
    urlHost: getUrlHost(url),
  };

  try {
    const { response, attempts } = await requestWithRetry<string>(
      () =>
        scraperHttpClient.get<string>(url, {
          headers: options.headers,
          responseType: "text",
          timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS,
          transformResponse: (data) => data,
        }),
      options,
    );
    const durationMs = Date.now() - startedAt;

    logger.info(
      {
        event: "upstream_request",
        ...metadata,
        durationMs,
        attempts,
        status: response.status,
        success: true,
      },
      "Upstream scraper request completed",
    );

    return response.data;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const attempts = getAttemptCount(error);
    const mappedError = mapUpstreamError(error, {
      ...metadata,
      durationMs,
      attempts,
      errorCode: axios.isAxiosError(error) ? error.code : undefined,
    });

    logger.warn(
      {
        event: "upstream_request",
        ...metadata,
        durationMs,
        attempts,
        status: axios.isAxiosError(error) ? error.response?.status : undefined,
        success: false,
        errorCode: axios.isAxiosError(error)
          ? error.code
          : mappedError instanceof UpstreamHttpError
            ? mappedError.errorCode
            : undefined,
      },
      "Upstream scraper request failed",
    );

    throw mappedError;
  }
}

export function isHttpNotFound(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

export function isUpstreamHttpError(error: unknown): error is UpstreamHttpError {
  return error instanceof UpstreamHttpError;
}

async function requestWithRetry<T>(
  request: () => Promise<AxiosResponse<T>>,
  options: ScraperRequestOptions,
): Promise<{ response: AxiosResponse<T>; attempts: number }> {
  const maxRetries = options.retries ?? DEFAULT_RETRIES;
  let attempt = 0;

  while (true) {
    try {
      return {
        response: await request(),
        attempts: attempt + 1,
      };
    } catch (error) {
      if (!shouldRetry(error, attempt, maxRetries)) {
        if (error && typeof error === "object") {
          (error as { scraperAttempts?: number }).scraperAttempts = attempt + 1;
        }

        throw error;
      }

      await delay(getRetryDelayMs(error, attempt, options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS));
      attempt += 1;
    }
  }
}

function shouldRetry(error: unknown, attempt: number, maxRetries: number): boolean {
  if (attempt >= maxRetries || !axios.isAxiosError(error)) {
    return false;
  }

  const status = error.response?.status;

  return status ? TRANSIENT_STATUSES.has(status) : isNetworkOrTimeoutError(error);
}

function mapUpstreamError(error: unknown, metadata: UpstreamMetadata): Error {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error : new Error(String(error));
  }

  const status = error.response?.status;

  if (status === 404) {
    return error;
  }

  if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
    return new UpstreamHttpError("Upstream request timed out", {
      statusCode: 504,
      cause: error,
      ...metadata,
    });
  }

  if (!status) {
    return new UpstreamHttpError("Upstream service is unavailable", {
      statusCode: 502,
      cause: error,
      ...metadata,
    });
  }

  if (status >= 500 || TRANSIENT_STATUSES.has(status)) {
    return new UpstreamHttpError("Upstream service failed", {
      statusCode: 502,
      upstreamStatus: status,
      cause: error,
      ...metadata,
    });
  }

  return error;
}

function isNetworkOrTimeoutError(error: AxiosError): boolean {
  return !error.response || error.code === "ECONNABORTED" || error.code === "ETIMEDOUT";
}

function getRetryDelayMs(error: unknown, attempt: number, baseDelayMs: number): number {
  const retryAfter = axios.isAxiosError(error) ? error.response?.headers["retry-after"] : undefined;
  const retryAfterSeconds = Number.parseInt(Array.isArray(retryAfter) ? retryAfter[0] : String(retryAfter || ""), 10);

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1_000;
  }

  return baseDelayMs * 2 ** attempt;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getUrlHost(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

function inferUpstream(url: string): "kbbi" | "wikiquote" | undefined {
  const host = getUrlHost(url);

  if (!host) {
    return undefined;
  }

  if (host.includes("wikiquote.org")) {
    return "wikiquote";
  }

  if (host.includes("kbbi.")) {
    return "kbbi";
  }

  return undefined;
}

function getAttemptCount(error: unknown): number | undefined {
  return error && typeof error === "object" ? (error as { scraperAttempts?: number }).scraperAttempts : undefined;
}
