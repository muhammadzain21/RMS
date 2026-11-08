// Printing utilities
const isDarkMode = () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
const getAPIBase = () => {
  try {
    if (typeof window !== 'undefined' && window.API_BASE) return window.API_BASE
  } catch {}
  try {
    // Vite provides import.meta.env
    if (import.meta && import.meta.env && import.meta.env.VITE_API_BASE) {
      return import.meta.env.VITE_API_BASE
    }
  } catch {}
  return 'http://localhost:5000'
}

/**
 * Thermal roll + professional typography (preview & print share the same CSS).
 * Hierarchy: muted labels, medium body, semibold totals — not all-black heavy text.
 */
export const THERMAL_SLIP_CSS = `
  @page { size: 80mm auto; margin: 0; }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: 72mm;
    max-width: 72mm;
    height: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
    box-sizing: border-box;
    background: #fff !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  *, *::before, *::after { box-sizing: border-box; }
  img { max-width: 100% !important; height: auto !important; }
  .toolbar, .no-print { display: none !important; }
  @media print {
    html, body {
      width: 72mm !important;
      max-width: 72mm !important;
      height: auto !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 2mm 5mm 2mm 2mm !important;
      overflow: visible !important;
    }
    .toolbar, .no-print { display: none !important; }
  }
  @media screen {
    html, body {
      width: 100%;
      max-width: 100%;
      margin: 0 auto;
      padding: 4px 14px 8px 6px;
    }
  }
`

/** Shared visual language for bill + KOT slips (dialog preview === printed output). */
export const PROFESSIONAL_SLIP_CSS = `
  /* Arial prints clearest on thermal; everything bold */
  html, body, body * {
    font-family: Arial, Helvetica, sans-serif !important;
    font-weight: 700 !important;
    -webkit-font-smoothing: antialiased;
  }
  body {
    font-size: 12px;
    line-height: 1.45;
    color: #111827;
    letter-spacing: 0.015em;
    padding-right: 4mm !important;
  }
  b, strong { font-weight: 700 !important; }
  .center { text-align: center; }
  .brand { text-align: center; margin-bottom: 8px; padding-right: 2mm; }
  .brand img {
    display: block;
    margin: 0 auto 6px;
    max-height: 52px;
    max-width: 82%;
    object-fit: contain;
  }
  .brand-name {
    margin: 0 0 4px;
    font-size: 16px !important;
    font-weight: 700 !important;
    color: #111827;
    line-height: 1.2;
  }
  .brand-meta {
    margin: 2px 0;
    font-size: 11px !important;
    font-weight: 700 !important;
    color: #111827;
  }
  .chip {
    display: block;
    margin: 6px 2mm 0 0;
    padding: 6px 8px;
    border: 1px solid #94a3b8;
    border-radius: 6px;
    text-align: center;
    font-size: 12px !important;
    font-weight: 700 !important;
    color: #111827;
    background: #f8fafc;
  }
  .chip-token {
    border-color: #60a5fa;
    background: #eff6ff;
    color: #0f172a;
    font-size: 14px !important;
    font-weight: 900 !important;
  }
  .chip-token .token-num {
    font-size: 20px !important;
    font-weight: 900 !important;
    letter-spacing: 0.04em;
  }
  .block { margin: 8px 4mm 8px 0; }
  .muted { color: #111827; font-size: 11px !important; font-weight: 700 !important; }
  .emph { font-weight: 700 !important; color: #111827; }
  .kvtable {
    width: calc(100% - 4mm);
    border-collapse: collapse;
    table-layout: auto;
    margin: 0 4mm 0 0;
  }
  .kvtable td {
    padding: 4px 0;
    border: 0;
    border-bottom: 1px solid #e5e7eb;
    font-size: 12px !important;
    font-weight: 700 !important;
    color: #111827;
    vertical-align: top;
    word-break: break-word;
  }
  .kvtable td.val {
    text-align: right;
    color: #111827;
    font-weight: 700 !important;
    padding-left: 8px;
    white-space: normal;
  }
  table.items {
    width: calc(100% - 4mm);
    border-collapse: collapse;
    margin-top: 6px;
    margin-right: 4mm;
    table-layout: fixed;
  }
  table.items th, table.items td { padding: 5px 2px; vertical-align: top; }
  table.items th {
    font-size: 11px !important;
    font-weight: 700 !important;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: #111827;
    border-bottom: 1px solid #cbd5e1;
    background: transparent;
  }
  table.items td {
    font-size: 12px !important;
    font-weight: 700 !important;
    color: #111827;
    border-bottom: 1px solid #e5e7eb;
    word-break: break-word;
  }
  .desc { width: 46%; text-align: left; }
  th.desc { text-align: left; }
  .qty { width: 14%; text-align: right; }
  .rate { width: 20%; text-align: right; }
  .amount { width: 20%; text-align: right; font-variant-numeric: tabular-nums; }
  .kv {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
    margin: 3px 4mm 3px 0;
    font-size: 12px !important;
    font-weight: 700 !important;
    color: #111827;
  }
  .kv span:first-child { flex: 1 1 auto; min-width: 0; font-weight: 700 !important; }
  .kv span:last-child {
    flex: 0 0 auto;
    color: #111827;
    font-weight: 700 !important;
    font-variant-numeric: tabular-nums;
    text-align: right;
    max-width: 48%;
    word-break: break-word;
  }
  .hr {
    border: 0;
    border-top: 1px dashed #94a3b8;
    margin: 8px 4mm 8px 0;
  }
  .totals { margin-top: 2px; margin-right: 4mm; }
  .total {
    font-size: 13px !important;
    font-weight: 700 !important;
    color: #111827 !important;
    margin-top: 4px;
    padding-top: 4px;
    border-top: 1px solid #cbd5e1;
  }
  .total span { color: #111827 !important; font-weight: 700 !important; }
  .footer {
    margin: 10px 2mm 0 0;
    padding-top: 6px;
    border-top: 1px dashed #94a3b8;
    text-align: center;
    font-size: 11px !important;
    font-weight: 700 !important;
    color: #111827;
    white-space: pre-wrap;
    line-height: 1.35;
  }
  .endline {
    border-top: 1px dashed #94a3b8;
    margin: 10px 2mm 6px 0;
    text-align: center;
    font-size: 11px !important;
    font-weight: 700 !important;
    letter-spacing: 0.04em;
    color: #111827;
    padding-top: 6px;
  }
  .kitchen-note {
    text-align: center;
    font-size: 12px !important;
    font-weight: 700 !important;
    color: #b91c1c;
    margin: 6px 2mm 0 0;
    padding: 6px 8px;
    border: 1px dashed #fca5a5;
    border-radius: 6px;
    background: #fff7f7;
  }
  .toolbar { display: none !important; }
`

