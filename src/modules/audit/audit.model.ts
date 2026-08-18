import mongoose, { Schema, type InferSchemaType } from "mongoose";

const auditLogSchema = new Schema(
  {
    adminId: { type: String, required: true, index: true },
    adminEmail: { type: String, required: true, index: true },
    action: { type: String, required: true, index: true },
    module: { type: String, required: true, index: true },
    description: { type: String, required: true },
    targetId: { type: String },
    details: { type: Schema.Types.Mixed },
    ip: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ module: 1, createdAt: -1 });

export type AuditLogDoc = InferSchemaType<typeof auditLogSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const AuditLog = mongoose.model("AuditLog", auditLogSchema);
