import express, { Request, Response, NextFunction } from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {
  getDb,
  saveDb,
  createSession,
  getSession,
  touchSession,
  invalidateSession,
  revokeSessionById,
  revokeAllSessionsForAdmin,
  listActiveSessions,
  createPendingMfaSession,
  getPendingMfaSession,
  consumePendingMfaSession,
  verifyPassword,
  createPasswordHash,
  logAudit,
  resetAllApplicationData,
  Admin,
  Customer,
  Domain,
  Invoice,
  Quotation,
  Payment,
  DatabaseSchema,
} from './server/db.js';
import {
  validatePasswordStrength,
  generateBase32Secret,
  generateTotpCode,
  verifyTotpCode,
  generateRecoveryCodes,
  verifyAndConsumeRecoveryCode,
  generateQrCodeSvg,
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
  getOrCreateSetupSecret,
  verifyAndConsumeSetupSecret,
} from './server/security.js';
import {
  queueAndSendSms,
  retryMessage,
  renderTemplate,
  isValidPhone,
  normalizeEthiopianPhone,
  dispatchSmsEthiopia,
} from './server/sms.js';
import {
  computeSystemFinancials,
  getInvoiceFinancials,
  syncInvoiceStatuses,
} from './server/financials.js';
import {
  runDomainReminderScheduler,
  initScheduler,
  getDaysRemaining,
} from './server/scheduler.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Security HTTP headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self' wss: https:;"
  );
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Initialize scheduler
initScheduler();

// Initialize or log setup secret if zero admins exist
const currentDb = getDb();
if (currentDb.admins.length === 0) {
  const secret = getOrCreateSetupSecret();
  console.log(`[FIRST-ADMIN SETUP] Setup secret available for initialization.`);
}

// ================= AUTH MIDDLEWARE & CSRF PROTECTION =================
interface AuthenticatedRequest extends Request {
  admin?: Admin;
  sessionToken?: string;
  csrfToken?: string;
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please log in.', code: 'UNAUTHORIZED' });
  }

  const token = authHeader.split(' ')[1];
  const db = getDb();
  const timeoutMinutes = db.settings.general.inactivityTimeoutMinutes || 60;
  const session = getSession(token, timeoutMinutes);

  if (!session) {
    return res.status(401).json({
      error: 'Session expired due to inactivity (60-minute limit) or has been revoked. Please re-authenticate.',
      code: 'SESSION_EXPIRED',
    });
  }

  const admin = db.admins.find((a) => a.id === session.adminId);
  if (!admin) {
    invalidateSession(token);
    return res.status(401).json({ error: 'User account not found or has been removed.', code: 'USER_NOT_FOUND' });
  }

  // Anti-CSRF Protection for mutating state-changing requests
  const method = req.method.toUpperCase();
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    const clientCsrfToken = req.headers['x-csrf-token'] as string;
    if (!clientCsrfToken || clientCsrfToken !== session.csrfToken) {
      return res.status(403).json({
        error: 'Security verification failed: Invalid or missing CSRF token.',
        code: 'CSRF_VALIDATION_FAILED',
      });
    }
  }

  // Update lastActiveAt on genuine user request (not polling)
  if (!req.query.skipTouch) {
    touchSession(token);
  }

  req.admin = admin;
  req.sessionToken = token;
  req.csrfToken = session.csrfToken;
  next();
}

// ================= 1. AUTH & SETUP ROUTES =================

// Check if first-run initialization is required
app.get('/api/auth/setup-status', (req, res) => {
  const db = getDb();
  const setupRequired = db.admins.length === 0;
  let setupSecret: string | null = null;
  if (setupRequired) {
    setupSecret = getOrCreateSetupSecret();
  }
  res.json({
    setupRequired,
    adminsCount: db.admins.length,
    setupSecret,
  });
});

// Step 1: Initiate first-run setup with setup secret
app.post('/api/auth/setup/initiate', (req, res) => {
  const db = getDb();
  if (db.admins.length > 0) {
    return res.status(403).json({ error: 'First-run administrator setup has already been completed.' });
  }

  const { setupSecret } = req.body;
  if (!setupSecret || typeof setupSecret !== 'string') {
    return res.status(400).json({ error: 'Initial setup secret is required.' });
  }

  // Validate setup secret without consuming yet
  const currentSecret = getOrCreateSetupSecret();
  const bufSupplied = Buffer.from(setupSecret.trim());
  const bufCurrent = Buffer.from(currentSecret);

  if (bufSupplied.length !== bufCurrent.length || !crypto.timingSafeEqual(bufSupplied, bufCurrent)) {
    return res.status(401).json({ error: 'Invalid setup secret. Please inspect the server environment.' });
  }

  // Generate TOTP secret and recovery codes for initial admin setup
  const mfaSecret = generateBase32Secret(20);
  const otpauthUrl = `otpauth://totp/NexGrid:SuperAdmin?secret=${mfaSecret}&issuer=NexGrid%20Digital%20Systems`;
  const qrCodeSvg = generateQrCodeSvg(otpauthUrl);
  const { plaintextCodes, hashedCodes } = generateRecoveryCodes(8);

  res.json({
    valid: true,
    mfa: {
      secret: mfaSecret,
      qrCodeSvg,
      recoveryCodes: plaintextCodes,
      hashedCodes, // Stored temporarily on client during wizard, sent back on confirmation
    },
  });
});

// Step 2: Complete first-run setup
app.post('/api/auth/setup/complete', (req, res) => {
  const db = getDb();
  if (db.admins.length > 0) {
    return res.status(403).json({ error: 'First-run administrator setup has already been completed.' });
  }

  const {
    setupSecret,
    username,
    email,
    fullName,
    password,
    mfaSecret,
    hashedCodes,
    totpCode,
  } = req.body;

  if (!username || !email || !password || !mfaSecret || !totpCode) {
    return res.status(400).json({ error: 'All fields including MFA code verification are required.' });
  }

  // Atomically verify and consume setup secret
  const secretValid = verifyAndConsumeSetupSecret(setupSecret);
  if (!secretValid) {
    return res.status(401).json({ error: 'Invalid or already consumed setup secret.' });
  }

  // Validate password strength against OWASP requirements
  const pwCheck = validatePasswordStrength(password);
  if (!pwCheck.valid) {
    return res.status(400).json({ error: pwCheck.reason });
  }

  // Verify initial TOTP code
  const mfaVerification = verifyTotpCode(mfaSecret, totpCode);
  if (!mfaVerification.valid) {
    return res.status(400).json({ error: 'Invalid 6-digit authenticator code. Please check your authenticator app.' });
  }

  const { hash, salt } = createPasswordHash(password);
  const adminId = 'ADM-001';

  const initialAdmin: Admin = {
    id: adminId,
    username: username.trim().toLowerCase(),
    email: email.trim().toLowerCase(),
    passwordHash: hash,
    salt,
    fullName: (fullName || 'System Administrator').trim(),
    role: 'super_admin',
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
    mfaEnabled: true,
    mfaSecret,
    mfaRecoveryCodeHashes: Array.isArray(hashedCodes) ? hashedCodes : [],
    lastTotpStep: mfaVerification.verifiedStep,
  };

  db.admins.push(initialAdmin);
  saveDb(db);

  logAudit(
    initialAdmin.id,
    initialAdmin.fullName,
    'FIRST_ADMIN_SETUP_COMPLETED',
    'auth',
    initialAdmin.id,
    `Initial administrator "${initialAdmin.username}" created with mandatory MFA enrollment. First-run setup permanently closed.`,
    req.ip
  );

  const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '127.0.0.1';
  const ua = req.headers['user-agent'] || 'Unknown';
  const { token, csrfToken } = createSession(initialAdmin.id, ip, ua);

  res.status(201).json({
    success: true,
    token,
    csrfToken,
    admin: {
      id: initialAdmin.id,
      username: initialAdmin.username,
      email: initialAdmin.email,
      fullName: initialAdmin.fullName,
      role: initialAdmin.role,
      lastLoginAt: initialAdmin.lastLoginAt,
      mfaEnabled: true,
    },
    timeoutMinutes: db.settings.general.inactivityTimeoutMinutes || 60,
  });
});

