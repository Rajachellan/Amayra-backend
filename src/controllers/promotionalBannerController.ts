import type { Request, Response, NextFunction } from "express";
import { PromotionalBanner } from "../models/PromotionalBanner.js";
import { AppError } from "../utils/AppError.js";
import { pickImageUrl, type MediaAsset } from "../utils/mediaAsset.js";
import { resolveRedirectLink } from "../utils/bannerLink.js";

function normalizeBody(body: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...body };
  if (typeof body.name === "string") out.name = body.name.trim();
  if (typeof body.redirectLink === "string") out.redirectLink = body.redirectLink.trim();
  if (body.linkTargetId === "" || body.linkTargetId === null) out.linkTargetId = null;
  return out;
}

async function toPublic(doc: Record<string, unknown>) {
  const link = await resolveRedirectLink(doc as Parameters<typeof resolveRedirectLink>[0]);
  const image = doc.image as MediaAsset | undefined;
  const mobileImage = doc.mobileImage as MediaAsset | undefined;
  return {
    _id: doc._id,
    image: pickImageUrl(image),
    mobileImage: pickImageUrl(mobileImage, pickImageUrl(image)),
    link,
    order: (doc.order as number) ?? 0,
  };
}

export async function createPromotionalBanner(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const doc = await PromotionalBanner.create(normalizeBody(req.body as Record<string, unknown>));
    res.status(201).json(doc);
  } catch (e) {
    next(e);
  }
}

export async function listPromotionalBannersAdmin(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await PromotionalBanner.find().sort({ order: 1, createdAt: -1 }));
  } catch (e) {
    next(e);
  }
}

export async function listPromotionalBanners(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const list = await PromotionalBanner.find({ active: true }).sort({ order: 1, createdAt: -1 }).lean();
    res.json(await Promise.all(list.map((b) => toPublic(b))));
  } catch (e) {
    next(e);
  }
}

export async function updatePromotionalBanner(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const doc = await PromotionalBanner.findByIdAndUpdate(
      req.params.id,
      normalizeBody(req.body as Record<string, unknown>),
      { new: true, runValidators: true }
    );
    if (!doc) throw new AppError(404, "Not found");
    res.json(doc);
  } catch (e) {
    next(e);
  }
}

export async function deletePromotionalBanner(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const doc = await PromotionalBanner.findByIdAndDelete(req.params.id);
    if (!doc) throw new AppError(404, "Not found");
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function reorderPromotionalBanners(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ids = Array.isArray(req.body?.ids) ? (req.body.ids as string[]) : [];
    if (!ids.length) throw new AppError(400, "ids array required");
    await Promise.all(ids.map((id, index) => PromotionalBanner.updateOne({ _id: id }, { order: index })));
    res.json(await PromotionalBanner.find().sort({ order: 1, createdAt: -1 }));
  } catch (e) {
    next(e);
  }
}
