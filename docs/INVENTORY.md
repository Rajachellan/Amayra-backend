# Inventory Stock & Ledger

To prevent overselling and track stock changes, the platform isolates inventory operations into a dedicated ledger. Every stock adjustment must have an auditing transaction record detailing the cause and reference IDs.

---

## 1. Stock Adjustment Types

The inventory service exposes four main restocking workflows:

| Adjust Type | stock field adjustment | Ledger Type | Trigger Event |
| :--- | :--- | :--- | :--- |
| **Sale** | `stock -= quantity` | `SALE` | Prepaid Captured / COD Created |
| **Good Return** | `stock += quantity` | `RETURN_RESTOCK` | Return Accepted + GOOD condition |
| **Damaged Return** | No change to `stock` | `RETURN_DAMAGED` | Return Accepted + DAMAGED condition |
| **RTO Return** | `stock += quantity` | `RTO_RESTOCK` | Courier RTO Delivered at warehouse |

---

## 2. Inventory Ledger Schema

All transaction records are written to the `InventoryLedger` collection:

- **productId**: Ref to the Product model.
- **quantity**: Negative for sales/reductions, positive for restocking.
- **type**: Transaction code (`SALE`, `RETURN_RESTOCK`, `RETURN_DAMAGED`, `RTO_RESTOCK`, `MANUAL_ADJUSTMENT`, etc.).
- **referenceType**: The document type linked to the adjustment (`ORDER` or `RETURN`).
- **referenceId**: ObjectId of the Order or Return document.
- **previousStock**: The stock level *before* this transaction.
- **newStock**: The stock level *after* this transaction.
- **createdBy**: User ID or system node that initiated the change.

---

## 3. Transaction Safety (Concurrency)

Stock updates use Mongoose/MongoDB sessions and transactions to guarantee atomic operations:

```typescript
const session = await mongoose.startSession();
session.startTransaction();
try {
  // 1. Check current available stock and write decrement
  const result = await Product.updateOne(
    { _id: productId, stock: { $gte: quantity } },
    { $inc: { stock: -quantity } }
  ).session(session);

  if (!result.modifiedCount) {
    throw new Error("Insufficient stock");
  }

  // 2. Create Ledger entry
  await InventoryLedger.create([ledgerPayload], { session });

  await session.commitTransaction();
} catch (e) {
  await session.abortTransaction();
  throw e;
} finally {
  session.endSession();
}
```

This prevents race conditions when multiple checkout requests for the same product are processed at the same time.
