export interface Definition {
  wordClass: string;
  description: string;
}

export interface Entry {
  headword: string;
  definitions: Definition[];
}

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

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedProverbList {
  source: string;
  pagination: Pagination;
  items: Proverb[];
}

export interface ProverbDetail extends Proverb {
  meaning: string | null;
}

export interface IndonesianFigureSummary {
  name: string | null;
  slug: string;
  sourceUrl: string;
}

export interface IndonesianFigure extends IndonesianFigureSummary {
  photo: string | null;
  description: string | null;
  quotes: string[] | null;
}

export interface IndonesianFigureList {
  source: string;
  count: number;
  items: IndonesianFigureSummary[];
}

export interface PaginatedIndonesianFigureList {
  source: string;
  pagination: Pagination;
  items: IndonesianFigure[];
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}
