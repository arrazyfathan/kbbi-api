import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import type HealthController from "./health.controller";

export function createHealthRouter(healthController: HealthController): Router {
  const router = Router();

  router.get("/health/live", asyncHandler(healthController.live));
  router.get("/health/ready", asyncHandler(healthController.ready));
  router.get("/health/supabase", asyncHandler(healthController.supabase));

  return router;
}
