import React, { useMemo } from 'react'

function tableName(t) {
  if (t == null) return ''
  if (typeof t === 'string' || typeof t === 'number') return String(t).trim()
  return String(t.name || t.label || t.code || '').trim()
}

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
  // Keep unused rider props in signature for callers; avoid lint noise
  void riders
  void kotRiderId
  void setKotRiderId
  void kotRiderName
  void setKotRiderName

  const occupied = useMemo(() => {
    if (occupiedTables instanceof Set) return occupiedTables
    if (Array.isArray(occupiedTables)) return new Set(occupiedTables.map((n) => String(n).trim()))
    return new Set()
  }, [occupiedTables])

  if (!open) return null

  const staffWaiters = Array.isArray(staff) ? staff : []
  const tableList = Array.isArray(tables) ? tables : []
  const selectedName = String(kotTable || '').trim()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 sm:p-6">
      <div className="w-full max-w-5xl max-h-[92vh] overflow-y-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 sm:p-6 space-y-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-gray-100">Select Order Details</div>
            {orderType === 'Dine-in' ? (
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs sm:text-sm">
                <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                  <span className="inline-block h-3 w-3 rounded-sm bg-blue-500 border border-blue-700" aria-hidden />
                  Available
                </span>
                <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                  <span className="inline-block h-3 w-3 rounded-sm bg-yellow-400 border border-yellow-600" aria-hidden />
                  Occupied
                </span>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 text-2xl leading-none px-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {orderType === 'Dine-in' && (
          <div className="space-y-5">
            <div>
              <div className="text-sm font-medium mb-1 text-gray-800 dark:text-gray-200">Waiter (optional)</div>
              {staffWaiters.length > 0 ? (
                <select
                  className="px-3 py-2.5 border rounded-lg w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white dark:border-gray-600"
                  value={kotWaiterId || ''}
                  onChange={(e) => setKotWaiterId(e.target.value)}
                >
                  <option value="">Select waiter</option>
                  {staffWaiters.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              ) : (
                <div className="text-sm text-gray-500">No waiters configured</div>
              )}
            </div>

            <div>
              <div className="text-sm font-medium mb-2 text-gray-800 dark:text-gray-200">Select Table</div>
              {tableList.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2.5 max-h-[26rem] overflow-y-auto p-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-950/60">
                  {tableList.map((t, idx) => {
                    const name = tableName(t)
                    if (!name) return null
                    const floor = String(t.floor || '').trim()
                    const isSelected = selectedName === name
                    const busy = occupied.has(name)
                    const tileTone = busy
                      ? (isSelected
                        ? 'bg-yellow-400 border-yellow-700 text-yellow-950 ring-2 ring-yellow-700 ring-offset-1 shadow-md'
                        : 'bg-yellow-300 border-yellow-500 text-yellow-950 hover:bg-yellow-400')
                      : (isSelected
                        ? 'bg-blue-600 border-blue-800 text-white ring-2 ring-blue-500 ring-offset-1 shadow-md'
                        : 'bg-blue-500 border-blue-700 text-white hover:bg-blue-600')

                    return (
                      <button
                        key={`${name}-${t.id || idx}`}
                        type="button"
                        onClick={() => setKotTable(name)}
                        aria-pressed={isSelected}
                        aria-label={`${name}${floor ? `, ${floor}` : ''}, ${busy ? 'occupied' : 'available'}`}
                        title={busy ? 'Occupied' : 'Available'}
                        className={`relative min-h-[4.25rem] sm:min-h-[4.75rem] rounded-lg border-2 px-2 py-2 select-none transition-all duration-150 text-center ${tileTone}`}
                      >
                        <div className="flex h-full flex-col items-center justify-center gap-0.5">
                          <span className="font-bold text-sm sm:text-base uppercase leading-tight line-clamp-2">{name}</span>
                          {floor ? (
                            <span className={`text-[10px] sm:text-xs font-medium truncate max-w-full ${busy ? 'text-yellow-900/80' : 'text-white/90'}`}>
                              {floor}
                            </span>
                          ) : null}
                          <span className={`mt-0.5 text-[9px] sm:text-[10px] font-semibold tracking-wide uppercase ${busy ? 'text-yellow-900/70' : 'text-white/80'}`}>
                            {busy ? 'Occupied' : 'Free'}
                          </span>
                        </div>
                        {isSelected ? (
                          <span className={`absolute top-1 right-1 h-2.5 w-2.5 rounded-full ${busy ? 'bg-yellow-900' : 'bg-white'}`} aria-hidden />
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="text-sm text-gray-500">No tables configured</div>
              )}
              {selectedName ? (
                <div className="mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                  Selected: <span className="font-semibold text-gray-900 dark:text-gray-100">{selectedName}</span>
                  {occupied.has(selectedName) ? <span className="ml-2 text-amber-700 dark:text-amber-300">(currently occupied)</span> : null}
                </div>
              ) : null}
            </div>
          </div>
        )}

        <label className="block text-sm text-gray-800 dark:text-gray-200">
          Remarks
          <textarea
            rows={3}
            className="mt-1 px-3 py-2.5 border rounded-lg w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white dark:border-gray-600"
            value={kotRemarks || ''}
            onChange={(e) => setKotRemarks(e.target.value)}
            placeholder="Any special instructions"
          />
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2.5 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
            Cancel
          </button>
          <button
            type="button"
            onClick={submitKotSelection}
            className={`px-5 py-2.5 rounded-lg text-white font-medium ${submitting ? 'bg-green-400 cursor-not-allowed opacity-60' : 'bg-green-600 hover:bg-green-500'}`}
            disabled={Boolean(submitting)}
          >
            {submitting ? 'Submitting…' : 'Submit Order'}
          </button>
        </div>
      </div>
    </div>
  )
}
