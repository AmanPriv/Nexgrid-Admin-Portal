import { jsPDF } from 'jspdf';
import { AppSettings } from '../types.ts';
import { resolveCompanyProfile } from './pdfGenerator.ts';

export interface TabularExportOptions {
  reportTitle: string;
  subtitle?: string;
  filenamePrefix: string;
  headers: string[];
  rows: (string | number)[][];
  kpis?: { label: string; value: string }[];
  chartPoints?: { label: string; value: number; secondaryValue?: number }[];
  companySettings?: Partial<AppSettings['general']>;
  clientSafe?: boolean;
}

export function exportReportToCsv(options: TabularExportOptions) {
  const company = resolveCompanyProfile(options.companySettings);
  const dateStr = new Date().toISOString().slice(0, 10);

  const csvLines: string[] = [
    `"${company.businessName.toUpperCase()} — ${options.reportTitle.toUpperCase()}","Generated: ${dateStr}"`,
    `"TIN: ${company.tinNumber}","Phone: ${company.businessPhone}","Email: ${company.businessEmail}","Currency: ${company.currency}"`,
  ];

  if (options.subtitle) {
    csvLines.push(`"Scope / Filters","${options.subtitle.replace(/"/g, '""')}"`);
  }
  if (options.clientSafe) {
    csvLines.push(`"Edition","CLIENT-SAFE EXTERNAL REPORT (Internal cost/margin metrics omitted)"`);
  }
  csvLines.push('');

  if (options.kpis && options.kpis.length > 0) {
    csvLines.push('"KEY PERFORMANCE INDICATORS","VALUE"');
    for (const k of options.kpis) {
      csvLines.push(`"${k.label.replace(/"/g, '""')}","${String(k.value).replace(/"/g, '""')}"`);
    }
    csvLines.push('');
  }

  csvLines.push(options.headers.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(','));
  for (const row of options.rows) {
    csvLines.push(
      row
        .map((cell) => {
          if (typeof cell === 'number') return String(cell);
          return `"${String(cell ?? '').replace(/"/g, '""')}"`;
        })
        .join(',')
    );
  }

  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${options.filenamePrefix}-${dateStr}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportReportToExcel(options: TabularExportOptions) {
  const company = resolveCompanyProfile(options.companySettings);
  const dateStr = new Date().toISOString().slice(0, 10);

  const escapeXml = (str: string | number) =>
    String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const kpiRowsXml = (options.kpis || [])
    .map(
      (k) => `
      <Row>
        <Cell ss:StyleID="sBold"><Data ss:Type="String">${escapeXml(k.label)}</Data></Cell>
        <Cell ss:StyleID="sMono"><Data ss:Type="String">${escapeXml(k.value)}</Data></Cell>
      </Row>`
    )
    .join('');

  const headerCellsXml = options.headers
    .map((h) => `<Cell ss:StyleID="sHeader"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`)
    .join('');

  const dataRowsXml = options.rows
    .map(
      (row) => `
      <Row>
        ${row
          .map((cell) => {
            const isNum = typeof cell === 'number' && !Number.isNaN(cell);
            return `<Cell><Data ss:Type="${isNum ? 'Number' : 'String'}">${escapeXml(cell)}</Data></Cell>`;
          })
          .join('')}
      </Row>`
    )
    .join('');

  const workbookXml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#0F172A"/>
    </Style>
    <Style ss:ID="sTitle">
      <Font ss:FontName="Calibri" ss:Size="14" ss:Bold="1" ss:Color="#0F172A"/>
    </Style>
    <Style ss:ID="sHeader">
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#0F172A" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="sBold">
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1"/>
    </Style>
    <Style ss:ID="sMono">
      <Font ss:FontName="Consolas" ss:Size="11" ss:Bold="1" ss:Color="#1D4ED8"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="${escapeXml(options.reportTitle.slice(0, 28))}">
    <Table>
      <Row><Cell ss:StyleID="sTitle"><Data ss:Type="String">${escapeXml(company.businessName)} — ${escapeXml(options.reportTitle)}</Data></Cell></Row>
      <Row><Cell><Data ss:Type="String">Generated: ${dateStr} | TIN: ${escapeXml(company.tinNumber)} | Phone: ${escapeXml(company.businessPhone)} | Email: ${escapeXml(company.businessEmail)}</Data></Cell></Row>
      ${options.subtitle ? `<Row><Cell><Data ss:Type="String">Filters: ${escapeXml(options.subtitle)}</Data></Cell></Row>` : ''}
      <Row></Row>
      ${kpiRowsXml ? `<Row><Cell ss:StyleID="sBold"><Data ss:Type="String">KPI Metric</Data></Cell><Cell ss:StyleID="sBold"><Data ss:Type="String">Value</Data></Cell></Row>${kpiRowsXml}<Row></Row>` : ''}
      <Row>${headerCellsXml}</Row>
      ${dataRowsXml}
    </Table>
  </Worksheet>
</Workbook>`;

  const blob = new Blob([workbookXml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${options.filenamePrefix}-${dateStr}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportReportToPdf(options: TabularExportOptions) {
  const company = resolveCompanyProfile(options.companySettings);
  const dateStr = new Date().toISOString().slice(0, 10);
  const isLandscape = options.headers.length > 5;
  const doc = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;

  const drawHeaderBanner = () => {
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 28, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(`${company.businessName} — ${options.reportTitle}`, margin, 11);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(203, 213, 225);
    doc.text(
      `TIN: ${company.tinNumber}  |  Tel: ${company.businessPhone}  |  Email: ${company.businessEmail}  |  Generated: ${dateStr}`,
      margin,
      18
    );
    if (options.subtitle) {
      doc.text(`Active Scope & Filters: ${options.subtitle.slice(0, 115)}`, margin, 24);
    }
  };

  drawHeaderBanner();
  let y = 35;

  // KPIs Summary Box
  if (options.kpis && options.kpis.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Key Performance Indicators Summary', margin, y);
    y += 3.5;

    const kpiCount = Math.min(options.kpis.length, 5);
    const boxW = (pageWidth - margin * 2 - (kpiCount - 1) * 3) / kpiCount;

    options.kpis.slice(0, 5).forEach((kpi, idx) => {
      const x = margin + idx * (boxW + 3);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(x, y, boxW, 14, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(kpi.label.slice(0, 28), x + 2.5, y + 5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(String(kpi.value).slice(0, 26), x + 2.5, y + 11.5);
    });

    y += 19;
  }

  // Optional Visual Mini Bar Chart in PDF
  if (options.chartPoints && options.chartPoints.length > 0) {
    const pts = options.chartPoints.slice(0, 8);
    const maxVal = Math.max(
      1,
      ...pts.map((p) => Math.max(p.value || 0, p.secondaryValue || 0))
    );
    const chartBoxH = 28;
    const chartBoxW = pageWidth - margin * 2;

    doc.setFillColor(252, 253, 255);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, chartBoxW, chartBoxH, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text('Visual Distribution Snapshot', margin + 3, y + 4.5);

    const slotW = (chartBoxW - 12) / pts.length;
    const maxBarH = 15;
    const baselineY = y + chartBoxH - 5.5;

    pts.forEach((pt, idx) => {
      const slotX = margin + 6 + idx * slotW;
      const barH = Math.max(1.5, (pt.value / maxVal) * maxBarH);
      doc.setFillColor(37, 99, 235);
      doc.rect(slotX + slotW * 0.2, baselineY - barH, Math.min(10, slotW * 0.35), barH, 'F');

      if (pt.secondaryValue !== undefined) {
        const secH = Math.max(1.5, (pt.secondaryValue / maxVal) * maxBarH);
        doc.setFillColor(16, 185, 129);
        doc.rect(
          slotX + slotW * 0.2 + Math.min(10, slotW * 0.35) + 1,
          baselineY - secH,
          Math.min(10, slotW * 0.35),
          secH,
          'F'
        );
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(71, 85, 105);
      doc.text(String(pt.label).slice(0, 12), slotX + slotW * 0.15, y + chartBoxH - 1.5);
    });

    y += chartBoxH + 5;
  }

  // Table Headers helper
  const colCount = Math.max(1, options.headers.length);
  const colW = (pageWidth - margin * 2) / colCount;

  const drawTableHeader = (topY: number) => {
    doc.setFillColor(30, 41, 59);
    doc.rect(margin, topY, pageWidth - margin * 2, 7.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);

    options.headers.forEach((h, i) => {
      doc.text(String(h).slice(0, 24), margin + i * colW + 2, topY + 5);
    });
    return topY + 7.5;
  };

  y = drawTableHeader(y);

  // Table Rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);

  if (options.rows.length === 0) {
    doc.setTextColor(100, 116, 139);
    doc.text('No records match the current report filter criteria.', margin + 2, y + 6);
    y += 10;
  } else {
    options.rows.forEach((row, rIdx) => {
      if (y > pageHeight - 20) {
        doc.addPage();
        drawHeaderBanner();
        y = drawTableHeader(34);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
      }
      if (rIdx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, pageWidth - margin * 2, 6.5, 'F');
      }
      doc.setTextColor(30, 41, 59);
      row.forEach((cell, cIdx) => {
        const formatted = typeof cell === 'number' ? cell.toLocaleString() : String(cell ?? '');
        doc.text(formatted.slice(0, 27), margin + cIdx * colW + 2, y + 4.5);
      });
      y += 6.5;
    });
  }

  // Footer with Page Numbers on all pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageHeight - 11, pageWidth - margin, pageHeight - 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `${company.businessName} • Bank: ${company.bankName} (${company.bankAccountNumber}) • Telebirr: ${company.telebirrNumber}`,
      margin,
      pageHeight - 6.5
    );
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin - 18, pageHeight - 6.5);
  }

  doc.save(`${options.filenamePrefix}-${dateStr}.pdf`);
}
