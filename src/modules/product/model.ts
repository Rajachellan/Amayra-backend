import mongoose, { Schema, type InferSchemaType } from "mongoose";

const productVariantSchema = new Schema(
  {
    name: { type: String, required: true },
    sku: { type: String },
    attributes: { type: Schema.Types.Mixed, default: {} },
    price: { type: Number },
    salePrice: { type: Number },
    stock: { type: Number, default: 0 },
  },
  { _id: true }
);

const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true },
    shortDescription: { type: String },
    description: { type: String },
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    subCategory: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    collections: [{ type: Schema.Types.ObjectId, ref: "Collection" }],
    occasions: [{ type: Schema.Types.ObjectId, ref: "Occasion" }],
    lookbooks: [{ type: Schema.Types.ObjectId, ref: "Lookbook" }],
    sections: [{ type: String }],
    images: [{ type: String }],
    price: { type: Number, required: true },
    salePrice: { type: Number },
    gstRate: { type: Number, default: 3 },
    stock: { type: Number, default: 0 },
    sku: { type: String, index: true },
    tags: [{ type: String }],
    material: { type: String },
    color: { type: String },
    weight: { type: String },
    length: { type: String },
    breadth: { type: String },
    height: { type: String },
    specifications: { type: Schema.Types.Mixed, default: {} },
    keyHighlights: [{ type: String }],
    productFeatures: { type: Schema.Types.Mixed, default: [] },
    careLabel: [{ type: String }],
    stylingTips: [{ type: String }],
    stylingInspiration: [{ type: String }],
    featured: { type: Boolean, default: false },
    trending: { type: Boolean, default: false },
    masterpiece: { type: Boolean, default: false },
    newArrival: { type: Boolean, default: false },
    soldCount: { type: Number, default: 0 },
    trendingScore: { type: Number, default: 0 },
    seoTitle: { type: String },
    seoDescription: { type: String },
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
      index: true,
    },
    variants: [productVariantSchema],
  },
  { timestamps: true }
);

productSchema.index({ featured: 1, status: 1 });
productSchema.index({ trendingScore: -1 });
productSchema.index({ soldCount: -1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ sections: 1 });
productSchema.index({ status: 1, stock: 1, category: 1 });
productSchema.index({ status: 1, stock: 1, subCategory: 1 });
productSchema.index({ status: 1, stock: 1, collections: 1 });
productSchema.index({ status: 1, stock: 1, price: 1 });
productSchema.index({ name: "text", tags: "text" });

export type ProductDoc = InferSchemaType<typeof productSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const Product = mongoose.model("Product", productSchema);
