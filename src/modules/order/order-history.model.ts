import mongoose, { Schema, type InferSchemaType } from "mongoose";

const orderHistorySchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    eventType: {
      type: String,
      required: true,
    },
    previousStatus: { type: String },
    newStatus: { type: String },
    source: {
      type: String,
      enum: ["CUSTOMER", "ADMIN", "RAZORPAY", "SHIPROCKET", "SYSTEM"],
      required: true,
    },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

orderHistorySchema.index({ createdAt: -1 });

export type OrderHistoryDoc = InferSchemaType<typeof orderHistorySchema> & {
  _id: mongoose.Types.ObjectId;
};
export const OrderHistory = mongoose.model("OrderHistory", orderHistorySchema);
