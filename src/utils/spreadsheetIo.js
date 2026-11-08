import * as XLSX from 'xlsx'
import { downloadCsvFile, exportDateStamp } from './listReportExport.js'

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
  // Keep exact same columns as the import template the client uses
  const headers = ['Item Name', 'Category', 'Price', 'Foodpanda Price', 'Discount %', 'Sort Order', 'Active']
  const rows = (items || []).map(i => [
    i.name || '',
    i.category || '',
    Number(i.price ?? 0),
    Number(i.priceFoodpanda ?? 0),
    Number(i.discount ?? 0),
    Number(i.sortOrder ?? 0),
    yesNo(i.active !== false),
  ])
  const stamp = exportDateStamp()
  if (format === 'xlsx') {
    downloadXlsxFile(`menu_export_${stamp}.xlsx`, 'Menu', headers, rows)
  } else {
    downloadCsvFile(`menu_export_${stamp}.csv`, headers, rows)
  }
}

/** Pick first non-empty cell among possible spreadsheet header aliases. */
function cell(raw, keys) {
  for (const k of keys) {
    if (raw[k] !== undefined && raw[k] !== null && String(raw[k]).trim() !== '') return raw[k]
  }
  // Case-insensitive header match (Excel often varies casing)
  const map = {}
  for (const [k, v] of Object.entries(raw || {})) map[String(k).trim().toLowerCase()] = v
  for (const k of keys) {
    const v = map[String(k).trim().toLowerCase()]
    if (v !== undefined && v !== null && String(v).trim() !== '') return v
  }
  return ''
}

/**
 * Convert spreadsheet rows → { items, categories }.
 * Categories are derived from the Category column so the separate Category
 * collection can be upserted alongside MenuItem in one /api/menu/import call.
 */
export function rowsToMenuImportPayload(rows = []) {
  const items = []
  const catNames = new Set()
  for (const raw of rows) {
    const name = String(cell(raw, ['Item Name', 'Name', 'Item', 'Menu Item', 'Product'])).trim()
    if (!name) continue
    const category = String(cell(raw, ['Category', 'Cat', 'Group'])).trim() || 'Uncategorized'
    catNames.add(category)
    items.push({
      name,
      category,
      price: Number(cell(raw, ['Price', 'Amount', 'Rate']) || 0) || 0,
      priceFoodpanda: Number(cell(raw, ['Foodpanda Price', 'Foodpanda', 'FP Price', 'priceFoodpanda']) || 0) || 0,
      discount: Number(cell(raw, ['Discount %', 'Discount', 'discount']) || 0) || 0,
      sortOrder: Number(cell(raw, ['Sort Order', 'sortOrder', 'Order', 'Sort']) || 0) || 0,
      active: parseBoolCell(cell(raw, ['Active', 'Status']), true),
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
  const stamp = exportDateStamp()
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

/** Same columns as InventoryList CSV export (Status / Total Value ignored on import). */
export const INVENTORY_EXPORT_HEADERS = [
  'Name',
  'Category',
  'Qty',
  'Status',
  'Threshold',
  'Unit',
  'Expiry',
  'Price Per Unit (PKR)',
  'Total Value (PKR)',
  'Supplier',
]

export function exportInventorySpreadsheet(format, items = [], supplierNameOf = () => '') {
  const headers = INVENTORY_EXPORT_HEADERS
  const rows = (items || []).map((i) => {
    const qty = Number(i.qty || 0)
    const threshold = Number(i.lowStock || 5)
    const price = Number(i.price || 0)
    let status = 'In Stock'
    if (qty === 0) status = 'Out of Stock'
    else if (qty <= threshold) status = 'Low Stock'
    return [
      i.name || '',
      i.category || '',
      qty,
      status,
      threshold,
      i.unit || '',
      i.expiry ? String(i.expiry).slice(0, 10) : '',
      price,
      qty * price,
      supplierNameOf(i) || '',
    ]
  })
  const stamp = exportDateStamp()
  if (format === 'xlsx') {
    downloadXlsxFile(`inventory_${stamp}.xlsx`, 'Inventory', headers, rows)
  } else {
    downloadCsvFile(`inventory_${stamp}.csv`, headers, rows)
  }
}

/**
 * Parse inventory export/import rows.
 * Status + Total Value are display-only and ignored.
 * Supplier is matched by name on the server.
 */
export function rowsToInventoryImportPayload(rows = []) {
  const items = []
  for (const raw of rows) {
    const name = String(cell(raw, ['Name', 'Item Name', 'Ingredient', 'Item'])).trim()
    if (!name) continue
    const expiryRaw = String(cell(raw, ['Expiry', 'Expiry Date', 'expiry']) || '').trim()
    let expiry = ''
    if (expiryRaw && expiryRaw !== '-') {
      // Accept yyyy-MM-dd or Excel serial-ish strings already stringified by sheet_to_json
      const m = expiryRaw.match(/^(\d{4}-\d{2}-\d{2})/)
      expiry = m ? m[1] : expiryRaw.slice(0, 10)
    }
    items.push({
      name,
      category: String(cell(raw, ['Category', 'Cat', 'Group']) || '').trim(),
      qty: Number(cell(raw, ['Qty', 'Quantity', 'Stock', 'qty']) || 0) || 0,
      lowStock: Number(cell(raw, ['Threshold', 'Low Stock', 'lowStock', 'Reorder']) || 5) || 0,
      unit: String(cell(raw, ['Unit', 'UOM', 'unit']) || '').trim(),
      expiry,
      price: Number(cell(raw, ['Price Per Unit (PKR)', 'Price/Unit', 'Price', 'price', 'Unit Price']) || 0) || 0,
      supplierName: String(cell(raw, ['Supplier', 'Supplier Name', 'Vendor']) || '').trim(),
    })
  }
  return { items }
}
