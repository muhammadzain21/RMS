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
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-6">
  <div className="w-full max-w-5xl max-h-[92vh] overflow-y-auto bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-xl p-5 sm:p-6 space-y-5 shadow-xl">
   <div className="flex items-center justify-between gap-3">
    <div className="text-2xl sm:text-3xl font-semibold dark:text-gray-100">Select Order Details</div>
    <button type="button" onClick={onClose} className="text-gray-500 dark:text-gray-400 text-xl leading-none px-2">×</button>
   </div>
   {orderType === 'Dine-in' && (
    <div className="space-y-5">
     {/* Waiter */}
     <div>
      <div className="text-sm font-medium mb-1">Waiter (optional)</div>
      {Array.isArray(staffWaiters) && staffWaiters.length > 0 ? (
       <select className="px-3 py-2.5 border rounded-lg w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white dark:border-gray-600" value={kotWaiterId} onChange={e=>setKotWaiterId(e.target.value)}>
        <option value="">Select waiter</option>
        {staffWaiters.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
       </select>
      ) : (
       <div className="text-sm text-gray-500">No waiters configured</div>
      )}
     </div>

     {/* Table selection */}
     <div>
      <div className="text-sm font-medium mb-2 dark:text-gray-200">Select Table:</div>
      {Array.isArray(tables) && tables.length > 0 ? (
       <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3 max-h-[28rem] overflow-y-auto p-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-950 shadow-sm">
        {tables.map(t => {
         const name = t.name || t.label || t.code || String(t)
         const floor = t.floor || ''
         const imageUrl = t.imageUrl || ''
         const displayLabel = floor ? `${name} / ${floor}` : name
         const isSelected = String(kotTable||'') === name
         const busy = Boolean(t.occupied || t.busy || (occupiedTables instanceof Set && occupiedTables.has(String(name))))
         const tileTone = busy
          ? (isSelected
            ? 'bg-yellow-400 border-yellow-500 text-yellow-950 shadow-md shadow-yellow-500/30 scale-105'
            : 'bg-yellow-300 border-yellow-400 text-yellow-950 hover:bg-yellow-400')
          : (isSelected
            ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white border-blue-500 shadow-md shadow-blue-500/20 scale-105'
            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-100 border-gray-200 dark:border-gray-600 hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-gray-700')
         return (
          <div key={name} className="flex flex-col items-center gap-0.5">
           <button
            type="button"
            onClick={()=> setKotTable(name)}
            className={`w-full h-[88px] sm:h-[100px] md:h-[112px] rounded-lg border-2 overflow-hidden select-none transition-all duration-200 p-1 ${tileTone}`}
            title={busy ? 'Occupied (selecting will still proceed)' : 'Available'}
           >
            {imageUrl ? (
             <div className="relative w-full h-full">
              <img
               src={imageUrl}
               alt={name}
               className="w-full h-full object-cover"
               onError={(e) => { e.target.style.display = 'none' }}
              />
              {busy && <div className="absolute inset-0 bg-yellow-400/70" />}
             </div>
            ) : (
             <div className="w-full h-full flex items-center justify-center font-bold text-sm sm:text-base md:text-lg uppercase leading-tight text-center break-words">
              {name}
             </div>
            )}
           </button>
           {imageUrl && <span className="font-bold text-xs sm:text-sm uppercase leading-tight break-words text-center text-gray-700 dark:text-gray-200 w-full">{displayLabel}</span>}
          </div>
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
    <textarea rows={3} className="mt-1 px-3 py-2.5 border rounded-lg w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white dark:border-gray-600" value={kotRemarks} onChange={e=>setKotRemarks(e.target.value)} placeholder="Any special instructions" />
   </label>
   <div className="flex justify-end gap-2">
    <button type="button" onClick={onClose} className="px-4 py-2.5 border rounded-lg">Cancel</button>
    <button
     type="button"
     onClick={submitKotSelection}
     className={`px-5 py-2.5 rounded-lg text-white ${submitting ? 'bg-green-400 cursor-not-allowed opacity-60' : 'bg-green-600'}`}
     disabled={Boolean(submitting)}
    >
     {submitting ? 'Submitting…' : 'Submit Order'}
    </button>
   </div>
  </div>
 </div>
 )
}
