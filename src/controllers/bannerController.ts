import type { Request, Response, NextFunction } from "express";
import { Banner } from "../models/Banner.js";
import { AppError } from "../utils/AppError.js";

export async function createBanner(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const doc = await Banner.create(req.body);
    res.status(201).json(doc);
  } catch (e) {
    next(e);
  }
}

export async function listBanners(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const list = await Banner.find({ active: true }).sort({ order: 1, createdAt: -1 });
    res.json(list);
  } catch (e) {
    next(e);
  }
}

export async function updateBanner(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const doc = await Banner.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!doc) throw new AppError(404, "Not found");
    res.json(doc);
  } catch (e) {
    next(e);
  }
}

export async function deleteBanner(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const doc = await Banner.findByIdAndDelete(req.params.id);
    if (!doc) throw new AppError(404, "Not found");
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}
