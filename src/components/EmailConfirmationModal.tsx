import React, { useState, useEffect } from 'react';
import {
  Mail,
  Send,
  X,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Users,
  RotateCw,
} from 'lucide-react';
import {
  getAccessToken,
  getConnectedGmailEmail,
  googleSignIn,
  subscribeWorkspaceAuth,
} from '../firebase.ts';
import {
  sendGmailMessage,
  sendBulkGmailMessages,
  type BulkEmailRecipient,
} from '../services/gmailService.ts';

export interface EmailConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  mode?: 'single' | 'bulk';
  initialRecipientEmail?: string;
  recipientName?: string;
  customerId?: string;
  domainId?: string;
  bulkRecipients?: BulkEmailRecipient[];
  initialSubject: string;
  initialBody: string;
  messageType?: 'welcome' | 'domain_reminder' | 'payment_confirmation' | 'invoice_reminder' | 'test' | 'custom';
  title?: string;
}

export const EmailConfirmationModal: React.FC<EmailConfirmationModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  mode = 'single',
  initialRecipientEmail = '',
  recipientName = '',
  customerId,
  domainId,
  bulkRecipients = [],
  initialSubject,
  initialBody,
  messageType = 'custom',
  title = 'Confirm & Send Email via Gmail',
}) => {
  const [recipientEmail, setRecipientEmail] = useState(initialRecipientEmail);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [hasToken, setHasToken] = useState<boolean>(false);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    success: boolean;
    summary: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setRecipientEmail(initialRecipientEmail);
      setSubject(initialSubject);
      setBody(initialBody);
      setError(null);
      setResult(null);
      getAccessToken().then((tok) => {
        setHasToken(Boolean(tok));
        setConnectedEmail(getConnectedGmailEmail());
      });
    }
  }, [isOpen, initialRecipientEmail, initialSubject, initialBody]);

  useEffect(() => {
    const unsub = subscribeWorkspaceAuth((token, email) => {
      setHasToken(Boolean(token));
      setConnectedEmail(email);
    });
    return unsub;
  }, []);

  if (!isOpen) return null;

  const handleGoogleAuthorize = async () => {
    setSigningIn(true);
    setError(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setHasToken(true);
        setConnectedEmail(res.user.email || null);
      }
    } catch (err: any) {
      setError(err.message || 'Google sign-in was cancelled or failed.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleConfirmSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!hasToken) {
      setError('Please click "Sign in with Google" above to authorize Gmail before sending.');
      return;
    }

    setSending(true);
    try {
      if (mode === 'bulk') {
        if (bulkRecipients.length === 0) {
          throw new Error('No recipients with registered email addresses found.');
        }
        const bulkRes = await sendBulkGmailMessages({
          recipients: bulkRecipients,
          subject,
          bodyTemplate: body,
          messageType,
        });

        if (bulkRes.sent > 0) {
          setResult({
            success: bulkRes.failed === 0,
            summary: `Dispatched ${bulkRes.sent} of ${bulkRes.total} email(s) via Gmail API.${
              bulkRes.failed > 0 ? ` (${bulkRes.failed} failed)` : ''
            }`,
          });
          if (onSuccess) onSuccess();
        } else {
          setError(bulkRes.results[0]?.error || 'Failed to send bulk emails via Gmail API.');
        }
      } else {
        if (!recipientEmail.trim() || !recipientEmail.includes('@')) {
          throw new Error('Please enter a valid recipient email address.');
        }
        const singleRes = await sendGmailMessage({
          to: recipientEmail.trim(),
          subject,
          body,
          customerId,
          customerName: recipientName,
          messageType,
          domainId,
        });

        if (singleRes.success) {
          setResult({
            success: true,
            summary: `Email successfully sent to ${recipientEmail.trim()} (Gmail ID: ${singleRes.messageId}).`,
          });
          if (onSuccess) onSuccess();
        } else {
          setError(singleRes.error || 'Failed to send email via Gmail API.');
        }
      }
    } catch (err: any) {
      if (err.code === 'NEEDS_GOOGLE_AUTH') {
        setHasToken(false);
      }
      setError(err.message || 'Failed to send email.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
        {/* Header */}
        <div className="p-4 sm:px-6 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">{title}</h3>
              <p className="text-[11px] text-slate-500">
                Review recipient, subject, and message content before confirming Gmail dispatch
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleConfirmSend} className="p-5 overflow-y-auto flex-1 space-y-4 text-xs">
          {/* Google Workspace Connection Bar */}
          <div
            className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              hasToken
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                : 'bg-amber-50 border-amber-300 text-amber-950'
            }`}
          >
            <div className="space-y-0.5">
              <div className="font-bold flex items-center gap-1.5 text-xs">
                {hasToken ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Gmail API Connected</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Google Workspace Authorization Required</span>
                  </>
                )}
              </div>
              <p className="text-[11px] opacity-90">
                {hasToken
                  ? `Sending on behalf of ${connectedEmail || 'your authenticated Google account'}`
                  : 'Sign in with Google to grant permission to send this email from your Gmail account.'}
              </p>
            </div>

            {!hasToken ? (
              <button
                type="button"
                onClick={handleGoogleAuthorize}
                disabled={signingIn}
                className="gsi-material-button shrink-0"
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
                    {signingIn ? 'Connecting...' : 'Sign in with Google'}
                  </span>
                  <span style={{ display: 'none' }}>Sign in with Google</span>
                </div>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleGoogleAuthorize}
                disabled={signingIn}
                className="px-2.5 py-1 rounded-md border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-800 font-semibold text-[11px] shrink-0"
              >
                Switch Account
              </button>
            )}
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold">Email Dispatch Complete</div>
                <div className="text-[11px]">{result.summary}</div>
              </div>
            </div>
          )}

          {/* Recipient Details */}
          {mode === 'single' ? (
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Recipient Email Address {recipientName ? `(${recipientName})` : ''} *
              </label>
              <input
                type="email"
                required
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="client@company.com"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-blue-600" />
                  <span>Bulk Email Recipients ({bulkRecipients.length} Registered Clients)</span>
                </span>
              </div>
              <div className="max-h-24 overflow-y-auto flex flex-wrap gap-1.5 pt-1">
                {bulkRecipients.map((r, idx) => (
                  <span
                    key={`${r.email}-${idx}`}
                    className="px-2 py-0.5 rounded bg-white border border-slate-200 text-[11px] font-mono text-slate-700"
                  >
                    {r.customerName ? `${r.customerName} <${r.email}>` : r.email}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Subject */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Email Subject *</label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-medium text-slate-900 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Email Message Content (Branded HTML + Plain Text) *
            </label>
            <textarea
              rows={8}
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-800 text-[11px] leading-relaxed focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* Mandatory Confirmation Notice */}
          <div className="p-3 rounded-lg bg-blue-50/70 border border-blue-200 text-[11px] text-blue-900 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <strong>Confirmation Required:</strong> By clicking{' '}
              <strong>Confirm &amp; Send Email</strong>, you authorize NexGrid Digital Systems to
              send {mode === 'bulk' ? `${bulkRecipients.length} email(s)` : `this email to ${recipientEmail || 'the recipient'}`}{' '}
              on your behalf using the Gmail API.
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold"
            >
              {result?.success ? 'Done' : 'Cancel'}
            </button>
            {!result?.success && (
              <button
                type="submit"
                disabled={sending || !hasToken}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-2xs disabled:opacity-50 transition-colors"
              >
                {sending ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Sending via Gmail...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>
                      {mode === 'bulk'
                        ? `Confirm & Send ${bulkRecipients.length} Email(s)`
                        : 'Confirm & Send Email'}
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
