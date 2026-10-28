import React, { useState } from 'react';
import { CalendarClock, Plus, Trash2, Send, CheckCircle2, X, Mail } from 'lucide-react';
import {
  REPORT_CATEGORIES,
  ReportCategoryId,
  ScheduledReportConfig,
} from '../../types/reporting.ts';

interface ScheduledReportsModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedules: ScheduledReportConfig[];
  onSaveSchedules: (next: ScheduledReportConfig[]) => void;
  onTriggerEmailDispatch: (schedule: ScheduledReportConfig) => void;
}

export const ScheduledReportsModal: React.FC<ScheduledReportsModalProps> = ({
  isOpen,
  onClose,
  schedules,
  onSaveSchedules,
  onTriggerEmailDispatch,
}) => {
  const [name, setName] = useState('Weekly Executive & Financial Digest');
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [dayOfWeekOrMonth, setDayOfWeekOrMonth] = useState('Monday');
  const [timeOfDay, setTimeOfDay] = useState('08:30');
  const [recipientsInput, setRecipientsInput] = useState('nexgriddigital@gmail.com');
  const [format, setFormat] = useState<'pdf' | 'excel' | 'csv'>('pdf');
  const [selectedCategories, setSelectedCategories] = useState<ReportCategoryId[]>(['executive', 'financial']);
  const [clientSafeMode, setClientSafeMode] = useState(false);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  if (!isOpen) return null;

  const toggleCategory = (catId: ReportCategoryId) => {
    setSelectedCategories((prev) =>
      prev.includes(catId) ? prev.filter((c) => c !== catId) : [...prev, catId]
    );
  };

  const handleAddSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    const recipients = recipientsInput
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);
    if (!name.trim() || recipients.length === 0 || selectedCategories.length === 0) return;

    const newItem: ScheduledReportConfig = {
      id: `SCH-${Date.now()}`,
      name: name.trim(),
      frequency,
      dayOfWeekOrMonth,
      timeOfDay,
      recipients,
      categories: selectedCategories,
      format,
      includeChartsSummary: true,
      clientSafeMode,
      enabled: true,
      createdAt: new Date().toISOString(),
    };

    const next = [newItem, ...schedules];
    onSaveSchedules(next);
    setSavedBanner(`Scheduled report "${newItem.name}" saved (${newItem.frequency}).`);
    setTimeout(() => setSavedBanner(null), 4000);
  };

  const handleToggleEnabled = (id: string) => {
    const next = schedules.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s));
    onSaveSchedules(next);
  };

  const handleDelete = (id: string) => {
    onSaveSchedules(schedules.filter((s) => s.id !== id));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs">
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-2.5">
            <CalendarClock className="w-4 h-4 text-blue-400" />
            <div>
              <h3 className="text-sm font-bold">Scheduled Email Reports & Automated Digests</h3>
              <p className="text-[11px] text-slate-400">
                Configure daily, weekly, or monthly report dispatches via NexGrid Gmail / SMTP
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 text-xs">
          {savedBanner && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{savedBanner}</span>
            </div>
          )}

          {/* Create New Schedule Form */}
          <form onSubmit={handleAddSchedule} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-blue-600" />
              <span>Create New Automated Report Schedule</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Schedule Title *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Attachment Format</label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
                >
                  <option value="pdf">PDF Executive Document</option>
                  <option value="excel">Excel Workbook (.xls)</option>
                  <option value="csv">CSV Data Feed (.csv)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Cadence / Frequency</label>
                <select
                  value={frequency}
                  onChange={(e) => {
                    const nextFreq = e.target.value as 'daily' | 'weekly' | 'monthly';
                    setFrequency(nextFreq);
                    if (nextFreq === 'daily') setDayOfWeekOrMonth('Every Day');
                    else if (nextFreq === 'weekly') setDayOfWeekOrMonth('Monday');
                    else setDayOfWeekOrMonth('1st of Month');
                  }}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Delivery Day</label>
                <input
                  type="text"
                  value={dayOfWeekOrMonth}
                  onChange={(e) => setDayOfWeekOrMonth(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Dispatch Time (EAT)</label>
                <input
                  type="time"
                  value={timeOfDay}
                  onChange={(e) => setTimeOfDay(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Recipient Email Addresses (comma-separated) *
              </label>
              <input
                type="text"
                required
                value={recipientsInput}
                onChange={(e) => setRecipientsInput(e.target.value)}
                placeholder="nexgriddigital@gmail.com, finance@company.com"
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Included Report Categories *</label>
              <div className="flex flex-wrap gap-1.5">
                {REPORT_CATEGORIES.map((cat) => {
                  const active = selectedCategories.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => toggleCategory(cat.id)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                        active
                          ? 'bg-slate-900 border-slate-900 text-white'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {cat.shortLabel}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-200">
              <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                <input
                  type="checkbox"
                  checked={clientSafeMode}
                  onChange={(e) => setClientSafeMode(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Sanitize as Client-Safe Edition (omit internal cost & margin columns)</span>
              </label>

              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Save Schedule</span>
              </button>
            </div>
          </form>

          {/* Existing Schedules List */}
          <div className="space-y-2.5">
            <h4 className="font-bold text-slate-900">Active & Configured Report Schedules ({schedules.length})</h4>
            {schedules.length === 0 ? (
              <div className="p-6 text-center rounded-xl border border-slate-200 text-slate-500">
                No automated email schedules configured yet. Add one above to automate delivery.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                {schedules.map((sch) => (
                  <div
                    key={sch.id}
                    className="p-3.5 bg-white hover:bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{sch.name}</span>
                        <span className="text-slate-300" aria-hidden="true">·</span>
                        <span className="text-[11px] font-semibold uppercase text-blue-700">
                          {sch.frequency} ({sch.dayOfWeekOrMonth} @ {sch.timeOfDay})
                        </span>
                        <span className="text-slate-300" aria-hidden="true">·</span>
                        <span className="text-[11px] font-mono uppercase text-slate-600">
                          {sch.format}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Recipients: <span className="font-mono text-slate-700">{sch.recipients.join(', ')}</span>
                        {sch.clientSafeMode && ' · Client-Safe Sanitized'}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onTriggerEmailDispatch(sch)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-semibold text-[11px]"
                      >
                        <Mail className="w-3 h-3" />
                        <span>Send Now</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleEnabled(sch.id)}
                        className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] border ${
                          sch.enabled
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            : 'bg-slate-100 border-slate-200 text-slate-500'
                        }`}
                      >
                        {sch.enabled ? 'Enabled' : 'Paused'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(sch.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        title="Remove Schedule"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