function nudgeAppShellLayout() {
  try {
    window.dispatchEvent(new Event('resize'))
  } catch {}
  try {
    // Clear any leftover print-only inline styles Chromium may leave behind
    document.documentElement.style.height = ''
    document.documentElement.style.minHeight = ''
    document.body.style.height = ''
    document.body.style.minHeight = ''
    document.body.style.overflow = ''
  } catch {}
}

/**
 * Interactive print (shows printer picker) without calling window.print() on the POS shell.
 * Uses an isolated iframe so Electron layout stays intact; Electron dialog IPC is a backup.
 */
export function printThermalInPage(html) {
  const raw = String(html || '')
  try {
    // Isolated iframe.print() reliably opens the system printer dialog in Electron + browser.
    // (Hidden BrowserWindow print dialogs are often swallowed on Windows.)
    printViaIsolatedIframe(raw)
  } catch (e) {
    console.warn('[printThermalInPage] iframe print failed, trying Electron dialog:', e)
    try {
      if (typeof window !== 'undefined' && window.printing) {
        const run = window.printing.printHTMLDialog
          || ((h) => window.printing.printHTML(h, '', { silent: false }))
        Promise.resolve(run(raw))
          .then((r) => {
            if (r && r.ok === false) console.warn('[printThermalInPage] Electron dialog:', r.error)
            nudgeAppShellLayout()
          })
          .catch(() => nudgeAppShellLayout())
        return
      }
    } catch {}
  }
}

