import type { Types } from "mongoose";
import { Category, type CategoryDoc } from "../../models/Category.js";

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
  const c = await Category.findOne({
    slug: new RegExp(`^${slug.trim()}$`, "i"),
    active: true,
    status: { $in: ["published", null] },
  }).select("_id");
  return c?._id ?? null;
}

export async function resolveCategoryIdsIncludingDescendants(
  slug: string
): Promise<Types.ObjectId[]> {
  const root = await Category.findOne({
    slug: new RegExp(`^${slug.trim()}$`, "i"),
    active: true,
    status: { $in: ["published", null] },
  }).select("_id");
  if (!root) return [];

  const all = await Category.find({
    active: true,
    status: { $in: ["published", null] },
  })
    .select("_id parentCategory")
    .lean();

  const result: Types.ObjectId[] = [root._id as Types.ObjectId];
  const toCheck = [String(root._id)];

  while (toCheck.length > 0) {
    const currentId = toCheck.pop()!;
    for (const c of all) {
      if (c.parentCategory && String(c.parentCategory) === currentId) {
        result.push(c._id as Types.ObjectId);
        toCheck.push(String(c._id));
      }
    }
  }

  return result;
}
