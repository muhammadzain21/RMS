// Shared A4 report-document builder + print-preview plumbing for ALL pages.
// Ported from the hospital project's printDocTheme/printListDoc pattern:
// branded letterhead band, meta block, summary/table builders, watermark —
// then preview via the Electron PDF window (system print dialog in browsers).

export const escDoc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export function resolveAssetUrl(raw) {
  try {
    if (!raw) return ''
    if (/^(data:|https?:|file:|blob:)/i.test(raw)) return raw
    if (raw.startsWith('/')) return window.location.origin + raw
    return new URL(raw, window.location.href).href
  } catch { return raw || '' }
}

/**
 * Preview a report document. Electron renders the HTML to an A4 PDF and opens
 * it in the PDF preview window; browsers print via a hidden iframe (the system
 * print dialog is the preview there).
 */
export async function previewHtmlReport(html, fileName) {
  try {
    const api = (typeof window !== 'undefined') ? window.pdfPreview : null
    if (api && typeof api.printHtml === 'function') {
      const r = await api.printHtml(html, fileName)
      if (r && r.ok !== false) return
    }
  } catch {}
  try {
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'
    document.body.appendChild(iframe)
    const doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document)
    if (!doc) { iframe.remove(); return }
    doc.open(); doc.write(String(html || '')); doc.close()
    const doPrint = () => { try { iframe.contentWindow.focus(); iframe.contentWindow.print() } catch {} }
    iframe.onload = doPrint
    setTimeout(doPrint, 500)
    setTimeout(() => { try { iframe.remove() } catch {} }, 60000)
  } catch {}
}

export function reportCss(accent = '#1e3a8a') {
  return `
  :root{--acc:${accent};--bd:#94a3b8;--mut:#54677a}
  @page{size:A4;margin:12mm}
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#17293c;line-height:1.45;background:#fff;margin:0}
  .band{background:linear-gradient(90deg,var(--acc) 0%,#1d4ed8 55%,#312e81 100%);color:#fff;border-radius:6px;padding:14px 18px;display:flex;align-items:center;gap:14px}
  .band img{width:64px;height:64px;object-fit:contain;background:#fff;border-radius:8px;padding:4px}
  .band .co{font-size:22px;font-weight:800;letter-spacing:.02em;line-height:1.1}
  .band .tag{font-size:10px;letter-spacing:.28em;color:#fbbf24;margin-top:2px;text-transform:uppercase}
  .band .addr{font-size:9px;color:#dbeafe;margin-top:4px}
  .band .rpt{margin-left:auto;text-align:right;font-size:9px;color:#dbeafe;line-height:1.5}
  .band .rpt b{color:#fff;font-size:11px}
  .title{font-size:15px;font-weight:700;margin:14px 0 8px}
  .meta{display:flex;justify-content:space-between;margin-bottom:12px;font-size:10.5px}
  .meta .col div{padding:1.5px 0}
  .meta .lbl{display:inline-block;min-width:92px;color:#444}
  .tbl{width:100%;border-collapse:collapse;margin-bottom:14px}
  .tbl th,.tbl td{border:1px solid var(--bd);padding:4px 7px}
  .tbl thead th{background:#e2e8f0;font-size:9px;text-transform:uppercase;letter-spacing:.04em;text-align:left}
  .tbl thead th.r{text-align:right}
  .tbl thead th.c,.tbl td.c{text-align:center}
  .tbl td.r{text-align:right}
  .tbl tbody tr:nth-child(even) td{background:#f8fafc}
  .sect{font-size:12px;font-weight:700;margin:12px 0 5px}
  .neg{color:#dc2626;font-weight:bold}
  .pos{color:#059669;font-weight:bold}
  .foot-note{margin-top:12px;font-size:9px;color:var(--mut);border-top:1px solid #cbd5e1;padding-top:6px}
  .wm{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:-1;pointer-events:none}
  .wm img{width:340px;opacity:.05}
  `
}

export function reportWm(settings = {}, opacity = 0.05) {
  const logo = resolveAssetUrl(settings.watermarkImage || settings.receiptLogo || settings.logo || settings.logoUrl || '')
  return logo ? `<div class="wm"><img src="${escDoc(logo)}" style="opacity:${opacity}" onerror="this.parentNode.style.display='none'"></div>` : ''
}

