import mongoose, { Schema, type InferSchemaType } from "mongoose";

const discountSlabSchema = new Schema(
  {
    minimumCartValue: { type: Number, required: true, min: 0 },
    discountPercentage: { type: Number, required: true, min: 0, max: 100 },
  },
  { _id: false }
);

const pricingSettingsSchema = new Schema(
  {
    singletonKey: { type: String, default: "default", unique: true },
    discountSlabs: {
      type: [discountSlabSchema],
      default: [
        { minimumCartValue: 0, discountPercentage: 0 },
        { minimumCartValue: 1500, discountPercentage: 15 },
        { minimumCartValue: 2500, discountPercentage: 25 },
      ],
    },
    allowCouponWithSlabDiscount: { type: Boolean, default: true },
    defaultGstRate: { type: Number, default: 3 },
    enableFreeGift: { type: Boolean, default: false },
    freeGiftThreshold: { type: Number, default: 6999 },
    freeGiftName: { type: String, default: "Free Gift (Worth ₹799)" },
  },
  { timestamps: true }
);

export type PricingSettingsDoc = InferSchemaType<typeof pricingSettingsSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const PricingSettings = mongoose.model("PricingSettings", pricingSettingsSchema);

export async function getOrCreatePricingSettings() {
  let doc = await PricingSettings.findOne({ singletonKey: "default" });
  if (!doc) {
    doc = await PricingSettings.create({
      singletonKey: "default",
      discountSlabs: [
        { minimumCartValue: 0, discountPercentage: 0 },
        { minimumCartValue: 1500, discountPercentage: 15 },
        { minimumCartValue: 2500, discountPercentage: 25 },
      ],
      allowCouponWithSlabDiscount: true,
      defaultGstRate: 3,
      enableFreeGift: false,
      freeGiftThreshold: 6999,
      freeGiftName: "Free Gift (Worth ₹799)",
    });
  }
  return doc;
}
