export type ShiprocketStatus =
  | "AWB GENERATED"
  | "CREATED"
  | "PICKUP SCHEDULED"
  | "PICKED UP"
  | "PICKED-UP"
  | "IN TRANSIT"
  | "IN-TRANSIT"
  | "SHIPPED"
  | "OUT FOR DELIVERY"
  | "OUT-FOR-DELIVERY"
  | "DELIVERED"
  | "CANCELLED"
  | "CANCELED"
  | "RTO INITIATED"
  | "RTO-INITIATED"
  | "RTO IN TRANSIT"
  | "RTO-IN-TRANSIT"
  | "RTO DELIVERED"
  | "RTO-DELIVERED"
  | "DELIVERY FAILED"
  | "FAILED"
  | "UNDELIVERED";

export type MairiiShippingStatus =
  | "NOT_CREATED"
  | "CREATED"
  | "COURIER_ASSIGNED"
  | "AWB_GENERATED"
  | "PICKUP_SCHEDULED"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED"
  | "RTO_INITIATED"
  | "RTO_IN_TRANSIT"
  | "RTO_DELIVERED"
  | "DELIVERY_FAILED";

export type MairiiOrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PROCESSING"
  | "SHIPPED"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED"
  | "RTO"
  | "COMPLETED";

/**
 * Maps a Shiprocket courier status to Mairii's shipping status domain.
 */
export function mapShiprocketToMairiiShippingStatus(srStatus: string): MairiiShippingStatus {
  const norm = srStatus.toUpperCase().replace(/[-_]/g, " ").trim();

  if (norm.includes("AWB GENERATED") || norm === "AWB") return "AWB_GENERATED";
  if (norm.includes("PICKUP SCHEDULED")) return "PICKUP_SCHEDULED";
  if (norm.includes("PICKED UP") || norm === "PICKED") return "PICKED_UP";
  
  if (norm.includes("OUT FOR DELIVERY") || norm === "OFD") return "OUT_FOR_DELIVERY";
  if (norm.includes("IN TRANSIT") || norm === "TRANSIT" || norm === "SHIPPED") return "IN_TRANSIT";
  
  if (norm === "DELIVERED" || norm === "DELIVERY SUCCESSFUL") return "DELIVERED";
  if (norm === "CANCELLED" || norm === "CANCELED") return "CANCELLED";
  
  if (norm.includes("RTO INITIATED")) return "RTO_INITIATED";
  if (norm.includes("RTO IN TRANSIT") || norm.includes("RTO TRANSIT")) return "RTO_IN_TRANSIT";
  if (norm.includes("RTO DELIVERED")) return "RTO_DELIVERED";
  
  if (norm.includes("FAILED") || norm.includes("UNDELIVERED") || norm.includes("RETURNING")) return "DELIVERY_FAILED";
  if (norm === "NEW" || norm === "CREATED") return "CREATED";

  return "CREATED";
}

/**
 * Maps a Mairii shipping status to Mairii's overall order status.
 */
export function mapShippingToOrderStatus(shippingStatus: MairiiShippingStatus): MairiiOrderStatus | null {
  switch (shippingStatus) {
    case "AWB_GENERATED":
    case "PICKUP_SCHEDULED":
    case "PICKED_UP":
    case "IN_TRANSIT":
      return "SHIPPED";
    case "OUT_FOR_DELIVERY":
      return "OUT_FOR_DELIVERY";
    case "DELIVERED":
      return "DELIVERED";
    case "RTO_INITIATED":
    case "RTO_IN_TRANSIT":
    case "RTO_DELIVERED":
      return "RTO";
    case "CANCELLED":
      return "CANCELLED";
    case "DELIVERY_FAILED":
      return null; // Keep current orderStatus
    default:
      return null;
  }
}
