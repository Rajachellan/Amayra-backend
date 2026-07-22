import mongoose, { Schema, type InferSchemaType } from "mongoose";

const occasionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true },
    description: { type: String },
    image: { type: String },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export type OccasionDoc = InferSchemaType<typeof occasionSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const Occasion = mongoose.model("Occasion", occasionSchema);
