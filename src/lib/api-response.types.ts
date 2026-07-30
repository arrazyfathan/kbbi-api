import type { ApiErrorCode, ApiErrorDetails } from "./api-error";

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  code?: ApiErrorCode;
  details?: ApiErrorDetails;
  error?: string;
  requestId?: string;
}
