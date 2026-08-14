import { createRazorpayRefund } from "../../integrations/razorpay/service.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../utils/AppError.js";

/**
 * Initiates an online refund via Razorpay for prepaid orders.
 */
export async function processPrepaidRefund(args: {
  razorpayPaymentId: string;
  amount: number;
  returnNumber: string;
}): Promise<{ refundId: string; status: string }> {
  try {
    const amountPaise = Math.round(args.amount * 100);
    logger.info(
      `Initiating Razorpay Refund for Payment [${args.razorpayPaymentId}], Amount: ${args.amount} (${args.returnNumber})`
    );

    const refund = await createRazorpayRefund(args.razorpayPaymentId, amountPaise, {
      returnNumber: args.returnNumber,
      source: "mairii_backend",
    });

    logger.info(`Razorpay Refund initiated: Refund ID: ${refund.id}, status: ${refund.status}`);
    return {
      refundId: refund.id,
      status: refund.status || "processed",
    };
  } catch (err: any) {
    const msg = err.message || JSON.stringify(err);
    logger.error({ err }, `Razorpay Refund failed: ${msg}`);
    throw new AppError(502, `Razorpay Refund failed: ${msg}`);
  }
}
