import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { api } from '../services/api.ts';
import { AppSettings } from '../types.ts';
import {
  generateExecutiveReportPdf,
  resolveCompanyProfile,
  DEFAULT_COMPANY_PROFILE,
} from '../utils/pdfGenerator.ts';
import { PaymentQrCode } from '../components/PaymentQrCode.tsx';

export const ReportsView: React.FC = () => {
  const [data, setData] = useState<{
    monthlyTrend: { month: string; invoiced: number; collected: number }[];
    smsStats: { total: number; sent: number; delivered: number; failed: number; queued: number };
    domainHealth: { total: number; active: number; expiringSoon: number; expired: number };
    financials: any;
  } | null>(null);
  const [companySettings, setCompanySettings] = useState<AppSettings['general']>(DEFAULT_COMPANY_PROFILE as any);
  const [loading, setLoading] = useState(true);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const loadReports = async () => {
    setLoading(true);
    try {
      const [res, settingsRes] = await Promise.all([
        api.getReports(),
        api.getSettings().catch(() => null),
      ]);
      setData(res);
      if (settingsRes?.settings?.general) {
        const resolved = resolveCompanyProfile(settingsRes.settings.general);
        setCompanySettings({ ...settingsRes.settings.general, ...resolved });
      }
    } catch (err) {
      console.error('Failed to load reports:', err);
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

  const downloadReportCsv = () => {
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

  const maxFinancial =
    data?.monthlyTrend.reduce((max, m) => Math.max(max, m.invoiced, m.collected), 1) || 1;

  return (
    <div className="space-y-6">
      {/* Header & Financial Summary Export Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">Executive Reports & Financial Summary</h2>
          <p className="text-xs text-slate-500">
            Downloadable PDF & CSV financial summaries, settlement reconciliation, and domain/gateway analytics
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowPreviewModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors"
          >
            <Eye className="w-3.5 h-3.5 text-slate-500" />
            <span>Preview Report</span>
          </button>
          <button
            onClick={downloadReportPdf}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-2xs transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Export PDF Summary</span>
          </button>
          <button
            onClick={downloadReportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export CSV Summary</span>
          </button>
          <button
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

      {/* Executive Financial Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Total Invoiced Revenue</span>
            <DollarSign className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-lg font-extrabold font-mono text-slate-900">
            {Number(fin.totalInvoiced || 0).toLocaleString()} {company.currency}
          </div>
          <div className="text-[11px] text-slate-500">
            Pending Quotes: {Number(fin.pendingQuotationsCount || 0)} ({Number(fin.pendingQuotationsValue || 0).toLocaleString()} {company.currency})
          </div>
        </div>

        <div className="bg-white rounded-xl border border-emerald-200 p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-emerald-700 font-medium">
            <span>Confirmed Collections</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-lg font-extrabold font-mono text-emerald-700">
            {Number(fin.totalReceived || 0).toLocaleString()} {company.currency}
          </div>
          <div className="text-[11px] text-slate-500">
            Verified bank & Telebirr settlements
          </div>
        </div>

        <div className="bg-white rounded-xl border border-amber-200 p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-amber-700 font-medium">
            <span>Outstanding Receivables</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-lg font-extrabold font-mono text-amber-700">
            {Number(fin.outstandingReceivables || 0).toLocaleString()} {company.currency}
          </div>
          <div className="text-[11px] text-slate-500">
            {Number(fin.unpaidInvoiceCount || 0)} unpaid open invoice(s)
          </div>
        </div>

        <div className="bg-white rounded-xl border border-rose-200 p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-rose-700 font-medium">
            <span>Critical Overdue Balance</span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-lg font-extrabold font-mono text-rose-700">
            {Number(fin.overdueAmount || 0).toLocaleString()} {company.currency}
          </div>
          <div className="text-[11px] text-slate-500">
            {Number(fin.overdueInvoiceCount || 0)} overdue invoice(s)
          </div>
        </div>
      </div>

      {/* 1. Monthly Revenue & Settlement Trends Chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Monthly Invoiced vs. Verified Collected Revenue (Last 6 Months)
            </h3>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-slate-300" />
              <span className="text-slate-600">Invoiced</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-emerald-600" />
              <span className="text-slate-900 font-semibold">Collected Revenue</span>
            </div>
          </div>
        </div>

        {/* Visual Bar Graph */}
        <div className="pt-4 pb-2">
          <div className="grid grid-cols-6 gap-3 sm:gap-6 h-52 items-end border-b border-slate-200 pb-2">
            {data?.monthlyTrend.map((m, idx) => {
              const invoicedHeight = Math.max(8, (m.invoiced / maxFinancial) * 100);
              const collectedHeight = Math.max(8, (m.collected / maxFinancial) * 100);

              return (
                <div key={idx} className="flex flex-col items-center gap-1.5 h-full justify-end group">
                  <div className="w-full flex items-end justify-center gap-1.5 h-full pb-1">
                    {/* Invoiced Bar */}
                    <div
                      style={{ height: `${invoicedHeight}%` }}
                      className="w-1/2 max-w-[28px] bg-slate-200 hover:bg-slate-300 rounded-t-xs transition-all relative"
                      title={`Invoiced: ${m.invoiced.toLocaleString()} ${company.currency}`}
                    />
                    {/* Collected Bar */}
                    <div
                      style={{ height: `${collectedHeight}%` }}
                      className="w-1/2 max-w-[28px] bg-emerald-600 hover:bg-emerald-500 rounded-t-xs transition-all relative"
                      title={`Collected: ${m.collected.toLocaleString()} ${company.currency}`}
                    />
                  </div>
                  <div className="text-[11px] font-medium text-slate-600 whitespace-nowrap">
                    {m.month}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between text-xs gap-3">
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Total Confirmed Collections:</span>
            <strong className="font-mono text-emerald-700">
              {Number(fin.totalReceived || 0).toLocaleString()} {company.currency}
            </strong>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Current Outstanding Receivables:</span>
            <strong className="font-mono text-amber-700">
              {Number(fin.outstandingReceivables || 0).toLocaleString()} {company.currency}
            </strong>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Critical Overdue:</span>
            <strong className="font-mono text-rose-700">
              {Number(fin.overdueAmount || 0).toLocaleString()} {company.currency}
            </strong>
          </div>
        </div>
      </div>

      {/* 2. Operations & Gateway Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Domain Portfolio Health */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">Domain Registry Portfolio Health</h3>
          </div>
          <div className="space-y-2.5 text-xs pt-1">
            <div className="flex items-center justify-between p-2 rounded bg-slate-50">
              <span className="text-slate-600">Active & Up-to-date Domains</span>
              <strong className="font-mono text-slate-900">
                {data?.domainHealth.active || 0}
              </strong>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-amber-50 text-amber-900">
              <span>Expiring within 30 Days (Reminders Triggered)</span>
              <strong className="font-mono">{data?.domainHealth.expiringSoon || 0}</strong>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-rose-50 text-rose-900">
              <span>Expired Domains in Grace Period</span>
              <strong className="font-mono">{data?.domainHealth.expired || 0}</strong>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-slate-100 font-semibold text-slate-900">
              <span>Total Managed ccTLD & gTLD Domains</span>
              <strong className="font-mono">{data?.domainHealth.total || 0}</strong>
            </div>
          </div>
        </div>

        {/* SMS Ethiopia Notification Performance */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">SMS Ethiopia Delivery Analytics</h3>
          </div>
          <div className="space-y-2.5 text-xs pt-1">
            <div className="flex items-center justify-between p-2 rounded bg-emerald-50 text-emerald-900">
              <span>Delivered Messages</span>
              <strong className="font-mono">{data?.smsStats.delivered || 0}</strong>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-blue-50 text-blue-900">
              <span>Sent / Dispatched</span>
              <strong className="font-mono">{data?.smsStats.sent || 0}</strong>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-rose-50 text-rose-900">
              <span>Failed Dispatches</span>
              <strong className="font-mono">{data?.smsStats.failed || 0}</strong>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-slate-100 font-semibold text-slate-900">
              <span>Total Dispatches Recorded</span>
              <strong className="font-mono">{data?.smsStats.total || 0}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Financial Summary Document Preview Modal */}
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
