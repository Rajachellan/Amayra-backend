import crypto from "crypto";
import mongoose from "mongoose";
import { AppError } from "../../utils/AppError.js";
import { logger } from "../../config/logger.js";
import { Customer } from "../../models/Customer.js";
import { Order } from "../order/model.js";
import { Return } from "../return/model.js";
import { transitionReturnStatus } from "../return/statemachine.service.js";
import { CreditNote, type CreditNoteDoc, CREDIT_NOTE_STATUS_VALUES } from "./creditNote.model.js";
import { StoreCredit, type StoreCreditDoc } from "./model.js";
import { StoreCreditTransaction, type StoreCreditTransactionDoc } from "./transaction.model.js";
import {
  sendEmail,
  buildCreditNoteIssuedEmail,
  buildCreditRedeemedEmail,
  buildCreditCancelledEmail,
  buildCreditExpiredEmail,
  buildCreditExpiryReminderEmail,
} from "../../services/emailService.js";

/**
 * Credit note validity must be strictly THREE MONTHS (90 DAYS) from issuance date.
 * Expiry date is calculated automatically to the end of the 90th day.
 */
export function calculateExpiryDate(issuedDate: Date = new Date()): Date {
  const expiry = new Date(issuedDate.getTime());
  expiry.setDate(expiry.getDate() + 90);
  expiry.setHours(23, 59, 59, 999);
  return expiry;
}

/**
 * Generate a unique sequential credit note number: CN-YYYY-XXXXXX
 * e.g., CN-2026-000001
 */
export async function generateCreditNoteNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `CN-${year}-`;

  const latest = await CreditNote.findOne({
    creditNoteNumber: new RegExp(`^${prefix}`),
  })
    .sort({ creditNoteNumber: -1 })
    .select("creditNoteNumber")
    .lean();

  let nextSeq = 1;
  if (latest && latest.creditNoteNumber) {
    const parts = latest.creditNoteNumber.split("-");
    const num = parseInt(parts[2], 10);
    if (!isNaN(num)) {
      nextSeq = num + 1;
    }
  }

  return `${prefix}${String(nextSeq).padStart(6, "0")}`;
}

/**
 * Generate a secure, unpredictable coupon code for store credit redemption.
 * e.g., SC-A8F2-E93C
 */
export function generateSecureCouponCode(): string {
  const randomPart1 = crypto.randomBytes(2).toString("hex").toUpperCase();
  const randomPart2 = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `SC-${randomPart1}-${randomPart2}`;
}

let creditCollectionsReadyPromise: Promise<void> | null = null;

/**
 * Ensures CreditNote, StoreCredit, and StoreCreditTransaction collections & indexes exist
 * outside of multi-document transactions (preventing MongoDB Error 263 on Atlas Shared Tier)
 * and drops any legacy/stale unique indexes (e.g. code_1, non-sparse returnRequestId_1).
 */
export async function ensureCreditCollectionsAndIndexes(force = false): Promise<void> {
  if (creditCollectionsReadyPromise && !force) {
    return creditCollectionsReadyPromise;
  }

  creditCollectionsReadyPromise = (async () => {
    await CreditNote.createCollection().catch(() => {});
    await StoreCredit.createCollection().catch(() => {});
    await StoreCreditTransaction.createCollection().catch(() => {});

    // Unset explicit null returnRequestId values so sparse indexes ignore manual credit notes
    await CreditNote.collection
      .updateMany({ returnRequestId: null }, { $unset: { returnRequestId: "" } })
      .catch(() => {});
    await StoreCredit.collection
      .updateMany({ returnRequestId: null }, { $unset: { returnRequestId: "" } })
      .catch(() => {});

    const cnIndexes = await CreditNote.collection.indexes().catch(() => []);
    for (const idx of cnIndexes) {
      if (!idx.name || idx.name === "_id_") continue;
      const hasLegacyField = Boolean(idx.key && ("code" in idx.key || "returnId" in idx.key));
      const isUnexpectedUnique =
        Boolean(idx.unique) && idx.name !== "creditNoteNumber_1" && idx.name !== "couponCode_1";
      const isNonSparseReturnReq = idx.name === "returnRequestId_1" && !idx.sparse;

      if (hasLegacyField || isUnexpectedUnique || isNonSparseReturnReq) {
        await CreditNote.collection
          .dropIndex(idx.name)
          .then(() =>
            logger.info(`[CreditMigration] Dropped stale index ${idx.name} on creditnotes`)
          )
          .catch((e) =>
            logger.warn({ err: e }, `[CreditMigration] Could not drop index ${idx.name}`)
          );
      }
    }

    const scIndexes = await StoreCredit.collection.indexes().catch(() => []);
    for (const idx of scIndexes) {
      if (!idx.name || idx.name === "_id_") continue;
      const hasLegacyField = Boolean(idx.key && ("code" in idx.key || "returnId" in idx.key));
      const isUnexpectedUnique =
        Boolean(idx.unique) && idx.name !== "creditCode_1" && idx.name !== "couponCode_1";
      const isNonSparseReturnReq = idx.name === "returnRequestId_1" && !idx.sparse;

      if (hasLegacyField || isUnexpectedUnique || isNonSparseReturnReq) {
        await StoreCredit.collection
          .dropIndex(idx.name)
          .then(() =>
            logger.info(`[CreditMigration] Dropped stale index ${idx.name} on storecredits`)
          )
          .catch((e) =>
            logger.warn({ err: e }, `[CreditMigration] Could not drop index ${idx.name}`)
          );
      }
    }

    await CreditNote.createIndexes().catch((e) =>
      logger.warn({ err: e }, "[CreditMigration] CreditNote.createIndexes warning")
    );
    await StoreCredit.createIndexes().catch((e) =>
      logger.warn({ err: e }, "[CreditMigration] StoreCredit.createIndexes warning")
    );
    await StoreCreditTransaction.createIndexes().catch((e) =>
      logger.warn({ err: e }, "[CreditMigration] StoreCreditTransaction.createIndexes warning")
    );
  })().catch((err) => {
    creditCollectionsReadyPromise = null;
    logger.warn({ err }, "[CreditMigration] ensureCreditCollectionsAndIndexes warning");
  });

  return creditCollectionsReadyPromise;
}

function isTransientCreditTxError(err: any): boolean {
  if (!err) return false;
  if (typeof err.hasErrorLabel === "function" && err.hasErrorLabel("TransientTransactionError")) {
    return true;
  }
  return err.code === 112 || err.codeName === "WriteConflict";
}

