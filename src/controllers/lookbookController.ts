import type { Request, Response, NextFunction } from "express";
import { Lookbook } from "../models/Lookbook.js";
import { AppError } from "../utils/AppError.js";
import { toSlug } from "../utils/slug.js";

export async function createLookbook(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const title = String(body.title ?? "");
    if (!title) throw new AppError(400, "title is required");
    const slug = body.slug ? String(body.slug) : toSlug(title);
    if (await Lookbook.findOne({ slug })) throw new AppError(409, "slug exists");
    const doc = await Lookbook.create({ ...body, title, slug });
    res.status(201).json(doc);
  } catch (e) {
    next(e);
  }
}

export async function listLookbooks(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { featured } = req.query;
    const filter: Record<string, unknown> = { active: true };
    if (featured === "true") filter.featured = true;
    const list = await Lookbook.find(filter).sort({ order: 1, title: 1 });
    res.json(list);
  } catch (e) {
    next(e);
  }
}

export async function listLookbooksAdmin(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const list = await Lookbook.find({}).sort({ order: 1, title: 1 }).lean();
    res.json(list);
  } catch (e) {
    next(e);
  }
}

export async function getLookbook(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const doc = await Lookbook.findOne({ slug: req.params.slug, active: true }).populate(
      "products"
    );
    if (!doc) throw new AppError(404, "Lookbook not found");
    res.json(doc);
  } catch (e) {
    next(e);
  }
}

export async function updateLookbook(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const doc = await Lookbook.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!doc) throw new AppError(404, "Not found");
    res.json(doc);
  } catch (e) {
    next(e);
  }
}

export async function deleteLookbook(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const doc = await Lookbook.findByIdAndDelete(req.params.id);
    if (!doc) throw new AppError(404, "Not found");
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}
