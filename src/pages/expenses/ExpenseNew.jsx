import { useEffect, useMemo, useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import { format } from 'date-fns'
import {
  Plus, RefreshCw, Wallet, Building2, Tags, Settings2, X, CheckCircle2, Printer,
} from 'lucide-react'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import DatePicker from '../../components/DatePicker.jsx'
import Pagination from '../../components/Pagination.jsx'
import PageHero from '../../components/ui/PageHero.jsx'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport, downloadHtmlReport, resolveAssetUrl } from '../../utils/reportDoc.js'
import { btnPrint, btnPdf, btnCsv, exportDateStamp } from '../../utils/listReportExport.js'
import { useConfirm } from '../../components/useConfirm.jsx'
import { getExpenseVoucherMeta, printExpenseVoucher } from './expenseVoucherDoc.js'

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

function displayDesc(exp) {
  if (Array.isArray(exp?.lines) && exp.lines.length) {
    const bits = exp.lines.map(l => String(l.description || '').trim()).filter(Boolean)
    if (bits.length) return bits.join(' · ')
  }
  return String(exp?.description || '').trim()
}

function fmtDate(d) {
  const s = String(d || '').trim()
  if (!s) return '—'
  try {
    const dt = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s)
    if (Number.isNaN(dt.getTime())) return s
    return format(dt, 'dd MMM yyyy')
  } catch {
    return s
  }
}

