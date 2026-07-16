import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";

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
};

export class UpstreamHttpError extends Error {
  readonly statusCode: number;
  readonly upstreamStatus?: number;
  readonly cause?: unknown;

  constructor(message: string, options: { statusCode: number; upstreamStatus?: number; cause?: unknown }) {
    super(message);
    this.name = "UpstreamHttpError";
    this.statusCode = options.statusCode;
    this.upstreamStatus = options.upstreamStatus;
    this.cause = options.cause;
  }
}

export async function getScraperHtml(url: string, options: ScraperRequestOptions = {}): Promise<string> {
  const response = await requestWithRetry<string>(
    () =>
      scraperHttpClient.get<string>(url, {
        headers: options.headers,
        responseType: "text",
        timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS,
        transformResponse: (data) => data,
      }),
    options,
  );

  return response.data;
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
): Promise<AxiosResponse<T>> {
  const maxRetries = options.retries ?? DEFAULT_RETRIES;
  let attempt = 0;

  while (true) {
    try {
      return await request();
    } catch (error) {
      if (!shouldRetry(error, attempt, maxRetries)) {
        throw mapUpstreamError(error);
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

function mapUpstreamError(error: unknown): never {
  if (!axios.isAxiosError(error)) {
    throw error;
  }

  const status = error.response?.status;

  if (status === 404) {
    throw error;
  }

  if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
    throw new UpstreamHttpError("Upstream request timed out", {
      statusCode: 504,
      cause: error,
    });
  }

  if (!status) {
    throw new UpstreamHttpError("Upstream service is unavailable", {
      statusCode: 502,
      cause: error,
    });
  }

  if (status >= 500 || TRANSIENT_STATUSES.has(status)) {
    throw new UpstreamHttpError("Upstream service failed", {
      statusCode: 502,
      upstreamStatus: status,
      cause: error,
    });
  }

  throw error;
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