export function reportHdr(settings = {}, { tagline = 'Point of Sale', reportLabel = 'Report', reportNo = '' } = {}) {
  const company = settings.companyName || settings.name || 'Restaurant POS'
  const logo = resolveAssetUrl(settings.receiptLogo || settings.logo || settings.logoUrl || '')
  const contact = [settings.address, settings.phone].filter(Boolean).map(escDoc).join(' · ')
  return `<div class="band">${logo ? `<img src="${escDoc(logo)}" onerror="this.style.display='none'">` : ''}<div><div class="co">${escDoc(company)}</div><div class="tag">${escDoc(tagline)}</div>${contact ? `<div class="addr">${contact}</div>` : ''}</div><div class="rpt"><b>${escDoc(reportLabel)}</b>${reportNo ? `<br>${escDoc(reportNo)}` : ''}</div></div>`
}

export function reportMeta({ left = [], right = [] } = {}) {
  const col = (items) => items.map(([l, v, b]) => `<div><span class="lbl">${escDoc(l)}</span> ${b ? `<b>${escDoc(v)}</b>` : escDoc(v)}</div>`).join('')
  return `<div class="meta"><div class="col">${col(left)}</div><div class="col">${col(right)}</div></div>`
}

export function reportSec(title) { return `<div class="sect">${escDoc(title)}</div>` }

// Two-column "Summary | Amount" table — rows: [{label, amount, cls}]
export function reportSummary(rows = []) {
  return `<table class="tbl"><thead><tr><th>Summary</th><th class="r">Amount</th></tr></thead><tbody>${rows.map(r => `<tr><td>${escDoc(r.label)}</td><td class="r ${r.cls || ''}">${escDoc(r.amount)}</td></tr>`).join('')}</tbody></table>`
}

/**
 * Generic data table. headers: strings or {t, align:'r'|'c'}; rows: arrays of
 * primitives or {v, align:'r'|'c', cls, raw}. `numbered` prepends a # column.
 */
export function reportTable({ headers = [], rows = [], numbered = false, emptyText = 'No records' } = {}) {
  const ths = headers.map((h) => {
    const o = typeof h === 'object' && h !== null ? h : { t: h }
    return `<th${o.align === 'r' ? ' class="r"' : o.align === 'c' ? ' class="c"' : ''}>${escDoc(o.t ?? '')}</th>`
  }).join('')
  const body = rows.map((r, i) => `<tr>${numbered ? `<td class="c">${i + 1}</td>` : ''}${r.map((c) => {
    const o = typeof c === 'object' && c !== null ? c : { v: c }
    const cls = [o.align === 'r' ? 'r' : o.align === 'c' ? 'c' : '', o.cls || ''].filter(Boolean).join(' ')
    return `<td${cls ? ` class="${cls}"` : ''}>${o.raw ? String(o.v ?? '') : escDoc(o.v ?? '')}</td>`
  }).join('')}</tr>`).join('')
  const colspan = headers.length + (numbered ? 1 : 0)
  return `<table class="tbl"><thead><tr>${numbered ? '<th class="c">#</th>' : ''}${ths}</tr></thead><tbody>${body || `<tr><td colspan="${colspan}" style="text-align:center;color:var(--mut);padding:12px">${escDoc(emptyText)}</td></tr>`}</tbody></table>`
}

/**
 * Assemble a complete A4 letterhead document:
 * watermark + brand band + title + meta + body + foot-note.
 */
export function wrapReportDoc({ settings = {}, title = 'Report', tagline = 'Point of Sale', reportLabel = 'Report', reportNo = '', metaLeft = [], metaRight = [], body = '', footNote = '', accent } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escDoc(title)}</title><style>${reportCss(accent)}</style></head><body>
${reportWm(settings)}
${reportHdr(settings, { tagline, reportLabel, reportNo })}
<div class="title">${escDoc(title)}</div>
${reportMeta({ left: metaLeft, right: metaRight })}
${body}
${footNote ? `<div class="foot-note">${escDoc(footNote)}</div>` : ''}
</body></html>`
}

/** Build the letterhead doc and open the preview in one call. */
export async function printReportDoc(opts = {}) {
  const html = wrapReportDoc(opts)
  const safe = String(opts.fileName || `${String(opts.title || 'report').replace(/\s+/g, '-')}.pdf`)
  await previewHtmlReport(html, safe)
}
