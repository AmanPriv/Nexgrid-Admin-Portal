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
  Zap,
  ExternalLink,
  Mail,
} from 'lucide-react';
import { api } from '../services/api.ts';
import { AppSettings, ActiveSession } from '../types.ts';
import { PaymentQrCode } from '../components/PaymentQrCode.tsx';
import { EmailConfirmationModal } from '../components/EmailConfirmationModal.tsx';
import {
  getAccessToken,
  getConnectedGmailEmail,
  googleSignIn,
  disconnectGmail,
  subscribeWorkspaceAuth,
  OFFICIAL_BUSINESS_EMAIL,
  FIREBASE_AUTH_SETTINGS_URL,
  FIREBASE_PROJECT_ID,
} from '../firebase.ts';

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
  const [businessName, setBusinessName] = useState('NexGrid Digital Systems');
  const [businessPhone, setBusinessPhone] = useState('+251 906697634');
  const [businessEmail, setBusinessEmail] = useState('nexgriddigital@gmail.com');
  const [businessAddress, setBusinessAddress] = useState('Online');
  const [tinNumber, setTinNumber] = useState('0054892147');
  const [currency, setCurrency] = useState('ETB');
  const [inactivityTimeout, setInactivityTimeout] = useState('60');

  // Banking Details states
  const [bankName, setBankName] = useState('Commercial Bank of Ethiopia (CBE)');
  const [bankAccountName, setBankAccountName] = useState('NexGrid Digital Systems');
  const [bankAccountNumber, setBankAccountNumber] = useState('1000234567890');
  const [telebirrNumber, setTelebirrNumber] = useState('+251 906697634');
  const [secondaryBankDetails, setSecondaryBankDetails] = useState('Telebirr / Mobile Money: +251 906697634');

  // SMS Gateway states
  const [smsProvider, setSmsProvider] = useState<'sms_et' | 'afro_message' | 'custom_webhook'>('sms_et');
  const [smsEndpoint, setSmsEndpoint] = useState('https://smsethiopia.com/api/sms/send');
  const [smsApiKey, setSmsApiKey] = useState('');
  const [smsSenderId, setSmsSenderId] = useState('');
  const [smsEnabled, setSmsEnabled] = useState(true);
  const [autoWelcome, setAutoWelcome] = useState(true);
  const [autoPaymentConfirm, setAutoPaymentConfirm] = useState(true);
  const [autoDomainReminders, setAutoDomainReminders] = useState(true);
  const [showApiKey, setShowApiKey] = useState(false);

  // Gateway Diagnostics state
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagResult, setDiagResult] = useState<any>(null);
  const [diagPhone, setDiagPhone] = useState('251983064449');

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

  // Google Workspace Gmail OAuth state
  const [gmailToken, setGmailToken] = useState<string | null>(null);
  const [gmailSender, setGmailSender] = useState<string | null>(null);
  const [signingInGoogle, setSigningInGoogle] = useState(false);
  const [googleAuthError, setGoogleAuthError] = useState<string | null>(null);
  const [copiedDomain, setCopiedDomain] = useState<string | null>(null);
  const [showTestEmailModal, setShowTestEmailModal] = useState(false);
  const [testEmailTarget, setTestEmailTarget] = useState('nexgriddigital@gmail.com');

  useEffect(() => {
    getAccessToken().then((t) => setGmailToken(t));
    setGmailSender(getConnectedGmailEmail());
    const unsub = subscribeWorkspaceAuth((token, email) => {
      setGmailToken(token);
      setGmailSender(email);
    });
    return () => unsub();
  }, []);

  const handleConnectGmail = async () => {
    setSigningInGoogle(true);
    setGoogleAuthError(null);
    try {
      const res = await googleSignIn(OFFICIAL_BUSINESS_EMAIL);
      if (res) {
        setGmailToken(res.accessToken);
        setGmailSender(res.user.email);
      }
    } catch (err: any) {
      console.error('Google Sign-In error:', err);
      setGoogleAuthError(err?.message || 'Google sign-in failed.');
    } finally {
      setSigningInGoogle(false);
    }
  };

  const handleDisconnectGmail = async () => {
    await disconnectGmail();
    setGmailToken(null);
    setGmailSender(null);
  };

  const isBusinessGmailActive =
    Boolean(gmailToken && gmailSender) &&
    gmailSender!.trim().toLowerCase() === OFFICIAL_BUSINESS_EMAIL.toLowerCase();

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await api.getSettings();
      setSettings(data.settings);

      setBusinessName(data.settings.general.businessName || 'NexGrid Digital Systems');
      setBusinessPhone(data.settings.general.businessPhone || '+251 906697634');
      setBusinessEmail(data.settings.general.businessEmail || 'nexgriddigital@gmail.com');
      setBusinessAddress(data.settings.general.businessAddress || 'Online');
      setTinNumber(data.settings.general.tinNumber || '0054892147');
      setCurrency(data.settings.general.currency || 'ETB');
      setInactivityTimeout(String(data.settings.general.inactivityTimeoutMinutes || 60));

      setBankName(data.settings.general.bankName || 'Commercial Bank of Ethiopia (CBE)');
      setBankAccountName(data.settings.general.bankAccountName || data.settings.general.businessName || 'NexGrid Digital Systems');
      setBankAccountNumber(data.settings.general.bankAccountNumber || '1000234567890');
      setTelebirrNumber(data.settings.general.telebirrNumber || data.settings.general.businessPhone || '+251 906697634');
      setSecondaryBankDetails(
        data.settings.general.secondaryBankDetails ||
          `Telebirr / Mobile Money: ${data.settings.general.telebirrNumber || data.settings.general.businessPhone || '+251 906697634'}`
      );

      const rawEndpoint = data.settings.sms.apiEndpoint || '';
      setSmsEndpoint(rawEndpoint.includes('sms.et') || !rawEndpoint ? 'https://smsethiopia.com/api/sms/send' : rawEndpoint);
      const savedSender = data.settings.sms.senderId || '';
      setSmsSenderId(savedSender.toLowerCase() === 'nexgrid' ? '' : savedSender);
      setSmsProvider((data.settings.sms.provider as any) || 'sms_et');
      setSmsEnabled(data.settings.sms.enabled);
      setAutoWelcome(data.settings.sms.autoWelcome);
      setAutoPaymentConfirm(data.settings.sms.autoPaymentConfirm);
      setAutoDomainReminders(data.settings.sms.autoDomainReminders);

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

  const handleTestGateway = async () => {
    setDiagLoading(true);
    setDiagResult(null);
    try {
      const res = await api.diagnoseGateway(diagPhone, {
        apiKey: smsApiKey.trim() || undefined,
        senderId: smsSenderId,
        endpoint: smsEndpoint,
      });
      setDiagResult(res);
      if (smsApiKey.trim()) {
        setSmsApiKey('');
        loadSettings();
      }
    } catch (err: any) {
      setDiagResult({
        success: false,
        diagnosticStatus: 'network_error',
        recommendation: err.message || 'Gateway diagnostic connection failed.',
      });
    } finally {
      setDiagLoading(false);
    }
  };

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
          bankName,
          bankAccountName,
          bankAccountNumber,
          telebirrNumber,
          secondaryBankDetails,
          bankingDetails: `Bank: ${bankName} | Account Name: ${bankAccountName} | Account No: ${bankAccountNumber} | Telebirr: ${telebirrNumber}${secondaryBankDetails ? ` | ${secondaryBankDetails}` : ''}`,
        },
        sms: {
          provider: smsProvider,
          apiEndpoint: smsEndpoint,
          apiKey: smsApiKey, // will preserve existing if empty string
          senderId: smsSenderId,
          enabled: smsEnabled,
          autoWelcome,
          autoPaymentConfirm,
          autoDomainReminders,
          autoInvoiceReminders: true,
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

      {/* 0. Google Workspace Gmail API Integration */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <Mail className="w-4 h-4 text-blue-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Business Gmail Dispatcher — <span className="font-mono text-blue-600">{OFFICIAL_BUSINESS_EMAIL}</span>
              </h3>
              <p className="text-xs text-slate-500">
                All client emails (Welcome, Domain Renewals, Invoices, Quotations &amp; Payment Receipts) are dispatched from <strong className="text-slate-700">{OFFICIAL_BUSINESS_EMAIL}</strong>
              </p>
            </div>
          </div>
          <span
            className={`text-[10px] font-bold px-2.5 py-0.5 rounded self-start sm:self-center ${
              isBusinessGmailActive
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}
          >
            {isBusinessGmailActive
              ? `ACTIVE SENDER: ${OFFICIAL_BUSINESS_EMAIL}`
              : gmailToken
              ? `CONNECTED AS ${gmailSender} (SWITCH REQUIRED)`
              : `CONNECT ${OFFICIAL_BUSINESS_EMAIL.toUpperCase()}`}
          </span>
        </div>

        {gmailToken && !isBusinessGmailActive && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <strong>Different Google Account Connected:</strong> You are currently connected as{' '}
              <span className="font-mono font-semibold">{gmailSender}</span>. Click{' '}
              <strong>Switch to {OFFICIAL_BUSINESS_EMAIL}</strong> and choose your business Gmail account in the Google popup so all client emails are dispatched from <span className="font-mono font-semibold">{OFFICIAL_BUSINESS_EMAIL}</span>.
            </div>
            <button
              type="button"
              onClick={handleConnectGmail}
              disabled={signingInGoogle}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shrink-0"
            >
              Switch to {OFFICIAL_BUSINESS_EMAIL}
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center text-xs">
          <div className="space-y-1.5">
            <div className="font-semibold text-slate-800">
              Official Sender Account: <code className="bg-blue-50 text-blue-800 border border-blue-200 px-1.5 py-0.5 rounded font-mono text-[11px]">{OFFICIAL_BUSINESS_EMAIL}</code>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Clicking <strong>Sign in with Google</strong> opens the Google account selector pre-targeted to <strong>{OFFICIAL_BUSINESS_EMAIL}</strong>. Select that account to authorize client email dispatch.
            </p>
          </div>

          <div className="flex flex-wrap items-center sm:justify-end gap-2.5">
            <button
              type="button"
              onClick={handleConnectGmail}
              disabled={signingInGoogle}
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
                  {signingInGoogle
                    ? 'Connecting...'
                    : isBusinessGmailActive
                    ? 'Reconnect Business Gmail'
                    : 'Sign in with Google'}
                </span>
              </div>
            </button>
            {gmailToken && (
              <button
                type="button"
                onClick={handleDisconnectGmail}
                className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 font-medium text-xs"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>

        {googleAuthError && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{googleAuthError}</span>
          </div>
        )}

        {/* Firebase Authorized Domains Setup Helper */}
        <div className="p-3.5 rounded-lg bg-blue-50/70 border border-blue-200 text-xs text-blue-950 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="font-bold flex items-center gap-1.5 text-blue-900">
              <Shield className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Authorize Domain in Firebase Console ({FIREBASE_PROJECT_ID})</span>
            </div>
            <a
              href={FIREBASE_AUTH_SETTINGS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-semibold text-[11px] self-start sm:self-center shadow-2xs"
            >
              <span>Open Firebase Authorized Domains</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
          <p className="text-[11px] text-blue-900 leading-relaxed">
            To enable direct Google Sign-In (<code className="bg-white/80 px-1 rounded font-mono">auth/unauthorized-domain</code> fix) on GitHub Pages or your custom domain, open{' '}
            <strong>Firebase Console → Authentication → Settings → Authorized domains → Add domain</strong> and add:
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {Array.from(
              new Set([
                'amanpriv.github.io',
                typeof window !== 'undefined' && window.location.hostname
                  ? window.location.hostname
                  : 'amanpriv.github.io',
              ])
            ).map((domain) => (
              <button
                key={domain}
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(domain);
                  setCopiedDomain(domain);
                  setTimeout(() => setCopiedDomain(null), 2000);
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-blue-300 hover:bg-blue-50 font-mono text-[11px] font-semibold text-blue-900"
              >
                <span>{domain}</span>
                <span className="text-[10px] font-sans px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                  {copiedDomain === domain ? 'Copied!' : 'Copy'}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div>
            <div className="font-semibold text-slate-800">Test Gmail Dispatch</div>
            <p className="text-[11px] text-slate-500">
              Send a branded test email to verify Gmail API delivery and inspect the HTML template.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="email"
              value={testEmailTarget}
              onChange={(e) => setTestEmailTarget(e.target.value)}
              placeholder="recipient@example.com"
              className="w-48 px-2.5 py-1 text-xs border border-slate-300 rounded-md bg-white"
            />
            <button
              type="button"
              onClick={() => setShowTestEmailModal(true)}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md font-semibold text-xs transition-colors flex items-center gap-1.5"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Send Test Email</span>
            </button>
          </div>
        </div>
      </div>

      {/* 1. SMS Gateway & Multi-Provider Settings */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <Radio className="w-4 h-4 text-blue-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                SMS Gateway Configuration & Live Routing
              </h3>
              <p className="text-xs text-slate-500">
                Send real-time transactional & reminder SMS to Ethio Telecom (09...) and Safaricom (07...) recipients
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
            {settings?.sms.hasApiKey ? 'API KEY CONFIGURED' : 'API KEY MISSING'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Active SMS Provider *
            </label>
            <select
              value={smsProvider}
              onChange={(e) => {
                const prov = e.target.value as any;
                setSmsProvider(prov);
                if (prov === 'sms_et') {
                  setSmsEndpoint('https://smsethiopia.com/api/sms/send');
                } else if (prov === 'afro_message') {
                  setSmsEndpoint('https://api.afromessage.com/api/send');
                }
              }}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-medium bg-white text-slate-800"
            >
              <option value="sms_et">SMS Ethiopia Official API (smsethiopia.com)</option>
              <option value="afro_message">AfroMessage Telecom API (api.afromessage.com)</option>
              <option value="custom_webhook">Custom HTTP REST / Webhook Gateway</option>
            </select>
          </div>

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
              Sender ID (Leave blank for Default Campaign)
            </label>
            <input
              type="text"
              value={smsSenderId}
              onChange={(e) => setSmsSenderId(e.target.value)}
              placeholder="Default Sender ID (Leave blank until custom Sender ID is approved)"
              className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-medium placeholder-slate-400"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Leave blank to use SMS Ethiopia's <strong>Default Sender ID</strong> (required for Default Campaign).
            </p>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">
              {smsProvider === 'sms_et'
                ? 'SMS Ethiopia API Key (Default or Approved Campaign) *'
                : smsProvider === 'afro_message'
                ? 'AfroMessage Auth Token *'
                : 'Gateway API Key / Token'}
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={smsApiKey}
                onChange={(e) => setSmsApiKey(e.target.value)}
                placeholder={
                  settings?.sms.hasApiKey
                    ? `Current Key: ${settings?.sms.apiKeyMasked} (Enter new key to change)`
                    : 'Enter your SMS API key'
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
            <p className="text-[11px] text-slate-500 mt-1">
              {smsProvider === 'sms_et' && (
                <span>
                  Uses header <code className="bg-slate-100 px-1 rounded">KEY: &lt;your-api-key&gt;</code> on <code className="bg-slate-100 px-1 rounded">smsethiopia.com/api/sms/send</code>.
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Official SMS Ethiopia (Alet Support Team) Policy Notice */}
        <div className="p-3.5 rounded-lg bg-blue-50/70 border border-blue-200 text-xs text-blue-900 space-y-1.5">
          <div className="font-semibold flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-blue-600 shrink-0" />
            <span>SMS Ethiopia (Alet Support) — Default Campaign & Sender ID Rules</span>
          </div>
          <ul className="list-disc list-inside text-[11px] text-blue-800 space-y-1 leading-relaxed">
            <li>
              <strong>Unregistered Business (Default Campaign):</strong> You can send real SMS immediately through the <strong>Default Campaign</strong>. Leave the Sender ID field <strong>blank</strong> so the system uses SMS Ethiopia's <strong>Default Sender ID</strong>, and <strong>whitelist recipient phone numbers</strong> (<code className="bg-white/80 px-1 rounded font-mono">2519XXXXXXXX</code>) in your SMS Ethiopia dashboard before sending.
            </li>
            <li>
              <strong>Registered Business (Company & Sender ID Approval):</strong> Once your business registration documents are submitted to Alet Support and your company + custom Sender ID are approved, enter your approved Sender ID above to send without whitelisting.
            </li>
          </ul>
        </div>

        {/* Live Gateway Diagnostics Probe */}
        <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/80 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="font-semibold text-slate-800 text-xs flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-slate-600" />
                <span>Live Gateway Test & Diagnostics</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Send a real test probe to your configured provider to verify live network connectivity and carrier credentials.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={diagPhone}
                onChange={(e) => setDiagPhone(e.target.value)}
                placeholder="251911223344"
                className="w-36 px-2.5 py-1 text-xs font-mono border border-slate-300 rounded-md bg-white"
              />
              <button
                type="button"
                onClick={handleTestGateway}
                disabled={diagLoading}
                className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-md font-semibold text-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {diagLoading ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                <span>{diagLoading ? 'Testing...' : 'Test Connection'}</span>
              </button>
            </div>
          </div>

          {diagResult && (
            <div
              className={`p-3 rounded-lg text-xs space-y-1.5 ${
                diagResult.success
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                  : diagResult.diagnosticStatus === 'starter_campaign_restricted'
                  ? 'bg-amber-50 border border-amber-200 text-amber-900'
                  : 'bg-rose-50 border border-rose-200 text-rose-900'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="font-bold flex items-center gap-1.5">
                  {diagResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  )}
                  <span>
                    Gateway Response: HTTP {diagResult.httpStatus || 0} ({diagResult.latencyMs || 0}ms)
                  </span>
                </div>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-white/70 border">
                  Target: {diagResult.testedRecipient || diagPhone}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed font-medium">
                {diagResult.recommendation}
              </p>
              {diagResult.rawResponse && (
                <pre className="text-[10px] p-2 rounded bg-black/5 font-mono overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(diagResult.rawResponse, null, 2)}
                </pre>
              )}
            </div>
          )}
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
              min={1}
              step="any"
              value={inactivityTimeout}
              onChange={(e) => setInactivityTimeout(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono"
            />
          </div>
        </div>

        {/* Banking & Payment Settlement Details (Applied to Quotes, Invoices & Reports) */}
        <div className="pt-4 border-t border-slate-200 space-y-3">
          <div>
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Banking & Payment Settlement Details (Applied to Quotes, Invoices & Reports)
            </h4>
            <p className="text-[11px] text-slate-500">
              These banking details and the Company Profile above are automatically embedded on all system-generated Quotations, Tax Invoices, and Executive Reports.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Primary Bank Name *
              </label>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="Commercial Bank of Ethiopia (CBE)"
                className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-semibold"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Bank Account Holder Name *
              </label>
              <input
                type="text"
                value={bankAccountName}
                onChange={(e) => setBankAccountName(e.target.value)}
                placeholder="NexGrid Digital Systems"
                className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-semibold"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Bank Account Number *
              </label>
              <input
                type="text"
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
                placeholder="1000234567890"
                className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono font-bold text-blue-700"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Telebirr / Mobile Money Number
              </label>
              <input
                type="text"
                value={telebirrNumber}
                onChange={(e) => setTelebirrNumber(e.target.value)}
                placeholder="+251 906697634"
                className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-medium text-slate-700 mb-1">
                Additional Banking / Payment Instructions (Optional)
              </label>
              <input
                type="text"
                value={secondaryBankDetails}
                onChange={(e) => setSecondaryBankDetails(e.target.value)}
                placeholder="e.g., Bank of Abyssinia / Awash Bank / Telebirr (+251 906697634)"
                className="w-full px-3 py-1.5 border border-slate-300 rounded-md"
              />
            </div>
          </div>

          <div className="pt-2">
            <PaymentQrCode
              settings={{
                businessName,
                businessContact: businessPhone,
                businessPhone,
                businessEmail,
                businessAddress,
                tinNumber,
                currency,
                timezone: 'Africa/Addis_Ababa',
                inactivityTimeoutMinutes: Number(inactivityTimeout) || 60,
                bankName,
                bankAccountName,
                bankAccountNumber,
                telebirrNumber,
                secondaryBankDetails,
              }}
              context={{
                documentType: 'BANKING_PROFILE',
              }}
              size={84}
              compact
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

      {/* Test Email Confirmation Modal */}
      <EmailConfirmationModal
        isOpen={showTestEmailModal}
        onClose={() => setShowTestEmailModal(false)}
        mode="single"
        initialRecipientEmail={testEmailTarget}
        recipientName="NexGrid Administrator"
        initialSubject="NexGrid Digital Systems — Gmail API Verification"
        initialBody={`Hello,\n\nThis is a live verification email dispatched from the NexGrid Digital Systems Customer Management Portal using the Google Workspace Gmail API.\n\nCompany Profile:\n- Business: ${businessName}\n- TIN: ${tinNumber}\n- Support Phone: ${businessPhone}\n- Primary Bank: ${bankName} (${bankAccountNumber})\n\nBest regards,\nNexGrid Digital Systems`}
        messageType="custom"
        title="Confirm Test Email Dispatch"
      />
    </div>
  );
};
