import { z } from "zod";

export const jewelryAreas = [
  "necklace",
  "choker",
  "long_haram",
  "earrings",
  "stud",
  "jhumka",
  "ring",
  "bracelet",
  "bangles",
  "waist_belt",
  "maang_tikka",
  "nose_pin",
  "anklet",
  "toe_ring",
  "pendant",
  "hair_accessories",
  "other",
] as const;

export const hotspotStyles = [
  "default_dot",
  "pulse",
  "glow",
  "luxury_gold",
  "diamond",
  "minimal_circle",
  "square",
  "hover_reveal",
] as const;

export const tooltipSchema = z
  .object({
    showImage: z.boolean().optional(),
    showName: z.boolean().optional(),
    showPrice: z.boolean().optional(),
    showSalePrice: z.boolean().optional(),
    showQuickView: z.boolean().optional(),
    showViewProduct: z.boolean().optional(),
    showAddToCart: z.boolean().optional(),
    hidePrice: z.boolean().optional(),
    customLabel: z.string().max(80).optional(),
  })
  .partial();

export const hotspotSchema = z.object({
  product: z.string().min(1, "Product is required"),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  label: z.string().max(80).optional(),
  jewelryArea: z.enum(jewelryAreas).optional(),
  style: z.enum(hotspotStyles).optional(),
  color: z.enum(["white", "gold", "black", "emerald", "ruby", "custom"]).optional(),
  customColor: z.string().max(32).optional(),
  size: z.enum(["small", "medium", "large"]).optional(),
  animation: z.enum(["none", "pulse", "bounce", "glow", "rotate"]).optional(),
  tooltip: tooltipSchema.optional(),
  sortOrder: z.number().int().optional(),
});

export const lookbookImageSchema = z.object({
  imageUrl: z.string().min(1),
  mobileImageUrl: z.string().optional(),
  desktopImageUrl: z.string().optional(),
  alt: z.string().max(200).optional(),
  title: z.string().max(120).optional(),
  description: z.string().max(500).optional(),
  sortOrder: z.number().int().optional(),
  isFeatured: z.boolean().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  hotspots: z.array(hotspotSchema).optional(),
});

export const lookbookBodySchema = z.object({
  title: z.string().min(2).max(160),
  slug: z.string().max(180).optional(),
  shortDescription: z.string().max(300).optional(),
  description: z.string().max(5000).optional(),
  featured: z.boolean().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  active: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
  order: z.number().int().optional(),
  coverImage: z.string().nullable().optional(),
  images: z.array(z.string()).optional(),
  galleryImages: z.array(lookbookImageSchema).optional(),
  seo: z
    .object({
      title: z.string().max(120).optional(),
      description: z.string().max(320).optional(),
    })
    .optional(),
  publishAt: z.union([z.string(), z.null()]).optional(),
  expireAt: z.union([z.string(), z.null()]).optional(),
});

export const adminListQuerySchema = z.object({
  q: z.string().optional(),
  status: z.enum(["draft", "published", "archived", "all"]).optional(),
  featured: z.enum(["true", "false", "all"]).optional(),
  sort: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
