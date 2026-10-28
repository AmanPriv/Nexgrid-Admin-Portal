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
  DashboardMetrics,
} from '../types.ts';
import { handleStaticApiRequest } from './staticFallbackEngine.ts';
import {
  signInWithFirebaseGoogle,
  signOutFirebase,
  upsertCustomerInFirestore,
  upsertDomainInFirestore,
  upsertInvoiceInFirestore,
  upsertQuotationInFirestore,
  upsertPaymentInFirestore,
} from '../firebase.ts';

const TOKEN_KEY = 'nexgrid_auth_token';
const CSRF_KEY = 'nexgrid_csrf_token';

// Clear any legacy persistent session tokens on initial app load so that
// first loading the website on any device ALWAYS requires authentication.
let inMemoryAuthToken: string | null = null;
let inMemoryCsrfToken: string | null = null;

if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(CSRF_KEY);
    localStorage.removeItem('nexgrid_cms_active_admin_id');
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(CSRF_KEY);
    sessionStorage.removeItem('nexgrid_cms_active_admin_id');
  } catch {
    // ignore storage errors
  }
}

let onUnauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorizedHandler = handler;
}

export function getStoredToken(): string | null {
  return inMemoryAuthToken;
}

export function setStoredToken(token: string) {
  inMemoryAuthToken = token;
}

export function getStoredCsrf(): string | null {
  return inMemoryCsrfToken;
}

export function setStoredCsrf(token: string) {
  inMemoryCsrfToken = token;
}

export function clearStoredToken() {
  inMemoryAuthToken = null;
  inMemoryCsrfToken = null;
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(CSRF_KEY);
      localStorage.removeItem('nexgrid_cms_active_admin_id');
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(CSRF_KEY);
      sessionStorage.removeItem('nexgrid_cms_active_admin_id');
    } catch {
      // ignore
    }
  }
}

// Configurable API base for external deployment (e.g. Render, Railway, VPS, GitHub Pages)
export function getApiBase(): string {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('nexgrid_custom_api_url');
    if (custom && custom.trim()) {
      return custom.trim().replace(/\/$/, '');
    }
  }
  return (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
}

export function setCustomApiUrl(url: string | null) {
  if (!url || !url.trim()) {
    localStorage.removeItem('nexgrid_custom_api_url');
  } else {
    localStorage.setItem('nexgrid_custom_api_url', url.trim().replace(/\/$/, ''));
  }
}

let detectedStaticHostRuntime = false;

export function isStaticHostWithoutCustomBackend(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    sessionStorage.removeItem('nexgrid_static_mode');
  } catch {
    // ignore
  }
  const apiBase = getApiBase();
  if (apiBase) return false;
  if (detectedStaticHostRuntime) return true;
  const host = window.location.hostname.toLowerCase();
  return (
    host.endsWith('.github.io') ||
    host.endsWith('.nexgrid.lol') ||
    host === 'nexgrid.lol' ||
    window.location.protocol === 'file:'
  );
}

