import mongoose, { Schema, type InferSchemaType } from "mongoose";

const hotspotSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    x: { type: Number, required: true, min: 0, max: 100 },
    y: { type: Number, required: true, min: 0, max: 100 },
    label: { type: String, trim: true, default: "" },
    jewelryArea: {
      type: String,
      enum: [
        "necklace",
        "choker",
        "long_haram",
        "earrings",
        "stud",
        "jhumka",
        "ring",
        "bracelet",
        "bangles",
        "waist_belt",
        "maang_tikka",
        "nose_pin",
        "anklet",
        "toe_ring",
        "pendant",
        "hair_accessories",
        "other",
      ],
      default: "other",
    },
    style: {
      type: String,
      enum: [
        "default_dot",
        "pulse",
        "glow",
        "luxury_gold",
        "diamond",
        "minimal_circle",
        "square",
        "hover_reveal",
      ],
      default: "luxury_gold",
    },
    color: {
      type: String,
      enum: ["white", "gold", "black", "emerald", "ruby", "custom"],
      default: "gold",
    },
    customColor: { type: String, trim: true },
    size: { type: String, enum: ["small", "medium", "large"], default: "medium" },
    animation: {
      type: String,
      enum: ["none", "pulse", "bounce", "glow", "rotate"],
      default: "pulse",
    },
    tooltip: {
      showImage: { type: Boolean, default: true },
      showName: { type: Boolean, default: true },
      showPrice: { type: Boolean, default: true },
      showSalePrice: { type: Boolean, default: true },
      showQuickView: { type: Boolean, default: true },
      showViewProduct: { type: Boolean, default: true },
      showAddToCart: { type: Boolean, default: false },
      hidePrice: { type: Boolean, default: false },
      customLabel: { type: String, trim: true, default: "" },
    },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: true, timestamps: true }
);

const lookbookImageSchema = new Schema(
  {
    imageUrl: { type: String, required: true, trim: true },
    mobileImageUrl: { type: String, trim: true },
    desktopImageUrl: { type: String, trim: true },
    alt: { type: String, trim: true, default: "" },
    title: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    sortOrder: { type: Number, default: 0 },
    isFeatured: { type: Boolean, default: false },
    width: { type: Number },
    height: { type: Number },
    hotspots: { type: [hotspotSchema], default: [] },
  },
  { _id: true, timestamps: true }
);

const lookbookSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true },
    shortDescription: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    /** @deprecated Prefer galleryImages — kept for storefront/product form compatibility */
    coverImage: { type: String },
    /** @deprecated Prefer galleryImages */
    images: [{ type: String }],
    galleryImages: { type: [lookbookImageSchema], default: [] },
    featured: { type: Boolean, default: false, index: true },
    products: [{ type: Schema.Types.ObjectId, ref: "Product" }],
    /** @deprecated Prefer status — synced from status for public API */
    active: { type: Boolean, default: true, index: true },
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
      index: true,
    },
    /** @deprecated Prefer displayOrder */
    order: { type: Number, default: 0 },
    displayOrder: { type: Number, default: 0, index: true },
    seo: {
      title: { type: String, trim: true, default: "" },
      description: { type: String, trim: true, default: "" },
    },
    publishAt: { type: Date },
    expireAt: { type: Date },
    analytics: {
      views: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
      productClicks: { type: Number, default: 0 },
      conversions: { type: Number, default: 0 },
    },
    auditLog: [
      {
        action: String,
        at: { type: Date, default: Date.now },
        meta: Schema.Types.Mixed,
      },
    ],
  },
  { timestamps: true }
);

lookbookSchema.pre("save", function syncLegacy(next) {
  if (this.displayOrder == null && this.order != null) this.displayOrder = this.order;
  if (this.order == null && this.displayOrder != null) this.order = this.displayOrder;

  if (this.status === "published") this.active = true;
  else if (this.status === "archived" || this.status === "draft") this.active = false;

  const gallery = this.galleryImages ?? [];
  if (gallery.length) {
    const sorted = [...gallery].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const featured = sorted.find((g) => g.isFeatured) ?? sorted[0];
    this.coverImage = featured?.imageUrl ?? this.coverImage;
    this.images = sorted.map((g) => g.imageUrl).filter(Boolean);
    const productIds = new Set<string>();
    for (const img of gallery) {
      for (const h of img.hotspots ?? []) {
        if (h.product) productIds.add(String(h.product));
      }
    }
    if (productIds.size) {
      this.products = [...productIds].map((id) => new mongoose.Types.ObjectId(id));
    }
  }
  next();
});

export type LookbookDoc = InferSchemaType<typeof lookbookSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const Lookbook = mongoose.model("Lookbook", lookbookSchema);