function isUnsupportedTxError(err: any): boolean {
  if (!err) return false;
  return (
    err.code === 263 ||
    err.code === 20 ||
    err.codeName === "OperationNotSupportedInTransaction" ||
    err.codeName === "IllegalOperation"
  );
}

/**
 * Issue Credit Note and Store Credit for a Return settlement.
 * Strict validation: 90 days validity, duplicate check, atomic transaction ledger.
 */
export async function issueCreditNoteForReturn(args: {
  returnId: string;
  adminId: string;
}): Promise<{ creditNote: CreditNoteDoc; storeCredit: StoreCreditDoc }> {
  const { returnId, adminId } = args;

  await ensureCreditCollectionsAndIndexes();

  const returnDoc = await Return.findById(returnId);
  if (!returnDoc) throw new AppError(404, "Return request not found");

  if (returnDoc.status !== "QC_APPROVED" && returnDoc.status !== "SETTLEMENT_PROCESSING") {
    throw new AppError(
      400,
      `Store credit cannot be issued in current status: ${returnDoc.status}. Return must be QC_APPROVED.`
    );
  }

  // Prevent duplicate credit note issuance for the same return settlement
  if (returnDoc.settlementDetails?.creditNoteId || returnDoc.settlementDetails?.storeCreditId) {
    throw new AppError(400, "Store Credit / Credit Note has already been issued for this return");
  }

  const existingCN = await CreditNote.findOne({ returnRequestId: returnDoc._id });
  if (existingCN) {
    throw new AppError(
      400,
      `Credit note ${existingCN.creditNoteNumber} already issued for this return`
    );
  }

  const order = await Order.findById(returnDoc.orderId);
  if (!order) throw new AppError(404, "Associated original order not found");

  const customer = await Customer.findById(returnDoc.customerId);
  if (!customer) throw new AppError(404, "Customer associated with return not found");

  const amount = returnDoc.settlementDetails?.settlementAmount || 0;
  if (amount <= 0) throw new AppError(400, "Settlement amount must be greater than 0");

  const issuedDate = new Date();
  const expiryDate = calculateExpiryDate(issuedDate);
  const creditNoteNumber = await generateCreditNoteNumber();
  const couponCode = generateSecureCouponCode();

  const returnedProductDetails = returnDoc.items.map((it) => ({
    productId: it.product,
    name: it.name,
    sku: it.sku || "",
    size: it.size || "",
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    totalAmount: it.quantity * it.unitPrice,
  }));

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const [creditNote] = await CreditNote.create(
      [
        {
          creditNoteNumber,
          customerId: customer._id,
          customerName: customer.name || "Customer",
          customerEmail: customer.email.toLowerCase(),
          originalOrderId: order._id,
          originalOrderNumber: order.orderNumber,
          returnRequestId: returnDoc._id,
          returnRequestNumber: returnDoc.returnNumber,
          returnedProductDetails,
          issuedCreditAmount: amount,
          couponCode,
          issuedDate,
          expiryDate,
          redeemedAmount: 0,
          remainingBalance: amount,
          settlementStatus: "SETTLED",
          status: "ACTIVE",
          qcNotes: returnDoc.qcDetails?.qcNotes || "",
        },
      ],
      { session }
    );

    const [storeCredit] = await StoreCredit.create(
      [
        {
          creditCode: couponCode,
          couponCode,
          customerId: customer._id,
          creditNoteId: creditNote._id,
          originalOrderId: order._id,
          returnRequestId: returnDoc._id,
          initialBalance: amount,
          availableBalance: amount,
          reservedBalance: 0,
          redeemedAmount: 0,
          issuedDate,
          expiryDate,
          status: "ACTIVE",
        },
      ],
      { session }
    );

    // Record immutable financial ledger entry: CREDIT_ISSUED
    await StoreCreditTransaction.create(
      [
        {
          storeCreditId: storeCredit._id,
          creditNoteId: creditNote._id,
          customerId: customer._id,
          transactionType: "CREDIT_ISSUED",
          amount,
          balanceBefore: 0,
          balanceAfter: amount,
          reservedBalanceBefore: 0,
          reservedBalanceAfter: 0,
          transactionDate: issuedDate,
          description: `Issued Credit Note ${creditNoteNumber} for Return ${returnDoc.returnNumber} (Validity 90 Days)`,
          performedBy: {
            id:
              adminId && mongoose.isValidObjectId(adminId)
                ? new mongoose.Types.ObjectId(adminId)
                : undefined,
            role: "ADMIN",
            name: "Admin",
          },
          metadata: {
            creditNoteNumber,
            couponCode,
            orderNumber: order.orderNumber,
            returnNumber: returnDoc.returnNumber,
            expiryDate,
          },
        },
      ],
      { session }
    );

    // Update Return settlement details
    returnDoc.settlementDetails = {
      settlementType: "STORE_CREDIT",
      storeCreditId: storeCredit._id as any,
      creditNoteId: creditNote._id as any,
      settlementAmount: amount,
      refundMethod: order.paymentMethod === "COD" ? "BANK" : "RAZORPAY",
      processedAt: new Date(),
    };

    await returnDoc.save({ session });

    await transitionReturnStatus({
      returnId: returnDoc._id,
      targetStatus: "REFUND_ISSUED",
      changedBy: adminId,
      changedByRole: "ADMIN",
      notes: `Issued Credit Note ${creditNoteNumber} (Code: ${couponCode}) of ₹${amount}`,
      session,
    });

    await transitionReturnStatus({
      returnId: returnDoc._id,
      targetStatus: "COMPLETED",
      changedBy: adminId,
      changedByRole: "ADMIN",
      notes: `Return settled via Credit Note ${creditNoteNumber}`,
      session,
    });

    order.returnStatus = "COMPLETED";
    order.refundStatus = "COMPLETED";
    await order.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Send email notification outside transaction
    void sendEmail({
      to: customer.email,
      subject: `Your Credit Note & Store Credit (${creditNoteNumber}) – Mairii Jewels`,
      html: buildCreditNoteIssuedEmail({
        customerName: customer.name || "Valued Customer",
        creditNoteNumber,
        couponCode,
        amount,
        issueDate: issuedDate,
        expiryDate,
      }),
    }).catch((err) => {
      logger.error({ err, creditNoteNumber }, "Failed to send Credit Note issuance email");
    });

    return { creditNote, storeCredit };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}

export type ManualCreditProductItem = {
  productId?: string;
  name: string;
  sku?: string;
  size?: string;
  quantity: number;
  unitPrice: number;
};

