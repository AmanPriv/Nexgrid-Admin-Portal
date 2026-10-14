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
} from 'lucide-react';
import { api } from '../services/api.ts';
import { Invoice, Quotation, Customer, LineItem } from '../types.ts';
import { generateInvoicePdf, generateQuotationPdf } from '../utils/pdfGenerator.ts';

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
  const [invNotes, setInvNotes] = useState('Payment instructions: CBE A/C: 1000234567890 or Telebirr: 0911234567.');
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
  const [quoNotes, setQuoNotes] = useState('Quotation valid for 30 calendar days.');
  const [savingQuotation, setSavingQuotation] = useState(false);

  // PDF Preview Modal
  const [previewDoc, setPreviewDoc] = useState<{
    type: 'invoice' | 'quotation';
    data: Invoice | Quotation;
    customer?: Customer;
  } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [invData, quoData, custData] = await Promise.all([
        api.getInvoices(),
        api.getQuotations(),
        api.getCustomers('', 'active'),
      ]);
      setInvoices(invData.invoices);
      setQuotations(quoData.quotations);
      setCustomers(custData.customers);
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
    setInvNotes('Commercial Bank of Ethiopia (CBE) A/C: 1000234567890 | Telebirr: 0911234567');
    setShowInvoiceModal(true);
  };

  const handleOpenCreateQuotation = () => {
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
      await api.createInvoice({
        customerId: invCustomerId,
        issueDate: invIssueDate,
        dueDate: invDueDate,
        items: invItems,
        taxRate: Number(invTaxRate),
        discountAmount: Number(invDiscount),
        paymentInstructions: invNotes,
      });
      setShowInvoiceModal(false);
      loadData();
    } catch (err: any) {
      alert(`Failed to save invoice: ${err.message}`);
    } finally {
      setSavingInvoice(false);
    }
  };

  const handleSaveQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quoCustomerId) return;
    setSavingQuotation(true);

    try {
      await api.createQuotation({
        customerId: quoCustomerId,
        issueDate: quoIssueDate,
        validUntil: quoValidUntil,
        items: quoItems,
        taxRate: Number(quoTaxRate),
        discountAmount: Number(quoDiscount),
        terms: quoNotes,
      });
      setShowQuotationModal(false);
      loadData();
    } catch (err: any) {
      alert(`Failed to save quotation: ${err.message}`);
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

  // Download PDF
  const handleDownloadPdf = (doc: { type: 'invoice' | 'quotation'; data: Invoice | Quotation }) => {
    const cust = customers.find((c) => c.id === doc.data.customerId);
    if (doc.type === 'invoice') {
      const pdf = generateInvoicePdf(doc.data as Invoice, cust);
      pdf.save(`${doc.data.id}-${cust?.businessName || 'customer'}.pdf`);
    } else {
      const pdf = generateQuotationPdf(doc.data as Quotation, cust);
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
                  filteredInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-blue-600">
                        {inv.id}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{inv.customerName}</div>
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
                          <button
                            onClick={() => handleDownloadPdf({ type: 'invoice', data: inv })}
                            title="Download Official PDF"
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
                  ))
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
                  filteredQuotations.map((q) => (
                    <tr key={q.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-purple-600">
                        {q.id}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {q.customerName}
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
                          <button
                            onClick={() => handleDownloadPdf({ type: 'quotation', data: q })}
                            title="Download PDF Quotation"
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
                  ))
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
                        min={1}
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => updateInvoiceItem(idx, 'quantity', e.target.value)}
                        className="w-16 px-2 py-1.5 border border-slate-300 rounded bg-white font-mono text-center text-xs"
                      />
                      <input
                        type="number"
                        required
                        min={0}
                        step={50}
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
                          max={50}
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
                        min={1}
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
                        step={50}
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
    </div>
  );
};
