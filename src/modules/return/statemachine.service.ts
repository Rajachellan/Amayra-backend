import mongoose from "mongoose";
import { AppError } from "../../utils/AppError.js";
import { ReturnStatusHistory } from "./history.model.js";
import { Return } from "./model.js";

const VALID_TRANSITIONS: Record<string, string[]> = {
  REQUESTED: ["UNDER_REVIEW", "APPROVED", "REJECTED", "CANCELLED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: [
    "PICKUP_REQUESTED",
    "PICKUP_SCHEDULED",
    "PICKUP_FAILED",
    "RECEIVED_AT_WAREHOUSE",
    "REJECTED",
    "CANCELLED",
  ],
  PICKUP_REQUESTED: ["PICKUP_SCHEDULED", "PICKUP_FAILED", "RECEIVED_AT_WAREHOUSE", "CANCELLED"],
  PICKUP_SCHEDULED: [
    "PICKED_UP",
    "IN_TRANSIT",
    "RECEIVED_AT_WAREHOUSE",
    "PICKUP_FAILED",
    "CANCELLED",
  ],
  PICKUP_FAILED: ["PICKUP_SCHEDULED", "CLOSED"],
  PICKED_UP: ["IN_TRANSIT", "RECEIVED_AT_WAREHOUSE"],
  IN_TRANSIT: ["RECEIVED_AT_WAREHOUSE"],
  RECEIVED_AT_WAREHOUSE: ["QC_IN_PROGRESS"],
  QC_IN_PROGRESS: ["QC_APPROVED", "QC_REJECTED"],
  QC_APPROVED: ["SETTLEMENT_PROCESSING"],
  SETTLEMENT_PROCESSING: [
    "REFUND_ISSUED",
    "EXCHANGE_PROCESSING",
    "REPLACEMENT_SHIPPED",
    "VOUCHER_ISSUED",
    "COMPLETED",
  ],
  REFUND_ISSUED: ["COMPLETED"],
  EXCHANGE_PROCESSING: ["REPLACEMENT_SHIPPED", "VOUCHER_ISSUED", "COMPLETED"],
  REPLACEMENT_SHIPPED: ["COMPLETED"],
  VOUCHER_ISSUED: ["COMPLETED"],
  QC_REJECTED: ["CLOSED"],
  REJECTED: ["CLOSED"],
  CANCELLED: ["CLOSED"],
  COMPLETED: [],
  CLOSED: [],
};

export function isValidStatusTransition(currentStatus: string, targetStatus: string): boolean {
  if (currentStatus === targetStatus) return true;
  const allowed = VALID_TRANSITIONS[currentStatus] || [];
  return allowed.includes(targetStatus);
}

export async function transitionReturnStatus(args: {
  returnId: string | mongoose.Types.ObjectId;
  targetStatus: string;
  changedBy?: string;
  changedByRole?: "CUSTOMER" | "ADMIN" | "SYSTEM" | "COURIER";
  notes?: string;
  metadata?: Record<string, any>;
  session?: mongoose.ClientSession;
}): Promise<any> {
  const returnDoc = await Return.findById(args.returnId).session(args.session || null);
  if (!returnDoc) throw new AppError(404, "Return request not found");

  const currentStatus = returnDoc.status;
  if (!isValidStatusTransition(currentStatus, args.targetStatus)) {
    throw new AppError(
      400,
      `Invalid status transition from '${currentStatus}' to '${args.targetStatus}'`
    );
  }

  returnDoc.status = args.targetStatus as any;
  await returnDoc.save({ session: args.session });

  // Record audit history
  await ReturnStatusHistory.create(
    [
      {
        returnRequestId: returnDoc._id,
        previousStatus: currentStatus,
        newStatus: args.targetStatus,
        changedBy:
          args.changedBy && mongoose.Types.ObjectId.isValid(args.changedBy)
            ? new mongoose.Types.ObjectId(args.changedBy)
            : undefined,
        changedByRole: args.changedByRole || "SYSTEM",
        notes: args.notes || "",
        metadata: args.metadata || {},
      },
    ],
    { session: args.session }
  );

  return returnDoc;
}
