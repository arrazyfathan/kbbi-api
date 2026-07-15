import { Request, Response } from "express";
import { checkSupabaseConnection } from "../config/supabase";
import { ApiResponse } from "../interfaces/kbbi.interface";

interface SupabaseHealth {
  connected: boolean;
  host: string | null;
  status?: number;
  statusText?: string;
}

export default class HealthController {
  static async supabase(req: Request, res: Response<ApiResponse<SupabaseHealth>>) {
    try {
      const result = await checkSupabaseConnection();
      const statusCode = result.connected ? 200 : 503;

      res.status(statusCode).json({
        success: result.connected,
        message: result.connected ? "Supabase connection successful" : "Supabase connection failed",
        data: {
          connected: result.connected,
          host: result.host,
          status: result.status,
          statusText: result.statusText,
        },
        error: result.error,
      });
    } catch (error: any) {
      res.status(503).json({
        success: false,
        message: "Supabase connection failed",
        error: error.message,
      });
    }
  }
}
