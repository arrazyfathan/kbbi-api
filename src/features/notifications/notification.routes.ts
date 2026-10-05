import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { firebaseSender } from "./firebase-sender";
import { NotificationController } from "./notification.controller";
import { NotificationService } from "./notification.service";

function service() {
  return new NotificationService(undefined, firebaseSender);
}

export function createNotificationRouter(makeService: () => NotificationService = service): Router {
  const router = Router();
  const admin = Router();
  const controller = new NotificationController(makeService);
  admin.use(asyncHandler(controller.authorize));
  admin.get("/health", asyncHandler(controller.health));
  admin.get("/", asyncHandler(controller.list));
  admin.post("/", asyncHandler(controller.create));
  admin.get("/:id", asyncHandler(controller.get));
  admin.patch("/:id", asyncHandler(controller.edit));
  admin.get("/:id/deliveries", asyncHandler(controller.deliveries));
  admin.post("/:id/send", asyncHandler(controller.send));
  for (const action of ["schedule", "pause", "resume", "cancel"] as const) {
    admin.post(`/:id/${action}`, asyncHandler(controller.change(action)));
  }
  router.use("/admin/notification-campaigns", admin);
  router.post("/internal/notifications/dispatch", asyncHandler(controller.dispatch));
  return router;
}
