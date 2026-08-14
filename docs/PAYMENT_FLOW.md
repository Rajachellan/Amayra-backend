# Prepaid & COD Payment Flows

The platform supports two distinct payment lifecycles: **Prepaid** (via Razorpay) and **Cash on Delivery (COD)**. 

---

## 1. Prepaid Checkout Flow

Online prepaid checkouts must never trust client-side responses alone. The backend uses a two-factor verification method (client verification + Razorpay webhook fallbacks) to ensure all captured payments are valid before restocking or shipping.

```text
Customer Website             Mairii Backend                 Razorpay
       │                            │                           │
       ├─► 1. Click Checkout ───────┼───────────────────────────┤
       │   (Items, Address)         │                           │
       │                            ├─► 2. Create Razorpay order│
       │                            │   (amount, receipt) ─────►│
       │                            ◄─  Returns rz_order_id ────┤
       │                            │                           │
       │◄─ 3. Returns order info ───┤                           │
       │   (rz_order_id, total)     │                           │
       │                            │                           │
       ├─► 4. Open Razorpay Widget ─┼───────────────────────────┼
       │   (Customer Pays)          │                           │
       │                            │                           │
       │◄─ 5. Payment successful ───┼───────────────────────────┤
       │   (rz_pay_id, signature)   │                           │
       │                            │                           │
       ├─► 6. Call /payments/verify ┼───────────────────────────┤
       │   (rz_pay_id, signature)   ├─► 7. Validate signature   │
       │                            ├─► 8. processPrepaidCapture│
       │                            │   - Decrement Stock       │
       │                            │   - Status = CONFIRMED    │
       │                            │   - paymentStatus = CAPTURED
       │                            │   - Log history           │
       │                            │   - Emit Socket.IO        │
       │◄─ 9. Success response ─────┤                           │
       │                            │                           │
       │                            │◄── 10. Webhook (Fallback) ┤
       │                            │    (payment.captured)     │
       │                            ├─► 11. Signature Check     │
       │                            ├─► 12. Idempotency Check   │
       │                            ├─► 13. processPrepaidCapture
       │                            │   (Ignores if already done)
```

### Signature Verification
To verify payment signatures, the backend uses Razorpay's HMAC verification:
```typescript
import { validatePaymentVerification } from "razorpay/dist/utils/razorpay-utils.js";

const valid = validatePaymentVerification(
  { order_id: razorpay_order_id, payment_id: razorpay_payment_id },
  razorpay_signature,
  process.env.RAZORPAY_KEY_SECRET
);
```

---

## 2. Cash on Delivery (COD) Flow

COD payments must **never** be marked as paid or captured at checkout. The money is pending until the courier collects it.

### Step 1: Checkout Creation
- Customer selects `paymentMethod = "COD"`.
- The order is created directly with:
  - `orderStatus = "CONFIRMED"`
  - `paymentStatus = "COD_PENDING"`
  - `status = "processing"` (legacy shim)
  - `paymentInfo.provider = "COD"`
  - `paymentInfo.status = "COD_PENDING"`
  - `paymentInfo.codAmount = total_amount`
- **Stock is decremented immediately** at checkout creation (since the order is already confirmed).
- An audit event `ORDER_CREATED` is logged.

### Step 2: Courier Booking
- Admin books the shipment in Shiprocket.
- The forward courier payload is flagged with:
  - `payment_method = "COD"`
  - `cod_amount = total_amount` (includes product total + tax + shipping).

### Step 3: Courier Delivery
- The courier delivers the package to the customer and collects cash.
- Shiprocket fires a tracking webhook with status `DELIVERED`.
- The backend matches the AWB, and automatically updates:
  - `paymentStatus = "COD_COLLECTED"`
  - `paymentInfo.status = "COD_COLLECTED"`
  - `paymentInfo.codCollectedAt = new Date()`
  - `orderStatus = "DELIVERED"`
  - Emits real-time Socket.IO notifications.
