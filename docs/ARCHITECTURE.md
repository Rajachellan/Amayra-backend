# Architecture & Request Flow

This document details the system design, layering, and request-response flow for the Mairii Jewels backend API.

---

## 1. High-Level Layers

The codebase uses a Modular Domain structure with clear responsibilities divided across layers:

```text
HTTP Request
     ↓
Route Layer (app/routes, routes/)  <-- Maps paths to controllers, applies auth & rate limiting
     ↓
Controller Layer (modules/[domain]/)  <-- Thin handler: parses input, calls services, sends HTTP responses
     ↓
Service Layer (modules/[domain]/)     <-- Core business logic: coordinates database transactions & external APIs
     ↓
Repository / Client (modules/ & integrations/) <-- Database access layer and API HTTP clients (Razorpay, Shiprocket)
     ↓
Mongoose (MongoDB)
```

### Thin Controllers Guideline
Controllers must remain extremely thin. Their responsibilities are strictly limited to:
- Validating request parameters and query strings (e.g. throwing `400 Bad Request` if payload is invalid).
- Unpacking user authentication context (e.g., `req.customerId` or `req.adminId`).
- Invoking the appropriate Service method.
- Constructing and returning the HTTP response (e.g. `res.status(200).json(data)`).

**No business logic, Mongoose sessions/transactions, or external HTTP requests (fetches to Shiprocket or Razorpay) should live inside controllers.** These are orchestrated inside Services.

---

## 2. Standard Forward Request Flow Example

```text
Admin Clicks "Book Shipment"
          ↓
Routes: POST /api/admin/orders/:id/shiprocket/shipment
          ↓
Middleware: authenticateAdmin -> rateLimiter
          ↓
ShippingController: postOrderShiprocketShipment()
  - Validates request body params (pickupLocation, courierId, dimensions).
  - Extracts order ID from req.params.
  - Calls ShippingService.bookShipment().
          ↓
ShippingService: bookShipment()
  - Queries Order via Order model.
  - Enforces payment eligibility checks.
  - Calls ShiprocketClient.createAdhocOrder() to create order.
  - Calls ShiprocketClient.assignAwb() to assign tracking code.
  - Writes OrderHistory state transition audit log.
  - Saves all details to Order database fields (triggers Pre-save hooks).
          ↓
Mongoose Pre-Save Hooks
  - Synchronizes new statuses with legacy `shiprocket` and `status` fields.
  - Commits updates to MongoDB.
          ↓
Socket.IO Event Broadcaster
  - Emits "order.updated" and "shipment.updated" events to the "admins" websocket room.
          ↓
ShippingController
  - Receives finalized Order document.
  - Responds with `res.status(201).json({ order, shiprocketCreate })`.
          ↓
Admin Panel UI updates in real-time.
```

---

## 3. Backward Compatibility Strategy

Since storefront and admin client apps depend on legacy schemas and endpoints:
1. **Model Synchronization**: The Mongoose pre-save hook in `src/modules/order/model.ts` automatically maps new fields (like `orderStatus` and `shippingInfo`) to their legacy counterparts (`status` and `shiprocket`). Any query or client reading legacy fields will always receive correct, real-time data.
2. **Re-export Shims**: Legacy folders (`src/models/`, `src/controllers/`, `src/services/`) re-export features directly from the modular `src/modules/` domain directory. This ensures existing route imports do not break.
