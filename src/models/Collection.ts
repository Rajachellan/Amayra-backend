import mongoose, { Schema, type InferSchemaType } from "mongoose";

const collectionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true },
    description: { type: String },
    image: { type: String },
    featured: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export type CollectionDoc = InferSchemaType<typeof collectionSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const Collection = mongoose.model("Collection", collectionSchema);
