import { useEffect, useMemo, useState } from 'react'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { useBranch } from '../../state/BranchContext.jsx'
import DatePicker from '../../components/DatePicker.jsx'
import Pagination from '../../components/Pagination.jsx'
import { btnCsv, btnPdf, btnPrint, downloadCsvFile, exportDateStamp } from '../../utils/listReportExport.js'
import { printReportDoc, downloadReportDoc, reportSummary, reportTable } from '../../utils/reportDoc.js'
import { toast } from 'react-hot-toast'
import { formatDateTime12 } from '../../utils/dateUtils.js'

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
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)

  const typeLabel = useMemo(
    () => reportTypes.find(t => t.id === reportType)?.label || title,
    [reportTypes, reportType, title],
  )

  useEffect(() => {
    setResult({ headers: [], rows: [], summary: [] })
    setSearch('')
    setPage(1)
  }, [reportType])

  const filteredRows = useMemo(() => {
    const rows = result.rows || []
    const q = String(search || '').trim().toLowerCase()
    if (!q) return rows
    return rows.filter(row =>
      (row || []).some(cell => String(cell ?? '').toLowerCase().includes(q)),
    )
  }, [result.rows, search])

  const totalFiltered = filteredRows.length
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize) || 1)

  useEffect(() => {
    setPage(1)
  }, [search, pageSize, result.rows])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, page, pageSize])

  const rangeFrom = totalFiltered === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeTo = Math.min(page * pageSize, totalFiltered)

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
      setPage(1)
    } catch (e) {
      toast.error(e?.message || 'Failed to generate report')
      setResult({ headers: [], rows: [], summary: [] })
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
    downloadCsvFile(`${fileBase}.csv`, result.headers, filteredRows)
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
    body: `${reportSummary(result.summary || [])}${reportTable({ headers: result.headers || [], rows: filteredRows, numbered: true })}`,
    fileName: `${fileBase}.pdf`,
  })

  const onPrint = async () => {
    if (!filteredRows.length && !(result.summary || []).length) {
      toast.error('Generate the report first')
      return
    }
    await printReportDoc(buildDocOpts())
  }

  const onPdf = async () => {
    if (!filteredRows.length && !(result.summary || []).length) {
      toast.error('Generate the report first')
      return
    }
    await downloadReportDoc(buildDocOpts())
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{title}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Pick a report type, date range, then generate.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnPrint} onClick={onPrint}>Print</button>
          <button type="button" className={btnPdf} onClick={onPdf}>PDF</button>
          <button type="button" className={btnCsv} onClick={exportCsv}>CSV</button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1 min-w-[12rem]">
            <label className="text-xs font-semibold text-gray-500">Report Type</label>
            <select
              value={reportType}
              onChange={e => setReportType(e.target.value)}
              className="px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
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
          <div className="flex flex-col gap-1 flex-1 min-w-[12rem]">
            <label className="text-xs font-semibold text-gray-500">Search</label>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter rows…"
              className="px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
          </div>
          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="ui-btn ui-btn-primary px-4 py-2 disabled:opacity-60"
          >
            {loading ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>

      {(result.summary || []).length > 0 && (
        <div className="flex flex-wrap gap-3">
          {result.summary.map((s, i) => (
            <div
              key={i}
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 min-w-[8rem]"
            >
              <div className="text-xs text-gray-500">{s.label}</div>
              <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{s.amount}</div>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">#</th>
              {(result.headers || []).map(h => (
                <th key={h} className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={(result.headers || []).length + 1}
                  className="px-3 py-8 text-center text-gray-400"
                >
                  {loading
                    ? 'Loading…'
                    : (result.rows || []).length === 0
                      ? 'No rows — choose filters and Generate'
                      : 'No rows match search'}
                </td>
              </tr>
            ) : (
              pageRows.map((row, i) => (
                <tr key={`${page}-${i}`} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-3 py-2 text-gray-400">{rangeFrom + i}</td>
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-2 whitespace-nowrap text-gray-800 dark:text-gray-100">{cell}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        pages={totalPages}
        total={totalFiltered}
        limit={pageSize}
        onLimitChange={n => { setPageSize(n); setPage(1) }}
        onPageChange={setPage}
        limitOptions={[50, 100, 200, 500]}
        loading={loading}
      />
    </div>
  )
}
