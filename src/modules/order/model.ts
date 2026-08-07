import mongoose, { Schema, type InferSchemaType } from "mongoose";

const orderItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true },
    slug: { type: String, required: true },
    sku: { type: String },
    unitPrice: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true },
    image: { type: String },
  },
  { _id: false }
);

const shippingAddressSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    line1: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true, default: "IN" },
  },
  { _id: false }
);

export const ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "failed",
] as const;

const shiprocketPackageSchema = new Schema(
  {
    /** Shiprocket dashboard order id (numeric in SR, stored as string for safety) */
    srOrderId: { type: String },
    shipmentId: { type: String },
    awbCode: { type: String },
    courierId: { type: Number },
    courierName: { type: String },
    labelUrl: { type: String },
    trackingUrl: { type: String },
    pickupLocation: { type: String },
    lastStatus: { type: String },
    syncedAt: { type: Date },
    weightKg: { type: Number },
    lengthCm: { type: Number },
    breadthCm: { type: Number },
    heightCm: { type: Number },
  },
  { _id: false }
);

const orderSchema = new Schema(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    items: { type: [orderItemSchema], required: true },
    shippingAddress: { type: shippingAddressSchema, required: true },
    subtotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    couponCode: { type: String, trim: true },
    tax: { type: Number, required: true },
    shipping: { type: Number, required: true, default: 0 },
    total: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    status: {
      type: String,
      enum: ORDER_STATUSES,
      default: "pending_payment",
      index: true,
    },
    /** `cod` orders appear in lists without online capture; omit or `online` for Razorpay flow. */
    paymentMethod: {
      type: String,
      enum: ["online", "cod"],
      default: "online",
      index: true,
    },
    payment: { type: Schema.Types.ObjectId, ref: "Payment", default: null },
    /** Populated when admin books via Shiprocket */
    shiprocket: { type: shiprocketPackageSchema, default: undefined },
  },
  { timestamps: true }
);

orderSchema.index({ customer: 1, createdAt: -1 });

export type OrderDoc = InferSchemaType<typeof orderSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const Order = mongoose.model("Order", orderSchema);
