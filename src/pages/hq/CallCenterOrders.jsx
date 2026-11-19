import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { Headphones, RefreshCw, Trash2, ShoppingCart, Link2 } from 'lucide-react'
import CategoryBar from '../sales/components/CategoryBar.jsx'
import ItemsList from '../sales/components/ItemsList.jsx'
import DealBuilderDialog from '../sales/components/DealBuilderDialog.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { useBranch } from '../../state/BranchContext.jsx'
import { useData } from '../../state/DataContext.jsx'
import { ccStatusLabel, ccStatusStyle } from '../../utils/callCenterStatus.js'
import {
  resolveMenuUnitPrice,
  isBundleCategory,
  canAddItemToCart,
  dealCompositionKey,
} from '../sales/utils.js'
import { useLiveRefresh, pokeLiveRefresh } from '../../hooks/useLiveRefresh.js'

function api() {
  return (typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000'
}

const ORDER_TYPES = ['Dine-in', 'Take-away', 'Delivery', 'Foodpanda']

export default function CallCenterOrders() {
  const { token } = useAuth()
  const { branches, activeBranchId } = useBranch()
  const { state } = useData()
  const menu = state?.menu || []

  const [orders, setOrders] = useState([])
  // Prefill with header branch, but queue always lists every branch
  const [branchId, setBranchId] = useState(() => String(activeBranchId || ''))
  const [orderType, setOrderType] = useState('Delivery')
  const [customer, setCustomer] = useState({ id: '', name: '', phone: '', address: '' })
  const [remarks, setRemarks] = useState('')
  const [cart, setCart] = useState([])
  const [categoryPath, setCategoryPath] = useState([])
  const [dealCategory, setDealCategory] = useState(null)
  const [showDealBuilder, setShowDealBuilder] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [statusFilter, setStatusFilter] = useState('open')
  const [customerFound, setCustomerFound] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const [lookupMsg, setLookupMsg] = useState('')
  const [searchingCustomer, setSearchingCustomer] = useState(false)
  // Mobile: Take order (Sell-like) | Queue
  const [mobileTab, setMobileTab] = useState('order')
  const [parentOrderId, setParentOrderId] = useState('')
  const phoneFocusedRef = useRef(false)
  const cartSectionRef = useRef(null)

  // Same POS category tree as Sell page
  const allPosCategories = useMemo(() => (state.categories || [])
    .filter(c => c && c.active !== false && c.showOnPos !== false)
    .sort((a, b) => {
      const orderA = Number(a.sortOrder ?? 0)
      const orderB = Number(b.sortOrder ?? 0)
      if (orderA !== orderB) return orderA - orderB
      return String(a.name || '').localeCompare(String(b.name || ''))
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
  const categories = useMemo(() => withMeta(kidsOf('')), [kidsOf, withMeta])
  const currentParentId = categoryPath.length
    ? String(categoryPath[categoryPath.length - 1].id || categoryPath[categoryPath.length - 1]._id || '')
    : ''
  const menuSubcategories = useMemo(
    () => (currentParentId ? withMeta(kidsOf(currentParentId)) : []),
    [currentParentId, kidsOf, withMeta]
  )
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
    const mapped = incoming.map((line) => {
      const m = menu.find(x => String(x.id || x._id) === String(line.itemId))
      return {
        itemId: String(line.itemId),
        name: line.custom?.name || m?.name || String(line.itemId),
        price: 0,
        qty: Math.max(1, Number(line.qty || 1)),
        category: line.custom?.category || m?.category || '',
        mods: line.mods || {},
        custom: line.custom || null,
      }
    })
    setCart((prev) => {
      if (!fingerprint) return [...prev, ...mapped]
      const byDeal = new Map()
      for (const it of prev) {
        const id = it?.mods?.dealGroupId ? String(it.mods.dealGroupId) : ''
        if (!id) continue
        if (!byDeal.has(id)) byDeal.set(id, [])
        byDeal.get(id).push(it)
      }
      for (const [dealId, group] of byDeal.entries()) {
        if (dealCompositionKey(group) !== fingerprint) continue
        const curQty = Math.max(1, Number(group[0]?.mods?.dealQty || 1))
        const nextQty = curQty + 1
        return prev.map((it) => {
          if (String(it?.mods?.dealGroupId || '') !== dealId) return it
          const unitQty = Math.max(1, Math.round(Number(it.qty || 1) / curQty))
          return {
            ...it,
            qty: unitQty * nextQty,
            mods: { ...(it.mods || {}), dealQty: nextQty },
          }
        })
      }
      return [...prev, ...mapped]
    })
    closeDealBuilder()
    toast.success('Deal added')
  }

  const itemsInCategory = useMemo(() => {
    const cat = String(selectedCategory || '').trim().toLowerCase()
    const q = search.trim().toLowerCase()
    let list = menu
    if (cat) list = list.filter(m => String(m.category || '').trim().toLowerCase() === cat)
    if (q) list = list.filter(m => String(m.name || '').toLowerCase().includes(q))
    return [...list]
      .sort((a, b) => {
        const orderA = Number(a.sortOrder ?? 0)
        const orderB = Number(b.sortOrder ?? 0)
        if (orderA !== orderB) return orderA - orderB
        return String(a.name || '').localeCompare(String(b.name || ''))
      })
      .map(m => ({ ...m, id: m.id || m._id }))
  }, [menu, selectedCategory, search])

  const catTiles = Number(state.settings?.posCategoryTilesPerRow) || 4
  const itemTiles = Number(state.settings?.posItemTilesPerRow) || 4

  const load = async ({ quiet = false } = {}) => {
    try {
      const qs = statusFilter === 'open' ? 'pendingOnly=1' : ''
      const res = await fetch(`${api()}/api/call-center-orders${qs ? `?${qs}` : ''}`, {
        // No X-Branch-Id — queue shows all accessible branches by default
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      if (!res.ok) throw new Error('load failed')
      setOrders(await res.json())
    } catch {
      if (!quiet) toast.error('Could not load call-center orders')
    }
  }

  useEffect(() => { load() }, [token, statusFilter])
  useLiveRefresh(() => load({ quiet: true }), { intervalMs: 15000 })
  useEffect(() => {
    if (branchId) return
    const preferred = activeBranchId && branches.some(b => String(b._id) === String(activeBranchId))
      ? String(activeBranchId)
      : (branches[0]?._id ? String(branches[0]._id) : '')
    if (preferred) setBranchId(preferred)
  }, [branches, branchId, activeBranchId])
  const addToCart = (id) => {
    const m = menu.find(x => String(x.id || x._id) === String(id))
    if (!m) return
    const itemId = String(m.id || m._id)
    const check = canAddItemToCart(cart, menu, state.categories || [], itemId, 1)
    if (!check.ok) {
      toast.error(check.message || 'Category max items reached')
      return
    }
    const unit = resolveMenuUnitPrice(m, orderType)
    setCart(prev => {
      const existing = prev.find(x => x.itemId === itemId && !x?.mods?.underDeal)
      if (existing) return prev.map(x => (x === existing ? { ...x, qty: x.qty + 1 } : x))
      return [...prev, {
        itemId,
        name: m.name,
        price: unit,
        qty: 1,
        category: m.category || '',
      }]
    })
  }

  // Reprice cart when switching to/from Foodpanda (skip deal package lines)
  useEffect(() => {
    setCart(prev => {
      if (!prev.length) return prev
      let changed = false
      const next = prev.map(it => {
        if (it?.mods?.underDeal) return it
        const m = menu.find(x => String(x.id || x._id) === String(it.itemId))
        if (!m) return it
        const price = resolveMenuUnitPrice(m, orderType)
        if (Number(it.price) !== price) { changed = true; return { ...it, price } }
        return it
      })
      return changed ? next : prev
    })
  }, [orderType, menu])

  const total = cart.reduce((s, it, idx) => {
    if (it?.mods?.underDeal && it?.mods?.dealGroupId) {
      const first = cart.findIndex(x => String(x?.mods?.dealGroupId || '') === String(it.mods.dealGroupId))
      if (first !== idx) return s
      const dealQty = Math.max(1, Number(it.mods.dealQty || 1))
      const pkg = Number(it.custom?.categoryPrice || 0)
      return s + pkg * dealQty
    }
    return s + Number(it.qty || 0) * Number(it.price || 0)
  }, 0)
  const cartQty = cart.reduce((s, it) => {
    if (it?.mods?.underDeal && it?.mods?.dealGroupId) {
      // Count deal once using dealQty on first component
      const first = cart.findIndex(x => String(x?.mods?.dealGroupId || '') === String(it.mods.dealGroupId))
      if (cart.indexOf(it) !== first) return s
      return s + Math.max(1, Number(it.mods.dealQty || 1))
    }
    return s + Number(it.qty || 0)
  }, 0)
  const authHeaders = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token])

  // Open orders for this phone (same customer calling again)
  const relatedOpenOrders = useMemo(() => {
    const digits = String(customer.phone || '').replace(/\D/g, '')
    if (digits.length < 7) return []
    const open = new Set(['pending', 'accepted', 'kot_created', 'preparing', 'ready'])
    return (orders || []).filter(o => {
      if (!open.has(String(o.status || ''))) return false
      const p = String(o.customer?.phone || '').replace(/\D/g, '')
      if (!p) return false
      if (!(p.includes(digits) || digits.includes(p))) return false
      if (branchId && String(o.branchId) !== String(branchId)) return false
      return true
    })
  }, [orders, customer.phone, branchId])

  const linkAsAddOn = (o) => {
    const id = String(o._id || o.id || '')
    setParentOrderId(id)
    if (o.branchId) setBranchId(String(o.branchId))
    if (o.orderType) setOrderType(o.orderType)
    setCustomer({
      id: String(o.customer?.id || ''),
      name: String(o.customer?.name || ''),
      phone: String(o.customer?.phone || '').replace(/\D/g, '').slice(0, 11),
      address: String(o.customer?.address || ''),
    })
    setCustomerFound(Boolean(o.customer?.id || o.customer?.name))
    setShowSuggestions(false)
    setMobileTab('order')
    toast.success('Linked as ADD-ON for same customer')
    setTimeout(() => cartSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
  }

  const clearAddOn = () => setParentOrderId('')

  // Phone lookup — same behavior as Sell delivery customer dialog (shared customers DB)
  useEffect(() => {
    const phone = String(customer.phone || '').trim()
    const digits = phone.replace(/\D/g, '')
    if (!digits) {
      setLookupMsg(''); setSuggestions([]); setShowSuggestions(false); setCustomerFound(false)
      return
    }
    if (digits.length < 3) {
      setLookupMsg(''); setSuggestions([]); setShowSuggestions(false)
      return
    }
    if (customerFound) return
    const t = setTimeout(async () => {
      setSearchingCustomer(true)
      try {
        const res = await fetch(`${api()}/api/customers?phone=${encodeURIComponent(digits)}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        if (res.ok) {
          const rows = await res.json()
          const list = Array.isArray(rows) ? rows : []
          setSuggestions(list)
          setShowSuggestions(phoneFocusedRef.current)
          setCustomerFound(false)
          setLookupMsg(list.length ? '' : 'No customer found — will create on submit')
        } else {
          setLookupMsg('Search failed')
          setSuggestions([])
          setShowSuggestions(false)
        }
      } catch {
        setLookupMsg('Network error while searching')
        setSuggestions([])
        setShowSuggestions(false)
      } finally {
        setSearchingCustomer(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [customer.phone, customerFound, token])

  const selectCustomer = (c) => {
    setCustomer({
      id: String(c?.id || c?._id || ''),
      name: String(c?.name || ''),
      phone: String(c?.phone || '').replace(/\D/g, '').slice(0, 11),
      address: String(c?.address || ''),
    })
    setCustomerFound(true)
    setLookupMsg('')
    setShowSuggestions(false)
    setActiveSuggestion(-1)
  }

  const handlePhoneKeyDown = (e) => {
    if (!showSuggestions || !suggestions.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveSuggestion(prev => Math.min(prev + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveSuggestion(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeSuggestion >= 0 && activeSuggestion < suggestions.length) {
        selectCustomer(suggestions[activeSuggestion])
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
      setActiveSuggestion(-1)
    }
  }

  const ensureCustomerInDb = async () => {
    const name = String(customer.name || '').trim()
    const phone = String(customer.phone || '').trim()
    const address = String(customer.address || '').trim()
    if (!phone && !name) return null

    if (customerFound && customer.id) {
      try {
        await fetch(`${api()}/api/customers/${customer.id}`, {
          method: 'PATCH',
          headers: authHeaders,
          body: JSON.stringify({ name: name || undefined, phone: phone || undefined, address: address || undefined }),
        })
      } catch {}
      return { id: customer.id, name, phone, address }
    }

    // Auto-create when not selected from dropdown (shared across all branches)
    const res = await fetch(`${api()}/api/customers`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name, phone, address, isRegular: false }),
    })
    if (!res.ok) {
      const msg = await res.text().catch(() => '')
      throw new Error(msg || 'Could not save customer')
    }
    const created = await res.json()
    return {
      id: String(created.id || created._id || ''),
      name: created.name || name,
      phone: created.phone || phone,
      address: created.address || address,
    }
  }

  const submit = async () => {
    if (!branchId) { toast.error('Select a branch'); return false }
    if (!orderType) { toast.error('Select order type'); return false }
    if (!cart.length) { toast.error('Add items'); return false }
    if (!customer.name && !customer.phone) { toast.error('Customer name or phone required'); return false }
    if (orderType === 'Delivery' && !customer.address) { toast.error('Delivery address required'); return false }
    setBusy(true)
    setShowSuggestions(false)
    try {
      const savedCustomer = await ensureCustomerInDb()
      const payloadCustomer = savedCustomer || {
        id: customer.id || '',
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
      }
      const res = await fetch(`${api()}/api/call-center-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          branchId,
          orderType,
          customer: payloadCustomer,
          remarks,
          items: cart,
          isAddOn: Boolean(parentOrderId),
          parentOrderId: parentOrderId || undefined,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Submit failed')
      toast.success(parentOrderId ? 'Add-on order sent to branch' : 'Submitted to branch queue')
      setCart([])
      setCustomer({ id: '', name: '', phone: '', address: '' })
      setCustomerFound(false)
      setSuggestions([])
      setLookupMsg('')
      setRemarks('')
      setParentOrderId('')
      await load()
      pokeLiveRefresh({ source: 'call-center-submit', branchId })
      return true
    } catch (err) {
      toast.error(err.message || 'Failed')
      return false
    } finally {
      setBusy(false)
    }
  }

  const cancel = async (id) => {
    try {
      const res = await fetch(`${api()}/api/call-center-orders/${id}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Cancel failed')
      toast.success('Cancelled')
      load()
    } catch {
      toast.error('Cancel failed')
    }
  }

  const branchName = (o) => {
    const snap = String(o?.branchName || '').trim()
    if (snap) return snap
    const id = o?.branchId ?? o
    return branches.find(b => String(b._id) === String(id))?.name || String(id || '—')
  }

  const scrollToCart = () => {
    setMobileTab('order')
    setTimeout(() => cartSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40)
  }

  const renderCustomerForm = () => (
    <>
      <div className="grid grid-cols-2 gap-1.5">
        {ORDER_TYPES.map(ot => (
          <button
            key={ot}
            type="button"
            onClick={() => setOrderType(ot)}
            className={`rounded-lg px-2 py-2.5 text-xs font-bold ${orderType === ot ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
          >
            {ot}
          </button>
        ))}
      </div>

      <label className="block text-xs font-semibold text-slate-500">
        Branch
        <select className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-800" value={branchId} onChange={e => { setBranchId(e.target.value); clearAddOn() }}>
          <option value="">Select branch…</option>
          {branches.map(b => <option key={b._id} value={b._id}>{b.name} ({b.code})</option>)}
        </select>
      </label>

      <label className="block text-xs font-semibold text-slate-500">
        Phone
        <div className="relative mt-1">
          <input
            className="w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            placeholder="Enter phone…"
            value={customer.phone}
            maxLength={11}
            onChange={e => {
              const digits = (e.target.value || '').replace(/\D/g, '').slice(0, 11)
              setCustomer(c => ({ ...c, id: '', phone: digits }))
              setCustomerFound(false)
              setLookupMsg('')
              setActiveSuggestion(-1)
              clearAddOn()
              if (digits.length >= 3) setShowSuggestions(true)
            }}
            onKeyDown={handlePhoneKeyDown}
            onFocus={() => {
              phoneFocusedRef.current = true
              const d = String(customer.phone || '').replace(/\D/g, '')
              if (d.length >= 3 && suggestions.length) setShowSuggestions(true)
            }}
            onBlur={() => {
              phoneFocusedRef.current = false
              setTimeout(() => setShowSuggestions(false), 150)
            }}
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-xl border bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800">
              {suggestions.map((c, i) => (
                <button
                  key={c.id || c._id || i}
                  type="button"
                  className={`w-full px-3 py-2 text-left text-sm ${activeSuggestion === i ? 'bg-blue-100 dark:bg-blue-900/40' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                  onMouseDown={e => { e.preventDefault(); selectCustomer(c) }}
                >
                  <div className="font-semibold">{c?.name || '—'}</div>
                  <div className="text-[11px] text-slate-500">{c?.phone || ''}</div>
                  {c?.address ? <div className="text-[11px] text-slate-500 truncate">{c.address}</div> : null}
                </button>
              ))}
            </div>
          )}
        </div>
      </label>
      {(lookupMsg || searchingCustomer) && (
        <div className={`-mt-1 text-[11px] ${customerFound ? 'text-emerald-600' : 'text-slate-500'}`}>
          {searchingCustomer ? 'Searching…' : lookupMsg}
        </div>
      )}

      {relatedOpenOrders.length > 0 && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-2.5 dark:border-amber-700 dark:bg-amber-950/40">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-amber-900 dark:text-amber-100">
            <Link2 size={14} /> Same customer — open order{relatedOpenOrders.length > 1 ? 's' : ''}
          </div>
          <div className="space-y-1.5">
            {relatedOpenOrders.slice(0, 4).map(o => {
              const id = String(o._id || '')
              const active = parentOrderId === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => (active ? clearAddOn() : linkAsAddOn(o))}
                  className={`w-full rounded-lg border px-2.5 py-2 text-left text-xs ${
                    active
                      ? 'border-amber-600 bg-amber-200 font-bold text-amber-950 dark:border-amber-400 dark:bg-amber-800 dark:text-amber-50'
                      : 'border-amber-200 bg-white text-amber-950 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-100'
                  }`}
                >
                  <div className="font-bold">{branchName(o)} · {o.orderType} · {ccStatusLabel(o.status)}</div>
                  <div className="truncate opacity-80">{(o.items || []).map(i => `${i.name}×${i.qty}`).join(', ')}</div>
                  <div className="mt-0.5 font-extrabold">{active ? '✓ Linked as ADD-ON (tap to unlink)' : 'Tap to send as ADD-ON'}</div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {parentOrderId ? (
        <div className="rounded-lg bg-violet-100 px-2.5 py-2 text-sm font-bold text-violet-950 dark:bg-violet-900/50 dark:text-violet-100">
          ADD-ON order — branch will see same-customer tag
          <button type="button" className="ml-2 underline" onClick={clearAddOn}>Clear</button>
        </div>
      ) : null}

      <label className="block text-xs font-semibold text-slate-500">
        Customer name
        <input
          className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          placeholder="Name"
          value={customer.name}
          onChange={e => { setCustomer(c => ({ ...c, name: e.target.value })); setShowSuggestions(false) }}
        />
      </label>

      <label className="block text-xs font-semibold text-slate-500">
        Address{orderType === 'Delivery' ? ' *' : ''}
        <textarea
          rows={2}
          className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          placeholder={orderType === 'Delivery' ? 'Delivery address' : 'Address (optional)'}
          value={customer.address}
          onChange={e => { setCustomer(c => ({ ...c, address: e.target.value })); setShowSuggestions(false) }}
        />
      </label>

      <label className="block text-xs font-semibold text-slate-500">
        Remarks
        <input
          className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-800"
          placeholder="Optional remarks"
          value={remarks}
          onChange={e => setRemarks(e.target.value)}
        />
      </label>
    </>
  )

  const bumpCartQty = (i, delta) => {
    const line = cart[i]
    if (!line) return
    if (line?.mods?.underDeal && line?.mods?.dealGroupId) {
      const dealId = String(line.mods.dealGroupId)
      const group = cart.filter(x => String(x?.mods?.dealGroupId || '') === dealId)
      const cur = Math.max(1, Number(group[0]?.mods?.dealQty || 1))
      const nextQty = cur + delta
      if (nextQty < 1) {
        setCart(c => c.filter(x => String(x?.mods?.dealGroupId || '') !== dealId))
        return
      }
      setCart(prev => prev.map(it => {
        if (String(it?.mods?.dealGroupId || '') !== dealId) return it
        const unitQty = Math.max(1, Math.round(Number(it.qty || 1) / cur))
        return { ...it, qty: unitQty * nextQty, mods: { ...(it.mods || {}), dealQty: nextQty } }
      }))
      return
    }
    if (delta < 0 && Number(line.qty || 1) <= 1) {
      setCart(c => c.filter((_, idx) => idx !== i))
      return
    }
    if (delta > 0) {
      const check = canAddItemToCart(cart, menu, state.categories || [], line.itemId, 1)
      if (!check.ok) {
        toast.error(check.message || 'Category max items reached')
        return
      }
    }
    setCart(c => c.map((x, idx) => (idx === i ? { ...x, qty: Math.max(1, Number(x.qty || 1) + delta) } : x)))
  }

  const renderCartLines = () => {
    const shownDeal = new Set()
    const rows = []
    cart.forEach((it, i) => {
      if (it?.mods?.underDeal && it?.mods?.dealGroupId) {
        const dealId = String(it.mods.dealGroupId)
        if (shownDeal.has(dealId)) return
        shownDeal.add(dealId)
        const group = cart.filter(x => String(x?.mods?.dealGroupId || '') === dealId)
        const dealQty = Math.max(1, Number(group[0]?.mods?.dealQty || 1))
        const pkg = Number(group[0]?.custom?.categoryPrice || 0)
        const label = group[0]?.custom?.category || group[0]?.mods?.dealCategoryName || 'Deal'
        const parts = group.map(g => g.name).filter(Boolean).join(', ')
        rows.push(
          <div key={dealId} className="flex items-center justify-between gap-2 rounded-lg bg-violet-50 px-2 py-2 text-sm dark:bg-violet-950/40">
            <div className="min-w-0">
              <div className="font-semibold truncate">{label}</div>
              <div className="text-[11px] text-slate-500 truncate" title={parts}>{parts}</div>
              <div className="text-[11px] text-slate-500">{pkg.toLocaleString()} × {dealQty}</div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button type="button" className="h-9 w-9 rounded bg-slate-200 text-lg font-bold dark:bg-slate-700" onClick={() => bumpCartQty(i, -1)}>−</button>
              <span className="w-7 text-center text-sm font-bold">{dealQty}</span>
              <button type="button" className="h-9 w-9 rounded bg-slate-200 text-lg font-bold dark:bg-slate-700" onClick={() => bumpCartQty(i, 1)}>+</button>
              <button type="button" className="ml-1 p-2 text-rose-500" onClick={() => setCart(c => c.filter(x => String(x?.mods?.dealGroupId || '') !== dealId))}><Trash2 size={16} /></button>
            </div>
          </div>
        )
        return
      }
      rows.push(
        <div key={`${it.itemId}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-2 text-sm dark:bg-slate-800/70">
          <div className="min-w-0">
            <div className="font-semibold truncate">{it.name}</div>
            <div className="text-[11px] text-slate-500">{Number(it.price || 0).toLocaleString()} × {it.qty}</div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button type="button" className="h-9 w-9 rounded bg-slate-200 text-lg font-bold dark:bg-slate-700" onClick={() => bumpCartQty(i, -1)}>−</button>
            <span className="w-7 text-center text-sm font-bold">{it.qty}</span>
            <button type="button" className="h-9 w-9 rounded bg-slate-200 text-lg font-bold dark:bg-slate-700" onClick={() => bumpCartQty(i, 1)}>+</button>
            <button type="button" className="ml-1 p-2 text-rose-500" onClick={() => setCart(c => c.filter((_, idx) => idx !== i))}><Trash2 size={16} /></button>
          </div>
        </div>
      )
    })
    return (
      <div className="min-h-0 flex-1 space-y-1 overflow-auto">
        {rows}
        {!cart.length && <div className="py-8 text-center text-sm text-slate-400">Tap menu items to add</div>}
      </div>
    )
  }

  const queuePanel = (
    <div className={`min-h-[50dvh] flex-col rounded-2xl border bg-slate-50 dark:border-slate-700 dark:bg-slate-950/50 lg:min-h-0 lg:flex ${mobileTab === 'queue' ? 'flex' : 'hidden lg:flex'}`}>
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
        <div className="text-base font-extrabold text-gray-900 dark:text-white">Queue & status</div>
        <div className="text-sm font-bold text-slate-700 dark:text-slate-200">{orders.length} order{orders.length === 1 ? '' : 's'}</div>
      </div>
      <div className="min-h-0 flex-1 space-y-2.5 overflow-auto p-2.5">
        {orders.map(o => {
          const items = Array.isArray(o.items) ? o.items : []
          const created = o.createdAt ? new Date(o.createdAt) : null
          const timeLabel = created && !Number.isNaN(created.getTime())
            ? created.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
            : ''
          return (
            <article
              key={o._id}
              className={`rounded-xl border-2 bg-white p-3.5 shadow-sm dark:bg-slate-900 ${
                o.isAddOn ? 'border-violet-400 dark:border-violet-500' : 'border-slate-300 dark:border-slate-600'
              }`}
            >
              <div className="mb-2.5 flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-extrabold ${ccStatusStyle(o.status)}`}>
                    {ccStatusLabel(o.status)}
                  </span>
                  {o.isAddOn ? (
                    <span className="inline-flex rounded-md border border-violet-400 bg-violet-100 px-2.5 py-1 text-xs font-extrabold text-violet-900 dark:border-violet-500 dark:bg-violet-900/50 dark:text-violet-100">
                      ADD-ON · same customer
                    </span>
                  ) : null}
                </div>
                <div className="text-right">
                  <div className="text-base font-black tabular-nums text-gray-900 dark:text-white">{Number(o.total || 0).toLocaleString()}</div>
                  {timeLabel ? <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">{timeLabel}</div> : null}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 rounded-lg bg-slate-100 p-2.5 dark:bg-slate-800">
                <div className="min-w-0">
                  <div className="text-xs font-extrabold uppercase tracking-wide text-slate-600 dark:text-slate-300">Branch</div>
                  <div className="truncate text-base font-extrabold text-indigo-800 dark:text-indigo-200">{branchName(o)}</div>
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-extrabold uppercase tracking-wide text-slate-600 dark:text-slate-300">Type</div>
                  <div className="truncate text-base font-extrabold text-gray-900 dark:text-white">{o.orderType || '—'}</div>
                </div>
                <div className="col-span-2 min-w-0 border-t-2 border-slate-300 pt-2 dark:border-slate-600">
                  <div className="text-xs font-extrabold uppercase tracking-wide text-slate-600 dark:text-slate-300">Customer</div>
                  <div className="truncate text-base font-extrabold text-gray-900 dark:text-white">{o.customer?.name || '—'}</div>
                  <div className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{o.customer?.phone || '—'}</div>
                  {o.customer?.address ? (
                    <div className="mt-0.5 truncate text-sm font-semibold text-slate-700 dark:text-slate-200" title={o.customer.address}>
                      {o.customer.address}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-2.5">
                <div className="mb-1 text-xs font-extrabold uppercase tracking-wide text-slate-600 dark:text-slate-300">Items</div>
                <ul className="space-y-1">
                  {items.length ? items.map((it, idx) => (
                    <li key={`${o._id}-${it.itemId || it.name}-${idx}`} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate font-bold text-gray-900 dark:text-white">{it.name || 'Item'}</span>
                      <span className="shrink-0 font-extrabold text-gray-800 dark:text-slate-100">×{Number(it.qty) || 1}</span>
                    </li>
                  )) : (
                    <li className="text-sm font-semibold text-slate-600">No items</li>
                  )}
                </ul>
              </div>

              {o.remarks ? (
                <div className="mt-2.5 rounded-md bg-amber-100 px-2.5 py-1.5 text-sm font-semibold text-amber-950 dark:bg-amber-900/40 dark:text-amber-100">
                  {o.remarks}
                </div>
              ) : null}

              <div className="mt-2.5 flex flex-col gap-1.5">
                {['pending', 'accepted', 'kot_created', 'preparing', 'ready'].includes(String(o.status || '')) ? (
                  <button
                    type="button"
                    onClick={() => linkAsAddOn(o)}
                    className="w-full rounded-lg border-2 border-violet-300 bg-violet-50 py-2 text-sm font-bold text-violet-900 hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-100 dark:hover:bg-violet-900/50"
                  >
                    Customer called again → ADD-ON
                  </button>
                ) : null}
                {o.status === 'pending' && (
                  <button
                    type="button"
                    onClick={() => cancel(o._id)}
                    className="w-full rounded-lg border-2 border-rose-300 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40"
                  >
                    Cancel order
                  </button>
                )}
              </div>
            </article>
          )
        })}
        {!orders.length && <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-10 text-center text-base font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900">No orders in queue</div>}
      </div>
    </div>
  )

  return (
    <div className={`flex min-h-[calc(100dvh-4.5rem)] flex-col gap-3 lg:h-[calc(100dvh-4.5rem)] ${cartQty && mobileTab === 'order' ? 'pb-20 lg:pb-0' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
            <Headphones size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-base font-black">Call Center</div>
            <div className="hidden text-[11px] text-slate-500 sm:block">All branches · order for any branch (incl. current) · add-on for same customer</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="rounded-lg border px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="open">Active (Pending → Ready)</option>
            <option value="all">All statuses</option>
          </select>
          <button type="button" onClick={load} className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold dark:bg-slate-800">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Mobile: Take order | Queue (Sell-like — no separate cart tab) */}
      <div className="grid grid-cols-2 gap-1 rounded-xl border bg-white p-1 dark:border-slate-700 dark:bg-slate-900 lg:hidden">
        {[
          { id: 'order', label: 'Take order' },
          { id: 'queue', label: `Queue${orders.length ? ` (${orders.length})` : ''}` },
        ].map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setMobileTab(t.id)}
            className={`rounded-lg px-2 py-2.5 text-sm font-extrabold ${
              mobileTab === t.id ? 'bg-blue-600 text-white shadow' : 'text-slate-700 dark:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1.15fr_0.85fr_0.9fr]">
        {/* Desktop left: menu only */}
        <div className={`min-h-0 flex-col gap-2 rounded-2xl border bg-white p-2 dark:border-slate-700 dark:bg-slate-900 ${mobileTab === 'order' ? 'flex' : 'hidden lg:flex'}`}>
          <CategoryBar
            categories={categories}
            selectedCategory={categoryBarSelected}
            onSelectCategory={onSelectCategory}
            tilesPerRow={catTiles}
          />
          <input
            className="rounded-xl border px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            placeholder="Search menu…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <ItemsList
            selectedCategory={selectedCategory}
            itemsInCategory={itemsInCategory}
            addToCart={addToCart}
            tilesPerRow={itemTiles}
            subcategories={menuSubcategories}
            onSelectSubcategory={onSelectSubcategory}
          />

          {/* Mobile Sell-like: cart + customer under menu in same scroll */}
          <div ref={cartSectionRef} className="mt-2 space-y-2 border-t border-slate-200 pt-3 lg:hidden dark:border-slate-700">
            <div className="text-sm font-extrabold">Cart & customer</div>
            {renderCartLines()}
            {renderCustomerForm()}
            <div className="flex items-center justify-between text-sm font-black">
              <span>Total</span>
              <span>{total.toLocaleString()}</span>
            </div>
            <button
              disabled={busy}
              type="button"
              onClick={async () => {
                const ok = await submit()
                if (ok) setMobileTab('queue')
              }}
              className="w-full rounded-xl bg-emerald-600 py-3.5 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-60 touch-manipulation"
            >
              {busy ? 'Submitting…' : (parentOrderId ? 'Submit ADD-ON to branch' : 'Submit to branch queue')}
            </button>
          </div>
        </div>

        {/* Desktop middle: cart + customer */}
        <div className="hidden min-h-0 flex-col gap-2 rounded-2xl border bg-white p-3 dark:border-slate-700 dark:bg-slate-900 lg:flex">
          <div className="text-sm font-bold">Cart</div>
          {renderCartLines()}
          {renderCustomerForm()}
          <div className="flex items-center justify-between text-sm font-black">
            <span>Total</span>
            <span>{total.toLocaleString()}</span>
          </div>
          <button
            disabled={busy}
            type="button"
            onClick={() => submit()}
            className="rounded-xl bg-emerald-600 py-3.5 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            {busy ? 'Submitting…' : (parentOrderId ? 'Submit ADD-ON to branch' : 'Submit to branch queue')}
          </button>
        </div>

        {queuePanel}
      </div>

      {/* Sticky cart bar (mobile) — like Sell quick access */}
      {cartQty > 0 && mobileTab === 'order' ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] shadow-lg backdrop-blur lg:hidden dark:border-slate-700 dark:bg-slate-900/95">
          <button
            type="button"
            onClick={scrollToCart}
            className="flex w-full items-center justify-between gap-3 rounded-xl bg-blue-600 px-4 py-3 text-white shadow"
          >
            <span className="inline-flex items-center gap-2 font-extrabold">
              <ShoppingCart size={18} />
              {cartQty} item{cartQty === 1 ? '' : 's'}
              {parentOrderId ? ' · ADD-ON' : ''}
            </span>
            <span className="font-black tabular-nums">{total.toLocaleString()} · Cart</span>
          </button>
        </div>
      ) : null}

      <DealBuilderDialog
        open={showDealBuilder}
        category={dealCategory}
        menu={menu}
        categories={state.categories || []}
        onCancel={closeDealBuilder}
        onConfirm={addDealLinesToCart}
      />
    </div>
  )
}
