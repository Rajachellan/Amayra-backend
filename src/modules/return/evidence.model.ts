import mongoose, { Schema, type InferSchemaType } from "mongoose";

const returnRequestEvidenceSchema = new Schema(
  {
    returnRequestId: { type: Schema.Types.ObjectId, ref: "Return", required: true, index: true },
    fileUrl: { type: String, required: true },
    fileType: { type: String, enum: ["IMAGE", "VIDEO"], required: true },
    mimeType: { type: String },
    uploadedBy: { type: String, enum: ["CUSTOMER", "ADMIN"], default: "CUSTOMER" },
  },
  { timestamps: true }
);

export type ReturnRequestEvidenceDoc = InferSchemaType<typeof returnRequestEvidenceSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const ReturnRequestEvidence = mongoose.model(
  "ReturnRequestEvidence",
  returnRequestEvidenceSchema
);
