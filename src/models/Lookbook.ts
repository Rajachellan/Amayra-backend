import mongoose, { Schema, type InferSchemaType } from "mongoose";

const lookbookSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true },
    description: { type: String },
    coverImage: { type: String },
    images: [{ type: String }],
    featured: { type: Boolean, default: false },
    products: [{ type: Schema.Types.ObjectId, ref: "Product" }],
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export type LookbookDoc = InferSchemaType<typeof lookbookSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const Lookbook = mongoose.model("Lookbook", lookbookSchema);
