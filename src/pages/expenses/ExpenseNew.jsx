import { useEffect, useMemo, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import { format } from 'date-fns'
import {
  Plus, RefreshCw, Wallet, Building2, CreditCard, UserRound, Tags, Settings2, X,
} from 'lucide-react'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import DatePicker from '../../components/DatePicker.jsx'
import Pagination from '../../components/Pagination.jsx'
import PageHero from '../../components/ui/PageHero.jsx'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport } from '../../utils/reportDoc.js'
import { btnPrint, btnPdf, btnCsv, exportDateStamp } from '../../utils/listReportExport.js'
import jsPDF from 'jspdf'
import 'jspdf-autotable'

const ACCOUNT_OPTIONS = [
  { value: 'cash', label: 'Cash in Hand' },
  { value: 'bank', label: 'Bank' },
]
const METHOD_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
]

const emptyForm = (date, paidBy) => ({
  description: '',
  expenseHead: 'Rent',
  amount: '',
  date,
  accountHead: 'cash',
  paymentMethod: 'cash',
  paidBy: paidBy || '',
  note: '',
})

function StatCard({ title, value, icon: Icon, iconColor = 'bg-blue-500' }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1.5 min-w-0">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-body)]">{title}</span>
          <div className="text-xl font-extrabold tracking-tight text-[var(--color-text-primary)] truncate">{value}</div>
        </div>
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${iconColor} text-white shadow-md`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="absolute -bottom-6 -right-6 h-16 w-16 rounded-full bg-slate-50 opacity-50 dark:bg-slate-800" />
    </div>
  )
}

function BreakdownPanel({ title, icon: Icon, rows }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--color-text-primary)]">
        <Icon className="h-4 w-4 text-blue-500" /> {title}
      </div>
      {(!rows || rows.length === 0) ? (
        <div className="text-sm font-medium text-[var(--color-text-muted)] py-4">No data</div>
      ) : (
        <div className="space-y-2 max-h-56 overflow-auto">
          {rows.map(r => (
            <div key={r.name} className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold text-[var(--color-text-body)] truncate">{r.name}</span>
              <span className="font-extrabold text-[var(--color-text-primary)] whitespace-nowrap">PKR {Number(r.amount || 0).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ExpenseNew() {
 const { state, dispatch, businessDate } = useData()
  const { token, user } = useAuth()
 const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
  const defaultDate = businessDate || format(new Date(), 'yyyy-MM-dd')
  const currentUserName = user?.name || user?.username || user?.email || ''

 const [showForm, setShowForm] = useState(false)
  const [showHeads, setShowHeads] = useState(false)
  const [heads, setHeads] = useState(['Rent', 'Utilities', 'Wages', 'Salaries', 'Misc'])
  const [newHead, setNewHead] = useState('')
  const [form, setForm] = useState(() => emptyForm(defaultDate, currentUserName))
 const [editingId, setEditingId] = useState('')

 const [startDate, setStartDate] = useState('')
 const [endDate, setEndDate] = useState('')
 const [type, setType] = useState('')
  const [accountFilter, setAccountFilter] = useState('')
  const [methodFilter, setMethodFilter] = useState('')
  const [paidByFilter, setPaidByFilter] = useState('')
 const [minAmt, setMinAmt] = useState('0')
 const [q, setQ] = useState('')

 const [page, setPage] = useState(1)
 const [limit, setLimit] = useState(100)
 const [total, setTotal] = useState(0)
 const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState({ total: 0, count: 0, byCategory: [], byAccountHead: [], byPaymentMethod: [], byPaidBy: [] })

 const totalPages = Math.ceil(total / limit) || 1
 const closedDates = useMemo(() => new Set((state.dayCloses || []).map(d => d.date)), [state.dayCloses])
 const isSelectedDateClosed = closedDates.has(form.date)

  const authHeaders = useMemo(() => ({ ...(token ? { Authorization: `Bearer ${token}` } : {}) }), [token])

  const loadHeads = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/expenses/heads`, { headers: authHeaders })
      const data = await res.json()
      if (Array.isArray(data.heads) && data.heads.length) setHeads(data.heads)
    } catch {}
  }, [API, authHeaders])

  const queryParams = useCallback((pageNum = page) => {
    const params = new URLSearchParams({ page: String(pageNum), limit: String(limit) })
    if (startDate) params.set('from', startDate)
    if (endDate) params.set('to', endDate)
    if (type) params.set('expenseHead', type)
    if (accountFilter) params.set('accountHead', accountFilter)
    if (methodFilter) params.set('paymentMethod', methodFilter)
    if (paidByFilter) params.set('paidBy', paidByFilter)
    if (minAmt) params.set('min', String(minAmt))
    if (q) params.set('q', q)
    return params
  }, [page, limit, startDate, endDate, type, accountFilter, methodFilter, paidByFilter, minAmt, q])

  const reloadExpenses = useCallback(async (pageNum = page) => {
 setLoading(true)
 try {
      const params = queryParams(pageNum)
      const [listRes, sumRes] = await Promise.all([
        fetch(`${API}/api/expenses?${params.toString()}`, { headers: authHeaders }),
        fetch(`${API}/api/expenses/summary?${params.toString()}`, { headers: authHeaders }),
      ])
      const data = await listRes.json()
      const sum = await sumRes.json()
      dispatch({ type: 'HYDRATE', payload: { expenses: (data.rows || []).map(x => ({ ...x, id: x.id || x._id })) } })
 setTotal(data.total || 0)
      setSummary(sum || { total: 0, count: 0, byCategory: [], byAccountHead: [], byPaymentMethod: [], byPaidBy: [] })
    } catch {
      toast.error('Failed to load expenses')
    }
 setLoading(false)
  }, [API, authHeaders, dispatch, page, queryParams])

  useEffect(() => { loadHeads(); reloadExpenses(1) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const openDialog = () => {
    setForm(emptyForm(defaultDate, currentUserName))
    setEditingId('')
    setShowForm(true)
  }
  const closeDialog = () => {
    setShowForm(false)
    setEditingId('')
    setForm(emptyForm(defaultDate, currentUserName))
  }

 const startEdit = (exp) => {
 setForm({
 description: exp.description || '',
      expenseHead: exp.expenseHead || exp.category || heads[0] || 'Misc',
 amount: Number(exp.amount || 0),
      date: exp.date || defaultDate,
      accountHead: exp.accountHead === 'bank' ? 'bank' : 'cash',
      paymentMethod: exp.paymentMethod || 'cash',
      paidBy: exp.paidBy || currentUserName,
      note: exp.note || '',
 })
 setEditingId(exp.id)
 setShowForm(true)
 }

  const submit = async (e) => {
    e.preventDefault()
    if (isSelectedDateClosed) { toast.error('This date is closed.'); return }
    if (!form.amount || Number(form.amount) <= 0) { toast.error('Enter a valid amount'); return }
    if (!form.expenseHead) { toast.error('Select an expense head'); return }
    try {
      const body = JSON.stringify({
        ...form,
        category: form.expenseHead,
        amount: Number(form.amount),
      })
      const url = editingId ? `${API}/api/expenses/${editingId}` : `${API}/api/expenses`
      const method = editingId ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...authHeaders }, body })
      if (!res.ok) throw new Error('Failed')
      toast.success(editingId ? 'Expense updated' : 'Expense saved')
      closeDialog()
      await reloadExpenses(page)
    } catch {
      toast.error('Failed to save expense')
    }
  }

  const remove = async (id) => {
    try {
      const res = await fetch(`${API}/api/expenses/${id}`, { method: 'DELETE', headers: authHeaders })
      if (!res.ok) throw new Error('Failed')
      await reloadExpenses(page)
    } catch {
      toast.error('Failed to delete expense')
    }
  }

  const saveHeads = async (next) => {
    try {
      const res = await fetch(`${API}/api/expenses/heads`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ heads: next }),
      })
      const data = await res.json()
      setHeads(data.heads || next)
      toast.success('Expense heads updated')
    } catch {
      toast.error('Failed to save expense heads')
    }
  }

  const addHead = async (raw, { select = false } = {}) => {
    const h = String(raw || '').trim()
    if (!h) return null
    const existing = heads.find(x => x.toLowerCase() === h.toLowerCase())
    if (existing) {
      if (select) setForm(f => ({ ...f, expenseHead: existing }))
      toast.error('Head already exists')
      return existing
    }
    const next = [...heads, h]
    setNewHead('')
    await saveHeads(next)
    if (select) setForm(f => ({ ...f, expenseHead: h }))
    return h
  }

  const removeHead = async (h) => {
    const next = heads.filter(x => x !== h)
    if (!next.length) { toast.error('Keep at least one head'); return }
    await saveHeads(next)
    if (form.expenseHead === h) setForm(f => ({ ...f, expenseHead: next[0] }))
  }

  const expenses = state.expenses || []
  const onFilter = () => { setPage(1); reloadExpenses(1) }

 const openPrintPreview = async () => {
 try {
 const body =
 reportSummary([
          { label: 'Total amount', amount: `PKR ${Number(summary.total || 0).toLocaleString()}` },
          { label: 'Entries', amount: String(summary.count || 0) },
 ]) +
 reportSec('Expenses') +
 reportTable({
          headers: ['Date', 'Head', 'Account', 'Method', 'Paid By', { t: 'Amount', align: 'r' }, 'Description'],
 numbered: true,
          rows: expenses.map(e => [
            e.date,
            e.expenseHead || e.category,
            e.accountHead === 'bank' ? 'Bank' : 'Cash',
            e.paymentMethod || 'cash',
            e.paidBy || '-',
            { v: Number(e.amount || 0).toLocaleString(), align: 'r' },
            e.description || '-',
          ]),
 })
 const html = wrapReportDoc({
 settings: state?.settings || {},
 title: 'Expenses',
 reportLabel: 'Expense Report',
 reportNo: `Rpt #: EX-${startDate || 'all'}-${endDate || 'all'}`,
 metaLeft: [['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')], ['From', startDate || '...'], ['To', endDate || '...']],
        metaRight: [['Head', type || 'All'], ['Account', accountFilter || 'All']],
 body,
 })
 await previewHtmlReport(html, `Expenses-${exportDateStamp()}.pdf`)
    } catch {
 toast.error('Print preview failed')
 }
 }

 const exportPDF = () => {
 try {
 const doc = new jsPDF('p', 'pt', 'a4')
      doc.setFontSize(14)
      doc.text('Expenses', 40, 32)
 doc.autoTable({
        head: [['Date', 'Head', 'Account', 'Method', 'Paid By', 'Amount', 'Description']],
        body: expenses.map(e => [
          e.date,
          e.expenseHead || e.category,
          e.accountHead === 'bank' ? 'Bank' : 'Cash',
          e.paymentMethod || 'cash',
          e.paidBy || '-',
          Number(e.amount || 0).toLocaleString(),
          e.description || '-',
        ]),
        startY: 48,
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
 })
 doc.save(`expenses_${exportDateStamp()}.pdf`)
    } catch {
      toast.error('PDF export failed')
    }
  }

 const exportCsv = () => {
    window.open(`${API}/api/expenses/export?${queryParams(1).toString()}`, '_blank')
 toast.success('CSV export started')
 }

  return (
    <div className="space-y-6 pb-10">
      <PageHero
        icon={Wallet}
        title="Expenses"
        subtitle="Expense heads · cash/bank accounts · payment tracking"
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setShowHeads(true)} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-blue-700 shadow-lg hover:bg-blue-50">
              <Settings2 className="h-3.5 w-3.5" /> Manage Heads
            </button>
            <button type="button" onClick={() => reloadExpenses(page)} className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white ring-1 ring-white/30 hover:bg-white/25">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button type="button" onClick={openDialog} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-blue-700 shadow-lg hover:bg-blue-50">
              <Plus className="h-3.5 w-3.5" /> Add Expense
            </button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Expenses" value={`PKR ${Number(summary.total || 0).toLocaleString()}`} icon={Wallet} iconColor="bg-rose-500" />
        <StatCard title="Entries" value={String(summary.count || 0)} icon={Tags} iconColor="bg-blue-500" />
        <StatCard title="Cash in Hand" value={`PKR ${Number(summary.byAccountHead?.find(x => x.name === 'Cash in Hand')?.amount || 0).toLocaleString()}`} icon={Wallet} iconColor="bg-emerald-500" />
        <StatCard title="From Bank" value={`PKR ${Number(summary.byAccountHead?.find(x => x.name === 'Bank')?.amount || 0).toLocaleString()}`} icon={Building2} iconColor="bg-indigo-500" />
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm space-y-4">
        <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Filters</div>
        <div className="flex flex-wrap items-end gap-3">
          <button type="button" onClick={openPrintPreview} className={btnPrint}>Print</button>
          <button type="button" onClick={exportPDF} className={btnPdf}>PDF</button>
          <button type="button" onClick={exportCsv} className={btnCsv}>CSV</button>
          <DatePicker label="From" value={startDate} onChange={setStartDate} />
          <DatePicker label="To" value={endDate} onChange={setEndDate} />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Expense Head</label>
            <select value={type} onChange={e => setType(e.target.value)} className="input">
              <option value="">All</option>
              {heads.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Account</label>
            <select value={accountFilter} onChange={e => setAccountFilter(e.target.value)} className="input">
              <option value="">All</option>
              {ACCOUNT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Payment</label>
            <select value={methodFilter} onChange={e => setMethodFilter(e.target.value)} className="input">
              <option value="">All</option>
              {METHOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Paid By</label>
            <input value={paidByFilter} onChange={e => setPaidByFilter(e.target.value)} className="input" placeholder="Name" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Min</label>
            <input type="number" value={minAmt} onChange={e => setMinAmt(e.target.value)} className="input w-24" />
 </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Search</label>
            <input value={q} onChange={e => setQ(e.target.value)} className="input" placeholder="Description, head, payer…" />
 </div>
          <button type="button" onClick={onFilter} className="ui-btn ui-btn-primary">Apply</button>
 </div>
 </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <BreakdownPanel title="By Expense Head" icon={Tags} rows={summary.byCategory} />
        <BreakdownPanel title="By Account Head" icon={Building2} rows={summary.byAccountHead} />
        <BreakdownPanel title="By Payment Method" icon={CreditCard} rows={summary.byPaymentMethod} />
        <BreakdownPanel title="By Paid By" icon={UserRound} rows={summary.byPaidBy} />
 </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <div className="font-bold text-[var(--color-text-primary)]">Expense Entries</div>
          <div className="text-sm font-extrabold text-blue-600">PKR {Number(summary.total || 0).toLocaleString()}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Expense Head</th>
                <th>Account</th>
                <th>Payment</th>
                <th>Paid By</th>
                <th>Description</th>
                <th className="text-right">Amount</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="text-center py-8 text-[var(--color-text-muted)] font-medium">Loading…</td></tr>}
 {!loading && expenses.map(e => (
                <tr key={e.id}>
                  <td className="font-semibold">{e.date || '-'}</td>
                  <td className="font-semibold">{e.expenseHead || e.category}</td>
                  <td>{e.accountHead === 'bank' ? 'Bank' : 'Cash in Hand'}</td>
                  <td>{METHOD_OPTIONS.find(m => m.value === e.paymentMethod)?.label || e.paymentMethod || 'Cash'}</td>
                  <td className="font-semibold">{e.paidBy || e.userName || '-'}</td>
                  <td>{e.description || '-'}</td>
                  <td className="text-right font-extrabold">PKR {Number(e.amount || 0).toLocaleString()}</td>
                  <td className="text-center">
                    <button type="button" onClick={() => startEdit(e)} className="text-blue-600 font-bold mr-3">Edit</button>
                    <button type="button" onClick={() => remove(e.id)} className="text-rose-600 font-bold">Delete</button>
                  </td>
                </tr>
 ))}
 {!loading && expenses.length === 0 && (
                <tr><td colSpan={8} className="text-center py-10 text-[var(--color-text-muted)] font-medium">No expenses match the filters</td></tr>
              )}
            </tbody>
          </table>
        </div>
 {totalPages >= 1 && (
          <div className="p-3 border-t border-[var(--color-border)]">
            <Pagination
              page={page}
              pages={totalPages}
              total={total}
              limit={limit}
              onLimitChange={n => { setLimit(n); setPage(1); reloadExpenses(1) }}
              onPageChange={p => { setPage(p); reloadExpenses(p) }}
              loading={loading}
            />
          </div>
 )}
 </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => { if (e.target === e.currentTarget) closeDialog() }}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-extrabold">{editingId ? 'Edit Expense' : 'Add Expense'}</h3>
              <button type="button" onClick={closeDialog} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
            </div>
            {isSelectedDateClosed && (
              <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 text-sm font-medium px-3 py-2">Selected date is closed.</div>
            )}
            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Date</label>
                  <div className="mt-1"><DatePicker value={form.date} onChange={v => { if (v) setForm({ ...form, date: v }) }} allowClear={false} /></div>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Expense Head</label>
                  <select value={form.expenseHead} onChange={e => setForm({ ...form, expenseHead: e.target.value })} className="input mt-1 w-full">
                    {heads.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Account Head</label>
                  <select
                    value={form.accountHead}
                    onChange={e => {
                      const accountHead = e.target.value
                      setForm({
                        ...form,
                        accountHead,
                        paymentMethod: accountHead === 'bank' && form.paymentMethod === 'cash' ? 'bank_transfer' : form.paymentMethod,
                      })
                    }}
                    className="input mt-1"
                  >
                    {ACCOUNT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Payment Method</label>
                  <select value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })} className="input mt-1">
                    {METHOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Amount (PKR)</label>
                  <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="input mt-1" placeholder="0" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Paid By</label>
                  <input value={form.paidBy} onChange={e => setForm({ ...form, paidBy: e.target.value })} className="input mt-1" placeholder="Who paid?" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Description</label>
                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="input mt-1" placeholder="What was this expense for?" />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Note</label>
                <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="input mt-1" placeholder="Optional" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeDialog} className="ui-btn ui-btn-secondary">Cancel</button>
                <button type="submit" disabled={isSelectedDateClosed} className="ui-btn ui-btn-primary disabled:opacity-50">{editingId ? 'Update' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showHeads && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => { if (e.target === e.currentTarget) setShowHeads(false) }}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-extrabold">Manage Expense Heads</h3>
                <p className="text-xs font-semibold text-[var(--color-text-muted)]">These stay saved — no need to type them again</p>
              </div>
              <button type="button" onClick={() => setShowHeads(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="flex gap-2 mb-4">
              <input
                value={newHead}
                onChange={e => setNewHead(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addHead(newHead) } }}
                className="input"
                placeholder="New head name"
              />
              <button type="button" onClick={() => addHead(newHead)} className="ui-btn ui-btn-primary">Add</button>
            </div>
            <div className="space-y-2 max-h-80 overflow-auto">
              {heads.map(h => (
                <div key={h} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2.5">
                  <span className="font-semibold">{h}</span>
                  <button type="button" onClick={() => removeHead(h)} className="text-rose-600 text-xs font-bold">Remove</button>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setShowHeads(false)} className="ui-btn ui-btn-primary">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
 )
}
