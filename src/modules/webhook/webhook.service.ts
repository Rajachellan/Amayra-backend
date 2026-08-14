import { WebhookEvent } from "./webhook-event.model.js";
import { logger } from "../../config/index.js";

export async function shouldProcessWebhookEvent(
  provider: "RAZORPAY" | "SHIPROCKET",
  eventId: string,
  eventType: string
): Promise<boolean> {
  const cleanEventId = eventId.trim();
  if (!cleanEventId) {
    logger.warn(`Received empty webhook eventId for provider ${provider}`);
    return true; // If no event ID is provided, we still attempt to process, though with less idempotency protection
  }

  const existing = await WebhookEvent.findOne({ provider, eventId: cleanEventId });

  if (existing) {
    if (existing.processed) {
      logger.info(`Webhook event already processed: ${provider} [${cleanEventId}]`);
      return false;
    }
    logger.info(`Webhook event previously failed or pending, retrying: ${provider} [${cleanEventId}]`);
    return true;
  }

  // Create the event record
  await WebhookEvent.create({
    provider,
    eventId: cleanEventId,
    eventType,
    processed: false,
  });

  return true;
}

export async function markWebhookEventProcessed(
  provider: "RAZORPAY" | "SHIPROCKET",
  eventId: string
): Promise<void> {
  const cleanEventId = eventId.trim();
  if (!cleanEventId) return;

  await WebhookEvent.updateOne(
    { provider, eventId: cleanEventId },
    {
      $set: {
        processed: true,
        processedAt: new Date(),
        error: undefined,
      },
    }
  );
  logger.info(`Webhook event marked as processed: ${provider} [${cleanEventId}]`);
}

export async function markWebhookEventFailed(
  provider: "RAZORPAY" | "SHIPROCKET",
  eventId: string,
  error: string
): Promise<void> {
  const cleanEventId = eventId.trim();
  if (!cleanEventId) return;

  await WebhookEvent.updateOne(
    { provider, eventId: cleanEventId },
    {
      $set: {
        processed: false,
        error,
      },
    }
  );
  logger.warn(`Webhook event failed to process: ${provider} [${cleanEventId}] - Error: ${error}`);
}