// Standard Login with OWASP Rate Limiting & MFA Challenge
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const clientIp = (req.headers['x-forwarded-for'] as string) || req.ip || '127.0.0.1';
  const cleanUsername = username.trim().toLowerCase();
  const rateLimitKey = `login:${clientIp}:${cleanUsername}`;

  // Rate Limiting (5 attempts / 15 minutes)
  const rateCheck = checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000, 15 * 60 * 1000);
  if (!rateCheck.allowed) {
    logAudit(
      'ANONYMOUS',
      'Security Throttle',
      'LOGIN_RATE_LIMITED',
      'auth',
      cleanUsername,
      `Rate limit exceeded from IP ${clientIp}. Temporary lockout for ${rateCheck.retryAfterSeconds} seconds.`,
      clientIp
    );
    return res.status(429).json({
      error: `Too many failed authentication attempts. Account temporarily throttled for security. Please try again in ${rateCheck.retryAfterSeconds} seconds.`,
      retryAfterSeconds: rateCheck.retryAfterSeconds,
      code: 'RATE_LIMITED',
    });
  }

  const db = getDb();
  const admin = db.admins.find(
    (a) => a.username.toLowerCase() === cleanUsername || a.email.toLowerCase() === cleanUsername
  );

  // Generic constant-time check prevents account enumeration
  if (!admin || !verifyPassword(password, admin.passwordHash, admin.salt)) {
    recordFailedAttempt(rateLimitKey);
    logAudit(
      admin ? admin.id : 'ANONYMOUS',
      'Security Monitor',
      'LOGIN_FAILED',
      'auth',
      cleanUsername,
      `Failed login attempt for username/email: "${cleanUsername}" from IP ${clientIp}`,
      clientIp
    );
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  // Successful primary password verification: reset failure counter
  resetRateLimit(rateLimitKey);

  const ua = req.headers['user-agent'] || 'Unknown';

  // If MFA is enabled, issue a short-lived MFA challenge token
  if (admin.mfaEnabled && admin.mfaSecret) {
    const mfaToken = createPendingMfaSession(admin.id, clientIp, ua);
    return res.json({
      mfaRequired: true,
      mfaToken,
      username: admin.username,
      message: 'Password verified. Please provide your 6-digit authenticator code or single-use recovery code.',
    });
  }

  // If MFA not enabled (legacy/fallback), create session directly
  const { token, csrfToken } = createSession(admin.id, clientIp, ua);
  admin.lastLoginAt = new Date().toISOString();
  saveDb(db);

  logAudit(
    admin.id,
    admin.fullName,
    'ADMIN_LOGIN',
    'auth',
    admin.id,
    `Admin ${admin.username} logged in successfully`,
    clientIp
  );

  res.json({
    token,
    csrfToken,
    admin: {
      id: admin.id,
      username: admin.username,
      email: admin.email,
      fullName: admin.fullName,
      role: admin.role,
      lastLoginAt: admin.lastLoginAt,
      mfaEnabled: Boolean(admin.mfaEnabled),
    },
    timeoutMinutes: db.settings.general.inactivityTimeoutMinutes || 60,
  });
});

// Verify MFA Step 2 (TOTP or Single-use Recovery Code)
app.post('/api/auth/verify-mfa', (req, res) => {
  const { mfaToken, code, isRecoveryCode } = req.body;
  if (!mfaToken || !code) {
    return res.status(400).json({ error: 'MFA token and verification code are required.' });
  }

  const pending = getPendingMfaSession(mfaToken);
  if (!pending) {
    return res.status(401).json({ error: 'MFA session has expired or is invalid. Please sign in again.' });
  }

  const clientIp = (req.headers['x-forwarded-for'] as string) || req.ip || '127.0.0.1';
  const mfaRateKey = `mfa:${pending.adminId}:${clientIp}`;
  const mfaRateCheck = checkRateLimit(mfaRateKey, 5, 5 * 60 * 1000, 15 * 60 * 1000);
  if (!mfaRateCheck.allowed) {
    return res.status(429).json({
      error: `Too many invalid MFA attempts. Please wait ${mfaRateCheck.retryAfterSeconds} seconds.`,
      retryAfterSeconds: mfaRateCheck.retryAfterSeconds,
    });
  }

  const db = getDb();
  const admin = db.admins.find((a) => a.id === pending.adminId);
  if (!admin || !admin.mfaSecret) {
    return res.status(401).json({ error: 'Administrator MFA configuration error.' });
  }

  let verified = false;

  if (isRecoveryCode) {
    // Single-use recovery code verification
    const recResult = verifyAndConsumeRecoveryCode(code, admin.mfaRecoveryCodeHashes || []);
    if (recResult.valid) {
      admin.mfaRecoveryCodeHashes = recResult.remainingHashedCodes;
      verified = true;
      logAudit(
        admin.id,
        admin.fullName,
        'MFA_RECOVERY_CODE_CONSUMED',
        'auth',
        admin.id,
        `Admin consumed a single-use recovery code. Remaining codes: ${recResult.remainingHashedCodes.length}`,
        clientIp
      );
    }
  } else {
    // Standard TOTP verification
    const totpResult = verifyTotpCode(admin.mfaSecret, code, admin.lastTotpStep);
    if (totpResult.valid) {
      admin.lastTotpStep = totpResult.verifiedStep;
      verified = true;
    }
  }

  if (!verified) {
    recordFailedAttempt(mfaRateKey);
    return res.status(401).json({
      error: isRecoveryCode ? 'Invalid or already used recovery code.' : 'Invalid authenticator code. Check your device time and code.',
    });
  }

  // Consume pending MFA token
  consumePendingMfaSession(mfaToken);
  resetRateLimit(mfaRateKey);

  // Create real authenticated session
  const { token, csrfToken } = createSession(admin.id, pending.ipAddress, pending.userAgent);
  admin.lastLoginAt = new Date().toISOString();
  saveDb(db);

  logAudit(
    admin.id,
    admin.fullName,
    'ADMIN_LOGIN_MFA_SUCCESS',
    'auth',
    admin.id,
    `Admin ${admin.username} successfully authenticated via MFA (${isRecoveryCode ? 'Recovery Code' : 'TOTP'})`,
    clientIp
  );

  res.json({
    token,
    csrfToken,
    admin: {
      id: admin.id,
      username: admin.username,
      email: admin.email,
      fullName: admin.fullName,
      role: admin.role,
      lastLoginAt: admin.lastLoginAt,
      mfaEnabled: true,
    },
    timeoutMinutes: db.settings.general.inactivityTimeoutMinutes || 60,
  });
});

app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const db = getDb();
  res.json({
    admin: {
      id: req.admin!.id,
      username: req.admin!.username,
      email: req.admin!.email,
      fullName: req.admin!.fullName,
      role: req.admin!.role,
      lastLoginAt: req.admin!.lastLoginAt,
      mfaEnabled: Boolean(req.admin!.mfaEnabled),
    },
    csrfToken: req.csrfToken,
    timeoutMinutes: db.settings.general.inactivityTimeoutMinutes || 60,
  });
});

app.post('/api/auth/logout', requireAuth, (req: AuthenticatedRequest, res) => {
  if (req.sessionToken) {
    invalidateSession(req.sessionToken);
  }
  logAudit(
    req.admin!.id,
    req.admin!.fullName,
    'ADMIN_LOGOUT',
    'auth',
    req.admin!.id,
    `Admin ${req.admin!.username} logged out`,
    req.ip
  );
  res.json({ success: true, message: 'Logged out successfully.' });
});

// Active Sessions & Device Security
app.get('/api/auth/sessions', requireAuth, (req: AuthenticatedRequest, res) => {
  const list = listActiveSessions(req.admin!.id, req.sessionToken);
  res.json({ sessions: list });
});

app.post('/api/auth/revoke-session', requireAuth, (req: AuthenticatedRequest, res) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required.' });
  }

  const revoked = revokeSessionById(sessionId, req.admin!.id);
  logAudit(
    req.admin!.id,
    req.admin!.fullName,
    'SESSION_REVOKED',
    'auth',
    sessionId,
    `Admin revoked active session ${sessionId}`,
    req.ip
  );
  res.json({ success: revoked });
});

app.post('/api/auth/revoke-all-sessions', requireAuth, (req: AuthenticatedRequest, res) => {
  const count = revokeAllSessionsForAdmin(req.admin!.id, req.sessionToken);
  logAudit(
    req.admin!.id,
    req.admin!.fullName,
    'ALL_SESSIONS_REVOKED',
    'auth',
    req.admin!.id,
    `Admin revoked ${count} other active session(s) across all devices`,
    req.ip
  );
  res.json({ success: true, revokedCount: count });
});

app.post('/api/auth/change-password', requireAuth, (req: AuthenticatedRequest, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }

  const db = getDb();
  const admin = db.admins.find((a) => a.id === req.admin!.id);
  if (!admin || !verifyPassword(currentPassword, admin.passwordHash, admin.salt)) {
    return res.status(400).json({ error: 'Incorrect current password.' });
  }

  const pwCheck = validatePasswordStrength(newPassword);
  if (!pwCheck.valid) {
    return res.status(400).json({ error: pwCheck.reason });
  }

  const { hash, salt } = createPasswordHash(newPassword);
  admin.passwordHash = hash;
  admin.salt = salt;

  // Security: Invalidate all other active sessions across all devices
  revokeAllSessionsForAdmin(admin.id, req.sessionToken);
  saveDb(db);

  logAudit(
    admin.id,
    admin.fullName,
    'PASSWORD_CHANGED',
    'auth',
    admin.id,
    'Admin updated their password. All other active device sessions revoked for security.',
    req.ip
  );

  res.json({ success: true, message: 'Password updated successfully. Other device sessions have been revoked.' });
});

