import { toast } from 'react-hot-toast'
import { printThermalInPage, trySilentPrint } from './shared.js'
import { tryEscPosPrint } from './escposClient.js'

/**
 * Shared in-app slip preview — height fits content (no huge empty white area),
 * padded so receipt is not flush to the left edge.
 */
export function openSlipPreviewDialog({
  html,
  escPosText = '',
  printType = 'bill',
  deviceName = '',
  host = '',
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
    const isKotFamily = printType === 'kot' || printType === 'void'
    // KOT/Void: close preview immediately and fire ESC/POS only (never wait on HTML/PDF)
    if (isKotFamily && escPosText) {
      cleanup()
      tryEscPosPrint(escPosText, { deviceName, host, type: printType }).then((ok) => {
        if (ok) return
        const tip = host ? ` at ${host}` : ''
        console.warn(`[print] KOT silent print failed${tip}. Check KOT Printer IP (e.g. 192.168.18.142:9100).`)
        toast.error(`Printer unreachable${tip}. Fix KOT Printer IP in Settings (try 192.168.18.142).`)
      }).catch(() => {})
      return
    }
    btnPrint.disabled = true
    btnPrint.textContent = 'Printing…'
    const finish = () => cleanup()
    const run = async () => {
      if (deviceName && await trySilentPrint(html, printType, deviceName)) return true
      doPrint()
      return false
    }
    run().catch(() => doPrint()).finally(finish)
  }
  btnClose.onclick = cleanup
  if (auto) setTimeout(() => btnPrint.click(), 80)
}
