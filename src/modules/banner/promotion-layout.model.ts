import mongoose, { Schema, type InferSchemaType } from "mongoose";

const breakpointSchema = new Schema(
  {
    columns: { type: Number, min: 1, max: 6, default: 3 },
    gap: { type: Number, min: 0, max: 64, default: 16 },
    cardSize: { type: String, enum: ["sm", "md", "lg", "auto"], default: "auto" },
    stackOrder: { type: String, enum: ["normal", "reverse"], default: "normal" },
  },
  { _id: false }
);

const promotionLayoutSchema = new Schema(
  {
    singletonKey: { type: String, default: "default", unique: true, index: true },
    layout: {
      type: String,
      enum: [
        "one_banner",
        "two_equal",
        "three_cards",
        "one_large_two_small",
        "one_large_four_small",
        "grid_2x2",
        "grid_3x2",
        "masonry",
        "carousel",
        "horizontal_scroll",
        "auto_responsive",
      ],
      default: "auto_responsive",
    },
    columns: { type: Number, min: 1, max: 6, default: 3 },
    gap: { type: Number, min: 0, max: 64, default: 16 },
    aspectRatio: {
      type: String,
      enum: ["auto", "16/9", "16/7", "4/3", "1/1", "3/4"],
      default: "16/7",
    },
    cardHeight: { type: String, trim: true, default: "auto" },
    borderRadius: { type: String, trim: true, default: "1rem" },
    shadow: { type: Boolean, default: true },
    sectionPadding: { type: String, trim: true, default: "2rem 0" },
    backgroundColor: { type: String, trim: true, default: "transparent" },
    containerWidth: { type: String, enum: ["full", "boxed"], default: "boxed" },
    autoHeight: { type: Boolean, default: true },
    equalHeight: { type: Boolean, default: true },
    responsive: {
      desktop: {
        type: breakpointSchema,
        default: () => ({ columns: 3, gap: 16, cardSize: "auto" }),
      },
      tablet: {
        type: breakpointSchema,
        default: () => ({ columns: 2, gap: 12, cardSize: "auto" }),
      },
      mobile: {
        type: breakpointSchema,
        default: () => ({ columns: 1, gap: 12, cardSize: "auto", stackOrder: "normal" }),
      },
    },
  },
  { timestamps: true }
);

export type PromotionLayoutDoc = InferSchemaType<typeof promotionLayoutSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const PromotionLayout = mongoose.model("PromotionLayout", promotionLayoutSchema);

export const DEFAULT_PROMOTION_LAYOUT = {
  singletonKey: "default",
  layout: "one_large_two_small" as const,
  columns: 3,
  gap: 16,
  aspectRatio: "auto" as const,
  cardHeight: "auto",
  borderRadius: "1rem",
  shadow: true,
  sectionPadding: "2rem 0",
  backgroundColor: "transparent",
  containerWidth: "boxed" as const,
  autoHeight: true,
  equalHeight: true,
  responsive: {
    desktop: { columns: 3, gap: 16, cardSize: "auto" as const, stackOrder: "normal" as const },
    tablet: { columns: 2, gap: 12, cardSize: "auto" as const, stackOrder: "normal" as const },
    mobile: { columns: 1, gap: 12, cardSize: "auto" as const, stackOrder: "normal" as const },
  },
};
