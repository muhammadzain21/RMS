import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useData } from '../state/DataContext.jsx'
import { useAuth } from '../state/AuthContext.jsx'
import DatePicker from '../components/DatePicker.jsx'

export default function IngredientModal({ open, onClose, initial }) {
 const { state, dispatch } = useData()
 const { token } = useAuth()
 const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
 const suppliers = state.suppliers || []

 const [form, setForm] = useState({
 name: '',
 category: '',
 qty: 0,
 unit: '',
 lowStock: 0,
 price: 0,
 expiry: '',
 supplierId: ''
 })
 const [addingSupplier, setAddingSupplier] = useState(false)
 const [newSupplierName, setNewSupplierName] = useState('')
 const unitOptions = useMemo(() => [
 { value: 'g', label: 'Grams (g)' },
 { value: 'kg', label: 'Kilograms (kg)' },
 { value: 'pcs', label: 'Pieces (pcs)' }
 ], [])

 useEffect(() => {
 if (initial) {
 setForm({
 name: initial.name || '',
 category: initial.category || '',
 qty: Number(initial.qty || 0),
 unit: initial.unit || '',
 lowStock: Number(initial.lowStock || 0),
 price: Number(initial.price || 0),
 expiry: initial.expiry || '',
 supplierId: initial.supplierId || ''
 })
 } else {
 setForm({ name:'', category:'', qty:0, unit:'', lowStock:0, price:0, expiry:'', supplierId:'' })
 }
 }, [initial, open, unitOptions])

 if (!open) return null

 const save = async (e) => {
 e.preventDefault()
 if (!form.name.trim()) { toast.error('Name is required'); return }
 if (!String(form.qty).length) { toast.error('Quantity is required'); return }
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
 if (initial?.id) {
 const res = await fetch(`${API}/api/ingredients/${initial.id}`, { method: 'PATCH', headers, body: JSON.stringify(payload) })
 if (res.ok) {
 dispatch({ type:'UPDATE_INGREDIENT', payload:{ id: initial.id, data: payload } })
 } else {
 throw new Error('Update failed')
 }
 } else {
 // Prefer Add Inventory (purchase invoice) for new stock; this path keeps catalog-only create available.
 const res = await fetch(`${API}/api/ingredients`, { method: 'POST', headers, body: JSON.stringify(payload) })
 if (res.ok) {
 const created = await res.json()
 const added = { ...payload, id: created.id || created._id }
 dispatch({ type:'ADD_INGREDIENT', payload: added })
 } else {
 throw new Error('Create failed')
 }
 }
 onClose(true)
 } catch (err) {
 toast.error('Network error saving ingredient')
 }
 }

 const addSupplierInline = async () => {
 const name = newSupplierName.trim()
 if (!name) return
 try {
 const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
 const payload = { name, status: 'Active' }
 const res = await fetch(`${API}/api/suppliers`, { method: 'POST', headers, body: JSON.stringify(payload) })
 if (!res.ok) throw new Error('Failed to create supplier')
 const created = await res.json()
 const newSupplier = { ...payload, id: created._id || created.id, ...created }
 dispatch({ type: 'ADD_SUPPLIER', payload: newSupplier })
 setForm(f => ({ ...f, supplierId: newSupplier.id }))
 setAddingSupplier(false)
 setNewSupplierName('')
 } catch (err) {
 toast.error('Failed to add supplier')
 }
 }

 return (
 <div data-user-busy="1" className="fixed inset-0 z-50 flex items-center justify-center"><div className="absolute inset-0 bg-black/30" onClick={() => onClose(false)} /><div className="relative bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-2xl p-5"><div className="flex items-center justify-between mb-3"><h3 className="text-lg font-semibold">{initial?.id ? 'Edit Ingredient' : 'Add Ingredient'}</h3><button onClick={() => onClose(false)} className="px-2 py-1 rounded border"></button></div><form onSubmit={save} className="space-y-3"><div className="grid grid-cols-1 md:grid-cols-2 gap-3"><LabelInput label="Name" value={form.name} onChange={v=>setForm({...form,name:v})} required /><LabelInput label="Category" value={form.category} onChange={v=>setForm({...form,category:v})} /><LabelInput
 label={"Quantity" + (form.unit ? ` (${form.unit})` : '')}
 type="number"
 step="0.001"
 value={form.qty}
 onChange={v=>{
 const num = Number(v)
 const unitLc = String(form.unit||'').toLowerCase()
 if (unitLc === 'pcs' || unitLc === 'piece' || unitLc === 'pieces') {
 setForm({ ...form, qty: Math.max(0, Math.round(Number.isFinite(num) ? num : 0)) })
 } else {
 setForm({ ...form, qty: Number.isFinite(num) ? num : 0 })
 }
 }}
 required
 /><div className="block text-sm"><span className="text-sm">Unit</span><div className="mt-1 flex gap-2"><select
 className="flex-1 px-3 py-2 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white dark:border-gray-600"
 value={form.unit || ''}
 onChange={e=>{
 setForm({ ...form, unit: e.target.value })
 }}
 ><option value="">-- Select --</option>
 {unitOptions.map(u => (
 <option key={u.value} value={u.value}>{u.label}</option>
 ))}
 </select></div></div><LabelInput label="Low Stock Threshold" type="number" value={form.lowStock} onChange={v=>setForm({...form,lowStock:Number(v)})} /><LabelInput label="Price per Unit" type="number" value={form.price} onChange={v=>setForm({...form,price:Number(v)})} /><LabelInput label="Expiry Date" type="date" value={form.expiry || ''} onChange={v=>setForm({...form,expiry:v})} /></div><div className="grid grid-cols-1 md:grid-cols-2 gap-3"><label className="block text-sm"><span className="text-sm">Supplier</span><div className="mt-1 flex gap-2"><select className="flex-1 px-3 py-2 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white dark:border-gray-600" value={form.supplierId} onChange={e=>setForm({...form,supplierId:e.target.value})}><option value="">-- Select --</option>
 {suppliers.map(s =><option key={s.id} value={s.id}>{s.name || s.company || s.phone}</option>)}
 </select>
 {!addingSupplier ? (
 <button type="button" onClick={()=>setAddingSupplier(true)} className="px-3 py-2 rounded border">+ New</button>
 ) : (
 <div className="flex gap-2"><input className="px-3 py-2 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white dark:border-gray-600" value={newSupplierName} onChange={e=>setNewSupplierName(e.target.value)} placeholder="Supplier name" /><button type="button" onClick={addSupplierInline} className="px-3 py-2 rounded bg-gray-900 text-white">Add</button><button type="button" onClick={()=>{setAddingSupplier(false);setNewSupplierName('')}} className="px-3 py-2 rounded border">Cancel</button></div>
 )}
 </div></label></div><div className="flex justify-end gap-2 pt-2"><button type="button" onClick={()=>onClose(false)} className="px-3 py-2 rounded border">Cancel</button><button className="px-4 py-2 rounded bg-primary-600 text-white">Save</button></div></form></div></div>
 )
}

function LabelInput({ label, value, onChange, type='text', required=false, placeholder='', step, min }) {
 if (type === 'date') {
  return (
   <div className="block text-sm">
    <span className="text-sm">{label}</span>
    <div className="mt-1"><DatePicker value={value} onChange={onChange} /></div>
   </div>
  )
 }
 return (
 <label className="block text-sm"><span className="text-sm">{label}</span><input required={required} value={value} onChange={e=>onChange(e.target.value)} type={type} placeholder={placeholder} step={step} min={min} className="mt-1 w-full px-3 py-2 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white dark:border-gray-600" /></label>
 )
}
