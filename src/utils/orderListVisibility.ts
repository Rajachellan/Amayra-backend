import type { FilterQuery } from "mongoose";
import type { OrderDoc } from "../models/Order.js";

const POST_PAYMENT_STATUSES = ["paid", "processing", "shipped", "delivered"] as const;

/**
 * Mongo filter for orders that should appear in storefront and admin *lists*:
 * — Online: only after payment is confirmed (order moves to `paid`+).
 * — COD: any non-cancelled order with `paymentMethod: "cod"`.
 */
export function orderListVisibilityFilter(): FilterQuery<OrderDoc> {
  return {
    status: { $ne: "cancelled" },
    $or: [{ paymentMethod: "cod" }, { status: { $in: [...POST_PAYMENT_STATUSES] } }],
  };
}

/** Whether a single order document should be returned for customer detail views. */
export function orderIsVisibleToCustomer(o: {
  status: string;
  paymentMethod?: string | null;
}): boolean {
  if (o.status === "cancelled") return false;
  if (o.paymentMethod === "cod") return true;
  return (POST_PAYMENT_STATUSES as readonly string[]).includes(o.status);
}

export function mergeOrderListFilter(statusFromQuery?: string | null): FilterQuery<OrderDoc> {
  const visible = orderListVisibilityFilter();
  if (statusFromQuery && statusFromQuery.trim()) {
    return { $and: [visible, { status: statusFromQuery.trim() }] } as FilterQuery<OrderDoc>;
  }
  return visible;
}