/**
 * Manually issue a Store Credit / Credit Note for an order
 * (e.g. for damaged product in transit, defect, customer compensation, without return flow).
 * Strictly valid for 90 DAYS (3 Months) from issuance date.
 */
export async function issueManualCreditNote(args: {
  orderId: string;
  selectedItems: ManualCreditProductItem[];
  amount?: number;
  issueReason: string;
  adminNotes?: string;
  adminId: string;
  adminName?: string;
}): Promise<{ creditNote: CreditNoteDoc; storeCredit: StoreCreditDoc }> {
  const { orderId, selectedItems, issueReason, adminNotes, adminId, adminName } = args;

  if (!orderId) throw new AppError(400, "Order ID is required");
  if (!selectedItems || !Array.isArray(selectedItems) || selectedItems.length === 0) {
    throw new AppError(400, "At least one product item must be selected for credit note issuance");
  }
  if (!issueReason || !issueReason.trim()) {
    throw new AppError(400, "Issue reason is mandatory (e.g. Damaged in Transit, Defective, etc.)");
  }

  await ensureCreditCollectionsAndIndexes();

  // Find order by ID or orderNumber
  const trimmedOrderRef = String(orderId).trim();
  let orderQuery: any = { orderNumber: trimmedOrderRef };
  if (mongoose.isValidObjectId(trimmedOrderRef)) {
    orderQuery = {
      $or: [
        { _id: new mongoose.Types.ObjectId(trimmedOrderRef) },
        { orderNumber: trimmedOrderRef },
      ],
    };
  }
  const order = await Order.findOne(orderQuery);
  if (!order) throw new AppError(404, `Order '${trimmedOrderRef}' not found`);

  // Find customer safely (handling ObjectId or populated object)
  const rawCustomerId =
    order.customer && typeof order.customer === "object" && "_id" in (order.customer as any)
      ? (order.customer as any)._id
      : order.customer;
  const customer = rawCustomerId ? await Customer.findById(rawCustomerId) : null;
  const customerId = customer?._id || rawCustomerId;
  if (!customerId) {
    throw new AppError(400, "Order has no associated customer account to issue store credit");
  }
  const customerName =
    customer?.name?.trim() || order.shippingAddress?.fullName?.trim() || "Valued Customer";
  const emailToNotify = (customer?.email || "").trim().toLowerCase();

  // Calculate settlement amount
  let calculatedAmount = 0;
  const returnedProductDetails = selectedItems.map((it) => {
    const qty = Math.max(1, Number(it.quantity) || 1);
    const price = Math.max(0, Number(it.unitPrice) || 0);
    const itemTotal = qty * price;
    calculatedAmount += itemTotal;
    const rawPid =
      it.productId && typeof it.productId === "object" && "_id" in (it.productId as any)
        ? String((it.productId as any)._id)
        : it.productId
          ? String(it.productId).trim()
          : "";
    return {
      productId:
        rawPid && mongoose.isValidObjectId(rawPid)
          ? new mongoose.Types.ObjectId(rawPid)
          : undefined,
      name: (it.name && String(it.name).trim()) || "Product",
      sku: it.sku ? String(it.sku).trim() : "",
      size: it.size ? String(it.size).trim() : "",
      quantity: qty,
      unitPrice: price,
      totalAmount: itemTotal,
    };
  });

  const requestedAmount = args.amount != null ? Number(args.amount) : NaN;
  const finalAmount =
    Number.isFinite(requestedAmount) && requestedAmount > 0 ? requestedAmount : calculatedAmount;
  if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
    throw new AppError(400, "Issued credit amount must be greater than 0");
  }

  const issuedDate = new Date();
  const expiryDate = calculateExpiryDate(issuedDate);
  const adminObjId =
    adminId && mongoose.isValidObjectId(adminId) ? new mongoose.Types.ObjectId(adminId) : undefined;

  const persistManualCreditDocs = async (
    session: mongoose.ClientSession | undefined,
    creditNoteNumber: string,
    couponCode: string
  ): Promise<{ creditNote: CreditNoteDoc; storeCredit: StoreCreditDoc }> => {
    const sessionOpts = session ? { session } : undefined;

    const [creditNote] = await CreditNote.create(
      [
        {
          creditNoteNumber,
          customerId,
          customerName,
          customerEmail: emailToNotify,
          originalOrderId: order._id,
          originalOrderNumber: order.orderNumber,
          returnRequestNumber: `MANUAL-${creditNoteNumber}`,
          returnedProductDetails,
          issuedCreditAmount: finalAmount,
          couponCode,
          issuedDate,
          expiryDate,
          redeemedAmount: 0,
          remainingBalance: finalAmount,
          settlementStatus: "SETTLED",
          status: "ACTIVE",
          issueType: "MANUAL_ISSUE",
          issueReason: issueReason.trim(),
          adminNotes: adminNotes?.trim() || "",
          qcNotes: adminNotes?.trim()
            ? `Manual Claim [${issueReason.trim()}]: ${adminNotes.trim()}`
            : `Manual Claim: ${issueReason.trim()}`,
        },
      ],
      sessionOpts
    );

    try {
      const [storeCredit] = await StoreCredit.create(
        [
          {
            creditCode: couponCode,
            couponCode,
            customerId,
            creditNoteId: creditNote._id,
            originalOrderId: order._id,
            initialBalance: finalAmount,
            availableBalance: finalAmount,
            originalAmount: finalAmount,
            remainingBalance: finalAmount,
            reservedBalance: 0,
            redeemedAmount: 0,
            issuedDate,
            expiryDate,
            status: "ACTIVE",
          },
        ],
        sessionOpts
      );

      try {
        await StoreCreditTransaction.create(
          [
            {
              storeCreditId: storeCredit._id,
              creditNoteId: creditNote._id,
              customerId,
              transactionType: "CREDIT_ISSUED",
              amount: finalAmount,
              orderId: order._id,
              orderNumber: order.orderNumber,
              balanceBefore: 0,
              balanceAfter: finalAmount,
              reservedBalanceBefore: 0,
              reservedBalanceAfter: 0,
              transactionDate: issuedDate,
              description: `Manual Credit Note ${creditNoteNumber} issued for Order ${order.orderNumber} (Reason: ${issueReason.trim()}, Validity 90 Days)`,
              performedBy: {
                id: adminObjId,
                role: "ADMIN",
                name: adminName || "Admin",
              },
              metadata: {
                creditNoteNumber,
                couponCode,
                orderNumber: order.orderNumber,
                issueReason: issueReason.trim(),
                expiryDate,
                manual: true,
              },
            },
          ],
          sessionOpts
        );
      } catch (txCreateErr) {
        if (!session) {
          await StoreCredit.deleteOne({ _id: storeCredit._id }).catch(() => {});
          await CreditNote.deleteOne({ _id: creditNote._id }).catch(() => {});
        }
        throw txCreateErr;
      }

      return { creditNote, storeCredit };
    } catch (scCreateErr) {
      if (!session) {
        await CreditNote.deleteOne({ _id: creditNote._id }).catch(() => {});
      }
      throw scCreateErr;
    }
  };

  let createdResult: { creditNote: CreditNoteDoc; storeCredit: StoreCreditDoc } | null = null;
  let useTransactions = true;
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const creditNoteNumber = await generateCreditNoteNumber();
    const couponCode = generateSecureCouponCode();

    if (!useTransactions) {
      createdResult = await persistManualCreditDocs(undefined, creditNoteNumber, couponCode);
      break;
    }

    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      createdResult = await persistManualCreditDocs(session, creditNoteNumber, couponCode);
      await session.commitTransaction();
      session.endSession();
      break;
    } catch (err: any) {
      await session.abortTransaction().catch(() => {});
      session.endSession();

      if (isUnsupportedTxError(err)) {
        logger.warn(
          { err: err?.message, code: err?.code },
          "[ManualCreditNote] Multi-document transaction unsupported for namespace/deployment; ensuring collections and retrying safely"
        );
        await ensureCreditCollectionsAndIndexes(true);
        useTransactions = false;
        if (attempt === maxAttempts) {
          createdResult = await persistManualCreditDocs(undefined, creditNoteNumber, couponCode);
          break;
        }
        continue;
      }

      if (err?.code === 11000 && attempt < maxAttempts) {
        logger.warn(
          { err: err?.message, attempt },
          "[ManualCreditNote] Duplicate key encountered; refreshing credit indexes and retrying..."
        );
        await ensureCreditCollectionsAndIndexes(true);
        continue;
      }

      if (isTransientCreditTxError(err) && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 60 * attempt));
        continue;
      }

      logger.error(
        { err, orderId: trimmedOrderRef, orderNumber: order.orderNumber },
        "[ManualCreditNote] Failed to issue manual credit note"
      );
      throw err;
    }
  }

  if (!createdResult) {
    throw new AppError(500, "Failed to generate manual credit note");
  }

  const { creditNote, storeCredit } = createdResult;

  // Send email notification outside transaction if email exists
  if (emailToNotify) {
    try {
      const html = buildCreditNoteIssuedEmail({
        customerName,
        creditNoteNumber: creditNote.creditNoteNumber,
        couponCode: creditNote.couponCode,
        amount: finalAmount,
        issueDate: issuedDate,
        expiryDate,
      });
      void sendEmail({
        to: emailToNotify,
        subject: `Your Credit Note & Store Credit (${creditNote.creditNoteNumber}) – Mairii Jewels`,
        html,
      }).catch((err) => {
        logger.error(
          { err, creditNoteNumber: creditNote.creditNoteNumber },
          "Failed to send manual Credit Note email"
        );
      });
    } catch (emailBuildErr) {
      logger.error({ err: emailBuildErr }, "Failed building manual Credit Note email");
    }
  }

  return { creditNote, storeCredit };
}

