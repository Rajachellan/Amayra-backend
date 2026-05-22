import mongoose, { Schema, type InferSchemaType } from "mongoose";

const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true },
    description: { type: String },
    image: { type: String },
    parentCategory: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    featured: { type: Boolean, default: false },
    showOnHomepage: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "published",
      index: true,
    },
  },
  { timestamps: true }
);

categorySchema.index({ parentCategory: 1, order: 1 });

export type CategoryDoc = InferSchemaType<typeof categorySchema> & {
  _id: mongoose.Types.ObjectId;
};
export const Category = mongoose.model("Category", categorySchema);
