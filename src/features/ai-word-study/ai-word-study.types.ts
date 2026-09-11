export type WordStudyLanguage = "id" | "en";

export type WordStudyDefinition = {
  wordClass: string;
  description: string;
};

export type WordStudyEntry = {
  headword: string;
  definitions: WordStudyDefinition[];
};

export type WordStudyRequest = {
  word: string;
  language: WordStudyLanguage;
  entries: WordStudyEntry[];
  provider?: string;
  model?: string;
};

export type WordStudyContent = {
  explanation: string;
  examples: string[];
  usageNotes: string[];
  relatedWords: string[];
};

export type WordStudyResult = WordStudyContent & {
  provider: string;
  model: string;
};

export type WordStudyProviderSummary = {
  id: string;
  defaultModel: string;
  models: string[];
};

export type WordStudyProviderCatalog = {
  defaultProvider: string | null;
  providers: WordStudyProviderSummary[];
};

export interface WordStudyProvider {
  readonly name: string;
  readonly defaultModel: string;
  readonly models: readonly string[];
  generate(request: WordStudyRequest, model: string): Promise<unknown>;
}
