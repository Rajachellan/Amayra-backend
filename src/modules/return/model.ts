import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { RETURN_STATUS_VALUES } from "../order/model.js";

const returnItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true },
    sku: { type: String },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true },
  },
  { _id: false }
);

const returnPickupSchema = new Schema(
  {
    reverseShipmentId: { type: String },
    reverseAwb: { type: String },
    reverseCourier: { type: String },
    reverseTrackingUrl: { type: String },
  },
  { _id: false }
);

const returnInspectionSchema = new Schema(
  {
    condition: { type: String, enum: ["GOOD", "DAMAGED", "USED", "MISSING_PARTS"] },
    result: { type: String, enum: ["ACCEPTED", "REJECTED"] },
    comment: { type: String },
    inspectedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
    inspectedAt: { type: Date },
  },
  { _id: false }
);

const returnRefundSchema = new Schema(
  {
    refundMethod: { type: String, enum: ["RAZORPAY", "BANK", "UPI", "OTHER"], default: "RAZORPAY" },
    refundAccountReference: { type: String }, // For COD bank details securely stored
    refundAmount: { type: Number, required: true },
    refundStatus: {
      type: String,
      enum: ["NOT_APPLICABLE", "PENDING", "PROCESSING", "COMPLETED", "FAILED"],
      default: "PENDING",
    },
    razorpayRefundId: { type: String },
    processedAt: { type: Date },
  },
  { _id: false }
);

const returnSchema = new Schema(
  {
    returnNumber: { type: String, required: true, unique: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    items: { type: [returnItemSchema], required: true },
    reason: {
      type: String,
      enum: ["DONT_LIKE", "DAMAGED", "WRONG_PRODUCT", "QUALITY_ISSUE", "SIZE_ISSUE", "OTHER"],
      required: true,
    },
    description: { type: String },
    status: {
      type: String,
      enum: RETURN_STATUS_VALUES,
      default: "REQUESTED",
      index: true,
    },
    pickupDetails: { type: returnPickupSchema, default: () => ({}) },
    inspectionResult: { type: returnInspectionSchema, default: null },
    refundInformation: { type: returnRefundSchema, default: null },
  },
  { timestamps: true }
);

returnSchema.index({ createdAt: -1 });

export type ReturnDoc = InferSchemaType<typeof returnSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const Return = mongoose.model("Return", returnSchema);
