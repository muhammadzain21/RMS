import { useEffect, useMemo, useRef, useState } from 'react'
import { useData } from '../../state/DataContext.jsx'
import CustomerModal from '../../components/CustomerModal.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../components/useConfirm.jsx'

export default function CustomerList() {
  const { state, dispatch } = useData()
  const { token } = useAuth()
  const { confirm, ConfirmDialog } = useConfirm()
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const fileRef = useRef(null)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [jump, setJump] = useState(1)
  const [refreshKey, setRefreshKey] = useState(0)

  // Fetch paginated list from server
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const params = new URLSearchParams({ page: String(page), limit: String(limit) })
        if (search.trim()) params.set('q', search.trim())
        const res = await fetch(`${API}/api/customers?${params.toString()}`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
        if (!res.ok) throw new Error(`Failed to load customers (${res.status})`)
        const body = await res.json()
        if (!cancelled) {
          if (Array.isArray(body?.rows)) {
            const mapId = (x) => ({ ...x, id: x.id || x._id })
            setRows(body.rows.map(mapId))
            setTotal(Number(body.total||0))
            const pg = Number(body.pages||1)
            setPages(pg)
            if (page > pg) setPage(pg)
          } else {
            // Backward compat: older server returned array
            const arr = Array.isArray(body) ? body : []
            const mapId = (x) => ({ ...x, id: x.id || x._id })
            setRows(arr.slice(0, limit).map(mapId))
            setTotal(Array.isArray(body) ? body.length : 0)
            setPages(Math.max(1, Math.ceil((Array.isArray(body) ? body.length : 0)/limit)))
          }
        }
      } catch (e) {
        if (!cancelled) { setRows([]); setTotal(0); setPages(1) }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [API, token, page, limit, search, refreshKey])

  // Reset to page 1 when search changes
  useEffect(() => { setPage(1); setJump(1) }, [search])

  // Aggregate visits and spent from actual sales so list matches profile
  const salesAgg = useMemo(() => {
    const map = {}
    for (const s of (state.sales || [])) {
      const cid = s?.customer?.id
      if (!cid) continue
      if (!map[cid]) map[cid] = { visits: 0, spent: 0 }
      map[cid].visits += 1
      map[cid].spent += Number(s.total || 0) - Number(s.discount || 0)
    }
    return map
  }, [state.sales])

  const onImportClick = () => fileRef.current?.click()

  const parseCsv = (text) => {
    // Robust CSV parser supporting headers like: Id, Customer Name, Mobile No, Address
    // and also plain rows without header. We map to name, phone, address.
    const lines = String(text||'').split(/\r?\n/).filter(l=>l.trim().length)
    if (!lines.length) return []

    const parseLine = (l) => {
      const cells = []
      let cur = ''; let q = false
      for (let i=0;i<l.length;i++) {
        const ch = l[i]
        if (ch === '"') { q = !q; continue }
        if (ch === ',' && !q) { cells.push(cur); cur=''; continue }
        cur += ch
      }
      cells.push(cur)
      return cells.map(c => (c==null? '' : c.trim()))
    }

    const norm = (s) => String(s||'').toLowerCase().replace(/[^a-z]/g,'')
    const headerCells = parseLine(lines[0])
    const headerNorm = headerCells.map(norm)

    // Try to detect header indices
    const idx = { name: -1, phone: -1, address: -1, id: -1 }
    headerNorm.forEach((h, i) => {
      if (['id','sr','srno','serial','sno'].includes(h)) idx.id = i
      if (['name','customername','fullname'].includes(h)) idx.name = i
      if (['phone','phoneno','mobileno','mobilenumber','mobile','contact','contactno','contactnumber'].includes(h)) idx.phone = i
      if (['address','addr','location'].includes(h)) idx.address = i
    })

    let dataLines = lines
    if (idx.name !== -1 || idx.phone !== -1 || idx.address !== -1) {
      // Detected a header row — skip it in data
      dataLines = lines.slice(1)
    }

    const out = []
    for (const l of dataLines) {
      const cells = parseLine(l)
      let name = '', phone = '', address = ''

      if (idx.name !== -1 || idx.phone !== -1 || idx.address !== -1) {
        // Map using detected header indices
        name = cells[idx.name >= 0 ? idx.name : 0] || ''
        phone = cells[idx.phone >= 0 ? idx.phone : (idx.name >= 0 ? idx.name + 1 : 1)] || ''
        address = cells[idx.address >= 0 ? idx.address : (idx.phone >= 0 ? idx.phone + 1 : 2)] || ''
      } else {
        // No header detected. Handle common patterns:
        // Pattern A: Id, Name, Phone, Address
        if (cells.length >= 4 && /^\d+$/.test(cells[0])) {
          name = cells[1] || ''
          phone = cells[2] || ''
          address = cells[3] || ''
        } else {
          // Pattern B: Name, Phone, Address
          name = cells[0] || ''
          phone = cells[1] || ''
          address = cells[2] || ''
        }
      }

      // Normalize phone to keep digits (but keep original if digits empty)
      const digits = String(phone).replace(/\D+/g,'')
      phone = digits.length ? digits : (phone||'')

      if (name || phone) out.push({ name, phone, address })
    }
    return out
  }

  const importCSV = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const rows = parseCsv(text)
      if (!rows.length) { toast.error('No rows found. Expect columns: name,phone,address'); return }
      const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      let ok = 0, fail = 0
      for (const r of rows) {
        // normalize
        const payload = { name: r.name || '', phone: (r.phone||'').trim(), address: r.address || '', isRegular: false }
        try {
          const res = await fetch(`${API}/api/customers`, { method: 'POST', headers, body: JSON.stringify(payload) })
          if (res.ok) {
            const created = await res.json()
            const c = { id: created.id || created._id, name: created.name || payload.name, phone: created.phone || payload.phone, address: created.address || payload.address, isRegular: !!created.isRegular }
            dispatch({ type: 'ADD_CUSTOMER', payload: c })
            ok++
          } else {
            fail++
          }
        } catch { fail++ }
      }
      toast.success(`Import complete. Success: ${ok}, Failed: ${fail}`)
    } catch {
      toast.error('Failed to read CSV file')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const onAdd = () => { setEditing(null); setModalOpen(true) }
  const onEdit = (c) => { setEditing(c); setModalOpen(true) }
  const onDelete = async (id) => {
    const confirmed = await confirm({ title: 'Delete Customer', message: 'Delete this customer?' })
    if (!confirmed) return
    // Optimistic updates: update local page list and global state
    const prevRows = rows
    setRows(prev => prev.filter(r => r.id !== id))
    setTotal(t => Math.max(0, t - 1))
    dispatch({ type:'DELETE_CUSTOMER', payload:{ id } })
    try {
      const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
      const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      const res = await fetch(`${API}/api/customers/${id}`, { method: 'DELETE', headers })
      if (!res.ok) {
        // revert UI if server rejected
        setRows(prevRows)
        setTotal(t => t + 1)
        dispatch({ type:'ADD_CUSTOMER', payload: { id } }) // lightweight revert; full refetch next
        if (res.status === 401 || res.status === 403) {
          toast.error('You do not have permission to delete customers. Only Admin/Manager can delete.')
        } else {
          const msg = await res.text().catch(()=>`${res.status}`)
          toast.error(`Failed to delete customer: ${msg}`)
        }
        return
      }
      toast.success('Customer deleted')
      // After successful delete, refetch current page to sync server pagination
      setTimeout(() => { setPage(1); setJump(1) }, 0)
    } catch {
      // no-op; item already removed locally. Optionally refetch later.
    }
  }

  const exportCSV = () => {
    const header = ['Name','Phone','Regular','Visits','Spent','Last Visit']
    const data = (state.customers||[]).map(c => [
      c.name || '',
      c.phone || '',
      c.isRegular ? 'Yes' : 'No',
      String((salesAgg[c.id]?.visits ?? c.totalVisits ?? 0)),
      String(Number((salesAgg[c.id]?.spent ?? c.totalSpent ?? 0)).toFixed(2)),
      c.lastVisit || ''
    ])
    const csv = [header, ...data].map(r => r.map(val => {
      const s = String(val).replaceAll('"','""')
      return /[",\n]/.test(s) ? `"${s}"` : s
    }).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `customers_${new Date().toLocaleDateString('en-CA')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <span className="text-3xl">👥</span> Customers
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search by name/phone..." className="px-4 py-2.5 border-2 border-blue-200 dark:border-blue-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 transition-all" />
          <button onClick={onAdd} className="px-4 py-2.5 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95">➕ Add Customer</button>
          <button onClick={exportCSV} className="px-4 py-2.5 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95">📥 Export CSV</button>
          <button onClick={onImportClick} className="px-4 py-2.5 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95">📤 Import CSV</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={importCSV} />
        </div>
      </div>

      <div className="border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
            <tr>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">SR No</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Name</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Phone</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Address</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Regular</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Visits</th>
              <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Spent</th>
              <th className="text-center p-3 font-semibold text-gray-700 dark:text-gray-300">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={r.id} className="border-t hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="p-3 text-gray-500 dark:text-gray-400">{idx + 1}</td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 text-white flex items-center justify-center text-sm font-bold">
                      {(r.name?.[0] || '👤').toUpperCase()}
                    </div>
                    <span className="font-medium">{r.name || '-'}</span>
                  </div>
                </td>
                <td className="p-3 text-gray-600 dark:text-gray-400">{r.phone || '-'}</td>
                <td className="p-3 text-gray-600 dark:text-gray-400 truncate max-w-xs">{r.address || '-'}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.isRegular ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                    {r.isRegular ? 'Yes' : 'No'}
                  </span>
                </td>
                <td className="p-3 text-gray-700 dark:text-gray-300">{salesAgg[r.id]?.visits || r.totalVisits || 0}</td>
                <td className="p-3 font-medium text-gray-800 dark:text-gray-200">PKR {(salesAgg[r.id]?.spent || r.totalSpent || 0).toLocaleString()}</td>
                <td className="p-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button title="Edit" onClick={()=>onEdit(r)} className="p-2 rounded-lg bg-gradient-to-br from-sky-400 to-sky-500 text-white shadow-sm hover:shadow-md transition-all hover:scale-105 active:scale-95">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button title="Delete" onClick={()=>onDelete(r.id)} className="p-2 rounded-lg bg-gradient-to-br from-rose-400 to-rose-500 text-white shadow-sm hover:shadow-md transition-all hover:scale-105 active:scale-95">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-gray-500 dark:text-gray-400">
                  <div className="text-4xl mb-2">👥</div>
                  <div>No customers found</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      <div className="flex items-center justify-between mt-4 p-4 rounded-xl bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Page {page} of {pages}{total ? ` • ${total} total` : ''}</span>
          <div className="flex items-center gap-1">
            <label className="text-sm text-gray-600 dark:text-gray-400">Show:</label>
            <select value={limit} onChange={e=>{ setLimit(Number(e.target.value)); setPage(1); setJump(1) }} className="px-2 py-1 text-sm border rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600">
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button disabled={page<=1 || loading} onClick={()=>setPage(p=>Math.max(1,p-1))} className="px-4 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 font-medium transition-all dark:text-gray-100">← Prev</button>
          <button disabled={page>=pages || loading} onClick={()=>setPage(p=>Math.min(pages,p+1))} className="px-4 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 font-medium transition-all dark:text-gray-100">Next →</button>
          <div className="flex items-center gap-1 ml-2">
            <input type="number" min={1} max={pages} value={jump} onChange={e=>setJump(Number(e.target.value)||1)} className="w-16 px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-center bg-white dark:bg-gray-800 dark:text-gray-100" />
            <button disabled={loading || pages<1} onClick={()=>setPage(Math.min(pages, Math.max(1, Number(jump)||1)))} className="px-4 py-2 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95">Go</button>
          </div>
        </div>
      </div>

      <CustomerModal
        open={modalOpen}
        initial={editing}
        onClose={(changed)=>{
          setModalOpen(false)
          setEditing(null)
          if (changed) {
            // refetch current page to reflect latest edits/creates
            setRefreshKey(k=>k+1)
          }
        }}
      />
      {ConfirmDialog}
    </div>
  )
}
