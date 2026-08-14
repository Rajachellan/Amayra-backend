import { Payment } from "./model.js";
import type mongoose from "mongoose";

export async function findPaymentById(id: string | mongoose.Types.ObjectId) {
  return Payment.findById(id);
}

export async function findPaymentByRazorpayOrderId(razorpayOrderId: string) {
  return Payment.findOne({ razorpayOrderId });
}

export async function createPayment(data: Record<string, any>) {
  return Payment.create(data);
}

export async function updatePayment(
  id: string | mongoose.Types.ObjectId,
  data: Record<string, any>,
  options?: mongoose.QueryOptions
) {
  return Payment.findByIdAndUpdate(id, data, { new: true, ...options });
}
