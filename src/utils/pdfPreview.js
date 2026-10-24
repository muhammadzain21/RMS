// Shared PDF preview helper.
// Electron -> in-app Chromium PDF viewer via preview:open-pdf IPC (main.cjs).
// Browser  -> blob URL opened in a new tab (built-in PDF viewer).
// Returns true when a preview was opened.

export function sanitizeFileName(s) {
  const clean = String(s || '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  return clean || 'document'
}

export async function openPdfPreview(doc, fileName) {
  const name = /\.pdf$/i.test(String(fileName || ''))
    ? String(fileName)
    : `${fileName || 'document'}.pdf`

  // Electron: real in-app preview window (meaningful window title = file name)
  try {
    if (typeof window !== 'undefined' && window.pdfPreview?.open) {
      const dataUri = doc.output('datauristring')
      const base64 = String(dataUri).split(',')[1] || ''
      const res = await window.pdfPreview.open(base64, name)
      if (res && res.ok) return true
      console.warn('[pdfPreview] Electron open failed:', res && res.error)
    }
  } catch (e) {
    console.warn('[pdfPreview] Electron path failed:', e)
  }

  // Browser: blob URL in a new tab
  try {
    const blobUrl = doc.output('bloburl')
    const w = window.open(String(blobUrl), '_blank')
    if (w) { try { w.focus() } catch {} return true }
  } catch (e) {
    console.warn('[pdfPreview] Blob open failed:', e)
  }
  return false
}
