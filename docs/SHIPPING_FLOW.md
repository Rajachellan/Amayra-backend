# Forward Shipping & Courier Booking

The shipping lifecycle is powered by **Shiprocket**. The backend manages forward courier allocation, address validations, and AWB registration.

---

## 1. Get Courier Rates

Before booking a shipment, the Admin Panel retrieves serviceability quotes from Shiprocket.

### Request
`GET /api/admin/orders/:id/shiprocket/serviceability?weightKg=0.35&pickup=PrimaryWarehouse`

### Flow
1. Find order.
2. Ensure order is eligible:
   - For Prepaid: `paymentStatus` must be `CAPTURED`.
   - For COD: `orderStatus` must be `CONFIRMED` or `PROCESSING`.
3. Locate pickup address coordinates using the `pickup` parameter (nickname configured in Shiprocket).
4. Extract delivery pincode from order's shipping address.
5. Invoke Shiprocket Serviceability API:
   `GET /v1/external/courier/serviceability/?pickup_postcode=302001&delivery_postcode=400001&weight=0.35&cod=1`
6. Return normalized rates array to the frontend:
   ```json
   {
     "pickup": { "nickname": "PrimaryWarehouse", "pinCode": "302001" },
     "deliveryPincode": "400001",
     "normalized": [
       {
         "courierId": 14,
         "courierName": "BlueDart",
         "rate": 95,
         "estimatedDelivery": "2026-08-15",
         "serviceType": "Standard",
         "codAvailable": true
       }
     ]
   }
   ```

---

## 2. Idempotent Book Shipment

When booking, the system guarantees **idempotency**. Attempting to book a shipment twice will return the existing shipment details rather than generating duplicate Shiprocket orders or AWB codes.

### Request
`POST /api/admin/orders/:id/shiprocket/shipment`
```json
{
  "pickupLocation": "PrimaryWarehouse",
  "courierId": 14,
  "weightKg": 0.35,
  "lengthCm": 12,
  "breadthCm": 10,
  "heightCm": 5
}
```

### Flow
1. Fetch Order and Customer data.
2. Check if `shippingInfo.shipmentId` is already present. If yes, skip API calls and return the order immediately.
3. Validate payment status (prepaid captured, COD valid).
4. Construct Shiprocket adhoc payload:
   - Map order items to `order_items` array (prices, quantities, SKUs).
   - Flag payment method (`Prepaid` or `COD`).
   - Invert customer address details for billing/shipping.
5. Call Shiprocket **Create Adhoc Order**:
   `POST /v1/external/orders/create/adhoc`
6. Extract `shipment_id` and `order_id` from Shiprocket.
7. Call Shiprocket **Assign AWB**:
   `POST /v1/external/courier/assign/awb` with `{ shipment_id, courier_id }`
8. Extract generated AWB and Label URL.
9. Populate the `shippingInfo` subdocument on the Order:
   - `shipmentId`: Shiprocket shipment identifier
   - `awbCode`: tracking code
   - `courierName`: Courier name
   - `trackingUrl`: `https://shiprocket.co/tracking/<awbCode>`
   - `status`: `AWB_GENERATED`
10. Update `orderStatus = "SHIPPED"` and `shippingStatus = "AWB_GENERATED"`.
11. Pre-save hooks mirror these fields into the legacy `shiprocket` block.
12. Log audit log `SHIPMENT_BOOKED` and broadcast Socket.IO notifications.
