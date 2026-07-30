import { Request, Response } from "express";
import { API_ERROR_CODES } from "../../lib/api-error";
import type { ApiResponse } from "../../lib/api-response.types";
import { getRequestId } from "../../lib/request-id";
import { HealthService, LivenessHealth, ReadinessHealth } from "./health.service";

interface SupabaseHealth {
  connected: boolean;
  host: string | null;
  status?: number;
  statusText?: string;
}

export default class HealthController {
  constructor(private readonly healthService = new HealthService()) {}

  live = async (_req: Request, res: Response<ApiResponse<LivenessHealth>>): Promise<void> => {
    res.status(200).json({
      success: true,
      message: "Process is alive",
      data: this.healthService.live(),
    });
  };

  ready = async (req: Request, res: Response<ApiResponse<ReadinessHealth>>): Promise<void> => {
    const result = await this.healthService.ready();
    const statusCode = result.ready ? 200 : 503;
    const requestId = getRequestId(req);

    res.status(statusCode).json({
      success: result.ready,
      message: result.ready ? "Application is ready" : "Application is not ready",
      ...(!result.ready ? { code: API_ERROR_CODES.UPSTREAM_UNAVAILABLE } : {}),
      ...(!result.ready && requestId ? { requestId } : {}),
      data: this.publicReadiness(result),
      ...(process.env.NODE_ENV !== "production" ? this.readinessError(result) : {}),
    });
  };

  supabase = async (req: Request, res: Response<ApiResponse<SupabaseHealth>>): Promise<void> => {
    const result = await this.healthService.supabaseDependency();
    const connected = result.status === "ok";
    const statusCode = connected ? 200 : 503;
    const requestId = getRequestId(req);

    res.status(statusCode).json({
      success: connected,
      message: connected ? "Supabase connection successful" : "Supabase connection failed",
      ...(!connected ? { code: API_ERROR_CODES.UPSTREAM_UNAVAILABLE } : {}),
      ...(!connected && requestId ? { requestId } : {}),
      data: {
        connected,
        host: result.host,
        status: result.statusCode,
        statusText: result.statusText,
      },
      ...(process.env.NODE_ENV !== "production" && result.error ? { error: result.error } : {}),
    });
  };

  private publicReadiness(result: ReadinessHealth): ReadinessHealth {
    return {
      ready: result.ready,
      dependencies: result.dependencies.map((dependency) => ({
        name: dependency.name,
        status: dependency.status,
        required: dependency.required,
        host: dependency.host,
        statusCode: dependency.statusCode,
        statusText: dependency.statusText,
      })),
    };
  }

  private readinessError(result: ReadinessHealth): Pick<ApiResponse<ReadinessHealth>, "error"> {
    const failed = result.dependencies.find((dependency) => dependency.status === "failed" && dependency.error);

    return failed?.error ? { error: failed.error } : {};
  }
}
