import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Search,
  Plus,
  Download,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Clock,
  ArrowRight,
  Filter,
  DollarSign,
  X,
  ShieldAlert,
  Mail,
} from 'lucide-react';
import { api } from '../services/api.ts';
import { Payment, Customer, Invoice } from '../types.ts';
import { EmailConfirmationModal } from '../components/EmailConfirmationModal.tsx';
import { composePaymentReceiptEmail } from '../services/gmailService.ts';

interface PaymentsViewProps {
  initialOpenNewModal?: boolean;
  onResetNewModal?: () => void;
  preselectedInvoice?: Invoice | null;
  onClearPreselectedInvoice?: () => void;
}

export const PaymentsView: React.FC<PaymentsViewProps> = ({
  initialOpenNewModal,
  onResetNewModal,
  preselectedInvoice,
  onClearPreselectedInvoice,
}) => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'confirmed' | 'pending' | 'reversed'>('all');

  // Record Payment Modal
  const [showModal, setShowModal] = useState(initialOpenNewModal || false);
  const [formCustomerId, setFormCustomerId] = useState('');
  const [formInvoiceId, setFormInvoiceId] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formMethod, setFormMethod] = useState<'bank_transfer' | 'telebirr' | 'cbe_birr' | 'cash' | 'check' | 'other'>('bank_transfer');
  const [formRefNumber, setFormRefNumber] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formNotes, setFormNotes] = useState('');
  const [formStatus, setFormStatus] = useState<'confirmed' | 'pending'>('confirmed');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Reversal Modal
  const [reversingPayment, setReversingPayment] = useState<Payment | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [reversingLoading, setReversingLoading] = useState(false);

  // Email Confirmation Modal State
  const [emailModalConfig, setEmailModalConfig] = useState<{
    isOpen: boolean;
    recipientEmail: string;
    recipientName: string;
    customerId: string;
    subject: string;
    body: string;
    title: string;
  }>({
    isOpen: false,
    recipientEmail: '',
    recipientName: '',
    customerId: '',
    subject: '',
    body: '',
    title: 'Send Payment Confirmation Email',
  });

  const handleOpenEmailReceipt = (p: Payment) => {
    const cust = customers.find((c) => c.id === p.customerId);
    const email = (p.customerEmail || cust?.email || '').trim();
    if (!email) return;
    const linkedInv = p.invoiceId ? invoices.find((i) => i.id === p.invoiceId) : undefined;
    const composed = composePaymentReceiptEmail(p, cust, linkedInv?.remainingBalance);
    setEmailModalConfig({
      isOpen: true,
      recipientEmail: email,
      recipientName: p.customerName || cust?.businessName || 'Client',
      customerId: p.customerId,
      subject: composed.subject,
      body: composed.body,
      title: `Send Payment Confirmation Receipt — ${p.id}`,
    });
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [payData, custData, invData] = await Promise.all([
        api.getPayments(),
        api.getCustomers('', 'active'),
        api.getInvoices(),
      ]);
      setPayments(payData.payments);
      setCustomers(custData.customers);
      setInvoices(invData.invoices);
    } catch (err) {
      console.error('Failed to load payments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (initialOpenNewModal) {
      handleOpenCreate();
      if (onResetNewModal) onResetNewModal();
    }
  }, [initialOpenNewModal]);

  useEffect(() => {
    if (preselectedInvoice) {
      handleOpenCreate();
      setFormCustomerId(preselectedInvoice.customerId);
      setFormInvoiceId(preselectedInvoice.id);
      setFormAmount(String(preselectedInvoice.remainingBalance || preselectedInvoice.total));
      setFormNotes(`Payment towards invoice ${preselectedInvoice.id}`);
      if (onClearPreselectedInvoice) onClearPreselectedInvoice();
    }
  }, [preselectedInvoice]);

  const handleOpenCreate = () => {
    setFormCustomerId(customers[0]?.id || '');
    setFormInvoiceId('');
    setFormAmount('');
    setFormMethod('bank_transfer');
    setFormRefNumber('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormNotes('');
    setFormStatus('confirmed');
    setFormError(null);
    setShowModal(true);
  };

  // If customer changes in payment form, update available invoices
  const customerInvoices = invoices.filter(
    (i) => i.customerId === formCustomerId && i.status !== 'cancelled'
  );

  const handleInvoiceSelect = (invId: string) => {
    setFormInvoiceId(invId);
    if (invId) {
      const inv = invoices.find((i) => i.id === invId);
      if (inv) {
        setFormAmount(String(inv.remainingBalance ?? inv.total));
      }
    }
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCustomerId || !formAmount || Number(formAmount) <= 0) {
      setFormError('Please select a customer and provide a valid payment amount.');
      return;
    }
    setSaving(true);
    setFormError(null);

    try {
      const res = await api.recordPayment({
        customerId: formCustomerId,
        invoiceId: formInvoiceId || undefined,
        amount: Number(formAmount),
        currency: 'ETB',
        paymentDate: formDate,
        paymentMethod: formMethod,
        referenceNumber: formRefNumber,
        notes: formNotes,
        status: formStatus,
      });
      setShowModal(false);
      await loadData();
      const cust = customers.find((c) => c.id === formCustomerId);
      if (formStatus === 'confirmed' && res?.payment && cust?.email?.trim()) {
        handleOpenEmailReceipt(res.payment);
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmPending = async (paymentId: string) => {
    if (confirm('Confirm this pending payment? This will update the customer balance and invoice status.')) {
      try {
        await api.confirmPayment(paymentId);
        loadData();
      } catch (err: any) {
        alert(`Confirmation error: ${err.message}`);
      }
    }
  };

  const handleExecuteReversal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversingPayment || !reversalReason.trim()) return;
    setReversingLoading(true);

    try {
      await api.reversePayment(reversingPayment.id, reversalReason.trim());
      setReversingPayment(null);
      setReversalReason('');
      loadData();
    } catch (err: any) {
      alert(`Reversal error: ${err.message}`);
    } finally {
      setReversingLoading(false);
    }
  };

  // Metric sums
  const totalConfirmed = payments
    .filter((p) => p.status === 'confirmed')
    .reduce((sum, p) => sum + p.amount, 0);

  const totalPending = payments
    .filter((p) => p.status === 'pending')
    .reduce((sum, p) => sum + p.amount, 0);

  const totalReversed = payments
    .filter((p) => p.status === 'reversed')
    .reduce((sum, p) => sum + p.amount, 0);

  const filteredPayments = payments.filter((p) => {
    const matchesSearch =
      p.id.toLowerCase().includes(search.toLowerCase()) ||
      (p.customerName && p.customerName.toLowerCase().includes(search.toLowerCase())) ||
      (p.referenceNumber && p.referenceNumber.toLowerCase().includes(search.toLowerCase())) ||
      (p.invoiceId && p.invoiceId.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-4">
      {/* Financial KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              Confirmed Revenue
            </div>
            <div className="text-lg font-bold text-emerald-700 font-mono mt-0.5">
              +{totalConfirmed.toLocaleString('en-US', { minimumFractionDigits: 2 })} ETB
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              Pending Verification
            </div>
            <div className="text-lg font-bold text-amber-700 font-mono mt-0.5">
              {totalPending.toLocaleString('en-US', { minimumFractionDigits: 2 })} ETB
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
            <Clock className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              Audited Reversals
            </div>
            <div className="text-lg font-bold text-rose-700 font-mono mt-0.5">
              -{totalReversed.toLocaleString('en-US', { minimumFractionDigits: 2 })} ETB
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
            <RotateCcw className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Filter and Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-lg">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search reference #, customer, invoice..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
            />
          </div>

          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
            {(['all', 'confirmed', 'pending', 'reversed'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize transition-colors ${
                  statusFilter === s
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={api.getExportCsvUrl('payments')}
            download
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium shadow-2xs transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export CSV</span>
          </a>

          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-2xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Record Payment</span>
          </button>
        </div>
      </div>

      {/* Payments Ledger Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">Payment ID</th>
                <th className="py-2.5 px-4">Customer</th>
                <th className="py-2.5 px-4">Amount</th>
                <th className="py-2.5 px-4">Payment Date</th>
                <th className="py-2.5 px-4">Method</th>
                <th className="py-2.5 px-4">Reference #</th>
                <th className="py-2.5 px-4">Covered Service / Invoice</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    Loading payments ledger...
                  </td>
                </tr>
              ) : filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No payment records found.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p) => {
                  const resolvedEmail = (
                    p.customerEmail ||
                    customers.find((c) => c.id === p.customerId)?.email ||
                    ''
                  ).trim();
                  return (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-blue-600">
                      {p.id}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{p.customerName}</div>
                      {resolvedEmail && (
                        <div className="text-[10px] text-blue-600 truncate max-w-[160px]">{resolvedEmail}</div>
                      )}
                      <div className="text-[10px] text-slate-400">Recorded by {p.recordedBy}</div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-emerald-700">
                      {p.status === 'reversed' ? (
                        <span className="line-through text-slate-400">
                          {p.amount.toLocaleString()} {p.currency}
                        </span>
                      ) : (
                        `+${p.amount.toLocaleString()} ${p.currency}`
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {new Date(p.paymentDate).toLocaleDateString('en-GB')}
                    </td>
                    <td className="py-3 px-4 capitalize text-slate-700">
                      {p.paymentMethod.replace('_', ' ')}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {p.referenceNumber || '—'}
                    </td>
                    <td className="py-3 px-4">
                      {p.invoiceId ? (
                        <span className="font-mono text-blue-600 font-semibold">{p.invoiceId}</span>
                      ) : (
                        <span className="text-slate-500">{p.notes || 'General Retainer'}</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                          p.status === 'confirmed'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : p.status === 'pending'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : p.status === 'reversed'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {p.status}
                      </span>
                      {p.reversalReason && (
                        <div className="text-[10px] text-rose-600 italic mt-0.5 truncate max-w-xs" title={p.reversalReason}>
                          Reason: {p.reversalReason}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {p.status === 'confirmed' && resolvedEmail && (
                          <button
                            onClick={() => handleOpenEmailReceipt(p)}
                            title={`Email Payment Receipt to ${resolvedEmail}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-blue-200 bg-blue-50/70 text-blue-700 hover:bg-blue-100 font-semibold text-[11px]"
                          >
                            <Mail className="w-3 h-3" />
                            <span>Email Receipt</span>
                          </button>
                        )}
                        {p.status === 'pending' && (
                          <button
                            onClick={() => handleConfirmPending(p.id)}
                            className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs"
                          >
                            Confirm
                          </button>
                        )}
                        {p.status === 'confirmed' && (
                          <button
                            onClick={() => {
                              setReversingPayment(p);
                              setReversalReason('');
                            }}
                            title="Reverse Payment with Audit Note"
                            className="px-2 py-0.5 rounded border border-rose-200 text-rose-700 hover:bg-rose-50 font-medium text-xs"
                          >
                            Reverse
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

      {/* Record Payment Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 text-slate-900">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h3 className="text-sm font-bold text-slate-900">Record Customer Payment</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="mb-3 p-2.5 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSavePayment} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Customer *
                </label>
                <select
                  required
                  value={formCustomerId}
                  onChange={(e) => {
                    setFormCustomerId(e.target.value);
                    setFormInvoiceId('');
                  }}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">Select customer...</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.businessName} ({c.id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Link to Invoice (Optional)
                </label>
                <select
                  value={formInvoiceId}
                  onChange={(e) => handleInvoiceSelect(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">None (Account Deposit / Retainer)</option>
                  {customerInvoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.id} — Total: {inv.total.toLocaleString()} ETB (Remaining: {(inv.remainingBalance ?? inv.total).toLocaleString()} ETB)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Amount Paid (ETB) *
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step="any"
                    placeholder="e.g. 10000"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md font-mono font-bold text-slate-900 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Payment Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Payment Method *
                  </label>
                  <select
                    value={formMethod}
                    onChange={(e) => setFormMethod(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white"
                  >
                    <option value="bank_transfer">Bank Transfer (CBE)</option>
                    <option value="telebirr">Telebirr</option>
                    <option value="cbe_birr">CBE Birr</option>
                    <option value="cash">Cash</option>
                    <option value="check">Check</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Transaction / Slip Reference #
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. CBE-TX-984210"
                    value={formRefNumber}
                    onChange={(e) => setFormRefNumber(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Verification Status *
                </label>
                <div className="flex items-center gap-4 pt-1">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="payStatus"
                      checked={formStatus === 'confirmed'}
                      onChange={() => setFormStatus('confirmed')}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="font-semibold text-emerald-800">Confirmed (Verified receipt)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="payStatus"
                      checked={formStatus === 'pending'}
                      onChange={() => setFormStatus('pending')}
                      className="text-amber-600 focus:ring-amber-500"
                    />
                    <span className="font-medium text-amber-800">Pending Verification</span>
                  </label>
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Only confirmed payments count towards received revenue. An SMS confirmation is automatically sent to the customer if enabled.
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Notes
                </label>
                <input
                  type="text"
                  placeholder="Additional memo or deposit notes"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold disabled:opacity-50"
                >
                  {saving ? 'Recording...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Reversal Modal */}
      {reversingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-rose-200 text-slate-900">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-200 mb-4 text-rose-700 font-bold text-sm">
              <ShieldAlert className="w-5 h-5 text-rose-600" />
              <span>Audited Payment Reversal</span>
            </div>

            <form onSubmit={handleExecuteReversal} className="space-y-3 text-xs">
              <p className="text-slate-600">
                You are reversing payment <strong className="font-mono text-slate-900">{reversingPayment.id}</strong> of{' '}
                <strong className="font-mono text-slate-900">{reversingPayment.amount.toLocaleString()} {reversingPayment.currency}</strong>{' '}
                for <strong>{reversingPayment.customerName}</strong>.
              </p>
              <p className="text-slate-500 text-[11px]">
                In accordance with financial compliance rules, this transaction will not be deleted. It will be marked as reversed and subtracted from confirmed revenue with an immutable audit log entry.
              </p>

              <div>
                <label className="block font-medium text-slate-800 mb-1">
                  Reason for Reversal (Required) *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Bounced cheque, bank reversal request, accidental duplicate entry..."
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md focus:ring-1 focus:ring-rose-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setReversingPayment(null)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reversingLoading || !reversalReason.trim()}
                  className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold disabled:opacity-50"
                >
                  {reversingLoading ? 'Reversing...' : 'Confirm Reversal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
        messageType="payment_confirmation"
        title={emailModalConfig.title}
      />
    </div>
  );
};
