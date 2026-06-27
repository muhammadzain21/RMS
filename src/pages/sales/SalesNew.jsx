import { toast } from 'react-hot-toast'
import { useConfirm } from '../../components/useConfirm.jsx'
import React, { useMemo, useState, useEffect, useRef } from 'react'
import { useData } from '../../state/DataContext.jsx'
import { createLineTotal } from './utils.js'
import CategoryBar from './components/CategoryBar.jsx'
import ItemsList from './components/ItemsList.jsx'
import CartTable from './components/CartTable.jsx'
import BillSummary from './components/BillSummary.jsx'
import ActionButtons from './components/ActionButtons.jsx'
import RecallDialog from './components/RecallDialog.jsx'
import KotModal from './components/KotModal.jsx'
import DeliveryCustomerModal from './components/DeliveryCustomerModal.jsx'
import HeldDialog from './components/HeldDialog.jsx'
import VoidPreview from './components/VoidPreview.jsx'
import VoidReasonModal from './components/VoidReasonModal.jsx'
import SelectRiderModal from './components/SelectRiderModal.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { useNavigate } from 'react-router-dom'
import { printSaleReceiptUtil, openKotPrintUtil } from './printUtils.js'

export default function SalesNew() {
  const { state, dispatch, businessDate } = useData()
  const { token, user } = useAuth()
  const { confirm, ConfirmDialog } = useConfirm()
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
  const authHeaders = token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : { 'Content-Type': 'application/json' }
  const navigate = useNavigate()

  // Guard against double-submit and provide a stable idempotency key per KOT action
  const kotSubmittingRef = useRef(false)
  const kotActionKeyRef = useRef(null)
  const [kotSubmitting, setKotSubmitting] = useState(false)
  const ensureKotActionKey = () => {
    if (!kotActionKeyRef.current) kotActionKeyRef.current = `kot-${Date.now()}-${Math.random().toString(36).slice(2,8)}`
    return kotActionKeyRef.current
  }
  const clearKotActionKey = () => { kotActionKeyRef.current = null }

  useEffect(() => {
    try {
      const todayKey = String(businessDate || '').slice(0, 10)
      const closed = (Array.isArray(state.dayCloses) ? state.dayCloses : []).some(dc => (dc?.date || '') === todayKey)
      const canSell = Boolean(state?.daybook?.open)
      if (closed || !canSell) {
        toast.error(closed ? 'Day is closed. Open daybook to start selling.' : 'Daybook is not open. Please open daybook first.')
        navigate('/', { replace: true })
      }
    } catch {}
  }, [state.dayCloses, state?.daybook?.open, businessDate, navigate])

  // Left column UI state
  const categories = useMemo(() => (state.categories||[])
    .filter(c => c && c.active !== false && c.showOnPos !== false)
    .sort((a, b) => {
      const orderA = Number(a.sortOrder ?? 0)
      const orderB = Number(b.sortOrder ?? 0)
      if (orderA !== orderB) return orderA - orderB
      return String(a.name||'').localeCompare(String(b.name||''))
    }), [state.categories])
  const [selectedCategory, setSelectedCategory] = useState('')
  const [search, setSearch] = useState('')

  // Menu and filtered items
  const menu = state.menu || []
  const itemsInCategory = useMemo(() => {
    const cat = String(selectedCategory||'').trim().toLowerCase()
    let list = menu
    if (cat) list = list.filter(m => String(m.category||'').trim().toLowerCase() === cat)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(m => String(m.name||'').toLowerCase().includes(q))
    }
    // Sort by sortOrder (lower = first), then by name
    return [...list].sort((a, b) => {
      const orderA = Number(a.sortOrder ?? 0)
      const orderB = Number(b.sortOrder ?? 0)
      if (orderA !== orderB) return orderA - orderB
      return String(a.name||'').localeCompare(String(b.name||''))
    })
  }, [menu, selectedCategory, search])

  // Cart state
  const [items, setItems] = useState([]) // [{itemId, qty, mods?, custom?}]
  const addToCart = (itemId) => {
    setItems(prev => {
      const idx = prev.findIndex(it => it.itemId === itemId)
      return idx >= 0
        ? prev.map((it,i)=> i===idx ? { ...it, qty: it.qty + 1 } : it)
        : [...prev, { itemId, qty: 1 }]
    })
  }
  const updateItem = (idx, patch) => setItems(prev => prev.map((it,i)=> i===idx ? { ...it, ...patch } : it))
  const incQty = (idx) => updateItem(idx, { qty: items[idx].qty + 1 })
  const decQty = (idx) => updateItem(idx, { qty: Math.max(1, items[idx].qty - 1) })
  const removeItem = (idx) => setItems(prev => prev.filter((_,i)=> i!==idx))

  // Totals
  const lineTotal = useMemo(() => createLineTotal(state.settings?.modifiers || {}), [state.settings])
  const subTotal = useMemo(() => items.reduce((s, it) => {
    const m = menu.find(x=>x.id===it.itemId)
    return s + (lineTotal(m, it) || 0)
  }, 0), [items, menu, lineTotal])
  const totalItems = items.length
  const totalQty = items.reduce((s,it)=> s + Number(it.qty||0), 0)

  // Discounts/taxes (locals only for now)
  const [billDiscPct, setBillDiscPct] = useState(0)
  const [billDiscAmt, setBillDiscAmt] = useState(0)
  const [servicePct, setServicePct] = useState(0)
  const [serviceAmt, setServiceAmt] = useState(0)
  const [taxPct, setTaxPct] = useState(0)
  const [taxAmt, setTaxAmt] = useState(0)
  const itemsDiscount = 0
  const totalPayment = Math.max(0, subTotal - billDiscAmt - itemsDiscount + serviceAmt + taxAmt)

  // Cash received for payment
  const [cashReceived, setCashReceived] = useState(0)

  // Payment method
  const [paymentMethod, setPaymentMethod] = useState('cash')

  // Order type & held
  const [orderType, setOrderType] = useState('') // start with no selection; user must choose
  const [heldCount, setHeldCount] = useState(0)
  const [showHeld, setShowHeld] = useState(false)
  const [showRecall, setShowRecall] = useState(false)
  const [showKot, setShowKot] = useState(false)
  const [kotWaiterId, setKotWaiterId] = useState('')
  const [kotTable, setKotTable] = useState('')
  const [kotRemarks, setKotRemarks] = useState('')
  // Delivery customer modal state
  const [showDelivery, setShowDelivery] = useState(false)
  const [payName, setPayName] = useState('')
  const [payPhone, setPayPhone] = useState('')
  const [payAddress, setPayAddress] = useState('')
  // Active recalled order state
  const [activeRecall, setActiveRecall] = useState(null)
  // Track where the active order came from: 'recall' | 'held' | null
  const [activeRecallSource, setActiveRecallSource] = useState(null)
  const [showVoidPreview, setShowVoidPreview] = useState(false)
  const [showVoidReason, setShowVoidReason] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [kotMode, setKotMode] = useState('kot') // 'kot' | 'changeTable'
  // Select rider modal for paying delivery recalls
  const [showSelectRider, setShowSelectRider] = useState(false)
  const [recallToPay, setRecallToPay] = useState(null)

  // Actions (stubs)
  const resetAll = () => {
    // Cart and filters
    setItems([])
    setSelectedCategory('')
    setSearch('')
    // Payment method
    setPaymentMethod('cash')
    // Order type & dialogs
    setOrderType('')
    setShowHeld(false)
    setShowRecall(false)
    setShowKot(false)
    // Discounts/charges
    setBillDiscPct(0)
    setBillDiscAmt(0)
    setServicePct(0)
    setServiceAmt(0)
    setTaxPct(0)
    setTaxAmt(0)
    // Delivery info
    setShowDelivery(false)
    setPayName('')
    setPayPhone('')
    setPayAddress('')
    // KOT fields
    setKotWaiterId('')
    setKotTable('')
    setKotRemarks('')
    // Also clear recall source flag
    setActiveRecallSource(null)
    // Clear any pending KOT idempotency context
    clearKotActionKey()
    setKotSubmitting(false)
  }
  const discardSale = async () => { 
    if (!items.length) return; 
    const confirmed = await confirm({ title: 'Discard Sale', message: 'Discard current sale?' })
    if (!confirmed) return; 
    setItems([]) 
  }
  const onKot = async () => {
    if (!items.length) { toast.error('Add items before KOT'); return }
    if (!orderType) { toast.error('Please select an order type first'); return }
    
    // Refresh tables before showing modal to ensure newly added tables appear
    if (orderType === 'Dine-in') {
      try {
        const res = await fetch(`${API}/api/tables`, { headers: authHeaders, cache: 'no-store' })
        if (res.ok) {
          const rows = await res.json()
          dispatch({ type: 'HYDRATE', payload: { tables: Array.isArray(rows) ? rows : [] } })
        }
      } catch (e) { console.warn('Failed to refresh tables', e) }
    }

    // Always show the KOT modal so user can enter remarks, select waiter/table, etc.
    setShowKot(true)
  }
  const submit = (e) => {
    e.preventDefault()
    if (!items.length) return
    // Build a minimal order object similar to recall for unified payment flow
    const buildOrd = () => {
      const mappedItems = items.map(it => {
        const m = menu.find(x=>x.id===it.itemId)
        const price = m ? (lineTotal(m, { ...it, qty: 1 }) || 0) : Number(it.custom?.price || 0)
        return { itemId: it.itemId, name: it.custom?.name || m?.name || '', price, qty: Number(it.qty||1), mods: it.mods||{}, custom: it.custom||null }
      })
      const subtotalLocal = mappedItems.reduce((s,it)=> s + Number(it.price||0) * Number(it.qty||0), 0)
      const totalQtyLocal = mappedItems.reduce((s,it)=> s + Number(it.qty||0), 0)
      return {
        createdAt: Date.now(),
        orderType,
        items: mappedItems,
        waiterId: orderType==='Dine-in' ? kotWaiterId : '',
        tableNo: orderType==='Dine-in' ? kotTable : '',
        customer: orderType==='Delivery'
          ? {
              name: (payName || (activeRecallSource==='recall' ? (activeRecall?.customer?.name || '') : '')),
              phone: (payPhone || (activeRecallSource==='recall' ? (activeRecall?.customer?.phone || '') : '')),
              address: (payAddress || (activeRecallSource==='recall' ? (activeRecall?.customer?.address || '') : '')),
            }
          : null,
        totalQty: totalQtyLocal,
        subtotal: subtotalLocal,
        itemsDiscount: 0,
        billDiscount: Number(billDiscAmt||0),
        taxAmt: Number(taxAmt||0),
        serviceAmt: Number(serviceAmt||0),
        totalAmount: Math.max(0, subtotalLocal - Number(billDiscAmt||0) + Number(taxAmt||0) + Number(serviceAmt||0)),
        remarks: kotRemarks || '',
      }
    }
    const ord = buildOrd()
    // If this sale originated from a recalled order (blue Recall button),
    // carry over its id and identifiers so finalizePayment can delete it.
    if (activeRecallSource === 'recall' && (activeRecall?.id || activeRecall?._id)) {
      ord.id = activeRecall.id || activeRecall._id
      if (activeRecall.tokenNo) ord.tokenNo = activeRecall.tokenNo
    }
    ;(async ()=>{ await finalizePayment(ord, null) })()
  }
  const onOpenRecall = async () => {
    await refreshRecalls().catch(()=>{})
    setShowRecall(true)
  }

  // Recall data (in-memory from global state; adjust when backend is wired)
  const recalls = Array.isArray(state.recalls) ? state.recalls : []
  const staff = Array.isArray(state.staff) ? state.staff : []
  const riders = Array.isArray(state.riders) ? state.riders : []
  // Derive riders from staff page (position includes 'Rider' and status Active)
  const ridersFromStaff = useMemo(() => (
    (staff||[])
      .filter(s => String(s.position||'').toLowerCase().includes('rider') && String(s.status||'Active').toLowerCase() === 'active')
      .map(s => ({ id: s.id, name: s.name }))
  ), [staff])
  const helds = Array.isArray(state.helds) ? state.helds : []
  // Tables can come either from state.tables or settings.tables depending on auth/hydration
  const tables = Array.isArray(state.tables) && state.tables.length
    ? state.tables
    : (Array.isArray(state.settings?.tables) ? state.settings.tables.map(t => (typeof t === 'string' ? { name: t } : t)) : [])
  // Helper: compute next token number based on BUSINESS DAY max token from recalls or sales
  const getNextTokenNo = () => {
    try {
      const biz = String(businessDate || '').slice(0, 10)
      const toYmdLocal = (ts) => {
        try {
          if (!ts) return ''
          const d = new Date(ts)
          // en-CA gives YYYY-MM-DD in most browsers
          return d.toLocaleDateString('en-CA')
        } catch { return '' }
      }
      const nums = []
      // Count tokens from recalls for the same business date
      ;(Array.isArray(state.recalls) ? state.recalls : []).forEach(r => {
        const rd = String(r.date||'').slice(0,10)
        const d = rd || toYmdLocal(r.createdAt)
        if (!biz || !d || d === biz) {
          const n = parseInt(String(r.tokenNo||'').replace(/[^0-9]/g,''), 10)
          if (!isNaN(n)) nums.push(n)
        }
      })
      // Also include tokens from sales recorded on the business date
      ;(Array.isArray(state.sales) ? state.sales : []).forEach(s => {
        const d = String(s.date||'').slice(0,10)
        if (!biz || !d || d === biz) {
          const n = parseInt(String(s.tokenNo||'').replace(/[^0-9]/g,''), 10)
          if (!isNaN(n)) nums.push(n)
        }
      })
      const max = nums.length ? Math.max(...nums) : 0
      return String(max + 1)
    } catch { return '1' }
  }
  // Async: compute next token using fresh backend data (avoids stale in-memory state)
  const getNextTokenNoFresh = async () => {
    try {
      const biz = String(businessDate || '').slice(0, 10)
      const from = biz || '0000-00-00'
      const to = biz || '9999-12-31'
      const [reRes, sRes] = await Promise.all([
        fetch(`${API}/api/recalls`, { headers: authHeaders, cache: 'no-store' }).catch(()=>null),
        fetch(`${API}/api/sales?from=${from}&to=${to}`, { headers: authHeaders, cache: 'no-store' }).catch(()=>null),
      ])
      const recalls = reRes && reRes.ok ? await reRes.json() : []
      const sales = sRes && sRes.ok ? await sRes.json() : []
      const toYmdLocal = (ts) => { try { return ts ? new Date(ts).toLocaleDateString('en-CA') : '' } catch { return '' } }
      const nums = []
      ;(Array.isArray(recalls) ? recalls : []).forEach(r => {
        const rd = String(r.date||'').slice(0,10)
        const d = rd || toYmdLocal(r.createdAt)
        if (!biz || !d || d === biz) {
          const n = parseInt(String(r.tokenNo||'').replace(/[^0-9]/g,''), 10)
          if (!isNaN(n)) nums.push(n)
        }
      })
      ;(Array.isArray(sales) ? sales : []).forEach(s => {
        const d = String(s.date||'').slice(0,10)
        if (!biz || !d || d === biz) {
          const n = parseInt(String(s.tokenNo||'').replace(/[^0-9]/g,''), 10)
          if (!isNaN(n)) nums.push(n)
        }
      })
      const max = nums.length ? Math.max(...nums) : 0
      return String(max + 1)
    } catch { return '1' }
  }
  // Compute currently occupied tables from recalls (dine-in only)
  const occupiedTables = useMemo(() => {
    try {
      const set = new Set()
      ;(Array.isArray(recalls) ? recalls : []).forEach(r => {
        if ((r?.orderType||'') === 'Dine-in' && r?.tableNo) set.add(String(r.tableNo))
      })
      return set
    } catch { return new Set() }
  }, [recalls])

  const handleRecall = (ord) => {
    // Load recalled order into cart and close dialog
    try {
      const its = Array.isArray(ord.items) ? ord.items.map(it => ({ 
        itemId: it.itemId, 
        qty: Number(it.qty)||1, 
        mods: it.mods||{}, 
        custom: it.custom,
        name: it.name || it.custom?.name,
        price: it.price
      })) : []
      setItems(its)
      if (ord.orderType) setOrderType(ord.orderType)
      // If dine-in, prefill waiter/table from recall
      if ((ord.orderType||'') === 'Dine-in') {
        if (ord.waiterId) setKotWaiterId(ord.waiterId)
        if (ord.tableNo) setKotTable(ord.tableNo)
      }
      // If delivery, prefill customer fields so Pay flow prints them
      if ((ord.orderType||'') === 'Delivery' && ord.customer) {
        setPayName(ord.customer.name || '')
        setPayPhone(ord.customer.phone || '')
        setPayAddress(ord.customer.address || '')
      }
      // Load billing summary data (discount, tax, service charges)
      const subtotalVal = Number(ord.subtotal || 0)
      const billDiscAmtVal = Number(ord.billDiscount || ord.billDiscAmt || 0)
      const billDiscPctVal = subtotalVal > 0 ? Math.round((billDiscAmtVal / subtotalVal) * 100) : 0
      const taxAmtVal = Number(ord.taxAmt || 0)
      const taxPctVal = subtotalVal > 0 ? Math.round((taxAmtVal / subtotalVal) * 100) : 0
      const serviceAmtVal = Number(ord.serviceAmt || 0)
      const servicePctVal = subtotalVal > 0 ? Math.round((serviceAmtVal / subtotalVal) * 100) : 0
      setBillDiscPct(billDiscPctVal)
      setBillDiscAmt(billDiscAmtVal)
      setTaxPct(taxPctVal)
      setTaxAmt(taxAmtVal)
      setServicePct(servicePctVal)
      setServiceAmt(serviceAmtVal)
      if (ord.paymentMethod) setPaymentMethod(ord.paymentMethod)
      setActiveRecall(ord)
      setActiveRecallSource('recall')
    } catch {}
    setShowRecall(false)
  }
  const handleRecallPay = (ord) => {
    // If delivery, ask for rider then proceed to pay
    if ((ord?.orderType||'') === 'Delivery') {
      // Close dialog so it doesn't linger while selecting a rider
      setShowRecall(false)
      setRecallToPay(ord)
      setShowSelectRider(true)
      return
    }
    // Otherwise, pay directly
    // Restore payment method from recall so finalizePayment uses the correct one
    if (ord.paymentMethod) setPaymentMethod(ord.paymentMethod)
    // Close dialog immediately to prevent stale entry showing
    setShowRecall(false)
    ;(async ()=>{ await finalizePayment(ord, null) })()
  }

  const finalizePayment = async (ord, rider) => {
    try {
      // 1) Create sale
      const saleBody = {
        createdAt: ord.createdAt || Date.now(),
        tokenNo: ord.tokenNo || '',
        orderType: ord.orderType || '',
        items: (ord.items||[]).map(it => ({ itemId: it.itemId, name: it.name, price: Number(it.price||0), qty: Number(it.qty||0), mods: it.mods||{}, custom: it.custom||null })),
        waiterId: ord.waiterId || '',
        tableNo: ord.tableNo || '',
        customer: ord.customer || (activeRecall?.customer || ( (ord.orderType||'')==='Delivery' ? { name: payName, phone: payPhone, address: payAddress } : null )),
        totalQty: Number(ord.totalQty|| (Array.isArray(ord.items)? ord.items.reduce((s,i)=>s+Number(i.qty||0),0):0)),
        subtotal: Number(ord.subtotal||0),
        itemsDiscount: Number(ord.itemsDiscount||0),
        billDiscount: Number(ord.billDiscount||0),
        taxAmt: Number(ord.taxAmt||0),
        serviceAmt: Number(ord.serviceAmt||0),
        totalAmount: Number(ord.totalAmount||0),
        remarks: ord.remarks || '',
        status: 'PAID',
        paymentMethod: paymentMethod,
        // Ensure dashboard uses business date
        date: businessDate,
        deliveryDate: businessDate,
        // Provide recallId so server can atomically delete the corresponding recall
        recallId: (ord?.id || ord?._id || null),
      }
      const saleIdemKey = (ord?.id || ord?._id) ? `sale-${ord.id || ord._id}` : `sale-${businessDate}-${Date.now()}`
      const saleRes = await fetch(`${API}/api/sales`, { method: 'POST', headers: { ...authHeaders, 'X-Idempotency-Key': saleIdemKey }, body: JSON.stringify(saleBody) })
      if (!saleRes.ok) { toast.error('Failed to create sale'); return }
      const savedSale = await saleRes.json()

      // Print receipt
      const changeDue = Math.max(0, (Number(cashReceived)||0) - (Number(saleBody.totalAmount)||0))
      // Look up floor information from tables array for Dine-in orders
      const tableObj = saleBody.orderType === 'Dine-in' && saleBody.tableNo
        ? tables.find(t => (t.name || t.label || t.code || String(t)) === saleBody.tableNo)
        : null
      const floor = tableObj?.floor || ''
      try {
        printSaleReceiptUtil({
          state,
          items: saleBody.items,
          orderType: saleBody.orderType,
          waiterId: saleBody.waiterId,
          tableNo: saleBody.tableNo,
          floor,
          tokenNo: (savedSale?.tokenNo || saleBody.tokenNo || ''),
          paymentMethod: paymentMethod,
          cashReceived: Number(cashReceived||0),
          changeDue: changeDue,
          customer: saleBody.customer,
          itemsDiscount: saleBody.itemsDiscount,
          billDiscount: saleBody.billDiscount,
          taxAmt: saleBody.taxAmt,
          serviceAmt: saleBody.serviceAmt,
          billNo: savedSale?.billNo,
          userName: user?.name || user?.username || 'USER',
          // Force absolute logo path to ensure it loads inside the iframe
          logoUrl: `${window.location.origin}/receipt-logo.png.jpg`,
          autoPrint: false,
        })
      } catch {}

      // Immediately update dashboard data by adding the new sale into state
      try {
        const mapped = { ...savedSale, id: savedSale?.id || savedSale?._id }
        const prev = Array.isArray(state?.sales) ? state.sales : []
        // Avoid duplicates by id
        const exists = mapped?.id && prev.some(s => s.id === mapped.id)
        const nextSales = exists ? prev : [mapped, ...prev]
        dispatch({ type: 'HYDRATE', payload: { sales: nextSales } })
      } catch {}

      // Also refresh ingredients so inventory changes appear immediately across the app (e.g., Consumption page)
      try {
        const ingRes = await fetch(`${API}/api/ingredients`, { headers: authHeaders, cache: 'no-store' })
        if (ingRes.ok) {
          const rows = await ingRes.json()
          const mapId = (x) => ({ ...x, id: x.id || x._id })
          dispatch({ type: 'HYDRATE', payload: { ingredients: (rows || []).map(mapId) } })
        }
      } catch {}

      // 2) If delivery and rider selected, add to rider-cash
      if ((ord?.orderType||'') === 'Delivery' && rider?.id) {
        const yyyyMmDd = new Date().toLocaleDateString('en-CA')
        const rcBody = {
          date: yyyyMmDd,
          riderId: String(rider.id),
          riderName: rider.name || '',
          deliveries: 1,
          amount: Number(ord.totalAmount||0),
          deliveryCharge: Number(ord.deliveryCharge||0),
          method: 'COD',
          orderId: String(savedSale?.id || savedSale?._id || ord.id || ''),
          note: ord.customer?.address || '',
        }
        await fetch(`${API}/api/rider-cash`, { method: 'POST', headers: authHeaders, body: JSON.stringify(rcBody) }).catch(()=>{})
      }

      // 3) Delete recall and refresh
      // Support both flows: (a) Pay directly from RecallDialog (ord has id),
      // and (b) Recall first then press main Pay (use activeRecall id).
      const recallId = ord?.id || ord?._id || (activeRecallSource === 'recall' ? (activeRecall?.id || activeRecall?._id) : null)
      if (recallId) {
        // Optimistically remove from local state to update UI instantly
        try {
          const currentRecalls = Array.isArray(state?.recalls) ? state.recalls : []
          const nextRecalls = currentRecalls.filter(r => (r.id || r._id) !== recallId)
          dispatch({ type: 'HYDRATE', payload: { recalls: nextRecalls } })
        } catch {}
        try {
          const delRes = await fetch(`${API}/api/recalls/${recallId}`, { method: 'DELETE', headers: authHeaders })
          if (!delRes.ok) {
            console.warn('Failed to delete recall on server', recallId)
          }
        } catch (e) { console.warn('Error deleting recall', e) }
        await refreshRecalls()
      }

      // Clear UI state
      setActiveRecall(null)
      setActiveRecallSource(null)
      setItems([])
      setShowSelectRider(false)
      setRecallToPay(null)
      // Reset discounts/charges so bill summary clears
      setBillDiscPct(0)
      setBillDiscAmt(0)
      setServicePct(0)
      setServiceAmt(0)
      setTaxPct(0)
      setTaxAmt(0)
      // Reset cash received
      setCashReceived(0)
      // Reset payment method
      setPaymentMethod('cash')
      // Reset order type and related fields so UI goes back to neutral state
      setOrderType('')
      setKotWaiterId('')
      setKotTable('')
      setKotRemarks('')
      setPayName('')
      setPayPhone('')
      setPayAddress('')
      setShowDelivery(false)
      // success: no alert needed
    } catch {
      toast.error('Payment failed')
    }
  }
  const handleCustomerBill = (ord) => {
    try {
      if (!ord) return
      const items = (Array.isArray(ord.items) ? ord.items : []).map(it => {
        const m = (state.menu||[]).find(x=>x.id===it.itemId)
        const price = (typeof it.price === 'number') ? it.price : (m ? (createLineTotal(state.settings?.modifiers||{})(m, { ...it, qty: 1 })||0) : Number(it.custom?.price||0))
        return { itemId: it.itemId, name: it.name || it.custom?.name || m?.name || '', price: Number(price||0), qty: Number(it.qty||0), mods: it.mods||{}, custom: it.custom||null }
      })
      // Look up floor information from tables array for Dine-in orders
      const tableObj = ord.orderType === 'Dine-in' && ord.tableNo
        ? tables.find(t => (t.name || t.label || t.code || String(t)) === ord.tableNo)
        : null
      const floor = tableObj?.floor || ''
      printSaleReceiptUtil({
        state,
        title: 'Customer Bill',
        items,
        orderType: ord.orderType || '-',
        waiterId: ord.waiterId || '',
        tableNo: ord.tableNo || '',
        floor,
        tokenNo: ord.tokenNo || '',
        paymentMethod: 'Cash',
        cashReceived: 0, // requested: cash paid 0 for customer bill
        changeDue: 0,
        customer: ord.customer || null,
        itemsDiscount: Number(ord.itemsDiscount||0),
        billDiscount: Number(ord.billDiscount||0),
        taxAmt: Number(ord.taxAmt||0),
        serviceAmt: Number(ord.serviceAmt||0),
        billNo: '',
        userName: user?.name || user?.username || 'USER',
        // Use logo from settings; do not reference a missing public file
        logoUrl: state?.settings?.receiptLogo || state?.settings?.logo || state?.settings?.logoUrl || '',
        autoPrint: false,
      })
    } catch {}
  }

  const handleHeldPrint = (h) => {
    try {
      if (!h) return
      const items = (Array.isArray(h.items) ? h.items : []).map(it => {
        const m = (state.menu||[]).find(x=>x.id===it.itemId)
        const price = (typeof it.price === 'number') ? it.price : (m ? (createLineTotal(state.settings?.modifiers||{})(m, { ...it, qty: 1 })||0) : Number(it.custom?.price||0))
        return { itemId: it.itemId, name: it.name || it.custom?.name || m?.name || '', price: Number(price||0), qty: Number(it.qty||0), mods: it.mods||{}, custom: it.custom||null }
      })
      const subtotal = items.reduce((s,it)=> s + Number(it.price||0) * Number(it.qty||0), 0)
      // Look up floor information from tables array for Dine-in orders
      const tableObj = h.orderType === 'Dine-in' && h.tableNo
        ? tables.find(t => (t.name || t.label || t.code || String(t)) === h.tableNo)
        : null
      const floor = tableObj?.floor || ''
      printSaleReceiptUtil({
        state,
        title: 'Customer Bill (Pending)',
        items,
        orderType: h.orderType || '-',
        waiterId: h.waiterId || '',
        tableNo: h.tableNo || '',
        floor,
        tokenNo: '',
        paymentMethod: 'Pending',
        cashReceived: 0,
        changeDue: 0,
        customer: h.customer || null,
        itemsDiscount: 0,
        billDiscount: 0,
        taxAmt: 0,
        serviceAmt: 0,
        billNo: '',
        userName: user?.name || user?.username || 'USER',
        logoUrl: state?.settings?.receiptLogo || state?.settings?.logo || state?.settings?.logoUrl || '',
        autoPrint: false,
      })
    } catch {}
  }

  // Held: save to DB, refresh, load/delete
  const refreshHelds = async () => {
    try {
      const res = await fetch(`${API}/api/helds`, { headers: authHeaders, cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        dispatch({ type: 'HYDRATE', payload: { helds: Array.isArray(data) ? data : [] } })
        setHeldCount(Array.isArray(data) ? data.length : 0)
      }
    } catch {}
  }

  const holdSaleToDb = async () => {
    if (!items.length) { toast.error('No items to hold'); return }
    if (!orderType) { toast.error('Select order type before holding'); return }
    const body = {
      createdAt: Date.now(),
      orderType,
      items: items.map(it => {
        const m = menu.find(x=>x.id===it.itemId)
        const price = m ? (lineTotal(m, { ...it, qty: 1 }) || 0) : Number(it.custom?.price || 0)
        return {
          itemId: it.itemId,
          name: it.custom?.name || m?.name || '',
          price,
          qty: Number(it.qty||1),
          mods: it.mods || {},
          custom: it.custom || null,
        }
      }),
      waiterId: orderType==='Dine-in' ? kotWaiterId : '',
      tableNo: orderType==='Dine-in' ? kotTable : '',
      remarks: kotRemarks || '',
      paymentMethod: paymentMethod || 'cash',
      customer: orderType==='Delivery' ? { name: payName, phone: payPhone, address: payAddress } : null,
    }
    try {
      const key = `held-${Date.now()}-${Math.random().toString(36).slice(2,8)}`
      const res = await fetch(`${API}/api/helds`, { method: 'POST', headers: { ...authHeaders, 'X-Idempotency-Key': key }, body: JSON.stringify(body) })
      if (!res.ok) { toast.error('Failed to hold sale'); return }
      await refreshHelds()
      setItems([])
      // Also reset order type and related fields after holding
      setOrderType('')
      setKotWaiterId('')
      setKotTable('')
      setKotRemarks('')
      setPayName('')
      setPayPhone('')
      setPayAddress('')
      setShowDelivery(false)
    } catch {
      toast.error('Failed to hold sale')
    }
  }

  const onOpenHeld = async () => {
    await refreshHelds()
    setShowHeld(true)
  }

  const recallHeld = async (h) => {
    try {
      const its = Array.isArray(h.items) ? h.items.map(it => ({ 
        itemId: it.itemId, 
        qty: Number(it.qty)||1, 
        mods: it.mods||{}, 
        custom: it.custom,
        name: it.name || it.custom?.name,
        price: it.price
      })) : []
      setItems(its)
      if (h.orderType) setOrderType(h.orderType)
      if (h.paymentMethod) setPaymentMethod(h.paymentMethod)
      setShowHeld(false)
      setActiveRecall(h)
      setActiveRecallSource('held')
      // Auto-delete recalled held to avoid duplicates
      if (h?.id) {
        try {
          const res = await fetch(`${API}/api/helds/${h.id}`, { method: 'DELETE', headers: authHeaders })
          if (res.ok) await refreshHelds()
        } catch {}
      }
    } catch {}
  }

  const deleteHeld = async (h) => {
    if (!h?.id) return
    const confirmed = await confirm({ title: 'Delete Held Sale', message: 'Delete this held sale?' })
    if (!confirmed) return
    try {
      const res = await fetch(`${API}/api/helds/${h.id}`, { method: 'DELETE', headers: authHeaders })
      if (res.ok) await refreshHelds()
    } catch {}
  }

  // Recall action buttons handlers (component scope)
  const onCancelRecall = () => {
    setActiveRecall(null)
    setActiveRecallSource(null)
    resetAll()
  }
  const onVoidRecall = () => {
    if (!activeRecall) { toast.error('No recalled order'); return }
    setShowVoidReason(true)
  }
  const onChangeTableRecall = () => {
    // Reuse KOT modal to pick a different table for dine-in
    if (orderType !== 'Dine-in') { toast.error('Change Table is only for Dine-in orders'); return }
    if (activeRecallSource !== 'recall') { toast.error('Change Table is available only for recalled orders'); return }
    setKotMode('changeTable')
    setShowKot(true)
  }

  const onUpdateRecall = async () => {
    // Update recalled order with current cart items without KOT (for adding drinks, etc.)
    if (!activeRecall) { toast.error('No recalled order'); return }
    if (activeRecallSource !== 'recall') { toast.error('Update is only available for recalled orders'); return }
    if (!items.length) { toast.error('No items to update'); return }

    try {
      // Build merged items from current cart
      const mergedItems = items.map(it => {
        const m = menu.find(x=>x.id===it.itemId)
        const price = m ? (lineTotal(m, { ...it, qty: 1 }) || 0) : Number(it.custom?.price || 0)
        return { itemId: it.itemId, name: it.custom?.name || m?.name || '', price, qty: Number(it.qty||1), mods: it.mods||{}, custom: it.custom||null }
      })

      // Recalculate totals
      const subtotalLocal = mergedItems.reduce((s,it)=> s + Number(it.price||0) * Number(it.qty||0), 0)
      const totalQtyLocal = mergedItems.reduce((s,it)=> s + Number(it.qty||0), 0)
      const totalAmountLocal = Math.max(0, subtotalLocal - Number(billDiscAmt||0) + Number(taxAmt||0) + Number(serviceAmt||0))

      const patchBody = {
        items: mergedItems,
        totalQty: totalQtyLocal,
        subtotal: subtotalLocal,
        billDiscount: Number(billDiscAmt||0),
        taxAmt: Number(taxAmt||0),
        serviceAmt: Number(serviceAmt||0),
        totalAmount: totalAmountLocal,
      }

      const res = await fetch(`${API}/api/recalls/${activeRecall.id}`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify(patchBody) })
      if (res.ok) {
        const updated = await res.json()
        setActiveRecall(updated)
        await refreshRecalls()
        toast.success('Order updated successfully')
      } else {
        toast.error('Failed to update order')
      }
    } catch {
      toast.error('Failed to update order')
    }
  }

  const openVoidPrint = async ({ items: selectedItems = [], skipPrint = false }) => {
    try {
      const r = activeRecall || {}
      // Ensure we carry item names for history and printing
      const itemsForBody = (Array.isArray(selectedItems) && selectedItems.length)
        ? selectedItems
        : (Array.isArray(r.items) ? r.items : items)
      const itemsMapped = itemsForBody.map(it => {
        const m = (state.menu||[]).find(x=>x.id===it.itemId)
        const name = it.custom?.name || m?.name || it.itemId
        return { itemId: it.itemId, qty: Number(it.qty||0), custom: { ...(it.custom||{}), name }, mods: it.mods||{} }
      })

      const body = {
        createdAt: Date.now(),
        orderType: r.orderType || orderType || '',
        tokenNo: r.tokenNo || '',
        waiterId: r.waiterId || kotWaiterId || '',
        tableNo: r.tableNo || kotTable || '',
        reason: String(voidReason||'').trim(),
        remarks: r.remarks || kotRemarks || '',
        items: itemsMapped,
      }
      const key = `void-${Date.now()}-${Math.random().toString(36).slice(2,8)}`
      const res = await fetch(`${API}/api/voids`, { method: 'POST', headers: { ...authHeaders, 'X-Idempotency-Key': key }, body: JSON.stringify(body) })
      if (!res.ok) { toast.error('Failed to void order'); return }
      if (!skipPrint) {
        try {
          // Look up floor information from tables array for Dine-in orders
          const tableObj = orderType === 'Dine-in' && body.tableNo
            ? tables.find(t => (t.name || t.label || t.code || String(t)) === body.tableNo)
            : null
          const floor = tableObj?.floor || ''
          
          // Use openKotPrintUtil for consistent preview dialog
          await openKotPrintUtil({
            state,
            items: itemsMapped.map(it => ({ ...it, name: it.custom?.name || it.itemId })),
            tokenNo: body.tokenNo,
            orderType: body.orderType,
            waiterId: body.waiterId,
            tableNo: body.tableNo,
            floor: floor,
            remarks: body.reason ? `CANCELLED: ${body.reason}` : body.remarks,
            userName: user?.name || user?.username || 'USER',
            title: 'Void Receipt',
            createdAt: Date.now(),
            autoPrint: false,
            previewInApp: true,
          })
        } catch {}
      }
      // Update recall items by subtracting void quantities (do not remove entire recall unless empty)
      if (r?.id) {
        // Build maps for subtraction
        const keyOf = (it)=>{
          const mods = it.mods || {}
          const isCustom = !menu.some(x=>x.id===it.itemId)
          const customKey = isCustom ? `|${(it.custom?.name||it.name||'')}` : ''
          return `${it.itemId}${customKey}|${JSON.stringify(mods)}`
        }
        const baseItems = Array.isArray(r.items) ? r.items : []
        const baseMap = new Map()
        baseItems.forEach(it => baseMap.set(keyOf(it), { ...it }))
        const voidMap = new Map()
        itemsMapped.forEach(it => {
          const k = keyOf(it)
          voidMap.set(k, (voidMap.get(k)||0) + Number(it.qty||0))
        })
        const remaining = []
        baseMap.forEach((it, k) => {
          const vq = Number(voidMap.get(k)||0)
          const newQty = Math.max(0, Number(it.qty||0) - vq)
          if (newQty > 0) remaining.push({ ...it, qty: newQty })
        })

        if (remaining.length > 0) {
          // Recompute totals and PATCH
          const patched = remaining.map(it => {
            const m = (state.menu||[]).find(x=>x.id===it.itemId)
            const price = m ? (lineTotal(m, { ...it, qty: 1 }) || 0) : Number(it.custom?.price || 0)
            return { itemId: it.itemId, name: it.custom?.name || m?.name || '', price, qty: Number(it.qty||1), mods: it.mods||{}, custom: it.custom||null }
          })
          const subtotalLocal = patched.reduce((s,it)=> s + Number(it.price||0) * Number(it.qty||0), 0)
          const totalQtyLocal = patched.reduce((s,it)=> s + Number(it.qty||0), 0)
          const totalAmountLocal = Math.max(0, subtotalLocal - Number(billDiscAmt||0) + Number(taxAmt||0) + Number(serviceAmt||0))
          const patchBody = { items: patched, subtotal: subtotalLocal, totalQty: totalQtyLocal, billDiscount: Number(billDiscAmt||0), taxAmt: Number(taxAmt||0), serviceAmt: Number(serviceAmt||0), totalAmount: totalAmountLocal }
          try {
            const pr = await fetch(`${API}/api/recalls/${r.id}`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify(patchBody) })
            if (pr.ok) {
              const updated = await pr.json()
              setActiveRecall(updated)
              setItems(updated.items.map(it => ({ itemId: it.itemId, qty: Number(it.qty||1), mods: it.mods||{}, custom: it.custom||null })))
              await refreshRecalls()
            }
          } catch {}
        } else {
          // Nothing left, delete recall
          try { await fetch(`${API}/api/recalls/${r.id}`, { method: 'DELETE', headers: authHeaders }) } catch {}
          await refreshRecalls()
          setActiveRecall(null)
          resetAll()
        }
      }
      // Close modals
      setShowVoidPreview(false)
      setShowVoidReason(false)
      setVoidReason('')
    } catch {
      toast.error('Failed to void order')
    }
  }

  // Recalls: refresh helper
  const refreshRecalls = async () => {
    try {
      const res = await fetch(`${API}/api/recalls`, { headers: authHeaders, cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        dispatch({ type: 'HYDRATE', payload: { recalls: Array.isArray(data) ? data : [] } })
      }
    } catch {}
  }

  // KOT submit -> two modes:
  // 1) kot: create recall entry, or if recalling, append only new items and print delta
  // 2) changeTable: update table/waiter on existing active recall
  const submitKotSelection = () => {
    // Prevent accidental double submissions (e.g., double click)
    if (kotSubmittingRef.current) return
    kotSubmittingRef.current = true
    setKotSubmitting(true)
    // If this is a recalled Dine-in order, ensure waiter/table are prefilled from recall
    if ((orderType === 'Dine-in') && activeRecall) {
      if (!kotWaiterId && activeRecall.waiterId) setKotWaiterId(activeRecall.waiterId)
      if (!kotTable && activeRecall.tableNo) setKotTable(activeRecall.tableNo)
    }
    if (orderType === 'Dine-in') {
      if (!kotTable) { toast.error('Please select a table'); kotSubmittingRef.current = false; setKotSubmitting(false); return }
      // Block creating a new recall on an occupied table (allow if updating same recalled order)
      const isOccupied = occupiedTables.has(String(kotTable))
      const isSameRecalledTable = !!(activeRecall && String(activeRecall.tableNo||'') === String(kotTable||''))
      if (isOccupied && !isSameRecalledTable) {
        toast.error('This table is already occupied. Please choose another table or recall the existing order for this table.')
        // Reset guard since we aborted
        kotSubmittingRef.current = false
        setKotSubmitting(false)
        return
      }
    }
    // Establish idempotency key for this KOT action (shared across recall + kot writes)
    const idemKey = ensureKotActionKey()
    // If an order is recalled and we're adding more items, patch the same recall and print only newly added items
    if (kotMode === 'kot' && Array.isArray(activeRecall?.items) && activeRecallSource === 'recall') {
      ;(async ()=>{
        try {
          // Key builder to compare lines including modifiers. For menu items, ignore name.
          const keyOf = (it)=>{
            const mods = it.mods || {}
            const isCustom = !menu.some(x=>x.id===it.itemId)
            const customKey = isCustom ? `|${(it.custom?.name||it.name||'')}` : ''
            return `${it.itemId}${customKey}|${JSON.stringify(mods)}`
          }
          // Build base map from recalled items
          const baseItems = Array.isArray(activeRecall.items) ? activeRecall.items : []
          const baseMap = new Map()
          baseItems.forEach(it => baseMap.set(keyOf(it), Number(it.qty||0)))
          // Build current map from cart
          const curMap = new Map()
          items.forEach(it => {
            const k = keyOf(it)
            curMap.set(k, (curMap.get(k)||0) + Number(it.qty||0))
          })
          // Compute delta (only additions)
          const delta = []
          curMap.forEach((qty, k) => {
            const prev = baseMap.get(k) || 0
            const addQty = Math.max(0, qty - prev)
            if (addQty > 0) {
              const rep = items.find(it => keyOf(it) === k)
              if (rep) delta.push({ ...rep, qty: addQty })
            }
          })
          if (!delta.length) { toast.error('No new items to send to kitchen'); setShowKot(false); kotSubmittingRef.current = false; setKotSubmitting(false); clearKotActionKey(); return }

          // Merge base + delta for persistence
          const mergedMap = new Map()
          const addToMerged = (arr) => arr.forEach(it=>{
            const k = keyOf(it)
            const prev = mergedMap.get(k)
            mergedMap.set(k, { ...it, qty: Number((prev?.qty||0)) + Number(it.qty||0) })
          })
          addToMerged(baseItems)
          addToMerged(delta)
          const mergedItems = Array.from(mergedMap.values()).map(it => {
            const m = menu.find(x=>x.id===it.itemId)
            const price = m ? (lineTotal(m, { ...it, qty: 1 }) || 0) : Number(it.custom?.price || 0)
            return { itemId: it.itemId, name: it.custom?.name || m?.name || '', price, qty: Number(it.qty||1), mods: it.mods||{}, custom: it.custom||null }
          })

          // Recalculate totals for the recall
          const subtotalLocal = mergedItems.reduce((s,it)=> s + Number(it.price||0) * Number(it.qty||0), 0)
          const totalQtyLocal = mergedItems.reduce((s,it)=> s + Number(it.qty||0), 0)
          const totalAmountLocal = Math.max(0, subtotalLocal - Number(billDiscAmt||0) + Number(taxAmt||0) + Number(serviceAmt||0))

          // PATCH the existing recall (if we have an id); otherwise just print delta
          const patchBody = {
            items: mergedItems,
            totalQty: totalQtyLocal,
            subtotal: subtotalLocal,
            billDiscount: Number(billDiscAmt||0),
            taxAmt: Number(taxAmt||0),
            serviceAmt: Number(serviceAmt||0),
            totalAmount: totalAmountLocal,
            remarks: kotRemarks || activeRecall.remarks || '',
          }
          if (activeRecall?.id) {
            const res = await fetch(`${API}/api/recalls/${activeRecall.id}`, { method: 'PATCH', headers: { ...authHeaders, 'X-Idempotency-Key': idemKey }, body: JSON.stringify(patchBody) })
            if (res.ok) {
              try {
                const updated = await res.json()
                if (updated && updated.id) setActiveRecall(updated)
              } catch {}
              await refreshRecalls()
            }
          }
          // Prepare receipt to print ONLY delta, keep same token/order
          const nameForKot = (it) => {
            const size = String(it?.mods?.size || it?.size || '').toUpperCase()
            const ids = Array.isArray(it?.mods?.flavours) ? it.mods.flavours : []
            if (ids.length) {
              const names = ids.map(fid => (menu.find(x=>x.id===fid)?.name || '')).filter(Boolean)
              const fallback = it.custom?.name || (menu.find(x=>x.id===it.itemId)?.name || it.name || String(it.itemId||''))
              const title = names.join(' + ') || fallback
              return size ? `${title} (${size})` : title
            }
            const base = it.custom?.name || (menu.find(x=>x.id===it.itemId)?.name || it.name || String(it.itemId||''))
            return size ? `${base} (${size})` : base
          }
          const deltaLines = delta.map(it => ({ name: nameForKot(it), qty: Number(it.qty||1) }))
          // Save this KOT punch to history (delta only)
          try {
            const kotItems = delta.map(it => {
              const m = menu.find(x=>x.id===it.itemId)
              const custom = it.custom || (m ? { name: m.name, price: Number(m.price||0), category: m.category } : null)
              return { itemId: it.itemId, qty: Number(it.qty||1), custom, mods: it.mods||{} }
            })
            const kotBody = {
              createdAt: Date.now(),
              orderType: orderType || activeRecall.orderType || 'Dine-in',
              tokenNo: activeRecall.tokenNo || '',
              waiterId: kotWaiterId || activeRecall.waiterId || '',
              tableNo: kotTable || activeRecall.tableNo || '',
              remarks: kotRemarks || activeRecall.remarks || '',
              items: kotItems,
            }
            await fetch(`${API}/api/kots`, { method: 'POST', headers: { ...authHeaders, 'X-Idempotency-Key': idemKey }, body: JSON.stringify(kotBody) }).catch(()=>{})
          } catch {}
          // Look up floor for the table
          const tableObj = orderType === 'Dine-in' && kotTable
            ? tables.find(t => (t.name || t.label || t.code || String(t)) === kotTable)
            : null
          const floor = tableObj?.floor || ''
          
          // Directly print instead of showing receipt dialog
          await openKotPrintUtil({
            state,
            items: deltaLines,
            tokenNo: activeRecall.tokenNo || '',
            orderType: orderType || activeRecall.orderType || '-',
            waiterId: kotWaiterId || activeRecall.waiterId || '',
            tableNo: kotTable || activeRecall.tableNo || '',
            floor,
            remarks: kotRemarks || activeRecall.remarks || '',
            userName: user?.name || user?.username || 'USER',
            title: 'Order Receipt',
            createdAt: Date.now(),
            autoPrint: false,
            previewInApp: true,
          })

          // Reset all after printing
          resetAll()
        } catch {}
        finally { kotSubmittingRef.current = false; setKotSubmitting(false); clearKotActionKey() }
        setShowKot(false)
        setKotMode('kot')
      })()
      return
    }
    if (kotMode === 'changeTable' && activeRecall?.id) {
      ;(async ()=>{
        try {
          const patch = { waiterId: kotWaiterId, tableNo: kotTable }
          const res = await fetch(`${API}/api/recalls/${activeRecall.id}`, { method: 'PATCH', headers: { ...authHeaders, 'X-Idempotency-Key': idemKey }, body: JSON.stringify(patch) })
          if (res.ok) {
            const updated = await res.json()
            setActiveRecall(updated)
            await refreshRecalls()
          }
        } catch {}
        finally { kotSubmittingRef.current = false; clearKotActionKey() }
        setKotMode('kot')
        setShowKot(false)
      })()
      return
    }
    // Save to recall queue in DB (FIFO maintained by createdAt ascending on GET)
    ;(async ()=>{
      try {
        const totalQtyLocal = items.reduce((s,it)=> s + Number(it.qty||0), 0)
        const subtotalLocal = subTotal
        const body = {
          createdAt: Date.now(),
          date: String(businessDate||'').slice(0,10),
          orderType,
          items: items.map(it => {
            const m = menu.find(x=>x.id===it.itemId)
            const price = m ? (lineTotal(m, { ...it, qty: 1 }) || 0) : Number(it.custom?.price || 0)
            return { itemId: it.itemId, name: it.custom?.name || m?.name || '', price, qty: Number(it.qty||1), mods: it.mods||{}, custom: it.custom||null }
          }),
          waiterId: orderType==='Dine-in' ? kotWaiterId : '',
          tableNo: orderType==='Dine-in' ? kotTable : '',
          customer: orderType==='Delivery' ? { name: payName, phone: payPhone, address: payAddress } : null,
          totalQty: totalQtyLocal,
          subtotal: subtotalLocal,
          itemsDiscount: 0,
          billDiscount: Number(billDiscAmt||0),
          taxAmt: Number(taxAmt||0),
          serviceAmt: Number(serviceAmt||0),
          totalAmount: Number(totalPayment||0),
          remarks: kotRemarks || '',
          paymentMethod: paymentMethod || 'cash',
        }
        const res = await fetch(`${API}/api/recalls`, { method: 'POST', headers: { ...authHeaders, 'X-Idempotency-Key': idemKey }, body: JSON.stringify(body) })
        if (res.ok) {
          const createdRecall = await res.json().catch(()=>null)
          await refreshRecalls()
          // Save this KOT punch (full cart) to KOT history
          try {
            const kotItems = items.map(it => {
              const m = menu.find(x=>x.id===it.itemId)
              const custom = it.custom || (m ? { name: m.name, price: Number(m.price||0), category: m.category } : null)
              return { itemId: it.itemId, qty: Number(it.qty||1), custom, mods: it.mods||{} }
            })
            const kotBody = {
              createdAt: Date.now(),
              orderType,
              tokenNo: createdRecall?.tokenNo || '',
              waiterId: orderType==='Dine-in' ? kotWaiterId : '',
              tableNo: orderType==='Dine-in' ? kotTable : '',
              remarks: kotRemarks || '',
              items: kotItems,
            }
            await fetch(`${API}/api/kots`, { method: 'POST', headers: { ...authHeaders, 'X-Idempotency-Key': idemKey }, body: JSON.stringify(kotBody) }).catch(()=>{})
          } catch {}
          // Look up floor for the table
          const tableObj = orderType === 'Dine-in' && kotTable
            ? tables.find(t => (t.name || t.label || t.code || String(t)) === kotTable)
            : null
          const floor = tableObj?.floor || ''
          
          // Directly print instead of showing receipt dialog
          await openKotPrintUtil({
            state,
            items: items.map(it => ({ name: (function(){
              const size = String(it?.mods?.size || it?.size || '').toUpperCase()
              const ids = Array.isArray(it?.mods?.flavours) ? it.mods.flavours : []
              if (ids.length) {
                const names = ids.map(fid => (menu.find(x=>x.id===fid)?.name || '')).filter(Boolean)
                const fallback = it.custom?.name || (menu.find(x=>x.id===it.itemId)?.name || it.name || String(it.itemId||''))
                const title = names.join(' + ') || fallback
                return size ? `${title} (${size})` : title
              }
              const base = it.custom?.name || (menu.find(x=>x.id===it.itemId)?.name || it.name || String(it.itemId||''))
              return size ? `${base} (${size})` : base
            })(), qty: Number(it.qty||1) })),
            tokenNo: (createdRecall?.tokenNo || ''),
            orderType,
            waiterId: orderType==='Dine-in' ? kotWaiterId : '',
            tableNo: orderType==='Dine-in' ? kotTable : '',
            floor,
            remarks: kotRemarks || '',
            userName: user?.name || user?.username || 'USER',
            title: 'Order Receipt',
            createdAt: Date.now(),
            autoPrint: false,
            previewInApp: true,
          })

          // Reset all after printing
          resetAll()
        } else {
          try { const txt = await res.text(); console.error('Failed to create recall', res.status, txt) } catch {}
          toast.error('Failed to send KOT (could not create recall). Please try again.')
        }
      } catch {}
      finally { kotSubmittingRef.current = false; setKotSubmitting(false); clearKotActionKey() }
      // Close KOT selection modal; receipt dialog will guide next step
      setShowKot(false)
      setKotMode('kot')
    })()
  }

  return (
    <>
    <form onSubmit={submit} className="p-2 sm:p-3 grid grid-cols-1 lg:grid-cols-12 gap-3">
      {/* Left: categories + search, then items list */}
      <div className="lg:col-span-7 space-y-3">
        <CategoryBar
          categories={categories}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          search={search}
          setSearch={setSearch}
        />
    {/* Delivery customer modal */}
    <DeliveryCustomerModal
      open={showDelivery}
      onClose={()=>setShowDelivery(false)}
      API={API}
      authHeaders={authHeaders}
      dispatch={dispatch}
      payName={payName}
      setPayName={setPayName}
      payPhone={payPhone}
      setPayPhone={setPayPhone}
      payAddress={payAddress}
      setPayAddress={setPayAddress}
    />
        <ItemsList
          selectedCategory={selectedCategory}
          itemsInCategory={itemsInCategory}
          addToCart={addToCart}
        />
        <ActionButtons
          discardSale={discardSale}
          onKot={onKot}
          submit={submit}
          setPaymentMethod={()=>{}}
          onOpenRecall={onOpenRecall}
          hasActiveRecall={Boolean(activeRecall && activeRecallSource === 'recall')}
          onCancelRecall={onCancelRecall}
          onVoidRecall={onVoidRecall}
          onChangeTableRecall={onChangeTableRecall}
          onUpdateRecall={onUpdateRecall}
          isSubmittingKOT={false}
        />
      </div>

      {/* Right: cart table + bill summary */}
      <div className="lg:col-span-5 space-y-3">
        <CartTable
          items={items}
          menu={menu}
          decQty={decQty}
          incQty={incQty}
          updateItem={updateItem}
          removeItem={removeItem}
          lineTotal={lineTotal}
        />
        <BillSummary
          orderType={orderType}
          setOrderType={(ot)=>{ setOrderType(ot); if (ot==='Delivery' && items.length>0) setShowDelivery(true) }}
          holdSale={holdSaleToDb}
          setShowHeld={onOpenHeld}
          heldCount={heldCount || (helds?.length||0)}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          totalItems={totalItems}
          totalQty={totalQty}
          subTotal={subTotal}
          itemsDiscount={itemsDiscount}
          billDiscPct={billDiscPct}
          billDiscAmt={billDiscAmt}
          onBillDiscPctChange={(p)=>{ setBillDiscPct(p); const base=Math.max(0, subTotal - itemsDiscount); setBillDiscAmt(Math.min(base, Math.round(base * (p/100)))) }}
          onBillDiscAmtChange={(amt)=>{ const base=Math.max(0, subTotal - itemsDiscount); setBillDiscAmt(Math.min(base, Math.max(0, Number(amt)||0))) }}
          taxPct={taxPct}
          taxAmt={taxAmt}
          onTaxPctChange={(p)=>{ setTaxPct(p); const base=Math.max(0, subTotal - itemsDiscount - billDiscAmt + serviceAmt); setTaxAmt(Math.round(base * (p/100))) }}
          onTaxAmtChange={(amt)=>{ setTaxAmt(Math.max(0, Number(amt)||0)) }}
          servicePct={servicePct}
          serviceAmt={serviceAmt}
          onServicePctChange={(p)=>{ setServicePct(p); const base=Math.max(0, subTotal - itemsDiscount - billDiscAmt); setServiceAmt(Math.round(base * (p/100))) }}
          onServiceAmtChange={(amt)=>{ setServiceAmt(Math.max(0, Number(amt)||0)) }}
          totalPayment={totalPayment}
          cashReceived={cashReceived}
          onCashReceivedChange={setCashReceived}
        />
      </div>
    </form>
    {/* Held dialog */}
    <HeldDialog
      open={showHeld}
      onClose={()=>setShowHeld(false)}
      helds={helds}
      onRecall={recallHeld}
      onDelete={deleteHeld}
      onPrint={handleHeldPrint}
    />
    {/* Recall dialog */}
    <RecallDialog
      open={showRecall}
      onClose={()=>setShowRecall(false)}
      recalls={recalls}
      API={API}
      authHeaders={authHeaders}
      staff={staff}
      tables={tables}
      onRecall={handleRecall}
      onPay={handleRecallPay}
      onCustomerBill={handleCustomerBill}
    />
    {/* Select rider for delivery payment - rendered above Recall (higher z) */}
    <SelectRiderModal
      open={showSelectRider}
      onCancel={()=>{ setShowSelectRider(false); setRecallToPay(null) }}
      riders={ridersFromStaff}
      onConfirm={(r)=>{ const ord = recallToPay; setShowSelectRider(false); setRecallToPay(null); if (ord) finalizePayment(ord, r) }}
    />
    {/* KOT modal */}
    <KotModal
      open={showKot}
      onClose={()=>setShowKot(false)}
      orderType={orderType}
      staff={staff}
      riders={riders}
      tables={tables}
      occupiedTables={occupiedTables}
      kotWaiterId={kotWaiterId}
      setKotWaiterId={setKotWaiterId}
      kotTable={kotTable}
      setKotTable={setKotTable}
      kotRiderId={''}
      setKotRiderId={()=>{}}
      kotRiderName={''}
      setKotRiderName={()=>{}}
      kotRemarks={kotRemarks}
      setKotRemarks={setKotRemarks}
      submitKotSelection={submitKotSelection}
      submitting={kotSubmitting}
    />
    {/* Void reason modal -> then preview */}
    <VoidReasonModal
      open={showVoidReason}
      onCancel={()=>{ setShowVoidReason(false); setVoidReason('') }}
      onConfirm={(reason)=>{ setVoidReason(reason); setShowVoidReason(false); setShowVoidPreview(true) }}
    />
    {/* Void preview modal */}
    <VoidPreview
      open={showVoidPreview}
      onClose={()=>setShowVoidPreview(false)}
      order={activeRecall}
      reason={voidReason}
      state={state}
      openVoidPrint={openVoidPrint}
    />
    {ConfirmDialog}
    </>
  )
}
