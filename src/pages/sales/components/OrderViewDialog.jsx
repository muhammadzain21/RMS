import React, { useEffect, useMemo, useState } from 'react'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { format } from 'date-fns'
import { openPdfPreview, sanitizeFileName } from '../../../utils/pdfPreview.js'

// Full order detail + lifecycle timeline dialog.
// Fetches GET /api/sales/:id/timeline which merges KOTs, voids,
// recall updates and bill events matched on (date, tokenNo).

const KIND_STYLE = {
  order:   { dot: 'bg-blue-500',    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',    icon: '🧾' },
  kot:     { dot: 'bg-indigo-500',  badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',  icon: '🍳' },
  status:  { dot: 'bg-amber-500',   badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',   icon: '⏱' },
  void:    { dot: 'bg-rose-500',    badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',    icon: '✕' },
  update:  { dot: 'bg-purple-500',  badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',  icon: '✎' },
  sale:    { dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: '💵' },
  deleted: { dot: 'bg-red-600',     badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',     icon: '🗑' },
}

const STATUS_CHIP = {
  ordered:   'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
  new:       'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  preparing: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  ready:     'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
}
const STATUS_LABEL = {
  ordered: 'Ordered', new: 'KOT Sent', preparing: 'Preparing', ready: 'Ready', completed: 'Complete', paid: 'Paid',
}

function fmtTime(v) {
  try {
    const d = new Date(v)
    if (isNaN(d.getTime())) return '-'
    return d.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch { return '-' }
}

export default function OrderViewDialog({ open, sale, API, token, menu = [], onClose }) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')

  const itemName = (it) => {
    if (!it) return 'Item'
    if (it.name) return it.name
    if (it?.custom?.name) return it.custom.name
    const m = (menu || []).find(mm => String(mm.id) === String(it.itemId))
    return m?.name || 'Item'
  }
  const itemsText = (items) =>
    (Array.isArray(items) ? items : []).map(it => `${itemName(it)} x${Number(it.qty || 0)}`).join(', ')

  useEffect(() => {
    if (!open || !sale?.id) return
    const ctrl = new AbortController()
    ;(async () => {
      try {
        setLoading(true)
        setErr('')
        setData(null)
        const res = await fetch(`${API}/api/sales/${sale.id}/timeline`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: ctrl.signal,
          cache: 'no-store',
        })
        if (!res.ok) { setErr('Failed to load order details'); return }
        setData(await res.json())
      } catch (e) {
        if (e?.name !== 'AbortError') setErr('Network error')
      } finally {
        setLoading(false)
      }
    })()
    return () => ctrl.abort()
  }, [open, sale?.id, API, token])

  // Overall order status = least-advanced KOT stage (completed only when
  // every KOT is done — an add-on KOT still 'new' means order in progress)
  const overallStatus = useMemo(() => {
    if (data?.kots?.length) {
      const RANK = { new: 0, preparing: 1, ready: 2, completed: 3 }
      let min = 3
      for (const k of data.kots) min = Math.min(min, RANK[String(k.status || 'new')] ?? 0)
      return ['new', 'preparing', 'ready', 'completed'][min]
    }
    return data ? 'paid' : 'ordered'
  }, [data])

  if (!open) return null
  const s = sale || {}
  const det = data?.sale || s.detail || {}

  // A4 PDF of the full order detail + timeline, opened in the shared preview
  const printPdf = async () => {
    try {
      const doc = new jsPDF('p', 'pt', 'a4')
      const pageW = doc.internal.pageSize.getWidth()
      const margin = 40
      let y = 40

      doc.setFontSize(16)
      doc.text('Order Details', margin, y)
      doc.setFontSize(10)
      y += 16
      doc.text(`Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, margin, y)
      y += 10
      doc.setDrawColor(180)
      doc.line(margin, y, pageW - margin, y)
      y += 18

      // Summary key/value table
      doc.autoTable({
        startY: y,
        head: [['Field', 'Value']],
        body: [
          ['Bill / Token', String(s.billNo || det.billNo || '-')],
          ['Date', String(det.date || s.date || '-')],
          ['Status', STATUS_LABEL[overallStatus] || overallStatus],
          ['Order Type', String(det.orderType || s.orderType || '-')],
          ['Table', String(det.tableNo || s.tableNo || '-')],
          ['Customer', String(s.customer || det?.customer?.name || '-')],
          ['Waiter', String(s.waiterName || '-')],
          ['Rider', String(s.riderName || '-')],
          ['Payment', String(det.paymentMethod || s.paymentMethod || '-').toUpperCase()],
          ['Net Total', `PKR ${Number(det.total || s.netAmount || 0).toLocaleString()}`],
        ],
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontSize: 9, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 120, fontStyle: 'bold' } },
        margin: { left: margin, right: margin },
        theme: 'grid',
      })
      y = doc.lastAutoTable.finalY + 14

      // Billed items
      doc.setFontSize(12)
      doc.text('Billed Items', margin, y)
      y += 6
      doc.autoTable({
        startY: y,
        head: [['Item', 'Qty']],
        body: (det.items || []).map(it => [itemName(it), String(Number(it.qty || 0))]),
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontSize: 9, fontStyle: 'bold' },
        columnStyles: { 1: { cellWidth: 60, halign: 'right' } },
        margin: { left: margin, right: margin },
        theme: 'grid',
      })
      y = doc.lastAutoTable.finalY + 14

      // Timeline
      doc.setFontSize(12)
      doc.text('Order Timeline', margin, y)
      y += 6
      const events = data?.events || []
      doc.autoTable({
        startY: y,
        head: [['Time', 'Event', 'Details']],
        body: events.map(ev => [
          fmtTime(ev.at),
          ev.title || '',
          [
            ev.detail?.items?.length ? itemsText(ev.detail.items) : '',
            ev.detail?.reason ? `Reason: ${ev.detail.reason}` : '',
            ev.detail?.userName ? `by ${ev.detail.userName}` : '',
          ].filter(Boolean).join('\n'),
        ]),
        styles: { fontSize: 9, cellPadding: 4, overflow: 'linebreak' },
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontSize: 9, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 160 } },
        margin: { left: margin, right: margin },
        theme: 'grid',
      })

      const fileName = sanitizeFileName(`order_${s.billNo || det.billNo || det.tokenNo || 'detail'}`)
      const ok = await openPdfPreview(doc, fileName)
      if (!ok) doc.save(`${fileName}.pdf`)
    } catch (e) {
      console.error('Order PDF failed:', e)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl max-h-[85vh] bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b dark:border-gray-700 bg-gradient-to-r from-indigo-100 to-indigo-50 dark:from-indigo-950/40 dark:to-gray-900 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="font-bold text-lg text-indigo-900 dark:text-indigo-100">Order {s.billNo || det.billNo || ''}</div>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_CHIP[overallStatus] || STATUS_CHIP.ordered}`}>
                {STATUS_LABEL[overallStatus] || overallStatus}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={printPdf}
                disabled={loading || !!err}
                className="px-3 py-1.5 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-all"
                title="Print / Preview A4 PDF"
              >Print PDF</button>
              <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-lg border-2 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-gray-100 transition-all">Close</button>
            </div>
          </div>

          <div className="p-4 overflow-auto flex-1 space-y-4">
            {loading && <div className="py-10 text-center text-gray-500">Loading order details…</div>}
            {err && <div className="py-10 text-center text-rose-500">{err}</div>}

            {!loading && !err && (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    ['Date', det.date || s.date || '-'],
                    ['Order Type', det.orderType || s.orderType || '-'],
                    ['Table', det.tableNo || s.tableNo || '-'],
                    ['Customer', s.customer || det?.customer?.name || '-'],
                    ['Waiter', s.waiterName || '-'],
                    ['Rider', s.riderName || '-'],
                    ['Payment', (det.paymentMethod || s.paymentMethod || '-').toString().toUpperCase()],
                    ['Total', `PKR ${Number(det.total || s.netAmount || 0).toLocaleString()}`],
                  ].map(([label, val]) => (
                    <div key={label} className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/60 border dark:border-gray-700">
                      <div className="text-[11px] text-gray-500 dark:text-gray-400">{label}</div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{val}</div>
                    </div>
                  ))}
                </div>

                {/* Billed items */}
                <div>
                  <div className="font-semibold mb-1.5 text-gray-800 dark:text-gray-100">Billed Items</div>
                  <table className="w-full text-sm border dark:border-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr><th className="p-2 text-left dark:text-gray-300">Item</th><th className="p-2 text-right dark:text-gray-300">Qty</th></tr>
                    </thead>
                    <tbody>
                      {(det.items || []).map((it, i) => (
                        <tr key={i} className="border-t dark:border-gray-700">
                          <td className="p-2 dark:text-gray-300">{itemName(it)}</td>
                          <td className="p-2 text-right dark:text-gray-300">{Number(it.qty || 0)}</td>
                        </tr>
                      ))}
                      {!(det.items || []).length && (
                        <tr><td colSpan={2} className="p-3 text-center text-gray-400">No items</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Timeline */}
                <div>
                  <div className="font-semibold mb-2 text-gray-800 dark:text-gray-100">Order Timeline</div>
                  <div className="relative pl-6 space-y-3 before:absolute before:left-[9px] before:top-1 before:bottom-1 before:w-0.5 before:bg-gray-200 dark:before:bg-gray-700">
                    {(data?.events || []).map((ev, i) => {
                      const st = KIND_STYLE[ev.kind] || KIND_STYLE.update
                      return (
                        <div key={i} className="relative">
                          <span className={`absolute -left-6 top-1 w-3.5 h-3.5 rounded-full ${st.dot} ring-2 ring-white dark:ring-gray-900 flex items-center justify-center text-[9px] font-bold text-white`}>{i + 1}</span>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${st.badge}`}>{st.icon} {ev.title}</span>
                              {ev.detail?.reason ? <div className="text-xs text-rose-500 mt-1">Reason: {ev.detail.reason}</div> : null}
                              {ev.detail?.items?.length ? (
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{itemsText(ev.detail.items)}</div>
                              ) : null}
                              {ev.detail?.remarks ? <div className="text-xs text-gray-400 mt-0.5">{ev.detail.remarks}</div> : null}
                              {ev.detail?.userName ? <div className="text-[11px] text-gray-400 mt-0.5">by {ev.detail.userName}</div> : null}
                            </div>
                            <div className="text-xs text-gray-400 whitespace-nowrap pt-0.5">{fmtTime(ev.at)}</div>
                          </div>
                        </div>
                      )
                    })}
                    {!(data?.events || []).length && <div className="text-sm text-gray-400">No events recorded</div>}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
