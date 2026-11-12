import { useEffect, useMemo, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import { format } from 'date-fns'
import {
  Plus, RefreshCw, Wallet, Building2, Tags, Settings2, X, Eye, CheckCircle2, RotateCcw, Trash2, Pencil,
} from 'lucide-react'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import DatePicker from '../../components/DatePicker.jsx'
import Pagination from '../../components/Pagination.jsx'
import PageHero from '../../components/ui/PageHero.jsx'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport, downloadHtmlReport } from '../../utils/reportDoc.js'
import { btnPrint, btnPdf, btnCsv, exportDateStamp } from '../../utils/listReportExport.js'

const ACCOUNT_OPTIONS = [
  { value: 'cash', label: 'Cash in Hand' },
  { value: 'bank', label: 'Bank' },
]

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
]

function headName(h) {
  return typeof h === 'string' ? h : (h?.name || '')
}

function headNames(list) {
  return (list || []).map(headName).filter(Boolean)
}

function displayHeads(exp) {
  if (Array.isArray(exp?.lines) && exp.lines.length) {
    const names = [...new Set(exp.lines.map(l => l.expenseHead).filter(Boolean))]
    if (names.length === 1) return names[0]
    if (names.length > 1) return names.join(', ')
  }
  return exp?.expenseHead || exp?.category || '—'
}

function emptyLine(names) {
  return {
    expenseHead: names[0] || 'Misc',
    description: '',
    amount: '',
  }
}

function emptyForm(date, names) {
  return {
    date,
    accountHead: 'cash',
    lines: [emptyLine(names)],
  }
}

function expenseToForm(exp, names, defaultDate) {
  const lines = Array.isArray(exp.lines) && exp.lines.length
    ? exp.lines.map(l => ({
        expenseHead: l.expenseHead || names[0] || 'Misc',
        description: l.description || '',
        amount: String(Number(l.amount || 0) || ''),
      }))
    : [{
        expenseHead: exp.expenseHead || exp.category || names[0] || 'Misc',
        description: exp.description || '',
        amount: String(Number(exp.amount || 0) || ''),
      }]
  return {
    date: exp.date || defaultDate,
    accountHead: exp.accountHead === 'bank' ? 'bank' : 'cash',
    lines: lines.length ? lines : [emptyLine(names)],
  }
}

function lineTotal(lines) {
  return (lines || []).reduce((a, l) => a + Number(l.amount || 0), 0)
}

