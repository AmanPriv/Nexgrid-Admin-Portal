import {
  AdminUser,
  Customer,
  Domain,
  Invoice,
  Quotation,
  Payment,
  MessageLog,
  MessageTemplate,
  AuditLog,
  AppSettings,
} from '../types.ts';
import { pushCloudDatabaseState, pullCloudDatabaseState } from './cloudSyncEngine.ts';

const STATIC_DB_KEY = 'nexgrid_cms_production_db_v2';
const STATIC_SESSION_KEY = 'nexgrid_cms_active_admin_id';

interface StoredAdmin extends AdminUser {
  passwordHash: string;
}

interface StaticDatabase {
  admins: StoredAdmin[];
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

const defaultTemplates: MessageTemplate[] = [
  {
    id: 'tmpl-welcome-sms',
    type: 'welcome',
    channel: 'sms',
    name: 'Customer Welcome SMS',
    bodyTemplate:
      'Hello [Customer Name], welcome to NexGrid Digital Systems! Thank you for choosing our services. For assistance, please contact us at [Business Contact].',
    variables: ['[Customer Name]', '[Business Contact]', '[Business Phone]', '[Business Email]'],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'tmpl-domain-reminder-sms',
    type: 'domain_reminder',
    channel: 'sms',
    name: 'Domain Expiration Reminder SMS',
    bodyTemplate:
      'Hello [Customer Name], your domain [Domain Name] is scheduled to expire on [Expiration Date] ([Days Remaining] days left). Renewal price: [Amount] [Currency]. Please contact NexGrid Digital Systems to arrange renewal.',
    variables: [
      '[Customer Name]',
      '[Domain Name]',
      '[Expiration Date]',
      '[Days Remaining]',
      '[Amount]',
      '[Currency]',
      '[Business Contact]',
    ],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'tmpl-payment-confirm-sms',
    type: 'payment_confirmation',
    channel: 'sms',
    name: 'Payment Confirmation SMS',
    bodyTemplate:
      'Hello [Customer Name], we have confirmed your payment of [Amount] [Currency] received on [Payment Date] for [Service/Invoice Number]. Remaining balance: [Balance] [Currency]. Thank you for choosing NexGrid Digital Systems.',
    variables: [
      '[Customer Name]',
      '[Amount]',
      '[Currency]',
      '[Payment Date]',
      '[Service/Invoice Number]',
      '[Balance]',
    ],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'tmpl-invoice-reminder-sms',
    type: 'invoice_reminder',
    channel: 'sms',
    name: 'Invoice Payment Reminder SMS',
    bodyTemplate:
      'Hello [Customer Name], this is a reminder from NexGrid Digital Systems regarding invoice [Invoice Number] for [Amount] [Currency], due on [Due Date]. Please arrange payment to avoid service disruption.',
    variables: [
      '[Customer Name]',
      '[Invoice Number]',
      '[Amount]',
      '[Currency]',
      '[Due Date]',
      '[Business Contact]',
    ],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'tmpl-welcome-email',
    type: 'welcome',
    channel: 'email',
    name: 'Customer Welcome Email',
    subject: 'Welcome to NexGrid Digital Systems',
    bodyTemplate:
      'Dear [Customer Name],\n\nWelcome to NexGrid Digital Systems! We are pleased to provide enterprise digital solutions, cloud infrastructure, and domain management services for your business.\n\nShould you require any assistance, please reach out to our support team at [Business Contact] or [Business Email].\n\nBest regards,\nNexGrid Digital Systems Management Team',
    variables: ['[Customer Name]', '[Business Contact]', '[Business Email]', '[Business Phone]'],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'tmpl-domain-reminder-email',
    type: 'domain_reminder',
    channel: 'email',
    name: 'Domain Expiration Reminder Email',
    subject: 'Domain Renewal Notice: [Domain Name] ([Days Remaining] Days Remaining)',
    bodyTemplate:
      'Dear [Customer Name],\n\nThis is an official reminder from NexGrid Digital Systems that your registered domain [Domain Name] is scheduled to expire on [Expiration Date] ([Days Remaining] days remaining).\n\nRenewal Fee: [Amount] [Currency]\nPayment Details: Commercial Bank of Ethiopia (CBE) — Account Name: NexGrid Digital Systems | Account No: 1000234567890 | Telebirr: +251 906697634\n\nPlease arrange renewal prior to the expiration date to ensure uninterrupted DNS and web services.\n\nBest regards,\nNexGrid Digital Systems',
    variables: ['[Customer Name]', '[Domain Name]', '[Expiration Date]', '[Days Remaining]', '[Amount]', '[Currency]', '[Business Contact]'],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'tmpl-payment-confirm-email',
    type: 'payment_confirmation',
    channel: 'email',
    name: 'Payment Confirmation Receipt Email',
    subject: 'Payment Receipt Confirmed — [Service/Invoice Number] (NexGrid Digital Systems)',
    bodyTemplate:
      'Dear [Customer Name],\n\nThank you for your payment! We have officially confirmed receipt of [Amount] [Currency] on [Payment Date] towards [Service/Invoice Number].\n\nRemaining Account Balance: [Balance] [Currency]\n\nWe appreciate your continued business with NexGrid Digital Systems.\n\nBest regards,\nNexGrid Digital Systems Finance & Billing',
    variables: ['[Customer Name]', '[Amount]', '[Currency]', '[Payment Date]', '[Service/Invoice Number]', '[Balance]'],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'tmpl-invoice-reminder-email',
    type: 'invoice_reminder',
    channel: 'email',
    name: 'Invoice Payment Reminder — [Invoice Number] (NexGrid Digital Systems)',
    subject: 'Invoice Payment Reminder: [Invoice Number] Due on [Due Date]',
    bodyTemplate:
      'Dear [Customer Name],\n\nThis is a friendly reminder regarding Invoice [Invoice Number] with an outstanding balance of [Amount] [Currency], due on [Due Date].\n\nBanking & Settlement Details:\n• Bank: Commercial Bank of Ethiopia (CBE)\n• Account Name: NexGrid Digital Systems\n• Account Number: 1000234567890\n• Telebirr / Mobile Money: +251 906697634\n\nPlease remit payment and share your transaction reference with us at [Business Email] or [Business Contact].\n\nBest regards,\nNexGrid Digital Systems Billing Team',
    variables: ['[Customer Name]', '[Invoice Number]', '[Amount]', '[Currency]', '[Due Date]', '[Business Contact]', '[Business Email]'],
    updatedAt: new Date().toISOString(),
  },
];

const defaultSettings: AppSettings = {
  general: {
    businessName: 'NexGrid Digital Systems',
    businessContact: '+251 906697634',
    businessEmail: 'nexgriddigital@gmail.com',
    businessPhone: '+251 906697634',
    businessAddress: 'Online',
    tinNumber: '0054892147',
    currency: 'ETB',
    timezone: 'Africa/Addis_Ababa',
    inactivityTimeoutMinutes: 60,
    bankName: 'Commercial Bank of Ethiopia (CBE)',
    bankAccountName: 'NexGrid Digital Systems',
    bankAccountNumber: '1000234567890',
    telebirrNumber: '+251 906697634',
    secondaryBankDetails: 'Telebirr / Mobile Money: +251 906697634',
    bankingDetails:
      'Bank: Commercial Bank of Ethiopia (CBE) | Account Name: NexGrid Digital Systems | Account No: 1000234567890 | Telebirr: +251 906697634',
  },
  sms: {
    provider: 'sms_et',
    apiEndpoint: 'https://smsethiopia.com/api/sms/send',
    apiKey: 'T2J1L49IRJHGGHN0Z6H71D332799EMHVF4P8A4KJ',
    senderId: '',
    enabled: true,
    autoWelcome: true,
    autoPaymentConfirm: true,
    autoDomainReminders: true,
    autoInvoiceReminders: true,
    hasApiKey: true,
    apiKeyMasked: 'T2J1••••••••A4KJ',
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

function getEmptyStaticDb(): StaticDatabase {
  return {
    admins: [],
    customers: [],
    domains: [],
    invoices: [],
    quotations: [],
    payments: [],
    templates: defaultTemplates,
    messageLogs: [],
    auditLogs: [],
    settings: JSON.parse(JSON.stringify(defaultSettings)),
  };
}

function loadDb(): StaticDatabase {
  try {
    const raw = localStorage.getItem(STATIC_DB_KEY);
    if (!raw) {
      const empty = getEmptyStaticDb();
      localStorage.setItem(STATIC_DB_KEY, JSON.stringify(empty));
      return empty;
    }
    const parsed = JSON.parse(raw) as StaticDatabase;
    if (!Array.isArray(parsed.admins)) parsed.admins = [];
    if (!Array.isArray(parsed.customers)) parsed.customers = [];
    if (!Array.isArray(parsed.domains)) parsed.domains = [];
    if (!Array.isArray(parsed.invoices)) parsed.invoices = [];
    if (!Array.isArray(parsed.quotations)) parsed.quotations = [];
    if (!Array.isArray(parsed.payments)) parsed.payments = [];
    if (!Array.isArray(parsed.templates)) {
      parsed.templates = defaultTemplates;
    } else {
      for (const dt of defaultTemplates) {
        if (!parsed.templates.some((t) => t.id === dt.id)) {
          parsed.templates.push(dt);
        }
      }
    }
    if (!Array.isArray(parsed.messageLogs)) parsed.messageLogs = [];
    if (!Array.isArray(parsed.auditLogs)) parsed.auditLogs = [];
    if (!parsed.settings) {
      parsed.settings = JSON.parse(JSON.stringify(defaultSettings));
    } else {
      let modified = false;
      if (
        !parsed.settings.sms?.apiKey ||
        parsed.settings.sms.apiKey === 'WF9AJSCJ04TVR94M5TNCC2ZSIHI2RNRH9Q05E52L'
      ) {
        parsed.settings.sms = {
          ...parsed.settings.sms,
          apiKey: 'T2J1L49IRJHGGHN0Z6H71D332799EMHVF4P8A4KJ',
          senderId: '',
          hasApiKey: true,
          apiKeyMasked: 'T2J1••••••••A4KJ',
        };
        modified = true;
      }
      const gen = parsed.settings.general;
      if (gen) {
        if (!gen.businessPhone || gen.businessPhone === '+251 911 234 567') {
          gen.businessPhone = '+251 906697634';
          gen.businessContact = '+251 906697634';
          modified = true;
        }
        if (!gen.businessEmail || gen.businessEmail === 'support@nexgrid.et') {
          gen.businessEmail = 'nexgriddigital@gmail.com';
          modified = true;
        }
        if (
          !gen.businessAddress ||
          gen.businessAddress.includes('Bole Medhanialem') ||
          gen.businessAddress === 'Addis Ababa, Ethiopia'
        ) {
          gen.businessAddress = 'Online';
          modified = true;
        }
        if (!gen.tinNumber) {
          gen.tinNumber = '0054892147';
          modified = true;
        }
        if (!gen.bankName) {
          gen.bankName = 'Commercial Bank of Ethiopia (CBE)';
          modified = true;
        }
        if (!gen.bankAccountName) {
          gen.bankAccountName = gen.businessName || 'NexGrid Digital Systems';
          modified = true;
        }
        if (!gen.bankAccountNumber) {
          gen.bankAccountNumber = '1000234567890';
          modified = true;
        }
        if (!gen.telebirrNumber) {
          gen.telebirrNumber = '+251 906697634';
          modified = true;
        }
        if (!gen.secondaryBankDetails) {
          gen.secondaryBankDetails = 'Telebirr / Mobile Money: +251 906697634';
          modified = true;
        }
        if (!gen.bankingDetails) {
          gen.bankingDetails = `Bank: ${gen.bankName} | Account Name: ${gen.bankAccountName} | Account No: ${gen.bankAccountNumber} | Telebirr: ${gen.telebirrNumber}`;
          modified = true;
        }
      }
      if (modified) {
        localStorage.setItem(STATIC_DB_KEY, JSON.stringify(parsed));
      }
    }
    return parsed;
  } catch {
    return getEmptyStaticDb();
  }
}

function saveDb(db: StaticDatabase) {
  localStorage.setItem(STATIC_DB_KEY, JSON.stringify(db));
  pushCloudDatabaseState(db).catch(() => {});
}

function hashPasswordSimple(pw: string): string {
  // Deterministic browser hash for static deployment mode
  let h1 = 0xdeadbeef ^ pw.length;
  let h2 = 0x41c6ce57 ^ pw.length;
  for (let i = 0, ch; i < pw.length; i++) {
    ch = pw.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `scrypt-static-${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`;
}

function formatMsisdn(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('2510') && digits.length === 13) return `251${digits.slice(4)}`;
  if (digits.startsWith('251') && digits.length >= 12) return digits.slice(0, 12);
  if ((digits.startsWith('09') || digits.startsWith('07')) && digits.length === 10) return `251${digits.slice(1)}`;
  if ((digits.startsWith('9') || digits.startsWith('7')) && digits.length === 9) return `251${digits}`;
  return digits;
}

function getDaysRemaining(expirationDateStr: string): number {
  const exp = new Date(expirationDateStr);
  const now = new Date();
  return Math.ceil((exp.getTime() - now.getTime()) / 86400000);
}

function addAudit(db: StaticDatabase, admin: StoredAdmin | null, action: string, entityType: AuditLog['entityType'], entityId: string, details: string) {
  db.auditLogs.unshift({
    id: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    adminId: admin?.id || 'SYSTEM',
    adminName: admin?.fullName || 'System',
    action,
    entityType,
    entityId,
    details,
    ipAddress: 'Browser Client',
  });
}

const CLOUD_SMS_RELAYS = [
  { url: '/api/public/sms-relay', credentials: 'same-origin' as RequestCredentials },
  {
    url: 'https://ais-dev-5pchhs56eemvp7uthhrevk-197503816635.europe-west2.run.app/api/public/sms-relay',
    credentials: 'include' as RequestCredentials,
  },
  {
    url: 'https://ais-pre-5pchhs56eemvp7uthhrevk-197503816635.europe-west2.run.app/api/public/sms-relay',
    credentials: 'omit' as RequestCredentials,
  },
];

const BRIDGE_REQUEST_TOPIC = 'nexgrid_sms_bridge_32da0e27_v1';

function dispatchViaNtfyRealtimeBridge(params: {
  endpoint: string;
  apiKey: string;
  msisdn: string;
  text: string;
  senderId?: string;
}): Promise<{ ok: boolean; httpStatus: number; latencyMs: number; data: any }> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const reqId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const replyTopic = `nexgrid_sms_rep_${reqId}`;
    let settled = false;
    let published = false;
    const abortCtrl = new AbortController();

    const cleanup = () => {
      try {
        abortCtrl.abort();
      } catch {
        // ignore
      }
    };

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error('Gateway bridge timed out waiting for carrier response.'));
      }
    }, 10000);

    const handleIncomingJsonLine = (line: string) => {
      if (settled || !line.trim()) return;
      try {
        const outer = JSON.parse(line.trim());
        if (outer.event === 'open') {
          publishRequest();
          return;
        }
        if (outer.event === 'message' && typeof outer.message === 'string') {
          const payload = JSON.parse(outer.message);
          if (payload && (payload.reqId === reqId || payload.httpStatus !== undefined)) {
            settled = true;
            clearTimeout(timer);
            cleanup();
            resolve({
              ok: Boolean(payload.ok),
              httpStatus: payload.httpStatus || 200,
              latencyMs: payload.latencyMs || Date.now() - startTime,
              data: payload.data || payload,
            });
          }
        }
      } catch {
        // ignore partial or non-json lines
      }
    };

    const publishRequest = () => {
      if (published || settled) return;
      published = true;
      // Simple POST request (no custom headers -> no CORS OPTIONS preflight -> 100% browser compatible)
      fetch(`https://ntfy.sh/${BRIDGE_REQUEST_TOPIC}`, {
        method: 'POST',
        body: JSON.stringify({
          reqId,
          replyTopic,
          msisdn: params.msisdn,
          text: params.text,
          senderId: params.senderId || '',
          apiKey: params.apiKey,
          endpoint: params.endpoint,
        }),
      }).catch((err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          cleanup();
          reject(err);
        }
      });
    };

    // Start streaming NDJSON subscription on replyTopic (CORS Access-Control-Allow-Origin: *)
    fetch(`https://ntfy.sh/${replyTopic}/json`, {
      method: 'GET',
      signal: abortCtrl.signal,
    })
      .then(async (res) => {
        if (!res.body) {
          publishRequest();
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (!settled) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';
          for (const l of lines) {
            handleIncomingJsonLine(l);
          }
        }
      })
      .catch((err) => {
        if (!settled && err.name !== 'AbortError') {
          settled = true;
          clearTimeout(timer);
          cleanup();
          reject(err);
        }
      });

    // Safety fallback if open event takes >300ms
    setTimeout(publishRequest, 300);
  });
}

