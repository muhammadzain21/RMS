import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'react-hot-toast'
import { BarChart3, Package, FolderTree, Receipt, Hash, ChevronDown } from 'lucide-react'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { useLiveRefresh } from '../../hooks/useLiveRefresh.js'
import DatePicker from '../../components/DatePicker.jsx'
import Pagination from '../../components/Pagination.jsx'
import StatsCard from '../../components/StatsCard.jsx'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport, downloadHtmlReport } from '../../utils/reportDoc.js'
import { btnPrint, btnPdf, btnCsv, downloadCsvFile, exportDateStamp } from '../../utils/listReportExport.js'
import { resolveItemCategoryName, findCategoryByName, getCategoryPackagePrice, categoryKeyOf } from './utils.js'

function fmtMoney(n) {
  const v = Number(n) || 0
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtPct(n) {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n.toFixed(1)}%`
}

function lineUnitPrice(it, menuItem) {
  if (typeof it?.price === 'number' && Number.isFinite(it.price)) return Number(it.price)
  if (it?.custom?.price != null && Number.isFinite(Number(it.custom.price))) return Number(it.custom.price)
  return Number(menuItem?.price || 0)
}

export default function SalesSummary() {
  const { state, dispatch, businessDate } = useData()
  const { token } = useAuth()
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

  const [fromDate, setFromDate] = useState(businessDate || format(new Date(), 'yyyy-MM-dd'))
  const [toDate, setToDate] = useState(businessDate || format(new Date(), 'yyyy-MM-dd'))
  const [mode, setMode] = useState('items') // 'items' | 'categories'
  const [search, setSearch] = useState('')
  const [pickerSearch, setPickerSearch] = useState('')
  const [selectedKeys, setSelectedKeys] = useState(() => new Set()) // empty = all
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(100)
  const [pickerOpen, setPickerOpen] = useState(false)

  const menu = state.menu || []
  const categories = state.categories || []
  const menuById = useMemo(() => new Map(menu.map(m => [String(m.id), m])), [menu])

  const loadSales = async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      const params = []
      if (fromDate) params.push(`from=${encodeURIComponent(fromDate)}`)
      if (toDate) params.push(`to=${encodeURIComponent(toDate)}`)
      const qs = params.length ? `?${params.join('&')}` : ''
      const res = await fetch(`${API}/api/sales${qs}`, { headers, cache: 'no-store' })
      if (!res.ok) return
      const rows = await res.json()
      const mapId = (x) => ({ ...x, id: x.id || x._id })
      dispatch({ type: 'HYDRATE', payload: { sales: (rows || []).map(mapId) } })
    } catch {}
  }

  useEffect(() => { loadSales() }, [token, fromDate, toDate])
  useLiveRefresh(loadSales)

  useEffect(() => {
    if (businessDate && !fromDate) setFromDate(businessDate)
    if (businessDate && !toDate) setToDate(businessDate)
  }, [businessDate])

  // Reset selection when switching mode so filters stay meaningful
  useEffect(() => {
    setSelectedKeys(new Set())
    setPickerSearch('')
    setSearch('')
    setPickerOpen(false)
    setPage(1)
  }, [mode])

  const salesInRange = useMemo(() => {
    return (state.sales || []).filter(s => {
      const d = String(s.date || '').slice(0, 10)
      if (fromDate && d < fromDate) return false
      if (toDate && d > toDate) return false
      return true
    })
  }, [state.sales, fromDate, toDate])

  /** Aggregate item-wise and category-wise from sales lines */
  const { itemRows, categoryRows, optionList } = useMemo(() => {
    const items = new Map()
    const cats = new Map()

    for (const sale of salesInRange) {
      const lines = Array.isArray(sale.items) ? sale.items : []
      // Track package category charged once per sale
      const pkgCharged = new Set()
      const linesByCat = new Map()

      for (const it of lines) {
        if (it?.mods?.underDeal || it?.mods?.pizzaFlavour) continue
        const m = menuById.get(String(it.itemId || ''))
        const name = it.custom?.name || it.name || m?.name || 'Unknown item'
        const catName = resolveItemCategoryName(m, it) || m?.category || 'Uncategorized'
        const cat = findCategoryByName(categories, catName)
        const qty = Number(it.qty || 0)
        if (qty <= 0) continue

        const itemKey = String(it.itemId || `custom:${name}`)
        const prevItem = items.get(itemKey) || {
          key: itemKey,
          name,
          category: cat?.name || catName,
          qty: 0,
          amount: 0,
          bills: new Set(),
        }
        prevItem.qty += qty
        prevItem.amount += lineUnitPrice(it, m) * qty
        prevItem.bills.add(String(sale.id || sale._id || sale.createdAt))
        items.set(itemKey, prevItem)

        const cKey = categoryKeyOf(cat, catName) || `name:${String(catName).toLowerCase()}`
        if (!linesByCat.has(cKey)) linesByCat.set(cKey, { cat, catName, lines: [] })
        linesByCat.get(cKey).lines.push({ it, m })
      }

      for (const [cKey, group] of linesByCat.entries()) {
        const pkg = Math.max(
          0,
          ...group.lines.map(({ it }) => getCategoryPackagePrice(group.cat, it)),
          Number(group.cat?.price || 0),
        )
        let amount = 0
        let qty = 0
        for (const { it, m } of group.lines) {
          qty += Number(it.qty || 0)
          if (!(pkg > 0)) amount += lineUnitPrice(it, m) * Number(it.qty || 0)
        }
        if (pkg > 0) {
          if (!pkgCharged.has(cKey)) {
            amount += pkg
            pkgCharged.add(cKey)
          }
        }
        const prev = cats.get(cKey) || {
          key: cKey,
          name: group.cat?.name || group.catName || 'Uncategorized',
          qty: 0,
          amount: 0,
          itemCount: new Set(),
          bills: new Set(),
        }
        prev.qty += qty
        prev.amount += amount
        group.lines.forEach(({ it, m }) => {
          prev.itemCount.add(String(it.itemId || it.custom?.name || m?.name || ''))
        })
        prev.bills.add(String(sale.id || sale._id || sale.createdAt))
        cats.set(cKey, prev)
      }
    }

    const itemRows = Array.from(items.values())
      .map(r => ({
        ...r,
        bills: r.bills.size,
        avgPrice: r.qty > 0 ? r.amount / r.qty : 0,
      }))
      .sort((a, b) => b.amount - a.amount || b.qty - a.qty || a.name.localeCompare(b.name))

    const categoryRows = Array.from(cats.values())
      .map(r => ({
        ...r,
        bills: r.bills.size,
        items: r.itemCount.size,
        avgPrice: r.qty > 0 ? r.amount / r.qty : 0,
      }))
      .sort((a, b) => b.amount - a.amount || b.qty - a.qty || a.name.localeCompare(b.name))

    const optionList = mode === 'items'
      ? itemRows.map(r => ({ key: r.key, label: r.name, sub: r.category }))
      : categoryRows.map(r => ({ key: r.key, label: r.name, sub: `${r.items} items` }))

    return { itemRows, categoryRows, optionList }
  }, [salesInRange, menuById, categories, mode])

  const filteredRows = useMemo(() => {
    const base = mode === 'items' ? itemRows : categoryRows
    const q = search.trim().toLowerCase()
    return base.filter(r => {
      if (selectedKeys.size > 0 && !selectedKeys.has(r.key)) return false
      if (!q) return true
      return String(r.name || '').toLowerCase().includes(q)
        || String(r.category || '').toLowerCase().includes(q)
    })
  }, [mode, itemRows, categoryRows, selectedKeys, search])

  const totals = useMemo(() => {
    const qty = filteredRows.reduce((s, r) => s + Number(r.qty || 0), 0)
    const amount = filteredRows.reduce((s, r) => s + Number(r.amount || 0), 0)
    return { qty, amount, rows: filteredRows.length, bills: salesInRange.length }
  }, [filteredRows, salesInRange])

  const pages = Math.max(1, Math.ceil(filteredRows.length / limit) || 1)
  const paged = filteredRows.slice((page - 1) * limit, page * limit)

  useEffect(() => { setPage(1) }, [search, selectedKeys, fromDate, toDate, mode, limit])

  const pickerOptions = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase()
    if (!q) return optionList
    return optionList.filter(o =>
      String(o.label || '').toLowerCase().includes(q)
      || String(o.sub || '').toLowerCase().includes(q)
    )
  }, [optionList, pickerSearch])

  const toggleKey = (key) => {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selectAllVisible = () => {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      pickerOptions.forEach(o => next.add(o.key))
      return next
    })
  }

  const clearSelection = () => setSelectedKeys(new Set())

  const buildSalesSummaryReport = () => {
    const isItems = mode === 'items'
    const body =
      reportSummary([
        { label: 'Mode', amount: isItems ? 'Item-wise' : 'Category-wise' },
        { label: 'From', amount: fromDate || '—' },
        { label: 'To', amount: toDate || '—' },
        { label: 'Rows', amount: String(filteredRows.length) },
        { label: 'Qty sold', amount: String(totals.qty) },
        { label: 'Sales amount', amount: fmtMoney(totals.amount) },
        { label: 'Bills', amount: String(totals.bills) },
      ]) +
      reportSec(`${isItems ? 'Item' : 'Category'} sales (${filteredRows.length})`) +
      reportTable({
        headers: isItems
          ? ['Item', 'Category', { t: 'Qty', align: 'r' }, { t: 'Amount', align: 'r' }, { t: 'Avg', align: 'r' }, { t: 'Bills', align: 'r' }, { t: '%', align: 'r' }]
          : ['Category', { t: 'Items', align: 'r' }, { t: 'Qty', align: 'r' }, { t: 'Amount', align: 'r' }, { t: 'Avg', align: 'r' }, { t: 'Bills', align: 'r' }, { t: '%', align: 'r' }],
        numbered: true,
        rows: filteredRows.map(r => {
          const pct = totals.amount > 0 ? (Number(r.amount || 0) / totals.amount) * 100 : 0
          return isItems
            ? [
              r.name,
              r.category || '—',
              { v: r.qty, align: 'r' },
              { v: fmtMoney(r.amount), align: 'r' },
              { v: fmtMoney(r.avgPrice), align: 'r' },
              { v: r.bills, align: 'r' },
              { v: fmtPct(pct), align: 'r' },
            ]
            : [
              r.name,
              { v: r.items, align: 'r' },
              { v: r.qty, align: 'r' },
              { v: fmtMoney(r.amount), align: 'r' },
              { v: fmtMoney(r.avgPrice), align: 'r' },
              { v: r.bills, align: 'r' },
              { v: fmtPct(pct), align: 'r' },
            ]
        }),
        emptyText: 'No sales in range',
      })
    const fileName = `Sales-Summary-${exportDateStamp(fromDate, toDate)}.pdf`
    const html = wrapReportDoc({
      settings: state?.settings || {},
      title: isItems ? 'Item-wise Sales' : 'Category-wise Sales',
      reportLabel: 'Sales Summary',
      reportNo: `Rpt #: SS-${exportDateStamp(fromDate, toDate)}`,
      metaLeft: [
        ['From', fromDate || '—'],
        ['To', toDate || '—'],
        ['Filter', selectedKeys.size ? `${selectedKeys.size} selected` : 'All'],
      ],
      metaRight: [
        ['Rows', String(filteredRows.length)],
        ['Amount', fmtMoney(totals.amount)],
      ],
      body,
    })
    return { html, fileName }
  }

  const openPrintPreview = async () => {
    try {
      const { html, fileName } = buildSalesSummaryReport()
      await previewHtmlReport(html, fileName)
      toast.success('Print preview opened')
    } catch (e) {
      console.error(e)
      toast.error('Print preview failed')
    }
  }

  const exportPDF = async () => {
    try {
      const { html, fileName } = buildSalesSummaryReport()
      await downloadHtmlReport(html, fileName)
      toast.success('PDF exported')
    } catch (e) {
      console.error(e)
      toast.error('PDF export failed')
    }
  }

  const exportCSV = () => {
    try {
      const isItems = mode === 'items'
      const headers = isItems
        ? ['Item', 'Category', 'Qty', 'Amount', 'Avg Price', 'Bills', 'Share %']
        : ['Category', 'Distinct Items', 'Qty', 'Amount', 'Avg Price', 'Bills', 'Share %']
      const rows = filteredRows.map(r => {
        const pct = totals.amount > 0 ? (Number(r.amount || 0) / totals.amount) * 100 : 0
        return isItems
          ? [r.name, r.category || '', r.qty, Number(r.amount || 0).toFixed(2), Number(r.avgPrice || 0).toFixed(2), r.bills, pct.toFixed(1)]
          : [r.name, r.items, r.qty, Number(r.amount || 0).toFixed(2), Number(r.avgPrice || 0).toFixed(2), r.bills, pct.toFixed(1)]
      })
      downloadCsvFile(`sales_summary_${mode}_${exportDateStamp(fromDate, toDate)}.csv`, headers, rows)
      toast.success('CSV exported')
    } catch {
      toast.error('CSV export failed')
    }
  }

  const isItems = mode === 'items'

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Sales Summary</h1>
      </div>

      <div className="filter-toolbar p-3 sm:p-4 rounded-xl bg-gradient-to-r from-indigo-100 to-purple-100 dark:from-indigo-950/40 dark:to-purple-950/40 border-2 border-indigo-300 dark:border-indigo-800">
        <div className="filter-actions flex flex-wrap gap-2">
          <button type="button" onClick={openPrintPreview} className={btnPrint}>Print</button>
          <button type="button" onClick={exportPDF} className={btnPdf}>PDF</button>
          <button type="button" onClick={exportCSV} className={btnCsv}>CSV</button>
        </div>
        <div className="filter-field min-w-0">
          <DatePicker label="From" value={fromDate} onChange={v => { setFromDate(v || ''); setPage(1) }} className="w-full" />
        </div>
        <div className="filter-field min-w-0">
          <DatePicker label="To" value={toDate} onChange={v => { setToDate(v || ''); setPage(1) }} className="w-full" />
        </div>
        <div className="filter-select min-w-0">
          <label className="mb-1 block text-xs font-semibold text-indigo-700 dark:text-indigo-300">View</label>
          <select
            value={mode}
            onChange={e => setMode(e.target.value)}
            className="w-full px-3 py-2.5 border-2 border-indigo-200 dark:border-indigo-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500"
          >
            <option value="items">Item-wise</option>
            <option value="categories">Category-wise</option>
          </select>
        </div>
        <div className="filter-select min-w-0 relative">
          <label className="mb-1 block text-xs font-semibold text-indigo-700 dark:text-indigo-300">
            {isItems ? 'Items' : 'Categories'}
          </label>
          <button
            type="button"
            onClick={() => setPickerOpen(o => !o)}
            className="w-full px-3 py-2.5 border-2 border-indigo-200 dark:border-indigo-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-left flex items-center justify-between gap-2"
          >
            <span className="truncate text-sm">
              {selectedKeys.size ? `${selectedKeys.size} selected` : 'All'}
            </span>
            <ChevronDown size={16} className={`flex-shrink-0 text-gray-400 transition ${pickerOpen ? 'rotate-180' : ''}`} />
          </button>
          {pickerOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setPickerOpen(false)} />
              <div className="absolute left-0 right-0 top-full mt-1 z-40 rounded-xl border-2 border-indigo-200 dark:border-indigo-700 bg-white dark:bg-gray-900 shadow-xl p-2 min-w-[16rem]">
                <input
                  value={pickerSearch}
                  onChange={e => setPickerSearch(e.target.value)}
                  placeholder={`Search ${isItems ? 'items' : 'categories'}…`}
                  className="w-full mb-2 px-3 py-2 text-sm border-2 border-indigo-200 dark:border-indigo-700 rounded-lg bg-white dark:bg-gray-800"
                  autoFocus
                />
                <div className="flex gap-2 mb-2">
                  <button type="button" onClick={selectAllVisible} className="flex-1 px-2 py-1 rounded-md text-[11px] font-semibold border border-indigo-200 dark:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/40">Select shown</button>
                  <button type="button" onClick={clearSelection} className="flex-1 px-2 py-1 rounded-md text-[11px] font-semibold border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">Clear</button>
                </div>
                <div className="max-h-52 overflow-y-auto space-y-0.5">
                  {pickerOptions.length === 0 && (
                    <div className="text-xs text-gray-400 py-4 text-center">No results</div>
                  )}
                  {pickerOptions.map(o => {
                    const on = selectedKeys.has(o.key)
                    return (
                      <label key={o.key} className={`flex items-start gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-sm ${on ? 'bg-indigo-50 dark:bg-indigo-950/40' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                        <input type="checkbox" className="mt-0.5 w-4 h-4 text-indigo-600 rounded" checked={on} onChange={() => toggleKey(o.key)} />
                        <span className="min-w-0">
                          <span className="font-medium text-gray-800 dark:text-gray-100 break-words">{o.label}</span>
                          {o.sub && <span className="block text-[11px] text-gray-500 break-words">{o.sub}</span>}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
        <div className="filter-search min-w-0 flex-1 basis-full sm:basis-auto">
          <label className="mb-1 block text-xs font-semibold text-indigo-700 dark:text-indigo-300 sm:sr-only">Search</label>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={isItems ? 'Search items…' : 'Search categories…'}
            className="w-full px-4 py-2.5 border-2 border-indigo-200 dark:border-indigo-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatsCard
          title={isItems ? 'Items' : 'Categories'}
          value={String(totals.rows)}
          icon={isItems ? <Package size={18} /> : <FolderTree size={18} />}
          variant="blue"
        />
        <StatsCard
          title="Qty sold"
          value={String(totals.qty)}
          icon={<Hash size={18} />}
          variant="orange"
        />
        <StatsCard
          title="Sales amount"
          value={fmtMoney(totals.amount)}
          icon={<BarChart3 size={18} />}
          variant="green"
        />
        <StatsCard
          title="Bills"
          value={String(totals.bills)}
          icon={<Receipt size={18} />}
          variant="slate"
        />
      </div>

      <div className="border-2 border-indigo-300 dark:border-indigo-800 rounded-xl overflow-x-auto shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gradient-to-r from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900">
            <tr>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">#</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">{isItems ? 'Item' : 'Category'}</th>
              {isItems
                ? <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Category</th>
                : <th className="text-right p-3 font-semibold text-gray-700 dark:text-gray-300">Items</th>}
              <th className="text-right p-3 font-semibold text-gray-700 dark:text-gray-300">Qty</th>
              <th className="text-right p-3 font-semibold text-gray-700 dark:text-gray-300">Amount</th>
              <th className="text-right p-3 font-semibold text-gray-700 dark:text-gray-300">Avg</th>
              <th className="text-right p-3 font-semibold text-gray-700 dark:text-gray-300">Bills</th>
              <th className="text-right p-3 font-semibold text-gray-700 dark:text-gray-300">Share</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300 min-w-[7rem]"> </th>
            </tr>
          </thead>
          <tbody>
            {paged.map((r, idx) => {
              const pct = totals.amount > 0 ? (Number(r.amount || 0) / totals.amount) * 100 : 0
              return (
                <tr key={r.key} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors align-top">
                  <td className="p-3 text-gray-500 dark:text-gray-400 tabular-nums">{(page - 1) * limit + idx + 1}</td>
                  <td className="p-3 font-medium text-gray-900 dark:text-gray-100 break-words whitespace-normal">{r.name}</td>
                  {isItems
                    ? <td className="p-3 text-gray-600 dark:text-gray-400 break-words whitespace-normal">{r.category || '—'}</td>
                    : <td className="p-3 text-right tabular-nums text-gray-700 dark:text-gray-300">{r.items}</td>}
                  <td className="p-3 text-right font-semibold tabular-nums text-gray-800 dark:text-gray-100">{r.qty}</td>
                  <td className="p-3 text-right font-semibold tabular-nums text-gray-800 dark:text-gray-100">{fmtMoney(r.amount)}</td>
                  <td className="p-3 text-right tabular-nums text-gray-600 dark:text-gray-400">{fmtMoney(r.avgPrice)}</td>
                  <td className="p-3 text-right tabular-nums text-gray-600 dark:text-gray-400">{r.bills}</td>
                  <td className="p-3 text-right tabular-nums font-medium text-gray-700 dark:text-gray-300">{fmtPct(pct)}</td>
                  <td className="p-3">
                    <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                    </div>
                  </td>
                </tr>
              )
            })}
            {!paged.length && (
              <tr>
                <td colSpan={9} className="p-8 text-center text-gray-500 dark:text-gray-400">
                  No {isItems ? 'item' : 'category'} sales for this date range / selection.
                </td>
              </tr>
            )}
          </tbody>
          {filteredRows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-indigo-200 dark:border-indigo-700 bg-gray-50 dark:bg-gray-900/60 font-bold">
                <td className="p-3" colSpan={isItems ? 3 : 2}>Total</td>
                {!isItems && <td className="p-3 text-right tabular-nums">—</td>}
                <td className="p-3 text-right tabular-nums">{totals.qty}</td>
                <td className="p-3 text-right tabular-nums">{fmtMoney(totals.amount)}</td>
                <td className="p-3" colSpan={4} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {filteredRows.length > 0 && (
        <Pagination
          page={page}
          pages={pages}
          total={filteredRows.length}
          limit={limit}
          onLimitChange={n => { setLimit(n); setPage(1) }}
          onPageChange={setPage}
        />
      )}
    </div>
  )
}
