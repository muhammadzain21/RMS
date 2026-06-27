import React from 'react'

export default function DealModal({
  open,
  onClose,
  dealBaseItem,
  dealSize,
  pizzaFlavours = [],
  dealFlavours = [],
  setDealFlavours,
  dealSelectedCount = 0,
  addDealToCart,
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-3xl bg-white dark:bg-gray-900 border rounded p-4 space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="text-lg font-semibold">Modifier Groups</div>
          <div className="flex items-center gap-2 text-sm">
            <span>Qty</span>
            <input type="number" min={1} value={1} readOnly className="w-16 px-2 py-1 border rounded bg-gray-100" />
          </div>
        </div>
        <div className="text-center font-bold text-blue-600">{(dealBaseItem?.name || 'Deal').toUpperCase()} ({dealSize})</div>

        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-3">
            <div className="border rounded p-2 text-center font-medium bg-green-600 text-white">DEAL FLAVOUR ({dealSize})</div>
          </div>
          <div className="col-span-6">
            <div className="grid grid-cols-3 gap-2 max-h-[360px] overflow-y-auto p-1">
              {pizzaFlavours.map(f => {
                const selected = dealFlavours.some(x => x && x.id===f.id)
                const disabled = !selected && dealSelectedCount >= 2
                return (
                  <button key={f.id} type="button"
                    disabled={disabled}
                    className={`h-16 rounded border text-center text-sm font-semibold transition-colors ${selected ? 'bg-amber-600 text-white border-amber-700 ring-2 ring-sky-300' : disabled ? 'opacity-40 cursor-not-allowed bg-amber-200 border-amber-300' : 'bg-amber-500 text-white hover:bg-amber-600 border-amber-700'}`}
                    onClick={()=>{
                      setDealFlavours(prev => {
                        // Allow selecting the same flavour twice. If already selected once, fill the next empty slot.
                        const count = prev.filter(x => x && x.id===f.id).length
                        if (count >= 2) return prev
                        const idx = prev.findIndex(x => !x)
                        if (idx===-1) return prev
                        const cp = [...prev]
                        cp[idx] = f
                        return cp
                      })
                    }}
                  >
                    <div className="leading-tight px-1 uppercase">
                      <div className="truncate">{f.name}</div>
                      <div className="text-[10px] opacity-90">({dealSize})</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="col-span-3">
            <div className="border rounded p-2 text-sm">
              <div className="font-medium mb-2">Selected Items</div>
              <div className="text-xs space-y-2">
                {dealFlavours.map((f,i)=> (
                  f ? (
                    <div key={i} className="relative p-3 rounded-lg bg-sky-500 text-white shadow flex items-center justify-between">
                      <div className="font-semibold uppercase leading-tight">
                        <div className="truncate max-w-[150px]">{f.name}</div>
                        <div className="text-[10px] opacity-90">({dealSize})</div>
                      </div>
                      <button
                        type="button"
                        className="ml-2 w-6 h-6 rounded-full bg-black/30 hover:bg-black/40 flex items-center justify-center text-xs"
                        onClick={()=> setDealFlavours(prev=>{ const cp=[...prev]; cp[i]=null; return cp; })}
                        aria-label="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div key={i} className="p-3 rounded-lg bg-gray-100 text-gray-400 text-center border border-dashed">Empty slot</div>
                  )
                ))}
                {dealSelectedCount<2 && (
                  <div className="text-gray-500">Select {2-dealSelectedCount} more</div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 border rounded">Cancel</button>
          <button type="button" disabled={dealSelectedCount!==2} onClick={addDealToCart} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">Add</button>
        </div>
      </div>
    </div>
  )
}
