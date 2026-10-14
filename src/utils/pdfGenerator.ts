import { jsPDF } from 'jspdf';
import { Invoice, Quotation, Customer, AppSettings } from '../types.ts';

export function generateInvoicePdf(
  invoice: Invoice,
  customer?: Customer,
  settings?: AppSettings['general']
): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;

  // Primary colors
  const primaryColor = [15, 23, 42]; // slate-900
  const secondaryColor = [71, 85, 105]; // slate-600
  const accentColor = [37, 99, 235]; // blue-600
  const lightBg = [248, 250, 252]; // slate-50
  const borderColor = [226, 232, 240]; // slate-200

  // 1. Top Header Banner
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(margin, margin, contentWidth, 24, 'F');

  // Company Brand Name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text(settings?.businessName || 'NEXGRID DIGITAL SYSTEMS', margin + 6, margin + 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text('Enterprise Digital Infrastructure & Domain Registry', margin + 6, margin + 18);

  // Document Type Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('TAX INVOICE', pageWidth - margin - 6, margin + 11, { align: 'right' });

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text(invoice.id, pageWidth - margin - 6, margin + 18, { align: 'right' });

  // 2. Company Info & Metadata Row
  let y = margin + 32;

  // Company details (Left)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('ISSUED BY:', margin, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text(settings?.businessName || 'NexGrid Digital Systems PLC', margin, y + 4.5);
  doc.text(settings?.businessAddress || 'Bole Medhanialem Commercial Center, Addis Ababa', margin, y + 8.5);
  doc.text(`Phone: ${settings?.businessPhone || '+251 911 234 567'}`, margin, y + 12.5);
  doc.text(`Email: ${settings?.businessEmail || 'support@nexgrid.et'}`, margin, y + 16.5);
  doc.text(`TIN: ${settings?.tinNumber || '0054892147'}`, margin, y + 20.5);

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
  doc.rect(margin, y, contentWidth, 22, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text('BILL TO (CUSTOMER):', margin + 4, y + 5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text(customer?.businessName || invoice.customerName || 'Valued Customer', margin + 4, y + 10.5);

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
  y = y + 28;
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(margin, y, contentWidth, 7, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('#', margin + 3, y + 4.8);
  doc.text('DESCRIPTION / SERVICE', margin + 12, y + 4.8);
  doc.text('QTY', margin + 110, y + 4.8, { align: 'right' });
  doc.text(`UNIT PRICE (${invoice.currency})`, margin + 140, y + 4.8, { align: 'right' });
  doc.text(`TOTAL (${invoice.currency})`, pageWidth - margin - 3, y + 4.8, { align: 'right' });

  // 5. Line Items Rows
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  invoice.items.forEach((item, index) => {
    const isEven = index % 2 === 0;
    if (isEven) {
      doc.setFillColor(255, 255, 255);
    } else {
      doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
    }
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.line(margin, y + 7, pageWidth - margin, y + 7);

    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.text(String(index + 1), margin + 3, y + 4.8);

    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    // Truncate description if very long
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

  doc.setFontSize(8);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);

  doc.text('Subtotal:', summaryX, y + 4);
  doc.text(`${invoice.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${invoice.currency}`, pageWidth - margin, y + 4, { align: 'right' });

  if (invoice.discountAmount > 0) {
    y += 5;
    doc.text('Discount:', summaryX, y + 4);
    doc.text(`-${invoice.discountAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${invoice.currency}`, pageWidth - margin, y + 4, { align: 'right' });
  }

  if (invoice.taxRate > 0) {
    y += 5;
    doc.text(`VAT (${invoice.taxRate}%):`, summaryX, y + 4);
    doc.text(`${invoice.taxAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${invoice.currency}`, pageWidth - margin, y + 4, { align: 'right' });
  }

  y += 6;
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(summaryX - 4, y, summaryBoxWidth + 4, 8, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text('FINAL TOTAL:', summaryX, y + 5.5);
  doc.text(`${invoice.total.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${invoice.currency}`, pageWidth - margin - 2, y + 5.5, { align: 'right' });

  // 7. Payment Instructions & Terms
  y += 15;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('PAYMENT INSTRUCTIONS & REMITTANCE:', margin, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  const instructions =
    invoice.paymentInstructions ||
    'Commercial Bank of Ethiopia (CBE) A/C: 1000234567890 | Telebirr: 0911234567 | NexGrid Digital Systems';
  doc.text(instructions, margin, y + 4.5);

  if (invoice.terms) {
    y += 9;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text('TERMS & CONDITIONS:', margin, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.text(invoice.terms, margin, y + 4.5);
  }

  // 8. Footer
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.line(margin, 280, pageWidth - margin, 280);

  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('NexGrid Digital Systems • Secure Enterprise Administrative Portal • Official Document', margin, 284);
  doc.text(`Generated on ${new Date().toLocaleDateString('en-US')}`, pageWidth - margin, 284, { align: 'right' });

  return doc;
}

export function generateQuotationPdf(
  quotation: Quotation,
  customer?: Customer,
  settings?: AppSettings['general']
): jsPDF {
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
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text(settings?.businessName || 'NEXGRID DIGITAL SYSTEMS', margin + 6, margin + 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text('Enterprise Digital Infrastructure & Domain Services', margin + 6, margin + 18);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('SERVICE QUOTATION', pageWidth - margin - 6, margin + 11, { align: 'right' });

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text(quotation.id, pageWidth - margin - 6, margin + 18, { align: 'right' });

  // Details
  let y = margin + 32;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('PREPARED BY:', margin, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text(settings?.businessName || 'NexGrid Digital Systems PLC', margin, y + 4.5);
  doc.text(`Phone: ${settings?.businessPhone || '+251 911 234 567'}`, margin, y + 8.5);
  doc.text(`Email: ${settings?.businessEmail || 'support@nexgrid.et'}`, margin, y + 12.5);

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

  // Customer box
  y = y + 20;
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.rect(margin, y, contentWidth, 20, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text('PREPARED FOR:', margin + 4, y + 5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text(customer?.businessName || quotation.customerName || 'Valued Customer', margin + 4, y + 10.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  const contact = customer?.contactPerson ? `Attn: ${customer.contactPerson}` : '';
  const phone = customer?.phone ? ` | Tel: ${customer.phone}` : '';
  doc.text(`${contact}${phone}`, margin + 4, y + 15);

  // Table header
  y = y + 26;
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(margin, y, contentWidth, 7, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('#', margin + 3, y + 4.8);
  doc.text('PROPOSED SERVICE / SPECIFICATION', margin + 12, y + 4.8);
  doc.text('QTY', margin + 110, y + 4.8, { align: 'right' });
  doc.text(`UNIT (${quotation.currency})`, margin + 140, y + 4.8, { align: 'right' });
  doc.text(`TOTAL (${quotation.currency})`, pageWidth - margin - 3, y + 4.8, { align: 'right' });

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
  doc.text(`${quotation.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${quotation.currency}`, pageWidth - margin, y + 4, { align: 'right' });

  if (quotation.taxRate > 0) {
    y += 5;
    doc.text(`VAT (${quotation.taxRate}%):`, summaryX, y + 4);
    doc.text(`${quotation.taxAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${quotation.currency}`, pageWidth - margin, y + 4, { align: 'right' });
  }

  y += 6;
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(summaryX - 4, y, summaryBoxWidth + 4, 8, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text('ESTIMATED TOTAL:', summaryX, y + 5.5);
  doc.text(`${quotation.total.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${quotation.currency}`, pageWidth - margin - 2, y + 5.5, { align: 'right' });

  // Terms
  y += 15;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('QUOTATION TERMS & VALIDITY:', margin, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text(quotation.terms || 'This quotation is valid for 30 days from date of issuance. Pricing subject to registry exchange rates.', margin, y + 4.5);

  // Footer
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.line(margin, 280, pageWidth - margin, 280);

  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('NexGrid Digital Systems • Official Quotation • Confidential', margin, 284);
  doc.text(`Generated on ${new Date().toLocaleDateString('en-US')}`, pageWidth - margin, 284, { align: 'right' });

  return doc;
}
