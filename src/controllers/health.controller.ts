import { Request, Response } from "express";
import { checkSupabaseConnection } from "../config/supabase";
import { ApiResponse } from "../interfaces/kbbi.interface";
import { API_ERROR_CODES } from "../lib/api-error";
import { getRequestId } from "../lib/request-id";

interface SupabaseHealth {
  connected: boolean;
  host: string | null;
  status?: number;
  statusText?: string;
}

export default class HealthController {
  static async supabase(req: Request, res: Response<ApiResponse<SupabaseHealth>>): Promise<void> {
    const result = await checkSupabaseConnection();
    const statusCode = result.connected ? 200 : 503;
    const requestId = getRequestId(req);

    res.status(statusCode).json({
      success: result.connected,
      message: result.connected ? "Supabase connection successful" : "Supabase connection failed",
      ...(!result.connected ? { code: API_ERROR_CODES.UPSTREAM_UNAVAILABLE } : {}),
      ...(!result.connected && requestId ? { requestId } : {}),
      data: {
        connected: result.connected,
        host: result.host,
        status: result.status,
        statusText: result.statusText,
      },
      ...(process.env.NODE_ENV !== "production" && result.error ? { error: result.error } : {}),
    });
  }
}
