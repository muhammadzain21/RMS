import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { Headphones, RefreshCw, Trash2 } from 'lucide-react'
import CategoryBar from '../sales/components/CategoryBar.jsx'
import ItemsList from '../sales/components/ItemsList.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { useBranch } from '../../state/BranchContext.jsx'
import { useData } from '../../state/DataContext.jsx'
import { ccStatusLabel, ccStatusStyle } from '../../utils/callCenterStatus.js'

function api() {
  return (typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000'
}

const ORDER_TYPES = ['Dine-in', 'Take-away', 'Delivery', 'Foodpanda']

export default function CallCenterOrders() {
  const { token } = useAuth()
  const { branches } = useBranch()
  const { state } = useData()
  const menu = state?.menu || []
  const categories = useMemo(() => {
    const fromSettings = Array.isArray(state?.categories) ? state.categories : []
    if (fromSettings.length) return fromSettings
    const names = [...new Set(menu.map(m => m.category).filter(Boolean))]
    return names.map(name => ({ name }))
  }, [state?.categories, menu])

  const [orders, setOrders] = useState([])
  const [branchId, setBranchId] = useState('')
  const [orderType, setOrderType] = useState('Delivery')
  const [customer, setCustomer] = useState({ id: '', name: '', phone: '', address: '' })
  const [remarks, setRemarks] = useState('')
  const [cart, setCart] = useState([])
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
  const phoneFocusedRef = useRef(false)

  const itemsInCategory = useMemo(() => {
    const q = search.trim().toLowerCase()
    return menu.filter(m => {
      if (selectedCategory && String(m.category || '') !== String(selectedCategory)) return false
      if (q && !String(m.name || '').toLowerCase().includes(q)) return false
      return true
    }).map(m => ({ ...m, id: m.id || m._id }))
  }, [menu, selectedCategory, search])

  const load = async () => {
    try {
      const qs = statusFilter === 'open' ? 'pendingOnly=1' : ''
      const res = await fetch(`${api()}/api/call-center-orders${qs ? `?${qs}` : ''}`, {
        // No X-Branch-Id — queue shows all accessible branches by default
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('load failed')
      setOrders(await res.json())
    } catch {
      toast.error('Could not load call-center orders')
    }
  }

  useEffect(() => { load() }, [token, statusFilter])
  useEffect(() => {
    const t = setInterval(load, 8000)
    return () => clearInterval(t)
  }, [token, statusFilter])
  useEffect(() => {
    if (!branchId && branches[0]?._id) setBranchId(String(branches[0]._id))
  }, [branches, branchId])
  useEffect(() => {
    if (!selectedCategory && categories[0]) {
      const n = typeof categories[0] === 'object' ? categories[0].name : categories[0]
      if (n) setSelectedCategory(n)
    }
  }, [categories, selectedCategory])

  const addToCart = (id) => {
    const m = menu.find(x => String(x.id || x._id) === String(id))
    if (!m) return
    const itemId = String(m.id || m._id)
    setCart(prev => {
      const existing = prev.find(x => x.itemId === itemId)
      if (existing) return prev.map(x => x.itemId === itemId ? { ...x, qty: x.qty + 1 } : x)
      return [...prev, {
        itemId,
        name: m.name,
        price: Number(m.price) || 0,
        qty: 1,
        category: m.category || '',
      }]
    })
  }

  const total = cart.reduce((s, it) => s + it.qty * it.price, 0)
  const authHeaders = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token])

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
    if (!branchId) return toast.error('Select a branch')
    if (!orderType) return toast.error('Select order type')
    if (!cart.length) return toast.error('Add items')
    if (!customer.name && !customer.phone) return toast.error('Customer name or phone required')
    if (orderType === 'Delivery' && !customer.address) return toast.error('Delivery address required')
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
        body: JSON.stringify({ branchId, orderType, customer: payloadCustomer, remarks, items: cart }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Submit failed')
      toast.success('Submitted to branch queue')
      setCart([])
      setCustomer({ id: '', name: '', phone: '', address: '' })
      setCustomerFound(false)
      setSuggestions([])
      setLookupMsg('')
      setRemarks('')
      await load()
    } catch (err) {
      toast.error(err.message || 'Failed')
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

  return (
    <div className="flex h-[calc(100dvh-4.5rem)] flex-col gap-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white">
            <Headphones size={18} />
          </div>
          <div>
            <div className="text-base font-black">Call Center</div>
            <div className="text-[11px] text-slate-500">Pick items → branch queue · live status through Completed</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select className="rounded-lg border px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-800" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="open">Active (Pending → Ready)</option>
            <option value="all">All statuses</option>
          </select>
          <button type="button" onClick={load} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold dark:bg-slate-800">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1.15fr_0.85fr_0.9fr]">
        {/* Left: categories + items (Sell-like) */}
        <div className="flex min-h-0 flex-col gap-2 rounded-2xl border bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
          <CategoryBar
            categories={categories}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            tilesPerRow={4}
          />
          <input
            className="rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
            placeholder="Search menu…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <ItemsList
            selectedCategory={selectedCategory}
            itemsInCategory={itemsInCategory}
            addToCart={addToCart}
            tilesPerRow={4}
          />
        </div>

        {/* Middle: cart + order meta */}
        <div className="flex min-h-0 flex-col gap-2 rounded-2xl border bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="text-sm font-bold">Cart</div>
          <div className="min-h-0 flex-1 space-y-1 overflow-auto">
            {cart.map((it, i) => (
              <div key={it.itemId} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-sm dark:bg-slate-800/70">
                <div>
                  <div className="font-semibold">{it.name}</div>
                  <div className="text-[11px] text-slate-500">{it.price.toLocaleString()} × {it.qty}</div>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" className="h-7 w-7 rounded bg-slate-200 dark:bg-slate-700" onClick={() => setCart(c => c.map((x, idx) => idx === i ? { ...x, qty: Math.max(1, x.qty - 1) } : x))}>-</button>
                  <span className="w-6 text-center text-xs font-bold">{it.qty}</span>
                  <button type="button" className="h-7 w-7 rounded bg-slate-200 dark:bg-slate-700" onClick={() => setCart(c => c.map((x, idx) => idx === i ? { ...x, qty: x.qty + 1 } : x))}>+</button>
                  <button type="button" className="ml-1 text-rose-500" onClick={() => setCart(c => c.filter((_, idx) => idx !== i))}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
            {!cart.length && <div className="py-8 text-center text-sm text-slate-400">Tap menu items to add</div>}
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {ORDER_TYPES.map(ot => (
              <button
                key={ot}
                type="button"
                onClick={() => setOrderType(ot)}
                className={`rounded-lg px-2 py-2 text-xs font-bold ${orderType === ot ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
              >
                {ot}
              </button>
            ))}
          </div>

          <label className="block text-xs font-semibold text-slate-500">
            Branch
            <select className="mt-1 w-full rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800" value={branchId} onChange={e => setBranchId(e.target.value)}>
              <option value="">Select branch…</option>
              {branches.map(b => <option key={b._id} value={b._id}>{b.name} ({b.code})</option>)}
            </select>
          </label>

          <label className="block text-xs font-semibold text-slate-500">
            Phone
            <div className="relative mt-1">
              <input
                className="w-full rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                placeholder="Enter phone…"
                value={customer.phone}
                maxLength={11}
                onChange={e => {
                  const digits = (e.target.value || '').replace(/\D/g, '').slice(0, 11)
                  setCustomer(c => ({ ...c, id: '', phone: digits }))
                  setCustomerFound(false)
                  setLookupMsg('')
                  setActiveSuggestion(-1)
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

          <label className="block text-xs font-semibold text-slate-500">
            Customer name
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
              placeholder="Name"
              value={customer.name}
              onChange={e => { setCustomer(c => ({ ...c, name: e.target.value })); setShowSuggestions(false) }}
            />
          </label>

          <label className="block text-xs font-semibold text-slate-500">
            Address{orderType === 'Delivery' ? ' *' : ''}
            <textarea
              rows={2}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
              placeholder={orderType === 'Delivery' ? 'Delivery address' : 'Address (optional)'}
              value={customer.address}
              onChange={e => { setCustomer(c => ({ ...c, address: e.target.value })); setShowSuggestions(false) }}
            />
          </label>

          <label className="block text-xs font-semibold text-slate-500">
            Remarks
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
              placeholder="Optional remarks"
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
            />
          </label>

          <div className="flex items-center justify-between text-sm font-black">
            <span>Total</span>
            <span>{total.toLocaleString()}</span>
          </div>
          <button disabled={busy} type="button" onClick={submit} className="rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-60">
            {busy ? 'Submitting…' : 'Submit to branch queue'}
          </button>
        </div>

        {/* Right: live queue — one card per order */}
        <div className="flex min-h-0 flex-col rounded-2xl border bg-slate-50 dark:border-slate-700 dark:bg-slate-950/50">
          <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
            <div className="text-base font-extrabold text-gray-900 dark:text-white">Queue & status</div>
            <div className="text-sm font-bold text-slate-700 dark:text-slate-200">{orders.length} order{orders.length === 1 ? '' : 's'}</div>
          </div>
          <div className="min-h-0 flex-1 space-y-2.5 overflow-auto p-2.5">
            {orders.map(o => {
              const items = Array.isArray(o.items) ? o.items : []
              const created = o.createdAt ? new Date(o.createdAt) : null
              const timeLabel = created && !Number.isNaN(created.getTime())
                ? created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : ''
              return (
                <article
                  key={o._id}
                  className="rounded-xl border-2 border-slate-300 bg-white p-3.5 shadow-sm dark:border-slate-600 dark:bg-slate-900"
                >
                  <div className="mb-2.5 flex items-start justify-between gap-2">
                    <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-extrabold ${ccStatusStyle(o.status)}`}>
                      {ccStatusLabel(o.status)}
                    </span>
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

                  {o.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => cancel(o._id)}
                      className="mt-2.5 w-full rounded-lg border-2 border-rose-300 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40"
                    >
                      Cancel order
                    </button>
                  )}
                </article>
              )
            })}
            {!orders.length && <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-10 text-center text-base font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900">No orders in queue</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
