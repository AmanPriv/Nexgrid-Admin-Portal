import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Send,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Radio,
  FileEdit,
  Smartphone,
  ExternalLink,
  RefreshCw,
  Search,
  Filter,
  Users,
  Layers,
  Check,
  ChevronRight,
  AlertCircle,
  Zap,
  Shield,
  Copy,
} from 'lucide-react';
import { api } from '../services/api.ts';
import { MessageLog, MessageTemplate, AppSettings, Customer } from '../types.ts';

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

  // Compose SMS State (Send to Anyone)
  const [recipientType, setRecipientType] = useState<'customer' | 'custom'>('custom');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customPhone, setCustomPhone] = useState('+251911223344');
  const [composeMessage, setComposeMessage] = useState('NexGrid Digital Systems: Greetings! Your system account is active.');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [composeLoading, setComposeLoading] = useState(false);
  const [composeResult, setComposeResult] = useState<{
    status: string;
    messageId?: string;
    providerRef?: string;
    error?: string;
  } | null>(null);

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
      const res = await api.diagnoseGateway(customPhone || '251911223344');
      setDiagResult(res);
      setShowDiagPanel(true);
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
  const [bulkAudience, setBulkAudience] = useState<'all' | 'manual'>('all');
  const [bulkManualNumbers, setBulkManualNumbers] = useState('');
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
  const [templateBody, setTemplateBody] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Retry state
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
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
      setCustomers(custData.customers || []);
    } catch (err) {
      console.error('Failed to load messaging data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // When customer dropdown changes in Compose tab
  const handleCustomerSelect = (customerId: string) => {
    setSelectedCustomerId(customerId);
    const cust = customers.find((c) => c.id === customerId);
    if (cust && cust.phone) {
      setCustomPhone(cust.phone);
    }
  };

  // When template dropdown changes in Compose tab
  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const tmpl = templates.find((t) => t.id === templateId);
    if (tmpl) {
      let body = tmpl.bodyTemplate;
      const cust = customers.find((c) => c.id === selectedCustomerId);
      if (cust) {
        body = body
          .replace(/\[Customer Name\]/g, cust.businessName || cust.contactPerson)
          .replace(/\[Amount\]/g, '2,500.00')
          .replace(/\[Currency\]/g, 'ETB')
          .replace(/\[Business Contact\]/g, settings?.general?.businessPhone || '+251 911 234 567');
      }
      setComposeMessage(body);
    }
  };

  // Send Direct SMS to Anyone
  const handleSendDirectSms = async (e: React.FormEvent) => {
    e.preventDefault();
    setComposeLoading(true);
    setComposeResult(null);

    const cust = customers.find((c) => c.id === selectedCustomerId);

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
      loadData();
    } catch (err: any) {
      setComposeResult({
        status: 'failed',
        error: err.message || 'Failed to dispatch SMS through gateway',
      });
    } finally {
      setComposeLoading(false);
    }
  };

  // Send Bulk SMS Broadcast
  const handleSendBulkSms = async (e: React.FormEvent) => {
    e.preventDefault();
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
      alert('No valid recipient phone numbers found for broadcast.');
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
      alert(`Bulk broadcast error: ${err.message}`);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleRetryMessage = async (id: string) => {
    setRetryingId(id);
    try {
      const res = await api.retryMessage(id);
      loadData();
    } catch (err: any) {
      alert(`Retry error: ${err.message}`);
    } finally {
      setRetryingId(null);
    }
  };

  const handleSelectTemplate = (t: MessageTemplate) => {
    setEditingTemplate(t);
    setTemplateBody(t.bodyTemplate);
  };

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return;
    setSavingTemplate(true);
    try {
      await api.updateTemplate(editingTemplate.id, {
        bodyTemplate: templateBody,
      });
      alert('Template updated successfully.');
      loadData();
    } catch (err: any) {
      alert(`Error updating template: ${err.message}`);
    } finally {
      setSavingTemplate(false);
    }
  };

  const insertVariable = (varName: string) => {
    setTemplateBody((prev) => `${prev} ${varName}`);
  };

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.recipient.includes(search) ||
      (log.customerName && log.customerName.toLowerCase().includes(search.toLowerCase())) ||
      log.content.toLowerCase().includes(search.toLowerCase()) ||
      (log.providerReference && log.providerReference.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || log.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const deliveredCount = logs.filter((l) => l.status === 'delivered').length;
  const deliveryRate = logs.length > 0 ? Math.round((deliveredCount / logs.length) * 100) : 100;

  return (
    <div className="space-y-4">
      {/* 1. Production SMS Gateway Integration Health Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  SMS Ethiopia Production Gateway (smsethiopia.com)
                </h3>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    settings?.sms.hasApiKey
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  {settings?.sms.hasApiKey ? 'PRODUCTION DISPATCH ACTIVE' : 'API KEY REQUIRED'}
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>Endpoint: <strong className="font-mono text-slate-700">{settings?.sms.apiEndpoint || 'https://smsethiopia.com/api/sms/send'}</strong></span>
                <span>·</span>
                <span>
                  Sender ID:{' '}
                  <strong className="text-slate-700">
                    {!settings?.sms.senderId || settings.sms.senderId.toLowerCase() === 'nexgrid'
                      ? 'SMS Ethiopia Default Sender ID (Default Campaign)'
                      : settings.sms.senderId}
                  </strong>
                </span>
                <span>·</span>
                <span>
                  Delivery Rate: <strong className="text-emerald-600">{deliveryRate}%</strong> ({deliveredCount}/{logs.length} delivered)
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setActiveSubTab('compose')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-2xs transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Compose & Send SMS</span>
            </button>
            <button
              onClick={() => setActiveSubTab('bulk')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Bulk Broadcast</span>
            </button>
            <a
              href="https://smsethiopia.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-xs font-medium"
            >
              <span>smsethiopia.com</span>
              <ExternalLink className="w-3 h-3" />
            </a>
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
            Compose & Dispatch SMS
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
          onClick={loadData}
          title="Refresh Data"
          className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
        >
          <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* 2. Compose & Dispatch SMS (Send to Anyone) */}
      {activeSubTab === 'compose' && (
        <div className="max-w-2xl mx-auto bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Compose & Dispatch Live SMS</h3>
              <p className="text-slate-500 text-[11px] mt-0.5">
                Send SMS notifications to any phone number across Ethio Telecom (09...) and Safaricom (07...).
              </p>
            </div>
            <button
              type="button"
              onClick={handleRunDiagnostic}
              disabled={diagLoading}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium text-[11px] flex items-center gap-1.5 shrink-0 transition-colors disabled:opacity-50"
            >
              {diagLoading ? <RotateCw className="w-3.5 h-3.5 animate-spin text-blue-600" /> : <Shield className="w-3.5 h-3.5 text-blue-600" />}
              <span>{diagLoading ? 'Testing Gateway...' : 'Test Gateway Connection'}</span>
            </button>
          </div>

          {/* Diagnostic Probe Results */}
          {showDiagPanel && diagResult && (
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
              <p className="text-[11px] leading-relaxed">
                {diagResult.recommendation}
              </p>
              {diagResult.diagnosticStatus === 'starter_campaign_restricted' && (
                <div className="p-2.5 rounded-lg bg-white/80 border border-amber-200 text-[11px] space-y-1">
                  <div className="font-bold text-amber-900">SMS Ethiopia (Alet Support) — Default Campaign Steps:</div>
                  <ol className="list-decimal list-inside space-y-0.5 text-slate-700">
                    <li>Log into <a href="https://smsethiopia.com" target="_blank" rel="noreferrer" className="text-blue-600 font-semibold underline">smsethiopia.com</a> and open your <strong>Default Campaign</strong></li>
                    <li>Add/Whitelist the recipient phone number (<code className="font-mono bg-amber-100 px-1 rounded">{toSmsEthiopiaMsisdn(customPhone)}</code>)</li>
                    <li>Send using the <strong>Default Sender ID</strong> (already active automatically)</li>
                  </ol>
                </div>
              )}
            </div>
          )}

          {/* Default Campaign & Whitelist Quick Helper Banner */}
          <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 text-[11px] text-blue-950 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="font-bold flex items-center gap-1.5 text-blue-900">
                <Shield className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Default Campaign Active (Default Sender ID)</span>
              </div>
              {customers.length > 0 && (
                <button
                  type="button"
                  onClick={copyAllCustomerNumbersForWhitelist}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-blue-300 hover:bg-blue-50 text-blue-700 font-semibold text-[10px] cursor-pointer self-start sm:self-auto"
                >
                  {copiedAllWhitelist ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>
                    {copiedAllWhitelist
                      ? 'Copied All Customer Numbers!'
                      : `Copy All ${customers.length} Customer Numbers for Whitelist`}
                  </span>
                </button>
              )}
            </div>
            <p className="text-blue-800 leading-relaxed">
              Per <strong>SMS Ethiopia (Alet Support Team)</strong>: While your business registration is pending, SMS dispatches use the <strong>Default Campaign</strong> and <strong>Default Sender ID</strong>. Ensure recipient numbers (<code className="font-mono bg-white px-1 py-0.5 rounded border border-blue-200">{toSmsEthiopiaMsisdn(customPhone) || '2519XXXXXXXX'}</code>) are whitelisted in your <a href="https://smsethiopia.com" target="_blank" rel="noreferrer" className="underline font-semibold">smsethiopia.com</a> Default Campaign before sending.
            </p>
          </div>

          {composeResult && (
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

              {/* Actionable guide if carrier rejected due to Default Campaign whitelist */}
              {composeResult.error &&
                (composeResult.error.includes('10007') ||
                  composeResult.error.includes('Whitelist') ||
                  composeResult.error.includes('Default Campaign')) && (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 space-y-2 text-xs">
                    <div className="font-bold flex items-center gap-1.5 text-amber-900">
                      <Zap className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Default Campaign Whitelist Required for {toSmsEthiopiaMsisdn(customPhone)}</span>
                    </div>
                    <p className="text-[11px] text-amber-900/90 leading-relaxed">
                      Per <strong>SMS Ethiopia (Alet Support Team)</strong>: When sending through the <strong>Default Campaign</strong> (before company registration & custom Sender ID approval), you must whitelist the recipient phone number first.
                    </p>
                    <div className="text-[11px] bg-white/90 p-2.5 rounded-lg border border-amber-200 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900">
                          Number to Whitelist: <code className="font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">{toSmsEthiopiaMsisdn(customPhone)}</code>
                        </span>
                        <button
                          type="button"
                          onClick={copyRecipientForWhitelist}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-white font-semibold text-[10px] cursor-pointer"
                        >
                          {copiedWhitelistPhone ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedWhitelistPhone ? 'Copied!' : 'Copy Number'}</span>
                        </button>
                      </div>
                      <ol className="list-decimal list-inside space-y-1 text-slate-700">
                        <li>
                          Open <a href="https://smsethiopia.com" target="_blank" rel="noreferrer" className="text-blue-600 font-bold underline inline-flex items-center gap-0.5">smsethiopia.com <ExternalLink className="w-3 h-3 inline" /></a> and select your <strong>Default Campaign</strong>.
                        </li>
                        <li>
                          Add <code className="font-mono font-bold">{toSmsEthiopiaMsisdn(customPhone)}</code> to the Default Campaign recipient whitelist.
                        </li>
                        <li>
                          Click <strong>Send Live SMS Now</strong> again (Default Sender ID is already configured).
                        </li>
                      </ol>
                    </div>
                  </div>
                )}
            </div>
          )}

          <form onSubmit={handleSendDirectSms} className="space-y-4">
            {/* Recipient Target Selector */}
            <div className="space-y-2">
              <label className="block font-medium text-slate-700">Recipient Target *</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRecipientType('custom')}
                  className={`py-2 px-3 rounded-lg border text-left flex items-center justify-between ${
                    recipientType === 'custom'
                      ? 'border-blue-600 bg-blue-50/50 text-blue-900 font-semibold'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <span>Direct Phone Number (Anyone)</span>
                  {recipientType === 'custom' && <Check className="w-3.5 h-3.5 text-blue-600" />}
                </button>
                <button
                  type="button"
                  onClick={() => setRecipientType('customer')}
                  className={`py-2 px-3 rounded-lg border text-left flex items-center justify-between ${
                    recipientType === 'customer'
                      ? 'border-blue-600 bg-blue-50/50 text-blue-900 font-semibold'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <span>Select Registered Customer</span>
                  {recipientType === 'customer' && <Check className="w-3.5 h-3.5 text-blue-600" />}
                </button>
              </div>
            </div>

            {recipientType === 'customer' && (
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Choose Customer from Database *
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => handleCustomerSelect(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">-- Choose a customer --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.businessName} ({c.phone || 'No phone recorded'})
                    </option>
                  ))}
                </select>
              </div>
            )}

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
              <p className="text-[11px] text-slate-400 mt-1">
                Accepts Ethiopian local format (09..., 07...) or international format (+251...).
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-medium text-slate-700">Message Content *</label>
                {templates.length > 0 && (
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => handleTemplateSelect(e.target.value)}
                    className="text-[11px] border border-slate-200 rounded px-2 py-0.5 text-slate-600 bg-slate-50"
                  >
                    <option value="">Insert Template Preset...</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <textarea
                rows={4}
                required
                value={composeMessage}
                onChange={(e) => setComposeMessage(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                placeholder="Enter SMS message body..."
              />
              <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                <span>
                  Length: <strong>{composeMessage.length}</strong> characters
                </span>
                <span>
                  Segments: <strong>{Math.ceil(composeMessage.length / 160) || 1}</strong> SMS standard segment
                </span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 text-[11px] flex items-center justify-between">
              <div>
                Sender ID: <strong className="text-slate-800">{settings?.sms.senderId || 'NexGrid'}</strong>
              </div>
              <div>
                Endpoint: <strong className="font-mono text-slate-800">{settings?.sms.apiEndpoint || 'smsethiopia.com'}</strong>
              </div>
            </div>

            <button
              type="submit"
              disabled={composeLoading || !customPhone.trim() || !composeMessage.trim()}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg shadow-2xs flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
            >
              <Send className="w-4 h-4" />
              <span>{composeLoading ? 'Dispatching via Gateway...' : 'Dispatch SMS to Recipient'}</span>
            </button>
          </form>
        </div>
      )}

      {/* 3. Bulk Broadcast SMS Tab */}
      {activeSubTab === 'bulk' && (
        <div className="max-w-2xl mx-auto bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4 text-xs">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Bulk SMS Broadcast</h3>
            <p className="text-slate-500 text-[11px] mt-0.5">
              Broadcast critical service announcements, reminders, or maintenance notices to multiple recipients simultaneously.
            </p>
          </div>

          {bulkResult && (
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

          <form onSubmit={handleSendBulkSms} className="space-y-4">
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
                    <span>All Registered Customers</span>
                    {bulkAudience === 'all' && <Check className="w-3.5 h-3.5 text-blue-600" />}
                  </div>
                  <div className="text-[10px] text-slate-500 font-normal mt-0.5">
                    {customers.filter((c) => c.phone).length} customer mobile numbers
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
                    <span>Custom Numbers List</span>
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
                  Recipient Numbers (Comma or newline separated) *
                </label>
                <textarea
                  rows={3}
                  required
                  value={bulkManualNumbers}
                  onChange={(e) => setBulkManualNumbers(e.target.value)}
                  placeholder="0911223344, 0922334455, +251933445566"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            )}

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Broadcast Message Content *
              </label>
              <textarea
                rows={4}
                required
                value={bulkMessage}
                onChange={(e) => setBulkMessage(e.target.value)}
                placeholder="Compose your broadcast message..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
              <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                <span>Length: {bulkMessage.length} characters</span>
                <span>Segments: {Math.ceil(bulkMessage.length / 160) || 1}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={bulkLoading || !bulkMessage.trim()}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg shadow-2xs flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
            >
              <Users className="w-4 h-4" />
              <span>{bulkLoading ? 'Broadcasting Batch Dispatches...' : 'Launch Bulk Broadcast'}</span>
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
                placeholder="Search recipient, content, provider ref..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
              />
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

          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">Message ID</th>
                    <th className="py-2.5 px-4">Recipient</th>
                    <th className="py-2.5 px-4">Type</th>
                    <th className="py-2.5 px-4">Message Content Preview</th>
                    <th className="py-2.5 px-4">Provider Ref</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Timestamp</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        Loading message logs...
                      </td>
                    </tr>
                  ) : filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
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
                          <div className="font-mono font-semibold text-slate-900">{log.recipient}</div>
                          {log.customerName && (
                            <div className="text-[10px] text-slate-500">{log.customerName}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 capitalize text-slate-700">
                          {log.messageType.replace('_', ' ')}
                        </td>
                        <td className="py-3 px-4 max-w-xs">
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
                          {log.status === 'failed' && (
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
              Configured Notification Templates
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
                  <span className="text-[10px] uppercase font-bold text-slate-500 font-mono">
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
                  <button
                    onClick={handleSaveTemplate}
                    disabled={savingTemplate}
                    className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors disabled:opacity-50"
                  >
                    {savingTemplate ? 'Saving...' : 'Save Template'}
                  </button>
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

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Template Body Content
                  </label>
                  <textarea
                    rows={5}
                    value={templateBody}
                    onChange={(e) => setTemplateBody(e.target.value)}
                    className="w-full p-3 border border-slate-300 rounded-lg text-xs font-mono focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                  <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                    <span>Standard GSM 03.38 character encoding</span>
                    <span>Length: {templateBody.length} characters</span>
                  </div>
                </div>

                {/* Customer Device SMS Preview */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                    <Smartphone className="w-3.5 h-3.5 text-slate-600" />
                    <span>Customer Device SMS Preview</span>
                  </div>
                  <div className="max-w-sm bg-white p-3 rounded-2xl rounded-tl-xs shadow-xs border border-slate-200 text-xs text-slate-800 font-sans leading-relaxed">
                    {templateBody
                      .replace(/\[Customer Name\]/g, 'Dawit Abebe')
                      .replace(/\[Domain Name\]/g, 'addistech.et')
                      .replace(/\[Expiration Date\]/g, '2026-10-20')
                      .replace(/\[Days Remaining\]/g, '6')
                      .replace(/\[Amount\]/g, '3,500.00')
                      .replace(/\[Currency\]/g, 'ETB')
                      .replace(/\[Business Contact\]/g, '+251 911 234 567')
                      .replace(/\[Service\/Invoice Number\]/g, 'INV-2026-001')
                      .replace(/\[Balance\]/g, '0.00')
                      .replace(/\[Invoice Number\]/g, 'INV-2026-001')
                      .replace(/\[Due Date\]/g, '2026-10-18')}
                  </div>
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
    </div>
  );
};
