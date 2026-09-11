import { z } from "zod";
import { validationError } from "../../lib/api-error";
import type { WordStudyRequest } from "./ai-word-study.types";

const trimmedString = (maximum: number, minimum = 1) => z.string().trim().min(minimum).max(maximum);

export const wordStudyRequestSchema = z
  .strictObject({
    word: trimmedString(100),
    language: z.enum(["id", "en"]),
    provider: trimmedString(50)
      .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
      .optional(),
    model: trimmedString(200).optional(),
    entries: z
      .array(
        z.strictObject({
          headword: trimmedString(100),
          definitions: z
            .array(
              z.strictObject({
                wordClass: trimmedString(50, 0),
                description: trimmedString(1000),
              }),
            )
            .min(1)
            .max(20),
        }),
      )
      .min(1)
      .max(10),
  })
  .superRefine((value, ctx) => {
    const descriptionLength = value.entries.reduce(
      (total, entry) => total + entry.definitions.reduce((sum, definition) => sum + definition.description.length, 0),
      0,
    );

    if (descriptionLength > 12_000) {
      ctx.addIssue({
        code: "custom",
        path: ["entries"],
        message: "Combined description text must contain at most 12000 characters",
      });
    }
  });

export const wordStudyContentSchema = z.strictObject({
  explanation: z.string().trim().min(1),
  examples: z.array(z.string().trim().min(1)).min(2),
  usageNotes: z.array(z.string().trim().min(1)).min(2),
  relatedWords: z.array(z.string().trim().min(1)).min(3),
});

export function parseWordStudyRequest(body: unknown): WordStudyRequest {
  const parsed = wordStudyRequestSchema.safeParse(body);

  if (parsed.success) {
    return parsed.data;
  }

  throw validationError(
    "Invalid word study request",
    parsed.error.issues.map((issue) => ({
      field: issue.path.join(".") || "body",
      location: "body" as const,
      reason: issue.message,
    })),
  );
}
