import mongoose, { Schema, type InferSchemaType } from "mongoose";

export const CREDIT_NOTE_STATUS_VALUES = [
  "ACTIVE",
  "PARTIALLY_REDEEMED",
  "EXHAUSTED",
  "EXPIRED",
  "CANCELLED",
] as const;

export type CreditNoteStatus = (typeof CREDIT_NOTE_STATUS_VALUES)[number];

const returnedProductItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product" },
    name: { type: String, required: true },
    sku: { type: String },
    size: { type: String },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
  },
  { _id: false }
);

const creditNoteSchema = new Schema(
  {
    creditNoteNumber: { type: String, required: true, unique: true, index: true, uppercase: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    customerName: { type: String, required: true },
    customerEmail: { type: String, required: false, default: "", lowercase: true, trim: true },
    originalOrderId: { type: Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    originalOrderNumber: { type: String, required: true },
    returnRequestId: {
      type: Schema.Types.ObjectId,
      ref: "Return",
      required: false,
      sparse: true,
      index: true,
    },
    returnRequestNumber: { type: String, required: false, default: "MANUAL" },
    issueType: {
      type: String,
      enum: ["RETURN_SETTLEMENT", "MANUAL_ISSUE"],
      default: "RETURN_SETTLEMENT",
      index: true,
    },
    issueReason: { type: String },
    adminNotes: { type: String },
    returnedProductDetails: { type: [returnedProductItemSchema], required: true },
    issuedCreditAmount: { type: Number, required: true, min: 0 },
    couponCode: { type: String, required: true, uppercase: true, index: true },
    issuedDate: { type: Date, required: true, default: Date.now },
    expiryDate: { type: Date, required: true, index: true },
    redeemedAmount: { type: Number, required: true, default: 0, min: 0 },
    remainingBalance: { type: Number, required: true, min: 0 },
    settlementStatus: {
      type: String,
      enum: ["PENDING", "SETTLED", "CANCELLED"],
      default: "SETTLED",
      index: true,
    },
    status: {
      type: String,
      enum: CREDIT_NOTE_STATUS_VALUES,
      default: "ACTIVE",
      index: true,
    },
    qcNotes: { type: String },
    cancellationReason: { type: String },
    cancelledAt: { type: Date },
    cancelledBy: { type: Schema.Types.ObjectId, ref: "Admin" },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

creditNoteSchema.index({ customerId: 1, status: 1 });
creditNoteSchema.index({ expiryDate: 1, status: 1 });

export type CreditNoteDoc = InferSchemaType<typeof creditNoteSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const CreditNote = mongoose.model("CreditNote", creditNoteSchema);
