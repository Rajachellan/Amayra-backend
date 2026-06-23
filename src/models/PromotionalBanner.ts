import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { mediaAssetSchema } from "../utils/mediaAsset.js";

const promotionalBannerSchema = new Schema(
  {
    name: { type: String, trim: true, default: "Promotional Banner" },
    image: { type: mediaAssetSchema, default: () => ({}) },
    mobileImage: { type: mediaAssetSchema, default: () => ({}) },
    redirectLink: { type: String, trim: true },
    linkType: {
      type: String,
      enum: ["product", "category", "collection", "occasion", "blog", "custom"],
      default: "custom",
    },
    linkTargetId: { type: Schema.Types.ObjectId },
    order: { type: Number, default: 0, index: true },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

export type PromotionalBannerDoc = InferSchemaType<typeof promotionalBannerSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const PromotionalBanner = mongoose.model("PromotionalBanner", promotionalBannerSchema);
