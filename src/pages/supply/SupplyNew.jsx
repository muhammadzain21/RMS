import { useMemo, useState, useEffect } from 'react'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { format } from 'date-fns'
import SupplierModal from '../../components/SupplierModal.jsx'
import { useLocation } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import DatePicker from '../../components/DatePicker.jsx'

export default function SupplyNew() {
  const { state, dispatch, businessDate } = useData()
  const { token } = useAuth()
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
  const [date, setDate] = useState(businessDate || format(new Date(), 'yyyy-MM-dd'))
  const [supplierId, setSupplierId] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [items, setItems] = useState([{ name: 'Cheese', qty: 1, unit: 'kg', price: 5 }])
  const location = useLocation()

  // Update date when businessDate changes
  useEffect(() => {
    if (businessDate) setDate(businessDate)
  }, [businessDate])
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const supId = params.get('supplierId')
    if (supId) setSupplierId(supId)
  }, [location.search])

  // lock if date closed
  const closedDates = useMemo(() => new Set((state.dayCloses||[]).map(d => d.date)), [state.dayCloses])
  const isSelectedDateClosed = closedDates.has(date)

  const cost = items.reduce((a,b) => a + Number(b.qty) * Number(b.price), 0)

  const addItem = () => setItems(prev => [...prev, { name: '', qty: 1, unit: '', price: 0 }])
  const update = (i, patch) => setItems(prev => prev.map((it, idx) => idx===i ? { ...it, ...patch } : it))
  const remove = (i) => setItems(prev => prev.filter((_, idx) => idx!==i))

  const submit = async (e) => {
    e.preventDefault()
    if (isSelectedDateClosed) { toast.error('This date is closed. You cannot add supplies for a closed date.'); return }
    if (!supplierId) { toast.error('Please select a supplier.'); return }
    const sup = state.suppliers.find(s => s.id === supplierId)
    const payload = { date, supplierId, supplier: sup?.name || sup?.company || '', items, cost }
    try {
      const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      const res = await fetch(`${API}/api/supplies`, { method: 'POST', headers, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error('Failed to save supply')
      const created = await res.json()
      dispatch({ type:'ADD_SUPPLY', payload })
      // reset form
      setSupplierId(''); setItems([{ name: '', qty: 1, unit: '', price: 0 }])
      toast.success('Supply saved successfully')
    } catch (err) {
      toast.error('Network error saving supply')
    }
  }

  return (
    <div className="space-y-3 max-w-2xl">
      <h1 className="text-xl font-semibold">New Supply</h1>
      {isSelectedDateClosed && (
        <div className="px-3 py-2 rounded bg-red-50 border border-red-200 text-red-800 text-sm">Selected date is closed. Adding supplies is disabled.</div>
      )}
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <DatePicker label="Date" value={date} onChange={v=>{ if (v) setDate(v) }} allowClear={false} />
          </div>
          <label className="block text-sm md:col-span-2">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <span>Supplier</span>
              <button type="button" onClick={()=>setModalOpen(true)} className="text-sm px-2 py-1 rounded border">+ Add Supplier</button>
            </div>
            <select value={supplierId} onChange={e=>setSupplierId(e.target.value)} className="mt-1 w-full px-3 py-2 border rounded">
              <option value="">Select supplier...</option>
              {(state.suppliers||[]).map(s => (
                <option key={s.id} value={s.id}>{s.name || s.company} {s.status==='Inactive' ? '(Inactive)' : ''}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="space-y-2">
          {items.map((it, idx) => (
            <div key={idx} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-center">
              <input placeholder="Ingredient name" value={it.name} onChange={e=>update(idx,{name:e.target.value})} className="px-3 py-2 border rounded" />
              <input type="number" placeholder="Qty" value={it.qty} onChange={e=>update(idx,{qty:Number(e.target.value)})} className="px-3 py-2 border rounded" />
              <input placeholder="Unit" value={it.unit} onChange={e=>update(idx,{unit:e.target.value})} className="px-3 py-2 border rounded" />
              <input type="number" placeholder="Price" value={it.price} onChange={e=>update(idx,{price:Number(e.target.value)})} className="px-3 py-2 border rounded" />
              <button type="button" onClick={()=>remove(idx)} className="text-red-600">Remove</button>
            </div>
          ))}
          <button type="button" onClick={addItem} className="px-3 py-2 border rounded">Add Item</button>
        </div>
        <div className="text-right">Total Cost: {cost.toFixed(2)}</div>
        <button disabled={isSelectedDateClosed} className="px-4 py-2 bg-primary-600 text-white rounded disabled:opacity-50">Save Supply</button>
      </form>
      <SupplierModal open={modalOpen} onClose={(saved)=>{ setModalOpen(false); if(saved){ /* optionally select last added */ } }} />
    </div>
  )
}
