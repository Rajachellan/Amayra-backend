import mongoose, { Schema, type InferSchemaType } from "mongoose";

const embeddedAddressSchema = new Schema(
  {
    line1: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true, default: "IN" },
  },
  { _id: false }
);

const customerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, index: true, trim: true },
    passwordHash: { type: String },
    phone: { type: String, trim: true },
    authProvider: { type: String, enum: ["email", "google"], default: "email" },
    googleId: { type: String, sparse: true, unique: true, index: true },
    avatarUrl: { type: String },
    addresses: { type: [embeddedAddressSchema], default: [] },
  },
  { timestamps: true }
);

export type CustomerDoc = InferSchemaType<typeof customerSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const Customer = mongoose.model("Customer", customerSchema);
