import { OrderDoc } from "../order/model.js";
import { Return } from "./model.js";

export type ItemEligibilityResult = {
  productId: string;
  sku?: string;
  name: string;
  orderedQuantity: number;
  returnedQuantity: number;
  exchangedQuantity: number;
  lockedQuantity: number;
  remainingEligibleQuantity: number;
  returnEligible: boolean;
  exchangeEligible: boolean;
  returnWindowExpiresAt: Date | null;
  exchangeWindowExpiresAt: Date | null;
  futureReversePickupAllowed: boolean;
  reason?: string;
};

export async function calculateOrderItemsEligibility(
  order: OrderDoc
): Promise<ItemEligibilityResult[]> {
  if (order.orderStatus !== "DELIVERED" && order.status !== "delivered") {
    return order.items.map((it: any) => ({
      productId: it.product.toString(),
      sku: it.sku,
      name: it.name,
      orderedQuantity: it.quantity,
      returnedQuantity: it.returnedQuantity || 0,
      exchangedQuantity: it.exchangedQuantity || 0,
      lockedQuantity: it.lockedQuantity || 0,
      remainingEligibleQuantity: 0,
      returnEligible: false,
      exchangeEligible: false,
      returnWindowExpiresAt: null,
      exchangeWindowExpiresAt: null,
      futureReversePickupAllowed: it.futureReversePickupAllowed !== false,
      reason: "Order has not been delivered yet",
    }));
  }

  // Delivery date calculation
  const deliveredAt = order.shippingInfo?.deliveredAt || order.updatedAt || order.createdAt;
  const deliveredTime = new Date(deliveredAt).getTime();
  const now = Date.now();

  const RETURN_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
  const EXCHANGE_WINDOW_MS = 5 * 24 * 60 * 60 * 1000; // 5 days

  const returnWindowExpiresAt = new Date(deliveredTime + RETURN_WINDOW_MS);
  const exchangeWindowExpiresAt = new Date(deliveredTime + EXCHANGE_WINDOW_MS);

  const isReturnWithinWindow = now <= returnWindowExpiresAt.getTime();
  const isExchangeWithinWindow = now <= exchangeWindowExpiresAt.getTime();

  // Find all active (non-rejected/non-cancelled) return requests for this order
  const activeRequests = await Return.find({
    orderId: order._id,
    status: { $nin: ["REJECTED", "CANCELLED", "CLOSED"] },
  });

  // Calculate locked quantity per product from active requests
  const activeLockedQtyMap: Record<string, number> = {};
  for (const req of activeRequests) {
    for (const item of req.items) {
      const key = item.product.toString();
      activeLockedQtyMap[key] = (activeLockedQtyMap[key] || 0) + item.quantity;
    }
  }

  return order.items.map((it: any) => {
    const pId = it.product.toString();
    const ordered = it.quantity || 0;
    const returned = it.returnedQuantity || 0;
    const exchanged = it.exchangedQuantity || 0;
    const locked = activeLockedQtyMap[pId] || it.lockedQuantity || 0;

    const remaining = Math.max(0, ordered - returned - exchanged - locked);
    const pickupAllowed = it.futureReversePickupAllowed !== false;

    const canReturn = isReturnWithinWindow && remaining > 0 && pickupAllowed;
    const canExchange = isExchangeWithinWindow && remaining > 0 && pickupAllowed;

    let reason = "";
    if (!pickupAllowed) {
      reason = "Item is permanently blocked from future returns/exchanges";
    } else if (remaining <= 0) {
      reason = "No eligible quantity remaining for return/exchange";
    } else if (!isReturnWithinWindow && !isExchangeWithinWindow) {
      reason = "Return (24h) and Exchange (5 days) windows have expired";
    }

    return {
      productId: pId,
      sku: it.sku,
      name: it.name,
      orderedQuantity: ordered,
      returnedQuantity: returned,
      exchangedQuantity: exchanged,
      lockedQuantity: locked,
      remainingEligibleQuantity: remaining,
      returnEligible: canReturn,
      exchangeEligible: canExchange,
      returnWindowExpiresAt,
      exchangeWindowExpiresAt,
      futureReversePickupAllowed: pickupAllowed,
      reason: reason || undefined,
    };
  });
}
