import React from 'react';
import { Filter, RotateCcw, Calendar, Users, Briefcase, UserCheck, Layers, Activity } from 'lucide-react';
import { Customer } from '../../types.ts';
import { ReportFilterState } from '../../types/reporting.ts';

interface ReportFilterBarProps {
  filters: ReportFilterState;
  onChange: (next: ReportFilterState) => void;
  onReset: () => void;
  customers: Customer[];
  projectsList: { id: string; name: string }[];
  teamMembersList: string[];
}

export const ReportFilterBar: React.FC<ReportFilterBarProps> = ({
  filters,
  onChange,
  onReset,
  customers,
  projectsList,
  teamMembersList,
}) => {
  const handlePresetChange = (preset: ReportFilterState['datePreset']) => {
    const today = new Date();
    const endDate = today.toISOString().slice(0, 10);
    let startDate = filters.startDate;

    if (preset === '30d') {
      startDate = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);
    } else if (preset === '90d') {
      startDate = new Date(today.getTime() - 90 * 86400000).toISOString().slice(0, 10);
    } else if (preset === '6m') {
      startDate = new Date(today.getTime() - 180 * 86400000).toISOString().slice(0, 10);
    } else if (preset === '1y') {
      startDate = new Date(today.getTime() - 365 * 86400000).toISOString().slice(0, 10);
    } else if (preset === 'all') {
      startDate = '2024-01-01';
    }

    onChange({
      ...filters,
      datePreset: preset,
      startDate,
      endDate,
    });
  };

  const hasActiveFilters =
    filters.datePreset !== '6m' ||
    filters.clientId !== 'all' ||
    filters.projectId !== 'all' ||
    filters.teamMember !== 'all' ||
    filters.serviceType !== 'all' ||
    filters.status !== 'all';

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
          <Filter className="w-3.5 h-3.5 text-blue-600" />
          <span>Global Report Filters & Scope</span>
          <span className="text-slate-300" aria-hidden="true">·</span>
          <span className="font-normal text-slate-500">
            Applies across tables, charts, and PDF / Excel / CSV exports
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg">
            {[
              { id: '30d', label: '30D' },
              { id: '90d', label: '90D' },
              { id: '6m', label: '6M' },
              { id: '1y', label: '1Y' },
              { id: 'all', label: 'All Time' },
              { id: 'custom', label: 'Custom' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePresetChange(p.id as ReportFilterState['datePreset'])}
                className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                  filters.datePreset === p.id
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-[11px] font-semibold transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
        {/* Date Range Inputs */}
        <div className="space-y-1">
          <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
            <Calendar className="w-3 h-3 text-slate-400" />
            <span>Date Range</span>
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) =>
                onChange({ ...filters, datePreset: 'custom', startDate: e.target.value })
              }
              className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) =>
                onChange({ ...filters, datePreset: 'custom', endDate: e.target.value })
              }
              className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Client Selector */}
        <div className="space-y-1">
          <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
            <Users className="w-3 h-3 text-slate-400" />
            <span>Client / Account</span>
          </label>
          <select
            value={filters.clientId}
            onChange={(e) => onChange({ ...filters, clientId: e.target.value })}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Clients ({customers.length})</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.businessName}
              </option>
            ))}
          </select>
        </div>

        {/* Project Selector */}
        <div className="space-y-1">
          <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
            <Briefcase className="w-3 h-3 text-slate-400" />
            <span>Project</span>
          </label>
          <select
            value={filters.projectId}
            onChange={(e) => onChange({ ...filters, projectId: e.target.value })}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Projects ({projectsList.length})</option>
            {projectsList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Team Member Selector */}
        <div className="space-y-1">
          <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
            <UserCheck className="w-3 h-3 text-slate-400" />
            <span>Team Member</span>
          </label>
          <select
            value={filters.teamMember}
            onChange={(e) => onChange({ ...filters, teamMember: e.target.value })}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Team Members</option>
            {teamMembersList.map((tm) => (
              <option key={tm} value={tm}>
                {tm}
              </option>
            ))}
          </select>
        </div>

        {/* Service Type Selector */}
        <div className="space-y-1">
          <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
            <Layers className="w-3 h-3 text-slate-400" />
            <span>Service Type</span>
          </label>
          <select
            value={filters.serviceType}
            onChange={(e) => onChange({ ...filters, serviceType: e.target.value })}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Services</option>
            <option value="domain_dns">Domain & DNS Registry</option>
            <option value="erp_pos">ERP & POS Systems</option>
            <option value="cloud_hosting">Cloud Hosting & Infrastructure</option>
            <option value="web_mobile">Custom Web & Mobile Dev</option>
            <option value="maintenance_sla">Annual Maintenance & SLA</option>
          </select>
        </div>

        {/* Status Selector */}
        <div className="space-y-1">
          <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
            <Activity className="w-3 h-3 text-slate-400" />
            <span>Status</span>
          </label>
          <select
            value={filters.status}
            onChange={(e) => onChange({ ...filters, status: e.target.value })}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active / Paid / On Track</option>
            <option value="pending">Pending / In Progress</option>
            <option value="overdue">Overdue / At Risk</option>
            <option value="completed">Completed / Renewed</option>
          </select>
        </div>
      </div>
    </div>
  );
};
