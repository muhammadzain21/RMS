import { useMemo, useState } from 'react'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { format } from 'date-fns'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../components/useConfirm.jsx'

export default function ReturnNew() {
  const { state, dispatch, businessDate } = useData()
  const { token } = useAuth()
  const { confirm, ConfirmDialog } = useConfirm()
  const [date, setDate] = useState(businessDate || format(new Date(), 'yyyy-MM-dd'))
  const [saleId, setSaleId] = useState('')
  const [reason, setReason] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [saleSearch, setSaleSearch] = useState('')

  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }

  const closedDates = useMemo(() => new Set((state.dayCloses||[]).map(d => d.date)), [state.dayCloses])
  const isSelectedDateClosed = closedDates.has(date)

  const sale = useMemo(() => (saleId ? state.sales.find(s => s.id === saleId) : null), [saleId, state.sales])

  // Build item info from sale
  const saleItems = useMemo(() => {
    if (!sale || !Array.isArray(sale.items)) return []
    return sale.items.map(si => {
      let unitPrice = Number(si.price ?? si.custom?.price ?? 0)
      if (!unitPrice) {
        const lineTotal = Number(si.total ?? si.lineTotal ?? 0)
        const q = Number(si.qty || 0)
        if (lineTotal > 0 && q > 0) unitPrice = lineTotal / q
      }
      const m = state.menu.find(mm => mm.id === si.itemId)
      return {
        itemId: si.itemId,
        name: si.name || si.custom?.name || m?.name || si.itemId,
        originalQty: Number(si.qty || 0),
        unitPrice: unitPrice || m?.price || 0,
      }
    })
  }, [sale, state.menu])

  // Track already returned qty per item
  const priorReturnsMap = useMemo(() => {
    if (!sale) return {}
    const map = {}
    ;(state.returns || []).filter(r => r.saleId === sale.id).forEach(r => {
      r.items.forEach(it => { map[it.itemId] = (map[it.itemId] || 0) + Number(it.qty || 0) })
    })
    return map
  }, [sale, state.returns])

  // Return qty inputs keyed by itemId
  const [returnQtys, setReturnQtys] = useState({})

  const maxReturnQty = (itemId, originalQty) => {
    const returned = priorReturnsMap[itemId] || 0
    return Math.max(0, originalQty - returned)
  }

  const updateReturnQty = (itemId, val, originalQty) => {
    const max = maxReturnQty(itemId, originalQty)
    const qty = Math.max(0, Math.min(Number(val) || 0, max))
    setReturnQtys(prev => ({ ...prev, [itemId]: qty }))
  }

  const selectedItems = useMemo(() => {
    return saleItems
      .filter(si => (returnQtys[si.itemId] || 0) > 0)
      .map(si => ({ itemId: si.itemId, qty: returnQtys[si.itemId] }))
  }, [saleItems, returnQtys])

  const refund = useMemo(() => selectedItems.reduce((sum, it) => {
    const si = saleItems.find(s => s.itemId === it.itemId)
    return sum + (si?.unitPrice || 0) * it.qty
  }, 0), [selectedItems, saleItems])

  const customerText = (c) => {
    if (!c) return '-'
    if (typeof c === 'string') return c
    return c.name || c.phone || '-'
  }

  const formatCurrency = (amount) => `PKR ${Number(amount || 0).toLocaleString()}`

  const allSales = useMemo(() => {
    const list = [...(state.sales || [])]
    list.sort((a,b) => (b.date||'').localeCompare(a.date||'') || String(b.billNo||'').localeCompare(String(a.billNo||'')))
    if (!saleSearch) return list
    const t = saleSearch.toLowerCase()
    return list.filter(s => {
      const bill = s.billNo ? `BILL-${s.billNo}` : s.id
      const cust = customerText(s.customer)
      return (
        String(s.date||'').toLowerCase().includes(t) ||
        String(bill||'').toLowerCase().includes(t) ||
        String(cust||'').toLowerCase().includes(t)
      )
    })
  }, [state.sales, saleSearch])

  const submit = async (e) => {
    e.preventDefault()
    if (isSelectedDateClosed) { toast.error('This date is closed. Recording returns is disabled.'); return }
    if (!saleId) { toast.error('Please select an original sale.'); return }
    if (selectedItems.length === 0) { toast.error('Please enter return quantity for at least one item.'); return }
    for (const it of selectedItems) {
      const si = saleItems.find(s => s.itemId === it.itemId)
      const max = maxReturnQty(it.itemId, si?.originalQty || 0)
      if (it.qty > max) { toast.error('Qty exceeds allowed for one or more items.'); return }
    }
    try {
      const customer = sale?.customer ? customerText(sale.customer) : undefined
      const body = { date, saleId, customer, items: selectedItems, refund: Number(refund.toFixed(2)), reason, paymentMethod }
      const res = await fetch(`${API}/api/returns`, { method: 'POST', headers, body: JSON.stringify(body) })
      if (!res.ok) { toast.error('Failed to record return'); return }
      const q = new URLSearchParams()
      q.set('date', date)
      const rs = await fetch(`${API}/api/returns?${q.toString()}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      if (rs.ok) {
        const list = await rs.json()
        const mapId = (x) => ({ ...x, id: x.id || x._id })
        dispatch({ type: 'HYDRATE', payload: { returns: (list || []).map(mapId) } })
      }
      setSaleId('')
      setReturnQtys({})
      setReason('')
      setPaymentMethod('cash')
      setSaleSearch('')
      toast.success('Return recorded successfully')
    } catch {
      toast.error('Error recording return')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <span className="text-3xl">🔄</span> New Return
        </h1>
      </div>

      {isSelectedDateClosed && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
            <span className="text-xl">⚠️</span>
            <span className="font-semibold">Selected date is closed. You cannot record returns for this date.</span>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        {/* Sale Selection */}
        <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Date</span>
              <input value={date} onChange={e => setDate(e.target.value)} type="date" className="mt-1 px-3 py-2 border rounded-lg w-full bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Select Order / Sale</span>
              <div className="mt-1 space-y-2">
                <input value={saleSearch} onChange={e=>setSaleSearch(e.target.value)} placeholder="Search by date, bill, customer..." className="px-3 py-2 border rounded-lg w-full bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500" />
                <select
                  value={saleId}
                  onChange={e => { setSaleId(e.target.value); setReturnQtys({}) }}
                  className="px-3 py-2 border rounded-lg w-full bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600"
                  size={saleId ? 1 : 6}
                >
                  <option value="">-- Select an order --</option>
                  {allSales.map(s => {
                    const bill = s.billNo ? `BILL-${s.billNo}` : s.id.slice(0,6)
                    return <option key={s.id} value={s.id}>{`${s.date} | ${bill} | ${customerText(s.customer)} | ${formatCurrency(s.total)}`}</option>
                  })}
                </select>
              </div>
            </label>
          </div>

          {/* Sale Summary */}
          {sale && (
            <div className="mt-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium text-gray-800 dark:text-gray-200">Sale Total:</span> {formatCurrency(sale.total)}
                {'  '}<span className="font-medium text-gray-800 dark:text-gray-200">| Payment:</span> {sale.paymentMethod || 'cash'}
                {'  '}<span className="font-medium text-gray-800 dark:text-gray-200">| Customer:</span> {customerText(sale.customer)}
              </div>
            </div>
          )}
        </div>

        {/* Items Table */}
        {sale && saleItems.length > 0 && (
          <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-100">Select Items to Return</h3>
            <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300">Item</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-700 dark:text-gray-300">Unit Price</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-700 dark:text-gray-300">Sold Qty</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-700 dark:text-gray-300">Already Returned</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-700 dark:text-gray-300">Can Return</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-700 dark:text-gray-300">Return Qty</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-700 dark:text-gray-300">Refund</th>
                  </tr>
                </thead>
                <tbody>
                  {saleItems.map(si => {
                    const returned = priorReturnsMap[si.itemId] || 0
                    const canReturn = Math.max(0, si.originalQty - returned)
                    const returnQty = returnQtys[si.itemId] || 0
                    const lineRefund = returnQty * si.unitPrice
                    return (
                      <tr key={si.itemId} className="border-t hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="px-3 py-2 text-gray-800 dark:text-gray-200 font-medium">{si.name}</td>
                        <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{formatCurrency(si.unitPrice)}</td>
                        <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">{si.originalQty}</td>
                        <td className="px-3 py-2 text-right text-orange-600 dark:text-orange-400">{returned}</td>
                        <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400 font-medium">{canReturn}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min={0}
                            max={canReturn}
                            value={returnQty}
                            onChange={e => updateReturnQty(si.itemId, e.target.value, si.originalQty)}
                            className="w-20 px-2 py-1 border rounded bg-white dark:bg-gray-700 dark:text-white dark:border-gray-600 text-right focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                          {lineRefund > 0 ? formatCurrency(lineRefund) : '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold border-t">
                  <tr>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300" colSpan={6}>Total Refund</td>
                    <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400">{formatCurrency(refund)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Reason & Payment */}
        <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <label className="block md:col-span-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Reason</span>
              <input value={reason} onChange={e => setReason(e.target.value)} className="mt-1 px-3 py-2 border rounded-lg w-full bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500" placeholder="Damaged, wrong item, customer changed mind, etc." />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Refund Method</span>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="mt-1 px-3 py-2 border rounded-lg w-full bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600 focus:ring-2 focus:ring-blue-500">
                <option value="cash">Cash</option>
                <option value="online">Online</option>
                <option value="complimentary">Personal</option>
              </select>
            </label>
          </div>
        </div>

        <button disabled={isSelectedDateClosed || !saleId || selectedItems.length === 0} className="w-full px-6 py-3 rounded-xl bg-gradient-to-r from-rose-500 to-rose-600 text-white font-semibold shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed">
          Record Return — {formatCurrency(refund)}
        </button>
      </form>
      {ConfirmDialog}
    </div>
  )
}
