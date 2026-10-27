import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { Invoice, Quotation, Customer, AppSettings } from '../types.ts';

export const DEFAULT_COMPANY_PROFILE: Required<
  Pick<
    AppSettings['general'],
    | 'businessName'
    | 'businessContact'
    | 'businessPhone'
    | 'businessEmail'
    | 'businessAddress'
    | 'tinNumber'
    | 'currency'
    | 'bankName'
    | 'bankAccountName'
    | 'bankAccountNumber'
    | 'telebirrNumber'
    | 'secondaryBankDetails'
    | 'bankingDetails'
  >
> = {
  businessName: 'NexGrid Digital Systems',
  businessContact: '+251 906697634',
  businessPhone: '+251 906697634',
  businessEmail: 'nexgriddigital@gmail.com',
  businessAddress: 'Online',
  tinNumber: '0054892147',
  currency: 'ETB',
  bankName: 'Commercial Bank of Ethiopia (CBE)',
  bankAccountName: 'NexGrid Digital Systems',
  bankAccountNumber: '1000234567890',
  telebirrNumber: '+251 906697634',
  secondaryBankDetails: 'Telebirr / Mobile Money: +251 906697634',
  bankingDetails:
    'Bank: Commercial Bank of Ethiopia (CBE) | Account Name: NexGrid Digital Systems | Account No: 1000234567890 | Telebirr: +251 906697634',
};

export function resolveCompanyProfile(settings?: AppSettings['general']) {
  const businessName = settings?.businessName?.trim() || DEFAULT_COMPANY_PROFILE.businessName;
  const tinNumber = settings?.tinNumber?.trim() || DEFAULT_COMPANY_PROFILE.tinNumber;
  const businessPhone =
    settings?.businessPhone && settings.businessPhone !== '+251 911 234 567'
      ? settings.businessPhone.trim()
      : DEFAULT_COMPANY_PROFILE.businessPhone;
  const businessEmail =
    settings?.businessEmail && settings.businessEmail !== 'support@nexgrid.et'
      ? settings.businessEmail.trim()
      : DEFAULT_COMPANY_PROFILE.businessEmail;
  const businessAddress =
    settings?.businessAddress &&
    !settings.businessAddress.includes('Bole Medhanialem') &&
    settings.businessAddress !== 'Addis Ababa, Ethiopia'
      ? settings.businessAddress.trim()
      : DEFAULT_COMPANY_PROFILE.businessAddress;
  const currency = settings?.currency?.trim() || DEFAULT_COMPANY_PROFILE.currency;

  const bankName = settings?.bankName?.trim() || DEFAULT_COMPANY_PROFILE.bankName;
  const bankAccountName = settings?.bankAccountName?.trim() || businessName;
  const bankAccountNumber = settings?.bankAccountNumber?.trim() || DEFAULT_COMPANY_PROFILE.bankAccountNumber;
  const telebirrNumber = settings?.telebirrNumber?.trim() || businessPhone;
  const secondaryBankDetails =
    settings?.secondaryBankDetails?.trim() || `Telebirr / Mobile Money: ${telebirrNumber}`;
  const bankingDetails =
    settings?.bankingDetails?.trim() ||
    `Bank: ${bankName} | Account Name: ${bankAccountName} | Account No: ${bankAccountNumber} | Telebirr: ${telebirrNumber}`;

  return {
    businessName,
    businessContact: businessPhone,
    businessPhone,
    businessEmail,
    businessAddress,
    tinNumber,
    currency,
    bankName,
    bankAccountName,
    bankAccountNumber,
    telebirrNumber,
    secondaryBankDetails,
    bankingDetails,
  };
}

export interface PaymentQrContext {
  documentType?: 'INVOICE' | 'QUOTATION' | 'REPORT' | 'BANKING_PROFILE';
  documentId?: string;
  customerName?: string;
  amount?: number;
  currency?: string;
  dueOrValidDate?: string;
  customInstructions?: string;
}

/**
 * Ensures line item totals, subtotal, taxAmount, total, and remainingBalance
 * are always accurately calculated from the document's line items.
 */
