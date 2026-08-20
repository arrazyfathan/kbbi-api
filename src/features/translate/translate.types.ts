import type { Definition } from "../kbbi/kbbi.types";

export interface TranslatedDefinition extends Definition {
  translation: string;
}

export interface TranslatedEntry {
  headword: string;
  definitions: TranslatedDefinition[];
}

export interface TranslateResult {
  word: string;
  translation: string;
  from: string;
  to: string;
  entries: TranslatedEntry[];
}
