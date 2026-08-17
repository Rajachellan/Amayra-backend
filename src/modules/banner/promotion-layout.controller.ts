import type { Request, Response, NextFunction } from "express";
import { DEFAULT_PROMOTION_LAYOUT, PromotionLayout } from "./promotion-layout.model.js";

async function getOrCreateLayout() {
  let doc = await PromotionLayout.findOne({ singletonKey: "default" });
  if (!doc) {
    doc = await PromotionLayout.create(DEFAULT_PROMOTION_LAYOUT);
  }
  return doc;
}

export async function getPromotionLayoutPublic(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const doc = await getOrCreateLayout();
    res.json(doc);
  } catch (e) {
    next(e);
  }
}

export async function getPromotionLayoutAdmin(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    res.json(await getOrCreateLayout());
  } catch (e) {
    next(e);
  }
}

export async function updatePromotionLayoutAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = { ...(req.body as Record<string, unknown>) };
    delete body._id;
    delete body.singletonKey;
    delete body.createdAt;
    delete body.updatedAt;
    delete body.__v;

    const doc = await PromotionLayout.findOneAndUpdate(
      { singletonKey: "default" },
      { $set: body },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    res.json(doc);
  } catch (e) {
    next(e);
  }
}
