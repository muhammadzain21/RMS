import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'react-hot-toast'
import DatePicker from '../components/DatePicker.jsx'
import Pagination from '../components/Pagination.jsx'
import { useConfirm } from '../components/useConfirm.jsx'
import { useAuth } from '../state/AuthContext.jsx'

const PREVIEW_KEYS = ['name','title','username','userName','customerName','staffName','supplierName','itemName','phone','email','amount','total','totalAmount','grandTotal','status','type','category','method','paymentMethod','date','invoiceNo','billNo','orderNo','tableName','role','note','reason','quantity']

function fmtVal(v) {
  if (v == null) return '-'
  if (typeof v === 'number') return v.toLocaleString()
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'object') {
    if (v.$date) return String(v.$date).slice(0, 10)
    return JSON.stringify(v).slice(0, 60)
  }
  const s = String(v)
  return s.length > 60 ? s.slice(0, 60) + '…' : s
}

function docDate(doc) {
  const v = doc?.date || doc?.at || doc?.businessDate
  if (v) return String(v).slice(0, 10)
  const c = doc?.createdAt
  if (!c) return '-'
  if (typeof c === 'number') return format(new Date(c), 'yyyy-MM-dd')
  const s = String(c)
  return s.length >= 10 ? s.slice(0, 10) : s
}

