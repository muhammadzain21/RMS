import { useEffect, useRef, useState } from 'react'
import { printThermalInPage } from '../pages/sales/printUtils.js'

export default function SlipDialog({ html, title = 'Print Slip', onClose, autoPrint = false }) {
  const overlayRef = useRef(null)
  const iframeRef = useRef(null)
  const [iframeH, setIframeH] = useState(160)

  const fitIframe = () => {
    try {
      const doc = iframeRef.current?.contentDocument || iframeRef.current?.contentWindow?.document
      if (!doc) return
      const h = Math.max(doc.documentElement?.scrollHeight || 0, doc.body?.scrollHeight || 0, 80)
      setIframeH(h + 4)
    } catch {}
  }

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const doc = iframe.contentDocument || iframe.contentWindow?.document
    if (doc) {
      doc.open()
      doc.write(html)
      doc.close()
    }
    const t1 = setTimeout(fitIframe, 50)
    const t2 = setTimeout(fitIframe, 250)
    const t3 = setTimeout(fitIframe, 600)
    if (autoPrint) {
      const t = setTimeout(() => { printThermalInPage(html) }, 350)
      return () => {
        clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t)
      }
    }
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [html, autoPrint])

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const doPrint = () => {
    printThermalInPage(html)
    onClose()
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px] print:hidden"
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="flex w-[min(380px,96vw)] max-h-[92vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_25px_60px_rgba(15,23,42,0.22)]">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 bg-white px-3.5 py-3">
          <div className="truncate text-[13px] font-bold tracking-tight text-slate-900">{title}</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={doPrint}
              className="rounded-[10px] bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-[0_6px_14px_rgba(37,99,235,0.28)] hover:bg-blue-500"
            >
              Print
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-[10px] border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              OK
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-white pb-5 pl-3 pr-5 pt-2.5">
          <iframe
            ref={iframeRef}
            title={title}
            onLoad={fitIframe}
            style={{ height: iframeH }}
            className="block w-full border-0 bg-white"
            scrolling="no"
          />
        </div>
      </div>
    </div>
  )
}
