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
  Copy,
  Download,
  Smartphone,
  RefreshCw,
  ShieldCheck,
  Check,
  Clock,
  Server,
  Globe,
  UserPlus,
  Mail,
} from 'lucide-react';
import { api, getApiBase, setCustomApiUrl } from '../services/api.ts';
import { pullCloudDatabaseState } from '../services/cloudSyncEngine.ts';
import { AdminUser } from '../types.ts';

interface LoginViewProps {
  onLoginSuccess: (admin: AdminUser, timeoutMinutes: number) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);

  // Standard Login State (strictly empty — no prefilled demo credentials)
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

  // One-Time Primary Administrator Signup State
  const [setupStep, setSetupStep] = useState<1 | 2>(1);
  const [enableMfaOnSignup, setEnableMfaOnSignup] = useState(false);
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
  const [apiConnectionError, setApiConnectionError] = useState<string | null>(null);

  // External API URL configuration
  const [customApiUrl, setCustomApiUrlState] = useState(() => getApiBase());
  const [showApiConfig, setShowApiConfig] = useState(false);
  const [apiSaveSuccess, setApiSaveSuccess] = useState(false);

  const handleSaveApiUrl = (e: React.FormEvent) => {
    e.preventDefault();
    setCustomApiUrl(customApiUrl);
    setApiSaveSuccess(true);
    setTimeout(() => setApiSaveSuccess(false), 2000);
    checkStatus();
  };

  const handleResetApiUrl = () => {
    setCustomApiUrl(null);
    setCustomApiUrlState('');
    setShowApiConfig(false);
    checkStatus();
  };

  useEffect(() => {
    checkStatus();
  }, []);

  useEffect(() => {
    if (!lockoutSeconds || lockoutSeconds <= 0) return;
    const interval = setInterval(() => {
      setLockoutSeconds((prev) => (prev && prev > 1 ? prev - 1 : null));
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutSeconds]);

  const checkStatus = async () => {
    setCheckingSetup(true);
    setApiConnectionError(null);
    try {
      await pullCloudDatabaseState().catch(() => {});
      const res = await api.getSetupStatus();
      setSetupRequired(res.setupRequired);
      if (res.setupRequired && res.setupSecret) {
        setSetupForm((prev) => ({ ...prev, setupSecret: res.setupSecret || '' }));
      }
    } catch (err: any) {
      console.error('Error checking setup status:', err);
      setApiConnectionError(
        err.message || 'Cannot connect to backend server. Make sure the Node.js server is running.'
      );
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
      let res: any;
      try {
        res = await api.login(username, password);
      } catch {
        // Pull latest cloud state in case user account or password was just created/updated on another device
        await pullCloudDatabaseState().catch(() => {});
        res = await api.login(username, password);
      }
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
        await pullCloudDatabaseState().catch(() => {});
        onLoginSuccess(res.admin, res.timeoutMinutes || 60);
      }
    } catch (err: any) {
      if (err.status === 429 && err.retryAfterSeconds) {
        setLockoutSeconds(err.retryAfterSeconds);
      }
      setError(err.message || 'Login failed. Please verify your username and password.');
    } finally {
      setLoading(false);
    }
  };

  // Firebase Google Auth Login / Primary Admin Link
  const handleFirebaseGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.loginWithFirebaseGoogle();
      if (res.token && res.admin) {
        onLoginSuccess(res.admin, res.timeoutMinutes || 60);
      }
    } catch (err: any) {
      setError(err.message || 'Google Sign-In failed. You can also sign in with your username and password.');
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

  // One-Time Primary Administrator Registration Submit
  const handlePrimarySignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const strength = calculatePasswordStrength(setupForm.password);
    if (!strength.isValid) {
      setError('Password must be at least 12 characters and include at least 3 of: uppercase, lowercase, numbers, and special symbols.');
      return;
    }

    if (setupForm.password !== setupForm.confirmPassword) {
      setError('Password confirmation does not match.');
      return;
    }

    setLoading(true);
    try {
      if (enableMfaOnSignup) {
        const res = await api.initiateSetup(setupForm.setupSecret);
        setMfaEnrollmentData(res.mfa);
        setSetupStep(2);
      } else {
        const res = await api.registerPrimaryAdmin({
          fullName: setupForm.fullName,
          username: setupForm.username,
          email: setupForm.email,
          password: setupForm.password,
        });
        onLoginSuccess(res.admin, res.timeoutMinutes || 60);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create primary administrator account.');
    } finally {
      setLoading(false);
    }
  };

  // Setup Wizard: Step 2 Complete (when MFA is enabled during signup)
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
      const res: any = await api.requestPasswordReset(resetEmail);
      const token = res.resetToken || res.verificationCode;
      if (token) {
        setResetCode(token);
        setResetMessage(`Recovery token generated. Enter your new password below.`);
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
    <div className="min-h-[100dvh] bg-slate-950 flex flex-col justify-center items-center px-4 py-6 sm:p-6 selection:bg-blue-600 selection:text-white overflow-x-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950 pointer-events-none" />

      <div className="relative w-full max-w-lg z-10">
        {/* Brand Header */}
        <div className="text-center mb-5 sm:mb-6">
          <div className="inline-flex items-center justify-center w-24 h-14 sm:w-28 sm:h-16 rounded-2xl bg-white p-1.5 shadow-xl shadow-blue-950/50 mb-3 ring-1 ring-slate-200/80 overflow-hidden">
            <img
              src="./assets/aistudio/logo_95537d8d.jpg"
              onError={(e) => {
                e.currentTarget.src = './assets/aistudio/nexgrid_icon.png';
              }}
              alt="NexGrid Digital Systems Logo"
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            NexGrid Digital Systems
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Customer Management System · Internal Administrative Portal
          </p>
        </div>

        {apiConnectionError && (
          <div className="mb-6 p-4 rounded-2xl border border-amber-500/40 bg-slate-900/95 backdrop-blur-md shadow-2xl text-xs space-y-2.5">
            <div className="flex items-start gap-2.5 font-semibold text-amber-300">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-bold text-amber-200">Connecting to Backend API</div>
                <p className="text-slate-300 text-xs font-normal mt-0.5 leading-relaxed">
                  {apiConnectionError}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={checkStatus}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-500 transition cursor-pointer shadow-sm text-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Connection</span>
              </button>

              <button
                type="button"
                onClick={() => setShowApiConfig(!showApiConfig)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 font-medium hover:bg-slate-700 transition cursor-pointer text-xs"
              >
                <Server className="w-3.5 h-3.5 text-blue-400" />
                <span>{showApiConfig ? 'Hide API URL Settings' : 'Custom API URL'}</span>
              </button>
            </div>

            {showApiConfig && (
              <form onSubmit={handleSaveApiUrl} className="pt-2 border-t border-slate-800 space-y-2">
                <label className="block text-slate-300 font-medium text-[11px]">
                  Backend Server URL:
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Globe className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="url"
                      value={customApiUrl}
                      onChange={(e) => setCustomApiUrlState(e.target.value)}
                      placeholder="https://my-nexgrid-backend.onrender.com"
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg text-xs transition cursor-pointer shrink-0"
                  >
                    Save & Test
                  </button>
                  {customApiUrl && (
                    <button
                      type="button"
                      onClick={handleResetApiUrl}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition cursor-pointer shrink-0"
                    >
                      Reset
                    </button>
                  )}
                </div>
                {apiSaveSuccess && (
                  <p className="text-emerald-400 text-[11px] flex items-center gap-1">
                    <Check className="w-3 h-3" /> Custom backend URL saved! Testing connection...
                  </p>
                )}
              </form>
            )}
          </div>
        )}

        {/* =========================================================================
            SCENARIO 1: ONE-TIME PRIMARY ADMINISTRATOR SIGNUP (0 USERS IN SYSTEM)
           ========================================================================= */}
        {setupRequired ? (
          <div className="bg-slate-900/95 backdrop-blur-md rounded-2xl border border-blue-900/40 p-6 sm:p-8 shadow-2xl shadow-black/80">
            <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-800">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-[10px] font-semibold text-blue-400 mb-1.5">
                  <UserPlus className="w-3 h-3" />
                  <span>One-Time Primary Signup</span>
                </div>
                <h2 className="text-base font-bold text-white">
                  {setupStep === 1 ? 'Create Primary Administrator Account' : 'Complete Two-Factor Authentication'}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {setupStep === 1
                    ? 'Register the primary owner account. Once created, public signup is permanently disabled and all other users are created by you.'
                    : 'Scan the QR code below with your authenticator app to finish setup.'}
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-rose-950/70 border border-rose-800/80 flex items-start gap-2.5 text-xs text-rose-200">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {setupStep === 1 ? (
              <form onSubmit={handlePrimarySignup} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Full Name *
                    </label>
                    <div className="relative">
                      <User className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        required
                        value={setupForm.fullName}
                        onChange={(e) => setSetupForm({ ...setupForm, fullName: e.target.value })}
                        placeholder="e.g. Amanuel Getahun"
                        className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Primary Username *
                    </label>
                    <input
                      type="text"
                      required
                      value={setupForm.username}
                      onChange={(e) => setSetupForm({ ...setupForm, username: e.target.value })}
                      placeholder="e.g. amanuel"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Administrator Email *
                  </label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      required
                      value={setupForm.email}
                      onChange={(e) => setSetupForm({ ...setupForm, email: e.target.value })}
                      placeholder="you@company.com"
                      className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-slate-300">
                      Master Password *
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

                <label className="flex items-center gap-2.5 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableMfaOnSignup}
                    onChange={(e) => setEnableMfaOnSignup(e.target.checked)}
                    className="rounded text-blue-600 bg-slate-900 border-slate-700"
                  />
                  <span>Enable Authenticator App (2FA / TOTP) during signup</span>
                </label>

                <button
                  type="submit"
                  disabled={loading || !pwStrength.isValid}
                  className="w-full mt-2 py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-blue-900/40 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span>
                        {enableMfaOnSignup ? 'Proceed to 2FA Setup' : 'Create Primary Account & Enter Portal'}
                      </span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <div className="relative py-2 flex items-center justify-center">
                  <div className="border-t border-slate-800 w-full" />
                  <span className="bg-slate-900 px-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold shrink-0">
                    Or Quick Setup via Firebase Auth
                  </span>
                  <div className="border-t border-slate-800 w-full" />
                </div>

                <button
                  type="button"
                  onClick={handleFirebaseGoogleSignIn}
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 cursor-pointer"
                >
                  <Globe className="w-4 h-4 text-blue-400" />
                  <span>Sign Up & Sync with Google (Firebase Cloud DB)</span>
                </button>
              </form>
            ) : (
              /* STEP 2: OPTIONAL TOTP QR CODE & EMERGENCY RECOVERY CODES */
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
                        dangerouslySetInnerHTML={{
                          __html: decodeURIComponent(
                            mfaEnrollmentData.qrCodeSvg.replace('data:image/svg+xml;utf8,', '')
                          ),
                        }}
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
                      I have securely saved these emergency recovery codes.
                    </span>
                  </label>
                </div>

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
              SCENARIO 2: STANDARD USER SIGN IN (SIGNUP CLOSED, MANAGED BY PRIMARY)
             ========================================================================= */
          <div className="bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-800 p-6 sm:p-8 shadow-2xl shadow-black/60">
            {mfaChallenge ? (
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
              /* STANDARD SIGN-IN FORM */
              <>
                <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-800">
                  <div>
                    <h2 className="text-base font-semibold text-white">Portal Sign In</h2>
                    <p className="text-xs text-slate-400">
                      Sign in with your primary or assigned user credentials
                    </p>
                  </div>
                  <div className="px-2 py-1 rounded bg-blue-950/60 border border-blue-800/50 text-[10px] text-blue-300 font-mono font-medium">
                    Secured
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
                        placeholder="Enter your username or email"
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
                        placeholder="Enter your password"
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
                    className="w-full mt-2 py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-blue-900/40 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <span>Sign In</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <div className="relative py-2 flex items-center justify-center">
                    <div className="border-t border-slate-800 w-full" />
                    <span className="bg-slate-900 px-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold shrink-0">
                      Or Firebase Cloud Auth
                    </span>
                    <div className="border-t border-slate-800 w-full" />
                  </div>

                  <button
                    type="button"
                    onClick={handleFirebaseGoogleSignIn}
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 cursor-pointer"
                  >
                    <Globe className="w-4 h-4 text-blue-400" />
                    <span>Continue with Google (Firebase Cloud Sync)</span>
                  </button>
                </form>

                <div className="mt-5 pt-4 border-t border-slate-800/80 text-center">
                  <p className="text-[11px] text-slate-400">
                    Synced across devices via Firebase Cloud Firestore. New accounts can only be created by the Primary Administrator.
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* Security & System Architecture Footer */}
        <div className="mt-6 sm:mt-8 text-center text-[11px] text-slate-500 space-y-1">
          <p>© {new Date().getFullYear()} NexGrid Digital Systems. All rights reserved.</p>
          <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-slate-600">
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
                  Enter your registered administrator email address to generate an emergency recovery token.
                </p>
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Administrator Email</label>
                  <input
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="you@company.com"
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
                  <label className="block text-slate-300 mb-1 font-medium">Verification Token</label>
                  <input
                    type="text"
                    required
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    placeholder="Enter verification token"
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
