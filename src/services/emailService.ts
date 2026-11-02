import nodemailer from "nodemailer";

/** Call once at startup to validate SMTP config */
export function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    // If SMTP is not configured, email sending is a no-op (log warning only)
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

const transporter = createTransporter();

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  if (!transporter) {
    console.warn("[emailService] SMTP not configured — skipping email to", opts.to);
    return;
  }
  const from = process.env.SMTP_FROM ?? `"Mairii Jewels" <${process.env.SMTP_USER}>`;
  await transporter.sendMail({ from, to: opts.to, subject: opts.subject, html: opts.html });
}

/* ── Email templates ─────────────────────────────────────────────────────── */

type ProductRow = {
  name: string;
  price: number;
  image?: string;
  slug: string;
  quantity?: number;
};

const BRAND_GREEN = "#0B2516";
const BRAND_GOLD = "#c9a84c";
const STORE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mairiijewels.com";

function productHtml(items: ProductRow[]): string {
  return items
    .map(
      (p) => `
      <tr>
        <td style="padding:12px 0; border-bottom:1px solid #f0ede8;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              ${
                p.image
                  ? `<td width="72" style="padding-right:16px; vertical-align:top;">
                      <img src="${p.image}" alt="${p.name}" width="72" height="72"
                           style="object-fit:cover; border-radius:4px; display:block;" />
                    </td>`
                  : ""
              }
              <td style="vertical-align:middle;">
                <p style="margin:0; font-family:Georgia,serif; font-size:14px; color:${BRAND_GREEN}; font-weight:bold;">
                  ${p.name}
                </p>
                ${p.quantity ? `<p style="margin:4px 0 0; font-size:12px; color:#888;">Qty: ${p.quantity}</p>` : ""}
                <p style="margin:4px 0 0; font-size:13px; color:${BRAND_GOLD}; font-weight:bold;">
                  ₹${p.price.toLocaleString("en-IN")}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    )
    .join("");
}

function emailWrapper(innerHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8f5f0;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f5f0;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="600" cellpadding="0" cellspacing="0"
               style="max-width:600px;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,.08);">

          <!-- Header -->
          <tr>
            <td style="background:${BRAND_GREEN};padding:32px 40px;text-align:center;">
              <h1 style="margin:0;font-family:Georgia,serif;font-size:28px;font-weight:400;
                         letter-spacing:.12em;color:#fff;">MAIRII</h1>
              <p style="margin:4px 0 0;font-size:10px;letter-spacing:.3em;color:${BRAND_GOLD};
                        text-transform:uppercase;">Jewels</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              ${innerHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#faf8f5;padding:24px 40px;text-align:center;
                       border-top:1px solid #ede8e0;">
              <p style="margin:0;font-size:11px;color:#999;letter-spacing:.05em;">
                You received this email because you have an account at
                <a href="${STORE_URL}" style="color:${BRAND_GOLD};text-decoration:none;">mairiijewels.com</a>.<br/>
                © ${new Date().getFullYear()} Mairii Jewels. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildCartReminderEmail(opts: {
  customerName: string;
  items: ProductRow[];
}): string {
  const ctaUrl = `${STORE_URL}/checkout`;
  const inner = `
    <p style="margin:0 0 8px;font-size:15px;color:#333;">Hi <strong>${opts.customerName}</strong>,</p>
    <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.7;">
      You left some beautiful pieces in your bag! Complete your order before they sell out.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0">
      ${productHtml(opts.items)}
    </table>

    <div style="margin:32px 0;text-align:center;">
      <a href="${ctaUrl}"
         style="display:inline-block;background:${BRAND_GOLD};color:#fff;text-decoration:none;
                font-size:13px;font-weight:bold;letter-spacing:.15em;text-transform:uppercase;
                padding:14px 36px;border-radius:2px;">
        Complete My Order →
      </a>
    </div>

    <p style="margin:0;font-size:13px;color:#888;text-align:center;">
      Questions? Reply to this email — we're happy to help.
    </p>`;

  return emailWrapper(inner);
}

export function buildWishlistReminderEmail(opts: {
  customerName: string;
  items: ProductRow[];
}): string {
  const ctaUrl = `${STORE_URL}/wishlist`;
  const inner = `
    <p style="margin:0 0 8px;font-size:15px;color:#333;">Hi <strong>${opts.customerName}</strong>,</p>
    <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.7;">
      You've been eyeing some gorgeous pieces! Don't let them get away — add them to your bag today.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0">
      ${productHtml(opts.items)}
    </table>

    <div style="margin:32px 0;text-align:center;">
      <a href="${ctaUrl}"
         style="display:inline-block;background:${BRAND_GREEN};color:#fff;text-decoration:none;
                font-size:13px;font-weight:bold;letter-spacing:.15em;text-transform:uppercase;
                padding:14px 36px;border-radius:2px;">
        View My Wishlist →
      </a>
    </div>

    <p style="margin:0;font-size:13px;color:#888;text-align:center;">
      Questions? Reply to this email — we're happy to help.
    </p>`;

  return emailWrapper(inner);
}

function formatDateStr(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function buildCreditNoteIssuedEmail(opts: {
  customerName: string;
  creditNoteNumber: string;
  couponCode: string;
  amount: number;
  issueDate: Date | string;
  expiryDate: Date | string;
}): string {
  const ctaUrl = `${STORE_URL}/checkout`;
  const inner = `
    <p style="margin:0 0 12px;font-size:16px;color:#333;">Dear <strong>${opts.customerName}</strong>,</p>
    <p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.7;">
      Your return has been inspected and approved. A Credit Note has been generated and issued to your account as Store Credit.
    </p>

    <div style="background:#faf8f5;border:1px solid #ede8e0;border-radius:8px;padding:24px;margin-bottom:24px;">
      <table width="100%" cellpadding="6" cellspacing="0" style="font-size:14px;">
        <tr>
          <td style="color:#777;width:40%;">Credit Note Number:</td>
          <td style="color:${BRAND_GREEN};font-weight:bold;font-family:monospace;font-size:15px;">${opts.creditNoteNumber}</td>
        </tr>
        <tr>
          <td style="color:#777;">Store Credit Amount:</td>
          <td style="color:${BRAND_GOLD};font-weight:bold;font-size:18px;">₹${opts.amount.toLocaleString("en-IN")}</td>
        </tr>
        <tr>
          <td style="color:#777;">Issue Date:</td>
          <td style="color:#333;">${formatDateStr(opts.issueDate)}</td>
        </tr>
        <tr>
          <td style="color:#777;">Expiry Date (90 Days):</td>
          <td style="color:#c93b2b;font-weight:bold;">${formatDateStr(opts.expiryDate)}</td>
        </tr>
      </table>

      <div style="margin-top:20px;padding:16px;background:#fff;border:2px dashed ${BRAND_GOLD};border-radius:6px;text-align:center;">
        <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#888;">Your Store Credit Coupon Code</p>
        <span style="font-family:monospace;font-size:22px;font-weight:bold;letter-spacing:0.15em;color:${BRAND_GREEN};">${opts.couponCode}</span>
      </div>
    </div>

    <div style="background:#f4f9f5;border-left:4px solid ${BRAND_GREEN};padding:14px 18px;margin-bottom:28px;">
      <p style="margin:0;font-size:13px;color:#2b5435;line-height:1.6;">
        <strong>How to Redeem:</strong> Simply enter your unique code <strong>${opts.couponCode}</strong> in the <em>Apply Store Credit</em> section during checkout on your next order. Partial redemptions are supported and remaining balance can be used anytime before <strong>${formatDateStr(opts.expiryDate)}</strong>.
      </p>
    </div>

    <div style="margin:28px 0;text-align:center;">
      <a href="${ctaUrl}"
         style="display:inline-block;background:${BRAND_GREEN};color:#fff;text-decoration:none;
                font-size:13px;font-weight:bold;letter-spacing:.15em;text-transform:uppercase;
                padding:14px 36px;border-radius:4px;">
        Shop Now with Credit →
      </a>
    </div>

    <p style="margin:0;font-size:12px;color:#888;text-align:center;">
      Note: Credit Notes are non-transferable and valid for 3 months (90 days) from the date of issue.
    </p>`;

  return emailWrapper(inner);
}

export function buildCreditRedeemedEmail(opts: {
  customerName: string;
  creditNoteNumber: string;
  couponCode: string;
  redeemedAmount: number;
  remainingBalance: number;
  orderNumber: string;
  expiryDate: Date | string;
}): string {
  const inner = `
    <p style="margin:0 0 12px;font-size:16px;color:#333;">Dear <strong>${opts.customerName}</strong>,</p>
    <p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.7;">
      Store credit from Credit Note <strong>${opts.creditNoteNumber}</strong> was redeemed towards Order <strong>${opts.orderNumber}</strong>.
    </p>

    <div style="background:#faf8f5;border:1px solid #ede8e0;border-radius:8px;padding:24px;margin-bottom:24px;">
      <table width="100%" cellpadding="6" cellspacing="0" style="font-size:14px;">
        <tr>
          <td style="color:#777;width:40%;">Redeemed Amount:</td>
          <td style="color:${BRAND_GREEN};font-weight:bold;font-size:16px;">₹${opts.redeemedAmount.toLocaleString("en-IN")}</td>
        </tr>
        <tr>
          <td style="color:#777;">Remaining Credit Balance:</td>
          <td style="color:${BRAND_GOLD};font-weight:bold;font-size:18px;">₹${opts.remainingBalance.toLocaleString("en-IN")}</td>
        </tr>
        <tr>
          <td style="color:#777;">Credit Expiry Date:</td>
          <td style="color:#333;">${formatDateStr(opts.expiryDate)}</td>
        </tr>
      </table>
    </div>

    ${
      opts.remainingBalance > 0
        ? `<p style="margin:0 0 20px;font-size:13px;color:#555;line-height:1.6;">
            You still have <strong>₹${opts.remainingBalance.toLocaleString("en-IN")}</strong> available in this credit note. You can apply code <strong>${opts.couponCode}</strong> on your next purchase before <strong>${formatDateStr(opts.expiryDate)}</strong>.
          </p>`
        : `<p style="margin:0 0 20px;font-size:13px;color:#555;line-height:1.6;">
            This Credit Note has now been completely exhausted. Thank you for shopping with Mairii Jewels!
          </p>`
    }`;

  return emailWrapper(inner);
}

export function buildCreditCancelledEmail(opts: {
  customerName: string;
  creditNoteNumber: string;
  couponCode: string;
  reason: string;
  cancelledAmount: number;
}): string {
  const inner = `
    <p style="margin:0 0 12px;font-size:16px;color:#333;">Dear <strong>${opts.customerName}</strong>,</p>
    <p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.7;">
      Please be informed that unused Store Credit on Credit Note <strong>${opts.creditNoteNumber}</strong> (Code: <code>${opts.couponCode}</code>) has been cancelled.
    </p>

    <div style="background:#fff5f5;border:1px solid #fed7d7;border-radius:8px;padding:24px;margin-bottom:24px;">
      <table width="100%" cellpadding="6" cellspacing="0" style="font-size:14px;">
        <tr>
          <td style="color:#777;width:40%;">Cancelled Balance:</td>
          <td style="color:#c53030;font-weight:bold;font-size:16px;">₹${opts.cancelledAmount.toLocaleString("en-IN")}</td>
        </tr>
        <tr>
          <td style="color:#777;">Reason for Cancellation:</td>
          <td style="color:#333;font-weight:500;">${opts.reason}</td>
        </tr>
      </table>
    </div>

    <p style="margin:0;font-size:13px;color:#888;">
      If you have questions regarding this action, please reach out to our concierge team at support@mairiijewels.com.
    </p>`;

  return emailWrapper(inner);
}

export function buildCreditExpiredEmail(opts: {
  customerName: string;
  creditNoteNumber: string;
  couponCode: string;
  expiredBalance: number;
  expiryDate: Date | string;
}): string {
  const inner = `
    <p style="margin:0 0 12px;font-size:16px;color:#333;">Dear <strong>${opts.customerName}</strong>,</p>
    <p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.7;">
      This is a notification that Credit Note <strong>${opts.creditNoteNumber}</strong> (Code: <code>${opts.couponCode}</code>) reached its 90-day validity limit on <strong>${formatDateStr(opts.expiryDate)}</strong> and has now expired.
    </p>

    <div style="background:#faf8f5;border:1px solid #ede8e0;border-radius:8px;padding:20px;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;color:#777;">
        Expired Unused Balance: <strong style="color:#c53030;">₹${opts.expiredBalance.toLocaleString("en-IN")}</strong>
      </p>
    </div>

    <p style="margin:0;font-size:13px;color:#888;">
      Per store policy, credit notes are valid for three months (90 days) from the date of issue.
    </p>`;

  return emailWrapper(inner);
}

export function buildCreditExpiryReminderEmail(opts: {
  customerName: string;
  creditNoteNumber: string;
  couponCode: string;
  availableBalance: number;
  expiryDate: Date | string;
  daysRemaining: number;
}): string {
  const ctaUrl = `${STORE_URL}/checkout`;
  const inner = `
    <p style="margin:0 0 12px;font-size:16px;color:#333;">Dear <strong>${opts.customerName}</strong>,</p>
    <p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.7;">
      Friendly reminder: You have <strong>₹${opts.availableBalance.toLocaleString("en-IN")}</strong> of available store credit that will expire in <strong>${opts.daysRemaining} days</strong> on <strong>${formatDateStr(opts.expiryDate)}</strong>!
    </p>

    <div style="background:#faf8f5;border:1px solid #ede8e0;border-radius:8px;padding:24px;margin-bottom:24px;">
      <div style="padding:16px;background:#fff;border:2px dashed ${BRAND_GOLD};border-radius:6px;text-align:center;">
        <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#888;">Coupon Code</p>
        <span style="font-family:monospace;font-size:22px;font-weight:bold;letter-spacing:0.15em;color:${BRAND_GREEN};">${opts.couponCode}</span>
        <p style="margin:8px 0 0;font-size:14px;font-weight:bold;color:${BRAND_GOLD};">Available Balance: ₹${opts.availableBalance.toLocaleString("en-IN")}</p>
      </div>
    </div>

    <div style="margin:28px 0;text-align:center;">
      <a href="${ctaUrl}"
         style="display:inline-block;background:${BRAND_GREEN};color:#fff;text-decoration:none;
                font-size:13px;font-weight:bold;letter-spacing:.15em;text-transform:uppercase;
                padding:14px 36px;border-radius:4px;">
        Redeem Before It Expires →
      </a>
    </div>`;

  return emailWrapper(inner);
}
