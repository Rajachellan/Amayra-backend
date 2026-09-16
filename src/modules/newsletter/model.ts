import mongoose, { Schema, type InferSchemaType } from "mongoose";

const newsletterSubscriberSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["subscribed", "unsubscribed"],
      default: "subscribed",
      index: true,
    },
    source: {
      type: String,
      default: "footer_newsletter",
    },
  },
  { timestamps: true }
);

newsletterSubscriberSchema.index({ createdAt: -1 });

export type NewsletterSubscriberDoc = InferSchemaType<typeof newsletterSubscriberSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const NewsletterSubscriber = mongoose.model(
  "NewsletterSubscriber",
  newsletterSubscriberSchema
);
