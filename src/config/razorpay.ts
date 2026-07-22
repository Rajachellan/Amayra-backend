import { env } from "./env.js";

export const razorpayConfig = {
  keyId: env.RAZORPAY_KEY_ID ?? "",
  keySecret: env.RAZORPAY_KEY_SECRET ?? "",
  webhookSecret: env.RAZORPAY_WEBHOOK_SECRET ?? "",
} as const;

export function isRazorpayConfigured(): boolean {
  return Boolean(razorpayConfig.keyId && razorpayConfig.keySecret);
}