// Rate-limited, unpredictable password reset flow
app.post('/api/auth/request-reset', (req, res) => {
  const { email } = req.body;
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.ip || '127.0.0.1';
  const cleanEmail = (email || '').trim().toLowerCase();

  const rateKey = `reset:${clientIp}:${cleanEmail}`;
  const rateCheck = checkRateLimit(rateKey, 3, 15 * 60 * 1000, 60 * 60 * 1000);
  if (!rateCheck.allowed) {
    return res.status(429).json({
      error: 'Too many password reset requests. Please try again later.',
      retryAfterSeconds: rateCheck.retryAfterSeconds,
    });
  }

  const db = getDb();
  const admin = db.admins.find((a) => a.email.toLowerCase() === cleanEmail);

  // Generic response always returned to prevent user/email enumeration
  const genericResponse = {
    success: true,
    message: 'If the provided email is associated with an administrator account, password reset instructions have been recorded.',
  };

  if (!admin) {
    recordFailedAttempt(rateKey);
    return res.json(genericResponse);
  }

  // Single-use 256-bit crypto reset token with 15-minute TTL
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  admin.resetTokenHash = tokenHash;
  admin.resetTokenExpires = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins
  saveDb(db);

  logAudit(
    admin.id,
    admin.fullName,
    'PASSWORD_RESET_TOKEN_GENERATED',
    'auth',
    admin.id,
    `Password reset token generated with 15-minute TTL for ${admin.email}`,
    clientIp
  );

  res.json({
    ...genericResponse,
    // Returned securely for administrative recovery testing
    resetToken: rawToken,
  });
});

app.post('/api/auth/reset-password', (req, res) => {
  const { email, token, newPassword } = req.body;
  if (!email || !token || !newPassword) {
    return res.status(400).json({ error: 'Email, reset token, and new password are required.' });
  }

  const clientIp = (req.headers['x-forwarded-for'] as string) || req.ip || '127.0.0.1';
  const db = getDb();
  const admin = db.admins.find((a) => a.email.toLowerCase() === email.trim().toLowerCase());

  if (!admin || !admin.resetTokenHash || !admin.resetTokenExpires) {
    return res.status(400).json({ error: 'Invalid or expired password reset token.' });
  }

  if (new Date(admin.resetTokenExpires) < new Date()) {
    admin.resetTokenHash = null;
    admin.resetTokenExpires = null;
    saveDb(db);
    return res.status(400).json({ error: 'Password reset token has expired. Please request a new token.' });
  }

  const inputHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
  const bufInput = Buffer.from(inputHash, 'hex');
  const bufStored = Buffer.from(admin.resetTokenHash, 'hex');

  if (bufInput.length !== bufStored.length || !crypto.timingSafeEqual(bufInput, bufStored)) {
    return res.status(400).json({ error: 'Invalid or expired password reset token.' });
  }

  const pwCheck = validatePasswordStrength(newPassword);
  if (!pwCheck.valid) {
    return res.status(400).json({ error: pwCheck.reason });
  }

  const { hash, salt } = createPasswordHash(newPassword);
  admin.passwordHash = hash;
  admin.salt = salt;
  admin.resetTokenHash = null;
  admin.resetTokenExpires = null;

  // Revoke all existing sessions across all devices for security
  revokeAllSessionsForAdmin(admin.id);
  saveDb(db);

  logAudit(
    admin.id,
    admin.fullName,
    'PASSWORD_RESET_COMPLETED',
    'auth',
    admin.id,
    `Admin reset their password. All existing device sessions revoked.`,
    clientIp
  );

  res.json({ success: true, message: 'Password has been reset successfully. Please sign in with your new credentials.' });
});

// ================= 2. DASHBOARD ROUTES =================
app.get('/api/dashboard/stats', requireAuth, (req, res) => {
  const db = getDb();
  syncInvoiceStatuses();
  const financials = computeSystemFinancials();

  const totalCustomers = db.customers.filter((c) => c.status === 'active').length;
  const activeDomains = db.domains.filter((d) => d.status === 'active' || d.status === 'renewed').length;
  const expiringSoonDomains = db.domains.filter((d) => {
    const days = getDaysRemaining(d.expirationDate);
    return days >= 0 && days <= 30 && d.status !== 'cancelled';
  }).length;
  const expiredDomains = db.domains.filter((d) => {
    const days = getDaysRemaining(d.expirationDate);
    return days < 0 && d.status !== 'cancelled';
  }).length;

  // Domain renewals due soon (next 30 days)
  const upcomingDomainRenewals = db.domains
    .filter((d) => d.status !== 'cancelled')
    .map((d) => {
      const cust = db.customers.find((c) => c.id === d.customerId);
      const daysLeft = getDaysRemaining(d.expirationDate);
      return {
        ...d,
        customerName: cust ? cust.businessName || cust.contactPerson : 'Unknown',
        customerPhone: cust?.phone,
        daysLeft,
      };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 8);

  // Recent payments
  const recentPayments = db.payments
    .map((p) => {
      const cust = db.customers.find((c) => c.id === p.customerId);
      return {
        ...p,
        customerName: cust ? cust.businessName || cust.contactPerson : 'Unknown',
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);

  // Recent activity / audit logs
  const recentActivity = db.auditLogs.slice(0, 8);

  res.json({
    metrics: {
      totalCustomers,
      activeDomains,
      expiringSoonDomains,
      expiredDomains,
      totalReceivedRevenue: financials.totalReceived,
      outstandingReceivables: financials.outstandingReceivables,
      totalInvoiced: financials.totalInvoiced,
      unpaidInvoicesCount: financials.unpaidInvoiceCount,
      overdueInvoicesCount: financials.overdueInvoiceCount,
      overdueAmount: financials.overdueAmount,
      pendingQuotationsCount: financials.pendingQuotationsCount,
      pendingQuotationsValue: financials.pendingQuotationsValue,
      currency: financials.currency,
    },
    upcomingDomainRenewals,
    recentPayments,
    recentActivity,
  });
});

// ================= 3. CUSTOMER MANAGEMENT =================
app.get('/api/customers', requireAuth, (req, res) => {
  const db = getDb();
  const search = ((req.query.search as string) || '').toLowerCase().trim();
  const status = (req.query.status as string) || 'all';

  let list = db.customers;
  if (status !== 'all') {
    list = list.filter((c) => c.status === status);
  }

  if (search) {
    list = list.filter(
      (c) =>
        c.businessName.toLowerCase().includes(search) ||
        c.contactPerson.toLowerCase().includes(search) ||
        c.phone.includes(search) ||
        c.email.toLowerCase().includes(search) ||
        c.id.toLowerCase().includes(search)
    );
  }

  // Enrich with domain and financial aggregates
  const enriched = list.map((c) => {
    const custDomains = db.domains.filter((d) => d.customerId === c.id && d.status !== 'cancelled');
    const custInvoices = db.invoices.filter((i) => i.customerId === c.id && i.status !== 'cancelled');
    const custPayments = db.payments.filter((p) => p.customerId === c.id && p.status === 'confirmed');

    const totalInvoiced = custInvoices.reduce((sum, inv) => sum + inv.total, 0);
    const totalPaid = custPayments.reduce((sum, p) => sum + p.amount, 0);
    const outstanding = Math.max(0, totalInvoiced - totalPaid);

    return {
      ...c,
      domainCount: custDomains.length,
      invoiceCount: custInvoices.length,
      totalPaid,
      outstanding,
    };
  });

  res.json({ customers: enriched });
});

// Check duplicate phone or email
app.get('/api/customers/check-duplicate', requireAuth, (req, res) => {
  const phone = (req.query.phone as string) || '';
  const email = (req.query.email as string) || '';
  const excludeId = (req.query.excludeId as string) || '';

  const db = getDb();
  const normPhone = phone ? normalizeEthiopianPhone(phone) : '';

  const duplicatePhone = phone
    ? db.customers.find(
        (c) => c.id !== excludeId && normalizeEthiopianPhone(c.phone) === normPhone
      )
    : null;

  const duplicateEmail = email
    ? db.customers.find(
        (c) => c.id !== excludeId && c.email.toLowerCase() === email.trim().toLowerCase()
      )
    : null;

  res.json({
    hasDuplicate: Boolean(duplicatePhone || duplicateEmail),
    duplicatePhoneCustomer: duplicatePhone
      ? { id: duplicatePhone.id, name: duplicatePhone.businessName, phone: duplicatePhone.phone }
      : null,
    duplicateEmailCustomer: duplicateEmail
      ? { id: duplicateEmail.id, name: duplicateEmail.businessName, email: duplicateEmail.email }
      : null,
  });
});

app.get('/api/customers/:id', requireAuth, (req, res) => {
  const db = getDb();
  const customer = db.customers.find((c) => c.id === req.params.id);
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found.' });
  }

  const domains = db.domains
    .filter((d) => d.customerId === customer.id)
    .map((d) => ({
      ...d,
      daysLeft: getDaysRemaining(d.expirationDate),
    }));

  const invoices = db.invoices
    .filter((i) => i.customerId === customer.id)
    .map((inv) => {
      const fin = getInvoiceFinancials(inv, db.payments);
      return {
        ...inv,
        totalPaid: fin.totalPaid,
        remainingBalance: fin.remainingBalance,
      };
    });

  const quotations = db.quotations.filter((q) => q.customerId === customer.id);
  const payments = db.payments.filter((p) => p.customerId === customer.id);
  const messages = db.messageLogs.filter((m) => m.customerId === customer.id);

  res.json({
    customer,
    domains,
    invoices,
    quotations,
    payments,
    messages,
  });
});

app.post('/api/customers', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { businessName, contactPerson, phone, email, billingAddress, notes } = req.body;

  if (!businessName || !phone) {
    return res.status(400).json({ error: 'Business/Customer Name and Phone number are required.' });
  }

  const db = getDb();
  const normPhone = normalizeEthiopianPhone(phone);

  // Auto-generate Customer ID
  const nextNumber = db.customers.length + 1001;
  const id = `CUST-${nextNumber}`;

  const customer: Customer = {
    id,
    businessName: businessName.trim(),
    contactPerson: (contactPerson || '').trim(),
    phone: normPhone,
    email: (email || '').trim().toLowerCase(),
    billingAddress: (billingAddress || '').trim(),
    notes: (notes || '').trim(),
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.customers.push(customer);
  saveDb(db);

  logAudit(
    req.admin!.id,
    req.admin!.fullName,
    'CUSTOMER_CREATED',
    'customer',
    customer.id,
    `Added customer ${customer.businessName} (${customer.id})`
  );

  // Automated Welcome SMS if enabled
  let welcomeSent = false;
  if (db.settings.sms.enabled && db.settings.sms.autoWelcome && customer.phone) {
    const welcomeTmpl = db.templates.find((t) => t.type === 'welcome' && t.channel === 'sms');
    const tmplStr =
      welcomeTmpl?.bodyTemplate ||
      'Hello [Customer Name], welcome to NexGrid Digital Systems! Thank you for choosing our services. For assistance, please contact us at [Business Contact].';

    const msg = renderTemplate(tmplStr, {
      'Customer Name': customer.businessName || customer.contactPerson,
      'Business Contact': db.settings.general.businessPhone || db.settings.general.businessContact,
      'Business Phone': db.settings.general.businessPhone,
      'Business Email': db.settings.general.businessEmail,
    });

    try {
      await queueAndSendSms({
        customerId: customer.id,
        customerName: customer.businessName,
        recipient: customer.phone,
        messageType: 'welcome',
        content: msg,
      });
      welcomeSent = true;
    } catch (err) {
      console.error('Error sending welcome SMS:', err);
    }
  }

  res.status(201).json({ customer, welcomeSent });
});

app.put('/api/customers/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const customer = db.customers.find((c) => c.id === req.params.id);
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found.' });
  }

  const { businessName, contactPerson, phone, email, billingAddress, notes, status } = req.body;

  if (businessName) customer.businessName = businessName.trim();
  if (contactPerson !== undefined) customer.contactPerson = contactPerson.trim();
  if (phone) customer.phone = normalizeEthiopianPhone(phone);
  if (email !== undefined) customer.email = email.trim().toLowerCase();
  if (billingAddress !== undefined) customer.billingAddress = billingAddress.trim();
  if (notes !== undefined) customer.notes = notes.trim();
  if (status && (status === 'active' || status === 'archived')) customer.status = status;
  customer.updatedAt = new Date().toISOString();

  saveDb(db);

  logAudit(
    req.admin!.id,
    req.admin!.fullName,
    'CUSTOMER_UPDATED',
    'customer',
    customer.id,
    `Updated details for ${customer.businessName}`
  );

  res.json({ customer });
});

