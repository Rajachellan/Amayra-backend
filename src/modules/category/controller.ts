import type { Request, Response, NextFunction } from "express";
import { Category } from "../../models/Category.js";
import { AppError } from "../../utils/AppError.js";
import { toSlug } from "../../utils/slug.js";
import { getCategoryTree } from "../../services/categoryService.js";

export async function createCategory(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const name = String(body.name ?? "");
    if (!name) throw new AppError(400, "name is required");
    const slug = body.slug ? String(body.slug) : toSlug(name);
    const exists = await Category.findOne({ slug });
    if (exists) throw new AppError(409, "slug already exists");
    const doc = await Category.create({
      name,
      slug,
      description: body.description,
      image: body.image,
      parentCategory: body.parentCategory || null,
      featured: Boolean(body.featured),
      showOnHomepage: Boolean(body.showOnHomepage),
      order: Number(body.order ?? 0),
      active: body.active !== false,
    });
    res.status(201).json(doc);
  } catch (e) {
    next(e);
  }
}

export async function listCategories(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { featured, homepage, active, status } = req.query;
    const filter: Record<string, unknown> = {
      status: { $in: ["published", null] },
    };
    if (status === "all") delete filter.status;
    else if (typeof status === "string" && status) filter.status = status;

    if (featured === "true") filter.featured = true;
    if (homepage === "true") filter.showOnHomepage = true;
    if (active !== "false") filter.active = true;
    const list = await Category.find(filter).sort({ order: 1, name: 1 });
    res.json(list);
  } catch (e) {
    next(e);
  }
}

export async function treeCategories(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const tree = await getCategoryTree(true);
    res.json(tree);
  } catch (e) {
    next(e);
  }
}

/** Admin: all categories including inactive */
export async function listCategoriesAdmin(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const list = await Category.find({}).sort({ order: 1, name: 1 }).lean();
    res.json(list);
  } catch (e) {
    next(e);
  }
}

/** Admin: full tree including inactive categories */
export async function treeCategoriesAdmin(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const tree = await getCategoryTree(false);
    res.json(tree);
  } catch (e) {
    next(e);
  }
}

export async function updateCategory(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;
    const doc = await Category.findByIdAndUpdate(id, body, { new: true });
    if (!doc) throw new AppError(404, "Category not found");
    res.json(doc);
  } catch (e) {
    next(e);
  }
}

export async function deleteCategory(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const children = await Category.countDocuments({ parentCategory: id });
    if (children > 0) throw new AppError(400, "Remove subcategories first");
    const doc = await Category.findByIdAndDelete(id);
    if (!doc) throw new AppError(404, "Category not found");
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}
