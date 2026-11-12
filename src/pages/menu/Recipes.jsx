import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useData } from '../../state/DataContext.jsx'
import { useAuth } from '../../state/AuthContext.jsx'
import { useBranch } from '../../state/BranchContext.jsx'
import { useConfirm } from '../../components/useConfirm.jsx'
import { useUserBusy } from '../../hooks/useUserBusy.js'
import Pagination from '../../components/Pagination.jsx'
import { Plus, X, Copy, ClipboardPaste } from 'lucide-react'
import { format } from 'date-fns'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { wrapReportDoc, reportSummary, reportSec, reportTable, previewHtmlReport } from '../../utils/reportDoc.js'
import { btnPrint, btnPdf, btnCsv, downloadCsvFile, exportDateStamp } from '../../utils/listReportExport.js'

function blankIngredient() {
  return { ingredientName: '', amount: '', search: '', showDrop: false }
}

function blankRecipeBlock() {
  return {
    menuId: '',
    menuSearch: '',
    menuDropOpen: false,
    rows: [blankIngredient()],
  }
}

function normName(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function buildRecipePayload(rows, ingredients) {
  const byCanon = new Map()
  for (const r of rows || []) {
    const rawName = String(r.ingredientName || '').trim()
    const amt = Number(r.amount || 0)
    if (!rawName || Number.isNaN(amt) || amt < 0) continue
    const inv = ingredients.find(i => normName(i.name) === normName(rawName))
    const canon = inv?.name || rawName
    byCanon.set(canon, Number((byCanon.get(canon) || 0) + amt))
  }
  const recipe = {}
  byCanon.forEach((amt, name) => { if (amt > 0) recipe[name] = amt })
  return recipe
}

/** Goods cost = sum(recipe amount × ingredient purchase price per unit). */
function recipeGoodsCost(recipe, ingredients) {
  let cost = 0
  let missing = 0
  for (const [name, amt] of Object.entries(recipe || {})) {
    const qty = Number(amt) || 0
    if (qty <= 0) continue
    const inv = ingredients.find(i => normName(i.name) === normName(name))
    const unitPrice = Number(inv?.price) || 0
    if (!inv || unitPrice <= 0) missing += 1
    cost += qty * unitPrice
  }
  return { cost, missing }
}

function marginPct(sellPrice, goodsCost) {
  const sell = Number(sellPrice) || 0
  if (sell <= 0) return null
  return ((sell - (Number(goodsCost) || 0)) / sell) * 100
}

function fmtMoney(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtPct(n) {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n.toFixed(1)}%`
}

/** Same Scope badges as Menu page (Shared / Branch override / Branch only). */
function ScopeBadge({ m }) {
  if (m?.isBranchOnly) {
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200">Branch only</span>
  }
  // Recipe-specific override counts as branch override even if other fields are still shared
  if (m?.hasRecipeOverride || m?.hasOverride) {
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">Branch override</span>
  }
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">Shared</span>
}

export default function Recipes() {
  const { state, dispatch } = useData()
  const { token, user: currentUser } = useAuth()
  const { activeBranch } = useBranch()
  const { confirm, ConfirmDialog } = useConfirm()
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
  const isAdminUser = currentUser?.role === 'Admin' || currentUser?.role === 'SuperAdmin' || !!currentUser?.isHq

  const allMenu = useMemo(
    () => (state.menu || []).filter(m => m.active !== false).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [state.menu],
  )
  const ingredients = useMemo(
    () => (state.ingredients || []).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [state.ingredients],
  )

  const [viewItem, setViewItem] = useState(null)
  const [copiedRecipe, setCopiedRecipe] = useState(null) // { recipe, sourceName }
  const [listSearch, setListSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showRecipeDialog, setShowRecipeDialog] = useState(false)
  const [editingSingle, setEditingSingle] = useState(false)
  const [blocks, setBlocks] = useState([blankRecipeBlock()])
  const [applyToAllBranches, setApplyToAllBranches] = useState(true)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(100)
  const [listTab, setListTab] = useState('with') // with | without | all

  const menuWithRecipes = useMemo(
    () => allMenu.filter(m => m.recipe && Object.keys(m.recipe).length > 0),
    [allMenu],
  )
  const menuWithoutRecipes = useMemo(
    () => allMenu.filter(m => !m.recipe || Object.keys(m.recipe).length === 0),
    [allMenu],
  )

  const filteredList = useMemo(() => {
    const base = listTab === 'without'
      ? menuWithoutRecipes
      : listTab === 'all'
        ? allMenu
        : menuWithRecipes
    if (!listSearch.trim()) return base
    const q = listSearch.toLowerCase()
    return base.filter(m =>
      String(m.name || '').toLowerCase().includes(q)
      || String(m.category || '').toLowerCase().includes(q)
      || Object.keys(m.recipe || {}).some(ing => ing.toLowerCase().includes(q)),
    )
  }, [listTab, allMenu, menuWithRecipes, menuWithoutRecipes, listSearch])

  const totalPages = Math.max(1, Math.ceil(filteredList.length / limit))
  const pagedList = filteredList.slice((page - 1) * limit, page * limit)

  useUserBusy(showRecipeDialog || !!viewItem)
  useEffect(() => { setPage(1) }, [listSearch, listTab])

  const startNew = () => {
    setEditingSingle(false)
    setBlocks([blankRecipeBlock()])
    setApplyToAllBranches(true)
    setShowRecipeDialog(true)
  }

  const recipeToRows = (recipe) => {
    const keys = Object.keys(recipe || {})
    if (!keys.length) return [blankIngredient()]
    return keys.map(name => ({
      ingredientName: name,
      amount: Number(recipe[name] || 0),
      search: name,
      showDrop: false,
    }))
  }

  const startEdit = (m, recipeOverride = null) => {
    setEditingSingle(true)
    setApplyToAllBranches(!(m.hasRecipeOverride || m.hasOverride) && !m.isBranchOnly)
    const recipe = recipeOverride || m.recipe || {}
    setBlocks([{
      menuId: m.id,
      menuSearch: '',
      menuDropOpen: false,
      rows: recipeToRows(recipe),
    }])
    setShowRecipeDialog(true)
  }

  const copyRecipe = (m) => {
    const recipe = { ...(m.recipe || {}) }
    if (!Object.keys(recipe).length) {
      toast.error('Nothing to copy')
      return
    }
    setCopiedRecipe({ recipe, sourceName: m.name || 'item' })
    toast.success(`Copied recipe from ${m.name}`)
  }

  const pasteRecipe = (m) => {
    if (!copiedRecipe?.recipe || !Object.keys(copiedRecipe.recipe).length) {
      toast.error('Copy a recipe first')
      return
    }
    startEdit(m, copiedRecipe.recipe)
    toast.success(`Pasted from ${copiedRecipe.sourceName} — adjust quantities then save`)
  }

  const updateBlock = (idx, patch) => {
    setBlocks(prev => prev.map((b, i) => i === idx ? { ...b, ...patch } : b))
  }

  const updateIngRow = (blockIdx, rowIdx, patch) => {
    setBlocks(prev => prev.map((b, i) => {
      if (i !== blockIdx) return b
      return {
        ...b,
        rows: b.rows.map((r, j) => j === rowIdx ? { ...r, ...patch } : r),
      }
    }))
  }

  const filteredMenuFor = (query, excludeIds = []) => {
    const q = String(query || '').trim().toLowerCase()
    const exclude = new Set((excludeIds || []).filter(Boolean).map(String))
    return allMenu
      .filter(m => !exclude.has(String(m.id)))
      .filter(m => {
        if (!q) return true
        return String(m.name || '').toLowerCase().includes(q) || String(m.category || '').toLowerCase().includes(q)
      })
  }

  const filteredIngredientsFor = (query) => {
    const q = String(query || '').trim().toLowerCase()
    if (!q) return ingredients
    return ingredients.filter(i => String(i.name || '').toLowerCase().includes(q))
  }

  const onSave = async () => {
    const used = new Set()
    const jobs = []
    for (const block of blocks) {
      if (!block.menuId) continue
      if (used.has(String(block.menuId))) {
        toast.error('Duplicate menu item in the list')
        return
      }
      used.add(String(block.menuId))
      const recipe = buildRecipePayload(block.rows, ingredients)
      if (!Object.keys(recipe).length) {
        toast.error('Each recipe needs at least one ingredient with amount')
        return
      }
      jobs.push({ menuId: block.menuId, recipe, menu: allMenu.find(m => String(m.id) === String(block.menuId)) })
    }
    if (!jobs.length) {
      toast.error('Select at least one menu item')
      return
    }

    try {
      setSaving(true)
      const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      let ok = 0
      let fail = 0
      for (const job of jobs) {
        const payload = { recipe: job.recipe }
        const shared = !job.menu?.isBranchOnly
        if (shared && applyToAllBranches && isAdminUser) payload.editShared = true
        try {
          const res = await fetch(`${API}/api/menu/${job.menuId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(payload),
          })
          if (!res.ok) { fail++; continue }
          const updated = await res.json().catch(() => null)
          dispatch({
            type: 'UPDATE_MENU',
            payload: {
              id: job.menuId,
              data: updated
                ? { ...updated, id: updated.id || updated._id }
                : { recipe: job.recipe, ...(payload.editShared ? {} : { hasOverride: true, hasRecipeOverride: true }) },
            },
          })
          ok++
        } catch {
          fail++
        }
      }
      if (ok && !fail) toast.success(`${ok} recipe${ok > 1 ? 's' : ''} saved`)
      else if (ok && fail) toast.success(`${ok} saved, ${fail} failed`)
      else toast.error('Failed to save recipes')
      if (ok) setShowRecipeDialog(false)
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async (m) => {
    const ok = await confirm({
      title: 'Delete Recipe',
      message: `Delete recipe for "${m.name}"?`,
    })
    if (!ok) return
    try {
      setDeleting(true)
      const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      const payload = { recipe: {} }
      // Clear shared recipe for shared items without a branch recipe override; otherwise clear override
      if (!m.isBranchOnly && isAdminUser && !m.hasRecipeOverride) payload.editShared = true
      const res = await fetch(`${API}/api/menu/${m.id}`, { method: 'PATCH', headers, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error('Failed to delete recipe')
      const updated = await res.json().catch(() => null)
      dispatch({
        type: 'UPDATE_MENU',
        payload: { id: m.id, data: updated ? { ...updated, id: updated.id || updated._id } : { recipe: {} } },
      })
      toast.success('Recipe deleted')
    } catch {
      toast.error('Failed to delete recipe')
    } finally {
      setDeleting(false)
    }
  }

  const getRecipeSummary = (recipe) => {
    const keys = Object.keys(recipe || {})
    if (!keys.length) return '—'
    return keys.map(k => `${k} (${recipe[k]})`).join(', ')
  }

  const recipeEconomics = (m) => {
    const sell = Number(m.price) || 0
    const { cost, missing } = recipeGoodsCost(m.recipe, ingredients)
    const margin = marginPct(sell, cost)
    return { sell, cost, margin, missing }
  }

  const recipeReportRows = () => filteredList.map(m => {
    const { sell, cost, margin } = recipeEconomics(m)
    return [
      m.name || '',
      m.category || '',
      m.isBranchOnly ? 'Branch only' : (m.hasRecipeOverride || m.hasOverride) ? 'Branch override' : 'Shared',
      getRecipeSummary(m.recipe),
      Object.keys(m.recipe || {}).length,
      fmtMoney(sell),
      fmtMoney(cost),
      fmtPct(margin),
    ]
  })

  const openPrintPreview = async () => {
    try {
      const body =
        reportSummary([
          { label: 'Recipes listed', amount: String(filteredList.length) },
          { label: 'Total with recipes', amount: String(menuWithRecipes.length) },
        ]) +
        reportSec(`Recipes (${filteredList.length})`) +
        reportTable({
          headers: [
            'Menu Item', 'Category', 'Scope', 'Ingredients', { t: 'Count', align: 'r' },
            { t: 'Sell price', align: 'r' }, { t: 'Goods cost', align: 'r' }, { t: 'Margin %', align: 'r' },
          ],
          numbered: true,
          rows: filteredList.map(m => {
            const { sell, cost, margin } = recipeEconomics(m)
            return [
              m.name,
              m.category || '—',
              m.isBranchOnly ? 'Branch only' : (m.hasRecipeOverride || m.hasOverride) ? 'Branch override' : 'Shared',
              getRecipeSummary(m.recipe),
              { v: Object.keys(m.recipe || {}).length, align: 'r' },
              { v: fmtMoney(sell), align: 'r' },
              { v: fmtMoney(cost), align: 'r' },
              { v: fmtPct(margin), align: 'r' },
            ]
          }),
          emptyText: 'No recipes match filters',
        })
      const html = wrapReportDoc({
        settings: state?.settings || {},
        title: 'Recipes',
        reportLabel: 'Recipe Report',
        reportNo: `Rpt #: REC-${exportDateStamp()}`,
        metaLeft: [['Generated', format(new Date(), 'yyyy-MM-dd HH:mm')], ['Search', listSearch.trim() || 'All']],
        metaRight: [['Records', String(filteredList.length)]],
        body,
      })
      await previewHtmlReport(html, `Recipes-${exportDateStamp()}.pdf`)
      toast.success('Print preview opened')
    } catch (e) {
      console.error(e)
      toast.error('Print preview failed')
    }
  }

  const exportPDF = () => {
    try {
      const doc = new jsPDF('l', 'pt', 'a4')
      doc.setFontSize(14)
      doc.text(state?.settings?.companyName || 'Recipes', 40, 32)
      doc.setFontSize(10)
      doc.text(`${filteredList.length} recipes`, 40, 46)
      doc.autoTable({
        head: [['Menu Item', 'Category', 'Scope', 'Ingredients', 'Count', 'Sell price', 'Goods cost', 'Margin %']],
        body: recipeReportRows(),
        startY: 54,
        styles: { fontSize: 7, cellPadding: 3 },
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
        margin: { left: 40, right: 40 },
      })
      doc.save(`recipes_${exportDateStamp()}.pdf`)
      toast.success('PDF exported successfully')
    } catch (e) {
      console.error(e)
      toast.error('Failed to export PDF')
    }
  }

  const exportCSV = () => {
    try {
      downloadCsvFile(
        `recipes_${format(new Date(), 'yyyy-MM-dd')}.csv`,
        ['Menu Item', 'Category', 'Scope', 'Ingredients', 'Count', 'Sell price', 'Goods cost', 'Margin %'],
        recipeReportRows(),
      )
      toast.success('CSV exported successfully')
    } catch {
      toast.error('Failed to export CSV')
    }
  }

  const selectedIds = blocks.map(b => b.menuId).filter(Boolean)

  return (
    <div className="space-y-4 w-full">
      {showRecipeDialog && (
        <div
          data-user-busy="1"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowRecipeDialog(false) }}
        >
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {editingSingle ? 'Edit Recipe' : 'Create Recipes'}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Search menu items and inventory ingredients. Add multiple recipes and save once.
                </p>
              </div>
              <button onClick={() => setShowRecipeDialog(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {blocks.map((block, bIdx) => {
                const menuItem = allMenu.find(m => String(m.id) === String(block.menuId))
                const menuMatches = filteredMenuFor(
                  block.menuSearch,
                  selectedIds.filter(id => String(id) !== String(block.menuId)),
                )
                return (
                  <div key={bIdx} className="rounded-2xl border-2 border-blue-200 dark:border-blue-800 p-4 space-y-3 bg-blue-50/20 dark:bg-blue-950/10">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-blue-700 dark:text-blue-300">Recipe {bIdx + 1}</span>
                      {blocks.length > 1 && !editingSingle && (
                        <button
                          type="button"
                          className="text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg px-2 py-1"
                          onClick={() => setBlocks(prev => prev.filter((_, i) => i !== bIdx))}
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="relative">
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Menu item</label>
                      <input
                        disabled={editingSingle}
                        value={block.menuId ? (menuItem?.name || '') : block.menuSearch}
                        onChange={e => updateBlock(bIdx, { menuSearch: e.target.value, menuDropOpen: true, menuId: '' })}
                        onFocus={() => updateBlock(bIdx, { menuDropOpen: true })}
                        onBlur={() => setTimeout(() => updateBlock(bIdx, { menuDropOpen: false }), 180)}
                        placeholder="Search menu items…"
                        className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 disabled:opacity-70"
                        autoComplete="off"
                      />
                      {block.menuDropOpen && !editingSingle && (
                        <div className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg">
                          {menuMatches.map(m => {
                            const hasRecipe = m.recipe && Object.keys(m.recipe).length > 0
                            return (
                              <button
                                key={m.id}
                                type="button"
                                onMouseDown={() => updateBlock(bIdx, {
                                  menuId: m.id,
                                  menuSearch: '',
                                  menuDropOpen: false,
                                  rows: hasRecipe
                                    ? Object.keys(m.recipe).map(name => ({
                                      ingredientName: name,
                                      amount: Number(m.recipe[name] || 0),
                                      search: name,
                                      showDrop: false,
                                    }))
                                    : [blankIngredient()],
                                })}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30 flex items-center justify-between gap-2"
                              >
                                <span>{m.name} {m.category ? <span className="text-gray-400">({m.category})</span> : null}</span>
                                {hasRecipe && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold">Has recipe</span>}
                              </button>
                            )
                          })}
                          {!menuMatches.length && <div className="px-3 py-2 text-sm text-slate-500">No menu matches</div>}
                        </div>
                      )}
                    </div>

                    <div className="border rounded-xl overflow-visible border-gray-200 dark:border-gray-700">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                          <tr>
                            <th className="text-left p-3 font-semibold">Ingredient</th>
                            <th className="text-left p-3 font-semibold">Unit</th>
                            <th className="text-right p-3 font-semibold">Amount</th>
                            <th className="p-3" />
                          </tr>
                        </thead>
                        <tbody>
                          {block.rows.map((r, rIdx) => {
                            const inv = ingredients.find(i => i.name === r.ingredientName)
                            const ingMatches = filteredIngredientsFor(r.search || r.ingredientName)
                            return (
                              <tr key={rIdx} className="border-t border-gray-200 dark:border-gray-700">
                                <td className="p-3 relative">
                                  <input
                                    value={r.ingredientName ? r.ingredientName : r.search}
                                    onChange={e => updateIngRow(bIdx, rIdx, {
                                      search: e.target.value,
                                      ingredientName: '',
                                      showDrop: true,
                                    })}
                                    onFocus={() => updateIngRow(bIdx, rIdx, { showDrop: true })}
                                    onBlur={() => setTimeout(() => updateIngRow(bIdx, rIdx, { showDrop: false }), 180)}
                                    placeholder="Search inventory…"
                                    className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-white"
                                    autoComplete="off"
                                  />
                                  {r.showDrop && (
                                    <div className="absolute z-50 mt-1 left-3 right-3 max-h-72 overflow-y-auto rounded-lg border bg-white dark:bg-gray-800 shadow-lg">
                                      {ingMatches.map(i => (
                                        <button
                                          key={i.id}
                                          type="button"
                                          onMouseDown={() => updateIngRow(bIdx, rIdx, {
                                            ingredientName: i.name,
                                            search: i.name,
                                            showDrop: false,
                                          })}
                                          className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 dark:hover:bg-slate-700 flex justify-between gap-2"
                                        >
                                          <span>{i.name}</span>
                                          <span className="text-xs text-slate-500">{i.qty} {i.unit} · {fmtMoney(i.price)}/u</span>
                                        </button>
                                      ))}
                                      {!ingMatches.length && <div className="px-3 py-2 text-sm text-slate-500">No inventory matches</div>}
                                    </div>
                                  )}
                                </td>
                                <td className="p-3 text-gray-600 dark:text-gray-400">{inv?.unit || '—'}</td>
                                <td className="p-3 text-right">
                                  <input
                                    type="number"
                                    step="0.001"
                                    min="0"
                                    value={r.amount}
                                    onChange={e => updateIngRow(bIdx, rIdx, { amount: e.target.value })}
                                    className="w-28 px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-right bg-white dark:bg-gray-800 dark:text-white"
                                  />
                                </td>
                                <td className="p-3 text-right">
                                  {block.rows.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => updateBlock(bIdx, { rows: block.rows.filter((_, i) => i !== rIdx) })}
                                      className="px-2 py-1 rounded-lg text-rose-600 text-xs font-semibold hover:bg-rose-50"
                                    >
                                      Remove
                                    </button>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    <button
                      type="button"
                      onClick={() => updateBlock(bIdx, { rows: [...block.rows, blankIngredient()] })}
                      className="px-3 py-2 rounded-lg border text-sm font-semibold"
                    >
                      + Add ingredient
                    </button>
                  </div>
                )
              })}
            </div>

            {!editingSingle && (
              <button
                type="button"
                onClick={() => setBlocks(prev => [...prev, blankRecipeBlock()])}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-blue-300 px-4 py-2.5 text-sm font-semibold text-blue-600"
              >
                <Plus size={16} /> Add another recipe
              </button>
            )}

            <div className="mt-4 space-y-3">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-sky-800 dark:text-sky-200">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded"
                  checked={applyToAllBranches}
                  onChange={e => setApplyToAllBranches(e.target.checked)}
                  disabled={!isAdminUser}
                />
                Apply to all branches (shared catalog)
              </label>
              <p className="text-xs text-slate-500">
                {applyToAllBranches
                  ? 'Recipes update the shared menu for every branch.'
                  : `Recipes save for ${activeBranch?.name || 'this branch'} only (branch override).`}
              </p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowRecipeDialog(false)} className="px-4 py-2.5 rounded-lg border font-medium">Cancel</button>
                <button disabled={saving} onClick={onSave} className="ui-btn ui-btn-primary disabled:opacity-50">
                  {saving ? 'Saving…' : (editingSingle ? 'Save Recipe' : 'Save All Recipes')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Recipes</h1>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={openPrintPreview} className={btnPrint}>Print</button>
            <button type="button" onClick={exportPDF} className={btnPdf}>PDF</button>
            <button type="button" onClick={exportCSV} className={btnCsv}>CSV</button>
            <button onClick={startNew} className="ui-btn ui-btn-primary flex items-center gap-2"><Plus size={18} /> Create Recipe</button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="p-4 rounded-xl border-2 border-blue-300 dark:border-blue-800 bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-950/40 dark:to-gray-900 shadow-sm">
            <div className="text-xs font-medium text-blue-700 dark:text-blue-400 uppercase">Total Recipes</div>
            <div className="page-title">{menuWithRecipes.length}</div>
          </div>
          <div className="p-4 rounded-xl border-2 border-amber-300 dark:border-amber-800 bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-950/40 dark:to-gray-900 shadow-sm">
            <div className="text-xs font-medium text-amber-700 dark:text-amber-400 uppercase">Without Recipes</div>
            <div className="page-title">{allMenu.length - menuWithRecipes.length}</div>
          </div>
          <div className="p-4 rounded-xl border-2 border-emerald-300 dark:border-emerald-800 bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-950/40 dark:to-gray-900 shadow-sm">
            <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400 uppercase">Total Menu Items</div>
            <div className="page-title">{allMenu.length}</div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex flex-wrap gap-2 p-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50">
            {[
              { id: 'with', label: `With recipe (${menuWithRecipes.length})` },
              { id: 'without', label: `Without recipe (${menuWithoutRecipes.length})` },
              { id: 'all', label: `All menu (${allMenu.length})` },
            ].map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setListTab(t.id)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  listTab === t.id ? 'ui-btn ui-btn-primary' : 'ui-btn ui-btn-secondary'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <input
            placeholder={listTab === 'without' ? 'Search menu items…' : 'Search recipes…'}
            value={listSearch}
            onChange={e => setListSearch(e.target.value)}
            className="w-full sm:w-72 px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>

        {copiedRecipe && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
            <span>
              Clipboard: <span className="font-bold">{copiedRecipe.sourceName}</span>
              {' '}({Object.keys(copiedRecipe.recipe || {}).length} ingredients) — use Paste on another item, then tweak amounts and save.
            </span>
            <button type="button" onClick={() => setCopiedRecipe(null)} className="px-2 py-1 rounded-lg border border-sky-300 text-xs font-semibold hover:bg-sky-100 dark:hover:bg-sky-900/40">Clear</button>
          </div>
        )}

        <div className="border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-x-auto shadow-sm">
          <table className="min-w-[1100px] w-full table-fixed text-sm">
            <colgroup>
              <col style={{ width: '14%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '28%' }} />
              <col style={{ width: '5%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '11%' }} />
            </colgroup>
            <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
              <tr>
                <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Menu Item</th>
                <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Category</th>
                <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Ingredients</th>
                <th className="text-center p-3 font-semibold text-gray-700 dark:text-gray-300">Count</th>
                <th className="text-right p-3 font-semibold text-gray-700 dark:text-gray-300">Sell price</th>
                <th className="text-right p-3 font-semibold text-gray-700 dark:text-gray-300" title="(Sell − Goods cost) ÷ Sell">Margin %</th>
                <th className="text-right p-3 font-semibold text-gray-700 dark:text-gray-300" title="Sum of recipe amounts × inventory purchase price">Goods cost</th>
                <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Scope</th>
                <th className="text-center p-3 font-semibold text-gray-700 dark:text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedList.map(m => {
                const recipeKeys = Object.keys(m.recipe || {})
                const hasRecipe = recipeKeys.length > 0
                const { sell, cost, margin, missing } = recipeEconomics(m)
                const marginClass = margin == null
                  ? 'text-gray-400'
                  : margin >= 40
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : margin >= 20
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-rose-700 dark:text-rose-300'
                const btn = 'w-full px-2 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50'
                return (
                  <tr key={m.id} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 align-top">
                    <td className="p-3 font-medium text-gray-900 dark:text-gray-100 break-words whitespace-normal leading-snug">{m.name}</td>
                    <td className="p-3 text-gray-600 dark:text-gray-400 break-words whitespace-normal leading-snug">{m.category || '—'}</td>
                    <td className="p-3 text-gray-600 dark:text-gray-400 text-xs break-words whitespace-normal leading-relaxed">
                      {hasRecipe ? getRecipeSummary(m.recipe) : <span className="text-amber-600 font-medium">No recipe</span>}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                        hasRecipe ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-800'
                      }`}>{recipeKeys.length}</span>
                    </td>
                    <td className="p-3 text-right font-semibold tabular-nums break-words whitespace-normal">{fmtMoney(sell)}</td>
                    <td className={`p-3 text-right font-bold tabular-nums break-words whitespace-normal ${marginClass}`}>{hasRecipe ? fmtPct(margin) : '—'}</td>
                    <td className="p-3 text-right tabular-nums break-words whitespace-normal">
                      {hasRecipe ? (
                        <>
                          <div className="font-semibold">{fmtMoney(cost)}</div>
                          {missing > 0 && (
                            <div className="text-[10px] text-amber-600 break-words whitespace-normal">{missing} missing price</div>
                          )}
                        </>
                      ) : '—'}
                    </td>
                    <td className="p-3 break-words whitespace-normal">
                      <ScopeBadge m={m} />
                    </td>
                    <td className="p-2 align-top">
                      <div className="grid grid-cols-2 gap-1.5 min-w-[7.5rem]">
                        {hasRecipe ? (
                          <>
                            <button type="button" onClick={() => setViewItem(m)} className={`${btn} bg-sky-500`}>View</button>
                            <button type="button" onClick={() => startEdit(m)} className={`${btn} bg-amber-500`}>Edit</button>
                            <button type="button" onClick={() => copyRecipe(m)} className={`${btn} bg-indigo-500 inline-flex items-center justify-center gap-1`} title="Copy recipe"><Copy size={12} /> Copy</button>
                            <button type="button" disabled={!copiedRecipe} onClick={() => pasteRecipe(m)} className={`${btn} bg-violet-500 inline-flex items-center justify-center gap-1 disabled:opacity-40`} title="Paste copied recipe"><ClipboardPaste size={12} /> Paste</button>
                            <button type="button" disabled={deleting} onClick={() => onDelete(m)} className={`${btn} col-span-2 bg-rose-500`}>Delete</button>
                          </>
                        ) : (
                          <>
                            <button type="button" onClick={() => startEdit(m)} className={`${btn} col-span-2 bg-emerald-600`}>Add recipe</button>
                            <button type="button" disabled={!copiedRecipe} onClick={() => pasteRecipe(m)} className={`${btn} col-span-2 bg-violet-500 inline-flex items-center justify-center gap-1 disabled:opacity-40`} title="Paste copied recipe"><ClipboardPaste size={12} /> Paste recipe</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!pagedList.length && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-gray-500">
                    {listTab === 'without'
                      ? 'All menu items already have recipes.'
                      : listTab === 'all'
                        ? 'No menu items found.'
                        : 'No recipes found. Use Create Recipe or switch to Without recipe.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filteredList.length > 0 && (
          <Pagination page={page} pages={totalPages} total={filteredList.length} limit={limit} onLimitChange={n => { setLimit(n); setPage(1) }} onPageChange={setPage} />
        )}

        {viewItem && (
          <div data-user-busy="1" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setViewItem(null)}>
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">{viewItem.name}</h2>
                  <div className="mt-1 flex items-center gap-2">
                    {viewItem.category && <span className="text-xs text-gray-500">{viewItem.category}</span>}
                    <ScopeBadge m={viewItem} />
                  </div>
                </div>
                <button onClick={() => setViewItem(null)} className="px-3 py-1.5 rounded-lg border text-sm">Close</button>
              </div>
              <div className="p-5">
                {(() => {
                  const { sell, cost, margin, missing } = recipeEconomics(viewItem)
                  return (
                    <div className="mb-4 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl border p-2 dark:border-gray-700">
                        <div className="text-[10px] uppercase text-slate-500">Sell price</div>
                        <div className="font-bold tabular-nums">{fmtMoney(sell)}</div>
                      </div>
                      <div className="rounded-xl border p-2 dark:border-gray-700">
                        <div className="text-[10px] uppercase text-slate-500">Margin %</div>
                        <div className="font-bold tabular-nums">{fmtPct(margin)}</div>
                      </div>
                      <div className="rounded-xl border p-2 dark:border-gray-700">
                        <div className="text-[10px] uppercase text-slate-500">Goods cost</div>
                        <div className="font-bold tabular-nums">{fmtMoney(cost)}</div>
                        {missing > 0 && <div className="text-[10px] text-amber-600">{missing} missing price</div>}
                      </div>
                    </div>
                  )
                })()}
                {Object.keys(viewItem.recipe || {}).length > 0 ? (
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="text-left p-2">Ingredient</th>
                        <th className="text-left p-2">Unit</th>
                        <th className="text-right p-2">Amount</th>
                        <th className="text-right p-2">Unit price</th>
                        <th className="text-right p-2">Line cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(viewItem.recipe).map(([name, amt]) => {
                        const inv = ingredients.find(i => normName(i.name) === normName(name))
                        const unitPrice = Number(inv?.price) || 0
                        const lineCost = (Number(amt) || 0) * unitPrice
                        return (
                          <tr key={name} className="border-t">
                            <td className="p-2 font-medium">{name}</td>
                            <td className="p-2">{inv?.unit || '—'}</td>
                            <td className="p-2 text-right font-semibold text-blue-600">{amt}</td>
                            <td className="p-2 text-right tabular-nums">{fmtMoney(unitPrice)}</td>
                            <td className="p-2 text-right font-semibold tabular-nums">{fmtMoney(lineCost)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-center text-gray-500 py-6">No ingredients in this recipe.</div>
                )}
                <div className="flex gap-2 mt-4">
                  <button onClick={() => { startEdit(viewItem); setViewItem(null) }} className="flex-1 ui-btn ui-btn-secondary">Edit Recipe</button>
                  <button onClick={() => setViewItem(null)} className="px-4 py-2.5 rounded-lg border font-medium">Close</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {ConfirmDialog}
      </section>
    </div>
  )
}
