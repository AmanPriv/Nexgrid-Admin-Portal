import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  Download,
  FileText,
  FileSpreadsheet,
  Globe,
  Radio,
  RotateCw,
  Building2,
  Eye,
  X,
  DollarSign,
  CheckCircle2,
  Clock,
  AlertTriangle,
  CalendarClock,
  Share2,
  Shield,
  Lock,
  Layers,
} from 'lucide-react';
import { api } from '../services/api.ts';
import {
  AdminUser,
  AppSettings,
  Customer,
  Domain,
  Invoice,
  Payment,
  Quotation,
} from '../types.ts';
import {
  generateExecutiveReportPdf,
  resolveCompanyProfile,
  DEFAULT_COMPANY_PROFILE,
} from '../utils/pdfGenerator.ts';
import {
  exportReportToExcel,
  exportReportToPdf,
  exportReportToCsv,
  TabularExportOptions,
} from '../utils/reportExports.ts';
import { PaymentQrCode } from '../components/PaymentQrCode.tsx';
import { EmailConfirmationModal } from '../components/EmailConfirmationModal.tsx';
import {
  REPORT_CATEGORIES,
  ReportCategoryId,
  ReportFilterState,
  ReportRole,
  ScheduledReportConfig,
} from '../types/reporting.ts';
import { ReportFilterBar } from '../components/reports/ReportFilterBar.tsx';
import { ExecutiveDashboardTab } from '../components/reports/ExecutiveDashboardTab.tsx';
import {
  CategoryReportTabs,
  buildCategorySubReports,
} from '../components/reports/CategoryReportTabs.tsx';
import { ScheduledReportsModal } from '../components/reports/ScheduledReportsModal.tsx';
import { ClientSafeShareModal } from '../components/reports/ClientSafeShareModal.tsx';

interface ReportsViewProps {
  currentAdmin?: AdminUser | null;
}

const SCHEDULES_STORAGE_KEY = 'nexgrid_report_schedules_v1';

const DEFAULT_SCHEDULES: ScheduledReportConfig[] = [
  {
    id: 'SCH-DEFAULT-1',
    name: 'Weekly Executive & Financial Settlement Digest',
    frequency: 'weekly',
    dayOfWeekOrMonth: 'Monday',
    timeOfDay: '08:30',
    recipients: ['nexgriddigital@gmail.com'],
    categories: ['executive', 'financial'],
    format: 'pdf',
    includeChartsSummary: true,
    clientSafeMode: false,
    enabled: true,
    createdAt: '2026-10-01T08:00:00.000Z',
  },
];

function createDefaultFilters(): ReportFilterState {
  const today = new Date();
  const sixMonthsAgo = new Date(today.getTime() - 180 * 86400000);
  return {
    datePreset: '6m',
    startDate: sixMonthsAgo.toISOString().slice(0, 10),
    endDate: today.toISOString().slice(0, 10),
    clientId: 'all',
    projectId: 'all',
    teamMember: 'all',
    serviceType: 'all',
    status: 'all',
  };
}

