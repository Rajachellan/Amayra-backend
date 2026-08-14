import cron from "node-cron";
import { logger } from "../config/logger.js";
import { CustomerSavedItems } from "../modules/customer/savedItems.model.js";
import { Customer } from "../models/Customer.js";
import {
  sendEmail,
  buildCartReminderEmail,
  buildWishlistReminderEmail,
} from "../services/emailService.js";

/** How many days of inactivity before a reminder is sent */
const REMINDER_AFTER_DAYS = 3;

/** Minimum gap between two reminders for the same customer (7 days) */
const MIN_RESEND_DAYS = 7;

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export async function runReminderJob(): Promise<void> {
  const now = new Date();
  const cutoff = daysAgo(REMINDER_AFTER_DAYS);
  const resendCutoff = daysAgo(MIN_RESEND_DAYS);

  logger.info(`[reminderJob] Running at ${now.toISOString()}`);

  /* ── 1. Abandoned cart reminders ──────────────────────────────────────── */
  const cartCandidates = await CustomerSavedItems.find({
    "cartItems.0": { $exists: true }, // has at least one item
    cartUpdatedAt: { $lte: cutoff }, // not changed for ≥ REMINDER_AFTER_DAYS
    $or: [
      { cartReminderSentAt: null },
      { cartReminderSentAt: { $lte: resendCutoff } }, // or last sent ≥ MIN_RESEND_DAYS ago
    ],
  }).lean();

  logger.info(`[reminderJob] ${cartCandidates.length} cart reminder(s) to send`);

  for (const doc of cartCandidates) {
    try {
      const customer = await Customer.findById(doc.customer).select("name email").lean();
      if (!customer?.email) continue;

      const html = buildCartReminderEmail({
        customerName: customer.name,
        items: doc.cartItems.map((i) => ({
          name: i.name,
          price: i.price,
          slug: i.slug,
          image: i.image ?? undefined,
          quantity: i.quantity,
        })),
      });

      await sendEmail({
        to: customer.email,
        subject: "You left something beautiful behind 💛 — Your Mairii bag is waiting",
        html,
      });

      await CustomerSavedItems.updateOne(
        { _id: doc._id },
        { $set: { cartReminderSentAt: new Date() } }
      );

      logger.info(`[reminderJob] Cart reminder sent → ${customer.email}`);
    } catch (err) {
      logger.error(err, `[reminderJob] Cart reminder failed for customer ${doc.customer}`);
    }
  }

  /* ── 2. Wishlist reminders ─────────────────────────────────────────────── */
  const wishlistCandidates = await CustomerSavedItems.find({
    "wishlistItems.0": { $exists: true },
    wishlistUpdatedAt: { $lte: cutoff },
    $or: [{ wishlistReminderSentAt: null }, { wishlistReminderSentAt: { $lte: resendCutoff } }],
  }).lean();

  logger.info(`[reminderJob] ${wishlistCandidates.length} wishlist reminder(s) to send`);

  for (const doc of wishlistCandidates) {
    try {
      const customer = await Customer.findById(doc.customer).select("name email").lean();
      if (!customer?.email) continue;

      const html = buildWishlistReminderEmail({
        customerName: customer.name,
        items: doc.wishlistItems.map((i) => ({
          name: i.name,
          price: i.price,
          slug: i.slug,
          image: i.image ?? undefined,
        })),
      });

      await sendEmail({
        to: customer.email,
        subject: "Your Mairii wishlist is calling ✨ — These pieces won't wait forever",
        html,
      });

      await CustomerSavedItems.updateOne(
        { _id: doc._id },
        { $set: { wishlistReminderSentAt: new Date() } }
      );

      logger.info(`[reminderJob] Wishlist reminder sent → ${customer.email}`);
    } catch (err) {
      logger.error(err, `[reminderJob] Wishlist reminder failed for customer ${doc.customer}`);
    }
  }
}

/**
 * Starts a cron job that runs daily at 10:00 AM IST (04:30 UTC).
 * Call this once from server.ts after the database connects.
 */
export function startReminderJob(): void {
  // "30 4 * * *" = 04:30 UTC = 10:00 AM IST every day
  cron.schedule("30 4 * * *", () => {
    runReminderJob().catch((err) => logger.error(err, "[reminderJob] Unexpected error"));
  });
  logger.info("[reminderJob] Scheduled — daily at 10:00 AM IST");
}
