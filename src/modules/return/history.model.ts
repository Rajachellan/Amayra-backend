import mongoose, { Schema, type InferSchemaType } from "mongoose";

const returnStatusHistorySchema = new Schema(
  {
    returnRequestId: { type: Schema.Types.ObjectId, ref: "Return", required: true, index: true },
    previousStatus: { type: String, required: true },
    newStatus: { type: String, required: true },
    changedBy: { type: Schema.Types.ObjectId, refPath: "changedByModel" },
    changedByModel: { type: String, enum: ["Customer", "Admin", "System"], default: "System" },
    changedByRole: {
      type: String,
      enum: ["CUSTOMER", "ADMIN", "SYSTEM", "COURIER"],
      default: "SYSTEM",
    },
    notes: { type: String },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

returnStatusHistorySchema.index({ returnRequestId: 1, createdAt: -1 });

export type ReturnStatusHistoryDoc = InferSchemaType<typeof returnStatusHistorySchema> & {
  _id: mongoose.Types.ObjectId;
};

export const ReturnStatusHistory = mongoose.model("ReturnStatusHistory", returnStatusHistorySchema);
