import mongoose, { Schema, type InferSchemaType } from "mongoose";

const reviewSchema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      index: true,
    },
    productSlug: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    comment: {
      type: String,
      required: true,
      trim: true,
    },
    reviewerName: {
      type: String,
      required: true,
      trim: true,
    },
    reviewerEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    isAnonymous: {
      type: Boolean,
      default: false,
    },
    verified: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ["approved", "pending", "rejected"],
      default: "pending",
      index: true,
    },
  },
  { timestamps: true }
);

reviewSchema.index({ productSlug: 1, createdAt: -1 });
reviewSchema.index({ status: 1, createdAt: -1 });

export type ReviewDoc = InferSchemaType<typeof reviewSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Review = mongoose.model("Review", reviewSchema);
