import mongoose, { Schema, type InferSchemaType } from "mongoose";

const adminSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["admin", "editor", "super_admin"], default: "admin" },
    permissions: { type: [String], default: [] },
  },
  { timestamps: true }
);

export type AdminDoc = InferSchemaType<typeof adminSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const Admin = mongoose.model("Admin", adminSchema);
