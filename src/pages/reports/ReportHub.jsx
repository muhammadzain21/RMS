import { useEffect, useMemo, useState } from 'react'
import {
  Banknote,
  Boxes,
  CalendarRange,
  FileSpreadsheet,
  FileText,
  Hash,
  Layers,
  Package,
  Printer,
  RefreshCw,
  Search,
  Sigma,
  TrendingUp,
} from 'lucide-react'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { useBranch } from '../../state/BranchContext.jsx'
import DatePicker from '../../components/DatePicker.jsx'
import { btnCsv, btnPdf, btnPrint, downloadCsvFile, exportDateStamp } from '../../utils/listReportExport.js'
import { printReportDoc, downloadReportDoc, reportSummary, reportTable } from '../../utils/reportDoc.js'
import { computeColumnTotals, formatReportTotal } from './engines/common.js'
import { toast } from 'react-hot-toast'
import { formatDateTime12 } from '../../utils/dateUtils.js'

function Widget({ icon: Icon, label, value, tone = 'slate' }) {
  const tones = {
    slate: 'from-slate-50 to-white border-slate-200 dark:from-slate-900 dark:to-slate-950 dark:border-slate-700',
    blue: 'from-blue-50 to-white border-blue-200 dark:from-blue-950/40 dark:to-slate-950 dark:border-blue-800',
    emerald: 'from-emerald-50 to-white border-emerald-200 dark:from-emerald-950/40 dark:to-slate-950 dark:border-emerald-800',
    amber: 'from-amber-50 to-white border-amber-200 dark:from-amber-950/40 dark:to-slate-950 dark:border-amber-800',
    violet: 'from-violet-50 to-white border-violet-200 dark:from-violet-950/40 dark:to-slate-950 dark:border-violet-800',
  }
  const iconTone = {
    slate: 'bg-slate-900 text-white dark:bg-white dark:text-slate-900',
    blue: 'bg-blue-600 text-white',
    emerald: 'bg-emerald-600 text-white',
    amber: 'bg-amber-500 text-white',
    violet: 'bg-violet-600 text-white',
  }
  return (
    <div className={`rounded-2xl border bg-gradient-to-br px-4 py-3 ${tones[tone] || tones.slate}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconTone[tone] || iconTone.slate}`}>
          <Icon size={16} />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
          <div className="mt-0.5 truncate text-lg font-black tabular-nums text-slate-900 dark:text-white" title={String(value ?? '—')}>
            {value ?? '—'}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ReportHub({
  title,
  reportTypes,
  runReport,
  extraFilters = null,
  defaultType,
}) {
  const { state, businessDate } = useData()
  const { token } = useAuth()
  const { branches = [] } = useBranch() || {}
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
  const today = businessDate || new Date().toLocaleDateString('en-CA')

  const [reportType, setReportType] = useState(defaultType || reportTypes[0]?.id || '')
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [extra, setExtra] = useState({})
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState({ headers: [], rows: [], summary: [] })
  const [search, setSearch] = useState('')
  const [hasGenerated, setHasGenerated] = useState(false)

  const typeLabel = useMemo(
    () => reportTypes.find(t => t.id === reportType)?.label || title,
    [reportTypes, reportType, title],
  )

  useEffect(() => {
    setResult({ headers: [], rows: [], summary: [] })
    setSearch('')
    setHasGenerated(false)
  }, [reportType])

  const filteredRows = useMemo(() => {
    const rows = result.rows || []
    const q = String(search || '').trim().toLowerCase()
    if (!q) return rows
    return rows.filter(row =>
      (Array.isArray(row) ? row : []).some(cell => String(cell ?? '').toLowerCase().includes(q)),
    )
  }, [result.rows, search])

  const columnTotals = useMemo(
    () => computeColumnTotals(result.headers || [], filteredRows),
    [result.headers, filteredRows],
  )

  const totalsDisplay = useMemo(
    () => (result.headers || []).map((h, j) => (
      columnTotals[j] == null ? null : formatReportTotal(h, columnTotals[j])
    )),
    [result.headers, columnTotals],
  )

  const hasColumnTotals = totalsDisplay.some(v => v != null && v !== '')

  const primaryTotal = useMemo(() => {
    const headers = result.headers || []
    let best = null
    headers.forEach((h, j) => {
      if (columnTotals[j] == null) return
      const key = String(h || '').toLowerCase()
      if (/pkr|amount|total|value|spent|sales|cost/.test(key)) {
        best = { label: h, value: formatReportTotal(h, columnTotals[j]) }
      }
    })
    if (best) return best
    for (let j = headers.length - 1; j >= 0; j--) {
      if (columnTotals[j] != null) {
        return { label: headers[j], value: formatReportTotal(headers[j], columnTotals[j]) }
      }
    }
    return null
  }, [result.headers, columnTotals])

  const enrichedSummary = useMemo(() => {
    const base = Array.isArray(result.summary) ? [...result.summary] : []
    const labels = new Set(base.map(s => String(s?.label || '').toLowerCase()))
    if (!labels.has('rows')) {
      base.unshift({ label: 'Rows', amount: String(filteredRows.length) })
    }
    ;(result.headers || []).forEach((h, j) => {
      if (columnTotals[j] == null) return
      const name = String(h || '').trim() || `Col ${j + 1}`
      const key = name.toLowerCase()
      if (labels.has(key) || labels.has(`total ${key}`) || labels.has(`${key} total`)) return
      if (!/pkr|amount|total|value|spent|sales|cost|qty|quantity|bills|visits|deliveries/.test(key)) return
      base.push({ label: `Total ${name}`, amount: formatReportTotal(h, columnTotals[j]) })
      labels.add(`total ${key}`)
    })
    return base
  }, [result.summary, result.headers, filteredRows.length, columnTotals])

  const generate = async () => {
    if (!reportType) return
    setLoading(true)
    try {
      const out = await runReport({
        type: reportType,
        from,
        to,
        API,
        token,
        state,
        branches,
        ...extra,
      })
      setResult(out || { headers: [], rows: [], summary: [] })
      setHasGenerated(true)
    } catch (e) {
      toast.error(e?.message || 'Failed to generate report')
      setResult({ headers: [], rows: [], summary: [] })
      setHasGenerated(true)
    } finally {
      setLoading(false)
    }
  }

  const stamp = exportDateStamp(from, to, businessDate)
  const fileBase = `${String(typeLabel).replace(/\s+/g, '-')}-${stamp}`

  const exportCsv = () => {
    if (!filteredRows.length) {
      toast.error('Generate the report first')
      return
    }
    const rows = [...filteredRows]
    if (hasColumnTotals) {
      rows.push((result.headers || []).map((_, j) => totalsDisplay[j] ?? ''))
    }
    downloadCsvFile(`${fileBase}.csv`, result.headers, rows)
  }

  const buildDocOpts = () => ({
    settings: state.settings || {},
    title: typeLabel,
    tagline: title,
    reportLabel: 'Report',
    reportNo: stamp,
    metaLeft: [
      { label: 'From', value: from },
      { label: 'To', value: to },
      ...(search.trim() ? [{ label: 'Search', value: search.trim() }] : []),
    ],
    metaRight: [
      { label: 'Generated', value: formatDateTime12(new Date()) },
      { label: 'Rows', value: String(filteredRows.length) },
    ],
    body: `${reportSummary(enrichedSummary)}${reportTable({
      headers: result.headers || [],
      rows: filteredRows,
      numbered: true,
      totals: hasColumnTotals ? totalsDisplay : null,
    })}`,
    fileName: `${fileBase}.pdf`,
  })

  const onPrint = async () => {
    if (!filteredRows.length && !enrichedSummary.length) {
      toast.error('Generate the report first')
      return
    }
    try {
      await printReportDoc(buildDocOpts())
    } catch (e) {
      toast.error(e?.message || 'Print failed')
    }
  }

  const onPdf = async () => {
    if (!filteredRows.length && !enrichedSummary.length) {
      toast.error('Generate the report first')
      return
    }
    try {
      await downloadReportDoc(buildDocOpts())
      toast.success('PDF downloaded')
    } catch (e) {
      toast.error(e?.message || 'PDF failed')
    }
  }

  const rangeLabel = from === to ? from : `${from} → ${to}`

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Reports</div>
          <h1 className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{title}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Choose a report, set dates, then generate. Totals show in widgets and the table footer.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${btnPrint} inline-flex items-center gap-1.5`} onClick={onPrint}>
            <Printer size={14} /> Print
          </button>
          <button type="button" className={`${btnPdf} inline-flex items-center gap-1.5`} onClick={onPdf}>
            <FileText size={14} /> PDF
          </button>
          <button type="button" className={`${btnCsv} inline-flex items-center gap-1.5`} onClick={exportCsv}>
            <FileSpreadsheet size={14} /> CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Widget icon={Layers} label="Report" value={typeLabel} tone="blue" />
        <Widget icon={CalendarRange} label="Date range" value={rangeLabel} tone="amber" />
        <Widget icon={Hash} label="Rows" value={hasGenerated ? filteredRows.length.toLocaleString() : '—'} tone="violet" />
        <Widget
          icon={Sigma}
          label={primaryTotal ? `Total · ${primaryTotal.label}` : 'Total'}
          value={hasGenerated ? (primaryTotal?.value || '—') : '—'}
          tone="emerald"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-[14rem] flex-1 flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500">Report type</label>
            <select
              value={reportType}
              onChange={e => setReportType(e.target.value)}
              className="rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold dark:border-slate-600 dark:bg-slate-800"
            >
              {reportTypes.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>
          <DatePicker label="From" value={from} onChange={setFrom} />
          <DatePicker label="To" value={to} onChange={setTo} />
          {typeof extraFilters === 'function'
            ? extraFilters({ extra, setExtra, state, reportType })
            : null}
          <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500">Search in results</label>
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter rows…"
                className="w-full rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="ui-btn ui-btn-primary inline-flex min-h-[42px] items-center gap-2 px-5 disabled:opacity-60"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>

      {enrichedSummary.length > 0 && hasGenerated && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {enrichedSummary.map((s, i) => {
            const label = String(s.label || '')
            const key = label.toLowerCase()
            const tone = (
              /amount|pkr|sales|value|spent|cost|total/.test(key) ? 'emerald'
              : /qty|quantity|items|bills|visits|deliveries/.test(key) ? 'blue'
              : /row|count|lines/.test(key) ? 'violet'
              : (['slate', 'amber', 'blue', 'emerald', 'violet'][i % 5])
            )
            const icon = (
              /amount|pkr|sales|value|spent|cost/.test(key) ? Banknote
              : /qty|quantity/.test(key) ? Package
              : /item|product/.test(key) ? Boxes
              : /row|count|lines|bills/.test(key) ? Hash
              : /total/.test(key) ? TrendingUp
              : Sigma
            )
            return (
              <Widget
                key={`${label}-${i}`}
                icon={icon}
                label={label}
                value={s.amount}
                tone={tone}
              />
            )
          })}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <div className="min-w-0">
            <div className="truncate text-sm font-extrabold text-slate-900 dark:text-white">{typeLabel}</div>
            <div className="text-xs text-slate-500">
              {rangeLabel}
              {hasGenerated ? ` · ${filteredRows.length.toLocaleString()} row${filteredRows.length === 1 ? '' : 's'}` : ''}
            </div>
          </div>
          {hasColumnTotals ? (
            <div className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
              Totals included
            </div>
          ) : null}
        </div>

        <div className="w-full overflow-x-auto">
          <table className="min-w-full table-auto text-sm">
            <thead className="bg-slate-100 dark:bg-slate-800">
              <tr>
                <th className="w-12 px-3 py-2.5 text-center text-[11px] font-bold uppercase tracking-wide text-slate-500">#</th>
                {(result.headers || []).map((h, j) => {
                  const numeric = totalsDisplay[j] != null
                  return (
                    <th
                      key={h}
                      className={`px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-600 whitespace-nowrap dark:text-slate-300 ${
                        numeric ? 'text-right' : 'text-left'
                      }`}
                    >
                      {h}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {!hasGenerated ? (
                <tr>
                  <td
                    colSpan={(result.headers || []).length + 1 || 2}
                    className="px-3 py-14 text-center text-slate-400"
                  >
                    Set filters and click <span className="font-semibold text-slate-600 dark:text-slate-300">Generate</span>
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={(result.headers || []).length + 1}
                    className="px-3 py-14 text-center text-slate-400"
                  >
                    {loading
                      ? 'Loading…'
                      : (result.rows || []).length === 0
                        ? 'No data for this range'
                        : 'No rows match search'}
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, i) => (
                  <tr
                    key={i}
                    className="border-t border-slate-100 odd:bg-white even:bg-slate-50/70 dark:border-slate-800 dark:odd:bg-slate-900 dark:even:bg-slate-950/40"
                  >
                    <td className="w-12 px-3 py-2 text-center text-slate-400 tabular-nums">{i + 1}</td>
                    {(Array.isArray(row) ? row : []).map((cell, j) => {
                      const numeric = totalsDisplay[j] != null
                      return (
                        <td
                          key={j}
                          className={`px-3 py-2 whitespace-nowrap text-slate-800 dark:text-slate-100 ${
                            numeric ? 'text-right tabular-nums font-medium' : 'text-left'
                          }`}
                        >
                          {cell}
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
            {hasGenerated && hasColumnTotals && filteredRows.length > 0 ? (
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-900 text-white dark:border-slate-600 dark:bg-slate-800">
                  <td className="w-12 px-3 py-2.5 text-center text-[11px] font-black uppercase tracking-wide">Σ</td>
                  {(result.headers || []).map((h, j) => {
                    const numeric = totalsDisplay[j] != null
                    return (
                      <td
                        key={`t-${h}-${j}`}
                        className={`px-3 py-2.5 text-sm font-black tabular-nums whitespace-nowrap ${
                          numeric ? 'text-right' : 'text-left'
                        }`}
                      >
                        {totalsDisplay[j] ?? ''}
                      </td>
                    )
                  })}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>
    </div>
  )
}
