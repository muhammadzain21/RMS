import { getAPIBase } from './shared.js'

export async function tryEscPosPrint(text, { deviceName = '', host = '', type = 'kot' } = {}) {
  if (!text) return false
  // Electron path only (do NOT also hit server — that doubled a 2.5s timeout when IP was wrong)
  try {
    if (window?.printing?.printEscPos) {
      const out = await window.printing.printEscPos(text, { deviceName, host, port: 9100 })
      if (out?.ok) return true
      if (out?.error) console.warn('[tryEscPosPrint] Electron:', out.error)
      // Spooler RAW already attempted inside Electron when TCP fails — stop here
      return false
    }
  } catch (e) {
    console.warn('[tryEscPosPrint] Electron:', e)
  }
  // Browser only: one server ESC/POS call (reads kotPrinterIp from settings if host empty)
  try {
    const api = getAPIBase()
    const token = (
      (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('auth_token')) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('auth_token')) ||
      ''
    )
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timer = controller ? setTimeout(() => controller.abort(), 1200) : null
    const res = await fetch(`${api}/api/print/escpos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ text, type, host, printerName: deviceName, port: 9100 }),
      signal: controller?.signal,
    })
    if (timer) clearTimeout(timer)
    const result = await res.json().catch(() => ({}))
    if (res.ok && result?.ok) return true
    if (result?.error) console.warn('[tryEscPosPrint] Server:', result.error)
  } catch (e) {
    console.warn('[tryEscPosPrint] Server:', e)
  }
  return false
}
