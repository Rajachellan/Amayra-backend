# Local Development, Webhooks & Troubleshooting

This guide describes how to run, test, and debug the Mairii Jewels backend services locally.

---

## 1. Environment Variables Configuration

Create a `.env` file in the root folder.

```ini
PORT=4000
HOST=0.0.0.0
NODE_ENV=development

# Database Source of Truth
MONGODB_URI=mongodb://localhost:27017/mairii_db

# JSON Web Tokens
JWT_SECRET=supersecrettokenkey12345!
JWT_EXPIRES_IN=30d

# Razorpay prepaid configuration
RAZORPAY_KEY_ID=rzp_test_xxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=razorpay_secret_webhook_pass

# Shiprocket courier configuration
SHIPROCKET_EMAIL=shipping@mairiijewels.com
SHIPROCKET_PASSWORD=shiprocket_password_123
SHIPROCKET_BASE_URL=https://apiv2.shiprocket.in
SHIPROCKET_WEBHOOK_TOKEN=shiprocket_secret_webhook_pass

# Socket connection configuration
CORS_ORIGIN=http://localhost:3000
```

---

## 2. Local Webhook Testing

Providers like Razorpay and Shiprocket cannot send webhook POST calls directly to `http://localhost:4000`. You must expose your local port via a public tunnel.

### Step 1: Fire up Ngrok
Expose port 4000 using your choice of tunneling tool:
`ngrok http 4000`

This will give you a public URL (e.g. `https://a1b2-34-56-78.ngrok-free.app`).

### Step 2: Configure Webhook URLs
1. **Razorpay Dashboard**:
   - Go to Settings → Webhooks.
   - Point the Webhook URL to: `https://a1b2-34-56-78.ngrok-free.app/api/webhooks/razorpay`
   - Select events: `payment.captured`, `payment.failed`, `refund.processed`.
   - Copy the secret and save in `.env` under `RAZORPAY_WEBHOOK_SECRET`.
2. **Shiprocket Dashboard**:
   - Go to Settings → Webhooks.
   - Point the Webhook URL to: `https://a1b2-34-56-78.ngrok-free.app/api/webhooks/shiprocket`
   - Select tracking updates events.

---

## 3. General Developer Troubleshooting

### Webhook Event Says PENDING
- **Cause**: Webhook POST was received but failed validation or database saves.
- **Fix**: Check `WebhookEvent` logs in MongoDB. If signature verification failed, verify that your `.env` secrets match those in the provider dashboards.

### Shipment Booking Fails
- **Cause**: Dimension validations (length/weight <= 0) or incomplete delivery address fields (missing pincode/phone).
- **Fix**: Ensure pincodes do not contain spaces and phone numbers contain valid digits. Ensure dimensions are populated.

### Socket.IO Client Disconnects
- **Cause**: Server crashed or CORS blocked the client origin.
- **Fix**: Verify your `CORS_ORIGIN` matches the frontend hostname. If the socket server is disconnected, the application continues to run via REST.

### Stock Count Inconsistencies
- **Cause**: Out-of-bounds manual stock changes bypassing ledger records.
- **Fix**: Check `InventoryLedger` logs. Never modify `Product.stock` directly without creating a ledger transaction record for trace auditing.