export function recalculateDocumentTotals<T extends Invoice | Quotation>(doc: T): T {
  if (!doc || typeof doc !== 'object') return doc;
  const rawItems = Array.isArray(doc.items) ? doc.items : [];
  const cleanItems = rawItems.map((it, idx) => {
    const qty = Number(it.quantity) > 0 ? Number(it.quantity) : 1;
    const unitPrice = Number(it.unitPrice) || 0;
    const rawTotal = Number(it.total) || 0;
    const computedItemTotal = unitPrice > 0 ? qty * unitPrice : rawTotal;
    return {
      ...it,
      id: it.id || `item-${idx + 1}`,
      quantity: qty,
      unitPrice: unitPrice > 0 ? unitPrice : qty > 0 ? computedItemTotal / qty : 0,
      total: computedItemTotal,
    };
  });

  const itemsSum = cleanItems.reduce((sum, it) => sum + (Number(it.total) || 0), 0);
  const subtotal = itemsSum > 0 ? itemsSum : Math.max(0, Number(doc.subtotal) || 0);
  const discountAmount = Math.max(0, Number(doc.discountAmount) || 0);
  const taxRate = Math.max(0, Number(doc.taxRate) || 0);
  const taxable = Math.max(0, subtotal - discountAmount);
  const taxAmount = taxRate > 0 ? (taxable * taxRate) / 100 : 0;
  const total = Math.max(0, taxable + taxAmount);

  const normalized: any = {
    ...doc,
    items: cleanItems,
    subtotal,
    discountAmount,
    taxRate,
    taxAmount,
    total,
  };

  if ('remainingBalance' in normalized || 'totalPaid' in normalized || 'dueDate' in normalized) {
    const paid = Math.max(0, Number((normalized as Invoice).totalPaid) || 0);
    normalized.totalPaid = paid;
    normalized.remainingBalance = Math.max(0, total - paid);
  }

  return normalized as T;
}

/**
 * Builds the structured scan-to-pay payload encoded inside Invoice and Quotation QR codes.
 */
export function buildPaymentQrPayload(
  settings?: AppSettings['general'],
  context?: PaymentQrContext
): string {
  const company = resolveCompanyProfile(settings);
  const curr = context?.currency || company.currency;
  const lines: string[] = [
    `${company.businessName.toUpperCase()} - SCAN TO PAY`,
    `TIN: ${company.tinNumber}`,
  ];

  if (context?.documentId) {
    lines.push(
      `${context.documentType === 'QUOTATION' ? 'Quotation' : 'Invoice'} Ref: ${context.documentId}`
    );
  }
  if (context?.customerName) {
    lines.push(`Client: ${context.customerName}`);
  }
  if (typeof context?.amount === 'number') {
    lines.push(
      `Amount: ${context.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${curr}`
    );
  }
  if (context?.dueOrValidDate) {
    lines.push(
      `${context.documentType === 'QUOTATION' ? 'Valid Until' : 'Due Date'}: ${context.dueOrValidDate}`
    );
  }

  lines.push(`Bank: ${company.bankName}`);
  lines.push(`Account Holder: ${company.bankAccountName}`);
  lines.push(`Account No: ${company.bankAccountNumber}`);
  lines.push(`Telebirr: ${company.telebirrNumber}`);

  if (company.secondaryBankDetails) {
    lines.push(`Alt Payment: ${company.secondaryBankDetails}`);
  }
  if (
    context?.customInstructions &&
    context.customInstructions.trim() !== '' &&
    context.customInstructions.trim() !== company.bankingDetails
  ) {
    lines.push(`Note: ${context.customInstructions.trim()}`);
  }

  lines.push(`Support: ${company.businessPhone} | ${company.businessEmail}`);
  return lines.join('\n');
}

/**
 * Synchronously generates a 2D QR code module matrix for instant vector rendering in SVG and jsPDF.
 */
export function createPaymentQrMatrix(payload: string): {
  size: number;
  modules: boolean[][];
} {
  const qr = QRCode.create(payload || 'NexGrid Digital Systems', {
    errorCorrectionLevel: 'M',
  });
  const size = qr.modules.size;
  const data = qr.modules.data;
  const modules: boolean[][] = [];

  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) {
      row.push(Boolean(data[r * size + c]));
    }
    modules.push(row);
  }

  return { size, modules };
}

