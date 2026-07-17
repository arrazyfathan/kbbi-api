import { z } from "zod";
import { ApiResponse } from "../interfaces/kbbi.interface";

type ValidationResult<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      response: ApiResponse<never>;
    };

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
): ValidationResult<PaginationParams> {
  const page = parsePositiveIntegerParam(query.page, {
    name: "page",
    defaultValue: options.defaultPage ?? 1,
  });

  if (!page.success) {
    return page;
  }

  const limit = parsePositiveIntegerParam(query.limit, {
    name: "limit",
    defaultValue: options.defaultLimit ?? 20,
    maxValue: options.maxLimit,
  });

  if (!limit.success) {
    return limit;
  }

  return {
    success: true,
    data: {
      page: page.data,
      limit: limit.data,
    },
  };
}

export function parseRequiredQuery(value: unknown, name: string): ValidationResult<string> {
  const parsed = requiredStringSchema.safeParse(value);

  if (!parsed.success) {
    return invalidRequest(`Query parameter '${name}' is required`);
  }

  return {
    success: true,
    data: parsed.data,
  };
}

export function parseWordParam(value: unknown): ValidationResult<{ word: string; normalizedWord: string }> {
  const parsed = requiredStringSchema.safeParse(value);

  if (!parsed.success) {
    return invalidRequest("Parameter 'word' is required and must be a string");
  }

  return {
    success: true,
    data: {
      word: parsed.data,
      normalizedWord: parsed.data.toLocaleLowerCase("id-ID"),
    },
  };
}

export function parseSlugParam(value: unknown): ValidationResult<string> {
  const parsed = requiredStringSchema.transform((slug) => slug.replace(/\s+/g, "_")).safeParse(value);

  if (!parsed.success) {
    return invalidRequest("Parameter 'slug' is required and must be a string");
  }

  return {
    success: true,
    data: parsed.data,
  };
}

function parsePositiveIntegerParam(
  value: unknown,
  options: { name: string; defaultValue: number; maxValue?: number },
): ValidationResult<number> {
  if (value === undefined) {
    return {
      success: true,
      data: options.defaultValue,
    };
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
    return invalidRequest(`Query parameter '${options.name}' must be a positive integer${maxMessage}`);
  }

  return {
    success: true,
    data: parsed.data,
  };
}

function invalidRequest(message: string): ValidationResult<never> {
  return {
    success: false,
    response: {
      success: false,
      message,
    },
  };
}
