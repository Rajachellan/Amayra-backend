import mongoose, { Schema, type InferSchemaType } from "mongoose";

const leadSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true },
    phone: { type: String },
    message: { type: String, required: true },
    source: { type: String, default: "contact_form" },
    status: {
      type: String,
      enum: ["new", "read", "archived"],
      default: "new",
      index: true,
    },
  },
  { timestamps: true }
);

leadSchema.index({ createdAt: -1 });

export type LeadDoc = InferSchemaType<typeof leadSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const Lead = mongoose.model("Lead", leadSchema);
