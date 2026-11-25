import { toast } from 'react-hot-toast'
import { useConfirm } from '@shared/components/useConfirm.jsx'
import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { useData } from '@/state/DataContext.jsx'
import {
  createLineTotal,
  computeCategoryAwareSubtotal,
  computeCategoryAwareDiscount,
  validateCategorySelectionLimits,
  canAddItemToCart,
  resolvePersistUnitPrice,
  findCategoryByName,
  resolveItemCategoryName,
  getCategoryPackagePrice,
  categoryKeyOf,
  isBundleCategory,
  dealCompositionKey,
} from '@features/sales/utils/cartUtils.js'
import { resolveCustomerSnapshot } from '@features/customers/utils/customerLedgerUtils.js'
import CategoryBar from '@features/sales/components/CategoryBar.jsx'
import ItemsList from '@features/sales/components/ItemsList.jsx'
import CartTable from '@features/sales/components/CartTable.jsx'
import BillSummary from '@features/sales/components/BillSummary.jsx'
import ActionButtons from '@features/sales/components/ActionButtons.jsx'
import RecallDialog from '@features/sales/components/RecallDialog.jsx'
import KotModal from '@features/sales/components/KotModal.jsx'
import DeliveryCustomerModal from '@features/sales/components/DeliveryCustomerModal.jsx'
import HeldDialog from '@features/sales/components/HeldDialog.jsx'
import VoidPreview from '@features/sales/components/VoidPreview.jsx'
import VoidReasonModal from '@features/sales/components/VoidReasonModal.jsx'
import PaymentMethodDialog from '@features/sales/components/PaymentMethodDialog.jsx'
import DealBuilderDialog from '@features/sales/components/DealBuilderDialog.jsx'
import { useAuth } from '@/state/AuthContext.jsx'
import { useBranch } from '@/state/BranchContext.jsx'
import { useNavigate, useLocation } from 'react-router-dom'
import { printSaleReceiptUtil, openKotPrintUtil } from '@features/sales/utils/printUtils.js'