app.post('/api/customers/:id/archive', requireAuth, (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const customer = db.customers.find((c) => c.id === req.params.id);
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found.' });
  }

  customer.status = 'archived';
  customer.updatedAt = new Date().toISOString();
  saveDb(db);

  logAudit(
    req.admin!.id,
    req.admin!.fullName,
    'CUSTOMER_ARCHIVED',
    'customer',
    customer.id,
    `Archived customer ${customer.businessName} (financial and domain history preserved)`
  );

  res.json({ success: true, customer });
});

app.post('/api/customers/:id/unarchive', requireAuth, (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const customer = db.customers.find((c) => c.id === req.params.id);
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found.' });
  }

  customer.status = 'active';
  customer.updatedAt = new Date().toISOString();
  saveDb(db);

  logAudit(
    req.admin!.id,
    req.admin!.fullName,
    'CUSTOMER_RESTORED',
    'customer',
    customer.id,
    `Restored archived customer ${customer.businessName}`
  );

  res.json({ success: true, customer });
});

// ================= 4. DOMAIN MANAGEMENT =================
app.get('/api/domains', requireAuth, (req, res) => {
  const db = getDb();
  const search = ((req.query.search as string) || '').toLowerCase().trim();
  const status = (req.query.status as string) || 'all';

  let list = db.domains.map((d) => {
    const cust = db.customers.find((c) => c.id === d.customerId);
    const daysLeft = getDaysRemaining(d.expirationDate);
    return {
      ...d,
      customerName: cust ? cust.businessName || cust.contactPerson : 'Unknown',
      customerPhone: cust?.phone,
      daysLeft,
    };
  });

  if (status !== 'all') {
    if (status === 'expiring_soon') {
      list = list.filter((d) => d.daysLeft >= 0 && d.daysLeft <= 30 && d.status !== 'cancelled');
    } else if (status === 'expired') {
      list = list.filter((d) => d.daysLeft < 0 && d.status !== 'cancelled');
    } else {
      list = list.filter((d) => d.status === status);
    }
  }

  if (search) {
    list = list.filter(
      (d) =>
        d.domainName.toLowerCase().includes(search) ||
        d.customerName.toLowerCase().includes(search) ||
        (d.registrar && d.registrar.toLowerCase().includes(search))
    );
  }

  res.json({ domains: list });
});

app.post('/api/domains', requireAuth, (req: AuthenticatedRequest, res) => {
  const {
    customerId,
    domainName,
    registrationDate,
    expirationDate,
    renewalPrice,
    registrationPeriodYears,
    registrar,
    notes,
  } = req.body;

  if (!customerId || !domainName || !expirationDate) {
    return res.status(400).json({ error: 'Customer, domain name, and expiration date are required.' });
  }

  const db = getDb();
  const customer = db.customers.find((c) => c.id === customerId);
  if (!customer) {
    return res.status(400).json({ error: 'Selected customer does not exist.' });
  }

  // Prevent duplicate active domain names
  const cleanDomain = domainName.toLowerCase().trim();
  const existing = db.domains.find(
    (d) => d.domainName.toLowerCase() === cleanDomain && d.status !== 'cancelled'
  );
  if (existing) {
    return res.status(400).json({ error: `Domain ${cleanDomain} is already registered under customer ID ${existing.customerId}.` });
  }

  const id = `DOM-${db.domains.length + 1001}`;
  const daysLeft = getDaysRemaining(expirationDate);
  const status: Domain['status'] = daysLeft < 0 ? 'expired' : daysLeft <= 30 ? 'expiring_soon' : 'active';

  const newDomain: Domain = {
    id,
    customerId,
    domainName: cleanDomain,
    registrationDate: registrationDate || new Date().toISOString(),
    expirationDate,
    renewalPrice: Number(renewalPrice) || 0,
    registrationPeriodYears: Number(registrationPeriodYears) || 1,
    registrar: registrar?.trim() || 'Ethio Telecom (.et)',
    status,
    notes: notes?.trim(),
    renewalHistory: [],
    sentReminderIntervals: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.domains.push(newDomain);
  saveDb(db);

  logAudit(
    req.admin!.id,
    req.admin!.fullName,
    'DOMAIN_CREATED',
    'domain',
    newDomain.id,
    `Registered domain ${newDomain.domainName} for customer ${customer.businessName}`
  );

  res.status(201).json({ domain: newDomain });
});

app.put('/api/domains/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const domain = db.domains.find((d) => d.id === req.params.id);
  if (!domain) {
    return res.status(404).json({ error: 'Domain not found.' });
  }

  const {
    domainName,
    registrationDate,
    expirationDate,
    renewalPrice,
    registrationPeriodYears,
    registrar,
    status,
    notes,
  } = req.body;

  if (domainName) domain.domainName = domainName.toLowerCase().trim();
  if (registrationDate) domain.registrationDate = registrationDate;
  if (expirationDate) {
    domain.expirationDate = expirationDate;
    const daysLeft = getDaysRemaining(expirationDate);
    if (status !== 'cancelled' && status !== 'renewed') {
      domain.status = daysLeft < 0 ? 'expired' : daysLeft <= 30 ? 'expiring_soon' : 'active';
    }
  }
  if (renewalPrice !== undefined) domain.renewalPrice = Number(renewalPrice);
  if (registrationPeriodYears !== undefined) domain.registrationPeriodYears = Number(registrationPeriodYears);
  if (registrar !== undefined) domain.registrar = registrar.trim();
  if (status) domain.status = status;
  if (notes !== undefined) domain.notes = notes.trim();
  domain.updatedAt = new Date().toISOString();

  saveDb(db);

  logAudit(
    req.admin!.id,
    req.admin!.fullName,
    'DOMAIN_UPDATED',
    'domain',
    domain.id,
    `Updated domain ${domain.domainName}`
  );

  res.json({ domain });
});

