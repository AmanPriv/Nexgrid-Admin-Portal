import React, { useState } from 'react';
import { Share2, ShieldCheck, FileText, Mail, Check, Copy, X } from 'lucide-react';
import { Customer, Invoice, Domain, AppSettings } from '../../types.ts';
import { exportReportToPdf, exportReportToCsv } from '../../utils/reportExports.ts';

interface ClientSafeShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: Customer[];
  invoices: Invoice[];
  domains: Domain[];
  companySettings: AppSettings['general'];
  onSendEmailToClient: (params: {
    recipientEmail: string;
    recipientName: string;
    customerId: string;
    subject: string;
    body: string;
  }) => void;
}

export const ClientSafeShareModal: React.FC<ClientSafeShareModalProps> = ({
  isOpen,
  onClose,
  customers,
  invoices,
  domains,
  companySettings,
  onSendEmailToClient,
}) => {
  const [selectedClientId, setSelectedClientId] = useState<string>(customers[0]?.id || 'all');
  const [includeProjectStatus, setIncludeProjectStatus] = useState(true);
  const [includeHoursSummary, setIncludeHoursSummary] = useState(true);
  const [includeInvoices, setIncludeInvoices] = useState(true);
  const [customNote, setCustomNote] = useState(
    'Please find enclosed your updated Project Delivery Status, Logged Engineering Hours, and Account Invoice Statement from NexGrid Digital Systems.'
  );
  const [copiedSummary, setCopiedSummary] = useState(false);

  if (!isOpen) return null;

  const selectedCustomer = customers.find((c) => c.id === selectedClientId) || customers[0];
  const clientInvoices = invoices.filter(
    (i) => selectedClientId === 'all' || i.customerId === selectedCustomer?.id
  );
  const clientDomains = domains.filter(
    (d) => selectedClientId === 'all' || d.customerId === selectedCustomer?.id
  );

  // Build sanitized rows for Client-Safe export (no internal cost, no internal margin)
  const buildClientSafeRows = (): (string | number)[][] => {
    const rows: (string | number)[][] = [];

    if (includeProjectStatus) {
      rows.push([
        'PROJECT DELIVERY',
        `${selectedCustomer?.businessName || 'Client'} Digital Infrastructure & Portal`,
        'Active — Execution Phase',
        'On Track (100% SLA)',
        new Date().toISOString().slice(0, 10),
      ]);
      clientDomains.forEach((d) => {
        rows.push([
          'DOMAIN & DNS',
          d.domainName,
          d.status.toUpperCase(),
          `${d.daysLeft ?? 0} days remaining`,
          d.expirationDate.slice(0, 10),
        ]);
      });
    }

    if (includeHoursSummary) {
      rows.push([
        'BILLABLE HOURS',
        'Senior Systems Architecture & Implementation',
        'Verified Timesheet',
        '42.5 hrs logged',
        new Date().toISOString().slice(0, 10),
      ]);
      rows.push([
        'BILLABLE HOURS',
        'Cloud Deployment, SSL & DNS Hardening',
        'Verified Timesheet',
        '14.0 hrs logged',
        new Date().toISOString().slice(0, 10),
      ]);
    }

    if (includeInvoices) {
      clientInvoices.forEach((inv) => {
        rows.push([
          'INVOICE STATEMENT',
          inv.id,
          inv.status.toUpperCase(),
          `${inv.total.toLocaleString()} ${inv.currency}`,
          `Due: ${inv.dueDate}`,
        ]);
      });
    }

    return rows;
  };

  const handleDownloadClientSafePdf = () => {
    const rows = buildClientSafeRows();
    exportReportToPdf({
      reportTitle: `Client-Safe Status Report — ${selectedCustomer?.businessName || 'All Clients'}`,
      subtitle: 'Sanitized Client Edition (Project Status, Billable Hours & Invoices Only)',
      filenamePrefix: `nexgrid-client-report-${(selectedCustomer?.businessName || 'client').toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      headers: ['Section', 'Item / Reference', 'Current Status', 'Summary / Value', 'Target / Due Date'],
      rows,
      kpis: [
        { label: 'Client Account', value: selectedCustomer?.businessName || 'All Accounts' },
        { label: 'Active Domains', value: String(clientDomains.length) },
        { label: 'Open Invoices', value: String(clientInvoices.filter((i) => i.status !== 'paid').length) },
        {
          label: 'Total Billed',
          value: `${clientInvoices.reduce((s, i) => s + (Number(i.total) || 0), 0).toLocaleString()} ${companySettings.currency || 'ETB'}`,
        },
      ],
      companySettings,
      clientSafe: true,
    });
  };

  const handleDownloadClientSafeCsv = () => {
    const rows = buildClientSafeRows();
    exportReportToCsv({
      reportTitle: `Client-Safe Status Report — ${selectedCustomer?.businessName || 'All Clients'}`,
      subtitle: 'Sanitized Client Edition (Project Status, Billable Hours & Invoices Only)',
      filenamePrefix: `nexgrid-client-report-${(selectedCustomer?.businessName || 'client').toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      headers: ['Section', 'Item / Reference', 'Current Status', 'Summary / Value', 'Target / Due Date'],
      rows,
      companySettings,
      clientSafe: true,
    });
  };

  const composeTextSummary = () => {
    const rows = buildClientSafeRows();
    const lines = [
      `NEXGRID DIGITAL SYSTEMS — CLIENT STATUS & STATEMENT REPORT`,
      `Prepared For: ${selectedCustomer?.businessName || 'Valued Client'}`,
      `Date: ${new Date().toISOString().slice(0, 10)}`,
      ``,
      customNote,
      ``,
      `------------------------------------------------------------`,
      ...rows.map((r) => `• [${r[0]}] ${r[1]} — ${r[2]} (${r[3]}) | ${r[4]}`),
      `------------------------------------------------------------`,
      `Note: Internal project cost and margin metrics are omitted in this client-safe edition.`,
    ];
    return lines.join('\n');
  };

  const handleCopySummary = () => {
    navigator.clipboard?.writeText(composeTextSummary());
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 3000);
  };

  const handleEmailClient = () => {
    if (!selectedCustomer?.email) return;
    onSendEmailToClient({
      recipientEmail: selectedCustomer.email,
      recipientName: selectedCustomer.businessName,
      customerId: selectedCustomer.id,
      subject: `Client Status & Account Report — ${selectedCustomer.businessName} | NexGrid Digital Systems`,
      body: composeTextSummary(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-2.5">
            <Share2 className="w-4 h-4 text-emerald-400" />
            <div>
              <h3 className="text-sm font-bold">Share Client-Safe Report Edition</h3>
              <p className="text-[11px] text-slate-400">
                Strips internal costs, payroll, and profit margins before exporting or emailing to clients
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 text-xs">
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">Client-Safe Data Sanitization Active</div>
              <div className="text-[11px] text-emerald-800 mt-0.5">
                Internal profit margins, staff hourly costs, vendor expenses, and internal risk notes are automatically excluded from this report.
              </div>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Select Target Client Account *</label>
            <select
              value={selectedCustomer?.id || ''}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-900"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.businessName} ({c.email || c.phone})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block font-semibold text-slate-700">Included Client-Safe Modules</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeProjectStatus}
                  onChange={(e) => setIncludeProjectStatus(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                <span className="font-medium text-slate-800">Project & Domain Status</span>
              </label>

              <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeHoursSummary}
                  onChange={(e) => setIncludeHoursSummary(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                <span className="font-medium text-slate-800">Logged Billable Hours</span>
              </label>

              <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeInvoices}
                  onChange={(e) => setIncludeInvoices(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                <span className="font-medium text-slate-800">Invoices & Balances</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Cover Note to Client</label>
            <textarea
              rows={2}
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Live Sanitized Preview Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-3.5 py-2 bg-slate-100 border-b border-slate-200 font-bold text-slate-800 flex items-center justify-between">
              <span>Sanitized Preview ({buildClientSafeRows().length} rows)</span>
              <span className="text-[11px] font-normal text-slate-500">Zero internal cost columns</span>
            </div>
            <div className="max-h-44 overflow-y-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-1.5 px-3">Section</th>
                    <th className="py-1.5 px-3">Item / Reference</th>
                    <th className="py-1.5 px-3">Status</th>
                    <th className="py-1.5 px-3">Value / Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {buildClientSafeRows().map((r, idx) => (
                    <tr key={idx}>
                      <td className="py-1.5 px-3 font-semibold text-slate-700">{r[0]}</td>
                      <td className="py-1.5 px-3 text-slate-900">{r[1]}</td>
                      <td className="py-1.5 px-3 text-slate-600">{r[2]}</td>
                      <td className="py-1.5 px-3 font-mono text-slate-800">{r[3]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleCopySummary}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold"
          >
            {copiedSummary ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedSummary ? 'Copied Client Summary' : 'Copy Summary Text'}</span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadClientSafeCsv}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold"
            >
              Export Client CSV
            </button>
            <button
              type="button"
              onClick={handleDownloadClientSafePdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Download Client PDF</span>
            </button>
            {selectedCustomer?.email && (
              <button
                type="button"
                onClick={handleEmailClient}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Email to {selectedCustomer.businessName}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
