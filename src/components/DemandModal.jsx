import { useEffect, useMemo, useState, useRef } from 'react'
import { toast } from 'react-hot-toast'
import { useData } from '../state/DataContext.jsx'
import { useAuth } from '../state/AuthContext.jsx'
import { useBranch } from '../state/BranchContext.jsx'
import DatePicker from './DatePicker.jsx'

function makeEmptyRow() {
  return { name: '', currentStock: '', orderQty: '', unit: '', isFromInventory: false, ingredientId: '' }
}

export default function DemandModal({ open, onClose, initial }) {
  const { state, dispatch, businessDate } = useData()
  const { token } = useAuth()
  const { activeBranchId, requireBranch } = useBranch()
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:5000'
  const ingredients = state.ingredients || []

  const [date, setDate] = useState(String(businessDate||'').slice(0,10) || new Date().toLocaleDateString('en-CA'))
  const [note, setNote] = useState('')
  const [rows, setRows] = useState(() => Array.from({ length: 20 }, makeEmptyRow))
  const [activeRow, setActiveRow] = useState(-1)
  const [activeInput, setActiveInput] = useState('')
  const scrollRef = useRef(null)

  useEffect(() => {
    if (!open) return
    if (initial) {
      setDate(initial.date || String(businessDate||'').slice(0,10) || new Date().toLocaleDateString('en-CA'))
      setNote(initial.note || '')
      const filled = (initial.items || []).map(it => ({
        name: it.name,
        currentStock: it.currentStock || 0,
        orderQty: it.quantity || '',
        unit: it.unit || '',
        isFromInventory: it.isFromInventory || false,
        ingredientId: it.ingredientId || ''
      }))
      const empties = Array.from({ length: Math.max(10, 10 - filled.length) }, makeEmptyRow)
      setRows([...filled, ...empties].slice(0, 10))
    } else {
      setDate(String(businessDate||'').slice(0,10) || new Date().toLocaleDateString('en-CA'))
      setNote('')
      setRows(Array.from({ length: 10 }, makeEmptyRow))
    }
    setActiveRow(-1)
    setActiveInput('')
  }, [initial, open])

  if (!open) return null

  const filteredIngredients = useMemo(() => {
    if (activeRow < 0) return []
    const search = (activeInput || '').toLowerCase().trim()
    if (!search) {
      return ingredients.slice(0, 15)
    }
    return ingredients.filter(ing =>
      ing.name.toLowerCase().includes(search)
    ).slice(0, 10)
  }, [activeInput, activeRow, ingredients])

  const updateRow = (idx, patch) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))
  }

  const selectIngredient = (idx, ing) => {
    updateRow(idx, {
      name: ing.name,
      currentStock: ing.qty || 0,
      unit: ing.unit || '',
      isFromInventory: true,
      ingredientId: ing.id || ''
    })
    setActiveRow(-1)
    setActiveInput('')
  }

  const addMoreRows = () => {
    setRows(prev => [...prev, ...Array.from({ length: 10 }, makeEmptyRow)])
  }

  const save = async (e, sendToWarehouse = false) => {
    e?.preventDefault?.()
    if (!requireBranch('Select a branch in the header before saving a demand')) return

    const items = rows
      .filter(r => r.name.trim() && Number(r.orderQty) > 0)
      .map(r => ({
        name: r.name.trim(),
        quantity: Number(r.orderQty),
        unit: r.unit || '',
        currentStock: Number(r.currentStock) || 0,
        isFromInventory: r.isFromInventory,
        ingredientId: r.ingredientId
      }))

    if (!date) {
      toast.error('Date is required')
      return
    }
    if (items.length === 0) {
      toast.error('Please add at least one item')
      return
    }

    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(activeBranchId ? { 'X-Branch-Id': activeBranchId } : {}),
      }
      const payload = {
        date,
        items,
        note,
        target: 'warehouse',
        status: sendToWarehouse ? 'sent' : (initial?.status || 'pending'),
        branchId: activeBranchId,
      }

      if (initial?.id) {
        const res = await fetch(`${API}/api/demands/${initial.id}`, { method: 'PATCH', headers, body: JSON.stringify(payload) })
        if (res.ok) {
          dispatch({ type: 'UPDATE_DEMAND', payload: { id: initial.id, data: payload } })
          toast.success(sendToWarehouse ? 'Demand sent to warehouse' : 'Demand saved')
        } else {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Update failed')
        }
      } else {
        const res = await fetch(`${API}/api/demands`, { method: 'POST', headers, body: JSON.stringify(payload) })
        if (res.ok) {
          const created = await res.json()
          dispatch({ type: 'ADD_DEMAND', payload: { ...payload, id: created.id || created._id } })
          toast.success(sendToWarehouse ? 'Demand sent to warehouse / head office' : 'Demand saved as draft')
        } else {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Create failed')
        }
      }
      onClose()
    } catch (err) {
      toast.error(err?.message || 'Failed to save demand')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b dark:border-gray-700">
          <h3 className="text-lg font-semibold dark:text-white">{initial?.id ? 'Edit Demand' : 'Create Demand'}</h3>
          <button onClick={onClose} className="px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 text-xl leading-none">×</button>
        </div>

        <form onSubmit={(e) => save(e, false)} className="flex flex-col flex-1 min-h-0">
          {/* Date + Note */}
          <div className="px-5 py-3 grid grid-cols-1 md:grid-cols-3 gap-4 border-b dark:border-gray-700">
            <div>
              <DatePicker label="Date" value={date} onChange={v => { if (v) setDate(v) }} allowClear={false} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Note</label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Optional note..."
                className="w-full px-3 py-2 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white dark:border-gray-600"
              />
            </div>
          </div>

          {/* Scrollable Table */}
          <div className="flex-1 min-h-0 px-5 py-3">
            <div className="border rounded-lg overflow-hidden">
              <div ref={scrollRef} className="overflow-y-auto max-h-[50vh]">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 w-12">#</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 w-[35%]">Item Name</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 w-[15%]">Current Stock</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 w-[15%]">Order Qty</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 w-[15%]">Unit</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 w-16">Del</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-gray-700">
                    {rows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-3 py-2 text-gray-400 text-xs">{idx + 1}</td>
                        <td className="px-3 py-2 relative">
                          <input
                            type="text"
                            value={row.name}
                            onChange={e => {
                              updateRow(idx, { name: e.target.value, currentStock: '', isFromInventory: false, ingredientId: '' })
                              setActiveRow(idx)
                              setActiveInput(e.target.value)
                            }}
                            onFocus={() => { setActiveRow(idx); setActiveInput(row.name) }}
                            onBlur={() => setTimeout(() => { if (activeRow === idx) setActiveRow(-1) }, 200)}
                            placeholder="Type or select..."
                            className="w-full px-2 py-1.5 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white dark:border-gray-600 text-sm"
                            autoComplete="off"
                          />
                          {activeRow === idx && filteredIngredients.length > 0 && (
                            <div className="absolute z-20 left-0 right-0 mt-1 bg-white dark:bg-gray-800 border rounded shadow-lg max-h-40 overflow-y-auto">
                              {filteredIngredients.map(ing => (
                                <div
                                  key={ing.id}
                                  onClick={() => selectIngredient(idx, ing)}
                                  className="px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer border-b last:border-0 dark:border-gray-700"
                                >
                                  <div className="font-medium text-sm">{ing.name}</div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400">
                                    Stock: {ing.qty} {ing.unit}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={row.isFromInventory ? row.currentStock : '-'}
                            readOnly
                            className="w-full px-2 py-1.5 border rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-sm"
                            tabIndex={-1}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            value={row.orderQty}
                            onChange={e => updateRow(idx, { orderQty: e.target.value })}
                            placeholder="Qty"
                            className="w-full px-2 py-1.5 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white dark:border-gray-600 text-sm"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={row.unit}
                            onChange={e => updateRow(idx, { unit: e.target.value })}
                            placeholder="Unit"
                            className="w-full px-2 py-1.5 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white dark:border-gray-600 text-sm"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => updateRow(idx, makeEmptyRow())}
                            className="px-2 py-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-sm"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <button
              type="button"
              onClick={addMoreRows}
              className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              + Add 10 more rows
            </button>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t dark:border-gray-700 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded border hover:bg-gray-50 dark:hover:bg-gray-800 dark:border-gray-600 dark:text-white">Cancel</button>
            <button type="submit" className="px-4 py-2 rounded border font-medium dark:border-gray-600 dark:text-white">Save draft</button>
            <button type="button" onClick={(e) => save(e, true)} className="px-4 py-2 rounded ui-btn ui-btn-primary font-medium">
              Send to warehouse
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
