import React, { useEffect, useRef, useState } from 'react'

export default function BillSummary({
  orderType,
  setOrderType,
  orderTypeDisabled = false,
  holdSale,
  setShowHeld,
  heldCount = 0,
  // Payment method
  paymentMethod = 'cash',
  setPaymentMethod = ()=>{},
  // Totals & discounts
  totalItems = 0,
  totalQty = 0,
  subTotal = 0,
  itemsDiscount = 0,
  billDiscPct = 0,
  billDiscAmt = 0,
  onBillDiscPctChange = ()=>{},
  onBillDiscAmtChange = ()=>{},
  taxPct = 0,
  taxAmt = 0,
  onTaxPctChange = ()=>{},
  onTaxAmtChange = ()=>{},
  servicePct = 0,
  serviceAmt = 0,
  onServicePctChange = ()=>{},
  onServiceAmtChange = ()=>{},
  totalPayment = 0,
  // Cash received and change
  cashReceived = 0,
  onCashReceivedChange = ()=>{},
}) {
  // Local controlled string for Bill Disc (PKR) to avoid keystroke misinterpretation
  const [billAmtStr, setBillAmtStr] = useState(String(Math.floor(billDiscAmt||0)))
  const billAmtTimer = useRef(null)
  const [isAmtFocused, setIsAmtFocused] = useState(false)
  // Local controlled string for Cash Received
  const [cashReceivedStr, setCashReceivedStr] = useState(String(Math.floor(cashReceived||0)))
  const [isCashFocused, setIsCashFocused] = useState(false)
  useEffect(() => {
    // keep in sync when parent updates (cart changes, etc.), but don't fight the user's typing
    if (!isAmtFocused) {
      setBillAmtStr(String(Math.floor(billDiscAmt||0)))
    }
  }, [billDiscAmt, isAmtFocused])
  useEffect(() => {
    // keep cash received in sync with parent
    if (!isCashFocused) {
      setCashReceivedStr(String(Math.floor(cashReceived||0)))
    }
  }, [cashReceived, isCashFocused])
  // Calculate change due
  const changeDue = Math.max(0, (Number(cashReceived)||0) - (Number(totalPayment)||0))
  return (
    <div className="border-2 border-amber-200 rounded-lg p-2 space-y-2 bg-gradient-to-br from-amber-50/60 to-white dark:from-amber-950/30 dark:to-gray-900 dark:border-amber-800 shadow-sm lg:overflow-y-auto lg:min-h-0">
      {/* Order Type buttons row */}
      <div className="flex flex-wrap gap-1.5">
        {['Dine-in','Take-away','Delivery','Drive-thru'].map((t)=> (
          <button
            key={t}
            type="button"
            disabled={orderTypeDisabled}
            onClick={()=>{ if (!orderTypeDisabled) setOrderType(t) }}
            className={`flex-1 min-w-[80px] px-2 py-2 rounded-lg border-2 text-xs font-semibold transition-all duration-150 ${
              orderTypeDisabled ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-400' : (
                t==='Dine-in' ? (orderType===t ? 'bg-gradient-to-br from-sky-500 to-sky-600 text-white border-sky-400 shadow-md scale-105' : 'bg-white border-sky-200 text-sky-700 hover:bg-sky-50 dark:bg-gray-800 dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-900/30') :
                t==='Take-away' ? (orderType===t ? 'bg-gradient-to-br from-amber-500 to-amber-600 text-white border-amber-400 shadow-md scale-105' : 'bg-white border-amber-200 text-amber-700 hover:bg-amber-50 dark:bg-gray-800 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/30') :
                t==='Delivery' ? (orderType===t ? 'bg-gradient-to-br from-green-500 to-green-600 text-white border-green-400 shadow-md scale-105' : 'bg-white border-green-200 text-green-700 hover:bg-green-50 dark:bg-gray-800 dark:border-green-700 dark:text-green-300 dark:hover:bg-green-900/30') :
                (orderType===t ? 'bg-gradient-to-br from-purple-500 to-purple-600 text-white border-purple-400 shadow-md scale-105' : 'bg-white border-purple-200 text-purple-700 hover:bg-purple-50 dark:bg-gray-800 dark:border-purple-700 dark:text-purple-300 dark:hover:bg-purple-900/30')
              )
            }`}
          >{t}</button>
        ))}
      </div>
      {/* Payment Method buttons row */}
      <div className="flex flex-wrap gap-1.5">
        {[{key:'cash',label:'Cash',active:'from-emerald-500 to-emerald-600',border:'border-emerald-400',inactive:'border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/30'},{key:'online',label:'Online',active:'from-blue-500 to-blue-600',border:'border-blue-400',inactive:'border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/30'},{key:'complimentary',label:'Personal',active:'from-rose-500 to-rose-600',border:'border-rose-400',inactive:'border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-900/30'}].map((pm)=> (
          <button
            key={pm.key}
            type="button"
            onClick={()=> setPaymentMethod(pm.key)}
            className={`flex-1 min-w-[70px] px-2 py-2 rounded-lg border-2 text-xs font-semibold transition-all duration-150 ${
              paymentMethod===pm.key
                ? `bg-gradient-to-br ${pm.active} text-white ${pm.border} shadow-md scale-105`
                : `bg-white ${pm.inactive}`
            }`}
          >{pm.label}</button>
        ))}
      </div>
      <div className="flex gap-1.5">
        <button type="button" className="flex-1 px-2 py-1.5 bg-amber-500 text-white rounded text-xs sm:text-sm dark:bg-amber-700" onClick={holdSale}>Hold sale</button>
        <button type="button" className="flex-1 px-2 py-1.5 bg-slate-400 text-white rounded text-xs sm:text-sm dark:bg-slate-600" onClick={()=>setShowHeld(true)}>
          Load held{typeof heldCount==='number' ? ` (${heldCount})` : ''}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs sm:text-sm">
        <div className="text-gray-600 dark:text-gray-400">Total Items:</div>
        <div className="text-right dark:text-gray-100">{totalItems}</div>
        <div className="text-gray-600 dark:text-gray-400">Total Qty • Sub Total:</div>
        <div className="text-right dark:text-gray-100">{totalQty} • {subTotal.toFixed(2)}</div>
        <div className="text-gray-600 dark:text-gray-400">Total Tax:</div>
        <div className="text-right dark:text-gray-100">{taxAmt.toFixed(2)}</div>
        <div className="text-gray-600 dark:text-gray-400">Amount inc Tax:</div>
        <div className="text-right dark:text-gray-100">{(subTotal + taxAmt + serviceAmt - itemsDiscount - billDiscAmt).toFixed(2)}</div>
        <div className="text-gray-600 dark:text-gray-400">Total Items Discount:</div>
        <div className="text-right dark:text-gray-100">{itemsDiscount.toFixed(2)}</div>
        <div className="text-gray-600 dark:text-gray-400">Bill Disc (%):</div>
        <div className="flex items-center justify-end gap-2">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className="w-20 px-2 py-1 border rounded text-right bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600"
            value={String(Math.floor(billDiscPct||0))}
            onChange={e=>{
              const raw = (e.target.value||'').replace(/\D+/g,'')
              const v = parseInt(raw||'0',10)
              onBillDiscPctChange(isNaN(v) ? 0 : Math.min(100, Math.max(0, v)))
            }}
          />
          <span>%</span>
        </div>
        <div className="text-gray-600 dark:text-gray-400">Bill Disc Amount (PKR):</div>
        <div className="flex items-center justify-end gap-2">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className="w-28 px-2 py-1 border rounded text-right bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600"
            value={billAmtStr}
            onChange={e=>{
              const raw = (e.target.value||'').replace(/\D+/g, '')
              setBillAmtStr(raw)
              const v = parseInt((raw||'').replace(/\D+/g, '')||'0', 10)
              const base = Math.max(0, Math.floor(subTotal - itemsDiscount))
              const clamped = Math.min(base, Math.max(0, isNaN(v) ? 0 : v))
              onBillDiscAmtChange(clamped)
            }}
            onFocus={()=> setIsAmtFocused(true)}
            onBlur={() => {
              const v = parseInt((billAmtStr||'').replace(/\D+/g, '')||'0', 10)
              const base = Math.max(0, Math.floor(subTotal - itemsDiscount))
              const clamped = Math.min(base, Math.max(0, isNaN(v) ? 0 : v))
              onBillDiscAmtChange(clamped)
              setBillAmtStr(String(clamped))
              setIsAmtFocused(false)
            }}
          />
          <span>PKR</span>
        </div>
        <div className="text-gray-600 dark:text-gray-400">Ser Charges (PKR):</div>
        <div className="flex items-center justify-end gap-2">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className="w-28 px-2 py-1 border rounded text-right bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600"
            value={String(Math.trunc(serviceAmt)||0)}
            onChange={e=>{
              const raw = (e.target.value||'').replace(/\D+/g,'')
              onServiceAmtChange(parseInt(raw||'0',10)||0)
            }}
          />
          <span>PKR</span>
        </div>
        <div className="text-gray-600 dark:text-gray-400">Tax (PKR):</div>
        <div className="flex items-center justify-end gap-2">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className="w-28 px-2 py-1 border rounded text-right bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600"
            value={String(Math.trunc(taxAmt)||0)}
            onChange={e=>{
              const raw = (e.target.value||'').replace(/\D+/g,'')
              onTaxAmtChange(parseInt(raw||'0',10)||0)
            }}
          />
          <span>PKR</span>
        </div>
      </div>
      <div className="text-base sm:text-lg font-semibold">Total Payment: <span className="float-right">PKRs {totalPayment.toFixed(2)}</span></div>
      
      {/* Cash Received and Change Due — hidden for Personal */}
      {paymentMethod !== 'complimentary' ? (
      <div className="border-t border-amber-200 dark:border-amber-800 pt-2 mt-2 space-y-2">
        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs sm:text-sm">
          <div className="text-gray-600 dark:text-gray-400 font-medium text-xs sm:text-sm">Cash Received (PKR):</div>
          <div className="flex items-center justify-end gap-2">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className="w-28 px-2 py-1 border rounded text-right bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600"
              value={cashReceivedStr}
              onChange={e=>{
                const raw = (e.target.value||'').replace(/\D+/g, '')
                setCashReceivedStr(raw)
                const v = parseInt((raw||'').replace(/\D+/g, '')||'0', 10)
                onCashReceivedChange(isNaN(v) ? 0 : Math.max(0, v))
              }}
              onFocus={()=> setIsCashFocused(true)}
              onBlur={() => {
                const v = parseInt((cashReceivedStr||'').replace(/\D+/g, '')||'0', 10)
                const clamped = Math.max(0, isNaN(v) ? 0 : v)
                onCashReceivedChange(clamped)
                setCashReceivedStr(String(clamped))
                setIsCashFocused(false)
              }}
            />
            <span>PKR</span>
          </div>
        </div>
        {changeDue > 0 && (
          <div className="text-base sm:text-lg font-semibold text-green-600 dark:text-green-400">
            Change Due: <span className="float-right">PKRs {changeDue.toFixed(2)}</span>
          </div>
        )}
      </div>
      ) : (
      <div className="border-t border-rose-200 dark:border-rose-800 pt-2 mt-2">
        <div className="text-xs sm:text-sm font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 rounded px-2 py-1.5">
          Personal order — no payment collected
        </div>
      </div>
      )}
    </div>
  )
}
