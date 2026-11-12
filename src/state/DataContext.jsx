import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useCallback } from 'react'
import { useAuth } from './AuthContext.jsx'
import { useBranch } from './BranchContext.jsx'
import { isUserBusy } from '../utils/userBusy.js'
import { addDays, format } from 'date-fns'

const DataContext = createContext(null)

// Fallback UUID generator for browsers without crypto.randomUUID support (non-HTTPS contexts)
function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback: generate a UUID-like string
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

const initialState = () => {
  const today = new Date()
  const defaults = {
    // keep shapes minimal; will hydrate from backend
    ingredients: [],
    menu: [],
    categories: [],
    sales: [],
    deletedSales: [],
    recalls: [],
    returns: [],
    supplies: [],
    suppliers: [],
    customers: [],
    expenses: [],
    staff: [],
    attendance: {},
    riders: [],
    helds: [],
    daybook: { open: false, openingCash: 0, date: format(today, 'yyyy-MM-dd'), records: [] },
    audit: [],
    cashOpenings: [],
    advanceBookings: [],
    payInOuts: [],
    dayCloses: [],
    settings: { modifiers: {}, tables: [], billingFooter: '', companyName: 'Restaurant POS', useBusinessDayForToday: true, kotPrinterName: '', kotPrinterIp: '', billPrinterName: '', billPrinterIp: '', printBankQrOnBill: false, bankQrLabel: 'Scan to pay', bankQrPayload: '', bankQrImage: '' },
    staffSettings: { standardCheckIn: '09:00', standardCheckOut: '18:00', lateThresholdMinutes: 15, bonusPerDay: 0, deductionPerAbsent: 0, deductionPerLate: 0 },
    demands: [],
  }
  return defaults
}

