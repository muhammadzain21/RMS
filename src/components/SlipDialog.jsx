import { useEffect, useRef } from 'react'

export default function SlipDialog({ html, title = 'Print Slip', onClose, autoPrint = false }) {
  const overlayRef = useRef(null)
  const iframeRef = useRef(null)

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const doc = iframe.contentDocument || iframe.contentWindow?.document
    if (doc) {
      const isDark = document.documentElement.classList.contains('dark')
      const darkStyle = isDark ? `<style id="dark-override">
        body{background:#111827 !important;color:#e5e7eb !important}
        *{color:#e5e7eb !important}
        table,td,th{border-color:#374151 !important}
        th{background:#1f2937 !important}
        .line{border-top-color:#4b5563 !important}
        .bold{color:#e5e7eb !important}
      </style>` : ''
      doc.open()
      doc.write(html.replace('</head>', `${darkStyle}</head>`))
      doc.close()
    }
    if (autoPrint) {
      const t = setTimeout(() => {
        try { iframe.contentWindow?.focus(); iframe.contentWindow?.print() } catch {}
      }, 300)
      return () => clearTimeout(t)
    }
  }, [html, autoPrint])

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const doPrint = () => {
    try {
      iframeRef.current?.contentWindow?.focus()
      iframeRef.current?.contentWindow?.print()
    } catch {}
    onClose()
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 bg-black/55 z-[9999] flex items-center justify-center p-3"
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="bg-white dark:bg-gray-900 w-[420px] max-w-[95vw] h-[640px] max-h-[95vh] rounded-lg shadow-2xl flex flex-col overflow-hidden">
        <div className="flex gap-2 justify-end p-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <button
            onClick={doPrint}
            className="px-4 py-2 rounded-md bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold text-sm shadow hover:shadow-md transition-shadow"
          >
            Print
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-medium text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
        <iframe
          ref={iframeRef}
          title={title}
          className="border-0 flex-1 w-full"
        />
      </div>
    </div>
  )
}
