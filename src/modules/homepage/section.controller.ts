import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { HomepageSection } from "../../models/HomepageSection.js";
import { Category } from "../../models/Category.js";
import { Product } from "../../models/Product.js";
import { Collection } from "../../models/Collection.js";
import { Lookbook } from "../../models/Lookbook.js";
import { Occasion } from "../../models/Occasion.js";
import { AppError } from "../../utils/AppError.js";

export async function createHomepageSection(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const doc = await HomepageSection.create(req.body);
    res.status(201).json(doc);
  } catch (e) {
    next(e);
  }
}

export async function listHomepageSectionsAdmin(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const list = await HomepageSection.find().sort({ order: 1 });
    res.json(list);
  } catch (e) {
    next(e);
  }
}

async function resolveReferences(referenceType: string, referenceIds: mongoose.Types.ObjectId[]) {
  if (!referenceIds.length) return [];
  const ids = referenceIds;
  switch (referenceType) {
    case "Category":
      return Category.find({
        _id: { $in: ids },
        active: true,
        status: { $in: ["published", null] },
      })
        .sort({ order: 1 })
        .lean();
    case "Product":
      return Product.find({ _id: { $in: ids }, status: { $in: ["published", null] } })
        .populate("category", "name slug")
        .lean();
    case "Collection":
      return Collection.find({ _id: { $in: ids }, active: true })
        .sort({ order: 1 })
        .lean();
    case "Lookbook":
      return Lookbook.find({ _id: { $in: ids }, active: true })
        .sort({ order: 1 })
        .lean();
    case "Occasion":
      return Occasion.find({ _id: { $in: ids }, active: true })
        .sort({ order: 1 })
        .lean();
    default:
      return [];
  }
}

/** Public: ordered active sections with resolved items (for storefront CMS) */
export async function publicHomepageSections(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const sections = await HomepageSection.find({ active: true }).sort({ order: 1 }).lean();
    const out = await Promise.all(
      sections.map(async (s) => {
        const items =
          s.referenceType && s.referenceType !== "None" && s.referenceIds?.length
            ? await resolveReferences(s.referenceType, s.referenceIds as mongoose.Types.ObjectId[])
            : [];
        return {
          _id: s._id,
          sectionType: s.sectionType,
          title: s.title,
          order: s.order,
          referenceType: s.referenceType,
          referenceIds: s.referenceIds,
          items,
        };
      })
    );
    res.json(out);
  } catch (e) {
    next(e);
  }
}

export async function updateHomepageSection(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const doc = await HomepageSection.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!doc) throw new AppError(404, "Not found");
    res.json(doc);
  } catch (e) {
    next(e);
  }
}

export async function deleteHomepageSection(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const doc = await HomepageSection.findByIdAndDelete(req.params.id);
    if (!doc) throw new AppError(404, "Not found");
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function reorderHomepageSections(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const ids = Array.isArray(req.body?.ids) ? (req.body.ids as string[]) : [];
    if (!ids.length) throw new AppError(400, "ids array required");
    await Promise.all(
      ids.map((id, index) => HomepageSection.updateOne({ _id: id }, { order: index }))
    );
    res.json(await HomepageSection.find().sort({ order: 1 }));
  } catch (e) {
    next(e);
  }
}
