import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import SupplierModal from '../../components/SupplierModal.jsx'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../components/useConfirm.jsx'

export default function SupplierProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { state, dispatch } = useData()
  const { token } = useAuth()
  const { confirm, ConfirmDialog } = useConfirm()
  const [modalOpen, setModalOpen] = useState(false)
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'

  const supplier = useMemo(() => (state.suppliers||[]).find(s => s.id === id), [state.suppliers, id])
  const supplies = useMemo(() => (state.supplies||[]).filter(sp => sp.supplierId === id), [state.supplies, id])
  const totals = useMemo(() => {
    const totalCost = supplies.reduce((a,b) => a + Number(b.cost||0), 0)
    const totalEntries = supplies.length
    const totalItems = supplies.reduce((a,b) => a + (b.items||[]).reduce((x,y)=>x+Number(y.qty||0),0), 0)
    return { totalCost, totalEntries, totalItems }
  }, [supplies])

  const reloadSuppliers = async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await fetch(`${API}/api/suppliers`, { headers })
      const rows = await res.json()
      const mapId = (x) => ({ ...x, id: x.id || x._id })
      dispatch({ type: 'HYDRATE', payload: { suppliers: (rows||[]).map(mapId) } })
    } catch {}
  }

  const onDelete = async () => {
    const confirmed = await confirm({ title: 'Delete Supplier', message: 'Delete this supplier?' })
    if (!confirmed) return
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await fetch(`${API}/api/suppliers/${id}`, { method: 'DELETE', headers })
      if (!res.ok) throw new Error('Failed')
      await reloadSuppliers()
      toast.success('Supplier deleted')
      navigate('/suppliers')
    } catch {
      toast.error('Failed to delete supplier.')
    }
  }

  if (!supplier) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Supplier</h1>
          <button onClick={()=>navigate('/suppliers')} className="px-3 py-2 rounded border">Back</button>
        </div>
        <div className="p-6 border rounded text-gray-500">Supplier not found.</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Supplier Profile</h1>
        <div className="flex items-center gap-2">
          <button onClick={()=>navigate('/suppliers')} className="px-3 py-2 rounded border">Back</button>
          <button onClick={()=>setModalOpen(true)} className="px-3 py-2 rounded border">Edit</button>
          <button onClick={onDelete} className="px-3 py-2 rounded border text-red-600">Delete</button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="p-4 border rounded bg-white dark:bg-gray-900 md:col-span-2">
          <div className="text-lg font-semibold">{supplier.name || supplier.company}</div>
          <div className="text-sm text-gray-600">{supplier.company || '-'} · {supplier.status || 'Active'}</div>
          <div className="mt-2 text-sm">
            <div><strong>Phone:</strong> {supplier.phone || '-'}</div>
            <div><strong>Address:</strong> {supplier.address || '-'}</div>
            <div><strong>Tax ID:</strong> {supplier.taxId || '-'}</div>
          </div>
        </div>
        <div className="grid gap-3">
          <div className="p-4 border rounded bg-white dark:bg-gray-900">
            <div className="text-sm text-gray-600">Total Supplies</div>
            <div className="text-2xl font-semibold">{totals.totalEntries}</div>
          </div>
          <div className="p-4 border rounded bg-white dark:bg-gray-900">
            <div className="text-sm text-gray-600">Total Items</div>
            <div className="text-2xl font-semibold">{totals.totalItems}</div>
          </div>
          <div className="p-4 border rounded bg-white dark:bg-gray-900">
            <div className="text-sm text-gray-600">Total Cost</div>
            <div className="text-2xl font-semibold">{totals.totalCost.toFixed(2)}</div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="font-semibold">Supply Records</h2>
        <div className="overflow-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="text-left p-2">Date</th>
                <th className="text-left p-2">Items</th>
                <th className="text-left p-2">Cost</th>
              </tr>
            </thead>
            <tbody>
              {supplies.map(sp => (
                <tr key={sp.id} className="border-t">
                  <td className="p-2">{sp.date ? format(new Date(sp.date), 'yyyy-MM-dd') : '-'}</td>
                  <td className="p-2">{(sp.items||[]).map(i => `${i.name} x${i.qty}${i.unit}`).join(', ')}</td>
                  <td className="p-2">{Number(sp.cost||0).toFixed(2)}</td>
                </tr>
              ))}
              {supplies.length === 0 && (
                <tr><td colSpan={3} className="p-4 text-center text-gray-500">No supplies from this supplier yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SupplierModal open={modalOpen} initial={supplier} onClose={(ok)=>{ setModalOpen(false); if (ok) reloadSuppliers() }} />
      {ConfirmDialog}
    </div>
  )
}