// Domain explicit renewal action
app.post('/api/domains/:id/renew', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { newExpirationDate, periodYears, renewalPrice, notes, recordPayment, paymentMethod, referenceNumber } = req.body;

  if (!newExpirationDate) {
    return res.status(400).json({ error: 'New expiration date is required to confirm renewal.' });
  }

  const db = getDb();
  const domain = db.domains.find((d) => d.id === req.params.id);
  if (!domain) {
    return res.status(404).json({ error: 'Domain not found.' });
  }

  const customer = db.customers.find((c) => c.id === domain.customerId);
  const prevExp = domain.expirationDate;
  const price = Number(renewalPrice) || domain.renewalPrice;
  const years = Number(periodYears) || 1;

  // Append to renewal history
  domain.renewalHistory.push({
    id: `RENEW-${Date.now()}`,
    date: new Date().toISOString(),
    previousExpDate: prevExp,
    newExpDate: newExpirationDate,
    renewalPrice: price,
    periodYears: years,
    recordedBy: req.admin!.fullName,
    notes: notes || 'Manual domain renewal confirmed by administrator.',
  });

  domain.expirationDate = newExpirationDate;
  domain.registrationPeriodYears = years;
  domain.status = 'renewed';
  // Reset reminder intervals for the new cycle
  domain.sentReminderIntervals = [];
  domain.updatedAt = new Date().toISOString();

  // If administrator chooses to record the payment immediately
  let paymentCreated = null;
  if (recordPayment && price > 0 && customer) {
    const payId = `PAY-${Date.now()}`;
    const payment: Payment = {
      id: payId,
      customerId: customer.id,
      amount: price,
      currency: db.settings.general.currency || 'ETB',
      paymentDate: new Date().toISOString(),
      paymentMethod: paymentMethod || 'bank_transfer',
      referenceNumber: referenceNumber || `RENEW-${domain.domainName}`,
      notes: `Payment for domain renewal: ${domain.domainName} (${years} yr)`,
      recordedBy: req.admin!.fullName,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.payments.push(payment);
    paymentCreated = payment;

    // Send payment confirmation SMS if enabled
    if (db.settings.sms.enabled && db.settings.sms.autoPaymentConfirm && customer.phone) {
      const payTmpl = db.templates.find((t) => t.type === 'payment_confirmation' && t.channel === 'sms');
      const tmpl =
        payTmpl?.bodyTemplate ||
        'Hello [Customer Name], we have confirmed your payment of [Amount] [Currency] received on [Payment Date] for [Service/Invoice Number]. Remaining balance: [Balance] [Currency]. Thank you for choosing NexGrid Digital Systems.';

      const msg = renderTemplate(tmpl, {
        'Customer Name': customer.businessName || customer.contactPerson,
        'Amount': price.toLocaleString(),
        'Currency': payment.currency,
        'Payment Date': new Date().toISOString().split('T')[0],
        'Service/Invoice Number': `Renewal ${domain.domainName}`,
        'Balance': '0.00',
      });

      queueAndSendSms({
        customerId: customer.id,
        customerName: customer.businessName,
        recipient: customer.phone,
        messageType: 'payment_confirmation',
        content: msg,
      }).catch((err) => console.error('Failed to send renewal payment SMS:', err));
    }
  }

  saveDb(db);

  logAudit(
    req.admin!.id,
    req.admin!.fullName,
    'DOMAIN_RENEWED',
    'domain',
    domain.id,
    `Renewed domain ${domain.domainName} from ${prevExp.split('T')[0]} to ${newExpirationDate.split('T')[0]} (${price} ETB)`
  );

  res.json({
    success: true,
    domain,
    payment: paymentCreated,
  });
});

// Manual reminder trigger for domain
app.post('/api/domains/:id/send-reminder', requireAuth, async (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const domain = db.domains.find((d) => d.id === req.params.id);
  if (!domain) {
    return res.status(404).json({ error: 'Domain not found.' });
  }

  const customer = db.customers.find((c) => c.id === domain.customerId);
  if (!customer || !customer.phone) {
    return res.status(400).json({ error: 'Customer phone number is missing or invalid.' });
  }

  const daysLeft = getDaysRemaining(domain.expirationDate);
  const currency = db.settings.general.currency || 'ETB';
  const customMessage = req.body.customMessage;

  let messageText = customMessage;
  if (!messageText) {
    const tmpl = db.templates.find((t) => t.type === 'domain_reminder' && t.channel === 'sms');
    const tmplStr =
      tmpl?.bodyTemplate ||
      'Hello [Customer Name], your domain [Domain Name] is scheduled to expire on [Expiration Date] ([Days Remaining] days left). Renewal price: [Amount] [Currency]. Please contact NexGrid Digital Systems to arrange renewal.';

    messageText = renderTemplate(tmplStr, {
      'Customer Name': customer.businessName || customer.contactPerson,
      'Domain Name': domain.domainName,
      'Expiration Date': new Date(domain.expirationDate).toISOString().split('T')[0],
      'Days Remaining': daysLeft,
      'Amount': domain.renewalPrice.toLocaleString(),
      'Currency': currency,
      'Business Contact': db.settings.general.businessPhone || db.settings.general.businessContact,
    });
  }

  const result = await queueAndSendSms({
    customerId: customer.id,
    customerName: customer.businessName,
    recipient: customer.phone,
    messageType: 'domain_reminder',
    content: messageText,
    domainId: domain.id,
    reminderInterval: daysLeft,
  });

  logAudit(
    req.admin!.id,
    req.admin!.fullName,
    'DOMAIN_REMINDER_SENT',
    'notification',
    domain.id,
    `Dispatched domain renewal reminder for ${domain.domainName} to ${customer.phone} (Status: ${result.status})`
  );

  res.json(result);
});

// ================= 5. INVOICES & QUOTATIONS =================
app.get('/api/invoices', requireAuth, (req, res) => {
  const db = getDb();
  syncInvoiceStatuses();

  const list = db.invoices.map((inv) => {
    const customer = db.customers.find((c) => c.id === inv.customerId);
    const fin = getInvoiceFinancials(inv, db.payments);
    return {
      ...inv,
      customerName: customer ? customer.businessName || customer.contactPerson : 'Unknown',
      customerPhone: customer?.phone,
      totalPaid: fin.totalPaid,
      remainingBalance: fin.remainingBalance,
      overpayment: fin.overpayment,
    };
  });

  res.json({ invoices: list });
});

app.get('/api/invoices/:id', requireAuth, (req, res) => {
  const db = getDb();
  const invoice = db.invoices.find((i) => i.id === req.params.id);
  if (!invoice) {
    return res.status(404).json({ error: 'Invoice not found.' });
  }

  const customer = db.customers.find((c) => c.id === invoice.customerId);
  const fin = getInvoiceFinancials(invoice, db.payments);

  res.json({
    invoice,
    customer,
    totalPaid: fin.totalPaid,
    remainingBalance: fin.remainingBalance,
    overpayment: fin.overpayment,
    payments: fin.payments,
  });
});

app.post('/api/invoices', requireAuth, (req: AuthenticatedRequest, res) => {
  const { customerId, issueDate, dueDate, items, taxRate, discountAmount, notes, paymentInstructions, terms } = req.body;

  if (!customerId || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Customer and at least one line item are required.' });
  }

  const db = getDb();
  const customer = db.customers.find((c) => c.id === customerId);
  if (!customer) {
    return res.status(400).json({ error: 'Selected customer not found.' });
  }

  // Calculate line item totals and subtotal
  const cleanItems = items.map((it: any, idx: number) => {
    const qty = Number(it.quantity) || 1;
    const unitPrice = Number(it.unitPrice) || 0;
    return {
      id: it.id || `item-${idx + 1}`,
      description: (it.description || '').trim() || 'Service Item',
      quantity: qty,
      unitPrice,
      total: qty * unitPrice,
    };
  });

  const subtotal = cleanItems.reduce((sum: number, it: any) => sum + it.total, 0);
  const taxPct = Number(taxRate) >= 0 ? Number(taxRate) : 0;
  const discount = Number(discountAmount) || 0;
  const taxableAmount = Math.max(0, subtotal - discount);
  const taxAmount = (taxableAmount * taxPct) / 100;
  const total = Math.max(0, taxableAmount + taxAmount);

  const nextNum = db.invoices.length + 1;
  const pad = String(nextNum).padStart(3, '0');
  const year = new Date().getFullYear();
  const id = `INV-${year}-${pad}`;

  const invoice: Invoice = {
    id,
    customerId,
    issueDate: issueDate || new Date().toISOString().split('T')[0],
    dueDate: dueDate || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
    currency: db.settings.general.currency || 'ETB',
    items: cleanItems,
    subtotal,
    taxRate: taxPct,
    taxAmount,
    discountAmount: discount,
    total,
    notes: notes?.trim(),
    paymentInstructions: paymentInstructions?.trim() || 'CBE A/C: 1000234567890 (NexGrid Digital Systems) or Telebirr: 0911234567',
    terms: terms?.trim() || 'Payment is due within 15 calendar days from the invoice date.',
    status: 'unpaid',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.invoices.push(invoice);
  saveDb(db);

  logAudit(
    req.admin!.id,
    req.admin!.fullName,
    'INVOICE_CREATED',
    'invoice',
    invoice.id,
    `Created invoice ${invoice.id} for ${customer.businessName} (Total: ${invoice.total} ${invoice.currency})`
  );

  res.status(201).json({ invoice });
});

app.put('/api/invoices/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const invoice = db.invoices.find((i) => i.id === req.params.id);
  if (!invoice) {
    return res.status(404).json({ error: 'Invoice not found.' });
  }

  const { issueDate, dueDate, items, taxRate, discountAmount, notes, paymentInstructions, terms, status } = req.body;

  if (items && Array.isArray(items)) {
    invoice.items = items.map((it: any, idx: number) => {
      const qty = Number(it.quantity) || 1;
      const unitPrice = Number(it.unitPrice) || 0;
      return {
        id: it.id || `item-${idx + 1}`,
        description: (it.description || '').trim(),
        quantity: qty,
        unitPrice,
        total: qty * unitPrice,
      };
    });

    const subtotal = invoice.items.reduce((sum, it) => sum + it.total, 0);
    const taxPct = taxRate !== undefined ? Number(taxRate) : invoice.taxRate;
    const discount = discountAmount !== undefined ? Number(discountAmount) : invoice.discountAmount;
    const taxableAmount = Math.max(0, subtotal - discount);
    const taxAmount = (taxableAmount * taxPct) / 100;
    const total = Math.max(0, taxableAmount + taxAmount);

    invoice.subtotal = subtotal;
    invoice.taxRate = taxPct;
    invoice.discountAmount = discount;
    invoice.taxAmount = taxAmount;
    invoice.total = total;
  }

  if (issueDate) invoice.issueDate = issueDate;
  if (dueDate) invoice.dueDate = dueDate;
  if (notes !== undefined) invoice.notes = notes.trim();
  if (paymentInstructions !== undefined) invoice.paymentInstructions = paymentInstructions.trim();
  if (terms !== undefined) invoice.terms = terms.trim();
  if (status) invoice.status = status;
  invoice.updatedAt = new Date().toISOString();

  saveDb(db);
  syncInvoiceStatuses();

  logAudit(
    req.admin!.id,
    req.admin!.fullName,
    'INVOICE_UPDATED',
    'invoice',
    invoice.id,
    `Updated invoice ${invoice.id}`
  );

  res.json({ invoice });
});

