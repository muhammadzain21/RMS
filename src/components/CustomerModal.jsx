import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useData } from '../state/DataContext.jsx'
import { useAuth } from '../state/AuthContext.jsx'

export default function CustomerModal({ open, onClose, initial }) {
  const { dispatch } = useData()
  const { token } = useAuth()
  const [form, setForm] = useState({ name: '', phone: '', address: '', isRegular: false })

  useEffect(() => {
    if (initial) setForm({ name: initial.name || '', phone: initial.phone || '', address: initial.address || '', isRegular: Boolean(initial.isRegular) })
    else setForm({ name: '', phone: '', address: '', isRegular: false })
  }, [initial, open])

  if (!open) return null

  const save = async (e) => {
    e.preventDefault()
    if (!form.phone.trim()) { toast.error('Phone is required'); return }
    if (!form.name.trim()) { toast.error('Name is required'); return }
    const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
    try {
      if (initial?.id) {
        const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
        const res = await fetch(`${API}/api/customers/${initial.id}`, {
          method: 'PATCH', headers, body: JSON.stringify(form)
        })
        if (res.ok) {
          const updated = await res.json()
          const data = { id: updated._id || updated.id || initial.id, name: updated.name || form.name, phone: updated.phone || form.phone, address: updated.address || form.address, isRegular: Boolean(updated.isRegular ?? form.isRegular) }
          dispatch({ type:'UPDATE_CUSTOMER', payload:{ id: data.id, data } })
          onClose({ changed: true, data })
          return
        } else {
          dispatch({ type:'UPDATE_CUSTOMER', payload:{ id: initial.id, data: form } })
          onClose({ changed: true, data: { id: initial.id, ...form } })
          return
        }
      } else {
        const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
        const res = await fetch(`${API}/api/customers`, {
          method: 'POST', headers, body: JSON.stringify(form)
        })
        if (res.ok) {
          const created = await res.json()
          const data = { id: created._id || created.id, name: created.name || form.name, phone: created.phone || form.phone, address: created.address || form.address, isRegular: Boolean(created.isRegular ?? form.isRegular) }
          dispatch({ type:'ADD_CUSTOMER', payload: data })
          onClose({ changed: true, data })
          return
        } else {
          const tmp = { id: crypto.randomUUID(), ...form }
          dispatch({ type:'ADD_CUSTOMER', payload: tmp })
          onClose({ changed: true, data: tmp })
          return
        }
      }
    } catch {
      // offline/failed -> local state only
      if (initial?.id) {
        dispatch({ type:'UPDATE_CUSTOMER', payload:{ id: initial.id, data: form } })
        onClose({ changed: true, data: { id: initial.id, ...form } })
      } else {
        const tmp = { id: crypto.randomUUID(), ...form }
        dispatch({ type:'ADD_CUSTOMER', payload: tmp })
        onClose({ changed: true, data: tmp })
      }
      return
    }
    onClose({ changed: false })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={()=>onClose(false)} />
      <div className="relative bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">{initial?.id ? 'Edit Customer' : 'Add Customer'}</h3>
          <button onClick={()=>onClose(false)} className="px-2 py-1 rounded border">✕</button>
        </div>
        <form onSubmit={save} className="space-y-3">
          <label className="block text-sm">Name
            <input className="mt-1 w-full px-3 py-2 border rounded bg-white text-gray-900" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} />
          </label>
          <label className="block text-sm">Phone
            <input className="mt-1 w-full px-3 py-2 border rounded bg-white text-gray-900" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} />
          </label>
          <label className="block text-sm">Address
            <textarea rows={2} className="mt-1 w-full px-3 py-2 border rounded bg-white text-gray-900" value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))} />
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isRegular} onChange={e=>setForm(f=>({...f,isRegular:e.target.checked}))} />
            Regular Customer (eligible for discount)
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={()=>onClose(false)} className="px-3 py-2 rounded border">Cancel</button>
            <button className="px-4 py-2 rounded bg-gray-900 text-white">Save</button>
          </div>
        </form>
      </div>
    </div>
  )
}
