import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import crypto from "node:crypto";
import {
  setupTestDatabase,
  teardownTestDatabase,
  getTestClient,
} from "./setup.js";
import { Product } from "../../src/models/Product.js";
import { Order } from "../../src/models/Order.js";
import { Payment } from "../../src/models/Payment.js";
import { InventoryReservation } from "../../src/modules/inventory/reservation.model.js";
import { InventoryLedger } from "../../src/modules/inventory/model.js";
import { OrderHistory } from "../../src/modules/order/order-history.model.js";
import { WebhookEvent } from "../../src/modules/webhook/webhook-event.model.js";
import {
  createInventoryReservations,
  convertReservationsToSale,
  releaseInventoryReservations,
} from "../../src/modules/inventory/inventory.service.js";
import { processExpiredReservations } from "../../src/modules/inventory/reservation-expiry.worker.js";
import { seedPromotionalGift } from "../../src/seed/seed-promotional-gift.js";

describe("P0 Integration Tests — MaiRii Jewellery E-Commerce Blockers", () => {
  const client = getTestClient();
  const testCategory = new mongoose.Types.ObjectId();

  before(async () => {
    await setupTestDatabase();
  });

  after(async () => {
    await Promise.all([
      Product.deleteMany({}),
      Order.deleteMany({}),
      Payment.deleteMany({}),
      InventoryReservation.deleteMany({}),
      InventoryLedger.deleteMany({}),
      OrderHistory.deleteMany({}),
      WebhookEvent.deleteMany({}),
    ]);
  });

  beforeEach(async () => {
    await Promise.all([
      Product.deleteMany({}),
      Order.deleteMany({}),
      Payment.deleteMany({}),
      InventoryReservation.deleteMany({}),
      InventoryLedger.deleteMany({}),
      OrderHistory.deleteMany({}),
      WebhookEvent.deleteMany({}),
    ]);
  });

  describe("SEC-03: Concurrency & Overselling Prevention", () => {
    it("should allow exactly 1 reservation to succeed and reject 9 others when stock = 1", async () => {
      const product = await Product.create({
        name: "Exclusive Gold Necklace",
        slug: "exclusive-gold-necklace",
        sku: "NECK-GOLD-001",
        category: testCategory,
        price: 15999,
        stock: 1,
        reservedStock: 0,
        inventoryTracked: true,
        isPromotionalGift: false,
        status: "published",
      });

      const customerId = new mongoose.Types.ObjectId();
      const results: Array<{ success: boolean; error?: string }> = [];

      // Run 10 parallel reservation attempts for quantity 1
      const attempts = Array.from({ length: 10 }).map(async () => {
        const orderId = new mongoose.Types.ObjectId();
        try {
          const res = await createInventoryReservations(
            null,
            customerId,
            orderId,
            [
              {
                product: product._id,
                sku: product.sku ?? undefined,
                quantity: 1,
                unitPrice: product.price,
              },
            ]
          );
          if (res) {
            results.push({ success: true });
          }
        } catch (err: any) {
          results.push({ success: false, error: err.message });
        }
      });

      await Promise.all(attempts);

      const successfulReservations = results.filter((r) => r.success);
      const failedReservations = results.filter((r) => !r.success);

      assert.equal(successfulReservations.length, 1, "Exactly 1 reservation must succeed");
      assert.equal(failedReservations.length, 9, "Exactly 9 reservations must fail");

      // Verify product stock counters
      const updatedProduct = await Product.findById(product._id);
      assert.equal(updatedProduct?.stock, 0, "Stock must decrement from 1 to 0");
      assert.equal(updatedProduct?.reservedStock, 1, "ReservedStock must increment from 0 to 1");
    });
  });

  describe("SEC-03: No-Double-Deduction & Stock Accounting", () => {
    it("should decrement available stock at checkout, decrement reservedStock at payment capture, and never double deduct", async () => {
      const product = await Product.create({
        name: "Emerald Solitaire Ring",
        slug: "emerald-solitaire-ring",
        sku: "RING-EM-01",
        category: testCategory,
        price: 8999,
        stock: 10,
        reservedStock: 0,
        soldCount: 0,
        inventoryTracked: true,
        isPromotionalGift: false,
        status: "published",
      });

      const customerId = new mongoose.Types.ObjectId();
      const orderId = new mongoose.Types.ObjectId();

      // 1. Checkout reservation of quantity 2
      const reservation = await createInventoryReservations(
        null,
        customerId,
        orderId,
        [
          {
            product: product._id,
            sku: product.sku ?? undefined,
            quantity: 2,
            unitPrice: product.price,
          },
        ]
      );
      assert.ok(reservation);
      assert.equal(reservation.status, "ACTIVE");

      // Verify stock counters after reservation
      let p = await Product.findById(product._id);
      assert.equal(p?.stock, 8, "Available stock must be 8");
      assert.equal(p?.reservedStock, 2, "Reserved stock must be 2");
      assert.equal(p?.soldCount, 0, "SoldCount must remain 0 before payment");

      // 2. Successful payment capture converts reservation to sale
      const fakeOrder = {
        _id: orderId,
        items: [
          {
            product: product._id,
            sku: product.sku,
            quantity: 2,
            lineTotal: 17998,
          },
        ],
      };

      const convertResult = await convertReservationsToSale(null, fakeOrder, "pay_capture_123");
      assert.equal(convertResult.converted, true);
      assert.equal(convertResult.alreadyDone, false);

      // Verify stock counters after conversion
      p = await Product.findById(product._id);
      assert.equal(p?.stock, 8, "Available stock MUST REMAIN 8 (NO DOUBLE DEDUCTION)");
      assert.equal(p?.reservedStock, 0, "Reserved stock must decrement to 0");
      assert.equal(p?.soldCount, 2, "SoldCount must increase by 2");

      // Verify official SALE inventory ledger entry
      const ledgers = await InventoryLedger.find({ referenceId: orderId, type: "SALE" });
      assert.equal(ledgers.length, 1);
      assert.equal(ledgers[0].quantity, -2);
      assert.equal(ledgers[0].previousStock, 8);
      assert.equal(ledgers[0].newStock, 8);

      // 3. Idempotent payment capture retry
      const retryResult = await convertReservationsToSale(null, fakeOrder, "pay_capture_123");
      assert.equal(retryResult.converted, false);
      assert.equal(retryResult.alreadyDone, true);

      // Verify no extra ledger entries created
      const ledgersAfterRetry = await InventoryLedger.find({ referenceId: orderId });
      assert.equal(ledgersAfterRetry.length, 1);
    });
  });

  describe("SEC-03: Expiry Worker Stock Restoration", () => {
    it("should claim expired reservations atomically and restore stock exactly once", async () => {
      const product = await Product.create({
        name: "Sapphire Pendant",
        slug: "sapphire-pendant",
        sku: "PEND-SAP-01",
        category: testCategory,
        price: 5499,
        stock: 5,
        reservedStock: 0,
        inventoryTracked: true,
        isPromotionalGift: false,
        status: "published",
      });

      const customerId = new mongoose.Types.ObjectId();
      const orderId = new mongoose.Types.ObjectId();

      // Create reservation that expired in the past
      await Product.updateOne(
        { _id: product._id },
        { $inc: { stock: -2, reservedStock: 2 } }
      );

      const reservation = await InventoryReservation.create({
        reservationId: "res_expired_test_01",
        orderId,
        customerId,
        items: [
          {
            productId: product._id,
            sku: product.sku,
            quantity: 2,
            unitPrice: product.price,
          },
        ],
        status: "ACTIVE",
        expiresAt: new Date(Date.now() - 60000), // 1 minute ago
      });

      // Run worker cycle
      const processed = await processExpiredReservations();
      assert.equal(processed, 1, "Should process 1 expired reservation");

      // Verify status changed to EXPIRED
      const updatedReservation = await InventoryReservation.findById(reservation._id);
      assert.equal(updatedReservation?.status, "EXPIRED");
      assert.equal(updatedReservation?.releaseReason, "RESERVATION_TIMEOUT");

      // Verify stock was restored
      const updatedProduct = await Product.findById(product._id);
      assert.equal(updatedProduct?.stock, 5, "Stock restored from 3 to 5");
      assert.equal(updatedProduct?.reservedStock, 0, "Reserved stock decremented from 2 to 0");

      // Verify OrderHistory audit event
      const history = await OrderHistory.findOne({ orderId, eventType: "RESERVATION_EXPIRED" });
      assert.ok(history, "RESERVATION_EXPIRED event must exist in OrderHistory");

      // Run worker cycle again — must not restore stock a second time!
      const processedAgain = await processExpiredReservations();
      assert.equal(processedAgain, 0, "Second worker pass must do nothing");

      const pAfterSecondPass = await Product.findById(product._id);
      assert.equal(pAfterSecondPass?.stock, 5, "Stock must remain 5 (no double restoration)");
    });
  });

  describe("SEC-03: Order Cancellation Reservation Release", () => {
    it("should release active reservations and restore stock once upon cancellation", async () => {
      const product = await Product.create({
        name: "Silver Anklet",
        slug: "silver-anklet",
        sku: "ANK-SIL-01",
        category: testCategory,
        price: 1999,
        stock: 8,
        reservedStock: 2,
        inventoryTracked: true,
        isPromotionalGift: false,
        status: "published",
      });

      const orderId = new mongoose.Types.ObjectId();
      const customerId = new mongoose.Types.ObjectId();

      await InventoryReservation.create({
        reservationId: "res_cancel_test_01",
        orderId,
        customerId,
        items: [
          {
            productId: product._id,
            sku: product.sku,
            quantity: 2,
            unitPrice: product.price,
          },
        ],
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      // Release reservation
      const releaseResult = await releaseInventoryReservations(orderId, "CUSTOMER_CANCELLED");
      assert.equal(releaseResult.released, true);

      // Verify stock restored
      const p = await Product.findById(product._id);
      assert.equal(p?.stock, 10, "Stock restored from 8 to 10");
      assert.equal(p?.reservedStock, 0, "Reserved stock decremented to 0");

      // Repeat release — should safely return false without second restoration
      const secondRelease = await releaseInventoryReservations(orderId, "CUSTOMER_CANCELLED");
      assert.equal(secondRelease.released, false);

      const p2 = await Product.findById(product._id);
      assert.equal(p2?.stock, 10, "Stock remains 10");
    });
  });

  describe("SEC-01: Promotional Free Gift Non-Inventory Behavior", () => {
    it("should seed GIFT799, skip stock deduction, skip ledger entry, and record PROMOTIONAL_GIFT_DISPATCH", async () => {
      // 1. Seed GIFT799
      const giftProduct = await seedPromotionalGift();
      assert.ok(giftProduct);
      assert.equal(giftProduct.sku, "GIFT799");
      assert.equal(giftProduct.inventoryTracked, false);
      assert.equal(giftProduct.isPromotionalGift, true);

      const regularProduct = await Product.create({
        name: "Bridal Diamond Set",
        slug: "bridal-diamond-set",
        sku: "SET-BR-001",
        category: testCategory,
        price: 7500,
        stock: 5,
        reservedStock: 0,
        inventoryTracked: true,
        isPromotionalGift: false,
        status: "published",
      });

      const customerId = new mongoose.Types.ObjectId();
      const orderId = new mongoose.Types.ObjectId();

      // Reservation with regular product + promotional gift
      const reservation = await createInventoryReservations(
        null,
        customerId,
        orderId,
        [
          {
            product: regularProduct._id,
            sku: regularProduct.sku ?? undefined,
            quantity: 1,
            unitPrice: 7500,
            inventoryTracked: true,
            isPromotionalGift: false,
          },
          {
            product: giftProduct._id,
            sku: "GIFT799",
            name: "Promotional Free Gift (Worth ₹799)",
            quantity: 1,
            unitPrice: 0,
            inventoryTracked: false,
            isPromotionalGift: true,
          },
        ]
      );

      // Regular product has reservation; GIFT799 is NOT in reservation items
      assert.ok(reservation);
      assert.equal(reservation.items.length, 1);
      assert.equal(reservation.items[0].sku, "SET-BR-001");

      // Verify GIFT799 stock is untouched (stock remains 0, reservedStock 0)
      const freshGift = await Product.findById(giftProduct._id);
      assert.equal(freshGift?.stock, 0);
      assert.equal(freshGift?.reservedStock, 0);

      // Verify PROMOTIONAL_GIFT_DISPATCH recorded in OrderHistory
      const giftHistory = await OrderHistory.findOne({
        orderId,
        eventType: "PROMOTIONAL_GIFT_DISPATCH",
      });
      assert.ok(giftHistory, "PROMOTIONAL_GIFT_DISPATCH must be logged in OrderHistory");
      assert.equal(giftHistory.metadata?.sku, "GIFT799");

      // Verify no zero-quantity ledger entries exist
      const zeroLedgers = await InventoryLedger.find({ quantity: 0 });
      assert.equal(zeroLedgers.length, 0, "Zero-quantity ledger entries must never exist");
    });
  });

  describe("SEC-02: Razorpay Webhook Idempotency & Security", () => {
    it("should process webhook on first delivery and return { ok: true, duplicate: true } on replay", async () => {
      process.env.RAZORPAY_WEBHOOK_SECRET = "test_webhook_secret_key_123456";

      const eventPayload = {
        event: "payment.captured",
        event_id: "evt_test_idempotency_001",
        payload: {
          payment: {
            entity: {
              id: "pay_test_capture_999",
              order_id: "order_rzp_test_123",
              amount: 500000,
              status: "captured",
            },
          },
        },
      };

      const rawBody = JSON.stringify(eventPayload);
      const signature = crypto
        .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");

      // First webhook delivery
      const res1 = await client
        .post("/webhooks/razorpay")
        .set("Content-Type", "application/json")
        .set("x-razorpay-signature", signature)
        .send(rawBody);

      assert.equal(res1.status, 200);
      assert.equal(res1.body.ok, true);
      assert.equal(res1.body.duplicate, undefined);

      // Second webhook delivery (replay/retry from Razorpay)
      const res2 = await client
        .post("/webhooks/razorpay")
        .set("Content-Type", "application/json")
        .set("x-razorpay-signature", signature)
        .send(rawBody);

      assert.equal(res2.status, 200);
      assert.equal(res2.body.ok, true);
      assert.equal(res2.body.duplicate, true, "Replay must return duplicate: true");
    });

    it("should reject webhook request with invalid signature (HTTP 400)", async () => {
      process.env.RAZORPAY_WEBHOOK_SECRET = "test_webhook_secret_key_123456";

      const rawBody = JSON.stringify({
        event: "payment.failed",
        event_id: "evt_invalid_sig_001",
      });

      const res = await client
        .post("/webhooks/razorpay")
        .set("Content-Type", "application/json")
        .set("x-razorpay-signature", "invalid_signature_hex_digest")
        .send(rawBody);

      assert.equal(res.status, 400);
      assert.equal(res.body.error, "Invalid signature");
    });

    it("should reject webhook request with missing signature (HTTP 400)", async () => {
      const res = await client
        .post("/webhooks/razorpay")
        .set("Content-Type", "application/json")
        .send(JSON.stringify({ event: "order.paid" }));

      assert.equal(res.status, 400);
      assert.equal(res.body.error, "Missing signature");
    });
  });
});
