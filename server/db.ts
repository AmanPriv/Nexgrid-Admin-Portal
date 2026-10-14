import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  createSecurePasswordHash,
  verifySecurePassword,
} from './security.ts';

export interface Admin {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  salt: string;
  fullName: string;
  role: 'super_admin' | 'admin';
  createdAt: string;
  lastLoginAt: string | null;
  mfaEnabled: boolean;
  mfaSecret?: string | null;
  mfaRecoveryCodeHashes?: string[];
  lastTotpStep?: number;
  resetTokenHash?: string | null;
  resetTokenExpires?: string | null;
}

export interface Customer {
  id: string;
  businessName: string;
  contactPerson: string;
  phone: string;
  email: string;
  billingAddress?: string;
  notes?: string;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface DomainRenewalHistory {
  id: string;
  date: string;
  previousExpDate: string;
  newExpDate: string;
  renewalPrice: number;
  periodYears: number;
  recordedBy: string;
  notes?: string;
}

export interface Domain {
  id: string;
  customerId: string;
  domainName: string;
  registrationDate: string;
  expirationDate: string;
  renewalPrice: number;
  registrationPeriodYears: number;
  registrar?: string;
  status: 'active' | 'expiring_soon' | 'expired' | 'renewed' | 'cancelled';
  notes?: string;
  renewalHistory: DomainRenewalHistory[];
  lastReminderSentAt?: string;
  sentReminderIntervals?: number[];
  createdAt: string;
  updatedAt: string;
}

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Invoice {
  id: string;
  customerId: string;
  quotationId?: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  items: LineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  notes?: string;
  paymentInstructions?: string;
  terms?: string;
  status: 'draft' | 'unpaid' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

export interface Quotation {
  id: string;
  customerId: string;
  convertedInvoiceId?: string;
  issueDate: string;
  validUntil: string;
  currency: string;
  items: LineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  notes?: string;
  paymentInstructions?: string;
  terms?: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  customerId: string;
  invoiceId?: string;
  amount: number;
  currency: string;
  paymentDate: string;
  paymentMethod: 'bank_transfer' | 'cash' | 'telebirr' | 'cbe_birr' | 'check' | 'other';
  referenceNumber?: string;
  notes?: string;
  recordedBy: string;
  status: 'pending' | 'confirmed' | 'failed' | 'reversed';
  reversalReason?: string;
  reversedAt?: string;
  reversedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageTemplate {
  id: string;
  type: 'welcome' | 'domain_reminder' | 'payment_confirmation' | 'invoice_reminder';
  channel: 'sms' | 'email';
  name: string;
  subject?: string;
  bodyTemplate: string;
  variables: string[];
  updatedAt: string;
}

export interface MessageLog {
  id: string;
  customerId: string;
  customerName?: string;
  recipient: string;
  channel: 'sms' | 'email';
  messageType: 'welcome' | 'domain_reminder' | 'payment_confirmation' | 'invoice_reminder' | 'test' | 'custom';
  content: string;
  subject?: string;
  providerReference?: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed';
  errorDetails?: string;
  attemptCount: number;
  lastAttemptAt: string;
  scheduledFor?: string;
  domainId?: string;
  reminderInterval?: number;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  adminId: string;
  adminName: string;
  action: string;
  entityType: 'customer' | 'domain' | 'payment' | 'invoice' | 'quotation' | 'settings' | 'auth' | 'notification' | 'backup';
  entityId: string;
  details: string;
  ipAddress?: string;
}

export interface AppSettings {
  general: {
    businessName: string;
    businessContact: string;
    businessEmail: string;
    businessPhone: string;
    businessAddress: string;
    tinNumber: string;
    currency: string;
    timezone: string;
    inactivityTimeoutMinutes: number;
  };
  sms: {
    provider: 'sms_et';
    apiEndpoint: string;
    apiKey: string;
    senderId: string;
    enabled: boolean;
    autoWelcome: boolean;
    autoPaymentConfirm: boolean;
    autoDomainReminders: boolean;
    autoInvoiceReminders: boolean;
    deliveryMode?: 'direct' | 'resilient';
  };
  email: {
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPass: string;
    fromEmail: string;
    fromName: string;
    enabled: boolean;
  };
  reminders: {
    domainReminderDays: number[];
    invoiceReminderDays: number[];
    lastSchedulerRun: string | null;
  };
}

export interface Session {
  id: string;
  token: string;
  adminId: string;
  ipAddress: string;
  userAgent: string;
  createdAt: number;
  lastActiveAt: number;
  csrfToken: string;
}

export interface DatabaseSchema {
  admins: Admin[];
  customers: Customer[];
  domains: Domain[];
  invoices: Invoice[];
  quotations: Quotation[];
  payments: Payment[];
  templates: MessageTemplate[];
  messageLogs: MessageLog[];
  auditLogs: AuditLog[];
  settings: AppSettings;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'nexgrid_db.json');

// Memory cache of DB for fast queries and ACID serial writes
let dbCache: DatabaseSchema | null = null;
const sessions: Map<string, Session> = new Map();

// Temporary tokens for MFA 2nd step verification (valid for 5 minutes)
export interface PendingMfaSession {
  mfaToken: string;
  adminId: string;
  expiresAt: number;
  ipAddress: string;
  userAgent: string;
}
const pendingMfaSessions = new Map<string, PendingMfaSession>();

export function createPasswordHash(password: string) {
  return createSecurePasswordHash(password);
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  return verifySecurePassword(password, hash, salt);
}

export const defaultTemplates: MessageTemplate[] = [
  {
    id: 'tmpl-welcome-sms',
    type: 'welcome',
    channel: 'sms',
    name: 'Customer Welcome SMS',
    bodyTemplate: 'Hello [Customer Name], welcome to NexGrid Digital Systems! Thank you for choosing our services. For assistance, please contact us at [Business Contact].',
    variables: ['[Customer Name]', '[Business Contact]', '[Business Phone]', '[Business Email]'],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'tmpl-domain-reminder-sms',
    type: 'domain_reminder',
    channel: 'sms',
    name: 'Domain Expiration Reminder SMS',
    bodyTemplate: 'Hello [Customer Name], your domain [Domain Name] is scheduled to expire on [Expiration Date] ([Days Remaining] days left). Renewal price: [Amount] [Currency]. Please contact NexGrid Digital Systems to arrange renewal.',
    variables: ['[Customer Name]', '[Domain Name]', '[Expiration Date]', '[Days Remaining]', '[Amount]', '[Currency]', '[Business Contact]'],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'tmpl-payment-confirm-sms',
    type: 'payment_confirmation',
    channel: 'sms',
    name: 'Payment Confirmation SMS',
    bodyTemplate: 'Hello [Customer Name], we have confirmed your payment of [Amount] [Currency] received on [Payment Date] for [Service/Invoice Number]. Remaining balance: [Balance] [Currency]. Thank you for choosing NexGrid Digital Systems.',
    variables: ['[Customer Name]', '[Amount]', '[Currency]', '[Payment Date]', '[Service/Invoice Number]', '[Balance]'],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'tmpl-invoice-reminder-sms',
    type: 'invoice_reminder',
    channel: 'sms',
    name: 'Invoice Payment Reminder SMS',
    bodyTemplate: 'Hello [Customer Name], this is a reminder from NexGrid Digital Systems regarding invoice [Invoice Number] for [Amount] [Currency], due on [Due Date]. Please arrange payment to avoid service disruption.',
    variables: ['[Customer Name]', '[Invoice Number]', '[Amount]', '[Currency]', '[Due Date]', '[Business Contact]'],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'tmpl-welcome-email',
    type: 'welcome',
    channel: 'email',
    name: 'Customer Welcome Email',
    subject: 'Welcome to NexGrid Digital Systems',
    bodyTemplate: 'Dear [Customer Name],\n\nWelcome to NexGrid Digital Systems! We are pleased to provide enterprise digital solutions, cloud infrastructure, and domain management services for your business.\n\nShould you require any assistance, please reach out to our support team at [Business Contact] or [Business Email].\n\nBest regards,\nNexGrid Digital Systems Management Team',
    variables: ['[Customer Name]', '[Business Contact]', '[Business Email]', '[Business Phone]'],
    updatedAt: new Date().toISOString(),
  },
];

export const defaultSettings: AppSettings = {
  general: {
    businessName: 'NexGrid Digital Systems',
    businessContact: '+251 911 234 567',
    businessEmail: 'support@nexgrid.et',
    businessPhone: '+251 911 234 567',
    businessAddress: 'Bole Medhanialem, Commercial Center 4th Floor, Addis Ababa, Ethiopia',
    tinNumber: '0054892147',
    currency: 'ETB',
    timezone: 'Africa/Addis_Ababa',
    inactivityTimeoutMinutes: 60,
  },
  sms: {
    provider: 'sms_et',
    apiEndpoint: 'https://smsethiopia.com/api/sms/send',
    apiKey: '',
    senderId: 'NexGrid',
    enabled: true,
    autoWelcome: true,
    autoPaymentConfirm: true,
    autoDomainReminders: true,
    autoInvoiceReminders: true,
    deliveryMode: 'resilient',
  },
  email: {
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    smtpUser: 'notifications@nexgrid.et',
    smtpPass: '',
    fromEmail: 'notifications@nexgrid.et',
    fromName: 'NexGrid Digital Systems',
    enabled: false,
  },
  reminders: {
    domainReminderDays: [30, 14, 7, 3, 1],
    invoiceReminderDays: [7, 3, 1, -1, -3],
    lastSchedulerRun: null,
  },
};

/**
 * Clean, empty database schema with NO demo records and NO default accounts.
 */
export function getEmptyInitialDb(): DatabaseSchema {
  return {
    admins: [],
    customers: [],
    domains: [],
    invoices: [],
    quotations: [],
    payments: [],
    templates: defaultTemplates,
    messageLogs: [],
    auditLogs: [
      {
        id: `AUD-${Date.now()}-INIT`,
        timestamp: new Date().toISOString(),
        adminId: 'SYSTEM',
        adminName: 'Security Engine',
        action: 'DATA_RESET_PERFORMED',
        entityType: 'backup',
        entityId: 'SYSTEM',
        details: 'Full application data reset performed. Zero demo accounts, zero business records. First-administrator setup required.',
      },
    ],
    settings: defaultSettings,
  };
}

export function getDb(): DatabaseSchema {
  if (dbCache) {
    return dbCache;
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (fs.existsSync(DB_FILE)) {
    try {
      const data = fs.readFileSync(DB_FILE, 'utf-8');
      dbCache = JSON.parse(data) as DatabaseSchema;
      // Guarantee structural integrity
      if (!Array.isArray(dbCache.admins)) dbCache.admins = [];
      if (!Array.isArray(dbCache.customers)) dbCache.customers = [];
      if (!Array.isArray(dbCache.domains)) dbCache.domains = [];
      if (!Array.isArray(dbCache.invoices)) dbCache.invoices = [];
      if (!Array.isArray(dbCache.quotations)) dbCache.quotations = [];
      if (!Array.isArray(dbCache.payments)) dbCache.payments = [];
      if (!Array.isArray(dbCache.templates)) dbCache.templates = defaultTemplates;
      if (!Array.isArray(dbCache.messageLogs)) dbCache.messageLogs = [];
      if (!Array.isArray(dbCache.auditLogs)) dbCache.auditLogs = [];
      if (!dbCache.settings) {
        dbCache.settings = defaultSettings;
      } else {
        if (!dbCache.settings.sms.apiEndpoint || dbCache.settings.sms.apiEndpoint.includes('sms.et')) {
          dbCache.settings.sms.apiEndpoint = 'https://smsethiopia.com/api/sms/send';
        }
        if (!dbCache.settings.sms.deliveryMode) {
          dbCache.settings.sms.deliveryMode = 'resilient';
        }
      }
      return dbCache;
    } catch (err) {
      console.error('Error reading DB file, creating empty schema:', err);
    }
  }

  const empty = getEmptyInitialDb();
  dbCache = empty;
  saveDb(empty);
  return dbCache;
}

export function saveDb(data: DatabaseSchema): void {
  dbCache = data;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const tmpFile = `${DB_FILE}.tmp.${Date.now()}.${Math.floor(Math.random() * 1000)}`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DB_FILE);
}

/**
 * Permanently wipes all user, customer, domain, financial, message, and demo data.
 */
export function resetAllApplicationData(): void {
  // Clear all in-memory sessions
  sessions.clear();
  pendingMfaSessions.clear();

  const emptySchema = getEmptyInitialDb();
  saveDb(emptySchema);
  console.log('[SECURITY] All existing application records, sessions, and credentials have been permanently cleared.');
}

// ================= SESSION MANAGEMENT =================
export function createSession(
  adminId: string,
  ipAddress = '127.0.0.1',
  userAgent = 'Unknown'
): { token: string; csrfToken: string; session: Session } {
  const token = crypto.randomBytes(32).toString('hex');
  const csrfToken = crypto.randomBytes(24).toString('hex');
  const sessionId = `SES-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  const session: Session = {
    id: sessionId,
    token,
    adminId,
    ipAddress,
    userAgent,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    csrfToken,
  };

  sessions.set(token, session);
  return { token, csrfToken, session };
}

export function getSession(token: string, timeoutMinutes = 60): Session | null {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;

  const now = Date.now();
  const maxIdleMs = timeoutMinutes * 60 * 1000;
  const maxAbsoluteMs = 12 * 60 * 60 * 1000; // 12 hours absolute maximum session lifetime

  // Check 60-minute inactivity timeout
  if (now - session.lastActiveAt > maxIdleMs) {
    sessions.delete(token);
    return null;
  }

  // Check absolute maximum session lifetime
  if (now - session.createdAt > maxAbsoluteMs) {
    sessions.delete(token);
    return null;
  }

  return session;
}

export function touchSession(token: string): void {
  const session = sessions.get(token);
  if (session) {
    session.lastActiveAt = Date.now();
  }
}

export function invalidateSession(token: string): void {
  sessions.delete(token);
}

export function revokeSessionById(sessionId: string, adminId: string): boolean {
  for (const [token, session] of sessions.entries()) {
    if (session.id === sessionId && session.adminId === adminId) {
      sessions.delete(token);
      return true;
    }
  }
  return false;
}

export function revokeAllSessionsForAdmin(adminId: string, exceptToken?: string): number {
  let count = 0;
  for (const [token, session] of sessions.entries()) {
    if (session.adminId === adminId && token !== exceptToken) {
      sessions.delete(token);
      count++;
    }
  }
  return count;
}

export function listActiveSessions(adminId: string, currentToken?: string) {
  const list = [];
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (session.adminId === adminId) {
      list.push({
        id: session.id,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        createdAt: new Date(session.createdAt).toISOString(),
        lastActiveAt: new Date(session.lastActiveAt).toISOString(),
        isCurrent: token === currentToken,
        idleMinutes: Math.floor((now - session.lastActiveAt) / 60000),
      });
    }
  }
  return list;
}

// Temporary MFA pending sessions
export function createPendingMfaSession(adminId: string, ipAddress: string, userAgent: string): string {
  const mfaToken = crypto.randomBytes(32).toString('hex');
  pendingMfaSessions.set(mfaToken, {
    mfaToken,
    adminId,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 min TTL
    ipAddress,
    userAgent,
  });
  return mfaToken;
}

export function getPendingMfaSession(mfaToken: string): PendingMfaSession | null {
  const record = pendingMfaSessions.get(mfaToken);
  if (!record) return null;
  if (Date.now() > record.expiresAt) {
    pendingMfaSessions.delete(mfaToken);
    return null;
  }
  return record;
}

export function consumePendingMfaSession(mfaToken: string): void {
  pendingMfaSessions.delete(mfaToken);
}

export function logAudit(
  adminId: string,
  adminName: string,
  action: string,
  entityType: AuditLog['entityType'],
  entityId: string,
  details: string,
  ipAddress?: string
): void {
  const db = getDb();
  const entry: AuditLog = {
    id: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    adminId,
    adminName,
    action,
    entityType,
    entityId,
    details,
    ipAddress,
  };
  db.auditLogs.unshift(entry);
  if (db.auditLogs.length > 2000) {
    db.auditLogs = db.auditLogs.slice(0, 2000);
  }
  saveDb(db);
}
