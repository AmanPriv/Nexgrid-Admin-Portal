import {
  AdminUser,
  Customer,
  Domain,
  Project,
  Invoice,
  Quotation,
  Payment,
  MessageLog,
  MessageTemplate,
  AuditLog,
  AppSettings,
} from '../types.ts';
import { pushCloudDatabaseState, pullCloudDatabaseState } from './cloudSyncEngine.ts';
import { recalculateDocumentTotals } from '../utils/pdfGenerator.ts';

const STATIC_DB_KEY = 'nexgrid_cms_production_db_v2';
const STATIC_SESSION_KEY = 'nexgrid_cms_active_admin_id';

// Active session is strictly per page load in memory so loading the website on any device requires login
let activeSessionAdminId: string | null = null;
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem(STATIC_SESSION_KEY);
    sessionStorage.removeItem(STATIC_SESSION_KEY);
  } catch {
    // ignore
  }
}

interface StoredAdmin extends AdminUser {
  passwordHash: string;
  salt?: string;
  updatedAt?: string;
}

interface StaticDatabase {
  admins: StoredAdmin[];
  customers: Customer[];
  domains: Domain[];
  projects: Project[];
  invoices: Invoice[];
  quotations: Quotation[];
  payments: Payment[];
  templates: MessageTemplate[];
  messageLogs: MessageLog[];
  auditLogs: AuditLog[];
  settings: AppSettings;
  deletedIds?: string[];
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
    id: 'tmpl-new-feature-sms',
    type: 'new_feature',
    channel: 'sms',
    name: 'New Feature Announcement SMS',
    bodyTemplate:
      'Hello [Customer Name], exciting news from NexGrid Digital Systems! A new feature ([Feature Name]) has just been added to your account/system. Please check it out at [Portal Link] or contact us at [Business Contact] for details!',
    variables: [
      '[Customer Name]',
      '[Feature Name]',
      '[Portal Link]',
      '[Business Contact]',
      '[Business Phone]',
      '[Business Email]',
    ],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'tmpl-project-update-sms',
    type: 'project_update',
    channel: 'sms',
    name: 'Project Progress Update SMS',
    bodyTemplate:
      'Hello [Customer Name], project update from NexGrid Digital Systems: Your project "[Project Name]" is now [Progress]% complete (Phase: [Current Phase], Status: [Project Status]). Check your progress or contact us at [Business Contact].',
    variables: [
      '[Customer Name]',
      '[Project Name]',
      '[Progress]',
      '[Current Phase]',
      '[Project Status]',
      '[Target Date]',
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
  {
    id: 'tmpl-new-feature-email',
    type: 'new_feature',
    channel: 'email',
    name: 'New Feature Announcement Email',
    subject: 'New Feature Added: [Feature Name] — Check It Out! (NexGrid Digital Systems)',
    bodyTemplate:
      'Dear [Customer Name],\n\nExciting news from NexGrid Digital Systems! We have just added a brand-new feature — [Feature Name] — to enhance your system and workflow.\n\nWe invite you to check it out today at: [Portal Link]\n\nIf you have any questions or would like a quick walkthrough of how it works, please reach out to our team at [Business Contact] or [Business Email].\n\nBest regards,\nNexGrid Digital Systems Product & Delivery Team',
    variables: ['[Customer Name]', '[Feature Name]', '[Portal Link]', '[Business Contact]', '[Business Email]'],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'tmpl-project-update-email',
    type: 'project_update',
    channel: 'email',
    name: 'Project Progress Update Email',
    subject: 'Project Progress Update: [Project Name] ([Progress]% Complete)',
    bodyTemplate:
      'Dear [Customer Name],\n\nHere is the latest delivery progress update on your project "[Project Name]" with NexGrid Digital Systems:\n\n• Completion Progress: [Progress]%\n• Current Phase: [Current Phase]\n• Delivery Status: [Project Status]\n• Target Completion Date: [Target Date]\n\nShould you have any feedback or questions, please contact us at [Business Contact] or [Business Email].\n\nBest regards,\nNexGrid Digital Systems Delivery Team',
    variables: ['[Customer Name]', '[Project Name]', '[Progress]', '[Current Phase]', '[Project Status]', '[Target Date]', '[Business Contact]', '[Business Email]'],
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
    projects: [],
    invoices: [],
    quotations: [],
    payments: [],
    templates: defaultTemplates,
    messageLogs: [],
    auditLogs: [],
    settings: JSON.parse(JSON.stringify(defaultSettings)),
    deletedIds: [],
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
    if (!Array.isArray(parsed.projects)) parsed.projects = [];
    if (!Array.isArray(parsed.invoices)) parsed.invoices = [];
    if (!Array.isArray(parsed.quotations)) parsed.quotations = [];
    if (!Array.isArray(parsed.payments)) parsed.payments = [];
    if (!Array.isArray(parsed.deletedIds)) parsed.deletedIds = [];

    let totalsHealed = false;
    parsed.invoices = parsed.invoices.map((inv) => {
      const healed = recalculateDocumentTotals(inv);
      if (healed.total !== inv.total || healed.subtotal !== inv.subtotal) {
        totalsHealed = true;
        return { ...healed, updatedAt: new Date().toISOString() };
      }
      return healed;
    });
    parsed.quotations = parsed.quotations.map((quo) => {
      const healed = recalculateDocumentTotals(quo);
      if (healed.total !== quo.total || healed.subtotal !== quo.subtotal) {
        totalsHealed = true;
        return { ...healed, updatedAt: new Date().toISOString() };
      }
      return healed;
    });
    if (totalsHealed) {
      localStorage.setItem(STATIC_DB_KEY, JSON.stringify(parsed));
      pushCloudDatabaseState(parsed).catch(() => {});
    }
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

function renderTemplate(template: string, vars: Record<string, string | number>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    const strVal = String(value ?? '');
    result = result.split(`[${key}]`).join(strVal);
    result = result.split(`{{${key}}}`).join(strVal);
  }
  return result;
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
    url: 'https://ais-pre-5pchhs56eemvp7uthhrevk-197503816635.europe-west2.run.app/api/public/sms-relay',
    credentials: 'omit' as RequestCredentials,
  },
  {
    url: 'https://ais-dev-5pchhs56eemvp7uthhrevk-197503816635.europe-west2.run.app/api/public/sms-relay',
    credentials: 'include' as RequestCredentials,
  },
];

const BRIDGE_REQUEST_TOPIC = 'nexgrid_sms_bridge_32da0e27_v1';

function wakeUpCloudRelays() {
  try {
    fetch('https://ais-pre-5pchhs56eemvp7uthhrevk-197503816635.europe-west2.run.app/api/public/cloud-state', {
      method: 'GET',
      mode: 'no-cors',
    }).catch(() => {});
    fetch('https://ais-dev-5pchhs56eemvp7uthhrevk-197503816635.europe-west2.run.app/api/public/cloud-state', {
      method: 'GET',
      mode: 'no-cors',
    }).catch(() => {});
  } catch {
    // ignore
  }
}

function dispatchViaNtfyRealtimeBridge(params: {
  endpoint: string;
  apiKey: string;
  msisdn: string;
  text: string;
  senderId?: string;
}): Promise<{ ok: boolean; httpStatus: number; latencyMs: number; data: any }> {
  wakeUpCloudRelays();
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

  // Wake up Cloud Run relays immediately so HTTP relay and ntfy listener are hot
  wakeUpCloudRelays();

  // If on GitHub Pages without a custom API URL, try the real-time CORS-free ntfy.sh bridge first!
  if (isGithubPages && !customApiBase) {
    try {
      return await dispatchViaNtfyRealtimeBridge(params);
    } catch {
      // fall through to backup HTTP relays
    }
  }

  const relays = customApiBase
    ? [{ url: `${customApiBase}/api/public/sms-relay`, credentials: 'omit' as RequestCredentials }, ...CLOUD_SMS_RELAYS]
    : CLOUD_SMS_RELAYS;

  // 1. Try HTTP relay endpoints (using text/plain simple CORS request to avoid OPTIONS preflight blocks)
  for (const relay of relays) {
    if (relay.url.startsWith('/') && isGithubPages) {
      continue;
    }
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(relay.url, {
        method: 'POST',
        credentials: relay.credentials,
        headers: {
          'Content-Type': relay.url.startsWith('/') ? 'application/json' : 'text/plain;charset=UTF-8',
        },
        body: JSON.stringify({
          endpoint: params.endpoint,
          apiKey: params.apiKey,
          msisdn: params.msisdn,
          text: params.text,
          senderId: params.senderId || '',
        }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
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
    ok: res.ok && data?.sent !== false,
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
  messageType: MessageLog['messageType'] = 'custom',
  domainId?: string,
  reminderInterval?: number
) {
  const msisdn = formatMsisdn(recipient);
  if (!msisdn) {
    return {
      success: false,
      status: 'failed' as const,
      messageId: '',
      error: 'Recipient phone number is missing or invalid.',
    };
  }

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
    domainId,
    reminderInterval,
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
        data?.status === 'DEFAULT_CAMPAIGN_RECIPIENT_NOT_WHITELISTED' ||
        (typeof data?.error_message === 'string' &&
          (data.error_message.includes('10007') ||
            data.error_message.includes('DEFAULT_CAMPAIGN_RECIPIENT_NOT_WHITELISTED')));
      log.errorDetails = isWhitelist
        ? `Default Campaign Whitelist Required (Code 10007): Recipient ${msisdn} is not yet whitelisted in your SMS Ethiopia Default Campaign. Add ${msisdn} to your Default Campaign recipients on smsethiopia.com or approve your custom Sender ID.`
        : data?.error_message || data?.message || `Gateway returned HTTP ${result.httpStatus}`;
    }
  } catch (err: any) {
    log.status = 'failed';
    log.errorDetails = `SMS Gateway connection error: ${err.message}`;
  }

  db.messageLogs.unshift(log);
  saveDb(db);

  return {
    success: (log.status as string) === 'sent' || (log.status as string) === 'delivered',
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

  if (
    pathname === '/api/auth/setup-status' ||
    pathname === '/api/auth/login' ||
    pathname === '/api/auth/firebase-google' ||
    pathname === '/api/users'
  ) {
    await pullCloudDatabaseState().catch(() => {});
  }

  const db = loadDb();

  const currentAdmin = activeSessionAdminId
    ? db.admins.find((a) => a.id === activeSessionAdminId) || null
    : null;

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
    const isOfficialAdminEmail =
      cleanEmail === 'getahunamanueal0@gmail.com' ||
      cleanEmail === 'nexgriddigital@gmail.com' ||
      body.uid === 'ADM-001';

    if (!admin && isOfficialAdminEmail && db.admins.length > 0) {
      admin = db.admins[0];
    }

    if (!admin) {
      if (db.admins.length === 0 || isOfficialAdminEmail) {
        const username = cleanEmail.split('@')[0].replace(/[^a-z0-9_-]/g, '') || 'admin';
        const fallbackHash = hashPasswordSimple(`FirebaseAuth#${body.uid || Date.now()}!`);
        admin = {
          id: db.admins.length === 0 ? 'ADM-001' : `ADM-${String(db.admins.length + 1).padStart(3, '0')}`,
          username,
          email: cleanEmail,
          fullName: (body.fullName || 'Primary Administrator').trim(),
          role: 'super_admin',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
          mfaEnabled: false,
          isPrimary: db.admins.length === 0,
          passwordHash: fallbackHash,
          salt: fallbackHash,
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
      admin.updatedAt = new Date().toISOString();
      saveDb(db);
    }
    activeSessionAdminId = admin.id;
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
    const pwHash = hashPasswordSimple(password);
    const admin: StoredAdmin = {
      id: 'ADM-001',
      username: username.trim().toLowerCase(),
      email: email.trim().toLowerCase(),
      fullName: (fullName || 'Primary Administrator').trim(),
      role: 'super_admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
      mfaEnabled: false,
      isPrimary: true,
      passwordHash: pwHash,
      salt: pwHash,
    };
    db.admins.push(admin);
    addAudit(db, admin, 'PRIMARY_ADMIN_REGISTERED', 'auth', admin.id, `Primary administrator "${admin.username}" registered. Public signup permanently closed.`);
    saveDb(db);
    activeSessionAdminId = admin.id;
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
    const expectedHash = hashPasswordSimple(body.password || '');
    const isPasswordValid =
      Boolean(admin) &&
      (admin!.passwordHash === expectedHash ||
        admin!.salt === expectedHash ||
        (admin as any).staticPasswordHash === expectedHash);

    if (!admin || !isPasswordValid) {
      throw new Error('Invalid username or password.');
    }
    admin.lastLoginAt = new Date().toISOString();
    admin.updatedAt = new Date().toISOString();
    if (!admin.salt) admin.salt = expectedHash;
    addAudit(db, admin, 'ADMIN_LOGIN', 'auth', admin.id, `Admin ${admin.username} signed in.`);
    saveDb(db);
    activeSessionAdminId = admin.id;
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
      const err: any = new Error('Authentication required. Please log in.');
      err.status = 401;
      throw err;
    }
    const { passwordHash: _, ...cleanAdmin } = currentAdmin;
    return {
      admin: cleanAdmin,
      csrfToken: 'static-csrf',
      timeoutMinutes: db.settings.general.inactivityTimeoutMinutes || 60,
    };
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    activeSessionAdminId = null;
    localStorage.removeItem(STATIC_SESSION_KEY);
    return { success: true };
  }

  // Enforce authentication for all protected routes below
  if (!currentAdmin) {
    const err: any = new Error('Authentication required. Please log in.');
    err.status = 401;
    throw err;
  }

  if (pathname === '/api/auth/change-password' && method === 'POST') {
    const { currentPassword, newPassword } = body;
    const expectedCurrent = hashPasswordSimple(currentPassword || '');
    const validCurrent =
      currentAdmin.passwordHash === expectedCurrent ||
      currentAdmin.salt === expectedCurrent;
    if (!validCurrent) {
      throw new Error('Incorrect current password.');
    }
    const nextHash = hashPasswordSimple(newPassword || '');
    currentAdmin.passwordHash = nextHash;
    currentAdmin.salt = nextHash;
    currentAdmin.updatedAt = new Date().toISOString();
    addAudit(db, currentAdmin, 'PASSWORD_CHANGED', 'auth', currentAdmin.id, 'Updated password.');
    saveDb(db);
    return { success: true, message: 'Password updated successfully across all synced devices.' };
  }

  if (pathname === '/api/auth/sessions' && method === 'GET') {
    return {
      sessions: [
        {
          id: 'SES-LOCAL-1',
          adminId: currentAdmin.id,
          ipAddress: 'Browser Session',
          userAgent: navigator.userAgent,
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
          isCurrent: true,
        },
      ],
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
    const pwHash = hashPasswordSimple(password);
    const newUser: StoredAdmin = {
      id: `ADM-${String(db.admins.length + 1).padStart(3, '0')}-${Math.floor(100 + Math.random() * 900)}`,
      username: cleanUsername,
      email: cleanEmail,
      fullName: (fullName || '').trim(),
      role: role === 'super_admin' ? 'super_admin' : 'admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastLoginAt: null,
      mfaEnabled: false,
      isPrimary: false,
      passwordHash: pwHash,
      salt: pwHash,
    };
    db.admins.push(newUser);
    if (Array.isArray(db.deletedIds)) {
      db.deletedIds = db.deletedIds.filter((dId) => dId !== newUser.id);
    }
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
    if (body.role && db.admins[0]?.id !== target.id) {
      target.role = body.role === 'super_admin' ? 'super_admin' : 'admin';
    }
    if (body.newPassword) {
      const nextHash = hashPasswordSimple(body.newPassword);
      target.passwordHash = nextHash;
      target.salt = nextHash;
    }
    target.updatedAt = new Date().toISOString();
    saveDb(db);
    const { passwordHash: _, ...cleanUser } = target;
    return { user: cleanUser };
  }

  if (pathname.startsWith('/api/users/') && method === 'DELETE') {
    const id = pathname.split('/').pop()!;
    const idx = db.admins.findIndex((a) => a.id === id);
    if (idx <= 0) throw new Error('Cannot delete the Primary Administrator account.');
    const removed = db.admins.splice(idx, 1)[0];
    if (!Array.isArray(db.deletedIds)) db.deletedIds = [];
    if (removed && !db.deletedIds.includes(removed.id)) {
      db.deletedIds.push(removed.id);
    }
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

    const projectsList = db.projects || [];
    const totalProjects = projectsList.length;
    const activeProjectsCount = projectsList.filter(
      (p) => p.status === 'planning' || p.status === 'in_progress' || p.status === 'review_qa'
    ).length;
    const completedProjectsCount = projectsList.filter((p) => p.status === 'completed').length;
    const avgProjectProgress =
      totalProjects > 0
        ? Math.round(projectsList.reduce((s, p) => s + (Number(p.progress) || 0), 0) / totalProjects)
        : 0;

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
        totalProjects,
        activeProjectsCount,
        completedProjectsCount,
        avgProjectProgress,
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

    let welcomeSent = false;
    if (db.settings.sms.enabled && db.settings.sms.autoWelcome && customer.phone) {
      const welcomeTmpl = db.templates.find((t) => t.type === 'welcome' && t.channel === 'sms');
      const tmplStr =
        welcomeTmpl?.bodyTemplate ||
        'Welcome to NexGrid Digital Systems, [Customer Name]! Your account has been created. For support or inquiries, contact us at [Business Contact].';
      const msg = renderTemplate(tmplStr, {
        'Customer Name': customer.businessName || customer.contactPerson,
        'Contact Person': customer.contactPerson || customer.businessName,
        'Business Contact': db.settings.general.businessPhone || db.settings.general.businessContact || '+251 906697634',
      });
      const smsRes = await sendSmsBrowser(db, customer.phone, msg, customer.id, customer.businessName, 'welcome');
      welcomeSent = smsRes.success;
    }

    return { customer, welcomeSent };
  }

  if (pathname.startsWith('/api/customers/') && pathname.endsWith('/archive') && method === 'POST') {
    const id = pathname.split('/')[3];
    const customer = db.customers.find((c) => c.id === id);
    if (!customer) throw new Error('Customer not found.');
    customer.status = 'archived';
    customer.updatedAt = new Date().toISOString();
    addAudit(db, currentAdmin, 'CUSTOMER_ARCHIVED', 'customer', customer.id, `Archived customer ${customer.businessName}`);
    saveDb(db);
    return { success: true, customer };
  }

  if (pathname.startsWith('/api/customers/') && pathname.endsWith('/unarchive') && method === 'POST') {
    const id = pathname.split('/')[3];
    const customer = db.customers.find((c) => c.id === id);
    if (!customer) throw new Error('Customer not found.');
    customer.status = 'active';
    customer.updatedAt = new Date().toISOString();
    addAudit(db, currentAdmin, 'CUSTOMER_UNARCHIVED', 'customer', customer.id, `Restored customer ${customer.businessName}`);
    saveDb(db);
    return { success: true, customer };
  }

  if (pathname.startsWith('/api/customers/') && method === 'GET') {
    const id = pathname.split('/')[3];
    const customer = db.customers.find((c) => c.id === id);
    if (!customer) throw new Error('Customer not found.');
    return {
      customer,
      domains: db.domains.filter((d) => d.customerId === id).map((d) => ({ ...d, daysLeft: getDaysRemaining(d.expirationDate) })),
      invoices: db.invoices.filter((i) => i.customerId === id).map((i) => recalculateDocumentTotals(i)),
      quotations: db.quotations.filter((q) => q.customerId === id).map((q) => recalculateDocumentTotals(q)),
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
    const search = (urlObj.searchParams.get('search') || '').toLowerCase();
    const status = urlObj.searchParams.get('status') || 'all';

    let list = db.domains.map((d) => {
      const cust = db.customers.find((c) => c.id === d.customerId);
      const daysLeft = getDaysRemaining(d.expirationDate);
      return {
        ...d,
        customerName: cust?.businessName || 'Unknown',
        customerPhone: cust?.phone || '',
        customerEmail: cust?.email || '',
        daysLeft,
      };
    });

    if (status && status !== 'all') {
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

    return { domains: list };
  }

  if (pathname === '/api/domains' && method === 'POST') {
    const daysLeft = getDaysRemaining(body.expirationDate);
    const status: Domain['status'] = daysLeft < 0 ? 'expired' : daysLeft <= 30 ? 'expiring_soon' : 'active';
    const domain: Domain = {
      id: `DOM-${1001 + db.domains.length}`,
      customerId: body.customerId,
      domainName: (body.domainName || '').trim().toLowerCase(),
      registrationDate: body.registrationDate || new Date().toISOString().slice(0, 10),
      expirationDate: body.expirationDate,
      renewalPrice: Number(body.renewalPrice) || 0,
      registrationPeriodYears: Number(body.registrationPeriodYears) || 1,
      registrar: body.registrar || 'Ethio Telecom (.et)',
      status,
      notes: body.notes || '',
      renewalHistory: [],
      sentReminderIntervals: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.domains.push(domain);
    const cust = db.customers.find((c) => c.id === domain.customerId);
    addAudit(
      db,
      currentAdmin,
      'DOMAIN_CREATED',
      'domain',
      domain.id,
      `Registered domain ${domain.domainName} for customer ${cust?.businessName || domain.customerId}`
    );
    saveDb(db);
    return { domain };
  }

  if (pathname.startsWith('/api/domains/') && pathname.endsWith('/send-reminder') && method === 'POST') {
    const dId = pathname.split('/')[3];
    const domain = db.domains.find((d) => d.id === dId);
    if (!domain) {
      return {
        success: false,
        status: 'failed',
        messageId: '',
        error: 'Domain not found.',
      };
    }

    const customer = db.customers.find((c) => c.id === domain.customerId);
    const targetPhone = (customer?.phone || (domain as any).customerPhone || '').trim();
    if (!targetPhone) {
      return {
        success: false,
        status: 'failed',
        messageId: '',
        error: 'Customer phone number is missing or invalid. Add a phone number to this customer first.',
      };
    }

    const daysLeft = getDaysRemaining(domain.expirationDate);
    const currency = db.settings.general.currency || 'ETB';
    let messageText = (body.customMessage || '').trim();

    if (!messageText) {
      const tmpl = db.templates.find((t) => t.type === 'domain_reminder' && t.channel === 'sms');
      const tmplStr =
        tmpl?.bodyTemplate ||
        'Hello [Customer Name], your domain [Domain Name] is scheduled to expire on [Expiration Date] ([Days Remaining] days left). Renewal price: [Amount] [Currency]. Please contact NexGrid Digital Systems to arrange renewal.';

      messageText = renderTemplate(tmplStr, {
        'Customer Name': customer?.businessName || customer?.contactPerson || 'Valued Client',
        'Domain Name': domain.domainName,
        'Expiration Date': new Date(domain.expirationDate).toISOString().split('T')[0],
        'Days Remaining': daysLeft,
        'Amount': (Number(domain.renewalPrice) || 0).toLocaleString(),
        'Currency': currency,
        'Business Contact': db.settings.general.businessPhone || db.settings.general.businessContact || '+251 906697634',
      });
    }

    const result = await sendSmsBrowser(
      db,
      targetPhone,
      messageText,
      customer?.id || domain.customerId,
      customer?.businessName || (domain as any).customerName || 'Client',
      'domain_reminder',
      domain.id,
      daysLeft
    );

    if (result.success) {
      domain.lastReminderSentAt = new Date().toISOString();
      domain.updatedAt = new Date().toISOString();
    }

    addAudit(
      db,
      currentAdmin,
      'DOMAIN_REMINDER_SENT',
      'notification',
      domain.id,
      `Dispatched domain renewal reminder for ${domain.domainName} to ${targetPhone} (Status: ${result.status})`
    );
    saveDb(db);

    return result;
  }

  if (pathname.startsWith('/api/domains/') && pathname.endsWith('/renew') && method === 'POST') {
    const dId = pathname.split('/')[3];
    const domain = db.domains.find((d) => d.id === dId);
    if (!domain) throw new Error('Domain not found.');
    if (!body.newExpirationDate) throw new Error('New expiration date is required to confirm renewal.');

    const customer = db.customers.find((c) => c.id === domain.customerId);
    const prevExp = domain.expirationDate;
    const price = Number(body.renewalPrice) || domain.renewalPrice;
    const years = Number(body.periodYears) || 1;

    if (!Array.isArray(domain.renewalHistory)) domain.renewalHistory = [];
    domain.renewalHistory.push({
      id: `RENEW-${Date.now()}`,
      date: new Date().toISOString(),
      previousExpDate: prevExp,
      newExpDate: body.newExpirationDate,
      renewalPrice: price,
      periodYears: years,
      recordedBy: currentAdmin?.fullName || 'Admin',
      notes: body.notes || 'Manual domain renewal confirmed by administrator.',
    });

    domain.expirationDate = body.newExpirationDate;
    domain.registrationPeriodYears = years;
    domain.renewalPrice = price;
    domain.status = 'renewed';
    domain.sentReminderIntervals = [];
    domain.updatedAt = new Date().toISOString();

    let paymentCreated: Payment | undefined;
    if (body.recordPayment && price > 0 && customer) {
      const payment: Payment = {
        id: `PAY-${1001 + db.payments.length}`,
        customerId: customer.id,
        amount: price,
        currency: db.settings.general.currency || 'ETB',
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentMethod: body.paymentMethod || 'bank_transfer',
        referenceNumber: body.referenceNumber || `RENEW-${domain.domainName}`,
        notes: `Payment for domain renewal: ${domain.domainName} (${years} yr)`,
        recordedBy: currentAdmin?.fullName || 'Admin',
        status: 'confirmed',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.payments.push(payment);
      paymentCreated = payment;

      if (db.settings.sms.enabled && db.settings.sms.autoPaymentConfirm && customer.phone) {
        const payTmpl = db.templates.find((t) => t.type === 'payment_confirmation' && t.channel === 'sms');
        const tmplStr =
          payTmpl?.bodyTemplate ||
          'Hello [Customer Name], we have confirmed your payment of [Amount] [Currency] received on [Payment Date] for [Service/Invoice Number]. Remaining balance: [Balance] [Currency]. Thank you for choosing NexGrid Digital Systems.';
        const msg = renderTemplate(tmplStr, {
          'Customer Name': customer.businessName || customer.contactPerson,
          'Amount': price.toLocaleString(),
          'Currency': payment.currency,
          'Payment Date': payment.paymentDate,
          'Service/Invoice Number': `Renewal ${domain.domainName}`,
          'Balance': '0.00',
        });
        await sendSmsBrowser(db, customer.phone, msg, customer.id, customer.businessName, 'payment_confirmation').catch(() => {});
      }
    }

    addAudit(
      db,
      currentAdmin,
      'DOMAIN_RENEWED',
      'domain',
      domain.id,
      `Renewed domain ${domain.domainName} from ${prevExp.slice(0, 10)} to ${body.newExpirationDate.slice(0, 10)} (${price} ETB)`
    );
    saveDb(db);

    return {
      success: true,
      domain,
      payment: paymentCreated,
    };
  }

  if (pathname.startsWith('/api/domains/') && method === 'PUT') {
    const dId = pathname.split('/')[3];
    const domain = db.domains.find((d) => d.id === dId);
    if (!domain) throw new Error('Domain not found.');

    if (body.domainName) domain.domainName = String(body.domainName).toLowerCase().trim();
    if (body.registrationDate) domain.registrationDate = body.registrationDate;
    if (body.expirationDate) {
      domain.expirationDate = body.expirationDate;
      const daysLeft = getDaysRemaining(body.expirationDate);
      if (body.status !== 'cancelled' && body.status !== 'renewed') {
        domain.status = daysLeft < 0 ? 'expired' : daysLeft <= 30 ? 'expiring_soon' : 'active';
      }
    }
    if (body.renewalPrice !== undefined) domain.renewalPrice = Number(body.renewalPrice);
    if (body.registrationPeriodYears !== undefined) domain.registrationPeriodYears = Number(body.registrationPeriodYears);
    if (body.registrar !== undefined) domain.registrar = String(body.registrar).trim();
    if (body.status) domain.status = body.status;
    if (body.notes !== undefined) domain.notes = String(body.notes).trim();
    domain.updatedAt = new Date().toISOString();

    addAudit(db, currentAdmin, 'DOMAIN_UPDATED', 'domain', domain.id, `Updated domain ${domain.domainName}`);
    saveDb(db);
    return { domain };
  }

  // 8B. Projects (Project Progress Tracking)
  if (pathname === '/api/projects' && method === 'GET') {
    const search = (urlObj.searchParams.get('search') || '').toLowerCase();
    const status = urlObj.searchParams.get('status') || 'all';
    if (!Array.isArray(db.projects)) db.projects = [];

    let list = db.projects.map((p) => {
      const cust = db.customers.find((c) => c.id === p.customerId);
      return {
        ...p,
        customerName: cust ? cust.businessName || cust.contactPerson : p.customerName || 'Client',
        customerPhone: cust?.phone || p.customerPhone || '',
        customerEmail: cust?.email || p.customerEmail || '',
      };
    });

    if (status && status !== 'all') {
      list = list.filter((p) => p.status === status);
    }

    if (search) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(search) ||
          (p.customerName && p.customerName.toLowerCase().includes(search)) ||
          (p.domainName && p.domainName.toLowerCase().includes(search)) ||
          p.currentPhase.toLowerCase().includes(search) ||
          p.id.toLowerCase().includes(search)
      );
    }

    list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return { projects: list };
  }

  if (pathname === '/api/projects' && method === 'POST') {
    if (!Array.isArray(db.projects)) db.projects = [];
    const cust = db.customers.find((c) => c.id === body.customerId);
    const clampedProgress = Math.min(100, Math.max(0, Number(body.progress) || 0));
    const cleanMilestones = Array.isArray(body.milestones)
      ? body.milestones.map((m: any, idx: number) => ({
          id: m.id || `ms-${Date.now()}-${idx + 1}`,
          title: String(m.title || '').trim() || `Milestone ${idx + 1}`,
          completed: Boolean(m.completed),
          dueDate: m.dueDate || undefined,
          completedAt: m.completed ? m.completedAt || new Date().toISOString() : undefined,
        }))
      : [];

    const newProject: Project = {
      id: `PRJ-${1001 + db.projects.length}`,
      customerId: body.customerId,
      customerName: cust ? cust.businessName || cust.contactPerson : 'Client',
      customerPhone: cust?.phone || '',
      customerEmail: cust?.email || '',
      domainName: body.domainName ? String(body.domainName).trim() : undefined,
      name: String(body.name || 'New Project').trim(),
      category: body.category || 'Web Development',
      status:
        clampedProgress === 100
          ? 'completed'
          : ['planning', 'in_progress', 'review_qa', 'completed', 'on_hold'].includes(body.status)
          ? body.status
          : 'in_progress',
      currentPhase: String(body.currentPhase || 'Requirements & Architecture').trim(),
      progress: clampedProgress,
      startDate: body.startDate || new Date().toISOString().slice(0, 10),
      targetDate: body.targetDate || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      budget: Math.max(0, Number(body.budget) || 0),
      currency: db.settings.general.currency || 'ETB',
      milestones: cleanMilestones,
      notes: body.notes ? String(body.notes).trim() : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.projects.unshift(newProject);
    addAudit(
      db,
      currentAdmin,
      'PROJECT_CREATED',
      'project',
      newProject.id,
      `Created project "${newProject.name}" for ${newProject.customerName} (${newProject.progress}% complete)`
    );
    saveDb(db);
    return { project: newProject };
  }

  if (pathname.startsWith('/api/projects/') && pathname.endsWith('/send-update') && method === 'POST') {
    if (!Array.isArray(db.projects)) db.projects = [];
    const prjId = pathname.split('/')[3];
    const project = db.projects.find((p) => p.id === prjId);
    if (!project) {
      return { success: false, status: 'failed', messageId: '', error: 'Project not found.' };
    }
    const cust = db.customers.find((c) => c.id === project.customerId);
    const targetPhone = (cust?.phone || project.customerPhone || '').trim();
    if (!targetPhone) {
      return {
        success: false,
        status: 'failed',
        messageId: '',
        error: 'Customer phone number is missing. Add a phone number to this customer first.',
      };
    }

    const statusLabels: Record<string, string> = {
      planning: 'Planning',
      in_progress: 'In Progress',
      review_qa: 'Review & QA',
      completed: 'Completed',
      on_hold: 'On Hold',
    };

    let messageText = (body.customMessage || '').trim();
    if (!messageText) {
      const tmpl = db.templates.find((t) => t.type === 'project_update' && t.channel === 'sms');
      const tmplStr =
        tmpl?.bodyTemplate ||
        'Hello [Customer Name], project update from NexGrid Digital Systems: Your project "[Project Name]" is now [Progress]% complete (Phase: [Current Phase], Status: [Project Status]). Check your progress or contact us at [Business Contact].';
      messageText = renderTemplate(tmplStr, {
        'Customer Name': cust?.businessName || cust?.contactPerson || project.customerName || 'Valued Client',
        'Project Name': project.name,
        'Progress': project.progress,
        'Current Phase': project.currentPhase,
        'Project Status': statusLabels[project.status] || project.status,
        'Target Date': project.targetDate,
        'Business Contact': db.settings.general.businessPhone || '+251 906697634',
      });
    }

    const result = await sendSmsBrowser(
      db,
      targetPhone,
      messageText,
      cust?.id || project.customerId,
      cust?.businessName || project.customerName || 'Client',
      'project_update'
    );

    if (result.success) {
      project.lastUpdateSentAt = new Date().toISOString();
      project.updatedAt = new Date().toISOString();
    }

    addAudit(
      db,
      currentAdmin,
      'PROJECT_UPDATE_SMS_SENT',
      'notification',
      project.id,
      `Sent project progress update SMS for "${project.name}" (${project.progress}%) to ${targetPhone}`
    );
    saveDb(db);
    return result;
  }

  if (pathname.startsWith('/api/projects/') && method === 'PUT') {
    if (!Array.isArray(db.projects)) db.projects = [];
    const prjId = pathname.split('/')[3];
    const project = db.projects.find((p) => p.id === prjId);
    if (!project) throw new Error('Project not found.');

    if (body.customerId) project.customerId = body.customerId;
    if (body.domainName !== undefined) project.domainName = String(body.domainName).trim() || undefined;
    if (body.name !== undefined && String(body.name).trim()) project.name = String(body.name).trim();
    if (body.category) project.category = body.category;
    if (body.currentPhase !== undefined) project.currentPhase = String(body.currentPhase).trim();
    if (body.progress !== undefined) {
      project.progress = Math.min(100, Math.max(0, Number(body.progress) || 0));
    }
    if (body.status) {
      project.status = body.status;
      if (body.status === 'completed') project.progress = 100;
    } else if (project.progress === 100 && project.status !== 'completed') {
      project.status = 'completed';
    }
    if (body.startDate) project.startDate = body.startDate;
    if (body.targetDate) project.targetDate = body.targetDate;
    if (body.budget !== undefined) project.budget = Math.max(0, Number(body.budget) || 0);
    if (Array.isArray(body.milestones)) {
      project.milestones = body.milestones.map((m: any, idx: number) => ({
        id: m.id || `ms-${Date.now()}-${idx + 1}`,
        title: String(m.title || '').trim() || `Milestone ${idx + 1}`,
        completed: Boolean(m.completed),
        dueDate: m.dueDate || undefined,
        completedAt: m.completed ? m.completedAt || new Date().toISOString() : undefined,
      }));
    }
    if (body.notes !== undefined) project.notes = String(body.notes).trim();
    project.updatedAt = new Date().toISOString();

    const cust = db.customers.find((c) => c.id === project.customerId);
    project.customerName = cust ? cust.businessName || cust.contactPerson : project.customerName || 'Client';
    project.customerPhone = cust?.phone || project.customerPhone || '';
    project.customerEmail = cust?.email || project.customerEmail || '';

    addAudit(
      db,
      currentAdmin,
      'PROJECT_UPDATED',
      'project',
      project.id,
      `Updated project "${project.name}" (${project.progress}% complete, Status: ${project.status})`
    );
    saveDb(db);
    return { project };
  }

  if (pathname.startsWith('/api/projects/') && method === 'DELETE') {
    if (!Array.isArray(db.projects)) db.projects = [];
    const prjId = pathname.split('/')[3];
    const idx = db.projects.findIndex((p) => p.id === prjId);
    if (idx === -1) throw new Error('Project not found.');
    const removed = db.projects.splice(idx, 1)[0];
    if (!Array.isArray(db.deletedIds)) db.deletedIds = [];
    if (removed && !db.deletedIds.includes(removed.id)) {
      db.deletedIds.push(removed.id);
    }
    addAudit(db, currentAdmin, 'PROJECT_DELETED', 'project', removed.id, `Deleted project "${removed.name}"`);
    saveDb(db);
    return { success: true };
  }

  // 9. Invoices, Quotations, Payments
  if (pathname === '/api/invoices' && method === 'GET') {
    return {
      invoices: db.invoices.map((rawInv) => {
        const inv = recalculateDocumentTotals(rawInv);
        const cust = db.customers.find((c) => c.id === inv.customerId);
        const totalPaid = db.payments
          .filter((p) => p.invoiceId === inv.id && p.status === 'confirmed')
          .reduce((s, p) => s + (Number(p.amount) || 0), 0);
        const remainingBalance = Math.max(0, inv.total - totalPaid);
        const status =
          inv.status === 'cancelled'
            ? 'cancelled'
            : totalPaid >= inv.total && inv.total > 0
            ? 'paid'
            : totalPaid > 0
            ? 'partially_paid'
            : inv.status;
        return {
          ...inv,
          status,
          customerName: cust?.businessName || 'Unknown',
          customerPhone: cust?.phone || '',
          customerEmail: cust?.email || '',
          totalPaid,
          remainingBalance,
        };
      }),
    };
  }

  if (pathname.startsWith('/api/invoices/') && pathname.endsWith('/send-reminder') && method === 'POST') {
    const invId = pathname.split('/')[3];
    const rawInv = db.invoices.find((i) => i.id === invId);
    if (!rawInv) {
      return { success: false, status: 'failed', error: 'Invoice not found.' };
    }
    const invoice = recalculateDocumentTotals(rawInv);
    const customer = db.customers.find((c) => c.id === invoice.customerId);
    if (!customer || !customer.phone) {
      return { success: false, status: 'failed', error: 'Customer phone number is missing.' };
    }
    const totalPaid = db.payments
      .filter((p) => p.invoiceId === invoice.id && p.status === 'confirmed')
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const remainingBalance = Math.max(0, invoice.total - totalPaid);

    const tmpl = db.templates.find((t) => t.type === 'invoice_reminder' && t.channel === 'sms');
    const tmplStr =
      tmpl?.bodyTemplate ||
      'Hello [Customer Name], this is a reminder from NexGrid Digital Systems regarding invoice [Invoice Number] for [Amount] [Currency], due on [Due Date]. Please arrange payment to avoid service disruption.';

    const messageText = renderTemplate(tmplStr, {
      'Customer Name': customer.businessName || customer.contactPerson,
      'Invoice Number': invoice.id,
      'Amount': remainingBalance.toLocaleString(),
      'Currency': invoice.currency,
      'Due Date': invoice.dueDate,
      'Business Contact': db.settings.general.businessPhone || db.settings.general.businessContact || '+251 906697634',
    });

    const res = await sendSmsBrowser(
      db,
      customer.phone,
      messageText,
      customer.id,
      customer.businessName,
      'invoice_reminder'
    );

    addAudit(
      db,
      currentAdmin,
      'INVOICE_REMINDER_SENT',
      'notification',
      invoice.id,
      `Sent invoice reminder for ${invoice.id} to ${customer.phone} (Status: ${res.status})`
    );
    saveDb(db);
    return res;
  }

  if (pathname.startsWith('/api/invoices/') && method === 'GET') {
    const invId = pathname.split('/')[3];
    const rawInv = db.invoices.find((i) => i.id === invId);
    if (!rawInv) throw new Error('Invoice not found.');
    const invoice = recalculateDocumentTotals(rawInv);
    const customer = db.customers.find((c) => c.id === invoice.customerId);
    const payments = db.payments.filter((p) => p.invoiceId === invoice.id && p.status === 'confirmed');
    const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const remainingBalance = Math.max(0, invoice.total - totalPaid);
    const overpayment = Math.max(0, totalPaid - invoice.total);

    return {
      invoice,
      customer,
      totalPaid,
      remainingBalance,
      overpayment,
      payments,
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

  if (pathname.startsWith('/api/invoices/') && method === 'PUT') {
    const invId = pathname.split('/')[3];
    const invoice = db.invoices.find((i) => i.id === invId);
    if (!invoice) throw new Error('Invoice not found.');

    if (body.items && Array.isArray(body.items)) {
      invoice.items = body.items.map((it: any, idx: number) => {
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
    }
    if (body.taxRate !== undefined) invoice.taxRate = Number(body.taxRate);
    if (body.discountAmount !== undefined) invoice.discountAmount = Number(body.discountAmount);
    if (body.issueDate) invoice.issueDate = body.issueDate;
    if (body.dueDate) invoice.dueDate = body.dueDate;
    if (body.notes !== undefined) invoice.notes = String(body.notes).trim();
    if (body.paymentInstructions !== undefined) invoice.paymentInstructions = String(body.paymentInstructions).trim();
    if (body.terms !== undefined) invoice.terms = String(body.terms).trim();
    if (body.status) invoice.status = body.status;

    const healed = recalculateDocumentTotals(invoice);
    Object.assign(invoice, healed, { updatedAt: new Date().toISOString() });
    saveDb(db);
    return { invoice };
  }

  if (pathname === '/api/quotations' && method === 'GET') {
    return {
      quotations: db.quotations.map((rawQ) => {
        const q = recalculateDocumentTotals(rawQ);
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
    const rawQuotation = db.quotations.find((q) => q.id === qId);
    if (!rawQuotation) throw new Error('Quotation not found.');
    const quotation = recalculateDocumentTotals(rawQuotation);
    Object.assign(rawQuotation, quotation);

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
    rawQuotation.status = 'accepted';
    rawQuotation.convertedInvoiceId = inv.id;
    rawQuotation.updatedAt = new Date().toISOString();
    db.invoices.push(inv);
    saveDb(db);
    return { success: true, invoice: inv, quotation: rawQuotation };
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

    let remainingBal = 0;
    if (pay.invoiceId) {
      const targetInv = db.invoices.find((i) => i.id === pay.invoiceId);
      if (targetInv) {
        const healedInv = recalculateDocumentTotals(targetInv);
        Object.assign(targetInv, healedInv);
        const paidSum = db.payments
          .filter((p) => p.invoiceId === targetInv.id && p.status === 'confirmed')
          .reduce((s, p) => s + (Number(p.amount) || 0), 0);
        remainingBal = Math.max(0, targetInv.total - paidSum);
        targetInv.status =
          paidSum >= targetInv.total && targetInv.total > 0
            ? 'paid'
            : paidSum > 0
            ? 'partially_paid'
            : targetInv.status;
        targetInv.updatedAt = new Date().toISOString();
      }
    }

    const cust = db.customers.find((c) => c.id === pay.customerId);
    if (db.settings.sms.enabled && db.settings.sms.autoPaymentConfirm && cust?.phone) {
      const payTmpl = db.templates.find((t) => t.type === 'payment_confirmation' && t.channel === 'sms');
      const tmplStr =
        payTmpl?.bodyTemplate ||
        'Hello [Customer Name], we have confirmed your payment of [Amount] [Currency] received on [Payment Date] for [Service/Invoice Number]. Remaining balance: [Balance] [Currency]. Thank you for choosing NexGrid Digital Systems.';
      const msg = renderTemplate(tmplStr, {
        'Customer Name': cust.businessName || cust.contactPerson,
        'Amount': pay.amount.toLocaleString(),
        'Currency': pay.currency,
        'Payment Date': pay.paymentDate.slice(0, 10),
        'Service/Invoice Number': pay.invoiceId || pay.notes || pay.id,
        'Balance': remainingBal.toLocaleString(),
      });
      await sendSmsBrowser(db, cust.phone, msg, cust.id, cust.businessName, 'payment_confirmation').catch(() => {});
    }

    saveDb(db);
    return { payment: pay };
  }

  if (pathname.startsWith('/api/payments/') && pathname.endsWith('/confirm') && method === 'POST') {
    const payId = pathname.split('/')[3];
    const pay = db.payments.find((p) => p.id === payId);
    if (!pay) throw new Error('Payment not found.');
    pay.status = 'confirmed';
    pay.updatedAt = new Date().toISOString();
    saveDb(db);
    return { success: true, payment: pay };
  }

  if (pathname.startsWith('/api/payments/') && pathname.endsWith('/reverse') && method === 'POST') {
    const payId = pathname.split('/')[3];
    const pay = db.payments.find((p) => p.id === payId);
    if (!pay) throw new Error('Payment not found.');
    pay.status = 'reversed';
    pay.reversalReason = body.reason || 'Reversed by administrator';
    pay.updatedAt = new Date().toISOString();
    if (pay.invoiceId) {
      const targetInv = db.invoices.find((i) => i.id === pay.invoiceId);
      if (targetInv) {
        const healedInv = recalculateDocumentTotals(targetInv);
        Object.assign(targetInv, healedInv);
        const paidSum = db.payments
          .filter((p) => p.invoiceId === targetInv.id && p.status === 'confirmed')
          .reduce((s, p) => s + (Number(p.amount) || 0), 0);
        targetInv.status =
          paidSum >= targetInv.total && targetInv.total > 0
            ? 'paid'
            : paidSum > 0
            ? 'partially_paid'
            : 'unpaid';
        targetInv.updatedAt = new Date().toISOString();
      }
    }
    saveDb(db);
    return { success: true, payment: pay };
  }

  // 10. Messaging & Templates
  if (pathname === '/api/messages/logs' && method === 'GET') {
    return { logs: db.messageLogs };
  }

  if (pathname.startsWith('/api/messages/') && pathname.endsWith('/retry') && method === 'POST') {
    const msgId = pathname.split('/')[3];
    const existingLog = db.messageLogs.find((m) => m.id === msgId);
    if (!existingLog) throw new Error('Message log not found.');
    const res = await sendSmsBrowser(
      db,
      existingLog.recipient,
      existingLog.content,
      existingLog.customerId,
      existingLog.customerName,
      existingLog.messageType,
      existingLog.domainId,
      existingLog.reminderInterval
    );
    return { success: res.success, status: res.status, error: res.error };
  }

  if (pathname === '/api/messages/log-email' && method === 'POST') {
    const validType = [
      'welcome',
      'domain_reminder',
      'payment_confirmation',
      'invoice_reminder',
      'new_feature',
      'project_update',
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
    const msgType = body.messageType || (pathname === '/api/messages/send-test' ? 'test' : 'custom');
    return sendSmsBrowser(db, body.phone, body.message, body.customerId, body.customerName, msgType);
  }

  if (pathname === '/api/messages/send-bulk' && method === 'POST') {
    const recipients = body.recipients || [];
    const results = [];
    let sent = 0;
    let failed = 0;
    for (const r of recipients) {
      const phone = typeof r === 'string' ? r : r.phone;
      const res = await sendSmsBrowser(db, phone, body.message, r.customerId, r.customerName, body.messageType || 'custom');
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

  // 11. Settings, Scheduler, Reports, Audit Logs, Backup & Factory Reset
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

  if (pathname === '/api/scheduler/run' && method === 'POST') {
    const intervals = db.settings.reminders.intervalsDays || [30, 15, 7, 3, 1, 0];
    let remindersSent = 0;
    let remindersSkipped = 0;
    const errors: string[] = [];

    for (const domain of db.domains) {
      if (domain.status === 'cancelled') continue;
      const daysLeft = getDaysRemaining(domain.expirationDate);
      if (intervals.includes(daysLeft)) {
        const cust = db.customers.find((c) => c.id === domain.customerId);
        if (!cust || !cust.phone) {
          remindersSkipped++;
          continue;
        }
        const tmpl = db.templates.find((t) => t.type === 'domain_reminder' && t.channel === 'sms');
        const tmplStr =
          tmpl?.bodyTemplate ||
          'Hello [Customer Name], your domain [Domain Name] is scheduled to expire on [Expiration Date] ([Days Remaining] days left). Renewal price: [Amount] [Currency]. Please contact NexGrid Digital Systems to arrange renewal.';
        const messageText = renderTemplate(tmplStr, {
          'Customer Name': cust.businessName || cust.contactPerson,
          'Domain Name': domain.domainName,
          'Expiration Date': new Date(domain.expirationDate).toISOString().split('T')[0],
          'Days Remaining': daysLeft,
          'Amount': (Number(domain.renewalPrice) || 0).toLocaleString(),
          'Currency': db.settings.general.currency || 'ETB',
          'Business Contact': db.settings.general.businessPhone || '+251 906697634',
        });
        const res = await sendSmsBrowser(db, cust.phone, messageText, cust.id, cust.businessName, 'domain_reminder', domain.id, daysLeft);
        if (res.success) {
          remindersSent++;
          domain.lastReminderSentAt = new Date().toISOString();
        } else if (res.error) {
          errors.push(`${domain.domainName}: ${res.error}`);
        }
      } else {
        remindersSkipped++;
      }
    }

    db.settings.reminders.lastSchedulerRun = new Date().toISOString();
    saveDb(db);
    return {
      runAt: db.settings.reminders.lastSchedulerRun,
      domainsChecked: db.domains.length,
      remindersSent,
      remindersSkipped,
      errors,
    };
  }

  if (pathname === '/api/backup/restore' && method === 'POST') {
    const uploaded = body.data || body;
    if (Array.isArray(uploaded.customers)) db.customers = uploaded.customers;
    if (Array.isArray(uploaded.domains)) db.domains = uploaded.domains;
    if (Array.isArray(uploaded.projects)) db.projects = uploaded.projects;
    if (Array.isArray(uploaded.invoices)) db.invoices = uploaded.invoices.map((i: Invoice) => recalculateDocumentTotals(i));
    if (Array.isArray(uploaded.quotations)) db.quotations = uploaded.quotations.map((q: Quotation) => recalculateDocumentTotals(q));
    if (Array.isArray(uploaded.payments)) db.payments = uploaded.payments;
    if (Array.isArray(uploaded.templates)) db.templates = uploaded.templates;
    if (Array.isArray(uploaded.messageLogs)) db.messageLogs = uploaded.messageLogs;
    saveDb(db);
    return {
      success: true,
      message: 'Database restored successfully.',
      counts: {
        customers: db.customers.length,
        domains: db.domains.length,
        invoices: db.invoices.length,
        payments: db.payments.length,
      },
    };
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

    for (const rawInv of db.invoices) {
      const inv = recalculateDocumentTotals(rawInv);
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

    const activeInvoices = db.invoices
      .map((i) => recalculateDocumentTotals(i))
      .filter((i) => i.status !== 'cancelled' && i.status !== 'draft');
    const confirmedPayments = db.payments.filter((p) => p.status === 'confirmed');
    const totalInvoiced = activeInvoices.reduce((s, i) => s + (Number(i.total) || 0), 0);
    const totalReceived = confirmedPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const outstandingReceivables = Math.max(0, totalInvoiced - totalReceived);

    const todayStr = new Date().toISOString().slice(0, 10);
    const unpaidInvoices = activeInvoices.filter((i) => i.status !== 'paid');
    const overdueInvoices = unpaidInvoices.filter((i) => i.dueDate < todayStr || i.status === 'overdue');
    const overdueAmount = overdueInvoices.reduce((s, i) => s + (Number(i.remainingBalance ?? i.total) || 0), 0);
    const pendingQuotes = db.quotations
      .map((q) => recalculateDocumentTotals(q))
      .filter((q) => q.status === 'sent' || q.status === 'draft');

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
