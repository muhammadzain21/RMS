// Staff monthly summary print preview.
// Generates a real PDF (jsPDF) and opens it in the system/browser PDF viewer;
// falls back to an HTML preview window when a PDF viewer isn't available.
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { openPdfPreview, sanitizeFileName } from '../../../utils/pdfPreview.js';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const fmt = (n) => Number(n || 0).toLocaleString();

const formatTime12 = (t) => {
  if (!t) return '-';
  let [h, min] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(min).padStart(2, '0')} ${ampm}`;
};

export function buildStaffSummaryHtml({ st, calc, counts, records, staffAdvances, staffPayNotes, advTotal, paid, netDue, month, companyName }) {
  const statusColor = (status) => ({
    Present: 'background:#dcfce7;color:#15803d',
    Late: 'background:#ffedd5;color:#c2410c',
    Absent: 'background:#fee2e2;color:#b91c1c',
  }[status] || 'background:#fef9c3;color:#a16207');

  const statBox = (label, value, color) =>
    `<td style="text-align:center;border:1px solid ${color};border-radius:8px;padding:10px 6px;">
      <div style="font-size:20px;font-weight:700;color:${color}">${esc(value)}</div>
      <div style="font-size:10px;color:${color};text-transform:uppercase;letter-spacing:.5px">${esc(label)}</div>
    </td>`;

  const row = (label, value, color = '#000') =>
    `<tr><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;color:#475569">${esc(label)}</td>
     <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;color:${color}">${esc(value)}</td></tr>`;

  const recordRows = records.map(r => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${esc(r.date)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:center">
        <span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:600;${statusColor(r.status)}">${esc(r.status)}</span>
      </td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${formatTime12(r.checkIn)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${formatTime12(r.checkOut)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:center;color:#ea580c">${r.lateMinutes > 0 ? r.lateMinutes : '-'}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:center;color:#2563eb">${r.earlyOutMinutes > 0 ? r.earlyOutMinutes : '-'}</td>
    </tr>`).join('');

  const paymentRows = (staffPayNotes || []).map(n => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${esc(n.date || (n.createdAt ? new Date(n.createdAt).toLocaleDateString() : ''))}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${esc(n.notes || '(No note)')}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">${fmt(n.amount)} PKR</td>
    </tr>`).join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Staff Monthly Summary - ${esc(st?.name || '')}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #000; margin: 0; padding: 16px; }
  .toolbar { display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 12px; }
  .toolbar button { padding: 8px 18px; border: 0; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 13px; }
  .btn-print { background: linear-gradient(135deg,#10b981,#059669); color: #fff; }
  .btn-close { background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1 !important; }
  @media print { .toolbar { display: none; } body { padding: 0; } }
  h1 { font-size: 18px; margin: 0; }
  .sub { color: #64748b; font-size: 11px; margin-top: 2px; }
  .section { margin-top: 14px; }
  .section-title { font-weight: 700; font-size: 13px; margin-bottom: 6px; color: #0f172a; }
  table { width: 100%; border-collapse: collapse; }
  .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; }
</style>
</head>
<body>
  <div class="toolbar">
    <button class="btn-print" onclick="window.print()">Print</button>
    <button class="btn-close" onclick="window.close()">Close</button>
  </div>

  <h1>${esc(companyName || 'Staff Report')}</h1>
  <div class="sub">Monthly Summary: <b>${esc(st?.name || '')}</b> (${esc(st?.position || '')}) - ${esc(month)}</div>

  <div class="section">
    <table style="border-collapse:separate;border-spacing:6px 0;table-layout:fixed">
      <tr>
        ${statBox('Present', counts.present + counts.late, '#16a34a')}
        ${statBox('Late', counts.late, '#ea580c')}
        ${statBox('Early Out', counts.earlyOutDays, '#d97706')}
        ${statBox('Leave', counts.leave, '#2563eb')}
        ${statBox('Absent', counts.absent, '#dc2626')}
      </tr>
    </table>
  </div>

  <div class="section card">
    <div class="section-title">Salary Calculation</div>
    <table>
      ${row('Base Salary', `${fmt(calc.base)} PKR`)}
      ${row('Per Day Rate', `${Number(calc.perDay).toFixed(2)} PKR`)}
      ${row(`Bonus (${counts.present + counts.late} days)`, `+${Number(calc.bonus).toFixed(2)} PKR`, '#16a34a')}
      ${row(`Absent (${counts.absent} days)`, `-${Number(calc.absentDeduction).toFixed(2)} PKR`, '#dc2626')}
      ${row(`Late (${counts.late} days, ${calc.totalLateMinutes} min)`, `-${Number(calc.lateDeduction).toFixed(2)} PKR`, '#dc2626')}
      ${row(`Early Out (${counts.earlyOutDays} days, ${calc.totalEarlyOutMinutes} min)`, `-${Number(calc.earlyOutDeduction).toFixed(2)} PKR`, '#dc2626')}
      ${row(`Advances Taken (${staffAdvances.length})`, `-${fmt(advTotal)} PKR`, '#9333ea')}
      ${row(`Paid This Month (${staffPayNotes.length})`, `-${fmt(paid)} PKR`, '#ea580c')}
      <tr>
        <td style="padding:8px;font-weight:700;background:#dcfce7;border-radius:6px">Net Salary Due</td>
        <td style="padding:8px;font-weight:700;font-size:15px;text-align:right;background:#dcfce7;color:#15803d;border-radius:6px">${fmt(netDue)} PKR</td>
      </tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Attendance Records (${records.length} days)</div>
    <table>
      <thead>
        <tr style="background:#f1f5f9">
          <th style="padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;color:#64748b">Date</th>
          <th style="padding:6px 8px;text-align:center;font-size:10px;text-transform:uppercase;color:#64748b">Status</th>
          <th style="padding:6px 8px;text-align:center;font-size:10px;text-transform:uppercase;color:#64748b">Check In</th>
          <th style="padding:6px 8px;text-align:center;font-size:10px;text-transform:uppercase;color:#64748b">Check Out</th>
          <th style="padding:6px 8px;text-align:center;font-size:10px;text-transform:uppercase;color:#ea580c">Late Min</th>
          <th style="padding:6px 8px;text-align:center;font-size:10px;text-transform:uppercase;color:#2563eb">Early Out Min</th>
        </tr>
      </thead>
      <tbody>
        ${recordRows || '<tr><td colspan="6" style="padding:16px;text-align:center;color:#94a3b8">No records for this month</td></tr>'}
        ${records.length ? `<tr style="background:#f1f5f9;font-weight:700;border-top:2px solid #cbd5e1">
          <td colspan="4" style="padding:6px 8px">Total</td>
          <td style="padding:6px 8px;text-align:center;color:#ea580c">${counts.totalLateMinutes}</td>
          <td style="padding:6px 8px;text-align:center;color:#2563eb">${counts.totalEarlyOutMinutes}</td>
        </tr>` : ''}
      </tbody>
    </table>
  </div>

  ${staffPayNotes.length ? `
  <div class="section">
    <div class="section-title">Payment History</div>
    <table>
      <thead>
        <tr style="background:#f1f5f9">
          <th style="padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;color:#64748b">Date</th>
          <th style="padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;color:#64748b">Note</th>
          <th style="padding:6px 8px;text-align:right;font-size:10px;text-transform:uppercase;color:#64748b">Amount</th>
        </tr>
      </thead>
      <tbody>${paymentRows}</tbody>
    </table>
  </div>` : ''}
</body>
</html>`;
}

// Build the monthly summary as a jsPDF document (portrait A4).
export function buildStaffSummaryPdf({ st, calc, counts, records, staffAdvances, staffPayNotes, advTotal, paid, netDue, month, companyName }) {
  const doc = new jsPDF('p', 'pt', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;

  // Header
  doc.setFontSize(16);
  doc.text(companyName || 'Staff Report', margin, 38);
  doc.setFontSize(11);
  doc.setTextColor(90, 90, 90);
  doc.text(`Monthly Summary: ${st?.name || ''} (${st?.position || '-'}) - ${month || ''}`, margin, 56);
  doc.setTextColor(0, 0, 0);

  // Stat widgets
  const widgets = [
    { label: 'Present', value: String(counts.present + counts.late), bg: [220, 252, 231], border: [22, 163, 74] },
    { label: 'Late', value: String(counts.late), bg: [255, 237, 213], border: [234, 88, 12] },
    { label: 'Early Out', value: String(counts.earlyOutDays), bg: [254, 243, 199], border: [180, 83, 9] },
    { label: 'Leave', value: String(counts.leave), bg: [219, 234, 254], border: [37, 99, 235] },
    { label: 'Absent', value: String(counts.absent), bg: [254, 226, 226], border: [220, 38, 38] },
  ];
  const gap = 6;
  const boxW = (pageWidth - 2 * margin - 4 * gap) / 5;
  const boxH = 48;
  const statY = 70;
  widgets.forEach((w, i) => {
    const x = margin + i * (boxW + gap);
    doc.setFillColor(w.bg[0], w.bg[1], w.bg[2]);
    doc.setDrawColor(w.border[0], w.border[1], w.border[2]);
    doc.setLineWidth(1.2);
    doc.roundedRect(x, statY, boxW, boxH, 5, 5, 'FD');
    doc.setFontSize(7);
    doc.setTextColor(w.border[0], w.border[1], w.border[2]);
    doc.setFont(undefined, 'bold');
    doc.text(w.label.toUpperCase(), x + 8, statY + 15);
    doc.setFontSize(13);
    doc.text(w.value, x + 8, statY + 36);
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'normal');
  });

  // Salary calculation table
  const salaryData = [
    ['Base Salary', `${fmt(calc.base)} PKR`],
    ['Per Day Rate', `${Number(calc.perDay).toFixed(2)} PKR`],
    [`Bonus (${counts.present + counts.late} days)`, `+${Number(calc.bonus).toFixed(2)} PKR`],
    [`Absent (${counts.absent} days)`, `-${Number(calc.absentDeduction).toFixed(2)} PKR`],
    [`Late (${counts.late} days, ${calc.totalLateMinutes} min)`, `-${Number(calc.lateDeduction).toFixed(2)} PKR`],
    [`Early Out (${counts.earlyOutDays} days, ${calc.totalEarlyOutMinutes} min)`, `-${Number(calc.earlyOutDeduction).toFixed(2)} PKR`],
    [`Advances Taken (${staffAdvances.length})`, `-${fmt(advTotal)} PKR`],
    [`Paid This Month (${staffPayNotes.length})`, `-${fmt(paid)} PKR`],
    ['Net Salary Due', `${fmt(netDue)} PKR`],
  ];
  doc.autoTable({
    head: [['Salary Calculation', 'Amount']],
    body: salaryData,
    startY: statY + boxH + 14,
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right', cellWidth: 120 } },
    margin: { left: margin, right: margin },
    didParseCell: (d) => {
      if (d.section === 'body' && d.row.index === salaryData.length - 1) {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fillColor = [220, 252, 231];
        if (d.column.index === 1) d.cell.styles.textColor = [21, 128, 61];
      }
    },
  });

  // Attendance records table
  const recData = records.map(r => [
    r.date, r.status, formatTime12(r.checkIn), formatTime12(r.checkOut),
    r.lateMinutes > 0 ? r.lateMinutes : '-', r.earlyOutMinutes > 0 ? r.earlyOutMinutes : '-'
  ]);
  if (records.length) recData.push(['Total', '', '', '', counts.totalLateMinutes, counts.totalEarlyOutMinutes]);

  let y = (doc.lastAutoTable?.finalY || statY + boxH) + 18;
  doc.setFontSize(12);
  doc.text(`Attendance Records (${records.length} days)`, margin, y);
  doc.autoTable({
    head: [['Date', 'Status', 'Check In', 'Check Out', 'Late Min', 'Early Out Min']],
    body: recData.length ? recData : [['-', 'No records', '-', '-', '-', '-']],
    startY: y + 6,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [20, 184, 166], textColor: 255, fontSize: 9, fontStyle: 'bold' },
    columnStyles: {
      1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' },
      4: { halign: 'center', textColor: [234, 88, 12] }, 5: { halign: 'center', textColor: [37, 99, 235] },
    },
    margin: { left: margin, right: margin },
    didParseCell: (d) => {
      if (d.section === 'body' && records.length && d.row.index === recData.length - 1) {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fillColor = [241, 245, 249];
      }
    },
  });

  // Payment history
  if (staffPayNotes.length) {
    const y2 = (doc.lastAutoTable?.finalY || y) + 18;
    doc.setFontSize(12);
    doc.text('Payment History', margin, y2);
    doc.autoTable({
      head: [['Date', 'Note', 'Amount']],
      body: staffPayNotes.map(n => [
        n.date || (n.createdAt ? new Date(n.createdAt).toLocaleDateString() : ''),
        n.notes || '(No note)',
        `${fmt(n.amount)} PKR`
      ]),
      startY: y2 + 6,
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
      columnStyles: { 2: { halign: 'right' } },
      margin: { left: margin, right: margin },
    });
  }

  return doc;
}

// Open the generated PDF in a viewer for preview/print:
// 1) Electron -> in-app PDF preview window (meaningful file name = window title)
// 2) Browser  -> blob URL opened in the built-in PDF viewer
// 3) Fallback -> HTML preview window
export async function openStaffSummaryPrintPreview(opts) {
  try {
    const doc = buildStaffSummaryPdf(opts);
    const fileName = sanitizeFileName(`${opts?.st?.name || 'Staff'} Monthly Report ${opts?.month || ''}`) + '.pdf';
    if (await openPdfPreview(doc, fileName)) return true;
  } catch (e) {
    console.warn('[pdfPreview] PDF build failed:', e);
  }

  // Last resort: HTML preview window
  const html = buildStaffSummaryHtml(opts);
  const w = window.open('', 'staffSummaryPrint', 'width=1000,height=800');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  try { w.focus(); } catch {}
  return true;
}
