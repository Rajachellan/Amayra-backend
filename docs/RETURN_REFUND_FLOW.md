# Returns, QC Inspection & Refunds

The returns lifecycle is structured to prevent stock inaccuracies and financial leaks. Refunds and inventory updates are locked until the warehouse physically receives the returned product and verifies its condition.

---

## 1. Complete Returns State Machine

```text
Customer submits Return Request (Status: REQUESTED)
                      │
                      ▼
            Admin Approves Request
   (Status: APPROVED / Reverse Pickup Booked)
                      │
                      ▼
         Courier Picked Up from Customer
            (Status: PICKED_UP)
                      │
                      ▼
          Package Received at Warehouse
             (Status: RECEIVED)
                      │
                      ▼
          Quality Check (QC) Inspection
                      ├──────────────────────────┐
                      ▼                          ▼
                   ACCEPTED                   REJECTED
         (Status: ACCEPTED / RESTOCKED)  (Status: REJECTED_AFTER_INSPECTION)
                      │                          │
                      ▼                          ▼
               Process Refund               No Refund
        - Prepaid: Razorpay Refund API      - Ship package back
        - COD: Record bank settlement       - Record loss
```

---

## 2. Reverse Pickup Booking

When an admin approves a return, the backend automatically schedules a **Reverse Pickup** in Shiprocket using the return details:

- **Pickup address**: Customer's original delivery address.
- **Delivery address**: Mairii warehouse address.
- **Payment Method**: Prepaid (the customer does not pay cash during pickup).
- API Endpoint: `POST /v1/external/orders/create/return`
- Returns: `reverseShipmentId`, `reverseAwb`, and `reverseCourier`.
- The return status transitions to `PICKUP_SCHEDULED`.

---

## 3. Warehouse Receipt & Quality Check (QC)

Once the items are delivered back to the warehouse, the admin marks them as **RECEIVED** and logs a QC inspection:

- **Condition Options**:
  - `GOOD`: Product is in original resellable condition.
  - `DAMAGED`: Product has been damaged.
  - `USED`: Product has visible signs of wear.
  - `MISSING_PARTS`: Jewelry parts are missing.
- **Outcome Options**:
  - `ACCEPTED`: Quality check passed. This unlocks the refund process.
  - `REJECTED`: Quality check failed. Return rejected, no refund processed.

---

## 4. Refund Processing

Refunds are initiated **only** after QC acceptance.

### Prepaid Orders (Razorpay)
1. Admin triggers `/returns/:id/refund`.
2. The refund service calls Razorpay's refund API:
   `POST /v1/payments/<razorpayPaymentId>/refund` with the return amount.
3. The return status moves to `COMPLETED` and the order `refundStatus` is set to `COMPLETED`.
4. Mairii stores `razorpayRefundId` and the processed timestamp.

### COD Orders
1. Razorpay cannot refund cash paid to a courier.
2. The admin gathers refund destination details (Bank Account or UPI ID) from the customer.
3. The details are recorded on the return object.
4. The admin initiates a bank transfer or UPI payout.
5. Once settled, the admin marks refund status as `COMPLETED` and records the settlement reference.