/**
 * Lookup an order and its items for manual credit note issuance.
 */
export async function lookupOrderForCreditNote(query: string): Promise<any> {
  const q = (query || "").trim();
  if (!q) throw new AppError(400, "Search query is required");

  let order: any = null;
  if (mongoose.isValidObjectId(q)) {
    order = await Order.findById(q).populate("customer", "name email phone");
  }

  if (!order) {
    order = await Order.findOne({ orderNumber: new RegExp(`^${q}$`, "i") }).populate(
      "customer",
      "name email phone"
    );
  }

  if (!order) {
    order = await Order.findOne({ orderNumber: new RegExp(q, "i") }).populate(
      "customer",
      "name email phone"
    );
  }

  // Also support looking up by customer email, name or phone
  if (!order) {
    try {
      const Customer = mongoose.models.Customer || mongoose.model("Customer");
      const matchingCustomer = await Customer.findOne({
        $or: [
          { email: new RegExp(q, "i") },
          { name: new RegExp(q, "i") },
          { phone: new RegExp(q, "i") },
        ],
      });
      if (matchingCustomer) {
        order = await Order.findOne({ customer: matchingCustomer._id })
          .sort({ createdAt: -1 })
          .populate("customer", "name email phone");
      }
    } catch {
      // ignore
    }
  }

  if (!order) {
    order = await Order.findOne({
      $or: [
        { "shippingAddress.fullName": new RegExp(q, "i") },
        { "shippingAddress.phone": new RegExp(q, "i") },
      ],
    })
      .sort({ createdAt: -1 })
      .populate("customer", "name email phone");
  }

  if (!order) {
    throw new AppError(404, `No order found matching '${q}'`);
  }

  return {
    _id: order._id,
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    total: order.total,
    status: order.status,
    customer: order.customer || {
      name: order.shippingAddress?.fullName || "Customer",
      email: "",
      phone: order.shippingAddress?.phone || "",
    },
    shippingAddress: order.shippingAddress,
    items: order.items.map((it: any) => ({
      productId: it.product,
      name: it.name,
      slug: it.slug,
      sku: it.sku,
      unitPrice: it.unitPrice,
      quantity: it.quantity,
      lineTotal: it.lineTotal,
      image: it.image,
      size: it.size,
    })),
  };
}

/**
 * Customer validates a store credit coupon code at checkout.
 * Verifies code authenticity, customer ownership, 90-day expiry and available balance.
 */
