import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import { useData } from '../../state/DataContext.jsx'
import { toast } from 'react-hot-toast'
import { format } from 'date-fns'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport } from '../../utils/reportDoc.js'

const btnPrint = 'ui-btn ui-btn-print'
const btnPdf = 'ui-btn ui-btn-pdf'
const btnCsv = 'ui-btn ui-btn-csv'
import { CalendarCheck, ShoppingBag, HandCoins, TrendingUp, FileText, ChevronLeft, ChevronRight } from 'lucide-react'

const TABS = [
  { key: 'attendance', label: 'Attendance', icon: CalendarCheck },
  { key: 'purchases', label: 'Purchases', icon: ShoppingBag },
  { key: 'advances', label: 'Advances', icon: HandCoins },
  { key: 'earnings', label: 'Earnings', icon: TrendingUp },
  { key: 'slips', label: 'Salary Slips', icon: FileText },
]

const pkr = (n) => `PKR ${Number(n || 0).toLocaleString()}`
const monthName = (m) => new Date(m + '-01T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

const CHIP = {
  green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  vio: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
}

const Chip = ({ color = 'slate', children }) => (
  <span className={`inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${CHIP[color]}`}>{children}</span>
)

const Stat = ({ label, value, tone = 'text-slate-800 dark:text-slate-100' }) => (
  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 text-center">
    <div className={`text-xl font-extrabold ${tone}`}>{value}</div>
    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">{label}</div>
  </div>
)

const Row = ({ left, right }) => (
  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between gap-3">
    <div className="min-w-0">{left}</div>
    <div className="text-right flex-shrink-0">{right}</div>
  </div>
)

const Empty = ({ text }) => <div className="text-center text-sm text-slate-400 py-14">{text}</div>

export default function MyWorkPage() {
  const { user, token } = useAuth()
  const { state: appState } = useData()
  const API = (typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000'

  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [tab, setTab] = useState('attendance')
  const [data, setData] = useState(null)
  const [state, setState] = useState('loading') // loading | ready | error | unlinked

  useEffect(() => {
    let dead = false
    const load = async () => {
      setState('loading')
      try {
        const res = await fetch(`${API}/api/my/me?month=${month}`, { headers: { Authorization: `Bearer ${token}` } })
        if (dead) return
        if (res.status === 403) { setState('unlinked'); return }
        if (!res.ok) { setState('error'); return }
        setData(await res.json())
        setState('ready')
      } catch { if (!dead) setState('error') }
    }
    load()
    return () => { dead = true }
  }, [month, token, API])

  const shiftMonth = (d) => {
    const [y, m] = month.split('-').map(Number)
    setMonth(new Date(y, m - 1 + d, 1).toISOString().slice(0, 7))
  }

  const inMonth = (rows) => (rows || []).filter(r => String(r.date || '').startsWith(month))

  const tabExport = useMemo(() => {
    if (!data) return { title: 'My Work', tabLabel: tab, summary: [], headers: [], rows: [] }
    const staffName = data.staff?.name || user?.username || 'Staff'
    const tabLabel = TABS.find(t => t.key === tab)?.label || tab
    if (tab === 'attendance') {
      const att = data.attendance || []
      return {
        title: `${staffName} — My Attendance (${month})`,
        tabLabel,
        summary: [
          { label: 'Present', amount: String(att.filter(r => r.status === 'Present').length) },
          { label: 'Late', amount: String(att.filter(r => r.status === 'Late').length) },
          { label: 'Absent', amount: String(att.filter(r => r.status === 'Absent').length) },
        ],
        headers: ['Date', 'Status', 'Check In', 'Check Out', 'Late (min)'],
        rows: att.map(r => [r.date, r.status || '-', r.checkIn || '-', r.checkOut || '-', r.lateMinutes ?? '']),
      }
    }
    if (tab === 'purchases') {
      const purchases = inMonth(data.purchases)
      return {
        title: `${staffName} — My Purchases (${month})`,
        tabLabel,
        summary: [{ label: 'Orders', amount: String(purchases.length) }],
        headers: ['Date', 'Bill', 'Amount (PKR)', 'Status', 'Settlement'],
        rows: purchases.map(r => [
          String(r.date).slice(0, 10), r.billNo || '-', Number(r.amount || 0).toLocaleString(),
          r.status || '-', r.settledVia === 'salary' ? 'Salary deduct' : r.status === 'pending' ? 'Unpaid' : 'Paid',
        ]),
      }
    }
    if (tab === 'advances') {
      const advances = inMonth(data.advances)
      const bal = advances.reduce((x, r) => x + ((r.type || 'issue') === 'issue' ? 1 : -1) * Number(r.amount || 0), 0)
      return {
        title: `${staffName} — My Advances (${month})`,
        tabLabel,
        summary: [{ label: 'Balance', amount: pkr(bal) }],
        headers: ['Date', 'Type', 'Amount (PKR)', 'Notes'],
        rows: advances.map(r => {
          const issue = (r.type || 'issue') === 'issue'
          const label = issue ? 'Advance taken' : r.type === 'payroll_deduct' ? 'Salary deduction' : 'Repayment'
          return [String(r.date).slice(0, 10), label, Number(r.amount || 0).toLocaleString(), r.notes || '-']
        }),
      }
    }
    if (tab === 'earnings') {
      const earnings = inMonth(data.earnings)
      return {
        title: `${staffName} — My Earnings (${month})`,
        tabLabel,
        summary: [{ label: 'Entries', amount: String(earnings.length) }],
        headers: ['Date', 'Category', 'Amount (PKR)', 'Notes'],
        rows: earnings.map(r => [String(r.date).slice(0, 10), r.category || '-', Number(r.amount || 0).toLocaleString(), r.notes || '-']),
      }
    }
    if (tab === 'slips') {
      const slips = data.slips || []
      return {
        title: `${staffName} — My Salary Slips`,
        tabLabel,
        summary: [{ label: 'Slips', amount: String(slips.length) }],
        headers: ['Period', 'Gross (PKR)', 'Net Pay (PKR)', 'Status'],
        rows: slips.map(r => [r.period || month, Number(r.grossPay || 0).toLocaleString(), Number(r.netPay || 0).toLocaleString(), r.status || '-']),
      }
    }
    return { title: `${staffName} — ${tabLabel}`, tabLabel, summary: [], headers: [], rows: [] }
  }, [data, tab, month, user?.username])

  const openPrintPreview = useCallback(async () => {
    if (state !== 'ready') return
    try {
      const body =
        (tabExport.summary.length ? reportSummary(tabExport.summary) : '') +
        reportSec(tabExport.tabLabel) +
        reportTable({
          headers: tabExport.headers,
          numbered: true,
          rows: tabExport.rows,
          emptyText: 'No records for this tab',
        })
      const html = wrapReportDoc({
        settings: appState?.settings || {},
        title: tabExport.title,
        reportLabel: 'My Work',
        reportNo: `Rpt #: MW-${month}`,
        metaLeft: [['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')], ['Month', monthName(month)]],
        metaRight: [['Tab', tabExport.tabLabel], ['Rows', String(tabExport.rows.length)]],
        body,
      })
      await previewHtmlReport(html, `My-Work-${tab}-${month}.pdf`)
      toast.success('Print preview opened')
    } catch {
      toast.error('Print preview failed')
    }
  }, [state, tabExport, appState?.settings, tab, month])

  const exportPDF = useCallback(() => {
    if (state !== 'ready') return
    try {
      const doc = new jsPDF('p', 'pt', 'a4')
      doc.setFontSize(14)
      doc.text(tabExport.title, 40, 32)
      doc.autoTable({
        head: [tabExport.headers],
        body: tabExport.rows,
        startY: 48,
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
        margin: { left: 40, right: 40 },
      })
      doc.save(`my_work_${tab}_${month}.pdf`)
      toast.success('PDF downloaded')
    } catch {
      toast.error('Failed to export PDF')
    }
  }, [state, tabExport, tab, month])

  const exportCSV = useCallback(() => {
    if (state !== 'ready') return
    try {
      const lines = tabExport.rows.map(r =>
        r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
      )
      const blob = new Blob([[tabExport.headers.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `my_work_${tab}_${month}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('CSV exported')
    } catch {
      toast.error('Failed to export CSV')
    }
  }, [state, tabExport, tab, month])

  const content = useMemo(() => {
    if (!data) return null
    const att = data.attendance || []
    const purchases = inMonth(data.purchases)
    const advances = inMonth(data.advances)
    const earnings = inMonth(data.earnings)
    const slips = data.slips || []

    if (tab === 'attendance') {
      const present = att.filter(r => r.status === 'Present').length
      const late = att.filter(r => r.status === 'Late').length
      const absent = att.filter(r => r.status === 'Absent').length
      return (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Stat label="Present" value={present} tone="text-emerald-600" />
            <Stat label="Late" value={late} tone="text-amber-600" />
            <Stat label="Absent" value={absent} tone="text-red-600" />
          </div>
          {att.length === 0 ? <Empty text="No attendance records for this month" /> : (
            <div className="space-y-2">{att.map((r, i) => (
              <Row key={i}
                left={<>
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{r.date}</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {r.checkIn ? `In ${r.checkIn}` : ''}{r.checkOut ? ` · Out ${r.checkOut}` : ''}{r.lateMinutes ? ` · ${r.lateMinutes}m late` : ''}
                  </div>
                </>}
                right={<Chip color={r.status === 'Present' ? 'green' : r.status === 'Late' ? 'amber' : r.status === 'Leave' ? 'blue' : 'red'}>{r.status || '-'}</Chip>}
              />
            ))}</div>
          )}
        </>
      )
    }

    if (tab === 'purchases') {
      const pending = purchases.filter(r => r.status === 'pending')
      const pendTotal = pending.reduce((x, r) => x + Number(r.amount || 0), 0)
      return (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Stat label="Pending" value={pending.length} tone="text-red-600" />
            <Stat label="To Deduct" value={pkr(pendTotal)} tone="text-red-600" />
            <Stat label="Orders" value={purchases.length} />
          </div>
          {purchases.length === 0 ? <Empty text="No staff purchases this month" /> : (
            <div className="space-y-2">{purchases.map((r, i) => (
              <Row key={i}
                left={<>
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{r.billNo || 'Order'}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{String(r.date).slice(0, 10)}</div>
                </>}
                right={<>
                  <div className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{pkr(r.amount)}</div>
                  <Chip color={r.status === 'pending' ? 'red' : r.settledVia === 'salary' ? 'vio' : 'green'}>
                    {r.status === 'pending' ? 'Unpaid' : r.settledVia === 'salary' ? 'Salary deduct' : 'Paid'}
                  </Chip>
                </>}
              />
            ))}</div>
          )}
        </>
      )
    }

    if (tab === 'advances') {
      const bal = advances.reduce((x, r) => x + ((r.type || 'issue') === 'issue' ? 1 : -1) * Number(r.amount || 0), 0)
      return (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Stat label="Balance" value={pkr(bal)} tone={bal > 0 ? 'text-red-600' : 'text-emerald-600'} />
            <Stat label="Taken" value={advances.filter(r => (r.type || 'issue') === 'issue').length} />
            <Stat label="Repaid" value={advances.filter(r => (r.type || 'issue') !== 'issue').length} />
          </div>
          {advances.length === 0 ? <Empty text="No advances this month" /> : (
            <div className="space-y-2">{advances.map((r, i) => {
              const issue = (r.type || 'issue') === 'issue'
              return (
                <Row key={i}
                  left={<>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {issue ? 'Advance taken' : r.type === 'payroll_deduct' ? 'Salary deduction' : 'Repayment'}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{String(r.date).slice(0, 10)}{r.notes ? ` · ${r.notes}` : ''}</div>
                  </>}
                  right={<div className={`text-sm font-extrabold ${issue ? 'text-red-600' : 'text-emerald-600'}`}>{issue ? '+' : '−'}{pkr(r.amount)}</div>}
                />
              )
            })}</div>
          )}
        </>
      )
    }

    if (tab === 'earnings') {
      const income = earnings.filter(r => r.category !== 'Deduction').reduce((x, r) => x + Number(r.amount || 0), 0)
      const deduct = earnings.filter(r => r.category === 'Deduction').reduce((x, r) => x + Number(r.amount || 0), 0)
      return (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Stat label="Earned" value={pkr(income)} tone="text-emerald-600" />
            <Stat label="Deducted" value={pkr(deduct)} tone="text-red-600" />
            <Stat label="Entries" value={earnings.length} />
          </div>
          {earnings.length === 0 ? <Empty text="No earnings entries this month" /> : (
            <div className="space-y-2">{earnings.map((r, i) => {
              const isDed = r.category === 'Deduction'
              return (
                <Row key={i}
                  left={<>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{r.category || 'Earning'}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{String(r.date).slice(0, 10)}{r.notes ? ` · ${r.notes}` : ''}</div>
                  </>}
                  right={<div className={`text-sm font-extrabold ${isDed ? 'text-red-600' : 'text-emerald-600'}`}>{isDed ? '−' : '+'}{pkr(r.amount)}</div>}
                />
              )
            })}</div>
          )}
        </>
      )
    }

    if (tab === 'slips') {
      return slips.length === 0 ? <Empty text="No salary slips yet" /> : (
        <div className="space-y-2">{slips.map((r, i) => (
          <Row key={i}
            left={<>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{monthName(r.period || month)}</div>
              <div className="text-xs text-slate-400 mt-0.5">
                Gross {pkr(r.grossPay)}{r.advanceDeducted ? ` · Adv −${pkr(r.advanceDeducted)}` : ''}{r.purchaseDeducted ? ` · Purchases −${pkr(r.purchaseDeducted)}` : ''}
              </div>
            </>}
            right={<>
              <div className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{pkr(r.netPay)}</div>
              <Chip color={r.status === 'paid' ? 'green' : 'slate'}>{r.status}</Chip>
            </>}
          />
        ))}</div>
      )
    }
    return null
  }, [data, tab, month])

  if (state === 'unlinked') {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6 text-center">
          <div className="text-lg font-bold text-amber-800 dark:text-amber-200 mb-2">No staff record linked</div>
          <p className="text-sm text-amber-700 dark:text-amber-300">
            This account isn't linked to a staff member. Ask your administrator to link it from the Users or Staff page.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-500 to-teal-500 rounded-xl shadow-lg p-5 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold">My Work</h1>
            <p className="text-blue-100 text-sm mt-0.5">
              {data?.staff?.name || user?.username || 'Staff'}{data?.staff?.position ? ` · ${data.staff.position}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => shiftMonth(-1)} className="w-9 h-9 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors">
              <ChevronLeft size={18} />
            </button>
            <div className="px-4 py-2 rounded-lg bg-white/15 text-sm font-bold min-w-[130px] text-center">{monthName(month)}</div>
            <button onClick={() => shiftMonth(1)} className="w-9 h-9 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors">
              <ChevronRight size={18} />
            </button>
            {state === 'ready' && (
              <>
                <button type="button" onClick={openPrintPreview} className={btnPrint}>Print</button>
                <button type="button" onClick={exportPDF} className={btnPdf}>PDF</button>
                <button type="button" onClick={exportCSV} className={btnCsv}>CSV</button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap border transition-colors ${
              tab === t.key
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-blue-300'
            }`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {state === 'loading' ? (
        <div className="py-20 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent" />
          <p className="mt-2 text-sm text-slate-400">Loading your records…</p>
        </div>
      ) : state === 'error' ? (
        <Empty text="Couldn't load your records — check the server connection and retry." />
      ) : content}
    </div>
  )
}
