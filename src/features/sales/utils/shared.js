export const getAPIBase = () => {
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

export function fmt(n){ return Number(n||0).toLocaleString(undefined,{minimumFractionDigits:0, maximumFractionDigits:2}) }
export function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

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

async function resolveInstalledPrinterName(requested) {
  const want = String(requested || '').trim()
  if (!want || !window?.printing?.listPrinters) return want
  try {
    const list = await window.printing.listPrinters()
    const rows = Array.isArray(list) ? list : []
    const key = want.toLowerCase()
    const hit = rows.find((p) => {
      const n = String(p.name || '').trim()
      const d = String(p.displayName || p.deviceName || '').trim()
      return n === want || d === want || n.toLowerCase() === key || d.toLowerCase() === key
    }) || rows.find((p) => {
      const n = String(p.name || '').trim().toLowerCase()
      const d = String(p.displayName || p.deviceName || '').trim().toLowerCase()
      return (n && (n.includes(key) || key.includes(n))) || (d && (d.includes(key) || key.includes(d)))
    })
    if (hit) return String(hit.name || hit.displayName || hit.deviceName || want).trim()
  } catch {}
  return want
}

// Silent print chain: Electron native silent print first (same Chromium engine as
// manual printing). Server Puppeteer fallback is browser/dev only — it is slow
// (~2–3s cold launch) and must not run inside Electron after a local miss.
export async function trySilentPrint(html, type, deviceName) {
  const hasElectronPrint = !!(window && window.printing && window.printing.printHTML)
  const name = await resolveInstalledPrinterName(deviceName)
  try {
    if (hasElectronPrint) {
      const out = await window.printing.printHTML(html, name, { silent: true })
      if (out && out.ok) {
        nudgeAppShellLayout()
        return true
      }
      if (out && out.error) console.warn('[trySilentPrint] Electron silent failed:', out.error, '| device:', name)
      // Stay local — do not hit /api/print (Puppeteer) from Electron
      return false
    }
  } catch (e) {
    console.warn('[trySilentPrint] Electron print error:', e)
    if (hasElectronPrint) return false
  }
  if (await tryServerPrint(html, type, name)) return true
  return false
}

/** Electron: open system print dialog from an isolated window (reliable fallback). */
export async function tryElectronPrintDialog(html, deviceName = '') {
  try {
    if (!window?.printing) return false
    const name = deviceName ? await resolveInstalledPrinterName(deviceName) : ''
    if (typeof window.printing.printHTMLDialog === 'function' && !name) {
      const out = await window.printing.printHTMLDialog(html)
      nudgeAppShellLayout()
      return !!(out && out.ok)
    }
    if (typeof window.printing.printHTML === 'function') {
      const out = await window.printing.printHTML(html, name || '', { silent: false })
      nudgeAppShellLayout()
      return !!(out && out.ok)
    }
  } catch (e) {
    console.warn('[tryElectronPrintDialog]', e)
  }
  return false
}
