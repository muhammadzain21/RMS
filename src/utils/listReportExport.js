/** Shared toolbar button classes + CSV blob download for list pages. */

export const btnPrint = 'ui-btn ui-btn-print'
export const btnPdf = 'ui-btn ui-btn-pdf'
export const btnCsv = 'ui-btn ui-btn-csv'
export const btnPrimary = 'ui-btn ui-btn-primary'
export const btnSecondary = 'ui-btn ui-btn-secondary'

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
