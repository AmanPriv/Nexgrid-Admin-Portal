import React, { useState, useEffect } from 'react';
import {
  Shield,
  Lock,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  QrCode,
  Copy,
  Download,
  Smartphone,
  RefreshCw,
  ShieldCheck,
  Check,
  Clock,
} from 'lucide-react';
import { api } from '../services/api.ts';
import { AdminUser } from '../types.ts';

interface LoginViewProps {
  onLoginSuccess: (admin: AdminUser, timeoutMinutes: number) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  // Mode: checking status, setup wizard, or standard login
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [systemSetupSecret, setSystemSetupSecret] = useState<string | null>(null);

  // Standard Login State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rate Limiting Throttled State
  const [lockoutSeconds, setLockoutSeconds] = useState<number | null>(null);

  // MFA Challenge State during Login
  const [mfaChallenge, setMfaChallenge] = useState<{
    mfaToken: string;
    username: string;
    isRecoveryMode: boolean;
  } | null>(null);
  const [totpInput, setTotpInput] = useState('');
  const [recoveryCodeInput, setRecoveryCodeInput] = useState('');

  // Setup Wizard State
  const [setupStep, setSetupStep] = useState<1 | 2>(1);
  const [setupForm, setSetupForm] = useState({
    setupSecret: '',
    username: '',
    email: '',
    fullName: '',
    password: '',
    confirmPassword: '',
  });
  const [showSetupPassword, setShowSetupPassword] = useState(false);
  const [mfaEnrollmentData, setMfaEnrollmentData] = useState<{
    secret: string;
    qrCodeSvg: string;
    recoveryCodes: string[];
    hashedCodes: string[];
  } | null>(null);
  const [setupTotpCode, setSetupTotpCode] = useState('');
  const [recoveryCodesConfirmed, setRecoveryCodesConfirmed] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);

  // Forgot password flow
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetStep, setResetStep] = useState<'request' | 'verify'>('request');
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  // Check setup status on mount
  useEffect(() => {
    checkStatus();
  }, []);

  // Lockout countdown timer
  useEffect(() => {
    if (!lockoutSeconds || lockoutSeconds <= 0) return;
    const interval = setInterval(() => {
      setLockoutSeconds((prev) => (prev && prev > 1 ? prev - 1 : null));
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutSeconds]);

  const checkStatus = async () => {
    setCheckingSetup(true);
    try {
      const res = await api.getSetupStatus();
      setSetupRequired(res.setupRequired);
      if (res.setupRequired && res.setupSecret) {
        setSystemSetupSecret(res.setupSecret);
        setSetupForm((prev) => ({ ...prev, setupSecret: res.setupSecret || '' }));
      }
    } catch (err: any) {
      console.error('Error checking setup status:', err);
    } finally {
      setCheckingSetup(false);
    }
  };

  // Password Strength Calculation (OWASP)
  const calculatePasswordStrength = (pw: string) => {
    const minLength = pw.length >= 12;
    const hasLower = /[a-z]/.test(pw);
    const hasUpper = /[A-Z]/.test(pw);
    const hasDigit = /[0-9]/.test(pw);
    const hasSpecial = /[^a-zA-Z0-9]/.test(pw);
    const categoriesCount = [hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length;
    const isValid = minLength && categoriesCount >= 3;

    return {
      minLength,
      hasLower,
      hasUpper,
      hasDigit,
      hasSpecial,
      categoriesCount,
      isValid,
    };
  };

  // Standard Login Submit
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutSeconds && lockoutSeconds > 0) return;
    setError(null);
    setLoading(true);

    try {
      const res = await api.login(username, password);
      if (res.mfaRequired && res.mfaToken) {
        setMfaChallenge({
          mfaToken: res.mfaToken,
          username: res.username || username,
          isRecoveryMode: false,
        });
        setTotpInput('');
        return;
      }

      if (res.token && res.admin) {
        onLoginSuccess(res.admin, res.timeoutMinutes || 60);
      }
    } catch (err: any) {
      if (err.status === 429 && err.retryAfterSeconds) {
        setLockoutSeconds(err.retryAfterSeconds);
      }
      setError(err.message || 'Login failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  // MFA Challenge Submit
  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaChallenge) return;
    setError(null);
    setLoading(true);

    const isRecovery = mfaChallenge.isRecoveryMode;
    const code = isRecovery ? recoveryCodeInput.trim() : totpInput.trim();

    try {
      const res = await api.verifyMfa({
        mfaToken: mfaChallenge.mfaToken,
        code,
        isRecoveryCode: isRecovery,
      });

      onLoginSuccess(res.admin, res.timeoutMinutes || 60);
    } catch (err: any) {
      if (err.status === 429 && err.retryAfterSeconds) {
        setLockoutSeconds(err.retryAfterSeconds);
      }
      setError(err.message || 'Verification failed. Please check code and retry.');
    } finally {
      setLoading(false);
    }
  };

  // Setup Wizard: Step 1 -> Step 2
  const handleInitiateSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const strength = calculatePasswordStrength(setupForm.password);
    if (!strength.isValid) {
      setError('Password must be at least 12 characters and contain uppercase, lowercase, numbers, and symbols.');
      return;
    }

    if (setupForm.password !== setupForm.confirmPassword) {
      setError('Password confirmation does not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.initiateSetup(setupForm.setupSecret);
      setMfaEnrollmentData(res.mfa);
      setSetupStep(2);
    } catch (err: any) {
      setError(err.message || 'Failed to validate setup secret. Please inspect server configuration.');
    } finally {
      setLoading(false);
    }
  };

  // Setup Wizard: Step 2 Complete
  const handleCompleteSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaEnrollmentData) return;
    if (!recoveryCodesConfirmed) {
      setError('You must confirm that you have securely saved your emergency recovery codes.');
      return;
    }
    if (!setupTotpCode || setupTotpCode.length < 6) {
      setError('Please enter the 6-digit code from your authenticator app.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await api.completeSetup({
        setupSecret: setupForm.setupSecret,
        username: setupForm.username,
        email: setupForm.email,
        fullName: setupForm.fullName,
        password: setupForm.password,
        mfaSecret: mfaEnrollmentData.secret,
        hashedCodes: mfaEnrollmentData.hashedCodes,
        totpCode: setupTotpCode.trim(),
      });

      onLoginSuccess(res.admin, res.timeoutMinutes);
    } catch (err: any) {
      setError(err.message || 'Failed to activate administrator account. Verify your 6-digit authenticator code.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, isSecret = false) => {
    navigator.clipboard.writeText(text);
    if (isSecret) {
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    } else {
      setCopiedCodes(true);
      setTimeout(() => setCopiedCodes(false), 2000);
    }
  };

  const downloadRecoveryCodes = () => {
    if (!mfaEnrollmentData) return;
    const content = `NEXGRID DIGITAL SYSTEMS — EMERGENCY MFA RECOVERY CODES\nGenerated: ${new Date().toISOString()}\nAdministrator: ${setupForm.username} (${setupForm.email})\n\nEach code can be used ONCE if you lose access to your authenticator app:\n\n${mfaEnrollmentData.recoveryCodes.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\nKeep this document in a safe, secure offline location.`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexgrid-recovery-codes-${setupForm.username}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Password reset handlers
  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    setResetMessage(null);
    setLoading(true);

    try {
      const res = await api.requestPasswordReset(resetEmail);
      if (res.verificationCode) {
        setResetCode(res.verificationCode);
        setResetMessage(`Verification code generated: ${res.verificationCode}. Enter it below with your new password.`);
      } else {
        setResetMessage(res.message);
      }
      setResetStep('verify');
    } catch (err: any) {
      setResetError(err.message || 'Failed to request reset verification.');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    setResetMessage(null);

    const strength = calculatePasswordStrength(newPassword);
    if (!strength.isValid) {
      setResetError('Password must be at least 12 characters and contain uppercase, lowercase, numbers, and symbols.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.resetPassword(resetEmail, resetCode, newPassword);
      setResetMessage(res.message);
      setTimeout(() => {
        setShowResetModal(false);
        setPassword(newPassword);
        setResetStep('request');
        setResetMessage(null);
      }, 1500);
    } catch (err: any) {
      setResetError(err.message || 'Failed to reset password.');
    } finally {
      setLoading(false);
    }
  };

  const pwStrength = calculatePasswordStrength(setupForm.password);

  if (checkingSetup) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4">
        <div className="flex items-center gap-3 text-slate-400 text-sm">
          <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
          <span>Validating system security state...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 selection:bg-blue-600 selection:text-white">
      {/* Background ambient lighting */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950 pointer-events-none" />

      <div className="relative w-full max-w-lg z-10">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-700 to-indigo-600 text-white shadow-xl shadow-blue-900/40 mb-3 ring-1 ring-blue-500/30">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            NexGrid Digital Systems
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Customer Management System • Internal Administrative Portal
          </p>
        </div>

        {/* =========================================================================
            SCENARIO 1: FIRST-TIME ADMINISTRATOR SETUP WIZARD (0 ADMINS IN SYSTEM)
           ========================================================================= */}
        {setupRequired ? (
          <div className="bg-slate-900/95 backdrop-blur-md rounded-2xl border border-blue-900/40 p-6 sm:p-8 shadow-2xl shadow-black/80">
            <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-800">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-[10px] font-semibold text-amber-400 mb-1">
                  Initial Provisioning
                </div>
                <h2 className="text-base font-bold text-white">
                  {setupStep === 1 ? 'First-Administrator Setup' : 'Mandatory MFA Enrollment'}
                </h2>
                <p className="text-xs text-slate-400">
                  {setupStep === 1
                    ? 'All prior data has been reset. Configure your master credentials.'
                    : 'Configure your authenticator app to complete setup.'}
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono font-bold text-blue-400">
                  Step {setupStep} of 2
                </span>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-rose-950/70 border border-rose-800/80 flex items-start gap-2.5 text-xs text-rose-200">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {setupStep === 1 ? (
              /* STEP 1: CREDENTIALS & SETUP SECRET */
              <form onSubmit={handleInitiateSetup} className="space-y-4">
                {/* One-Time Machine Setup Secret Notice */}
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-medium flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                      One-Time Machine Setup Secret
                    </span>
                    {systemSetupSecret && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 font-mono">
                        Server Key Detected
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    value={setupForm.setupSecret}
                    onChange={(e) => setSetupForm({ ...setupForm, setupSecret: e.target.value })}
                    placeholder="Enter one-time machine setup secret"
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <p className="text-[11px] text-slate-500">
                    Required cryptographic token generated by the server. Consumed permanently upon account creation.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Administrator Username *
                    </label>
                    <input
                      type="text"
                      required
                      value={setupForm.username}
                      onChange={(e) => setSetupForm({ ...setupForm, username: e.target.value })}
                      placeholder="e.g. sysadmin"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={setupForm.fullName}
                      onChange={(e) => setSetupForm({ ...setupForm, fullName: e.target.value })}
                      placeholder="e.g. Amanuel Getahun"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Official Administrator Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={setupForm.email}
                    onChange={(e) => setSetupForm({ ...setupForm, email: e.target.value })}
                    placeholder="admin@nexgrid.et"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-slate-300">
                      Master Password (OWASP Standard) *
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowSetupPassword(!showSetupPassword)}
                      className="text-slate-400 hover:text-slate-200 text-xs flex items-center gap-1"
                    >
                      {showSetupPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span className="text-[11px]">{showSetupPassword ? 'Hide' : 'Show'}</span>
                    </button>
                  </div>
                  <input
                    type={showSetupPassword ? 'text' : 'password'}
                    required
                    value={setupForm.password}
                    onChange={(e) => setSetupForm({ ...setupForm, password: e.target.value })}
                    placeholder="Min 12 characters with mixed complexity"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />

                  {/* Password strength checklist */}
                  {setupForm.password.length > 0 && (
                    <div className="mt-2 p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 text-[11px] space-y-1">
                      <div className="font-semibold text-slate-300 mb-1">Password Requirements:</div>
                      <div className="grid grid-cols-2 gap-1">
                        <span className={pwStrength.minLength ? 'text-emerald-400' : 'text-slate-500'}>
                          {pwStrength.minLength ? '✓' : '○'} At least 12 characters
                        </span>
                        <span className={pwStrength.hasUpper ? 'text-emerald-400' : 'text-slate-500'}>
                          {pwStrength.hasUpper ? '✓' : '○'} Uppercase letter
                        </span>
                        <span className={pwStrength.hasLower ? 'text-emerald-400' : 'text-slate-500'}>
                          {pwStrength.hasLower ? '✓' : '○'} Lowercase letter
                        </span>
                        <span className={pwStrength.hasDigit ? 'text-emerald-400' : 'text-slate-500'}>
                          {pwStrength.hasDigit ? '✓' : '○'} Number (0-9)
                        </span>
                        <span className={pwStrength.hasSpecial ? 'text-emerald-400' : 'text-slate-500'}>
                          {pwStrength.hasSpecial ? '✓' : '○'} Special symbol
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Confirm Password *
                  </label>
                  <input
                    type={showSetupPassword ? 'text' : 'password'}
                    required
                    value={setupForm.confirmPassword}
                    onChange={(e) => setSetupForm({ ...setupForm, confirmPassword: e.target.value })}
                    placeholder="Re-enter password to verify"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !pwStrength.isValid}
                  className="w-full mt-2 py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-blue-900/40 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span>Proceed to MFA Enrollment</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            ) : (
              /* STEP 2: TOTP QR CODE & EMERGENCY RECOVERY CODES */
              <form onSubmit={handleCompleteSetup} className="space-y-4">
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-white">
                    <Smartphone className="w-4 h-4 text-blue-400" />
                    <span>Scan with Google Authenticator or Microsoft Authenticator</span>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-4 bg-white p-3 rounded-lg text-slate-900">
                    {mfaEnrollmentData?.qrCodeSvg && (
                      <div
                        className="w-32 h-32 shrink-0 bg-white"
                        dangerouslySetInnerHTML={{ __html: decodeURIComponent(mfaEnrollmentData.qrCodeSvg.replace('data:image/svg+xml;utf8,', '')) }}
                      />
                    )}
                    <div className="text-xs space-y-1.5 w-full">
                      <div className="font-bold text-slate-900">Can't scan the QR code?</div>
                      <p className="text-[11px] text-slate-600">
                        Manually enter this Base32 secret into your authenticator app:
                      </p>
                      <div className="flex items-center gap-1.5 p-1.5 rounded bg-slate-100 border border-slate-300 font-mono text-[11px] text-slate-800 break-all">
                        <span className="flex-1">{mfaEnrollmentData?.secret}</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(mfaEnrollmentData?.secret || '', true)}
                          className="p-1 hover:bg-slate-200 rounded text-slate-600 shrink-0"
                          title="Copy secret"
                        >
                          {copiedSecret ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Emergency Recovery Codes */}
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5" />
                      Single-Use Recovery Codes (Save These Now)
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(mfaEnrollmentData?.recoveryCodes.join('\n') || '')}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 flex items-center gap-1"
                      >
                        {copiedCodes ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedCodes ? 'Copied' : 'Copy'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={downloadRecoveryCodes}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" />
                        <span>Download</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 font-mono text-[11px] text-slate-300 bg-slate-900 p-2 rounded-lg border border-slate-800">
                    {mfaEnrollmentData?.recoveryCodes.map((code, idx) => (
                      <div key={idx} className="bg-slate-950 px-2 py-1 rounded text-center border border-slate-800/60">
                        {code}
                      </div>
                    ))}
                  </div>

                  <label className="flex items-start gap-2 pt-1 text-[11px] text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={recoveryCodesConfirmed}
                      onChange={(e) => setRecoveryCodesConfirmed(e.target.checked)}
                      className="mt-0.5 rounded text-blue-600 bg-slate-900 border-slate-700"
                    />
                    <span>
                      I have securely saved these emergency recovery codes. I understand that losing access to my authenticator device and recovery codes will permanently lock this portal.
                    </span>
                  </label>
                </div>

                {/* 6-digit TOTP Verification */}
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    Enter 6-Digit Code From Authenticator App *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={setupTotpCode}
                    onChange={(e) => setSetupTotpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="w-full tracking-widest text-center text-lg font-mono py-2 bg-slate-950 border border-blue-500/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setSetupStep(1)}
                    disabled={loading}
                    className="w-1/3 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !recoveryCodesConfirmed || setupTotpCode.length < 6}
                    className="w-2/3 py-2 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-emerald-900/40 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {loading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Activate & Sign In</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          /* =========================================================================
              SCENARIO 2: STANDARD ADMINISTRATOR LOGIN / MFA CHALLENGE
             ========================================================================= */
          <div className="bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-800 p-6 sm:p-8 shadow-2xl shadow-black/60">
            {mfaChallenge ? (
              /* MFA 2ND STEP CHALLENGE */
              <form onSubmit={handleMfaSubmit} className="space-y-4">
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
                  <div>
                    <h2 className="text-base font-semibold text-white">Two-Factor Authentication</h2>
                    <p className="text-xs text-slate-400">
                      Verifying session for <span className="text-blue-400 font-mono font-medium">{mfaChallenge.username}</span>
                    </p>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-blue-950 border border-blue-800 flex items-center justify-center text-blue-400">
                    <Smartphone className="w-4 h-4" />
                  </div>
                </div>

                {error && (
                  <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800/60 flex items-start gap-2.5 text-xs text-rose-200">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {lockoutSeconds && lockoutSeconds > 0 && (
                  <div className="p-3 rounded-lg bg-amber-950/60 border border-amber-800/60 text-xs text-amber-200 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Security lockout active. Please wait {lockoutSeconds}s.</span>
                  </div>
                )}

                {!mfaChallenge.isRecoveryMode ? (
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      6-Digit Authenticator Code
                    </label>
                    <input
                      type="text"
                      autoFocus
                      required
                      maxLength={6}
                      value={totpInput}
                      onChange={(e) => setTotpInput(e.target.value.replace(/\D/g, ''))}
                      placeholder="000000"
                      className="w-full text-center tracking-widest text-xl font-mono py-2.5 bg-slate-950 border border-blue-500/50 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="mt-2 flex justify-between text-xs">
                      <button
                        type="button"
                        onClick={() =>
                          setMfaChallenge({ ...mfaChallenge, isRecoveryMode: true })
                        }
                        className="text-blue-400 hover:text-blue-300 text-[11px]"
                      >
                        Lost phone? Use single-use recovery code
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Emergency Recovery Code
                    </label>
                    <input
                      type="text"
                      autoFocus
                      required
                      value={recoveryCodeInput}
                      onChange={(e) => setRecoveryCodeInput(e.target.value.toUpperCase())}
                      placeholder="XXXXX-XXXXX"
                      className="w-full text-center tracking-wider text-base font-mono py-2 bg-slate-950 border border-amber-500/50 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <div className="mt-2 flex justify-between text-xs">
                      <button
                        type="button"
                        onClick={() =>
                          setMfaChallenge({ ...mfaChallenge, isRecoveryMode: false })
                        }
                        className="text-blue-400 hover:text-blue-300 text-[11px]"
                      >
                        Use 6-digit authenticator code instead
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMfaChallenge(null);
                      setError(null);
                    }}
                    className="w-1/3 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading || (lockoutSeconds !== null && lockoutSeconds > 0)}
                    className="w-2/3 py-2 px-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-blue-900/40 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {loading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Verify & Enter Portal</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              /* PRIMARY LOGIN FORM */
              <>
                <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-800">
                  <div>
                    <h2 className="text-base font-semibold text-white">Administrator Access</h2>
                    <p className="text-xs text-slate-400">Enter authenticated credentials to proceed</p>
                  </div>
                  <div className="px-2 py-1 rounded bg-blue-950/60 border border-blue-800/50 text-[10px] text-blue-300 font-mono font-medium">
                    Scrypt / MFA / CSRF
                  </div>
                </div>

                {error && (
                  <div className="mb-5 p-3 rounded-lg bg-rose-950/60 border border-rose-800/60 flex items-start gap-2.5 text-xs text-rose-200">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {lockoutSeconds && lockoutSeconds > 0 && (
                  <div className="mb-5 p-3 rounded-lg bg-amber-950/60 border border-amber-800/60 text-xs text-amber-200 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Rate limit active. Please wait {lockoutSeconds} seconds before trying again.</span>
                  </div>
                )}

                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Username or Work Email
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                        <User className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        required
                        autoComplete="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Enter administrator username"
                        className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-medium text-slate-300">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowResetModal(true)}
                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter master password"
                        className="w-full pl-9 pr-10 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || (lockoutSeconds !== null && lockoutSeconds > 0)}
                    className="w-full mt-2 py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-blue-900/40 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {loading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <span>Authenticate</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              </>
            )}
          </div>
        )}

        {/* Security & System Architecture Footer */}
        <div className="mt-8 text-center text-[11px] text-slate-500 space-y-1">
          <p>© {new Date().getFullYear()} NexGrid Digital Systems. All rights reserved.</p>
          <p className="flex items-center justify-center gap-2 text-slate-600">
            <span>OWASP Scrypt</span>
            <span>•</span>
            <span>RFC 6238 TOTP</span>
            <span>•</span>
            <span>Anti-CSRF Tokens</span>
            <span>•</span>
            <span>Rate-Limited</span>
          </p>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl text-xs">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-blue-400" />
                <h3 className="font-semibold text-white">Administrator Password Recovery</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {resetError && (
              <div className="mb-4 p-2.5 rounded bg-rose-950/60 border border-rose-800 text-rose-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{resetError}</span>
              </div>
            )}

            {resetMessage && (
              <div className="mb-4 p-2.5 rounded bg-emerald-950/60 border border-emerald-800 text-emerald-300 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>{resetMessage}</span>
              </div>
            )}

            {resetStep === 'request' ? (
              <form onSubmit={handleRequestReset} className="space-y-3">
                <p className="text-slate-400">
                  Enter your registered administrator email address to generate an emergency verification code.
                </p>
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Administrator Email</label>
                  <input
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="admin@nexgrid.et"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowResetModal(false)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50"
                  >
                    {loading ? 'Verifying...' : 'Request Code'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleCompleteReset} className="space-y-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Verification Code</label>
                  <input
                    type="text"
                    required
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    placeholder="Enter verification code"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">New Password (OWASP: min 12 chars)</label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new master password"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setResetStep('request')}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50"
                  >
                    {loading ? 'Updating...' : 'Set New Password'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
