import mongoose, { Schema, type InferSchemaType } from "mongoose";

const savedCartItemSchema = new Schema(
  {
    productId: { type: String, required: true },
    name: { type: String, required: true },
    slug: { type: String, required: true },
    price: { type: Number, required: true },
    image: { type: String },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const savedWishlistItemSchema = new Schema(
  {
    productId: { type: String, required: true },
    name: { type: String, required: true },
    slug: { type: String, required: true },
    price: { type: Number, required: true },
    image: { type: String },
  },
  { _id: false }
);

const customerSavedItemsSchema = new Schema(
  {
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      unique: true,
      index: true,
    },
    cartItems: { type: [savedCartItemSchema], default: [] },
    wishlistItems: { type: [savedWishlistItemSchema], default: [] },
    /** Timestamp of last cart modification — used to decide when to send reminder */
    cartUpdatedAt: { type: Date, default: null },
    /** Timestamp of last wishlist modification */
    wishlistUpdatedAt: { type: Date, default: null },
    /** When the cart reminder was last sent — prevents duplicate emails */
    cartReminderSentAt: { type: Date, default: null },
    /** When the wishlist reminder was last sent */
    wishlistReminderSentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type CustomerSavedItemsDoc = InferSchemaType<typeof customerSavedItemsSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const CustomerSavedItems = mongoose.model("CustomerSavedItems", customerSavedItemsSchema);
