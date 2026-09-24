import dotenv from "dotenv";
dotenv.config();

import Razorpay from "razorpay";

async function testCredentials() {
  console.log("=== 1. TESTING RAZORPAY CREDENTIALS ===");
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  console.log(`Key ID: ${keyId ? keyId.slice(0, 12) + "..." : "MISSING"}`);
  console.log(`Key Type: ${keyId?.startsWith("rzp_live_") ? "🔴 LIVE MODE" : keyId?.startsWith("rzp_test_") ? "🟢 TEST MODE" : "UNKNOWN"}`);

  if (!keyId || !keySecret) {
    console.error("❌ RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is missing!");
  } else {
    try {
      const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
      const orders = await rzp.orders.all({ count: 1 });
      console.log("✅ Razorpay API connection SUCCESSFUL! Authenticated successfully.");
      console.log(`Found ${orders.items?.length ?? 0} existing orders.`);
    } catch (err: any) {
      console.error("❌ Razorpay Authentication FAILED:", err.error || err.message || err);
    }
  }

  console.log("\n=== 2. TESTING SHIPROCKET CREDENTIALS ===");
  const email = process.env.SHIPROCKET_EMAIL?.trim();
  const password = process.env.SHIPROCKET_PASSWORD;
  const baseUrl = (process.env.SHIPROCKET_BASE_URL || "https://apiv2.shiprocket.in").replace(/\/$/, "");

  console.log(`Email: ${email}`);
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Password length: ${password ? password.length : 0} chars`);

  if (!email || !password) {
    console.error("❌ SHIPROCKET_EMAIL or SHIPROCKET_PASSWORD missing!");
  } else {
    try {
      const res = await fetch(`${baseUrl}/v1/external/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        console.error(`❌ Shiprocket login FAILED (HTTP ${res.status}):`, data.message || data.errors || data);
      } else if (!data.token) {
        console.error("❌ Shiprocket response missing token:", data);
      } else {
        console.log("✅ Shiprocket login SUCCESSFUL! Auth token acquired.");

        const pickupRes = await fetch(`${baseUrl}/v1/external/settings/company/pickup`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${data.token}`,
          },
        });
        const pickupData = (await pickupRes.json().catch(() => ({}))) as any;
        if (pickupRes.ok) {
          const count = pickupData?.data?.shipping_address?.length ?? 0;
          console.log(`✅ Shiprocket Pickup Locations fetched successfully (${count} pickup location(s) configured).`);
          if (count > 0) {
            pickupData.data.shipping_address.forEach((loc: any) => {
              console.log(`   - Location: "${loc.pickup_location}", City: ${loc.city}, Pin: ${loc.pin_code}`);
            });
          } else {
            console.log("   ⚠️ Note: No pickup locations found. Configure at least one pickup location in the Shiprocket panel.");
          }
        } else {
          console.warn(`⚠️ Could not fetch pickup locations (HTTP ${pickupRes.status}):`, pickupData);
        }
      }
    } catch (err: any) {
      console.error("❌ Shiprocket network error:", err.message || err);
    }
  }

  console.log("\n=== 3. WEBHOOK CONFIGURATION STATUS ===");
  const razorpayWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  console.log(`RAZORPAY_WEBHOOK_SECRET: ${razorpayWebhookSecret ? "Configured (" + razorpayWebhookSecret.slice(0, 8) + "...)" : "MISSING"}`);
  console.log("  Endpoint: https://api.mairiijewels.com/webhooks/razorpay (or /api/webhooks/razorpay)");

  const shiprocketWebhookToken = process.env.SHIPROCKET_WEBHOOK_TOKEN;
  console.log(`SHIPROCKET_WEBHOOK_TOKEN: ${shiprocketWebhookToken ? "Configured (" + shiprocketWebhookToken.slice(0, 10) + "...)" : "MISSING"}`);
  console.log("  Endpoint: https://api.mairiijewels.com/api/webhooks/shiprocket (or /webhooks/shiprocket)");
}

testCredentials();