app.post('/api/invoices/:id/send-reminder', requireAuth, async (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const invoice = db.invoices.find((i) => i.id === req.params.id);
  if (!invoice) {
    return res.status(404).json({ error: 'Invoice not found.' });
  }

  const customer = db.customers.find((c) => c.id === invoice.customerId);
  if (!customer || !customer.phone) {
    return res.status(400).json({ error: 'Customer phone number is missing.' });
  }

  const fin = getInvoiceFinancials(invoice, db.payments);
  const tmpl = db.templates.find((t) => t.type === 'invoice_reminder' && t.channel === 'sms');
  const tmplStr =
    tmpl?.bodyTemplate ||
    'Hello [Customer Name], this is a reminder from NexGrid Digital Systems regarding invoice [Invoice Number] for [Amount] [Currency], due on [Due Date]. Please arrange payment to avoid service disruption.';

  const messageText = renderTemplate(tmplStr, {
    'Customer Name': customer.businessName || customer.contactPerson,
    'Invoice Number': invoice.id,
    'Amount': fin.remainingBalance.toLocaleString(),
    'Currency': invoice.currency,
    'Due Date': invoice.dueDate,
    'Business Contact': db.settings.general.businessPhone || db.settings.general.businessContact,
  });

  const result = await queueAndSendSms({
    customerId: customer.id,
    customerName: customer.businessName,
    recipient: customer.phone,
    messageType: 'invoice_reminder',
    content: messageText,
  });

  logAudit(
    req.admin!.id,
    req.admin!.fullName,
    'INVOICE_REMINDER_SENT',
    'notification',
    invoice.id,
    `Sent invoice payment reminder for ${invoice.id} to ${customer.phone}`
  );

  res.json(result);
});

// Quotations
app.get('/api/quotations', requireAuth, (req, res) => {
  const db = getDb();
  const list = db.quotations.map((q) => {
    const customer = db.customers.find((c) => c.id === q.customerId);
    return {
      ...q,
      customerName: customer ? customer.businessName || customer.contactPerson : 'Unknown',
      customerPhone: customer?.phone,
    };
  });
  res.json({ quotations: list });
});

