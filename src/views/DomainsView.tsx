import React, { useState, useEffect } from 'react';
import {
  Globe,
  Search,
  Plus,
  Send,
  RotateCw,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Download,
  Clock,
  History,
  X,
  CreditCard,
  Mail,
} from 'lucide-react';
import { api } from '../services/api.ts';
import { Domain, Customer } from '../types.ts';
import { EmailConfirmationModal } from '../components/EmailConfirmationModal.tsx';
import { composeDomainReminderEmail } from '../services/gmailService.ts';

interface DomainsViewProps {
  initialOpenNewModal?: boolean;
  onResetNewModal?: () => void;
  targetDomainToRenew?: Domain | null;
  targetDomainToRemind?: Domain | null;
  onClearTargetActions?: () => void;
}

export const DomainsView: React.FC<DomainsViewProps> = ({
  initialOpenNewModal,
  onResetNewModal,
  targetDomainToRenew,
  targetDomainToRemind,
  onClearTargetActions,
}) => {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expiring_soon' | 'expired' | 'renewed'>('all');

  // Add / Edit Modal
  const [showAddModal, setShowAddModal] = useState(initialOpenNewModal || false);
  const [editingDomain, setEditingDomain] = useState<Domain | null>(null);
  const [formCustomerId, setFormCustomerId] = useState('');
  const [formDomainName, setFormDomainName] = useState('');
  const [formRegDate, setFormRegDate] = useState(new Date().toISOString().split('T')[0]);
  const [formExpDate, setFormExpDate] = useState('');
  const [formPrice, setFormPrice] = useState('3500');
  const [formYears, setFormYears] = useState('1');
  const [formRegistrar, setFormRegistrar] = useState('Ethio Telecom (.et)');
  const [formNotes, setFormNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Renewal Modal
  const [renewingDomain, setRenewingDomain] = useState<Domain | null>(null);
  const [newExpDate, setNewExpDate] = useState('');
  const [renewalYears, setRenewalYears] = useState(1);
  const [renewalPrice, setRenewalPrice] = useState(3500);
  const [recordPayment, setRecordPayment] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<'bank_transfer' | 'telebirr' | 'cash'>('bank_transfer');
  const [paymentRef, setPaymentRef] = useState('');
  const [renewalNotes, setRenewalNotes] = useState('');
  const [renewingLoading, setRenewingLoading] = useState(false);

  // Reminder Modal
  const [remindingDomain, setRemindingDomain] = useState<Domain | null>(null);
  const [reminderMessage, setReminderMessage] = useState('');
  const [sendingReminder, setSendingReminder] = useState(false);
  const [reminderResult, setReminderResult] = useState<{ status: string; error?: string } | null>(null);

  // Email Confirmation Modal State
  const [emailModalConfig, setEmailModalConfig] = useState<{
    isOpen: boolean;
    recipientEmail: string;
    recipientName: string;
    customerId: string;
    domainId?: string;
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
    title: 'Send Domain Renewal Email',
  });

  // History Drawer
  const [viewHistoryDomain, setViewHistoryDomain] = useState<Domain | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [domData, custData] = await Promise.all([
        api.getDomains(search, statusFilter),
        api.getCustomers('', 'active'),
      ]);
      setDomains(domData.domains);
      setCustomers(custData.customers);
    } catch (err) {
      console.error('Failed to load domains data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, statusFilter]);

  useEffect(() => {
    if (initialOpenNewModal) {
      handleOpenCreate();
      if (onResetNewModal) onResetNewModal();
    }
  }, [initialOpenNewModal]);

  useEffect(() => {
    if (targetDomainToRenew) {
      handleOpenRenew(targetDomainToRenew);
      if (onClearTargetActions) onClearTargetActions();
    }
  }, [targetDomainToRenew]);

  useEffect(() => {
    if (targetDomainToRemind) {
      handleOpenRemind(targetDomainToRemind);
      if (onClearTargetActions) onClearTargetActions();
    }
  }, [targetDomainToRemind]);

  const handleOpenCreate = () => {
    setEditingDomain(null);
    setFormCustomerId(customers[0]?.id || '');
    setFormDomainName('');
    setFormRegDate(new Date().toISOString().split('T')[0]);
    // Default expiration to 1 year ahead
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    setFormExpDate(nextYear.toISOString().split('T')[0]);
    setFormPrice('3500');
    setFormYears('1');
    setFormRegistrar('Ethio Telecom (.et)');
    setFormNotes('');
    setFormError(null);
    setShowAddModal(true);
  };

  const handleOpenEdit = (d: Domain) => {
    setEditingDomain(d);
    setFormCustomerId(d.customerId);
    setFormDomainName(d.domainName);
    setFormRegDate(d.registrationDate.split('T')[0]);
    setFormExpDate(d.expirationDate.split('T')[0]);
    setFormPrice(String(d.renewalPrice));
    setFormYears(String(d.registrationPeriodYears));
    setFormRegistrar(d.registrar || 'Ethio Telecom (.et)');
    setFormNotes(d.notes || '');
    setFormError(null);
    setShowAddModal(true);
  };

  const handleSaveDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);

    try {
      if (editingDomain) {
        await api.updateDomain(editingDomain.id, {
          domainName: formDomainName,
          registrationDate: formRegDate,
          expirationDate: formExpDate,
          renewalPrice: Number(formPrice),
          registrationPeriodYears: Number(formYears),
          registrar: formRegistrar,
          notes: formNotes,
        });
      } else {
        await api.createDomain({
          customerId: formCustomerId,
          domainName: formDomainName,
          registrationDate: formRegDate,
          expirationDate: formExpDate,
          renewalPrice: Number(formPrice),
          registrationPeriodYears: Number(formYears),
          registrar: formRegistrar,
          notes: formNotes,
        });
      }
      setShowAddModal(false);
      loadData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save domain');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenRenew = (d: Domain) => {
    setRenewingDomain(d);
    setRenewalPrice(d.renewalPrice || 3500);
    setRenewalYears(1);
    // calculate +1 year from current expiration date
    const base = new Date(d.expirationDate);
    const candidate = new Date(base.getFullYear() + 1, base.getMonth(), base.getDate());
    setNewExpDate(candidate.toISOString().split('T')[0]);
    setRecordPayment(true);
    setPaymentMethod('bank_transfer');
    setPaymentRef(`RENEW-${d.domainName}`);
    setRenewalNotes('Customer renewal confirmed.');
  };

  const handleConfirmRenewal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renewingDomain) return;
    setRenewingLoading(true);

    try {
      await api.renewDomain(renewingDomain.id, {
        newExpirationDate: newExpDate,
        periodYears: renewalYears,
        renewalPrice: renewalPrice,
        notes: renewalNotes,
        recordPayment,
        paymentMethod,
        referenceNumber: paymentRef,
      });
      setRenewingDomain(null);
      loadData();
    } catch (err: any) {
      setFormError(`Renewal failed: ${err.message}`);
    } finally {
      setRenewingLoading(false);
    }
  };

  const handleOpenRemind = (d: Domain) => {
    setRemindingDomain(d);
    setReminderResult(null);
    const daysLeft = d.daysLeft ?? 0;
    const text = `Hello ${d.customerName || 'Customer'}, your domain ${d.domainName} is scheduled to expire on ${new Date(d.expirationDate).toLocaleDateString('en-GB')} (${daysLeft} days left). Renewal price: ${d.renewalPrice.toLocaleString()} ETB. Please contact NexGrid Digital Systems to arrange renewal.`;
    setReminderMessage(text);
  };

  const handleOpenEmailDomain = (d: Domain) => {
    const cust = customers.find((c) => c.id === d.customerId);
    const email = (d.customerEmail || cust?.email || '').trim();
    if (!email) return;
    const composed = composeDomainReminderEmail(d, cust);
    setEmailModalConfig({
      isOpen: true,
      recipientEmail: email,
      recipientName: d.customerName || cust?.businessName || 'Client',
      customerId: d.customerId,
      domainId: d.id,
      subject: composed.subject,
      body: composed.body,
      title: `Send Domain Renewal Email — ${d.domainName}`,
    });
  };

  const handleSendReminder = async () => {
    if (!remindingDomain) return;
    setSendingReminder(true);
    setReminderResult(null);

    try {
      const res = await api.sendDomainReminder(remindingDomain.id, reminderMessage);
      const status = res.status || (res.success ? 'sent' : 'failed');
      setReminderResult({
        status,
        error:
          res.error ||
          (status === 'failed'
            ? 'SMS dispatch could not be completed. Check your SMS Gateway settings or recipient whitelist.'
            : undefined),
      });
      loadData();
    } catch (err: any) {
      setReminderResult({ status: 'failed', error: err.message || 'Failed to send SMS reminder.' });
    } finally {
      setSendingReminder(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Filter and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-lg">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search domain, client, registrar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
            />
          </div>

          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs overflow-x-auto">
            {[
              { id: 'all', label: 'All' },
              { id: 'expiring_soon', label: 'Expiring Soon' },
              { id: 'expired', label: 'Expired' },
              { id: 'active', label: 'Active' },
              { id: 'renewed', label: 'Renewed' },
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => setStatusFilter(s.id as any)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                  statusFilter === s.id
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={api.getExportCsvUrl('domains')}
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
            <span>Register Domain</span>
          </button>
        </div>
      </div>

      {/* Domain Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">Domain Name</th>
                <th className="py-2.5 px-4">Customer Name</th>
                <th className="py-2.5 px-4">Registrar / Provider</th>
                <th className="py-2.5 px-4">Expiration Date</th>
                <th className="py-2.5 px-4">Time Remaining</th>
                <th className="py-2.5 px-4">Renewal Fee</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Loading domains registry...
                  </td>
                </tr>
              ) : domains.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No domains found matching criteria.
                  </td>
                </tr>
              ) : (
                domains.map((dom) => {
                  const days = dom.daysLeft ?? 0;
                  const isExpired = days < 0;
                  const isExpiringSoon = days >= 0 && days <= 30;
                  const resolvedEmail = (
                    dom.customerEmail ||
                    customers.find((c) => c.id === dom.customerId)?.email ||
                    ''
                  ).trim();

                  return (
                    <tr key={dom.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {dom.domainName}
                        {dom.registrationPeriodYears > 1 && (
                          <span className="ml-1.5 text-[10px] text-slate-400 font-normal">
                            ({dom.registrationPeriodYears}yr)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{dom.customerName}</div>
                        <div className="text-[11px] font-mono text-slate-500">{dom.customerPhone}</div>
                        {resolvedEmail && (
                          <div className="text-[10px] text-blue-600 truncate max-w-[160px]">{resolvedEmail}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {dom.registrar || 'Ethio Telecom (.et)'}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">
                        {new Date(dom.expirationDate).toLocaleDateString('en-GB')}
                      </td>
                      <td className="py-3 px-4">
                        {isExpired ? (
                          <span className="font-bold text-rose-600">
                            Expired {Math.abs(days)}d ago
                          </span>
                        ) : isExpiringSoon ? (
                          <span className="font-bold text-amber-600">
                            Expiring in {days}d
                          </span>
                        ) : (
                          <span className="font-medium text-slate-700">
                            {days} days left
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-slate-900">
                        {dom.renewalPrice.toLocaleString()} ETB
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                            dom.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : dom.status === 'expiring_soon'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : dom.status === 'expired'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : dom.status === 'renewed'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {dom.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {resolvedEmail && (
                            <button
                              onClick={() => handleOpenEmailDomain(dom)}
                              title={`Send Email Reminder to ${resolvedEmail}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-blue-200 bg-blue-50/70 text-blue-700 hover:bg-blue-100 font-semibold text-[11px]"
                            >
                              <Mail className="w-3 h-3" />
                              <span>Email</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenRemind(dom)}
                            title="Dispatch SMS reminder"
                            className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-slate-100"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleOpenRenew(dom)}
                            title="Confirm Renewal"
                            className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs"
                          >
                            Renew
                          </button>
                          {dom.renewalHistory && dom.renewalHistory.length > 0 && (
                            <button
                              onClick={() => setViewHistoryDomain(dom)}
                              title="Renewal History"
                              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                            >
                              <History className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenEdit(dom)}
                            className="p-1 rounded text-slate-400 hover:text-slate-700 text-xs"
                          >
                            Edit
                          </button>
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

      {/* Add / Edit Domain Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 text-slate-900">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h3 className="text-sm font-bold text-slate-900">
                {editingDomain ? `Edit Domain (${editingDomain.domainName})` : 'Register New Domain'}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
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

            <form onSubmit={handleSaveDomain} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Assign Customer *
                </label>
                <select
                  required
                  disabled={Boolean(editingDomain)}
                  value={formCustomerId}
                  onChange={(e) => setFormCustomerId(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:outline-none bg-white"
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
                  Domain Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. example.et or company.com"
                  value={formDomainName}
                  onChange={(e) => setFormDomainName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Registration Date
                  </label>
                  <input
                    type="date"
                    required
                    value={formRegDate}
                    onChange={(e) => setFormRegDate(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Expiration Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formExpDate}
                    onChange={(e) => setFormExpDate(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:outline-none font-semibold text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Renewal Price (ETB) *
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step="any"
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Registrar / Registry
                  </label>
                  <input
                    type="text"
                    value={formRegistrar}
                    onChange={(e) => setFormRegistrar(e.target.value)}
                    placeholder="Ethio Telecom / Namecheap"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="DNS records, nameservers, reseller details..."
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingDomain ? 'Update Domain' : 'Register Domain'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Domain Explicit Renewal Modal */}
      {renewingDomain && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 text-slate-900">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Confirm Domain Renewal</h3>
                <p className="text-xs text-slate-500">Domain: {renewingDomain.domainName}</p>
              </div>
              <button
                onClick={() => setRenewingDomain(null)}
                className="text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmRenewal} className="space-y-4 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="text-slate-500">Current Expiration:</div>
                  <div className="font-mono font-semibold text-slate-900">
                    {new Date(renewingDomain.expirationDate).toLocaleDateString('en-GB')}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Customer:</div>
                  <div className="font-semibold text-slate-900">{renewingDomain.customerName}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    New Expiration Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={newExpDate}
                    onChange={(e) => setNewExpDate(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono font-semibold focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Renewal Price (ETB) *
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step="any"
                    value={renewalPrice}
                    onChange={(e) => setRenewalPrice(Number(e.target.value))}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Optional Payment Recording */}
              <div className="p-3 rounded-lg border border-slate-200 bg-emerald-50/30 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={recordPayment}
                    onChange={(e) => setRecordPayment(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="font-semibold text-slate-800">
                    Record & Confirm Payment Now ({renewalPrice.toLocaleString()} ETB)
                  </span>
                </label>

                {recordPayment && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1">
                        Payment Method
                      </label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as any)}
                        className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white"
                      >
                        <option value="bank_transfer">Bank Transfer (CBE)</option>
                        <option value="telebirr">Telebirr</option>
                        <option value="cash">Cash Settlement</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1">
                        Transaction Ref #
                      </label>
                      <input
                        type="text"
                        value={paymentRef}
                        onChange={(e) => setPaymentRef(e.target.value)}
                        placeholder="e.g. CBE-TX-98124"
                        className="w-full px-2.5 py-1 border border-slate-300 rounded font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Renewal Notes
                </label>
                <input
                  type="text"
                  value={renewalNotes}
                  onChange={(e) => setRenewalNotes(e.target.value)}
                  placeholder="Registrar invoice ID or verification notes"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setRenewingDomain(null)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={renewingLoading}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold disabled:opacity-50"
                >
                  {renewingLoading ? 'Renewing...' : 'Confirm Domain Renewal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Send Reminder Modal */}
      {remindingDomain && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 text-slate-900">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Send Renewal Reminder</h3>
                <p className="text-xs text-slate-500">
                  Recipient: {remindingDomain.customerPhone || 'Missing phone'} ({remindingDomain.customerName})
                </p>
              </div>
              <button
                onClick={() => setRemindingDomain(null)}
                className="text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            </div>

            {reminderResult && (
              <div
                className={`mb-4 p-3 rounded-lg text-xs flex items-start gap-2.5 ${
                  reminderResult.status === 'sent' || reminderResult.status === 'delivered'
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border border-rose-200 text-rose-800'
                }`}
              >
                {reminderResult.status === 'sent' || reminderResult.status === 'delivered' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 space-y-1.5">
                  <div className="font-semibold capitalize">
                    Status: {reminderResult.status || 'failed'}
                    {(reminderResult.status === 'sent' || reminderResult.status === 'delivered') &&
                      ` — Dispatched to ${remindingDomain.customerPhone}`}
                  </div>
                  {reminderResult.error && <div className="leading-relaxed">{reminderResult.error}</div>}
                  {reminderResult.error &&
                    (reminderResult.error.includes('10007') ||
                      reminderResult.error.toLowerCase().includes('whitelist')) && (
                      <div className="pt-1 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const digits = (remindingDomain.customerPhone || '').replace(/\D/g, '');
                            const msisdn = digits.startsWith('0') ? `251${digits.slice(1)}` : digits;
                            navigator.clipboard?.writeText(msisdn);
                          }}
                          className="px-2.5 py-1 rounded bg-white border border-rose-300 text-rose-800 hover:bg-rose-100 font-semibold text-[11px]"
                        >
                          Copy {(remindingDomain.customerPhone || '').replace(/\D/g, '')} for SMS Ethiopia Whitelist
                        </button>
                      </div>
                    )}
                </div>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  SMS Message Body (SMS Ethiopia API)
                </label>
                <textarea
                  rows={4}
                  value={reminderMessage}
                  onChange={(e) => setReminderMessage(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
                <div className="mt-1 text-[11px] text-slate-400">
                  Character count: {reminderMessage.length} (Standard SMS: 160 chars)
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setRemindingDomain(null)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium"
                >
                  Close
                </button>
                {(remindingDomain.customerEmail ||
                  customers.find((c) => c.id === remindingDomain.customerId)?.email) && (
                  <button
                    type="button"
                    onClick={() => {
                      const dom = remindingDomain;
                      setRemindingDomain(null);
                      handleOpenEmailDomain(dom);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Email via Gmail</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSendReminder}
                  disabled={sendingReminder || !remindingDomain.customerPhone}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{sendingReminder ? 'Dispatching...' : 'Dispatch Reminder SMS'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Renewal History Modal */}
      {viewHistoryDomain && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 text-slate-900">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Domain Renewal History</h3>
                <p className="text-xs text-slate-500">{viewHistoryDomain.domainName}</p>
              </div>
              <button
                onClick={() => setViewHistoryDomain(null)}
                className="text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto text-xs">
              {viewHistoryDomain.renewalHistory.map((h, idx) => (
                <div key={h.id || idx} className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 space-y-1">
                  <div className="flex items-center justify-between font-semibold text-slate-900">
                    <span>Renewed to {new Date(h.newExpDate).toLocaleDateString('en-GB')}</span>
                    <span className="font-mono text-emerald-700">+{h.renewalPrice.toLocaleString()} ETB</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Previous Expiry: {new Date(h.previousExpDate).toLocaleDateString('en-GB')} • Period: {h.periodYears} year(s)
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Recorded on {new Date(h.date).toLocaleString('en-GB')} by {h.recordedBy}
                  </div>
                  {h.notes && <div className="text-[11px] text-slate-600 mt-1 italic">"{h.notes}"</div>}
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-200 mt-4">
              <button
                onClick={() => setViewHistoryDomain(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-medium text-xs"
              >
                Close
              </button>
            </div>
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
        domainId={emailModalConfig.domainId}
        initialSubject={emailModalConfig.subject}
        initialBody={emailModalConfig.body}
        messageType="domain_reminder"
        title={emailModalConfig.title}
      />
    </div>
  );
};
