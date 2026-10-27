import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Plus,
  Filter,
  Download,
  AlertTriangle,
  Archive,
  RotateCcw,
  ExternalLink,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Globe,
  FileText,
  CreditCard,
  MessageSquare,
  X,
  CheckCircle2,
} from 'lucide-react';
import { api } from '../services/api.ts';
import { Customer, Domain, Invoice, Quotation, Payment, MessageLog } from '../types.ts';
import { EmailConfirmationModal } from '../components/EmailConfirmationModal.tsx';
import { composeWelcomeEmail } from '../services/gmailService.ts';

interface CustomersViewProps {
  initialOpenNewModal?: boolean;
  onResetNewModal?: () => void;
  onViewDomain?: (domainId: string) => void;
}

export const CustomersView: React.FC<CustomersViewProps> = ({
  initialOpenNewModal,
  onResetNewModal,
  onViewDomain,
}) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('active');

  // Customer Details Modal
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<{
    customer: Customer;
    domains: Domain[];
    invoices: Invoice[];
    quotations: Quotation[];
    payments: Payment[];
    messages: MessageLog[];
  } | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'domains' | 'invoices' | 'payments' | 'messages'>('overview');
  const [detailLoading, setDetailLoading] = useState(false);

  // Add / Edit Modal
  const [showModal, setShowModal] = useState(initialOpenNewModal || false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formBusinessName, setFormBusinessName] = useState('');
  const [formContactPerson, setFormContactPerson] = useState('');
  const [formPhone, setFormPhone] = useState('+251');
  const [formEmail, setFormEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Email Confirmation Modal State
  const [emailModal, setEmailModal] = useState<{
    isOpen: boolean;
    customer: Customer | null;
    subject: string;
    body: string;
    messageType: 'welcome' | 'custom';
  }>({
    isOpen: false,
    customer: null,
    subject: '',
    body: '',
    messageType: 'welcome',
  });

  const handleOpenEmailModal = (c: Customer, type: 'welcome' | 'custom' = 'welcome') => {
    const welcome = composeWelcomeEmail(c);
    setEmailModal({
      isOpen: true,
      customer: c,
      subject:
        type === 'welcome'
          ? welcome.subject
          : `Important Update from NexGrid Digital Systems — ${c.businessName}`,
      body:
        type === 'welcome'
          ? welcome.body
          : `Dear ${c.businessName || c.contactPerson},\n\nWe are reaching out from NexGrid Digital Systems regarding your account (${c.id}).\n\nPlease let us know if you need any assistance with your domains or services.\n\nBest regards,\nNexGrid Digital Systems`,
      messageType: type,
    });
  };

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const data = await api.getCustomers(search, statusFilter);
      setCustomers(data.customers);
    } catch (err) {
      console.error('Failed to load customers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, [search, statusFilter]);

  // Open modal if prop triggers it
  useEffect(() => {
    if (initialOpenNewModal) {
      handleOpenCreate();
      if (onResetNewModal) onResetNewModal();
    }
  }, [initialOpenNewModal]);

  // Check duplicate phone or email as admin types
  useEffect(() => {
    if (!showModal) return;
    const cleanPhone = formPhone.replace(/[^\d+]/g, '');
    if (cleanPhone.length >= 9 || (formEmail && formEmail.includes('@'))) {
      const timer = setTimeout(async () => {
        try {
          const res = await api.checkDuplicateCustomer(
            cleanPhone,
            formEmail,
            editingCustomer ? editingCustomer.id : ''
          );
          if (res.hasDuplicate) {
            let msg = 'Duplicate warning: ';
            if (res.duplicatePhoneCustomer) {
              msg += `Phone matches existing customer "${res.duplicatePhoneCustomer.name}" (${res.duplicatePhoneCustomer.phone}). `;
            }
            if (res.duplicateEmailCustomer) {
              msg += `Email matches existing customer "${res.duplicateEmailCustomer.name}".`;
            }
            setDuplicateWarning(msg);
          } else {
            setDuplicateWarning(null);
          }
        } catch {
          // Ignore background check error
        }
      }, 400);
      return () => clearTimeout(timer);
    } else {
      setDuplicateWarning(null);
    }
  }, [formPhone, formEmail, showModal, editingCustomer]);

  const handleOpenCreate = () => {
    setEditingCustomer(null);
    setFormBusinessName('');
    setFormContactPerson('');
    setFormPhone('+2519');
    setFormEmail('');
    setFormAddress('');
    setFormNotes('');
    setFormError(null);
    setDuplicateWarning(null);
    setShowModal(true);
  };

  const handleOpenEdit = (c: Customer) => {
    setEditingCustomer(c);
    setFormBusinessName(c.businessName);
    setFormContactPerson(c.contactPerson);
    setFormPhone(c.phone);
    setFormEmail(c.email);
    setFormAddress(c.billingAddress || '');
    setFormNotes(c.notes || '');
    setFormError(null);
    setDuplicateWarning(null);
    setShowModal(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);

    try {
      if (editingCustomer) {
        await api.updateCustomer(editingCustomer.id, {
          businessName: formBusinessName,
          contactPerson: formContactPerson,
          phone: formPhone,
          email: formEmail,
          billingAddress: formAddress,
          notes: formNotes,
        });
      } else {
        const createdRes = await api.createCustomer({
          businessName: formBusinessName,
          contactPerson: formContactPerson,
          phone: formPhone,
          email: formEmail,
          billingAddress: formAddress,
          notes: formNotes,
        });
        if (createdRes.customer && createdRes.customer.email && createdRes.customer.email.includes('@')) {
          handleOpenEmailModal(createdRes.customer, 'welcome');
        }
      }
      setShowModal(false);
      loadCustomers();
      if (selectedCustomerId) {
        openCustomerDetails(selectedCustomerId);
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to save customer');
    } finally {
      setSaving(false);
    }
  };

  const openCustomerDetails = async (id: string) => {
    setSelectedCustomerId(id);
    setDetailLoading(true);
    setDetailTab('overview');
    try {
      const data = await api.getCustomerById(id);
      setDetailData(data);
    } catch (err) {
      console.error('Failed to load customer details:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleArchive = async (id: string, name: string) => {
    if (confirm(`Archive customer "${name}"? Associated domains and financial records will remain completely intact.`)) {
      await api.archiveCustomer(id);
      loadCustomers();
      if (selectedCustomerId === id) {
        openCustomerDetails(id);
      }
    }
  };

  const handleUnarchive = async (id: string) => {
    await api.unarchiveCustomer(id);
    loadCustomers();
    if (selectedCustomerId === id) {
      openCustomerDetails(id);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search and Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, ID, phone, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
            />
          </div>

          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
            {(['active', 'all', 'archived'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  statusFilter === s
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={api.getExportCsvUrl('customers')}
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
            <span>Add Customer</span>
          </button>
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">Customer ID</th>
                <th className="py-2.5 px-4">Business / Name</th>
                <th className="py-2.5 px-4">Contact Person</th>
                <th className="py-2.5 px-4">Phone Number</th>
                <th className="py-2.5 px-4">Domains</th>
                <th className="py-2.5 px-4">Total Paid</th>
                <th className="py-2.5 px-4">Outstanding</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Loading customers...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No customers found matching your criteria.
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => openCustomerDetails(c.id)}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-blue-600">
                      {c.id}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{c.businessName}</div>
                      <div className="text-[11px] text-slate-500">{c.email}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      {c.contactPerson || '—'}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700">
                      {c.phone}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-medium text-slate-800">
                        {c.domainCount || 0} registered
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-emerald-700">
                      {(c.totalPaid || 0).toLocaleString()} ETB
                    </td>
                    <td className="py-3 px-4 font-mono font-medium">
                      {(c.outstanding || 0) > 0 ? (
                        <span className="text-rose-600 font-semibold">
                          {(c.outstanding || 0).toLocaleString()} ETB
                        </span>
                      ) : (
                        <span className="text-slate-400">0.00 ETB</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        {c.email && c.email.includes('@') && (
                          <button
                            onClick={() => handleOpenEmailModal(c, 'welcome')}
                            title={`Send Email to ${c.email}`}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-[11px] font-semibold"
                          >
                            <Mail className="w-3 h-3" />
                            <span>Email</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEdit(c)}
                          className="px-2 py-1 rounded text-slate-600 hover:text-blue-600 hover:bg-slate-100 text-xs font-medium"
                        >
                          Edit
                        </button>
                        {c.status === 'active' ? (
                          <button
                            onClick={() => handleArchive(c.id, c.businessName)}
                            title="Archive Customer"
                            className="p-1 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50"
                          >
                            <Archive className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleUnarchive(c.id)}
                            title="Restore Customer"
                            className="p-1 rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
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

      {/* Customer Full Profile Drawer / Modal */}
      {selectedCustomerId && detailData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
            {/* Modal Header */}
            <div className="p-4 sm:px-6 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">
                  {detailData.customer.businessName[0]}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">
                      {detailData.customer.businessName}
                    </h3>
                    <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold">
                      {detailData.customer.id}
                    </span>
                    {detailData.customer.status === 'archived' && (
                      <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                        Archived
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    Added on {new Date(detailData.customer.createdAt).toLocaleDateString('en-GB')}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {detailData.customer.email && detailData.customer.email.includes('@') && (
                  <button
                    onClick={() => handleOpenEmailModal(detailData.customer, 'welcome')}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-2xs"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Send Email</span>
                  </button>
                )}
                <button
                  onClick={() => handleOpenEdit(detailData.customer)}
                  className="px-2.5 py-1 rounded-md text-xs font-medium border border-slate-200 hover:bg-white text-slate-700"
                >
                  Edit Profile
                </button>
                <button
                  onClick={() => setSelectedCustomerId(null)}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Profile Navigation Tabs */}
            <div className="flex items-center px-6 border-b border-slate-200 bg-white gap-2 overflow-x-auto text-xs font-medium">
              {[
                { id: 'overview', label: 'Overview', icon: Users },
                { id: 'domains', label: `Domains (${detailData.domains.length})`, icon: Globe },
                { id: 'invoices', label: `Invoices (${detailData.invoices.length})`, icon: FileText },
                { id: 'payments', label: `Payments (${detailData.payments.length})`, icon: CreditCard },
                { id: 'messages', label: `SMS & Email Logs (${detailData.messages.length})`, icon: MessageSquare },
              ].map((t) => {
                const Icon = t.icon;
                const active = detailTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setDetailTab(t.id as any)}
                    className={`flex items-center gap-1.5 py-3 px-2 border-b-2 transition-colors whitespace-nowrap ${
                      active
                        ? 'border-blue-600 text-blue-600 font-semibold'
                        : 'border-transparent text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Tab Contents */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
              {detailTab === 'overview' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2">
                      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Primary Contact
                      </div>
                      <div className="text-slate-800 font-medium">
                        {detailData.customer.contactPerson || 'None specified'}
                      </div>
                      <div className="flex items-center gap-2 text-slate-600 font-mono">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span>{detailData.customer.phone}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-600">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        <span>{detailData.customer.email || 'No email provided'}</span>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2">
                      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Billing & Office Address
                      </div>
                      <div className="flex items-start gap-2 text-slate-700">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span>{detailData.customer.billingAddress || 'No billing address saved.'}</span>
                      </div>
                    </div>
                  </div>

                  {detailData.customer.notes && (
                    <div className="p-3.5 rounded-lg border border-slate-200 bg-amber-50/40">
                      <div className="font-semibold text-amber-900 mb-1">Administrative Notes:</div>
                      <p className="text-slate-700 whitespace-pre-wrap">{detailData.customer.notes}</p>
                    </div>
                  )}
                </div>
              )}

              {detailTab === 'domains' && (
                <div className="space-y-2">
                  {detailData.domains.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      No domains registered under this customer yet.
                    </div>
                  ) : (
                    detailData.domains.map((dom) => (
                      <div
                        key={dom.id}
                        className="p-3 rounded-lg border border-slate-200 flex items-center justify-between hover:bg-slate-50"
                      >
                        <div>
                          <div className="font-mono font-semibold text-slate-900">{dom.domainName}</div>
                          <div className="text-slate-500 text-[11px]">
                            Expires: {new Date(dom.expirationDate).toLocaleDateString('en-GB')} ({dom.daysLeft} days remaining)
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono font-bold text-slate-900">
                            {dom.renewalPrice.toLocaleString()} ETB
                          </div>
                          <span className="text-[10px] uppercase font-semibold text-slate-600">
                            {dom.status.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {detailTab === 'invoices' && (
                <div className="space-y-2">
                  {detailData.invoices.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      No invoices issued for this customer.
                    </div>
                  ) : (
                    detailData.invoices.map((inv) => (
                      <div
                        key={inv.id}
                        className="p-3 rounded-lg border border-slate-200 flex items-center justify-between hover:bg-slate-50"
                      >
                        <div>
                          <div className="font-semibold text-slate-900">{inv.id}</div>
                          <div className="text-slate-500 text-[11px]">Due: {inv.dueDate}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono font-bold text-slate-900">
                            {inv.total.toLocaleString()} {inv.currency}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Paid: {(inv.totalPaid || 0).toLocaleString()} • Remaining: {(inv.remainingBalance || 0).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {detailTab === 'payments' && (
                <div className="space-y-2">
                  {detailData.payments.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      No payments recorded yet.
                    </div>
                  ) : (
                    detailData.payments.map((p) => (
                      <div
                        key={p.id}
                        className="p-3 rounded-lg border border-slate-200 flex items-center justify-between hover:bg-slate-50"
                      >
                        <div>
                          <div className="font-mono font-bold text-emerald-700">
                            +{p.amount.toLocaleString()} {p.currency}
                          </div>
                          <div className="text-slate-500 text-[11px]">
                            {new Date(p.paymentDate).toLocaleDateString('en-GB')} • Ref: {p.referenceNumber || 'None'}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] uppercase font-semibold text-slate-600">
                            {p.status}
                          </span>
                          <div className="text-[10px] text-slate-400">By {p.recordedBy}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {detailTab === 'messages' && (
                <div className="space-y-2">
                  {detailData.messages.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      No SMS notifications logged for this customer.
                    </div>
                  ) : (
                    detailData.messages.map((m) => (
                      <div key={m.id} className="p-3 rounded-lg border border-slate-200 space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-slate-800 capitalize">
                            {m.messageType.replace('_', ' ')}
                          </span>
                          <span className="text-slate-400">
                            {new Date(m.createdAt).toLocaleString('en-GB')}
                          </span>
                        </div>
                        <p className="text-slate-700 bg-slate-50 p-2 rounded text-[11px] font-mono">
                          {m.content}
                        </p>
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span>To: {m.recipient}</span>
                          <span className="uppercase font-semibold text-slate-600">
                            Status: {m.status}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Customer Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 text-slate-900">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h3 className="text-sm font-bold text-slate-900">
                {editingCustomer ? `Edit Customer (${editingCustomer.id})` : 'Register New Customer'}
              </h3>
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

            {duplicateWarning && (
              <div className="mb-3 p-2.5 rounded bg-amber-50 border border-amber-300 text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>{duplicateWarning}</span>
              </div>
            )}

            <form onSubmit={handleSaveCustomer} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Business / Company Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Addis Tech Solutions PLC"
                  value={formBusinessName}
                  onChange={(e) => setFormBusinessName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Contact Person Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dawit Abebe"
                  value={formContactPerson}
                  onChange={(e) => setFormContactPerson(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Phone Number (with Country Code) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="+251911223344"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    placeholder="contact@company.et"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Billing Address (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Bole Subcity, Woreda 03, Addis Ababa"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Administrative Notes / History
                </label>
                <textarea
                  rows={2}
                  placeholder="Service requirements, preferred payment method, domain notes..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:outline-none"
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
                  {saving ? 'Saving...' : editingCustomer ? 'Update Customer' : 'Create Customer Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Email Confirmation Modal */}
      <EmailConfirmationModal
        isOpen={emailModal.isOpen}
        onClose={() => setEmailModal((prev) => ({ ...prev, isOpen: false }))}
        onSuccess={() => {
          if (selectedCustomerId) openCustomerDetails(selectedCustomerId);
        }}
        mode="single"
        initialRecipientEmail={emailModal.customer?.email || ''}
        recipientName={emailModal.customer?.businessName || ''}
        customerId={emailModal.customer?.id}
        initialSubject={emailModal.subject}
        initialBody={emailModal.body}
        messageType={emailModal.messageType}
        title={`Send Email to ${emailModal.customer?.businessName || 'Client'}`}
      />
    </div>
  );
};
