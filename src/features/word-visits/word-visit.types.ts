export interface TopVisitedWord {
  word: string;
  visitorCount: number;
}

export interface TopVisitedWordsResult {
  count: number;
  items: TopVisitedWord[];
}