/**
 * Draws a vector-sharp QR code inside a jsPDF document at (x, y) with given width/height in mm.
 */
function drawVectorQrCodeOnPdf(
  doc: jsPDF,
  payload: string,
  x: number,
  y: number,
  boxSizeMm: number
) {
  const { size, modules } = createPaymentQrMatrix(payload);
  const quietZoneModules = 2;
  const totalModules = size + quietZoneModules * 2;
  const cellSize = boxSizeMm / totalModules;

  // White background frame with subtle border
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.rect(x, y, boxSizeMm, boxSizeMm, 'FD');

  // Dark QR modules
  doc.setFillColor(15, 23, 42);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) {
        const rx = x + (c + quietZoneModules) * cellSize;
        const ry = y + (r + quietZoneModules) * cellSize;
        doc.rect(rx, ry, cellSize + 0.04, cellSize + 0.04, 'F');
      }
    }
  }
}

function drawBankingDetailsBox(
  doc: jsPDF,
  margin: number,
  y: number,
  contentWidth: number,
  company: ReturnType<typeof resolveCompanyProfile>,
  qrContext?: PaymentQrContext
): number {
  const primaryColor = [15, 23, 42];
  const secondaryColor = [71, 85, 105];
  const boxBg = [248, 250, 252];
  const borderColor = [203, 213, 225];

  const boxHeight = 36;
  const qrSize = 26;
  const qrX = margin + contentWidth - qrSize - 4;
  const qrY = y + 3;

  doc.setFillColor(boxBg[0], boxBg[1], boxBg[2]);
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.rect(margin, y, contentWidth, boxHeight, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('BANKING & PAYMENT SETTLEMENT DETAILS:', margin + 4, y + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);

  doc.text(`Bank Name: ${company.bankName}`, margin + 4, y + 10.5);
  doc.text(`Account Holder: ${company.bankAccountName}`, margin + 4, y + 15);
  doc.text(
    `Account Number: ${company.bankAccountNumber}   |   Currency: ${company.currency}`,
    margin + 4,
    y + 19.5
  );
  doc.text(
    `Telebirr / Mobile Money: ${company.telebirrNumber}   |   TIN: ${company.tinNumber}`,
    margin + 4,
    y + 24
  );
  doc.text(
    `Support: ${company.businessPhone}   |   Email: ${company.businessEmail}   |   Office: ${company.businessAddress}`,
    margin + 4,
    y + 28.5
  );

  const customInstructions = qrContext?.customInstructions;
  const hasCustom =
    customInstructions &&
    customInstructions.trim() !== '' &&
    !customInstructions.includes('0911234567') &&
    customInstructions.trim() !== company.bankingDetails;

  if (hasCustom) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.2);
    const cleanNote =
      customInstructions!.length > 88 ? `${customInstructions!.slice(0, 85)}...` : customInstructions!;
    doc.text(`Remittance Note: ${cleanNote}`, margin + 4, y + 33);
  } else if (company.secondaryBankDetails) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.2);
    const cleanSec =
      company.secondaryBankDetails.length > 88
        ? `${company.secondaryBankDetails.slice(0, 85)}...`
        : company.secondaryBankDetails;
    doc.text(`Additional Settlement Info: ${cleanSec}`, margin + 4, y + 33);
  }

  // Draw vector Scan-to-Pay QR Code on the right side of the Banking box
  const qrPayload = buildPaymentQrPayload(company as any, qrContext);
  drawVectorQrCodeOnPdf(doc, qrPayload, qrX, qrY, qrSize);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('SCAN TO PAY', qrX + qrSize / 2, qrY + qrSize + 3.5, { align: 'center' });

  return y + boxHeight;
}

