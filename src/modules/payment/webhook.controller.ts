import type { Request, Response } from "express";
import mongoose from "mongoose";
import { validateWebhookSignature } from "razorpay/dist/utils/razorpay-utils.js";
import { Payment } from "../../models/Payment.js";
import { markOrderPaid, markPaymentFailed } from "../../services/checkoutService.js";
import {
  shouldProcessWebhookEvent,
  markWebhookEventProcessed,
  markWebhookEventFailed,
} from "../webhook/webhook.service.js";
import { logger } from "../../config/logger.js";

type WebhookBody = {
  event?: string;
  event_id?: string;
  payload?: {
    payment?: { entity?: Record<string, unknown> };
    order?: { entity?: Record<string, unknown> };
    refund?: { entity?: Record<string, unknown> };
  };
};

export async function postRazorpayWebhook(req: Request, res: Response): Promise<void> {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    res.status(500).send("Webhook secret not configured");
    return;
  }

  const sig = req.headers["x-razorpay-signature"];
  const signature = typeof sig === "string" ? sig : "";
  const rawBuf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));

  let valid = false;
  try {
    valid = validateWebhookSignature(rawBuf.toString(), signature, secret);
  } catch {
    valid = false;
  }
  if (!valid) {
    res.status(400).send("Invalid signature");
    return;
  }

  let parsed: WebhookBody;
  try {
    parsed = JSON.parse(rawBuf.toString()) as WebhookBody;
  } catch {
    res.status(400).send("Bad JSON");
    return;
  }

  const ev = parsed.event || "";
  const eventIdHeader = req.headers["x-razorpay-event-id"];
  const eventId = (
    typeof eventIdHeader === "string" ? eventIdHeader : parsed.event_id || ""
  ).trim();

  if (!eventId) {
    res.status(400).send("Missing Razorpay event ID");
    return;
  }

  // Enforce webhook idempotency
  const should = await shouldProcessWebhookEvent("RAZORPAY", eventId, ev);
  if (!should) {
    res.status(200).json({ ok: true, duplicate: true });
    return;
  }

  try {
    if (ev === "payment.captured" || ev === "order.paid") {
      const entity = parsed.payload?.payment?.entity as
        { order_id?: string; id?: string; method?: string } | undefined;
      const rzOrderId = entity?.order_id;
      const rzPaymentId = entity?.id;
      const method = entity?.method;

      if (!rzOrderId || !rzPaymentId) {
        await markWebhookEventProcessed("RAZORPAY", eventId);
        res.status(200).json({ ignored: true, reason: "Missing order_id or payment_id" });
        return;
      }

      const paymentDoc = await Payment.findOne({ razorpayOrderId: rzOrderId });
      if (!paymentDoc || !paymentDoc.order) {
        await markWebhookEventProcessed("RAZORPAY", eventId);
        res.status(200).json({ ok: true, reason: "Payment doc not found" });
        return;
      }

      await markOrderPaid({
        paymentDocId: paymentDoc._id,
        razorpayPaymentId: rzPaymentId,
        method,
        appendRaw: { webhook: ev, payload: parsed },
      });

      await markWebhookEventProcessed("RAZORPAY", eventId);
      res.status(200).json({ ok: true });
      return;
    }

    if (ev === "payment.failed") {
      const entity = parsed.payload?.payment?.entity as
        { order_id?: string; error_reason?: string } | undefined;
      const rzOrderId = entity?.order_id;
      const reason = entity?.error_reason;

      if (rzOrderId) {
        const paymentDoc = await Payment.findOne({ razorpayOrderId: rzOrderId });
        if (paymentDoc?.order) {
          await markPaymentFailed(
            paymentDoc._id as mongoose.Types.ObjectId,
            reason ?? "payment.failed webhook",
            { webhook: parsed.event, payload: parsed }
          );
        }
      }

      await markWebhookEventProcessed("RAZORPAY", eventId);
      res.status(200).json({ ok: true });
      return;
    }

    if (ev === "refund.processed" || ev === "refund.created") {
      const entity = parsed.payload?.refund?.entity as
        | { payment_id?: string; id?: string; amount?: number; notes?: Record<string, string> }
        | undefined;
      const rzPaymentId = entity?.payment_id;
      const rzRefundId = entity?.id;
      const amountPaise = entity?.amount;
      const returnNumber = entity?.notes?.returnNumber;

      if (rzRefundId) {
        const { Return } = await import("../return/model.js");
        const { Order } = await import("../order/model.js");
        const { recordOrderEvent } = await import("../order/order.service.js");

        const returnDoc = await Return.findOne({
          $or: [
            { "refundInformation.razorpayRefundId": rzRefundId },
            { returnNumber: returnNumber },
          ],
        });

        if (returnDoc) {
          const order = await Order.findById(returnDoc.orderId);
          if (order) {
            const prevRefundStatus = order.refundStatus;

            returnDoc.refundInformation!.refundStatus = "COMPLETED";
            returnDoc.refundInformation!.razorpayRefundId = rzRefundId;
            returnDoc.refundInformation!.processedAt = new Date();
            returnDoc.status = "COMPLETED";
            await returnDoc.save();

            order.refundStatus = "COMPLETED";
            order.returnStatus = "COMPLETED";
            await order.save();

            await recordOrderEvent({
              orderId: order._id,
              eventType: "REFUND_COMPLETED",
              previousStatus: prevRefundStatus,
              newStatus: "COMPLETED",
              source: "RAZORPAY",
              metadata: {
                refundId: rzRefundId,
                paymentId: rzPaymentId,
                amount: amountPaise ? amountPaise / 100 : returnDoc.refundInformation!.refundAmount,
              },
            });
          }
        }
      }

      await markWebhookEventProcessed("RAZORPAY", eventId);
      res.status(200).json({ ok: true });
      return;
    }

    // Ignore unsupported events but register as processed
    await markWebhookEventProcessed("RAZORPAY", eventId);
    res.status(200).json({ ignored: true, event: ev });
  } catch (err: any) {
    logger.error({ err }, `Error processing Razorpay webhook event ${ev}`);
    await markWebhookEventFailed("RAZORPAY", eventId, err.message || String(err));
    res.status(500).json({ ok: false, error: err.message });
  }
}
