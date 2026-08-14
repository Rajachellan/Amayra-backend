import mongoose from "mongoose";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { Product } from "../models/Product.js";
import { Customer } from "../models/Customer.js";
import { Order } from "../models/Order.js";
import { Payment } from "../models/Payment.js";
import { Return } from "./../modules/return/model.js";
import { InventoryLedger } from "./../modules/inventory/model.js";
import { OrderHistory } from "./../modules/order/order-history.model.js";

import { buildOrderDraft, createPendingOrderFromDraft } from "../modules/checkout/service.js";
import { processPrepaidPaymentCapture } from "../modules/payment/payment.service.js";
import { createCodOrderFromDraft } from "../modules/checkout/service.js";
import { approveReturn, createReturnRequest, receiveReturn, inspectReturn, refundReturn } from "../modules/return/return.service.js";
import { processShiprocketTrackingUpdate } from "../modules/shipping/shipping.service.js";
import { logger } from "../config/logger.js";

async function verifyAll() {
  logger.info("Starting order lifecycle verification test...");
  // Reference Customer to force registration
  const customerName = Customer.modelName;
  await connectDatabase();
  logger.info(`Registered models: ${mongoose.modelNames().join(", ")}, customerModel: ${customerName}`);

  // Create a clean dummy product for testing
  const dummyProduct = await Product.create({
    name: "Verification Test Diamond Ring",
    slug: `test-ring-${Date.now()}`,
    price: 5000,
    salePrice: 4500,
    stock: 20,
    category: new mongoose.Types.ObjectId(),
    status: "published",
  });

  logger.info(`Test Product created: ${dummyProduct.name} with stock: ${dummyProduct.stock}`);

  const customerId = new mongoose.Types.ObjectId().toString();

  // 1. PREPAID FLOW TEST
  logger.info("\n--- TESTING PREPAID WORKFLOW ---");
  const draft = await buildOrderDraft(
    new mongoose.Types.ObjectId(customerId),
    [{ slug: dummyProduct.slug, quantity: 2 }],
    {
      fullName: "Tanja Tester",
      phone: "9988776655",
      line1: "Flat 402, Sparkle Apartments",
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400001",
      country: "IN",
    }
  );

  const { order: prepaidOrder, payment: prepaidPayment } = await createPendingOrderFromDraft({
    customerId,
    draft,
    shippingAddress: {
      fullName: "Tanja Tester",
      phone: "9988776655",
      line1: "Flat 402, Sparkle Apartments",
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400001",
      country: "IN",
    },
    razorpayOrderId: `rz_order_${Date.now()}`,
  });

  // Verify initial state
  if (prepaidOrder.orderStatus !== "PENDING" || prepaidOrder.paymentStatus !== "PENDING") {
    throw new Error("Prepaid order should start with PENDING order and payment status");
  }

  // Simulate payment capture webhook
  await processPrepaidPaymentCapture({
    paymentDocId: prepaidPayment._id,
    razorpayPaymentId: `rz_pay_${Date.now()}`,
    method: "card",
  });

  // Verify stock decremented
  const productAfterPrepaid = await Product.findById(dummyProduct._id);
  if (!productAfterPrepaid || productAfterPrepaid.stock !== 18) {
    throw new Error(`Expected available stock to be 18, got: ${productAfterPrepaid?.stock}`);
  }

  // Verify ledger entry
  const saleLedger = await InventoryLedger.findOne({
    productId: dummyProduct._id,
    type: "SALE",
    referenceId: prepaidOrder._id,
  });
  if (!saleLedger || saleLedger.quantity !== -2) {
    throw new Error("SALE inventory ledger entry missing or incorrect");
  }

  const updatedPrepaid = await Order.findById(prepaidOrder._id);
  if (updatedPrepaid?.orderStatus !== "CONFIRMED" || updatedPrepaid.paymentStatus !== "CAPTURED") {
    throw new Error(`Prepaid order status transitions failed: ${updatedPrepaid?.orderStatus}`);
  }
  logger.info("Prepaid Capture & Stock Decrement verified successfully.");

  // 2. COD FLOW TEST
  logger.info("\n--- TESTING COD WORKFLOW ---");
  const codDraft = await buildOrderDraft(
    new mongoose.Types.ObjectId(customerId),
    [{ slug: dummyProduct.slug, quantity: 3 }],
    {
      fullName: "Tanja Tester",
      phone: "9988776655",
      line1: "Flat 402, Sparkle Apartments",
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400001",
      country: "IN",
    }
  );

  const codOrder = await createCodOrderFromDraft({
    customerId,
    draft: codDraft,
    shippingAddress: {
      fullName: "Tanja Tester",
      phone: "9988776655",
      line1: "Flat 402, Sparkle Apartments",
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400001",
      country: "IN",
    },
  });

  // Verify stock decremented immediately for COD
  const productAfterCod = await Product.findById(dummyProduct._id);
  if (!productAfterCod || productAfterCod.stock !== 15) {
    throw new Error(`Expected available stock to be 15, got: ${productAfterCod?.stock}`);
  }

  if (codOrder.orderStatus !== "CONFIRMED" || codOrder.paymentStatus !== "COD_PENDING") {
    throw new Error(`COD order start statuses incorrect: ${codOrder.orderStatus}`);
  }

  // Simulate Shiprocket webhook delivery updates
  const testAwb = `awb_${Date.now()}`;
  codOrder.shippingInfo.awbCode = testAwb;
  await codOrder.save();

  await processShiprocketTrackingUpdate(testAwb, "DELIVERED", {
    edd: new Date(),
  });

  const deliveredCod = await Order.findById(codOrder._id);
  if (
    deliveredCod?.orderStatus !== "DELIVERED" ||
    deliveredCod.paymentStatus !== "COD_COLLECTED"
  ) {
    throw new Error(
      `COD delivery status transition incorrect: ${deliveredCod?.orderStatus}, paymentStatus: ${deliveredCod?.paymentStatus}`
    );
  }
  logger.info("COD Order Creation, immediate stock decrement, and delivery collection verified.");

  // 3. RETURNS & RESTOCKING TEST (GOOD CONDITION)
  logger.info("\n--- TESTING RETURN (GOOD CONDITION) WORKFLOW ---");
  const returnDoc = await createReturnRequest({
    customerId,
    orderId: deliveredCod._id.toString(),
    items: [{ product: dummyProduct._id.toString(), quantity: 1 }],
    reason: "DONT_LIKE",
    description: "Looks too big on my finger.",
  });

  if (returnDoc.status !== "REQUESTED") {
    throw new Error("Return request should start with REQUESTED status");
  }

  // Approve Return
  await approveReturn(returnDoc._id.toString(), new mongoose.Types.ObjectId().toString());
  
  // Receive Return
  await receiveReturn(returnDoc._id.toString(), new mongoose.Types.ObjectId().toString());

  // Inspect Return (Result: ACCEPTED, Condition: GOOD)
  await inspectReturn(
    returnDoc._id.toString(),
    {
      condition: "GOOD",
      result: "ACCEPTED",
      comment: "Product is in pristine condition. Restocking to available inventory.",
    },
    new mongoose.Types.ObjectId().toString()
  );

  // Verify stock incremented
  const productAfterRestock = await Product.findById(dummyProduct._id);
  if (!productAfterRestock || productAfterRestock.stock !== 16) {
    throw new Error(`Expected available stock to be 16 after restock, got: ${productAfterRestock?.stock}`);
  }

  // Verify return restocking ledger entry
  const restockLedger = await InventoryLedger.findOne({
    productId: dummyProduct._id,
    type: "RETURN_RESTOCK",
    referenceId: returnDoc._id,
  });
  if (!restockLedger || restockLedger.quantity !== 1) {
    throw new Error("RETURN_RESTOCK inventory ledger entry missing or incorrect");
  }

  // Process Refund for COD return
  await refundReturn(returnDoc._id.toString(), {
    refundMethod: "UPI",
    refundAccountReference: "tanja@upi",
  });

  const finalizedReturn = await Return.findById(returnDoc._id);
  const finalizedOrder = await Order.findById(deliveredCod._id);
  if (finalizedReturn?.status !== "COMPLETED" || finalizedOrder?.returnStatus !== "COMPLETED") {
    throw new Error("Return completion status transition failed");
  }
  logger.info("Return request approval, receipt, GOOD inspection restock, and refund verified.");

  // Cleanup test data
  await Product.deleteOne({ _id: dummyProduct._id });
  await Order.deleteMany({ _id: { $in: [prepaidOrder._id, codOrder._id] } });
  await Payment.deleteMany({ order: { $in: [prepaidOrder._id, codOrder._id] } });
  await Return.deleteOne({ _id: returnDoc._id });
  await InventoryLedger.deleteMany({ referenceId: { $in: [prepaidOrder._id, codOrder._id, returnDoc._id] } });
  await OrderHistory.deleteMany({ orderId: { $in: [prepaidOrder._id, codOrder._id] } });

  logger.info("\n=== ALL LIFECYCLE WORKFLOWS VERIFIED SUCCESSFULLY ===");
}

verifyAll()
  .then(async () => {
    logger.info("Test execution completed successfully.");
    await disconnectDatabase();
    process.exit(0);
  })
  .catch(async (err) => {
    logger.error({ err }, "Lifecycle verification test failed!");
    try {
      await disconnectDatabase();
    } catch {}
    process.exit(1);
  });