function printViaIsolatedIframe(html) {
  try {
    const prev = document.getElementById('rms-print-iframe')
    try { prev?.remove() } catch {}

    const iframe = document.createElement('iframe')
    iframe.id = 'rms-print-iframe'
    iframe.setAttribute('title', 'Print')
    // Keep iframe in the viewport (opacity 0) — off-screen iframes often block print dialogs in Electron
    iframe.style.cssText = 'position:fixed;inset:0;width:1px;height:1px;opacity:0;border:0;pointer-events:none;z-index:2147483646;'
    document.body.appendChild(iframe)

    const doc = iframe.contentDocument || iframe.contentWindow?.document
    if (!doc) { try { iframe.remove() } catch {}; return }

    let payload = String(html || '')
    // Ensure thermal page sizing when a full document is provided
    if (!/<html[\s>]/i.test(payload)) {
      payload = `<!doctype html><html><head><meta charset="utf-8"><style>
        @page{size:80mm auto;margin:0}
        html,body{margin:0;padding:0;background:#fff}
        body{width:72mm;max-width:72mm;padding:3mm 5mm 3mm 2.5mm;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;font-weight:700;color:#111}
      </style></head><body>${payload}</body></html>`
    } else if (!/@page/i.test(payload)) {
      payload = payload.replace(
        /<\/head>/i,
        '<style>@page{size:80mm auto;margin:0}</style></head>'
      )
    }

    doc.open()
    doc.write(payload)
    doc.close()

    let cleaned = false
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      try { iframe.contentWindow?.removeEventListener('afterprint', cleanup) } catch {}
      try { window.removeEventListener('focus', onFocusCleanup) } catch {}
      try { iframe.remove() } catch {}
      nudgeAppShellLayout()
    }
    const onFocusCleanup = () => { setTimeout(cleanup, 400) }

    try { iframe.contentWindow?.addEventListener('afterprint', cleanup) } catch {}
    try { window.addEventListener('focus', onFocusCleanup) } catch {}
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
      } catch (err) {
        console.warn('[printViaIsolatedIframe] print() error:', err)
        cleanup()
      }
      // Safety net if afterprint never fires
      setTimeout(cleanup, 120000)
    }, 250)
  } catch (e) {
    console.warn('[printViaIsolatedIframe] failed:', e)
  }
}
async function tryServerPrint(html, type = 'bill', printerName = '') {
  try {
    const api = getAPIBase()
    const token = (
      (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('auth_token')) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('auth_token')) ||
      ''
    )
    // Skip server print if no printer configured (avoids 400 error)
    if (!printerName) {
      console.log(`[tryServerPrint] Skipped: no printer configured for ${type}`)
      return false
    }
    console.log(`[tryServerPrint] Sending ${type} print to server...`)
    const res = await fetch(`${api}/api/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ html, type, printerName })
    })
    const result = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error(`[tryServerPrint] Server error ${res.status}:`, result.error || result)
    } else {
      console.log(`[tryServerPrint] Success:`, result)
    }
    return res.ok
  } catch (e) {
    console.error('[tryServerPrint] Failed:', e)
    return false
  }
}

// Silent print chain: Electron native silent print first (same Chromium engine as
// manual printing, so thermal drivers render identically), then server-side
// pdf-to-printer (SumatraPDF) as fallback for browser/dev mode.
// Returns true when the job was accepted by the printer.
async function trySilentPrint(html, type, deviceName) {
  try {
    if (window && window.printing && window.printing.printHTML) {
      const out = await window.printing.printHTML(html, deviceName, { silent: true })
      if (out && out.ok) {
        nudgeAppShellLayout()
        return true
      }
      if (out && out.error) console.warn('[trySilentPrint] Electron print failed:', out.error)
    }
  } catch (e) {
    console.warn('[trySilentPrint] Electron print error:', e)
  }
  if (await tryServerPrint(html, type, deviceName)) return true
  return false
}

/**
 * Shared in-app slip preview — height fits content (no huge empty white area),
 * padded so receipt is not flush to the left edge.
 */
export function openSlipPreviewDialog({
  html,
  printType = 'bill',
  deviceName = '',
  auto = false,
  title = 'Slip preview',
  printBtnClass = 'slip-print-btn',
  closeBtnClass = 'slip-close-btn',
} = {}) {
  const overlay = document.createElement('div')
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.5);backdrop-filter:blur(2px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;'
  const frameWrap = document.createElement('div')
  frameWrap.style.cssText = 'background:#fff;width:min(380px,96vw);max-height:92vh;border-radius:16px;box-shadow:0 25px 60px rgba(15,23,42,0.22);display:flex;flex-direction:column;overflow:hidden;border:1px solid #e2e8f0;'

  const toolbar = document.createElement('div')
  toolbar.style.cssText = 'display:flex;gap:8px;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid #eef2f7;background:#fff;flex-shrink:0;'
  const titleEl = document.createElement('div')
  titleEl.textContent = title
  titleEl.style.cssText = 'font-size:13px;font-weight:700;color:#0f172a;letter-spacing:-0.01em;font-family:system-ui,Segoe UI,sans-serif;'
  const actions = document.createElement('div')
  actions.style.cssText = 'display:flex;gap:8px;align-items:center;'
  const btnPrint = document.createElement('button')
  btnPrint.textContent = 'Print'
  btnPrint.className = printBtnClass
  btnPrint.style.cssText = 'padding:8px 14px;border:0;background:#2563eb;color:#fff;cursor:pointer;border-radius:10px;font-weight:600;font-size:12px;box-shadow:0 6px 14px rgba(37,99,235,0.28)'
  const btnClose = document.createElement('button')
  btnClose.textContent = 'OK'
  btnClose.className = closeBtnClass
  btnClose.style.cssText = 'padding:8px 14px;border:1px solid #e2e8f0;background:#fff;color:#475569;cursor:pointer;border-radius:10px;font-weight:600;font-size:12px;'

  // Flat white — slip content sits on the dialog surface
  const scroll = document.createElement('div')
  scroll.style.cssText = 'flex:1 1 auto;overflow:auto;padding:10px 20px 18px 12px;background:#fff;'

  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'border:0;display:block;width:100%;height:120px;background:#fff;'
  iframe.setAttribute('scrolling', 'no')
  iframe.title = title

  actions.appendChild(btnPrint)
  actions.appendChild(btnClose)
  toolbar.appendChild(titleEl)
  toolbar.appendChild(actions)
  scroll.appendChild(iframe)
  frameWrap.appendChild(toolbar)
  frameWrap.appendChild(scroll)
  overlay.appendChild(frameWrap)
  document.body.appendChild(overlay)

  const cleanup = () => { try { document.body.removeChild(overlay) } catch {} }
  overlay.tabIndex = -1
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') cleanup() })
  overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup() })
  try { overlay.focus() } catch {}

  const fitIframe = () => {
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document
      if (!doc) return
      const h = Math.max(
        doc.documentElement?.scrollHeight || 0,
        doc.body?.scrollHeight || 0,
        80
      )
      iframe.style.height = `${h + 4}px`
    } catch {}
  }

  const doc = iframe.contentDocument || iframe.contentWindow?.document
  if (doc) {
    doc.open()
    doc.write(html)
    doc.close()
  }
  // Resize after layout + images
  setTimeout(fitIframe, 50)
  setTimeout(fitIframe, 250)
  setTimeout(fitIframe, 600)
  try {
    iframe.addEventListener('load', fitIframe)
  } catch {}

  const doPrint = () => { printThermalInPage(html) }
  btnPrint.onclick = () => {
    if (deviceName) {
      trySilentPrint(html, printType, deviceName)
        .then(ok => { if (!ok) doPrint() })
        .catch(() => doPrint())
        .finally(cleanup)
      return
    }
    doPrint()
    cleanup()
  }
  btnClose.onclick = cleanup
  if (auto) setTimeout(() => btnPrint.click(), 80)
}

export async function openKotPrintUtil(opts = {}) {
  try {
    const state = opts.state || {}
    const html = buildKOTHtml({ ...opts, state })
    const auto = opts.autoPrint !== false
    const deviceName = opts.deviceName || state?.settings?.kotPrinterName || ''

    if (auto && deviceName) {
      if (await trySilentPrint(html, 'kot', deviceName)) return
    }

    if (opts.previewInApp !== false) {
      openSlipPreviewDialog({
        html,
        printType: 'kot',
        deviceName,
        auto,
        title: 'KOT preview',
        printBtnClass: 'kot-print-btn',
        closeBtnClass: 'kot-close-btn',
      })
      return
    }

    printThermalInPage(html)
  } catch {}
}
export function printReceiptUtil(_opts = {}) {}
export function printKOTUtil(opts = {}) { return openKotPrintUtil(opts) }
export function printCustomerBillUtil(opts = {}) { return printSaleReceiptUtil(opts) }
export function printUnpaidCustomerBillUtil(_opts = {}) {}
export function printRiderSlipUtil(_opts = {}) {}

// Core: Sale receipt printer (used on payment and reprint)
export async function printSaleReceiptUtil(opts = {}) {
  try {
    const state = opts.state || {}
    const menu = Array.isArray(state.menu) ? state.menu : []
    const items = Array.isArray(opts.items) ? opts.items : []
    const company = state?.settings?.companyName || 'Restaurant POS'
    // Logo source preference: prefer settings-provided logo first, then any explicit override.
    // This avoids trying a non-existent public file first (which would 404 in packaged Electron).
    const logoCandidates = [
      state?.settings?.receiptLogo,
      state?.settings?.logo,
      state?.settings?.logoUrl,
      opts.logoUrl,
    ]
    .filter(Boolean)
    // Drop known missing fallback used in some flows
    .filter(u => !/receipt-logo\.png\.jpg$/i.test(String(u||'')))
    const logoUrl = logoCandidates[0] || ''
    const phone = state?.settings?.phone || ''
    const titleText = (opts.title || 'Sale Receipt')
    const address = state?.settings?.address || ''
    // Use provided createdAt for reprint, otherwise current time for new sale
    const saleDate = opts.createdAt ? new Date(opts.createdAt) : new Date()
    const dateStr = saleDate.toLocaleDateString()
    const timeStr = saleDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    // Track if this is a reprint (has original timestamp)
    const isReprint = !!opts.createdAt

    const getMenuItem = (id) => menu.find(m => m.id === id)
    const getRate = (m, it) => {
      if (typeof it?.price === 'number') return Number(it.price || 0)
      if (!m && it?.custom) return Number(it.custom.price || 0)
      if (!m) return 0
      return Number(m.price || 0)
    }
    const getSizeCode = (it) => String(it?.mods?.size || it?.size || '').trim().toUpperCase()
    const getName = (m, it) => it?.custom?.name || m?.name || it?.name || it?.itemName || 'Item'
    const buildDisplayName = (it) => {
      const m = getMenuItem(it.itemId)
      const size = getSizeCode(it)
      const ids = Array.isArray(it?.mods?.flavours) ? it.mods.flavours : []
      if (ids.length) {
        const names = ids.map(id => (getMenuItem(id)?.name || '')).filter(Boolean)
        const title = names.join(' + ') || getName(m, it)
        return size ? `${title} (${size})` : title
      }
      const base = getName(m, it)
      return size ? `${base} (${size})` : base
    }
    const qty = (it) => Number(it?.qty || 0)
    const getFlavourNote = (it) => {
      try {
        const ids = Array.isArray(it?.mods?.flavours) ? it.mods.flavours : []
        if (!ids.length) return ''
        const names = ids
          .map(id => (getMenuItem(id)?.name || ''))
          .filter(Boolean)
          .map(n => escapeHtml(n))
        return names.length ? `<div class="muted">Flavour: ${names.join(', ')}</div>` : ''
      } catch { return '' }
    }

    // Totals
    const lineAmount = (m, it) => getRate(m, it) * qty(it)
    const subtotal = items.reduce((s, it) => s + lineAmount(getMenuItem(it.itemId), it), 0)
    const itemsDiscount = Number(opts.itemsDiscount || 0)
    const billDiscount = Number(opts.billDiscount || 0)
    const taxAmt = Number(opts.taxAmt || 0)
    const serviceAmt = Number(opts.serviceAmt || 0)
    const deliveryAmt = Number(opts.deliveryAmt || 0)
    const total = Math.max(0, subtotal - itemsDiscount - billDiscount + taxAmt + serviceAmt + deliveryAmt)
    const cashPaid = Number(opts.cashReceived ?? total)
    const tipAmt = Math.max(0, Number(opts.tipAmount || 0))
    const balance = tipAmt > 0 ? 0 : Math.max(0, cashPaid - total)

    const orderType = opts.orderType || 'Take-away'
    const BANK_CHANNELS = { bank_account: 'Bank Account', jazzcash: 'JazzCash', easypaisa: 'EasyPaisa', sadapay: 'SadaPay', nayapay: 'NayaPay', raast: 'Raast', upaisa: 'UPaisa', zindigi: 'Zindigi' }
    const pmRaw = (opts.paymentMethod || 'Cash').toString()
    const pmLower = pmRaw.toLowerCase()
    const paymentType = pmLower === 'bank'
      ? `Bank (${BANK_CHANNELS[opts.bankChannel] || opts.bankChannel || 'Transfer'}${opts.bankLast4 ? ` ····${opts.bankLast4}` : ''})`
      : pmLower === 'card'
        ? `Card${opts.bankLast4 ? ` ····${opts.bankLast4}` : ''}`
      : pmLower === 'staff'
        ? `Staff (${opts.staffName || 'Member'})`
        : pmRaw.charAt(0).toUpperCase() + pmRaw.slice(1)
    const waiter = opts.waiter || (opts.waiterId ? (state.staff||[]).find(s=>s.id===opts.waiterId)?.name : '') || '-'
    const rider = opts.rider || (opts.riderId ? (state.riders||[]).find(r=>r.id===opts.riderId)?.name : '') || ''
    const tableNo = opts.tableNo || ''
    const floor = opts.floor || opts.tableFloor || ''
    const tokenNo = opts.tokenNo || opts.token || ''
    const billNo = opts.billNoOverride || opts.billNo || ''
    const orderNo = opts.receiptOrderNo || opts.orderNo || ''
    const customer = opts.customer || { name: '', address: '', phone: '' }

    const rowsHtml = items.map((it) => {
      const m = getMenuItem(it.itemId)
      const name = buildDisplayName(it)
      const rate = getRate(m, it)
      const amount = lineAmount(m, it)
      return `<tr>
        <td class="desc">${escapeHtml(name)}</td>
        <td class="qty">${qty(it)}</td>
        <td class="rate">${fmt(rate)}</td>
        <td class="amount">${fmt(amount)}</td>
      </tr>`
    }).join('')

    // Prefer silent printing when a Bill/Customer Bill printer is configured
    const deviceName = opts.deviceName || state?.settings?.billPrinterName || ''
    const auto = opts.autoPrint !== false
    const toAbsolute = (u)=>{
      try {
        if (!u) return ''
        if (/^(data:|https?:|file:)/i.test(u)) return u
        const isFileProto = String(window.location.protocol).startsWith('file')
        // Under file://, leading slash points to filesystem root and will fail; make it relative
        if (u.startsWith('/')) {
          if (isFileProto) {
            return new URL('.' + u, window.location.href).href
          }
          return window.location.origin + u
        }
        return new URL(u, window.location.href).href
      } catch { return u }
    }
    const logoAbs = toAbsolute(logoUrl)
    const logoAbsList = logoCandidates.map(toAbsolute)
    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Sale Receipt</title>
  <base href="${escapeHtml(window.location.href)}" />
  <style>
    ${THERMAL_SLIP_CSS}
    ${PROFESSIONAL_SLIP_CSS}
  </style>
</head>
<body>
  <div class="brand">
    <img id="receiptLogo" alt="logo" src="${escapeHtml(logoAbs)}" onerror="this.style.display='none'" />
    ${company ? `<div class="brand-name">${escapeHtml(company)}</div>` : ''}
    ${phone ? `<div class="brand-meta">Contact : ${escapeHtml(phone)}</div>` : ''}
    ${address ? `<div class="brand-meta">${escapeHtml(address)}</div>` : ''}
  </div>

  <div class="chip">${escapeHtml(titleText)}</div>
  ${tokenNo ? `<div class="chip chip-token">Token No: <span class="token-num">${escapeHtml(String(tokenNo))}</span></div>` : ''}

  <div class="block">
    <table class="kvtable"><tbody>
      ${billNo ? `<tr><td>Bill No</td><td class="val">${escapeHtml(String(billNo))}</td></tr>` : ''}
      <tr><td>Date &amp; Time</td><td class="val">${dateStr} ${timeStr}</td></tr>
      ${isReprint ? `<tr><td>Reprint</td><td class="val">REPRINT</td></tr>` : ''}
      <tr><td>Payment Type</td><td class="val">${escapeHtml(paymentType)}</td></tr>
      ${opts.deliveryDate ? `<tr><td>Delivery Date</td><td class="val">${escapeHtml(String(opts.deliveryDate))}</td></tr>` : ''}
      ${customer?.name ? `<tr><td>Name</td><td class="val">${escapeHtml(customer.name)}</td></tr>` : ''}
      ${customer?.address ? `<tr><td>Address</td><td class="val">${escapeHtml(customer.address)}</td></tr>` : ''}
      ${customer?.phone ? `<tr><td>Phone</td><td class="val">${escapeHtml(customer.phone)}</td></tr>` : ''}
      ${opts.userName ? `<tr><td>User</td><td class="val">${escapeHtml(String(opts.userName))}</td></tr>` : ''}
      ${orderType ? `<tr><td>Channel</td><td class="val">${escapeHtml(orderType)}</td></tr>` : ''}
      ${tableNo ? `<tr><td>Table</td><td class="val">${escapeHtml(String(tableNo))}${floor ? ` / ${escapeHtml(floor)}` : ''}</td></tr>` : ''}
      ${rider ? `<tr><td>Rider</td><td class="val">${escapeHtml(rider)}</td></tr>` : ''}
    </tbody></table>
  </div>

  <table class="items">
    <colgroup>
      <col style="width:46%" />
      <col style="width:14%" />
      <col style="width:20%" />
      <col style="width:20%" />
    </colgroup>
    <thead>
      <tr><th class="desc">Item</th><th class="qty">Qty</th><th class="rate">Rate</th><th class="amount">Amt</th></tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="hr"></div>
  <div class="totals">
    <div class="kv"><span>Total amount</span><span>${fmt(subtotal)}</span></div>
    <div class="kv"><span>Discount</span><span>${fmt(itemsDiscount + billDiscount)}</span></div>
    ${serviceAmt ? `<div class="kv"><span>Service charges</span><span>${fmt(serviceAmt)}</span></div>` : ''}
    ${deliveryAmt ? `<div class="kv"><span>Delivery charges</span><span>${fmt(deliveryAmt)}</span></div>` : ''}
    ${taxAmt ? `<div class="kv"><span>Tax</span><span>${fmt(taxAmt)}</span></div>` : ''}
    <div class="kv total"><span>Net total</span><span>${fmt(total)}</span></div>
    <div class="kv"><span>Cash paid</span><span>${fmt(cashPaid)}</span></div>
    ${tipAmt > 0
      ? `<div class="kv"><span>Waiter tip</span><span>${fmt(tipAmt)}</span></div>`
      : `<div class="kv"><span>Cash balance</span><span>${fmt(balance)}</span></div>`}
  </div>

  ${state?.settings?.billingFooter ? `<div class="footer">${escapeHtml(state.settings.billingFooter)}</div>` : ''}

  <script>
    (function(){
      try{
        var list = ${JSON.stringify(logoAbsList)}.filter(Boolean)
        var imgEl = document.getElementById('receiptLogo')
        if(!imgEl || !list.length){ if(imgEl) imgEl.style.display='none'; return }
        var i = 0
        var tryNext = function(){
          if(i>=list.length){ imgEl.style.display='none'; return }
          var src = list[i++]
          var probe = new Image()
          probe.onload = function(){ imgEl.src = src; imgEl.style.display='block' }
          probe.onerror = tryNext
          probe.src = src
        }
        tryNext()
      }catch(e){}
    })();
  </script>
</body>
</html>`

    // If auto print mode and printer configured, try silent/server print first (no dialog)
    if (auto && deviceName) {
      if (await trySilentPrint(html, 'bill', deviceName)) return
    }

    if (opts.previewInApp !== false) {
      openSlipPreviewDialog({
        html,
        printType: 'bill',
        deviceName,
        auto,
        title: 'Sale receipt',
        printBtnClass: 'receipt-print-btn',
        closeBtnClass: 'receipt-close-btn',
      })
      return
    }

    printThermalInPage(html)
  } catch {}
}

