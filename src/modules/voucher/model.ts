import mongoose, { Schema, type InferSchemaType } from "mongoose";

const exchangeVoucherSchema = new Schema(
  {
    voucherCode: { type: String, required: true, unique: true, index: true, uppercase: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    originalOrderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    returnRequestId: { type: Schema.Types.ObjectId, ref: "Return", required: true },
    amount: { type: Number, required: true, min: 0 },
    remainingBalance: { type: Number, required: true, min: 0 },
    expiryDate: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ["ACTIVE", "EXHAUSTED", "EXPIRED", "CANCELLED"],
      default: "ACTIVE",
      index: true,
    },
  },
  { timestamps: true }
);

exchangeVoucherSchema.index({ customerId: 1, status: 1 });

export type ExchangeVoucherDoc = InferSchemaType<typeof exchangeVoucherSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const ExchangeVoucher = mongoose.model("ExchangeVoucher", exchangeVoucherSchema);
