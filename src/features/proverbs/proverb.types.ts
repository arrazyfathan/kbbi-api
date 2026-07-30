import type { Pagination } from "../../lib/pagination.types";

export interface Proverb {
  text: string;
  letter: string;
  slug: string;
  sourceUrl?: string;
}

export interface ProverbList {
  source: string;
  count: number;
  items: Proverb[];
}

export interface PaginatedProverbList {
  source: string;
  pagination: Pagination;
  items: Proverb[];
}

export interface ProverbDetail extends Proverb {
  meaning: string | null;
}
