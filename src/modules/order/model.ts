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

// New clean enums for statuses
export const ORDER_STATUS_VALUES = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
  "RTO",
  "COMPLETED",
] as const;

export const PAYMENT_STATUS_VALUES = [
  "PENDING",
  "AUTHORIZED",
  "CAPTURED",
  "FAILED",
  "COD_PENDING",
  "COD_COLLECTED",
  "REFUND_PENDING",
  "REFUNDED",
  "REFUND_FAILED",
] as const;

export const SHIPPING_STATUS_VALUES = [
  "NOT_CREATED",
  "CREATED",
  "COURIER_ASSIGNED",
  "AWB_GENERATED",
  "PICKUP_SCHEDULED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
  "RTO_INITIATED",
  "RTO_IN_TRANSIT",
  "RTO_DELIVERED",
  "DELIVERY_FAILED",
] as const;

export const RETURN_STATUS_VALUES = [
  "NOT_REQUESTED",
  "REQUESTED",
  "APPROVED",
  "REJECTED",
  "PICKUP_SCHEDULED",
  "PICKED_UP",
  "RECEIVED",
  "QUALITY_CHECK",
  "ACCEPTED",
  "REJECTED_AFTER_INSPECTION",
  "COMPLETED",
] as const;

export const REFUND_STATUS_VALUES = [
  "NOT_APPLICABLE",
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
] as const;

// Legacy status array for backwards compatibility
export const ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "failed",
] as const;

const paymentInfoSchema = new Schema(
  {
    provider: { type: String, enum: ["RAZORPAY", "COD"], default: "RAZORPAY" },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    status: { type: String, enum: PAYMENT_STATUS_VALUES, default: "PENDING" },
    codAmount: { type: Number },
    codCollectedAt: { type: Date },
    codCollectionReference: { type: String },
  },
  { _id: false }
);

const shippingInfoSchema = new Schema(
  {
    provider: { type: String, default: "SHIPROCKET" },
    shiprocketOrderId: { type: String },
    shipmentId: { type: String },
    courierId: { type: Number },
    courierName: { type: String },
    awbCode: { type: String },
    trackingUrl: { type: String },
    status: { type: String, enum: SHIPPING_STATUS_VALUES, default: "NOT_CREATED" },
    pickupScheduledAt: { type: Date },
    shippedAt: { type: Date },
    deliveredAt: { type: Date },
    estimatedDeliveryDate: { type: Date },
  },
  { _id: false }
);

const shiprocketPackageSchema = new Schema(
  {
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

    // Domain Specific statuses
    orderStatus: {
      type: String,
      enum: ORDER_STATUS_VALUES,
      default: "PENDING",
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUS_VALUES,
      default: "PENDING",
      index: true,
    },
    shippingStatus: {
      type: String,
      enum: SHIPPING_STATUS_VALUES,
      default: "NOT_CREATED",
      index: true,
    },
    returnStatus: {
      type: String,
      enum: RETURN_STATUS_VALUES,
      default: "NOT_REQUESTED",
      index: true,
    },
    refundStatus: {
      type: String,
      enum: REFUND_STATUS_VALUES,
      default: "NOT_APPLICABLE",
      index: true,
    },

    paymentMethod: {
      type: String,
      enum: ["online", "cod", "PREPAID", "COD"],
      default: "PREPAID",
      index: true,
    },

    paymentInfo: { type: paymentInfoSchema, default: () => ({}) },
    shippingInfo: { type: shippingInfoSchema, default: () => ({}) },

    // Legacy fields for backwards compatibility
    status: {
      type: String,
      enum: ORDER_STATUSES,
      default: "pending_payment",
      index: true,
    },
    payment: { type: Schema.Types.ObjectId, ref: "Payment", default: null },
    shiprocket: { type: shiprocketPackageSchema, default: undefined },
  },
  { timestamps: true }
);

// Mongoose Pre-save Hook for Backward Compatibility and Field Synchronization
orderSchema.pre("save", function (next) {
  // Sync Order Status
  if (this.isModified("orderStatus") && !this.isModified("status")) {
    const statusMap: Record<string, string> = {
      PENDING: "pending_payment",
      CONFIRMED: "paid",
      PROCESSING: "processing",
      SHIPPED: "shipped",
      OUT_FOR_DELIVERY: "shipped",
      DELIVERED: "delivered",
      CANCELLED: "cancelled",
      RTO: "failed",
      COMPLETED: "delivered",
    };
    this.status = (statusMap[this.orderStatus] as any) || "pending_payment";
  } else if (this.isModified("status") && !this.isModified("orderStatus")) {
    const orderStatusMap: Record<string, string> = {
      pending_payment: "PENDING",
      paid: "CONFIRMED",
      processing: "PROCESSING",
      shipped: "SHIPPED",
      delivered: "DELIVERED",
      cancelled: "CANCELLED",
      failed: "RTO",
    };
    this.orderStatus = (orderStatusMap[this.status] as any) || "PENDING";
  }

  // Normalize payment method to uppercase domain
  if (this.paymentMethod === "online" || this.paymentMethod === "PREPAID") {
    this.paymentMethod = "PREPAID";
    this.paymentInfo.provider = "RAZORPAY";
  } else if (this.paymentMethod === "cod" || this.paymentMethod === "COD") {
    this.paymentMethod = "COD";
    this.paymentInfo.provider = "COD";
  }

  // Sync Shipping Subdocuments
  if (this.isModified("shippingInfo") && this.shippingInfo.shipmentId) {
    if (!this.shiprocket) {
      this.shiprocket = {} as any;
    }
    const sr = this.shiprocket as any;
    sr.srOrderId = this.shippingInfo.shiprocketOrderId;
    sr.shipmentId = this.shippingInfo.shipmentId;
    sr.awbCode = this.shippingInfo.awbCode;
    sr.courierId = this.shippingInfo.courierId;
    sr.courierName = this.shippingInfo.courierName;
    sr.trackingUrl = this.shippingInfo.trackingUrl;
    sr.lastStatus = this.shippingInfo.status;
    sr.syncedAt = new Date();
  } else if (this.isModified("shiprocket") && this.shiprocket?.shipmentId) {
    this.shippingInfo.provider = "SHIPROCKET";
    this.shippingInfo.shiprocketOrderId = this.shiprocket.srOrderId;
    this.shippingInfo.shipmentId = this.shiprocket.shipmentId;
    this.shippingInfo.awbCode = this.shiprocket.awbCode;
    this.shippingInfo.courierId = this.shiprocket.courierId;
    this.shippingInfo.courierName = this.shiprocket.courierName;
    this.shippingInfo.trackingUrl = this.shiprocket.trackingUrl;
    // Map last status to shippingInfo status if valid, otherwise keep as is
    if (this.shiprocket.lastStatus) {
      this.shippingInfo.status = this.shiprocket.lastStatus as any;
    }
  }

  next();
});

orderSchema.index({ customer: 1, createdAt: -1 });

export type OrderDoc = InferSchemaType<typeof orderSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const Order = mongoose.model("Order", orderSchema);
