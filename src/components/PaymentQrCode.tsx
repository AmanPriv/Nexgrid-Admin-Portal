import React, { useState, useMemo } from 'react';
import QRCode from 'qrcode';
import { QrCode, Download, Copy, Check } from 'lucide-react';
import { AppSettings } from '../types.ts';
import {
  buildPaymentQrPayload,
  createPaymentQrMatrix,
  PaymentQrContext,
  resolveCompanyProfile,
} from '../utils/pdfGenerator.ts';

interface PaymentQrCodeProps {
  settings?: AppSettings['general'];
  context?: PaymentQrContext;
  size?: number;
  showActions?: boolean;
  compact?: boolean;
}

export const PaymentQrCode: React.FC<PaymentQrCodeProps> = ({
  settings,
  context,
  size = 128,
  showActions = true,
  compact = false,
}) => {
  const [copied, setCopied] = useState(false);

  const company = useMemo(() => resolveCompanyProfile(settings), [settings]);
  const payload = useMemo(() => buildPaymentQrPayload(settings, context), [settings, context]);
  const matrix = useMemo(() => createPaymentQrMatrix(payload), [payload]);

  const quietZone = 2;
  const totalModules = matrix.size + quietZone * 2;

  const handleCopyPayload = async () => {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback copy
    }
  };

  const handleDownloadQrPng = async () => {
    try {
      const dataUrl = await QRCode.toDataURL(payload, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 512,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      const docTag = context?.documentId ? `-${context.documentId}` : '';
      a.download = `nexgrid-scan-to-pay${docTag}.png`;
      a.click();
    } catch (err) {
      console.error('Failed to download QR PNG:', err);
    }
  };

  return (
    <div
      className={`flex ${
        compact ? 'flex-row items-center gap-3' : 'flex-col items-center'
      } bg-white rounded-xl border border-slate-200 p-3 shadow-2xs`}
    >
      <div className="relative bg-white p-1.5 rounded-lg border border-slate-200 shrink-0">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${totalModules} ${totalModules}`}
          shapeRendering="crispEdges"
          className="block"
          aria-label="Scan to Pay QR Code"
        >
          <rect width={totalModules} height={totalModules} fill="#ffffff" />
          {matrix.modules.map((row, rIdx) =>
            row.map((isDark, cIdx) =>
              isDark ? (
                <rect
                  key={`${rIdx}-${cIdx}`}
                  x={cIdx + quietZone}
                  y={rIdx + quietZone}
                  width={1}
                  height={1}
                  fill="#0f172a"
                />
              ) : null
            )
          )}
        </svg>
      </div>

      <div className={compact ? 'flex-1 min-w-0 space-y-1' : 'text-center mt-2 space-y-1 w-full'}>
        <div
          className={`inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded ${
            compact ? '' : 'mx-auto'
          }`}
        >
          <QrCode className="w-3 h-3 text-blue-600" />
          <span>Scan to Pay</span>
        </div>

        <div className="text-[11px] font-bold text-slate-900 truncate">
          {company.bankName}
        </div>
        <div className="text-[10px] font-mono text-slate-600 truncate">
          A/C: <strong className="text-slate-900">{company.bankAccountNumber}</strong> • Telebirr:{' '}
          <strong className="text-slate-900">{company.telebirrNumber}</strong>
        </div>

        {showActions && (
          <div className={`flex items-center gap-1.5 pt-1 ${compact ? '' : 'justify-center'}`}>
            <button
              type="button"
              onClick={handleDownloadQrPng}
              title="Download Standalone QR Code Image (PNG)"
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-semibold transition-colors"
            >
              <Download className="w-3 h-3" />
              <span>QR Image</span>
            </button>
            <button
              type="button"
              onClick={handleCopyPayload}
              title="Copy Encoded Banking & Payment Details"
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-semibold transition-colors"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copied' : 'Copy Info'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
