import React from 'react'

export default function KotModal({
  open,
  onClose,
  orderType,
  staff = [],
  riders = [],
  tables = [],
  occupiedTables,
  kotWaiterId,
  setKotWaiterId,
  kotTable,
  setKotTable,
  kotRiderId,
  setKotRiderId,
  kotRiderName,
  setKotRiderName,
  kotRemarks,
  setKotRemarks,
  submitKotSelection,
  submitting,
}) {
  if (!open) return null
  const staffWaiters = staff
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-2xl bg-white dark:bg-gray-900 border rounded p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-2xl font-semibold">Select Order Details</div>
          <button type="button" onClick={onClose} className="text-gray-500">✕</button>
        </div>
        {orderType === 'Dine-in' && (
          <div className="space-y-4">
            {/* Waiter */}
            <div>
              <div className="text-sm font-medium mb-1">Waiter (optional)</div>
              {Array.isArray(staffWaiters) && staffWaiters.length > 0 ? (
                <select className="px-3 py-2 border rounded w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white dark:border-gray-600" value={kotWaiterId} onChange={e=>setKotWaiterId(e.target.value)}>
                  <option value="">Select waiter</option>
                  {staffWaiters.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              ) : (
                <div className="text-sm text-gray-500">No waiters configured</div>
              )}
            </div>

            {/* Table selection */}
            <div>
              <div className="text-sm font-medium mb-1">Select Table:</div>
              {Array.isArray(tables) && tables.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                  {tables.map(t => {
                    const name = t.name || t.label || t.code || String(t)
                    const floor = t.floor || ''
                    const displayLabel = floor ? `${name} / ${floor}` : name
                    const isSelected = String(kotTable||'') === name
                    const busy = Boolean(t.occupied || t.busy || (occupiedTables instanceof Set && occupiedTables.has(String(name))))
                    return (
                      <button
                        type="button"
                        key={name}
                        onClick={()=> setKotTable(name)}
                        className={`px-3 py-2 rounded border text-left ${isSelected ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600'} ${busy ? 'ring-1 ring-amber-400' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                        title={busy ? 'Occupied (selecting will still proceed)' : 'Available'}
                      >
                        <div className="font-medium">{displayLabel}</div>
                        <div className={`text-xs ${busy ? 'text-amber-600' : 'text-green-600'}`}>{busy ? 'Occupied' : 'Available'}</div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="text-sm text-gray-500">No tables configured</div>
              )}
            </div>
          </div>
        )}
        {/* Rider selection removed for KOT per request */}
        <label className="block text-sm">Remarks
          <textarea rows={2} className="mt-1 px-3 py-2 border rounded w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white dark:border-gray-600" value={kotRemarks} onChange={e=>setKotRemarks(e.target.value)} placeholder="Any special instructions" />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 border rounded">Cancel</button>
          <button
            type="button"
            onClick={submitKotSelection}
            className={`px-4 py-2 rounded text-white ${submitting ? 'bg-green-400 cursor-not-allowed opacity-60' : 'bg-green-600'}`}
            disabled={Boolean(submitting)}
          >
            {submitting ? 'Submitting…' : 'Submit Order'}
          </button>
        </div>
      </div>
    </div>
  )
}
