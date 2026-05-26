import type { Request, Response } from "express";
import mongoose from "mongoose";
import { validateWebhookSignature } from "razorpay/dist/utils/razorpay-utils.js";
import { Payment } from "../models/Payment.js";
import { markOrderPaid, markPaymentFailed } from "../services/checkoutService.js";

type WebhookBody = {
  event?: string;
  payload?: {
    payment?: { entity?: Record<string, unknown> };
    order?: { entity?: Record<string, unknown> };
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

  const ev = parsed.event;

  try {
    if (ev === "payment.captured") {
      const entity = parsed.payload?.payment?.entity as
        | { order_id?: string; id?: string; method?: string }
        | undefined;
      const rzOrderId = entity?.order_id;
      const rzPaymentId = entity?.id;
      const method = entity?.method;
      if (!rzOrderId || !rzPaymentId) {
        res.status(200).json({ ignored: true });
        return;
      }

      const paymentDoc = await Payment.findOne({ razorpayOrderId: rzOrderId });
      if (!paymentDoc || !paymentDoc.order) {
        res.status(200).json({ ok: true });
        return;
      }

      if (paymentDoc.status === "captured") {
        res.status(200).json({ ok: true, duplicate: true });
        return;
      }

      await markOrderPaid({
        paymentDocId: paymentDoc._id,
        razorpayPaymentId: rzPaymentId,
        method,
        appendRaw: { webhook: ev, payload: parsed },
      });
      res.status(200).json({ ok: true });
      return;
    }

    if (ev === "payment.failed") {
      const entity = parsed.payload?.payment?.entity as { order_id?: string; error_reason?: string } | undefined;
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
      res.status(200).json({ ok: true });
      return;
    }

    res.status(200).json({ ignored: true, event: ev });
  } catch {
    res.status(500).json({ ok: false });
  }
}
