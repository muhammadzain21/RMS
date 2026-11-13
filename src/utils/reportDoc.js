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

function sanitizeReportFileName(fileName) {
  const clean = String(fileName || 'report')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim() || 'report'
  return /\.pdf$/i.test(clean) ? clean : `${clean}.pdf`
}

function triggerBrowserPdfDownload(data, fileName, { base64 = false } = {}) {
  const name = sanitizeReportFileName(fileName)
  const a = document.createElement('a')
  a.download = name
  if (base64) {
    a.href = `data:application/pdf;base64,${data}`
  } else {
    const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/pdf' })
    a.href = URL.createObjectURL(blob)
  }
  document.body.appendChild(a)
  a.click()
  a.remove()
  if (!base64) setTimeout(() => { try { URL.revokeObjectURL(a.href) } catch {} }, 2500)
}

function reportApiBase() {
  const raw = (typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000'
  return String(raw || '').replace(/\/+$/, '')
}

function authToken() {
  try { return sessionStorage.getItem('auth_token') || '' } catch { return '' }
}

/**
 * One A4 PDF for both Print and Download (server Chromium, same HTML + @page).
 */
function base64ToPdfBlob(base64) {
  const bin = atob(String(base64 || ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: 'application/pdf' })
}

async function renderPdfWithHtml2Pdf(html) {
  const html2pdf = (await import('html2pdf.js')).default
  const wrap = document.createElement('div')
  wrap.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;background:#fff;'
  wrap.innerHTML = html
  // If full document, use body contents only for html2pdf
  const bodyMatch = String(html).match(/<body[^>]*>([\s\S]*)<\/body>/i)
  if (bodyMatch) wrap.innerHTML = bodyMatch[1]
  const styleMatch = String(html).match(/<style[^>]*>([\s\S]*?)<\/style>/gi)
  if (styleMatch?.length) {
    const styleEl = document.createElement('style')
    styleEl.textContent = styleMatch.map((s) => s.replace(/<\/?style[^>]*>/gi, '')).join('\n')
    wrap.prepend(styleEl)
  }
  document.body.appendChild(wrap)
  try {
    const worker = html2pdf().set({
      margin: [10, 10, 10, 10],
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] },
    }).from(wrap)
    const blob = await worker.outputPdf('blob')
    return blob
  } finally {
    try { wrap.remove() } catch {}
  }
}

async function renderReportPdfBlob(html, fileName) {
  const name = sanitizeReportFileName(fileName)
  const base = reportApiBase()
  const token = authToken()
  try {
    const res = await fetch(`${base}/api/reports/pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ html, fileName: name }),
    })
    const ct = String(res.headers.get('content-type') || '')
    if (res.ok && ct.includes('pdf')) return await res.blob()
    if (!res.ok) console.warn('[renderReportPdfBlob] server status', res.status)
  } catch (e) {
    console.warn('[renderReportPdfBlob] server', e)
  }

  // Same Chromium printToPDF Electron already uses for preview — keeps Print and PDF identical
  try {
    const api = (typeof window !== 'undefined') ? window.pdfPreview : null
    if (api && typeof api.downloadHtml === 'function') {
      const r = await api.downloadHtml(html, name)
      if (r && r.ok && r.base64) return base64ToPdfBlob(r.base64)
    }
  } catch (e) {
    console.warn('[renderReportPdfBlob] electron', e)
  }

  // Browser fallback when cloud server has no Chrome/Puppeteer
  try {
    return await renderPdfWithHtml2Pdf(html)
  } catch (e) {
    console.warn('[renderReportPdfBlob] html2pdf', e)
  }

  throw new Error('Could not render the A4 report PDF')
}

/**
 * Open the system print dialog (Chrome/Edge print preview) from a hidden iframe.
 * Does not open a new browser tab.
 */
function printHtmlViaIframe(html) {
  return new Promise((resolve, reject) => {
    try {
      const prev = document.getElementById('rms-report-print-iframe')
      try { prev?.remove() } catch {}

      const iframe = document.createElement('iframe')
      iframe.id = 'rms-report-print-iframe'
      iframe.setAttribute('title', 'Print')
      iframe.style.cssText = 'position:fixed;inset:0;width:1px;height:1px;opacity:0;border:0;pointer-events:none;z-index:2147483646;'
      document.body.appendChild(iframe)

      const doc = iframe.contentDocument || iframe.contentWindow?.document
      if (!doc) {
        try { iframe.remove() } catch {}
        reject(new Error('Print iframe unavailable'))
        return
      }

      let cleaned = false
      const cleanup = () => {
        if (cleaned) return
        cleaned = true
        try { iframe.contentWindow?.removeEventListener('afterprint', cleanup) } catch {}
        try { window.removeEventListener('focus', onFocusCleanup) } catch {}
        try { iframe.remove() } catch {}
      }
      const onFocusCleanup = () => { setTimeout(cleanup, 400) }

      let payload = String(html || '')
      if (!/<html[\s>]/i.test(payload)) {
        payload = `<!doctype html><html><head><meta charset="utf-8"></head><body>${payload}</body></html>`
      }

      doc.open()
      doc.write(payload)
      doc.close()

      try { iframe.contentWindow?.addEventListener('afterprint', cleanup) } catch {}
      try { window.addEventListener('focus', onFocusCleanup) } catch {}

      setTimeout(() => {
        try {
          iframe.contentWindow?.focus()
          iframe.contentWindow?.print()
          resolve(true)
        } catch (err) {
          cleanup()
          reject(err)
        }
        setTimeout(cleanup, 120000)
      }, 250)
    } catch (e) {
      reject(e)
    }
  })
}

/**
 * Print = system print preview (no new tab).
 * Electron prefers the native print-html path when available.
 */
export async function previewHtmlReport(html, fileName) {
  try {
    const api = (typeof window !== 'undefined') ? window.pdfPreview : null
    if (api && typeof api.printHtml === 'function') {
      const r = await api.printHtml(html, sanitizeReportFileName(fileName))
      if (r && r.ok) return true
    }
  } catch (e) {
    console.warn('[previewHtmlReport] electron', e)
  }

  try {
    await printHtmlViaIframe(html)
    return true
  } catch (e) {
    console.warn('[previewHtmlReport]', e)
    throw e
  }
}

/**
 * Download A4 PDF (server Chromium when available, else browser html2pdf fallback).
 */
export async function downloadHtmlReport(html, fileName) {
  const name = sanitizeReportFileName(fileName)
  const blob = await renderReportPdfBlob(html, fileName)
  triggerBrowserPdfDownload(blob, name)
  return true
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
  tr,.band,.meta,.title,.sect{break-inside:avoid;page-break-inside:avoid}
  thead{display:table-header-group}
  tfoot{display:table-footer-group}
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

/** Build the letterhead doc and download it as a PDF (same layout as print). */
export async function downloadReportDoc(opts = {}) {
  const html = wrapReportDoc(opts)
  const safe = String(opts.fileName || `${String(opts.title || 'report').replace(/\s+/g, '-')}.pdf`)
  await downloadHtmlReport(html, safe)
}
