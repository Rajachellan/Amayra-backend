import mongoose, { Schema, type InferSchemaType } from "mongoose";

export const RESERVATION_STATUSES = ["ACTIVE", "CONVERTED", "EXPIRED", "RELEASED"] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

const reservationItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    sku: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const inventoryReservationSchema = new Schema(
  {
    reservationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    items: {
      type: [reservationItemSchema],
      required: true,
      validate: [(val: any[]) => val.length > 0, "Reservation must have at least one item"],
    },
    status: {
      type: String,
      enum: RESERVATION_STATUSES,
      default: "ACTIVE",
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    convertedAt: {
      type: Date,
      default: null,
    },
    releasedAt: {
      type: Date,
      default: null,
    },
    expiredAt: {
      type: Date,
      default: null,
    },
    releaseReason: {
      type: String,
      default: null,
    },
    paymentId: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// Compound indexes for performant worker queries and order lookup
inventoryReservationSchema.index({ status: 1, expiresAt: 1 });
inventoryReservationSchema.index({ orderId: 1, status: 1 });
inventoryReservationSchema.index({ customerId: 1, status: 1 });

export type InventoryReservationDoc = InferSchemaType<typeof inventoryReservationSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const InventoryReservation = mongoose.model(
  "InventoryReservation",
  inventoryReservationSchema
);
