import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../utils/AppError.js";
import * as returnService from "./return.service.js";
import { Return } from "./model.js";

/**
 * Customer creates a return request.
 */
export async function postCreateReturnRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const customerId = (req as any).customerId;
    if (!customerId) throw new AppError(401, "Unauthorized");

    const { orderId, items, reason, description } = req.body as {
      orderId?: string;
      items?: { product: string; quantity: number }[];
      reason?: any;
      description?: string;
    };

    if (!orderId || !items?.length || !reason) {
      throw new AppError(400, "orderId, items, and reason are required");
    }

    const returnDoc = await returnService.createReturnRequest({
      customerId,
      orderId,
      items,
      reason,
      description,
    });

    res.status(201).json(returnDoc);
  } catch (e) {
    next(e);
  }
}

/**
 * List returns. Admin sees all, customer sees only their own.
 */
export async function getReturnList(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = (req as any).adminId;
    const customerId = (req as any).customerId;

    const filter: Record<string, any> = {};
    if (!adminId) {
      if (!customerId) throw new AppError(401, "Unauthorized");
      filter.customerId = customerId;
    }

    const items = await Return.find(filter)
      .sort({ createdAt: -1 })
      .populate("orderId", "orderNumber total")
      .populate("customerId", "name email");

    res.json({ items });
  } catch (e) {
    next(e);
  }
}

/**
 * Get return details by ID.
 */
export async function getReturnById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const adminId = (req as any).adminId;
    const customerId = (req as any).customerId;

    const returnDoc = await Return.findById(id)
      .populate("orderId")
      .populate("customerId", "name email phone");
    if (!returnDoc) throw new AppError(404, "Return request not found");

    if (!adminId && returnDoc.customerId.toString() !== customerId) {
      throw new AppError(403, "You do not own this return record");
    }

    res.json(returnDoc);
  } catch (e) {
    next(e);
  }
}

/**
 * Admin approves return request.
 */
export async function postApproveReturn(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = (req as any).adminId;
    if (!adminId) throw new AppError(401, "Unauthorized");

    const id = req.params.id as string;
    const returnDoc = await returnService.approveReturn(id, adminId);
    res.json(returnDoc);
  } catch (e) {
    next(e);
  }
}

/**
 * Admin rejects return request.
 */
export async function postRejectReturn(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = (req as any).adminId;
    if (!adminId) throw new AppError(401, "Unauthorized");

    const id = req.params.id as string;
    const { comment: _comment } = req.body as { comment?: string };

    const returnDoc = await returnService.rejectReturn(id, adminId);
    res.json(returnDoc);
  } catch (e) {
    next(e);
  }
}

/**
 * Admin marks returned package as physically received.
 */
export async function postReceiveReturn(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = (req as any).adminId;
    if (!adminId) throw new AppError(401, "Unauthorized");

    const id = req.params.id as string;
    const returnDoc = await returnService.receiveReturn(id, adminId);
    res.json(returnDoc);
  } catch (e) {
    next(e);
  }
}

/**
 * Admin performs inspection / quality check.
 */
export async function postInspectReturn(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = (req as any).adminId;
    if (!adminId) throw new AppError(401, "Unauthorized");

    const id = req.params.id as string;
    const { condition, result, comment } = req.body as {
      condition?: any;
      result?: any;
      comment?: string;
    };

    if (!condition || !result) {
      throw new AppError(400, "condition and result are required");
    }

    const returnDoc = await returnService.inspectReturn(
      id,
      { condition, result, comment },
      adminId
    );
    res.json(returnDoc);
  } catch (e) {
    next(e);
  }
}

/**
 * Admin triggers refund processing.
 */
export async function postRefundReturn(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = (req as any).adminId;
    if (!adminId) throw new AppError(401, "Unauthorized");

    const id = req.params.id as string;
    const { refundMethod, refundAccountReference } = req.body as {
      refundMethod?: any;
      refundAccountReference?: string;
    };

    const returnDoc = await returnService.refundReturn(
      id,
      { refundMethod, refundAccountReference },
      adminId
    );
    res.json(returnDoc);
  } catch (e) {
    next(e);
  }
}
