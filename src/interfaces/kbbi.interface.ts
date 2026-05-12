export interface Definition {
  wordClass: string;
  description: string;
}

export interface Entry {
  headword: string;
  definitions: Definition[];
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}
