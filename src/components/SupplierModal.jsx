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
 <div data-user-busy="1" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"><div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg p-6"><div className="flex items-center justify-between mb-5"><h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{initial?.id ? 'Edit Supplier' : 'Add Supplier'}</h3><button onClick={() => onClose(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-xl"></button></div><form onSubmit={save} className="space-y-4"><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Supplier Name</label><input className="w-full px-3 py-2.5 border-2 border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 transition-all" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></div><div><label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Company Name</label><input className="w-full px-3 py-2.5 border-2 border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 transition-all" value={form.company} onChange={e=>setForm(f=>({...f,company:e.target.value}))} /></div><div><label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Phone Number</label><input className="w-full px-3 py-2.5 border-2 border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 transition-all" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} /></div><div><label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Tax ID</label><input className="w-full px-3 py-2.5 border-2 border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 transition-all" value={form.taxId} onChange={e=>setForm(f=>({...f,taxId:e.target.value}))} /></div></div><div><label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Address</label><textarea className="w-full px-3 py-2.5 border-2 border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 transition-all" rows={2} value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))} /></div><div><label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Status</label><select className="w-full px-3 py-2.5 border-2 border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 transition-all" value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}><option>Active</option><option>Inactive</option></select></div><div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => onClose(false)} className="px-4 py-2.5 rounded-lg border-2 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">Cancel</button><button type="submit" className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95">Save</button></div></form></div></div>
 )
}
