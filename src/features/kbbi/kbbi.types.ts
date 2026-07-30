export interface Definition {
  wordClass: string;
  description: string;
}

export interface Entry {
  headword: string;
  definitions: Definition[];
}

export interface KbbiSearchResult {
  word: string;
  visitorCount: number | null;
  entries: Entry[];
}
