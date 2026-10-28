export type ReportCategoryId =
  | 'executive'
  | 'projects'
  | 'financial'
  | 'time'
  | 'sales'
  | 'hr'
  | 'quality'
  | 'support'
  | 'compliance';

export type ReportRole = 'super_admin' | 'admin' | 'finance' | 'project_manager' | 'staff';

export interface ReportFilterState {
  datePreset: '30d' | '90d' | '6m' | '1y' | 'all' | 'custom';
  startDate: string;
  endDate: string;
  clientId: string;
  projectId: string;
  teamMember: string;
  serviceType: string;
  status: string;
}

export interface ExecutiveKpiMetrics {
  revenue: number;
  collectedRevenue: number;
  outstandingReceivables: number;
  profitMarginPct: number;
  utilizationPct: number;
  onTimeDeliveryPct: number;
  clientRetentionPct: number;
  activeClientsCount: number;
  activeDomainsCount: number;
  currency: string;
}

export interface ExecutivePeriodSummaryRow {
  id: string;
  periodLabel: string;
  periodType: 'monthly' | 'quarterly' | 'annual';
  invoicedRevenue: number;
  collectedRevenue: number;
  estimatedCost: number;
  netMargin: number;
  marginPct: number;
  utilizationPct: number;
  onTimeDeliveryPct: number;
  activeProjects: number;
  newClients: number;
}

export interface ExecutiveForecastRow {
  id: string;
  horizonMonth: string;
  projectedRevenue: number;
  committedRecurringRevenue: number;
  weightedPipelineValue: number;
  projectedCapacityHours: number;
  allocatedHours: number;
  capacityUtilizationPct: number;
  confidenceLevel: 'High' | 'Medium' | 'Conservative';
}

export interface ScheduledReportConfig {
  id: string;
  name: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  dayOfWeekOrMonth: string;
  timeOfDay: string;
  recipients: string[];
  categories: ReportCategoryId[];
  format: 'pdf' | 'excel' | 'csv';
  includeChartsSummary: boolean;
  clientSafeMode: boolean;
  enabled: boolean;
  lastSentAt?: string;
  createdAt: string;
}

export interface ClientSafeShareConfig {
  id: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  includeProjectStatus: boolean;
  includeHoursSummary: boolean;
  includeInvoices: boolean;
  hideInternalCostsAndMargins: boolean;
  customNote: string;
  createdAt: string;
  expiresAt: string;
}

export const REPORT_CATEGORIES: {
  id: ReportCategoryId;
  label: string;
  shortLabel: string;
  description: string;
  phase: 1 | 2 | 3;
  allowedRoles: ReportRole[];
}[] = [
  {
    id: 'executive',
    label: '9. Executive Dashboard',
    shortLabel: 'Executive Dashboard',
    description: 'KPI scorecards, monthly/quarterly/annual summaries, revenue/capacity/pipeline forecasts, and settlement health',
    phase: 1,
    allowedRoles: ['super_admin', 'admin', 'finance', 'project_manager'],
  },
  {
    id: 'financial',
    label: '2. Financial Reports',
    shortLabel: 'Financial',
    description: 'Invoicing, revenue by client/service/period, project profitability, AR aging, expenses, budget vs. actual, MRR/ARR',
    phase: 2,
    allowedRoles: ['super_admin', 'admin', 'finance'],
  },
  {
    id: 'projects',
    label: '1. Project & Delivery',
    shortLabel: 'Project & Delivery',
    description: 'Project status & phases, milestone tracking, task progress, change requests, and RAG health & risks',
    phase: 2,
    allowedRoles: ['super_admin', 'admin', 'project_manager', 'staff'],
  },
  {
    id: 'time',
    label: '3. Time & Resource',
    shortLabel: 'Time & Resource',
    description: 'Timesheets by person/project/task, billable vs. non-billable hours, utilization & capacity, estimated vs. actual',
    phase: 3,
    allowedRoles: ['super_admin', 'admin', 'project_manager', 'staff'],
  },
  {
    id: 'sales',
    label: '4. Sales & Client',
    shortLabel: 'Sales & Client',
    description: 'Lead pipeline & conversion, proposals/quotes won/lost, client activity, LTV & concentration, CSAT/NPS',
    phase: 3,
    allowedRoles: ['super_admin', 'admin', 'finance', 'project_manager'],
  },
  {
    id: 'hr',
    label: '5. Team & HR',
    shortLabel: 'Team & HR',
    description: 'Attendance & leave, employee performance, headcount & payroll summary, hiring/onboarding, skills matrix',
    phase: 3,
    allowedRoles: ['super_admin', 'admin'],
  },
  {
    id: 'quality',
    label: '6. Quality & Technical',
    shortLabel: 'Quality & Technical',
    description: 'Defect rates, QA test runs, Core Web Vitals & uptime, SEO/accessibility audits, security scans, release log',
    phase: 3,
    allowedRoles: ['super_admin', 'admin', 'project_manager', 'staff'],
  },
  {
    id: 'support',
    label: '7. Support & Maintenance',
    shortLabel: 'Support & SLA',
    description: 'Support ticket SLA metrics, maintenance contract renewals, domain/hosting/SSL expiry tracker, backup & uptime',
    phase: 3,
    allowedRoles: ['super_admin', 'admin', 'project_manager', 'staff'],
  },
  {
    id: 'compliance',
    label: '8. Admin & Compliance',
    shortLabel: 'Admin & Compliance',
    description: 'System audit log, RBAC roles & permissions matrix, NDA/SLA document status, privacy requests, portal usage',
    phase: 3,
    allowedRoles: ['super_admin', 'admin'],
  },
];