export function generateInvoicePdf(
  rawInvoice: Invoice,
  customer?: Customer,
  settings?: AppSettings['general']
): jsPDF {
  const invoice = recalculateDocumentTotals(rawInvoice);
  const company = resolveCompanyProfile(settings);
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;

  const primaryColor = [15, 23, 42]; // slate-900
  const secondaryColor = [71, 85, 105]; // slate-600
  const lightBg = [248, 250, 252]; // slate-50
  const borderColor = [226, 232, 240]; // slate-200

  // 1. Top Header Banner
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(margin, margin, contentWidth, 24, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(company.businessName.toUpperCase(), margin + 6, margin + 10.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `TIN: ${company.tinNumber}  •  Tel: ${company.businessPhone}  •  ${company.businessEmail}`,
    margin + 6,
    margin + 17.5
  );

  // Document Type Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('TAX INVOICE', pageWidth - margin - 6, margin + 10.5, { align: 'right' });

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text(invoice.id, pageWidth - margin - 6, margin + 17.5, { align: 'right' });

  // 2. Company Info & Metadata Row
  let y = margin + 31;

  // Company details (Left)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('ISSUED BY:', margin, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text(company.businessName, margin, y + 4.5);
  doc.text(`Office / Billing Address: ${company.businessAddress}`, margin, y + 8.5);
  doc.text(`Support Phone: ${company.businessPhone}`, margin, y + 12.5);
  doc.text(`Official Email: ${company.businessEmail}`, margin, y + 16.5);
  doc.text(`TIN: ${company.tinNumber}   |   Default Currency: ${company.currency}`, margin, y + 20.5);

  // Invoice Meta (Right)
  const metaRightX = pageWidth - margin;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('INVOICE DETAILS:', metaRightX - 60, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);

  doc.text('Invoice Number:', metaRightX - 60, y + 4.5);
  doc.text(invoice.id, metaRightX, y + 4.5, { align: 'right' });

  doc.text('Issue Date:', metaRightX - 60, y + 8.5);
  doc.text(invoice.issueDate, metaRightX, y + 8.5, { align: 'right' });

  doc.text('Payment Due:', metaRightX - 60, y + 12.5);
  doc.text(invoice.dueDate, metaRightX, y + 12.5, { align: 'right' });

  doc.text('Status:', metaRightX - 60, y + 16.5);
  doc.setFont('helvetica', 'bold');
  if (invoice.status === 'paid') {
    doc.setTextColor(22, 163, 74);
  } else if (invoice.status === 'overdue') {
    doc.setTextColor(220, 38, 38);
  } else {
    doc.setTextColor(202, 138, 4);
  }
  doc.text(invoice.status.toUpperCase().replace('_', ' '), metaRightX, y + 16.5, { align: 'right' });

  // 3. Bill To Box
  y = y + 26;
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.rect(margin, y, contentWidth, 21, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text('BILL TO (CUSTOMER):', margin + 4, y + 5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  const clientName = customer?.businessName || invoice.customerName || 'Valued Customer';
  doc.text(clientName, margin + 4, y + 10.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  const contact = customer?.contactPerson ? `Attn: ${customer.contactPerson}` : '';
  const phone = customer?.phone ? ` | Tel: ${customer.phone}` : '';
  const email = customer?.email ? ` | Email: ${customer.email}` : '';
  doc.text(`${contact}${phone}${email}`, margin + 4, y + 15);
  if (customer?.billingAddress) {
    doc.text(`Address: ${customer.billingAddress}`, margin + 4, y + 19);
  }

  // 4. Line Items Table Header
  y = y + 26;
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(margin, y, contentWidth, 7, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('#', margin + 3, y + 4.8);
  doc.text('DESCRIPTION / SERVICE', margin + 12, y + 4.8);
  doc.text('QTY', margin + 110, y + 4.8, { align: 'right' });
  doc.text(`UNIT PRICE (${invoice.currency || company.currency})`, margin + 140, y + 4.8, { align: 'right' });
  doc.text(`TOTAL (${invoice.currency || company.currency})`, pageWidth - margin - 3, y + 4.8, { align: 'right' });

  // 5. Line Items Rows
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  invoice.items.forEach((item, index) => {
    const isEven = index % 2 === 0;
    doc.setFillColor(isEven ? 255 : lightBg[0], isEven ? 255 : lightBg[1], isEven ? 255 : lightBg[2]);
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.line(margin, y + 7, pageWidth - margin, y + 7);

    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.text(String(index + 1), margin + 3, y + 4.8);

    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    const desc = item.description.length > 55 ? `${item.description.slice(0, 52)}...` : item.description;
    doc.text(desc, margin + 12, y + 4.8);

    doc.text(String(item.quantity), margin + 110, y + 4.8, { align: 'right' });
    doc.text(item.unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2 }), margin + 140, y + 4.8, { align: 'right' });
    doc.text(item.total.toLocaleString('en-US', { minimumFractionDigits: 2 }), pageWidth - margin - 3, y + 4.8, { align: 'right' });

    y += 7;
  });

  // 6. Summary Calculation Box
  y += 4;
  const summaryBoxWidth = 75;
  const summaryX = pageWidth - margin - summaryBoxWidth;
  const curr = invoice.currency || company.currency;

  doc.setFontSize(8);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);

  doc.text('Subtotal:', summaryX, y + 4);
  doc.text(`${invoice.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${curr}`, pageWidth - margin, y + 4, { align: 'right' });

  if (invoice.discountAmount > 0) {
    y += 5;
    doc.text('Discount:', summaryX, y + 4);
    doc.text(`-${invoice.discountAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${curr}`, pageWidth - margin, y + 4, { align: 'right' });
  }

  if (invoice.taxRate > 0) {
    y += 5;
    doc.text(`VAT (${invoice.taxRate}%):`, summaryX, y + 4);
    doc.text(`${invoice.taxAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${curr}`, pageWidth - margin, y + 4, { align: 'right' });
  }

  y += 6;
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(summaryX - 4, y, summaryBoxWidth + 4, 8, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text('FINAL TOTAL:', summaryX, y + 5.5);
  doc.text(`${invoice.total.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${curr}`, pageWidth - margin - 2, y + 5.5, { align: 'right' });

  // 7. Banking & Payment Settlement Details Box + Scan-to-Pay QR Code
  y += 12;
  y = drawBankingDetailsBox(doc, margin, y, contentWidth, company, {
    documentType: 'INVOICE',
    documentId: invoice.id,
    customerName: clientName,
    amount: invoice.remainingBalance !== undefined && invoice.remainingBalance > 0 ? invoice.remainingBalance : invoice.total,
    currency: curr,
    dueOrValidDate: invoice.dueDate,
    customInstructions: invoice.paymentInstructions,
  });

  if (invoice.terms) {
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text('TERMS & CONDITIONS:', margin, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.text(invoice.terms, margin, y + 4);
  }

  // 8. Footer
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.line(margin, 280, pageWidth - margin, 280);

  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `${company.businessName} • TIN: ${company.tinNumber} • ${company.businessPhone} • ${company.businessEmail} • Address: ${company.businessAddress}`,
    margin,
    284
  );
  doc.text(`Generated on ${new Date().toLocaleDateString('en-US')}`, pageWidth - margin, 284, { align: 'right' });

  return doc;
}

export function generateQuotationPdf(
  rawQuotation: Quotation,
  customer?: Customer,
  settings?: AppSettings['general']
): jsPDF {
  const quotation = recalculateDocumentTotals(rawQuotation);
  const company = resolveCompanyProfile(settings);
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;

  const primaryColor = [30, 41, 59]; // slate-800
  const secondaryColor = [71, 85, 105];
  const lightBg = [248, 250, 252];
  const borderColor = [226, 232, 240];

  // Header Banner
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(margin, margin, contentWidth, 24, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(company.businessName.toUpperCase(), margin + 6, margin + 10.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `TIN: ${company.tinNumber}  •  Tel: ${company.businessPhone}  •  ${company.businessEmail}`,
    margin + 6,
    margin + 17.5
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('SERVICE QUOTATION', pageWidth - margin - 6, margin + 10.5, { align: 'right' });

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text(quotation.id, pageWidth - margin - 6, margin + 17.5, { align: 'right' });

  // Details
  let y = margin + 31;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('PREPARED BY:', margin, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text(company.businessName, margin, y + 4.5);
  doc.text(`Office / Billing Address: ${company.businessAddress}`, margin, y + 8.5);
  doc.text(`Support Phone: ${company.businessPhone}`, margin, y + 12.5);
  doc.text(`Official Email: ${company.businessEmail}`, margin, y + 16.5);
  doc.text(`TIN: ${company.tinNumber}   |   Default Currency: ${company.currency}`, margin, y + 20.5);

  // Meta Right
  const metaRightX = pageWidth - margin;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('QUOTATION DETAILS:', metaRightX - 60, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text('Quotation #:', metaRightX - 60, y + 4.5);
  doc.text(quotation.id, metaRightX, y + 4.5, { align: 'right' });

  doc.text('Issue Date:', metaRightX - 60, y + 8.5);
  doc.text(quotation.issueDate, metaRightX, y + 8.5, { align: 'right' });

  doc.text('Valid Until:', metaRightX - 60, y + 12.5);
  doc.text(quotation.validUntil, metaRightX, y + 12.5, { align: 'right' });

  doc.text('Status:', metaRightX - 60, y + 16.5);
  doc.setFont('helvetica', 'bold');
  doc.text((quotation.status || 'sent').toUpperCase(), metaRightX, y + 16.5, { align: 'right' });

  // Customer box
  y = y + 25;
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.rect(margin, y, contentWidth, 20, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text('PREPARED FOR (CLIENT):', margin + 4, y + 5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  const clientName = customer?.businessName || quotation.customerName || 'Valued Customer';
  doc.text(clientName, margin + 4, y + 10.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  const contact = customer?.contactPerson ? `Attn: ${customer.contactPerson}` : '';
  const phone = customer?.phone ? ` | Tel: ${customer.phone}` : '';
  const email = customer?.email ? ` | Email: ${customer.email}` : '';
  doc.text(`${contact}${phone}${email}`, margin + 4, y + 15);

  // Table header
  y = y + 25;
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(margin, y, contentWidth, 7, 'F');

  const curr = quotation.currency || company.currency;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('#', margin + 3, y + 4.8);
  doc.text('PROPOSED SERVICE / SPECIFICATION', margin + 12, y + 4.8);
  doc.text('QTY', margin + 110, y + 4.8, { align: 'right' });
  doc.text(`UNIT (${curr})`, margin + 140, y + 4.8, { align: 'right' });
  doc.text(`TOTAL (${curr})`, pageWidth - margin - 3, y + 4.8, { align: 'right' });

  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  quotation.items.forEach((item, index) => {
    const isEven = index % 2 === 0;
    doc.setFillColor(isEven ? 255 : lightBg[0], isEven ? 255 : lightBg[1], isEven ? 255 : lightBg[2]);
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.line(margin, y + 7, pageWidth - margin, y + 7);

    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.text(String(index + 1), margin + 3, y + 4.8);

    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    const desc = item.description.length > 55 ? `${item.description.slice(0, 52)}...` : item.description;
    doc.text(desc, margin + 12, y + 4.8);

    doc.text(String(item.quantity), margin + 110, y + 4.8, { align: 'right' });
    doc.text(item.unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2 }), margin + 140, y + 4.8, { align: 'right' });
    doc.text(item.total.toLocaleString('en-US', { minimumFractionDigits: 2 }), pageWidth - margin - 3, y + 4.8, { align: 'right' });

    y += 7;
  });

  // Summary
  y += 4;
  const summaryBoxWidth = 75;
  const summaryX = pageWidth - margin - summaryBoxWidth;

  doc.setFontSize(8);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);

  doc.text('Subtotal:', summaryX, y + 4);
  doc.text(`${quotation.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${curr}`, pageWidth - margin, y + 4, { align: 'right' });

  if (quotation.discountAmount > 0) {
    y += 5;
    doc.text('Discount:', summaryX, y + 4);
    doc.text(`-${quotation.discountAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${curr}`, pageWidth - margin, y + 4, { align: 'right' });
  }

  if (quotation.taxRate > 0) {
    y += 5;
    doc.text(`VAT (${quotation.taxRate}%):`, summaryX, y + 4);
    doc.text(`${quotation.taxAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${curr}`, pageWidth - margin, y + 4, { align: 'right' });
  }

  y += 6;
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(summaryX - 4, y, summaryBoxWidth + 4, 8, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text('ESTIMATED TOTAL:', summaryX, y + 5.5);
  doc.text(`${quotation.total.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${curr}`, pageWidth - margin - 2, y + 5.5, { align: 'right' });

  // Banking Details Box + Scan-to-Pay QR Code
  y += 12;
  y = drawBankingDetailsBox(doc, margin, y, contentWidth, company, {
    documentType: 'QUOTATION',
    documentId: quotation.id,
    customerName: clientName,
    amount: quotation.total,
    currency: curr,
    dueOrValidDate: quotation.validUntil,
    customInstructions: quotation.paymentInstructions,
  });

  // Terms
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('QUOTATION TERMS & VALIDITY:', margin, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text(
    quotation.terms || 'This quotation is valid for 30 days from date of issuance. Pricing subject to registry exchange rates.',
    margin,
    y + 4
  );

  // Footer
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.line(margin, 280, pageWidth - margin, 280);

  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `${company.businessName} • TIN: ${company.tinNumber} • ${company.businessPhone} • ${company.businessEmail} • Address: ${company.businessAddress}`,
    margin,
    284
  );
  doc.text(`Generated on ${new Date().toLocaleDateString('en-US')}`, pageWidth - margin, 284, { align: 'right' });

  return doc;
}

export function generateExecutiveReportPdf(
  reportData: {
    monthlyTrend: { month: string; invoiced: number; collected: number }[];
    smsStats: { total: number; sent: number; delivered: number; failed: number; queued: number };
    domainHealth: { total: number; active: number; expiringSoon: number; expired: number };
    financials: any;
  },
  settings?: AppSettings['general']
): jsPDF {
  const company = resolveCompanyProfile(settings);
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  const primaryColor = [15, 23, 42];
  const secondaryColor = [71, 85, 105];
  const lightBg = [248, 250, 252];
  const borderColor = [226, 232, 240];

  // 1. Header Banner
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(margin, margin, contentWidth, 24, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(company.businessName.toUpperCase(), margin + 6, margin + 10.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `TIN: ${company.tinNumber}  •  Tel: ${company.businessPhone}  •  ${company.businessEmail}`,
    margin + 6,
    margin + 17.5
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text('EXECUTIVE SYSTEM REPORT', pageWidth - margin - 6, margin + 10.5, { align: 'right' });

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text(`Date: ${new Date().toISOString().slice(0, 10)}`, pageWidth - margin - 6, margin + 17.5, { align: 'right' });

  // 2. Company & Report Identity Row
  let y = margin + 31;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('ORGANIZATION PROFILE:', margin, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text(`Business Legal Name: ${company.businessName}`, margin, y + 4.5);
  doc.text(`Tax Identification Number (TIN): ${company.tinNumber}`, margin, y + 8.5);
  doc.text(`Support Phone / Contact: ${company.businessPhone}`, margin, y + 12.5);
  doc.text(`Official Email: ${company.businessEmail}`, margin, y + 16.5);
  doc.text(`Office / Billing Address: ${company.businessAddress}   |   Currency: ${company.currency}`, margin, y + 20.5);

  // Executive Financial KPIs Box (Right)
  const metaRightX = pageWidth - margin;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('FINANCIAL SETTLEMENT SUMMARY:', metaRightX - 72, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  const curr = reportData?.financials?.currency || company.currency;
  const totalInvoiced = Number(reportData?.financials?.totalInvoiced || 0);
  const totalReceived = Number(reportData?.financials?.totalReceived || 0);
  const outstanding = Number(reportData?.financials?.outstandingReceivables || 0);
  const overdue = Number(reportData?.financials?.overdueAmount || 0);

  doc.text('Total Invoiced:', metaRightX - 72, y + 4.5);
  doc.text(`${totalInvoiced.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${curr}`, metaRightX, y + 4.5, { align: 'right' });

  doc.text('Confirmed Collections:', metaRightX - 72, y + 8.5);
  doc.setTextColor(22, 163, 74);
  doc.setFont('helvetica', 'bold');
  doc.text(`${totalReceived.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${curr}`, metaRightX, y + 8.5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text('Outstanding Receivables:', metaRightX - 72, y + 12.5);
  doc.text(`${outstanding.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${curr}`, metaRightX, y + 12.5, { align: 'right' });

  doc.text('Critical Overdue Balance:', metaRightX - 72, y + 16.5);
  doc.setTextColor(220, 38, 38);
  doc.text(`${overdue.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${curr}`, metaRightX, y + 16.5, { align: 'right' });

  // 3. Monthly Revenue Table
  y += 27;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('1. MONTHLY INVOICED VS. VERIFIED COLLECTED REVENUE (LAST 6 MONTHS)', margin, y);

  y += 3;
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(margin, y, contentWidth, 7, 'F');

  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('PERIOD / MONTH', margin + 4, y + 4.8);
  doc.text(`INVOICED (${curr})`, margin + 115, y + 4.8, { align: 'right' });
  doc.text(`COLLECTED (${curr})`, pageWidth - margin - 4, y + 4.8, { align: 'right' });

  y += 7;
  doc.setFont('helvetica', 'normal');
  const trends = reportData?.monthlyTrend || [];
  if (trends.length === 0) {
    doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.text('No monthly billing records in current period', margin + 4, y + 4.8);
    y += 7;
  } else {
    trends.forEach((m, idx) => {
      const isEven = idx % 2 === 0;
      doc.setFillColor(isEven ? 255 : lightBg[0], isEven ? 255 : lightBg[1], isEven ? 255 : lightBg[2]);
      doc.rect(margin, y, contentWidth, 7, 'F');
      doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
      doc.line(margin, y + 7, pageWidth - margin, y + 7);

      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(m.month, margin + 4, y + 4.8);
      doc.text(m.invoiced.toLocaleString('en-US', { minimumFractionDigits: 2 }), margin + 115, y + 4.8, { align: 'right' });
      doc.text(m.collected.toLocaleString('en-US', { minimumFractionDigits: 2 }), pageWidth - margin - 4, y + 4.8, { align: 'right' });
      y += 7;
    });
  }

  // 4. Domain Portfolio & SMS Gateway Health
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('2. DOMAIN PORTFOLIO & SMS ETHIOPIA GATEWAY ANALYTICS', margin, y);

  y += 3;
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.rect(margin, y, contentWidth, 24, 'FD');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Domain Registry Portfolio:', margin + 4, y + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text(`Total Managed Domains: ${reportData?.domainHealth?.total || 0}`, margin + 4, y + 10.5);
  doc.text(`Active & Up-to-Date: ${reportData?.domainHealth?.active || 0}`, margin + 4, y + 15);
  doc.text(
    `Expiring Soon (<=30d): ${reportData?.domainHealth?.expiringSoon || 0}   |   Expired: ${reportData?.domainHealth?.expired || 0}`,
    margin + 4,
    y + 19.5
  );

  const rightX = margin + contentWidth / 2 + 4;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('SMS Ethiopia Delivery Performance:', rightX, y + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text(`Total Dispatches Recorded: ${reportData?.smsStats?.total || 0}`, rightX, y + 10.5);
  doc.text(`Delivered / Sent: ${(reportData?.smsStats?.delivered || 0) + (reportData?.smsStats?.sent || 0)}`, rightX, y + 15);
  doc.text(`Failed Dispatches: ${reportData?.smsStats?.failed || 0}`, rightX, y + 19.5);

  // 5. Official Banking & Settlement Details Box + QR Code
  y += 29;
  y = drawBankingDetailsBox(doc, margin, y, contentWidth, company, {
    documentType: 'REPORT',
  });

  // 6. Footer
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.line(margin, 280, pageWidth - margin, 280);

  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `${company.businessName} • TIN: ${company.tinNumber} • ${company.businessPhone} • ${company.businessEmail} • Address: ${company.businessAddress}`,
    margin,
    284
  );
  doc.text(`Generated on ${new Date().toLocaleDateString('en-US')}`, pageWidth - margin, 284, { align: 'right' });

  return doc;
}
