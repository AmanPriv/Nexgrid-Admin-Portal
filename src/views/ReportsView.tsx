import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  Download,
  Calendar,
  CreditCard,
  Globe,
  Radio,
  RotateCw,
  DollarSign,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { api } from '../services/api.ts';

export const ReportsView: React.FC = () => {
  const [data, setData] = useState<{
    monthlyTrend: { month: string; invoiced: number; collected: number }[];
    smsStats: { total: number; sent: number; delivered: number; failed: number; queued: number };
    domainHealth: { total: number; active: number; expiringSoon: number; expired: number };
    financials: any;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const loadReports = async () => {
    setLoading(true);
    try {
      const res = await api.getReports();
      setData(res);
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const downloadReportCsv = () => {
    if (!data) return;
    let csv = 'Month,Invoiced (ETB),Collected (ETB)\n';
    data.monthlyTrend.forEach((m) => {
      csv += `"${m.month}",${m.invoiced},${m.collected}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexgrid-revenue-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const maxFinancial = data?.monthlyTrend.reduce(
    (max, m) => Math.max(max, m.invoiced, m.collected),
    1
  ) || 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">Executive Reports & Analytics</h2>
          <p className="text-xs text-slate-500">
            Historical settlement reconciliation, domain renewal forecasts, and gateway health
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={downloadReportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium shadow-2xs transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export Financial Report CSV</span>
          </button>
          <button
            onClick={loadReports}
            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
          >
            <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 1. Monthly Revenue & Settlement Trends Chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
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
                      title={`Invoiced: ${m.invoiced.toLocaleString()} ETB`}
                    />
                    {/* Collected Bar */}
                    <div
                      style={{ height: `${collectedHeight}%` }}
                      className="w-1/2 max-w-[28px] bg-emerald-600 hover:bg-emerald-500 rounded-t-xs transition-all relative"
                      title={`Collected: ${m.collected.toLocaleString()} ETB`}
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
              {data?.financials?.totalReceived.toLocaleString()} ETB
            </strong>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Current Outstanding Receivables:</span>
            <strong className="font-mono text-amber-700">
              {data?.financials?.outstandingReceivables.toLocaleString()} ETB
            </strong>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Critical Overdue:</span>
            <strong className="font-mono text-rose-700">
              {data?.financials?.overdueAmount.toLocaleString()} ETB
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
    </div>
  );
};
