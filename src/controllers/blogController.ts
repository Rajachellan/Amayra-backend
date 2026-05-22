import type { Request, Response, NextFunction } from "express";
import { Blog } from "../models/Blog.js";
import { AppError } from "../utils/AppError.js";
import { toSlug } from "../utils/slug.js";

export async function listBlogs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10));
    const skip = (page - 1) * limit;

    const filter = { status: "published" };
    
    const [items, total] = await Promise.all([
      Blog.find(filter).sort({ publishedAt: -1, createdAt: -1 }).skip(skip).limit(limit),
      Blog.countDocuments(filter),
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

export async function getBlogBySlug(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { slug } = req.params;
    const doc = await Blog.findOne({ slug, status: "published" });
    if (!doc) throw new AppError(404, "Blog not found");
    res.json(doc);
  } catch (e) {
    next(e);
  }
}

export async function listBlogsAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    
    const [items, total] = await Promise.all([
      Blog.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      Blog.countDocuments(),
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

export async function getBlogByIdAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const doc = await Blog.findById(id);
    if (!doc) throw new AppError(404, "Blog not found");
    res.json(doc);
  } catch (e) {
    next(e);
  }
}

export async function createBlog(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const title = String(body.title || "").trim();
    if (!title) throw new AppError(400, "Title is required");
    
    const slug = String(body.slug || "").trim() || toSlug(title);
    const exists = await Blog.findOne({ slug });
    if (exists) throw new AppError(409, "Slug already exists");

    const content = String(body.content || "").trim();
    if (!content) throw new AppError(400, "Content is required");

    const status = body.status === "published" ? "published" : "draft";

    const doc = await Blog.create({
      title,
      slug,
      excerpt: body.excerpt,
      content,
      coverImage: body.coverImage,
      author: body.author,
      tags: Array.isArray(body.tags) ? body.tags : [],
      status,
      publishedAt: status === "published" ? new Date() : null,
    });

    res.status(201).json(doc);
  } catch (e) {
    next(e);
  }
}

export async function updateBlog(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;
    
    const existing = await Blog.findById(id);
    if (!existing) throw new AppError(404, "Blog not found");

    if (body.title) {
      existing.title = String(body.title).trim();
    }
    if (body.slug !== undefined) {
      const newSlug = String(body.slug).trim() || toSlug(existing.title);
      if (newSlug !== existing.slug) {
        const exists = await Blog.findOne({ slug: newSlug, _id: { $ne: id } });
        if (exists) throw new AppError(409, "Slug already exists");
      }
      existing.slug = newSlug;
    }
    if (body.excerpt !== undefined) {
      existing.excerpt = String(body.excerpt).trim() || undefined;
    }
    if (body.content) {
      existing.content = String(body.content).trim();
    }
    if (body.coverImage !== undefined) {
      existing.coverImage = String(body.coverImage).trim() || undefined;
    }
    if (body.author !== undefined) {
      existing.author = String(body.author).trim() || undefined;
    }
    if (Array.isArray(body.tags)) {
      existing.tags = body.tags.map(String);
    }
    if (body.status === "published" || body.status === "draft") {
      if (body.status === "published" && existing.status !== "published") {
        existing.publishedAt = new Date();
      }
      existing.status = body.status;
    }

    await existing.save();
    res.json(existing);
  } catch (e) {
    next(e);
  }
}

export async function deleteBlog(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const doc = await Blog.findByIdAndDelete(id);
    if (!doc) throw new AppError(404, "Blog not found");
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}
