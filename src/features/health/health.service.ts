import { checkSupabaseConnection } from "../../config/supabase";
import config from "../../config";

export type DependencyHealthStatus = "ok" | "failed" | "skipped";

export type DependencyHealth = {
  name: "supabase";
  status: DependencyHealthStatus;
  required: boolean;
  host: string | null;
  statusCode?: number;
  statusText?: string;
  error?: string;
};

export type ReadinessHealth = {
  ready: boolean;
  dependencies: DependencyHealth[];
};

export type LivenessHealth = {
  alive: true;
};

export type SupabaseConnectionCheck = typeof checkSupabaseConnection;

export class HealthService {
  constructor(private readonly checkSupabase: SupabaseConnectionCheck = checkSupabaseConnection) {}

  live(): LivenessHealth {
    return { alive: true };
  }

  async ready(): Promise<ReadinessHealth> {
    if (!config.isSupabaseConfigured) {
      return {
        ready: true,
        dependencies: [
          {
            name: "supabase",
            status: "skipped",
            required: false,
            host: null,
          },
        ],
      };
    }

    const supabase = await this.supabaseDependency();

    return {
      ready: supabase.status === "ok",
      dependencies: [supabase],
    };
  }

  async supabaseDependency(): Promise<DependencyHealth> {
    const result = await this.checkSupabase();

    return {
      name: "supabase",
      status: result.connected ? "ok" : "failed",
      required: config.isSupabaseConfigured,
      host: result.host,
      statusCode: result.status,
      statusText: result.statusText,
      error: result.error,
    };
  }
}
