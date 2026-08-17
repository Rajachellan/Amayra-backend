import type { Types } from "mongoose";

type HotspotLean = {
  _id?: Types.ObjectId;
  product?: Types.ObjectId | { _id: Types.ObjectId };
  x: number;
  y: number;
  label?: string;
  jewelryArea?: string;
  style?: string;
  color?: string;
  customColor?: string;
  size?: string;
  animation?: string;
  tooltip?: Record<string, unknown>;
  sortOrder?: number;
};

type ImageLean = {
  _id?: Types.ObjectId;
  imageUrl: string;
  mobileImageUrl?: string;
  desktopImageUrl?: string;
  alt?: string;
  title?: string;
  description?: string;
  sortOrder?: number;
  isFeatured?: boolean;
  width?: number;
  height?: number;
  hotspots?: HotspotLean[];
};

export function summarizeLookbook(doc: Record<string, unknown>) {
  const gallery = (doc.galleryImages as ImageLean[] | undefined) ?? [];
  const legacyImages = (doc.images as string[] | undefined) ?? [];
  const imagesCount = gallery.length || legacyImages.length;
  let hotspotsCount = 0;
  for (const img of gallery) hotspotsCount += img.hotspots?.length ?? 0;

  const status = (doc.status as string) || (doc.active === false ? "draft" : "published");

  return {
    ...doc,
    status,
    displayOrder: doc.displayOrder ?? doc.order ?? 0,
    imagesCount,
    hotspotsCount,
    coverImage:
      doc.coverImage ||
      gallery.find((g) => g.isFeatured)?.imageUrl ||
      gallery[0]?.imageUrl ||
      legacyImages[0] ||
      "",
  };
}

export function pushAudit(doc: unknown, action: string, meta?: unknown) {
  const d = doc as {
    auditLog?: Array<{ action: string; at?: Date; meta?: unknown }>;
  };
  if (!d.auditLog) d.auditLog = [];
  d.auditLog.push({ action, at: new Date(), meta });
  if (d.auditLog.length > 100) {
    d.auditLog = d.auditLog.slice(-100);
  }
}