app.post('/api/quotations', requireAuth, (req: AuthenticatedRequest, res) => {
  const { customerId, issueDate, validUntil, items, taxRate, discountAmount, notes, paymentInstructions, terms } = req.body;

  if (!customerId || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Customer and items are required.' });
  }

  const db = getDb();
  const customer = db.customers.find((c) => c.id === customerId);
  if (!customer) {
    return res.status(400).json({ error: 'Customer not found.' });
  }

  const cleanItems = items.map((it: any, idx: number) => {
    const qty = Number(it.quantity) || 1;
    const unitPrice = Number(it.unitPrice) || 0;
    return {
      id: it.id || `item-${idx + 1}`,
      description: (it.description || '').trim() || 'Service Item',
      quantity: qty,
      unitPrice,
      total: qty * unitPrice,
    };
  });

  const subtotal = cleanItems.reduce((sum: number, it: any) => sum + it.total, 0);
  const taxPct = Number(taxRate) >= 0 ? Number(taxRate) : 0;
  const discount = Number(discountAmount) || 0;
  const taxableAmount = Math.max(0, subtotal - discount);
  const taxAmount = (taxableAmount * taxPct) / 100;
  const total = Math.max(0, taxableAmount + taxAmount);

  const nextNum = db.quotations.length + 1;
  const pad = String(nextNum).padStart(3, '0');
  const year = new Date().getFullYear();
  const id = `QUO-${year}-${pad}`;

  const quotation: Quotation = {
    id,
    customerId,
    issueDate: issueDate || new Date().toISOString().split('T')[0],
    validUntil: validUntil || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    currency: db.settings.general.currency || 'ETB',
    items: cleanItems,
    subtotal,
    taxRate: taxPct,
    taxAmount,
    discountAmount: discount,
    total,
    notes: notes?.trim(),
    paymentInstructions: paymentInstructions?.trim(),
    terms: terms?.trim() || 'Quotation valid for 30 calendar days.',
    status: 'sent',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.quotations.push(quotation);
  saveDb(db);

  logAudit(
    req.admin!.id,
    req.admin!.fullName,
    'QUOTATION_CREATED',
    'quotation',
    quotation.id,
    `Created quotation ${quotation.id} for ${customer.businessName} (${quotation.total} ${quotation.currency})`
  );

  res.status(201).json({ quotation });
});

// Convert quotation to invoice without re-entering details, preserving history
app.post('/api/quotations/:id/convert-to-invoice', requireAuth, (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const quotation = db.quotations.find((q) => q.id === req.params.id);
  if (!quotation) {
    return res.status(404).json({ error: 'Quotation not found.' });
  }

  const nextNum = db.invoices.length + 1;
  const pad = String(nextNum).padStart(3, '0');
  const year = new Date().getFullYear();
  const invId = `INV-${year}-${pad}`;

  const newInvoice: Invoice = {
    id: invId,
    customerId: quotation.customerId,
    quotationId: quotation.id,
    issueDate: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
    currency: quotation.currency,
    items: quotation.items.map((it) => ({ ...it })),
    subtotal: quotation.subtotal,
    taxRate: quotation.taxRate,
    taxAmount: quotation.taxAmount,
    discountAmount: quotation.discountAmount,
    total: quotation.total,
    notes: `Converted from Quotation ${quotation.id}. ${quotation.notes || ''}`.trim(),
    paymentInstructions: quotation.paymentInstructions || 'CBE A/C: 1000234567890 (NexGrid Digital Systems)',
    terms: quotation.terms || 'Payment is due within 15 calendar days from the invoice date.',
    status: 'unpaid',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  quotation.status = 'accepted';
  quotation.convertedInvoiceId = newInvoice.id;
  quotation.updatedAt = new Date().toISOString();

  db.invoices.push(newInvoice);
  saveDb(db);

  logAudit(
    req.admin!.id,
    req.admin!.fullName,
    'QUOTATION_CONVERTED',
    'invoice',
    newInvoice.id,
    `Converted Quotation ${quotation.id} into Invoice ${newInvoice.id}`
  );

  res.json({
    success: true,
    invoice: newInvoice,
    quotation,
  });
});

// ================= 6. PAYMENT TRACKING & REVERSALS =================
app.get('/api/payments', requireAuth, (req, res) => {
  const db = getDb();
  const list = db.payments.map((p) => {
    const cust = db.customers.find((c) => c.id === p.customerId);
    return {
      ...p,
      customerName: cust ? cust.businessName || cust.contactPerson : 'Unknown',
    };
  });
  res.json({ payments: list });
});

app.post('/api/payments', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { customerId, invoiceId, amount, currency, paymentDate, paymentMethod, referenceNumber, notes, status } = req.body;

  if (!customerId || !amount || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Valid customer and positive payment amount are required.' });
  }

  const db = getDb();
  const customer = db.customers.find((c) => c.id === customerId);
  if (!customer) {
    return res.status(400).json({ error: 'Customer not found.' });
  }

  const payNum = db.payments.length + 1;
  const pad = String(payNum).padStart(3, '0');
  const year = new Date().getFullYear();
  const id = `PAY-${year}-${pad}`;
  const payStatus = status || 'confirmed';

  const payment: Payment = {
    id,
    customerId,
    invoiceId: invoiceId || undefined,
    amount: Number(amount),
    currency: currency || db.settings.general.currency || 'ETB',
    paymentDate: paymentDate || new Date().toISOString(),
    paymentMethod: paymentMethod || 'bank_transfer',
    referenceNumber: referenceNumber?.trim(),
    notes: notes?.trim(),
    recordedBy: req.admin!.fullName,
    status: payStatus,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.payments.push(payment);
  saveDb(db);
  syncInvoiceStatuses();

  logAudit(
    req.admin!.id,
    req.admin!.fullName,
    payStatus === 'confirmed' ? 'PAYMENT_CONFIRMED' : 'PAYMENT_RECORDED',
    'payment',
    payment.id,
    `Recorded payment of ${payment.amount} ${payment.currency} for ${customer.businessName} (Status: ${payStatus})`
  );

  // Send confirmation SMS if payment is confirmed
  if (payStatus === 'confirmed' && db.settings.sms.enabled && db.settings.sms.autoPaymentConfirm && customer.phone) {
    let balanceStr = '0.00';
    if (invoiceId) {
      const inv = db.invoices.find((i) => i.id === invoiceId);
      if (inv) {
        const fin = getInvoiceFinancials(inv, db.payments);
        balanceStr = fin.remainingBalance.toLocaleString();
      }
    }

    const payTmpl = db.templates.find((t) => t.type === 'payment_confirmation' && t.channel === 'sms');
    const tmplStr =
      payTmpl?.bodyTemplate ||
      'Hello [Customer Name], we have confirmed your payment of [Amount] [Currency] received on [Payment Date] for [Service/Invoice Number]. Remaining balance: [Balance] [Currency]. Thank you for choosing NexGrid Digital Systems.';

    const msg = renderTemplate(tmplStr, {
      'Customer Name': customer.businessName || customer.contactPerson,
      'Amount': payment.amount.toLocaleString(),
      'Currency': payment.currency,
      'Payment Date': new Date(payment.paymentDate).toISOString().split('T')[0],
      'Service/Invoice Number': invoiceId || 'Account Services',
      'Balance': balanceStr,
    });

    queueAndSendSms({
      customerId: customer.id,
      customerName: customer.businessName,
      recipient: customer.phone,
      messageType: 'payment_confirmation',
      content: msg,
    }).catch((err) => console.error('Error sending payment SMS:', err));
  }

  res.status(201).json({ payment });
});

// Confirm pending payment
app.post('/api/payments/:id/confirm', requireAuth, async (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const payment = db.payments.find((p) => p.id === req.params.id);
  if (!payment) {
    return res.status(404).json({ error: 'Payment not found.' });
  }

  if (payment.status === 'confirmed') {
    return res.status(400).json({ error: 'Payment is already confirmed.' });
  }

  payment.status = 'confirmed';
  payment.updatedAt = new Date().toISOString();
  saveDb(db);
  syncInvoiceStatuses();

  const customer = db.customers.find((c) => c.id === payment.customerId);

  logAudit(
    req.admin!.id,
    req.admin!.fullName,
    'PAYMENT_CONFIRMED',
    'payment',
    payment.id,
    `Admin confirmed payment ${payment.id} of ${payment.amount} ${payment.currency}`
  );

  // Send confirmation SMS if enabled
  if (db.settings.sms.enabled && db.settings.sms.autoPaymentConfirm && customer?.phone) {
    let balanceStr = '0.00';
    if (payment.invoiceId) {
      const inv = db.invoices.find((i) => i.id === payment.invoiceId);
      if (inv) {
        const fin = getInvoiceFinancials(inv, db.payments);
        balanceStr = fin.remainingBalance.toLocaleString();
      }
    }

    const payTmpl = db.templates.find((t) => t.type === 'payment_confirmation' && t.channel === 'sms');
    const tmplStr =
      payTmpl?.bodyTemplate ||
      'Hello [Customer Name], we have confirmed your payment of [Amount] [Currency] received on [Payment Date] for [Service/Invoice Number]. Remaining balance: [Balance] [Currency]. Thank you for choosing NexGrid Digital Systems.';

    const msg = renderTemplate(tmplStr, {
      'Customer Name': customer.businessName || customer.contactPerson,
      'Amount': payment.amount.toLocaleString(),
      'Currency': payment.currency,
      'Payment Date': new Date(payment.paymentDate).toISOString().split('T')[0],
      'Service/Invoice Number': payment.invoiceId || 'Account Services',
      'Balance': balanceStr,
    });

    queueAndSendSms({
      customerId: customer.id,
      customerName: customer.businessName,
      recipient: customer.phone,
      messageType: 'payment_confirmation',
      content: msg,
    }).catch((err) => console.error('Error sending confirmation SMS:', err));
  }

  res.json({ success: true, payment });
});

// Reverse payment with audit trail
app.post('/api/payments/:id/reverse', requireAuth, (req: AuthenticatedRequest, res) => {
  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'Audit reason is required for payment reversal.' });
  }

  const db = getDb();
  const payment = db.payments.find((p) => p.id === req.params.id);
  if (!payment) {
    return res.status(404).json({ error: 'Payment record not found.' });
  }

  if (payment.status === 'reversed') {
    return res.status(400).json({ error: 'Payment is already reversed.' });
  }

  payment.status = 'reversed';
  payment.reversalReason = reason.trim();
  payment.reversedAt = new Date().toISOString();
  payment.reversedBy = req.admin!.fullName;
  payment.updatedAt = new Date().toISOString();

  saveDb(db);
  syncInvoiceStatuses();

  logAudit(
    req.admin!.id,
    req.admin!.fullName,
    'PAYMENT_REVERSED',
    'payment',
    payment.id,
    `Reversed payment ${payment.id} of ${payment.amount} ${payment.currency}. Reason: ${payment.reversalReason}`
  );

  res.json({ success: true, payment });
});

// ================= 7. MESSAGING & SMS ETHIOPIA =================
app.get('/api/messages/logs', requireAuth, (req, res) => {
  const db = getDb();
  res.json({ logs: db.messageLogs });
});

app.post('/api/messages/:id/retry', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await retryMessage(req.params.id);
    logAudit(
      req.admin!.id,
      req.admin!.fullName,
      'MESSAGE_RETRIED',
      'notification',
      req.params.id,
      `Manually retried dispatch for message ${req.params.id} (Result: ${result.status})`
    );
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/messages/send-test', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: 'Recipient phone number and test message are required.' });
  }

  const db = getDb();
  const result = await queueAndSendSms({
    customerId: 'TEST',
    customerName: 'Test Recipient',
    recipient: phone,
    messageType: 'test',
    content: message,
  });

  logAudit(
    req.admin!.id,
    req.admin!.fullName,
    'TEST_SMS_SENT',
    'notification',
    result.messageId,
    `Sent test SMS to ${phone} (Status: ${result.status})`
  );

  res.json(result);
});

app.get('/api/templates', requireAuth, (req, res) => {
  const db = getDb();
  res.json({ templates: db.templates });
});

app.put('/api/templates/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const tmpl = db.templates.find((t) => t.id === req.params.id);
  if (!tmpl) {
    return res.status(404).json({ error: 'Template not found.' });
  }

  const { bodyTemplate, subject, name } = req.body;
  if (bodyTemplate) tmpl.bodyTemplate = bodyTemplate;
  if (subject !== undefined) tmpl.subject = subject;
  if (name) tmpl.name = name;
  tmpl.updatedAt = new Date().toISOString();

  saveDb(db);

  logAudit(
    req.admin!.id,
    req.admin!.fullName,
    'TEMPLATE_UPDATED',
    'notification',
    tmpl.id,
    `Updated message template ${tmpl.name}`
  );

  res.json({ template: tmpl });
});

// ================= 8. SETTINGS & SCHEDULER =================
app.get('/api/settings', requireAuth, (req, res) => {
  const db = getDb();
  const settingsCopy = JSON.parse(JSON.stringify(db.settings));
  // Mask sensitive API Key for security
  if (settingsCopy.sms.apiKey) {
    const key = settingsCopy.sms.apiKey;
    settingsCopy.sms.apiKeyMasked = key.length > 8 ? `${key.slice(0, 4)}••••••••${key.slice(-4)}` : '••••••••';
    settingsCopy.sms.hasApiKey = true;
  } else {
    settingsCopy.sms.apiKeyMasked = '';
    settingsCopy.sms.hasApiKey = false;
  }
  // Never expose raw API key to client unless user updates it
  settingsCopy.sms.apiKey = '';
  res.json({ settings: settingsCopy });
});

