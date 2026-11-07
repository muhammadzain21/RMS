import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useAuth } from '../../state/AuthContext.jsx'

function api() {
  return (typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000'
}

const empty = { code: '', name: '', address: '', phone: '', mode: 'hybrid', notes: '', active: true }

export default function BranchModal({ open, initial, onClose }) {
  const { token } = useAuth()
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    if (initial) {
      setForm({
        code: initial.code || '',
        name: initial.name || '',
        address: initial.address || '',
        phone: initial.phone || '',
        mode: initial.mode || 'hybrid',
        notes: initial.notes || '',
        active: initial.active !== false,
      })
    } else {
      setForm(empty)
    }
  }, [open, initial])

  if (!open) return null

  const save = async (e) => {
    e.preventDefault()
    if (!form.code?.trim() || !form.name?.trim()) {
      toast.error('Code and name are required')
      return
    }
    setBusy(true)
    try {
      const id = initial?._id || initial?.id
      const url = id ? `${api()}/api/branches/${id}` : `${api()}/api/branches`
      const method = id ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Save failed')
      toast.success(id ? 'Branch updated' : 'Branch created')
      onClose(true)
    } catch (err) {
      toast.error(err.message || 'Failed to save branch')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            {initial?._id || initial?.id ? 'Edit Branch' : 'Add Branch'}
          </h3>
          <button
            type="button"
            onClick={() => onClose(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-xl"
          >
            ✕
          </button>
        </div>
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Code</label>
              <input
                required
                className="w-full px-3 py-2.5 border-2 border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 transition-all uppercase"
                placeholder="e.g. GUL"
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Name</label>
              <input
                required
                className="w-full px-3 py-2.5 border-2 border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 transition-all"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Mode</label>
              <select
                className="w-full px-3 py-2.5 border-2 border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 transition-all"
                value={form.mode}
                onChange={e => setForm(f => ({ ...f, mode: e.target.value }))}
              >
                <option value="hybrid">Hybrid (local + sync)</option>
                <option value="online">Online only</option>
                <option value="offline">Offline only</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Phone</label>
              <input
                className="w-full px-3 py-2.5 border-2 border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 transition-all"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Address</label>
            <textarea
              rows={2}
              className="w-full px-3 py-2.5 border-2 border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 transition-all"
              value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Notes</label>
            <input
              className="w-full px-3 py-2.5 border-2 border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 transition-all"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
            New branches start with the shared menu. You can change prices or add branch-only items later on the Menu page without affecting other branches.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => onClose(false)}
              className="px-4 py-2.5 rounded-lg border-2 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold shadow-md hover:shadow-lg transition-all disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
