import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import SupplierModal from '../../components/SupplierModal.jsx'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../components/useConfirm.jsx'
import DataTable from '../../components/DataTable.jsx'

export default function SupplierList() {
  const { dispatch } = useData()
  const navigate = useNavigate()
  const { token } = useAuth()
  const { confirm, ConfirmDialog } = useConfirm()
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [total, setTotal] = useState(0)
  const [jump, setJump] = useState(1)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState([]) // Local state for paginated display
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

  const totalPages = Math.ceil(total / limit) || 1

  const goToPage = (p) => {
    if (p < 1 || p > totalPages) return
    setPage(p)
    reloadSuppliers(p, search)
  }

  const onSearchChange = (e) => {
    const val = e.target.value
    setSearch(val)
    setPage(1)
    reloadSuppliers(1, val)
  }

  useEffect(() => {
    reloadSuppliers()
  }, [])

  const reloadSuppliers = useCallback(async (pageNum = page, searchQuery = search) => {
    setLoading(true)
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      const params = new URLSearchParams({ page: String(pageNum), limit: String(limit) })
      if (searchQuery) params.set('q', searchQuery)
      const res = await fetch(`${API}/api/suppliers?${params.toString()}`, { headers })
      const data = await res.json()
      const mapId = (x) => ({ ...x, id: x.id || x._id })
      setRows((data.rows || []).map(mapId)) // Update local state only
      setTotal(data.total || 0)
    } catch {}
    setLoading(false)
  }, [API, token, page, limit, search])
  const onDelete = async (id) => {
    const confirmed = await confirm({ title: 'Delete Supplier', message: 'Delete this supplier?' })
    if (!confirmed) return
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await fetch(`${API}/api/suppliers/${id}`, { method: 'DELETE', headers })
      if (!res.ok) throw new Error('Failed')
      await reloadSuppliers()
      toast.success('Supplier deleted')
    } catch {
      toast.error('Failed to delete supplier.')
    }
  }

  const onAdd = () => { setEditing(null); setModalOpen(true) }
  const onEdit = (s) => { setEditing(s); setModalOpen(true) }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <span className="text-3xl">🏭</span> Suppliers
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <input value={search} onChange={onSearchChange} placeholder="🔍 Search by name/company..." className="px-4 py-2.5 border-2 border-blue-200 dark:border-blue-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 transition-all" />
          <button onClick={onAdd} className="px-4 py-2.5 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95">➕ Add Supplier</button>
        </div>
      </div>

      <DataTable
        columns={[
          { label: 'SR No', key: 'srNo', render: (_, idx) => <span className="text-gray-500 dark:text-gray-400">{(page - 1) * limit + idx + 1}</span> },
          { label: 'Name', key: 'name', render: r => (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center text-sm font-bold">
                {(r.name?.[0] || r.company?.[0] || '🏭').toUpperCase()}
              </div>
              <span className="font-medium">{r.name || r.company || '-'}</span>
            </div>
          )},
          { label: 'Company', key: 'company', render: r => <span className="text-gray-600 dark:text-gray-400">{r.company || '-'}</span> },
          { label: 'Phone', key: 'phone', render: r => <span className="text-gray-600 dark:text-gray-400">{r.phone || '-'}</span> },
          { label: 'Address', key: 'address', render: r => <span className="text-gray-600 dark:text-gray-400 truncate max-w-xs">{r.address || '-'}</span> },
          { label: 'Status', key: 'status', render: r => (
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.status==='Active' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
              {r.status || 'Active'}
            </span>
          )},
          { label: 'Actions', key: 'actions', render: r => (
            <div className="flex items-center gap-2">
              <button title="View" onClick={()=>navigate(`/suppliers/${r.id}`)} className="p-2 rounded-lg bg-gradient-to-br from-gray-400 to-gray-500 text-white shadow-sm hover:shadow-md transition-all hover:scale-105 active:scale-95">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              </button>
              <button title="Edit" onClick={()=>onEdit(r)} className="p-2 rounded-lg bg-gradient-to-br from-sky-400 to-sky-500 text-white shadow-sm hover:shadow-md transition-all hover:scale-105 active:scale-95">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              </button>
              <button title="Delete" onClick={()=>onDelete(r.id)} className="p-2 rounded-lg bg-gradient-to-br from-rose-400 to-rose-500 text-white shadow-sm hover:shadow-md transition-all hover:scale-105 active:scale-95">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          )}
        ]}
        data={rows}
        searchable={false}
        exportable={false}
        pageSize={limit}
        pageSizeOptions={[20, 30, 50, 'all']}
        maxHeight={520}
      />

      {/* Pagination controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between mt-4 p-4 rounded-xl bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 border border-gray-200 dark:border-gray-700 gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Page {page} of {totalPages}{total ? ` • ${total} total suppliers` : ''}</span>
          <div className="flex items-center gap-1">
            <label className="text-sm text-gray-600 dark:text-gray-400">Show:</label>
            <select value={limit} onChange={e=>{ setLimit(Number(e.target.value)); setPage(1); setJump(1); reloadSuppliers(1, search) }} className="px-2 py-1 text-sm border rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600">
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button disabled={page<=1 || loading} onClick={()=>goToPage(page-1)} className="px-4 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 font-medium transition-all dark:text-gray-100">← Prev</button>
          <button disabled={page>=totalPages || loading} onClick={()=>goToPage(page+1)} className="px-4 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 font-medium transition-all dark:text-gray-100">Next →</button>
          <div className="flex items-center gap-1 ml-2">
            <input type="number" min={1} max={totalPages} value={jump} onChange={e=>setJump(Number(e.target.value)||1)} className="w-16 px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-center bg-white dark:bg-gray-800 dark:text-gray-100" />
            <button disabled={loading || totalPages<1} onClick={()=>goToPage(Math.min(totalPages, Math.max(1, Number(jump)||1)))} className="px-4 py-2 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95">Go</button>
          </div>
        </div>
      </div>

      <SupplierModal open={modalOpen} initial={editing} onClose={(ok)=>{ setModalOpen(false); setEditing(null); if (ok) reloadSuppliers() }} />
      {ConfirmDialog}
    </div>
  )
}