export const ReportsView: React.FC<ReportsViewProps> = ({ currentAdmin }) => {
  const [data, setData] = useState<{
    monthlyTrend: { month: string; invoiced: number; collected: number }[];
    smsStats: { total: number; sent: number; delivered: number; failed: number; queued: number };
    domainHealth: { total: number; active: number; expiringSoon: number; expired: number };
    financials: any;
  } | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);

  const [companySettings, setCompanySettings] = useState<AppSettings['general']>(DEFAULT_COMPANY_PROFILE as any);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Phase 1 Reporting Module State
  const [activeCategory, setActiveCategory] = useState<ReportCategoryId>('executive');
  const [activeRoleLens, setActiveRoleLens] = useState<ReportRole>(
    currentAdmin?.role === 'super_admin' ? 'super_admin' : 'admin'
  );
  const [filters, setFilters] = useState<ReportFilterState>(createDefaultFilters);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showClientShareModal, setShowClientShareModal] = useState(false);

  const [schedules, setSchedules] = useState<ScheduledReportConfig[]>(() => {
    try {
      const raw = localStorage.getItem(SCHEDULES_STORAGE_KEY);
      return raw ? JSON.parse(raw) : DEFAULT_SCHEDULES;
    } catch {
      return DEFAULT_SCHEDULES;
    }
  });

  const [emailModalConfig, setEmailModalConfig] = useState<{
    isOpen: boolean;
    recipientEmail: string;
    recipientName: string;
    customerId?: string;
    subject: string;
    body: string;
    title: string;
  }>({
    isOpen: false,
    recipientEmail: '',
    recipientName: '',
    subject: '',
    body: '',
    title: '',
  });

  const handleSaveSchedules = (next: ScheduledReportConfig[]) => {
    setSchedules(next);
    try {
      localStorage.setItem(SCHEDULES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  };

  const loadReports = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [res, settingsRes, custRes, domRes, invRes, payRes, quoRes] = await Promise.all([
        api.getReports(),
        api.getSettings().catch(() => null),
        api.getCustomers().catch(() => ({ customers: [] })),
        api.getDomains().catch(() => ({ domains: [] })),
        api.getInvoices().catch(() => ({ invoices: [] })),
        api.getPayments().catch(() => ({ payments: [] })),
        api.getQuotations().catch(() => ({ quotations: [] })),
      ]);
      setData(res);
      setCustomers(custRes.customers || []);
      setDomains(domRes.domains || []);
      setInvoices(invRes.invoices || []);
      setPayments(payRes.payments || []);
      setQuotations(quoRes.quotations || []);

      if (settingsRes?.settings?.general) {
        const resolved = resolveCompanyProfile(settingsRes.settings.general);
        setCompanySettings({ ...settingsRes.settings.general, ...resolved });
      }
    } catch (err: any) {
      console.error('Failed to load reports:', err);
      setErrorMessage(err?.message || 'Failed to load reporting metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const company = resolveCompanyProfile(companySettings);
  const fin = data?.financials || {
    totalInvoiced: 0,
    totalReceived: 0,
    outstandingReceivables: 0,
    overdueAmount: 0,
    unpaidInvoiceCount: 0,
    overdueInvoiceCount: 0,
    pendingQuotationsCount: 0,
    pendingQuotationsValue: 0,
    currency: company.currency,
  };

  // RBAC permitted categories for the active role lens
  const permittedCategories = useMemo(() => {
    return REPORT_CATEGORIES.filter((cat) => cat.allowedRoles.includes(activeRoleLens));
  }, [activeRoleLens]);

  useEffect(() => {
    if (!permittedCategories.some((c) => c.id === activeCategory)) {
      setActiveCategory(permittedCategories[0]?.id || 'executive');
    }
  }, [permittedCategories, activeCategory]);

  // Projects list derived from active client engagements + domains (TODO: connect to dedicated `projects` collection in Phase 2)
  const projectsList = useMemo(() => {
    const derived = customers.map((c, idx) => ({
      id: `PRJ-${101 + idx}`,
      name: `${c.businessName} — Digital Infrastructure & Portal`,
    }));
    if (derived.length === 0) {
      return [
        { id: 'PRJ-101', name: 'Sappy Stationary — POS & Domain Portal' },
        { id: 'PRJ-102', name: 'Rahel Stationary — Cloud ERP & .shop Registry' },
      ];
    }
    return derived;
  }, [customers]);

  const teamMembersList = useMemo(() => {
    return [
      currentAdmin?.fullName || 'Amanuel Getahun (Lead Architect)',
      'Dawit Tadesse (Senior Backend Engineer)',
      'Meron Alemu (QA & DevOps Lead)',
      'Yonas Kebede (Client Solutions & Support)',
    ];
  }, [currentAdmin]);

  const buildCurrentViewExportPayload = (): TabularExportOptions => {
    const catMeta =
      REPORT_CATEGORIES.find((c) => c.id === activeCategory) || REPORT_CATEGORIES[0];

    if (activeCategory === 'executive') {
      const trend = data?.monthlyTrend || [];
      return {
        reportTitle: `${catMeta.label} — Financial & Operations Summary`,
        subtitle: `Date Range: ${filters.startDate} to ${filters.endDate} | Client: ${filters.clientId} | Role: ${activeRoleLens.toUpperCase()}`,
        filenamePrefix: `nexgrid-executive-dashboard`,
        headers: [
          'Month / Period',
          `Invoiced (${company.currency})`,
          `Collected (${company.currency})`,
          `Est. Cost (${company.currency})`,
          `Net Margin (${company.currency})`,
        ],
        rows: trend.map((m) => {
          const cost = Math.round((Number(m.invoiced) || 0) * 0.32);
          const margin = Math.max(0, (Number(m.invoiced) || 0) - cost);
          return [m.month, m.invoiced, m.collected, cost, margin];
        }),
        kpis: [
          {
            label: 'Total Invoiced Revenue',
            value: `${Number(fin.totalInvoiced || 0).toLocaleString()} ${company.currency}`,
          },
          {
            label: 'Confirmed Collections',
            value: `${Number(fin.totalReceived || 0).toLocaleString()} ${company.currency}`,
          },
          {
            label: 'Outstanding Receivables',
            value: `${Number(fin.outstandingReceivables || 0).toLocaleString()} ${company.currency}`,
          },
          {
            label: 'Active Managed Domains',
            value: String(data?.domainHealth?.total || domains.length),
          },
        ],
        chartPoints: trend.map((m) => ({
          label: m.month,
          value: Number(m.invoiced || 0),
          secondaryValue: Number(m.collected || 0),
        })),
        companySettings,
      };
    }

    const subReports = buildCategorySubReports({
      category: activeCategory,
      customers,
      domains,
      invoices,
      payments,
      quotations,
      filters,
      roleLens: activeRoleLens,
      currency: company.currency,
      currentAdminName: currentAdmin?.fullName,
    });
    const firstSub = subReports[0];

    return {
      reportTitle: `${catMeta.label} — ${firstSub?.label || 'Report'}`,
      subtitle: `Date Range: ${filters.startDate} to ${filters.endDate} | Role: ${activeRoleLens.toUpperCase()}`,
      filenamePrefix: `nexgrid-${activeCategory}-report`,
      headers: firstSub?.headers || ['Item', 'Value'],
      rows: firstSub?.rows || [],
      kpis: firstSub?.kpis || [],
      chartPoints: firstSub?.chartPoints || [],
      companySettings,
    };
  };

  const downloadCurrentViewAsPdf = () => {
    exportReportToPdf(buildCurrentViewExportPayload());
  };

  const downloadReportPdf = () => {
    const reportPayload = data || {
      monthlyTrend: [],
      smsStats: { total: 0, sent: 0, delivered: 0, failed: 0, queued: 0 },
      domainHealth: { total: 0, active: 0, expiringSoon: 0, expired: 0 },
      financials: fin,
    };
    const pdf = generateExecutiveReportPdf(reportPayload, companySettings);
    pdf.save(`nexgrid-financial-summary-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const downloadReportExcel = () => {
    exportReportToExcel(buildCurrentViewExportPayload());
  };

  const downloadReportCsv = () => {
    if (activeCategory !== 'executive') {
      exportReportToCsv(buildCurrentViewExportPayload());
      return;
    }
    const reportDate = new Date().toISOString().slice(0, 10);
    const rows: string[] = [
      `"NEXGRID DIGITAL SYSTEMS — EXECUTIVE FINANCIAL SUMMARY REPORT","Generated: ${reportDate}"`,
      `"ORGANIZATION","${company.businessName}","TIN: ${company.tinNumber}","Phone: ${company.businessPhone}","Email: ${company.businessEmail}","Address: ${company.businessAddress}"`,
      `"BANKING DETAILS","Bank: ${company.bankName}","Account Holder: ${company.bankAccountName}","Account No: ${company.bankAccountNumber}","Telebirr: ${company.telebirrNumber}","Currency: ${company.currency}"`,
      '',
      '"1. EXECUTIVE FINANCIAL SUMMARY","AMOUNT / VALUE","CURRENCY / NOTES"',
      `"Total Invoiced Revenue",${Number(fin.totalInvoiced || 0)},"${company.currency}"`,
      `"Total Confirmed Collections",${Number(fin.totalReceived || 0)},"${company.currency}"`,
      `"Current Outstanding Receivables",${Number(fin.outstandingReceivables || 0)},"${company.currency}"`,
      `"Critical Overdue Balance",${Number(fin.overdueAmount || 0)},"${company.currency}"`,
      `"Unpaid Invoices Count",${Number(fin.unpaidInvoiceCount || 0)},"Open Invoices"`,
      `"Overdue Invoices Count",${Number(fin.overdueInvoiceCount || 0)},"Past Due Invoices"`,
      `"Pending Quotations (${Number(fin.pendingQuotationsCount || 0)})",${Number(fin.pendingQuotationsValue || 0)},"${company.currency}"`,
      '',
      `"2. MONTHLY REVENUE BREAKDOWN (LAST 6 MONTHS)","Invoiced (${company.currency})","Collected (${company.currency})"`,
    ];

    (data?.monthlyTrend || []).forEach((m) => {
      rows.push(`"${m.month}",${m.invoiced},${m.collected}`);
    });

    rows.push(
      '',
      '"3. DOMAIN REGISTRY & SMS GATEWAY METRICS","COUNT"',
      `"Total Managed Domains",${data?.domainHealth?.total || 0}`,
      `"Active Domains",${data?.domainHealth?.active || 0}`,
      `"Expiring Soon (<=30 Days)",${data?.domainHealth?.expiringSoon || 0}`,
      `"Expired Domains",${data?.domainHealth?.expired || 0}`,
      `"Total SMS Dispatches",${data?.smsStats?.total || 0}`,
      `"Delivered / Sent SMS",${(data?.smsStats?.delivered || 0) + (data?.smsStats?.sent || 0)}`,
      `"Failed SMS Dispatches",${data?.smsStats?.failed || 0}`
    );

    const csv = rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexgrid-financial-summary-${reportDate}.csv`;
    a.click();
  };

  const handleTriggerScheduledDispatch = (sch: ScheduledReportConfig) => {
    setShowScheduleModal(false);
    setEmailModalConfig({
      isOpen: true,
      recipientEmail: sch.recipients[0] || company.businessEmail,
      recipientName: sch.name,
      subject: `[Scheduled Report] ${sch.name} — ${new Date().toISOString().slice(0, 10)}`,
      body: [
        `Hello,`,
        ``,
        `Attached is your scheduled "${sch.name}" (${sch.frequency.toUpperCase()} — ${sch.format.toUpperCase()}) generated by ${company.businessName}.`,
        ``,
        `Executive Highlights:`,
        `• Total Invoiced Revenue: ${Number(fin.totalInvoiced || 0).toLocaleString()} ${company.currency}`,
        `• Confirmed Collections: ${Number(fin.totalReceived || 0).toLocaleString()} ${company.currency}`,
        `• Outstanding Receivables: ${Number(fin.outstandingReceivables || 0).toLocaleString()} ${company.currency}`,
        `• Managed Domains: ${data?.domainHealth?.total || domains.length}`,
        ``,
        `Best regards,`,
        `${company.businessName} Reporting Engine`,
      ].join('\n'),
      title: `Dispatch Scheduled Report — ${sch.name}`,
    });
  };

  const currentCategoryMeta =
    REPORT_CATEGORIES.find((c) => c.id === activeCategory) || REPORT_CATEGORIES[0];

  return (
    <div className="space-y-5">
      {/* Top Header, RBAC Role Switcher & Global Export/Schedule/Share Actions */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            Enterprise Reporting & Analytics Center
          </h2>
          <p className="text-xs text-slate-500">
            Executive KPIs, financial reconciliation, delivery tracking, scheduled email digests, and client-safe exports
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* RBAC Role Lens Selector */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs">
            <Shield className="w-3.5 h-3.5 text-slate-600" />
            <span className="text-slate-500 font-medium">Role Access:</span>
            <select
              value={activeRoleLens}
              onChange={(e) => setActiveRoleLens(e.target.value as ReportRole)}
              className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer"
            >
              <option value="super_admin">Admin (All 9 Categories)</option>
              <option value="finance">Finance (Executive, Financial, Sales)</option>
              <option value="project_manager">Project Manager (Delivery, Time, QA, Support)</option>
              <option value="staff">Staff (Own Projects, Time, QA, Support)</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => setShowScheduleModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors"
          >
            <CalendarClock className="w-3.5 h-3.5 text-blue-600" />
            <span>Scheduled Emails ({schedules.filter((s) => s.enabled).length})</span>
          </button>

          <button
            type="button"
            onClick={() => setShowClientShareModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold shadow-2xs transition-colors"
          >
            <Share2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Share Client-Safe</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPreviewModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors"
          >
            <Eye className="w-3.5 h-3.5 text-slate-500" />
            <span>Preview</span>
          </button>

          <button
            type="button"
            onClick={downloadCurrentViewAsPdf}
            title={`Download ${currentCategoryMeta.shortLabel} Report as PDF`}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-2xs transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Download as PDF</span>
          </button>

          <button
            type="button"
            onClick={downloadReportExcel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold shadow-2xs transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Excel</span>
          </button>

          <button
            type="button"
            onClick={downloadReportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>CSV</span>
          </button>

          <button
            type="button"
            onClick={loadReports}
            title="Refresh Report Data"
            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
          >
            <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Official Company Profile & Banking Details Banner on Report */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 p-1.5 flex items-center justify-center shrink-0 overflow-hidden shadow-2xs">
            <img
              src="./assets/aistudio/nexgrid_icon.png"
              onError={(e) => {
                e.currentTarget.src = './assets/aistudio/logo_95537d8d.jpg';
              }}
              alt="NexGrid Digital Systems"
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Issued By · Official Organization Profile
            </div>
            <div className="text-sm font-extrabold text-slate-900">{company.businessName}</div>
            <div className="text-slate-600">
              TIN: <strong className="font-mono text-slate-900">{company.tinNumber}</strong> · Address:{' '}
              <strong className="text-slate-900">{company.businessAddress}</strong> · Currency:{' '}
              <strong className="font-mono text-slate-900">{company.currency}</strong>
            </div>
            <div className="text-slate-600">
              Support Phone: <strong className="font-mono text-slate-800">{company.businessPhone}</strong> · Official Email:{' '}
              <strong className="text-slate-800">{company.businessEmail}</strong>
            </div>
          </div>
        </div>

        <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-blue-700 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-600" />
              <span>Official Banking & Payment Settlement Details</span>
            </div>
            <div className="text-slate-800 font-medium">
              {company.bankName} — Account Holder: <strong>{company.bankAccountName}</strong>
            </div>
            <div className="text-slate-700">
              Account No: <strong className="font-mono text-blue-700">{company.bankAccountNumber}</strong> • Telebirr:{' '}
              <strong className="font-mono text-slate-900">{company.telebirrNumber}</strong>
            </div>
            {company.secondaryBankDetails && (
              <div className="text-[11px] text-slate-500">{company.secondaryBankDetails}</div>
            )}
          </div>
          <div className="shrink-0">
            <PaymentQrCode
              settings={companySettings}
              context={{ documentType: 'REPORT' }}
              size={68}
              showActions={false}
            />
          </div>
        </div>
      </div>

      {/* Category Navigation Tabs (Role-Filtered) */}
      <div className="bg-white rounded-xl border border-slate-200 p-2 shadow-2xs">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {REPORT_CATEGORIES.map((cat) => {
            const allowed = cat.allowedRoles.includes(activeRoleLens);
            const isActive = activeCategory === cat.id;

            return (
              <button
                key={cat.id}
                type="button"
                disabled={!allowed}
                onClick={() => allowed && setActiveCategory(cat.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : allowed
                    ? 'text-slate-700 hover:bg-slate-100'
                    : 'text-slate-300 cursor-not-allowed'
                }`}
                title={allowed ? cat.description : `Restricted for role: ${activeRoleLens}`}
              >
                {!allowed && <Lock className="w-3 h-3 text-slate-300" />}
                <span>{cat.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Global Report Filters Bar */}
      <ReportFilterBar
        filters={filters}
        onChange={setFilters}
        onReset={() => setFilters(createDefaultFilters())}
        customers={customers}
        projectsList={projectsList}
        teamMembersList={teamMembersList}
      />

      {/* Error State */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={loadReports}
            className="px-3 py-1 rounded bg-white border border-rose-200 font-semibold hover:bg-rose-100"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && !data ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-3">
          <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="text-xs font-medium text-slate-600">
            Aggregating Executive KPIs, Financial Ledgers & Domain Telemetry...
          </div>
        </div>
      ) : activeCategory === 'executive' ? (
        <ExecutiveDashboardTab
          data={data}
          customers={customers}
          domains={domains}
          invoices={invoices}
          payments={payments}
          quotations={quotations}
          filters={filters}
          companySettings={companySettings}
        />
      ) : (
        <CategoryReportTabs
          category={activeCategory}
          customers={customers}
          domains={domains}
          invoices={invoices}
          payments={payments}
          quotations={quotations}
          filters={filters}
          roleLens={activeRoleLens}
          companySettings={companySettings}
          currentAdminName={currentAdmin?.fullName}
        />
      )}

      {/* Scheduled Email Reports Modal */}
      <ScheduledReportsModal
        isOpen={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        schedules={schedules}
        onSaveSchedules={handleSaveSchedules}
        onTriggerEmailDispatch={handleTriggerScheduledDispatch}
      />

      {/* Client-Safe Report Share Modal */}
      <ClientSafeShareModal
        isOpen={showClientShareModal}
        onClose={() => setShowClientShareModal(false)}
        customers={customers}
        invoices={invoices}
        domains={domains}
        companySettings={companySettings}
        onSendEmailToClient={(params) => {
          setShowClientShareModal(false);
          setEmailModalConfig({
            isOpen: true,
            recipientEmail: params.recipientEmail,
            recipientName: params.recipientName,
            customerId: params.customerId,
            subject: params.subject,
            body: params.body,
            title: `Send Client-Safe Report — ${params.recipientName}`,
          });
        }}
      />

      {/* Gmail / Email Dispatch Modal */}
      <EmailConfirmationModal
        isOpen={emailModalConfig.isOpen}
        onClose={() => setEmailModalConfig((prev) => ({ ...prev, isOpen: false }))}
        recipientEmail={emailModalConfig.recipientEmail}
        recipientName={emailModalConfig.recipientName}
        customerId={emailModalConfig.customerId}
        initialSubject={emailModalConfig.subject}
        initialBody={emailModalConfig.body}
        messageType="custom"
        title={emailModalConfig.title}
      />

      {/* Existing Interactive Financial Summary Document Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
            <div className="flex items-center justify-between px-6 py-3.5 bg-slate-900 text-white">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  Executive Financial Summary Report — {new Date().toISOString().slice(0, 10)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadReportPdf}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>
                <button
                  onClick={downloadReportCsv}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download CSV</span>
                </button>
                <button
                  onClick={() => setShowPreviewModal(false)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              <div className="flex flex-col sm:flex-row justify-between gap-4 pb-4 border-b border-slate-200">
                <div className="flex items-start gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 p-1.5 flex items-center justify-center shrink-0 overflow-hidden shadow-2xs">
                    <img
                      src="./assets/aistudio/nexgrid_icon.png"
                      onError={(e) => {
                        e.currentTarget.src = './assets/aistudio/logo_95537d8d.jpg';
                      }}
                      alt="NexGrid Digital Systems"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-base font-extrabold text-slate-900">{company.businessName}</div>
                    <div className="text-slate-600">
                      TIN: <strong className="font-mono text-slate-900">{company.tinNumber}</strong> · Address:{' '}
                      <strong className="text-slate-900">{company.businessAddress}</strong>
                    </div>
                    <div className="text-slate-600">
                      Phone: <strong className="font-mono text-slate-900">{company.businessPhone}</strong> · Email:{' '}
                      <strong className="text-slate-900">{company.businessEmail}</strong>
                    </div>
                  </div>
                </div>
                <div className="sm:text-right space-y-1">
                  <div className="text-sm font-bold text-blue-600 uppercase">FINANCIAL SUMMARY</div>
                  <div className="text-slate-600">Generated: {new Date().toLocaleDateString('en-US')}</div>
                  <div className="text-slate-600">
                    Default Currency: <strong className="font-mono text-slate-900">{company.currency}</strong>
                  </div>
                </div>
              </div>

              {/* Summary Table */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-[10px] uppercase text-slate-500 font-bold">Total Invoiced</div>
                  <div className="text-sm font-extrabold font-mono text-slate-900 mt-1">
                    {Number(fin.totalInvoiced || 0).toLocaleString()} {company.currency}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                  <div className="text-[10px] uppercase text-emerald-700 font-bold">Collected Revenue</div>
                  <div className="text-sm font-extrabold font-mono text-emerald-700 mt-1">
                    {Number(fin.totalReceived || 0).toLocaleString()} {company.currency}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <div className="text-[10px] uppercase text-amber-700 font-bold">Outstanding</div>
                  <div className="text-sm font-extrabold font-mono text-amber-700 mt-1">
                    {Number(fin.outstandingReceivables || 0).toLocaleString()} {company.currency}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200">
                  <div className="text-[10px] uppercase text-rose-700 font-bold">Overdue Balance</div>
                  <div className="text-sm font-extrabold font-mono text-rose-700 mt-1">
                    {Number(fin.overdueAmount || 0).toLocaleString()} {company.currency}
                  </div>
                </div>
              </div>

              {/* Monthly Table */}
              <table className="w-full text-left border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-900 text-white text-[11px]">
                  <tr>
                    <th className="py-2 px-3">Month / Period</th>
                    <th className="py-2 px-3 text-right">Invoiced ({company.currency})</th>
                    <th className="py-2 px-3 text-right">Collected ({company.currency})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {(data?.monthlyTrend || []).map((m, i) => (
                    <tr key={i}>
                      <td className="py-2 px-3 font-medium text-slate-900">{m.month}</td>
                      <td className="py-2 px-3 text-right font-mono">{m.invoiced.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                        {m.collected.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Banking & QR */}
              <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="font-bold text-slate-900 uppercase text-[11px] flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-blue-600" />
                    <span>Official Banking & Payment Settlement Details</span>
                  </div>
                  <div>
                    Bank: <strong>{company.bankName}</strong> • Account Holder: <strong>{company.bankAccountName}</strong>
                  </div>
                  <div>
                    Account Number: <strong className="font-mono text-blue-700">{company.bankAccountNumber}</strong> • Telebirr:{' '}
                    <strong className="font-mono">{company.telebirrNumber}</strong>
                  </div>
                  {company.secondaryBankDetails && <div className="text-slate-600">{company.secondaryBankDetails}</div>}
                </div>
                <PaymentQrCode settings={companySettings} context={{ documentType: 'REPORT' }} size={88} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
