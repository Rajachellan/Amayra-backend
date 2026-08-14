import mongoose, { Schema, type InferSchemaType } from "mongoose";

export const INVENTORY_TRANSACTION_TYPES = [
  "SALE",
  "SALE_CANCELLED",
  "RETURN_RESTOCK",
  "RETURN_DAMAGED",
  "RTO_RESTOCK",
  "MANUAL_ADJUSTMENT",
  "RESTOCK",
  "DAMAGE",
  "LOSS",
] as const;

const inventoryLedgerSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    quantity: { type: Number, required: true }, // Positive for additions, negative for reductions
    type: {
      type: String,
      enum: INVENTORY_TRANSACTION_TYPES,
      required: true,
      index: true,
    },
    referenceType: {
      type: String,
      enum: ["ORDER", "RETURN", "MANUAL"],
      required: true,
    },
    referenceId: { type: Schema.Types.ObjectId, required: false },
    previousStock: { type: Number, required: true },
    newStock: { type: Number, required: true },
    createdBy: { type: String, required: true, default: "SYSTEM" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

inventoryLedgerSchema.index({ createdAt: -1 });

export type InventoryLedgerDoc = InferSchemaType<typeof inventoryLedgerSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const InventoryLedger = mongoose.model("InventoryLedger", inventoryLedgerSchema);
