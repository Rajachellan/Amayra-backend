import type { Request, Response, NextFunction } from "express";
import { CustomerSavedItems } from "./savedItems.model.js";
import { AppError } from "../../utils/AppError.js";

type AuthReq = Request & { customerId?: string };

/** PUT /customer/saved-items/cart — sync the current cart for a logged-in customer */
export async function syncCart(req: AuthReq, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = req.customerId;
    if (!customerId) throw new AppError(401, "Unauthorized");

    const items = req.body as Array<{
      productId: string;
      name: string;
      slug: string;
      price: number;
      image?: string;
      quantity: number;
    }>;

    if (!Array.isArray(items)) throw new AppError(400, "Expected an array of cart items");

    await CustomerSavedItems.findOneAndUpdate(
      { customer: customerId },
      {
        $set: {
          cartItems: items.map((i) => ({
            productId: String(i.productId),
            name: String(i.name),
            slug: String(i.slug),
            price: Number(i.price),
            image: i.image ?? undefined,
            quantity: Math.max(1, Math.floor(Number(i.quantity))),
          })),
          cartUpdatedAt: new Date(),
          // Reset reminder sent timestamp so a new reminder can fire if cart changes again
          ...(items.length === 0 ? { cartReminderSentAt: null } : {}),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

/** PUT /customer/saved-items/wishlist — sync the current wishlist for a logged-in customer */
export async function syncWishlist(req: AuthReq, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = req.customerId;
    if (!customerId) throw new AppError(401, "Unauthorized");

    const items = req.body as Array<{
      productId: string;
      name: string;
      slug: string;
      price: number;
      image?: string;
    }>;

    if (!Array.isArray(items)) throw new AppError(400, "Expected an array of wishlist items");

    await CustomerSavedItems.findOneAndUpdate(
      { customer: customerId },
      {
        $set: {
          wishlistItems: items.map((i) => ({
            productId: String(i.productId),
            name: String(i.name),
            slug: String(i.slug),
            price: Number(i.price),
            image: i.image ?? undefined,
          })),
          wishlistUpdatedAt: new Date(),
          ...(items.length === 0 ? { wishlistReminderSentAt: null } : {}),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}
