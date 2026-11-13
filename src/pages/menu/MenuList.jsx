import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { useBranch } from '../../state/BranchContext.jsx'
import { useState, useEffect, useMemo, useRef } from 'react'
import { toast } from 'react-hot-toast'
import { useConfirm } from '../../components/useConfirm.jsx'
import Pagination from '../../components/Pagination.jsx'
import { Plus, Copy, ClipboardPaste } from 'lucide-react'
import { format } from 'date-fns'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport, downloadHtmlReport } from '../../utils/reportDoc.js'
import { btnPrint, btnPdf, btnCsv, exportDateStamp } from '../../utils/listReportExport.js'
import { parseSpreadsheetFile, exportMenuSpreadsheet, rowsToMenuImportPayload } from '../../utils/spreadsheetIo.js'
import MenuAddDialog from './MenuAddDialog.jsx'
import MenuEditDialog from './MenuEditDialog.jsx'
import { blankMenuRow } from './menuFormUtils.js'

export default function MenuList() {
 const { state, dispatch } = useData()
 const { token } = useAuth()
 const { activeBranchId, activeBranch } = useBranch()
 const { confirm, ConfirmDialog } = useConfirm()
 const [editRows, setEditRows] = useState([])
 const [editingCategory, setEditingCategory] = useState('')
 const [loading, setLoading] = useState(false)
 const [showAddDialog, setShowAddDialog] = useState(false)
 const [showEditDialog, setShowEditDialog] = useState(false)
 const [multiRows, setMultiRows] = useState([])
 const [page, setPage] = useState(1)
 const [limit, setLimit] = useState(100)
 const [jump, setJump] = useState(1)
 const [search, setSearch] = useState('')
 const [itemTilesPerRow, setItemTilesPerRow] = useState(4)
 const [importing, setImporting] = useState(false)
 // Edit: default ON — save to shared catalog for all branches
 const [applyToAllBranches, setApplyToAllBranches] = useState(true)
 // Add form: checked = shared catalog; unchecked = this branch only
 const [addForAllBranches, setAddForAllBranches] = useState(true)
 // Recipe-style clipboard: copy item(s), paste into another category as new items
 const [copiedItems, setCopiedItems] = useState(null) // { items: [...], sourceLabel }
 const [pasteCategory, setPasteCategory] = useState('')
 const fileInputRef = useRef(null)
 const API = ((typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000')

 const refreshMenu = async () => {
  try {
   const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
   const [menuRes, catRes] = await Promise.all([
    fetch(`${API}/api/menu`, { headers }),
    fetch(`${API}/api/categories`, { headers }),
   ])
   const payload = {}
   if (menuRes.ok) {
    const rows = await menuRes.json()
    payload.menu = (rows || []).map(x => ({ ...x, id: x.id || x._id }))
   }
   if (catRes.ok) {
    const rows = await catRes.json()
    payload.categories = (rows || []).map(x => ({ ...x, id: x.id || x._id }))
   }
   if (Object.keys(payload).length) dispatch({ type: 'HYDRATE', payload })
  } catch {}
 }

 const exportMenuSheet = (format) => {
  try {
   exportMenuSpreadsheet(format, items)
   toast.success(format === 'xlsx' ? 'Excel exported' : 'CSV exported')
  } catch (e) {
   toast.error(e.message || 'Export failed')
  }
 }

 const importMenuFile = async (file) => {
  if (!file) return
  try {
   setImporting(true)
   const rows = await parseSpreadsheetFile(file)
   const payload = rowsToMenuImportPayload(rows)
   if (!payload.items.length) throw new Error('No menu rows found (need a Name column)')
   const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
   const res = await fetch(`${API}/api/menu/import`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
   })
   const j = await res.json().catch(() => ({}))
   if (!res.ok) throw new Error(j.error || 'Import failed')
   await refreshMenu()
   const created = Number(j.categoriesCreated || 0)
   toast.success(
    `Imported ${j.items || 0} menu items` +
    (created ? ` · ${created} new categories created` : ` · ${j.categories || 0} categories linked`) +
    ` (shared for all branches)`
   )
  } catch (e) {
   toast.error(e.message || 'Invalid CSV / Excel file')
  } finally {
   setImporting(false)
  }
 }

 const items = state.menu || []
 const cats = (state.categories || [])
 .filter(c => c.active !== false)
 .sort((a,b)=> String(a.name||'').localeCompare(String(b.name||'')))

 const filteredItems = useMemo(() => {
 const q = search.trim().toLowerCase()
 if (!q) return items
 return items.filter(r =>
 String(r.name||'').toLowerCase().includes(q) ||
 String(r.category||'').toLowerCase().includes(q)
 )
 }, [items, search])

 const pages = Math.ceil(filteredItems.length / limit) || 1
 const paginatedItems = filteredItems.slice((page - 1) * limit, page * limit)

 const snapshotItem = (row) => ({
  name: row.name || '',
  category: row.category || '',
  price: Number(row.price || 0),
  priceFoodpanda: Number(row.priceFoodpanda || 0),
  sortOrder: Number(row.sortOrder || 0),
  active: row.active ?? true,
  imageUrl: row.imageUrl || '',
  discount: Number(row.discount || 0),
  recipe: row.recipe && typeof row.recipe === 'object' ? { ...row.recipe } : undefined,
 })
 const reset = () => {
 setEditRows([])
 setEditingCategory('')
 setApplyToAllBranches(true)
 setMultiRows([])
 setShowAddDialog(false)
 setShowEditDialog(false)
 }

 const copyItem = (row) => {
  setCopiedItems({ items: [snapshotItem(row)], sourceLabel: row.name || 'item' })
  setPasteCategory('')
  toast.success(`Copied “${row.name}” — pick a category and Paste`)
 }

 const copyCategoryItems = (categoryName) => {
  const cat = String(categoryName || '').trim()
  if (!cat) { toast.error('No category on this item'); return }
  const rows = items.filter((r) => String(r.category || '') === cat)
  if (!rows.length) { toast.error('No items in this category'); return }
  setCopiedItems({ items: rows.map(snapshotItem), sourceLabel: `${cat} (${rows.length})` })
  setPasteCategory('')
  toast.success(`Copied ${rows.length} item${rows.length > 1 ? 's' : ''} from “${cat}”`)
 }

 /** Open Add dialog with clipboard rows so user can review / edit before saving */
 const pasteAsNewIntoAddDialog = () => {
  if (!copiedItems?.items?.length) { toast.error('Copy an item or category first'); return }
  const target = String(pasteCategory || '').trim()
  if (!target) { toast.error('Select a category to paste into'); return }
  setAddForAllBranches(true)
  setMultiRows(copiedItems.items.map((src) => ({
   ...snapshotItem(src),
   category: target,
  })))
  setShowEditDialog(false)
  setShowAddDialog(true)
  toast.success(`Ready to paste into “${target}” — review and tap Add All Items`)
 }
 const onEdit = (row) => {
  const cat = String(row.category || '').trim()
  const peers = cat
   ? items.filter((r) => String(r.category || '') === cat)
   : [row]
  const sorted = [...peers].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(a.name || '').localeCompare(String(b.name || '')))
  setEditingCategory(cat || '(No category)')
  setEditRows(sorted.map((r) => ({
   id: r.id,
   ...snapshotItem(r),
   isShared: !!r.isShared && !r.isBranchOnly,
  })))
  setApplyToAllBranches(true)
  setShowAddDialog(false)
  setShowEditDialog(true)
 }
 const onAdd = () => {
 setAddForAllBranches(true)
 setMultiRows([blankMenuRow(), blankMenuRow(), blankMenuRow()])
 setShowEditDialog(false)
 setShowAddDialog(true)
 }

 const onSubmit = async (e) => {
 e.preventDefault()
 if (showEditDialog) {
 const validRows = editRows.filter((r) => r.name?.trim() && r.id)
 if (!validRows.length) { toast.error('At least one item name is required'); return }
 try {
  setLoading(true)
  const headers = {
   'Content-Type': 'application/json',
   ...(token ? { Authorization: `Bearer ${token}` } : {}),
   ...(activeBranchId ? { 'X-Branch-Id': String(activeBranchId) } : {}),
  }
  let ok = 0, fail = 0
  for (const row of validRows) {
   const payload = {
    name: row.name,
    category: row.category || '',
    price: Number(row.price || 0),
    priceFoodpanda: Number(row.priceFoodpanda || 0),
    sortOrder: Number(row.sortOrder || 0),
    imageUrl: row.imageUrl || '',
    discount: Number(row.discount || 0),
    active: row.active ?? true,
    ...(applyToAllBranches ? { editShared: true } : {}),
   }
   try {
    const res = await fetch(`${API}/api/menu/${row.id}`, { method: 'PATCH', headers, body: JSON.stringify(payload) })
    if (res.ok) {
     const updated = await res.json().catch(() => null)
     if (updated) dispatch({ type: 'UPDATE_MENU', payload: { id: row.id, data: { ...updated, id: updated.id || updated._id || row.id } } })
     ok++
    } else fail++
   } catch { fail++ }
  }
  if (ok && !fail) toast.success(applyToAllBranches ? `Updated ${ok} shared item${ok > 1 ? 's' : ''} (all branches)` : `Updated ${ok} item${ok > 1 ? 's' : ''} for ${activeBranch?.name || 'this branch'}`)
  else if (ok && fail) toast.success(`${ok} updated, ${fail} failed`)
  else toast.error('Update failed')
  await refreshMenu()
 } catch {
  toast.error('Network error.')
 } finally {
  setLoading(false)
  reset()
 }
 } else {
 const validRows = multiRows.filter(r => r.name?.trim())
 if (!validRows.length) { toast.error('At least one item name is required'); return }
 try {
 setLoading(true)
 const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
 let ok = 0, fail = 0
 for (const row of validRows) {
 const payload = {
  ...row,
  price: Number(row.price||0),
  priceFoodpanda: Number(row.priceFoodpanda||0),
  sortOrder: Number(row.sortOrder||0),
  imageUrl: row.imageUrl || '',
  discount: Number(row.discount||0),
  ...(addForAllBranches ? { editShared: true } : { branchOnly: true }),
 }
 try {
 const res = await fetch(`${API}/api/menu`, { method:'POST', headers, body: JSON.stringify(payload) })
 if (res.ok) {
 const created = await res.json()
 dispatch({ type:'ADD_MENU', payload: { ...created, id: created._id || created.id } })
 ok++
 } else { fail++ }
 } catch { fail++ }
 }
 if (ok && !fail) toast.success(`${ok} menu item${ok>1?'s':''} added`)
 else if (ok && fail) toast.success(`${ok} added, ${fail} failed`)
 else toast.error('Failed to add items')
 await refreshMenu()
 } catch {
 toast.error('Network error.')
 } finally {
 setLoading(false)
 reset()
 }
 }
 }

 const resetOverride = async (row) => {
  if (!row?.hasOverride) return
  const confirmed = await confirm({ title: 'Reset branch override', message: 'Restore this item to the shared catalog values for this branch?' })
  if (!confirmed) return
  try {
   setLoading(true)
   const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
   const res = await fetch(`${API}/api/menu/${row.id}/override`, { method: 'DELETE', headers })
   if (!res.ok) throw new Error('Failed')
   toast.success('Override cleared — using shared values again')
   await refreshMenu()
  } catch {
   toast.error('Failed to reset override')
  } finally {
   setLoading(false)
  }
 }

 // Fetch menu for active branch / shared scope
 useEffect(() => {
 refreshMenu()
 const loadTiles = async () => {
  try {
   const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
   const sres = await fetch(`${API}/api/settings`, { headers })
   if (sres.ok) {
    const s = await sres.json()
    setItemTilesPerRow(Number(s.posItemTilesPerRow || 4))
   }
  } catch {}
 }
 loadTiles()
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [token, activeBranchId])

 const buildReportHtml = () => {
 const fileName = `Menu-List-${exportDateStamp()}.pdf`
 const body =
 reportSummary([
 { label: 'Menu items', amount: String(filteredItems.length) },
 { label: 'Active', amount: String(filteredItems.filter(i => i.active !== false).length) },
 ]) +
 reportSec(`Menu items (${filteredItems.length})`) +
 reportTable({
 headers: [{ t: 'Order', align: 'r' }, 'Name', 'Category', { t: 'Price (PKR)', align: 'r' }, { t: 'Discount %', align: 'r' }, 'Active'],
 numbered: true,
 rows: filteredItems.map(r => [
 { v: Number(r.sortOrder || 0), align: 'r' },
 r.name,
 r.category || '-',
 { v: Number(r.price || 0).toLocaleString(), align: 'r' },
 { v: Number(r.discount || 0), align: 'r' },
 r.active !== false ? 'Yes' : 'No',
 ]),
 emptyText: 'No menu items match filters',
 })
 const html = wrapReportDoc({
 settings: state?.settings || {},
 title: 'Menu List',
 reportLabel: 'Menu Report',
 reportNo: `Rpt #: MENU-${exportDateStamp()}`,
 metaLeft: [['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')], ['Search', search.trim() || 'All']],
 metaRight: [['Records', String(filteredItems.length)]],
 body,
 })
 return { html, fileName }
 }

 const openPrintPreview = async () => {
 try {
 const { html, fileName } = buildReportHtml()
 await previewHtmlReport(html, fileName)
 toast.success('Print preview opened')
 } catch (e) {
 console.error(e)
 toast.error('Print preview failed')
 }
 }

 const exportPDF = async () => {
 try {
 const { html, fileName } = buildReportHtml()
 await downloadHtmlReport(html, fileName)
 toast.success('PDF downloaded')
 } catch (e) {
 console.error(e)
 toast.error('Failed to export PDF')
 }
 }

 const saveTilesPerRow = async (val) => {
 const n = Math.max(1, Math.min(12, Number(val) || 4))
 setItemTilesPerRow(n)
 try {
 const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
 const res = await fetch(`${API}/api/settings`, { method: 'PATCH', headers, body: JSON.stringify({ posItemTilesPerRow: n }) })
 if (res.ok) {
 const saved = await res.json()
 dispatch({ type: 'HYDRATE', payload: { settings: saved } })
 toast.success('Tiles per row updated')
 }
 } catch {
 toast.error('Failed to save tiles per row')
 }
 }

 const onDelete = async (rowOrId, { fromEditDialog = false } = {}) => {
 const row = typeof rowOrId === 'object' ? rowOrId : items.find(r => r.id === rowOrId)
 const id = row?.id || rowOrId
 const isShared = row?.isShared !== false && !row?.isBranchOnly
 const branchId = String(activeBranchId || '').trim()

 const message = isShared
  ? `Delete “${row?.name || 'this item'}” from the shared menu for ALL branches?`
  : 'Delete this branch-only menu item?'

 const confirmed = await confirm({ title: 'Delete Menu Item', message })
 if (!confirmed) return false

 try {
 setLoading(true)
 const headers = {
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(branchId ? { 'X-Branch-Id': branchId } : {}),
 }
 const res = await fetch(`${API}/api/menu/${id}`, { method: 'DELETE', headers })
 const body = await res.json().catch(() => ({}))
 if (!res.ok) throw new Error(body.error || `Delete failed (${res.status})`)
 dispatch({ type: 'DELETE_MENU', payload: { id } })
 if (fromEditDialog) {
  setEditRows((prev) => prev.filter((r) => String(r.id) !== String(id)))
 }
 toast.success(isShared ? 'Deleted from all branches' : 'Menu item deleted')
 await refreshMenu()
 return true
 } catch (e) {
 toast.error(e?.message || 'Delete failed')
 return false
 } finally {
 setLoading(false)
 }
 }

 return (
 <div className="space-y-4 w-full"><div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"><h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2"><span className="text-3xl"></span> Menu
 </h1><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={openPrintPreview} className={btnPrint}>Print</button><button type="button" onClick={exportPDF} className={btnPdf}>PDF</button><button type="button" disabled={importing} onClick={() => exportMenuSheet('xlsx')} className={`${btnCsv} disabled:opacity-50`}>Export</button><button type="button" disabled={importing} onClick={() => fileInputRef.current?.click()} className="ui-btn ui-btn-secondary disabled:opacity-50" title="Upload .csv or .xlsx — categories are created automatically from the Category column">{importing ? 'Importing…' : 'Import Excel / CSV'}</button><input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; importMenuFile(f) }} /><button onClick={onAdd} className="ui-btn ui-btn-primary flex items-center gap-2"><Plus size={18} /> Add Menu Item</button><label className="text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">POS Tiles/row:</label><input
 type="number"
 min={1}
 max={12}
 value={itemTilesPerRow}
 onChange={e => saveTilesPerRow(e.target.value)}
 className="w-16 px-2 py-1.5 border-2 border-orange-200 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 dark:text-white text-sm text-center focus:ring-2 focus:ring-orange-500"
 /></div></div>
 <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
  Menu is shared across all branches. New items appear everywhere. Edit while on a branch to change price/availability for <span className="font-bold">{activeBranch?.name || 'that branch'}</span> only (use Reset to clear a branch override). Delete removes a shared item from <span className="font-bold">all branches</span>.
  <span className="block mt-1 text-xs font-normal opacity-90">Import/Export columns: Item Name, Category, Price, Foodpanda Price, Discount %, Sort Order, Active — missing categories are created on import.</span>
 </p>

 <div className="flex items-center gap-3">
 <input value={search} onChange={e=>{ setSearch(e.target.value); setPage(1) }} placeholder="Search by item name or category..." className="w-full px-4 py-2.5 border-2 border-orange-200 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 transition-all" />
 </div>

 {copiedItems?.items?.length > 0 && (
  <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border-2 border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 px-4 py-3">
   <div className="text-sm font-medium text-indigo-900 dark:text-indigo-100 flex-1">
    Clipboard: <span className="font-bold">{copiedItems.sourceLabel}</span>
    {' '}({copiedItems.items.length} item{copiedItems.items.length > 1 ? 's' : ''}) — pick a category, then Paste as new to review before saving
   </div>
   <div className="flex flex-wrap items-center gap-2">
    <select
     value={pasteCategory}
     onChange={(e) => setPasteCategory(e.target.value)}
     className="px-3 py-2 border-2 border-indigo-200 dark:border-indigo-700 rounded-lg bg-white dark:bg-gray-800 text-sm font-medium"
    >
     <option value="">Paste into category…</option>
     {cats.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
    </select>
    <button
     type="button"
     disabled={!pasteCategory}
     onClick={pasteAsNewIntoAddDialog}
     className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 text-white text-sm font-bold disabled:opacity-40"
     title="Open Add Menu dialog to review, edit, then save"
    >
     <ClipboardPaste size={14} /> Paste as new
    </button>
    <button type="button" onClick={() => { setCopiedItems(null); setPasteCategory('') }} className="px-3 py-2 rounded-lg border border-indigo-300 dark:border-indigo-700 text-indigo-800 dark:text-indigo-200 text-sm font-medium">Clear</button>
   </div>
  </div>
 )}

 <MenuEditDialog
 open={showEditDialog}
 editRows={editRows}
 setEditRows={setEditRows}
 cats={cats}
 categoryLabel={editingCategory}
 branchName={activeBranch?.name || 'this branch'}
 applyToAllBranches={applyToAllBranches}
 setApplyToAllBranches={setApplyToAllBranches}
 loading={loading}
 onClose={() => { setShowEditDialog(false); setEditRows([]); setEditingCategory('') }}
 onSubmit={onSubmit}
 onDeleteRow={(row) => onDelete(row, { fromEditDialog: true })}
/>
<MenuAddDialog
 open={showAddDialog}
 multiRows={multiRows}
 setMultiRows={setMultiRows}
 cats={cats}
 branchName={activeBranch?.name || 'this branch'}
 addForAllBranches={addForAllBranches}
 setAddForAllBranches={setAddForAllBranches}
 loading={loading}
 onClose={() => setShowAddDialog(false)}
 onSubmit={onSubmit}
/>


 <div className="border-2 border-orange-200 dark:border-orange-800 rounded-xl overflow-x-auto shadow-sm"><table className="min-w-full text-sm"><thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900"><tr><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Order</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Name</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Image</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Category</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Price</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Foodpanda</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Discount</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Active</th><th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Scope</th><th className="text-center p-3 font-semibold text-gray-700 dark:text-gray-300">Actions</th></tr></thead><tbody>
 {paginatedItems.map((r, idx) => (
 <tr key={r.id || idx} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"><td className="p-3 text-gray-600 dark:text-gray-400">{Number(r.sortOrder||0)}</td><td className="p-3 font-medium text-gray-900 dark:text-gray-100">{r.name}</td><td className="p-3">
 {r.imageUrl ? (
 <img src={r.imageUrl} alt={r.name} className="h-10 w-auto rounded border border-gray-200 dark:border-gray-600" />
 ) : (
 <span className="text-gray-400 text-xs">—</span>
 )}
 </td><td className="p-3 text-gray-600 dark:text-gray-400">{r.category}</td><td className="p-3 text-gray-700 dark:text-gray-300">PKR {Number(r.price||0).toLocaleString()}{r.hasOverride && r.basePrice != null && Number(r.basePrice) !== Number(r.price) ? <span className="block text-[10px] text-amber-600">shared {Number(r.basePrice).toLocaleString()}</span> : null}</td><td className="p-3 text-gray-700 dark:text-gray-300">{Number(r.priceFoodpanda||0) > 0 ? <>PKR {Number(r.priceFoodpanda).toLocaleString()}</> : <span className="text-gray-400 text-xs">—</span>}</td><td className="p-3">{Number(r.discount||0) > 0 ? <span className="px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200">{Number(r.discount)}%</span> : <span className="text-gray-400 text-xs">—</span>}</td><td className="p-3">{r.active ? <span className="text-green-600 dark:text-green-400">Yes</span> : <span className="text-gray-400">No</span>}</td><td className="p-3">{r.isBranchOnly ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-800">Branch only</span> : r.hasOverride ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">Branch override</span> : <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800">Shared</span>}</td><td className="p-3 text-center"><div className="flex items-center justify-center gap-1.5 flex-wrap">
<button type="button" disabled={loading} onClick={()=>onEdit(r)} className="px-2.5 py-1.5 rounded-lg bg-gradient-to-br from-sky-400 to-sky-500 text-white text-xs font-medium shadow-md disabled:opacity-50">Edit</button>
<button type="button" disabled={loading} onClick={()=>copyItem(r)} className="px-2.5 py-1.5 rounded-lg bg-indigo-500 text-white text-xs font-medium inline-flex items-center gap-1 disabled:opacity-50" title="Copy this item"><Copy size={12} /> Copy</button>
<button type="button" disabled={loading || !r.category} onClick={()=>copyCategoryItems(r.category)} className="px-2.5 py-1.5 rounded-lg bg-violet-500 text-white text-xs font-medium disabled:opacity-50" title="Copy all items in this category">Copy cat</button>
{r.hasOverride && (<button type="button" disabled={loading} onClick={()=>resetOverride(r)} className="px-2.5 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-medium disabled:opacity-50">Reset</button>)}
<button type="button" disabled={loading} onClick={()=>onDelete(r)} className="px-2.5 py-1.5 rounded-lg bg-gradient-to-br from-rose-400 to-rose-500 text-white text-xs font-medium shadow-md disabled:opacity-50">Delete</button>
</div></td></tr>
 ))}
 {!filteredItems.length && (
 <tr><td colSpan={10} className="p-8 text-center text-gray-500 dark:text-gray-400"><div className="text-4xl mb-2"></div><div>No menu items found</div></td></tr>
 )}
 </tbody></table></div>

 {/* Pagination controls */}
 <Pagination page={page} pages={pages} total={filteredItems.length} limit={limit} onLimitChange={n=>{ setLimit(n); setJump(1) }} onPageChange={setPage} loading={loading} />
 {filteredItems.length===0 && (
 <div className="text-sm text-gray-600">No menu items found.</div>
 )}
 {ConfirmDialog}
 </div>
 )
}
