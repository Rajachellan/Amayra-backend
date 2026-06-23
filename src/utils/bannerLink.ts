import mongoose from "mongoose";
import { Product } from "../models/Product.js";
import { Category } from "../models/Category.js";
import { Collection } from "../models/Collection.js";
import { Occasion } from "../models/Occasion.js";
import { Blog } from "../models/Blog.js";

export const LINK_TYPES = ["product", "category", "collection", "occasion", "blog", "custom"] as const;
export type LinkType = (typeof LINK_TYPES)[number];

type LinkSource = {
  linkType?: string | null;
  linkTargetId?: mongoose.Types.ObjectId | string | null;
  redirectLink?: string | null;
  link?: string | null;
};

export async function resolveRedirectLink(source: LinkSource): Promise<string> {
  const custom = source.redirectLink?.trim() || source.link?.trim();
  const linkType = (source.linkType || "custom") as LinkType;
  if (linkType === "custom") return custom || "/";

  const id = source.linkTargetId;
  if (!id || !mongoose.isValidObjectId(id)) return custom || "/";

  switch (linkType) {
    case "product": {
      const doc = await Product.findById(id).select("slug").lean();
      return doc?.slug ? `/product/${doc.slug}` : custom || "/";
    }
    case "category": {
      const doc = await Category.findById(id).select("slug").lean();
      return doc?.slug ? `/category/${doc.slug}` : custom || "/";
    }
    case "collection": {
      const doc = await Collection.findById(id).select("slug").lean();
      return doc?.slug ? `/category/all?collection=${doc.slug}` : custom || "/";
    }
    case "occasion": {
      const doc = await Occasion.findById(id).select("slug").lean();
      return doc?.slug ? `/occasion/${doc.slug}` : custom || "/";
    }
    case "blog": {
      const doc = await Blog.findById(id).select("slug").lean();
      return doc?.slug ? `/blog/${doc.slug}` : custom || "/";
    }
    default:
      return custom || "/";
  }
}

export function publishedBannerFilter(now = new Date()) {
  return {
    active: true,
    $or: [{ status: "published" }, { status: { $exists: false } }, { status: null }],
    $and: [
      { $or: [{ startDate: null }, { startDate: { $exists: false } }, { startDate: { $lte: now } }] },
      { $or: [{ endDate: null }, { endDate: { $exists: false } }, { endDate: { $gte: now } }] },
    ],
  };
}