export function buildKOTHtml(opts = {}) {
  try {
    const state = opts.state || {}
    const menu = Array.isArray(state.menu) ? state.menu : []
    const items = Array.isArray(opts.items) ? opts.items : []
    // Use provided createdAt for reprint, otherwise current time for new KOT
    const kotDate = opts.createdAt ? new Date(opts.createdAt) : new Date()
    const dateStr = kotDate.toLocaleDateString()
    const timeStr = kotDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const isReprint = opts.isReprint === true
    const title = opts.title || 'Order Receipt'
    const tokenNo = opts.tokenNo || state.currentTokenNo || opts.token || ''
    const orderType = opts.orderType || ''
    const waiter = opts.waiter || (opts.waiterId ? (state.staff||[]).find(s=>s.id===opts.waiterId)?.name : '') || ''
    const tableNo = opts.tableNo || ''
    const rider = opts.rider || (opts.riderId ? (state.riders||[]).find(r=>r.id===opts.riderId)?.name : '') || ''
    const remarks = opts.payRemarks || opts.remarks || ''
    const userName = opts.userName || opts.user || ''

    const getSizeCode = (it) => String(it?.mods?.size || it?.size || '').trim().toUpperCase()
    const getItemName = (it) => {
      const m = menu.find(x=>x.id===it.itemId)
      const size = getSizeCode(it)
      const flvs = Array.isArray(it?.mods?.flavours) ? it.mods.flavours : []
      if (flvs.length) {
        const names = flvs.map(fid => (menu.find(x=>x.id===fid)?.name || '')).filter(Boolean)
        const title = names.join(' + ') || (it?.custom?.name || m?.name || it?.name || String(it.itemId||''))
        return escapeHtml(size ? `${title} (${size})` : title)
      }
      const base = it?.custom?.name || m?.name || it?.name || String(it.itemId||'')
      return escapeHtml(size ? `${base} (${size})` : base)
    }
    const rowsHtml = items.map(it => `<tr><td>${getItemName(it)}</td><td class="qty"><b>${Number(it.qty||0)}</b></td></tr>`).join('')
    const kitchenNote = String(opts.kitchenNote || '').trim()

    // Build table info for Dine-in orders
    let tableDisplay = ''
    if (orderType === 'Dine-in' && tableNo) {
      const floor = opts.floor || opts.tableFloor || ''
      tableDisplay = floor ? `Table ${tableNo} / ${floor}` : `Table ${tableNo}`
    }

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>KOT</title>
  <style>
    ${THERMAL_SLIP_CSS}
    ${PROFESSIONAL_SLIP_CSS}
    table.items .qty { width: 22%; text-align: right; }
    table.items .desc { width: 78%; }
  </style>
  </head>
  <body>
    <div class="chip">${escapeHtml(title)}</div>
    ${tokenNo ? `<div class="chip chip-token">Token No: <span class="token-num">${escapeHtml(String(tokenNo))}</span></div>` : ''}
    <div class="block">
      <table class="kvtable"><tbody>
        <tr><td>Date &amp; Time</td><td class="val">${dateStr} ${timeStr}</td></tr>
        ${isReprint ? `<tr><td>Reprint</td><td class="val">REPRINT</td></tr>` : ''}
        ${orderType ? `<tr><td>Order Type</td><td class="val">${escapeHtml(String(orderType))}</td></tr>` : ''}
        ${userName ? `<tr><td>User</td><td class="val">${escapeHtml(String(userName))}</td></tr>` : ''}
        ${waiter ? `<tr><td>Waiter</td><td class="val">${escapeHtml(String(waiter))}</td></tr>` : ''}
        ${tableDisplay ? `<tr><td>Table</td><td class="val">${escapeHtml(String(tableDisplay).replace(/^Table /, ''))}</td></tr>` : ''}
        ${rider ? `<tr><td>Rider</td><td class="val">${escapeHtml(String(rider))}</td></tr>` : ''}
        ${remarks ? `<tr><td>Remarks</td><td class="val">${escapeHtml(String(remarks))}</td></tr>` : ''}
      </tbody></table>
    </div>

    <table class="items">
      <thead>
        <tr><th class="desc">Item</th><th class="qty">Qty</th></tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <div class="endline">END OF ORDER</div>
    ${kitchenNote ? `<div class="kitchen-note">${escapeHtml(kitchenNote)}</div>` : ''}
  </body>
</html>`
    return html
  } catch {
    return '<html><body><pre>KOT</pre></body></html>'
  }
}

function fmt(n){ return Number(n||0).toLocaleString(undefined,{minimumFractionDigits:0, maximumFractionDigits:2}) }
function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }


// Report preview lives in the shared report-doc utility - re-exported here so
// existing "./printUtils" imports keep working.
export { previewHtmlReport } from '../../utils/reportDoc'