function fmtDateTime(exp) {
  const at = exp?.createdAt || exp?.updatedAt
  if (at) {
    try {
      const dt = new Date(at)
      if (!Number.isNaN(dt.getTime())) return format(dt, 'dd MMM yyyy h:mm a')
    } catch { /* fall through */ }
  }
  return fmtDate(exp?.date)
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve('')
    if (file.size > 4 * 1024 * 1024) {
      reject(new Error('Image must be under 4 MB'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Failed to read image'))
    reader.readAsDataURL(file)
  })
}

function ActionBtn({ label, onClick, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 items-center justify-center rounded-lg border px-2.5 text-xs font-bold tracking-wide transition-colors ${className}`}
    >
      {label}
    </button>
  )
}

function emptyLine(names) {
  return {
    expenseHead: names[0] || 'Misc',
    description: '',
    amount: '',
    imageUrl: '',
  }
}

function emptyForm(date, names) {
  return {
    date,
    accountHead: 'cash',
    lines: [emptyLine(names)],
  }
}

function firstExpenseImage(exp) {
  if (exp?.imageUrl) return exp.imageUrl
  const lines = Array.isArray(exp?.lines) ? exp.lines : []
  return lines.find(l => l?.imageUrl)?.imageUrl || ''
}

function expenseToForm(exp, names, defaultDate) {
  const lines = Array.isArray(exp.lines) && exp.lines.length
    ? exp.lines.map(l => ({
        expenseHead: l.expenseHead || names[0] || 'Misc',
        description: l.description || '',
        amount: String(Number(l.amount || 0) || ''),
        imageUrl: l.imageUrl || '',
      }))
    : [{
        expenseHead: exp.expenseHead || exp.category || names[0] || 'Misc',
        description: exp.description || '',
        amount: String(Number(exp.amount || 0) || ''),
        imageUrl: exp.imageUrl || '',
      }]
  // Legacy voucher-only image: attach to first line if lines have none
  if (exp.imageUrl && lines.length && !lines.some(l => l.imageUrl)) {
    lines[0] = { ...lines[0], imageUrl: exp.imageUrl }
  }
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
  const { confirm, ConfirmDialog } = useConfirm()
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

  const [startDate, setStartDate] = useState(defaultDate)
  const [endDate, setEndDate] = useState(defaultDate)
  const [dateTouched, setDateTouched] = useState(false)
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
  const closedDates = useMemo(
    () => new Set((state.dayCloses || []).map(d => String(d?.date || '').slice(0, 10)).filter(Boolean)),
    [state.dayCloses],
  )
  // New vouchers always post to the current business date; edits keep the voucher date.
  const activeExpenseDate = String(
    (editingId ? (form.date || defaultDate) : defaultDate) || '',
  ).slice(0, 10)
  const daybookOpenForActive = Boolean(
    state?.daybook?.open && String(state?.daybook?.date || '').slice(0, 10) === activeExpenseDate,
  )
  // If the daybook is open for this business date, allow expenses even if client close list is stale.
  const isSelectedDateClosed = Boolean(activeExpenseDate)
    && closedDates.has(activeExpenseDate)
    && !daybookOpenForActive
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

  useEffect(() => { loadHeads() }, [loadHeads])

  // Keep From/To on the current business date until the user changes them.
  useEffect(() => {
    if (dateTouched || !businessDate) return
    setStartDate(businessDate)
    setEndDate(businessDate)
    setPage(1)
  }, [businessDate, dateTouched])

  // Load table whenever the date range (or other filters) settle.
  useEffect(() => {
    if (!startDate || !endDate) return
    reloadExpenses(1)
  }, [startDate, endDate, type, accountFilter, statusFilter, minAmt, q, limit]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (names.length && !showForm) {
      setForm(f => emptyForm(defaultDate, names))
    }
  }, [names, defaultDate, showForm])

  // While Add dialog is open, keep the locked date synced to business date.
  useEffect(() => {
    if (!showForm || editingId || !defaultDate) return
    setForm(f => (f.date === defaultDate ? f : { ...f, date: defaultDate }))
  }, [showForm, editingId, defaultDate])

  const openDialog = () => {
    // New expenses always use the current business date (not editable)
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
    const next = expenseToForm(exp, names, defaultDate)
    // Date stays locked to the voucher's business date / current business date
    next.date = exp.date || defaultDate
    setForm(next)
    setEditingId(exp.id)
    setShowForm(true)
  }

  const onPickLineImage = async (idx, file) => {
    if (!file) return
    try {
      const imageUrl = await readImageFile(file)
      setLine(idx, { imageUrl })
    } catch (err) {
      toast.error(err.message || 'Image upload failed')
    }
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
    if (!activeExpenseDate) { toast.error('Business date is not ready yet.'); return }
    if (isSelectedDateClosed) { toast.error(`Date ${activeExpenseDate} is closed.`); return }
    const lines = form.lines
      .map(l => ({
        expenseHead: l.expenseHead,
        description: String(l.description || '').trim(),
        amount: Number(l.amount || 0),
        imageUrl: String(l.imageUrl || ''),
      }))
      .filter(l => l.amount > 0)
    if (!lines.length) { toast.error('Enter at least one line with a positive amount'); return }
    const imageUrl = lines.find(l => l.imageUrl)?.imageUrl || ''
    try {
      const body = JSON.stringify({
        date: activeExpenseDate,
        accountHead: form.accountHead,
        lines,
        imageUrl,
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
    const ok = await confirm({
      title: 'Delete expense',
      message: 'Delete this expense voucher? This cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmStyle: 'danger',
    })
    if (!ok) return
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
        headers: ['Date / Time', 'Head(s)', 'Account', 'Amount', 'Added by', 'Status', 'Description', 'Image'],
        numbered: true,
        rows: expenses.map(e => [
          fmtDateTime(e),
          displayHeads(e),
          e.accountHead === 'bank' ? 'Bank' : 'Cash',
          { v: Number(e.amount || 0).toLocaleString(), align: 'r' },
          e.userName || '-',
          e.status === 'approved' ? 'Approved' : 'Pending',
          e.description || '-',
          firstExpenseImage(e) ? 'Yes' : '—',
        ]),
      })
    const html = wrapReportDoc({
      settings: state?.settings || {},
      title: 'Expenses',
      reportLabel: 'Expense Report',
      reportNo: `Rpt #: EX-${startDate || 'all'}-${endDate || 'all'}`,
      metaLeft: [['Generated', format(new Date(), 'yyyy-MM-dd h:mm a')], ['From', startDate || '...'], ['To', endDate || '...']],
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
          <DatePicker label="From" value={startDate} onChange={v => { setDateTouched(true); setStartDate(v) }} />
          <DatePicker label="To" value={endDate} onChange={v => { setDateTouched(true); setEndDate(v) }} />
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
                <th>Date / Time</th>
                <th>Head(s)</th>
                <th>Account</th>
                <th>Amount</th>
                <th>Image</th>
                <th>Added by</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="text-center py-8 text-[var(--color-text-muted)] font-medium">Loading…</td></tr>}
              {!loading && expenses.map(e => {
                const desc = displayDesc(e)
                const bank = e.accountHead === 'bank'
                const addedBy = String(e.userName || '').trim()
                return (
                <tr key={e.id}>
                  <td className="whitespace-nowrap font-semibold tabular-nums">{fmtDateTime(e)}</td>
                  <td>
                    <div className="font-semibold text-[var(--color-text-primary)] truncate" title={displayHeads(e)}>{displayHeads(e)}</div>
                    {desc ? <div className="mt-0.5 truncate text-xs font-medium text-[var(--color-text-muted)]" title={desc}>{desc}</div> : null}
                  </td>
                  <td>
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${bank ? 'bg-indigo-100 text-indigo-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {bank ? 'Bank' : 'Cash'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap pr-6 font-extrabold tabular-nums text-[var(--color-text-primary)]">
                    PKR {Number(e.amount || 0).toLocaleString()}
                  </td>
                  <td>
                    {firstExpenseImage(e) ? (
                      <button type="button" onClick={() => setShowView(e)} className="block" title="View image">
                        <img src={firstExpenseImage(e)} alt="Expense" className="h-10 w-10 rounded-lg object-cover border border-[var(--color-border)]" />
                      </button>
                    ) : (
                      <span className="text-xs font-medium text-[var(--color-text-muted)]">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap min-w-[8rem]">
                    {addedBy
                      ? <span className="font-semibold text-[var(--color-text-primary)]">{addedBy}</span>
                      : <span className="font-medium text-[var(--color-text-muted)]">—</span>}
                  </td>
                  <td><StatusBadge status={e.status} /></td>
                  <td>
                    <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                      <ActionBtn label="View" onClick={() => setShowView(e)} className="border-slate-200 text-slate-700 hover:bg-slate-100" />
                      {canManage && (
                        <>
                          <ActionBtn label="Edit" onClick={() => startEdit(e)} className="border-blue-200 text-blue-700 hover:bg-blue-50" />
                          {e.status === 'approved' ? (
                            <ActionBtn label="Unapprove" onClick={() => unapprove(e.id)} className="border-amber-200 text-amber-800 hover:bg-amber-50" />
                          ) : (
                            <ActionBtn label="Approve" onClick={() => approve(e.id)} className="border-emerald-200 text-emerald-800 hover:bg-emerald-50" />
                          )}
                          <ActionBtn label="Delete" onClick={() => remove(e.id)} className="border-rose-200 text-rose-700 hover:bg-rose-50" />
                        </>
                      )}
                    </div>
                  </td>
                </tr>
                )
              })}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={ev => { if (ev.target === ev.currentTarget) closeDialog() }}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-extrabold">{editingId ? 'Edit Expense' : 'Add Expense'}</h3>
              <button type="button" onClick={closeDialog} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
            </div>
            {isSelectedDateClosed && (
              <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 text-sm font-medium px-3 py-2">
                Date {activeExpenseDate} is closed.
              </div>
            )}
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Date</label>
                  <div className="mt-1">
                    <input
                      type="text"
                      readOnly
                      value={activeExpenseDate}
                      className="input w-full bg-slate-50 dark:bg-slate-800/60 cursor-not-allowed"
                      title="Expenses use the current business date"
                    />
                  </div>
                  <p className="mt-1 text-[10px] font-medium text-[var(--color-text-muted)]">Locked to current business date</p>
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
                    <div key={idx} className="rounded-lg border border-[var(--color-border)] p-2 space-y-2">
                      <div className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-12 sm:col-span-3">
                          <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)]">Head</label>
                          <select value={line.expenseHead} onChange={e => setLine(idx, { expenseHead: e.target.value })} className="input mt-0.5 w-full text-sm">
                            {names.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                        <div className="col-span-12 sm:col-span-3">
                          <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)]">Amount</label>
                          <input type="number" value={line.amount} onChange={e => setLine(idx, { amount: e.target.value })} className="input mt-0.5 w-full text-sm" placeholder="0" />
                        </div>
                        <div className="col-span-10 sm:col-span-5">
                          <label className="text-[10px] font-bold uppercase text-[var(--color-text-muted)]">Description</label>
                          <input value={line.description} onChange={e => setLine(idx, { description: e.target.value })} className="input mt-0.5 w-full text-sm" placeholder="Optional" />
                        </div>
                        <div className="col-span-2 sm:col-span-1 flex justify-end pb-0.5">
                          {form.lines.length > 1 && (
                            <button type="button" onClick={() => removeRow(idx)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg" title="Remove row"><X className="h-4 w-4" /></button>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-dashed border-[var(--color-border)]">
                        <span className="text-[10px] font-bold uppercase text-[var(--color-text-muted)]">Row image</span>
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-blue-200 dark:border-blue-800 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/30">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; onPickLineImage(idx, f) }}
                          />
                          {line.imageUrl ? 'Change' : 'Upload'}
                        </label>
                        {line.imageUrl ? (
                          <>
                            <img src={line.imageUrl} alt={`Line ${idx + 1} receipt`} className="h-12 w-12 rounded-lg object-cover border border-[var(--color-border)]" />
                            <button type="button" onClick={() => setLine(idx, { imageUrl: '' })} className="text-xs font-bold text-rose-600">Remove</button>
                          </>
                        ) : (
                          <span className="text-[11px] text-[var(--color-text-muted)]">Optional receipt for this line</span>
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

      {showView && (() => {
        const settings = state?.settings || {}
        const company = settings.companyName || settings.name || 'Restaurant POS'
        const logo = resolveAssetUrl(settings.receiptLogo || settings.logo || settings.logoUrl || '')
        const address = String(settings.address || '').trim()
        const phone = String(settings.phone || '').trim()
        const meta = getExpenseVoucherMeta(showView)
        const managerLine = [
          meta.approvedDate ? `Manager ${meta.approvedDate}` : 'Manager',
          meta.approvedBy ? `Approved By: ${meta.approvedBy}` : 'Approved By:',
        ].join(' / ')
        const printOne = async () => {
          try {
            await printExpenseVoucher(showView, settings)
            toast.success('A4 print preview opened')
          } catch (err) {
            console.error(err)
            toast.error('A4 print failed')
          }
        }
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-3" onClick={ev => { if (ev.target === ev.currentTarget) setShowView(null) }}>
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-6xl h-[96vh] max-h-[96vh] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[var(--color-border)] shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <h3 className="text-lg font-extrabold truncate">View Expense</h3>
                  <StatusBadge status={showView.status} />
                </div>
                <button type="button" onClick={() => setShowView(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
              </div>

              <div className="overflow-y-auto flex-1 p-4 sm:p-8 bg-slate-100 dark:bg-slate-950">
                <div className="mx-auto w-full max-w-[230mm] min-h-full bg-white text-slate-900 shadow-md border border-slate-200 px-6 py-6 sm:px-10 sm:py-9">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start mb-4">
                    <div className="flex gap-3 items-start">
                      {logo ? <img src={logo} alt="" className="h-14 w-14 object-contain shrink-0" onError={e => { e.currentTarget.style.display = 'none' }} /> : null}
                      <div>
                        <div className="text-lg font-extrabold leading-tight">{company}</div>
                        {address ? <div className="text-[11px] text-slate-600 mt-1 max-w-[220px] leading-snug">{address}</div> : null}
                      </div>
                    </div>
                    <div className="text-center text-2xl font-bold pt-1">Expense</div>
                    <div className="text-right text-sm pt-2">{phone ? `Contact # ${phone}` : ''}</div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm mb-4">
                    <div><span className="font-bold">Description:</span> {meta.titleDesc}</div>
                    <div><span className="font-bold">Entity (Contact):</span> {meta.entity || '—'}</div>
                    <div className="sm:text-right"><span className="font-bold">Expense date:</span> {meta.expenseDate}</div>
                  </div>

                  <table className="w-full border-collapse text-sm mb-3">
                    <thead>
                      <tr className="bg-slate-100">
                        <th className="border border-slate-800 px-2 py-1.5 text-center w-14">Sr #</th>
                        <th className="border border-slate-800 px-2 py-1.5 text-left">Description</th>
                        <th className="border border-slate-800 px-2 py-1.5 text-left">Account</th>
                        <th className="border border-slate-800 px-2 py-1.5 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {meta.lines.map((l, i) => (
                        <tr key={i}>
                          <td className="border border-slate-800 px-2 py-1.5 text-center">{i + 1}</td>
                          <td className="border border-slate-800 px-2 py-1.5">{l.description || '—'}</td>
                          <td className="border border-slate-800 px-2 py-1.5">{l.expenseHead || showView.expenseHead || showView.category || '—'}</td>
                          <td className="border border-slate-800 px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{Number(l.amount || 0).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="ml-auto w-56 space-y-1 text-sm mb-8">
                    <div className="flex justify-between gap-4 font-extrabold border-t border-slate-800 pt-2">
                      <span>Total:</span><span className="tabular-nums">{meta.total.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>{meta.paymentLabel}:</span><span className="tabular-nums">{meta.paid.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>Balance:</span><span className="tabular-nums">{meta.balance.toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-xs pt-4">
                    <div>
                      <div className="border-t border-slate-800 pt-1 min-h-[1.25rem]" />
                      <div>{managerLine}</div>
                    </div>
                    <div>
                      <div className="border-t border-slate-800 pt-1 min-h-[1.25rem]" />
                      <div>Admin Signature</div>
                    </div>
                    <div>
                      <div className="border-t border-slate-800 pt-1 min-h-[1.25rem]" />
                      <div>Receiver Signature</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3 border-t border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
                <button type="button" onClick={() => setShowView(null)} className="ui-btn ui-btn-secondary">Close</button>
                {canManage && (
                  <button type="button" onClick={() => { setShowView(null); startEdit(showView) }} className="ui-btn ui-btn-secondary">Edit</button>
                )}
                <button type="button" onClick={printOne} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white hover:bg-slate-800">
                  <Printer className="h-3.5 w-3.5" /> Print A4
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {ConfirmDialog}

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
