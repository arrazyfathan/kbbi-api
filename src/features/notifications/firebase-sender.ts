import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import config from "../../config";
import { serviceUnavailableError } from "../../lib/api-error";
import type { Sender } from "./notification.service";

export const firebaseSender: Sender = async (delivery, expiresAt) => {
  if (!config.firebaseProjectId) throw serviceUnavailableError("Firebase project is not configured");
  if (!getApps().length) {
    let credential;
    if (config.firebaseServiceAccountJson) {
      try {
        credential = cert(JSON.parse(config.firebaseServiceAccountJson));
      } catch {
        throw serviceUnavailableError("Firebase credentials are invalid");
      }
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      credential = applicationDefault();
    } else {
      throw serviceUnavailableError("Firebase credentials are not configured");
    }
    initializeApp({ credential, projectId: config.firebaseProjectId });
  }
  const message = {
    topic: `${config.notificationEnvironment}_${delivery.topic}`,
    data: {
      schema_version: "1",
      campaign_id: delivery.campaign_id,
      delivery_id: delivery.id,
      topic: delivery.topic,
      title: delivery.title,
      body: delivery.body,
      destination: delivery.destination,
      expires_at: expiresAt,
    },
    android: { priority: "normal" as const, ttl: 86_400_000 },
  };
  if (Buffer.byteLength(JSON.stringify(message), "utf8") > 2048) {
    throw Object.assign(new Error("FCM topic payload is too large"), { code: "messaging/payload-size-limit-exceeded" });
  }
  return getMessaging().send(message);
};
