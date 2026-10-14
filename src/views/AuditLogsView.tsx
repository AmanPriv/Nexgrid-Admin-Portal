import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Search,
  Filter,
  RotateCw,
  Lock,
  User,
  CreditCard,
  Globe,
  FileText,
  Settings,
  Bell,
  Database,
} from 'lucide-react';
import { api } from '../services/api.ts';
import { AuditLog } from '../types.ts';

export const AuditLogsView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState<string>('all');

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await api.getAuditLogs(entityFilter, search);
      setLogs(data.logs);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [entityFilter, search]);

  const getEntityIcon = (type: AuditLog['entityType']) => {
    switch (type) {
      case 'customer':
        return <User className="w-3.5 h-3.5 text-blue-600" />;
      case 'domain':
        return <Globe className="w-3.5 h-3.5 text-indigo-600" />;
      case 'payment':
        return <CreditCard className="w-3.5 h-3.5 text-emerald-600" />;
      case 'invoice':
      case 'quotation':
        return <FileText className="w-3.5 h-3.5 text-amber-600" />;
      case 'auth':
        return <Lock className="w-3.5 h-3.5 text-purple-600" />;
      case 'notification':
        return <Bell className="w-3.5 h-3.5 text-sky-600" />;
      case 'backup':
        return <Database className="w-3.5 h-3.5 text-teal-600" />;
      default:
        return <Settings className="w-3.5 h-3.5 text-slate-600" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Info */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Immutable Administrative Audit Log</h3>
            <p className="text-xs text-slate-500">
              Chronological ledger of security, financial, domain, customer, and credential events
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
          <Lock className="w-3.5 h-3.5 text-emerald-600" />
          <span>Tamper-Resistant • System Enforced</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search action, administrator, details..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 shadow-2xs focus:ring-1 focus:ring-blue-500 focus:outline-none font-medium"
          >
            <option value="all">All Entity Categories</option>
            <option value="payment">Payments & Reversals</option>
            <option value="domain">Domain Registrations & Renewals</option>
            <option value="invoice">Invoices & Quotations</option>
            <option value="customer">Customers</option>
            <option value="auth">Authentication & Logins</option>
            <option value="notification">SMS Notifications</option>
            <option value="settings">Settings & Configuration</option>
            <option value="backup">Database Backups</option>
          </select>

          <button
            onClick={loadLogs}
            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 shadow-2xs"
          >
            <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">Timestamp (UTC / EAT)</th>
                <th className="py-2.5 px-4">Entity</th>
                <th className="py-2.5 px-4">Action</th>
                <th className="py-2.5 px-4">Record ID</th>
                <th className="py-2.5 px-4">Audit Details</th>
                <th className="py-2.5 px-4">Administrator</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Loading security audit logs...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No audit records matching filter criteria.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString('en-GB')}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 capitalize font-medium text-slate-700">
                        {getEntityIcon(log.entityType)}
                        <span>{log.entityType}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900 font-mono text-[11px]">
                      {log.action}
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-blue-600">
                      {log.entityId}
                    </td>
                    <td className="py-3 px-4 text-slate-700 max-w-md">
                      {log.details}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900 whitespace-nowrap">
                      {log.adminName}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
