import type { Request, Response, NextFunction } from "express";
import { getOrCreateHomepageSettings } from "../../models/HomepageSettings.js";

const PUBLIC_FIELDS = [
  "showBanner",
  "showCollections",
  "showCategories",
  "showLookbooks",
  "showBlogSection",
] as const;

function toPublic(doc: {
  showBanner: boolean;
  showCollections: boolean;
  showCategories: boolean;
  showLookbooks: boolean;
  showBlogSection: boolean;
}) {
  return {
    showBanner: doc.showBanner,
    showCollections: doc.showCollections,
    showCategories: doc.showCategories,
    showLookbooks: doc.showLookbooks,
    showBlogSection: doc.showBlogSection,
  };
}

export async function getHomepageSettingsPublic(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const doc = await getOrCreateHomepageSettings();
    res.json(toPublic(doc));
  } catch (e) {
    next(e);
  }
}

export async function getHomepageSettingsAdmin(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    res.json(await getOrCreateHomepageSettings());
  } catch (e) {
    next(e);
  }
}

export async function updateHomepageSettingsAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const patch: Record<string, boolean> = {};
    for (const key of PUBLIC_FIELDS) {
      if (typeof req.body?.[key] === "boolean") patch[key] = req.body[key];
    }
    const doc = await getOrCreateHomepageSettings();
    Object.assign(doc, patch);
    await doc.save();
    res.json(doc);
  } catch (e) {
    next(e);
  }
}