export default function DataManager() {
  const { token } = useAuth()
  const { confirm, ConfirmDialog } = useConfirm()
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
  const headers = useMemo(() => ({ ...(token ? { Authorization: `Bearer ${token}` } : {}) }), [token])

  const [collections, setCollections] = useState([])
  const [collection, setCollection] = useState('')
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [colsLoading, setColsLoading] = useState(false)
  const today = useMemo(() => new Date().toLocaleDateString('en-CA'), [])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)

  const pages = Math.max(1, Math.ceil(total / limit))

  const loadCollections = async () => {
    if (!token) return
    setColsLoading(true)
    try {
      const res = await fetch(`${API}/api/data-manager/collections`, { headers, cache: 'no-store' })
      if (res.ok) {
        const list = await res.json()
        setCollections(list)
        if (!collection && list.length) setCollection(list[0].name)
      } else {
        const j = await res.json().catch(() => ({}))
        toast.error(j?.error || 'Failed to load collections')
      }
    } catch { toast.error('Failed to load collections') }
    setColsLoading(false)
  }

  const loadDocs = async (pageNum = page) => {
    if (!token || !collection) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('collection', collection)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (q.trim()) params.set('q', q.trim())
      params.set('page', String(pageNum))
      params.set('limit', String(limit))
      const res = await fetch(`${API}/api/data-manager/docs?${params.toString()}`, { headers, cache: 'no-store' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || `Failed (${res.status})`)
      }
      const data = await res.json()
      setRows(data.rows || [])
      setTotal(data.total || 0)
      setPage(data.page || pageNum)
    } catch (err) { toast.error(String(err?.message || 'Failed to load documents')) }
    setLoading(false)
  }

  useEffect(() => { loadCollections() }, [token])
  useEffect(() => { if (collection) { setPage(1); loadDocs(1) } }, [collection])

  const onApply = () => { setPage(1); loadDocs(1) }
  const onReset = () => { setFrom(''); setTo(''); setQ(''); setPage(1); setTimeout(() => loadDocs(1), 0) }
  const onPageChange = (p) => loadDocs(p)

  const onDeleteDoc = async (doc) => {
    const id = String(doc._id)
    const ok = await confirm({
      title: 'Delete Document',
      message: `Delete document ${id} from "${collection}"?\n\nThis cannot be undone.`,
      confirmText: 'Delete',
      confirmStyle: 'danger',
    })
    if (!ok) return
    try {
      const res = await fetch(`${API}/api/data-manager/docs/${collection}/${id}`, { method: 'DELETE', headers })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || `Failed (${res.status})`)
      }
      toast.success('Document deleted')
      setTotal(t => Math.max(0, t - 1))
      await loadDocs(page)
      loadCollections()
    } catch (err) { toast.error(String(err?.message || 'Failed to delete')) }
  }

  const onDeleteFiltered = async () => {
    const hasFilter = from || to || q.trim()
    const label = hasFilter ? `${total.toLocaleString()} filtered document(s)` : `ALL ${total.toLocaleString()} document(s)`
    const ok = await confirm({
      title: hasFilter ? 'Delete Filtered Documents' : 'Delete ENTIRE Collection',
      message: `Permanently delete ${label} from "${collection}"?\n\nThis cannot be undone.`,
      confirmText: 'Delete',
      confirmStyle: 'danger',
    })
    if (!ok) return
    const ok2 = await confirm({
      title: 'Are you absolutely sure?',
      message: `This will permanently remove ${label} from "${collection}". Continue?`,
      confirmText: 'Yes, Delete',
      confirmStyle: 'danger',
    })
    if (!ok2) return
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (q.trim()) params.set('q', q.trim())
      const res = await fetch(`${API}/api/data-manager/docs/${collection}?${params.toString()}`, { method: 'DELETE', headers })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || `Failed (${res.status})`)
      }
      const j = await res.json()
      toast.success(`Deleted ${j?.deleted ?? 0} document(s)`)
      setPage(1)
      await loadDocs(1)
      loadCollections()
    } catch (err) { toast.error(String(err?.message || 'Failed to delete')) }
  }

  // Pick up to 5 display columns: preferred keys first, then other scalar fields
  const displayCols = useMemo(() => {
    const keys = new Set()
    for (const k of PREVIEW_KEYS) {
      if (rows.some(r => r[k] !== undefined && r[k] !== null && r[k] !== '')) keys.add(k)
      if (keys.size >= 5) break
    }
    if (keys.size < 5) {
      for (const r of rows) {
        for (const [k, v] of Object.entries(r)) {
          if (keys.size >= 5) break
          if (k === '_id' || k === '__v' || keys.has(k)) continue
          if (v == null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') keys.add(k)
        }
        if (keys.size >= 5) break
      }
    }
    return Array.from(keys).slice(0, 5)
  }, [rows])

  const selectedMeta = collections.find(c => c.name === collection)

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Data Manager</h1>
        <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 font-semibold">Admin only — deletions are permanent</span>
      </div>

      {/* Filters */}
      <div className="p-5 rounded-xl border-2 border-indigo-300 dark:border-indigo-800 bg-gradient-to-br from-indigo-100 to-indigo-50 dark:from-indigo-950/40 dark:to-gray-900 shadow-sm">
        <div className="text-sm font-bold text-indigo-900 dark:text-indigo-100 mb-4">Collection & Filters</div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1 flex-shrink-0">
            <label className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 tracking-wide">Collection</label>
            <select
              value={collection}
              onChange={e => setCollection(e.target.value)}
              disabled={colsLoading}
              className="px-3 py-2 rounded-lg border-2 border-indigo-200 dark:border-indigo-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all min-w-[12rem]"
            >
              {collections.map(c => <option key={c.name} value={c.name}>{c.name} ({c.count})</option>)}
              {!collections.length && <option value="">{colsLoading ? 'Loading...' : 'No collections'}</option>}
            </select>
          </div>
          <div className="flex-shrink-0"><DatePicker label="From" value={from} onChange={v => setFrom(v)} max={to || today} /></div>
          <div className="flex-shrink-0"><DatePicker label="To" value={to} onChange={v => setTo(v)} min={from || ''} max={today} /></div>
          <div className="flex flex-col gap-1 flex-1 min-w-0 basis-full sm:basis-auto">
            <label className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 tracking-wide">Search</label>
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Name, note, status, invoice no..."
              className="w-full px-3 py-2 rounded-lg border-2 border-indigo-200 dark:border-indigo-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>
          <div className="flex gap-3 flex-shrink-0">
            <button onClick={onApply} disabled={loading || !collection}
              className="px-4 py-2 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50 whitespace-nowrap">
              {loading ? 'Loading...' : 'Apply'}
            </button>
            <button onClick={onReset}
              className="px-4 py-2 rounded-lg bg-gradient-to-br from-gray-500 to-gray-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 whitespace-nowrap">
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Danger zone */}
      {collection && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border-2 border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
          <div className="text-sm text-red-700 dark:text-red-300">
            <span className="font-semibold">{collection}</span>
            {selectedMeta ? ` • ${selectedMeta.count.toLocaleString()} total docs` : ''}
            {` • ${total.toLocaleString()} matching filter`}
          </div>
          <button
            onClick={onDeleteFiltered}
            disabled={loading || total === 0}
            className="px-4 py-2 rounded-lg bg-gradient-to-br from-red-500 to-red-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50 whitespace-nowrap"
          >
            Delete {(from || to || q.trim()) ? 'Filtered' : 'All'} ({total.toLocaleString()})
          </button>
        </div>
      )}

      {/* Documents table */}
      <div className="border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-x-auto shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
            <tr>
              <th className="p-3 text-left font-semibold text-gray-700 dark:text-gray-300">#</th>
              <th className="p-3 text-left font-semibold text-gray-700 dark:text-gray-300">Date</th>
              {displayCols.map(k => <th key={k} className="p-3 text-left font-semibold text-gray-700 dark:text-gray-300 capitalize">{k}</th>)}
              <th className="p-3 text-left font-semibold text-gray-700 dark:text-gray-300">ID</th>
              <th className="p-3 text-center font-semibold text-gray-700 dark:text-gray-300">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={String(r._id)} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="p-3 text-gray-500 dark:text-gray-400">{(page - 1) * limit + i + 1}</td>
                <td className="p-3 text-gray-700 dark:text-gray-300 font-medium whitespace-nowrap">{docDate(r)}</td>
                {displayCols.map(k => (
                  <td key={k} className="p-3 text-gray-600 dark:text-gray-400 max-w-[14rem] truncate" title={fmtVal(r[k])}>{fmtVal(r[k])}</td>
                ))}
                <td className="p-3 text-xs text-gray-400 dark:text-gray-500 font-mono whitespace-nowrap">{String(r._id)}</td>
                <td className="p-3 text-center">
                  <button onClick={() => onDeleteDoc(r)}
                    className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50 transition-colors font-medium text-sm border border-red-200 dark:border-red-700">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr><td colSpan={displayCols.length + 4} className="p-8 text-center text-gray-500 dark:text-gray-400"><div className="text-4xl mb-2">📄</div><div>{collection ? 'No documents match the filters.' : 'Select a collection.'}</div></td></tr>
            )}
            {loading && (
              <tr><td colSpan={displayCols.length + 4} className="p-8 text-center text-gray-500 dark:text-gray-400">Loading...</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <Pagination page={page} pages={pages} total={total} limit={limit}
          onLimitChange={n => { setLimit(n); }} onPageChange={onPageChange} loading={loading} />
      )}

      {ConfirmDialog}
    </div>
  )
}
