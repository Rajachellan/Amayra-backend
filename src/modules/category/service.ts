import type { Types } from "mongoose";
import { Category, type CategoryDoc } from '../../models/Category.js';

export type CategoryTreeNode = {
  _id: string;
  name: string;
  slug: string;
  image?: string;
  featured: boolean;
  order: number;
  active: boolean;
  children: CategoryTreeNode[];
};

function toNode(c: CategoryDoc): Omit<CategoryTreeNode, "children"> {
  return {
    _id: c._id.toString(),
    name: c.name,
    slug: c.slug,
    image: c.image ?? undefined,
    featured: c.featured,
    order: c.order,
    active: c.active,
  };
}

export async function getCategoryTree(onlyActive = true): Promise<CategoryTreeNode[]> {
  const q = onlyActive ? { active: true, status: { $in: ["published", null] } } : {};
  const all = await Category.find(q).sort({ order: 1, name: 1 }).lean();
  const byParent = new Map<string | null, typeof all>();
  for (const c of all) {
    const pid = c.parentCategory ? String(c.parentCategory) : null;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid)!.push(c);
  }
  function build(pid: string | null): CategoryTreeNode[] {
    const list = byParent.get(pid) ?? [];
    return list.map((c) => ({
      ...toNode(c as unknown as CategoryDoc),
      children: build(String(c._id)),
    }));
  }
  return build(null);
}

export async function resolveCategoryIdBySlug(slug: string): Promise<Types.ObjectId | null> {
  const c = await Category.findOne({ slug, active: true, status: { $in: ["published", null] } }).select("_id");
  return c?._id ?? null;
}