export async function validateStoreCreditCoupon(args: {
  code: string;
  customerId: string;
}): Promise<{
  valid: boolean;
  couponCode: string;
  availableBalance: number;
  initialBalance: number;
  expiryDate: Date;
  creditNoteNumber?: string;
}> {
  const code = (args.code || "").trim().toUpperCase();
  if (!code) throw new AppError(400, "Coupon code is required");

  const credit = await StoreCredit.findOne({
    $or: [{ couponCode: code }, { creditCode: code }],
  }).populate<{ creditNoteId: CreditNoteDoc }>("creditNoteId");

  if (!credit) {
    throw new AppError(404, "Store credit code not found");
  }

  // Security: Customer can redeem ONLY their own credit
  if (credit.customerId.toString() !== args.customerId) {
    throw new AppError(403, "This store credit does not belong to your account");
  }

  const now = new Date();

  // Check 90-day expiry
  if (credit.expiryDate.getTime() <= now.getTime() || credit.status === "EXPIRED") {
    if (credit.status !== "EXPIRED") {
      await autoExpireStoreCredit(credit._id.toString());
    }
    throw new AppError(400, "This store credit has expired and can no longer be redeemed");
  }

  if (credit.status === "CANCELLED") {
    throw new AppError(400, "This store credit has been cancelled");
  }

  if (credit.status === "EXHAUSTED" || credit.availableBalance <= 0) {
    throw new AppError(400, "This store credit has already been completely redeemed");
  }

  return {
    valid: true,
    couponCode: credit.couponCode,
    availableBalance: credit.availableBalance,
    initialBalance: credit.initialBalance,
    expiryDate: credit.expiryDate,
    creditNoteNumber: credit.creditNoteId?.creditNoteNumber,
  };
}

/**
 * Reserve store credit during checkout.
 * Deducts from availableBalance, adds to reservedBalance atomically.
 */
export async function reserveStoreCredits(args: {
  customerId: string;
  orderId: mongoose.Types.ObjectId;
  creditCodes: string[];
  requiredAmount: number;
  session?: mongoose.ClientSession;
}): Promise<{
  totalReserved: number;
  reservations: Array<{
    storeCreditId: mongoose.Types.ObjectId;
    creditNoteId: mongoose.Types.ObjectId;
    code: string;
    amount: number;
  }>;
}> {
  const { customerId, orderId, creditCodes, requiredAmount, session } = args;
  const uniqueCodes = [...new Set(creditCodes.map((c) => c.trim().toUpperCase()))].filter(Boolean);

  if (!uniqueCodes.length || requiredAmount <= 0) {
    return { totalReserved: 0, reservations: [] };
  }

  let remainingNeeded = requiredAmount;
  const reservations: Array<{
    storeCreditId: mongoose.Types.ObjectId;
    creditNoteId: mongoose.Types.ObjectId;
    code: string;
    amount: number;
  }> = [];

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 minute reservation window

  for (const code of uniqueCodes) {
    if (remainingNeeded <= 0) break;

    // Atomic find & update with balance check preventing concurrency / race conditions
    const credit = await StoreCredit.findOne({
      $or: [{ couponCode: code }, { creditCode: code }],
      customerId: new mongoose.Types.ObjectId(customerId),
      status: { $in: ["ACTIVE", "PARTIALLY_REDEEMED"] },
      expiryDate: { $gt: now },
      availableBalance: { $gt: 0 },
    }).session(session ?? null);

    if (!credit) continue;

    const allocAmount = Math.min(credit.availableBalance, remainingNeeded);
    if (allocAmount <= 0) continue;

    const balanceBefore = credit.availableBalance;
    const reservedBefore = credit.reservedBalance;

    const updated = await StoreCredit.findOneAndUpdate(
      {
        _id: credit._id,
        availableBalance: { $gte: allocAmount },
      },
      {
        $inc: {
          availableBalance: -allocAmount,
          reservedBalance: allocAmount,
        },
        $push: {
          reservations: {
            orderId,
            amount: allocAmount,
            reservedAt: now,
            expiresAt,
          },
        },
      },
      { new: true, session }
    );

    if (!updated) {
      // Concurrently claimed by another request, skip or continue
      continue;
    }

    reservations.push({
      storeCreditId: updated._id,
      creditNoteId: updated.creditNoteId as mongoose.Types.ObjectId,
      code: updated.couponCode,
      amount: allocAmount,
    });

    remainingNeeded -= allocAmount;

    // Record immutable financial ledger: CREDIT_RESERVED
    await StoreCreditTransaction.create(
      [
        {
          storeCreditId: updated._id,
          creditNoteId: updated.creditNoteId,
          customerId: updated.customerId,
          transactionType: "CREDIT_RESERVED",
          amount: allocAmount,
          orderId,
          balanceBefore,
          balanceAfter: updated.availableBalance,
          reservedBalanceBefore: reservedBefore,
          reservedBalanceAfter: updated.reservedBalance,
          transactionDate: now,
          description: `Reserved ₹${allocAmount} for Order ${orderId.toString()}`,
          performedBy: {
            id: updated.customerId as any,
            role: "CUSTOMER",
          },
        },
      ],
      { session }
    );
  }

  const totalReserved = reservations.reduce((acc, r) => acc + r.amount, 0);
  return { totalReserved, reservations };
}

/**
 * Permanently commit reserved store credit on successful payment or order confirmation.
 * Updates financial ledger to CREDIT_REDEEMED and synchronizes CreditNote.
 */
