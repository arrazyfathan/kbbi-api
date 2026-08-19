import { z } from "zod";
import { validationError } from "./api-error";

type PaginationOptions = {
  maxLimit: number;
  defaultPage?: number;
  defaultLimit?: number;
};

type PaginationParams = {
  page: number;
  limit: number;
};

const requiredStringSchema = z.string().trim().min(1);

export function parsePaginationParams(
  query: { page?: unknown; limit?: unknown },
  options: PaginationOptions,
): PaginationParams {
  const page = parsePositiveIntegerParam(query.page, {
    name: "page",
    location: "query",
    defaultValue: options.defaultPage ?? 1,
  });

  const limit = parsePositiveIntegerParam(query.limit, {
    name: "limit",
    location: "query",
    defaultValue: options.defaultLimit ?? 20,
    maxValue: options.maxLimit,
  });

  return {
    page,
    limit,
  };
}

export function parseRequiredQuery(value: unknown, name: string): string {
  const parsed = requiredStringSchema.safeParse(value);

  if (!parsed.success) {
    throw invalidRequest(`Query parameter '${name}' is required`, {
      field: name,
      location: "query",
      reason: "Required non-empty string",
    });
  }

  return parsed.data;
}

export function parseBooleanQuery(value: unknown, name: string, defaultValue = false): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  const parsed = z.enum(["true", "false"]).safeParse(value);

  if (!parsed.success) {
    throw invalidRequest(`Query parameter '${name}' must be either 'true' or 'false'`, {
      field: name,
      location: "query",
      reason: "Must be either 'true' or 'false'",
    });
  }

  return parsed.data === "true";
}

const isoLanguageCodeSchema = z
  .string()
  .trim()
  .regex(/^[a-z]{2,3}(-[A-Z0-9]{2,3})?$/i);

export function parseOptionalLanguageQuery(value: unknown, name = "to", defaultValue = "en"): string {
  if (value === undefined) {
    return defaultValue;
  }

  const parsed = isoLanguageCodeSchema.safeParse(value);

  if (!parsed.success) {
    throw invalidRequest(`Query parameter '${name}' must be an ISO language code`, {
      field: name,
      location: "query",
      reason: "Must be a valid ISO 639-1/639-2 language code",
    });
  }

  return parsed.data.toLowerCase();
}

export function parseWordParam(value: unknown): { word: string; normalizedWord: string } {
  const parsed = requiredStringSchema.safeParse(value);

  if (!parsed.success) {
    throw invalidRequest("Parameter 'word' is required and must be a string", {
      field: "word",
      location: "params",
      reason: "Required non-empty string",
    });
  }

  return {
    word: parsed.data,
    normalizedWord: parsed.data.toLocaleLowerCase("id-ID"),
  };
}

export function parseSlugParam(value: unknown): string {
  const parsed = requiredStringSchema.transform((slug) => slug.replace(/\s+/g, "_")).safeParse(value);

  if (!parsed.success) {
    throw invalidRequest("Parameter 'slug' is required and must be a string", {
      field: "slug",
      location: "params",
      reason: "Required non-empty string",
    });
  }

  return parsed.data;
}

function parsePositiveIntegerParam(
  value: unknown,
  options: { name: string; location: "query"; defaultValue: number; maxValue?: number },
): number {
  if (value === undefined) {
    return options.defaultValue;
  }

  const parsed = z
    .string()
    .trim()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(
      z
        .number()
        .int()
        .min(1)
        .max(options.maxValue ?? Number.MAX_SAFE_INTEGER),
    )
    .safeParse(value);

  if (!parsed.success) {
    const maxMessage = options.maxValue ? ` and must be less than or equal to ${options.maxValue}` : "";
    throw invalidRequest(`Query parameter '${options.name}' must be a positive integer${maxMessage}`, {
      field: options.name,
      location: options.location,
      reason: `Must be a positive integer${maxMessage}`,
    });
  }

  return parsed.data;
}

function invalidRequest(message: string, detail: { field: string; location: "params" | "query"; reason: string }) {
  return validationError(message, [detail]);
}