async function runStaticFallback<T>(endpoint: string, options: RequestInit): Promise<T> {
  try {
    return (await handleStaticApiRequest(endpoint, options)) as T;
  } catch (err: any) {
    if (err?.status === 401) {
      clearStoredToken();
      if (onUnauthorizedHandler) {
        onUnauthorizedHandler();
      }
    }
    throw err;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  if (isStaticHostWithoutCustomBackend()) {
    return runStaticFallback<T>(endpoint, options);
  }

  const token = getStoredToken();
  const csrf = getStoredCsrf();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const method = (options.method || 'GET').toUpperCase();
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method) && csrf) {
    headers.set('X-CSRF-Token', csrf);
  }

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const apiBase = getApiBase();
  const fullUrl = endpoint.startsWith('http') ? endpoint : `${apiBase}${endpoint}`;

  let response: Response;
  try {
    response = await fetch(fullUrl, {
      ...options,
      headers,
    });
  } catch (netErr: any) {
    // If no custom API base is configured and relative /api fetch fails on a static host, use static fallback
    if (!apiBase && endpoint.startsWith('/api/')) {
      detectedStaticHostRuntime = true;
      return runStaticFallback<T>(endpoint, options);
    }
    throw new Error(
      `Cannot connect to NexGrid backend API at ${fullUrl}. Ensure your server is running (${netErr.message}).`
    );
  }

  if (response.status === 401) {
    clearStoredToken();
    if (onUnauthorizedHandler) {
      onUnauthorizedHandler();
    }
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || 'Session expired or authentication failed.');
  }

  let data: any = {};
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await response.json().catch(() => ({}));
  } else {
    // When deployed to a custom subdomain on GitHub Pages / Cloudflare Pages / Netlify without a custom backend URL,
    // relative /api/* requests return an HTML 404/405 page. Automatically switch to the Cloud-Synced Static Fallback Engine.
    if (!apiBase && endpoint.startsWith('/api/') && (response.status === 404 || response.status === 405 || contentType.includes('text/html'))) {
      detectedStaticHostRuntime = true;
      return runStaticFallback<T>(endpoint, options);
    }
    if (!response.ok) {
      throw new Error(
        `Backend API returned HTTP ${response.status} (${response.statusText}).`
      );
    }
  }

  if (!response.ok) {
    const errorMsg = data.error || `Request failed with status ${response.status}`;
    const err: any = new Error(errorMsg);
    err.status = response.status;
    err.retryAfterSeconds = data.retryAfterSeconds;
    err.code = data.code;
    throw err;
  }

  return data as T;
}

