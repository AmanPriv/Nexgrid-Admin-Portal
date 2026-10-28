export interface AdminUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: 'super_admin' | 'admin';
  createdAt?: string;
  lastLoginAt: string | null;
  mfaEnabled?: boolean;
  isPrimary?: boolean;
}

export interface ActiveSession {
  id: string;
  adminId: string;
  createdAt: string;
  lastActiveAt: string;
  ipAddress: string;
  userAgent: string;
  isCurrent: boolean;
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
  domainCount?: number;
  invoiceCount?: number;
  totalPaid?: number;
  outstanding?: number;
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
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
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
  daysLeft?: number;
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
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
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
  totalPaid?: number;
  remainingBalance?: number;
  overpayment?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Quotation {
  id: string;
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
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
  customerName?: string;
  customerEmail?: string;
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

export interface ProjectMilestone {
  id: string;
  title: string;
  completed: boolean;
  dueDate?: string;
  completedAt?: string;
}

export interface Project {
  id: string;
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  domainName?: string;
  name: string;
  category:
    | 'Web Development'
    | 'POS / ERP System'
    | 'Custom Software'
    | 'Mobile App'
    | 'E-Commerce'
    | 'Cloud & Infrastructure'
    | 'UI/UX & Branding';
  status: 'planning' | 'in_progress' | 'review_qa' | 'completed' | 'on_hold';
  currentPhase: string;
  progress: number; // 0 to 100
  startDate: string;
  targetDate: string;
  budget: number;
  currency: string;
  milestones: ProjectMilestone[];
  notes?: string;
  lastUpdateSentAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageTemplate {
  id: string;
  type:
    | 'welcome'
    | 'domain_reminder'
    | 'payment_confirmation'
    | 'invoice_reminder'
    | 'new_feature'
    | 'project_update';
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
  messageType:
    | 'welcome'
    | 'domain_reminder'
    | 'payment_confirmation'
    | 'invoice_reminder'
    | 'new_feature'
    | 'project_update'
    | 'test'
    | 'custom';
  content: string;
  subject?: string;
  providerReference?: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed';
  errorDetails?: string;
  attemptCount: number;
  lastAttemptAt: string;
  scheduledFor?: string;
  domainId?: string;
  projectId?: string;
  reminderInterval?: number;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  adminId: string;
  adminName: string;
  action: string;
  entityType:
    | 'customer'
    | 'domain'
    | 'project'
    | 'payment'
    | 'invoice'
    | 'quotation'
    | 'settings'
    | 'auth'
    | 'notification'
    | 'backup';
  entityId: string;
  details: string;
  ipAddress?: string;
}

export interface DashboardMetrics {
  totalCustomers: number;
  activeDomains: number;
  expiringSoonDomains: number;
  expiredDomains: number;
  totalReceivedRevenue: number;
  outstandingReceivables: number;
  totalInvoiced: number;
  unpaidInvoicesCount: number;
  overdueInvoicesCount: number;
  overdueAmount: number;
  pendingQuotationsCount: number;
  pendingQuotationsValue: number;
  totalProjects?: number;
  activeProjectsCount?: number;
  completedProjectsCount?: number;
  avgProjectProgress?: number;
  currency: string;
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
    bankName?: string;
    bankAccountName?: string;
    bankAccountNumber?: string;
    telebirrNumber?: string;
    secondaryBankDetails?: string;
    bankingDetails?: string;
  };
  sms: {
    provider: 'sms_et' | 'afro_message' | 'custom_webhook';
    apiEndpoint: string;
    apiKey?: string;
    apiKeyMasked?: string;
    hasApiKey?: boolean;
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
