import { getDb, saveDb, type Invoice, type Payment, type Quotation } from './db.ts';

export interface FinancialSummary {
  totalInvoiced: number;
  totalReceived: number; // only confirmed payments!
  outstandingReceivables: number;
  overdueAmount: number;
  unpaidInvoiceCount: number;
  overdueInvoiceCount: number;
  paidInvoiceCount: number;
  pendingQuotationsCount: number;
  pendingQuotationsValue: number;
  currency: string;
}

/**
 * Calculates financial metrics for a single invoice based on its confirmed payments
 */
export function getInvoiceFinancials(invoice: Invoice, payments: Payment[]) {
  // Only confirmed payments count toward settlement
  const invoicePayments = payments.filter(
    (p) => p.invoiceId === invoice.id && p.status === 'confirmed'
  );
  const totalPaid = invoicePayments.reduce((sum, p) => sum + p.amount, 0);
  const remainingBalance = Math.max(0, invoice.total - totalPaid);
  const overpayment = Math.max(0, totalPaid - invoice.total);

  return {
    totalPaid,
    remainingBalance,
    overpayment,
    payments: invoicePayments,
  };
}

function healDocumentTotals<T extends Invoice | Quotation>(doc: T): void {
  const rawItems = Array.isArray(doc.items) ? doc.items : [];
  if (rawItems.length === 0) return;

  let itemsSubtotal = 0;
  for (const item of rawItems) {
    const qty = Math.max(0, Number(item.quantity) || 0);
    const price = Math.max(0, Number(item.unitPrice) || 0);
    const explicitTotal = Number(item.total) || 0;
    const lineTotal = qty * price > 0 ? Math.round(qty * price * 100) / 100 : explicitTotal;
    item.quantity = qty || 1;
    item.unitPrice = price || lineTotal;
    item.total = lineTotal;
    itemsSubtotal += lineTotal;
  }
  itemsSubtotal = Math.round(itemsSubtotal * 100) / 100;

  if (itemsSubtotal > 0) {
    const discountAmount = Math.max(0, Number(doc.discountAmount) || 0);
    const taxRate = Math.max(0, Number(doc.taxRate) || 0);
    const taxable = Math.max(0, itemsSubtotal - discountAmount);
    const taxAmount = Math.round(taxable * (taxRate / 100) * 100) / 100;
    const computedTotal = Math.round((taxable + taxAmount) * 100) / 100;

    if ((Number(doc.subtotal) || 0) !== itemsSubtotal || (Number(doc.total) || 0) !== computedTotal) {
      doc.subtotal = itemsSubtotal;
      doc.discountAmount = discountAmount;
      doc.taxRate = taxRate;
      doc.taxAmount = taxAmount;
      doc.total = computedTotal;
    }
  }
}

/**
 * Recalculates and synchronizes invoice statuses across the database
 */
export function syncInvoiceStatuses(): void {
  const db = getDb();
  const now = new Date();

  for (const quote of db.quotations) {
    healDocumentTotals(quote);
  }

  for (const invoice of db.invoices) {
    healDocumentTotals(invoice);

    if (invoice.status === 'cancelled' || invoice.status === 'draft') {
      continue;
    }

    const { totalPaid, remainingBalance } = getInvoiceFinancials(invoice, db.payments);

    if (totalPaid >= invoice.total && invoice.total > 0) {
      invoice.status = 'paid';
    } else if (totalPaid > 0 && remainingBalance > 0) {
      invoice.status = 'partially_paid';
    } else {
      // 0 paid: check if overdue
      const due = new Date(invoice.dueDate);
      if (due < now) {
        invoice.status = 'overdue';
      } else {
        invoice.status = 'unpaid';
      }
    }
  }

  saveDb(db);
}

/**
 * Computes dashboard financial totals strictly from persistent records
 */
export function computeSystemFinancials(): FinancialSummary {
  const db = getDb();
  syncInvoiceStatuses();

  const currency = db.settings.general.currency || 'ETB';

  // Total received revenue strictly from confirmed payments
  const totalReceived = db.payments
    .filter((p) => p.status === 'confirmed')
    .reduce((sum, p) => sum + p.amount, 0);

  // Invoiced amounts (excluding cancelled invoices)
  const activeInvoices = db.invoices.filter((inv) => inv.status !== 'cancelled');
  const totalInvoiced = activeInvoices.reduce((sum, inv) => sum + inv.total, 0);

  let outstandingReceivables = 0;
  let overdueAmount = 0;
  let unpaidInvoiceCount = 0;
  let overdueInvoiceCount = 0;
  let paidInvoiceCount = 0;

  for (const inv of activeInvoices) {
    const { remainingBalance } = getInvoiceFinancials(inv, db.payments);

    if (remainingBalance > 0) {
      outstandingReceivables += remainingBalance;
      if (inv.status === 'overdue') {
        overdueAmount += remainingBalance;
        overdueInvoiceCount++;
      } else {
        unpaidInvoiceCount++;
      }
    } else {
      paidInvoiceCount++;
    }
  }

  // Pending quotations
  const pendingQuotes = db.quotations.filter(
    (q) => q.status === 'sent' || q.status === 'draft'
  );
  const pendingQuotationsCount = pendingQuotes.length;
  const pendingQuotationsValue = pendingQuotes.reduce((sum, q) => sum + q.total, 0);

  return {
    totalInvoiced,
    totalReceived,
    outstandingReceivables,
    overdueAmount,
    unpaidInvoiceCount,
    overdueInvoiceCount,
    paidInvoiceCount,
    pendingQuotationsCount,
    pendingQuotationsValue,
    currency,
  };
}
