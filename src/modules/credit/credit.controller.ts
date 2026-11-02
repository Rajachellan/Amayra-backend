import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../utils/AppError.js";
import {
  validateStoreCreditCoupon,
  getCustomerStoreCredits,
  listCreditNotesAdmin,
  getCreditNoteDetailsAdmin,
  cancelCreditNote,
  revertCreditNote,
  reactivateCreditNote,
  issueManualCreditNote,
  lookupOrderForCreditNote,
} from "./credit.service.js";
import { CreditNote } from "./creditNote.model.js";
import { generateCreditNotePdf } from "./creditNotePdf.js";
import { sendEmail, buildCreditNoteIssuedEmail } from "../../services/emailService.js";

/**
 * Customer: Validate a store credit coupon code for checkout.
 */
export async function postValidateCreditCoupon(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const customerId = (req as Request & { customerId?: string }).customerId;
    if (!customerId) throw new AppError(401, "Customer unauthorized");

    const { code } = req.body as { code?: string };
    if (!code) throw new AppError(400, "Coupon code is required");

    const result = await validateStoreCreditCoupon({ code, customerId });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * Customer: View all store credits and transaction ledger.
 */
export async function getMyStoreCredits(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const customerId = (req as Request & { customerId?: string }).customerId;
    if (!customerId) throw new AppError(401, "Customer unauthorized");

    const data = await getCustomerStoreCredits(customerId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

/**
 * Admin: List credit notes with filtering and pagination.
 */
export async function getCreditNotesAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await listCreditNotesAdmin(req.query as any);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * Admin: View single credit note details and financial ledger.
 */
export async function getCreditNoteDetailsAdminHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params.id as string;
    const data = await getCreditNoteDetailsAdmin(id);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

/**
 * Admin: Download credit note as branded PDF.
 */
export async function downloadCreditNotePdfHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params.id as string;
    const creditNote = await CreditNote.findById(id);
    if (!creditNote) throw new AppError(404, "Credit Note not found");

    const pdfBuffer = generateCreditNotePdf(creditNote);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${creditNote.creditNoteNumber}.pdf"`
    );
    res.setHeader("Content-Length", pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
}

/**
 * Admin: Resend credit note issuance email notification.
 */
export async function resendCreditNoteEmailHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params.id as string;
    const creditNote = await CreditNote.findById(id);
    if (!creditNote) throw new AppError(404, "Credit Note not found");

    await sendEmail({
      to: creditNote.customerEmail,
      subject: `[Re-sent] Your Credit Note & Store Credit (${creditNote.creditNoteNumber}) – Mairii Jewels`,
      html: buildCreditNoteIssuedEmail({
        customerName: creditNote.customerName,
        creditNoteNumber: creditNote.creditNoteNumber,
        couponCode: creditNote.couponCode,
        amount: creditNote.issuedCreditAmount,
        issueDate: creditNote.issuedDate,
        expiryDate: creditNote.expiryDate,
      }),
    });

    res.json({ ok: true, message: "Credit Note notification resent successfully" });
  } catch (err) {
    next(err);
  }
}

/**
 * Admin: Cancel unused store credit on a credit note.
 */
export async function cancelCreditNoteAdminHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = (req as any).adminId;
    if (!adminId) throw new AppError(401, "Admin unauthorized");

    const id = req.params.id as string;
    const { reason } = req.body as { reason?: string };
    if (!reason || !reason.trim()) {
      throw new AppError(400, "Mandatory cancellation reason is required");
    }

    const result = await cancelCreditNote({
      creditNoteId: id,
      reason: reason.trim(),
      adminId,
    });

    res.json({
      ok: true,
      message: "Credit note cancelled successfully",
      creditNote: result.creditNote,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Admin: Revert a credit note (alias to cancel / revoke credit).
 */
export async function revertCreditNoteAdminHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = (req as any).adminId;
    if (!adminId) throw new AppError(401, "Admin unauthorized");

    const id = req.params.id as string;
    const { reason } = req.body as { reason?: string };
    if (!reason || !reason.trim()) {
      throw new AppError(400, "Mandatory reversal reason is required");
    }

    const result = await revertCreditNote({
      creditNoteId: id,
      reason: reason.trim(),
      adminId,
    });

    res.json({
      ok: true,
      message: "Credit note reverted successfully",
      creditNote: result.creditNote,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Admin: Revert cancellation / reactivate a credit note.
 */
export async function reactivateCreditNoteAdminHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = (req as any).adminId;
    if (!adminId) throw new AppError(401, "Admin unauthorized");

    const id = req.params.id as string;
    const { reason } = req.body as { reason?: string };
    if (!reason || !reason.trim()) {
      throw new AppError(400, "Mandatory reactivation reason is required");
    }

    const result = await reactivateCreditNote({
      creditNoteId: id,
      reason: reason.trim(),
      adminId,
    });

    res.json({
      ok: true,
      message: "Credit note reactivated successfully",
      creditNote: result.creditNote,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Admin: Issue a manual credit note for damaged / defective products or customer compensation.
 */
export async function postIssueManualCreditNote(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminId = (req as any).adminId;
    const adminName = (req as any).adminName || "Admin";
    if (!adminId) throw new AppError(401, "Admin unauthorized");

    const { orderId, selectedItems, amount, issueReason, adminNotes } = req.body as {
      orderId?: string;
      selectedItems?: any[];
      amount?: number;
      issueReason?: string;
      adminNotes?: string;
    };

    if (!orderId) throw new AppError(400, "Order ID is required");
    if (!selectedItems || !Array.isArray(selectedItems) || selectedItems.length === 0) {
      throw new AppError(400, "At least one product item must be selected");
    }
    if (!issueReason || !issueReason.trim()) {
      throw new AppError(
        400,
        "Issue reason is required (e.g. Damaged in Transit, Defective, etc.)"
      );
    }

    const result = await issueManualCreditNote({
      orderId,
      selectedItems,
      amount,
      issueReason,
      adminNotes,
      adminId,
      adminName,
    });

    res.status(201).json({
      success: true,
      message: `Manual credit note ${result.creditNote.creditNoteNumber} issued successfully`,
      data: {
        creditNote: result.creditNote,
        storeCredit: result.storeCredit,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Admin: Search / lookup order details and items for manual credit note issuance.
 */
export async function getOrderForCreditNote(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = (req.query.q as string) || (req.params.id as string);
    if (!query) throw new AppError(400, "Order ID or query is required");

    const order = await lookupOrderForCreditNote(query);
    res.json({
      success: true,
      data: order,
    });
  } catch (err) {
    next(err);
  }
}
