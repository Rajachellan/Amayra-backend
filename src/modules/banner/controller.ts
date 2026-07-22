import type { Request, Response, NextFunction } from "express";
import { Banner } from '../../models/Banner.js';
import { AppError } from '../../utils/AppError.js';
import { pickImageUrl, type MediaAsset } from '../../utils/mediaAsset.js';
import { publishedBannerFilter, resolveRedirectLink } from '../../utils/bannerLink.js';

const PATCHABLE_FIELDS = [
  "name",
  "desktopImage",
  "mobileImage",
  "title",
  "subtitle",
  "buttonText",
  "redirectLink",
  "linkType",
  "linkTargetId",
  "order",
  "status",
  "active",
  "startDate",
  "endDate",
  "image",
  "link",
  "ctaLabel",
] as const;

function normalizeBannerBody(body: Record<string, unknown>, partial = false) {
  const out: Record<string, unknown> = partial ? {} : { ...body };

  if (partial) {
    for (const key of PATCHABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        out[key] = body[key];
      }
    }
  }

  for (const key of ["name", "title", "subtitle", "buttonText", "redirectLink"] as const) {
    if (typeof out[key] === "string") out[key] = out[key].trim();
  }
  if (out.startDate === "" || out.startDate === null) out.startDate = null;
  if (out.endDate === "" || out.endDate === null) out.endDate = null;
  if (out.linkTargetId === "" || out.linkTargetId === null) out.linkTargetId = null;
  return out;
}

function assertBannerLink(body: Record<string, unknown>) {
  const linkType = (typeof body.linkType === "string" ? body.linkType : "custom") as string;
  if (linkType === "custom") {
    const url = typeof body.redirectLink === "string" ? body.redirectLink.trim() : "";
    if (!url) throw new AppError(400, "Redirect link is required when link type is Custom URL");
    return;
  }
  if (!body.linkTargetId) {
    throw new AppError(400, "Link target is required");
  }
}

function assertDesktopImage(body: Record<string, unknown>) {
  const desktop = body.desktopImage as { imageUrl?: string } | undefined;
  if (!desktop?.imageUrl && !body.image) {
    throw new AppError(400, "Desktop image is required");
  }
}

async function toPublicBanner(doc: Record<string, unknown>) {
  const link = await resolveRedirectLink(doc as Parameters<typeof resolveRedirectLink>[0]);
  const desktopImage = doc.desktopImage as MediaAsset | undefined;
  const mobileImage = doc.mobileImage as MediaAsset | undefined;
  const desktop = pickImageUrl(desktopImage, doc.image as string | undefined);
  const mobile = pickImageUrl(mobileImage, desktop);
  const subtitle = typeof doc.subtitle === "string" ? doc.subtitle.trim() : "";
  const buttonText =
    (typeof doc.buttonText === "string" ? doc.buttonText.trim() : "") ||
    (typeof doc.ctaLabel === "string" ? doc.ctaLabel.trim() : "");
  const title = typeof doc.title === "string" ? doc.title.trim() : "";
  return {
    _id: doc._id,
    image: desktop,
    mobileImageUrl: mobile,
    title,
    subtitle,
    buttonText,
    ctaLabel: buttonText,
    link,
    redirectLink: link,
    linkType: doc.linkType || "custom",
    order: doc.order ?? 0,
  };
}

export async function createBanner(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = normalizeBannerBody(req.body as Record<string, unknown>);
    assertDesktopImage(body);
    assertBannerLink(body);
    const doc = await Banner.create(body);
    res.status(201).json(doc);
  } catch (e) {
    next(e);
  }
}

export async function listBannersAdmin(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const list = await Banner.find().sort({ order: 1, createdAt: -1 });
    res.json(list);
  } catch (e) {
    next(e);
  }
}

export async function listBanners(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const list = await Banner.find(publishedBannerFilter()).sort({ order: 1, createdAt: -1 }).lean();
    const out = await Promise.all(list.map((b) => toPublicBanner(b)));
    res.json(out);
  } catch (e) {
    next(e);
  }
}

export async function updateBanner(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const doc = await Banner.findById(req.params.id);
    if (!doc) throw new AppError(404, "Not found");

    const patch = normalizeBannerBody(req.body as Record<string, unknown>, true);
    if (Object.keys(patch).length === 0) {
      throw new AppError(400, "No fields to update");
    }

    Object.assign(doc, patch);

    if ("linkType" in patch || "linkTargetId" in patch || "redirectLink" in patch) {
      assertBannerLink(doc.toObject());
    }
    if ("desktopImage" in patch || "image" in patch) {
      assertDesktopImage(doc.toObject());
    }

    await doc.save();
    res.json(doc);
  } catch (e) {
    next(e);
  }
}

export async function deleteBanner(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const doc = await Banner.findByIdAndDelete(req.params.id);
    if (!doc) throw new AppError(404, "Not found");
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function reorderBanners(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ids = Array.isArray(req.body?.ids) ? (req.body.ids as string[]) : [];
    if (!ids.length) throw new AppError(400, "ids array required");
    await Promise.all(ids.map((id, index) => Banner.updateOne({ _id: id }, { $set: { order: index } })));
    const list = await Banner.find().sort({ order: 1, createdAt: -1 });
    res.json(list);
  } catch (e) {
    next(e);
  }
}
