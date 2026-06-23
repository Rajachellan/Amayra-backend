import { Schema } from "mongoose";

export type MediaAsset = {
  imageUrl?: string;
  imageKey?: string;
};

export const mediaAssetSchema = new Schema<MediaAsset>(
  {
    imageUrl: { type: String, default: "" },
    imageKey: { type: String, default: "" },
  },
  { _id: false }
);

export function pickImageUrl(asset?: MediaAsset | null, legacy?: string | null): string {
  if (asset?.imageUrl?.trim()) return asset.imageUrl.trim();
  if (legacy?.trim()) return legacy.trim();
  return "";
}
