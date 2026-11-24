/** Shared toolbar button classes + CSV blob download for list pages. */

export const btnPrint = 'ui-btn ui-btn-print'
export const btnPdf = 'ui-btn ui-btn-pdf'
export const btnCsv = 'ui-btn ui-btn-csv'
export const btnPrimary = 'ui-btn ui-btn-primary'
export const btnSecondary = 'ui-btn ui-btn-secondary'

/**
 * Date stamp for export filenames / report numbers.
 * Prefers explicit candidates (filter dates), then header Business Date, then calendar today.
 */
export function exportDateStamp(...candidates) {
  for (const c of candidates) {
    const s = String(c ?? '').trim().slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  }
  try {
    if (typeof window !== 'undefined') {
      const w = window.__BUSINESS_DATE__ || window.BUSINESS_DATE || ''
      const s = String(w).trim().slice(0, 10)
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
    }
  } catch {}
  try {
    return new Date().toISOString().slice(0, 10)
  } catch {
    return '0000-00-00'
  }
}

export function downloadCsvFile(filename, header, dataRows) {
  const lines = dataRows.map((row) =>
    row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
  )
  const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
