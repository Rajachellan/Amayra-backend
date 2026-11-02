import mongoose, { Schema, type InferSchemaType } from "mongoose";

export const STORE_CREDIT_TRANSACTION_TYPES = [
  "CREDIT_ISSUED",
  "CREDIT_RESERVED",
  "CREDIT_REDEEMED",
  "CREDIT_RELEASED",
  "CREDIT_CANCELLED",
  "CREDIT_EXPIRED",
  "CREDIT_REVERTED",
  "CREDIT_REACTIVATED",
] as const;

export type StoreCreditTransactionType = (typeof STORE_CREDIT_TRANSACTION_TYPES)[number];

const storeCreditTransactionSchema = new Schema(
  {
    storeCreditId: { type: Schema.Types.ObjectId, ref: "StoreCredit", required: true, index: true },
    creditNoteId: { type: Schema.Types.ObjectId, ref: "CreditNote", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    transactionType: {
      type: String,
      enum: STORE_CREDIT_TRANSACTION_TYPES,
      required: true,
      index: true,
    },
    amount: { type: Number, required: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", default: null, index: true },
    orderNumber: { type: String },
    balanceBefore: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    reservedBalanceBefore: { type: Number, default: 0 },
    reservedBalanceAfter: { type: Number, default: 0 },
    transactionDate: { type: Date, default: Date.now, index: true },
    description: { type: String, required: true },
    performedBy: {
      id: { type: Schema.Types.ObjectId, ref: "Admin" },
      role: {
        type: String,
        enum: ["SYSTEM", "ADMIN", "CUSTOMER"],
        default: "SYSTEM",
      },
      name: { type: String },
    },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: false, versionKey: false }
);

// Enforce immutability - prevent modifications on saved transactions
storeCreditTransactionSchema.pre("updateOne", function () {
  throw new Error("StoreCreditTransaction is immutable and cannot be updated");
});
storeCreditTransactionSchema.pre("updateMany", function () {
  throw new Error("StoreCreditTransaction is immutable and cannot be updated");
});
storeCreditTransactionSchema.pre("findOneAndUpdate", function () {
  throw new Error("StoreCreditTransaction is immutable and cannot be updated");
});

storeCreditTransactionSchema.index({ customerId: 1, transactionDate: -1 });
storeCreditTransactionSchema.index({ creditNoteId: 1, transactionDate: -1 });

export type StoreCreditTransactionDoc = InferSchemaType<typeof storeCreditTransactionSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const StoreCreditTransaction = mongoose.model(
  "StoreCreditTransaction",
  storeCreditTransactionSchema
);
