import mongoose, { Schema, type InferSchemaType } from "mongoose";

const announcementSchema = new Schema(
  {
    text: { type: String, required: true, trim: true },
    link: { type: String, trim: true },
    order: { type: Number, default: 0, index: true },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

export type AnnouncementDoc = InferSchemaType<typeof announcementSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const Announcement = mongoose.model("Announcement", announcementSchema);
