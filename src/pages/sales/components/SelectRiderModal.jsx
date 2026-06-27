import React, { useState } from 'react'

export default function SelectRiderModal({ open, onCancel, riders = [], onConfirm }) {
  const [riderId, setRiderId] = useState('')

  if (!open) return null

  const rider = riders.find(r => String(r.id) === String(riderId))

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 border rounded p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xl font-semibold">Select Rider</div>
          <button type="button" onClick={onCancel} className="text-gray-500">✕</button>
        </div>
        <div>
          <div className="text-sm font-medium mb-1">Rider</div>
          <select className="px-3 py-2 border rounded w-full bg-white text-gray-900" value={riderId} onChange={e=>setRiderId(e.target.value)}>
            <option value="">Select rider</option>
            {(riders||[]).map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 border rounded">Cancel</button>
          <button
            type="button"
            onClick={()=>{
              if (!riderId) return
              if (onConfirm) onConfirm({ id: riderId, name: rider?.name || '' })
            }}
            className="px-4 py-2 bg-green-600 text-white rounded"
            disabled={!riderId}
          >Continue</button>
        </div>
      </div>
    </div>
  )
}