function StatCard({ title, value, sub, icon: Icon, iconColor = 'bg-blue-500' }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1.5 min-w-0">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-body)]">{title}</span>
          <div className="text-xl font-extrabold tracking-tight text-[var(--color-text-primary)] truncate">{value}</div>
          {sub ? <div className="text-xs font-semibold text-[var(--color-text-muted)]">{sub}</div> : null}
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

function StatusBadge({ status }) {
  const approved = status === 'approved'
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${approved ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
      {approved ? 'Approved' : 'Pending'}
    </span>
  )
}

export default function ExpenseNew() {
  const { state, dispatch, businessDate } = useData()
  const { token, user } = useAuth()
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
  const defaultDate = businessDate || format(new Date(), 'yyyy-MM-dd')
  const canManage = ['Admin', 'Manager', 'SuperAdmin'].includes(user?.role)

  const [showForm, setShowForm] = useState(false)
  const [showView, setShowView] = useState(null)
  const [showHeads, setShowHeads] = useState(false)
  const [heads, setHeads] = useState([])
  const [newHead, setNewHead] = useState('')
  const [editingHead, setEditingHead] = useState(null)
  const [form, setForm] = useState(() => emptyForm(defaultDate, []))
  const [editingId, setEditingId] = useState('')

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [type, setType] = useState('')
  const [accountFilter, setAccountFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [minAmt, setMinAmt] = useState('0')
  const [q, setQ] = useState('')

  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(100)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState({
    total: 0, count: 0, pendingCount: 0, pendingTotal: 0, approvedCount: 0, approvedTotal: 0,
    byCategory: [], byAccountHead: [], byStatus: [],
  })

  const names = useMemo(() => headNames(heads), [heads])
  const totalPages = Math.ceil(total / limit) || 1
  const closedDates = useMemo(() => new Set((state.dayCloses || []).map(d => d.date)), [state.dayCloses])
  const isSelectedDateClosed = closedDates.has(form.date)
  const formTotal = useMemo(() => lineTotal(form.lines), [form.lines])

  const authHeaders = useMemo(() => ({ ...(token ? { Authorization: `Bearer ${token}` } : {}) }), [token])

  const loadHeads = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/expenses/heads`, { headers: authHeaders })
      const data = await res.json()
      if (Array.isArray(data.heads)) setHeads(data.heads)
    } catch { /* ignore */ }
  }, [API, authHeaders])

  const queryParams = useCallback((pageNum = page) => {
    const params = new URLSearchParams({ page: String(pageNum), limit: String(limit) })
    if (startDate) params.set('from', startDate)
    if (endDate) params.set('to', endDate)
    if (type) params.set('expenseHead', type)
    if (accountFilter) params.set('accountHead', accountFilter)
    if (statusFilter) params.set('status', statusFilter)
    if (minAmt) params.set('min', String(minAmt))
    if (q) params.set('q', q)
    return params
  }, [page, limit, startDate, endDate, type, accountFilter, statusFilter, minAmt, q])

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
      setSummary(sum || {
        total: 0, count: 0, pendingCount: 0, pendingTotal: 0, approvedCount: 0, approvedTotal: 0,
        byCategory: [], byAccountHead: [], byStatus: [],
      })
    } catch {
      toast.error('Failed to load expenses')
    }
    setLoading(false)
  }, [API, authHeaders, dispatch, page, queryParams])

  useEffect(() => { loadHeads(); reloadExpenses(1) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (names.length && !showForm) {
      setForm(f => (f.lines?.[0]?.expenseHead && names.includes(f.lines[0].expenseHead) ? f : emptyForm(f.date || defaultDate, names)))
    }
  }, [names, defaultDate, showForm])

  const openDialog = () => {
    setForm(emptyForm(defaultDate, names))
    setEditingId('')
    setShowForm(true)
  }
  const closeDialog = () => {
    setShowForm(false)
    setEditingId('')
    setForm(emptyForm(defaultDate, names))
  }

  const startEdit = (exp) => {
    setForm(expenseToForm(exp, names, defaultDate))
    setEditingId(exp.id)
    setShowForm(true)
  }

  const setLine = (idx, patch) => {
    setForm(f => ({
      ...f,
      lines: f.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    }))
  }

  const addRow = () => setForm(f => ({ ...f, lines: [...f.lines, emptyLine(names)] }))
  const removeRow = (idx) => setForm(f => ({
    ...f,
    lines: f.lines.length > 1 ? f.lines.filter((_, i) => i !== idx) : f.lines,
  }))

  const submit = async (e) => {
    e.preventDefault()
    if (isSelectedDateClosed) { toast.error('This date is closed.'); return }
    const lines = form.lines
      .map(l => ({
        expenseHead: l.expenseHead,
        description: String(l.description || '').trim(),
        amount: Number(l.amount || 0),
      }))
      .filter(l => l.amount > 0)
    if (!lines.length) { toast.error('Enter at least one line with a positive amount'); return }
    try {
      const body = JSON.stringify({
        date: form.date,
        accountHead: form.accountHead,
        lines,
      })
      const url = editingId ? `${API}/api/expenses/${editingId}` : `${API}/api/expenses`
      const method = editingId ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...authHeaders }, body })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed')
      }
      toast.success(editingId ? 'Expense updated' : 'Expense saved')
      closeDialog()
      await reloadExpenses(page)
    } catch (err) {
      toast.error(err.message || 'Failed to save expense')
    }
  }

  const remove = async (id) => {
    if (!window.confirm('Delete this expense voucher?')) return
    try {
      const res = await fetch(`${API}/api/expenses/${id}`, { method: 'DELETE', headers: authHeaders })
      if (!res.ok) throw new Error('Failed')
      toast.success('Deleted')
      await reloadExpenses(page)
    } catch {
      toast.error('Failed to delete expense')
    }
  }

  const approve = async (id) => {
    try {
      const res = await fetch(`${API}/api/expenses/${id}/approve`, { method: 'POST', headers: authHeaders })
      if (!res.ok) throw new Error('Failed')
      toast.success('Approved')
      await reloadExpenses(page)
    } catch {
      toast.error('Failed to approve')
    }
  }

  const unapprove = async (id) => {
    try {
      const res = await fetch(`${API}/api/expenses/${id}/unapprove`, { method: 'POST', headers: authHeaders })
      if (!res.ok) throw new Error('Failed')
      toast.success('Moved back to pending')
      await reloadExpenses(page)
    } catch {
      toast.error('Failed to unapprove')
    }
  }

  const createHead = async () => {
    const name = String(newHead || '').trim()
    if (!name) return
    try {
      const res = await fetch(`${API}/api/expenses/heads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setNewHead('')
      await loadHeads()
      toast.success('Head added')
    } catch (err) {
      toast.error(err.message || 'Failed to add head')
    }
  }

  const saveHeadRename = async (head) => {
    const name = String(editingHead?.name || '').trim()
    if (!name || name === head.name) { setEditingHead(null); return }
    try {
      const res = await fetch(`${API}/api/expenses/heads/${head.id || head._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setEditingHead(null)
      await loadHeads()
      toast.success('Head updated')
    } catch (err) {
      toast.error(err.message || 'Failed to update head')
    }
  }

  const removeHead = async (head) => {
    try {
      const res = await fetch(`${API}/api/expenses/heads/${head.id || head._id}`, {
        method: 'DELETE',
        headers: authHeaders,
      })
      if (!res.ok) throw new Error('Failed')
      await loadHeads()
      toast.success('Head removed')
    } catch {
      toast.error('Failed to remove head')
    }
  }

  const expenses = state.expenses || []
  const onFilter = () => { setPage(1); reloadExpenses(1) }

  const buildReportHtml = () => {
    const fileName = `Expenses-${exportDateStamp()}.pdf`
    const body =
      reportSummary([
        { label: 'Total amount', amount: `PKR ${Number(summary.total || 0).toLocaleString()}` },
        { label: 'Entries', amount: String(summary.count || 0) },
        { label: 'Pending', amount: String(summary.pendingCount || 0) },
      ]) +
      reportSec('Expenses') +
      reportTable({
        headers: ['Date', 'Head(s)', 'Account', 'Amount', 'Added by', 'Status', 'Description'],
        numbered: true,
        rows: expenses.map(e => [
          e.date,
          displayHeads(e),
          e.accountHead === 'bank' ? 'Bank' : 'Cash',
          { v: Number(e.amount || 0).toLocaleString(), align: 'r' },
          e.userName || '-',
          e.status === 'approved' ? 'Approved' : 'Pending',
          e.description || '-',
        ]),
      })
    const html = wrapReportDoc({
      settings: state?.settings || {},
      title: 'Expenses',
      reportLabel: 'Expense Report',
      reportNo: `Rpt #: EX-${startDate || 'all'}-${endDate || 'all'}`,
      metaLeft: [['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')], ['From', startDate || '...'], ['To', endDate || '...']],
      metaRight: [['Head', type || 'All'], ['Account', accountFilter || 'All'], ['Status', statusFilter || 'All']],
      body,
    })
    return { html, fileName }
  }

  const openPrintPreview = async () => {
    try {
      const { html, fileName } = buildReportHtml()
      await previewHtmlReport(html, fileName)
    } catch {
      toast.error('Print preview failed')
    }
  }

  const exportPDF = async () => {
    try {
      const { html, fileName } = buildReportHtml()
      await downloadHtmlReport(html, fileName)
      toast.success('PDF downloaded')
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
        subtitle="Multi-line vouchers · expense heads · approval workflow"
        actions={
          <div className="flex flex-wrap gap-2">
            {canManage && (
              <button type="button" onClick={() => setShowHeads(true)} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-blue-700 shadow-lg hover:bg-blue-50">
                <Settings2 className="h-3.5 w-3.5" /> Manage Heads
              </button>
            )}
            <button type="button" onClick={() => reloadExpenses(page)} className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white ring-1 ring-white/30 hover:bg-white/25">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            {canManage && (
              <button type="button" onClick={openDialog} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-blue-700 shadow-lg hover:bg-blue-50">
                <Plus className="h-3.5 w-3.5" /> Add Expense
              </button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Expenses" value={`PKR ${Number(summary.total || 0).toLocaleString()}`} sub={`${summary.pendingCount || 0} pending · PKR ${Number(summary.pendingTotal || 0).toLocaleString()}`} icon={Wallet} iconColor="bg-rose-500" />
        <StatCard title="Entries" value={String(summary.count || 0)} sub={`${summary.approvedCount || 0} approved`} icon={Tags} iconColor="bg-blue-500" />
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
              {names.map(h => <option key={h} value={h}>{h}</option>)}
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
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Status</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input">
              {STATUS_OPTIONS.map(o => <option key={o.value || 'all'} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Min</label>
            <input type="number" value={minAmt} onChange={e => setMinAmt(e.target.value)} className="input w-24" />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Search</label>
            <input value={q} onChange={e => setQ(e.target.value)} className="input" placeholder="Description, head, added by…" />
          </div>
          <button type="button" onClick={onFilter} className="ui-btn ui-btn-primary">Apply</button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <BreakdownPanel title="By Expense Head" icon={Tags} rows={summary.byCategory} />
        <BreakdownPanel title="By Account Head" icon={Building2} rows={summary.byAccountHead} />
        <BreakdownPanel title="By Status" icon={CheckCircle2} rows={summary.byStatus} />
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
                <th>Head(s)</th>
                <th>Account</th>
                <th className="text-right">Amount</th>
                <th>Added by</th>
                <th>Status</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="text-center py-8 text-[var(--color-text-muted)] font-medium">Loading…</td></tr>}
              {!loading && expenses.map(e => (
                <tr key={e.id}>
                  <td className="font-semibold">{e.date || '-'}</td>
                  <td className="font-semibold">{displayHeads(e)}</td>
                  <td>{e.accountHead === 'bank' ? 'Bank' : 'Cash in Hand'}</td>
                  <td className="text-right font-extrabold">PKR {Number(e.amount || 0).toLocaleString()}</td>
                  <td className="font-semibold">{e.userName || '-'}</td>
                  <td><StatusBadge status={e.status} /></td>
                  <td className="text-center">
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button type="button" onClick={() => setShowView(e)} className="text-slate-600 font-bold text-xs inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> View</button>
                      {canManage && (
                        <>
                          <button type="button" onClick={() => startEdit(e)} className="text-blue-600 font-bold text-xs inline-flex items-center gap-1"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                          {e.status === 'approved' ? (
                            <button type="button" onClick={() => unapprove(e.id)} className="text-amber-700 font-bold text-xs inline-flex items-center gap-1"><RotateCcw className="h-3.5 w-3.5" /> Unapprove</button>
                          ) : (
                            <button type="button" onClick={() => approve(e.id)} className="text-emerald-700 font-bold text-xs inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Approve</button>
                          )}
                          <button type="button" onClick={() => remove(e.id)} className="text-rose-600 font-bold text-xs inline-flex items-center gap-1"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && expenses.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-[var(--color-text-muted)] font-medium">No expenses match the filters</td></tr>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={ev => { if (ev.target === ev.currentTarget) closeDialog() }}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-extrabold">{editingId ? 'Edit Expense' : 'Add Expense'}</h3>
              <button type="button" onClick={closeDialog} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
            </div>
            {isSelectedDateClosed && (
              <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 text-sm font-medium px-3 py-2">Selected date is closed.</div>
            )}
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Date</label>
                  <div className="mt-1"><DatePicker value={form.date} onChange={v => { if (v) setForm({ ...form, date: v }) }} allowClear={false} /></div>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Account Head</label>
                  <select value={form.accountHead} onChange={e => setForm({ ...form, accountHead: e.target.value })} className="input mt-1 w-full">
                    {ACCOUNT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Line items</span>
                  <button type="button" onClick={addRow} className="text-xs font-bold text-blue-600 inline-flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Add row</button>
                </div>
                <div className="space-y-2">
                  {form.lines.map((line, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-end rounded-lg border border-[var(--color-border)] p-2">
                      <div className="col-span-12 sm:col-span-3">
                        <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)]">Head</label>
                        <select value={line.expenseHead} onChange={e => setLine(idx, { expenseHead: e.target.value })} className="input mt-0.5 w-full text-sm">
                          {names.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                      <div className="col-span-12 sm:col-span-5">
                        <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)]">Description</label>
                        <input value={line.description} onChange={e => setLine(idx, { description: e.target.value })} className="input mt-0.5 w-full text-sm" placeholder="Optional" />
                      </div>
                      <div className="col-span-10 sm:col-span-3">
                        <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)]">Amount</label>
                        <input type="number" value={line.amount} onChange={e => setLine(idx, { amount: e.target.value })} className="input mt-0.5 w-full text-sm" placeholder="0" />
                      </div>
                      <div className="col-span-2 sm:col-span-1 flex justify-end pb-0.5">
                        {form.lines.length > 1 && (
                          <button type="button" onClick={() => removeRow(idx)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg" title="Remove row"><X className="h-4 w-4" /></button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex justify-end text-sm font-extrabold text-[var(--color-text-primary)]">
                  Total: PKR {formTotal.toLocaleString()}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeDialog} className="ui-btn ui-btn-secondary">Cancel</button>
                <button type="submit" disabled={isSelectedDateClosed} className="ui-btn ui-btn-primary disabled:opacity-50">{editingId ? 'Update' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={ev => { if (ev.target === ev.currentTarget) setShowView(null) }}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-extrabold">Expense voucher</h3>
              <button type="button" onClick={() => setShowView(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="space-y-2 text-sm mb-4">
              <div className="flex justify-between gap-2"><span className="text-[var(--color-text-muted)] font-semibold">Date</span><span className="font-bold">{showView.date}</span></div>
              <div className="flex justify-between gap-2"><span className="text-[var(--color-text-muted)] font-semibold">Account</span><span className="font-bold">{showView.accountHead === 'bank' ? 'Bank' : 'Cash in Hand'}</span></div>
              <div className="flex justify-between gap-2"><span className="text-[var(--color-text-muted)] font-semibold">Added by</span><span className="font-bold">{showView.userName || '-'}</span></div>
              <div className="flex justify-between gap-2 items-center"><span className="text-[var(--color-text-muted)] font-semibold">Status</span><StatusBadge status={showView.status} /></div>
              {showView.status === 'approved' && (
                <div className="flex justify-between gap-2"><span className="text-[var(--color-text-muted)] font-semibold">Approved by</span><span className="font-bold">{showView.approvedBy || '-'}{showView.approvedAt ? ` · ${format(new Date(showView.approvedAt), 'yyyy-MM-dd HH:mm')}` : ''}</span></div>
              )}
            </div>
            <table className="tbl text-sm mb-3">
              <thead><tr><th>Head</th><th>Description</th><th className="text-right">Amount</th></tr></thead>
              <tbody>
                {(Array.isArray(showView.lines) && showView.lines.length ? showView.lines : [{ expenseHead: displayHeads(showView), description: showView.description, amount: showView.amount }]).map((l, i) => (
                  <tr key={i}>
                    <td className="font-semibold">{l.expenseHead || '—'}</td>
                    <td>{l.description || '-'}</td>
                    <td className="text-right font-bold">PKR {Number(l.amount || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-right font-extrabold text-base">Total: PKR {Number(showView.amount || 0).toLocaleString()}</div>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setShowView(null)} className="ui-btn ui-btn-primary">Close</button>
            </div>
          </div>
        </div>
      )}

      {showHeads && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={ev => { if (ev.target === ev.currentTarget) setShowHeads(false) }}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-extrabold">Manage Expense Heads</h3>
                <p className="text-xs font-semibold text-[var(--color-text-muted)]">Branch-scoped chart of expense heads</p>
              </div>
              <button type="button" onClick={() => setShowHeads(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="flex gap-2 mb-4">
              <input
                value={newHead}
                onChange={e => setNewHead(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createHead() } }}
                className="input"
                placeholder="New head name"
              />
              <button type="button" onClick={createHead} className="ui-btn ui-btn-primary">Add</button>
            </div>
            <div className="space-y-2 max-h-80 overflow-auto">
              {heads.map(h => {
                const id = h.id || h._id || h.name
                const isEditing = editingHead?.id === id
                return (
                  <div key={id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2.5">
                    {isEditing ? (
                      <input
                        className="input flex-1"
                        value={editingHead.name}
                        onChange={e => setEditingHead({ ...editingHead, name: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveHeadRename(h) } }}
                        autoFocus
                      />
                    ) : (
                      <span className="font-semibold flex-1">{headName(h)}</span>
                    )}
                    <div className="flex gap-2 shrink-0">
                      {isEditing ? (
                        <>
                          <button type="button" onClick={() => saveHeadRename(h)} className="text-emerald-600 text-xs font-bold">Save</button>
                          <button type="button" onClick={() => setEditingHead(null)} className="text-slate-500 text-xs font-bold">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => setEditingHead({ id, name: headName(h) })} className="text-blue-600 text-xs font-bold">Edit</button>
                          <button type="button" onClick={() => removeHead(h)} className="text-rose-600 text-xs font-bold">Delete</button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
              {heads.length === 0 && (
                <div className="text-sm text-[var(--color-text-muted)] py-4 text-center">No heads yet — add one above.</div>
              )}
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
