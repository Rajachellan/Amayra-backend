# Order Lifecycle & State Machines

Unlike simple e-commerce apps that use one generic status field for everything, this system enforces **five separate status domains** linked to the central `Order` document. This prevents illegal business states (e.g. refunding cash that was never collected, or restocking items before warehouse inspection).

---

## 1. Status Domains

### 1. Order Status (`orderStatus`)
Represents the overall fulfillment stage of the order.
- `PENDING`: Order draft created; awaiting online payment capture.
- `CONFIRMED`: Prepaid order successfully captured OR Cash on Delivery (COD) checkout completed.
- `PROCESSING`: Admin has acknowledged the order and is preparing items in the warehouse.
- `SHIPPED`: Forward shipping label booked and package handed over to the courier.
- `OUT_FOR_DELIVERY`: Courier is delivering the items to the customer.
- `DELIVERED`: Courier confirmed package has been successfully delivered.
- `CANCELLED`: Order was cancelled by user (if unpaid) or by admin.
- `RTO`: Courier failed delivery; package is returning to Mairii warehouse.
- `COMPLETED`: Restocking and refund checks finished; order lifecycle completed.

### 2. Payment Status (`paymentStatus`)
Tracks cash collection lifecycles.
- `PENDING`: Initial state for online checkouts.
- `AUTHORIZED`: Online payment authorized by provider.
- `CAPTURED`: Online payment verified and secured.
- `FAILED`: Razorpay payment failed or cancelled by user.
- `COD_PENDING`: Package shipped via COD; cash not yet collected.
- `COD_COLLECTED`: Courier delivered package and collected cash.
- `REFUND_PENDING`: Refund request initialized.
- `REFUNDED`: Online/COD refund completed.
- `REFUND_FAILED`: Online refund failed to process on Razorpay.

### 3. Shipping Status (`shippingStatus`)
Manages forward shipping milestones with Shiprocket.
- `NOT_CREATED`: Shipping label not yet created.
- `CREATED`: Shiprocket order record initialized.
- `COURIER_ASSIGNED`: Courier partner allocated.
- `AWB_GENERATED`: Air Waybill code generated.
- `PICKUP_SCHEDULED`: Courier pickup scheduled.
- `PICKED_UP`: Package picked up by courier.
- `IN_TRANSIT`: Package in transit.
- `OUT_FOR_DELIVERY`: Out for delivery.
- `DELIVERED`: Package delivered.
- `CANCELLED`: Shipping label cancelled by admin.
- `RTO_INITIATED`: Return to Origin process started.
- `RTO_IN_TRANSIT`: RTO package in transit back.
- `RTO_DELIVERED`: RTO package received back at Mairii warehouse.
- `DELIVERY_FAILED`: Courier delivery attempt failed.

### 4. Return Status (`returnStatus`)
Tracks returns from customer checkout back to warehouse.
- `NOT_REQUESTED`: No returns initiated.
- `REQUESTED`: Return request submitted by customer.
- `APPROVED`: Admin approved return; reverse pickup scheduled.
- `REJECTED`: Admin rejected return request.
- `PICKUP_SCHEDULED` / `PICKED_UP` / `RECEIVED`: Courier milestones for reverse shipment.
- `QUALITY_CHECK`: Package received; undergoing physical QC inspection.
- `ACCEPTED`: Quality check passed; restock/refund unlocked.
- `REJECTED_AFTER_INSPECTION`: Quality check failed (e.g. item damaged by customer).
- `COMPLETED`: Restock and refund completed.

### 5. Refund Status (`refundStatus`)
Manages reimbursement statuses.
- `NOT_APPLICABLE`: Default state (no returns).
- `PENDING`: Quality check accepted; awaiting refund trigger.
- `PROCESSING`: Refund request submitted to Razorpay or bank.
- `COMPLETED`: Refund completed successfully.
- `FAILED`: Refund failed.

---

## 2. Order History Audit Trail

Every state transition is written to the `OrderHistory` collection. This creates a chronological log of who triggered what, making debugging and inventory reconciliations straightforward:

- **ORDER_CREATED**: Customer checked out.
- **PAYMENT_CAPTURED**: Prepaid online payment captured by webhook/client verification.
- **SHIPMENT_BOOKED**: Admin booked shipment via Shiprocket.
- **SHIPMENT_DELIVERED**: Courier webhook delivered confirmation.
- **RETURN_REQUESTED**: Customer initiated a return.
- **RETURN_ACCEPTED**: Admin completed warehouse QC and approved restocking.
- **REFUND_COMPLETED**: Razorpay refund confirmed.
