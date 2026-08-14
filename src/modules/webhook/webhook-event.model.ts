import mongoose, { Schema, type InferSchemaType } from "mongoose";

const webhookEventSchema = new Schema(
  {
    provider: {
      type: String,
      enum: ["RAZORPAY", "SHIPROCKET"],
      required: true,
      index: true,
    },
    eventId: {
      type: String,
      required: true,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
    },
    processed: {
      type: Boolean,
      default: false,
      index: true,
    },
    processedAt: {
      type: Date,
    },
    error: {
      type: String,
    },
  },
  { timestamps: true }
);

// Compound index for absolute idempotency checking
webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

export type WebhookEventDoc = InferSchemaType<typeof webhookEventSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const WebhookEvent = mongoose.model("WebhookEvent", webhookEventSchema);
