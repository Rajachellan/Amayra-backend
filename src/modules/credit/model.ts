import mongoose, { Schema, type InferSchemaType } from "mongoose";

export const STORE_CREDIT_STATUS_VALUES = [
  "ACTIVE",
  "PARTIALLY_REDEEMED",
  "EXHAUSTED",
  "EXPIRED",
  "CANCELLED",
] as const;

export type StoreCreditStatus = (typeof STORE_CREDIT_STATUS_VALUES)[number];

const storeCreditReservationSchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    amount: { type: Number, required: true, min: 0 },
    reservedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { _id: false }
);

const storeCreditUsageSchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    amountUsed: { type: Number, required: true, min: 0 },
    usedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const storeCreditSchema = new Schema(
  {
    creditCode: { type: String, required: true, unique: true, index: true, uppercase: true },
    couponCode: { type: String, required: true, unique: true, index: true, uppercase: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    creditNoteId: { type: Schema.Types.ObjectId, ref: "CreditNote", index: true },
    originalOrderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    returnRequestId: { type: Schema.Types.ObjectId, ref: "Return", required: false, index: true },
    initialBalance: { type: Number, required: true, min: 0 },
    availableBalance: { type: Number, required: true, min: 0 },
    reservedBalance: { type: Number, required: true, default: 0, min: 0 },
    redeemedAmount: { type: Number, required: true, default: 0, min: 0 },
    // Backward compatibility aliases
    originalAmount: { type: Number, min: 0 },
    remainingBalance: { type: Number, min: 0 },
    issuedDate: { type: Date, required: true, default: Date.now },
    expiryDate: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: STORE_CREDIT_STATUS_VALUES,
      default: "ACTIVE",
      index: true,
    },
    reservations: { type: [storeCreditReservationSchema], default: [] },
    usageHistory: { type: [storeCreditUsageSchema], default: [] },
  },
  { timestamps: true }
);

// Keep aliases in sync on save
storeCreditSchema.pre("save", function (next) {
  if (this.isModified("initialBalance") || this.originalAmount === undefined) {
    this.originalAmount = this.initialBalance;
  }
  if (this.isModified("availableBalance") || this.remainingBalance === undefined) {
    this.remainingBalance = this.availableBalance;
  }
  if (!this.couponCode && this.creditCode) {
    this.couponCode = this.creditCode;
  }
  if (!this.creditCode && this.couponCode) {
    this.creditCode = this.couponCode;
  }
  next();
});

storeCreditSchema.index({ customerId: 1, status: 1 });
storeCreditSchema.index({ expiryDate: 1, status: 1 });

export type StoreCreditDoc = InferSchemaType<typeof storeCreditSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const StoreCredit = mongoose.model("StoreCredit", storeCreditSchema);
export * from "./creditNote.model.js";
export * from "./transaction.model.js";
