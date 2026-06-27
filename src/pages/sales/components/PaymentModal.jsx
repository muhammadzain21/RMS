import React from 'react'

export default function PaymentModal({
  open,
  onClose,
  payType,
  setPayType,
  payName,
  setPayName,
  payPhone,
  setPayPhone,
  matchedCustomer,
  payAddress,
  setPayAddress,
  payRemarks,
  setPayRemarks,
  total,
  finalizeCash,
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg bg-white dark:bg-gray-900 border rounded p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">Process Payment</div>
          <button onClick={onClose} className="text-gray-500">✕</button>
        </div>
        <div className="flex gap-2">
          <button onClick={()=>setPayType('cash')} className={`px-3 py-1.5 rounded border ${payType==='cash'?'bg-gray-100 dark:bg-gray-800':''}`}>Cash</button>
        </div>
        {payType==='cash' && (
          <div className="space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <label className="block text-sm">Name<input className="mt-1 px-3 py-2 border rounded w-full bg-white text-gray-900" value={payName} onChange={e=>setPayName(e.target.value)} /></label>
              <label className="block text-sm">Phone<input className="mt-1 px-3 py-2 border rounded w-full bg-white text-gray-900" value={payPhone} onChange={e=>setPayPhone(e.target.value)} /></label>
            </div>
            {matchedCustomer && (
              <div className="text-xs text-green-700">Existing customer found: {matchedCustomer.name || 'Unnamed'} — address will auto-fill.</div>
            )}
            <label className="block text-sm">Address<textarea rows={2} className="mt-1 px-3 py-2 border rounded w-full bg-white text-gray-900" value={payAddress} onChange={e=>setPayAddress(e.target.value)} /></label>
            <label className="block text-sm">Remarks<textarea rows={2} className="mt-1 px-3 py-2 border rounded w-full bg-white text-gray-900" value={payRemarks} onChange={e=>setPayRemarks(e.target.value)} /></label>
            <div className="flex items-center justify-between">
              <div className="text-sm">Total to pay: <span className="font-semibold">${Number(total||0).toFixed(2)}</span></div>
              <div className="flex gap-2">
                <button onClick={onClose} className="px-4 py-2 border rounded">Cancel</button>
                <button onClick={finalizeCash} className="px-4 py-2 bg-green-600 text-white rounded">Confirm Cash</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
