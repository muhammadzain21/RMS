import React from 'react'

export default function ActionButtons({
  discardSale,
  onKot,
  submit,
  setPaymentMethod,
  onOpenRecall,
  hasActiveRecall = false,
  onCancelRecall,
  onVoidRecall,
  onChangeTableRecall,
  onUpdateRecall,
  isSubmittingKOT = false,
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <button type="button" className="px-2 py-2 rounded-lg bg-gradient-to-br from-slate-500 to-slate-600 text-white shadow-sm hover:shadow-md transition-all hover:scale-105 active:scale-95 font-semibold text-xs sm:text-sm" onClick={discardSale}>🗑️ Discard</button>
        <button type="button" className="px-2 py-2 rounded-lg bg-gradient-to-br from-sky-500 to-sky-600 text-white shadow-sm hover:shadow-md transition-all hover:scale-105 active:scale-95 font-semibold text-xs sm:text-sm" onClick={onOpenRecall}>📋 Recall</button>
        <button type="button" disabled={isSubmittingKOT} className="px-2 py-2 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-sm hover:shadow-md transition-all hover:scale-105 active:scale-95 font-semibold text-xs sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100" onClick={onKot} aria-busy={isSubmittingKOT}>🍽️ KOT</button>
        <button type="submit" className="px-2 py-2 rounded-lg bg-gradient-to-br from-green-500 to-green-600 text-white shadow-sm hover:shadow-md transition-all hover:scale-105 active:scale-95 font-semibold text-xs sm:text-sm">💳 Pay</button>
      </div>
      {hasActiveRecall && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <button type="button" className="px-2 py-2 rounded-lg bg-gradient-to-br from-slate-500 to-slate-600 text-white shadow-sm hover:shadow-md transition-all hover:scale-105 active:scale-95 font-semibold text-xs sm:text-sm" onClick={onCancelRecall}>❌ Cancel</button>
          <button type="button" className="px-2 py-2 rounded-lg bg-gradient-to-br from-red-500 to-red-600 text-white shadow-sm hover:shadow-md transition-all hover:scale-105 active:scale-95 font-semibold text-xs sm:text-sm" onClick={onVoidRecall}>⚠️ Void</button>
          <button type="button" className="px-2 py-2 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-sm hover:shadow-md transition-all hover:scale-105 active:scale-95 font-semibold text-xs sm:text-sm" onClick={onChangeTableRecall}>🪑 Change Table</button>
          <button type="button" className="px-2 py-2 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-sm hover:shadow-md transition-all hover:scale-105 active:scale-95 font-semibold text-xs sm:text-sm" onClick={onUpdateRecall}>💾 Update</button>
        </div>
      )}
    </div>
  )
}
