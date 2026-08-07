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
