import mongoose, { Schema, type InferSchemaType } from "mongoose";

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
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    originalOrderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    returnRequestId: { type: Schema.Types.ObjectId, ref: "Return", required: true },
    originalAmount: { type: Number, required: true, min: 0 },
    remainingBalance: { type: Number, required: true, min: 0 },
    expiryDate: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ["ACTIVE", "EXHAUSTED", "EXPIRED", "CANCELLED"],
      default: "ACTIVE",
      index: true,
    },
    usageHistory: { type: [storeCreditUsageSchema], default: [] },
  },
  { timestamps: true }
);

storeCreditSchema.index({ customerId: 1, status: 1 });

export type StoreCreditDoc = InferSchemaType<typeof storeCreditSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const StoreCredit = mongoose.model("StoreCredit", storeCreditSchema);
