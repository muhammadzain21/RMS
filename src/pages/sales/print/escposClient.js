import { getAPIBase } from './shared.js'

function looksLikeIpv4(s) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(String(s || '').trim())
}

/**
 * Network thermal print (TCP 9100). Only runs when an explicit LAN IP is set.
 * Named Windows printers must use HTML silent print — RAW ESC/POS to a GDI driver
 * produces a tiny blank slip in Electron.
 */
export async function tryEscPosPrint(text, { deviceName = '', host = '', type = 'kot' } = {}) {
  if (!text) return false
  const ip = String(host || '').trim()
  if (!looksLikeIpv4(ip)) return false

  // Electron path only (do NOT also hit server — that doubled timeouts when IP was wrong)
  try {
    if (window?.printing?.printEscPos) {
      const out = await window.printing.printEscPos(text, { deviceName, host: ip, port: 9100 })
      if (out?.ok) return true
      if (out?.error) console.warn('[tryEscPosPrint] Electron:', out.error)
      return false
    }
  } catch (e) {
    console.warn('[tryEscPosPrint] Electron:', e)
  }

  // Browser only: server ESC/POS to the configured IP
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
      body: JSON.stringify({ text, type, host: ip, printerName: deviceName, port: 9100 }),
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
