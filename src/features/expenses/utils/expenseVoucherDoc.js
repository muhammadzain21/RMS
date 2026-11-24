import { format } from 'date-fns'
import { escDoc, resolveAssetUrl, previewHtmlReport } from '@shared/utils/reportDoc.js'

function expenseLines(exp) {
  if (Array.isArray(exp?.lines) && exp.lines.length) return exp.lines
  return [{
    expenseHead: exp?.expenseHead || exp?.category || '',
    description: exp?.description || '',
    amount: exp?.amount || 0,
  }]
}

function fmtExpenseDateTime(exp) {
  // Business voucher date first; clock time from createdAt only as a suffix.
  const s = String(exp?.date || '').trim()
  let day = s || '—'
  if (s) {
    try {
      const dt = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s)
      if (!Number.isNaN(dt.getTime())) day = format(dt, 'dd/MM/yyyy')
    } catch { /* keep s */ }
  }
  const at = exp?.createdAt || exp?.updatedAt
  if (at) {
    try {
      const dt = new Date(at)
      if (!Number.isNaN(dt.getTime())) return `${day} ${format(dt, 'h:mm a')}`
    } catch { /* fall through */ }
  }
  return day
}

function fmtShortDate(value) {
  if (!value) return ''
  try {
    const dt = value instanceof Date ? value : new Date(value)
    if (!Number.isNaN(dt.getTime())) return format(dt, 'dd/MM/yyyy')
  } catch { /* ignore */ }
  const s = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    try {
      return format(new Date(`${s}T00:00:00`), 'dd/MM/yyyy')
    } catch { return s }
  }
  return s
}

function voucherTitle(exp) {
  const note = String(exp?.note || '').trim()
  if (note) return note.toUpperCase()
  if (exp?.accountHead === 'bank') return 'BANK EXPENSES'
  return 'DAILY CASH EXPENSES'
}

function paymentLabel(exp) {
  if (exp?.status === 'approved' && exp?.approvedAt) {
    return `Payment(${fmtShortDate(exp.approvedAt)})`
  }
  return `Payment(${fmtShortDate(exp?.date) || fmtShortDate(exp?.createdAt)})`
}

export function getExpenseVoucherMeta(exp) {
  const lines = expenseLines(exp)
  const total = lines.reduce((a, l) => a + Number(l.amount || 0), 0) || Number(exp?.amount || 0)
  const paid = exp?.status === 'approved' ? total : total
  const balance = 0
  return {
    lines,
    total,
    paid,
    balance,
    titleDesc: voucherTitle(exp),
    entity: String(exp?.paidBy || '').trim(),
    expenseDate: fmtExpenseDateTime(exp),
    paymentLabel: paymentLabel(exp),
    approvedBy: exp?.status === 'approved' ? (exp?.approvedBy || '') : '',
    approvedDate: exp?.status === 'approved' && exp?.approvedAt
      ? fmtShortDate(exp.approvedAt)
      : (exp?.status === 'approved' ? fmtShortDate(exp?.date) : ''),
    status: exp?.status === 'approved' ? 'approved' : 'pending',
  }
}