export const api = {
  // First-Run Setup & Auth
  async getSetupStatus(): Promise<{ setupRequired: boolean; adminsCount: number; setupSecret?: string | null }> {
    return request('/api/auth/setup-status');
  },

  async initiateSetup(setupSecret: string): Promise<{
    valid: boolean;
    mfa: {
      secret: string;
      qrCodeSvg: string;
      recoveryCodes: string[];
      hashedCodes: string[];
    };
  }> {
    return request('/api/auth/setup/initiate', {
      method: 'POST',
      body: JSON.stringify({ setupSecret }),
    });
  },

  async completeSetup(data: {
    setupSecret: string;
    username: string;
    email: string;
    fullName: string;
    password: string;
    mfaSecret: string;
    hashedCodes: string[];
    totpCode: string;
  }): Promise<{ token: string; csrfToken: string; admin: AdminUser; timeoutMinutes: number }> {
    const res = await request<{ token: string; csrfToken: string; admin: AdminUser; timeoutMinutes: number }>(
      '/api/auth/setup/complete',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    setStoredToken(res.token);
    if (res.csrfToken) setStoredCsrf(res.csrfToken);
    return res;
  },

  async registerPrimaryAdmin(data: {
    fullName: string;
    username: string;
    email: string;
    password: string;
  }): Promise<{ token: string; csrfToken: string; admin: AdminUser; timeoutMinutes: number }> {
    const res = await request<{ token: string; csrfToken: string; admin: AdminUser; timeoutMinutes: number }>(
      '/api/auth/setup/register',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    setStoredToken(res.token);
    if (res.csrfToken) setStoredCsrf(res.csrfToken);
    return res;
  },

  async login(
    username: string,
    password: string
  ): Promise<{
    mfaRequired?: boolean;
    mfaToken?: string;
    username?: string;
    token?: string;
    csrfToken?: string;
    admin?: AdminUser;
    timeoutMinutes?: number;
    message?: string;
  }> {
    const res = await request<any>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (res.token) {
      setStoredToken(res.token);
      if (res.csrfToken) setStoredCsrf(res.csrfToken);
    }
    return res;
  },

  async loginWithFirebaseGoogle(): Promise<{
    token: string;
    csrfToken: string;
    admin: AdminUser;
    timeoutMinutes: number;
  }> {
    const firebaseUser = await signInWithFirebaseGoogle();
    const res = await request<{
      token: string;
      csrfToken: string;
      admin: AdminUser;
      timeoutMinutes: number;
    }>('/api/auth/firebase-google', {
      method: 'POST',
      body: JSON.stringify({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        fullName: firebaseUser.displayName || 'Primary Administrator',
      }),
    });
    if (res.token) {
      setStoredToken(res.token);
      if (res.csrfToken) setStoredCsrf(res.csrfToken);
    }
    return res;
  },

  async verifyMfa(data: {
    mfaToken: string;
    code: string;
    isRecoveryCode?: boolean;
  }): Promise<{ token: string; csrfToken: string; admin: AdminUser; timeoutMinutes: number }> {
    const res = await request<any>('/api/auth/verify-mfa', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    setStoredToken(res.token);
    if (res.csrfToken) setStoredCsrf(res.csrfToken);
    return res;
  },

  async getMe(): Promise<{ admin: AdminUser; csrfToken?: string; timeoutMinutes: number }> {
    const token = getStoredToken();
    if (!token) {
      const err: any = new Error('Authentication required. Please log in.');
      err.status = 401;
      throw err;
    }
    const res = await request<{ admin: AdminUser; csrfToken?: string; timeoutMinutes: number }>('/api/auth/me');
    if (res.csrfToken) setStoredCsrf(res.csrfToken);
    return res;
  },

  async logout(): Promise<void> {
    try {
      await request('/api/auth/logout', { method: 'POST' });
    } finally {
      await signOutFirebase();
      clearStoredToken();
    }
  },

  async listSessions(): Promise<{ sessions: any[] }> {
    return request('/api/auth/sessions');
  },

  async revokeSession(sessionId: string): Promise<{ success: boolean }> {
    return request('/api/auth/revoke-session', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    });
  },

  async revokeAllOtherSessions(): Promise<{ success: boolean; revokedCount: number }> {
    return request('/api/auth/revoke-all-sessions', { method: 'POST' });
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    return request('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  async requestPasswordReset(email: string): Promise<{ success: boolean; message: string; verificationCode?: string }> {
    return request('/api/auth/request-reset', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async resetPassword(email: string, code: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    return request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, code, newPassword }),
    });
  },

  // User Management (Primary Admin Only)
  async getUsers(): Promise<{ users: AdminUser[] }> {
    return request('/api/users');
  },

  async createUser(data: {
    fullName: string;
    username: string;
    email: string;
    password: string;
    role: 'super_admin' | 'admin';
  }): Promise<{ user: AdminUser }> {
    return request('/api/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateUser(
    id: string,
    data: {
      fullName?: string;
      email?: string;
      role?: 'super_admin' | 'admin';
      newPassword?: string;
    }
  ): Promise<{ user: AdminUser }> {
    return request(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteUser(id: string): Promise<{ success: boolean }> {
    return request(`/api/users/${id}`, {
      method: 'DELETE',
    });
  },

  async factoryResetData(confirmationText: string, password: string): Promise<{ success: boolean; message: string }> {
    return request('/api/settings/factory-reset', {
      method: 'POST',
      body: JSON.stringify({ confirmationText, password }),
    });
  },

  // Dashboard
  async getDashboardStats(): Promise<{
    metrics: DashboardMetrics;
    upcomingDomainRenewals: (Domain & { customerName: string; customerPhone?: string; daysLeft: number })[];
    recentPayments: (Payment & { customerName: string })[];
    recentActivity: AuditLog[];
  }> {
    return request('/api/dashboard/stats');
  },

  // Customers
  async getCustomers(search = '', status = 'all'): Promise<{ customers: Customer[] }> {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    return request(`/api/customers?${params.toString()}`);
  },

  async checkDuplicateCustomer(phone: string, email: string, excludeId = ''): Promise<{
    hasDuplicate: boolean;
    duplicatePhoneCustomer: { id: string; name: string; phone: string } | null;
    duplicateEmailCustomer: { id: string; name: string; email: string } | null;
  }> {
    const params = new URLSearchParams({ phone, email, excludeId });
    return request(`/api/customers/check-duplicate?${params.toString()}`);
  },

  async getCustomerById(id: string): Promise<{
    customer: Customer;
    domains: Domain[];
    invoices: Invoice[];
    quotations: Quotation[];
    payments: Payment[];
    messages: MessageLog[];
  }> {
    return request(`/api/customers/${id}`);
  },

  async createCustomer(customerData: Partial<Customer>): Promise<{ customer: Customer; welcomeSent: boolean }> {
    const res = await request<{ customer: Customer; welcomeSent: boolean }>('/api/customers', {
      method: 'POST',
      body: JSON.stringify(customerData),
    });
    if (res.customer) upsertCustomerInFirestore(res.customer).catch(() => {});
    return res;
  },

  async updateCustomer(id: string, customerData: Partial<Customer>): Promise<{ customer: Customer }> {
    const res = await request<{ customer: Customer }>(`/api/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(customerData),
    });
    if (res.customer) upsertCustomerInFirestore(res.customer).catch(() => {});
    return res;
  },

  async archiveCustomer(id: string): Promise<{ success: boolean; customer: Customer }> {
    const res = await request<{ success: boolean; customer: Customer }>(`/api/customers/${id}/archive`, { method: 'POST' });
    if (res.customer) upsertCustomerInFirestore(res.customer).catch(() => {});
    return res;
  },

  async unarchiveCustomer(id: string): Promise<{ success: boolean; customer: Customer }> {
    const res = await request<{ success: boolean; customer: Customer }>(`/api/customers/${id}/unarchive`, { method: 'POST' });
    if (res.customer) upsertCustomerInFirestore(res.customer).catch(() => {});
    return res;
  },

  // Domains
  async getDomains(search = '', status = 'all'): Promise<{ domains: Domain[] }> {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    return request(`/api/domains?${params.toString()}`);
  },

  async createDomain(domainData: Partial<Domain>): Promise<{ domain: Domain }> {
    const res = await request<{ domain: Domain }>('/api/domains', {
      method: 'POST',
      body: JSON.stringify(domainData),
    });
    if (res.domain) upsertDomainInFirestore(res.domain).catch(() => {});
    return res;
  },

  async updateDomain(id: string, domainData: Partial<Domain>): Promise<{ domain: Domain }> {
    const res = await request<{ domain: Domain }>(`/api/domains/${id}`, {
      method: 'PUT',
      body: JSON.stringify(domainData),
    });
    if (res.domain) upsertDomainInFirestore(res.domain).catch(() => {});
    return res;
  },

  async renewDomain(
    id: string,
    data: {
      newExpirationDate: string;
      periodYears: number;
      renewalPrice: number;
      notes?: string;
      recordPayment?: boolean;
      paymentMethod?: string;
      referenceNumber?: string;
    }
  ): Promise<{ success: boolean; domain: Domain; payment?: Payment }> {
    const res = await request<{ success: boolean; domain: Domain; payment?: Payment }>(`/api/domains/${id}/renew`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (res.domain) upsertDomainInFirestore(res.domain).catch(() => {});
    if (res.payment) upsertPaymentInFirestore(res.payment).catch(() => {});
    return res;
  },

  async sendDomainReminder(
    id: string,
    customMessage?: string
  ): Promise<{ success: boolean; messageId: string; status: string; error?: string }> {
    return request(`/api/domains/${id}/send-reminder`, {
      method: 'POST',
      body: JSON.stringify({ customMessage }),
    });
  },

  // Projects (Project Progress Tracking)
  async getProjects(search = '', status = 'all'): Promise<{ projects: Project[] }> {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    return request(`/api/projects?${params.toString()}`);
  },

  async createProject(projectData: Partial<Project>): Promise<{ project: Project }> {
    return request('/api/projects', {
      method: 'POST',
      body: JSON.stringify(projectData),
    });
  },

  async updateProject(id: string, projectData: Partial<Project>): Promise<{ project: Project }> {
    return request(`/api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(projectData),
    });
  },

  async deleteProject(id: string): Promise<{ success: boolean }> {
    return request(`/api/projects/${id}`, {
      method: 'DELETE',
    });
  },

  async sendProjectUpdateSms(
    id: string,
    customMessage?: string
  ): Promise<{ success: boolean; messageId: string; status: string; error?: string }> {
    return request(`/api/projects/${id}/send-update`, {
      method: 'POST',
      body: JSON.stringify({ customMessage }),
    });
  },

  // Invoices & Quotations
  async getInvoices(): Promise<{ invoices: Invoice[] }> {
    return request('/api/invoices');
  },

  async getInvoiceById(id: string): Promise<{
    invoice: Invoice;
    customer: Customer;
    totalPaid: number;
    remainingBalance: number;
    overpayment: number;
    payments: Payment[];
  }> {
    return request(`/api/invoices/${id}`);
  },

  async createInvoice(invoiceData: Partial<Invoice>): Promise<{ invoice: Invoice }> {
    const res = await request<{ invoice: Invoice }>('/api/invoices', {
      method: 'POST',
      body: JSON.stringify(invoiceData),
    });
    if (res.invoice) upsertInvoiceInFirestore(res.invoice).catch(() => {});
    return res;
  },

  async updateInvoice(id: string, invoiceData: Partial<Invoice>): Promise<{ invoice: Invoice }> {
    const res = await request<{ invoice: Invoice }>(`/api/invoices/${id}`, {
      method: 'PUT',
      body: JSON.stringify(invoiceData),
    });
    if (res.invoice) upsertInvoiceInFirestore(res.invoice).catch(() => {});
    return res;
  },

  async sendInvoiceReminder(id: string): Promise<{ success: boolean; status: string; error?: string }> {
    return request(`/api/invoices/${id}/send-reminder`, { method: 'POST' });
  },

  async getQuotations(): Promise<{ quotations: Quotation[] }> {
    return request('/api/quotations');
  },

  async createQuotation(data: Partial<Quotation>): Promise<{ quotation: Quotation }> {
    const res = await request<{ quotation: Quotation }>('/api/quotations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (res.quotation) upsertQuotationInFirestore(res.quotation).catch(() => {});
    return res;
  },

  async convertQuotationToInvoice(id: string): Promise<{ success: boolean; invoice: Invoice; quotation: Quotation }> {
    const res = await request<{ success: boolean; invoice: Invoice; quotation: Quotation }>(
      `/api/quotations/${id}/convert-to-invoice`,
      { method: 'POST' }
    );
    if (res.invoice) upsertInvoiceInFirestore(res.invoice).catch(() => {});
    if (res.quotation) upsertQuotationInFirestore(res.quotation).catch(() => {});
    return res;
  },

  // Payments
  async getPayments(): Promise<{ payments: Payment[] }> {
    return request('/api/payments');
  },

  async recordPayment(paymentData: Partial<Payment>): Promise<{ payment: Payment }> {
    const res = await request<{ payment: Payment }>('/api/payments', {
      method: 'POST',
      body: JSON.stringify(paymentData),
    });
    if (res.payment) upsertPaymentInFirestore(res.payment).catch(() => {});
    return res;
  },

  async confirmPayment(id: string): Promise<{ success: boolean; payment: Payment }> {
    const res = await request<{ success: boolean; payment: Payment }>(`/api/payments/${id}/confirm`, { method: 'POST' });
    if (res.payment) upsertPaymentInFirestore(res.payment).catch(() => {});
    return res;
  },

  async reversePayment(id: string, reason: string): Promise<{ success: boolean; payment: Payment }> {
    const res = await request<{ success: boolean; payment: Payment }>(`/api/payments/${id}/reverse`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    if (res.payment) upsertPaymentInFirestore(res.payment).catch(() => {});
    return res;
  },

  // Messaging & Templates
  async getMessageLogs(): Promise<{ logs: MessageLog[] }> {
    return request('/api/messages/logs');
  },

  async retryMessage(id: string): Promise<{ success: boolean; status: string; error?: string }> {
    return request(`/api/messages/${id}/retry`, { method: 'POST' });
  },

  async sendTestSms(phone: string, message: string): Promise<{ success: boolean; status: string; error?: string }> {
    return request('/api/messages/send-test', {
      method: 'POST',
      body: JSON.stringify({ phone, message }),
    });
  },

  async sendMessage(data: {
    phone: string;
    message: string;
    customerId?: string;
    customerName?: string;
    messageType?: string;
  }): Promise<{ success: boolean; status: string; messageId: string; error?: string }> {
    return request('/api/messages/send', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async sendBulkMessage(data: {
    recipients: Array<{ phone: string; customerId?: string; customerName?: string }>;
    message: string;
    messageType?: string;
  }): Promise<{
    success: boolean;
    total: number;
    sent: number;
    failed: number;
    results: Array<{ phone: string; status: string; messageId?: string; error?: string }>;
  }> {
    return request('/api/messages/send-bulk', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async recordEmailLog(data: {
    recipient: string;
    subject: string;
    content: string;
    customerId?: string;
    customerName?: string;
    messageType?: string;
    status: 'sent' | 'delivered' | 'failed';
    providerReference?: string;
    errorDetails?: string;
    domainId?: string;
  }): Promise<{ success: boolean; log: MessageLog }> {
    return request('/api/messages/log-email', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async diagnoseGateway(
    phone?: string,
    extra?: { apiKey?: string; senderId?: string; endpoint?: string }
  ): Promise<{
    success: boolean;
    httpStatus: number;
    latencyMs: number;
    provider: string;
    endpoint: string;
    testedRecipient: string;
    diagnosticStatus: string;
    rawResponse?: any;
    recommendation: string;
  }> {
    return request('/api/messages/diagnose-gateway', {
      method: 'POST',
      body: JSON.stringify({ phone, ...extra }),
    });
  },

  async getTemplates(): Promise<{ templates: MessageTemplate[] }> {
    return request('/api/templates');
  },

  async updateTemplate(id: string, data: Partial<MessageTemplate>): Promise<{ template: MessageTemplate }> {
    return request(`/api/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Settings & Scheduler
  async getSettings(): Promise<{ settings: AppSettings }> {
    return request('/api/settings');
  },

  async updateSettings(settings: Partial<AppSettings>): Promise<{ success: boolean; message: string }> {
    return request('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  async runScheduler(): Promise<{
    runAt: string;
    domainsChecked: number;
    remindersSent: number;
    remindersSkipped: number;
    errors: string[];
  }> {
    return request('/api/scheduler/run', { method: 'POST' });
  },

  // Audit Logs
  async getAuditLogs(entityType = 'all', search = ''): Promise<{ logs: AuditLog[] }> {
    const params = new URLSearchParams();
    if (entityType && entityType !== 'all') params.set('entityType', entityType);
    if (search) params.set('search', search);
    return request(`/api/audit-logs?${params.toString()}`);
  },

  // Reports
  async getReports(): Promise<{
    monthlyTrend: { month: string; invoiced: number; collected: number }[];
    smsStats: { total: number; sent: number; delivered: number; failed: number; queued: number };
    domainHealth: { total: number; active: number; expiringSoon: number; expired: number };
    financials: any;
  }> {
    return request('/api/reports');
  },

  // Backup & Restore
  getBackupDownloadUrl(): string {
    const token = getStoredToken();
    return `/api/backup/download?token=${token || ''}`;
  },

  async restoreBackup(backupJson: any): Promise<{ success: boolean; message: string; counts: any }> {
    return request('/api/backup/restore', {
      method: 'POST',
      body: JSON.stringify(backupJson),
    });
  },

  getExportCsvUrl(entity: 'customers' | 'domains' | 'invoices' | 'payments'): string {
    return `/api/export/csv/${entity}`;
  },
};
