import type { Pagination } from "../../lib/pagination.types";

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

export type IndonesianFigureListItem = IndonesianFigureSummary | IndonesianFigure;

export interface IndonesianFigureList {
  source: string;
  count: number;
  items: IndonesianFigureSummary[];
}

export interface PaginatedIndonesianFigureList {
  source: string;
  pagination: Pagination;
  items: IndonesianFigureListItem[];
}
