import mongoose, { Schema, type InferSchemaType } from "mongoose";

const homepageSectionSchema = new Schema(
  {
    sectionType: { type: String, required: true, index: true },
    title: { type: String, required: true },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    referenceType: {
      type: String,
      enum: ["Category", "Product", "Collection", "Lookbook", "Occasion", "None"],
      default: "None",
    },
    referenceIds: [{ type: Schema.Types.ObjectId }],
  },
  { timestamps: true }
);

homepageSectionSchema.index({ active: 1, order: 1 });

export type HomepageSectionDoc = InferSchemaType<typeof homepageSectionSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const HomepageSection = mongoose.model("HomepageSection", homepageSectionSchema);
