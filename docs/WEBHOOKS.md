# Webhook Verification & Idempotency

Webhooks are sent asynchronously and can be retried multiple times by third-party providers (Razorpay and Shiprocket). The backend protects itself against duplicate processing using a dedicated idempotency engine.

---

## 1. Webhook Idempotency Registry

Before processing any webhook event, the backend registers the event in the `WebhookEvent` collection.

```text
Incoming Webhook
      │
      ▼
Check WebhookEvent in DB ({ provider, eventId })
      │
      ├─► Found & processed = true  ──► Return HTTP 200 OK (Skip processing)
      │
      ├─► Found & processed = false ──► Retry processing
      │
      └─► Not Found ──► Create record (processed: false) -> Process event
                             │
                             ├─► Success: Set processed = true -> Return HTTP 200 OK
                             │
                             └─► Fail: Log error (processed: false) -> Return HTTP 500
```

This prevents duplicate captures, double-billing, double-restocking, or duplicate order history log writes.

---

## 2. Razorpay Webhooks

- **Endpoint**: `POST /api/webhooks/razorpay` (or `/webhooks/razorpay`)
- **Body Requirement**: Must read the **RAW** request body buffer to verify signatures correctly.
- **Idempotency eventId**: Read from header `x-razorpay-event-id`.

### Signature Checking
```typescript
import { validateWebhookSignature } from "razorpay/dist/utils/razorpay-utils.js";

const isValid = validateWebhookSignature(
  rawBodyBuffer.toString(),
  req.headers["x-razorpay-signature"],
  process.env.RAZORPAY_WEBHOOK_SECRET
);
```

### Handled Events
- `payment.captured`: Triggers stock decrement, transitions payment status to `CAPTURED`, order status to `CONFIRMED`.
- `payment.failed`: Cancels unpaid orders, sets payment status to `FAILED`.
- `refund.processed`: Confirms prepaid refund and completes return request lifecycles.

---

## 3. Shiprocket Webhooks

- **Endpoint**: `POST /api/webhooks/shiprocket` (or `/webhooks/shiprocket`)
- **Authentication**: Checked against the configured `SHIPROCKET_WEBHOOK_TOKEN` header values.
- **Idempotency eventId**: Shiprocket does not send a unique event ID header. The backend compiles a composite key from tracking attributes: `<awbCode>_<courierStatus>` (e.g., `awb123456_DELIVERED`).

### Handled Events
- Tracking Updates: Translates courier milestones (e.g. "OUT FOR DELIVERY", "RTO INITIATED", "DELIVERED") into Mairii statuses and logs transitions in the audit trail.
- Delivery Capture: Delivered COD orders trigger automatic capture transitions (`paymentStatus = "COD_COLLECTED"`).
