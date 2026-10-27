import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Send,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Smartphone,
  ExternalLink,
  Search,
  Users,
  Check,
  AlertCircle,
  Zap,
  Shield,
  Copy,
  Mail,
} from 'lucide-react';
import { api } from '../services/api.ts';
import { MessageLog, MessageTemplate, AppSettings, Customer } from '../types.ts';
import {
  getAccessToken,
  getConnectedGmailEmail,
  googleSignIn,
  activateBusinessRelayFallback,
  subscribeWorkspaceAuth,
  OFFICIAL_BUSINESS_EMAIL,
} from '../firebase.ts';
import { EmailConfirmationModal } from '../components/EmailConfirmationModal.tsx';
import type { BulkEmailRecipient } from '../services/gmailService.ts';

function toSmsEthiopiaMsisdn(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('2510') && digits.length === 13) return `251${digits.slice(4)}`;
  if (digits.startsWith('251') && digits.length >= 12) return digits.slice(0, 12);
  if ((digits.startsWith('09') || digits.startsWith('07')) && digits.length === 10) return `251${digits.slice(1)}`;
  if ((digits.startsWith('9') || digits.startsWith('7')) && digits.length === 9) return `251${digits}`;
  return digits;
}

export const MessagingView: React.FC = () => {
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<'compose' | 'bulk' | 'logs' | 'templates'>('compose');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'delivered' | 'sent' | 'failed' | 'queued'>('all');
  const [channelFilter, setChannelFilter] = useState<'all' | 'sms' | 'email'>('all');

  // Google Workspace Gmail OAuth State
  const [hasGmailToken, setHasGmailToken] = useState(false);
  const [connectedGmailEmail, setConnectedGmailEmail] = useState<string | null>(null);
  const [connectingGmail, setConnectingGmail] = useState(false);

  // Compose State (SMS or Email)
  const [composeChannel, setComposeChannel] = useState<'sms' | 'email'>('sms');
  const [recipientType, setRecipientType] = useState<'customer' | 'custom'>('customer');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customPhone, setCustomPhone] = useState('251983064449');
  const [customEmail, setCustomEmail] = useState('');
  const [composeSubject, setComposeSubject] = useState('Welcome to NexGrid Digital Systems');
  const [composeMessage, setComposeMessage] = useState('NexGrid Digital Systems: Greetings! Your system account is active.');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [composeLoading, setComposeLoading] = useState(false);
  const [composeResult, setComposeResult] = useState<{
    status: string;
    messageId?: string;
    providerRef?: string;
    error?: string;
  } | null>(null);

  // Confirmation Modal State for Email Dispatch
  const [emailModalConfig, setEmailModalConfig] = useState<{
    isOpen: boolean;
    mode: 'single' | 'bulk';
    recipientEmail?: string;
    recipientName?: string;
    customerId?: string;
    bulkRecipients?: BulkEmailRecipient[];
    subject: string;
    body: string;
    messageType?: 'welcome' | 'domain_reminder' | 'payment_confirmation' | 'invoice_reminder' | 'test' | 'custom';
    title?: string;
  }>({
    isOpen: false,
    mode: 'single',
    subject: '',
    body: '',
  });

  // Live Gateway Diagnostic State
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagResult, setDiagResult] = useState<any>(null);
  const [showDiagPanel, setShowDiagPanel] = useState(false);
  const [copiedWhitelistPhone, setCopiedWhitelistPhone] = useState(false);
  const [copiedAllWhitelist, setCopiedAllWhitelist] = useState(false);

  const copyRecipientForWhitelist = () => {
    const msisdn = toSmsEthiopiaMsisdn(customPhone);
    navigator.clipboard.writeText(msisdn);
    setCopiedWhitelistPhone(true);
    setTimeout(() => setCopiedWhitelistPhone(false), 2000);
  };

  const copyAllCustomerNumbersForWhitelist = () => {
    const list = Array.from(
      new Set(
        customers
          .map((c) => toSmsEthiopiaMsisdn(c.phone || ''))
          .filter((m) => m.length === 12 && m.startsWith('251'))
      )
    );
    if (list.length === 0) return;
    navigator.clipboard.writeText(list.join('\n'));
    setCopiedAllWhitelist(true);
    setTimeout(() => setCopiedAllWhitelist(false), 2000);
  };

  const handleRunDiagnostic = async () => {
    setDiagLoading(true);
    setDiagResult(null);
    try {
      const res = await api.diagnoseGateway(customPhone || '251983064449');
      setDiagResult(res);
      setShowDiagPanel(true);
      api.getMessageLogs().then((d) => setLogs(d.logs || [])).catch(() => {});
    } catch (err: any) {
      setDiagResult({
        success: false,
        diagnosticStatus: 'network_error',
        recommendation: err.message || 'Diagnostic failed to communicate with server.',
      });
      setShowDiagPanel(true);
    } finally {
      setDiagLoading(false);
    }
  };

  // Bulk Broadcast State
  const [bulkChannel, setBulkChannel] = useState<'sms' | 'email'>('sms');
  const [bulkAudience, setBulkAudience] = useState<'all' | 'manual'>('all');
  const [bulkManualNumbers, setBulkManualNumbers] = useState('');
  const [bulkManualEmails, setBulkManualEmails] = useState('');
  const [bulkSubject, setBulkSubject] = useState('NexGrid Digital Systems — Service Update for [Customer Name]');
  const [bulkMessage, setBulkMessage] = useState('NexGrid Digital Systems: Important service update for all registered subscribers.');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    total: number;
    sent: number;
    failed: number;
    results: Array<{ phone: string; status: string; error?: string }>;
  } | null>(null);

  // Template Editing State
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [templateSubject, setTemplateSubject] = useState('');
  const [templateBody, setTemplateBody] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSavedToast, setTemplateSavedToast] = useState(false);

  // Retry state
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [logsData, tmplData, settsData, custData] = await Promise.all([
        api.getMessageLogs(),
        api.getTemplates(),
        api.getSettings(),
        api.getCustomers().catch(() => ({ customers: [] })),
      ]);
      setLogs(logsData.logs || []);
      setTemplates(tmplData.templates || []);
      setSettings(settsData.settings || null);
      const custList = custData.customers || [];
      setCustomers(custList);
      if (custList.length > 0 && !selectedCustomerId) {
        const firstWithEmail = custList.find((c) => c.email && c.email.includes('@')) || custList[0];
        setSelectedCustomerId(firstWithEmail.id);
        if (firstWithEmail.phone) setCustomPhone(firstWithEmail.phone);
        if (firstWithEmail.email) setCustomEmail(firstWithEmail.email);
      }
    } catch (err) {
      console.error('Failed to load messaging data:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    getAccessToken().then((tok) => {
      setHasGmailToken(Boolean(tok));
      setConnectedGmailEmail(getConnectedGmailEmail());
    });
    const unsub = subscribeWorkspaceAuth((tok, email) => {
      setHasGmailToken(Boolean(tok));
      setConnectedGmailEmail(email);
    });
    return unsub;
  }, []);

  const handleConnectGmail = async () => {
    setConnectingGmail(true);
    try {
      const res = await googleSignIn(OFFICIAL_BUSINESS_EMAIL);
      if (res) {
        setHasGmailToken(true);
        setConnectedGmailEmail(res.user.email || null);
      }
    } catch (err) {
      console.error('Gmail connect error:', err);
    } finally {
      setConnectingGmail(false);
    }
  };

  const isBusinessSenderConnected =
    Boolean(hasGmailToken && connectedGmailEmail) &&
    connectedGmailEmail!.trim().toLowerCase() === OFFICIAL_BUSINESS_EMAIL.toLowerCase();

  const customersWithEmail = customers.filter((c) => c.email && c.email.trim().includes('@'));

  // When customer dropdown changes in Compose tab
  const handleCustomerSelect = (customerId: string) => {
    setSelectedCustomerId(customerId);
    const cust = customers.find((c) => c.id === customerId);
    if (cust) {
      if (cust.phone) setCustomPhone(cust.phone);
      if (cust.email) setCustomEmail(cust.email);
    }
  };

  // When template dropdown changes in Compose tab
  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const tmpl = templates.find((t) => t.id === templateId);
    if (tmpl) {
      let body = tmpl.bodyTemplate;
      let subj = tmpl.subject || 'NexGrid Digital Systems Notification';
      const cust = customers.find((c) => c.id === selectedCustomerId);
      const custName = cust ? cust.businessName || cust.contactPerson : 'Valued Client';
      body = body
        .replace(/\[Customer Name\]/g, custName)
        .replace(/\[Amount\]/g, '3,500.00')
        .replace(/\[Currency\]/g, 'ETB')
        .replace(/\[Business Contact\]/g, settings?.general?.businessPhone || '+251 906697634')
        .replace(/\[Business Email\]/g, settings?.general?.businessEmail || 'nexgriddigital@gmail.com')
        .replace(/\[Business Phone\]/g, settings?.general?.businessPhone || '+251 906697634');
      subj = subj.replace(/\[Customer Name\]/g, custName);
      setComposeMessage(body);
      setComposeSubject(subj);
    }
  };

  // Send Direct SMS or Open Gmail Confirmation Modal
  const handleSendDirectDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    const cust = customers.find((c) => c.id === selectedCustomerId);

    if (composeChannel === 'email') {
      const targetEmail =
        recipientType === 'customer' && cust ? cust.email : customEmail.trim();
      setEmailModalConfig({
        isOpen: true,
        mode: 'single',
        recipientEmail: targetEmail,
        recipientName: recipientType === 'customer' && cust ? cust.businessName : 'Direct Recipient',
        customerId: recipientType === 'customer' && cust ? cust.id : 'DIRECT',
        subject: composeSubject,
        body: composeMessage,
        messageType: 'custom',
        title: `Confirm & Send Email to ${recipientType === 'customer' && cust ? cust.businessName : targetEmail}`,
      });
      return;
    }

    setComposeLoading(true);
    setComposeResult(null);

    try {
      const res = await api.sendMessage({
        phone: customPhone,
        message: composeMessage,
        customerId: recipientType === 'customer' && cust ? cust.id : undefined,
        customerName: recipientType === 'customer' && cust ? cust.businessName : undefined,
        messageType: 'direct_dispatch',
      });

      setComposeResult({
        status: res.status,
        messageId: res.messageId,
        error: res.error,
      });
      api.getMessageLogs().then((d) => setLogs(d.logs || [])).catch(() => {});
    } catch (err: any) {
      setComposeResult({
        status: 'failed',
        error: err.message || 'Failed to dispatch SMS through gateway',
      });
    } finally {
      setComposeLoading(false);
    }
  };

  // Send Bulk Broadcast (SMS or Email)
  const handleSendBulkDispatch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (bulkChannel === 'email') {
      let emailRecipients: BulkEmailRecipient[] = [];
      if (bulkAudience === 'all') {
        emailRecipients = customersWithEmail.map((c) => ({
          email: c.email.trim(),
          customerId: c.id,
          customerName: c.businessName || c.contactPerson,
        }));
      } else {
        emailRecipients = bulkManualEmails
          .split(/[\n,;]/)
          .map((em) => em.trim())
          .filter((em) => em.includes('@'))
          .map((email) => ({ email, customerName: 'Client' }));
      }

      if (emailRecipients.length === 0) {
        return;
      }

      setEmailModalConfig({
        isOpen: true,
        mode: 'bulk',
        bulkRecipients: emailRecipients,
        subject: bulkSubject,
        body: bulkMessage,
        messageType: 'custom',
        title: `Confirm Bulk Email Broadcast (${emailRecipients.length} Registered Clients)`,
      });
      return;
    }

    setBulkLoading(true);
    setBulkResult(null);

    let recipientsList: Array<{ phone: string; customerId?: string; customerName?: string }> = [];

    if (bulkAudience === 'all') {
      recipientsList = customers
        .filter((c) => c.phone && c.phone.trim().length > 5)
        .map((c) => ({
          phone: c.phone,
          customerId: c.id,
          customerName: c.businessName,
        }));
    } else {
      const numbers = bulkManualNumbers
        .split(/[\n,;]/)
        .map((n) => n.trim())
        .filter((n) => n.length > 5);
      recipientsList = numbers.map((n) => ({ phone: n }));
    }

    if (recipientsList.length === 0) {
      setBulkLoading(false);
      return;
    }

    try {
      const res = await api.sendBulkMessage({
        recipients: recipientsList,
        message: bulkMessage,
        messageType: 'bulk_broadcast',
      });

      setBulkResult({
        total: res.total,
        sent: res.sent,
        failed: res.failed,
        results: res.results,
      });
      loadData();
    } catch (err: any) {
      console.error('Bulk broadcast error:', err);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleRetryMessage = async (id: string) => {
    setRetryingId(id);
    try {
      await api.retryMessage(id);
      loadData();
    } catch (err: any) {
      console.error('Retry error:', err);
    } finally {
      setRetryingId(null);
    }
  };

  const handleSelectTemplate = (t: MessageTemplate) => {
    setEditingTemplate(t);
    setTemplateSubject(t.subject || '');
    setTemplateBody(t.bodyTemplate);
  };

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return;
    setSavingTemplate(true);
    setTemplateSavedToast(false);
    try {
      await api.updateTemplate(editingTemplate.id, {
        bodyTemplate: templateBody,
        ...(editingTemplate.channel === 'email' ? { subject: templateSubject } : {}),
      });
      setTemplateSavedToast(true);
      setTimeout(() => setTemplateSavedToast(false), 3000);
      loadData(true);
    } catch (err: any) {
      console.error('Error updating template:', err);
    } finally {
      setSavingTemplate(false);
    }
  };

  const insertVariable = (varName: string) => {
    setTemplateBody((prev) => `${prev} ${varName}`);
  };

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.recipient.toLowerCase().includes(search.toLowerCase()) ||
      (log.customerName && log.customerName.toLowerCase().includes(search.toLowerCase())) ||
      (log.subject && log.subject.toLowerCase().includes(search.toLowerCase())) ||
      log.content.toLowerCase().includes(search.toLowerCase()) ||
      (log.providerReference && log.providerReference.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || log.status === statusFilter;
    const matchesChannel = channelFilter === 'all' || log.channel === channelFilter;
    return matchesSearch && matchesStatus && matchesChannel;
  });

  const deliveredCount = logs.filter((l) => l.status === 'delivered' || l.status === 'sent').length;
  const emailSentCount = logs.filter((l) => l.channel === 'email' && l.status === 'sent').length;

  return (
    <div className="space-y-4">
      {/* 1. Dual Channel Integration Header: SMS Gateway + Google Workspace Gmail API */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* SMS Ethiopia Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Radio className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xs font-bold text-slate-900">
                  SMS Ethiopia Gateway (smsethiopia.com)
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                  SMS ACTIVE
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Ethio Telecom &amp; Safaricom SMS • {customers.filter((c) => c.phone).length} mobile numbers
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setComposeChannel('sms');
                setActiveSubTab('compose');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Compose SMS</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setBulkChannel('sms');
                setActiveSubTab('bulk');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Bulk SMS</span>
            </button>
          </div>
        </div>

        {/* Google Workspace Gmail API Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <Mail className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xs font-bold text-slate-900">
                    Business Gmail Dispatch ({OFFICIAL_BUSINESS_EMAIL})
                  </h3>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      isBusinessSenderConnected
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : hasGmailToken
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {isBusinessSenderConnected
                      ? `ACTIVE: ${OFFICIAL_BUSINESS_EMAIL}`
                      : hasGmailToken
                      ? `SWITCH TO ${OFFICIAL_BUSINESS_EMAIL.toUpperCase()}`
                      : 'CONNECT BUSINESS GMAIL'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {isBusinessSenderConnected
                    ? `All client emails are dispatched from ${OFFICIAL_BUSINESS_EMAIL} • ${customersWithEmail.length} clients with registered emails (${emailSentCount} sent)`
                    : hasGmailToken
                    ? `Currently signed in as ${connectedGmailEmail}. Click "Switch to ${OFFICIAL_BUSINESS_EMAIL}" to dispatch all client emails from your business Gmail.`
                    : `Sign in with ${OFFICIAL_BUSINESS_EMAIL} to dispatch all client emails from your official business address (${customersWithEmail.length} registered clients).`}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setComposeChannel('email');
                  setRecipientType('customer');
                  const emailTmpl = templates.find((t) => t.channel === 'email');
                  if (emailTmpl) handleTemplateSelect(emailTmpl.id);
                  setActiveSubTab('compose');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Send Client Email</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setBulkChannel('email');
                  setActiveSubTab('bulk');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Bulk Email ({customersWithEmail.length})</span>
              </button>
            </div>

            {!hasGmailToken ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleConnectGmail}
                  disabled={connectingGmail}
                  className="gsi-material-button"
                >
                  <div className="gsi-material-button-state"></div>
                  <div className="gsi-material-button-content-wrapper">
                    <div className="gsi-material-button-icon">
                      <svg
                        version="1.1"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 48 48"
                        style={{ display: 'block' }}
                      >
                        <path
                          fill="#EA4335"
                          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                        ></path>
                        <path
                          fill="#4285F4"
                          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                        ></path>
                        <path
                          fill="#FBBC05"
                          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                        ></path>
                        <path
                          fill="#34A853"
                          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                        ></path>
                        <path fill="none" d="M0 0h48v48H0z"></path>
                      </svg>
                    </div>
                    <span className="gsi-material-button-contents">
                      {connectingGmail ? 'Connecting...' : 'Sign in with Google'}
                    </span>
                    <span style={{ display: 'none' }}>Sign in with Google</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const res = await activateBusinessRelayFallback(OFFICIAL_BUSINESS_EMAIL);
                    setHasGmailToken(true);
                    setConnectedGmailEmail(res.user.email || OFFICIAL_BUSINESS_EMAIL);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold shadow-2xs transition-colors"
                >
                  Instant Relay (Bypass 403)
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {isBusinessSenderConnected && (
                  <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Ready</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleConnectGmail}
                  disabled={connectingGmail}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                    isBusinessSenderConnected
                      ? 'border border-slate-200 hover:bg-slate-50 text-slate-700'
                      : 'bg-amber-600 hover:bg-amber-500 text-white shadow-2xs'
                  }`}
                >
                  {connectingGmail
                    ? 'Switching...'
                    : isBusinessSenderConnected
                    ? 'Switch Account'
                    : `Switch to ${OFFICIAL_BUSINESS_EMAIL}`}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sub-tab Navigation */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
          <button
            onClick={() => setActiveSubTab('compose')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeSubTab === 'compose'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Compose &amp; Dispatch (SMS / Email)
          </button>
          <button
            onClick={() => setActiveSubTab('bulk')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeSubTab === 'bulk'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Bulk Broadcast
          </button>
          <button
            onClick={() => setActiveSubTab('logs')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeSubTab === 'logs'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Dispatch Logs ({logs.length})
          </button>
          <button
            onClick={() => {
              setActiveSubTab('templates');
              if (!editingTemplate && templates.length > 0) {
                handleSelectTemplate(templates[0]);
              }
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeSubTab === 'templates'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Message Templates ({templates.length})
          </button>
        </div>

        <button
          onClick={() => loadData()}
          title="Refresh Data"
          className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
        >
          <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* 2. Compose & Dispatch (SMS or Email) */}
      {activeSubTab === 'compose' && (
        <div className="max-w-2xl mx-auto bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4 text-xs">
          {/* Channel Switcher */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setComposeChannel('sms')}
              className={`py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all ${
                composeChannel === 'sms'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="w-4 h-4 text-blue-600" />
              <span>SMS Gateway Dispatch</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setComposeChannel('email');
                setRecipientType('customer');
              }}
              className={`py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all ${
                composeChannel === 'email'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Mail className="w-4 h-4 text-emerald-600" />
              <span>Gmail Email Dispatch ({customersWithEmail.length} Registered)</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {composeChannel === 'email'
                  ? 'Compose & Send Client Email via Gmail'
                  : 'Compose & Dispatch Live SMS'}
              </h3>
              <p className="text-slate-500 text-[11px] mt-0.5">
                {composeChannel === 'email'
                  ? 'Send branded HTML emails directly to clients who have registered email addresses.'
                  : 'Send SMS notifications to any phone number across Ethio Telecom (09...) and Safaricom (07...).'}
              </p>
            </div>
            {composeChannel === 'sms' && (
              <button
                type="button"
                onClick={handleRunDiagnostic}
                disabled={diagLoading}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium text-[11px] flex items-center gap-1.5 shrink-0 transition-colors disabled:opacity-50"
              >
                {diagLoading ? (
                  <RotateCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                ) : (
                  <Shield className="w-3.5 h-3.5 text-blue-600" />
                )}
                <span>{diagLoading ? 'Testing Gateway...' : 'Test Gateway Connection'}</span>
              </button>
            )}
          </div>

          {/* Diagnostic Probe Results (SMS) */}
          {composeChannel === 'sms' && showDiagPanel && diagResult && (
            <div
              className={`p-3.5 rounded-xl text-xs space-y-2 ${
                diagResult.success
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                  : diagResult.diagnosticStatus === 'starter_campaign_restricted'
                  ? 'bg-amber-50 border border-amber-300 text-amber-950'
                  : 'bg-rose-50 border border-rose-200 text-rose-900'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="font-bold flex items-center gap-2">
                  {diagResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  )}
                  <span>
                    Gateway Diagnostic: HTTP {diagResult.httpStatus || 0} ({diagResult.latencyMs || 0}ms)
                  </span>
                </div>
                <button
                  onClick={() => setShowDiagPanel(false)}
                  className="text-slate-400 hover:text-slate-600 text-xs px-1"
                >
                  ✕
                </button>
              </div>
              <p className="text-[11px] leading-relaxed">{diagResult.recommendation}</p>
            </div>
          )}

          {composeChannel === 'sms' && composeResult && (
            <div className="space-y-2">
              <div
                className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 ${
                  composeResult.status === 'sent' || composeResult.status === 'delivered'
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                    : 'bg-rose-50 border border-rose-200 text-rose-900'
                }`}
              >
                {composeResult.status === 'sent' || composeResult.status === 'delivered' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1 w-full">
                  <div className="font-bold capitalize text-sm">
                    {composeResult.status === 'delivered' || composeResult.status === 'sent'
                      ? 'Dispatched Successfully'
                      : 'Carrier Dispatch Failed'}
                  </div>
                  {composeResult.messageId && (
                    <div className="font-mono text-[11px] text-slate-600">
                      Record ID: {composeResult.messageId}
                    </div>
                  )}
                  {composeResult.error && (
                    <div className="leading-relaxed text-rose-800 text-[11px] font-medium p-2 rounded bg-white/80 border border-rose-200">
                      {composeResult.error}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSendDirectDispatch} className="space-y-4">
            {/* Recipient Target Selector */}
            <div className="space-y-2">
              <label className="block font-medium text-slate-700">Recipient Target *</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRecipientType('customer')}
                  className={`py-2 px-3 rounded-lg border text-left flex items-center justify-between ${
                    recipientType === 'customer'
                      ? 'border-blue-600 bg-blue-50/50 text-blue-900 font-semibold'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <span>
                    {composeChannel === 'email'
                      ? `Registered Client (${customersWithEmail.length} with Email)`
                      : 'Select Registered Customer'}
                  </span>
                  {recipientType === 'customer' && <Check className="w-3.5 h-3.5 text-blue-600" />}
                </button>
                <button
                  type="button"
                  onClick={() => setRecipientType('custom')}
                  className={`py-2 px-3 rounded-lg border text-left flex items-center justify-between ${
                    recipientType === 'custom'
                      ? 'border-blue-600 bg-blue-50/50 text-blue-900 font-semibold'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <span>
                    {composeChannel === 'email'
                      ? 'Direct Email Address'
                      : 'Direct Phone Number (Anyone)'}
                  </span>
                  {recipientType === 'custom' && <Check className="w-3.5 h-3.5 text-blue-600" />}
                </button>
              </div>
            </div>

            {recipientType === 'customer' && (
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  {composeChannel === 'email'
                    ? 'Choose Client with Registered Email *'
                    : 'Choose Customer from Database *'}
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => handleCustomerSelect(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">-- Choose a customer --</option>
                  {(composeChannel === 'email' ? customersWithEmail : customers).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.businessName}{' '}
                      {composeChannel === 'email'
                        ? `<${c.email}>`
                        : `(${c.phone || 'No phone recorded'})`}
                    </option>
                  ))}
                </select>
                {composeChannel === 'email' && customersWithEmail.length === 0 && (
                  <p className="text-[11px] text-amber-700 mt-1">
                    No customers currently have a registered email address. Add an email address in the Customers tab or use Direct Email Address mode.
                  </p>
                )}
              </div>
            )}

            {composeChannel === 'sms' ? (
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Recipient Mobile Number (Ethiopian Standard) *
                </label>
                <input
                  type="text"
                  required
                  value={customPhone}
                  onChange={(e) => setCustomPhone(e.target.value)}
                  placeholder="+251911223344 or 0911223344"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Recipient Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={customEmail}
                    onChange={(e) => setCustomEmail(e.target.value)}
                    placeholder="client@company.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Email Subject Line *
                  </label>
                  <input
                    type="text"
                    required
                    value={composeSubject}
                    onChange={(e) => setComposeSubject(e.target.value)}
                    placeholder="Subject line..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-medium text-slate-700">
                  {composeChannel === 'email' ? 'Email Body Content *' : 'SMS Message Content *'}
                </label>
                {templates.filter((t) => t.channel === composeChannel).length > 0 && (
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => handleTemplateSelect(e.target.value)}
                    className="text-[11px] border border-slate-200 rounded px-2 py-0.5 text-slate-600 bg-slate-50"
                  >
                    <option value="">Insert {composeChannel.toUpperCase()} Template Preset...</option>
                    {templates
                      .filter((t) => t.channel === composeChannel)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                )}
              </div>
              <textarea
                rows={composeChannel === 'email' ? 6 : 4}
                required
                value={composeMessage}
                onChange={(e) => setComposeMessage(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                placeholder={
                  composeChannel === 'email'
                    ? 'Enter email message content...'
                    : 'Enter SMS message body...'
                }
              />
              {composeChannel === 'sms' && (
                <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                  <span>
                    Length: <strong>{composeMessage.length}</strong> characters
                  </span>
                  <span>
                    Segments: <strong>{Math.ceil(composeMessage.length / 160) || 1}</strong> SMS standard segment
                  </span>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={
                composeLoading ||
                (composeChannel === 'sms' ? !customPhone.trim() : !customEmail.trim()) ||
                !composeMessage.trim()
              }
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg shadow-2xs flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
            >
              {composeChannel === 'email' ? (
                <>
                  <Mail className="w-4 h-4" />
                  <span>Review &amp; Send Email via Gmail</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>{composeLoading ? 'Dispatching via Gateway...' : 'Dispatch SMS to Recipient'}</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* 3. Bulk Broadcast Tab (SMS or Email) */}
      {activeSubTab === 'bulk' && (
        <div className="max-w-2xl mx-auto bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4 text-xs">
          {/* Channel Switcher */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setBulkChannel('sms')}
              className={`py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all ${
                bulkChannel === 'sms'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="w-4 h-4 text-blue-600" />
              <span>Bulk SMS Broadcast</span>
            </button>
            <button
              type="button"
              onClick={() => setBulkChannel('email')}
              className={`py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all ${
                bulkChannel === 'email'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Mail className="w-4 h-4 text-emerald-600" />
              <span>Bulk Email to Registered Clients ({customersWithEmail.length})</span>
            </button>
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {bulkChannel === 'email'
                ? 'Bulk Email Broadcast via Gmail API'
                : 'Bulk SMS Broadcast'}
            </h3>
            <p className="text-slate-500 text-[11px] mt-0.5">
              {bulkChannel === 'email'
                ? 'Send personalized official emails to all clients who have a registered email address in your database.'
                : 'Broadcast critical service announcements, reminders, or maintenance notices to multiple mobile recipients.'}
            </p>
          </div>

          {bulkChannel === 'sms' && bulkResult && (
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800">Broadcast Summary</span>
                <span className="text-[11px] text-slate-500">Total: {bulkResult.total} recipients</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div className="p-2 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold">
                  {bulkResult.sent} Succeeded
                </div>
                <div className="p-2 rounded bg-rose-50 border border-rose-200 text-rose-800 font-bold">
                  {bulkResult.failed} Failed
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSendBulkDispatch} className="space-y-4">
            <div>
              <label className="block font-medium text-slate-700 mb-1.5">Target Audience *</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setBulkAudience('all')}
                  className={`py-2.5 px-3 rounded-lg border text-left ${
                    bulkAudience === 'all'
                      ? 'border-blue-600 bg-blue-50/50 text-blue-900 font-semibold'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>
                      {bulkChannel === 'email'
                        ? 'All Clients with Registered Emails'
                        : 'All Registered Customers'}
                    </span>
                    {bulkAudience === 'all' && <Check className="w-3.5 h-3.5 text-blue-600" />}
                  </div>
                  <div className="text-[10px] text-slate-500 font-normal mt-0.5">
                    {bulkChannel === 'email'
                      ? `${customersWithEmail.length} registered client email address(es)`
                      : `${customers.filter((c) => c.phone).length} customer mobile numbers`}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setBulkAudience('manual')}
                  className={`py-2.5 px-3 rounded-lg border text-left ${
                    bulkAudience === 'manual'
                      ? 'border-blue-600 bg-blue-50/50 text-blue-900 font-semibold'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>
                      {bulkChannel === 'email' ? 'Custom Email List' : 'Custom Numbers List'}
                    </span>
                    {bulkAudience === 'manual' && <Check className="w-3.5 h-3.5 text-blue-600" />}
                  </div>
                  <div className="text-[10px] text-slate-500 font-normal mt-0.5">
                    Comma, semicolon, or newline separated
                  </div>
                </button>
              </div>
            </div>

            {bulkAudience === 'manual' && (
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  {bulkChannel === 'email'
                    ? 'Recipient Emails (Comma or newline separated) *'
                    : 'Recipient Numbers (Comma or newline separated) *'}
                </label>
                {bulkChannel === 'email' ? (
                  <textarea
                    rows={3}
                    required
                    value={bulkManualEmails}
                    onChange={(e) => setBulkManualEmails(e.target.value)}
                    placeholder="client1@company.com, client2@company.et"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                ) : (
                  <textarea
                    rows={3}
                    required
                    value={bulkManualNumbers}
                    onChange={(e) => setBulkManualNumbers(e.target.value)}
                    placeholder="0911223344, 0922334455, +251933445566"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                )}
              </div>
            )}

            {bulkChannel === 'email' && (
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Email Subject Line (supports [Customer Name]) *
                </label>
                <input
                  type="text"
                  required
                  value={bulkSubject}
                  onChange={(e) => setBulkSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-medium text-slate-900 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            )}

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Broadcast Message Content {bulkChannel === 'email' ? '(supports [Customer Name])' : ''} *
              </label>
              <textarea
                rows={5}
                required
                value={bulkMessage}
                onChange={(e) => setBulkMessage(e.target.value)}
                placeholder="Compose your broadcast message..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={
                bulkLoading ||
                !bulkMessage.trim() ||
                (bulkChannel === 'email' && bulkAudience === 'all' && customersWithEmail.length === 0)
              }
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg shadow-2xs flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
            >
              <Users className="w-4 h-4" />
              <span>
                {bulkChannel === 'email'
                  ? `Review & Launch Bulk Email (${
                      bulkAudience === 'all' ? customersWithEmail.length : 'Custom'
                    })`
                  : bulkLoading
                  ? 'Broadcasting Batch Dispatches...'
                  : 'Launch Bulk SMS Broadcast'}
              </span>
            </button>
          </form>
        </div>
      )}

      {/* 4. Dispatch Logs Tab */}
      {activeSubTab === 'logs' && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search recipient, subject, content, provider ref..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
                {(['all', 'sms', 'email'] as const).map((ch) => (
                  <button
                    key={ch}
                    onClick={() => setChannelFilter(ch)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md uppercase transition-colors ${
                      channelFilter === ch
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {ch === 'all' ? 'All Channels' : ch}
                  </button>
                ))}
              </div>

              <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
                {(['all', 'delivered', 'sent', 'failed', 'queued'] as const).map((s) => (
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
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">Message ID</th>
                    <th className="py-2.5 px-4">Channel</th>
                    <th className="py-2.5 px-4">Recipient</th>
                    <th className="py-2.5 px-4">Type</th>
                    <th className="py-2.5 px-4">Content / Subject Preview</th>
                    <th className="py-2.5 px-4">Provider Ref</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Timestamp</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        Loading message logs...
                      </td>
                    </tr>
                  ) : filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        No messages found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-blue-600">
                          {log.id}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                              log.channel === 'email'
                                ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {log.channel}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-mono font-semibold text-slate-900">{log.recipient}</div>
                          {log.customerName && (
                            <div className="text-[10px] text-slate-500">{log.customerName}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 capitalize text-slate-700">
                          {log.messageType.replace('_', ' ')}
                        </td>
                        <td className="py-3 px-4 max-w-xs">
                          {log.subject && (
                            <div className="font-semibold text-slate-900 truncate" title={log.subject}>
                              {log.subject}
                            </div>
                          )}
                          <div className="truncate text-slate-700" title={log.content}>
                            {log.content}
                          </div>
                          {log.errorDetails && (
                            <div className="text-[10px] text-rose-600 font-medium truncate mt-0.5" title={log.errorDetails}>
                              Error: {log.errorDetails}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                          {log.providerReference || '—'}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                              log.status === 'delivered'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : log.status === 'sent'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : log.status === 'failed'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">
                          {new Date(log.createdAt).toLocaleString('en-GB')}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {log.status === 'failed' && log.channel === 'sms' && (
                            <button
                              onClick={() => handleRetryMessage(log.id)}
                              disabled={retryingId === log.id || log.attemptCount >= 5}
                              className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs disabled:opacity-50"
                            >
                              {retryingId === log.id ? 'Retrying...' : 'Retry'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 5. Message Templates Tab */}
      {activeSubTab === 'templates' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Template List */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
              Configured SMS &amp; Email Templates
            </h4>
            {templates.map((tmpl) => (
              <button
                key={tmpl.id}
                onClick={() => handleSelectTemplate(tmpl)}
                className={`w-full text-left p-3 rounded-xl border transition-all ${
                  editingTemplate?.id === tmpl.id
                    ? 'border-blue-600 bg-blue-50/40 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900 text-xs">{tmpl.name}</span>
                  <span
                    className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded font-mono ${
                      tmpl.channel === 'email'
                        ? 'bg-purple-50 text-purple-700 border border-purple-200'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {tmpl.channel}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 line-clamp-2 mt-1">
                  {tmpl.bodyTemplate}
                </p>
              </button>
            ))}
          </div>

          {/* Template Editor & Preview */}
          <div className="lg:col-span-2 space-y-4">
            {editingTemplate ? (
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{editingTemplate.name}</h3>
                    <p className="text-xs text-slate-500">Channel: {editingTemplate.channel.toUpperCase()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {templateSavedToast && (
                      <span className="text-xs text-emerald-600 font-semibold">Saved!</span>
                    )}
                    <button
                      onClick={handleSaveTemplate}
                      disabled={savingTemplate}
                      className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors disabled:opacity-50"
                    >
                      {savingTemplate ? 'Saving...' : 'Save Template'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Available Dynamic Variables (Click to insert):
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {editingTemplate.variables.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => insertVariable(v)}
                        className="px-2 py-0.5 rounded bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-700 font-mono text-[11px] border border-slate-200 transition-colors"
                      >
                        + {v}
                      </button>
                    ))}
                  </div>
                </div>

                {editingTemplate.channel === 'email' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Email Subject Template
                    </label>
                    <input
                      type="text"
                      value={templateSubject}
                      onChange={(e) => setTemplateSubject(e.target.value)}
                      className="w-full p-2.5 border border-slate-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Template Body Content
                  </label>
                  <textarea
                    rows={6}
                    value={templateBody}
                    onChange={(e) => setTemplateBody(e.target.value)}
                    className="w-full p-3 border border-slate-300 rounded-lg text-xs font-mono focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-xs text-slate-400">
                Select a template from the list to view and customize its text.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mandatory User Confirmation Modal for Gmail Dispatches */}
      <EmailConfirmationModal
        isOpen={emailModalConfig.isOpen}
        onClose={() => setEmailModalConfig((prev) => ({ ...prev, isOpen: false }))}
        onSuccess={() => loadData(true)}
        mode={emailModalConfig.mode}
        initialRecipientEmail={emailModalConfig.recipientEmail}
        recipientName={emailModalConfig.recipientName}
        customerId={emailModalConfig.customerId}
        bulkRecipients={emailModalConfig.bulkRecipients}
        initialSubject={emailModalConfig.subject}
        initialBody={emailModalConfig.body}
        messageType={emailModalConfig.messageType}
        title={emailModalConfig.title}
      />
    </div>
  );
};
