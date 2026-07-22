import mongoose, { Schema, type InferSchemaType } from "mongoose";

const embeddedAddressSchema = new Schema(
  {
    label: { type: String, trim: true, default: "Home", maxlength: 40 },
    fullName: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true, trim: true, maxlength: 16 },
    line1: { type: String, required: true, trim: true, maxlength: 120 },
    line2: { type: String, trim: true, maxlength: 120 },
    city: { type: String, required: true, trim: true, maxlength: 60 },
    state: { type: String, required: true, trim: true, maxlength: 60 },
    pincode: { type: String, required: true, trim: true, maxlength: 6 },
    country: { type: String, required: true, trim: true, default: "IN", maxlength: 2 },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true }
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

export type CustomerAddressDoc = {
  _id: mongoose.Types.ObjectId;
  label?: string;
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  isDefault?: boolean;
};

export const Customer = mongoose.model("Customer", customerSchema);

export function serializeAddress(a: {
  _id?: mongoose.Types.ObjectId | string;
  label?: string;
  fullName?: string;
  phone?: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  country?: string;
  isDefault?: boolean;
}) {
  return {
    id: a._id ? String(a._id) : undefined,
    label: a.label ?? "Home",
    fullName: a.fullName ?? "",
    phone: a.phone ?? "",
    line1: a.line1,
    line2: a.line2 ?? "",
    city: a.city,
    state: a.state,
    pincode: a.pincode,
    country: a.country ?? "IN",
    isDefault: Boolean(a.isDefault),
  };
}
