import Razorpay from "razorpay";
import { AppError } from '../../utils/AppError.js';

export function getRazorpay(): Razorpay {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) {
    throw new AppError(500, "Razorpay keys not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)");
  }
  return new Razorpay({ key_id, key_secret });
}

export async function createRazorpayOrder(amountPaise: number, receipt: string, notes?: Record<string, string>) {
  const rzp = getRazorpay();
  type OrderNotes = Record<string, string>;
  const orderOptions: Parameters<Razorpay["orders"]["create"]>[0] = {
    amount: amountPaise,
    currency: "INR",
    receipt: receipt.slice(0, 40),
    ...(notes ? { notes: notes as unknown as OrderNotes } : {}),
  };
  return rzp.orders.create(orderOptions);
}

export async function createRazorpayRefund(paymentId: string, amountPaise: number, notes?: Record<string, string>) {
  const rzp = getRazorpay();
  return (rzp as any).refunds.create({
    payment_id: paymentId,
    amount: amountPaise,
    ...(notes ? { notes } : {}),
  });
}

