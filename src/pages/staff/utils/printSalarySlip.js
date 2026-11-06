// Builds an A4 salary slip for a PayrollRun and opens it via the shared
// Electron/browser print-preview pipeline (same as Consumption / KDS).
import { previewHtmlReport } from '../../../utils/reportDoc.js'

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

function rs(n) {
  return `Rs. ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function longDate(value) {
  const d = value ? (String(value).includes('T') ? new Date(value) : new Date(`${value}T00:00:00`)) : new Date();
  return Number.isNaN(d.getTime())
    ? new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function row(label, value, bold, note) {
  return `
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:24px;border-bottom:1px solid #f1f5f9;padding:10px 16px;${bold ? 'font-weight:700;' : ''}">
      <div>${esc(label)}${note ? `<span style="margin-left:8px;font-size:12px;font-weight:400;color:#54677a">${esc(note)}</span>` : ''}</div>
      <div style="font-variant-numeric:tabular-nums">${esc(value)}</div>
    </div>`;
}

export function buildSalarySlipHtml(run, info = {}, details = {}) {
  const company = info.name || 'Restaurant';
  const allowances = Number(run?.allowance || 0) + Number(run?.bonus || 0);
  const extrasNote = [run?.extrasNote, Number(run?.bonus || 0) > 0 ? 'Attendance bonus' : ''].filter(Boolean).join(' · ');
  const totalDeduct =
    Number(run?.absentDeduction || 0) + Number(run?.lateDeduction || 0) +
    Number(run?.earlyOutDeduction || 0) + Number(run?.manualDeduction || 0) +
    Number(run?.advanceDeducted || 0) + Number(run?.purchaseDeducted || 0);
  const status = run?.status || '';
  const generatedOn = longDate(run?.paidAt || run?.updatedAt || run?.createdAt);

  const att = details.attendance || [];
  const attColor = (s) => (s === 'Present' || s === 'Late') ? '#047857' : s === 'Leave' ? '#1d4ed8' : '#be123c';
  const attTable = att.length ? `
    <div style="overflow:hidden;border:1px solid #cbd5e1">
      <div style="background:#0e4e8a;color:#fff;padding:8px 16px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase">Attendance Record — ${esc(run?.period)}</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead>
          <tr style="background:#f1f5f9;color:#54677a">
            <th style="padding:5px 12px;text-align:left;border-bottom:1px solid #e2e8f0;font-size:10px;text-transform:uppercase">Date</th>
            <th style="padding:5px 12px;text-align:left;border-bottom:1px solid #e2e8f0;font-size:10px;text-transform:uppercase">Status</th>
            <th style="padding:5px 12px;text-align:left;border-bottom:1px solid #e2e8f0;font-size:10px;text-transform:uppercase">Check In</th>
            <th style="padding:5px 12px;text-align:left;border-bottom:1px solid #e2e8f0;font-size:10px;text-transform:uppercase">Check Out</th>
            <th style="padding:5px 12px;text-align:left;border-bottom:1px solid #e2e8f0;font-size:10px;text-transform:uppercase">Notes</th>
          </tr>
        </thead>
        <tbody>
          ${[...att].sort((a, b) => String(a.date).localeCompare(String(b.date))).map((r) => `
          <tr>
            <td style="padding:4px 12px;border-bottom:1px solid #f1f5f9">${esc(r.date)}</td>
            <td style="padding:4px 12px;border-bottom:1px solid #f1f5f9;font-weight:700;color:${attColor(r.status)}">${esc(r.status || '—')}</td>
            <td style="padding:4px 12px;border-bottom:1px solid #f1f5f9">${esc(r.checkIn || '—')}</td>
            <td style="padding:4px 12px;border-bottom:1px solid #f1f5f9">${esc(r.checkOut || '—')}</td>
            <td style="padding:4px 12px;border-bottom:1px solid #f1f5f9;color:#54677a">${esc(r.notes || '')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '';

  const entries = details.entries || [];
  const entriesTable = entries.length ? `
    <div style="margin-top:16px;overflow:hidden;border:1px solid #cbd5e1">
      <div style="background:#0e4e8a;color:#fff;padding:8px 16px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase">Earnings &amp; Deductions Entries</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead>
          <tr style="background:#f1f5f9;color:#54677a">
            <th style="padding:5px 12px;text-align:left;border-bottom:1px solid #e2e8f0;font-size:10px;text-transform:uppercase">Date</th>
            <th style="padding:5px 12px;text-align:left;border-bottom:1px solid #e2e8f0;font-size:10px;text-transform:uppercase">Category</th>
            <th style="padding:5px 12px;text-align:right;border-bottom:1px solid #e2e8f0;font-size:10px;text-transform:uppercase">Amount</th>
            <th style="padding:5px 12px;text-align:left;border-bottom:1px solid #e2e8f0;font-size:10px;text-transform:uppercase">Notes</th>
          </tr>
        </thead>
        <tbody>
          ${[...entries].sort((a, b) => String(a.date).localeCompare(String(b.date))).map((r) => {
            const isDed = r.category === 'Deduction';
            return `
          <tr>
            <td style="padding:4px 12px;border-bottom:1px solid #f1f5f9">${esc(r.date)}</td>
            <td style="padding:4px 12px;border-bottom:1px solid #f1f5f9">${esc(isDed ? 'Adjustment (Deduction)' : r.category)}</td>
            <td style="padding:4px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;color:${isDed ? '#be123c' : '#047857'}">${isDed ? '-' : '+'}${esc(rs(r.amount))}</td>
            <td style="padding:4px 12px;border-bottom:1px solid #f1f5f9;color:#54677a">${esc(r.notes || '')}</td>
          </tr>` }).join('')}
        </tbody>
      </table>
    </div>` : '';

  const advRows = details.advances || [];
  const advLabel = (t) => (t || 'issue') === 'issue' ? 'Advance' : t === 'payroll_deduct' ? 'Salary deduct' : 'Repayment';
  const advTable = advRows.length ? `
    <div style="margin-top:16px;overflow:hidden;border:1px solid #cbd5e1">
      <div style="background:#0e4e8a;color:#fff;padding:8px 16px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase">Advance Entries</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead>
          <tr style="background:#f1f5f9;color:#54677a">
            <th style="padding:5px 12px;text-align:left;border-bottom:1px solid #e2e8f0;font-size:10px;text-transform:uppercase">Date</th>
            <th style="padding:5px 12px;text-align:left;border-bottom:1px solid #e2e8f0;font-size:10px;text-transform:uppercase">Type</th>
            <th style="padding:5px 12px;text-align:right;border-bottom:1px solid #e2e8f0;font-size:10px;text-transform:uppercase">Amount</th>
            <th style="padding:5px 12px;text-align:left;border-bottom:1px solid #e2e8f0;font-size:10px;text-transform:uppercase">Note</th>
          </tr>
        </thead>
        <tbody>
          ${[...advRows].sort((a, b) => String(a.date).localeCompare(String(b.date))).map((r) => `
          <tr>
            <td style="padding:4px 12px;border-bottom:1px solid #f1f5f9">${esc(String(r.date || '').slice(0, 10))}</td>
            <td style="padding:4px 12px;border-bottom:1px solid #f1f5f9">${esc(advLabel(r.type))}</td>
            <td style="padding:4px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;color:${(r.type || 'issue') === 'issue' ? '#be123c' : '#047857'}">${(r.type || 'issue') === 'issue' ? '+' : '-'}${esc(rs(r.amount))}</td>
            <td style="padding:4px 12px;border-bottom:1px solid #f1f5f9;color:#54677a">${esc(r.notes || r.note || '')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '';

  const purRows = details.purchases || [];
  const purTable = purRows.length ? `
    <div style="margin-top:16px;overflow:hidden;border:1px solid #cbd5e1">
      <div style="background:#0e4e8a;color:#fff;padding:8px 16px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase">Unpaid Staff Purchases — ${esc(run?.period)}</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead>
          <tr style="background:#f1f5f9;color:#54677a">
            <th style="padding:5px 12px;text-align:left;border-bottom:1px solid #e2e8f0;font-size:10px;text-transform:uppercase">Date</th>
            <th style="padding:5px 12px;text-align:left;border-bottom:1px solid #e2e8f0;font-size:10px;text-transform:uppercase">Bill No</th>
            <th style="padding:5px 12px;text-align:right;border-bottom:1px solid #e2e8f0;font-size:10px;text-transform:uppercase">Amount</th>
            <th style="padding:5px 12px;text-align:left;border-bottom:1px solid #e2e8f0;font-size:10px;text-transform:uppercase">Status</th>
          </tr>
        </thead>
        <tbody>
          ${[...purRows].sort((a, b) => String(a.date).localeCompare(String(b.date))).map((r) => `
          <tr>
            <td style="padding:4px 12px;border-bottom:1px solid #f1f5f9">${esc(String(r.date || '').slice(0, 10))}</td>
            <td style="padding:4px 12px;border-bottom:1px solid #f1f5f9">${esc(r.billNo || '—')}</td>
            <td style="padding:4px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;color:#be123c">-${esc(rs(r.amount))}</td>
            <td style="padding:4px 12px;border-bottom:1px solid #f1f5f9;color:#54677a">Salary deduct</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '';

  const detailPage = (attTable || entriesTable || advTable || purTable)
    ? `<div style="page-break-before:always;break-before:page"></div><div style="width:186mm;max-width:100%;margin:0 auto;padding:8mm 0 14mm">${attTable}${entriesTable}${advTable}${purTable}</div>` : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Payslip — ${esc(run?.staffName)} — ${esc(run?.period)}</title>
  <style>
    @page { size: A4; margin: 0 }
    html, body { margin: 0; padding: 0; background: #fff; color: #17293c; font-family: Arial, Helvetica, sans-serif }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact }
    @media print { .no-print { display: none !important } }
  </style>
</head>
<body>
  <div style="width:186mm;max-width:100%;margin:0 auto;padding:6mm 0 14mm;box-sizing:border-box">
    <div style="border:1px solid #cbd5e1;overflow:hidden">
      <div style="display:flex;align-items:center;gap:16px;padding:14px 16px;background:linear-gradient(180deg,#f8fafc 0%,#fff 100%)">
        ${info.logo ? `<img src="${esc(info.logo)}" alt="" style="height:72px;width:72px;object-fit:contain;flex-shrink:0" />` : `<div style="height:72px;width:72px;flex-shrink:0;border:1px solid #e2e8f0;background:#f1f5f9"></div>`}
        <div style="flex:1;min-width:0">
          <div style="font-size:22px;font-weight:800;letter-spacing:-0.02em;line-height:1.2">${esc(company)}</div>
          ${info.address ? `<div style="margin-top:4px;font-size:12px;color:#54677a">${esc(info.address)}</div>` : ''}
          ${info.phone ? `<div style="margin-top:2px;font-size:12px;color:#54677a">Tel: ${esc(info.phone)}</div>` : ''}
        </div>
        <div style="flex-shrink:0;text-align:right;border-left:1px solid #e2e8f0;padding-left:16px">
          <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#0e4e8a">Human Resources</div>
          <div style="margin-top:6px;font-size:16px;font-weight:700">Payslip</div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 16px;background:#0e4e8a;color:#fff;font-size:12px">
        <div>${run?.slipNo ? `Slip No: ${esc(run.slipNo)}` : 'Salary Slip'}</div>
        <div>Date: ${esc(generatedOn)}</div>
      </div>
    </div>
    <div style="margin-top:20px;overflow:hidden;border:1px solid #cbd5e1">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr>
          <td style="width:22%;padding:8px 12px;background:#eaf2f9;border:1px solid #e2e8f0;color:#0e4e8a;font-weight:500">Employee</td>
          <td style="width:28%;padding:8px 12px;border:1px solid #e2e8f0;font-weight:600">${esc(run?.staffName) || '—'}</td>
          <td style="width:22%;padding:8px 12px;background:#eaf2f9;border:1px solid #e2e8f0;color:#0e4e8a;font-weight:500">Month</td>
          <td style="width:28%;padding:8px 12px;border:1px solid #e2e8f0;font-weight:600">${esc(run?.period) || '—'}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;background:#eaf2f9;border:1px solid #e2e8f0;color:#0e4e8a;font-weight:500">Designation</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0">${esc(run?.position) || '—'}</td>
          <td style="padding:8px 12px;background:#eaf2f9;border:1px solid #e2e8f0;color:#0e4e8a;font-weight:500">Department</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0">${esc(run?.position) || '—'}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;background:#eaf2f9;border:1px solid #e2e8f0;color:#0e4e8a;font-weight:500">Attendance</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0">${run?.presentDays ?? 0} present · ${run?.leaveDays ?? 0} leave · ${run?.absentDays ?? 0} absent</td>
          <td style="padding:8px 12px;background:#eaf2f9;border:1px solid #e2e8f0;color:#0e4e8a;font-weight:500">Status</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;text-transform:capitalize">${esc(status) || '—'}</td>
        </tr>
      </table>
    </div>
    <div style="margin-top:24px;overflow:hidden;border:1px solid #cbd5e1">
      <div style="background:#0e4e8a;color:#fff;padding:8px 16px;font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase">Earnings</div>
      ${row('Basic Salary', rs(run?.basicSalary))}
      ${row('Allowances &amp; Bonuses', rs(allowances), false, extrasNote || undefined)}
      ${row('Overtime Pay', rs(run?.otPay))}
      ${row('Double-Shift Bonus', rs(run?.doubleShift))}
      ${row('Gross Pay', rs(run?.grossPay), true)}
    </div>
    <div style="margin-top:20px;overflow:hidden;border:1px solid #cbd5e1">
      <div style="background:#0e4e8a;color:#fff;padding:8px 16px;font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase">Deductions</div>
      ${Number(run?.absentDeduction || 0) > 0 ? row('Absent Deduction', rs(run.absentDeduction), false, `(${run.absentDays ?? 0} days)`) : ''}
      ${Number(run?.lateDeduction || 0) > 0 ? row('Late Deduction', rs(run.lateDeduction), false, `${run.lateDays ?? 0} days · ${run.totalLateMinutes ?? 0} min`) : ''}
      ${Number(run?.earlyOutDeduction || 0) > 0 ? row('Early Out Deduction', rs(run.earlyOutDeduction), false, `${run.earlyOutDays ?? 0} days · ${run.totalEarlyOutMinutes ?? 0} min`) : ''}
      ${Number(run?.manualDeduction || 0) > 0 ? row('Adjustment (Deduction)', rs(run.manualDeduction)) : ''}
      ${row('Advance Repayment', rs(run?.advanceDeducted))}
      ${Number(run?.purchaseDeducted || 0) > 0 ? row('Staff Purchases (unpaid)', rs(run.purchaseDeducted), false, `${details.purchases?.length ? `${details.purchases.length} order(s)` : ''}`.trim() || undefined) : ''}
      ${row('Total Deductions', rs(totalDeduct), true)}
    </div>
    <div style="margin-top:20px;display:flex;justify-content:space-between;align-items:center;background:#0e4e8a;color:#fff;padding:12px 20px">
      <div style="font-size:16px;font-weight:600">Net Pay</div>
      <div style="font-size:20px;font-weight:700;font-variant-numeric:tabular-nums">${esc(rs(run?.netPay))}</div>
    </div>
    <div style="margin-top:56px;display:flex;justify-content:space-between;font-size:12px;color:#54677a">
      <div>Generated on ${esc(generatedOn)}</div>
      <div style="text-align:right">
        <div style="margin-bottom:32px">Authorized Signatory</div>
        <div style="margin-left:auto;width:192px;border-top:1px solid #94a3b8"></div>
      </div>
    </div>
  </div>
  ${detailPage}
</body>
</html>`;
}

export async function openSalarySlipPreview(run, info = {}, details = {}) {
  const html = buildSalarySlipHtml(run, info, details);
  const safeName = `Payslip-${String(run?.staffName || 'staff').replace(/\s+/g, '-')}-${String(run?.period || '')}.pdf`;
  await previewHtmlReport(html, safeName);
}
