import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { toast } from 'react-hot-toast'
import {
  RefreshCw, Wallet, Moon, ArrowLeftRight, Receipt,
  TrendingUp, ArrowDownLeft,
  Printer, FileText, ClipboardList, CreditCard, Landmark, Bike, Users,
} from 'lucide-react'
import { useAuth } from '../../state/AuthContext.jsx'
import { useData } from '../../state/DataContext.jsx'
import { useLiveRefresh } from '../../hooks/useLiveRefresh.js'
import DatePicker from '../../components/DatePicker.jsx'
import PageHero from '../../components/ui/PageHero.jsx'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport } from '../../utils/reportDoc.js'
import { THERMAL_SLIP_CSS, PROFESSIONAL_SLIP_CSS, openSlipPreviewDialog } from './printUtils.js'
import OrderViewDialog from './components/OrderViewDialog.jsx'

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
    <div className="relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <span className="block text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-body)]">{title}</span>
          <div className="truncate text-xl sm:text-2xl font-bold tracking-tight text-[var(--color-text-primary)] tabular-nums">{value}</div>
        </div>
        <div className={`grid h-11 w-11 sm:h-12 sm:w-12 shrink-0 place-items-center rounded-xl ${iconColor} text-white shadow-md`}>
          <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
        </div>
      </div>
    </div>
  )
}

