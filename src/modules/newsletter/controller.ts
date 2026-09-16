import type { Request, Response, NextFunction } from "express";
import { NewsletterSubscriber } from "../../models/NewsletterSubscriber.js";
import { AppError } from "../../utils/AppError.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function subscribe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const email = String(body.email || "")
      .trim()
      .toLowerCase();

    if (!email || !EMAIL_REGEX.test(email)) {
      throw new AppError(400, "A valid email address is required");
    }

    const source = body.source ? String(body.source).trim() : "footer_newsletter";

    const doc = await NewsletterSubscriber.findOneAndUpdate(
      { email },
      { $set: { email, status: "subscribed", source } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({ ok: true, message: "Subscribed successfully!", id: doc._id });
  } catch (e) {
    next(e);
  }
}

export async function listSubscribersAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (typeof req.query.q === "string" && req.query.q.trim()) {
      filter.email = { $regex: req.query.q.trim(), $options: "i" };
    }
    if (typeof req.query.status === "string" && req.query.status.trim()) {
      filter.status = req.query.status.trim();
    }

    const [items, total] = await Promise.all([
      NewsletterSubscriber.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      NewsletterSubscriber.countDocuments(filter),
    ]);

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.json({
      items,
      total,
      page,
      pages: Math.ceil(total / limit) || 0,
    });
  } catch (e) {
    next(e);
  }
}

export async function deleteSubscriberAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = String(req.params.id || "");
    const doc = await NewsletterSubscriber.findByIdAndDelete(id);
    if (!doc) throw new AppError(404, "Subscriber not found");
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}