export async function commitStoreCreditReservations(args: {
  orderId: mongoose.Types.ObjectId;
  session?: mongoose.ClientSession;
}): Promise<void> {
  const { orderId, session } = args;

  const order = await Order.findById(orderId).session(session ?? null);
  if (!order) return;

  const credits = await StoreCredit.find({
    "reservations.orderId": orderId,
  }).session(session ?? null);

  for (const credit of credits) {
    const reservation = credit.reservations.find(
      (r) => r.orderId.toString() === orderId.toString()
    );
    if (!reservation) continue;

    const amount = reservation.amount;
    const balanceBefore = credit.availableBalance;
    const reservedBefore = credit.reservedBalance;

    const newReserved = Math.max(0, credit.reservedBalance - amount);
    const newRedeemed = credit.redeemedAmount + amount;
    const isExhausted = credit.availableBalance === 0;
    const newStatus = isExhausted ? "EXHAUSTED" : "PARTIALLY_REDEEMED";

    // Atomically commit reservation to redeemed usage
    await StoreCredit.updateOne(
      { _id: credit._id },
      {
        $set: {
          reservedBalance: newReserved,
          redeemedAmount: newRedeemed,
          status: newStatus,
        },
        $pull: { reservations: { orderId } },
        $push: {
          usageHistory: {
            orderId,
            amountUsed: amount,
            usedAt: new Date(),
          },
        },
      },
      { session }
    );

    // Sync CreditNote document
    if (credit.creditNoteId) {
      await CreditNote.updateOne(
        { _id: credit.creditNoteId },
        {
          $set: {
            redeemedAmount: newRedeemed,
            remainingBalance: credit.availableBalance,
            status: newStatus,
          },
        },
        { session }
      );
    }

    // Record immutable financial ledger: CREDIT_REDEEMED
    await StoreCreditTransaction.create(
      [
        {
          storeCreditId: credit._id,
          creditNoteId: credit.creditNoteId,
          customerId: credit.customerId,
          transactionType: "CREDIT_REDEEMED",
          amount,
          orderId,
          orderNumber: order.orderNumber,
          balanceBefore,
          balanceAfter: credit.availableBalance,
          reservedBalanceBefore: reservedBefore,
          reservedBalanceAfter: newReserved,
          transactionDate: new Date(),
          description: `Redeemed ₹${amount} for Order ${order.orderNumber}`,
          performedBy: {
            id: credit.customerId as any,
            role: "CUSTOMER",
          },
        },
      ],
      { session }
    );

    // Send redemption notification email
    const customer = await Customer.findById(credit.customerId);
    const creditNote = credit.creditNoteId ? await CreditNote.findById(credit.creditNoteId) : null;

    if (customer?.email && creditNote) {
      void sendEmail({
        to: customer.email,
        subject: `Store Credit Redeemed on Order ${order.orderNumber} – Mairii Jewels`,
        html: buildCreditRedeemedEmail({
          customerName: customer.name || "Customer",
          creditNoteNumber: creditNote.creditNoteNumber,
          couponCode: credit.couponCode,
          redeemedAmount: amount,
          remainingBalance: credit.availableBalance,
          orderNumber: order.orderNumber,
          expiryDate: credit.expiryDate,
        }),
      }).catch((e) => logger.error(e, "Failed to send credit redeemed email"));
    }
  }

  // Recovery path: if an earlier payment attempt failed/expired and released the reservation,
  // re-commit any store credits listed on order.storeCreditsUsed that were not yet redeemed.
  const usedList = Array.isArray(order.storeCreditsUsed) ? (order.storeCreditsUsed as any[]) : [];
  for (const usedEntry of usedList) {
    if (!usedEntry?.creditId || !usedEntry?.amount) continue;
    const credit = await StoreCredit.findById(usedEntry.creditId).session(session ?? null);
    if (!credit) continue;

    const alreadyRedeemed = credit.usageHistory?.some(
      (u: any) => u.orderId?.toString() === orderId.toString()
    );
    if (alreadyRedeemed) continue;

    const amount = Math.min(Number(usedEntry.amount) || 0, credit.availableBalance);
    if (amount <= 0) continue;

    const balanceBefore = credit.availableBalance;
    const balanceAfter = Math.max(0, balanceBefore - amount);
    const newRedeemed = credit.redeemedAmount + amount;
    const newStatus = balanceAfter === 0 ? "EXHAUSTED" : "PARTIALLY_REDEEMED";

    await StoreCredit.updateOne(
      { _id: credit._id },
      {
        $set: {
          availableBalance: balanceAfter,
          redeemedAmount: newRedeemed,
          status: newStatus,
        },
        $push: {
          usageHistory: {
            orderId,
            amountUsed: amount,
            usedAt: new Date(),
          },
        },
      },
      { session }
    );

    if (credit.creditNoteId) {
      await CreditNote.updateOne(
        { _id: credit.creditNoteId },
        {
          $set: {
            redeemedAmount: newRedeemed,
            remainingBalance: balanceAfter,
            status: newStatus,
          },
        },
        { session }
      );
    }

    await StoreCreditTransaction.create(
      [
        {
          storeCreditId: credit._id,
          creditNoteId: credit.creditNoteId,
          customerId: credit.customerId,
          transactionType: "CREDIT_REDEEMED",
          amount,
          orderId,
          orderNumber: order.orderNumber,
          balanceBefore,
          balanceAfter,
          reservedBalanceBefore: credit.reservedBalance,
          reservedBalanceAfter: credit.reservedBalance,
          transactionDate: new Date(),
          description: `Redeemed ₹${amount} for Order ${order.orderNumber} (post-release recovery)`,
          performedBy: {
            id: credit.customerId as any,
            role: "CUSTOMER",
          },
        },
      ],
      { session }
    );
  }
}

/**
 * Release reserved store credit when checkout fails, is cancelled, or expires.
 */
export async function releaseStoreCreditReservations(args: {
  orderId: mongoose.Types.ObjectId;
  reason?: string;
  session?: mongoose.ClientSession;
}): Promise<void> {
  const { orderId, reason, session } = args;

  const credits = await StoreCredit.find({
    "reservations.orderId": orderId,
  }).session(session ?? null);

  for (const credit of credits) {
    const reservation = credit.reservations.find(
      (r) => r.orderId.toString() === orderId.toString()
    );
    if (!reservation) continue;

    const amount = reservation.amount;
    const balanceBefore = credit.availableBalance;
    const reservedBefore = credit.reservedBalance;

    const updated = await StoreCredit.findOneAndUpdate(
      { _id: credit._id },
      {
        $inc: {
          availableBalance: amount,
          reservedBalance: -amount,
        },
        $pull: { reservations: { orderId } },
      },
      { new: true, session }
    );

    if (!updated) continue;

    await StoreCreditTransaction.create(
      [
        {
          storeCreditId: updated._id,
          creditNoteId: updated.creditNoteId,
          customerId: updated.customerId,
          transactionType: "CREDIT_RELEASED",
          amount,
          orderId,
          balanceBefore,
          balanceAfter: updated.availableBalance,
          reservedBalanceBefore: reservedBefore,
          reservedBalanceAfter: updated.reservedBalance,
          transactionDate: new Date(),
          description: `Released reservation of ₹${amount} (${reason || "PAYMENT_FAILED"})`,
          performedBy: {
            role: "SYSTEM",
          },
        },
      ],
      { session }
    );
  }
}

/**
 * Admin cancels unused credit on a credit note.
 * Mandatory reason required. Only unredeemed balance can be cancelled.
 */
