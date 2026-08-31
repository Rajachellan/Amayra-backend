import mongoose, { Schema, type InferSchemaType } from "mongoose";

const returnReasonSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    type: {
      type: String,
      enum: ["RETURN", "EXCHANGE", "BOTH"],
      default: "BOTH",
      required: true,
    },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export type ReturnReasonDoc = InferSchemaType<typeof returnReasonSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const ReturnReason = mongoose.model("ReturnReason", returnReasonSchema);
