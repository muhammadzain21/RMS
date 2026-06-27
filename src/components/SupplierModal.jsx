import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useData } from '../state/DataContext.jsx'
import { useAuth } from '../state/AuthContext.jsx'

export default function SupplierModal({ open, onClose, initial }) {
  const { dispatch } = useData()
  const { token } = useAuth()
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
  const [form, setForm] = useState({
    name: '', company: '', phone: '', address: '', taxId: '', status: 'Active'
  })

  useEffect(() => {
    if (initial) {
      setForm({
        name: initial.name || '',
        company: initial.company || '',
        phone: initial.phone || '',
        address: initial.address || '',
        taxId: initial.taxId || '',
        status: initial.status || 'Active',
      })
    } else {
      setForm({ name:'', company:'', phone:'', address:'', taxId:'', status:'Active' })
    }
  }, [initial, open])

  if (!open) return null

  const save = async (e) => {
    e.preventDefault()
    try {
      const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      const body = JSON.stringify(form)
      const url = initial?.id ? `${API}/api/suppliers/${initial.id}` : `${API}/api/suppliers`
      const method = initial?.id ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers, body })
      if (!res.ok) throw new Error('Failed to save supplier')
      onClose(true)
    } catch (err) {
      toast.error('Failed to save supplier. Please try again.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={() => onClose(false)} />
      <div className="relative bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">{initial?.id ? 'Edit Supplier' : 'Add Supplier'}</h3>
          <button onClick={() => onClose(false)} className="px-2 py-1 rounded border">✕</button>
        </div>
        <form onSubmit={save} className="space-y-3">
          <label className="block text-sm">Supplier Name
            <input className="mt-1 w-full px-3 py-2 border rounded bg-white text-gray-900" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} />
          </label>
          <label className="block text-sm">Company Name
            <input className="mt-1 w-full px-3 py-2 border rounded bg-white text-gray-900" value={form.company} onChange={e=>setForm(f=>({...f,company:e.target.value}))} />
          </label>
          <label className="block text-sm">Phone Number
            <input className="mt-1 w-full px-3 py-2 border rounded bg-white text-gray-900" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} />
          </label>
          <label className="block text-sm">Address
            <textarea className="mt-1 w-full px-3 py-2 border rounded bg-white text-gray-900" value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))} />
          </label>
          <label className="block text-sm">Tax ID
            <input className="mt-1 w-full px-3 py-2 border rounded bg-white text-gray-900" value={form.taxId} onChange={e=>setForm(f=>({...f,taxId:e.target.value}))} />
          </label>
          <label className="block text-sm">Status
            <select className="mt-1 w-full px-3 py-2 border rounded bg-white text-gray-900" value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
              <option>Active</option>
              <option>Inactive</option>
            </select>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => onClose(false)} className="px-3 py-2 rounded border">Cancel</button>
            <button className="px-4 py-2 rounded bg-gray-900 text-white">Save</button>
          </div>
        </form>
      </div>
    </div>
  )
}