function reducer(state, action) {
  switch (action.type) {
    case 'HYDRATE': {
      const next = { ...state, ...(action.payload || {}) }
      return log(next, 'Hydrated from backend')
    }
    case 'ADD_INGREDIENT': {
      const ing = { ...action.payload, id: generateUUID(), qty: Number(action.payload.qty) }
      const next = { ...state, ingredients: [...state.ingredients, ing] }
      return log(next, `Added ingredient ${ing.name}`)
    }
    case 'UPDATE_INGREDIENT': {
      const { id, data } = action.payload
      const next = { ...state, ingredients: state.ingredients.map(i => i.id === id ? { ...i, ...data } : i) }
      return log(next, `Updated ingredient ${data.name || id}`)
    }
    case 'DELETE_INGREDIENT': {
      const { id } = action.payload
      const ing = state.ingredients.find(i => i.id === id)
      const next = { ...state, ingredients: state.ingredients.filter(i => i.id !== id) }
      return log(next, `Deleted ingredient ${ing?.name || id}`)
    }
    case 'RECORD_SALE': {
      // persistent bill number sequence
      const closed = (state.dayCloses || []).some(dc => dc.date === action.payload.date)
      if (closed) return state
      const billNo = action.payload.billNo || undefined

      // Normalize discount fields: ensure itemsDiscount and billDiscount are persisted.
      // Support legacy snake_case field names from older screens if any.
      const itemsDiscountRaw = action.payload.itemsDiscount ?? action.payload.items_discount ?? 0
      let itemsDiscount = Number(itemsDiscountRaw || 0)
      let billDiscount = Number(action.payload.billDiscount ?? action.payload.bill_discount ?? 0)
      const discountProvided = action.payload.discount
      const combinedDiscount = Number(discountProvided ?? 0)
      // If billDiscount not provided but combined discount exists, infer it as (combined - items)
      if (!billDiscount && combinedDiscount) {
        const inferred = combinedDiscount - (itemsDiscount || 0)
        billDiscount = inferred > 0 ? inferred : (itemsDiscount ? 0 : combinedDiscount)
      }
      // If a combined discount is not explicitly provided, default to sum of item + bill discounts
      const totalDiscount = Number(
        discountProvided !== undefined
          ? discountProvided
          : (itemsDiscount + billDiscount)
      )

      const sale = {
        id: generateUUID(),
        date: action.payload.date,
        items: action.payload.items,
        total: action.payload.total,
        paymentMethod: action.payload.paymentMethod || 'cash', // 'cash' | 'card' | 'complimentary' (Personal)
        discount: totalDiscount,
        // Persist both discount components for dashboard analytics
        itemsDiscount,
        billDiscount,
        billNo,
        orderNo: action.payload.orderNo || undefined,
        soldBy: action.payload.soldBy || undefined,
        customer: action.payload.customer || undefined,
        offlineBillNo: action.payload.offlineBillNo || undefined,
        // order-related optional fields
        orderType: action.payload.orderType || undefined, // 'Dine-in' | 'Take-away' | 'Delivery'
        riderId: action.payload.riderId || undefined,
        waiter: action.payload.waiter || undefined,
        waiterId: action.payload.waiterId || undefined,
        tableNo: action.payload.tableNo || undefined,
        preparedTime: action.payload.preparedTime || undefined,
        status: action.payload.status || (action.payload.orderType && action.payload.orderType !== 'Take-away' ? 'Queued' : 'Completed'),
        note: action.payload.note || '',
        cashReceived: Number(action.payload.cashReceived || 0),
        changeDue: Number(action.payload.changeDue || 0),
      }
      // reduce inventory based on menu recipes
      let ingredients = [...state.ingredients]
      sale.items.forEach(it => {
        const menuItem = state.menu.find(m => m.id === it.itemId)
        if (!menuItem) return
        const recipe = menuItem.recipe || {}
        Object.entries(recipe).forEach(([ingName, amt]) => {
          const idx = ingredients.findIndex(i => i.name === ingName)
          if (idx >= 0) ingredients[idx] = { ...ingredients[idx], qty: Math.max(0, Number((ingredients[idx].qty - amt * it.qty).toFixed(3))) }
        })
        // apply modifier recipe impacts
        const mods = action.payload.settings?.modifiers || state.settings?.modifiers || {}
        const enabled = it.mods || {}
        Object.keys(enabled).forEach(key => {
          if (!enabled[key]) return
          const cfg = mods[key]
          if (!cfg || !cfg.recipe) return
          Object.entries(cfg.recipe).forEach(([ingName, amt]) => {
            const idx = ingredients.findIndex(i => i.name === ingName)
            if (idx >= 0) ingredients[idx] = { ...ingredients[idx], qty: Math.max(0, Number((ingredients[idx].qty - amt * it.qty).toFixed(3))) }
          })
        })
      })
      // update customer aggregates if present
      let customers = state.customers || []
      const c = sale.customer
      if (c?.id) {
        const idx = customers.findIndex(x => x.id === c.id)
        if (idx >= 0) {
          const updated = {
            ...customers[idx],
            name: c.name || customers[idx].name,
            phone: c.phone || customers[idx].phone,
            isRegular: c.isRegular ?? customers[idx].isRegular,
            totalVisits: Number(customers[idx].totalVisits || 0) + 1,
            totalSpent: Number(customers[idx].totalSpent || 0) + Number(sale.total || 0) - Number(sale.discount || 0),
            lastVisit: sale.date,
          }
          customers = customers.map((x,i)=> i===idx ? updated : x)
        }
      }
      const next = { ...state, ingredients, customers, sales: [sale, ...state.sales] }
      return log(next, `Recorded sale ${sale.id} total ${sale.total}`)
    }
    case 'RECORD_RETURN': {
      const { date, saleId, customer, items, refund, reason, paymentMethod } = action.payload
      const isClosed = (state.dayCloses || []).some(dc => dc.date === date)
      if (isClosed) return state
      const ret = {
        id: generateUUID(),
        date,
        saleId: saleId || undefined,
        customer: customer || undefined,
        items: items || [], // [{itemId, qty}]
        refund: Number(refund || 0),
        reason: reason || '',
        paymentMethod: paymentMethod || 'cash',
      }
      // increase inventory based on menu recipes
      let ingredients = [...state.ingredients]
      ret.items.forEach(it => {
        const menuItem = state.menu.find(m => m.id === it.itemId)
        if (!menuItem) return
        const recipe = menuItem.recipe || {}
        Object.entries(recipe).forEach(([ingName, amt]) => {
          const idx = ingredients.findIndex(i => i.name === ingName)
          if (idx >= 0) ingredients[idx] = { ...ingredients[idx], qty: Number((Number(ingredients[idx].qty) + amt * it.qty).toFixed(3)) }
        })
      })
      const next = { ...state, ingredients, returns: [ret, ...(state.returns || [])] }
      return log(next, `Recorded return ${ret.id} refund ${ret.refund}${saleId ? ` for sale ${saleId}` : ''}`)
    }
    case 'DELETE_SALE': {
      const { id } = action.payload
      const sale = state.sales.find(s => s.id === id)
      if (!sale) return state
      const closed = (state.dayCloses || []).some(dc => dc.date === sale.date)
      if (closed) return state
      // restore inventory based on menu recipes
      let ingredients = [...state.ingredients]
      sale.items.forEach(it => {
        const menuItem = state.menu.find(m => m.id === it.itemId)
        if (!menuItem) return
        const recipe = menuItem.recipe || {}
        Object.entries(recipe).forEach(([ingName, amt]) => {
          const idx = ingredients.findIndex(i => i.name === ingName)
          if (idx >= 0) ingredients[idx] = { ...ingredients[idx], qty: Number((Number(ingredients[idx].qty) + amt * it.qty).toFixed(3)) }
        })
      })
      const next = { ...state, ingredients, sales: state.sales.filter(s => s.id !== id) }
      return log(next, `Deleted sale ${id}`)
    }
    case 'DELETE_RETURN': {
      const { id } = action.payload
      const ret = (state.returns || []).find(r => r.id === id)
      if (!ret) return state
      const isClosed = (state.dayCloses || []).some(dc => dc.date === ret.date)
      if (isClosed) return state
      // revert inventory increase
      let ingredients = [...state.ingredients]
      ret.items.forEach(it => {
        const menuItem = state.menu.find(m => m.id === it.itemId)
        if (!menuItem) return
        const recipe = menuItem.recipe || {}
        Object.entries(recipe).forEach(([ingName, amt]) => {
          const idx = ingredients.findIndex(i => i.name === ingName)
          if (idx >= 0) ingredients[idx] = { ...ingredients[idx], qty: Math.max(0, Number((ingredients[idx].qty - amt * it.qty).toFixed(3))) }
        })
      })
      const next = { ...state, ingredients, returns: (state.returns || []).filter(r => r.id !== id) }
      return log(next, `Deleted return ${id}`)
    }
    case 'UPDATE_SALE_STATUS': {
      const { id, status } = action.payload
      const stamp = format(new Date(), 'HH:mm')
      const next = {
        ...state,
        sales: state.sales.map(s => s.id === id ? { ...s, status, preparedTime: status === 'Preparing' || status === 'Completed' ? stamp : s.preparedTime } : s)
      }
      return log(next, `Order ${id} status -> ${status}`)
    }
    case 'ASSIGN_RIDER': {
      const { id, riderId } = action.payload
      const next = {
        ...state,
        sales: state.sales.map(s => s.id === id ? { ...s, riderId, orderType: 'Delivery' } : s)
      }
      return log(next, `Order ${id} assigned rider ${riderId || '-'}`)
    }
    case 'ADD_SUPPLY': {
      const sup = { id: generateUUID(), ...action.payload }
      const isClosed = (state.dayCloses || []).some(dc => dc.date === sup.date)
      if (isClosed) return state
      let ingredients = [...state.ingredients]
      sup.items.forEach(({ name, qty, unit, price }) => {
        const idx = ingredients.findIndex(i => i.name === name)
        if (idx >= 0) ingredients[idx] = { ...ingredients[idx], qty: Number(ingredients[idx].qty) + Number(qty), unit, price }
        else ingredients.push({ id: generateUUID(), name, category: 'Supply', qty: Number(qty), unit, price })
      })
      const next = { ...state, ingredients, supplies: [sup, ...state.supplies] }
      return log(next, `Added supply ${sup.id}`)
    }
    case 'ADD_SUPPLIER': {
      const sup = { id: generateUUID(), status: 'Active', ...action.payload }
      const next = { ...state, suppliers: [...(state.suppliers||[]), sup] }
      return log(next, `Added supplier ${sup.name || sup.company || sup.id}`)
    }
    case 'ADD_MENU': {
      const providedId = action?.payload?.id
      const item = { id: providedId || generateUUID(), active: true, recipe: {}, ...action.payload }
      const next = { ...state, menu: [...(state.menu||[]), item] }
      return log(next, `Added menu ${item.name || item.sku || item.id}`)
    }
    case 'UPDATE_MENU': {
      const { id, data } = action.payload
      const next = { ...state, menu: (state.menu||[]).map(m => m.id === id ? { ...m, ...data } : m) }
      return log(next, `Updated menu ${id}`)
    }
    case 'DELETE_MENU': {
      const { id } = action.payload
      const target = (state.menu||[]).find(m => m.id === id)
      const next = { ...state, menu: (state.menu||[]).filter(m => m.id !== id) }
      return log(next, `Deleted menu ${target?.name || id}`)
    }
    case 'ADD_CATEGORY': {
      const c = { id: generateUUID(), active: true, showOnPos: true, ...action.payload }
      const next = { ...state, categories: [...(state.categories||[]), c] }
      return log(next, `Added category ${c.name || c.id}`)
    }
    case 'UPDATE_CATEGORY': {
      const { id, data } = action.payload
      const next = { ...state, categories: (state.categories||[]).map(c => c.id === id ? { ...c, ...data } : c) }
      return log(next, `Updated category ${id}`)
    }
    case 'DELETE_CATEGORY': {
      const { id } = action.payload
      const target = (state.categories||[]).find(c => c.id === id)
      const next = { ...state, categories: (state.categories||[]).filter(c => c.id !== id) }
      return log(next, `Deleted category ${target?.name || id}`)
    }
    case 'UPDATE_SUPPLIER': {
      const { id, data } = action.payload
      const next = { ...state, suppliers: (state.suppliers||[]).map(s => s.id === id ? { ...s, ...data } : s) }
      return log(next, `Updated supplier ${data.name || id}`)
    }
    case 'DELETE_SUPPLIER': {
      const { id } = action.payload
      const target = (state.suppliers||[]).find(s => s.id === id)
      const next = { ...state, suppliers: (state.suppliers||[]).filter(s => s.id !== id) }
      return log(next, `Deleted supplier ${target?.name || id}`)
    }
    case 'ADD_CUSTOMER': {
      const c = { id: generateUUID(), isRegular: false, totalVisits: 0, totalSpent: 0, ...action.payload }
      const next = { ...state, customers: [...(state.customers||[]), c] }
      return log(next, `Added customer ${c.name || c.phone || c.id}`)
    }
    case 'UPDATE_CUSTOMER': {
      const { id, data } = action.payload
      const next = { ...state, customers: (state.customers||[]).map(c => c.id === id ? { ...c, ...data } : c) }
      return log(next, `Updated customer ${id}`)
    }
    case 'DELETE_CUSTOMER': {
      const { id } = action.payload
      const next = { ...state, customers: (state.customers||[]).filter(c => c.id !== id) }
      return log(next, `Deleted customer ${id}`)
    }
    case 'ADD_EXPENSE': {
      const exp = { id: generateUUID(), ...action.payload }
      const isClosed = (state.dayCloses || []).some(dc => dc.date === exp.date)
      if (isClosed) return state
      const next = { ...state, expenses: [exp, ...state.expenses] }
      return log(next, `Added expense ${exp.category}: ${exp.amount}`)
    }
    case 'DELETE_EXPENSE': {
      const { id } = action.payload
      const target = (state.expenses || []).find(e => e.id === id)
      if (!target) return state
      const isClosed = (state.dayCloses || []).some(dc => dc.date === target.date)
      if (isClosed) return state
      const next = { ...state, expenses: (state.expenses || []).filter(e => e.id !== id) }
      return log(next, `Deleted expense ${target.category || ''} ${id}`)
    }
    case 'ADD_STAFF': {
      const st = { id: generateUUID(), ...action.payload }
      const next = { ...state, staff: [...state.staff, st] }
      return log(next, `Added staff ${st.name}`)
    }
    case 'UPDATE_STAFF': {
      const { id, data } = action.payload
      const next = { ...state, staff: state.staff.map(s => s.id === id ? { ...s, ...data } : s) }
      return log(next, `Updated staff ${id}`)
    }
    case 'DELETE_STAFF': {
      const { id } = action.payload
      const target = state.staff.find(s => s.id === id)
      const next = { ...state, staff: state.staff.filter(s => s.id !== id) }
      return log(next, `Deleted staff ${target?.name || id}`)
    }
    case 'MARK_ATTENDANCE': {
      const { date, staffId, status } = action.payload // P, A, L
      const key = date
      const day = state.attendance[key] || {}
      const next = { ...state, attendance: { ...state.attendance, [key]: { ...day, [staffId]: status } } }
      return log(next, `Attendance ${staffId} ${status} on ${key}`)
    }
    case 'DAY_OPEN': {
      const { date, openingCash, userId, userName } = action.payload
      const isClosed = (state.dayCloses || []).some(dc => dc.date === date)
      if (isClosed) return state
      const entry = { id: generateUUID(), date, openingCash: Number(openingCash), userId: userId || '', userName: userName || '' }
      const rest = (state.cashOpenings || []).filter(c => String(c.date) !== String(date))
      const next = { ...state, daybook: { open: true, openingCash, date, records: [] }, cashOpenings: [entry, ...rest] }
      return log(next, `Day opened ${date} with cash ${openingCash}`)
    }
    case 'DAY_CLOSE': {
      const { date } = action.payload
      const next = { ...state, daybook: { ...state.daybook, open: false, date } }
      return log(next, `Day closed ${date}`)
    }
    case 'ADD_DAY_CLOSE': {
      const entry = { id: generateUUID(), ...action.payload }
      const alreadyClosed = (state.dayCloses || []).some(dc => dc.date === entry.date)
      if (alreadyClosed) return state
      const next = { ...state, dayCloses: [entry, ...(state.dayCloses || [])] }
      return log(next, `Added day close ${entry.date}`)
    }
    case 'UPSERT_CASH_OPENING': {
      const entry = action.payload || {}
      const date = String(entry.date || '')
      if (!date) return state
      const row = {
        id: entry.id || entry._id || generateUUID(),
        date,
        openingCash: Number(entry.openingCash || 0),
        note: entry.note || '',
        userId: entry.userId || '',
        userName: entry.userName || '',
      }
      const rest = (state.cashOpenings || []).filter(c => String(c.date) !== date)
      const next = { ...state, cashOpenings: [row, ...rest] }
      // If daybook is for that date, keep opening cash in sync
      if (state.daybook?.date === date) {
        next.daybook = { ...state.daybook, openingCash: row.openingCash }
      }
      return log(next, `Cash opening ${date} = ${row.openingCash}`)
    }
    case 'ADD_BOOKING': {
      const { date, time, customer, phone, deposit, note, userId, userName } = action.payload
      const entry = { id: generateUUID(), date, time, customer: customer || '', phone: phone || '', deposit: Number(deposit || 0), status: 'Booked', note: note || '', userId: userId || '', userName: userName || '' }
      const next = { ...state, advanceBookings: [entry, ...(state.advanceBookings || [])] }
      return log(next, `Advance booking ${entry.id} for ${entry.customer} on ${date} ${time || ''} deposit ${entry.deposit}`)
    }
    case 'UPDATE_BOOKING_STATUS': {
      const { id, status, saleId } = action.payload // 'Booked' | 'Completed' | 'Cancelled'
      const next = { ...state, advanceBookings: (state.advanceBookings || []).map(b => b.id === id ? { ...b, status, settledSaleId: saleId || b.settledSaleId } : b) }
      return log(next, `Booking ${id} status -> ${status}${saleId ? ` (sale ${saleId})` : ''}`)
    }
    case 'UPDATE_BOOKING': {
      const { id, data } = action.payload
      const next = { ...state, advanceBookings: (state.advanceBookings || []).map(b => b.id === id ? { ...b, ...data } : b) }
      return log(next, `Updated booking ${id}`)
    }
    case 'DELETE_BOOKING': {
      const { id } = action.payload
      const next = { ...state, advanceBookings: (state.advanceBookings || []).filter(b => b.id !== id) }
      return log(next, `Deleted booking ${id}`)
    }
    case 'ADD_PAY_IO': {
      const { date, type, amount, category, note, userId, userName } = action.payload // type: 'IN' | 'OUT'
      const isClosed = (state.dayCloses || []).some(dc => dc.date === date)
      if (isClosed) return state
      const entry = { id: generateUUID(), date, type, amount: Number(amount||0), category: category||'', note: note||'', userId: userId||'', userName: userName||'' }
      const next = { ...state, payInOuts: [entry, ...(state.payInOuts || [])] }
      return log(next, `Pay ${type} ${entry.amount} on ${date}`)
    }
    case 'DELETE_PAY_IO': {
      const { id } = action.payload
      const target = (state.payInOuts || []).find(p => p.id === id)
      if (!target) return state
      const isClosed = (state.dayCloses || []).some(dc => dc.date === target.date)
      if (isClosed) return state
      const next = { ...state, payInOuts: (state.payInOuts || []).filter(p => p.id !== id) }
      return log(next, `Deleted pay IO ${id}`)
    }
    case 'ADD_RIDER': {
      const r = { id: generateUUID(), ...action.payload }
      const next = { ...state, riders: [...state.riders, r] }
      return log(next, `Added rider ${r.name}`)
    }
    case 'UPDATE_RIDER': {
      const { id, data } = action.payload
      const next = { ...state, riders: state.riders.map(r => r.id === id ? { ...r, ...data } : r) }
      return log(next, `Updated rider ${id}`)
    }
    case 'DELETE_RIDER': {
      const { id } = action.payload
      const target = state.riders.find(r => r.id === id)
      const next = { ...state, riders: state.riders.filter(r => r.id !== id) }
      return log(next, `Deleted rider ${target?.name || id}`)
    }
    case 'UPDATE_SETTINGS': {
      const next = { ...state, settings: { ...(state.settings||{}), ...(action.payload||{}) } }
      return log(next, 'Updated settings')
    }
    case 'ADD_DEMAND': {
      const d = { id: generateUUID(), ...action.payload }
      const next = { ...state, demands: [d, ...(state.demands || [])] }
      return log(next, `Added demand for ${d.date}`)
    }
    case 'UPDATE_DEMAND': {
      const { id, data } = action.payload
      const next = { ...state, demands: (state.demands || []).map(d => d.id === id ? { ...d, ...data } : d) }
      return log(next, `Updated demand ${id}`)
    }
    case 'DELETE_DEMAND': {
      const { id } = action.payload
      const next = { ...state, demands: (state.demands || []).filter(d => d.id !== id) }
      return log(next, `Deleted demand ${id}`)
    }
    default:
      return state
  }
}

