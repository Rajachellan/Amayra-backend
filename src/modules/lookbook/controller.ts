import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import * as lookbookService from "./service.js";
import {
  adminListQuerySchema,
  hotspotSchema,
  lookbookBodySchema,
  lookbookImageSchema,
} from "./validation.js";

function zodFail(err: z.ZodError): never {
  throw new AppError(400, err.issues.map((i) => i.message).join("; "));
}

export async function createLookbook(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = lookbookBodySchema.safeParse(req.body);
    if (!parsed.success) zodFail(parsed.error);
    const doc = await lookbookService.createLookbookDoc(parsed.data);
    res.status(201).json(doc);
  } catch (e) {
    next(e);
  }
}

export async function listLookbooks(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const list = await lookbookService.listLookbooksPublic(
      typeof req.query.featured === "string" ? req.query.featured : undefined
    );
    res.json(list);
  } catch (e) {
    next(e);
  }
}

export async function listLookbooksAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = adminListQuerySchema.safeParse(req.query);
    if (!parsed.success) zodFail(parsed.error);
    // Backward compatible: without page query return flat array for product form
    if (req.query.page == null && req.query.limit == null && req.query.q == null) {
      const all = await lookbookService.listLookbooksAdmin({ ...parsed.data, limit: 100, page: 1 });
      res.json(all.items);
      return;
    }
    const result = await lookbookService.listLookbooksAdmin(parsed.data);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function getLookbook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const doc = await lookbookService.getLookbookBySlug(String(req.params.slug));
    res.json(doc);
  } catch (e) {
    next(e);
  }
}

export async function getLookbookByIdAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const doc = await lookbookService.getLookbookById(String(req.params.id));
    res.json(doc);
  } catch (e) {
    next(e);
  }
}

export async function updateLookbook(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = lookbookBodySchema
      .partial()
      .extend({ title: z.string().min(2).max(160).optional() })
      .safeParse(req.body);
    if (!parsed.success) zodFail(parsed.error);
    const doc = await lookbookService.updateLookbookDoc(
      String(req.params.id),
      parsed.data as never
    );
    res.json(doc);
  } catch (e) {
    next(e);
  }
}

export async function deleteLookbook(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    res.json(await lookbookService.deleteLookbookDoc(String(req.params.id)));
  } catch (e) {
    next(e);
  }
}

export async function addLookbookImage(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = lookbookImageSchema.safeParse(req.body);
    if (!parsed.success) zodFail(parsed.error);
    const doc = await lookbookService.addLookbookImage(String(req.params.id), parsed.data);
    res.status(201).json(doc);
  } catch (e) {
    next(e);
  }
}

export async function deleteLookbookImage(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const doc = await lookbookService.deleteLookbookImage(
      String(req.params.id),
      String(req.params.imageId)
    );
    res.json(doc);
  } catch (e) {
    next(e);
  }
}

export async function reorderLookbookImages(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const ids = (req.body as { imageIds?: string[] }).imageIds;
    if (!Array.isArray(ids)) throw new AppError(400, "imageIds required");
    const doc = await lookbookService.reorderLookbookImages(String(req.params.id), ids);
    res.json(doc);
  } catch (e) {
    next(e);
  }
}

export async function addLookbookHotspot(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const imageId = String(req.body?.imageId ?? req.params.imageId ?? "");
    if (!imageId) throw new AppError(400, "imageId required");
    const parsed = hotspotSchema.safeParse(req.body);
    if (!parsed.success) zodFail(parsed.error);
    const doc = await lookbookService.addHotspot(String(req.params.id), imageId, parsed.data);
    res.status(201).json(doc);
  } catch (e) {
    next(e);
  }
}

export async function updateLookbookHotspot(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const imageId = String(req.body?.imageId ?? req.params.imageId ?? "");
    if (!imageId) throw new AppError(400, "imageId required");
    const parsed = hotspotSchema.partial().safeParse(req.body);
    if (!parsed.success) zodFail(parsed.error);
    const doc = await lookbookService.updateHotspot(
      String(req.params.id),
      imageId,
      String(req.params.hotspotId),
      parsed.data
    );
    res.json(doc);
  } catch (e) {
    next(e);
  }
}

export async function deleteLookbookHotspot(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const imageId = String(req.query.imageId ?? req.body?.imageId ?? "");
    if (!imageId) throw new AppError(400, "imageId required");
    const doc = await lookbookService.deleteHotspot(
      String(req.params.id),
      imageId,
      String(req.params.hotspotId)
    );
    res.json(doc);
  } catch (e) {
    next(e);
  }
}

export async function duplicateLookbook(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const doc = await lookbookService.duplicateLookbook(String(req.params.id));
    res.status(201).json(doc);
  } catch (e) {
    next(e);
  }
}
