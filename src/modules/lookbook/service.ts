import mongoose from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import { toSlug } from "../../utils/slug.js";
import { Lookbook } from "./model.js";
import { pushAudit, summarizeLookbook } from "./mapper.js";
import type { z } from "zod";
import type {
  adminListQuerySchema,
  hotspotSchema,
  lookbookBodySchema,
  lookbookImageSchema,
} from "./validation.js";

type LookbookBody = z.infer<typeof lookbookBodySchema>;
type ImageBody = z.infer<typeof lookbookImageSchema>;
type HotspotBody = z.infer<typeof hotspotSchema>;
type ListQuery = z.infer<typeof adminListQuerySchema>;

function resolveStatus(body: LookbookBody): string | undefined {
  if (body.status) return body.status;
  if (body.active === true) return "published";
  if (body.active === false) return "draft";
  return undefined;
}

export async function createLookbookDoc(body: LookbookBody) {
  const title = body.title.trim();
  const slug = (body.slug?.trim() || toSlug(title)).toLowerCase();
  if (await Lookbook.findOne({ slug })) throw new AppError(409, "slug exists");
  const status = resolveStatus(body) ?? "draft";
  const displayOrder = body.displayOrder ?? body.order ?? 0;
  const doc = await Lookbook.create({
    ...body,
    title,
    slug,
    status,
    active: status === "published",
    displayOrder,
    order: displayOrder,
    galleryImages: body.galleryImages ?? [],
  });
  pushAudit(doc, "created");
  await doc.save();
  return doc;
}

export async function listLookbooksPublic(featured?: string) {
  const now = new Date();
  const filter: Record<string, unknown> = {
    $and: [
      {
        $or: [
          { status: "published" },
          { status: { $exists: false }, active: true },
          { active: true },
        ],
      },
      {
        $or: [{ publishAt: null }, { publishAt: { $exists: false } }, { publishAt: { $lte: now } }],
      },
      {
        $or: [{ expireAt: null }, { expireAt: { $exists: false } }, { expireAt: { $gt: now } }],
      },
    ],
  };
  if (featured === "true") filter.featured = true;
  return Lookbook.find(filter)
    .sort({ displayOrder: 1, order: 1, title: 1 })
    .populate("galleryImages.hotspots.product", "name slug price salePrice stock status images sku")
    .lean();
}

