import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  Plus,
  Trash2,
  Download,
  Printer,
  Send,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  DollarSign,
  X,
  CreditCard,
  Eye,
  Building2,
  QrCode,
  Mail,
} from 'lucide-react';
import { api } from '../services/api.ts';
import { Invoice, Quotation, Customer, LineItem, AppSettings } from '../types.ts';
import {
  generateInvoicePdf,
  generateQuotationPdf,
  resolveCompanyProfile,
  DEFAULT_COMPANY_PROFILE,
} from '../utils/pdfGenerator.ts';
import { PaymentQrCode } from '../components/PaymentQrCode.tsx';
import { EmailConfirmationModal } from '../components/EmailConfirmationModal.tsx';
import { composeInvoiceEmail, composeQuotationEmail } from '../services/gmailService.ts';

interface InvoicesViewProps {
  initialOpenNewModal?: boolean;
  onResetNewModal?: () => void;
  onRecordPaymentForInvoice?: (invoice: Invoice) => void;
}

export const InvoicesView: React.FC<InvoicesViewProps> = ({
  initialOpenNewModal,
  onResetNewModal,
  onRecordPaymentForInvoice,
}) => {
  const [activeTab, setActiveTab] = useState<'invoices' | 'quotations'>('invoices');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [companySettings, setCompanySettings] = useState<AppSettings['general']>(DEFAULT_COMPANY_PROFILE as any);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Create Invoice Modal
  const [showInvoiceModal, setShowInvoiceModal] = useState(initialOpenNewModal || false);
  const [invCustomerId, setInvCustomerId] = useState('');
  const [invIssueDate, setInvIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [invDueDate, setInvDueDate] = useState('');
  const [invItems, setInvItems] = useState<LineItem[]>([
    { id: 'item-1', description: 'Domain Renewal / Hosting Service', quantity: 1, unitPrice: 3500, total: 3500 },
  ]);
  const [invTaxRate, setInvTaxRate] = useState(15);
  const [invDiscount, setInvDiscount] = useState(0);
  const [invNotes, setInvNotes] = useState(DEFAULT_COMPANY_PROFILE.bankingDetails);
  const [savingInvoice, setSavingInvoice] = useState(false);

  // Create Quotation Modal
  const [showQuotationModal, setShowQuotationModal] = useState(false);
  const [quoCustomerId, setQuoCustomerId] = useState('');
  const [quoIssueDate, setQuoIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [quoValidUntil, setQuoValidUntil] = useState('');
  const [quoItems, setQuoItems] = useState<LineItem[]>([
    { id: 'item-1', description: 'Enterprise Digital Infrastructure Setup', quantity: 1, unitPrice: 15000, total: 15000 },
  ]);
  const [quoTaxRate, setQuoTaxRate] = useState(15);
  const [quoDiscount, setQuoDiscount] = useState(0);
  const [quoPaymentInstructions, setQuoPaymentInstructions] = useState(DEFAULT_COMPANY_PROFILE.bankingDetails);
  const [quoNotes, setQuoNotes] = useState('Quotation valid for 30 calendar days.');
  const [savingQuotation, setSavingQuotation] = useState(false);

  // PDF Preview Modal
  const [previewDoc, setPreviewDoc] = useState<{
    type: 'invoice' | 'quotation';
    data: Invoice | Quotation;
    customer?: Customer;
  } | null>(null);

  // Email Confirmation Modal State
  const [emailModalConfig, setEmailModalConfig] = useState<{
    isOpen: boolean;
    recipientEmail: string;
    recipientName: string;
    customerId: string;
    subject: string;
    body: string;
    messageType: 'invoice_reminder' | 'custom';
    title: string;
  }>({
    isOpen: false,
    recipientEmail: '',
    recipientName: '',
    customerId: '',
    subject: '',
    body: '',
    messageType: 'invoice_reminder',
    title: 'Send Document via Gmail',
  });

  const handleOpenEmailInvoice = (inv: Invoice) => {
    const cust = customers.find((c) => c.id === inv.customerId);
    const email = (inv.customerEmail || cust?.email || '').trim();
    if (!email) return;
    const composed = composeInvoiceEmail(inv, cust);
    setEmailModalConfig({
      isOpen: true,
      recipientEmail: email,
      recipientName: inv.customerName || cust?.businessName || 'Client',
      customerId: inv.customerId,
      subject: composed.subject,
      body: composed.body,
      messageType: 'invoice_reminder',
      title: `Send Invoice Email — ${inv.id}`,
    });
  };

  const handleOpenEmailQuotation = (q: Quotation) => {
    const cust = customers.find((c) => c.id === q.customerId);
    const email = (q.customerEmail || cust?.email || '').trim();
    if (!email) return;
    const composed = composeQuotationEmail(q, cust);
    setEmailModalConfig({
      isOpen: true,
      recipientEmail: email,
      recipientName: q.customerName || cust?.businessName || 'Client',
      customerId: q.customerId,
      subject: composed.subject,
      body: composed.body,
      messageType: 'custom',
      title: `Send Service Quotation Email — ${q.id}`,
    });
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [invData, quoData, custData, settingsData] = await Promise.all([
        api.getInvoices(),
        api.getQuotations(),
        api.getCustomers('', 'active'),
        api.getSettings().catch(() => null),
      ]);
      setInvoices(invData.invoices);
      setQuotations(quoData.quotations);
      setCustomers(custData.customers);
      if (settingsData?.settings?.general) {
        const resolved = resolveCompanyProfile(settingsData.settings.general);
        setCompanySettings({ ...settingsData.settings.general, ...resolved });
      }
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (initialOpenNewModal) {
      handleOpenCreateInvoice();
      if (onResetNewModal) onResetNewModal();
    }
  }, [initialOpenNewModal]);

  const handleOpenCreateInvoice = () => {
    const profile = resolveCompanyProfile(companySettings);
    setInvCustomerId(customers[0]?.id || '');
    setInvIssueDate(new Date().toISOString().split('T')[0]);
    const due = new Date();
    due.setDate(due.getDate() + 15);
    setInvDueDate(due.toISOString().split('T')[0]);
    setInvItems([
      { id: `item-${Date.now()}`, description: 'Domain Renewal / Hosting Service', quantity: 1, unitPrice: 3500, total: 3500 },
    ]);
    setInvTaxRate(15);
    setInvDiscount(0);
    setInvNotes(profile.bankingDetails);
    setShowInvoiceModal(true);
  };

  const handleOpenCreateQuotation = () => {
    const profile = resolveCompanyProfile(companySettings);
    setQuoCustomerId(customers[0]?.id || '');
    setQuoIssueDate(new Date().toISOString().split('T')[0]);
    const valid = new Date();
    valid.setDate(valid.getDate() + 30);
    setQuoValidUntil(valid.toISOString().split('T')[0]);
    setQuoItems([
      { id: `item-${Date.now()}`, description: 'Enterprise Digital Infrastructure Setup', quantity: 1, unitPrice: 15000, total: 15000 },
    ]);
    setQuoTaxRate(15);
    setQuoDiscount(0);
    setQuoPaymentInstructions(profile.bankingDetails);
    setQuoNotes('Quotation valid for 30 calendar days.');
    setShowQuotationModal(true);
  };

  // Line item helpers
  const updateInvoiceItem = (index: number, field: keyof LineItem, val: any) => {
    const next = [...invItems];
    next[index] = { ...next[index], [field]: val };
    const qty = Number(next[index].quantity) || 1;
    const price = Number(next[index].unitPrice) || 0;
    next[index].total = qty * price;
    setInvItems(next);
  };

  const addInvoiceItem = () => {
    setInvItems([
      ...invItems,
      { id: `item-${Date.now()}`, description: '', quantity: 1, unitPrice: 0, total: 0 },
    ]);
  };

  const removeInvoiceItem = (index: number) => {
    if (invItems.length <= 1) return;
    setInvItems(invItems.filter((_, i) => i !== index));
  };

  const calcInvoiceTotals = () => {
    const subtotal = invItems.reduce((sum, it) => sum + (it.total || 0), 0);
    const taxable = Math.max(0, subtotal - (Number(invDiscount) || 0));
    const taxAmount = (taxable * (Number(invTaxRate) || 0)) / 100;
    const total = taxable + taxAmount;
    return { subtotal, taxAmount, total };
  };

  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invCustomerId) return;
    setSavingInvoice(true);

    try {
      const res = await api.createInvoice({
        customerId: invCustomerId,
        issueDate: invIssueDate,
        dueDate: invDueDate,
        items: invItems,
        taxRate: Number(invTaxRate),
        discountAmount: Number(invDiscount),
        paymentInstructions: invNotes,
      });
      setShowInvoiceModal(false);
      await loadData();
      const cust = customers.find((c) => c.id === invCustomerId);
      if (res?.invoice && cust?.email?.trim()) {
        handleOpenEmailInvoice(res.invoice);
      }
    } catch (err: any) {
      console.error('Failed to save invoice:', err);
    } finally {
      setSavingInvoice(false);
    }
  };

  const handleSaveQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quoCustomerId) return;
    setSavingQuotation(true);

    try {
      const res = await api.createQuotation({
        customerId: quoCustomerId,
        issueDate: quoIssueDate,
        validUntil: quoValidUntil,
        items: quoItems,
        taxRate: Number(quoTaxRate),
        discountAmount: Number(quoDiscount),
        paymentInstructions: quoPaymentInstructions,
        terms: quoNotes,
      });
      setShowQuotationModal(false);
      await loadData();
      const cust = customers.find((c) => c.id === quoCustomerId);
      if (res?.quotation && cust?.email?.trim()) {
        handleOpenEmailQuotation(res.quotation);
      }
    } catch (err: any) {
      console.error('Failed to save quotation:', err);
    } finally {
      setSavingQuotation(false);
    }
  };

  // Convert Quotation to Invoice
  const handleConvertToInvoice = async (q: Quotation) => {
    if (confirm(`Convert quotation "${q.id}" to an active Invoice? The quotation will be accepted and preserved in history.`)) {
      try {
        const res = await api.convertQuotationToInvoice(q.id);
        alert(`Success! Created Invoice ${res.invoice.id} from Quotation ${q.id}.`);
        loadData();
        setActiveTab('invoices');
      } catch (err: any) {
        alert(`Conversion error: ${err.message}`);
      }
    }
  };

  // Send Invoice Reminder
  const handleSendInvoiceReminder = async (inv: Invoice) => {
    if (confirm(`Send SMS payment reminder to customer for invoice ${inv.id}?`)) {
      try {
        const res = await api.sendInvoiceReminder(inv.id);
        alert(`Reminder dispatched: Status is "${res.status}".`);
      } catch (err: any) {
        alert(`Reminder error: ${err.message}`);
      }
    }
  };

  // Download PDF with full Company Profile & Banking Details
  const handleDownloadPdf = (doc: { type: 'invoice' | 'quotation'; data: Invoice | Quotation }) => {
    const cust = customers.find((c) => c.id === doc.data.customerId);
    if (doc.type === 'invoice') {
      const pdf = generateInvoicePdf(doc.data as Invoice, cust, companySettings);
      pdf.save(`${doc.data.id}-${cust?.businessName || 'customer'}.pdf`);
    } else {
      const pdf = generateQuotationPdf(doc.data as Quotation, cust, companySettings);
      pdf.save(`${doc.data.id}-${cust?.businessName || 'customer'}.pdf`);
    }
  };

  const filteredInvoices = invoices.filter(
    (i) =>
      i.id.toLowerCase().includes(search.toLowerCase()) ||
      (i.customerName && i.customerName.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredQuotations = quotations.filter(
    (q) =>
      q.id.toLowerCase().includes(search.toLowerCase()) ||
      (q.customerName && q.customerName.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      {/* Top Header & Tab Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
            <button
              onClick={() => setActiveTab('invoices')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === 'invoices'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Invoices ({invoices.length})
            </button>
            <button
              onClick={() => setActiveTab('quotations')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === 'quotations'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Quotations ({quotations.length})
            </button>
          </div>

          <div className="relative flex-1 max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search document # or client..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'invoices' && (
            <a
              href={api.getExportCsvUrl('invoices')}
              download
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium shadow-2xs transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export Invoices</span>
            </a>
          )}

          {activeTab === 'invoices' ? (
            <button
              onClick={handleOpenCreateInvoice}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-2xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Create Invoice</span>
            </button>
          ) : (
            <button
              onClick={handleOpenCreateQuotation}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-2xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Create Quotation</span>
            </button>
          )}
        </div>
      </div>

      {/* Invoices List Table */}
      {activeTab === 'invoices' ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">Invoice #</th>
                  <th className="py-2.5 px-4">Customer</th>
                  <th className="py-2.5 px-4">Issue Date</th>
                  <th className="py-2.5 px-4">Due Date</th>
                  <th className="py-2.5 px-4">Total Amount</th>
                  <th className="py-2.5 px-4">Paid</th>
                  <th className="py-2.5 px-4">Balance</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400">
                      Loading invoices...
                    </td>
                  </tr>
                ) : filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400">
                      No invoices found.
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((inv) => {
                    const resolvedEmail = (
                      inv.customerEmail ||
                      customers.find((c) => c.id === inv.customerId)?.email ||
                      ''
                    ).trim();
                    return (
                    <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-blue-600">
                        {inv.id}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{inv.customerName}</div>
                        {resolvedEmail && (
                          <div className="text-[10px] text-blue-600 truncate max-w-[160px]">{resolvedEmail}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-mono">{inv.issueDate}</td>
                      <td className="py-3 px-4 text-slate-600 font-mono">{inv.dueDate}</td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {inv.total.toLocaleString()} {inv.currency}
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-emerald-700">
                        {(inv.totalPaid || 0).toLocaleString()} {inv.currency}
                      </td>
                      <td className="py-3 px-4 font-mono font-medium">
                        {(inv.remainingBalance || 0) > 0 ? (
                          <span className="text-rose-600 font-semibold">
                            {(inv.remainingBalance || 0).toLocaleString()} {inv.currency}
                          </span>
                        ) : (
                          <span className="text-slate-400">0.00 {inv.currency}</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                            inv.status === 'paid'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : inv.status === 'partially_paid'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : inv.status === 'overdue'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : inv.status === 'unpaid'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {inv.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {resolvedEmail && (
                            <button
                              onClick={() => handleOpenEmailInvoice(inv)}
                              title={`Email Invoice to ${resolvedEmail}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-blue-200 bg-blue-50/70 text-blue-700 hover:bg-blue-100 font-semibold text-[11px]"
                            >
                              <Mail className="w-3 h-3" />
                              <span>Email</span>
                            </button>
                          )}
                          <button
                            onClick={() =>
                              setPreviewDoc({
                                type: 'invoice',
                                data: inv,
                                customer: customers.find((c) => c.id === inv.customerId),
                              })
                            }
                            title="Scan to Pay QR & Preview Official Invoice"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-blue-200 bg-blue-50/70 text-blue-700 hover:bg-blue-100 font-semibold text-[11px]"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                            <span>QR / View</span>
                          </button>
                          <button
                            onClick={() => handleDownloadPdf({ type: 'invoice', data: inv })}
                            title="Download Official PDF (with Payment QR)"
                            className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-slate-100"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          {inv.status !== 'paid' && onRecordPaymentForInvoice && (
                            <button
                              onClick={() => onRecordPaymentForInvoice(inv)}
                              title="Record Payment for this Invoice"
                              className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs"
                            >
                              Pay
                            </button>
                          )}
                          {inv.status !== 'paid' && (
                            <button
                              onClick={() => handleSendInvoiceReminder(inv)}
                              title="Send SMS Invoice Reminder"
                              className="p-1 rounded text-slate-400 hover:text-amber-600 hover:bg-slate-100"
                            >
                              <Send className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Quotations List Table */
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">Quotation #</th>
                  <th className="py-2.5 px-4">Customer</th>
                  <th className="py-2.5 px-4">Issue Date</th>
                  <th className="py-2.5 px-4">Valid Until</th>
                  <th className="py-2.5 px-4">Subtotal</th>
                  <th className="py-2.5 px-4">Total Estimate</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      Loading quotations...
                    </td>
                  </tr>
                ) : filteredQuotations.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No quotations recorded.
                    </td>
                  </tr>
                ) : (
                  filteredQuotations.map((q) => {
                    const resolvedEmail = (
                      q.customerEmail ||
                      customers.find((c) => c.id === q.customerId)?.email ||
                      ''
                    ).trim();
                    return (
                    <tr key={q.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-purple-600">
                        {q.id}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{q.customerName}</div>
                        {resolvedEmail && (
                          <div className="text-[10px] text-blue-600 truncate max-w-[160px]">{resolvedEmail}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">{q.issueDate}</td>
                      <td className="py-3 px-4 font-mono text-slate-600">{q.validUntil}</td>
                      <td className="py-3 px-4 font-mono text-slate-700">
                        {q.subtotal.toLocaleString()} {q.currency}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {q.total.toLocaleString()} {q.currency}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                            q.status === 'accepted'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : q.status === 'sent'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {q.status}
                        </span>
                        {q.convertedInvoiceId && (
                          <div className="text-[10px] text-blue-600 font-mono mt-0.5">
                            → {q.convertedInvoiceId}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {resolvedEmail && (
                            <button
                              onClick={() => handleOpenEmailQuotation(q)}
                              title={`Email Quotation to ${resolvedEmail}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-blue-200 bg-blue-50/70 text-blue-700 hover:bg-blue-100 font-semibold text-[11px]"
                            >
                              <Mail className="w-3 h-3" />
                              <span>Email</span>
                            </button>
                          )}
                          <button
                            onClick={() =>
                              setPreviewDoc({
                                type: 'quotation',
                                data: q,
                                customer: customers.find((c) => c.id === q.customerId),
                              })
                            }
                            title="Scan to Pay QR & Preview Official Quotation"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-blue-200 bg-blue-50/70 text-blue-700 hover:bg-blue-100 font-semibold text-[11px]"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                            <span>QR / View</span>
                          </button>
                          <button
                            onClick={() => handleDownloadPdf({ type: 'quotation', data: q })}
                            title="Download PDF Quotation (with Payment QR)"
                            className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-slate-100"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          {!q.convertedInvoiceId && (
                            <button
                              onClick={() => handleConvertToInvoice(q)}
                              title="Convert to Live Invoice"
                              className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs flex items-center gap-1"
                            >
                              <span>Convert</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Invoice Modal */}
      {showInvoiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[92vh] flex flex-col p-6 shadow-2xl border border-slate-200 text-slate-900">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h3 className="text-sm font-bold text-slate-900">Create New Invoice</h3>
              <button
                onClick={() => setShowInvoiceModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveInvoice} className="space-y-4 overflow-y-auto flex-1 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="block font-medium text-slate-700 mb-1">
                    Select Customer *
                  </label>
                  <select
                    required
                    value={invCustomerId}
                    onChange={(e) => setInvCustomerId(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="">Select customer...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.businessName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Issue Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={invIssueDate}
                    onChange={(e) => setInvIssueDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Payment Due Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={invDueDate}
                    onChange={(e) => setInvDueDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md font-semibold text-slate-900"
                  />
                </div>
              </div>

              {/* Line items table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="font-semibold text-slate-800">
                    Invoice Line Items & Services
                  </label>
                  <button
                    type="button"
                    onClick={addInvoiceItem}
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Item</span>
                  </button>
                </div>

                <div className="space-y-2 border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  {invItems.map((item, idx) => (
                    <div key={item.id} className="flex items-center gap-2">
                      <input
                        type="text"
                        required
                        placeholder="Description of domain or service..."
                        value={item.description}
                        onChange={(e) => updateInvoiceItem(idx, 'description', e.target.value)}
                        className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                      />
                      <input
                        type="number"
                        required
                        min={0}
                        step="any"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => updateInvoiceItem(idx, 'quantity', e.target.value)}
                        className="w-16 px-2 py-1.5 border border-slate-300 rounded bg-white font-mono text-center text-xs"
                      />
                      <input
                        type="number"
                        required
                        min={0}
                        step="any"
                        placeholder="Unit Price"
                        value={item.unitPrice}
                        onChange={(e) => updateInvoiceItem(idx, 'unitPrice', e.target.value)}
                        className="w-24 px-2 py-1.5 border border-slate-300 rounded bg-white font-mono text-right text-xs"
                      />
                      <div className="w-24 font-mono font-bold text-right text-slate-900 text-xs">
                        {item.total.toLocaleString()} ETB
                      </div>
                      <button
                        type="button"
                        onClick={() => removeInvoiceItem(idx)}
                        disabled={invItems.length <= 1}
                        className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Calculations summary */}
              {(() => {
                const { subtotal, taxAmount, total } = calcInvoiceTotals();
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div className="space-y-2">
                      <label className="block font-medium text-slate-700">
                        Payment Instructions & Bank Account
                      </label>
                      <textarea
                        rows={3}
                        value={invNotes}
                        onChange={(e) => setInvNotes(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs"
                      />
                    </div>

                    <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-1.5">
                      <div className="flex justify-between text-slate-600">
                        <span>Subtotal:</span>
                        <span className="font-mono">{subtotal.toLocaleString()} ETB</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Discount:</span>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={invDiscount}
                          onChange={(e) => setInvDiscount(Number(e.target.value))}
                          className="w-20 px-1 py-0.5 border border-slate-300 rounded text-right font-mono text-xs"
                        />
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>VAT Rate (%):</span>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={invTaxRate}
                          onChange={(e) => setInvTaxRate(Number(e.target.value))}
                          className="w-20 px-1 py-0.5 border border-slate-300 rounded text-right font-mono text-xs"
                        />
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Tax Amount:</span>
                        <span className="font-mono">+{taxAmount.toLocaleString()} ETB</span>
                      </div>
                      <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-1.5 text-sm">
                        <span>Total Due:</span>
                        <span className="font-mono text-blue-600">{total.toLocaleString()} ETB</span>
                      </div>
                    </div>

                    <div className="sm:col-span-2">
                      <PaymentQrCode
                        settings={companySettings}
                        context={{
                          documentType: 'INVOICE',
                          customerName: customers.find((c) => c.id === invCustomerId)?.businessName,
                          amount: total,
                          currency: companySettings?.currency || 'ETB',
                          dueOrValidDate: invDueDate,
                          customInstructions: invNotes,
                        }}
                        size={76}
                        compact
                        showActions={false}
                      />
                    </div>
                  </div>
                );
              })()}

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowInvoiceModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingInvoice}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold disabled:opacity-50"
                >
                  {savingInvoice ? 'Saving...' : 'Issue Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Quotation Modal */}
      {showQuotationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[92vh] flex flex-col p-6 shadow-2xl border border-slate-200 text-slate-900">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h3 className="text-sm font-bold text-slate-900">Create Service Quotation</h3>
              <button
                onClick={() => setShowQuotationModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveQuotation} className="space-y-4 overflow-y-auto flex-1 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="block font-medium text-slate-700 mb-1">
                    Customer *
                  </label>
                  <select
                    required
                    value={quoCustomerId}
                    onChange={(e) => setQuoCustomerId(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white"
                  >
                    <option value="">Select customer...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.businessName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Issue Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={quoIssueDate}
                    onChange={(e) => setQuoIssueDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Valid Until *
                  </label>
                  <input
                    type="date"
                    required
                    value={quoValidUntil}
                    onChange={(e) => setQuoValidUntil(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-800 mb-1.5">
                  Proposed Services / Line Items
                </label>
                <div className="space-y-2 border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  {quoItems.map((item, idx) => (
                    <div key={item.id} className="flex items-center gap-2">
                      <input
                        type="text"
                        required
                        placeholder="Service specification..."
                        value={item.description}
                        onChange={(e) => {
                          const next = [...quoItems];
                          next[idx].description = e.target.value;
                          setQuoItems(next);
                        }}
                        className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                      />
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={item.quantity}
                        onChange={(e) => {
                          const next = [...quoItems];
                          next[idx].quantity = Number(e.target.value);
                          next[idx].total = next[idx].quantity * next[idx].unitPrice;
                          setQuoItems(next);
                        }}
                        className="w-16 px-2 py-1.5 border border-slate-300 rounded bg-white font-mono text-center text-xs"
                      />
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={item.unitPrice}
                        onChange={(e) => {
                          const next = [...quoItems];
                          next[idx].unitPrice = Number(e.target.value);
                          next[idx].total = next[idx].quantity * next[idx].unitPrice;
                          setQuoItems(next);
                        }}
                        className="w-24 px-2 py-1.5 border border-slate-300 rounded bg-white font-mono text-right text-xs"
                      />
                      <div className="w-24 font-mono font-bold text-right text-slate-900 text-xs">
                        {item.total.toLocaleString()} ETB
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Banking & Settlement Details (Included on Quotation)
                  </label>
                  <textarea
                    rows={2}
                    value={quoPaymentInstructions}
                    onChange={(e) => setQuoPaymentInstructions(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Quotation Terms & Validity Note
                  </label>
                  <textarea
                    rows={2}
                    value={quoNotes}
                    onChange={(e) => setQuoNotes(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs"
                  />
                </div>
                <div className="sm:col-span-2">
                  <PaymentQrCode
                    settings={companySettings}
                    context={{
                      documentType: 'QUOTATION',
                      customerName: customers.find((c) => c.id === quoCustomerId)?.businessName,
                      amount: quoItems.reduce((s, it) => s + (it.total || 0), 0) * (1 + (Number(quoTaxRate) || 0) / 100),
                      currency: companySettings?.currency || 'ETB',
                      dueOrValidDate: quoValidUntil,
                      customInstructions: quoPaymentInstructions,
                    }}
                    size={76}
                    compact
                    showActions={false}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowQuotationModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingQuotation}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold disabled:opacity-50"
                >
                  {savingQuotation ? 'Saving...' : 'Create Quotation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Official Document Preview Modal (Applies Company Profile & Banking Details) */}
      {previewDoc && (() => {
        const company = resolveCompanyProfile(companySettings);
        const docData = previewDoc.data;
        const cust = previewDoc.customer;
        const isInvoice = previewDoc.type === 'invoice';
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs">
            <div className="bg-white rounded-xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
              <div className="flex items-center justify-between px-6 py-3.5 bg-slate-900 text-white">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Official {isInvoice ? 'Tax Invoice' : 'Service Quotation'} — {docData.id}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {(cust?.email || docData.customerEmail) && (
                    <button
                      onClick={() => {
                        if (isInvoice) {
                          handleOpenEmailInvoice(docData as Invoice);
                        } else {
                          handleOpenEmailQuotation(docData as Quotation);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Email to Client</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleDownloadPdf({ type: previewDoc.type, data: docData })}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download PDF</span>
                  </button>
                  <button
                    onClick={() => setPreviewDoc(null)}
                    className="p-1 text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto space-y-5 text-xs">
                {/* Company Profile Header */}
                <div className="flex flex-col sm:flex-row justify-between gap-4 pb-4 border-b border-slate-200">
                  <div className="space-y-1">
                    <div className="text-base font-extrabold text-slate-900 tracking-tight">
                      {company.businessName}
                    </div>
                    <div className="text-slate-600">
                      Office / Billing Address: <strong className="text-slate-800">{company.businessAddress}</strong>
                    </div>
                    <div className="text-slate-600">
                      Support Phone: <strong className="font-mono text-slate-800">{company.businessPhone}</strong>
                    </div>
                    <div className="text-slate-600">
                      Official Email: <strong className="text-slate-800">{company.businessEmail}</strong>
                    </div>
                    <div className="text-slate-600">
                      TIN: <strong className="font-mono text-slate-900">{company.tinNumber}</strong> • Currency:{' '}
                      <strong className="font-mono text-slate-900">{company.currency}</strong>
                    </div>
                  </div>

                  <div className="sm:text-right space-y-1">
                    <div className="text-sm font-bold text-blue-600 uppercase">
                      {isInvoice ? 'TAX INVOICE' : 'SERVICE QUOTATION'}
                    </div>
                    <div className="font-mono font-bold text-slate-900">{docData.id}</div>
                    <div className="text-slate-600">Issue Date: {docData.issueDate}</div>
                    {isInvoice ? (
                      <div className="text-slate-600">Due Date: {(docData as Invoice).dueDate}</div>
                    ) : (
                      <div className="text-slate-600">Valid Until: {(docData as Quotation).validUntil}</div>
                    )}
                  </div>
                </div>

                {/* Client Info */}
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                  <div className="text-[10px] font-bold uppercase text-slate-500">
                    {isInvoice ? 'Bill To (Customer)' : 'Prepared For (Client)'}
                  </div>
                  <div className="text-sm font-bold text-slate-900">
                    {cust?.businessName || docData.customerName || 'Valued Customer'}
                  </div>
                  <div className="text-slate-600">
                    {cust?.contactPerson && <span>Attn: {cust.contactPerson} • </span>}
                    {cust?.phone && <span>Tel: {cust.phone} • </span>}
                    {cust?.email && <span>Email: {cust.email}</span>}
                  </div>
                </div>

                {/* Line Items */}
                <table className="w-full text-left border border-slate-200 rounded-lg overflow-hidden">
                  <thead className="bg-slate-900 text-white text-[11px]">
                    <tr>
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-3">Description / Service</th>
                      <th className="py-2 px-3 text-right">Qty</th>
                      <th className="py-2 px-3 text-right">Unit Price</th>
                      <th className="py-2 px-3 text-right">Total ({docData.currency})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {docData.items.map((it, idx) => (
                      <tr key={it.id || idx}>
                        <td className="py-2 px-3 text-slate-500">{idx + 1}</td>
                        <td className="py-2 px-3 font-medium text-slate-900">{it.description}</td>
                        <td className="py-2 px-3 text-right font-mono">{it.quantity}</td>
                        <td className="py-2 px-3 text-right font-mono">{it.unitPrice.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold">{it.total.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Summary, Banking Details & Scan-to-Pay QR Code */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch">
                  <div className="md:col-span-5 p-3.5 rounded-xl bg-blue-50/60 border border-blue-200 flex flex-col justify-between space-y-2">
                    <div className="space-y-1.5">
                      <div className="font-bold text-slate-900 uppercase text-[11px] flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-blue-600" />
                        <span>Banking & Payment Settlement Details</span>
                      </div>
                      <div className="text-slate-700 space-y-1 text-[11px]">
                        <div>
                          Bank: <strong>{company.bankName}</strong>
                        </div>
                        <div>
                          Account Holder: <strong>{company.bankAccountName}</strong>
                        </div>
                        <div>
                          Account Number:{' '}
                          <strong className="font-mono text-blue-700">{company.bankAccountNumber}</strong>
                        </div>
                        <div>
                          Telebirr / Mobile Money:{' '}
                          <strong className="font-mono">{company.telebirrNumber}</strong>
                        </div>
                        {company.secondaryBankDetails && (
                          <div className="text-slate-600 pt-0.5">{company.secondaryBankDetails}</div>
                        )}
                      </div>
                    </div>
                    <div className="text-[10px] text-blue-800 bg-white/80 px-2.5 py-1.5 rounded border border-blue-100">
                      Scan the QR code with your mobile banking or camera app to view full payment details for{' '}
                      <strong>{docData.id}</strong>.
                    </div>
                  </div>

                  <div className="md:col-span-3 flex items-center justify-center">
                    <PaymentQrCode
                      settings={companySettings}
                      context={{
                        documentType: isInvoice ? 'INVOICE' : 'QUOTATION',
                        documentId: docData.id,
                        customerName: cust?.businessName || docData.customerName,
                        amount:
                          isInvoice &&
                          (docData as Invoice).remainingBalance !== undefined &&
                          (docData as Invoice).remainingBalance! > 0
                            ? (docData as Invoice).remainingBalance
                            : docData.total,
                        currency: docData.currency || company.currency,
                        dueOrValidDate: isInvoice
                          ? (docData as Invoice).dueDate
                          : (docData as Quotation).validUntil,
                        customInstructions: docData.paymentInstructions,
                      }}
                      size={112}
                    />
                  </div>

                  <div className="md:col-span-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between space-y-2">
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-slate-600">
                        <span>Subtotal:</span>
                        <span className="font-mono">
                          {docData.subtotal.toLocaleString()} {docData.currency}
                        </span>
                      </div>
                      {docData.discountAmount > 0 && (
                        <div className="flex justify-between text-slate-600">
                          <span>Discount:</span>
                          <span className="font-mono">
                            -{docData.discountAmount.toLocaleString()} {docData.currency}
                          </span>
                        </div>
                      )}
                      {docData.taxRate > 0 && (
                        <div className="flex justify-between text-slate-600">
                          <span>VAT ({docData.taxRate}%):</span>
                          <span className="font-mono">
                            +{docData.taxAmount.toLocaleString()} {docData.currency}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-2 text-sm">
                      <span>{isInvoice ? 'Final Total:' : 'Estimated Total:'}</span>
                      <span className="font-mono text-blue-600">
                        {docData.total.toLocaleString()} {docData.currency}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Email Confirmation Modal */}
      <EmailConfirmationModal
        isOpen={emailModalConfig.isOpen}
        onClose={() => setEmailModalConfig((prev) => ({ ...prev, isOpen: false }))}
        onSuccess={() => loadData()}
        mode="single"
        initialRecipientEmail={emailModalConfig.recipientEmail}
        recipientName={emailModalConfig.recipientName}
        customerId={emailModalConfig.customerId}
        initialSubject={emailModalConfig.subject}
        initialBody={emailModalConfig.body}
        messageType={emailModalConfig.messageType}
        title={emailModalConfig.title}
      />
    </div>
  );
};
