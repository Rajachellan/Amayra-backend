import type { Request, Response, NextFunction } from "express";
import { Lead } from '../../models/Lead.js';
import { AppError } from '../../utils/AppError.js';

export async function submitLead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    const message = String(body.message || "").trim();

    if (!name || !email || !message) {
      throw new AppError(400, "Name, email, and message are required");
    }

    const doc = await Lead.create({
      name,
      email,
      phone: body.phone ? String(body.phone).trim() : undefined,
      message,
      source: body.source ? String(body.source).trim() : "contact_form",
    });

    res.status(201).json({ ok: true, id: doc._id });
  } catch (e) {
    next(e);
  }
}

export async function listLeadsAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (req.query.status) {
      filter.status = req.query.status;
    }

    const [items, total] = await Promise.all([
      Lead.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Lead.countDocuments(filter),
    ]);

    res.json({
      items,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (e) {
    next(e);
  }
}

export async function updateLeadStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;
    
    if (body.status !== "new" && body.status !== "read" && body.status !== "archived") {
      throw new AppError(400, "Invalid status");
    }

    const doc = await Lead.findByIdAndUpdate(id, { status: body.status }, { new: true });
    if (!doc) throw new AppError(404, "Lead not found");
    res.json(doc);
  } catch (e) {
    next(e);
  }
}

export async function deleteLead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const doc = await Lead.findByIdAndDelete(id);
    if (!doc) throw new AppError(404, "Lead not found");
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}
