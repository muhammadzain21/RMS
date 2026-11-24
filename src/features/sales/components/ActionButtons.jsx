import React from 'react'

const btn =
  'px-2 py-2 rounded-lg text-white shadow-sm hover:shadow-md transition-all hover:scale-105 active:scale-95 font-semibold text-xs sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100'

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
  onPrintRecall,
  isSubmittingKOT = false,
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {!hasActiveRecall && (
        <button type="button" className={`${btn} bg-gradient-to-br from-slate-500 to-slate-600`} onClick={discardSale}>
          Discard
        </button>
      )}
      <button type="button" className={`${btn} bg-gradient-to-br from-sky-500 to-sky-600`} onClick={onOpenRecall}>
        Recall
      </button>
      <button
        type="button"
        disabled={isSubmittingKOT}
        className={`${btn} bg-gradient-to-br from-emerald-500 to-emerald-600`}
        onClick={onKot}
        aria-busy={isSubmittingKOT}
      >
        KOT
      </button>
      <button type="submit" className={`${btn} bg-gradient-to-br from-green-500 to-green-600`}>
        Pay
      </button>

      {hasActiveRecall && (
        <>
          <button type="button" className={`${btn} bg-gradient-to-br from-slate-500 to-slate-600`} onClick={onCancelRecall}>
            Cancel
          </button>
          <button type="button" className={`${btn} bg-gradient-to-br from-red-500 to-red-600`} onClick={onVoidRecall}>
            Void
          </button>
          <button type="button" className={`${btn} bg-gradient-to-br from-amber-500 to-amber-600`} onClick={onChangeTableRecall}>
            Change Table
          </button>
          <button type="button" className={`${btn} bg-gradient-to-br from-blue-500 to-blue-600`} onClick={onUpdateRecall}>
            Update
          </button>
          <button type="button" className={`${btn} bg-gradient-to-br from-purple-500 to-purple-600 sm:col-span-1`} onClick={onPrintRecall}>
            Print
          </button>
        </>
      )}
    </div>
  )
}
