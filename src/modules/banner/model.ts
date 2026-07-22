import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { mediaAssetSchema } from '../../utils/mediaAsset.js';

const bannerSchema = new Schema(
  {
    name: { type: String, trim: true, default: "" },
    desktopImage: { type: mediaAssetSchema, default: () => ({}) },
    mobileImage: { type: mediaAssetSchema, default: () => ({}) },
    title: { type: String, trim: true, default: "" },
    subtitle: { type: String, trim: true },
    buttonText: { type: String, trim: true },
    redirectLink: { type: String, trim: true },
    linkType: {
      type: String,
      enum: ["product", "category", "collection", "occasion", "blog", "custom"],
      default: "custom",
    },
    linkTargetId: { type: Schema.Types.ObjectId },
    order: { type: Number, default: 0, index: true },
    status: { type: String, enum: ["draft", "published"], default: "draft", index: true },
    active: { type: Boolean, default: true, index: true },
    startDate: { type: Date },
    endDate: { type: Date },
    /** @deprecated use desktopImage.imageUrl */
    image: { type: String },
    /** @deprecated use redirectLink */
    link: { type: String },
    /** @deprecated use buttonText */
    ctaLabel: { type: String },
  },
  { timestamps: true }
);

bannerSchema.index({ status: 1, active: 1, order: 1 });

bannerSchema.pre("save", function defaultAdminName(next) {
  // name = admin label only; do not copy into title (title is optional on storefront)
  if (!this.name?.trim() && this.title?.trim()) {
    this.name = this.title.trim();
  }
  next();
});

export type BannerDoc = InferSchemaType<typeof bannerSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const Banner = mongoose.model("Banner", bannerSchema);
