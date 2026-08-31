import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { RETURN_STATUS_VALUES } from "../order/model.js";

const returnItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true },
    sku: { type: String },
    size: { type: String },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true },
  },
  { _id: false }
);

const pickupAttemptSchema = new Schema(
  {
    attemptNumber: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    reason: { type: String },
    status: { type: String },
  },
  { _id: false }
);

const returnPickupSchema = new Schema(
  {
    courierProvider: { type: String, default: "SHIPROCKET" },
    reverseShipmentId: { type: String },
    reverseAwb: { type: String },
    reverseCourier: { type: String },
    reverseTrackingUrl: { type: String },
    pickupDate: { type: Date },
    courierStatus: { type: String },
    pickupAttemptCount: { type: Number, default: 0 },
    maxPickupAttempts: { type: Number, default: 3 },
    rescheduleAllowed: { type: Boolean, default: true },
    attemptHistory: { type: [pickupAttemptSchema], default: [] },
  },
  { _id: false }
);

const returnReceivingSchema = new Schema(
  {
    receivedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
    receivedAt: { type: Date },
    warehouseNotes: { type: String },
  },
  { _id: false }
);

const returnQCSchema = new Schema(
  {
    condition: {
      type: String,
      enum: ["GOOD", "DAMAGED", "USED", "MISSING_PARTS"],
      required: true,
    },
    result: {
      type: String,
      enum: ["QC_APPROVED", "QC_REJECTED"],
      required: true,
    },
    faultSource: {
      type: String,
      enum: ["OUR_FAULT", "CUSTOMER_FAULT", "COURIER_FAULT", "NONE"],
      default: "NONE",
    },
    qcNotes: { type: String },
    qcImages: { type: [String], default: [] },
    performedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
    performedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const returnRefundSchema = new Schema(
  {
    refundMethod: { type: String, enum: ["RAZORPAY", "BANK", "UPI", "OTHER"], default: "RAZORPAY" },
    refundAccountReference: { type: String },
    refundAmount: { type: Number, default: 0 },
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

const returnSettlementSchema = new Schema(
  {
    settlementType: {
      type: String,
      enum: ["REFUND_GATEWAY", "STORE_CREDIT", "EXCHANGE_REPLACEMENT", "EXCHANGE_VOUCHER"],
    },
    storeCreditId: { type: Schema.Types.ObjectId, ref: "StoreCredit" },
    exchangeVoucherId: { type: Schema.Types.ObjectId, ref: "ExchangeVoucher" },
    replacementOrderId: { type: Schema.Types.ObjectId, ref: "Order" },
    replacementOrderNumber: { type: String },
    settlementAmount: { type: Number, required: true },
    refundMethod: { type: String, enum: ["RAZORPAY", "BANK", "UPI", "OTHER"], default: "RAZORPAY" },
    refundAccountReference: { type: String },
    razorpayRefundId: { type: String },
    processedAt: { type: Date },
  },
  { _id: false }
);

const returnRejectionSchema = new Schema(
  {
    rejectionReason: { type: String, required: true },
    rejectionNotes: { type: String },
    rejectedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
    rejectedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const exchangeDetailsSchema = new Schema(
  {
    requestedVariant: { type: String },
    preferredSize: { type: String },
    notes: { type: String },
  },
  { _id: false }
);

const bankDetailsSchema = new Schema(
  {
    accountHolderName: { type: String },
    accountNumber: { type: String },
    ifscCode: { type: String },
    bankName: { type: String },
    upiId: { type: String },
  },
  { _id: false }
);

const returnSchema = new Schema(
  {
    returnNumber: { type: String, required: true, unique: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    requestType: {
      type: String,
      enum: ["RETURN", "EXCHANGE"],
      default: "RETURN",
    },
    items: { type: [returnItemSchema], required: true },
    reason: { type: String, required: true }, // Code or text from ReturnReason
    reasonTitle: { type: String },
    description: { type: String },
    exchangeDetails: { type: exchangeDetailsSchema, default: null },
    bankDetails: { type: bankDetailsSchema, default: null },
    status: {
      type: String,
      enum: RETURN_STATUS_VALUES,
      default: "REQUESTED",
      index: true,
    },
    pickupDetails: { type: returnPickupSchema, default: () => ({}) },
    receivingDetails: { type: returnReceivingSchema, default: null },
    qcDetails: { type: returnQCSchema, default: null },
    settlementDetails: { type: returnSettlementSchema, default: null },
    refundInformation: { type: returnRefundSchema, default: () => ({}) },
    rejectionDetails: { type: returnRejectionSchema, default: null },
    futureReversePickupAllowed: { type: Boolean, default: true },
  },
  { timestamps: true }
);

returnSchema.index({ createdAt: -1 });

export type ReturnDoc = InferSchemaType<typeof returnSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Return = mongoose.model("Return", returnSchema);
