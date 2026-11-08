import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { toast } from 'react-hot-toast'
import {
  RefreshCw, Wallet, Moon, ArrowLeftRight, ShoppingCart, Receipt,
  Building2, Calculator, TrendingUp, ArrowDownLeft, ArrowUpRight,
  Printer, FileText, ClipboardList, CreditCard, Landmark, Bike,
} from 'lucide-react'
import { useAuth } from '../../state/AuthContext.jsx'
import { useData } from '../../state/DataContext.jsx'
import { useLiveRefresh } from '../../hooks/useLiveRefresh.js'
import DatePicker from '../../components/DatePicker.jsx'
import PageHero from '../../components/ui/PageHero.jsx'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport } from '../../utils/reportDoc.js'
import { THERMAL_SLIP_CSS, PROFESSIONAL_SLIP_CSS, openSlipPreviewDialog } from './printUtils.js'

function api() {
  return (typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000'
}

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function timeLabel(iso) {
  if (!iso) return '—'
  try {
    return format(new Date(iso), 'HH:mm')
  } catch {
    return String(iso).slice(11, 16) || '—'
  }
}

function StatCard({ title, value, icon: Icon, iconColor = 'bg-blue-500' }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between">
        <div className="min-w-0 space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-body)]">{title}</span>
          <div className="truncate text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">{value}</div>
        </div>
        <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${iconColor} text-white shadow-md`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
      <div className="absolute -bottom-6 -right-6 h-16 w-16 rounded-full bg-slate-50 opacity-50 dark:bg-slate-800" />
    </div>
  )
}

function SectionTable({ title, icon: Icon, headers, rows, emptySkip = true }) {
  if (emptySkip && (!rows || !rows.length)) return null
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2 font-semibold text-[var(--color-text-primary)]">
        {Icon ? <Icon className="h-4 w-4 text-blue-500" /> : null}
        {title}
        <span className="ml-auto text-xs font-bold text-slate-500">{rows.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              {headers.map(h => (
                <th key={h.key || h} className={`px-3 py-2 ${h.align === 'r' ? 'text-right' : 'text-left'}`}>
                  {h.label || h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((cells, i) => (
              <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                {cells.map((c, j) => (
                  <td
                    key={j}
                    className={`px-3 py-2 font-semibold text-slate-800 dark:text-slate-100 ${c?.align === 'r' ? 'text-right tabular-nums' : ''}`}
                  >
                    {c?.v ?? c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function MyShift() {
  const { token, user } = useAuth()
  const { businessDate, state } = useData()
  const [date, setDate] = useState(businessDate || format(new Date(), 'yyyy-MM-dd'))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (businessDate && !date) setDate(businessDate)
  }, [businessDate])

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!token || !date) return
    if (!quiet) setLoading(true)
    try {
      const res = await fetch(`${api()}/api/my-shift?date=${encodeURIComponent(date)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Failed to load day')
      setData(j)
    } catch (e) {
      if (!quiet) {
        toast.error(e.message || 'Could not load My Day')
        setData(null)
      }
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [token, date])

  useEffect(() => { load() }, [load])
  useLiveRefresh(() => load({ quiet: true }), { intervalMs: 8000 })

  const summary = data?.summary || {}
  const tables = data?.tables || {}
  const who = user?.name || user?.username || data?.user?.name || 'User'
  const company = state?.settings?.companyName || 'Restaurant POS'

  const sections = useMemo(() => {
    const openings = tables.openings || []
    const sales = tables.sales || []
    const cashSales = tables.cashSales || []
    const cardSales = tables.cardSales || []
    const bankSales = tables.bankSales || []
    const foodpandaSales = tables.foodpandaSales || []
    const payInOut = tables.payInOut || []
    const expenses = tables.expenses || []
    const supplierPayments = tables.supplierPayments || []

    return [
      {
        key: 'openings',
        title: 'Day Opening',
        icon: Wallet,
        headers: [
          { key: 't', label: 'Time' },
          { key: 'u', label: 'User' },
          { key: 'a', label: 'Opening Cash', align: 'r' },
          { key: 'n', label: 'Note' },
        ],
        rows: openings.map(r => [
          timeLabel(r.at),
          r.userName || '—',
          { v: `PKR ${money(r.openingCash)}`, align: 'r' },
          r.note || '—',
        ]),
        printRows: openings.map(r => [
          timeLabel(r.at),
          r.userName || '—',
          { v: `PKR ${money(r.openingCash)}`, align: 'r' },
          r.note || '—',
        ]),
      },
      {
        key: 'sales',
        title: 'Sales',
        icon: ShoppingCart,
        headers: [
          { key: 't', label: 'Time' },
          { key: 'tok', label: 'Token' },
          { key: 'ot', label: 'Order type' },
          { key: 'pm', label: 'Payment' },
          { key: 'a', label: 'Amount', align: 'r' },
        ],
        rows: sales.map(r => [
          timeLabel(r.at),
          r.tokenNo || r.billNo || '—',
          r.orderType || '—',
          r.paymentMethod || 'cash',
          { v: `PKR ${money(r.total)}`, align: 'r' },
        ]),
      },
      {
        key: 'cashSales',
        title: 'Cash Sales',
        icon: Wallet,
        headers: [
          { key: 't', label: 'Time' },
          { key: 'tok', label: 'Token' },
          { key: 'ot', label: 'Order type' },
          { key: 'a', label: 'Amount', align: 'r' },
        ],
        rows: cashSales.map(r => [
          timeLabel(r.at),
          r.tokenNo || r.billNo || '—',
          r.orderType || '—',
          { v: `PKR ${money(r.total)}`, align: 'r' },
        ]),
      },
      {
        key: 'cardSales',
        title: 'Card Sales',
        icon: CreditCard,
        headers: [
          { key: 't', label: 'Time' },
          { key: 'tok', label: 'Token' },
          { key: 'ot', label: 'Order type' },
          { key: 'a', label: 'Amount', align: 'r' },
        ],
        rows: cardSales.map(r => [
          timeLabel(r.at),
          r.tokenNo || r.billNo || '—',
          r.orderType || '—',
          { v: `PKR ${money(r.total)}`, align: 'r' },
        ]),
      },
      {
        key: 'bankSales',
        title: 'Bank Sales',
        icon: Landmark,
        headers: [
          { key: 't', label: 'Time' },
          { key: 'tok', label: 'Token' },
          { key: 'ot', label: 'Order type' },
          { key: 'a', label: 'Amount', align: 'r' },
        ],
        rows: bankSales.map(r => [
          timeLabel(r.at),
          r.tokenNo || r.billNo || '—',
          r.orderType || '—',
          { v: `PKR ${money(r.total)}`, align: 'r' },
        ]),
      },
      {
        key: 'foodpandaSales',
        title: 'Foodpanda Sales',
        icon: Bike,
        headers: [
          { key: 't', label: 'Time' },
          { key: 'tok', label: 'Token' },
          { key: 'pm', label: 'Payment' },
          { key: 'a', label: 'Amount', align: 'r' },
        ],
        rows: foodpandaSales.map(r => [
          timeLabel(r.at),
          r.tokenNo || r.billNo || '—',
          r.paymentMethod || 'cash',
          { v: `PKR ${money(r.total)}`, align: 'r' },
        ]),
      },
      {
        key: 'payInOut',
        title: 'Pay In / Out',
        icon: ArrowLeftRight,
        headers: [
          { key: 't', label: 'Time' },
          { key: 'ty', label: 'Type' },
          { key: 'c', label: 'Category' },
          { key: 'n', label: 'Note' },
          { key: 'a', label: 'Amount', align: 'r' },
        ],
        rows: payInOut.map(r => [
          timeLabel(r.at),
          r.type,
          r.category || '—',
          r.note || '—',
          { v: `PKR ${money(r.amount)}`, align: 'r' },
        ]),
      },
      {
        key: 'expenses',
        title: 'Expenses',
        icon: Receipt,
        headers: [
          { key: 't', label: 'Time' },
          { key: 'h', label: 'Head' },
          { key: 'd', label: 'Description' },
          { key: 'm', label: 'Method' },
          { key: 'a', label: 'Amount', align: 'r' },
        ],
        rows: expenses.map(r => [
          timeLabel(r.at),
          r.head || '—',
          r.description || '—',
          r.paymentMethod || 'cash',
          { v: `PKR ${money(r.amount)}`, align: 'r' },
        ]),
      },
      {
        key: 'supplierPayments',
        title: 'Supplier Payments',
        icon: Building2,
        headers: [
          { key: 't', label: 'Time' },
          { key: 's', label: 'Supplier' },
          { key: 'm', label: 'Method' },
          { key: 'r', label: 'Reference' },
          { key: 'a', label: 'Amount', align: 'r' },
        ],
        rows: supplierPayments.map(r => [
          timeLabel(r.at),
          r.supplierName || '—',
          r.method || '—',
          r.reference || r.notes || '—',
          { v: `PKR ${money(r.amount)}`, align: 'r' },
        ]),
      },
    ].filter(s => s.rows.length > 0)
  }, [tables])

  const widgets = useMemo(() => {
    const list = [
      { title: 'Opening', value: `PKR ${money(summary.openingCash)}`, icon: Wallet, iconColor: 'bg-sky-500', show: Number(summary.openingCash) > 0 || (tables.openings || []).length > 0 },
      { title: 'Sales', value: `PKR ${money(summary.salesTotal)}`, icon: ShoppingCart, iconColor: 'bg-emerald-500', show: (summary.salesCount || 0) > 0 },
      { title: 'Cash sales', value: `PKR ${money(summary.salesCash)}`, icon: Wallet, iconColor: 'bg-teal-500', show: Number(summary.salesCash) > 0 },
      { title: 'Card sales', value: `PKR ${money(summary.salesCard)}`, icon: CreditCard, iconColor: 'bg-indigo-500', show: Number(summary.salesCard) > 0 },
      { title: 'Bank sales', value: `PKR ${money(summary.salesBank)}`, icon: Landmark, iconColor: 'bg-blue-600', show: Number(summary.salesBank) > 0 },
      { title: 'Foodpanda', value: `PKR ${money(summary.salesFoodpanda)}`, icon: Bike, iconColor: 'bg-pink-500', show: Number(summary.salesFoodpanda) > 0 },
      { title: 'Pay In', value: `PKR ${money(summary.payIn)}`, icon: ArrowDownLeft, iconColor: 'bg-cyan-500', show: Number(summary.payIn) > 0 },
      { title: 'Pay Out', value: `PKR ${money(summary.payOut)}`, icon: ArrowUpRight, iconColor: 'bg-rose-500', show: Number(summary.payOut) > 0 },
      { title: 'Expenses', value: `PKR ${money(summary.expenses)}`, icon: Receipt, iconColor: 'bg-amber-500', show: Number(summary.expenses) > 0 },
      { title: 'Supplier pay', value: `PKR ${money(summary.supplierPayments)}`, icon: Building2, iconColor: 'bg-violet-500', show: Number(summary.supplierPayments) > 0 },
      { title: 'Expected drawer', value: `PKR ${money(summary.expectedDrawer)}`, icon: TrendingUp, iconColor: 'bg-slate-700', show: true },
      { title: 'Transactions', value: String(summary.salesCount || 0), icon: Calculator, iconColor: 'bg-blue-500', show: (summary.salesCount || 0) > 0 },
    ]
    return list.filter(w => w.show)
  }, [summary, tables])

  const printA4 = async () => {
    if (!data || !sections.length) { toast.error('Nothing to print'); return }
    try {
      const summaryItems = [
        Number(summary.openingCash) > 0 || (tables.openings || []).length ? { label: 'Opening', amount: `PKR ${money(summary.openingCash)}` } : null,
        (summary.salesCount || 0) > 0 ? { label: 'Sales total', amount: `PKR ${money(summary.salesTotal)} (${summary.salesCount})` } : null,
        Number(summary.salesCash) > 0 ? { label: 'Cash sales', amount: `PKR ${money(summary.salesCash)}` } : null,
        Number(summary.salesCard) > 0 ? { label: 'Card sales', amount: `PKR ${money(summary.salesCard)}` } : null,
        Number(summary.salesBank) > 0 ? { label: 'Bank sales', amount: `PKR ${money(summary.salesBank)}` } : null,
        Number(summary.salesFoodpanda) > 0 ? { label: 'Foodpanda sales', amount: `PKR ${money(summary.salesFoodpanda)}` } : null,
        Number(summary.payIn) > 0 ? { label: 'Pay In', amount: `PKR ${money(summary.payIn)}` } : null,
        Number(summary.payOut) > 0 ? { label: 'Pay Out', amount: `PKR ${money(summary.payOut)}` } : null,
        Number(summary.expenses) > 0 ? { label: 'Expenses', amount: `PKR ${money(summary.expenses)}` } : null,
        Number(summary.supplierPayments) > 0 ? { label: 'Supplier payments', amount: `PKR ${money(summary.supplierPayments)}` } : null,
        { label: 'Expected drawer', amount: `PKR ${money(summary.expectedDrawer)}` },
      ].filter(Boolean)

      let body = reportSummary(summaryItems)
      for (const sec of sections) {
        body += reportSec(`${sec.title} (${sec.rows.length})`)
        body += reportTable({
          headers: sec.headers.map(h => (h.align === 'r' ? { t: h.label, align: 'r' } : h.label)),
          numbered: true,
          rows: sec.rows,
        })
      }

      const html = wrapReportDoc({
        settings: state?.settings || {},
        title: 'My Day Report',
        reportLabel: 'Day Activity',
        reportNo: `Rpt #: MD-${format(new Date(), 'yyyyMMdd-HHmm')}`,
        metaLeft: [
          ['User', who],
          ['Date', date],
          ['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')],
        ],
        metaRight: [
          ['Day status', data.dayClosed ? 'Closed' : data.dayOpen ? 'Open' : '—'],
          ['Sections', String(sections.length)],
        ],
        body,
      })
      await previewHtmlReport(html, `My-Day-${date}.pdf`)
    } catch {
      toast.error('A4 print failed')
    }
  }

  const printThermalSummary = () => {
    if (!data) { toast.error('Nothing to print'); return }
    const phone = state?.settings?.phone || state?.settings?.contact || ''
    const address = state?.settings?.address || ''
    const logo = state?.settings?.receiptLogo || state?.settings?.logo || state?.settings?.logoUrl || ''

    const row = (label, value, show) => (show ? `<div class="kvrow"><span>${escapeHtml(label)}</span><span class="v">PKR ${money(value)}</span></div>` : '')

    const html = `<!doctype html>
<html><head><meta charset="utf-8" /><title>My Day</title>
<style>${THERMAL_SLIP_CSS}${PROFESSIONAL_SLIP_CSS}
  .kvrow{display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-bottom:1px solid #e5e7eb;font-size:12px;font-weight:700}
  .kvrow .v{text-align:right}
  .big{font-size:14px;font-weight:900;border-top:1px solid #94a3b8;margin-top:4px;padding-top:6px}
  .sec{margin:8px 0 4px;font-size:11px;font-weight:900;letter-spacing:0.04em;text-transform:uppercase}
</style></head><body>
  <div class="brand">
    ${logo ? `<img src="${escapeHtml(logo)}" alt="logo" onerror="this.style.display='none'" />` : ''}
    <div class="brand-name">${escapeHtml(company)}</div>
    ${phone ? `<div class="brand-meta">Contact : ${escapeHtml(phone)}</div>` : ''}
    ${address ? `<div class="brand-meta">${escapeHtml(address)}</div>` : ''}
  </div>
  <div class="chip">My Day Summary</div>
  <div class="block">
    <table class="kvtable"><tbody>
      <tr><td>User</td><td class="val">${escapeHtml(who)}</td></tr>
      <tr><td>Date</td><td class="val">${escapeHtml(date)}</td></tr>
      <tr><td>Printed</td><td class="val">${escapeHtml(format(new Date(), 'yyyy-MM-dd HH:mm'))}</td></tr>
    </tbody></table>
  </div>
  <div class="block">
    <div class="sec">Summary</div>
    ${row('Opening', summary.openingCash, Number(summary.openingCash) > 0 || (tables.openings || []).length > 0)}
    ${row('Sales total', summary.salesTotal, (summary.salesCount || 0) > 0)}
    ${row('Cash sales', summary.salesCash, Number(summary.salesCash) > 0)}
    ${row('Card sales', summary.salesCard, Number(summary.salesCard) > 0)}
    ${row('Bank sales', summary.salesBank, Number(summary.salesBank) > 0)}
    ${row('Foodpanda sales', summary.salesFoodpanda, Number(summary.salesFoodpanda) > 0)}
    ${row('Pay In', summary.payIn, Number(summary.payIn) > 0)}
    ${row('Pay Out', summary.payOut, Number(summary.payOut) > 0)}
    ${row('Expenses', summary.expenses, Number(summary.expenses) > 0)}
    ${row('Supplier pay', summary.supplierPayments, Number(summary.supplierPayments) > 0)}
    <div class="kvrow big"><span>Expected drawer</span><span class="v">PKR ${money(summary.expectedDrawer)}</span></div>
  </div>
  <div class="endline">END OF DAY SUMMARY</div>
</body></html>`
    openSlipPreviewDialog({
      html,
      title: 'My Day · thermal',
      printType: 'bill',
    })
  }

  const heroBtn =
    'inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-bold uppercase tracking-wider transition-all active:scale-95'
  const heroBtnSolid = `${heroBtn} bg-white text-blue-700 shadow-lg hover:bg-blue-50 disabled:opacity-60`
  const heroBtnGhost = `${heroBtn} bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25`

  return (
    <div className="space-y-6 pb-10">
      <PageHero
        title="My Day"
        subtitle={`${who} · ${date}${data?.dayClosed ? ' · Day closed' : data?.dayOpen ? ' · Day open' : ''}`}
        icon={ClipboardList}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative z-20 h-9 w-[11.5rem] rounded-xl bg-white shadow-lg">
              <DatePicker value={date} onChange={v => { if (v) setDate(v) }} allowClear={false} className="h-full w-full gap-0" compact />
            </div>
            <button type="button" onClick={load} disabled={loading} className={heroBtnSolid}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button type="button" onClick={printA4} className={heroBtnGhost}>
              <Printer className="h-3.5 w-3.5" /> Print A4
            </button>
            <button type="button" onClick={printThermalSummary} className={heroBtnGhost}>
              <FileText className="h-3.5 w-3.5" /> Thermal
            </button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Link to="/sales/cash-opening" className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
          <Wallet size={16} /> Day Opening
        </Link>
        <Link to="/sales/pay-in-out" className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100">
          <ArrowLeftRight size={16} /> Pay In/Out
        </Link>
        <Link to="/expenses/new" className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <Receipt size={16} /> Expenses
        </Link>
        <Link to="/sales/day-close" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
          <Moon size={16} /> Day Closing
        </Link>
      </div>

      {widgets.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {widgets.map(w => (
            <StatCard key={w.title} title={w.title} value={w.value} icon={w.icon} iconColor={w.iconColor} />
          ))}
        </div>
      )}

      {loading && (
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-slate-500">Loading day…</div>
      )}

      {!loading && sections.map(sec => (
        <SectionTable
          key={sec.key}
          title={sec.title}
          icon={sec.icon}
          headers={sec.headers}
          rows={sec.rows}
        />
      ))}

      {!loading && !sections.length && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-900">
          No activity for this day yet.
        </div>
      )}
    </div>
  )
}
