import type { Types } from "mongoose";
import { Occasion } from "../models/Occasion.js";

export async function resolveOccasionIdBySlug(slug: string): Promise<Types.ObjectId | null> {
  const o = await Occasion.findOne({ slug, active: true }).select("_id");
  return o?._id ?? null;
}
