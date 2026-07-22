import type { Request, Response, NextFunction } from "express";
import { PromotionalBanner } from "../../models/PromotionalBanner.js";
import { AppError } from "../../utils/AppError.js";
import { pickImageUrl, type MediaAsset } from "../../utils/mediaAsset.js";
import { resolveRedirectLink } from "../../utils/bannerLink.js";
import {
  DEFAULT_PROMOTION_LAYOUT,
  PromotionLayout,
} from "./promotion-layout.model.js";

function normalizeBody(body: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...body };
  for (const key of [
    "name",
    "title",
    "subtitle",
    "description",
    "badge",
    "buttonText",
    "buttonUrl",
    "couponCode",
    "backgroundColor",
    "textColor",
    "redirectLink",
  ]) {
    if (typeof body[key] === "string") out[key] = (body[key] as string).trim();
  }
  if (body.linkTargetId === "" || body.linkTargetId === null) out.linkTargetId = null;
  if (body.startDate === "" || body.startDate === null) out.startDate = null;
  if (body.endDate === "" || body.endDate === null) out.endDate = null;
  if (body.order !== undefined) out.order = Number(body.order) || 0;
  if (body.priority !== undefined) out.priority = Number(body.priority) || 0;
  return out;
}

function isScheduledActive(doc: {
  active?: boolean;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
}) {
  if (!doc.active) return false;
  const now = Date.now();
  if (doc.startDate && new Date(doc.startDate).getTime() > now) return false;
  if (doc.endDate && new Date(doc.endDate).getTime() < now) return false;
  return true;
}

async function toPublicCard(doc: Record<string, unknown>) {
  const link = await resolveRedirectLink(doc as Parameters<typeof resolveRedirectLink>[0]);
  const image = doc.image as MediaAsset | undefined;
  const mobileImage = doc.mobileImage as MediaAsset | undefined;
  const backgroundImage = doc.backgroundImage as MediaAsset | undefined;
  const icon = doc.icon as MediaAsset | undefined;
  const buttonUrl =
    (typeof doc.buttonUrl === "string" && doc.buttonUrl.trim()) || link || "";

  return {
    _id: doc._id,
    name: (doc.name as string) || "",
    title: (doc.title as string) || "",
    subtitle: (doc.subtitle as string) || "",
    description: (doc.description as string) || "",
    badge: (doc.badge as string) || "",
    image: pickImageUrl(image),
    mobileImage: pickImageUrl(mobileImage, pickImageUrl(image)),
    backgroundImage: pickImageUrl(backgroundImage),
    icon: pickImageUrl(icon),
    buttonText: (doc.buttonText as string) || "",
    buttonUrl,
    couponCode: (doc.couponCode as string) || "",
    backgroundColor: (doc.backgroundColor as string) || "",
    textColor: (doc.textColor as string) || "",
    borderStyle: (doc.borderStyle as string) || "none",
    animation: (doc.animation as string) || "none",
    priority: (doc.priority as number) ?? 0,
    link: buttonUrl || link,
    order: (doc.order as number) ?? 0,
  };
}

async function getLayout() {
  let doc = await PromotionLayout.findOne({ singletonKey: "default" }).lean();
  if (!doc) {
    const created = await PromotionLayout.create(DEFAULT_PROMOTION_LAYOUT);
    doc = created.toObject();
  }
  return doc;
}

export async function createPromotionalBanner(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const doc = await PromotionalBanner.create(normalizeBody(req.body as Record<string, unknown>));
    res.status(201).json(doc);
  } catch (e) {
    next(e);
  }
}

export async function listPromotionalBannersAdmin(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    res.json(await PromotionalBanner.find().sort({ order: 1, priority: -1, createdAt: -1 }));
  } catch (e) {
    next(e);
  }
}

/** Combined public payload for the layout builder storefront. */
export async function listPromotionalBanners(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const [layout, list] = await Promise.all([
      getLayout(),
      PromotionalBanner.find({ active: true }).sort({ order: 1, priority: -1, createdAt: -1 }).lean(),
    ]);
    const visible = list.filter((b) => isScheduledActive(b));
    const cards = await Promise.all(visible.map((b) => toPublicCard(b)));
    res.json({ layout, cards });
  } catch (e) {
    next(e);
  }
}

export async function updatePromotionalBanner(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
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

export async function deletePromotionalBanner(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const doc = await PromotionalBanner.findByIdAndDelete(req.params.id);
    if (!doc) throw new AppError(404, "Not found");
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function reorderPromotionalBanners(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const ids = Array.isArray(req.body?.ids) ? (req.body.ids as string[]) : [];
    if (!ids.length) throw new AppError(400, "ids array required");
    await Promise.all(
      ids.map((id, index) => PromotionalBanner.updateOne({ _id: id }, { order: index }))
    );
    res.json(await PromotionalBanner.find().sort({ order: 1, priority: -1, createdAt: -1 }));
  } catch (e) {
    next(e);
  }
}

export async function duplicatePromotionalBanner(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const source = await PromotionalBanner.findById(req.params.id).lean();
    if (!source) throw new AppError(404, "Not found");
    const {
      _id: _omit,
      createdAt: _c,
      updatedAt: _u,
      __v: _v,
      ...rest
    } = source as typeof source & { __v?: number };
    const count = await PromotionalBanner.countDocuments();
    const clone = await PromotionalBanner.create({
      ...rest,
      name: `${source.name || "Promotional Card"} (Copy)`,
      title: source.title ? `${source.title} (Copy)` : source.title,
      order: count,
      active: false,
    });
    res.status(201).json(clone);
  } catch (e) {
    next(e);
  }
}