/** Responsive detail table — only rendered when rows exist. */
function SectionTable({ title, icon: Icon, headers, rows, footer }) {
  if (!rows || !rows.length) return null
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2 font-semibold text-[var(--color-text-primary)]">
        {Icon ? <Icon className="h-4 w-4 shrink-0 text-blue-500" /> : null}
        <span className="truncate">{title}</span>
        <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {rows.length}
        </span>
      </div>
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              {headers.map(h => (
                <th
                  key={h.key || h.label}
                  className={`px-3 py-2.5 whitespace-nowrap ${h.align === 'r' ? 'text-right' : 'text-left'}`}
                >
                  {h.label}
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
                    className={`px-3 py-2.5 font-semibold text-slate-800 dark:text-slate-100 ${
                      c?.align === 'r' ? 'text-right tabular-nums whitespace-nowrap' : 'whitespace-nowrap'
                    }`}
                    title={typeof (c?.v ?? c) === 'string' ? (c?.v ?? c) : undefined}
                  >
                    {c?.node ?? c?.v ?? c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer ? (
            <tfoot>
              <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/50">
                {footer.map((c, j) => (
                  <td
                    key={j}
                    className={`px-3 py-2.5 font-bold text-slate-900 dark:text-slate-100 ${
                      c?.align === 'r' ? 'text-right tabular-nums whitespace-nowrap' : ''
                    }`}
                  >
                    {c?.v ?? c}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  )
}

const SALE_HEADERS = [
  { key: 'date', label: 'Date' },
  { key: 'bill', label: 'Bill Number' },
  { key: 'cust', label: 'Customer' },
  { key: 'ot', label: 'Order Type' },
  { key: 'table', label: 'Table' },
  { key: 'waiter', label: 'Waiter' },
  { key: 'rider', label: 'Rider' },
  { key: 'saleTotal', label: 'Sale Total', align: 'r' },
  { key: 'net', label: 'Net Amount', align: 'r' },
  { key: 'pm', label: 'Payment Mode' },
  { key: 'status', label: 'Status' },
  { key: 'dd', label: 'Delivery Date' },
  { key: 'actions', label: 'Actions' },
]

function billLabel(r, fallbackDate) {
  if (r?.tokenNo) return `${r.date || fallbackDate || ''}_${r.tokenNo}`
  if (r?.billNo) return String(r.billNo).startsWith('BILL-') ? r.billNo : `BILL-${r.billNo}`
  return '—'
}

function mapSaleRows(list, { date, staff = [], onView } = {}) {
  return (list || []).map(r => {
    const orderType = r.orderType || '—'
    const waiter = orderType === 'Dine-in'
      ? (r.waiterName
        || (r.waiterId ? (staff.find(s => String(s.id) === String(r.waiterId))?.name || '') : '')
        || '—')
      : '—'
    const rider = orderType === 'Delivery' ? (r.riderName || '—') : '—'
    const table = orderType === 'Dine-in' ? (r.tableNo || '—') : '—'
    return [
      r.date || date || timeLabel(r.at),
      billLabel(r, date),
      r.customer || '—',
      orderType,
      table,
      waiter,
      rider,
      { v: `PKR ${money(r.saleTotal ?? r.total)}`, align: 'r' },
      { v: `PKR ${money(r.netAmount ?? r.total)}`, align: 'r' },
      r.paymentMethod || '—',
      {
        v: r.status || 'Paid',
        node: (
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            {r.status || 'Paid'}
          </span>
        ),
      },
      r.deliveryDate || r.date || date || '—',
      {
        v: 'View',
        node: (
          <button
            type="button"
            onClick={() => onView?.(r)}
            className="px-2 py-1 text-xs rounded bg-indigo-500 text-white hover:bg-indigo-600"
            title="View Order Details"
          >
            View
          </button>
        ),
      },
    ]
  })
}

function saleFooter(list) {
  const saleTotal = (list || []).reduce((s, r) => s + Number((r.saleTotal ?? r.total) || 0), 0)
  const netTotal = (list || []).reduce((s, r) => s + Number((r.netAmount ?? r.total) || 0), 0)
  return [
    { v: 'Total' },
    '', '', '', '', '', '',
    { v: `PKR ${money(saleTotal)}`, align: 'r' },
    { v: `PKR ${money(netTotal)}`, align: 'r' },
    '', '', '', '',
  ]
}

export default function MyShift() {
  const { token, user } = useAuth()
  const { businessDate, state } = useData()
  const [date, setDate] = useState(businessDate || format(new Date(), 'yyyy-MM-dd'))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [viewSale, setViewSale] = useState(null)
  const staff = state?.staff || []
  const menu = state?.menu || []

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
  useLiveRefresh(() => load({ quiet: true }))

  const summary = data?.summary || {}
  const tables = data?.tables || {}
  const who = user?.name || user?.username || data?.user?.name || 'User'
  const company = state?.settings?.companyName || 'Restaurant POS'

  // Widgets always visible (day open or closed) — zeros are fine
  const widgets = useMemo(() => ([
    { title: 'Cash opening', value: `PKR ${money(summary.openingCash)}`, icon: Wallet, iconColor: 'bg-sky-500' },
    { title: 'Cash sales', value: `PKR ${money(summary.salesCash)}`, icon: Wallet, iconColor: 'bg-teal-500' },
    { title: 'Card sales', value: `PKR ${money(summary.salesCard)}`, icon: CreditCard, iconColor: 'bg-indigo-500' },
    { title: 'Bank sales', value: `PKR ${money(summary.salesBank)}`, icon: Landmark, iconColor: 'bg-blue-600' },
    { title: 'Foodpanda', value: `PKR ${money(summary.salesFoodpanda)}`, icon: Bike, iconColor: 'bg-pink-500' },
    { title: 'Staff', value: `PKR ${money(summary.salesStaff)}`, icon: Users, iconColor: 'bg-violet-500' },
    { title: 'Pay In', value: `PKR ${money(summary.payIn)}`, icon: ArrowDownLeft, iconColor: 'bg-cyan-500' },
    { title: 'Pay Out', value: `PKR ${money(summary.payOut)}`, icon: Receipt, iconColor: 'bg-rose-500' },
    { title: 'Expenses', value: `PKR ${money(summary.expenses)}`, icon: Receipt, iconColor: 'bg-amber-500' },
    { title: 'Expected drawer', value: `PKR ${money(summary.expectedDrawer)}`, icon: TrendingUp, iconColor: 'bg-slate-700' },
  ]), [summary])

  const onViewSale = useCallback((r) => {
    setViewSale({
      id: r.id,
      date: r.date || date,
      tokenNo: r.tokenNo,
      billNo: r.billNo,
      orderType: r.orderType,
      customer: r.customer,
      tableNo: r.tableNo,
      waiterId: r.waiterId,
      waiterName: r.waiterName,
      riderName: r.riderName,
      paymentMethod: r.paymentMethodRaw || r.paymentMethod,
      total: r.netAmount ?? r.total,
      totalAmount: r.netAmount ?? r.total,
      status: r.status || 'Paid',
    })
  }, [date])

  const sections = useMemo(() => {
    const openings = tables.openings || []
    const cashSales = tables.cashSales || []
    const cardSales = tables.cardSales || []
    const bankSales = tables.bankSales || []
    const foodpandaSales = tables.foodpandaSales || []
    const staffSales = tables.staffSales || []
    const payIn = tables.payIn || []
    const payOut = tables.payOut || []
    const expenses = tables.expenses || []
    const saleOpts = { date, staff, onView: onViewSale }

    return [
      {
        key: 'openings',
        title: 'Cash Opening',
        icon: Wallet,
        headers: [
          { key: 't', label: 'Time', width: '16%' },
          { key: 'u', label: 'User', width: '24%' },
          { key: 'a', label: 'Opening cash', align: 'r', width: '28%' },
          { key: 'n', label: 'Note', width: '32%' },
        ],
        rows: openings.map(r => [
          timeLabel(r.at),
          r.userName || '—',
          { v: `PKR ${money(r.openingCash)}`, align: 'r' },
          r.note || '—',
        ]),
        footer: openings.length ? [
          { v: 'Total' },
          '',
          { v: `PKR ${money(openings.reduce((s, r) => s + Number(r.openingCash || 0), 0))}`, align: 'r' },
          '',
        ] : null,
      },
      {
        key: 'cashSales',
        title: 'Cash Sales',
        icon: Wallet,
        headers: SALE_HEADERS,
        rows: mapSaleRows(cashSales, saleOpts),
        footer: cashSales.length ? saleFooter(cashSales) : null,
      },
      {
        key: 'cardSales',
        title: 'Card Sales',
        icon: CreditCard,
        headers: SALE_HEADERS,
        rows: mapSaleRows(cardSales, saleOpts),
        footer: cardSales.length ? saleFooter(cardSales) : null,
      },
      {
        key: 'bankSales',
        title: 'Bank Sales',
        icon: Landmark,
        headers: SALE_HEADERS,
        rows: mapSaleRows(bankSales, saleOpts),
        footer: bankSales.length ? saleFooter(bankSales) : null,
      },
      {
        key: 'foodpandaSales',
        title: 'Foodpanda Sales',
        icon: Bike,
        headers: SALE_HEADERS,
        rows: mapSaleRows(foodpandaSales, saleOpts),
        footer: foodpandaSales.length ? saleFooter(foodpandaSales) : null,
      },
      {
        key: 'staffSales',
        title: 'Staff Sales',
        icon: Users,
        headers: SALE_HEADERS,
        rows: mapSaleRows(staffSales, saleOpts),
        footer: staffSales.length ? saleFooter(staffSales) : null,
      },
      {
        key: 'payIn',
        title: 'Pay In',
        icon: ArrowDownLeft,
        headers: [
          { key: 't', label: 'Time', width: '12%' },
          { key: 'c', label: 'Category', width: '22%' },
          { key: 'n', label: 'Note', width: '28%' },
          { key: 'u', label: 'User', width: '16%' },
          { key: 'a', label: 'Amount', align: 'r', width: '22%' },
        ],
        rows: payIn.map(r => [
          timeLabel(r.at),
          r.category || '—',
          r.note || '—',
          r.userName || '—',
          { v: `PKR ${money(r.amount)}`, align: 'r' },
        ]),
        footer: payIn.length ? [
          { v: 'Total' }, '', '', '',
          { v: `PKR ${money(payIn.reduce((s, r) => s + Number(r.amount || 0), 0))}`, align: 'r' },
        ] : null,
      },
      {
        key: 'payOut',
        title: 'Pay Out',
        icon: Receipt,
        headers: [
          { key: 't', label: 'Time', width: '12%' },
          { key: 'c', label: 'Category', width: '22%' },
          { key: 'n', label: 'Note', width: '28%' },
          { key: 'u', label: 'User', width: '16%' },
          { key: 'a', label: 'Amount', align: 'r', width: '22%' },
        ],
        rows: payOut.map(r => [
          timeLabel(r.at),
          r.category || '—',
          r.note || '—',
          r.userName || '—',
          { v: `PKR ${money(r.amount)}`, align: 'r' },
        ]),
        footer: payOut.length ? [
          { v: 'Total' }, '', '', '',
          { v: `PKR ${money(payOut.reduce((s, r) => s + Number(r.amount || 0), 0))}`, align: 'r' },
        ] : null,
      },
      {
        key: 'expenses',
        title: 'Expenses',
        icon: Receipt,
        headers: [
          { key: 't', label: 'Time' },
          { key: 'c', label: 'Head' },
          { key: 'n', label: 'Description' },
          { key: 'acc', label: 'Account' },
          { key: 'st', label: 'Status' },
          { key: 'u', label: 'Added by' },
          { key: 'img', label: 'Image' },
          { key: 'a', label: 'Amount', align: 'r' },
        ],
        rows: expenses.map(r => [
          timeLabel(r.at),
          r.expenseHead || r.category || '—',
          r.description || r.note || '—',
          r.accountHead === 'bank' ? 'Bank' : 'Cash',
          {
            v: r.status === 'approved' ? 'Approved' : 'Pending',
            node: (
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {r.status === 'approved' ? 'Approved' : 'Pending'}
              </span>
            ),
          },
          r.userName || '—',
          {
            v: r.imageUrl ? 'Yes' : '—',
            node: r.imageUrl
              ? <img src={r.imageUrl} alt="" className="h-8 w-8 rounded object-cover border" />
              : '—',
          },
          { v: `PKR ${money(r.amount)}`, align: 'r' },
        ]),
        footer: expenses.length ? [
          { v: 'Total' }, '', '', '', '', '', '',
          { v: `PKR ${money(expenses.reduce((s, r) => s + Number(r.amount || 0), 0))}`, align: 'r' },
        ] : null,
      },
    ].filter(s => s.rows.length > 0)
  }, [tables, date, staff, onViewSale])

  const printA4 = async () => {
    if (!data) { toast.error('Nothing to print'); return }
    try {
      const summaryItems = [
        { label: 'Cash opening', amount: `PKR ${money(summary.openingCash)}` },
        { label: 'Cash sales', amount: `PKR ${money(summary.salesCash)}` },
        { label: 'Card sales', amount: `PKR ${money(summary.salesCard)}` },
        { label: 'Bank sales', amount: `PKR ${money(summary.salesBank)}` },
        { label: 'Foodpanda', amount: `PKR ${money(summary.salesFoodpanda)}` },
        { label: 'Staff', amount: `PKR ${money(summary.salesStaff)}` },
        { label: 'Pay In', amount: `PKR ${money(summary.payIn)}` },
        { label: 'Pay Out', amount: `PKR ${money(summary.payOut)}` },
        { label: 'Expenses', amount: `PKR ${money(summary.expenses)}` },
        { label: 'Expected drawer', amount: `PKR ${money(summary.expectedDrawer)}` },
      ]

      const flattenCell = (c) => {
        if (c == null) return ''
        if (typeof c === 'object' && c.v != null) return c.align === 'r' ? { v: c.v, align: 'r' } : c.v
        if (typeof c === 'object' && c.node) return ''
        return c
      }
      let body = reportSummary(summaryItems)
      for (const sec of sections) {
        body += reportSec(`${sec.title} (${sec.rows.length})`)
        body += reportTable({
          headers: sec.headers.map(h => (h.align === 'r' ? { t: h.label, align: 'r' } : h.label)),
          numbered: true,
          rows: sec.rows.map(row => row.map(flattenCell)),
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
          ['Detail tables', String(sections.length)],
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

    const row = (label, value) =>
      `<div class="kvrow"><span>${escapeHtml(label)}</span><span class="v">PKR ${money(value)}</span></div>`

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
      <tr><td>Status</td><td class="val">${escapeHtml(data.dayClosed ? 'Closed' : data.dayOpen ? 'Open' : '—')}</td></tr>
    </tbody></table>
  </div>
  <div class="block">
    <div class="sec">Summary</div>
    ${row('Cash opening', summary.openingCash)}
    ${row('Cash sales', summary.salesCash)}
    ${row('Card sales', summary.salesCard)}
    ${row('Bank sales', summary.salesBank)}
    ${row('Foodpanda', summary.salesFoodpanda)}
    ${row('Staff', summary.salesStaff)}
    ${row('Pay In', summary.payIn)}
    ${row('Pay Out', summary.payOut)}
    ${row('Expenses', summary.expenses)}
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
        <Link to="/sales/day-close" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
          <Moon size={16} /> Day Closing
        </Link>
        <button
          type="button"
          onClick={printA4}
          className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
        >
          <Printer size={16} /> Print
        </button>
        <button
          type="button"
          onClick={printThermalSummary}
          className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
        >
          <FileText size={16} /> Thermal
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
        {widgets.map(w => (
          <StatCard key={w.title} title={w.title} value={w.value} icon={w.icon} iconColor={w.iconColor} />
        ))}
      </div>

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
          footer={sec.footer}
        />
      ))}

      {!loading && !sections.length && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-900">
          No detail entries for this day yet. Summary widgets above stay available whether the day is open or closed.
        </div>
      )}

      <OrderViewDialog
        open={!!viewSale}
        sale={viewSale}
        API={api()}
        token={token}
        menu={menu}
        onClose={() => setViewSale(null)}
      />
    </div>
  )
}
