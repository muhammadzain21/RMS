import React from 'react'

export default function AddCustomerModal({
  open,
  onClose,
  name,
  phone,
  address,
  setName,
  setPhone,
  setAddress,
  saving,
  onSubmit,
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 border rounded p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">Add New Customer</div>
          <button onClick={onClose} className="text-gray-500">✕</button>
        </div>
        <div className="space-y-2">
          <label className="block text-sm">Name
            <input className="mt-1 px-3 py-2 border rounded w-full bg-white text-gray-900" value={name} onChange={e=>setName(e.target.value)} />
          </label>
          <label className="block text-sm">Phone
            <input className="mt-1 px-3 py-2 border rounded w-full bg-white text-gray-900" value={phone} onChange={e=>setPhone(e.target.value)} />
          </label>
          <label className="block text-sm">Address
            <textarea rows={2} className="mt-1 px-3 py-2 border rounded w-full bg-white text-gray-900" value={address} onChange={e=>setAddress(e.target.value)} />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border rounded" disabled={saving}>Cancel</button>
          <button onClick={onSubmit} className="px-4 py-2 bg-sky-600 text-white rounded disabled:opacity-50" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}
