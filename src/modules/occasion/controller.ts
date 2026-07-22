import type { Request, Response, NextFunction } from "express";
import { Occasion } from '../../models/Occasion.js';
import { AppError } from '../../utils/AppError.js';
import { toSlug } from '../../utils/slug.js';

export async function createOccasion(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const name = String(body.name ?? "");
    if (!name) throw new AppError(400, "name is required");
    const slug = body.slug ? String(body.slug) : toSlug(name);
    if (await Occasion.findOne({ slug })) throw new AppError(409, "slug exists");
    const doc = await Occasion.create({ ...body, name, slug });
    res.status(201).json(doc);
  } catch (e) {
    next(e);
  }
}

export async function listOccasions(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const list = await Occasion.find({ active: true }).sort({ order: 1, name: 1 });
    res.json(list);
  } catch (e) {
    next(e);
  }
}

export async function listOccasionsAdmin(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const list = await Occasion.find({}).sort({ order: 1, name: 1 }).lean();
    res.json(list);
  } catch (e) {
    next(e);
  }
}

export async function updateOccasion(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const doc = await Occasion.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!doc) throw new AppError(404, "Not found");
    res.json(doc);
  } catch (e) {
    next(e);
  }
}

export async function deleteOccasion(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const doc = await Occasion.findByIdAndDelete(req.params.id);
    if (!doc) throw new AppError(404, "Not found");
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}
