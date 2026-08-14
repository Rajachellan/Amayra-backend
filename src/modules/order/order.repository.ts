import { Order } from "./model.js";
import type mongoose from "mongoose";

export async function findOrderById(id: string | mongoose.Types.ObjectId) {
  return Order.findById(id);
}

export async function findOrderByNumber(orderNumber: string) {
  return Order.findOne({ orderNumber: orderNumber.trim() });
}

export async function findOrderByRazorpayOrderId(razorpayOrderId: string) {
  return Order.findOne({ "paymentInfo.razorpayOrderId": razorpayOrderId });
}

export async function createOrder(data: Record<string, any>) {
  return Order.create(data);
}

export async function updateOrder(
  id: string | mongoose.Types.ObjectId,
  data: Record<string, any>,
  options?: mongoose.QueryOptions
) {
  return Order.findByIdAndUpdate(id, data, { new: true, ...options });
}

export async function listOrders(filter: Record<string, any>, skip: number, limit: number) {
  return Order.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate("customer", "name email phone")
    .populate("payment", "status amount razorpayOrderId razorpayPaymentId method");
}

export async function countOrders(filter: Record<string, any>) {
  return Order.countDocuments(filter);
}