export async function cancelCreditNote(args: {
  creditNoteId: string;
  reason: string;
  adminId: string;
}): Promise<{ creditNote: CreditNoteDoc; storeCredit: StoreCreditDoc }> {
  const { creditNoteId, reason, adminId } = args;
  if (!reason || !reason.trim()) {
    throw new AppError(400, "Mandatory cancellation reason is required");
  }

  const creditNote = await CreditNote.findById(creditNoteId);
  if (!creditNote) throw new AppError(404, "Credit Note not found");

  if (creditNote.status === "CANCELLED") {
    throw new AppError(400, "Credit note is already cancelled");
  }

  if (creditNote.remainingBalance <= 0) {
    throw new AppError(400, "Cannot cancel credit note with zero remaining balance");
  }

  const storeCredit = await StoreCredit.findOne({ creditNoteId: creditNote._id });
  if (!storeCredit) throw new AppError(404, "Associated store credit not found");

  const cancelledAmount = storeCredit.availableBalance;
  const balanceBefore = storeCredit.availableBalance;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    creditNote.status = "CANCELLED";
    creditNote.settlementStatus = "CANCELLED";
    creditNote.cancellationReason = reason.trim();
    creditNote.cancelledAt = new Date();
    creditNote.cancelledBy =
      adminId && mongoose.isValidObjectId(adminId)
        ? new mongoose.Types.ObjectId(adminId)
        : undefined;
    creditNote.remainingBalance = 0;
    await creditNote.save({ session });

    storeCredit.status = "CANCELLED";
    storeCredit.availableBalance = 0;
    await storeCredit.save({ session });

    await StoreCreditTransaction.create(
      [
        {
          storeCreditId: storeCredit._id,
          creditNoteId: creditNote._id,
          customerId: storeCredit.customerId,
          transactionType: "CREDIT_CANCELLED",
          amount: cancelledAmount,
          balanceBefore,
          balanceAfter: 0,
          transactionDate: new Date(),
          description: `Cancelled by Admin: ${reason.trim()}`,
          performedBy: {
            id:
              adminId && mongoose.isValidObjectId(adminId)
                ? new mongoose.Types.ObjectId(adminId)
                : undefined,
            role: "ADMIN",
            name: "Admin",
          },
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    // Send cancellation email
    const customer = await Customer.findById(creditNote.customerId);
    if (customer?.email) {
      void sendEmail({
        to: customer.email,
        subject: `Credit Note ${creditNote.creditNoteNumber} Cancelled – Mairii Jewels`,
        html: buildCreditCancelledEmail({
          customerName: customer.name || "Customer",
          creditNoteNumber: creditNote.creditNoteNumber,
          couponCode: creditNote.couponCode,
          reason: reason.trim(),
          cancelledAmount,
        }),
      }).catch((e) => logger.error(e, "Failed to send cancellation email"));
    }

    return { creditNote, storeCredit };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}

/**
 * Revert a credit note (alias to cancelCreditNote).
 * Revokes the remaining store credit balance and logs the audit event.
 */
export const revertCreditNote = cancelCreditNote;

/**
 * Admin reactivates a previously cancelled credit note (reverts the cancellation).
 * Restores remaining balance, updates status back to ACTIVE/PARTIALLY_REDEEMED,
 * and records an immutable CREDIT_REACTIVATED audit ledger transaction.
 */
export async function reactivateCreditNote(args: {
  creditNoteId: string;
  reason: string;
  adminId: string;
}): Promise<{ creditNote: CreditNoteDoc; storeCredit: StoreCreditDoc }> {
  const { creditNoteId, reason, adminId } = args;
  if (!reason || !reason.trim()) {
    throw new AppError(400, "Mandatory reactivation reason is required");
  }

  const creditNote = await CreditNote.findById(creditNoteId);
  if (!creditNote) throw new AppError(404, "Credit Note not found");

  if (creditNote.status !== "CANCELLED") {
    throw new AppError(
      400,
      `Only cancelled credit notes can be reactivated (current: ${creditNote.status})`
    );
  }

  const storeCredit = await StoreCredit.findOne({ creditNoteId: creditNote._id });
  if (!storeCredit) throw new AppError(404, "Associated store credit not found");

  // Check 90-day expiry from original issuance
  const now = new Date();
  if (creditNote.expiryDate.getTime() <= now.getTime()) {
    throw new AppError(
      400,
      "Cannot reactivate: this credit note has already passed its 90-day validity period"
    );
  }

  const restorableAmount = Math.max(
    0,
    creditNote.issuedCreditAmount - (creditNote.redeemedAmount || 0)
  );
  if (restorableAmount <= 0) {
    throw new AppError(400, "Cannot reactivate credit note with zero remaining balance");
  }

  const targetStatus = (creditNote.redeemedAmount || 0) > 0 ? "PARTIALLY_REDEEMED" : "ACTIVE";

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    creditNote.status = targetStatus;
    creditNote.settlementStatus = "SETTLED";
    creditNote.remainingBalance = restorableAmount;
    creditNote.cancellationReason = undefined;
    creditNote.cancelledAt = undefined;
    creditNote.cancelledBy = undefined;
    await creditNote.save({ session });

    storeCredit.status = targetStatus;
    storeCredit.availableBalance = restorableAmount;
    await storeCredit.save({ session });

    await StoreCreditTransaction.create(
      [
        {
          storeCreditId: storeCredit._id,
          creditNoteId: creditNote._id,
          customerId: storeCredit.customerId,
          transactionType: "CREDIT_REACTIVATED",
          amount: restorableAmount,
          balanceBefore: 0,
          balanceAfter: restorableAmount,
          transactionDate: new Date(),
          description: `Cancellation Reverted / Reactivated by Admin: ${reason.trim()}`,
          performedBy: {
            id:
              adminId && mongoose.isValidObjectId(adminId)
                ? new mongoose.Types.ObjectId(adminId)
                : undefined,
            role: "ADMIN",
            name: "Admin",
          },
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    // Send email to customer notifying credit restored
    const customer = await Customer.findById(creditNote.customerId);
    if (customer?.email) {
      void sendEmail({
        to: customer.email,
        subject: `Credit Note ${creditNote.creditNoteNumber} Restored – Mairii Jewels`,
        html: buildCreditNoteIssuedEmail({
          customerName: customer.name || "Customer",
          creditNoteNumber: creditNote.creditNoteNumber,
          couponCode: creditNote.couponCode,
          amount: restorableAmount,
          issueDate: creditNote.issuedDate,
          expiryDate: creditNote.expiryDate,
        }),
      }).catch((e) => logger.error(e, "Failed to send reactivation email"));
    }

    return { creditNote, storeCredit };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}

/**
 * Auto-expire a specific store credit whose 90-day validity has passed.
 */
export async function autoExpireStoreCredit(storeCreditId: string): Promise<void> {
  const credit = await StoreCredit.findById(storeCreditId);
  if (!credit || credit.status === "EXPIRED" || credit.status === "CANCELLED") return;

  const expiredBalance = credit.availableBalance;
  const balanceBefore = credit.availableBalance;

  credit.status = "EXPIRED";
  credit.availableBalance = 0;
  await credit.save();

  if (credit.creditNoteId) {
    await CreditNote.updateOne(
      { _id: credit.creditNoteId },
      { $set: { status: "EXPIRED", remainingBalance: 0 } }
    );
  }

  await StoreCreditTransaction.create({
    storeCreditId: credit._id,
    creditNoteId: credit.creditNoteId,
    customerId: credit.customerId,
    transactionType: "CREDIT_EXPIRED",
    amount: expiredBalance,
    balanceBefore,
    balanceAfter: 0,
    transactionDate: new Date(),
    description: "Store credit expired after 90 days validity period",
    performedBy: { role: "SYSTEM" },
  });

  const customer = await Customer.findById(credit.customerId);
  const creditNote = credit.creditNoteId ? await CreditNote.findById(credit.creditNoteId) : null;

  if (customer?.email && creditNote) {
    void sendEmail({
      to: customer.email,
      subject: `Credit Note ${creditNote.creditNoteNumber} Expired – Mairii Jewels`,
      html: buildCreditExpiredEmail({
        customerName: customer.name || "Customer",
        creditNoteNumber: creditNote.creditNoteNumber,
        couponCode: credit.couponCode,
        expiredBalance,
        expiryDate: credit.expiryDate,
      }),
    }).catch((e) => logger.error(e, "Failed to send credit expired email"));
  }
}

/**
 * Background sweep for expired store credits (runs in worker).
 */
export async function processExpiredCredits(): Promise<number> {
  const now = new Date();
  const overdue = await StoreCredit.find({
    status: { $in: ["ACTIVE", "PARTIALLY_REDEEMED"] },
    expiryDate: { $lte: now },
  }).limit(50);

  let count = 0;
  for (const c of overdue) {
    try {
      await autoExpireStoreCredit(c._id.toString());
      count++;
    } catch (err) {
      logger.error({ err, storeCreditId: c._id }, "Error expiring store credit");
    }
  }
  return count;
}

/**
 * Background sweep for expired store credit checkout reservations (older than 30 mins).
 */
export async function processExpiredCreditReservations(): Promise<number> {
  const now = new Date();
  const credits = await StoreCredit.find({
    "reservations.expiresAt": { $lte: now },
  });

  let count = 0;
  for (const credit of credits) {
    const expiredRes = credit.reservations.filter((r) => r.expiresAt <= now);
    for (const r of expiredRes) {
      try {
        await releaseStoreCreditReservations({
          orderId: r.orderId as mongoose.Types.ObjectId,
          reason: "RESERVATION_TIMEOUT",
        });
        count++;
      } catch (err) {
        logger.error({ err, creditId: credit._id }, "Error releasing expired credit reservation");
      }
    }
  }
  return count;
}

/**
 * Admin listing with comprehensive filters.
 */
export async function listCreditNotesAdmin(query: {
  search?: string;
  orderNumber?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  expiryStartDate?: string;
  expiryEndDate?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
  const skip = (page - 1) * limit;

  const filter: any = {};

  if (query.status && query.status !== "ALL") {
    filter.status = query.status;
  }

  if (query.orderNumber && query.orderNumber.trim()) {
    filter.originalOrderNumber = new RegExp(query.orderNumber.trim(), "i");
  }

  if (query.search && query.search.trim()) {
    const s = query.search.trim();
    filter.$or = [
      { creditNoteNumber: new RegExp(s, "i") },
      { customerName: new RegExp(s, "i") },
      { customerEmail: new RegExp(s, "i") },
      { couponCode: new RegExp(s, "i") },
      { originalOrderNumber: new RegExp(s, "i") },
      { returnRequestNumber: new RegExp(s, "i") },
    ];
  }

  if (query.startDate || query.endDate) {
    filter.issuedDate = {};
    if (query.startDate) filter.issuedDate.$gte = new Date(query.startDate);
    if (query.endDate) filter.issuedDate.$lte = new Date(query.endDate);
  }

  if (query.expiryStartDate || query.expiryEndDate) {
    filter.expiryDate = {};
    if (query.expiryStartDate) filter.expiryDate.$gte = new Date(query.expiryStartDate);
    if (query.expiryEndDate) filter.expiryDate.$lte = new Date(query.expiryEndDate);
  }

  const [items, total] = await Promise.all([
    CreditNote.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    CreditNote.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

/**
 * Admin view complete credit note details with transaction history.
 */
export async function getCreditNoteDetailsAdmin(id: string) {
  const creditNote = await CreditNote.findById(id).lean();
  if (!creditNote) throw new AppError(404, "Credit Note not found");

  const [storeCredit, transactions, returnDoc, originalOrder] = await Promise.all([
    StoreCredit.findOne({ creditNoteId: creditNote._id }).lean(),
    StoreCreditTransaction.find({ creditNoteId: creditNote._id })
      .sort({ transactionDate: -1 })
      .lean(),
    Return.findById(creditNote.returnRequestId).lean(),
    Order.findById(creditNote.originalOrderId).lean(),
  ]);

  return {
    creditNote,
    storeCredit,
    transactions,
    returnDoc,
    originalOrder,
  };
}

/**
 * Customer view their store credits and balances.
 */
export async function getCustomerStoreCredits(customerId: string) {
  const now = new Date();
  const fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const credits = await StoreCredit.find({
    customerId: new mongoose.Types.ObjectId(customerId),
  })
    .populate<{ creditNoteId: CreditNoteDoc }>("creditNoteId")
    .sort({ createdAt: -1 })
    .lean();

  const transactions = await StoreCreditTransaction.find({
    customerId: new mongoose.Types.ObjectId(customerId),
  })
    .sort({ transactionDate: -1 })
    .lean();

  let totalAvailable = 0;
  const items = credits.map((c) => {
    if (c.status === "ACTIVE" || c.status === "PARTIALLY_REDEEMED") {
      if (c.expiryDate > now) {
        totalAvailable += c.availableBalance;
      }
    }

    const isExpiringSoon =
      (c.status === "ACTIVE" || c.status === "PARTIALLY_REDEEMED") &&
      c.expiryDate > now &&
      c.expiryDate <= fourteenDaysFromNow;

    return {
      _id: c._id,
      couponCode: c.couponCode,
      initialBalance: c.initialBalance,
      availableBalance: c.availableBalance,
      reservedBalance: c.reservedBalance,
      redeemedAmount: c.redeemedAmount,
      issuedDate: c.issuedDate,
      expiryDate: c.expiryDate,
      status: c.status,
      isExpiringSoon,
      creditNoteNumber: c.creditNoteId?.creditNoteNumber,
      returnRequestNumber: c.creditNoteId?.returnRequestNumber,
      originalOrderNumber: c.creditNoteId?.originalOrderNumber,
    };
  });

  return {
    totalAvailable,
    credits: items,
    transactions,
  };
}