export async function listLookbooksAdmin(query: ListQuery) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const filter: Record<string, unknown> = {};
  if (query.q?.trim()) {
    const q = query.q.trim();
    filter.$or = [
      { title: { $regex: q, $options: "i" } },
      { slug: { $regex: q, $options: "i" } },
      { shortDescription: { $regex: q, $options: "i" } },
    ];
  }
  if (query.status && query.status !== "all") filter.status = query.status;
  if (query.featured === "true") filter.featured = true;
  if (query.featured === "false") filter.featured = false;

  let sort: Record<string, 1 | -1> = { displayOrder: 1, createdAt: -1 };
  if (query.sort === "title") sort = { title: 1 };
  if (query.sort === "newest") sort = { createdAt: -1 };
  if (query.sort === "oldest") sort = { createdAt: 1 };
  if (query.sort === "order") sort = { displayOrder: 1, order: 1 };

  const [total, items] = await Promise.all([
    Lookbook.countDocuments(filter),
    Lookbook.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  return {
    items: items.map((d) => summarizeLookbook(d as Record<string, unknown>)),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getLookbookById(id: string) {
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, "Invalid id");
  const doc = await Lookbook.findById(id)
    .populate("galleryImages.hotspots.product", "name slug price salePrice stock status images sku")
    .populate("products", "name slug price salePrice stock status images");
  if (!doc) throw new AppError(404, "Lookbook not found");
  return doc;
}

export async function getLookbookBySlug(slug: string) {
  const doc = await Lookbook.findOne({
    slug,
    $or: [{ status: "published" }, { active: true }],
  })
    .populate("galleryImages.hotspots.product")
    .populate("products");
  if (!doc) throw new AppError(404, "Lookbook not found");
  doc.analytics = doc.analytics ?? { views: 0, clicks: 0, productClicks: 0, conversions: 0 };
  doc.analytics.views = (doc.analytics.views ?? 0) + 1;
  await doc.save();
  return doc;
}

export async function updateLookbookDoc(id: string, body: LookbookBody) {
  const doc = await Lookbook.findById(id);
  if (!doc) throw new AppError(404, "Not found");

  if (body.title != null) doc.title = body.title.trim();
  if (body.slug != null && body.slug.trim()) {
    const slug = body.slug.trim().toLowerCase();
    const clash = await Lookbook.findOne({ slug, _id: { $ne: doc._id } });
    if (clash) throw new AppError(409, "slug exists");
    doc.slug = slug;
  }
  if (body.shortDescription != null) doc.shortDescription = body.shortDescription;
  if (body.description != null) doc.description = body.description;
  if (body.featured != null) doc.featured = body.featured;
  if (body.coverImage !== undefined) doc.coverImage = body.coverImage ?? undefined;
  if (body.images != null) doc.images = body.images;
  if (body.galleryImages != null) {
    doc.galleryImages = body.galleryImages as unknown as typeof doc.galleryImages;
  }
  if (body.seo != null) {
    doc.seo = {
      title: body.seo.title ?? doc.seo?.title ?? "",
      description: body.seo.description ?? doc.seo?.description ?? "",
    };
  }
  if (body.publishAt !== undefined) {
    doc.publishAt = body.publishAt ? new Date(body.publishAt) : undefined;
  }
  if (body.expireAt !== undefined) {
    doc.expireAt = body.expireAt ? new Date(body.expireAt) : undefined;
  }

  const status = resolveStatus(body);
  if (status) {
    doc.status = status as "draft" | "published" | "archived";
    doc.active = status === "published";
  }
  const order = body.displayOrder ?? body.order;
  if (order != null) {
    doc.displayOrder = order;
    doc.order = order;
  }

  pushAudit(doc, "updated");
  await doc.save();
  return doc;
}

export async function deleteLookbookDoc(id: string) {
  const doc = await Lookbook.findByIdAndDelete(id);
  if (!doc) throw new AppError(404, "Not found");
  return { ok: true };
}

export async function addLookbookImage(id: string, image: ImageBody) {
  const doc = await Lookbook.findById(id);
  if (!doc) throw new AppError(404, "Not found");
  const sortOrder = image.sortOrder ?? doc.galleryImages.length;
  doc.galleryImages.push({
    ...image,
    sortOrder,
    hotspots: image.hotspots ?? [],
    isFeatured: image.isFeatured ?? doc.galleryImages.length === 0,
  } as never);
  pushAudit(doc, "image_added", { imageUrl: image.imageUrl });
  await doc.save();
  return doc;
}

export async function deleteLookbookImage(id: string, imageId: string) {
  const doc = await Lookbook.findById(id);
  if (!doc) throw new AppError(404, "Not found");
  const img = doc.galleryImages.id(imageId);
  if (!img) throw new AppError(404, "Image not found");
  img.deleteOne();
  pushAudit(doc, "image_deleted", { imageId });
  await doc.save();
  return doc;
}

export async function reorderLookbookImages(id: string, imageIds: string[]) {
  const doc = await Lookbook.findById(id);
  if (!doc) throw new AppError(404, "Not found");
  imageIds.forEach((imgId, index) => {
    const img = doc.galleryImages.id(imgId);
    if (img) img.sortOrder = index;
  });
  pushAudit(doc, "images_reordered");
  await doc.save();
  return doc;
}

export async function addHotspot(id: string, imageId: string, hotspot: HotspotBody) {
  const doc = await Lookbook.findById(id);
  if (!doc) throw new AppError(404, "Not found");
  const img = doc.galleryImages.id(imageId);
  if (!img) throw new AppError(404, "Image not found");
  img.hotspots.push({
    ...hotspot,
    product: new mongoose.Types.ObjectId(hotspot.product),
    sortOrder: hotspot.sortOrder ?? img.hotspots.length,
  } as never);
  pushAudit(doc, "hotspot_added", { imageId, product: hotspot.product });
  await doc.save();
  return getLookbookById(id);
}

export async function updateHotspot(
  id: string,
  imageId: string,
  hotspotId: string,
  hotspot: Partial<HotspotBody>
) {
  if (
    !mongoose.isValidObjectId(id) ||
    !mongoose.isValidObjectId(imageId) ||
    !mongoose.isValidObjectId(hotspotId)
  ) {
    throw new AppError(400, "Invalid id");
  }

  const prefix = "galleryImages.$[img].hotspots.$[hs]";
  const $set: Record<string, unknown> = {};
  if (hotspot.product) $set[`${prefix}.product`] = new mongoose.Types.ObjectId(hotspot.product);
  if (hotspot.x != null) $set[`${prefix}.x`] = hotspot.x;
  if (hotspot.y != null) $set[`${prefix}.y`] = hotspot.y;
  if (hotspot.label != null) $set[`${prefix}.label`] = hotspot.label;
  if (hotspot.jewelryArea != null) $set[`${prefix}.jewelryArea`] = hotspot.jewelryArea;
  if (hotspot.style != null) $set[`${prefix}.style`] = hotspot.style;
  if (hotspot.color != null) $set[`${prefix}.color`] = hotspot.color;
  if (hotspot.customColor != null) $set[`${prefix}.customColor`] = hotspot.customColor;
  if (hotspot.size != null) $set[`${prefix}.size`] = hotspot.size;
  if (hotspot.animation != null) $set[`${prefix}.animation`] = hotspot.animation;
  if (hotspot.sortOrder != null) $set[`${prefix}.sortOrder`] = hotspot.sortOrder;
  if (hotspot.tooltip != null) {
    for (const [key, value] of Object.entries(hotspot.tooltip)) {
      if (value !== undefined) $set[`${prefix}.tooltip.${key}`] = value;
    }
  }

  if (!Object.keys($set).length) {
    return getLookbookById(id);
  }

  // Atomic update avoids VersionError when many drag events race.
  const positionOnly =
    Object.keys($set).every((k) => k.endsWith(".x") || k.endsWith(".y")) &&
    Object.keys($set).length > 0;

  const update: Record<string, unknown> = { $set };
  if (!positionOnly) {
    update.$push = {
      auditLog: {
        $each: [{ action: "hotspot_updated", at: new Date(), meta: { imageId, hotspotId } }],
        $slice: -100,
      },
    };
  }

  const updated = await Lookbook.findOneAndUpdate(
    { _id: id, "galleryImages._id": imageId, "galleryImages.hotspots._id": hotspotId },
    update,
    {
      new: true,
      runValidators: true,
      arrayFilters: [
        { "img._id": new mongoose.Types.ObjectId(imageId) },
        { "hs._id": new mongoose.Types.ObjectId(hotspotId) },
      ],
    }
  );
  if (!updated) throw new AppError(404, "Hotspot not found");

  // Position drags: skip heavy populate round-trip
  if (positionOnly) return updated;
  return getLookbookById(id);
}

export async function deleteHotspot(id: string, imageId: string, hotspotId: string) {
  const doc = await Lookbook.findById(id);
  if (!doc) throw new AppError(404, "Not found");
  const img = doc.galleryImages.id(imageId);
  if (!img) throw new AppError(404, "Image not found");
  const spot = img.hotspots.id(hotspotId);
  if (!spot) throw new AppError(404, "Hotspot not found");
  spot.deleteOne();
  pushAudit(doc, "hotspot_deleted", { imageId, hotspotId });
  await doc.save();
  return getLookbookById(id);
}

export async function duplicateLookbook(id: string) {
  const source = await Lookbook.findById(id).lean();
  if (!source) throw new AppError(404, "Not found");
  const baseSlug = `${source.slug}-copy`;
  let slug = baseSlug;
  let n = 1;
  while (await Lookbook.findOne({ slug })) {
    slug = `${baseSlug}-${n++}`;
  }
  const {
    _id: _omitId,
    createdAt: _c,
    updatedAt: _u,
    __v: _v,
    ...rest
  } = source as typeof source & { __v?: number };
  const clone = await Lookbook.create({
    ...rest,
    title: `${source.title} (Copy)`,
    slug,
    status: "draft",
    active: false,
    featured: false,
    analytics: { views: 0, clicks: 0, productClicks: 0, conversions: 0 },
    auditLog: [{ action: "duplicated", at: new Date(), meta: { from: id } }],
  });
  return clone;
}
