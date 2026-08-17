import type { Request, Response, NextFunction } from "express";
import { Announcement } from "../../models/Announcement.js";
import { AppError } from "../../utils/AppError.js";

export async function createAnnouncement(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const doc = await Announcement.create(req.body);
    res.status(201).json(doc);
  } catch (e) {
    next(e);
  }
}

export async function listAnnouncementsAdmin(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    res.json(await Announcement.find().sort({ order: 1, createdAt: -1 }));
  } catch (e) {
    next(e);
  }
}

export async function listAnnouncements(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    res.json(await Announcement.find({ active: true }).sort({ order: 1, createdAt: -1 }));
  } catch (e) {
    next(e);
  }
}

export async function updateAnnouncement(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const doc = await Announcement.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!doc) throw new AppError(404, "Not found");
    res.json(doc);
  } catch (e) {
    next(e);
  }
}

export async function deleteAnnouncement(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const doc = await Announcement.findByIdAndDelete(req.params.id);
    if (!doc) throw new AppError(404, "Not found");
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function reorderAnnouncements(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const ids = Array.isArray(req.body?.ids) ? (req.body.ids as string[]) : [];
    if (!ids.length) throw new AppError(400, "ids array required");
    await Promise.all(
      ids.map((id, index) => Announcement.updateOne({ _id: id }, { order: index }))
    );
    res.json(await Announcement.find().sort({ order: 1, createdAt: -1 }));
  } catch (e) {
    next(e);
  }
}
