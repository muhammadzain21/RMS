import React, { useEffect, useRef, useState } from 'react'
import BankPaymentDialog, { bankChannelLabel } from './BankPaymentDialog.jsx'
import CardPaymentDialog from './CardPaymentDialog.jsx'
import StaffPaymentDialog from './StaffPaymentDialog.jsx'

const ORDER_TYPES = ['Dine-in', 'Take-away', 'Delivery', 'Foodpanda']

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
  // Bank transfer details
  bankChannel = 'bank_account',
  setBankChannel = ()=>{},
  bankLast4 = '',
  setBankLast4 = ()=>{},
  bankRef = '',
  setBankRef = ()=>{},
  // Staff purchase details
  staff = [],
  staffId = '',
  setStaffId = ()=>{},
  staffName = '',
  setStaffName = ()=>{},
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
  deliveryAmt = 0,
  onDeliveryAmtChange = ()=>{},
  totalPayment = 0,
  // Amount customer paid (cash) — excess becomes waiter tip / pay-out
  cashReceived = 0,
  onCashReceivedChange = ()=>{},
  // Settings: show Personal (complimentary) payment option
  showPersonalPayment = false,
  // Settings Restriction tab — which bill fields appear on Sell (default all hidden)
  sellPageFields = {},
}) {
  const fields = {
    totalTax: false,
    amountIncTax: false,
    totalItemsDiscount: false,
    billDiscPct: false,
    billDiscAmt: false,
    serviceCharges: false,
    taxAmt: false,
    ...(sellPageFields || {}),
  }
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
  // Excess cash received over bill = waiter tip (auto pay-out on finalize)
  const tipAmount = paymentMethod === 'cash'
    ? Math.max(0, (Number(cashReceived) || 0) - (Number(totalPayment) || 0))
    : 0
  // Bank details dialog
  const [showBankDialog, setShowBankDialog] = useState(false)
  const [showCardDialog, setShowCardDialog] = useState(false)
  // Staff purchase dialog
  const [showStaffDialog, setShowStaffDialog] = useState(false)
  const selectMethod = (key) => {
    setPaymentMethod(key)
    if (key === 'bank') setShowBankDialog(true)
    if (key === 'card') setShowCardDialog(true)
    if (key === 'staff') setShowStaffDialog(true)
  }
  // When restriction fields are off, Delivery / Total / Amount move up.
  // Invisible row spacers at the bottom keep bill+cart height stable.
  const hiddenFieldCount = [
    fields.totalTax,
    fields.amountIncTax,
    fields.totalItemsDiscount,
    fields.billDiscPct,
    fields.billDiscAmt,
    fields.serviceCharges,
    fields.taxAmt,
  ].filter(v => !v).length

  return (
    <div className="border-2 border-amber-200 rounded-lg p-2 space-y-2 bg-gradient-to-br from-amber-50/60 to-white dark:from-amber-950/30 dark:to-gray-900 dark:border-amber-800 shadow-sm lg:overflow-y-auto lg:min-h-0 lg:flex-shrink-0">
      {/* Order Type buttons row */}
      <div className="flex flex-wrap gap-1.5">
        {ORDER_TYPES.map((t)=> (
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
                (orderType===t ? 'bg-gradient-to-br from-pink-500 to-pink-600 text-white border-pink-400 shadow-md scale-105' : 'bg-white border-pink-200 text-pink-700 hover:bg-pink-50 dark:bg-gray-800 dark:border-pink-700 dark:text-pink-300 dark:hover:bg-pink-900/30')
              )
            }`}
          >{t}</button>
        ))}
      </div>
      {/* Payment Method buttons row */}
      <div className="flex flex-wrap gap-1.5">
        {[
          {key:'cash',label:'Cash',active:'from-emerald-500 to-emerald-600',border:'border-emerald-400',inactive:'border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/30'},
          {key:'bank',label:'Bank',active:'from-blue-500 to-blue-600',border:'border-blue-400',inactive:'border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/30'},
          {key:'card',label:'Card',active:'from-indigo-500 to-indigo-600',border:'border-indigo-400',inactive:'border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-900/30'},
          ...(showPersonalPayment ? [{key:'complimentary',label:'Personal',active:'from-rose-500 to-rose-600',border:'border-rose-400',inactive:'border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-900/30'}] : []),
          {key:'staff',label:'Staff',active:'from-violet-500 to-violet-600',border:'border-violet-400',inactive:'border-violet-200 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-900/30'},
        ].map((pm)=> (
          <button
            key={pm.key}
            type="button"
            onClick={()=> selectMethod(pm.key)}
            className={`flex-1 min-w-[70px] px-2 py-2 rounded-lg border-2 text-xs font-semibold transition-all duration-150 ${
              paymentMethod===pm.key
                ? `bg-gradient-to-br ${pm.active} text-white ${pm.border} shadow-md scale-105`
                : `bg-white ${pm.inactive}`
            }`}
          >{pm.label}</button>
        ))}
      </div>
      {/* Bank summary chip — tap to edit destination / digits */}
      {paymentMethod === 'bank' && (
        <button
          type="button"
          onClick={()=> setShowBankDialog(true)}
          className="w-full flex items-center justify-between rounded-lg border-2 border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/30 px-3 py-2 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
        >
          <span>{`${bankChannelLabel(bankChannel) || 'Set bank details'}${bankLast4 ? ` ····${bankLast4}` : ''}`}</span>
          <span className="text-[10px] underline">Edit</span>
        </button>
      )}
      <BankPaymentDialog
        open={showBankDialog}
        channel={bankChannel}
        last4={bankLast4}
        onConfirm={({ channel, last4 })=>{ setBankChannel(channel); setBankLast4(last4); setBankRef(''); setShowBankDialog(false) }}
        onCancel={()=>{ setShowBankDialog(false); if (!bankLast4) setPaymentMethod('cash') }}
      />
      {/* Credit card chip */}
      {paymentMethod === 'card' && (
        <button
          type="button"
          onClick={()=> setShowCardDialog(true)}
          className="w-full flex items-center justify-between rounded-lg border-2 border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/30 px-3 py-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
        >
          <span>{bankLast4 ? `Card ····${bankLast4}` : 'Set card last 4 digits'}</span>
          <span className="text-[10px] underline">Edit</span>
        </button>
      )}
      <CardPaymentDialog
        open={showCardDialog}
        last4={bankLast4}
        onConfirm={({ last4 })=>{ setBankLast4(last4); setBankChannel(''); setBankRef(''); setShowCardDialog(false) }}
        onCancel={()=>{ setShowCardDialog(false); if (!bankLast4) setPaymentMethod('cash') }}
      />
      {/* Staff purchase chip — tap to change staff member */}
      {paymentMethod === 'staff' && (
        <button
          type="button"
          onClick={()=> setShowStaffDialog(true)}
          className="w-full flex items-center justify-between rounded-lg border-2 border-violet-200 dark:border-violet-800 bg-violet-50/70 dark:bg-violet-950/30 px-3 py-2 text-xs font-semibold text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors"
        >
          <span>{staffName ? `${staffName} — salary deduct unless paid` : 'Select staff member'}</span>
          <span className="text-[10px] underline">Edit</span>
        </button>
      )}
      <StaffPaymentDialog
        open={showStaffDialog}
        staff={staff}
        staffId={staffId}
        onConfirm={({ staffId: sid, staffName: sname })=>{ setStaffId(sid); setStaffName(sname); setShowStaffDialog(false) }}
        onCancel={()=>{ setShowStaffDialog(false); if (!staffId) setPaymentMethod('cash') }}
      />
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
        {fields.totalTax && (
          <>
            <div className="text-gray-600 dark:text-gray-400">Total Tax:</div>
            <div className="text-right dark:text-gray-100">{taxAmt.toFixed(2)}</div>
          </>
        )}
        {fields.amountIncTax && (
          <>
            <div className="text-gray-600 dark:text-gray-400">Amount inc Tax:</div>
            <div className="text-right dark:text-gray-100">{(subTotal + taxAmt + serviceAmt + deliveryAmt - itemsDiscount - billDiscAmt).toFixed(2)}</div>
          </>
        )}
        {fields.totalItemsDiscount && (
          <>
            <div className="text-gray-600 dark:text-gray-400">Total Items Discount:</div>
            <div className="text-right dark:text-gray-100">{itemsDiscount.toFixed(2)}</div>
          </>
        )}
        {fields.billDiscPct && (
          <>
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
          </>
        )}
        {fields.billDiscAmt && (
          <>
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
          </>
        )}
        {fields.serviceCharges && (
          <>
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
          </>
        )}
        {fields.taxAmt && (
          <>
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
          </>
        )}
        <div className="text-gray-600 dark:text-gray-400">Delivery Charges (PKR):</div>
        <div className="flex items-center justify-end gap-2">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className="w-28 px-2 py-1 border rounded text-right bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600"
            value={String(Math.trunc(deliveryAmt)||0)}
            onChange={e=>{
              const raw = (e.target.value||'').replace(/\D+/g,'')
              onDeliveryAmtChange(parseInt(raw||'0',10)||0)
            }}
          />
          <span>PKR</span>
        </div>
      </div>
      <div className="text-base sm:text-lg font-semibold">Total Payment: <span className="float-right">PKRs {totalPayment.toFixed(2)}</span></div>
      
      {/* Amount received — cash only; excess = waiter tip (auto pay-out) */}
      {paymentMethod === 'cash' ? (
      <div className="border-t border-amber-200 dark:border-amber-800 pt-2 mt-2 space-y-2">
        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs sm:text-sm">
          <div className="text-gray-600 dark:text-gray-400 font-medium text-xs sm:text-sm">
            Amount Received (PKR)
            <div className="text-[10px] font-normal text-gray-400">Customer paid total</div>
          </div>
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
        {tipAmount > 0 && (
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1.5">
            <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              Waiter Tip: <span className="float-right">PKRs {tipAmount.toFixed(2)}</span>
            </div>
            <div className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">
              Auto Pay Out on finalize — cash count stays balanced
            </div>
          </div>
        )}
      </div>
      ) : paymentMethod === 'staff' ? (
      <div className="border-t border-violet-200 dark:border-violet-800 pt-2 mt-2">
        <div className="text-xs sm:text-sm font-semibold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 rounded px-2 py-1.5">
          Staff purchase — deducted from salary unless paid earlier
        </div>
      </div>
      ) : paymentMethod === 'complimentary' ? (
      <div className="border-t border-rose-200 dark:border-rose-800 pt-2 mt-2">
        <div className="text-xs sm:text-sm font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 rounded px-2 py-1.5">
          Personal order — no payment collected
        </div>
      </div>
      ) : null}

      {/* Bottom padding so cart/bill height matches “all fields checked” layout */}
      {hiddenFieldCount > 0 && (
        <div
          aria-hidden
          className="pointer-events-none select-none"
          style={{ height: `${hiddenFieldCount * 1.75}rem` }}
        />
      )}
    </div>
  )
}