async function dispatchSmsViaRelayOrDirect(params: {
  endpoint: string;
  apiKey: string;
  msisdn: string;
  text: string;
  senderId?: string;
}): Promise<{ ok: boolean; httpStatus: number; latencyMs: number; data: any }> {
  const startTime = Date.now();
  const isGithubPages =
    typeof window !== 'undefined' && window.location.hostname.endsWith('.github.io');
  const customApiBase = (localStorage.getItem('nexgrid_custom_api_url') || '').trim().replace(/\/$/, '');

  // If on GitHub Pages without a custom API URL, use the real-time CORS-free ntfy.sh bridge first!
  if (isGithubPages && !customApiBase) {
    try {
      return await dispatchViaNtfyRealtimeBridge(params);
    } catch {
      // fall through to backup relays
    }
  }

  const relays = customApiBase
    ? [{ url: `${customApiBase}/api/public/sms-relay`, credentials: 'omit' as RequestCredentials }, ...CLOUD_SMS_RELAYS]
    : CLOUD_SMS_RELAYS;

  // 1. Try HTTP relay endpoints
  for (const relay of relays) {
    if (relay.url.startsWith('/') && isGithubPages) {
      continue;
    }
    try {
      const res = await fetch(relay.url, {
        method: 'POST',
        credentials: relay.credentials,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: params.endpoint,
          apiKey: params.apiKey,
          msisdn: params.msisdn,
          text: params.text,
          senderId: params.senderId || '',
        }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json') && res.status !== 502 && res.status !== 503 && res.status !== 404) {
        const json = await res.json().catch(() => ({}));
        return {
          ok: Boolean(json.success),
          httpStatus: json.httpStatus || res.status,
          latencyMs: json.latencyMs || Date.now() - startTime,
          data: json.data || json,
        };
      }
    } catch {
      // try next relay
    }
  }

  // 2. Try real-time ntfy.sh bridge if not already tried
  if (!isGithubPages || customApiBase) {
    try {
      return await dispatchViaNtfyRealtimeBridge(params);
    } catch {
      // fall through
    }
  }

  // 3. Final fallback to direct fetch
  const payload: Record<string, any> = { msisdn: params.msisdn, text: params.text };
  if (params.senderId) payload.sender_id = params.senderId;

  const res = await fetch(params.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      KEY: params.apiKey,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return {
    ok: res.ok,
    httpStatus: res.status,
    latencyMs: Date.now() - startTime,
    data,
  };
}

async function sendSmsBrowser(
  db: StaticDatabase,
  recipient: string,
  content: string,
  customerId = 'DIRECT',
  customerName = 'Direct Recipient',
  messageType: MessageLog['messageType'] = 'custom'
) {
  const msisdn = formatMsisdn(recipient);
  const cleanKey = (db.settings.sms.apiKey || 'T2J1L49IRJHGGHN0Z6H71D332799EMHVF4P8A4KJ').trim();
  const endpoint = db.settings.sms.apiEndpoint?.trim() || 'https://smsethiopia.com/api/sms/send';
  const customSender = (db.settings.sms.senderId || '').trim();
  const useCustomSender =
    customSender !== '' &&
    customSender.toLowerCase() !== 'default' &&
    customSender.toLowerCase() !== 'nexgrid';

  const log: MessageLog = {
    id: `MSG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    customerId,
    customerName,
    recipient,
    channel: 'sms',
    messageType,
    content,
    status: 'queued',
    attemptCount: 1,
    lastAttemptAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  try {
    const result = await dispatchSmsViaRelayOrDirect({
      endpoint,
      apiKey: cleanKey,
      msisdn,
      text: content,
      senderId: useCustomSender ? customSender : '',
    });

    const data = result.data;
    if (result.ok) {
      log.status = 'sent';
      log.providerReference = String(data?.id ?? data?.message_id ?? `SMSET-${Date.now()}`);
    } else {
      log.status = 'failed';
      const isWhitelist =
        data?.error_code === 10007 ||
        data?.status === 'DEFAULT_CAMPAIGN_RECIPIENT_NOT_WHITELISTED';
      log.errorDetails = isWhitelist
        ? `Default Campaign Whitelist Required (Code 10007): Recipient ${msisdn} is not yet whitelisted in your SMS Ethiopia Default Campaign.`
        : data?.error_message || data?.message || `Gateway returned HTTP ${result.httpStatus}`;
    }
  } catch (err: any) {
    log.status = 'failed';
    log.errorDetails = `SMS Gateway connection error: ${err.message}`;
  }

  db.messageLogs.unshift(log);
  saveDb(db);

  return {
    success: log.status === 'sent' || log.status === 'delivered',
    status: log.status,
    messageId: log.id,
    error: log.errorDetails,
  };
}

export async function handleStaticApiRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body && typeof options.body === 'string' ? JSON.parse(options.body) : {};
  const urlObj = new URL(endpoint, 'http://localhost');
  const pathname = urlObj.pathname;

  if (pathname === '/api/auth/setup-status' || pathname === '/api/auth/login' || pathname === '/api/auth/firebase-google') {
    await pullCloudDatabaseState().catch(() => {});
  }

  const db = loadDb();

  const activeAdminId = localStorage.getItem(STATIC_SESSION_KEY);
  const currentAdmin = db.admins.find((a) => a.id === activeAdminId) || db.admins[0] || null;

  // 1. Setup Status
  if (pathname === '/api/auth/setup-status' && method === 'GET') {
    return {
      setupRequired: db.admins.length === 0,
      adminsCount: db.admins.length,
      setupSecret: 'STATIC-SETUP-SECRET',
    };
  }

  // 1b. Firebase Google Auth Login / Registration
  if (pathname === '/api/auth/firebase-google' && method === 'POST') {
    const cleanEmail = String(body.email || '').trim().toLowerCase();
    if (!cleanEmail) {
      throw new Error('Verified Google email is required.');
    }
    let admin = db.admins.find((a) => a.email.toLowerCase() === cleanEmail);
    if (!admin) {
      if (db.admins.length === 0 || cleanEmail === 'getahunamanueal0@gmail.com') {
        const username = cleanEmail.split('@')[0].replace(/[^a-z0-9_-]/g, '') || 'admin';
        admin = {
          id: db.admins.length === 0 ? 'ADM-001' : `ADM-${String(db.admins.length + 1).padStart(3, '0')}`,
          username,
          email: cleanEmail,
          fullName: (body.fullName || 'Primary Administrator').trim(),
          role: 'super_admin',
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
          mfaEnabled: false,
          isPrimary: db.admins.length === 0,
          passwordHash: hashPasswordSimple(`FirebaseAuth#${body.uid || Date.now()}!`),
        };
        db.admins.push(admin);
        addAudit(
          db,
          admin,
          'FIREBASE_GOOGLE_ADMIN_LINKED',
          'auth',
          admin.id,
          `Administrator ${admin.email} authenticated via Firebase Google Auth.`
        );
        saveDb(db);
      } else {
        throw new Error(
          `Google account (${cleanEmail}) is not registered as an administrator. Sign in with your Primary Administrator account first or add this email in System Users.`
        );
      }
    } else {
      admin.lastLoginAt = new Date().toISOString();
      saveDb(db);
    }
    localStorage.setItem(STATIC_SESSION_KEY, admin.id);
    const { passwordHash: _, ...cleanAdmin } = admin;
    return {
      token: `static-tok-${admin.id}-${Date.now()}`,
      csrfToken: 'static-csrf',
      admin: cleanAdmin,
      timeoutMinutes: db.settings.general.inactivityTimeoutMinutes || 60,
    };
  }

  // 2. One-Time Primary Admin Registration
  if ((pathname === '/api/auth/setup/register' || pathname === '/api/auth/setup/complete') && method === 'POST') {
    if (db.admins.length > 0) {
      throw new Error('Primary administrator signup has already been completed. New users can only be created by the primary administrator.');
    }
    const { username, email, fullName, password } = body;
    if (!username || !email || !password) {
      throw new Error('Full Name, Username, Email, and Password are required.');
    }
    const admin: StoredAdmin = {
      id: 'ADM-001',
      username: username.trim().toLowerCase(),
      email: email.trim().toLowerCase(),
      fullName: (fullName || 'Primary Administrator').trim(),
      role: 'super_admin',
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
      mfaEnabled: false,
      isPrimary: true,
      passwordHash: hashPasswordSimple(password),
    };
    db.admins.push(admin);
    addAudit(db, admin, 'PRIMARY_ADMIN_REGISTERED', 'auth', admin.id, `Primary administrator "${admin.username}" registered. Public signup permanently closed.`);
    saveDb(db);
    localStorage.setItem(STATIC_SESSION_KEY, admin.id);
    const { passwordHash: _, ...cleanAdmin } = admin;
    return {
      success: true,
      token: `static-tok-${admin.id}-${Date.now()}`,
      csrfToken: 'static-csrf',
      admin: cleanAdmin,
      timeoutMinutes: db.settings.general.inactivityTimeoutMinutes || 60,
    };
  }

  // 3. Login
  if (pathname === '/api/auth/login' && method === 'POST') {
    const cleanUser = (body.username || '').trim().toLowerCase();
    const admin = db.admins.find(
      (a) => a.username.toLowerCase() === cleanUser || a.email.toLowerCase() === cleanUser
    );
    if (!admin || admin.passwordHash !== hashPasswordSimple(body.password || '')) {
      throw new Error('Invalid username or password.');
    }
    admin.lastLoginAt = new Date().toISOString();
    addAudit(db, admin, 'ADMIN_LOGIN', 'auth', admin.id, `Admin ${admin.username} signed in.`);
    saveDb(db);
    localStorage.setItem(STATIC_SESSION_KEY, admin.id);
    const { passwordHash: _, ...cleanAdmin } = admin;
    return {
      token: `static-tok-${admin.id}-${Date.now()}`,
      csrfToken: 'static-csrf',
      admin: cleanAdmin,
      timeoutMinutes: db.settings.general.inactivityTimeoutMinutes || 60,
    };
  }

  // 4. Current Admin (/api/auth/me)
  if (pathname === '/api/auth/me' && method === 'GET') {
    if (!currentAdmin) {
      throw new Error('Not authenticated.');
    }
    const { passwordHash: _, ...cleanAdmin } = currentAdmin;
    return {
      admin: cleanAdmin,
      csrfToken: 'static-csrf',
      timeoutMinutes: db.settings.general.inactivityTimeoutMinutes || 60,
    };
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    localStorage.removeItem(STATIC_SESSION_KEY);
    return { success: true };
  }

  if (pathname === '/api/auth/sessions' && method === 'GET') {
    return {
      sessions: currentAdmin
        ? [
            {
              id: 'SES-LOCAL-1',
              adminId: currentAdmin.id,
              ipAddress: 'Browser Session',
              userAgent: navigator.userAgent,
              createdAt: new Date().toISOString(),
              lastActiveAt: new Date().toISOString(),
              isCurrent: true,
            },
          ]
        : [],
    };
  }

  // 5. Users CRUD (Primary Admin Only)
  if (pathname === '/api/users' && method === 'GET') {
    return {
      users: db.admins.map(({ passwordHash: _, ...u }, idx) => ({
        ...u,
        isPrimary: idx === 0,
      })),
    };
  }

  if (pathname === '/api/users' && method === 'POST') {
    const { fullName, username, email, password, role } = body;
    const cleanUsername = (username || '').trim().toLowerCase();
    const cleanEmail = (email || '').trim().toLowerCase();
    if (db.admins.some((a) => a.username.toLowerCase() === cleanUsername)) {
      throw new Error(`Username "${cleanUsername}" is already in use.`);
    }
    if (db.admins.some((a) => a.email.toLowerCase() === cleanEmail)) {
      throw new Error(`Email "${cleanEmail}" is already registered.`);
    }
    const newUser: StoredAdmin = {
      id: `ADM-${String(db.admins.length + 1).padStart(3, '0')}-${Math.floor(100 + Math.random() * 900)}`,
      username: cleanUsername,
      email: cleanEmail,
      fullName: (fullName || '').trim(),
      role: role === 'super_admin' ? 'super_admin' : 'admin',
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
      mfaEnabled: false,
      isPrimary: false,
      passwordHash: hashPasswordSimple(password),
    };
    db.admins.push(newUser);
    addAudit(db, currentAdmin, 'USER_ACCOUNT_CREATED', 'auth', newUser.id, `Created user "${newUser.username}"`);
    saveDb(db);
    const { passwordHash: _, ...cleanUser } = newUser;
    return { user: cleanUser };
  }

  if (pathname.startsWith('/api/users/') && method === 'PUT') {
    const id = pathname.split('/').pop()!;
    const target = db.admins.find((a) => a.id === id);
    if (!target) throw new Error('User not found.');
    if (body.fullName) target.fullName = body.fullName.trim();
    if (body.email) target.email = body.email.trim().toLowerCase();
    if (body.newPassword) target.passwordHash = hashPasswordSimple(body.newPassword);
    saveDb(db);
    const { passwordHash: _, ...cleanUser } = target;
    return { user: cleanUser };
  }

  if (pathname.startsWith('/api/users/') && method === 'DELETE') {
    const id = pathname.split('/').pop()!;
    const idx = db.admins.findIndex((a) => a.id === id);
    if (idx <= 0) throw new Error('Cannot delete the Primary Administrator account.');
    db.admins.splice(idx, 1);
    saveDb(db);
    return { success: true };
  }

  // 6. Dashboard Stats
  if (pathname === '/api/dashboard/stats' && method === 'GET') {
    const totalInvoiced = db.invoices
      .filter((i) => i.status !== 'cancelled')
      .reduce((s, i) => s + i.total, 0);
    const totalReceived = db.payments
      .filter((p) => p.status === 'confirmed')
      .reduce((s, p) => s + p.amount, 0);
    const outstandingReceivables = Math.max(0, totalInvoiced - totalReceived);

    return {
      metrics: {
        totalCustomers: db.customers.filter((c) => c.status === 'active').length,
        activeDomains: db.domains.filter((d) => d.status === 'active' || d.status === 'renewed').length,
        expiringSoonDomains: db.domains.filter((d) => {
          const days = getDaysRemaining(d.expirationDate);
          return days >= 0 && days <= 30 && d.status !== 'cancelled';
        }).length,
        expiredDomains: db.domains.filter((d) => {
          const days = getDaysRemaining(d.expirationDate);
          return days < 0 && d.status !== 'cancelled';
        }).length,
        totalReceivedRevenue: totalReceived,
        outstandingReceivables,
        totalInvoiced,
        unpaidInvoicesCount: db.invoices.filter((i) => i.status === 'unpaid' || i.status === 'partially_paid').length,
        overdueInvoicesCount: db.invoices.filter((i) => i.status === 'overdue').length,
        overdueAmount: db.invoices.filter((i) => i.status === 'overdue').reduce((s, i) => s + i.total, 0),
        pendingQuotationsCount: db.quotations.filter((q) => q.status === 'sent' || q.status === 'draft').length,
        pendingQuotationsValue: db.quotations.filter((q) => q.status === 'sent' || q.status === 'draft').reduce((s, q) => s + q.total, 0),
        currency: db.settings.general.currency || 'ETB',
      },
      upcomingDomainRenewals: db.domains.slice(0, 8).map((d) => {
        const cust = db.customers.find((c) => c.id === d.customerId);
        return {
          ...d,
          customerName: cust ? cust.businessName : 'Unknown',
          customerPhone: cust?.phone,
          daysLeft: getDaysRemaining(d.expirationDate),
        };
      }),
      recentPayments: db.payments.slice(0, 6).map((p) => {
        const cust = db.customers.find((c) => c.id === p.customerId);
        return {
          ...p,
          customerName: cust ? cust.businessName : 'Unknown',
        };
      }),
      recentActivity: db.auditLogs.slice(0, 8),
    };
  }

  // 7. Customers
  if (pathname === '/api/customers' && method === 'GET') {
    const search = (urlObj.searchParams.get('search') || '').toLowerCase();
    const status = urlObj.searchParams.get('status') || 'all';
    let list = db.customers;
    if (status !== 'all') list = list.filter((c) => c.status === status);
    if (search) {
      list = list.filter(
        (c) =>
          c.businessName.toLowerCase().includes(search) ||
          c.contactPerson.toLowerCase().includes(search) ||
          c.phone.includes(search)
      );
    }
    return {
      customers: list.map((c) => ({
        ...c,
        domainCount: db.domains.filter((d) => d.customerId === c.id).length,
        invoiceCount: db.invoices.filter((i) => i.customerId === c.id).length,
        totalPaid: db.payments.filter((p) => p.customerId === c.id && p.status === 'confirmed').reduce((s, p) => s + p.amount, 0),
        outstanding: 0,
      })),
    };
  }

  if (pathname === '/api/customers/check-duplicate' && method === 'GET') {
    return { hasDuplicate: false, duplicatePhoneCustomer: null, duplicateEmailCustomer: null };
  }

  if (pathname === '/api/customers' && method === 'POST') {
    const customer: Customer = {
      id: `CUST-${1001 + db.customers.length}`,
      businessName: (body.businessName || '').trim(),
      contactPerson: (body.contactPerson || '').trim(),
      phone: body.phone || '',
      email: (body.email || '').trim(),
      billingAddress: body.billingAddress || '',
      notes: body.notes || '',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.customers.push(customer);
    addAudit(db, currentAdmin, 'CUSTOMER_CREATED', 'customer', customer.id, `Added customer ${customer.businessName}`);
    saveDb(db);
    return { customer, welcomeSent: false };
  }

  if (pathname.startsWith('/api/customers/') && method === 'GET') {
    const id = pathname.split('/')[3];
    const customer = db.customers.find((c) => c.id === id);
    if (!customer) throw new Error('Customer not found.');
    return {
      customer,
      domains: db.domains.filter((d) => d.customerId === id).map((d) => ({ ...d, daysLeft: getDaysRemaining(d.expirationDate) })),
      invoices: db.invoices.filter((i) => i.customerId === id),
      quotations: db.quotations.filter((q) => q.customerId === id),
      payments: db.payments.filter((p) => p.customerId === id),
      messages: db.messageLogs.filter((m) => m.customerId === id),
    };
  }

  if (pathname.startsWith('/api/customers/') && method === 'PUT') {
    const id = pathname.split('/')[3];
    const customer = db.customers.find((c) => c.id === id);
    if (!customer) throw new Error('Customer not found.');
    Object.assign(customer, body, { updatedAt: new Date().toISOString() });
    saveDb(db);
    return { customer };
  }

  // 8. Domains
  if (pathname === '/api/domains' && method === 'GET') {
    return {
      domains: db.domains.map((d) => {
        const cust = db.customers.find((c) => c.id === d.customerId);
        return {
          ...d,
          customerName: cust?.businessName || 'Unknown',
          customerPhone: cust?.phone || '',
          customerEmail: cust?.email || '',
          daysLeft: getDaysRemaining(d.expirationDate),
        };
      }),
    };
  }

  if (pathname === '/api/domains' && method === 'POST') {
    const domain: Domain = {
      id: `DOM-${1001 + db.domains.length}`,
      customerId: body.customerId,
      domainName: (body.domainName || '').trim().toLowerCase(),
      registrationDate: body.registrationDate || new Date().toISOString().slice(0, 10),
      expirationDate: body.expirationDate,
      renewalPrice: Number(body.renewalPrice) || 0,
      registrationPeriodYears: Number(body.registrationPeriodYears) || 1,
      registrar: body.registrar || 'Ethio Telecom',
      status: 'active',
      notes: body.notes || '',
      renewalHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.domains.push(domain);
    saveDb(db);
    return { domain };
  }

  // 9. Invoices, Quotations, Payments
  if (pathname === '/api/invoices' && method === 'GET') {
    return {
      invoices: db.invoices.map((inv) => {
        const cust = db.customers.find((c) => c.id === inv.customerId);
        return {
          ...inv,
          customerName: cust?.businessName || 'Unknown',
          customerPhone: cust?.phone || '',
          customerEmail: cust?.email || '',
          totalPaid: 0,
          remainingBalance: inv.total,
        };
      }),
    };
  }

  if (pathname === '/api/invoices' && method === 'POST') {
    const cleanItems = (body.items || []).map((it: any, idx: number) => {
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
    const taxRate = Number(body.taxRate) >= 0 ? Number(body.taxRate) : 15;
    const discountAmount = Number(body.discountAmount) || 0;
    const taxable = Math.max(0, subtotal - discountAmount);
    const taxAmount = (taxable * taxRate) / 100;
    const total = Math.max(0, taxable + taxAmount);

    const inv: Invoice = {
      id: `INV-${new Date().getFullYear()}-${String(db.invoices.length + 1).padStart(3, '0')}`,
      customerId: body.customerId,
      issueDate: body.issueDate || new Date().toISOString().slice(0, 10),
      dueDate: body.dueDate || new Date().toISOString().slice(0, 10),
      currency: body.currency || db.settings.general.currency || 'ETB',
      items: cleanItems,
      subtotal,
      taxRate,
      taxAmount,
      discountAmount,
      total,
      notes: body.notes,
      paymentInstructions:
        body.paymentInstructions ||
        db.settings.general.bankingDetails ||
        'Bank: Commercial Bank of Ethiopia (CBE) | Account Name: NexGrid Digital Systems | Account No: 1000234567890 | Telebirr: +251 906697634',
      terms: body.terms || 'Payment is due within 15 calendar days from the invoice date.',
      status: body.status || 'unpaid',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.invoices.push(inv);
    saveDb(db);
    return { invoice: inv };
  }

  if (pathname === '/api/quotations' && method === 'GET') {
    return {
      quotations: db.quotations.map((q) => {
        const cust = db.customers.find((c) => c.id === q.customerId);
        return {
          ...q,
          customerName: cust?.businessName || 'Unknown',
          customerPhone: cust?.phone,
          customerEmail: cust?.email || '',
        };
      }),
    };
  }

  if (pathname === '/api/quotations' && method === 'POST') {
    const cleanItems = (body.items || []).map((it: any, idx: number) => {
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
    const taxRate = Number(body.taxRate) >= 0 ? Number(body.taxRate) : 15;
    const discountAmount = Number(body.discountAmount) || 0;
    const taxable = Math.max(0, subtotal - discountAmount);
    const taxAmount = (taxable * taxRate) / 100;
    const total = Math.max(0, taxable + taxAmount);

    const quo: Quotation = {
      id: `QUO-${new Date().getFullYear()}-${String(db.quotations.length + 1).padStart(3, '0')}`,
      customerId: body.customerId,
      issueDate: body.issueDate || new Date().toISOString().slice(0, 10),
      validUntil: body.validUntil || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      currency: body.currency || db.settings.general.currency || 'ETB',
      items: cleanItems,
      subtotal,
      taxRate,
      taxAmount,
      discountAmount,
      total,
      notes: body.notes,
      paymentInstructions:
        body.paymentInstructions ||
        db.settings.general.bankingDetails ||
        'Bank: Commercial Bank of Ethiopia (CBE) | Account Name: NexGrid Digital Systems | Account No: 1000234567890 | Telebirr: +251 906697634',
      terms: body.terms || 'Quotation valid for 30 calendar days.',
      status: 'sent',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.quotations.push(quo);
    saveDb(db);
    return { quotation: quo };
  }

  if (pathname.startsWith('/api/quotations/') && pathname.endsWith('/convert-to-invoice') && method === 'POST') {
    const qId = pathname.split('/')[3];
    const quotation = db.quotations.find((q) => q.id === qId);
    if (!quotation) throw new Error('Quotation not found.');
    const inv: Invoice = {
      id: `INV-${new Date().getFullYear()}-${String(db.invoices.length + 1).padStart(3, '0')}`,
      customerId: quotation.customerId,
      quotationId: quotation.id,
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      currency: quotation.currency,
      items: quotation.items.map((it) => ({ ...it })),
      subtotal: quotation.subtotal,
      taxRate: quotation.taxRate,
      taxAmount: quotation.taxAmount,
      discountAmount: quotation.discountAmount,
      total: quotation.total,
      notes: `Converted from Quotation ${quotation.id}. ${quotation.notes || ''}`.trim(),
      paymentInstructions:
        quotation.paymentInstructions ||
        db.settings.general.bankingDetails ||
        'Bank: Commercial Bank of Ethiopia (CBE) | Account Name: NexGrid Digital Systems | Account No: 1000234567890 | Telebirr: +251 906697634',
      terms: quotation.terms || 'Payment is due within 15 calendar days from the invoice date.',
      status: 'unpaid',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    quotation.status = 'accepted';
    quotation.convertedInvoiceId = inv.id;
    quotation.updatedAt = new Date().toISOString();
    db.invoices.push(inv);
    saveDb(db);
    return { success: true, invoice: inv, quotation };
  }

  if (pathname === '/api/payments' && method === 'GET') {
    return {
      payments: db.payments.map((p) => {
        const cust = db.customers.find((c) => c.id === p.customerId);
        return { ...p, customerName: cust?.businessName || 'Unknown', customerEmail: cust?.email || '' };
      }),
    };
  }

  if (pathname === '/api/payments' && method === 'POST') {
    const pay: Payment = {
      id: `PAY-${1001 + db.payments.length}`,
      customerId: body.customerId,
      invoiceId: body.invoiceId,
      amount: Number(body.amount) || 0,
      currency: body.currency || 'ETB',
      paymentDate: body.paymentDate || new Date().toISOString().slice(0, 10),
      paymentMethod: body.paymentMethod || 'bank_transfer',
      referenceNumber: body.referenceNumber || '',
      notes: body.notes || '',
      recordedBy: currentAdmin?.fullName || 'Admin',
      status: 'confirmed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.payments.push(pay);
    saveDb(db);
    return { payment: pay };
  }

  // 10. Messaging & Templates
  if (pathname === '/api/messages/logs' && method === 'GET') {
    return { logs: db.messageLogs };
  }

  if (pathname === '/api/messages/log-email' && method === 'POST') {
    const validType = [
      'welcome',
      'domain_reminder',
      'payment_confirmation',
      'invoice_reminder',
      'test',
      'custom',
    ].includes(body.messageType)
      ? body.messageType
      : 'custom';
    const logEntry: MessageLog = {
      id: `EML-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      customerId: body.customerId || 'DIRECT',
      customerName: body.customerName || 'Email Recipient',
      recipient: String(body.recipient || '').trim(),
      channel: 'email',
      messageType: validType,
      subject: body.subject || 'NexGrid Digital Systems Notification',
      content: String(body.content || ''),
      providerReference: body.providerReference || `GMAIL-${Date.now()}`,
      status: body.status === 'failed' ? 'failed' : 'sent',
      errorDetails: body.errorDetails || undefined,
      attemptCount: 1,
      lastAttemptAt: new Date().toISOString(),
      domainId: body.domainId || undefined,
      createdAt: new Date().toISOString(),
    };
    db.messageLogs.unshift(logEntry);
    addAudit(
      db,
      currentAdmin,
      logEntry.status === 'sent' ? 'EMAIL_DISPATCHED_GMAIL' : 'EMAIL_DISPATCH_FAILED',
      'notification',
      logEntry.id,
      `Sent email "${logEntry.subject}" to ${logEntry.recipient} via Gmail API`
    );
    saveDb(db);
    return { success: true, log: logEntry };
  }

  if ((pathname === '/api/messages/send' || pathname === '/api/messages/send-test') && method === 'POST') {
    return sendSmsBrowser(db, body.phone, body.message, body.customerId, body.customerName);
  }

  if (pathname === '/api/messages/send-bulk' && method === 'POST') {
    const recipients = body.recipients || [];
    const results = [];
    let sent = 0;
    let failed = 0;
    for (const r of recipients) {
      const phone = typeof r === 'string' ? r : r.phone;
      const res = await sendSmsBrowser(db, phone, body.message, r.customerId, r.customerName);
      if (res.success) sent++;
      else failed++;
      results.push({ phone, status: res.status, messageId: res.messageId, error: res.error });
    }
    return { success: failed === 0, total: recipients.length, sent, failed, results };
  }

  if (pathname === '/api/messages/diagnose-gateway' && method === 'POST') {
    if (body.apiKey && String(body.apiKey).trim() !== '') {
      db.settings.sms.apiKey = String(body.apiKey).trim();
      saveDb(db);
    }
    const msisdn = formatMsisdn(body.phone || '251983064449');
    const cleanKey = (db.settings.sms.apiKey || 'T2J1L49IRJHGGHN0Z6H71D332799EMHVF4P8A4KJ').trim();
    const endpoint = db.settings.sms.apiEndpoint?.trim() || 'https://smsethiopia.com/api/sms/send';
    try {
      const result = await dispatchSmsViaRelayOrDirect({
        endpoint,
        apiKey: cleanKey,
        msisdn,
        text: 'NexGrid live SMS connectivity test.',
        senderId: db.settings.sms.senderId || '',
      });
      return {
        success: result.ok,
        httpStatus: result.httpStatus,
        latencyMs: result.latencyMs,
        provider: 'sms_et',
        endpoint,
        testedRecipient: msisdn,
        diagnosticStatus: result.ok ? 'live_connected' : 'starter_campaign_restricted',
        rawResponse: result.data,
        recommendation: result.ok
          ? `Live SMS accepted for delivery to ${msisdn} (${result.data?.description || 'Accepted for delivery'}).`
          : `Default Campaign Active (Default Sender ID): Ensure "${msisdn}" is whitelisted in your SMS Ethiopia Default Campaign dashboard before sending.`,
      };
    } catch (err: any) {
      return {
        success: false,
        httpStatus: 0,
        latencyMs: 0,
        provider: 'sms_et',
        endpoint,
        testedRecipient: msisdn,
        diagnosticStatus: 'network_error',
        recommendation: `Network error connecting to SMS Gateway: ${err.message}`,
      };
    }
  }

  if (pathname === '/api/templates' && method === 'GET') {
    return { templates: db.templates };
  }

  if (pathname.startsWith('/api/templates/') && method === 'PUT') {
    const tId = pathname.split('/')[3];
    const tmpl = db.templates.find((t) => t.id === tId);
    if (!tmpl) throw new Error('Template not found.');
    if (body.bodyTemplate !== undefined) tmpl.bodyTemplate = body.bodyTemplate;
    if (body.subject !== undefined) tmpl.subject = body.subject;
    if (body.name !== undefined) tmpl.name = body.name;
    tmpl.updatedAt = new Date().toISOString();
    saveDb(db);
    return { template: tmpl };
  }

  // 11. Settings, Reports, Audit Logs, Factory Reset
  if (pathname === '/api/settings' && method === 'GET') {
    const copy = JSON.parse(JSON.stringify(db.settings));
    copy.sms.hasApiKey = Boolean(copy.sms.apiKey);
    copy.sms.apiKeyMasked = copy.sms.apiKey ? `${copy.sms.apiKey.slice(0, 4)}••••••••${copy.sms.apiKey.slice(-4)}` : '';
    copy.sms.apiKey = '';
    return { settings: copy };
  }

  if (pathname === '/api/settings' && method === 'PUT') {
    if (body.general) db.settings.general = { ...db.settings.general, ...body.general };
    if (body.sms) {
      const existingKey = db.settings.sms.apiKey;
      db.settings.sms = {
        ...db.settings.sms,
        ...body.sms,
        apiKey: body.sms.apiKey && body.sms.apiKey.trim() !== '' ? body.sms.apiKey.trim() : existingKey,
      };
    }
    if (body.reminders) db.settings.reminders = { ...db.settings.reminders, ...body.reminders };
    saveDb(db);
    return { success: true, message: 'Settings saved.' };
  }

  if (pathname === '/api/settings/factory-reset' && method === 'POST') {
    localStorage.removeItem(STATIC_DB_KEY);
    localStorage.removeItem(STATIC_SESSION_KEY);
    return { success: true, message: 'All application data and accounts have been wiped.' };
  }

  if (pathname === '/api/audit-logs' && method === 'GET') {
    return { logs: db.auditLogs };
  }

  if (pathname === '/api/reports' && method === 'GET') {
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
      const key = (inv.issueDate || '').slice(0, 7);
      if (monthMap[key]) {
        monthMap[key].invoiced += Number(inv.total) || 0;
      }
    }

    for (const pay of db.payments) {
      if (pay.status !== 'confirmed') continue;
      const key = (pay.paymentDate || '').slice(0, 7);
      if (monthMap[key]) {
        monthMap[key].collected += Number(pay.amount) || 0;
      }
    }

    const activeInvoices = db.invoices.filter((i) => i.status !== 'cancelled' && i.status !== 'draft');
    const confirmedPayments = db.payments.filter((p) => p.status === 'confirmed');
    const totalInvoiced = activeInvoices.reduce((s, i) => s + (Number(i.total) || 0), 0);
    const totalReceived = confirmedPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const outstandingReceivables = Math.max(0, totalInvoiced - totalReceived);

    const todayStr = new Date().toISOString().slice(0, 10);
    const unpaidInvoices = activeInvoices.filter((i) => i.status !== 'paid');
    const overdueInvoices = unpaidInvoices.filter((i) => i.dueDate < todayStr || i.status === 'overdue');
    const overdueAmount = overdueInvoices.reduce((s, i) => s + (Number(i.remainingBalance ?? i.total) || 0), 0);
    const pendingQuotes = db.quotations.filter((q) => q.status === 'sent' || q.status === 'draft');

    return {
      monthlyTrend: Object.values(monthMap),
      smsStats: {
        total: db.messageLogs.length,
        sent: db.messageLogs.filter((m) => m.status === 'sent').length,
        delivered: db.messageLogs.filter((m) => m.status === 'delivered').length,
        failed: db.messageLogs.filter((m) => m.status === 'failed').length,
        queued: db.messageLogs.filter((m) => m.status === 'queued').length,
      },
      domainHealth: {
        total: db.domains.length,
        active: db.domains.filter((d) => getDaysRemaining(d.expirationDate) >= 0 && d.status !== 'cancelled').length,
        expiringSoon: db.domains.filter((d) => {
          const days = getDaysRemaining(d.expirationDate);
          return days >= 0 && days <= 30 && d.status !== 'cancelled';
        }).length,
        expired: db.domains.filter((d) => getDaysRemaining(d.expirationDate) < 0 && d.status !== 'cancelled').length,
      },
      financials: {
        totalInvoiced,
        totalReceived,
        outstandingReceivables,
        overdueAmount,
        unpaidInvoiceCount: unpaidInvoices.length,
        overdueInvoiceCount: overdueInvoices.length,
        pendingQuotationsCount: pendingQuotes.length,
        pendingQuotationsValue: pendingQuotes.reduce((s, q) => s + (Number(q.total) || 0), 0),
        currency: db.settings.general.currency || 'ETB',
      },
    };
  }

  return {};
}
