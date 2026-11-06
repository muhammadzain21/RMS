import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { useMemo, useState } from 'react'
import DatePicker from '../../components/DatePicker.jsx'

export default function InventoryForm() {
 const { id } = useParams()
 const { state, dispatch } = useData()
 const { token } = useAuth()
 const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
 const navigate = useNavigate()

 const existing = useMemo(() => state.ingredients.find(i => i.id === id), [id, state.ingredients])
 const [form, setForm] = useState(existing || { name: '', category: '', qty: 0, unit: '', lowStock: 0, price: 0, expiry: '' })
 const unitOptions = useMemo(() => [
 { value: 'g', label: 'Grams (g)' },
 { value: 'kg', label: 'Kilograms (kg)' },
 { value: 'pcs', label: 'Pieces (pcs)' },
 ], [])

 const submit = async (e) => {
 e.preventDefault()
 try {
 const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
 // Store quantity directly in the selected unit
 const unitLc = String(form.unit || '').toLowerCase()
 const payload = { ...form }
 if (unitLc === 'pcs' || unitLc === 'piece' || unitLc === 'pieces') {
 payload.qty = Math.max(0, Math.round(Number(form.qty) || 0))
 } else {
 payload.qty = Math.max(0, Number(form.qty) || 0)
 }
 if (existing) {
 const res = await fetch(`${API}/api/ingredients/${id}`, { method: 'PATCH', headers, body: JSON.stringify(payload) })
 if (!res.ok) throw new Error('Update failed')
 dispatch({ type:'UPDATE_INGREDIENT', payload:{ id, data: payload } })
 } else {
 const res = await fetch(`${API}/api/ingredients`, { method: 'POST', headers, body: JSON.stringify(payload) })
 if (!res.ok) throw new Error('Create failed')
 const created = await res.json()
 dispatch({ type:'ADD_INGREDIENT', payload: { ...payload, id: created.id || created._id } })
 }
 navigate('/inventory')
 } catch {
 toast.error('Failed to save ingredient')
 }
 }

 return (
 <div className="max-w-2xl mx-auto"><h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-5 flex items-center gap-2"><span className="text-3xl"></span> {existing ? 'Edit' : 'Add'} Ingredient
 </h1><form onSubmit={submit} className="space-y-4 p-6 rounded-xl border-2 border-emerald-300 dark:border-emerald-800 bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-950/40 dark:to-gray-900 shadow-sm"><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><Input label="Name" value={form.name} onChange={v => setForm({ ...form, name: v })} required icon="" /><Input label="Category" value={form.category} onChange={v => setForm({ ...form, category: v })} icon="" /><Input
 label={"Quantity" + (form.unit ? ` (${form.unit})` : '')}
 type="number"
 step="0.001"
 min="0"
 value={form.qty}
 onChange={v => {
 const num = Number(v)
 const unitLc = String(form.unit||'').toLowerCase()
 if (unitLc === 'pcs' || unitLc === 'piece' || unitLc === 'pieces') {
 setForm({ ...form, qty: Math.max(0, Math.round(Number.isFinite(num) ? num : 0)) })
 } else {
 setForm({ ...form, qty: Number.isFinite(num) ? num : 0 })
 }
 }}
 required
 icon="#⃣"
 /><label className="block"><span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1"> Unit</span><div className="mt-1 flex gap-2"><select
 className="flex-1 px-3 py-2.5 rounded-lg border-2 border-emerald-200 dark:border-emerald-700 bg-white dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-emerald-500 transition-all"
 value={form.unit || ''}
 onChange={e => {
 setForm({ ...form, unit: e.target.value })
 }}
 ><option value="">-- Select --</option>
 {unitOptions.map(u =><option key={u.value} value={u.value}>{u.label}</option>)}
 </select></div></label><Input label="Low Stock Threshold" type="number" value={form.lowStock} onChange={v => setForm({ ...form, lowStock: Number(v) })} icon="" /><Input label="Price per Unit" type="number" value={form.price} onChange={v => setForm({ ...form, price: Number(v) })} icon="" /><Input label="Expiry Date" type="date" value={form.expiry || ''} onChange={v => setForm({ ...form, expiry: v })} icon="" /></div><div className="flex gap-3 pt-2"><button className="flex-1 px-4 py-3 rounded-lg ui-btn ui-btn-primary"> Save Ingredient</button><button type="button" className="px-4 py-3 rounded-lg border-2 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all" onClick={() => navigate(-1)}> Cancel</button></div></form></div>
 )
}

function Input({ label, value, onChange, type='text', required, icon = '', step, min }) {
 if (type === 'date') {
  return (
   <div className="block">
    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">{icon} {label}</span>
    <div className="mt-1"><DatePicker value={value} onChange={onChange} /></div>
   </div>
  )
 }
 return (
 <label className="block"><span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">{icon} {label}</span><input required={required} value={value} onChange={e => onChange(e.target.value)} type={type} step={step} min={min} className="mt-1 w-full px-3 py-2.5 rounded-lg border-2 border-emerald-200 dark:border-emerald-700 bg-white dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all" /></label>
 )
}

