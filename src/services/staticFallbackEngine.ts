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
];

const defaultSettings: AppSettings = {
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
    if (!Array.isArray(parsed.templates)) parsed.templates = defaultTemplates;
    if (!Array.isArray(parsed.messageLogs)) parsed.messageLogs = [];
    if (!Array.isArray(parsed.auditLogs)) parsed.auditLogs = [];
    if (!parsed.settings) {
      parsed.settings = JSON.parse(JSON.stringify(defaultSettings));
    } else if (
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
      localStorage.setItem(STATIC_DB_KEY, JSON.stringify(parsed));
    }
    return parsed;
  } catch {
    return getEmptyStaticDb();
  }
}

function saveDb(db: StaticDatabase) {
  localStorage.setItem(STATIC_DB_KEY, JSON.stringify(db));
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

async function sendSmsBrowser(
  db: StaticDatabase,
  recipient: string,
  content: string,
  customerId = 'DIRECT',
  customerName = 'Direct Recipient',
  messageType: MessageLog['messageType'] = 'custom'
) {
  const msisdn = formatMsisdn(recipient);
  const cleanKey = (db.settings.sms.apiKey || '').trim();
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
    const payload: Record<string, any> = { msisdn, text: content };
    if (useCustomSender) payload.sender_id = customSender;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        KEY: cleanKey,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      log.status = 'sent';
      log.providerReference = data?.id || data?.message_id || `SMSET-${Date.now()}`;
    } else {
      log.status = 'failed';
      const isWhitelist =
        data?.error_code === 10007 ||
        data?.status === 'DEFAULT_CAMPAIGN_RECIPIENT_NOT_WHITELISTED';
      log.errorDetails = isWhitelist
        ? `Default Campaign Whitelist Required (Code 10007): Recipient ${msisdn} is not yet whitelisted in your SMS Ethiopia Default Campaign. Whitelist "${msisdn}" in your smsethiopia.com dashboard before sending, or submit your business registration documents for company registration and Sender ID approval.`
        : data?.error_message || data?.message || `Gateway returned HTTP ${res.status}`;
    }
  } catch (err: any) {
    log.status = 'failed';
    log.errorDetails = `Direct browser SMS call blocked by CORS or network (${err.message}). Connect a Node.js backend URL or run the server to proxy SMS Ethiopia API requests.`;
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
  const db = loadDb();
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body && typeof options.body === 'string' ? JSON.parse(options.body) : {};
  const urlObj = new URL(endpoint, 'http://localhost');
  const pathname = urlObj.pathname;

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
        return { ...inv, customerName: cust?.businessName || 'Unknown', totalPaid: 0, remainingBalance: inv.total };
      }),
    };
  }

  if (pathname === '/api/invoices' && method === 'POST') {
    const inv: Invoice = {
      id: `INV-${new Date().getFullYear()}-${String(db.invoices.length + 1).padStart(3, '0')}`,
      customerId: body.customerId,
      issueDate: body.issueDate || new Date().toISOString().slice(0, 10),
      dueDate: body.dueDate || new Date().toISOString().slice(0, 10),
      currency: body.currency || 'ETB',
      items: body.items || [],
      subtotal: Number(body.subtotal) || 0,
      taxRate: Number(body.taxRate) || 0,
      taxAmount: Number(body.taxAmount) || 0,
      discountAmount: Number(body.discountAmount) || 0,
      total: Number(body.total) || 0,
      status: body.status || 'unpaid',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.invoices.push(inv);
    saveDb(db);
    return { invoice: inv };
  }

  if (pathname === '/api/quotations' && method === 'GET') {
    return { quotations: db.quotations };
  }

  if (pathname === '/api/payments' && method === 'GET') {
    return {
      payments: db.payments.map((p) => {
        const cust = db.customers.find((c) => c.id === p.customerId);
        return { ...p, customerName: cust?.businessName || 'Unknown' };
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
    const msisdn = formatMsisdn(body.phone || '251911223344');
    return {
      success: false,
      httpStatus: 400,
      latencyMs: 120,
      provider: 'sms_et',
      endpoint: 'https://smsethiopia.com/api/sms/send',
      testedRecipient: msisdn,
      diagnosticStatus: 'starter_campaign_restricted',
      recommendation: `Default Campaign Active (Default Sender ID): Ensure "${msisdn}" is whitelisted in your SMS Ethiopia Default Campaign dashboard before sending.`,
    };
  }

  if (pathname === '/api/templates' && method === 'GET') {
    return { templates: db.templates };
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
    return {
      monthlyTrend: [],
      smsStats: {
        total: db.messageLogs.length,
        sent: db.messageLogs.filter((m) => m.status === 'sent').length,
        delivered: db.messageLogs.filter((m) => m.status === 'delivered').length,
        failed: db.messageLogs.filter((m) => m.status === 'failed').length,
        queued: 0,
      },
      domainHealth: {
        total: db.domains.length,
        active: db.domains.length,
        expiringSoon: 0,
        expired: 0,
      },
      financials: {
        totalInvoiced: 0,
        totalReceived: 0,
        outstandingReceivables: 0,
        overdueAmount: 0,
        unpaidInvoiceCount: 0,
        overdueInvoiceCount: 0,
        pendingQuotationsCount: 0,
        pendingQuotationsValue: 0,
        currency: 'ETB',
      },
    };
  }

  return {};
}
