import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { mediaAssetSchema } from "../../utils/mediaAsset.js";

const promotionalBannerSchema = new Schema(
  {
    name: { type: String, trim: true, default: "Promotional Card" },
    title: { type: String, trim: true, default: "" },
    subtitle: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    badge: { type: String, trim: true, default: "" },
    image: { type: mediaAssetSchema, default: () => ({}) },
    mobileImage: { type: mediaAssetSchema, default: () => ({}) },
    backgroundImage: { type: mediaAssetSchema, default: () => ({}) },
    icon: { type: mediaAssetSchema, default: () => ({}) },
    buttonText: { type: String, trim: true, default: "" },
    buttonUrl: { type: String, trim: true, default: "" },
    couponCode: { type: String, trim: true, default: "" },
    backgroundColor: { type: String, trim: true, default: "" },
    textColor: { type: String, trim: true, default: "" },
    borderStyle: {
      type: String,
      enum: ["none", "thin", "gold", "luxury"],
      default: "none",
    },
    animation: {
      type: String,
      enum: ["none", "fade", "slide", "zoom", "glow"],
      default: "none",
    },
    priority: { type: Number, default: 0, index: true },
    redirectLink: { type: String, trim: true },
    linkType: {
      type: String,
      enum: ["product", "category", "collection", "occasion", "blog", "custom"],
      default: "custom",
    },
    linkTargetId: { type: Schema.Types.ObjectId },
    order: { type: Number, default: 0, index: true },
    active: { type: Boolean, default: true, index: true },
    startDate: { type: Date },
    endDate: { type: Date },
  },
  { timestamps: true }
);

export type PromotionalBannerDoc = InferSchemaType<typeof promotionalBannerSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const PromotionalBanner = mongoose.model("PromotionalBanner", promotionalBannerSchema);
