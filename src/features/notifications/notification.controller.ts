import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import config from "../../config";
import { forbiddenError, unauthorizedError, validationError } from "../../lib/api-error";
import { NotificationService, parseCampaign, parseUuid } from "./notification.service";

const versionSchema = z.strictObject({ version: z.number().int().positive() });
const statusSchema = z.enum([
  "draft",
  "scheduled",
  "paused",
  "cancelled",
  "sending",
  "sent",
  "failed",
  "unknown",
  "archived",
]);
const savedDestinationSchema = z.strictObject({
  value: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .regex(/^(word\/[^/]+|proverb\/[^/]+)$/u),
});
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

function pageParams(req: Request) {
  const parsed = paginationSchema.safeParse(req.query);
  if (!parsed.success) throw validationError("Invalid pagination");
  return parsed.data;
}
function version(body: unknown): number {
  const parsed = versionSchema.safeParse(body);
  if (!parsed.success) throw validationError("A positive current version is required");
  return parsed.data.version;
}
function id(req: Request): string {
  return parseUuid(req.params.id);
}

export class NotificationController {
  private readonly actors = new WeakMap<Request, string>();
  constructor(private readonly makeService: () => NotificationService) {}

  authorize = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const match = /^Bearer (\S+)$/i.exec(req.header("authorization") ?? "");
    if (!match) throw unauthorizedError();
    const actor = await this.makeService().adminFromToken(match[1]);
    if (actor === null) throw unauthorizedError();
    if (!actor) throw forbiddenError();
    this.actors.set(req, actor);
    next();
  };

  health = async (_req: Request, res: Response): Promise<void> => {
    res.json({ success: true, message: "Notification dispatcher health", data: await this.makeService().health() });
  };
  list = async (req: Request, res: Response): Promise<void> => {
    const parsed = req.query.status === undefined ? undefined : statusSchema.safeParse(req.query.status);
    if (parsed && !parsed.success) throw validationError("Invalid campaign status");
    const { page, limit } = pageParams(req);
    res.json({
      success: true,
      message: "Campaigns fetched",
      data: await this.makeService().list(parsed?.data, page, limit),
    });
  };
  create = async (req: Request, res: Response): Promise<void> => {
    const data = await this.makeService().create(this.actor(req), parseCampaign(req.body));
    res.status(201).json({ success: true, message: "Campaign created", data });
  };
  listDestinations = async (_req: Request, res: Response): Promise<void> => {
    res.json({
      success: true,
      message: "Saved destinations fetched",
      data: await this.makeService().listDestinations(),
    });
  };
  saveDestination = async (req: Request, res: Response): Promise<void> => {
    const parsed = savedDestinationSchema.safeParse(req.body);
    if (!parsed.success) throw validationError("A supported word or proverb destination is required");
    res.json({
      success: true,
      message: "Destination saved",
      data: await this.makeService().saveDestination(this.actor(req), parsed.data.value),
    });
  };
  deleteDestination = async (req: Request, res: Response): Promise<void> => {
    const parsed = savedDestinationSchema.safeParse(req.body);
    if (!parsed.success) throw validationError("A supported word or proverb destination is required");
    res.json({
      success: true,
      message: "Destination removed",
      data: await this.makeService().deleteDestination(parsed.data.value),
    });
  };
  get = async (req: Request, res: Response): Promise<void> => {
    res.json({ success: true, message: "Campaign fetched", data: await this.makeService().get(id(req)) });
  };
  archive = async (req: Request, res: Response): Promise<void> => {
    const data = await this.makeService().archive(id(req), version(req.body), this.actor(req));
    res.json({ success: true, message: "Campaign archived", data });
  };
  deleteCampaign = async (req: Request, res: Response): Promise<void> => {
    if (req.query.permanent !== "true") throw validationError("Permanent deletion must be explicitly requested");
    const data = await this.makeService().deleteArchived(id(req), version(req.body), this.actor(req));
    res.json({ success: true, message: "Archived campaign permanently deleted", data });
  };
  edit = async (req: Request, res: Response): Promise<void> => {
    const parsed = z.strictObject({ version: z.number().int().positive(), campaign: z.unknown() }).safeParse(req.body);
    if (!parsed.success) throw validationError("Version and campaign are required");
    const data = await this.makeService().change(
      "edit",
      id(req),
      parsed.data.version,
      this.actor(req),
      parseCampaign(parsed.data.campaign),
    );
    res.json({ success: true, message: "Campaign updated", data });
  };
  deliveries = async (req: Request, res: Response): Promise<void> => {
    const { page, limit } = pageParams(req);
    res.json({
      success: true,
      message: "Deliveries fetched",
      data: await this.makeService().deliveries(id(req), page, limit),
    });
  };
  send = async (req: Request, res: Response): Promise<void> => {
    const data = await this.makeService().send(id(req), version(req.body), this.actor(req));
    res.json({ success: true, message: "Send attempt completed", data });
  };
  change(action: "schedule" | "pause" | "resume" | "cancel") {
    return async (req: Request, res: Response): Promise<void> => {
      const data = await this.makeService().change(action, id(req), version(req.body), this.actor(req));
      res.json({ success: true, message: `Campaign ${action} completed`, data });
    };
  }
  dispatch = async (req: Request, res: Response): Promise<void> => {
    const supplied = /^Bearer (\S+)$/i.exec(req.header("authorization") ?? "")?.[1];
    const expected = config.notificationCronSecret;
    if (
      !supplied ||
      !expected ||
      Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    )
      throw unauthorizedError();
    res.json({ success: true, message: "Notification dispatch completed", data: await this.makeService().dispatch() });
  };
  private actor(req: Request): string {
    const actor = this.actors.get(req);
    if (!actor) throw unauthorizedError();
    return actor;
  }
}
