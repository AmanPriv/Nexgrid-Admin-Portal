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
} from 'lucide-react';
import { api } from '../services/api.ts';
import { MessageLog, MessageTemplate, AppSettings } from '../types.ts';

export const MessagingView: React.FC = () => {
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<'logs' | 'templates' | 'test'>('logs');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'delivered' | 'sent' | 'failed' | 'queued'>('all');

  // Test SMS State
  const [testPhone, setTestPhone] = useState('+251911223344');
  const [testMessage, setTestMessage] = useState(
    'NexGrid Digital Systems: Test dispatch from Admin Portal via SMS Ethiopia API.'
  );
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ status: string; error?: string } | null>(null);

  // Template Editing State
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [templateBody, setTemplateBody] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Retry state
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [logsData, tmplData, settsData] = await Promise.all([
        api.getMessageLogs(),
        api.getTemplates(),
        api.getSettings(),
      ]);
      setLogs(logsData.logs);
      setTemplates(tmplData.templates);
      setSettings(settsData.settings);
    } catch (err) {
      console.error('Failed to load messaging data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSendTestSms = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestLoading(true);
    setTestResult(null);

    try {
      const res = await api.sendTestSms(testPhone, testMessage);
      setTestResult({ status: res.status, error: res.error });
      loadData();
    } catch (err: any) {
      setTestResult({ status: 'failed', error: err.message });
    } finally {
      setTestLoading(false);
    }
  };

  const handleRetryMessage = async (id: string) => {
    setRetryingId(id);
    try {
      const res = await api.retryMessage(id);
      alert(`Retry dispatched. Result: ${res.status}${res.error ? ` (${res.error})` : ''}`);
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

  return (
    <div className="space-y-4">
      {/* 1. SMS Ethiopia Gateway Integration Health Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  SMS Ethiopia Gateway (sms.et)
                </h3>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    settings?.sms.hasApiKey
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  {settings?.sms.hasApiKey ? 'CREDENTIALS CONFIGURED' : 'API KEY REQUIRED'}
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>Endpoint: <strong className="font-mono text-slate-700">{settings?.sms.apiEndpoint || 'https://sms.et/api/v1/send'}</strong></span>
                <span>·</span>
                <span>Sender ID: <strong className="text-slate-700">{settings?.sms.senderId || 'NexGrid'}</strong></span>
                <span>·</span>
                <span>
                  API Key: <strong className="font-mono text-slate-700">{settings?.sms.apiKeyMasked || 'Not configured in Settings'}</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setActiveSubTab('test')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-2xs transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Test SMS Dispatch</span>
            </button>
            <a
              href="https://sms.et"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-xs font-medium"
            >
              <span>sms.et</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      {/* Sub-tab Navigation */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
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
          <button
            onClick={() => setActiveSubTab('test')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeSubTab === 'test'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Live Gateway Tester
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

      {/* 2. Dispatch Logs Tab */}
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

      {/* 3. Message Templates Tab */}
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

                {/* Simulated SMS Preview Bubble */}
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

      {/* 4. Live Gateway Tester Tab */}
      {activeSubTab === 'test' && (
        <div className="max-w-xl mx-auto bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4 text-xs">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Live SMS Ethiopia Gateway Tester</h3>
            <p className="text-slate-500 text-[11px] mt-0.5">
              Send a real-time verification SMS to any phone number to test connectivity, sender ID registration, and account balance on sms.et.
            </p>
          </div>

          {testResult && (
            <div
              className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
                testResult.status === 'sent' || testResult.status === 'delivered'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border border-rose-200 text-rose-800'
              }`}
            >
              {testResult.status === 'sent' || testResult.status === 'delivered' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-semibold capitalize">Result: {testResult.status}</div>
                {testResult.error && <div className="mt-0.5">{testResult.error}</div>}
              </div>
            </div>
          )}

          <form onSubmit={handleSendTestSms} className="space-y-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Recipient Phone Number (Ethiopian Standard) *
              </label>
              <input
                type="text"
                required
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="+251911223344 or 0911223344"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Test Message Text *
              </label>
              <textarea
                rows={3}
                required
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
              <div className="text-[11px] text-slate-400 mt-1">
                Characters: {testMessage.length} / 160
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 text-[11px] space-y-1">
              <div>• Gateway Endpoint: <strong>{settings?.sms.apiEndpoint || 'https://sms.et/api/v1/send'}</strong></div>
              <div>• Sender ID: <strong>{settings?.sms.senderId || 'NexGrid'}</strong></div>
              <div>• API Key status: {settings?.sms.hasApiKey ? 'Configured' : 'Missing (Will report exact error)'}</div>
            </div>

            <button
              type="submit"
              disabled={testLoading}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg shadow-2xs flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{testLoading ? 'Calling SMS Ethiopia Gateway...' : 'Send Live Test SMS'}</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
