import mongoose, { Schema, type InferSchemaType } from "mongoose";

const bannerSchema = new Schema(
  {
    title: { type: String, required: true },
    subtitle: { type: String },
    image: { type: String, required: true },
    link: { type: String },
    ctaLabel: { type: String },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export type BannerDoc = InferSchemaType<typeof bannerSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const Banner = mongoose.model("Banner", bannerSchema);
