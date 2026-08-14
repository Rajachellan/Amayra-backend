# REST API Routing Matrix

This document maps all backend endpoints relating to checkout, orders, shipping, returns, and inventory.

---

## 1. Checkout & Payments

| Method | Endpoint | Description | Auth Scope |
| :--- | :--- | :--- | :--- |
| **POST** | `/orders/checkout` | Create checkout draft and generate Razorpay order (prepaid) OR create order directly (COD). | Customer |
| **POST** | `/payments/verify` | Verify Razorpay payment signature and capture payment. | Customer |
| **POST** | `/webhooks/razorpay` | Handle incoming Razorpay payment captured, failed, and refund events (needs raw body). | Public (Razorpay) |

---

## 2. Order Retrievals & History

| Method | Endpoint | Description | Auth Scope |
| :--- | :--- | :--- | :--- |
| **GET** | `/orders/me` | List customer's orders history. | Customer |
| **GET** | `/orders/:id` | Get customer's order details. | Customer |
| **GET** | `/orders/:id/tracking` | Get live tracking checkpoints for customer's order. | Customer |
| **GET** | `/admin/orders` | List all orders with filters (status, pagination). | Admin |
| **GET** | `/admin/orders/:id` | View full order detail populated with payment and shipping info. | Admin |
| **PUT** | `/admin/orders/:id/status` | Change order status (for administrative flags like processing). | Admin |
| **GET** | `/admin/orders/:id/history` | Get complete audit history log for an order. | Admin |

---

## 3. Shipping Operations

| Method | Endpoint | Description | Auth Scope |
| :--- | :--- | :--- | :--- |
| **GET** | `/admin/shiprocket/pickups` | Retrieve active warehouse pickup locations nickname list. | Admin |
| **GET** | `/admin/orders/:id/shiprocket/serviceability` | Lookup courier rates serviceability options based on pincodes. | Admin |
| **POST** | `/admin/orders/:id/shiprocket/shipment` | Book shipment forward courier order in Shiprocket (idempotent). | Admin |
| **POST** | `/webhooks/shiprocket` | Handle incoming courier tracking status notifications. | Public (Shiprocket) |

---

## 4. Returns & Warehousing

| Method | Endpoint | Description | Auth Scope |
| :--- | :--- | :--- | :--- |
| **POST** | `/returns` | Customer initiates a return request (checks window). | Customer |
| **GET** | `/returns` | List returns (customer sees own, admin sees all). | Customer / Admin |
| **GET** | `/returns/:id` | View specific return details. | Customer / Admin |
| **POST** | `/admin/returns/:id/approve` | Approve return and book reverse pickup courier (idempotent). | Admin |
| **POST** | `/admin/returns/:id/reject` | Reject return request. | Admin |
| **POST** | `/admin/returns/:id/receive` | Mark reverse package as physically received at warehouse. | Admin |
| **POST** | `/admin/returns/:id/inspect` | Perform QC check (condition GOOD/DAMAGED). Restocks inventory. | Admin |
| **POST** | `/admin/returns/:id/refund` | Trigger online refund via Razorpay or record COD UPI/Bank settlement. | Admin |

---

## 5. Inventory Auditing

| Method | Endpoint | Description | Auth Scope |
| :--- | :--- | :--- | :--- |
| **GET** | `/admin/inventory/ledger` | Retrieve audit history transactions from the stock ledger. | Admin |
| **GET** | `/admin/inventory/stock` | View active catalog items, variants, and stock counts. | Admin |
