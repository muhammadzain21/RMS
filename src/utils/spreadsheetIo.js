import * as XLSX from 'xlsx'
import { downloadCsvFile } from './listReportExport.js'

function yesNo(v) {
  if (v === true || v === 1 || v === '1') return 'Yes'
  if (v === false || v === 0 || v === '0') return 'No'
  const s = String(v ?? '').trim().toLowerCase()
  if (['yes', 'y', 'true', 'active'].includes(s)) return 'Yes'
  if (['no', 'n', 'false', 'inactive'].includes(s)) return 'No'
  return s ? 'Yes' : 'No'
}

export function parseBoolCell(v, defaultTrue = true) {
  if (v === undefined || v === null || v === '') return defaultTrue
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  const s = String(v).trim().toLowerCase()
  if (['no', 'n', 'false', '0', 'inactive', 'off'].includes(s)) return false
  if (['yes', 'y', 'true', '1', 'active', 'on'].includes(s)) return true
  return defaultTrue
}

/** Parse .csv / .xlsx / .xls into an array of row objects (first sheet). */
export async function parseSpreadsheetFile(file) {
  if (!file) throw new Error('No file selected')
  const name = String(file.name || '').toLowerCase()
  const buf = await file.arrayBuffer()
  if (name.endsWith('.json')) {
    const text = new TextDecoder().decode(buf)
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) return parsed
    if (Array.isArray(parsed?.items)) return parsed.items
    if (Array.isArray(parsed?.categories)) return parsed.categories
    if (Array.isArray(parsed?.rows)) return parsed.rows
    throw new Error('Unrecognized JSON shape')
  }
  const wb = XLSX.read(buf, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) throw new Error('Spreadsheet is empty')
  const sheet = wb.Sheets[sheetName]
  return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false })
}

export function downloadXlsxFile(filename, sheetName, headers, dataRows) {
  const aoa = [headers, ...dataRows.map(r => headers.map((_, i) => (Array.isArray(r) ? r[i] : r?.[headers[i]]) ?? ''))]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Sheet1')
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
}

export function exportMenuSpreadsheet(format, items = []) {
  const headers = ['Name', 'Category', 'SKU', 'Price', 'Discount %', 'Sort Order', 'Active', 'Description']
  const rows = (items || []).map(i => [
    i.name || '',
    i.category || '',
    i.sku || '',
    Number(i.price ?? 0),
    Number(i.discount ?? 0),
    Number(i.sortOrder ?? 0),
    yesNo(i.active !== false),
    i.description || '',
  ])
  const stamp = new Date().toISOString().slice(0, 10)
  if (format === 'xlsx') {
    downloadXlsxFile(`menu_export_${stamp}.xlsx`, 'Menu', headers, rows)
  } else {
    downloadCsvFile(`menu_export_${stamp}.csv`, headers, rows)
  }
}

export function rowsToMenuImportPayload(rows = []) {
  const items = []
  const catNames = new Set()
  for (const raw of rows) {
    const name = String(raw.Name ?? raw.name ?? '').trim()
    if (!name) continue
    const category = String(raw.Category ?? raw.category ?? '').trim()
    if (category) catNames.add(category)
    items.push({
      name,
      category,
      sku: String(raw.SKU ?? raw.sku ?? '').trim(),
      price: Number(raw.Price ?? raw.price ?? 0) || 0,
      discount: Number(raw['Discount %'] ?? raw.Discount ?? raw.discount ?? 0) || 0,
      sortOrder: Number(raw['Sort Order'] ?? raw.sortOrder ?? raw.Order ?? 0) || 0,
      active: parseBoolCell(raw.Active ?? raw.active, true),
      description: String(raw.Description ?? raw.description ?? '').trim(),
    })
  }
  const categories = [...catNames].map(name => ({ name, showOnPos: true, active: true, sortOrder: 0, discount: 0 }))
  return { items, categories }
}

export function exportCategoriesSpreadsheet(format, categories = []) {
  const headers = ['Name', 'Show on POS', 'Active', 'Sort Order', 'Discount %']
  const rows = (categories || []).map(c => [
    c.name || '',
    yesNo(c.showOnPos !== false),
    yesNo(c.active !== false),
    Number(c.sortOrder ?? 0),
    Number(c.discount ?? 0),
  ])
  const stamp = new Date().toISOString().slice(0, 10)
  if (format === 'xlsx') {
    downloadXlsxFile(`categories_export_${stamp}.xlsx`, 'Categories', headers, rows)
  } else {
    downloadCsvFile(`categories_export_${stamp}.csv`, headers, rows)
  }
}

export function rowsToCategoryImportPayload(rows = []) {
  return (rows || []).map(raw => {
    const name = String(raw.Name ?? raw.name ?? '').trim()
    if (!name) return null
    return {
      name,
      showOnPos: parseBoolCell(raw['Show on POS'] ?? raw.showOnPos ?? raw.ShowOnPos, true),
      active: parseBoolCell(raw.Active ?? raw.active, true),
      sortOrder: Number(raw['Sort Order'] ?? raw.sortOrder ?? raw.Order ?? 0) || 0,
      discount: Number(raw['Discount %'] ?? raw.Discount ?? raw.discount ?? 0) || 0,
    }
  }).filter(Boolean)
}
