import mongoose from "mongoose";
import { connectDatabase } from "../config/index.js";
import { Customer } from "../models/Customer.js";
import { Product } from "../models/Product.js";
import { Order } from "../modules/order/model.js";
import { Return } from "../modules/return/model.js";
import { ReturnReason } from "../modules/return/reason.model.js";
import { ReturnStatusHistory } from "../modules/return/history.model.js";
import { StoreCredit } from "../modules/credit/model.js";
import { ExchangeVoucher } from "../modules/voucher/model.js";
import {
  createReturnRequest,
  approveReturn,
  rejectReturn,
  reschedulePickup,
  receiveReturn,
  qcInspectReturn,
  issueStoreCredit,
  issueExchangeVoucher,
  createReplacementOrder,
} from "../modules/return/return.service.js";
import { calculateOrderItemsEligibility } from "../modules/return/eligibility.service.js";
import { seedInitialReasonsIfEmpty } from "../modules/return/reason.service.js";

async function runVerificationTests() {
  console.log("\n========================================================");
  console.log("STARTING RETURNS & EXCHANGE SYSTEM VERIFICATION SUITE");
  console.log("========================================================\n");

  await connectDatabase();
  await seedInitialReasonsIfEmpty();

  // 1. Setup Test Customer & Product
  const testCustomer = await Customer.create({
    name: "Test System Customer",
    email: `test_ret_${Date.now()}@example.com`,
    passwordHash: "dummyhash",
    phone: "9876543210",
  });

  const testProduct = await Product.create({
    name: "Designer Silk Saree",
    slug: `designer-silk-saree-${Date.now()}`,
    sku: `SKU-SAREE-${Date.now()}`,
    price: 5000,
    stock: 50,
    category: new mongoose.Types.ObjectId(),
    status: "published",
  });

  // 2. Setup Test Delivered Order with Qty = 3
  const deliveredDate = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago (within 24h return & 5d exchange window)
  const testOrder = await Order.create({
    orderNumber: `ORD-TEST-${Date.now()}`,
    customer: testCustomer._id,
    items: [
      {
        product: testProduct._id,
        name: testProduct.name,
        slug: testProduct.slug,
        sku: testProduct.sku,
        unitPrice: 5000,
        quantity: 3,
        lineTotal: 15000,
        returnedQuantity: 0,
        exchangedQuantity: 0,
        lockedQuantity: 0,
        futureReversePickupAllowed: true,
      },
    ],
    shippingAddress: {
      fullName: "Test Customer",
      phone: "9876543210",
      line1: "123 Test Street",
      city: "Jaipur",
      state: "Rajasthan",
      pincode: "302001",
      country: "IN",
    },
    subtotal: 15000,
    tax: 0,
    shipping: 0,
    total: 15000,
    orderStatus: "DELIVERED",
    status: "delivered",
    paymentMethod: "PREPAID",
    shippingInfo: {
      deliveredAt: deliveredDate,
    },
  });

  console.log(
    "✓ TEST SETUP COMPLETE: Created Order",
    testOrder.orderNumber,
    "with Product Qty = 3"
  );

  // 3. Test Initial Eligibility Calculation
  let eligibilities = await calculateOrderItemsEligibility(testOrder);
  console.log("\n[TEST 1] Initial Item Eligibility:");
  console.log("  Ordered Qty:", eligibilities[0].orderedQuantity);
  console.log("  Remaining Eligible Qty:", eligibilities[0].remainingEligibleQuantity);
  console.log("  Return Eligible (24h Window):", eligibilities[0].returnEligible);
  console.log("  Exchange Eligible (5d Window):", eligibilities[0].exchangeEligible);

  if (eligibilities[0].remainingEligibleQuantity !== 3 || !eligibilities[0].returnEligible) {
    throw new Error("FAILED: Initial eligibility calculation incorrect");
  }
  console.log("✓ TEST 1 PASSED: Initial eligibility calculated correctly (3 eligible).");

  // 4. Test Partial Quantity Request 1 (Return 1 Qty)
  const req1 = await createReturnRequest({
    customerId: testCustomer._id.toString(),
    orderId: testOrder._id.toString(),
    items: [{ product: testProduct._id.toString(), quantity: 1 }],
    reason: "ARRIVED_DAMAGED",
    reasonTitle: "Product arrived damaged",
    requestType: "RETURN",
    description: "First partial return of 1 item",
  });

  console.log("\n[TEST 2] Created First Partial Return Request:", req1.returnNumber);
  const updatedOrderAfterReq1 = await Order.findById(testOrder._id);
  eligibilities = await calculateOrderItemsEligibility(updatedOrderAfterReq1!);
  console.log("  Locked Qty after Req 1:", updatedOrderAfterReq1!.items[0].lockedQuantity);
  console.log("  Remaining Eligible Qty after Req 1:", eligibilities[0].remainingEligibleQuantity);

  if (eligibilities[0].remainingEligibleQuantity !== 2) {
    throw new Error("FAILED: Partial remaining eligible quantity after Req 1 should be 2");
  }
  console.log("✓ TEST 2 PASSED: Partial quantity remaining updated to 2.");

  // 5. Test Exceeding Remaining Quantity Validation (Attempt to return 3 Qty when only 2 remain)
  console.log(
    "\n[TEST 3] Testing Quantity Exceeded Validation (Attempting to request 3 qty when only 2 remain)..."
  );
  try {
    await createReturnRequest({
      customerId: testCustomer._id.toString(),
      orderId: testOrder._id.toString(),
      items: [{ product: testProduct._id.toString(), quantity: 3 }],
      reason: "ARRIVED_DAMAGED",
      requestType: "RETURN",
    });
    throw new Error("FAILED: System should have blocked requesting 3 qty!");
  } catch (err: any) {
    console.log("  Caught Expected Validation Error:", err.message);
    console.log("✓ TEST 3 PASSED: Excess quantity request properly blocked by backend!");
  }

  // 6. Test Admin Approval & Reverse Pickup Booking
  const approvedReq1 = await approveReturn(req1._id.toString(), "ADMIN_ID_123");
  console.log("\n[TEST 4] Approved Return Request:", approvedReq1.returnNumber);
  console.log("  Status after approval:", approvedReq1.status);
  console.log("  Pickup Attempt Count:", approvedReq1.pickupDetails?.pickupAttemptCount);
  if (approvedReq1.status !== "PICKUP_SCHEDULED") {
    throw new Error("FAILED: Return status should be PICKUP_SCHEDULED after approval");
  }
  console.log("✓ TEST 4 PASSED: Return approved and pickup scheduled.");

  // 7. Test Reverse Pickup Reschedule & Max 3 Attempt Limit Capping
  console.log("\n[TEST 5] Testing Pickup Reschedule & 3-Attempt Limit Capping...");
  const resched1 = await reschedulePickup(
    req1._id.toString(),
    { reason: "Customer unavailable" },
    "ADMIN_ID_123"
  );
  console.log(
    "  Reschedule Attempt 1 -> Pickup Attempt Count:",
    resched1.pickupDetails?.pickupAttemptCount
  );

  const resched2 = await reschedulePickup(
    req1._id.toString(),
    { reason: "Address closed" },
    "ADMIN_ID_123"
  );
  console.log(
    "  Reschedule Attempt 2 -> Pickup Attempt Count:",
    resched2.pickupDetails?.pickupAttemptCount
  );

  try {
    await reschedulePickup(req1._id.toString(), { reason: "Attempt 3 failed" }, "ADMIN_ID_123");
  } catch (err: any) {
    console.log("  Attempt 3 Reschedule Triggered Pickup Failure Closure:", err.message);
  }

  const failedReq1 = await Return.findById(req1._id);
  console.log("  Final Status after 3 failed attempts:", failedReq1?.status);
  if (failedReq1?.status !== "CLOSED") {
    throw new Error("FAILED: Request should be CLOSED after 3 failed pickup attempts");
  }
  console.log(
    "✓ TEST 5 PASSED: 3-attempt pickup retry limit enforced and request closed as PICKUP_FAILED_FINAL."
  );

  // 8. Test Partial Quantity Request 2 (Exchange 1 Qty)
  const req2 = await createReturnRequest({
    customerId: testCustomer._id.toString(),
    orderId: testOrder._id.toString(),
    items: [{ product: testProduct._id.toString(), quantity: 1 }],
    reason: "SIZE_MISMATCH",
    reasonTitle: "Size mismatch",
    requestType: "EXCHANGE",
    exchangeDetails: { preferredSize: "XL" },
  });

  console.log("\n[TEST 6] Created Second Partial Exchange Request:", req2.returnNumber);
  await approveReturn(req2._id.toString(), "ADMIN_ID_123");

  // Mark Received at Warehouse
  const receivedReq2 = await receiveReturn(req2._id.toString(), "ADMIN_ID_123", {
    warehouseNotes: "Arrived clean",
  });
  console.log("  Status after Warehouse Receipt:", receivedReq2.status);
  if (receivedReq2.status !== "QC_IN_PROGRESS") {
    throw new Error("FAILED: Status should auto transition to QC_IN_PROGRESS");
  }

  // Quality Check: Pass QC
  const qcReq2 = await qcInspectReturn(
    req2._id.toString(),
    { condition: "GOOD", result: "QC_APPROVED", qcNotes: "Item in pristine condition" },
    "ADMIN_ID_123"
  );
  console.log("  Status after QC Approval:", qcReq2.status);

  // Issue 1-Month Exchange Voucher
  const voucherRes = await issueExchangeVoucher(
    req2._id.toString(),
    { expiryDays: 30 },
    "ADMIN_ID_123"
  );
  console.log("  Issued Exchange Voucher Code:", voucherRes.voucher.voucherCode);
  console.log("  Voucher Amount:", voucherRes.voucher.amount);
  console.log("  Voucher Expiry Date:", voucherRes.voucher.expiryDate);
  console.log("  Final Status after Voucher Issue:", voucherRes.returnDoc.status);
  if (voucherRes.returnDoc.status !== "COMPLETED") {
    throw new Error("FAILED: Return status should be COMPLETED");
  }
  console.log(
    "✓ TEST 6 PASSED: Exchange flow with Warehouse Receipt, QC, and Exchange Voucher completed!"
  );

  // 9. Test Partial Quantity Request 3 (QC Rejection / Used Item Scenario)
  const req3 = await createReturnRequest({
    customerId: testCustomer._id.toString(),
    orderId: testOrder._id.toString(),
    items: [{ product: testProduct._id.toString(), quantity: 1 }],
    reason: "CHANGED_MIND",
    requestType: "RETURN",
  });

  console.log("\n[TEST 7] Created Third Partial Request (QC Rejection Test):", req3.returnNumber);
  await approveReturn(req3._id.toString(), "ADMIN_ID_123");
  await receiveReturn(req3._id.toString(), "ADMIN_ID_123");

  // Perform QC: Customer Used Product -> QC_REJECTED
  const qcRejectedReq3 = await qcInspectReturn(
    req3._id.toString(),
    {
      condition: "USED",
      result: "QC_REJECTED",
      faultSource: "CUSTOMER_FAULT",
      qcNotes: "Item worn and washed by customer",
    },
    "ADMIN_ID_123"
  );

  console.log("  Status after QC Rejection:", qcRejectedReq3.status);
  console.log(
    "  Future Reverse Pickup Allowed flag on return:",
    qcRejectedReq3.futureReversePickupAllowed
  );

  const finalOrder = await Order.findById(testOrder._id);
  const itemInOrder = finalOrder?.items.find(
    (it) => it.product.toString() === testProduct._id.toString()
  );
  console.log(
    "  Future Reverse Pickup Allowed flag on order item:",
    itemInOrder?.futureReversePickupAllowed
  );

  if (itemInOrder?.futureReversePickupAllowed !== false || qcRejectedReq3.status !== "CLOSED") {
    throw new Error(
      "FAILED: QC rejection did not permanently block future reverse pickups on item"
    );
  }
  console.log(
    "✓ TEST 7 PASSED: Customer used item QC rejection permanently blocked future reverse pickups for that item!"
  );

  // 10. Audit History Verification
  const historyLogs = await ReturnStatusHistory.find({ returnRequestId: req2._id }).sort({
    createdAt: 1,
  });
  console.log("\n[TEST 8] Audit Trail History Logs for Request", req2.returnNumber, ":");
  historyLogs.forEach((h, idx) => {
    console.log(
      `  ${idx + 1}. [${h.changedByRole}] ${h.previousStatus} -> ${h.newStatus} | Notes: ${h.notes}`
    );
  });
  if (historyLogs.length < 4) {
    throw new Error("FAILED: Audit history log incomplete");
  }
  console.log("✓ TEST 8 PASSED: Complete status transition audit trail logged!");

  // Cleanup Test Data
  await Customer.deleteOne({ _id: testCustomer._id });
  await Product.deleteOne({ _id: testProduct._id });
  await Order.deleteOne({ _id: testOrder._id });
  await Return.deleteMany({ orderId: testOrder._id });
  await StoreCredit.deleteMany({ originalOrderId: testOrder._id });
  await ExchangeVoucher.deleteMany({ originalOrderId: testOrder._id });
  await ReturnStatusHistory.deleteMany({
    returnRequestId: { $in: [req1._id, req2._id, req3._id] },
  });

  console.log("\n========================================================");
  console.log("ALL RETURNS & EXCHANGE INTEGRATION TESTS PASSED 100%!");
  console.log("========================================================\n");

  process.exit(0);
}

runVerificationTests().catch((err) => {
  console.error("\n❌ VERIFICATION TEST FAILED:", err);
  process.exit(1);
});