app.put('/api/settings', requireAuth, (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const { general, sms, email, reminders } = req.body;

  if (general) {
    db.settings.general = {
      ...db.settings.general,
      ...general,
      inactivityTimeoutMinutes: Number(general.inactivityTimeoutMinutes) || 60,
    };
  }

  if (sms) {
    const existingKey = db.settings.sms.apiKey;
    db.settings.sms = {
      ...db.settings.sms,
      ...sms,
      // If client didn't supply a new apiKey, preserve existing key
      apiKey: sms.apiKey && sms.apiKey.trim() !== '' ? sms.apiKey.trim() : existingKey,
    };
  }

  if (email) {
    db.settings.email = {
      ...db.settings.email,
      ...email,
    };
  }

  if (reminders) {
    db.settings.reminders = {
      ...db.settings.reminders,
      ...reminders,
    };
  }

  saveDb(db);

  logAudit(
    req.admin!.id,
    req.admin!.fullName,
    'SETTINGS_UPDATED',
    'settings',
    'SYSTEM',
    'Updated system configurations (SMS, general, or reminders)'
  );

  res.json({ success: true, message: 'Settings saved successfully.' });
});

app.post('/api/scheduler/run', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await runDomainReminderScheduler();
    logAudit(
      req.admin!.id,
      req.admin!.fullName,
      'SCHEDULER_EXECUTED',
      'settings',
      'SYSTEM',
      `Manual domain reminder cycle executed: ${result.remindersSent} sent, ${result.remindersSkipped} skipped`
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ================= 9. AUDIT LOGS & REPORTS =================
app.get('/api/audit-logs', requireAuth, (req, res) => {
  const db = getDb();
  const entityType = req.query.entityType as string;
  const search = ((req.query.search as string) || '').toLowerCase().trim();

  let list = db.auditLogs;
  if (entityType && entityType !== 'all') {
    list = list.filter((l) => l.entityType === entityType);
  }

  if (search) {
    list = list.filter(
      (l) =>
        l.details.toLowerCase().includes(search) ||
        l.action.toLowerCase().includes(search) ||
        l.adminName.toLowerCase().includes(search)
    );
  }

  res.json({ logs: list.slice(0, 200) });
});

app.get('/api/reports', requireAuth, (req, res) => {
  const db = getDb();
  syncInvoiceStatuses();

  // Monthly revenue breakdown (last 6 months)
  const monthMap: Record<string, { month: string; invoiced: number; collected: number }> = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    monthMap[key] = { month: label, invoiced: 0, collected: 0 };
  }

  for (const inv of db.invoices) {
    if (inv.status === 'cancelled') continue;
    const key = inv.issueDate.slice(0, 7);
    if (monthMap[key]) {
      monthMap[key].invoiced += inv.total;
    }
  }

  for (const pay of db.payments) {
    if (pay.status !== 'confirmed') continue;
    const key = pay.paymentDate.slice(0, 7);
    if (monthMap[key]) {
      monthMap[key].collected += pay.amount;
    }
  }

  const monthlyTrend = Object.values(monthMap);

  // SMS delivery stats
  const smsStats = {
    total: db.messageLogs.length,
    sent: db.messageLogs.filter((m) => m.status === 'sent').length,
    delivered: db.messageLogs.filter((m) => m.status === 'delivered').length,
    failed: db.messageLogs.filter((m) => m.status === 'failed').length,
    queued: db.messageLogs.filter((m) => m.status === 'queued').length,
  };

  // Domain health
  const domainHealth = {
    total: db.domains.length,
    active: db.domains.filter((d) => d.status === 'active' || d.status === 'renewed').length,
    expiringSoon: db.domains.filter((d) => {
      const days = getDaysRemaining(d.expirationDate);
      return days >= 0 && days <= 30 && d.status !== 'cancelled';
    }).length,
    expired: db.domains.filter((d) => {
      const days = getDaysRemaining(d.expirationDate);
      return days < 0 && d.status !== 'cancelled';
    }).length,
  };

  res.json({
    monthlyTrend,
    smsStats,
    domainHealth,
    financials: computeSystemFinancials(),
  });
});

// ================= 10. BACKUP & EXPORTS =================
app.get('/api/backup/download', requireAuth, (req, res) => {
  const db = getDb();
  const backupData = JSON.stringify(db, null, 2);
  const filename = `nexgrid-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(backupData);
});

app.post('/api/backup/restore', requireAuth, (req: AuthenticatedRequest, res) => {
  const uploaded = req.body;

  if (
    !uploaded ||
    !Array.isArray(uploaded.customers) ||
    !Array.isArray(uploaded.domains) ||
    !Array.isArray(uploaded.invoices) ||
    !Array.isArray(uploaded.payments)
  ) {
    return res.status(400).json({ error: 'Invalid backup file structure.' });
  }

  // Preserve existing admin login credentials if needed or merge safely
  const db = getDb();
  const currentAdmins = db.admins;

  const restoredSchema: DatabaseSchema = {
    admins: uploaded.admins && uploaded.admins.length > 0 ? uploaded.admins : currentAdmins,
    customers: uploaded.customers,
    domains: uploaded.domains,
    invoices: uploaded.invoices,
    quotations: uploaded.quotations || [],
    payments: uploaded.payments,
    templates: uploaded.templates || db.templates,
    messageLogs: uploaded.messageLogs || [],
    auditLogs: uploaded.auditLogs || [],
    settings: uploaded.settings || db.settings,
  };

  saveDb(restoredSchema);

  logAudit(
    req.admin!.id,
    req.admin!.fullName,
    'DATABASE_RESTORED',
    'backup',
    'SYSTEM',
    `Database restored from backup file containing ${restoredSchema.customers.length} customers, ${restoredSchema.domains.length} domains, ${restoredSchema.payments.length} payments.`
  );

  res.json({
    success: true,
    message: 'Database restored successfully.',
    counts: {
      customers: restoredSchema.customers.length,
      domains: restoredSchema.domains.length,
      invoices: restoredSchema.invoices.length,
      payments: restoredSchema.payments.length,
    },
  });
});

// Factory Data Reset with Administrator Authorization & Secure Backup
app.post('/api/settings/factory-reset', requireAuth, (req: AuthenticatedRequest, res) => {
  const { confirmationText, password } = req.body;
  if (confirmationText !== 'RESET APPLICATION DATA') {
    return res.status(400).json({ error: 'Confirmation phrase must exactly match "RESET APPLICATION DATA".' });
  }

  const db = getDb();
  const admin = db.admins.find((a) => a.id === req.admin!.id);
  if (!admin || !verifyPassword(password || '', admin.passwordHash, admin.salt)) {
    return res.status(401).json({ error: 'Invalid administrator password. Reset aborted.' });
  }

  // Create immediate timestamped restorable backup before destructive operation
  const dataDir = path.resolve(process.cwd(), 'data');
  const backupName = `backup_before_factory_reset_${Date.now()}.json`;
  try {
    fs.writeFileSync(path.join(dataDir, backupName), JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to create pre-reset backup:', err);
  }

  resetAllApplicationData();
  res.json({
    success: true,
    message: 'All application data and accounts have been permanently wiped. First-run administrator setup is now required.',
  });
});

// CSV Exports
app.get('/api/export/csv/:entity', requireAuth, (req, res) => {
  const db = getDb();
  const entity = req.params.entity;

  let csvContent = '';
  let filename = `nexgrid-${entity}-${new Date().toISOString().slice(0, 10)}.csv`;

  if (entity === 'customers') {
    csvContent = 'ID,Business Name,Contact Person,Phone,Email,Status,Created At\n';
    csvContent += db.customers
      .map(
        (c) =>
          `"${c.id}","${c.businessName}","${c.contactPerson}","${c.phone}","${c.email}","${c.status}","${c.createdAt.slice(0, 10)}"`
      )
      .join('\n');
  } else if (entity === 'domains') {
    csvContent = 'ID,Customer ID,Domain Name,Registration Date,Expiration Date,Days Remaining,Renewal Price,Registrar,Status\n';
    csvContent += db.domains
      .map((d) => {
        const days = getDaysRemaining(d.expirationDate);
        return `"${d.id}","${d.customerId}","${d.domainName}","${d.registrationDate.slice(0, 10)}","${d.expirationDate.slice(0, 10)}",${days},${d.renewalPrice},"${d.registrar || ''}","${d.status}"`;
      })
      .join('\n');
  } else if (entity === 'invoices') {
    csvContent = 'Invoice Number,Customer ID,Issue Date,Due Date,Subtotal,Tax,Discount,Total,Currency,Status\n';
    csvContent += db.invoices
      .map(
        (i) =>
          `"${i.id}","${i.customerId}","${i.issueDate}","${i.dueDate}",${i.subtotal},${i.taxAmount},${i.discountAmount},${i.total},"${i.currency}","${i.status}"`
      )
      .join('\n');
  } else if (entity === 'payments') {
    csvContent = 'Payment ID,Customer ID,Invoice ID,Amount,Currency,Payment Date,Payment Method,Reference Number,Status,Recorded By\n';
    csvContent += db.payments
      .map(
        (p) =>
          `"${p.id}","${p.customerId}","${p.invoiceId || ''}",${p.amount},"${p.currency}","${p.paymentDate.slice(0, 10)}","${p.paymentMethod}","${p.referenceNumber || ''}","${p.status}","${p.recordedBy}"`
      )
      .join('\n');
  } else {
    return res.status(400).json({ error: 'Unknown export entity.' });
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csvContent);
});

// ================= VITE DEV / PRODUCTION INTEGRATION =================
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';
  const httpServer = http.createServer(app);

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`NexGrid Admin Portal server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server start error:', err);
});