export default function SalesNew() {
  const { state, dispatch, businessDate } = useData()
  const { token, user } = useAuth()
  const { requireBranch, branches } = useBranch()
  const { confirm, ConfirmDialog } = useConfirm()
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
  const authHeaders = token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : { 'Content-Type': 'application/json' }
  // Cross-branch staff for Staff Purchase picker (sale finance still uses active branch)
  const [staffAllBranches, setStaffAllBranches] = useState([])
  const navigate = useNavigate()
  const location = useLocation()

  // Guard against double-submit and provide a stable idempotency key per KOT action
  const kotSubmittingRef = useRef(false)
  const kotActionKeyRef = useRef(null)
  const [kotSubmitting, setKotSubmitting] = useState(false)
  const ensureKotActionKey = () => {
    if (!kotActionKeyRef.current) kotActionKeyRef.current = `kot-${Date.now()}-${Math.random().toString(36).slice(2,8)}`
    return kotActionKeyRef.current
  }
  const clearKotActionKey = () => { kotActionKeyRef.current = null }

  const [sellGateReady, setSellGateReady] = useState(false)
  const ccCartAppliedRef = useRef(false)

  // Wait for branch data before enforcing daybook gate (avoids bounce on remount)
  useEffect(() => {
    const mark = () => setSellGateReady(true)
    window.addEventListener('data_rehydrated', mark)
    const t = setTimeout(mark, 1200)
    return () => {
      window.removeEventListener('data_rehydrated', mark)
      clearTimeout(t)
    }
  }, [])

  useEffect(() => {
    if (!sellGateReady) return
    try {
      // CC Inbox handoff — never bounce while cart/order is in flight
      const ccHandoff = Boolean(
        sessionStorage.getItem('cc_cart_payload')
        || sessionStorage.getItem('cc_order_id')
        || new URLSearchParams(window.location.search).get('from') === 'callcenter'
      )
      if (ccHandoff) return
      const todayKey = String(businessDate || '').slice(0, 10)
      const closed = (Array.isArray(state.dayCloses) ? state.dayCloses : []).some(dc => (dc?.date || '') === todayKey)
      const canSell = Boolean(state?.daybook?.open)
      if (closed || !canSell) {
        toast.error(closed ? 'Day is closed. Open daybook to start selling.' : 'Daybook is not open. Please open daybook first.')
        navigate('/', { replace: true })
      }
    } catch {}
  }, [sellGateReady, state.dayCloses, state?.daybook?.open, businessDate, navigate])

  // Left column UI state — top categories stay in CategoryBar; subcats open in menu pane
  const [categoryPath, setCategoryPath] = useState([]) // drill path for subcategories in menu pane
  const [dealCategory, setDealCategory] = useState(null)
  const [showDealBuilder, setShowDealBuilder] = useState(false)
  const allPosCategories = useMemo(() => (state.categories||[])
    .filter(c => c && c.active !== false && c.showOnPos !== false)
    .sort((a, b) => {
      const orderA = Number(a.sortOrder ?? 0)
      const orderB = Number(b.sortOrder ?? 0)
      if (orderA !== orderB) return orderA - orderB
      return String(a.name||'').localeCompare(String(b.name||''))
    }), [state.categories])
  const kidsOf = useCallback((parentId) => (
    allPosCategories.filter(c => String(c.parentCategoryId || '') === String(parentId || ''))
  ), [allPosCategories])
  const withMeta = useCallback((list) => list.map(c => {
    const id = String(c.id || c._id)
    return {
      ...c,
      _hasChildren: kidsOf(id).length > 0,
      _isDeal: isBundleCategory(c),
    }
  }), [kidsOf])
  // Category bar always shows top-level only
  const categories = useMemo(() => withMeta(kidsOf('')), [kidsOf, withMeta])
  const currentParentId = categoryPath.length
    ? String(categoryPath[categoryPath.length - 1].id || categoryPath[categoryPath.length - 1]._id || '')
    : ''
  const menuSubcategories = useMemo(
    () => (currentParentId ? withMeta(kidsOf(currentParentId)) : []),
    [currentParentId, kidsOf, withMeta]
  )
  const [selectedCategory, setSelectedCategory] = useState('')
  const categoryBarSelected = categoryPath.length
    ? String(categoryPath[0].name || '')
    : selectedCategory

  const openCategory = (cat, { fromTop = false } = {}) => {
    if (!cat) return
    const id = String(cat.id || cat._id)
    const children = kidsOf(id)
    if (children.length) {
      setCategoryPath(prev => (fromTop ? [cat] : [...prev, cat]))
      setSelectedCategory('')
      return
    }
    if (isBundleCategory(cat)) {
      if (fromTop) setCategoryPath([])
      // Keep subcategory list visible after dialog closes (don't lock onto deal name)
      setSelectedCategory('')
      setDealCategory(cat)
      setShowDealBuilder(true)
      return
    }
    if (fromTop) setCategoryPath([])
    setSelectedCategory(cat.name || '')
  }

  const onSelectCategory = (catOrName) => {
    const cat = typeof catOrName === 'object' && catOrName
      ? catOrName
      : allPosCategories.find(c => String(c.name || '') === String(catOrName || ''))
    if (!cat) {
      setCategoryPath([])
      setSelectedCategory(String(catOrName || ''))
      return
    }
    openCategory(cat, { fromTop: true })
  }

  const onSelectSubcategory = (cat) => openCategory(cat, { fromTop: false })

  const closeDealBuilder = () => {
    setShowDealBuilder(false)
    setDealCategory(null)
    setSelectedCategory('')
  }

  const addDealLinesToCart = (lines) => {
    const incoming = Array.isArray(lines) ? lines : []
    if (!incoming.length) return
    const fingerprint = dealCompositionKey(incoming)
    setItems(prev => {
      if (!fingerprint) return [...prev, ...incoming]
      // Group existing cart by dealGroupId
      const byDeal = new Map()
      for (const it of prev) {
        const id = it?.mods?.dealGroupId ? String(it.mods.dealGroupId) : ''
        if (!id) continue
        if (!byDeal.has(id)) byDeal.set(id, [])
        byDeal.get(id).push(it)
      }
      for (const [dealId, group] of byDeal.entries()) {
        if (dealCompositionKey(group) !== fingerprint) continue
        // Same flavours — bump deal qty and scale component qtys
        const curQty = Math.max(1, Number(group[0]?.mods?.dealQty || 1))
        const nextQty = curQty + 1
        return prev.map(it => {
          if (String(it?.mods?.dealGroupId || '') !== dealId) return it
          const unitQty = Math.max(1, Math.round(Number(it.qty || 1) / curQty))
          return {
            ...it,
            qty: unitQty * nextQty,
            mods: { ...(it.mods || {}), dealQty: nextQty },
          }
        })
      }
      return [...prev, ...incoming]
    })
    closeDealBuilder()
    toast.success('Deal added')
  }

  const scaleDealQty = (dealId, nextQty) => {
    const id = String(dealId || '')
    if (!id) return
    const qty = Math.max(1, Number(nextQty || 1))
    setItems(prev => {
      const group = prev.filter(it => String(it?.mods?.dealGroupId || '') === id)
      if (!group.length) return prev
      const curQty = Math.max(1, Number(group[0]?.mods?.dealQty || 1))
      if (curQty === qty) return prev
      return prev.map(it => {
        if (String(it?.mods?.dealGroupId || '') !== id) return it
        const unitQty = Math.max(1, Math.round(Number(it.qty || 1) / curQty))
        return {
          ...it,
          qty: unitQty * qty,
          mods: { ...(it.mods || {}), dealQty: qty },
        }
      })
    })
  }
  const incDealQty = (dealId) => {
    const group = items.filter(it => String(it?.mods?.dealGroupId || '') === String(dealId || ''))
    const cur = Math.max(1, Number(group[0]?.mods?.dealQty || 1))
    scaleDealQty(dealId, cur + 1)
  }
  const decDealQty = (dealId) => {
    const group = items.filter(it => String(it?.mods?.dealGroupId || '') === String(dealId || ''))
    const cur = Math.max(1, Number(group[0]?.mods?.dealQty || 1))
    if (cur <= 1) return
    scaleDealQty(dealId, cur - 1)
  }
  const removeDeal = (dealId) => {
    setItems(prev => prev.filter(it => String(it?.mods?.dealGroupId || '') !== String(dealId || '')))
  }

  // Menu and filtered items
  const menu = state.menu || []
  const itemsInCategory = useMemo(() => {
    const cat = String(selectedCategory||'').trim().toLowerCase()
    let list = menu
    if (cat) list = list.filter(m => String(m.category||'').trim().toLowerCase() === cat)
    // Sort by sortOrder (lower = first), then by name
    return [...list].sort((a, b) => {
      const orderA = Number(a.sortOrder ?? 0)
      const orderB = Number(b.sortOrder ?? 0)
      if (orderA !== orderB) return orderA - orderB
      return String(a.name||'').localeCompare(String(b.name||''))
    })
  }, [menu, selectedCategory])

  // Cart state
  const [items, setItems] = useState([]) // [{itemId, qty, mods?, custom?}]
  const addToCart = (itemId) => {
    const check = canAddItemToCart(items, menu, state.categories || [], itemId, 1)
    if (!check.ok) {
      toast.error(check.message || 'Category max items reached')
      return
    }
    setItems(prev => {
      const idx = prev.findIndex(it => it.itemId === itemId)
      return idx >= 0
        ? prev.map((it,i)=> i===idx ? { ...it, qty: it.qty + 1 } : it)
        : [...prev, { itemId, qty: 1 }]
    })
  }
  const updateItem = (idx, patch) => setItems(prev => prev.map((it,i)=> i===idx ? { ...it, ...patch } : it))
  const incQty = (idx) => {
    const line = items[idx]
    if (!line) return
    const check = canAddItemToCart(items, menu, state.categories || [], line.itemId, 1)
    if (!check.ok) {
      toast.error(check.message || 'Category max items reached')
      return
    }
    setItems(prev => prev.map((it, i) => (
      i === idx ? { ...it, qty: Number(it?.qty || 0) + 1 } : it
    )))
  }
  const decQty = (idx) => setItems(prev => prev.map((it, i) => (
    i === idx ? { ...it, qty: Math.max(1, Number(it?.qty || 1) - 1) } : it
  )))
  const removeItem = (idx) => setItems(prev => {
    const line = prev[idx]
    const dealId = line?.mods?.dealGroupId
    if (dealId) return prev.filter(it => String(it?.mods?.dealGroupId || '') !== String(dealId))
    return prev.filter((_, i) => i !== idx)
  })

  // Order type first — Foodpanda uses priceFoodpanda on menu items
  const [orderType, setOrderType] = useState('') // start with no selection; user must choose

  // Totals (rebind when order type changes so Foodpanda rates apply)
  const lineTotal = useMemo(
    () => createLineTotal(state.settings?.modifiers || {}, () => orderType),
    [state.settings, orderType]
  )
  const allCategories = state.categories || []
  const itemsDiscount = useMemo(
    () => computeCategoryAwareDiscount(items, menu, allCategories, lineTotal),
    [items, menu, allCategories, lineTotal]
  )
  const subTotal = useMemo(
    () => computeCategoryAwareSubtotal(items, menu, allCategories, lineTotal),
    [items, menu, allCategories, lineTotal]
  )
  const totalItems = items.length
  const totalQty = items.reduce((s,it)=> s + Number(it.qty||0), 0)

  // Discounts/taxes (locals only for now)
  const [billDiscPct, setBillDiscPct] = useState(0)
  const [billDiscAmt, setBillDiscAmt] = useState(0)
  const [servicePct, setServicePct] = useState(0)
  const [serviceAmt, setServiceAmt] = useState(0)
  const [taxPct, setTaxPct] = useState(0)
  const [taxAmt, setTaxAmt] = useState(0)
  const [deliveryAmt, setDeliveryAmt] = useState(0)
  const totalPayment = Math.max(0, subTotal - billDiscAmt - itemsDiscount + serviceAmt + taxAmt + deliveryAmt)

  // Cash received for payment
  const [cashReceived, setCashReceived] = useState(0)

  // Payment method
  const [paymentMethod, setPaymentMethod] = useState('cash')
  // Bank transfer details (destination + last 4 digits of sender account)
  const [bankChannel, setBankChannel] = useState('ubl')
  const [bankLast4, setBankLast4] = useState('')
  const [bankRef, setBankRef] = useState('')
  // Staff purchase — always a pending purchase deducted at payroll unless paid earlier
  const [payStaffId, setPayStaffId] = useState('')
  const [payStaffName, setPayStaffName] = useState('')

  // Held / recall UI
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
  const [recallToPay, setRecallToPay] = useState(null)
  const [showPayMethod, setShowPayMethod] = useState(false)
  const [pendingPayOpts, setPendingPayOpts] = useState(null)

  // Call-center inbox → one-click cart load (then cashier KOTs normally).
  // Keep session payload until KOT/reset so branch remounts can re-apply.
  const applyCcCartPayload = useCallback(() => {
    try {
      if (ccCartAppliedRef.current) return false
      const raw = sessionStorage.getItem('cc_cart_payload')
      if (!raw) return false
      const cart = JSON.parse(raw)
      const lines = Array.isArray(cart?.items) ? cart.items : []
      if (!lines.length) {
        sessionStorage.removeItem('cc_cart_payload')
        return false
      }
      setItems(lines.map(it => {
        const mods = it.mods instanceof Map ? Object.fromEntries(it.mods) : (it.mods || undefined)
        const baseCustom = {
          name: it.name || it.custom?.name || 'Item',
          price: Number(it.custom?.price ?? it.price) || 0,
          category: it.custom?.category || it.category || '',
        }
        const custom = it.custom && typeof it.custom === 'object'
          ? { ...baseCustom, ...it.custom, name: it.custom.name || baseCustom.name }
          : baseCustom
        return {
          itemId: it.itemId || undefined,
          qty: Number(it.qty) || 1,
          mods,
          custom,
          category: custom.category || '',
        }
      }))
      if (cart.orderType) setOrderType(cart.orderType === 'Drive-thru' ? 'Foodpanda' : cart.orderType)
      if (cart.customer) {
        setPayName(cart.customer.name || '')
        setPayPhone(cart.customer.phone || '')
        setPayAddress(cart.customer.address || '')
      }
      if (cart.remarks) setKotRemarks(cart.remarks)
      try {
        if (cart.callCenterOrderId) sessionStorage.setItem('cc_order_id', String(cart.callCenterOrderId))
      } catch {}
      ccCartAppliedRef.current = true
      // Keep payload briefly so a branch remount can re-apply; then drop it
      setTimeout(() => {
        try { sessionStorage.removeItem('cc_cart_payload') } catch {}
      }, 5000)
      toast.success(
        cart.isAddOn
          ? 'ADD-ON order (same customer) loaded — review and press KOT'
          : 'Call-center order loaded — review and press KOT'
      )
      return true
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    // Fresh mount / navigation (incl. ?from=callcenter) — allow apply once from session
    ccCartAppliedRef.current = false
    applyCcCartPayload()
    const onReh = () => { applyCcCartPayload() }
    window.addEventListener('data_rehydrated', onReh)
    const t = setTimeout(() => {
      if (sessionStorage.getItem('cc_cart_payload') && !ccCartAppliedRef.current) {
        applyCcCartPayload()
      }
    }, 400)
    return () => {
      window.removeEventListener('data_rehydrated', onReh)
      clearTimeout(t)
    }
  }, [applyCcCartPayload, location.search, location.key])

  // Actions (stubs)
  const resetAll = () => {
    // Cart and filters
    setItems([])
    setSelectedCategory('')
    setCategoryPath([])
    // Payment method
    setPaymentMethod('cash')
    setBankChannel('ubl')
    setBankLast4('')
    setBankRef('')
    setPayStaffId('')
    setPayStaffName('')
    // Cash received
    setCashReceived(0)
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
    setDeliveryAmt(0)
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
    try {
      sessionStorage.removeItem('cc_cart_payload')
      sessionStorage.removeItem('cc_order_id')
    } catch {}
    ccCartAppliedRef.current = false
  }
  const discardSale = async () => { 
    if (!items.length) return; 
    const confirmed = await confirm({ title: 'Discard Sale', message: 'Discard current sale?' })
    if (!confirmed) return; 
    setItems([]) 
  }
  const mapCartItemForPersist = (it) => {
    const m = menu.find(x => x.id === it.itemId)
    const catName = resolveItemCategoryName(m, it)
    const cat = findCategoryByName(allCategories, catName)
    const pkg = getCategoryPackagePrice(cat, it)
    const price = resolvePersistUnitPrice(m, it, allCategories, lineTotal)
    return {
      itemId: it.itemId,
      name: it.custom?.name || m?.name || '',
      price,
      qty: Number(it.qty || 1),
      mods: it.mods || {},
      custom: it.custom || (m ? { name: m.name, price: Number(m.price || 0), category: m.category } : null),
      category: catName || m?.category || '',
      ...(pkg > 0 ? { categoryPrice: pkg } : {}),
    }
  }

  const onKot = async () => {
    if (!items.length) { toast.error('Add items before KOT'); return }
    if (!orderType) { toast.error('Please select an order type first'); return }
    const limits = validateCategorySelectionLimits(items, menu, allCategories)
    if (!limits.ok) { toast.error(limits.message); return }

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
    if (!requireBranch('Select a branch in the header before selling')) return
    if (!items.length) return
    // Build a minimal order object similar to recall for unified payment flow
    const limits = validateCategorySelectionLimits(items, menu, allCategories)
    if (!limits.ok) { toast.error(limits.message); return }
    const buildOrd = () => {
      const mappedItems = items.map(mapCartItemForPersist)
      const subtotalLocal = computeCategoryAwareSubtotal(items, menu, allCategories, lineTotal)
      const totalQtyLocal = mappedItems.reduce((s,it)=> s + Number(it.qty||0), 0)
      return {
        createdAt: Date.now(),
        orderType,
        items: mappedItems,
        waiterId: orderType==='Dine-in' ? kotWaiterId : '',
        tableNo: orderType==='Dine-in' ? kotTable : '',
        customer: orderType==='Delivery'
          ? resolveCustomerSnapshot({
              id: activeRecallSource === 'recall' ? (activeRecall?.customer?.id || activeRecall?.customer?._id) : undefined,
              name: (payName || (activeRecallSource==='recall' ? (activeRecall?.customer?.name || '') : '')),
              phone: (payPhone || (activeRecallSource==='recall' ? (activeRecall?.customer?.phone || '') : '')),
              address: (payAddress || (activeRecallSource==='recall' ? (activeRecall?.customer?.address || '') : '')),
            }, state.customers || [])
          : null,
        totalQty: totalQtyLocal,
        subtotal: subtotalLocal,
        itemsDiscount: Number(itemsDiscount||0),
        billDiscount: Number(billDiscAmt||0),
        taxAmt: Number(taxAmt||0),
        serviceAmt: Number(serviceAmt||0),
        deliveryAmt: Number(deliveryAmt||0),
        totalAmount: Math.max(0, subtotalLocal - Number(itemsDiscount||0) - Number(billDiscAmt||0) + Number(taxAmt||0) + Number(serviceAmt||0) + Number(deliveryAmt||0)),
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
    setRecallToPay(ord)
    setPendingPayOpts(null)
    setShowPayMethod(true)
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

  // Staff purchase: list Active staff from every accessible branch
  useEffect(() => {
    if (!token) { setStaffAllBranches([]); return }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${API}/api/staff?limit=500&allBranches=1`, {
          headers: authHeaders,
          cache: 'no-store',
        })
        if (!res.ok) return
        const json = await res.json().catch(() => ({}))
        const rows = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : [])
        const branchLabel = (bid) => {
          const b = (branches || []).find(x => String(x._id || x.id) === String(bid || ''))
          return b?.name || b?.code || ''
        }
        const mapped = rows.map(r => ({
          ...r,
          id: r.id || r._id,
          branchName: r.branchName || branchLabel(r.branchId) || '',
        }))
        if (!cancelled) setStaffAllBranches(mapped)
      } catch {
        if (!cancelled) setStaffAllBranches([])
      }
    })()
    return () => { cancelled = true }
  }, [token, API, branches])

  const staffForPurchase = useMemo(() => {
    const list = staffAllBranches.length ? staffAllBranches : staff
    return (list || []).filter(s => String(s.status || 'Active').toLowerCase() !== 'inactive')
  }, [staffAllBranches, staff])
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
  // Compute currently occupied tables from open dine-in recalls (name-normalized)
  const occupiedTables = useMemo(() => {
    try {
      const set = new Set()
      ;(Array.isArray(recalls) ? recalls : []).forEach(r => {
        const tableNo = String(r?.tableNo || '').trim()
        if ((r?.orderType || '') === 'Dine-in' && tableNo) set.add(tableNo)
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
      if (ord.orderType) setOrderType(ord.orderType === 'Drive-thru' ? 'Foodpanda' : ord.orderType)
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
      setDeliveryAmt(Number(ord.deliveryAmt || ord.deliveryCharges || 0))
      if (ord.paymentMethod) setPaymentMethod(ord.paymentMethod)
      setActiveRecall(ord)
      setActiveRecallSource('recall')
    } catch {}
    setShowRecall(false)
  }
  const handleRecallPay = (ord) => {
    setShowRecall(false)
    setRecallToPay(ord)
    setPendingPayOpts(null)
    setShowPayMethod(true)
  }

  const applyPayOpts = (pay) => {
    if (!pay) return
    setPaymentMethod(pay.method || 'cash')
    setBankChannel(pay.bankChannel || '')
    setBankLast4(pay.bankLast4 || '')
    setBankRef('')
    setCashReceived(Number(pay.cashReceived || 0))
    setPayStaffId(pay.staffId || '')
    setPayStaffName(pay.staffName || '')
  }

  const paySubmittingRef = useRef(false)
  const [payLocked, setPayLocked] = useState(false)

  const continueAfterPaymentMethod = (ord, pay) => {
    if (paySubmittingRef.current) return
    applyPayOpts(pay)
    const usesFp =
      String(pay?.orderType || '') === 'Foodpanda' ||
      String(pay?.method || '').toLowerCase() === 'foodpanda' ||
      (Array.isArray(pay?.payments) && pay.payments.some(p => String(p.method || '').toLowerCase() === 'foodpanda'))

    let nextOrd = ord
    let nextPay = pay
    if (usesFp) {
      setOrderType('Foodpanda')
      const fpLineTotal = createLineTotal(state.settings?.modifiers || {}, () => 'Foodpanda')
      const menuList = state.menu || []
      const cats = state.categories || []
      const pricedItems = (ord.items || []).map(it => {
        const m = menuList.find(x => String(x.id) === String(it.itemId))
        const unit = resolvePersistUnitPrice(m, it, cats, fpLineTotal)
        return { ...it, price: unit, name: it.name || m?.name || '' }
      })
      const sub = computeCategoryAwareSubtotal(pricedItems, menuList, cats, fpLineTotal)
      const disc = computeCategoryAwareDiscount(pricedItems, menuList, cats, fpLineTotal)
      const billDisc = Number(ord.billDiscount || 0)
      const tax = Number(ord.taxAmt || 0)
      const service = Number(ord.serviceAmt || 0)
      const delivery = Number(ord.deliveryAmt || 0)
      const totalAmount = Math.max(0, Math.round(sub - disc - billDisc + tax + service + delivery))
      nextOrd = {
        ...ord,
        orderType: 'Foodpanda',
        items: pricedItems,
        subtotal: sub,
        itemsDiscount: disc,
        totalAmount,
      }
      // Single Foodpanda tender: align amount to FP total so rates stick on the bill
      if (Array.isArray(pay?.payments) && pay.payments.length === 1 && String(pay.payments[0].method || '').toLowerCase() === 'foodpanda') {
        nextPay = {
          ...pay,
          orderType: 'Foodpanda',
          method: 'foodpanda',
          payments: [{ ...pay.payments[0], amount: totalAmount }],
          cashReceived: 0,
          tipAmount: 0,
        }
      } else {
        nextPay = { ...pay, orderType: 'Foodpanda' }
      }
    }
    setPendingPayOpts(nextPay)
    const rider = nextPay?.rider || (nextPay?.riderId ? { id: nextPay.riderId, name: nextPay.riderName || '' } : null)
    ;(async () => { await finalizePayment(nextOrd, rider, nextPay) })()
  }

  const finalizePayment = async (ord, rider, payOverride = null) => {
    if (paySubmittingRef.current) return
    paySubmittingRef.current = true
    setPayLocked(true)
    try {
      const pay = payOverride || pendingPayOpts
      let payments = Array.isArray(pay?.payments) && pay.payments.length
        ? pay.payments.map(p => ({
            method: String(p.method || 'cash').toLowerCase(),
            amount: Math.max(0, Number(p.amount || 0)),
            bankChannel: p.bankChannel || '',
            bankLast4: p.bankLast4 || '',
            staffId: p.staffId || '',
            staffName: p.staffName || '',
          })).filter(p => p.method && p.method !== 'split' && p.amount > 0)
        : []
      if (!payments.length) {
        const singleMethod = String(pay?.method || paymentMethod || 'cash').toLowerCase()
        payments = [{
          method: singleMethod === 'split' ? 'cash' : singleMethod,
          amount: Number(ord.totalAmount || 0),
          bankChannel: pay?.bankChannel || bankChannel || '',
          bankLast4: pay?.bankLast4 || bankLast4 || '',
          staffId: pay?.staffId || payStaffId || '',
          staffName: pay?.staffName || payStaffName || '',
        }]
      }
      const method = payments.length === 1 ? payments[0].method : 'split'
      const channel = payments.find(p => p.method === 'bank')?.bankChannel || pay?.bankChannel || bankChannel || ''
      const last4 = payments.find(p => p.method === 'bank' || p.method === 'card')?.bankLast4 || pay?.bankLast4 || bankLast4 || ''
      const cashIn = pay?.cashReceived ?? cashReceived
      const staffLeg = payments.find(p => p.method === 'staff')
      const staffIdPay = staffLeg?.staffId || pay?.staffId || payStaffId
      const staffNamePay = staffLeg?.staffName || pay?.staffName || payStaffName
      for (const p of payments) {
        if (p.method === 'bank' && p.bankLast4 && !/^\d{4}$/.test(String(p.bankLast4))) {
          toast.error('Last 4 digits must be exactly 4 digits'); return
        }
        if (p.method === 'card' && p.bankLast4 && !/^\d{4}$/.test(String(p.bankLast4))) {
          toast.error('Last 4 digits must be exactly 4 digits'); return
        }
        if (p.method === 'staff' && !p.staffId) { toast.error('Select the staff member'); return }
      }
      const paidSum = payments.reduce((s, p) => s + Number(p.amount || 0), 0)
      const tipAmount = Math.max(
        0,
        Number(pay?.tipAmount || 0) || Math.max(0, (Number(cashIn) || 0) - (Number(ord.totalAmount) || 0)),
        Math.max(0, paidSum - (Number(ord.totalAmount) || 0)),
      )
      const usesFpPay =
        String(pay?.orderType || '') === 'Foodpanda' ||
        String(method || '').toLowerCase() === 'foodpanda' ||
        payments.some(p => String(p.method || '').toLowerCase() === 'foodpanda')
      const saleOrderType = usesFpPay ? 'Foodpanda' : (ord.orderType || '')

      // 1) Create sale
      const saleBody = {
        createdAt: ord.createdAt || Date.now(),
        tokenNo: ord.tokenNo || '',
        orderType: saleOrderType,
        items: (ord.items||[]).map(it => ({ itemId: it.itemId, name: it.name, price: Number(it.price||0), qty: Number(it.qty||0), mods: it.mods||{}, custom: it.custom||null })),
        waiterId: ord.waiterId || '',
        tableNo: ord.tableNo || '',
        customer: resolveCustomerSnapshot(
          ord.customer || activeRecall?.customer || ((ord.orderType || '') === 'Delivery' ? { name: payName, phone: payPhone, address: payAddress } : null),
          state.customers || []
        ),
        totalQty: Number(ord.totalQty|| (Array.isArray(ord.items)? ord.items.reduce((s,i)=>s+Number(i.qty||0),0):0)),
        subtotal: Number(ord.subtotal||0),
        itemsDiscount: Number(ord.itemsDiscount||0),
        billDiscount: Number(ord.billDiscount||0),
        taxAmt: Number(ord.taxAmt||0),
        serviceAmt: Number(ord.serviceAmt||0),
        deliveryAmt: Number(ord.deliveryAmt||0),
        totalAmount: Number(ord.totalAmount||0),
        remarks: ord.remarks || '',
        status: 'PAID',
        paymentMethod: method,
        payments,
        bankChannel: channel || '',
        bankLast4: String(last4 || ''),
        bankRef: '',
        tipAmount,
        cashReceived: Number(cashIn || 0) || payments.filter(p => p.method === 'cash').reduce((s, p) => s + Number(p.amount || 0), 0),
        staffId: staffLeg ? String(staffIdPay) : '',
        staffName: staffLeg ? staffNamePay : '',
        staffSettlement: staffLeg ? 'pay_later' : '',
        staffChargeAmount: staffLeg ? Number(staffLeg.amount || 0) : 0,
        riderId: rider?.id || '',
        riderName: rider?.name || '',
        // Ensure dashboard uses business date
        date: String(businessDate || '').slice(0, 10) || new Date().toLocaleDateString('en-CA'),
        deliveryDate: String(businessDate || '').slice(0, 10) || new Date().toLocaleDateString('en-CA'),
        // Provide recallId so server can atomically delete the corresponding recall
        recallId: (ord?.id || ord?._id || null),
        callCenterOrderId: ord?.callCenterOrderId || (() => { try { return sessionStorage.getItem('cc_order_id') || '' } catch { return '' } })(),
      }
      const saleIdemKey = (ord?.id || ord?._id) ? `sale-${ord.id || ord._id}` : `sale-${businessDate || 'nodate'}-${Date.now()}`
      const saleRes = await fetch(`${API}/api/sales`, { method: 'POST', headers: { ...authHeaders, 'X-Idempotency-Key': saleIdemKey }, body: JSON.stringify(saleBody) })
      if (!saleRes.ok) {
        let detail = ''
        try {
          const errBody = await saleRes.json()
          detail = errBody?.detail || errBody?.error || ''
        } catch {}
        toast.error(detail ? `Failed to create sale: ${detail}` : 'Failed to create sale')
        return
      }
      const savedSale = await saleRes.json()
      // Close payment UI only after a successful save
      setShowPayMethod(false)
      setRecallToPay(null)
      try { if (saleBody.callCenterOrderId) sessionStorage.removeItem('cc_order_id') } catch {}

      // Print receipt — tip (not change) when customer overpays in cash
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
          paymentMethod: method,
          payments: saleBody.payments,
          bankChannel: saleBody.bankChannel,
          bankLast4: saleBody.bankLast4,
          bankRef: '',
          staffId: saleBody.staffId,
          staffName: saleBody.staffName,
          staffSettlement: saleBody.staffSettlement,
          cashReceived: Number(saleBody.cashReceived || 0),
          changeDue: 0,
          tipAmount,
          customer: saleBody.customer,
          itemsDiscount: saleBody.itemsDiscount,
          billDiscount: saleBody.billDiscount,
          taxAmt: saleBody.taxAmt,
          serviceAmt: saleBody.serviceAmt,
          deliveryAmt: saleBody.deliveryAmt,
          billNo: savedSale?.billNo,
          userName: user?.name || user?.username || 'USER',
          riderId: rider?.id || '',
          rider: rider?.name || '',
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
        const hydrate = { sales: nextSales }
        if (savedSale?.tipPayOut) {
          const tipEntry = { ...savedSale.tipPayOut, id: savedSale.tipPayOut.id || savedSale.tipPayOut._id }
          hydrate.payInOuts = [tipEntry, ...(state.payInOuts || [])]
        }
        dispatch({ type: 'HYDRATE', payload: hydrate })
      } catch {}
      if (tipAmount > 0) {
        toast.success(`Waiter tip Pay Out: PKR ${tipAmount.toLocaleString()}`)
      }

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
        const yyyyMmDd = String(businessDate||'').slice(0,10) || new Date().toLocaleDateString('en-CA')
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
      setRecallToPay(null)
      setShowPayMethod(false)
      setPendingPayOpts(null)
      // Reset discounts/charges so bill summary clears
      setBillDiscPct(0)
      setBillDiscAmt(0)
      setServicePct(0)
      setServiceAmt(0)
      setTaxPct(0)
      setTaxAmt(0)
      setDeliveryAmt(0)
      // Reset cash received
      setCashReceived(0)
      // Reset payment method
      setPaymentMethod('cash')
      setBankChannel('ubl')
      setBankLast4('')
      setBankRef('')
      setPayStaffId('')
      setPayStaffName('')
      // Reset order type and related fields so UI goes back to neutral state
      setOrderType('')
      setKotWaiterId('')
      setKotTable('')
      setKotRemarks('')
      setPayName('')
      setPayPhone('')
      setPayAddress('')
      setShowDelivery(false)
      toast.success('Sale recorded')
    } catch (err) {
      console.error('[finalizePayment]', err)
      toast.error('Payment failed')
    } finally {
      paySubmittingRef.current = false
      setPayLocked(false)
    }
  }
  const handleCustomerBill = (ord) => {
    try {
      if (!ord) return
      const items = (Array.isArray(ord.items) ? ord.items : []).map(it => {
        const m = (state.menu||[]).find(x=>x.id===it.itemId)
        const price = (typeof it.price === 'number') ? it.price : (m ? (createLineTotal(state.settings?.modifiers||{}, () => ord.orderType)(m, { ...it, qty: 1 })||0) : Number(it.custom?.price||0))
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
        deliveryAmt: Number(ord.deliveryAmt||0),
        billNo: '',
        userName: user?.name || user?.username || 'USER',
        // Use logo from settings; do not reference a missing public file
        logoUrl: state?.settings?.receiptLogo || state?.settings?.logo || state?.settings?.logoUrl || '',
        autoPrint: false,
      })
    } catch {}
  }

  // Print customer bill for the currently-recalled order, using the live
  // cart items + current billing summary values (user may have edited them)
  const handlePrintActiveRecall = () => {
    if (!activeRecall) return
    const ord = {
      ...activeRecall,
      items: items.map(it => {
        const m = menu.find(x=>x.id===it.itemId)
        const price = m ? (lineTotal(m, { ...it, qty: 1 }) || 0) : Number(it.custom?.price || 0)
        return { itemId: it.itemId, name: it.custom?.name || m?.name || '', price, qty: Number(it.qty||1), mods: it.mods||{}, custom: it.custom||null }
      }),
      orderType: orderType || activeRecall.orderType,
      waiterId: activeRecall.waiterId || kotWaiterId,
      tableNo: activeRecall.tableNo || kotTable,
      itemsDiscount: Number(itemsDiscount||0),
      billDiscount: Number(billDiscAmt||0),
      taxAmt: Number(taxAmt||0),
      serviceAmt: Number(serviceAmt||0),
      deliveryAmt: Number(deliveryAmt||0),
    }
    handleCustomerBill(ord)
  }

  const handleHeldPrint = (h) => {
    try {
      if (!h) return
      const items = (Array.isArray(h.items) ? h.items : []).map(it => {
        const m = (state.menu||[]).find(x=>x.id===it.itemId)
        const price = (typeof it.price === 'number') ? it.price : (m ? (createLineTotal(state.settings?.modifiers||{}, () => h.orderType)(m, { ...it, qty: 1 })||0) : Number(it.custom?.price||0))
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
      bankChannel: paymentMethod === 'bank' ? bankChannel : '',
      bankLast4: (paymentMethod === 'bank' || paymentMethod === 'card') ? String(bankLast4) : '',
      bankRef: '',
      staffId: paymentMethod === 'staff' ? String(payStaffId) : '',
      staffName: paymentMethod === 'staff' ? payStaffName : '',
      customer: orderType==='Delivery' ? resolveCustomerSnapshot({ name: payName, phone: payPhone, address: payAddress }, state.customers || []) : null,
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
      if (h.orderType) setOrderType(h.orderType === 'Drive-thru' ? 'Foodpanda' : h.orderType)
      if (h.paymentMethod) setPaymentMethod(h.paymentMethod)
      if (h.bankChannel) setBankChannel(h.bankChannel)
      if (h.bankLast4) setBankLast4(String(h.bankLast4))
      if (h.bankRef) setBankRef(String(h.bankRef))
      if (h.staffId) setPayStaffId(String(h.staffId))
      if (h.staffName) setPayStaffName(String(h.staffName))
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
    // Update recalled order with current cart items + order type / table / customer
    if (!activeRecall) { toast.error('No recalled order'); return }
    if (activeRecallSource !== 'recall') { toast.error('Update is only available for recalled orders'); return }
    if (!items.length) { toast.error('No items to update'); return }
    if (!orderType) { toast.error('Select an order type before updating'); return }
    if (orderType === 'Dine-in' && !String(kotTable || activeRecall.tableNo || '').trim()) {
      toast.error('Select a table for Dine-in (use Change Table or KOT)')
      return
    }

    try {
      // Build merged items from current cart
      const mergedItems = items.map(mapCartItemForPersist)

      // Recalculate totals (category package price ignores item prices)
      const subtotalLocal = computeCategoryAwareSubtotal(items, menu, allCategories, lineTotal)
      const totalQtyLocal = mergedItems.reduce((s,it)=> s + Number(it.qty||0), 0)
      const totalAmountLocal = Math.max(0, subtotalLocal - Number(itemsDiscount||0) - Number(billDiscAmt||0) + Number(taxAmt||0) + Number(serviceAmt||0) + Number(deliveryAmt||0))

      const nextTable = orderType === 'Dine-in'
        ? String(kotTable || activeRecall.tableNo || '').trim()
        : ''
      const nextWaiter = orderType === 'Dine-in'
        ? String(kotWaiterId || activeRecall.waiterId || '').trim()
        : ''
      const nextCustomer = orderType === 'Delivery'
        ? {
          name: payName || activeRecall?.customer?.name || '',
          phone: payPhone || activeRecall?.customer?.phone || '',
          address: payAddress || activeRecall?.customer?.address || '',
        }
        : null

      const patchBody = {
        items: mergedItems,
        totalQty: totalQtyLocal,
        subtotal: subtotalLocal,
        itemsDiscount: Number(itemsDiscount||0),
        billDiscount: Number(billDiscAmt||0),
        taxAmt: Number(taxAmt||0),
        serviceAmt: Number(serviceAmt||0),
        deliveryAmt: Number(deliveryAmt||0),
        totalAmount: totalAmountLocal,
        orderType,
        tableNo: nextTable,
        waiterId: nextWaiter,
        customer: nextCustomer,
      }

      const recallId = activeRecall.id || activeRecall._id
      const res = await fetch(`${API}/api/recalls/${recallId}`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify(patchBody) })
      if (res.ok) {
        const updated = await res.json()
        const merged = {
          ...activeRecall,
          ...updated,
          id: updated.id || updated._id || recallId,
          orderType,
          tableNo: nextTable,
          waiterId: nextWaiter,
          customer: nextCustomer,
          items: mergedItems,
          totalAmount: totalAmountLocal,
        }
        setActiveRecall(merged)
        // Optimistic list update so Recall dialog shows new order type immediately
        const nextRecalls = (Array.isArray(state.recalls) ? state.recalls : []).map(r => {
          const rid = String(r.id || r._id || '')
          return rid === String(recallId) ? { ...r, ...merged } : r
        })
        dispatch({ type: 'HYDRATE', payload: { recalls: nextRecalls } })
        await refreshRecalls()
        toast.success(`Order updated (${orderType})`)
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

      // Category-priced deals must be voided all-or-nothing (no single item)
      {
        const orderItems = Array.isArray(r.items) ? r.items : items
        const voidByKey = new Map()
        const keyOfLine = (it) => {
          const mods = it.mods || {}
          const isCustom = !menu.some(x => String(x.id) === String(it.itemId))
          const customKey = isCustom ? `|${(it.custom?.name || it.name || '')}` : ''
          return `${it.itemId}${customKey}|${JSON.stringify(mods)}`
        }
        itemsForBody.forEach(it => {
          const k = keyOfLine(it)
          voidByKey.set(k, (voidByKey.get(k) || 0) + Number(it.qty || 0))
        })
        const dealGroups = new Map()
        orderItems.forEach(it => {
          const m = menu.find(x => String(x.id) === String(it.itemId))
          const catName = resolveItemCategoryName(m, it)
          const cat = findCategoryByName(allCategories, catName)
          const pkg = getCategoryPackagePrice(cat, it)
          if (!(pkg > 0) || !catName) return
          const key = categoryKeyOf(cat, catName) || `name:${catName.toLowerCase()}`
          const g = dealGroups.get(key) || { name: cat?.name || catName, lines: [] }
          g.lines.push(it)
          dealGroups.set(key, g)
        })
        for (const g of dealGroups.values()) {
          let any = false
          let allFull = true
          for (const it of g.lines) {
            const vq = Number(voidByKey.get(keyOfLine(it)) || 0)
            const oq = Number(it.qty || 0)
            if (vq > 0) any = true
            if (vq !== oq) allFull = false
          }
          if (any && !allFull) {
            toast.error(`Cannot void a single item from "${g.name}" — void the whole deal`)
            return
          }
        }
      }

      const itemsMapped = itemsForBody.map(it => {
        const m = (state.menu||[]).find(x=>x.id===it.itemId)
        const name = it.custom?.name || m?.name || it.itemId
        return { itemId: it.itemId, qty: Number(it.qty||0), custom: { ...(it.custom||{}), name }, mods: it.mods||{}, category: it.category || m?.category || '', categoryPrice: it.categoryPrice }
      })

      const body = {
        createdAt: Date.now(),
        date: String(businessDate||'').slice(0,10),
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
          // Recompute totals and PATCH (keep category package pricing)
          const patched = remaining.map(mapCartItemForPersist)
          const subtotalLocal = computeCategoryAwareSubtotal(remaining, menu, allCategories, lineTotal)
          const totalQtyLocal = patched.reduce((s,it)=> s + Number(it.qty||0), 0)
          const totalAmountLocal = Math.max(0, subtotalLocal - Number(itemsDiscount||0) - Number(billDiscAmt||0) + Number(taxAmt||0) + Number(serviceAmt||0))
          const patchBody = { items: patched, subtotal: subtotalLocal, totalQty: totalQtyLocal, itemsDiscount: Number(itemsDiscount||0), billDiscount: Number(billDiscAmt||0), taxAmt: Number(taxAmt||0), serviceAmt: Number(serviceAmt||0), totalAmount: totalAmountLocal }
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
    if (!requireBranch('Select a branch in the header before sending KOT')) return
    // Prevent accidental double submissions (e.g., double click)
    if (kotSubmittingRef.current) return
    if (kotMode === 'kot') {
      const limits = validateCategorySelectionLimits(items, menu, allCategories)
      if (!limits.ok) { toast.error(limits.message); return }
    }
    kotSubmittingRef.current = true
    setKotSubmitting(true)
    // If this is a recalled Dine-in order, ensure waiter/table are prefilled from recall
    if ((orderType === 'Dine-in') && activeRecall) {
      if (!kotWaiterId && activeRecall.waiterId) setKotWaiterId(activeRecall.waiterId)
      if (!kotTable && activeRecall.tableNo) setKotTable(activeRecall.tableNo)
    }
    if (orderType === 'Dine-in') {
      const selectedTable = String(kotTable || '').trim()
      if (!selectedTable) { toast.error('Please select a table'); kotSubmittingRef.current = false; setKotSubmitting(false); return }
      // Block creating a new recall on an occupied table (allow if updating same recalled order)
      const isOccupied = occupiedTables.has(selectedTable)
      const isSameRecalledTable = !!(activeRecall && String(activeRecall.tableNo || '').trim() === selectedTable)
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
          const mergedItems = Array.from(mergedMap.values()).map(mapCartItemForPersist)

          // Recalculate totals for the recall (category package price ignores item prices)
          const subtotalLocal = computeCategoryAwareSubtotal(mergedItems, menu, allCategories, lineTotal)
          const totalQtyLocal = mergedItems.reduce((s,it)=> s + Number(it.qty||0), 0)
          const totalAmountLocal = Math.max(0, subtotalLocal - Number(itemsDiscount||0) - Number(billDiscAmt||0) + Number(taxAmt||0) + Number(serviceAmt||0) + Number(deliveryAmt||0))

          // PATCH the existing recall (if we have an id); otherwise just print delta
          const patchBody = {
            items: mergedItems,
            totalQty: totalQtyLocal,
            subtotal: subtotalLocal,
            itemsDiscount: Number(itemsDiscount||0),
            billDiscount: Number(billDiscAmt||0),
            taxAmt: Number(taxAmt||0),
            serviceAmt: Number(serviceAmt||0),
            deliveryAmt: Number(deliveryAmt||0),
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
          const deltaLines = delta.map(it => {
            const m = menu.find(x => String(x.id) === String(it.itemId))
            return {
              itemId: it.itemId,
              name: nameForKot(it),
              qty: Number(it.qty || 1),
              mods: it.mods || {},
              custom: it.custom || (m ? { name: m.name, price: Number(m.price || 0), category: m.category } : null),
              category: it.category || it.custom?.category || m?.category || '',
            }
          })
          // Save this KOT punch to history (delta only)
          try {
            const kotItems = delta.map(it => {
              const m = menu.find(x=>x.id===it.itemId)
              const custom = it.custom || (m ? { name: m.name, price: Number(m.price||0), category: m.category } : null)
              return { itemId: it.itemId, qty: Number(it.qty||1), custom, mods: it.mods||{} }
            })
            const ccOrderId = (() => { try { return sessionStorage.getItem('cc_order_id') || '' } catch { return '' } })()
            const kotBody = {
              createdAt: Date.now(),
              date: String(businessDate||'').slice(0,10),
              orderType: orderType || activeRecall.orderType || 'Dine-in',
              tokenNo: activeRecall.tokenNo || '',
              waiterId: kotWaiterId || activeRecall.waiterId || '',
              tableNo: kotTable || activeRecall.tableNo || '',
              floor: tables.find(t => (t.name || t.label || t.code || String(t)) === (kotTable || activeRecall.tableNo))?.floor || activeRecall.floor || '',
              customerName: payName || activeRecall?.customer?.name || '',
              customerPhone: payPhone || activeRecall?.customer?.phone || '',
              customerAddress: payAddress || activeRecall?.customer?.address || '',
              remarks: kotRemarks || activeRecall.remarks || '',
              items: kotItems,
              callCenterOrderId: ccOrderId || activeRecall?.callCenterOrderId || '',
            }
            const kotRes = await fetch(`${API}/api/kots`, { method: 'POST', headers: { ...authHeaders, 'X-Idempotency-Key': idemKey }, body: JSON.stringify(kotBody) }).catch(()=>null)
            if (ccOrderId && kotRes?.ok) {
              try {
                const kj = await kotRes.json()
                await fetch(`${API}/api/call-center-orders/${ccOrderId}/mark-kot`, {
                  method: 'POST',
                  headers: authHeaders,
                  body: JSON.stringify({ kotId: kj.id || kj._id, recallId: activeRecall?.id || '' }),
                })
                try {
                  sessionStorage.removeItem('cc_order_id')
                  sessionStorage.removeItem('cc_cart_payload')
                } catch {}
              } catch {}
            }
          } catch {}
          // Look up floor for the table
          const tableObj = orderType === 'Dine-in' && kotTable
            ? tables.find(t => (t.name || t.label || t.code || String(t)) === kotTable)
            : null
          const floor = tableObj?.floor || ''
          
          // Silent print when KOT printer is set; preview only as fallback
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
          items: items.map(mapCartItemForPersist),
          waiterId: orderType==='Dine-in' ? kotWaiterId : '',
          tableNo: orderType==='Dine-in' ? kotTable : '',
          customer: orderType==='Delivery' ? resolveCustomerSnapshot({ name: payName, phone: payPhone, address: payAddress }, state.customers || []) : null,
          totalQty: totalQtyLocal,
          subtotal: subtotalLocal,
          itemsDiscount: Number(itemsDiscount||0),
          billDiscount: Number(billDiscAmt||0),
          taxAmt: Number(taxAmt||0),
          serviceAmt: Number(serviceAmt||0),
          deliveryAmt: Number(deliveryAmt||0),
          totalAmount: Number(totalPayment||0),
          remarks: kotRemarks || '',
      paymentMethod: paymentMethod || 'cash',
      bankChannel: paymentMethod === 'bank' ? bankChannel : '',
      bankLast4: (paymentMethod === 'bank' || paymentMethod === 'card') ? String(bankLast4) : '',
      bankRef: '',
      staffId: paymentMethod === 'staff' ? String(payStaffId) : '',
      staffName: paymentMethod === 'staff' ? payStaffName : '',
      staffSettlement: paymentMethod === 'staff' ? 'pay_later' : '',
      callCenterOrderId: (() => { try { return sessionStorage.getItem('cc_order_id') || '' } catch { return '' } })(),
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
            const ccOrderId = body.callCenterOrderId || ''
            const kotBody = {
              createdAt: Date.now(),
              date: String(businessDate||'').slice(0,10),
              orderType,
              tokenNo: createdRecall?.tokenNo || '',
              waiterId: orderType==='Dine-in' ? kotWaiterId : '',
              tableNo: orderType==='Dine-in' ? kotTable : '',
              floor: orderType==='Dine-in' && kotTable ? (tables.find(t => (t.name || t.label || t.code || String(t)) === kotTable)?.floor || '') : '',
              customerName: orderType==='Delivery' ? payName : '',
              customerPhone: orderType==='Delivery' ? payPhone : '',
              customerAddress: orderType==='Delivery' ? payAddress : '',
              remarks: kotRemarks || '',
              items: kotItems,
              callCenterOrderId: ccOrderId,
            }
            const kotRes = await fetch(`${API}/api/kots`, { method: 'POST', headers: { ...authHeaders, 'X-Idempotency-Key': idemKey }, body: JSON.stringify(kotBody) }).catch(()=>null)
            if (ccOrderId && kotRes?.ok) {
              try {
                const kj = await kotRes.json()
                await fetch(`${API}/api/call-center-orders/${ccOrderId}/mark-kot`, {
                  method: 'POST',
                  headers: authHeaders,
                  body: JSON.stringify({ kotId: kj.id || kj._id, recallId: createdRecall?.id || createdRecall?._id || '' }),
                })
                try {
                  sessionStorage.removeItem('cc_order_id')
                  sessionStorage.removeItem('cc_cart_payload')
                } catch {}
              } catch {}
            }
          } catch {}
          // Look up floor for the table
          const tableObj = orderType === 'Dine-in' && kotTable
            ? tables.find(t => (t.name || t.label || t.code || String(t)) === kotTable)
            : null
          const floor = tableObj?.floor || ''
          
          // Silent print when KOT printer is set; preview only as fallback
          await openKotPrintUtil({
            state,
            items: items.map(it => {
              const m = menu.find(x => String(x.id) === String(it.itemId))
              const size = String(it?.mods?.size || it?.size || '').toUpperCase()
              const ids = Array.isArray(it?.mods?.flavours) ? it.mods.flavours : []
              let name
              if (ids.length) {
                const names = ids.map(fid => (menu.find(x => String(x.id) === String(fid))?.name || '')).filter(Boolean)
                const fallback = it.custom?.name || m?.name || it.name || String(it.itemId || '')
                const title = names.join(' + ') || fallback
                name = size ? `${title} (${size})` : title
              } else {
                const base = it.custom?.name || m?.name || it.name || String(it.itemId || '')
                name = size ? `${base} (${size})` : base
              }
              return {
                itemId: it.itemId,
                name,
                qty: Number(it.qty || 1),
                mods: it.mods || {},
                custom: it.custom || (m ? { name: m.name, price: Number(m.price || 0), category: m.category } : null),
                category: it.category || it.custom?.category || m?.category || '',
              }
            }),
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
          let detail = ''
          try {
            const txt = await res.text()
            console.error('Failed to create recall', res.status, txt)
            try { detail = JSON.parse(txt)?.error || txt } catch { detail = txt }
          } catch {}
          toast.error(detail ? `Failed to send KOT: ${detail}` : 'Failed to send KOT (could not create recall). Please try again.')
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
    <form onSubmit={submit} className="p-1 sm:p-2 grid grid-cols-1 md:grid-cols-12 gap-2 md:h-full md:overflow-hidden md:min-h-0">
      {/* Left: categories, then items list */}
      <div className="md:col-span-7 space-y-2 md:flex md:flex-col md:min-h-0 md:overflow-hidden">
        {/* Category + items share equal height */}
        <div className="min-h-[320px] md:min-h-0 md:flex-1 md:grid md:grid-rows-2 md:gap-2 md:overflow-hidden grid grid-rows-2 gap-2">
          <div className="min-h-0 overflow-hidden">
            <CategoryBar
              categories={categories}
              selectedCategory={categoryBarSelected}
              onSelectCategory={onSelectCategory}
              tilesPerRow={state.settings?.posCategoryTilesPerRow || 4}
            />
          </div>
          <div className="min-h-0 overflow-hidden">
            <ItemsList
              selectedCategory={selectedCategory}
              itemsInCategory={itemsInCategory}
              addToCart={addToCart}
              tilesPerRow={state.settings?.posItemTilesPerRow || 4}
              subcategories={menuSubcategories}
              onSelectSubcategory={onSelectSubcategory}
            />
          </div>
        </div>
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
          onPrintRecall={handlePrintActiveRecall}
          isSubmittingKOT={false}
        />
      </div>

      {/* Right: cart table + bill summary */}
      <div className="md:col-span-5 space-y-2 md:flex md:flex-col md:min-h-0 md:overflow-hidden">
        <CartTable
          items={items}
          menu={menu}
          categories={allCategories}
          decQty={decQty}
          incQty={incQty}
          updateItem={updateItem}
          removeItem={removeItem}
          lineTotal={lineTotal}
          incDealQty={incDealQty}
          decDealQty={decDealQty}
          removeDeal={removeDeal}
        />
        <BillSummary
          orderType={orderType}
          setOrderType={(ot)=>{
            setOrderType(ot)
            if (ot==='Delivery' && items.length>0) setShowDelivery(true)
            if (ot==='Foodpanda' && items.length>0) toast('Foodpanda prices applied to cart')
          }}
          holdSale={holdSaleToDb}
          setShowHeld={onOpenHeld}
          heldCount={heldCount || (helds?.length||0)}
          paymentMethod={paymentMethod}
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
          deliveryAmt={deliveryAmt}
          onDeliveryAmtChange={(amt)=>{ setDeliveryAmt(Math.max(0, Number(amt)||0)) }}
          totalPayment={totalPayment}
          cashReceived={cashReceived}
          onCashReceivedChange={setCashReceived}
          sellPageFields={state.settings?.sellPageFields || {}}
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
    <DealBuilderDialog
      open={showDealBuilder}
      category={dealCategory}
      menu={menu}
      categories={state.categories || []}
      onCancel={closeDealBuilder}
      onConfirm={addDealLinesToCart}
    />
    <PaymentMethodDialog
      open={showPayMethod}
      totalAmount={Number(recallToPay?.totalAmount || 0)}
      items={Array.isArray(recallToPay?.items) ? recallToPay.items : []}
      tableNo={recallToPay?.tableNo || ''}
      waiterName={
        recallToPay?.waiterName
        || (staff || []).find(s => String(s.id) === String(recallToPay?.waiterId || ''))?.name
        || ''
      }
      orderType={recallToPay?.orderType || orderType || ''}
      initialMethod={recallToPay?.paymentMethod || paymentMethod || 'cash'}
      initialBankChannel={recallToPay?.bankChannel || bankChannel || 'ubl'}
      initialLast4={String(recallToPay?.bankLast4 || bankLast4 || '')}
      initialCashReceived={cashReceived || Number(recallToPay?.totalAmount || 0)}
      initialStaffId={String(recallToPay?.staffId || payStaffId || '')}
      initialRiderId={String(recallToPay?.riderId || '')}
      staff={staffForPurchase}
      riders={ridersFromStaff}
      locked={payLocked}
      onCancel={()=>{ if (payLocked) return; setShowPayMethod(false); setRecallToPay(null); setPendingPayOpts(null) }}
      onConfirm={(pay)=> { if (recallToPay) continueAfterPaymentMethod(recallToPay, pay) }}
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
