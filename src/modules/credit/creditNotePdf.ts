import type { CreditNoteDoc } from "./creditNote.model.js";

/**
 * Escapes text for PDF literal strings (parentheses, backslashes).
 */
function escapePdfText(text: string): string {
  return (text || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E]/g, "?");
}

function formatDate(d: Date | string | undefined): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Generates an official, standard PDF 1.4 Credit Note buffer with MAIRII branding.
 */
export function generateCreditNotePdf(creditNote: CreditNoteDoc): Buffer {
  const cn = creditNote;
  const streamLines: string[] = [];

  // Helper drawing functions
  const strokeColor = (r: number, g: number, b: number) => {
    streamLines.push(`${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)} RG`);
  };

  const fillColor = (r: number, g: number, b: number) => {
    streamLines.push(`${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)} rg`);
  };

  const drawRect = (x: number, y: number, w: number, h: number, fill = false, stroke = false) => {
    streamLines.push(`${x} ${y} ${w} ${h} re`);
    if (fill && stroke) streamLines.push("B");
    else if (fill) streamLines.push("f");
    else if (stroke) streamLines.push("S");
  };

  const drawText = (
    text: string,
    x: number,
    y: number,
    font = "/F1",
    size = 10,
    r = 50,
    g = 50,
    b = 50
  ) => {
    fillColor(r, g, b);
    streamLines.push(`BT ${font} ${size} Tf ${x} ${y} Td (${escapePdfText(text)}) Tj ET`);
  };

  const drawLine = (x1: number, y1: number, x2: number, y2: number, width = 1) => {
    streamLines.push(`${width} w ${x1} ${y1} m ${x2} ${y2} l S`);
  };

  // Page background & decorative header
  // Header bar: #0B2516 (Emerald)
  fillColor(11, 37, 22);
  drawRect(0, 760, 595, 82, true, false);

  // Gold accent bar: #C9A84C
  fillColor(201, 168, 76);
  drawRect(0, 755, 595, 5, true, false);

  // Header Title
  drawText("MAIRII JEWELS", 40, 805, "/F2", 22, 255, 255, 255);
  drawText("OFFICIAL CREDIT NOTE", 40, 788, "/F1", 10, 201, 168, 76);
  drawText("support@mairiijewels.com | mairiijewels.com", 40, 772, "/F1", 8, 200, 200, 200);

  // Credit Note Number & Date (top right)
  drawText(`CREDIT NOTE #: ${cn.creditNoteNumber}`, 360, 805, "/F2", 11, 255, 255, 255);
  drawText(`Issued: ${formatDate(cn.issuedDate)}`, 360, 790, "/F1", 9, 230, 230, 230);
  drawText(`Expires: ${formatDate(cn.expiryDate)} (90 Days)`, 360, 775, "/F2", 9, 201, 168, 76);

  // Status Badge box
  const statusStr = (cn.status || "ACTIVE").toUpperCase();
  fillColor(245, 245, 245);
  strokeColor(200, 200, 200);
  drawRect(40, 715, 515, 30, true, true);
  drawText(`STATUS: ${statusStr}`, 52, 726, "/F2", 10, 11, 37, 22);
  drawText(`SETTLEMENT: ${cn.settlementStatus || "SETTLED"}`, 220, 726, "/F1", 10, 80, 80, 80);
  drawText(`VALIDITY: THREE MONTHS (90 DAYS) FROM ISSUANCE`, 350, 726, "/F2", 8, 201, 168, 76);

  // Two columns: Customer Details & Return/Order Details
  // Customer Box
  fillColor(253, 252, 250);
  strokeColor(230, 225, 215);
  drawRect(40, 615, 250, 90, true, true);
  drawText("CUSTOMER INFORMATION", 50, 688, "/F2", 9, 11, 37, 22);
  drawLine(50, 682, 280, 682, 0.5);
  drawText(`Name: ${cn.customerName || "-"}`, 50, 665, "/F1", 9, 50, 50, 50);
  drawText(`Email: ${cn.customerEmail || "-"}`, 50, 648, "/F1", 9, 50, 50, 50);
  drawText(`Customer ID: ${String(cn.customerId).slice(-8)}`, 50, 631, "/F1", 8, 120, 120, 120);

  // Reference Details Box
  fillColor(253, 252, 250);
  strokeColor(230, 225, 215);
  drawRect(305, 615, 250, 90, true, true);
  drawText("RETURN & ORDER REFERENCES", 315, 688, "/F2", 9, 11, 37, 22);
  drawLine(315, 682, 545, 682, 0.5);
  drawText(`Original Order: ${cn.originalOrderNumber || "-"}`, 315, 665, "/F1", 9, 50, 50, 50);
  if ((cn as any).issueType === "MANUAL_ISSUE") {
    drawText(
      `Reason: ${(cn as any).issueReason || "Manual / Damage Claim"}`,
      315,
      648,
      "/F1",
      9,
      50,
      50,
      50
    );
  } else {
    drawText(`Return Request: ${cn.returnRequestNumber || "-"}`, 315, 648, "/F1", 9, 50, 50, 50);
  }
  if (cn.qcNotes) {
    drawText(`QC Notes: ${cn.qcNotes.slice(0, 35)}`, 315, 631, "/F1", 8, 100, 100, 100);
  }

  // Store Credit Coupon Box (Highlighted)
  fillColor(254, 250, 240);
  strokeColor(201, 168, 76);
  drawRect(40, 545, 515, 55, true, true);
  drawText("STORE CREDIT REDEMPTION CODE", 52, 582, "/F2", 8, 150, 120, 40);
  drawText(cn.couponCode || "SC-UNKNOWN", 52, 558, "/F2", 16, 11, 37, 22);
  drawText(
    "Use this code during checkout at mairiijewels.com to apply store credit.",
    260,
    568,
    "/F1",
    8,
    100,
    100,
    100
  );
  drawText(
    `Valid until ${formatDate(cn.expiryDate)} (Strict 90-day validity period)`,
    260,
    555,
    "/F2",
    8,
    180,
    50,
    50
  );

  // Table of Returned Products
  drawText(
    (cn as any).issueType === "MANUAL_ISSUE"
      ? "AFFECTED / CLAIMED PRODUCT DETAILS"
      : "RETURNED PRODUCT DETAILS",
    40,
    525,
    "/F2",
    10,
    11,
    37,
    22
  );

  // Table Header
  fillColor(11, 37, 22);
  drawRect(40, 498, 515, 20, true, false);
  drawText("Item / Description", 48, 505, "/F2", 8, 255, 255, 255);
  drawText("SKU / Size", 260, 505, "/F2", 8, 255, 255, 255);
  drawText("Qty", 380, 505, "/F2", 8, 255, 255, 255);
  drawText("Unit Price", 430, 505, "/F2", 8, 255, 255, 255);
  drawText("Total Amount", 495, 505, "/F2", 8, 255, 255, 255);

  let currentY = 478;
  const items = cn.returnedProductDetails || [];
  for (let i = 0; i < items.length && i < 6; i++) {
    const item = items[i];
    fillColor(i % 2 === 0 ? 255 : 249, i % 2 === 0 ? 255 : 249, i % 2 === 0 ? 255 : 249);
    strokeColor(235, 235, 235);
    drawRect(40, currentY - 5, 515, 22, true, true);

    const name = (item.name || "").slice(0, 32);
    const skuSize = `${item.sku || "-"}${item.size ? " / " + item.size : ""}`.slice(0, 20);
    drawText(name, 48, currentY + 2, "/F1", 8, 40, 40, 40);
    drawText(skuSize, 260, currentY + 2, "/F1", 8, 80, 80, 80);
    drawText(String(item.quantity || 1), 385, currentY + 2, "/F1", 8, 40, 40, 40);
    drawText(
      `INR ${(item.unitPrice || 0).toLocaleString("en-IN")}`,
      430,
      currentY + 2,
      "/F1",
      8,
      40,
      40,
      40
    );
    drawText(
      `INR ${(item.totalAmount || 0).toLocaleString("en-IN")}`,
      495,
      currentY + 2,
      "/F2",
      8,
      11,
      37,
      22
    );

    currentY -= 22;
  }

  // Financial Breakdown Box (Bottom Right)
  const boxTop = Math.min(currentY - 15, 340);
  fillColor(253, 252, 250);
  strokeColor(201, 168, 76);
  drawRect(310, boxTop - 85, 245, 95, true, true);

  drawText("FINANCIAL SETTLEMENT SUMMARY", 320, boxTop - 5, "/F2", 8, 11, 37, 22);
  drawLine(320, boxTop - 11, 545, boxTop - 11, 0.5);

  drawText("Issued Credit Amount:", 320, boxTop - 25, "/F1", 9, 70, 70, 70);
  drawText(
    `INR ${(cn.issuedCreditAmount ?? 0).toLocaleString("en-IN")}`,
    450,
    boxTop - 25,
    "/F2",
    9,
    11,
    37,
    22
  );

  drawText("Redeemed Amount:", 320, boxTop - 42, "/F1", 9, 70, 70, 70);
  drawText(
    `INR ${(cn.redeemedAmount ?? 0).toLocaleString("en-IN")}`,
    450,
    boxTop - 42,
    "/F1",
    9,
    70,
    70,
    70
  );

  drawLine(320, boxTop - 50, 545, boxTop - 50, 0.5);
  drawText("Remaining Balance:", 320, boxTop - 66, "/F2", 10, 201, 168, 76);
  drawText(
    `INR ${(cn.remainingBalance ?? cn.issuedCreditAmount ?? 0).toLocaleString("en-IN")}`,
    450,
    boxTop - 66,
    "/F2",
    11,
    11,
    37,
    22
  );

  // Terms & Conditions (Bottom Left)
  drawText("TERMS & CONDITIONS", 40, boxTop - 5, "/F2", 8, 11, 37, 22);
  drawText(
    "1. This Credit Note is strictly valid for THREE MONTHS (90 DAYS) from issuance.",
    40,
    boxTop - 20,
    "/F1",
    7,
    100,
    100,
    100
  );
  drawText(
    "2. Valid exclusively for purchases at mairiijewels.com.",
    40,
    boxTop - 32,
    "/F1",
    7,
    100,
    100,
    100
  );
  drawText(
    "3. Partial redemptions are permitted; remaining balance retains original expiry.",
    40,
    boxTop - 44,
    "/F1",
    7,
    100,
    100,
    100
  );
  drawText(
    "4. Credit notes are non-transferable, non-refundable, and cannot be exchanged for cash.",
    40,
    boxTop - 56,
    "/F1",
    7,
    100,
    100,
    100
  );
  drawText(
    "5. Expired credits cannot be reactivated or reissued.",
    40,
    boxTop - 68,
    "/F1",
    7,
    100,
    100,
    100
  );

  // Authorized Signatory footer
  drawLine(40, 80, 555, 80, 0.5);
  drawText(
    "This is an electronically generated official credit note issued by Mairii Jewels.",
    40,
    68,
    "/F1",
    7,
    120,
    120,
    120
  );
  drawText("Authorized Signatory - Accounts & Returns Department", 340, 68, "/F2", 7, 11, 37, 22);

  // Assemble PDF document stream
  const contentStream = streamLines.join("\n");
  const streamLength = Buffer.byteLength(contentStream, "utf-8");

  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
  objects[3] =
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  objects[6] = `<< /Length ${streamLength} >>\nstream\n${contentStream}\nendstream`;

  let pdfString = "%PDF-1.4\n";
  const xrefOffsets: number[] = [0];

  for (let i = 1; i <= 6; i++) {
    xrefOffsets[i] = Buffer.byteLength(pdfString, "utf-8");
    pdfString += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const startxref = Buffer.byteLength(pdfString, "utf-8");
  pdfString += `xref\n0 7\n0000000000 65535 f \n`;
  for (let i = 1; i <= 6; i++) {
    pdfString += `${String(xrefOffsets[i]).padStart(10, "0")} 00000 n \n`;
  }

  pdfString += `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;

  return Buffer.from(pdfString, "utf-8");
}
