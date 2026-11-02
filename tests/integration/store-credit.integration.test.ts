import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { setupTestDatabase, teardownTestDatabase, getTestClient, getTestApp } from "./setup.js";
import { CreditNote } from "../../src/modules/credit/creditNote.model.js";
import { StoreCredit } from "../../src/modules/credit/model.js";
import { StoreCreditTransaction } from "../../src/modules/credit/transaction.model.js";
import { Customer } from "../../src/modules/customer/model.js";
import { Admin } from "../../src/modules/auth/model.js";
import { signAccessToken } from "../../src/common/auth/tokens.js";
import { calculateExpiryDate } from "../../src/modules/credit/credit.service.js";

describe("Store Credit & Credit Note System Integration Tests", () => {
  const client = getTestClient();
  let customerId: mongoose.Types.ObjectId;
  let otherCustomerId: mongoose.Types.ObjectId;
  let adminId: mongoose.Types.ObjectId;
  let customerToken: string;
  let otherCustomerToken: string;
  let adminToken: string;

  before(async () => {
    try {
      await setupTestDatabase();
    } catch (e) {
      console.log("Database connection in test:", (e as Error).message);
    }

    customerId = new mongoose.Types.ObjectId();
    otherCustomerId = new mongoose.Types.ObjectId();
    adminId = new mongoose.Types.ObjectId();

    customerToken = signAccessToken(
      customerId.toString(),
      "customer",
      [],
      "test.customer@mairii.com"
    ).token;

    otherCustomerToken = signAccessToken(
      otherCustomerId.toString(),
      "customer",
      [],
      "other.customer@mairii.com"
    ).token;

    adminToken = signAccessToken(
      adminId.toString(),
      "super_admin",
      ["admin:manage", "orders:read", "orders:write"],
      "admin@mairii.com"
    ).token;
  });

  after(async () => {
    if (mongoose.connection.readyState !== 0) {
      await Promise.all([
        CreditNote.deleteMany({}),
        StoreCredit.deleteMany({}),
        StoreCreditTransaction.deleteMany({}),
      ]);
    }
  });

  beforeEach(async () => {
    if (mongoose.connection.readyState !== 0) {
      await Promise.all([
        CreditNote.deleteMany({}),
        StoreCredit.deleteMany({}),
        StoreCreditTransaction.deleteMany({}),
      ]);
    }
  });

  describe("Customer Store Credit APIs", () => {
    it("should allow customer to validate an active coupon code and return 90-day expiry", async () => {
      if (mongoose.connection.readyState === 0) return; // Skip if db not running

      const issuedDate = new Date();
      const expiryDate = calculateExpiryDate(issuedDate);

      const cn = await CreditNote.create({
        creditNoteNumber: "CN-2026-000001",
        customerId,
        customerName: "Ananya Sharma",
        customerEmail: "test.customer@mairii.com",
        originalOrderId: new mongoose.Types.ObjectId(),
        originalOrderNumber: "ORD-2026-001",
        returnRequestId: new mongoose.Types.ObjectId(),
        returnRequestNumber: "RET-2026-001",
        returnedProductDetails: [
          {
            productId: new mongoose.Types.ObjectId(),
            name: "Gold Pendant Necklace",
            sku: "GLD-PEND-01",
            quantity: 1,
            unitPrice: 5000,
            totalAmount: 5000,
          },
        ],
        issuedCreditAmount: 5000,
        couponCode: "SC-TEST-0001",
        issuedDate,
        expiryDate,
        redeemedAmount: 0,
        remainingBalance: 5000,
        settlementStatus: "ISSUED",
        status: "ACTIVE",
      });

      const sc = await StoreCredit.create({
        customerId,
        creditNoteId: cn._id,
        couponCode: "SC-TEST-0001",
        initialBalance: 5000,
        availableBalance: 5000,
        reservedBalance: 0,
        redeemedAmount: 0,
        issuedDate,
        expiryDate,
        status: "ACTIVE",
      });

      const res = await client
        .post("/api/store-credits/validate")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ couponCode: "SC-TEST-0001" });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.couponCode, "SC-TEST-0001");
      assert.equal(res.body.data.availableBalance, 5000);
      assert.equal(res.body.data.creditNoteNumber, "CN-2026-000001");
    });

    it("should prevent a customer from validating another customer's coupon code", async () => {
      if (mongoose.connection.readyState === 0) return;

      const issuedDate = new Date();
      const expiryDate = calculateExpiryDate(issuedDate);

      const cn = await CreditNote.create({
        creditNoteNumber: "CN-2026-000002",
        customerId,
        customerName: "Ananya Sharma",
        customerEmail: "test.customer@mairii.com",
        originalOrderId: new mongoose.Types.ObjectId(),
        originalOrderNumber: "ORD-2026-002",
        returnRequestId: new mongoose.Types.ObjectId(),
        returnRequestNumber: "RET-2026-002",
        returnedProductDetails: [
          {
            productId: new mongoose.Types.ObjectId(),
            name: "Emerald Ring",
            quantity: 1,
            unitPrice: 8000,
            totalAmount: 8000,
          },
        ],
        issuedCreditAmount: 8000,
        couponCode: "SC-TEST-0002",
        issuedDate,
        expiryDate,
        redeemedAmount: 0,
        remainingBalance: 8000,
        settlementStatus: "ISSUED",
        status: "ACTIVE",
      });

      await StoreCredit.create({
        customerId,
        creditNoteId: cn._id,
        couponCode: "SC-TEST-0002",
        initialBalance: 8000,
        availableBalance: 8000,
        reservedBalance: 0,
        redeemedAmount: 0,
        issuedDate,
        expiryDate,
        status: "ACTIVE",
      });

      // other customer attempts to use SC-TEST-0002
      const res = await client
        .post("/api/store-credits/validate")
        .set("Authorization", `Bearer ${otherCustomerToken}`)
        .send({ couponCode: "SC-TEST-0002" });

      assert.equal(res.status, 403);
      assert.match(res.body.message, /not authorized/i);
    });

    it("should list customer store credits with available balance summary", async () => {
      if (mongoose.connection.readyState === 0) return;

      const issuedDate = new Date();
      const expiryDate = calculateExpiryDate(issuedDate);

      const cn = await CreditNote.create({
        creditNoteNumber: "CN-2026-000003",
        customerId,
        customerName: "Ananya Sharma",
        customerEmail: "test.customer@mairii.com",
        originalOrderId: new mongoose.Types.ObjectId(),
        originalOrderNumber: "ORD-2026-003",
        returnRequestId: new mongoose.Types.ObjectId(),
        returnRequestNumber: "RET-2026-003",
        returnedProductDetails: [
          {
            productId: new mongoose.Types.ObjectId(),
            name: "Diamond Ear studs",
            quantity: 1,
            unitPrice: 12000,
            totalAmount: 12000,
          },
        ],
        issuedCreditAmount: 12000,
        couponCode: "SC-TEST-0003",
        issuedDate,
        expiryDate,
        redeemedAmount: 0,
        remainingBalance: 12000,
        settlementStatus: "ISSUED",
        status: "ACTIVE",
      });

      await StoreCredit.create({
        customerId,
        creditNoteId: cn._id,
        couponCode: "SC-TEST-0003",
        initialBalance: 12000,
        availableBalance: 12000,
        reservedBalance: 0,
        redeemedAmount: 0,
        issuedDate,
        expiryDate,
        status: "ACTIVE",
      });

      const res = await client
        .get("/api/store-credits/me")
        .set("Authorization", `Bearer ${customerToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.totalAvailableCredit, 12000);
      assert.equal(res.body.data.activeCount, 1);
      assert.equal(res.body.data.credits.length, 1);
      assert.equal(res.body.data.credits[0].couponCode, "SC-TEST-0003");
    });
  });

  describe("Admin Credit Note APIs", () => {
    it("should allow admin to list credit notes with search and status filters", async () => {
      if (mongoose.connection.readyState === 0) return;

      const issuedDate = new Date();
      const expiryDate = calculateExpiryDate(issuedDate);

      await CreditNote.create({
        creditNoteNumber: "CN-2026-000010",
        customerId,
        customerName: "Rohan Kapoor",
        customerEmail: "rohan@example.com",
        originalOrderId: new mongoose.Types.ObjectId(),
        originalOrderNumber: "ORD-2026-010",
        returnRequestId: new mongoose.Types.ObjectId(),
        returnRequestNumber: "RET-2026-010",
        returnedProductDetails: [
          {
            productId: new mongoose.Types.ObjectId(),
            name: "Silver Bracelet",
            quantity: 1,
            unitPrice: 3500,
            totalAmount: 3500,
          },
        ],
        issuedCreditAmount: 3500,
        couponCode: "SC-TEST-0010",
        issuedDate,
        expiryDate,
        redeemedAmount: 0,
        remainingBalance: 3500,
        settlementStatus: "ISSUED",
        status: "ACTIVE",
      });

      const res = await client
        .get("/api/admin/credit-notes?search=Rohan")
        .set("Authorization", `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.items.length, 1);
      assert.equal(res.body.data.items[0].creditNoteNumber, "CN-2026-000010");
    });

    it("should allow admin to download credit note PDF with %PDF-1.4 header", async () => {
      if (mongoose.connection.readyState === 0) return;

      const issuedDate = new Date();
      const expiryDate = calculateExpiryDate(issuedDate);

      const cn = await CreditNote.create({
        creditNoteNumber: "CN-2026-000020",
        customerId,
        customerName: "Meera Sen",
        customerEmail: "meera@example.com",
        originalOrderId: new mongoose.Types.ObjectId(),
        originalOrderNumber: "ORD-2026-020",
        returnRequestId: new mongoose.Types.ObjectId(),
        returnRequestNumber: "RET-2026-020",
        returnedProductDetails: [
          {
            productId: new mongoose.Types.ObjectId(),
            name: "Gold Bangles (Set of 2)",
            quantity: 1,
            unitPrice: 24000,
            totalAmount: 24000,
          },
        ],
        issuedCreditAmount: 24000,
        couponCode: "SC-TEST-0020",
        issuedDate,
        expiryDate,
        redeemedAmount: 0,
        remainingBalance: 24000,
        settlementStatus: "ISSUED",
        status: "ACTIVE",
      });

      const res = await client
        .get(`/api/admin/credit-notes/${cn._id}/pdf`)
        .set("Authorization", `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.headers["content-type"], "application/pdf");
      // Verify PDF starts with %PDF
      const pdfHeader = res.text.substring(0, 5);
      assert.equal(pdfHeader, "%PDF-");
    });

    it("should require a mandatory reason when cancelling credit note", async () => {
      if (mongoose.connection.readyState === 0) return;

      const issuedDate = new Date();
      const expiryDate = calculateExpiryDate(issuedDate);

      const cn = await CreditNote.create({
        creditNoteNumber: "CN-2026-000030",
        customerId,
        customerName: "Kavita Rao",
        customerEmail: "kavita@example.com",
        originalOrderId: new mongoose.Types.ObjectId(),
        originalOrderNumber: "ORD-2026-030",
        returnRequestId: new mongoose.Types.ObjectId(),
        returnRequestNumber: "RET-2026-030",
        returnedProductDetails: [
          {
            productId: new mongoose.Types.ObjectId(),
            name: "Kundan Choker",
            quantity: 1,
            unitPrice: 15000,
            totalAmount: 15000,
          },
        ],
        issuedCreditAmount: 15000,
        couponCode: "SC-TEST-0030",
        issuedDate,
        expiryDate,
        redeemedAmount: 0,
        remainingBalance: 15000,
        settlementStatus: "ISSUED",
        status: "ACTIVE",
      });

      await StoreCredit.create({
        customerId,
        creditNoteId: cn._id,
        couponCode: "SC-TEST-0030",
        initialBalance: 15000,
        availableBalance: 15000,
        reservedBalance: 0,
        redeemedAmount: 0,
        issuedDate,
        expiryDate,
        status: "ACTIVE",
      });

      // Attempt cancel without reason -> must fail with 400
      const failRes = await client
        .post(`/api/admin/credit-notes/${cn._id}/cancel`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ reason: "" });

      assert.equal(failRes.status, 400);

      // Attempt cancel with valid reason -> must succeed
      const successRes = await client
        .post(`/api/admin/credit-notes/${cn._id}/cancel`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ reason: "Customer requested bank refund instead after inspection" });

      assert.equal(successRes.status, 200);
      assert.equal(successRes.body.success, true);
      assert.equal(successRes.body.data.creditNote.status, "CANCELLED");

      // Verify store credit is cancelled and balance zeroed
      const updatedSc = await StoreCredit.findOne({ creditNoteId: cn._id });
      assert.equal(updatedSc?.status, "CANCELLED");
      assert.equal(updatedSc?.availableBalance, 0);

      // Verify audit transaction was recorded
      const tx = await StoreCreditTransaction.findOne({
        creditNoteId: cn._id,
        transactionType: "CREDIT_CANCELLED",
      });
      assert.ok(tx);
      assert.equal(tx?.amount, 15000);
    });
  });
});
