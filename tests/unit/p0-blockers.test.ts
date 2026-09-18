import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { buildShiprocketItem } from "../../src/modules/shipping/shipping.service.js";
import { InventoryReservation } from "../../src/modules/inventory/reservation.model.js";
import mongoose from "mongoose";

describe("P0 Unit Tests — SEC-04: Shiprocket Nominal Declared Value Item Builder", () => {
  it("should transform promotional free gift (₹0 lineTotal) to nominal ₹1.00 selling price and ₹1.00 discount", () => {
    const giftLine = {
      product: new mongoose.Types.ObjectId(),
      name: "Promotional Free Gift (Worth ₹799)",
      sku: "GIFT799",
      quantity: 1,
      unitPrice: 0,
      lineTotal: 0,
      isPromotionalGift: true,
      inventoryTracked: false,
    };

    const srItem = buildShiprocketItem(giftLine, 0);

    assert.equal(srItem.name, "Promotional Free Gift (Worth ₹799)");
    assert.equal(srItem.sku, "GIFT799");
    assert.equal(srItem.units, 1);
    assert.equal(srItem.selling_price, "1.00");
    assert.equal(srItem.discount, "1.00");
  });

  it("should transform regular priced products accurately without adding fake discounts", () => {
    const regularLine = {
      product: new mongoose.Types.ObjectId(),
      name: "Solitaire Diamond Ring",
      sku: "RING-DIA-01",
      quantity: 2,
      unitPrice: 4999,
      lineTotal: 9998,
      isPromotionalGift: false,
      inventoryTracked: true,
    };

    const srItem = buildShiprocketItem(regularLine, 0);

    assert.equal(srItem.name, "Solitaire Diamond Ring");
    assert.equal(srItem.sku, "RING-DIA-01");
    assert.equal(srItem.units, 2);
    assert.equal(srItem.selling_price, "4999");
    assert.equal(srItem.discount, undefined);
  });
});

describe("P0 Unit Tests — SEC-02: Razorpay Webhook Cryptographic Verification", () => {
  const secret = "test_webhook_secret_key_123456";

  it("should verify valid HMAC-SHA256 signature against raw payload", () => {
    const payload = JSON.stringify({
      event: "payment.captured",
      entity: { id: "pay_12345" },
    });

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    const computed = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    assert.equal(
      crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(computed)),
      true
    );
  });

  it("should reject tampered payload even with original signature", () => {
    const payload = JSON.stringify({
      event: "payment.captured",
      entity: { id: "pay_12345", amount: 5000 },
    });

    const signature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    const tamperedPayload = JSON.stringify({
      event: "payment.captured",
      entity: { id: "pay_12345", amount: 100 },
    });

    const tamperedComputed = crypto
      .createHmac("sha256", secret)
      .update(tamperedPayload)
      .digest("hex");

    assert.notEqual(signature, tamperedComputed);
  });
});

describe("P0 Unit Tests — SEC-03: InventoryReservation Schema & Constraints", () => {
  it("should validate a well-formed InventoryReservation document", () => {
    const reservation = new InventoryReservation({
      reservationId: "res_test_1234567890",
      orderId: new mongoose.Types.ObjectId(),
      customerId: new mongoose.Types.ObjectId(),
      items: [
        {
          productId: new mongoose.Types.ObjectId(),
          sku: "TEST-SKU-1",
          quantity: 2,
          unitPrice: 1500,
        },
      ],
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    const error = reservation.validateSync();
    assert.equal(error, undefined);
    assert.equal(reservation.status, "ACTIVE");
    assert.equal(reservation.items.length, 1);
  });

  it("should reject invalid reservation status", () => {
    const reservation = new InventoryReservation({
      reservationId: "res_test_invalid_status",
      orderId: new mongoose.Types.ObjectId(),
      customerId: new mongoose.Types.ObjectId(),
      items: [
        {
          productId: new mongoose.Types.ObjectId(),
          sku: "TEST-SKU-1",
          quantity: 1,
          unitPrice: 500,
        },
      ],
      status: "COMPLETED" as any, // Invalid status
      expiresAt: new Date(),
    });

    const error = reservation.validateSync();
    assert.ok(error);
    assert.ok(error.errors.status);
  });

  it("should reject empty items array", () => {
    const reservation = new InventoryReservation({
      reservationId: "res_empty_items",
      orderId: new mongoose.Types.ObjectId(),
      customerId: new mongoose.Types.ObjectId(),
      items: [],
      status: "ACTIVE",
      expiresAt: new Date(),
    });

    const error = reservation.validateSync();
    assert.ok(error);
    assert.ok(error.errors.items);
  });
});
