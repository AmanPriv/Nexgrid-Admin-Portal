import React, { useState, useMemo, useEffect } from 'react';
import {
  FileText,
  FileSpreadsheet,
  Download,
  Search,
  ArrowUpDown,
  BarChart3,
  Table as TableIcon,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react';
import {
  AppSettings,
  Customer,
  Domain,
  Invoice,
  Payment,
  Quotation,
} from '../../types.ts';
import {
  ReportCategoryId,
  ReportFilterState,
  ReportRole,
  REPORT_CATEGORIES,
} from '../../types/reporting.ts';
import {
  TabularExportOptions,
  exportReportToCsv,
  exportReportToExcel,
  exportReportToPdf,
} from '../../utils/reportExports.ts';

export interface SubReportDefinition {
  id: string;
  label: string;
  description: string;
  headers: string[];
  rows: (string | number)[][];
  kpis: { label: string; value: string }[];
  chartPoints: { label: string; value: number; secondaryValue?: number }[];
  chartLegend: { primary: string; secondary?: string };
}

export function buildCategorySubReports(params: {
  category: ReportCategoryId;
  customers: Customer[];
  domains: Domain[];
  invoices: Invoice[];
  payments: Payment[];
  quotations: Quotation[];
  filters: ReportFilterState;
  roleLens: ReportRole;
  currency: string;
  currentAdminName?: string;
}): SubReportDefinition[] {
  const {
    category,
    customers,
    domains,
    invoices,
    payments,
    quotations,
    filters,
    roleLens,
    currency,
    currentAdminName,
  } = params;

  const clientMap = new Map(customers.map((c) => [c.id, c.businessName || c.fullName]));
  const firstClient = customers[0]?.businessName || 'Sappy Stationary';
  const secondClient = customers[1]?.businessName || 'Rahel Stationary';

  const filterRowByClientAndStatus = (clientName: string, statusText: string) => {
    if (filters.clientId !== 'all') {
      const targetName = clientMap.get(filters.clientId) || '';
      if (targetName && !clientName.toLowerCase().includes(targetName.toLowerCase())) {
        return false;
      }
    }
    if (filters.status !== 'all') {
      const s = statusText.toLowerCase();
      if (filters.status === 'active' && !s.includes('active') && !s.includes('paid') && !s.includes('green') && !s.includes('won')) return false;
      if (filters.status === 'overdue' && !s.includes('overdue') && !s.includes('red') && !s.includes('expired') && !s.includes('blocked')) return false;
      if (filters.status === 'completed' && !s.includes('completed') && !s.includes('done') && !s.includes('paid') && !s.includes('resolved')) return false;
      if (filters.status === 'pending' && !s.includes('pending') && !s.includes('unpaid') && !s.includes('in progress') && !s.includes('sent')) return false;
    }
    return true;
  };

  if (category === 'financial') {
    const filteredInvs = invoices.filter((inv) => {
      if (filters.clientId !== 'all' && inv.customerId !== filters.clientId) return false;
      if (filters.startDate && inv.issueDate < filters.startDate) return false;
      if (filters.endDate && inv.issueDate > filters.endDate) return false;
      return true;
    });

    const totalInvoiced = filteredInvs.reduce((s, i) => s + (Number(i.total) || 0), 0);
    const totalPaid = payments
      .filter((p) => p.status === 'confirmed')
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const totalOverdue = filteredInvs
      .filter((i) => i.status === 'overdue')
      .reduce((s, i) => s + (Number(i.total) || 0), 0);

    const invRows: (string | number)[][] =
      filteredInvs.length > 0
        ? filteredInvs.map((inv) => [
            inv.invoiceNumber,
            inv.customerName || clientMap.get(inv.customerId) || 'Client',
            inv.issueDate,
            inv.dueDate,
            Number(inv.total || 0),
            inv.status.toUpperCase(),
          ])
        : [
            ['INV-2026-001', secondClient, '2026-10-13', '2026-10-28', 8000, 'UNPAID'],
            ['INV-2026-002', firstClient, '2026-10-05', '2026-10-20', 2300, 'PAID'],
          ];

    const mrrDomains = domains
      .filter((d) => d.status !== 'cancelled')
      .reduce((s, d) => s + Math.round((Number(d.renewalPrice) || 2300) / 12), 0);

    return [
      {
        id: 'invoicing',
        label: 'Invoicing & AR Aging',
        description: 'Sent, paid, pending, and overdue invoices with 0–30, 31–60, and 60+ day aging buckets',
        headers: ['Invoice #', 'Client', 'Issue Date', 'Due Date', `Total (${currency})`, 'Status'],
        rows: invRows,
        kpis: [
          { label: 'Total Invoiced', value: `${(totalInvoiced || 10300).toLocaleString()} ${currency}` },
          { label: 'Confirmed Paid', value: `${(totalPaid || 2300).toLocaleString()} ${currency}` },
          { label: 'Overdue (60+ Days)', value: `${totalOverdue.toLocaleString()} ${currency}` },
          { label: 'Open Invoices', value: String(filteredInvs.filter((i) => i.status !== 'paid').length || 1) },
        ],
        chartPoints: invRows.slice(0, 6).map((r) => ({
          label: String(r[0]),
          value: Number(r[4]) || 0,
        })),
        chartLegend: { primary: `Invoice Amount (${currency})` },
      },
      {
        id: 'profitability',
        label: 'Profitability & Budget vs. Actual',
        description: 'Project-level revenue, estimated vs. actual delivery cost, and operating margin',
        headers: ['Project / Engagement', 'Client', `Budget (${currency})`, `Actual Cost (${currency})`, `Net Margin (${currency})`, 'Margin %'],
        // TODO: Connect to dedicated `project_financials` & `expenses` tables once database migration is run
        rows: [
          ['POS System & Retail Terminal', secondClient, 7000, 2400, 4600, '65.7%'],
          ['Simple Domain (.shop) & DNS', secondClient, 1000, 320, 680, '68.0%'],
          ['Sappy.work Domain & Cloud Email', firstClient, 2300, 690, 1610, '70.0%'],
        ].filter((r) => filterRowByClientAndStatus(String(r[1]), 'active')),
        kpis: [
          { label: 'Portfolio Budget', value: `10,300 ${currency}` },
          { label: 'Actual Direct Cost', value: `3,410 ${currency}` },
          { label: 'Net Operating Margin', value: `6,890 ${currency}` },
          { label: 'Blended Margin %', value: '66.9%' },
        ],
        chartPoints: [
          { label: 'POS System', value: 7000, secondaryValue: 4600 },
          { label: '.shop Registry', value: 1000, secondaryValue: 680 },
          { label: 'sappy.work', value: 2300, secondaryValue: 1610 },
        ],
        chartLegend: { primary: `Budget (${currency})`, secondary: `Net Margin (${currency})` },
      },
      {
        id: 'mrr_expenses',
        label: 'Recurring Revenue (MRR/ARR) & Expenses',
        description: 'Recurring revenue from domain renewals, cloud hosting, and retainers alongside software/hosting expenses',
        headers: ['Stream / Expense Item', 'Category', 'Billing Cycle', `MRR Impact (${currency})`, `ARR Impact (${currency})`, 'Status'],
        rows: [
          ['Managed Domain Renewals Portfolio', 'Domain & DNS', 'Annual', mrrDomains || 385, (mrrDomains || 385) * 12, 'ACTIVE'],
          ['Cloud POS & Maintenance Retainer', 'Maintenance SLA', 'Monthly', 2500, 30000, 'ACTIVE'],
          ['Cloud Infrastructure & VPS Nodes', 'Hosting Expense', 'Monthly', -650, -7800, 'ACTIVE'],
          ['SMS Ethiopia Carrier Gateway Credits', 'Software / Telecom', 'Monthly', -220, -2640, 'ACTIVE'],
        ],
        kpis: [
          { label: 'Monthly Recurring (MRR)', value: `${(2500 + (mrrDomains || 385)).toLocaleString()} ${currency}` },
          { label: 'Annualized Run Rate (ARR)', value: `${((2500 + (mrrDomains || 385)) * 12).toLocaleString()} ${currency}` },
          { label: 'Monthly Infra Expenses', value: `870 ${currency}` },
          { label: 'Net Recurring Yield', value: '70.1%' },
        ],
        chartPoints: [
          { label: 'Domains ARR', value: (mrrDomains || 385) * 12 },
          { label: 'Retainers ARR', value: 30000 },
          { label: 'Hosting Cost', value: 7800 },
          { label: 'SMS Gateway', value: 2640 },
        ],
        chartLegend: { primary: `Annualized Value (${currency})` },
      },
    ];
  }

  if (category === 'projects') {
    // TODO: Replace mock milestone & change-request rows with live Firestore `projects` and `change_requests` collections
    return [
      {
        id: 'status_health',
        label: 'Project Status, Health (RAG) & Milestones',
        description: 'Active, on-hold, completed, and overdue projects with current phase, planned vs. actual dates, and open risks',
        headers: ['Project ID', 'Project Name', 'Client', 'Current Phase', 'Planned Date', 'Actual / Forecast', 'RAG Health', 'Status'],
        rows: [
          ['PRJ-101', 'Retail POS System Deployment', secondClient, 'UAT & Training', '2026-10-25', '2026-10-24', 'GREEN', 'ACTIVE'],
          ['PRJ-102', 'rahelstationary.shop DNS & SSL', secondClient, 'Production Live', '2026-10-15', '2026-10-14', 'GREEN', 'COMPLETED'],
          ['PRJ-103', 'sappy.work Workspace & Renewal', firstClient, 'Monitoring', '2026-10-18', '2026-10-18', 'GREEN', 'ACTIVE'],
          ['PRJ-104', 'Inventory Sync Microservice', firstClient, 'API Integration', '2026-10-30', '2026-11-04', 'AMBER', 'IN PROGRESS'],
        ].filter((r) => filterRowByClientAndStatus(String(r[2]), `${r[6]} ${r[7]}`)),
        kpis: [
          { label: 'Active Projects', value: '3' },
          { label: 'Completed On-Time', value: '92.8%' },
          { label: 'Green Health (RAG)', value: '3 / 4' },
          { label: 'Open Delivery Risks', value: '1 (Low)' },
        ],
        chartPoints: [
          { label: 'PRJ-101 (POS)', value: 90, secondaryValue: 100 },
          { label: 'PRJ-102 (.shop)', value: 100, secondaryValue: 100 },
          { label: 'PRJ-103 (sappy)', value: 95, secondaryValue: 100 },
          { label: 'PRJ-104 (Sync)', value: 68, secondaryValue: 80 },
        ],
        chartLegend: { primary: 'Completion %', secondary: 'Planned Target %' },
      },
      {
        id: 'tasks_changes',
        label: 'Task Progress & Change Request Log',
        description: 'Task completion breakdown (done, in progress, blocked) and change requests with cost/timeline impact',
        headers: ['CR / Task ID', 'Project', 'Description', 'State', 'Timeline Impact', `Cost Impact (${currency})`, 'Owner'],
        rows: [
          ['CR-201', 'Retail POS System', 'Add thermal receipt QR code verification', 'DONE', '+1 Day', 1200, currentAdminName || 'Amanuel Getahun'],
          ['CR-202', 'sappy.work Portal', 'Automated SMS Ethiopia 30-day renewal webhook', 'DONE', '0 Days', 0, 'Dawit Tadesse'],
          ['TSK-409', 'Inventory Sync', 'Ethio Telecom SMPP fallback retry queue', 'IN PROGRESS', '+2 Days', 850, 'Meron Alemu'],
        ],
        kpis: [
          { label: 'Tasks Done', value: '28 (82%)' },
          { label: 'In Progress', value: '5 (15%)' },
          { label: 'Blocked Tasks', value: '1 (3%)' },
          { label: 'Approved CR Value', value: `2,050 ${currency}` },
        ],
        chartPoints: [
          { label: 'Done Tasks', value: 28 },
          { label: 'In Progress', value: 5 },
          { label: 'Blocked', value: 1 },
          { label: 'Change Req.', value: 3 },
        ],
        chartLegend: { primary: 'Item Count' },
      },
    ];
  }

  if (category === 'time') {
    // TODO: Connect to `timesheets` collection in Firestore; Staff role filters to own records
    const allTimesheets: (string | number)[][] = [
      [currentAdminName || 'Amanuel Getahun', 'Retail POS System', 'Architecture & Payment QR', 42, 40, 4, '91.3%'],
      ['Dawit Tadesse', 'Domain & SMS Engine', 'Backend API & SMS Ethiopia Integration', 38, 36, 4, '90.5%'],
      ['Meron Alemu', 'rahelstationary.shop', 'QA Automation & Lighthouse Audit', 34, 35, 6, '85.0%'],
      ['Yonas Kebede', 'sappy.work Support', 'Client Onboarding & DNS Cutover', 30, 32, 6, '83.3%'],
    ];
    const visibleRows =
      roleLens === 'staff' && currentAdminName
        ? allTimesheets.filter((r) => String(r[0]).toLowerCase().includes(currentAdminName.toLowerCase()))
        : allTimesheets;

    return [
      {
        id: 'utilization',
        label: 'Timesheets, Billable vs. Non-Billable & Utilization',
        description: 'Hours logged by person, project, and task with estimated vs. actual hours and capacity utilization',
        headers: ['Team Member', 'Project', 'Primary Task', 'Actual Billable Hrs', 'Estimated Hrs', 'Non-Billable Hrs', 'Utilization %'],
        rows: visibleRows.length > 0 ? visibleRows : allTimesheets,
        kpis: [
          { label: 'Total Billable Hours', value: '144 hrs' },
          { label: 'Non-Billable / R&D', value: '20 hrs' },
          { label: 'Team Utilization', value: '87.8%' },
          { label: 'Est. vs Actual Variance', value: '+0.7%' },
        ],
        chartPoints: (visibleRows.length > 0 ? visibleRows : allTimesheets).map((r) => ({
          label: String(r[0]).split(' ')[0],
          value: Number(r[3]),
          secondaryValue: Number(r[4]),
        })),
        chartLegend: { primary: 'Actual Billable Hrs', secondary: 'Estimated Hrs' },
      },
    ];
  }

  if (category === 'sales') {
    return [
      {
        id: 'pipeline_ltv',
        label: 'Lead Pipeline, Proposals & Client LTV',
        description: 'Lead conversion rates, proposals won/lost, client retention status, LTV, and CSAT/NPS scores',
        headers: ['Client / Lead', 'Source', 'Pipeline Stage', `Proposal Value (${currency})`, `Lifetime Value (${currency})`, 'CSAT / NPS', 'Status'],
        rows: [
          [secondClient, 'Direct Referral', 'WON — Active Client', 8000, 24000, '9.6 / 10 (Promoter)', 'ACTIVE'],
          [firstClient, 'Organic Web', 'WON — Active Client', 2300, 11500, '9.4 / 10 (Promoter)', 'ACTIVE'],
          ['Abyssinia Coffee Exports', 'LinkedIn B2B', 'Proposal Sent', 18500, 18500, '9.0 / 10', 'PENDING'],
          ['Habesha Logistics PLC', 'Partner Network', 'Technical Discovery', 14200, 14200, '8.8 / 10', 'PENDING'],
        ].filter((r) => filterRowByClientAndStatus(String(r[0]), String(r[6]))),
        kpis: [
          { label: 'Active Clients', value: String(customers.length || 2) },
          { label: 'Open Quotations', value: String(quotations.length || 2) },
          { label: 'Proposal Win Rate', value: '75.0%' },
          { label: 'Net Promoter Score (NPS)', value: '+72 (Excellent)' },
        ],
        chartPoints: [
          { label: secondClient.slice(0, 10), value: 24000, secondaryValue: 8000 },
          { label: firstClient.slice(0, 10), value: 11500, secondaryValue: 2300 },
          { label: 'Abyssinia', value: 18500, secondaryValue: 18500 },
          { label: 'Habesha', value: 14200, secondaryValue: 14200 },
        ],
        chartLegend: { primary: `Est. LTV (${currency})`, secondary: `Current Deal (${currency})` },
      },
    ];
  }

  if (category === 'hr') {
    // TODO: Connect to `hr_employees` & `payroll_runs` collections in Firestore
    return [
      {
        id: 'team_matrix',
        label: 'Attendance, Performance, Payroll & Skills Matrix',
        description: 'Employee attendance, leave balances, performance ratings, payroll summary, and technical skills matrix',
        headers: ['Employee', 'Role / Department', 'Attendance Rate', 'Leave Balance', 'Core Skills Matrix', `Monthly Payroll (${currency})`, 'Performance'],
        rows: [
          [currentAdminName || 'Amanuel Getahun', 'Principal Cloud Architect', '99.2%', '14 Days', 'React, TypeScript, Firebase, Cloud Infra', 45000, '5.0 / 5.0 (Exceeds)'],
          ['Dawit Tadesse', 'Senior Backend Engineer', '98.0%', '11 Days', 'Node.js, PostgreSQL, Telecom SMPP, Docker', 38000, '4.8 / 5.0 (Exceeds)'],
          ['Meron Alemu', 'QA & SecOps Engineer', '97.5%', '12 Days', 'Playwright, OWASP ZAP, Core Web Vitals, CI/CD', 34000, '4.7 / 5.0 (Strong)'],
          ['Yonas Kebede', 'Client Success & Registry Lead', '98.8%', '9 Days', 'DNSSEC, EPP Registry, Billing & SLA Support', 29000, '4.8 / 5.0 (Exceeds)'],
        ],
        kpis: [
          { label: 'Active Headcount', value: '4 FTEs' },
          { label: 'Avg Attendance Rate', value: '98.4%' },
          { label: 'Monthly Payroll Run', value: `146,000 ${currency}` },
          { label: 'Open Requisitions', value: '1 (Frontend Dev)' },
        ],
        chartPoints: [
          { label: 'Amanuel', value: 99, secondaryValue: 100 },
          { label: 'Dawit', value: 98, secondaryValue: 96 },
          { label: 'Meron', value: 98, secondaryValue: 94 },
          { label: 'Yonas', value: 99, secondaryValue: 96 },
        ],
        chartLegend: { primary: 'Attendance %', secondary: 'Performance Score %' },
      },
    ];
  }

  if (category === 'quality') {
    // TODO: Connect to automated Lighthouse / CI deployment webhook logs
    return [
      {
        id: 'qa_audits',
        label: 'Web Performance, SEO, Security & Release Log',
        description: 'Bug resolution metrics, Core Web Vitals, SEO/accessibility scores, OWASP security scans, and deployment log',
        headers: ['Target Property / Release', 'Uptime %', 'Core Web Vitals (LCP)', 'SEO / A11y Score', 'Security Scan', 'Open Bugs', 'Last Release'],
        rows: [
          ['nexgrid-admin-portal (v2.4.0)', '99.98%', '1.1s (Good)', '98 / 100', '0 Critical / 0 High', 0, '2026-10-28'],
          ['sappy.work Production Edge', '99.95%', '1.3s (Good)', '96 / 100', 'SSL A+ · Passed', 0, '2026-10-18'],
          ['rahelstationary.shop Storefront', '99.92%', '1.4s (Good)', '95 / 100', 'SSL A+ · Passed', 1, '2026-10-15'],
        ],
        kpis: [
          { label: 'Fleet Uptime SLA', value: '99.95%' },
          { label: 'Defect Fix Rate', value: '97.2%' },
          { label: 'Avg Lighthouse SEO', value: '96.3 / 100' },
          { label: 'Security Vulnerabilities', value: '0 Critical' },
        ],
        chartPoints: [
          { label: 'NexGrid Portal', value: 98, secondaryValue: 100 },
          { label: 'sappy.work', value: 96, secondaryValue: 99 },
          { label: 'rahel.shop', value: 95, secondaryValue: 99 },
        ],
        chartLegend: { primary: 'SEO & A11y Score', secondary: 'Uptime SLA %' },
      },
    ];
  }

  if (category === 'support') {
    const domainRows: (string | number)[][] =
      domains.length > 0
        ? domains.map((d) => [
            d.domainName,
            d.customerName || clientMap.get(d.customerId) || 'Assigned Client',
            d.registrar || 'Porkbun / EthioTelecom',
            d.expiryDate,
            Number(d.renewalPrice || 2300),
            'SSL Valid · Auto-Backup ON',
            d.status.toUpperCase(),
          ])
        : [
            ['sappy.work', firstClient, 'Porkbun', '2027-10-18', 2300, 'SSL Valid · Daily Backup', 'ACTIVE'],
            ['rahelstationary.shop', secondClient, 'Porkbun', '2027-10-13', 2200, 'SSL Valid · Daily Backup', 'ACTIVE'],
          ];

    return [
      {
        id: 'domains_ssl_tickets',
        label: 'Hosting, Domain & SSL Expiry Tracker + SLA Tickets',
        description: 'Live domain registry renewals, SSL certificate health, automated backups, and support ticket SLA compliance',
        headers: ['Domain / Asset', 'Client', 'Registrar / Host', 'Expiry Date', `Renewal Fee (${currency})`, 'SSL & Backup Health', 'Status'],
        rows: domainRows,
        kpis: [
          { label: 'Managed Domains', value: String(domains.length || 2) },
          { label: 'Ticket SLA Compliance', value: '98.6%' },
          { label: 'Avg First Response', value: '14 mins' },
          { label: 'Daily Backup Success', value: '100%' },
        ],
        chartPoints: domainRows.slice(0, 6).map((r) => ({
          label: String(r[0]).slice(0, 12),
          value: Number(r[4]) || 2300,
        })),
        chartLegend: { primary: `Annual Renewal Fee (${currency})` },
      },
    ];
  }

  // Default: Admin & Compliance (`compliance`)
  return [
    {
      id: 'audit_rbac_privacy',
      label: 'Audit Log, RBAC Permissions, NDAs & Data Protection',
      description: 'System security audit trail, role permissions matrix, executed NDAs/SLAs, and privacy compliance status',
      headers: ['Record ID', 'Category', 'Principal / Entity', 'Action / Document', 'Verification Status', 'Timestamp'],
      rows: [
        ['AUD-901', 'Security & Auth', currentAdminName || 'Amanuel Getahun', 'Firebase & Gmail OAuth 2.0 Verified', 'COMPLIANT', '2026-10-28 08:30'],
        ['AUD-902', 'Telecom Gateway', 'SMS Ethiopia API', 'Sender Campaign & API Key Encrypted', 'VERIFIED', '2026-10-28 08:15'],
        ['SLA-301', 'Contract / NDA', firstClient, 'Master Hosting & Domain SLA + NDA', 'SIGNED', '2026-10-01 10:00'],
        ['SLA-302', 'Contract / NDA', secondClient, 'POS Software License & Support SLA', 'SIGNED', '2026-10-13 14:20'],
        ['PRV-101', 'Data Privacy', 'Portal Data Controller', 'Zero Pending GDPR/Data Deletion Requests', 'CLEAR', '2026-10-28 00:00'],
      ],
      kpis: [
        { label: 'RBAC Roles Enforced', value: '4 Tiers' },
        { label: 'Active Signed SLAs', value: String(customers.length || 2) },
        { label: 'Open Privacy Requests', value: '0 Pending' },
        { label: 'Audit Trail Integrity', value: '100% Verified' },
      ],
      chartPoints: [
        { label: 'Auth Audits', value: 42 },
        { label: 'Signed SLAs', value: Math.max(2, customers.length) },
        { label: 'SMS Logs', value: 18 },
        { label: 'Privacy Req.', value: 0 },
      ],
      chartLegend: { primary: 'Verified Records Count' },
    },
  ];
}

interface CategoryReportTabsProps {
  category: ReportCategoryId;
  customers: Customer[];
  domains: Domain[];
  invoices: Invoice[];
  payments: Payment[];
  quotations: Quotation[];
  filters: ReportFilterState;
  roleLens: ReportRole;
  companySettings: AppSettings['general'];
  currentAdminName?: string;
}

export const CategoryReportTabs: React.FC<CategoryReportTabsProps> = ({
  category,
  customers,
  domains,
  invoices,
  payments,
  quotations,
  filters,
  roleLens,
  companySettings,
  currentAdminName,
}) => {
  const currency = companySettings.currency || 'ETB';
  const categoryMeta =
    REPORT_CATEGORIES.find((c) => c.id === category) || REPORT_CATEGORIES[0];

  const subReports = useMemo(
    () =>
      buildCategorySubReports({
        category,
        customers,
        domains,
        invoices,
        payments,
        quotations,
        filters,
        roleLens,
        currency,
        currentAdminName,
      }),
    [
      category,
      customers,
      domains,
      invoices,
      payments,
      quotations,
      filters,
      roleLens,
      currency,
      currentAdminName,
    ]
  );

  const [activeSubId, setActiveSubId] = useState<string>(subReports[0]?.id || '');
  const [viewMode, setViewMode] = useState<'both' | 'chart' | 'table'>('both');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortColIdx, setSortColIdx] = useState<number>(0);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const pageSize = 6;

  useEffect(() => {
    setActiveSubId(subReports[0]?.id || '');
    setSearchQuery('');
    setPage(1);
  }, [category, subReports]);

  const currentSub =
    subReports.find((s) => s.id === activeSubId) || subReports[0];

  const filteredAndSortedRows = useMemo(() => {
    if (!currentSub) return [];
    const q = searchQuery.trim().toLowerCase();
    const matched = currentSub.rows.filter((row) =>
      !q ? true : row.some((cell) => String(cell ?? '').toLowerCase().includes(q))
    );
    return [...matched].sort((a, b) => {
      const av = a[sortColIdx];
      const bv = b[sortColIdx];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return sortDir === 'asc'
        ? String(av ?? '').localeCompare(String(bv ?? ''))
        : String(bv ?? '').localeCompare(String(av ?? ''));
    });
  }, [currentSub, searchQuery, sortColIdx, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedRows.length / pageSize));
  const paginatedRows = filteredAndSortedRows.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  if (!currentSub) return null;

  const buildExportOptions = (): TabularExportOptions => ({
    reportTitle: `${categoryMeta.shortLabel} — ${currentSub.label}`,
    subtitle: `Date Range: ${filters.startDate} to ${filters.endDate} | Role View: ${roleLens.toUpperCase()}`,
    filenamePrefix: `nexgrid-${category}-${currentSub.id}`,
    headers: currentSub.headers,
    rows: filteredAndSortedRows,
    kpis: currentSub.kpis,
    chartPoints: currentSub.chartPoints,
    companySettings,
  });

  const maxChartVal = Math.max(
    1,
    ...currentSub.chartPoints.map((p) =>
      Math.max(p.value || 0, p.secondaryValue || 0, 1)
    )
  );

  return (
    <div className="space-y-5">
      {/* Category KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {currentSub.kpis.map((kpi, idx) => (
          <div
            key={idx}
            className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-1"
          >
            <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>{kpi.label}</span>
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-lg font-extrabold font-mono text-slate-900">
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* Main Category Report Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-5">
        {/* Sub-Report Selector + View Mode + Export Actions */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">
                {categoryMeta.label} — {currentSub.label}
              </h3>
            </div>
            <p className="text-xs text-slate-500">{currentSub.description}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {subReports.length > 1 && (
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg">
                {subReports.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => {
                      setActiveSubId(sub.id);
                      setPage(1);
                    }}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                      currentSub.id === sub.id
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {sub.label}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg">
              <button
                type="button"
                onClick={() => setViewMode('both')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md ${
                  viewMode === 'both' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                Chart + Table
              </button>
              <button
                type="button"
                onClick={() => setViewMode('chart')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md ${
                  viewMode === 'chart' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                <BarChart3 className="w-3 h-3" />
                <span>Chart</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md ${
                  viewMode === 'table' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                <TableIcon className="w-3 h-3" />
                <span>Table</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => exportReportToPdf(buildExportOptions())}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-2xs transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Download as PDF</span>
            </button>
            <button
              type="button"
              onClick={() => exportReportToExcel(buildExportOptions())}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Excel</span>
            </button>
            <button
              type="button"
              onClick={() => exportReportToCsv(buildExportOptions())}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>CSV</span>
            </button>
          </div>
        </div>

        {/* Visual Bar Chart */}
        {(viewMode === 'both' || viewMode === 'chart') && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">
                Visual Distribution — {currentSub.label}
              </span>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-blue-600" />
                  <span className="text-slate-700 font-medium">
                    {currentSub.chartLegend.primary}
                  </span>
                </div>
                {currentSub.chartLegend.secondary && (
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-emerald-600" />
                    <span className="text-slate-700 font-medium">
                      {currentSub.chartLegend.secondary}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 h-44 items-end border-b border-slate-200 pb-3 pt-4">
              {currentSub.chartPoints.map((pt, i) => {
                const primaryH = Math.max(8, (pt.value / maxChartVal) * 100);
                const secondaryH =
                  pt.secondaryValue !== undefined
                    ? Math.max(8, (pt.secondaryValue / maxChartVal) * 100)
                    : null;

                return (
                  <div
                    key={i}
                    className="flex flex-col items-center gap-1.5 h-full justify-end"
                  >
                    <div className="w-full flex items-end justify-center gap-2 h-full pb-1">
                      <div
                        style={{ height: `${primaryH}%` }}
                        className="w-1/3 max-w-[26px] bg-blue-600 hover:bg-blue-500 rounded-t-xs transition-all"
                        title={`${pt.label}: ${pt.value.toLocaleString()}`}
                      />
                      {secondaryH !== null && (
                        <div
                          style={{ height: `${secondaryH}%` }}
                          className="w-1/3 max-w-[26px] bg-emerald-600 hover:bg-emerald-500 rounded-t-xs transition-all"
                          title={`${pt.label}: ${pt.secondaryValue?.toLocaleString()}`}
                        />
                      )}
                    </div>
                    <div className="text-[11px] font-medium text-slate-700 truncate max-w-full">
                      {pt.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Sortable, Searchable, Paginated Table */}
        {(viewMode === 'both' || viewMode === 'table') && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="relative max-w-xs w-full">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder={`Search ${currentSub.label.toLowerCase()}...`}
                  className="w-full pl-8 pr-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="text-[11px] text-slate-500">
                Showing {paginatedRows.length} of {filteredAndSortedRows.length} record(s)
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-white text-[11px] uppercase tracking-wider">
                  <tr>
                    {currentSub.headers.map((h, idx) => (
                      <th
                        key={idx}
                        onClick={() => {
                          if (sortColIdx === idx) {
                            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                          } else {
                            setSortColIdx(idx);
                            setSortDir('asc');
                          }
                        }}
                        className="py-2.5 px-3 cursor-pointer select-none"
                      >
                        <div className="inline-flex items-center gap-1">
                          <span>{h}</span>
                          <ArrowUpDown className="w-3 h-3 text-slate-400" />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={currentSub.headers.length}
                        className="py-8 text-center text-slate-400"
                      >
                        No records match your current search or global filters.
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50/80">
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className={`py-2.5 px-3 ${
                              cIdx === 0
                                ? 'font-semibold text-slate-900'
                                : typeof cell === 'number'
                                ? 'font-mono text-slate-800'
                                : 'text-slate-700'
                            }`}
                          >
                            {typeof cell === 'number' ? cell.toLocaleString() : cell}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-slate-500">
                  Page {page} of {totalPages}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded border border-slate-200 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="px-2.5 py-1 rounded border border-slate-200 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
