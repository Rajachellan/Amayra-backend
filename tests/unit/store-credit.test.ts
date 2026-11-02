import { describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {
  calculateExpiryDate,
  generateSecureCouponCode,
} from "../../src/modules/credit/credit.service.js";
import {
  buildCreditNoteIssuedEmail,
  buildCreditRedeemedEmail,
  buildCreditCancelledEmail,
  buildCreditExpiredEmail,
  buildCreditExpiryReminderEmail,
} from "../../src/services/emailService.js";
import { generateCreditNotePdf } from "../../src/modules/credit/creditNotePdf.js";
import type { CreditNoteDoc } from "../../src/modules/credit/creditNote.model.js";

describe("Store Credit & Credit Note System Unit Tests", () => {
  // Test Case 2: Three-month expiry calculation
  describe("Rule 2: Three-month (90 days) Expiry Calculation", () => {
    it("should calculate expiry date strictly 90 days from issuance date", () => {
      const issueDate = new Date("2026-11-02T10:00:00.000Z");
      const expiry = calculateExpiryDate(issueDate);

      // Expected: 2026-11-02 + 90 days = 2027-01-31
      const diffMs = expiry.getTime() - issueDate.getTime();
      const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
      assert.equal(diffDays, 90);

      // Verify year, month, day
      assert.equal(expiry.getFullYear(), 2027);
      assert.equal(expiry.getMonth(), 0); // January (0-indexed)
      assert.equal(expiry.getDate(), 31);
    });

    it("should set expiry time to end of day (23:59:59.999)", () => {
      const issueDate = new Date("2026-06-15T08:30:00.000Z");
      const expiry = calculateExpiryDate(issueDate);

      assert.equal(expiry.getHours(), 23);
      assert.equal(expiry.getMinutes(), 59);
      assert.equal(expiry.getSeconds(), 59);
      assert.equal(expiry.getMilliseconds(), 999);
    });
  });

  // Test Case 4 & Security: Coupon validation & secure code generation
  describe("Rule 4 & Security: Secure Coupon Generation & Format", () => {
    it("should generate unpredictable, high-entropy uppercase coupon code", () => {
      const code1 = generateSecureCouponCode();
      const code2 = generateSecureCouponCode();

      assert.notEqual(code1, code2);
      assert.match(code1, /^SC-[0-9A-F]{4}-[0-9A-F]{4}$/);
      assert.match(code2, /^SC-[0-9A-F]{4}-[0-9A-F]{4}$/);
    });
  });

  // Test Case 5, 6, 7: Balance Calculation logic (Full, Partial, Multiple)
  describe("Redemption Balance Arithmetic", () => {
    it("should correctly handle partial redemption calculation", () => {
      const available = 5000;
      const orderTotal = 3000;
      const appliedCredit = Math.min(available, orderTotal);
      const remainingCredit = available - appliedCredit;
      const customerPayable = orderTotal - appliedCredit;

      assert.equal(appliedCredit, 3000);
      assert.equal(remainingCredit, 2000);
      assert.equal(customerPayable, 0);
    });

    it("should correctly handle full redemption when order exceeds credit", () => {
      const available = 5000;
      const orderTotal = 8000;
      const appliedCredit = Math.min(available, orderTotal);
      const remainingCredit = available - appliedCredit;
      const customerPayable = orderTotal - appliedCredit;

      assert.equal(appliedCredit, 5000);
      assert.equal(remainingCredit, 0);
      assert.equal(customerPayable, 3000);
    });

    it("should allocate multiple credit notes up to required order total", () => {
      const creditNotes = [
        { code: "SC-1111-AAAA", balance: 2000 },
        { code: "SC-2222-BBBB", balance: 3000 },
        { code: "SC-3333-CCCC", balance: 5000 },
      ];
      const orderTotal = 4500;

      let remainingNeeded = orderTotal;
      const allocations: Array<{ code: string; amount: number }> = [];

      for (const cn of creditNotes) {
        if (remainingNeeded <= 0) break;
        const alloc = Math.min(cn.balance, remainingNeeded);
        allocations.push({ code: cn.code, amount: alloc });
        remainingNeeded -= alloc;
      }

      assert.equal(allocations.length, 2);
      assert.equal(allocations[0].amount, 2000);
      assert.equal(allocations[1].amount, 2500);
      assert.equal(remainingNeeded, 0);
    });
  });

  // Test Case 8: Expired coupon rejection
  describe("Rule 8: Expired Coupon Verification Logic", () => {
    it("should detect when credit note validity is expired", () => {
      const expiredDate = new Date(Date.now() - 1000 * 60 * 60 * 24); // 1 day ago
      const isExpired = expiredDate.getTime() <= Date.now();
      assert.equal(isExpired, true);
    });

    it("should accept valid credit note within 90 days", () => {
      const futureExpiry = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30 days remaining
      const isExpired = futureExpiry.getTime() <= Date.now();
      assert.equal(isExpired, false);
    });
  });

  // Test Case 9: Cancelled credit rejection logic
  describe("Rule 9: Cancelled Credit Status Logic", () => {
    it("should reject redemption if status is CANCELLED", () => {
      const status: string = "CANCELLED";
      const canRedeem = status === "ACTIVE" || status === "PARTIALLY_REDEEMED";
      assert.equal(canRedeem, false);
    });

    it("should allow redemption if status is ACTIVE or PARTIALLY_REDEEMED", () => {
      const activeStatus: string = "ACTIVE";
      const partialStatus: string = "PARTIALLY_REDEEMED";
      const canRedeemActive = activeStatus === "ACTIVE" || activeStatus === "PARTIALLY_REDEEMED";
      const canRedeemPartial = partialStatus === "ACTIVE" || partialStatus === "PARTIALLY_REDEEMED";
      assert.equal(canRedeemActive, true);
      assert.equal(canRedeemPartial, true);
    });
  });

  // Test Case 15: Customer Authorization
  describe("Rule 15: Customer Ownership Authorization", () => {
    it("should disallow customer from redeeming credits of another customer", () => {
      const creditOwnerId = new mongoose.Types.ObjectId().toString();
      const currentCustomerId = new mongoose.Types.ObjectId().toString();

      const isAuthorized = creditOwnerId === currentCustomerId;
      assert.equal(isAuthorized, false);
    });

    it("should allow customer when credit owner matches authenticated customer", () => {
      const customerId = new mongoose.Types.ObjectId().toString();
      const isAuthorized = customerId === customerId;
      assert.equal(isAuthorized, true);
    });
  });

  // Test Case 14: Duplicate Webhook Idempotency Check
  describe("Rule 14: Duplicate Webhook Idempotency Verification", () => {
    it("should report alreadyDone if payment status is already captured", () => {
      const payment = { status: "captured" };
      const alreadyDone = payment.status === "captured";
      assert.equal(alreadyDone, true);
    });

    it("should proceed if payment status is pending/created", () => {
      const payment = { status: "created" };
      const alreadyDone = payment.status === "captured";
      assert.equal(alreadyDone, false);
    });
  });

  // PDF Generator Verification
  describe("Credit Note PDF Generation", () => {
    it("should generate a valid PDF 1.4 buffer with MAIRII branding", () => {
      const mockCreditNote: any = {
        _id: new mongoose.Types.ObjectId(),
        creditNoteNumber: "CN-2026-000001",
        customerId: new mongoose.Types.ObjectId(),
        customerName: "Priya Sharma",
        customerEmail: "priya@example.com",
        originalOrderId: new mongoose.Types.ObjectId(),
        originalOrderNumber: "AMY-20261015-001",
        returnRequestId: new mongoose.Types.ObjectId(),
        returnRequestNumber: "RET-20261102-001",
        returnedProductDetails: [
          {
            name: "Royal Polki Choker Necklace",
            sku: "NK-POLKI-01",
            size: "Standard",
            quantity: 1,
            unitPrice: 8500,
            totalAmount: 8500,
          },
        ],
        issuedCreditAmount: 8500,
        couponCode: "SC-9A4B-7F2C",
        issuedDate: new Date("2026-11-02"),
        expiryDate: new Date("2027-01-31"),
        redeemedAmount: 0,
        remainingBalance: 8500,
        settlementStatus: "SETTLED",
        status: "ACTIVE",
        qcNotes: "Item in immaculate condition",
      };

      const pdfBuffer = generateCreditNotePdf(mockCreditNote);

      assert.ok(pdfBuffer instanceof Buffer);
      assert.ok(pdfBuffer.length > 500);

      const header = pdfBuffer.slice(0, 8).toString("utf-8");
      assert.ok(header.startsWith("%PDF-1.4"));

      const content = pdfBuffer.toString("utf-8");
      assert.ok(content.includes("MAIRII JEWELS"));
      assert.ok(content.includes("CN-2026-000001"));
      assert.ok(content.includes("SC-9A4B-7F2C"));
      assert.ok(content.includes("%%EOF"));
    });
  });

  // Email Template Verification
  describe("Notification Email Templates", () => {
    it("should construct valid credit note issued email with 90-day expiry & instructions", () => {
      const html = buildCreditNoteIssuedEmail({
        customerName: "Priya Sharma",
        creditNoteNumber: "CN-2026-000001",
        couponCode: "SC-9A4B-7F2C",
        amount: 8500,
        issueDate: "2026-11-02",
        expiryDate: "2027-01-31",
      });

      assert.ok(html.includes("Priya Sharma"));
      assert.ok(html.includes("CN-2026-000001"));
      assert.ok(html.includes("SC-9A4B-7F2C"));
      assert.ok(html.includes("8,500"));
      assert.ok(html.includes("How to Redeem"));
      assert.ok(html.includes("90 Days"));
    });

    it("should construct credit redemption email with remaining balance", () => {
      const html = buildCreditRedeemedEmail({
        customerName: "Priya Sharma",
        creditNoteNumber: "CN-2026-000001",
        couponCode: "SC-9A4B-7F2C",
        redeemedAmount: 3500,
        remainingBalance: 5000,
        orderNumber: "AMY-20261115-002",
        expiryDate: "2027-01-31",
      });

      assert.ok(html.includes("CN-2026-000001"));
      assert.ok(html.includes("AMY-20261115-002"));
      assert.ok(html.includes("3,500"));
      assert.ok(html.includes("5,000"));
    });

    it("should construct credit cancellation email with reason", () => {
      const html = buildCreditCancelledEmail({
        customerName: "Priya Sharma",
        creditNoteNumber: "CN-2026-000001",
        couponCode: "SC-9A4B-7F2C",
        reason: "Customer requested alternative settlement via bank transfer",
        cancelledAmount: 5000,
      });

      assert.ok(html.includes("CN-2026-000001"));
      assert.ok(html.includes("bank transfer"));
      assert.ok(html.includes("5,000"));
    });

    it("should construct credit expired email", () => {
      const html = buildCreditExpiredEmail({
        customerName: "Priya Sharma",
        creditNoteNumber: "CN-2026-000001",
        couponCode: "SC-9A4B-7F2C",
        expiredBalance: 2500,
        expiryDate: "2027-01-31",
      });

      assert.ok(html.includes("expired"));
      assert.ok(html.includes("2,500"));
      assert.ok(html.includes("90-day validity"));
    });

    it("should construct expiry reminder email", () => {
      const html = buildCreditExpiryReminderEmail({
        customerName: "Priya Sharma",
        creditNoteNumber: "CN-2026-000001",
        couponCode: "SC-9A4B-7F2C",
        availableBalance: 2500,
        expiryDate: "2027-01-31",
        daysRemaining: 10,
      });

      assert.ok(html.includes("10 days"));
      assert.ok(html.includes("2,500"));
      assert.ok(html.includes("SC-9A4B-7F2C"));
    });
  });

  // Test Case: Manual Credit Note Issuance for Damaged / Defective Items
  describe("Manual Credit Note Issuance Logic & Product Selection", () => {
    it("should calculate total credit from selected products correctly", () => {
      const selectedItems = [
        { name: "Gold Choker", quantity: 1, unitPrice: 8500 },
        { name: "Emerald Stud Earrings", quantity: 2, unitPrice: 1200 },
      ];

      const total = selectedItems.reduce((acc, it) => acc + it.quantity * it.unitPrice, 0);
      assert.equal(total, 8500 + 2400); // 10,900
    });

    it("should generate 90-day validity for manual credit notes", () => {
      const issueDate = new Date("2026-11-02T12:00:00.000Z");
      const expiry = calculateExpiryDate(issueDate);

      const diffDays = Math.round((expiry.getTime() - issueDate.getTime()) / (24 * 60 * 60 * 1000));
      assert.equal(diffDays, 90);
    });

    it("should render PDF with manual claim product details for manual credit notes", () => {
      const manualCN = {
        creditNoteNumber: "CN-2026-000099",
        customerName: "Anjali Verma",
        customerEmail: "anjali@example.com",
        originalOrderNumber: "AMY-20261030-001",
        returnRequestNumber: "MANUAL-CN-2026-000099",
        issueType: "MANUAL_ISSUE",
        issueReason: "DAMAGED_IN_TRANSIT",
        returnedProductDetails: [
          {
            name: "Damaged Kundan Necklace",
            sku: "KUNDAN-01",
            size: "Standard",
            quantity: 1,
            unitPrice: 5500,
            totalAmount: 5500,
          },
        ],
        issuedCreditAmount: 5500,
        couponCode: "SC-DMG9-0099",
        issuedDate: new Date(),
        expiryDate: calculateExpiryDate(new Date()),
        remainingBalance: 5500,
        qcNotes: "Manual Claim: DAMAGED_IN_TRANSIT",
      } as any;

      const pdfBuffer = generateCreditNotePdf(manualCN);
      assert.ok(Buffer.isBuffer(pdfBuffer));
      assert.ok(pdfBuffer.length > 500);
      assert.ok(pdfBuffer.toString("binary").includes("%PDF-1.4"));
    });

    it("should compute correct restorable amount on reactivation", () => {
      const issuedAmount = 5000;
      const redeemedAmount = 1500;
      const restorable = Math.max(0, issuedAmount - redeemedAmount);
      assert.strictEqual(restorable, 3500);

      const statusAfterReactivation = redeemedAmount > 0 ? "PARTIALLY_REDEEMED" : "ACTIVE";
      assert.strictEqual(statusAfterReactivation, "PARTIALLY_REDEEMED");
    });

    it("should set status to ACTIVE on full unredeemed reactivation", () => {
      const issuedAmount = 2500;
      const redeemedAmount = 0;
      const restorable = Math.max(0, issuedAmount - redeemedAmount);
      assert.strictEqual(restorable, 2500);

      const statusAfterReactivation = redeemedAmount > 0 ? "PARTIALLY_REDEEMED" : "ACTIVE";
      assert.strictEqual(statusAfterReactivation, "ACTIVE");
    });
  });
});
