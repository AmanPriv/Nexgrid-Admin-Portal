import React, { useState, useEffect } from 'react';
import {
  Users,
  Globe,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Send,
  Calendar,
  CreditCard,
  FileText,
  DollarSign,
  Activity,
  RotateCw,
} from 'lucide-react';
import { api } from '../services/api.ts';
import { DashboardMetrics, Domain, Payment, AuditLog } from '../types.ts';
import { NavTab } from '../components/Sidebar.tsx';

interface DashboardViewProps {
  onNavigate: (tab: NavTab) => void;
  onRenewDomain: (domain: Domain) => void;
  onSendReminder: (domain: Domain) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  onRenewDomain,
  onSendReminder,
}) => {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [upcomingRenewals, setUpcomingRenewals] = useState<
    (Domain & { customerName: string; customerPhone?: string; daysLeft: number })[]
  >([]);
  const [recentPayments, setRecentPayments] = useState<(Payment & { customerName: string })[]>([]);
  const [recentActivity, setRecentActivity] = useState<AuditLog[]>([]);
  const [dateRange, setDateRange] = useState<'all' | 'today' | '7days' | '30days'>('all');

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await api.getDashboardStats();
      setMetrics(data.metrics);
      setUpcomingRenewals(data.upcomingDomainRenewals);
      setRecentPayments(data.recentPayments);
      setRecentActivity(data.recentActivity);
    } catch (err) {
      console.error('Failed to load dashboard statistics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatCurrency = (val: number | undefined) => {
    const num = val || 0;
    return `${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${metrics?.currency || 'ETB'}`;
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">Executive Summary</h2>
          <p className="text-xs text-slate-500">
            Real-time verified financial figures and domain registry health
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Date range filter */}
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
            {(['all', '30days', '7days', 'today'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  dateRange === range
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {range === 'all'
                  ? 'All Time'
                  : range === '30days'
                  ? 'Last 30 Days'
                  : range === '7days'
                  ? 'Last 7 Days'
                  : 'Today'}
              </button>
            ))}
          </div>

          <button
            onClick={loadData}
            title="Reload Metrics"
            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 shadow-2xs"
          >
            <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 1. Primary Financial & Customer Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Confirmed Revenue */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Confirmed Revenue</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-bold text-slate-900">
            {formatCurrency(metrics?.totalReceivedRevenue)}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Strictly verified & settled payments</span>
          </div>
        </div>

        {/* Outstanding Receivables */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Outstanding Receivables</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-bold text-slate-900">
            {formatCurrency(metrics?.outstandingReceivables)}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
            <span>{metrics?.unpaidInvoicesCount || 0} unpaid</span>
            <span>·</span>
            <span className="text-rose-600 font-semibold">{metrics?.overdueInvoicesCount || 0} overdue</span>
          </div>
        </div>

        {/* Total Customers */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Active Customers</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-bold text-slate-900">
            {metrics?.totalCustomers || 0}
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Managed Client Accounts</span>
            <button
              onClick={() => onNavigate('customers')}
              className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-0.5"
            >
              <span>View</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Domain Health Overview */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Domain Registry</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Globe className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-bold text-slate-900">
            {metrics?.activeDomains || 0} <span className="text-xs font-normal text-slate-500">active</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px]">
            <span className="text-amber-600 font-medium">
              {metrics?.expiringSoonDomains || 0} expiring soon
            </span>
            <span>·</span>
            <span className="text-rose-600 font-medium">
              {metrics?.expiredDomains || 0} expired
            </span>
          </div>
        </div>
      </div>

      {/* 2. Urgent Domain Expiration Watchlist */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 sm:px-6 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-900">Upcoming Domain Expirations & Reminders</h3>
          </div>
          <button
            onClick={() => onNavigate('domains')}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
          >
            <span>All Domains</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">Domain Name</th>
                <th className="py-2.5 px-4">Customer</th>
                <th className="py-2.5 px-4">Expiration Date</th>
                <th className="py-2.5 px-4">Days Left</th>
                <th className="py-2.5 px-4">Renewal Price</th>
                <th className="py-2.5 px-4 text-right">Quick Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {upcomingRenewals.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    No domains expiring soon. All client domains are healthy!
                  </td>
                </tr>
              ) : (
                upcomingRenewals.map((domain) => {
                  const isExpired = domain.daysLeft < 0;
                  const isCritical = domain.daysLeft >= 0 && domain.daysLeft <= 7;
                  return (
                    <tr key={domain.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                        {domain.domainName}
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        <div className="font-medium text-slate-900">{domain.customerName}</div>
                        {domain.customerPhone && (
                          <div className="text-[11px] text-slate-500 font-mono">
                            {domain.customerPhone}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {new Date(domain.expirationDate).toLocaleDateString('en-GB')}
                      </td>
                      <td className="py-3 px-4">
                        {isExpired ? (
                          <span className="text-rose-600 font-bold">
                            Expired {Math.abs(domain.daysLeft)}d ago
                          </span>
                        ) : isCritical ? (
                          <span className="text-amber-600 font-bold">
                            Expiring in {domain.daysLeft}d
                          </span>
                        ) : (
                          <span className="text-slate-700 font-medium">
                            {domain.daysLeft} days remaining
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-slate-900">
                        {domain.renewalPrice.toLocaleString()} {metrics?.currency || 'ETB'}
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          onClick={() => onSendReminder(domain)}
                          title="Dispatch SMS / Email reminder"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-xs font-medium transition-colors"
                        >
                          <Send className="w-3 h-3 text-slate-500" />
                          <span>Remind</span>
                        </button>
                        <button
                          onClick={() => onRenewDomain(domain)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition-colors"
                        >
                          <span>Renew</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Bottom Grid: Recent Verified Payments & Audit Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Payments Stream */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
          <div className="p-4 sm:px-5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">Recent Payment Transactions</h3>
            </div>
            <button
              onClick={() => onNavigate('payments')}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              <span>Ledger</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 divide-y divide-slate-100">
            {recentPayments.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                No payment transactions recorded yet.
              </div>
            ) : (
              recentPayments.map((payment) => (
                <div key={payment.id} className="p-3.5 sm:px-5 flex items-center justify-between hover:bg-slate-50">
                  <div className="min-w-0 pr-3">
                    <div className="text-xs font-semibold text-slate-900 truncate">
                      {payment.customerName}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                      <span className="font-mono">{payment.id}</span>
                      <span>·</span>
                      <span className="capitalize">{payment.paymentMethod.replace('_', ' ')}</span>
                      <span>·</span>
                      <span>{new Date(payment.paymentDate).toLocaleDateString('en-GB')}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-bold text-emerald-700 font-mono">
                      +{payment.amount.toLocaleString()} {payment.currency}
                    </div>
                    <span
                      className={`text-[10px] font-medium capitalize ${
                        payment.status === 'confirmed'
                          ? 'text-emerald-600 font-semibold'
                          : payment.status === 'reversed'
                          ? 'text-rose-600'
                          : 'text-amber-600'
                      }`}
                    >
                      {payment.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Real-time System Audit Stream */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
          <div className="p-4 sm:px-5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">Recent Administrative Activity</h3>
            </div>
            <button
              onClick={() => onNavigate('audit')}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              <span>Full Audit Log</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 divide-y divide-slate-100">
            {recentActivity.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                No activity logs available.
              </div>
            ) : (
              recentActivity.map((log) => (
                <div key={log.id} className="p-3.5 sm:px-5 hover:bg-slate-50">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                    <span className="font-semibold text-slate-800">{log.action}</span>
                    <span className="font-mono">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="text-xs text-slate-700 truncate">{log.details}</div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    By {log.adminName} ({log.entityType})
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