function log(state, message) {
  let id = ''
  try { id = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') ? generateUUID() : '' } catch {}
  if (!id) id = 'log-' + Math.random().toString(36).slice(2,10) + '-' + Date.now().toString(36)
  const entry = { id, message, at: new Date().toISOString(), user: 'system' }
  return { ...state, audit: [entry, ...(state.audit || [])] }
}

export function DataProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)
  const auth = useAuth()
  const token = auth?.token || ''
  const { activeBranchId } = useBranch()
  const getAPI = () => ((typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000')
  const stateRef = useRef(state)
  stateRef.current = state

  const rehydrate = useCallback(async () => {
    try {
      const API = getAPI()
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      const getJson = async (path, _defVal, allowUnauthRetry = false) => {
        try {
          let res = await fetch(`${API}${path}`, { headers, cache: 'no-store' })
          if (!res.ok && (res.status === 401 || res.status === 403) && allowUnauthRetry) {
            res = await fetch(`${API}${path}`, { cache: 'no-store' })
          }
          if (res.ok) return await res.json()
        } catch {}
        return undefined
      }
      const settings = await getJson('/api/settings', null, true)
      const prev = stateRef.current

      if (!token) {
        const normalizedTables = Array.isArray(settings?.tables)
          ? settings.tables.map(t => typeof t === 'string' ? { name: t } : ({ name: t?.name || t?.label || String(t), floor: t?.floor || '', imageUrl: t?.imageUrl || '' })).filter(t => t.name)
          : []
        dispatch({ type: 'HYDRATE', payload: { settings: { ...prev.settings, ...(settings || {}), tables: normalizedTables } } })
        return
      }

      const [staffSettings, menu, categories, staff, riders, customers, suppliers, ingredients, supplies, sales, deletedSales, recalls, returns, expenses, audit, cashOpenings, bookings, payInOuts, dayCloses, tablesList, helds, demands] = await Promise.all([
        getJson('/api/staff-settings', {}),
        getJson('/api/menu', []),
        getJson('/api/categories', []),
        getJson('/api/staff?limit=500', []),
        getJson('/api/riders', []),
        getJson('/api/customers', []),
        getJson('/api/suppliers?limit=1000', []),
        getJson('/api/ingredients', []),
        getJson('/api/supplies', []),
        getJson('/api/sales?from=0000-00-00&to=9999-12-31', []),
        getJson('/api/sales/deleted?from=0000-00-00&to=9999-12-31', []),
        getJson('/api/recalls', []),
        getJson('/api/returns?from=0000-00-00&to=9999-12-31', []),
        getJson('/api/expenses?from=0000-00-00&to=9999-12-31&limit=200', []),
        getJson('/api/audit?limit=200', []),
        getJson('/api/cash-openings', []),
        getJson('/api/advance-bookings', []),
        getJson('/api/pay-in-outs?limit=100', []),
        getJson('/api/day-closes', []),
        getJson('/api/tables', []),
        getJson('/api/helds', []),
        getJson('/api/demands?limit=200', []),
      ])

      const mapId = (x) => ({ ...x, id: x.id || x._id })
      // Successful empty list clears previous branch data; failed request keeps prev
      const mapList = (v, prevList = [], { shared = false } = {}) => {
        if (v === undefined) return prevList
        if (Array.isArray(v)) return v.map(mapId)
        if (v && Array.isArray(v.rows)) return v.rows.map(mapId)
        if (v && Array.isArray(v.data)) return v.data.map(mapId)
        return shared ? prevList : []
      }
      // Prefer branch-scoped /api/tables (including empty). Only fall back to settings if request failed.
      const tablesFromApi = Array.isArray(tablesList)
        ? tablesList.map(t => typeof t === 'string' ? { name: t } : ({ name: t?.name || t?.label || String(t), floor: t?.floor || '', imageUrl: t?.imageUrl || '', id: t?.id || t?._id })).filter(t => t.name)
        : null
      const normalizedTablesAuth = tablesFromApi != null
        ? tablesFromApi
        : (Array.isArray(settings?.tables)
          ? settings.tables.map(t => typeof t === 'string' ? { name: t } : ({ name: t?.name || t?.label || String(t), floor: t?.floor || '', imageUrl: t?.imageUrl || '' })).filter(t => t.name)
          : [])
      // Replace settings on branch change — do not keep previous branch fields
      const mergedSettingsAuth = settings
        ? {
          ...settings,
          taxRate: Number(settings.taxRate ?? 0),
          businessDayCutoffHour: Number(settings.businessDayCutoffHour ?? 4),
          autoBackupEnabled: Boolean(settings.autoBackupEnabled),
          autoBackupIntervalMinutes: Number(settings.autoBackupIntervalMinutes ?? 60),
          tables: normalizedTablesAuth,
          branchId: settings.branchId || activeBranchId || '',
        }
        : {
          ...prev.settings,
          tables: normalizedTablesAuth,
          branchId: activeBranchId || prev.settings?.branchId || '',
        }
      dispatch({ type: 'HYDRATE', payload: {
        settings: mergedSettingsAuth,
        staffSettings: {
          standardCheckIn: staffSettings?.standardCheckIn || prev.staffSettings.standardCheckIn,
          standardCheckOut: staffSettings?.standardCheckOut || prev.staffSettings.standardCheckOut,
          lateThresholdMinutes: Number(staffSettings?.lateThresholdMinutes ?? prev.staffSettings.lateThresholdMinutes),
          bonusPerDay: Number(staffSettings?.bonusPerDay ?? prev.staffSettings.bonusPerDay),
          deductionPerAbsent: Number(staffSettings?.deductionPerAbsent ?? prev.staffSettings.deductionPerAbsent),
          deductionPerLate: Number(staffSettings?.deductionPerLate ?? prev.staffSettings.deductionPerLate),
        },
        menu: mapList(menu, []),
        categories: mapList(categories, prev.categories, { shared: true }),
        staff: mapList(staff === undefined ? undefined : (staff?.data || staff), []),
        riders: mapList(riders, []),
        customers: mapList(customers, prev.customers, { shared: true }),
        suppliers: mapList(suppliers, []),
        ingredients: mapList(ingredients, []),
        supplies: mapList(supplies, []),
        sales: mapList(sales, []),
        deletedSales: mapList(deletedSales, []),
        recalls: mapList(recalls, []),
        returns: mapList(returns, []),
        expenses: mapList(expenses, []),
        audit: mapList(audit, []),
        cashOpenings: mapList(cashOpenings, []),
        advanceBookings: mapList(bookings, []),
        payInOuts: mapList(payInOuts, []),
        dayCloses: mapList(dayCloses, []),
        helds: mapList(helds, []),
        demands: mapList(demands, []),
      } })
      try {
        window.dispatchEvent(new CustomEvent('data_rehydrated', { detail: { branchId: activeBranchId || '' } }))
      } catch {}
    } catch {
      // silent fail; app remains usable offline
    }
  }, [token, activeBranchId])

  // Hydrate on login and whenever the header branch changes
  useEffect(() => {
    try {
      const p = rehydrate()
      if (p != null && typeof p.then === 'function') p.catch(() => {})
    } catch {}
  }, [rehydrate])

  // Event-driven shared refresh only (no quiet polling).
  // Full HYDRATE on a timer interrupts editors; branch/sync/visibility is enough.
  useEffect(() => {
    if (!token) return
    const safeRehydrate = ({ force = false } = {}) => {
      try {
        if (!force && isUserBusy()) return
        if (typeof navigator !== 'undefined' && navigator.onLine === false && !force) return
        const p = rehydrate()
        if (p != null && typeof p.then === 'function') p.catch(() => {})
      } catch {}
    }
    const onVis = () => {
      try {
        if (typeof document !== 'undefined' && document.hidden) return
        safeRehydrate()
      } catch {}
    }
    const onOnline = () => safeRehydrate()
    const onSync = (e) => {
      try {
        if (e?.detail?.ok === false) return
        safeRehydrate()
      } catch {}
    }
    const onLive = () => safeRehydrate()
    const onBranch = () => safeRehydrate({ force: true })
    try {
      document.addEventListener('visibilitychange', onVis)
      window.addEventListener('online', onOnline)
      window.addEventListener('epicspire:sync', onSync)
      window.addEventListener('live_refresh', onLive)
      window.addEventListener('active_branch_changed', onBranch)
    } catch {}
    return () => {
      try {
        document.removeEventListener('visibilitychange', onVis)
        window.removeEventListener('online', onOnline)
        window.removeEventListener('epicspire:sync', onSync)
        window.removeEventListener('live_refresh', onLive)
        window.removeEventListener('active_branch_changed', onBranch)
      } catch {}
    }
  }, [token, rehydrate])

  // Global Auto-backup (Electron only): runs even when Settings page is not open
  const backupTimerRef = useRef(null)
  useEffect(() => {
    // clear any existing timer
    if (backupTimerRef.current) { clearInterval(backupTimerRef.current); backupTimerRef.current = null }
    const enabled = Boolean(state?.settings?.autoBackupEnabled)
    const mins = Math.max(1, Number(state?.settings?.autoBackupIntervalMinutes || 0))
    const folder = String(state?.settings?.backupFolderPath || '')
    // Only run when Electron bridge available and folder configured
    if (!enabled || !mins || !folder || !(window && window.backup)) return
    const doBackup = async () => {
      try {
        const headers = token ? { Authorization: `Bearer ${token}` } : {}
        const res = await fetch(`${getAPI()}/api/backup/export`, { headers })
        if (!res.ok) return
        const text = await res.text()
        const file = `rms-backup-${new Date().toISOString().replace(/[:]/g,'-').slice(0,19)}.json`
        await window.backup.saveToFolder(folder, file, text)
      } catch {}
    }
    // initial schedule only; do not run immediately to avoid doing it on every app startup
    backupTimerRef.current = setInterval(doBackup, mins * 60 * 1000)
    return () => { if (backupTimerRef.current) { clearInterval(backupTimerRef.current); backupTimerRef.current = null } }
  }, [state?.settings?.autoBackupEnabled, state?.settings?.autoBackupIntervalMinutes, state?.settings?.backupFolderPath, token])

  // Derived metrics
  const realToday = format(new Date(), 'yyyy-MM-dd')
  // Derive an effective daybook that persists across reloads using cash openings.
  // If there's a cash opening for the latest date that hasn't been closed yet, treat the daybook as open for that date.
  const closedSetDC = new Set((state.dayCloses||[]).map(d=>d.date))
  const openingsSorted = useMemo(() => (
    (state.cashOpenings||[])
      .map(o => o?.date)
      .filter(Boolean)
      .sort()
  ), [state.cashOpenings])
  const inferredOpenDate = useMemo(() => {
    if (!openingsSorted.length) return null
    const last = openingsSorted[openingsSorted.length - 1]
    if (!last) return null
    if (closedSetDC.has(last)) return null
    if (last > realToday) return null
    return last
  }, [openingsSorted, closedSetDC, realToday])

  const effectiveDaybook = useMemo(() => {
    // Prefer explicit open flag if present; otherwise infer from openings
    if (state?.daybook?.open) return state.daybook
    if (inferredOpenDate) return { ...(state?.daybook || {}), open: true, date: inferredOpenDate, records: state?.daybook?.records || [] }
    return state.daybook
  }, [state.daybook, inferredOpenDate])

  // Business date shown in the header + used for CSV/PDF/Print filenames.
  // Open daybook always wins (operational day). Otherwise optional "use business day"
  // setting advances past last close / latest open data day.
  const useBusiness = Boolean(state?.settings?.useBusinessDayForToday)
  let businessDate = realToday
  if (effectiveDaybook?.open && (effectiveDaybook?.date || '')) {
    businessDate = effectiveDaybook.date
  } else if (useBusiness) {
    // If there is a recent Day Close, advance business date to the next day (but not beyond today)
    const closedDatesSorted = Array.from(closedSetDC).filter(Boolean).sort()
    if (closedDatesSorted.length) {
      const lastClosed = closedDatesSorted[closedDatesSorted.length - 1]
      try {
        const nextDay = format(addDays(new Date(lastClosed), 1), 'yyyy-MM-dd')
        businessDate = nextDay <= realToday ? nextDay : realToday
      } catch { businessDate = realToday }
    } else {
      // Otherwise, pick the most recent non-closed date with data up to today
      const dataDates = new Set([
        ...((state.sales||[]).map(s=>s.date)),
        ...((state.returns||[]).map(r=>r.date)),
        ...((state.expenses||[]).map(e=>e.date)),
        ...((state.supplies||[]).map(s=>s.date)),
      ].filter(Boolean))
      const candidates = Array.from(dataDates).filter(d => d <= realToday && !closedSetDC.has(d)).sort()
      if (candidates.length) businessDate = candidates[candidates.length - 1]
    }
  }
  const monthKey = format(new Date(), 'yyyy-MM')
  const todaysSalesGross = state.sales.filter(s => s.date === businessDate).reduce((a,b) => a + Number(b.total), 0)
  const todaysReturns = (state.returns || []).filter(r => r.date === businessDate).reduce((a,b) => a + Number(b.refund || 0), 0)
  const todaysSales = Math.max(0, todaysSalesGross - todaysReturns)
  const monthlySalesGross = state.sales.filter(s => s.date?.startsWith(monthKey)).reduce((a,b) => a + Number(b.total), 0)
  const monthlyReturns = (state.returns || []).filter(r => r.date?.startsWith(monthKey)).reduce((a,b) => a + Number(b.refund || 0), 0)
  const monthlySales = Math.max(0, monthlySalesGross - monthlyReturns)
  const lowStock = state.ingredients.filter(i => i.qty <= 5)
  const ordersCount = state.sales.length

  // Expose for CSV/PDF/Print filenames (exportDateStamp reads this)
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.__BUSINESS_DATE__ = businessDate || ''
        window.BUSINESS_DATE = businessDate || ''
      }
    } catch {}
  }, [businessDate])

  const value = useMemo(() => ({
    state: { ...state, daybook: effectiveDaybook },
    dispatch,
    rehydrate,
    businessDate,
    metrics: { todaysSales, monthlySales, lowStockCount: lowStock.length, ordersCount },
  }), [state, effectiveDaybook, businessDate, todaysSales, monthlySales, lowStock.length, ordersCount, rehydrate])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export const useData = () => useContext(DataContext)
