import { AccessKey, LaraApiError, TimeoutError, Translator } from "@translated/lara";
import { UpstreamHttpError } from "../../lib/http-client";

const LARA_BATCH_LIMIT = 128;
const SOURCE_LANGUAGE = "id";

export interface LaraTranslationProvider {
  translate(texts: string[], target: string): Promise<string[]>;
}

export class LaraTranslateClient implements LaraTranslationProvider {
  private readonly translator: Translator;

  constructor(
    accessKeyId: string,
    accessKeySecret: string,
    private readonly timeoutMs: number,
  ) {
    this.translator = new Translator(new AccessKey(accessKeyId, accessKeySecret), {
      connectionTimeoutMs: timeoutMs,
    });
  }

  async translate(texts: string[], target: string): Promise<string[]> {
    const translations: string[] = [];

    try {
      for (let index = 0; index < texts.length; index += LARA_BATCH_LIMIT) {
        const batch = texts.slice(index, index + LARA_BATCH_LIMIT);
        const result = await this.translator.translate(batch, SOURCE_LANGUAGE, target, {
          noTrace: true,
          timeoutInMillis: this.timeoutMs,
        });

        if (!Array.isArray(result.translation) || result.translation.length !== batch.length) {
          throw new Error("Lara Translate returned an unexpected response");
        }

        translations.push(...result.translation);
      }

      return translations;
    } catch (error) {
      throw mapLaraError(error);
    }
  }
}

function mapLaraError(error: unknown): UpstreamHttpError {
  if (error instanceof TimeoutError) {
    return new UpstreamHttpError("Upstream request timed out", {
      statusCode: 504,
      upstream: "lara",
      cause: error,
    });
  }

  if (error instanceof LaraApiError) {
    return new UpstreamHttpError("Upstream service failed", {
      statusCode: 502,
      upstreamStatus: error.statusCode,
      upstream: "lara",
      cause: error,
    });
  }

  return new UpstreamHttpError("Upstream service is unavailable", {
    statusCode: 502,
    upstream: "lara",
    cause: error,
  });
}
