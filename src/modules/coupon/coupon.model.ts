import mongoose, { Schema, type InferSchemaType } from "mongoose";

const couponSchema = new Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true, unique: true, index: true },
    title: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    discountType: { type: String, enum: ["percentage", "fixed"], default: "percentage" },
    discountValue: { type: Number, required: true, min: 0 },
    minCartValue: { type: Number, default: 0, min: 0 },
    maxDiscount: { type: Number, default: null }, // Maximum cap for percentage discount
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    usageLimit: { type: Number, default: null }, // Total times this coupon can be used overall
    perUserLimit: { type: Number, default: null }, // Times a single user can use it
    timesUsed: { type: Number, default: 0 },
    applicableProducts: [{ type: Schema.Types.ObjectId, ref: "Product" }],
    applicableCategories: [{ type: Schema.Types.ObjectId, ref: "Category" }],
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

export type CouponDoc = InferSchemaType<typeof couponSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Coupon = mongoose.model("Coupon", couponSchema);
