import mongoose, { Schema, type InferSchemaType } from "mongoose";

const homepageSettingsSchema = new Schema(
  {
    singletonKey: { type: String, default: "default", unique: true },
    showBanner: { type: Boolean, default: true },
    showCollections: { type: Boolean, default: true },
    showCategories: { type: Boolean, default: true },
    showLookbooks: { type: Boolean, default: true },
    showBlogSection: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export type HomepageSettingsDoc = InferSchemaType<typeof homepageSettingsSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const HomepageSettings = mongoose.model("HomepageSettings", homepageSettingsSchema);

export async function getOrCreateHomepageSettings() {
  let doc = await HomepageSettings.findOne({ singletonKey: "default" });
  if (!doc) doc = await HomepageSettings.create({ singletonKey: "default" });
  return doc;
}
