import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { Landmark, Plus, ArrowLeftRight } from 'lucide-react'
import { useAuth } from '../../state/AuthContext.jsx'
import { useBranch } from '../../state/BranchContext.jsx'
import { warehouseApiBase, warehouseHeaders } from './warehouseApi.js'
import DatePicker from '../../components/DatePicker.jsx'

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function WarehouseFinance() {
  const { token } = useAuth()
  const { branches } = useBranch()
  const [summary, setSummary] = useState({ cash: 0, bank: 0, total: 0 })
  const [heads, setHeads] = useState([])
  const [ledger, setLedger] = useState([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)

  const [entryOpen, setEntryOpen] = useState(false)
  const [xferOpen, setXferOpen] = useState(false)
  const [headOpen, setHeadOpen] = useState(false)

  const [entry, setEntry] = useState({
    date: todayStr(),
    direction: 'in',
    account: 'cash',
    amount: '',
    accountHeadId: '',
    fromBranchId: '',
    reference: '',
    notes: '',
  })
  const [xfer, setXfer] = useState({ date: todayStr(), fromAccount: 'cash', amount: '', notes: '' })
  const [newHead, setNewHead] = useState({ name: '', type: 'expense' })

  const load = async () => {
    try {
      const qs = new URLSearchParams()
      if (from) qs.set('from', from)
      if (to) qs.set('to', to)
      const [sRes, hRes, lRes] = await Promise.all([
        fetch(`${warehouseApiBase()}/api/warehouse/finance/summary`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${warehouseApiBase()}/api/warehouse/finance/heads`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${warehouseApiBase()}/api/warehouse/finance/ledger?${qs}`, { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (sRes.ok) setSummary(await sRes.json())
      if (hRes.ok) setHeads(await hRes.json())
      if (lRes.ok) setLedger(await lRes.json())
    } catch {
      toast.error('Could not load finance')
    }
  }

  useEffect(() => { load() }, [token, from, to])

  const incomeHeads = useMemo(() => heads.filter(h => h.type === 'income'), [heads])
  const expenseHeads = useMemo(() => heads.filter(h => h.type === 'expense'), [heads])

  const saveEntry = async (e) => {
    e.preventDefault()
    if (!(Number(entry.amount) > 0)) return toast.error('Enter amount')
    setBusy(true)
    try {
      const res = await fetch(`${warehouseApiBase()}/api/warehouse/finance/entries`, {
        method: 'POST',
        headers: warehouseHeaders(token),
        body: JSON.stringify({
          ...entry,
          amount: Number(entry.amount),
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Failed')
      toast.success(entry.direction === 'in' ? 'Cash received recorded' : 'Expense recorded')
      setEntryOpen(false)
      setEntry({ date: todayStr(), direction: 'in', account: 'cash', amount: '', accountHeadId: '', fromBranchId: '', reference: '', notes: '' })
      load()
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const saveXfer = async (e) => {
    e.preventDefault()
    if (!(Number(xfer.amount) > 0)) return toast.error('Enter amount')
    setBusy(true)
    try {
      const res = await fetch(`${warehouseApiBase()}/api/warehouse/finance/entries`, {
        method: 'POST',
        headers: warehouseHeaders(token),
        body: JSON.stringify({ kind: 'transfer', ...xfer, amount: Number(xfer.amount) }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Failed')
      toast.success('Cash ↔ bank transfer recorded')
      setXferOpen(false)
      load()
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const saveHead = async (e) => {
    e.preventDefault()
    if (!newHead.name.trim()) return toast.error('Name required')
    setBusy(true)
    try {
      const res = await fetch(`${warehouseApiBase()}/api/warehouse/finance/heads`, {
        method: 'POST',
        headers: warehouseHeaders(token),
        body: JSON.stringify(newHead),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Failed')
      toast.success('Account head created')
      setHeadOpen(false)
      setNewHead({ name: '', type: 'expense' })
      load()
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const money = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-600 text-white">
            <Landmark size={20} />
          </div>
          <div>
            <h1 className="page-title">Warehouse Finance</h1>
            <p className="text-sm text-gray-500">HQ cash book — branch remittances, spends, cash vs bank</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setHeadOpen(true)} className="rounded-xl border px-4 py-2 text-sm font-semibold">+ Account head</button>
          <button type="button" onClick={() => setXferOpen(true)} className="inline-flex items-center gap-1 rounded-xl border px-4 py-2 text-sm font-semibold">
            <ArrowLeftRight size={14} /> Cash ↔ Bank
          </button>
          <button type="button" onClick={() => { setEntry({ ...entry, direction: 'out' }); setEntryOpen(true) }} className="rounded-xl border px-4 py-2 text-sm font-semibold">Record expense</button>
          <button type="button" onClick={() => { setEntry({ ...entry, direction: 'in', accountHeadId: incomeHeads[0]?._id || '' }); setEntryOpen(true) }} className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white">
            <Plus size={14} /> Receive from branch
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="text-xs font-semibold uppercase text-gray-500">Cash in hand</div>
          <div className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-400">{money(summary.cash)}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="text-xs font-semibold uppercase text-gray-500">Bank</div>
          <div className="mt-1 text-2xl font-bold text-indigo-700 dark:text-indigo-400">{money(summary.bank)}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="text-xs font-semibold uppercase text-gray-500">Total</div>
          <div className="mt-1 text-2xl font-bold">{money(summary.total)}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">From</label>
          <DatePicker value={from} onChange={setFrom} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">To</label>
          <DatePicker value={to} onChange={setTo} />
        </div>
        <button type="button" onClick={load} className="rounded-xl border px-4 py-2 text-sm font-semibold">Refresh</button>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white dark:border-gray-700 dark:bg-gray-800">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-gray-500 dark:border-gray-700">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3">Head</th>
              <th className="px-4 py-3">Branch</th>
              <th className="px-4 py-3 text-right">In</th>
              <th className="px-4 py-3 text-right">Out</th>
              <th className="px-4 py-3">Notes</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map(row => (
              <tr key={row._id} className="border-b dark:border-gray-700">
                <td className="px-4 py-2 whitespace-nowrap">{row.date}</td>
                <td className="px-4 py-2 capitalize">{row.account}</td>
                <td className="px-4 py-2">{row.accountHeadName || '—'}</td>
                <td className="px-4 py-2">{row.fromBranchName || '—'}</td>
                <td className="px-4 py-2 text-right font-semibold text-emerald-700">
                  {row.direction === 'in' ? money(row.amount) : ''}
                </td>
                <td className="px-4 py-2 text-right font-semibold text-rose-700">
                  {row.direction === 'out' ? money(row.amount) : ''}
                </td>
                <td className="px-4 py-2 text-gray-500">{row.notes || row.reference || ''}</td>
              </tr>
            ))}
            {!ledger.length && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No entries yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {entryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={saveEntry} className="w-full max-w-lg space-y-3 rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800">
            <h3 className="text-lg font-bold">{entry.direction === 'in' ? 'Receive cash from branch' : 'Record expense'}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500">Date</label>
                <DatePicker value={entry.date} onChange={v => setEntry({ ...entry, date: v })} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500">Pot</label>
                <select className="w-full rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-900" value={entry.account} onChange={e => setEntry({ ...entry, account: e.target.value })}>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">Amount</label>
              <input type="number" min={0.01} step="any" required className="w-full rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-900" value={entry.amount} onChange={e => setEntry({ ...entry, amount: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">Account head</label>
              <select className="w-full rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-900" value={entry.accountHeadId} onChange={e => setEntry({ ...entry, accountHeadId: e.target.value })}>
                <option value="">Select…</option>
                {(entry.direction === 'in' ? incomeHeads : expenseHeads).map(h => (
                  <option key={h._id} value={h._id}>{h.name}</option>
                ))}
              </select>
            </div>
            {entry.direction === 'in' && (
              <div>
                <label className="text-xs font-semibold text-gray-500">From branch</label>
                <select className="w-full rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-900" value={entry.fromBranchId} onChange={e => setEntry({ ...entry, fromBranchId: e.target.value })}>
                  <option value="">Select branch…</option>
                  {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                </select>
              </div>
            )}
            <input className="w-full rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-900" placeholder="Reference" value={entry.reference} onChange={e => setEntry({ ...entry, reference: e.target.value })} />
            <input className="w-full rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-900" placeholder="Notes" value={entry.notes} onChange={e => setEntry({ ...entry, notes: e.target.value })} />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="rounded-xl border px-4 py-2 text-sm font-semibold" onClick={() => setEntryOpen(false)}>Cancel</button>
              <button disabled={busy} type="submit" className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">Save</button>
            </div>
          </form>
        </div>
      )}

      {xferOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={saveXfer} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800">
            <h3 className="text-lg font-bold">Move Cash ↔ Bank</h3>
            <DatePicker value={xfer.date} onChange={v => setXfer({ ...xfer, date: v })} />
            <select className="w-full rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-900" value={xfer.fromAccount} onChange={e => setXfer({ ...xfer, fromAccount: e.target.value })}>
              <option value="cash">Cash → Bank</option>
              <option value="bank">Bank → Cash</option>
            </select>
            <input type="number" min={0.01} step="any" required className="w-full rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-900" placeholder="Amount" value={xfer.amount} onChange={e => setXfer({ ...xfer, amount: e.target.value })} />
            <input className="w-full rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-900" placeholder="Notes" value={xfer.notes} onChange={e => setXfer({ ...xfer, notes: e.target.value })} />
            <div className="flex justify-end gap-2">
              <button type="button" className="rounded-xl border px-4 py-2 text-sm font-semibold" onClick={() => setXferOpen(false)}>Cancel</button>
              <button disabled={busy} type="submit" className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">Transfer</button>
            </div>
          </form>
        </div>
      )}

      {headOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={saveHead} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800">
            <h3 className="text-lg font-bold">New account head</h3>
            <input required className="w-full rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-900" placeholder="Name" value={newHead.name} onChange={e => setNewHead({ ...newHead, name: e.target.value })} />
            <select className="w-full rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-900" value={newHead.type} onChange={e => setNewHead({ ...newHead, type: e.target.value })}>
              <option value="income">Income (e.g. remittance)</option>
              <option value="expense">Expense</option>
              <option value="transfer">Transfer</option>
            </select>
            <div className="flex justify-end gap-2">
              <button type="button" className="rounded-xl border px-4 py-2 text-sm font-semibold" onClick={() => setHeadOpen(false)}>Cancel</button>
              <button disabled={busy} type="submit" className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">Create</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