export function buildExpenseVoucherHtml(exp, settings = {}) {
  const company = settings.companyName || settings.name || 'Restaurant POS'
  const logo = resolveAssetUrl(settings.receiptLogo || settings.logo || settings.logoUrl || '')
  const address = String(settings.address || '').trim()
  const phone = String(settings.phone || '').trim()
  const meta = getExpenseVoucherMeta(exp)

  const rows = meta.lines.map((l, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td>${escDoc(l.description || '—')}</td>
      <td>${escDoc(l.expenseHead || exp?.expenseHead || exp?.category || '—')}</td>
      <td class="r">${Number(l.amount || 0).toLocaleString()}</td>
    </tr>`).join('')

  const managerLine = [
    meta.approvedDate ? `Manager ${meta.approvedDate}` : 'Manager',
    meta.approvedBy ? `Approved By: ${meta.approvedBy}` : 'Approved By:',
  ].join(' / ')

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>Expense</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 11px; line-height: 1.35; background: #fff; }
  .sheet { width: 100%; max-width: 190mm; margin: 0 auto; }
  .top { display: grid; grid-template-columns: 1.2fr 0.8fr 1fr; gap: 8px; align-items: start; margin-bottom: 10px; }
  .brand { display: flex; gap: 10px; align-items: flex-start; }
  .brand img { width: 54px; height: 54px; object-fit: contain; }
  .co { font-size: 18px; font-weight: 800; line-height: 1.15; }
  .addr { font-size: 10px; color: #333; margin-top: 3px; max-width: 220px; }
  .doc-title { text-align: center; font-size: 22px; font-weight: 700; padding-top: 6px; }
  .contact { text-align: right; font-size: 11px; padding-top: 8px; }
  .meta { display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 8px; margin: 8px 0 12px; font-size: 11px; }
  .meta .lbl { font-weight: 700; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #222; padding: 4px 6px; vertical-align: top; }
  th { background: #f3f4f6; font-size: 11px; text-align: left; }
  td.c, th.c { text-align: center; width: 48px; }
  td.r, th.r { text-align: right; white-space: nowrap; }
  .totals { margin-top: 10px; width: 240px; margin-left: auto; font-size: 12px; }
  .totals .row { display: flex; justify-content: space-between; gap: 16px; padding: 2px 0; }
  .totals .row.strong { font-weight: 800; border-top: 1px solid #222; margin-top: 4px; padding-top: 6px; }
  .signs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px; margin-top: 36px; font-size: 11px; }
  .signs .line { border-top: 1px solid #222; margin-top: 28px; padding-top: 4px; min-height: 18px; }
</style>
</head>
<body>
  <div class="sheet">
    <div class="top">
      <div class="brand">
        ${logo ? `<img src="${escDoc(logo)}" alt="" onerror="this.style.display='none'"/>` : ''}
        <div>
          <div class="co">${escDoc(company)}</div>
          ${address ? `<div class="addr">${escDoc(address)}</div>` : ''}
        </div>
      </div>
      <div class="doc-title">Expense</div>
      <div class="contact">${phone ? `Contact # ${escDoc(phone)}` : ''}</div>
    </div>

    <div class="meta">
      <div><span class="lbl">Description:</span> ${escDoc(meta.titleDesc)}</div>
      <div><span class="lbl">Entity (Contact):</span> ${escDoc(meta.entity)}</div>
      <div style="text-align:right"><span class="lbl">Expense date:</span> ${escDoc(meta.expenseDate)}</div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="c">Sr #</th>
          <th>Description</th>
          <th>Account</th>
          <th class="r">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="4" class="c">No line items</td></tr>`}
      </tbody>
    </table>

    <div class="totals">
      <div class="row strong"><span>Total:</span><span>${meta.total.toLocaleString()}</span></div>
      <div class="row"><span>${escDoc(meta.paymentLabel)}:</span><span>${meta.paid.toLocaleString()}</span></div>
      <div class="row"><span>Balance:</span><span>${meta.balance.toLocaleString()}</span></div>
    </div>

    <div class="signs">
      <div>
        <div class="line"></div>
        <div>${escDoc(managerLine)}</div>
      </div>
      <div>
        <div class="line"></div>
        <div>Admin Signature</div>
      </div>
      <div>
        <div class="line"></div>
        <div>Receiver Signature</div>
      </div>
    </div>
  </div>
</body>
</html>`
}

export async function printExpenseVoucher(exp, settings = {}) {
  const html = buildExpenseVoucherHtml(exp, settings)
  const datePart = String(exp?.date || 'expense').replace(/[^\w-]+/g, '-')
  const fileName = `Expense-${datePart}.pdf`
  await previewHtmlReport(html, fileName)
  return true
}
