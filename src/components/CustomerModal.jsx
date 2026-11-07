import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useData } from '../state/DataContext.jsx'
import { useAuth } from '../state/AuthContext.jsx'

function digitsOnly(v) {
  return String(v || '').replace(/\D/g, '')
}

/** If phone typed into Name (common POS habit), swap before save. */
function normalizeForm(form) {
  let name = String(form.name || '').trim()
  let phone = String(form.phone || '').trim()
  const address = String(form.address || '').trim()
  const nameDigits = digitsOnly(name)
  const phoneDigits = digitsOnly(phone)
  const nameLooksLikePhone = nameDigits.length >= 7 && nameDigits.length >= Math.max(1, name.length - 2)
  const phoneLooksLikeName = phoneDigits.length < 7
  if (nameLooksLikePhone && phoneLooksLikeName) {
    const swappedName = phone || ''
    phone = nameDigits
    name = swappedName
  } else if (phoneDigits.length) {
    phone = phoneDigits
  }
  return { ...form, name, phone, address }
}

export default function CustomerModal({ open, onClose, initial }) {
  const { dispatch } = useData()
  const { token } = useAuth()
  const [form, setForm] = useState({ name: '', phone: '', address: '', isRegular: false })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (initial) setForm({ name: initial.name || '', phone: initial.phone || '', address: initial.address || '', isRegular: Boolean(initial.isRegular) })
    else setForm({ name: '', phone: '', address: '', isRegular: false })
  }, [initial, open])

  if (!open) return null

  const save = async (e) => {
    e.preventDefault()
    const payload = normalizeForm(form)
    if (!digitsOnly(payload.phone)) { toast.error('Phone is required'); return }
    if (!String(payload.name || '').trim()) { toast.error('Name is required'); return }
    if (digitsOnly(payload.phone).length < 7) { toast.error('Enter a valid phone number'); return }

    const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
    const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    setSaving(true)
    try {
      if (initial?.id) {
        const res = await fetch(`${API}/api/customers/${initial.id}`, {
          method: 'PATCH', headers, body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const msg = await res.text().catch(() => '')
          toast.error(msg || 'Failed to update customer')
          return
        }
        const updated = await res.json()
        const data = {
          id: updated._id || updated.id || initial.id,
          name: updated.name || payload.name,
          phone: updated.phone || payload.phone,
          address: updated.address || payload.address,
          isRegular: Boolean(updated.isRegular ?? payload.isRegular),
        }
        dispatch({ type: 'UPDATE_CUSTOMER', payload: { id: data.id, data } })
        toast.success('Customer updated')
        onClose({ changed: true, data })
        return
      }

      const res = await fetch(`${API}/api/customers`, {
        method: 'POST', headers, body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const msg = await res.text().catch(() => '')
        toast.error(msg || 'Failed to save customer')
        return
      }
      const created = await res.json()
      const data = {
        id: created._id || created.id,
        name: created.name || payload.name,
        phone: created.phone || payload.phone,
        address: created.address || payload.address,
        isRegular: Boolean(created.isRegular ?? payload.isRegular),
      }
      dispatch({ type: 'ADD_CUSTOMER', payload: data })
      toast.success('Customer saved')
      onClose({ changed: true, data })
    } catch {
      toast.error('Network error — customer was not saved to server')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => onClose(false)} />
      <div className="relative bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-xl shadow-xl w-full max-w-md max-h-[92dvh] overflow-y-auto p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">{initial?.id ? 'Edit Customer' : 'Add Customer'}</h3>
          <button type="button" onClick={() => onClose(false)} className="min-h-10 min-w-10 px-2 py-1 rounded border">×</button>
        </div>
        <form onSubmit={save} className="space-y-3">
          {/* Phone first — same order as Sell / Call Center */}
          <label className="block text-sm">Phone
            <input
              className="mt-1 w-full px-3 py-2 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 dark:border-gray-600"
              value={form.phone}
              maxLength={15}
              placeholder="03XXXXXXXXX"
              onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 15) }))}
            />
          </label>
          <label className="block text-sm">Name
            <input
              className="mt-1 w-full px-3 py-2 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 dark:border-gray-600"
              value={form.name}
              placeholder="Customer name"
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label className="block text-sm">Address
            <textarea
              rows={2}
              className="mt-1 w-full px-3 py-2 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 dark:border-gray-600"
              value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
            />
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isRegular} onChange={e => setForm(f => ({ ...f, isRegular: e.target.checked }))} />
            Regular Customer (eligible for discount)
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => onClose(false)} className="px-3 py-2 rounded border">Cancel</button>
            <button disabled={saving} className="px-4 py-2 rounded bg-gray-900 text-white disabled:opacity-60">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
