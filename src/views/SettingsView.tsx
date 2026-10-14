import React, { useState, useEffect } from 'react';
import {
  Settings,
  Radio,
  Clock,
  Shield,
  KeyRound,
  Database,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCw,
  Eye,
  EyeOff,
  Laptop,
  LogOut,
  Trash2,
  AlertOctagon,
  ShieldAlert,
} from 'lucide-react';
import { api } from '../services/api.ts';
import { AppSettings, ActiveSession } from '../types.ts';

export const SettingsView: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Active Sessions
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [sessionMsg, setSessionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Factory Data Reset
  const [factoryConfirmText, setFactoryConfirmText] = useState('');
  const [factoryPassword, setFactoryPassword] = useState('');
  const [factoryLoading, setFactoryLoading] = useState(false);
  const [factoryMsg, setFactoryMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states
  const [businessName, setBusinessName] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [businessEmail, setBusinessEmail] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [tinNumber, setTinNumber] = useState('');
  const [currency, setCurrency] = useState('ETB');
  const [inactivityTimeout, setInactivityTimeout] = useState('60');

  // SMS Ethiopia states
  const [smsEndpoint, setSmsEndpoint] = useState('https://smsethiopia.com/api/sms/send');
  const [smsApiKey, setSmsApiKey] = useState('');
  const [smsSenderId, setSmsSenderId] = useState('NexGrid');
  const [smsEnabled, setSmsEnabled] = useState(true);
  const [autoWelcome, setAutoWelcome] = useState(true);
  const [autoPaymentConfirm, setAutoPaymentConfirm] = useState(true);
  const [autoDomainReminders, setAutoDomainReminders] = useState(true);
  const [smsDeliveryMode, setSmsDeliveryMode] = useState<'direct' | 'resilient'>('resilient');
  const [showApiKey, setShowApiKey] = useState(false);

  // Reminders intervals
  const [reminderDaysStr, setReminderDaysStr] = useState('30, 14, 7, 3, 1');

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  // Scheduler execution
  const [schedulerRunning, setSchedulerRunning] = useState(false);
  const [schedulerResult, setSchedulerResult] = useState<any>(null);

  // Backup restore
  const [restoring, setRestoring] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await api.getSettings();
      setSettings(data.settings);

      setBusinessName(data.settings.general.businessName || 'NexGrid Digital Systems');
      setBusinessPhone(data.settings.general.businessPhone || '+251 911 234 567');
      setBusinessEmail(data.settings.general.businessEmail || 'support@nexgrid.et');
      setBusinessAddress(data.settings.general.businessAddress || 'Addis Ababa, Ethiopia');
      setTinNumber(data.settings.general.tinNumber || '0054892147');
      setCurrency(data.settings.general.currency || 'ETB');
      setInactivityTimeout(String(data.settings.general.inactivityTimeoutMinutes || 60));

      const rawEndpoint = data.settings.sms.apiEndpoint || '';
      setSmsEndpoint(rawEndpoint.includes('sms.et') || !rawEndpoint ? 'https://smsethiopia.com/api/sms/send' : rawEndpoint);
      setSmsSenderId(data.settings.sms.senderId || 'NexGrid');
      setSmsEnabled(data.settings.sms.enabled);
      setAutoWelcome(data.settings.sms.autoWelcome);
      setAutoPaymentConfirm(data.settings.sms.autoPaymentConfirm);
      setAutoDomainReminders(data.settings.sms.autoDomainReminders);
      setSmsDeliveryMode(data.settings.sms.deliveryMode || 'resilient');

      setReminderDaysStr((data.settings.reminders.domainReminderDays || [30, 14, 7, 3, 1]).join(', '));
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
    loadSessions();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);

    try {
      const parsedDays = reminderDaysStr
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n) && n > 0);

      await api.updateSettings({
        general: {
          businessName,
          businessPhone,
          businessContact: businessPhone,
          businessEmail,
          businessAddress,
          tinNumber,
          currency,
          timezone: 'Africa/Addis_Ababa',
          inactivityTimeoutMinutes: Number(inactivityTimeout) || 60,
        },
        sms: {
          provider: 'sms_et',
          apiEndpoint: smsEndpoint,
          apiKey: smsApiKey, // will preserve existing if empty string
          senderId: smsSenderId,
          enabled: smsEnabled,
          autoWelcome,
          autoPaymentConfirm,
          autoDomainReminders,
          autoInvoiceReminders: true,
          deliveryMode: smsDeliveryMode,
        },
        reminders: {
          domainReminderDays: parsedDays.length > 0 ? parsedDays : [30, 14, 7, 3, 1],
          invoiceReminderDays: [7, 3, 1, -1, -3],
          lastSchedulerRun: settings?.reminders.lastSchedulerRun || null,
        },
      });

      setSaveSuccess(true);
      setSmsApiKey(''); // reset input field
      loadSettings();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert(`Failed to save settings: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const loadSessions = async () => {
    try {
      const data = await api.listSessions();
      setSessions(data.sessions || []);
    } catch (err) {
      console.error('Failed to load active sessions:', err);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    setRevokingSessionId(sessionId);
    setSessionMsg(null);
    try {
      await api.revokeSession(sessionId);
      setSessionMsg({ type: 'success', text: 'Active session revoked immediately across devices.' });
      loadSessions();
    } catch (err: any) {
      setSessionMsg({ type: 'error', text: err.message || 'Failed to revoke session.' });
    } finally {
      setRevokingSessionId(null);
    }
  };

  const handleRevokeAllOtherSessions = async () => {
    if (!confirm('Revoke all active sessions on other computers/browsers? You will remain signed in on this current browser.')) {
      return;
    }
    setRevokingAll(true);
    setSessionMsg(null);
    try {
      const res = await api.revokeAllOtherSessions();
      setSessionMsg({ type: 'success', text: `Revoked ${res.revokedCount} other session(s). All other devices must re-authenticate.` });
      loadSessions();
    } catch (err: any) {
      setSessionMsg({ type: 'error', text: err.message || 'Failed to revoke sessions.' });
    } finally {
      setRevokingAll(false);
    }
  };

  const handleFactoryReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setFactoryMsg(null);
    if (factoryConfirmText !== 'RESET APPLICATION DATA') {
      setFactoryMsg({ type: 'error', text: 'You must type "RESET APPLICATION DATA" in exact uppercase.' });
      return;
    }
    if (!factoryPassword) {
      setFactoryMsg({ type: 'error', text: 'Administrator master password is required.' });
      return;
    }

    setFactoryLoading(true);
    try {
      const res = await api.factoryResetData(factoryConfirmText, factoryPassword);
      setFactoryMsg({ type: 'success', text: res.message });
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      setFactoryMsg({ type: 'error', text: err.message || 'Reset failed.' });
      setFactoryLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);

    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    if (newPassword.length < 12) {
      setPasswordMsg({ type: 'error', text: 'New password must be at least 12 characters long (OWASP standard).' });
      return;
    }

    setChangingPassword(true);
    try {
      const res = await api.changePassword(currentPassword, newPassword);
      setPasswordMsg({ type: 'success', text: res.message });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      loadSessions();
    } catch (err: any) {
      setPasswordMsg({ type: 'error', text: err.message || 'Failed to change password.' });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleRunScheduler = async () => {
    setSchedulerRunning(true);
    setSchedulerResult(null);
    try {
      const result = await api.runScheduler();
      setSchedulerResult(result);
      loadSettings();
    } catch (err: any) {
      alert(`Scheduler run error: ${err.message}`);
    } finally {
      setSchedulerRunning(false);
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm(`Restore database from file "${file.name}"? This will overwrite existing customer, domain, and transaction records.`)) {
      e.target.value = '';
      return;
    }

    setRestoring(true);
    setRestoreMsg(null);

    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await api.restoreBackup(json);
      setRestoreMsg({
        type: 'success',
        text: `Restored successfully! Records: ${res.counts.customers} customers, ${res.counts.domains} domains, ${res.counts.payments} payments.`,
      });
      loadSettings();
    } catch (err: any) {
      setRestoreMsg({ type: 'error', text: `Restoration error: ${err.message}` });
    } finally {
      setRestoring(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {saveSuccess && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Settings saved successfully. All changes are actively enforced.</span>
        </div>
      )}

      {/* 1. SMS Ethiopia Official API Settings */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <Radio className="w-4 h-4 text-blue-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                SMS Ethiopia Production Gateway (smsethiopia.com)
              </h3>
              <p className="text-xs text-slate-500">
                Dispatches real-time automated and custom notifications to all Ethiopian mobile networks
              </p>
            </div>
          </div>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded ${
              settings?.sms.hasApiKey
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}
          >
            {settings?.sms.hasApiKey ? 'PRODUCTION KEY CONFIGURED' : 'API KEY MISSING'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Gateway Endpoint URL *
            </label>
            <input
              type="text"
              value={smsEndpoint}
              onChange={(e) => setSmsEndpoint(e.target.value)}
              placeholder="https://smsethiopia.com/api/sms/send"
              className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono text-slate-800"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Approved Sender ID / Brand
            </label>
            <input
              type="text"
              value={smsSenderId}
              onChange={(e) => setSmsSenderId(e.target.value)}
              placeholder="NexGrid (or registered Ethio Telecom alpha ID)"
              className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-medium"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">
              SMS Ethiopia Campaign API Key
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={smsApiKey}
                onChange={(e) => setSmsApiKey(e.target.value)}
                placeholder={
                  settings?.sms.hasApiKey
                    ? `Current Key: ${settings?.sms.apiKeyMasked} (Enter new key to change)`
                    : 'Enter your SMS Ethiopia API key from smsethiopia.com'
                }
                className="w-full px-3 py-1.5 pr-10 border border-slate-300 rounded-md font-mono text-slate-800 placeholder-slate-400"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              From smsethiopia.com &gt; Campaigns &gt; Your Campaign &gt; API Key.
            </p>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Universal Delivery Strategy
            </label>
            <select
              value={smsDeliveryMode}
              onChange={(e) => setSmsDeliveryMode(e.target.value as any)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-medium bg-white text-slate-800"
            >
              <option value="resilient">Universal Production Mode (Auto-Fallback on Carrier Sandbox Restrictions)</option>
              <option value="direct">Direct Carrier Route (Strict Ethio Telecom Live Delivery Only)</option>
            </select>
            <p className="text-[11px] text-slate-400 mt-1">
              Guarantees messages to all recipient phone numbers dispatch smoothly without carrier trial blockage.
            </p>
          </div>
        </div>

        {/* Automation Toggles */}
        <div className="pt-2 border-t border-slate-100 space-y-2 text-xs">
          <div className="font-semibold text-slate-800 mb-1.5">Automated SMS Dispatches:</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100/70">
              <input
                type="checkbox"
                checked={autoWelcome}
                onChange={(e) => setAutoWelcome(e.target.checked)}
                className="rounded text-blue-600"
              />
              <span className="text-slate-700 font-medium">Welcome SMS to New Customers</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100/70">
              <input
                type="checkbox"
                checked={autoPaymentConfirm}
                onChange={(e) => setAutoPaymentConfirm(e.target.checked)}
                className="rounded text-blue-600"
              />
              <span className="text-slate-700 font-medium">Payment Confirmation SMS</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100/70">
              <input
                type="checkbox"
                checked={autoDomainReminders}
                onChange={(e) => setAutoDomainReminders(e.target.checked)}
                className="rounded text-blue-600"
              />
              <span className="text-slate-700 font-medium">Domain Renewal Expiration Reminders</span>
            </label>
          </div>
        </div>
      </div>

      {/* 2. Automated Domain Reminder Intervals & Scheduler */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <Clock className="w-4 h-4 text-amber-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Domain Renewal Schedule Intervals
              </h3>
              <p className="text-xs text-slate-500">
                Number of days prior to expiration when automated notifications are dispatched
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Reminder Intervals (Days before expiration, comma-separated) *
            </label>
            <input
              type="text"
              value={reminderDaysStr}
              onChange={(e) => setReminderDaysStr(e.target.value)}
              placeholder="30, 14, 7, 3, 1"
              className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Default standard: 30, 14, 7, 3, and 1 day. Duplicates are mathematically prevented.
            </p>
          </div>

          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex flex-col justify-between">
            <div>
              <div className="font-semibold text-slate-800">Background Reminder Scheduler</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Last executed:{' '}
                {settings?.reminders.lastSchedulerRun
                  ? new Date(settings.reminders.lastSchedulerRun).toLocaleString('en-GB')
                  : 'Automated 30-min background interval'}
              </div>
            </div>

            <button
              type="button"
              onClick={handleRunScheduler}
              disabled={schedulerRunning}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs self-start disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 text-blue-400" />
              <span>{schedulerRunning ? 'Checking Domains...' : 'Run Reminder Cycle Now'}</span>
            </button>
          </div>
        </div>

        {schedulerResult && (
          <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900 space-y-1">
            <div className="font-semibold">Scheduler Run Summary:</div>
            <div>• Domains inspected: {schedulerResult.domainsChecked}</div>
            <div>• Reminders dispatched: {schedulerResult.remindersSent}</div>
            <div>• Reminders skipped (already sent/unmatched interval): {schedulerResult.remindersSkipped}</div>
            {schedulerResult.errors && schedulerResult.errors.length > 0 && (
              <div className="text-rose-700 font-semibold">• Issues: {schedulerResult.errors.join('; ')}</div>
            )}
          </div>
        )}
      </div>

      {/* 3. Company Profile & System Inactivity Policy */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-200">
          <Settings className="w-4 h-4 text-slate-700" />
          <h3 className="text-sm font-bold text-slate-900">
            Company Profile & System Defaults
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Business Legal Name
            </label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-semibold"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Tax Identification Number (TIN)
            </label>
            <input
              type="text"
              value={tinNumber}
              onChange={(e) => setTinNumber(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Support Phone / Contact
            </label>
            <input
              type="text"
              value={businessPhone}
              onChange={(e) => setBusinessPhone(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Official Email
            </label>
            <input
              type="email"
              value={businessEmail}
              onChange={(e) => setBusinessEmail(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-md"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block font-medium text-slate-700 mb-1">
              Office / Billing Address
            </label>
            <input
              type="text"
              value={businessAddress}
              onChange={(e) => setBusinessAddress(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-md"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Default Currency
            </label>
            <input
              type="text"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Session Inactivity Timeout (Minutes) *
            </label>
            <input
              type="number"
              min={5}
              max={480}
              value={inactivityTimeout}
              onChange={(e) => setInactivityTimeout(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono"
            />
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={handleSaveSettings}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-2xs transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Configuration Changes'}
          </button>
        </div>
      </div>

      {/* 4. Security & Admin Password Update */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-200">
          <KeyRound className="w-4 h-4 text-purple-600" />
          <h3 className="text-sm font-bold text-slate-900">
            Administrator Password & Credentials Security
          </h3>
        </div>

        {passwordMsg && (
          <div
            className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
              passwordMsg.type === 'success'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border border-rose-200 text-rose-800'
            }`}
          >
            {passwordMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{passwordMsg.text}</span>
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-3 text-xs max-w-md">
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Current Password *
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-md"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">
              New Password (min 12 characters, OWASP standard) *
            </label>
            <input
              type="password"
              required
              minLength={12}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Confirm New Password *
            </label>
            <input
              type="password"
              required
              minLength={12}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono"
            />
          </div>

          <button
            type="submit"
            disabled={changingPassword}
            className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs disabled:opacity-50"
          >
            {changingPassword ? 'Verifying & Updating...' : 'Update Password Securely'}
          </button>
        </form>
      </div>

      {/* 4B. Active Sessions & Device Security */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <Laptop className="w-4 h-4 text-blue-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Active Sessions & Device Management (OWASP Session Standard)
              </h3>
              <p className="text-xs text-slate-500">
                Inspect authenticated devices and instantly revoke unauthorized sessions
              </p>
            </div>
          </div>
          {sessions.filter((s) => !s.isCurrent).length > 0 && (
            <button
              type="button"
              onClick={handleRevokeAllOtherSessions}
              disabled={revokingAll}
              className="px-3 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{revokingAll ? 'Revoking...' : 'Revoke Other Sessions'}</span>
            </button>
          )}
        </div>

        {sessionMsg && (
          <div
            className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
              sessionMsg.type === 'success'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border border-rose-200 text-rose-800'
            }`}
          >
            {sessionMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{sessionMsg.text}</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border border-slate-200 rounded-lg overflow-hidden">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <tr>
                <th className="p-2.5">Device & Browser</th>
                <th className="p-2.5">IP Address</th>
                <th className="p-2.5">Logged In</th>
                <th className="p-2.5">Last Active</th>
                <th className="p-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessions.map((sess) => (
                <tr key={sess.id} className={sess.isCurrent ? 'bg-blue-50/40' : 'hover:bg-slate-50'}>
                  <td className="p-2.5">
                    <div className="font-medium text-slate-800 flex items-center gap-1.5">
                      <Laptop className="w-3.5 h-3.5 text-slate-400" />
                      <span className="truncate max-w-[200px]" title={sess.userAgent}>
                        {sess.userAgent}
                      </span>
                    </div>
                  </td>
                  <td className="p-2.5 font-mono text-slate-600">{sess.ipAddress}</td>
                  <td className="p-2.5 text-slate-500">
                    {new Date(sess.createdAt).toLocaleDateString()} {new Date(sess.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="p-2.5 text-slate-500">
                    {new Date(sess.lastActiveAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="p-2.5 text-right">
                    {sess.isCurrent ? (
                      <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold text-[10px]">
                        This Device
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRevokeSession(sess.id)}
                        disabled={revokingSessionId === sess.id}
                        className="px-2 py-0.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-medium transition-colors"
                      >
                        {revokingSessionId === sess.id ? 'Revoking...' : 'Revoke'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Database Backup & Disaster Recovery */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-200">
          <Database className="w-4 h-4 text-emerald-600" />
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Database Export, Backup & Restoration
            </h3>
            <p className="text-xs text-slate-500">
              Download JSON snapshots of customers, domains, and transaction ledgers
            </p>
          </div>
        </div>

        {restoreMsg && (
          <div
            className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
              restoreMsg.type === 'success'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border border-rose-200 text-rose-800'
            }`}
          >
            {restoreMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{restoreMsg.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          {/* Download Backup */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col justify-between space-y-3">
            <div>
              <div className="font-semibold text-slate-800">Download Database Snapshot</div>
              <p className="text-[11px] text-slate-500 mt-1">
                Generates a complete, verifiable JSON archive of all customers, registered domains, invoices, payments, and audit logs.
              </p>
            </div>
            <a
              href={api.getBackupDownloadUrl()}
              download
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs self-start"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Backup (.json)</span>
            </a>
          </div>

          {/* Restore Backup */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col justify-between space-y-3">
            <div>
              <div className="font-semibold text-slate-800">Restore From Backup File</div>
              <p className="text-[11px] text-slate-500 mt-1">
                Upload a previous valid NexGrid JSON backup. Schema validation and an audit trail event are triggered upon restore.
              </p>
            </div>
            <div>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-slate-500" />
                <span>{restoring ? 'Restoring...' : 'Upload & Restore Backup'}</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleRestoreFile}
                  disabled={restoring}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* 6. CRITICAL SECURITY: Factory Data Reset */}
      <div className="bg-rose-50/50 rounded-xl border border-rose-200 p-5 shadow-2xs space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-rose-200">
          <AlertOctagon className="w-4 h-4 text-rose-600" />
          <div>
            <h3 className="text-sm font-bold text-rose-950">
              Factory Data Reset & Application Wipe (Irreversible)
            </h3>
            <p className="text-xs text-rose-700">
              Permanently delete all customers, domains, financial transactions, logs, and accounts
            </p>
          </div>
        </div>

        {factoryMsg && (
          <div
            className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
              factoryMsg.type === 'success'
                ? 'bg-emerald-100 border border-emerald-300 text-emerald-900'
                : 'bg-rose-100 border border-rose-300 text-rose-900'
            }`}
          >
            {factoryMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
            )}
            <span>{factoryMsg.text}</span>
          </div>
        )}

        <form onSubmit={handleFactoryReset} className="space-y-3 text-xs max-w-lg">
          <p className="text-slate-700 leading-relaxed">
            Executing a factory reset permanently deletes all application records, invalidates all sessions across devices, and resets the database back to clean empty state. An automatic timestamped backup will be created in the server <code className="bg-slate-200 px-1 py-0.5 rounded text-[11px]">/data</code> directory prior to wiping.
          </p>

          <div>
            <label className="block font-semibold text-slate-800 mb-1">
              Type <span className="font-mono text-rose-700 select-all">RESET APPLICATION DATA</span> to confirm:
            </label>
            <input
              type="text"
              required
              value={factoryConfirmText}
              onChange={(e) => setFactoryConfirmText(e.target.value)}
              placeholder="RESET APPLICATION DATA"
              className="w-full px-3 py-1.5 border border-rose-300 rounded-md font-mono bg-white text-slate-900"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-800 mb-1">
              Confirm Administrator Master Password:
            </label>
            <input
              type="password"
              required
              value={factoryPassword}
              onChange={(e) => setFactoryPassword(e.target.value)}
              placeholder="Enter your current password"
              className="w-full px-3 py-1.5 border border-rose-300 rounded-md bg-white text-slate-900"
            />
          </div>

          <button
            type="submit"
            disabled={factoryLoading || factoryConfirmText !== 'RESET APPLICATION DATA' || !factoryPassword}
            className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{factoryLoading ? 'Executing Data Reset...' : 'Authorize Factory Data Reset'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
