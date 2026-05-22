import type { Request, Response, NextFunction } from "express";
import { Collection } from "../models/Collection.js";
import { AppError } from "../utils/AppError.js";
import { toSlug } from "../utils/slug.js";

export async function createCollection(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const name = String(body.name ?? "");
    if (!name) throw new AppError(400, "name is required");
    const slug = body.slug ? String(body.slug) : toSlug(name);
    if (await Collection.findOne({ slug })) throw new AppError(409, "slug exists");
    const doc = await Collection.create({ ...body, name, slug });
    res.status(201).json(doc);
  } catch (e) {
    next(e);
  }
}

export async function listCollections(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { featured } = req.query;
    const filter: Record<string, unknown> = { active: true };
    if (featured === "true") filter.featured = true;
    const list = await Collection.find(filter).sort({ order: 1, name: 1 });
    res.json(list);
  } catch (e) {
    next(e);
  }
}

export async function listCollectionsAdmin(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const list = await Collection.find({}).sort({ order: 1, name: 1 }).lean();
    res.json(list);
  } catch (e) {
    next(e);
  }
}

export async function getCollection(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const doc = await Collection.findOne({ slug: req.params.slug, active: true });
    if (!doc) throw new AppError(404, "Collection not found");
    res.json(doc);
  } catch (e) {
    next(e);
  }
}

export async function updateCollection(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const doc = await Collection.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!doc) throw new AppError(404, "Not found");
    res.json(doc);
  } catch (e) {
    next(e);
  }
}

export async function deleteCollection(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const doc = await Collection.findByIdAndDelete(req.params.id);
    if (!doc) throw new AppError(404, "Not found");
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}
