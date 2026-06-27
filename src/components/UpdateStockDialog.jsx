import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'

export default function UpdateStockDialog({ open, items = [], onClose, API, token, suppliers = [], onUpdated }) {
  // No initial selection - start empty
  const [selectedId, setSelectedId] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef(null)
  const searchInputRef = useRef(null)
  const submittingRef = useRef(false)

  // Form fields for stock addition
  const [addQty, setAddQty] = useState('')
  const [pricePerUnit, setPricePerUnit] = useState('')
  const [expiry, setExpiry] = useState('')
  const [supplierId, setSupplierId] = useState('')

  // Get selected item details
  const selectedItem = useMemo(() => {
    if (!selectedId) return null
    return items.find(i => i.id === selectedId) || null
  }, [selectedId, items])

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setSelectedId('')
      setSearchQuery('')
      setAddQty('')
      setPricePerUnit('')
      setExpiry('')
      setSupplierId('')
      setShowDropdown(false)
    }
  }, [open])

  // When selecting an item, populate price from item data
  useEffect(() => {
    if (selectedItem) {
      setPricePerUnit(selectedItem.price?.toString() || '')
      // Keep existing expiry if item has one
      if (selectedItem.expiry) {
        setExpiry(selectedItem.expiry.slice(0, 10))
      }
    }
  }, [selectedItem])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Filter items based on search
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items
    const q = searchQuery.toLowerCase()
    return items.filter(i =>
      i.name?.toLowerCase().includes(q) ||
      i.category?.toLowerCase().includes(q)
    )
  }, [searchQuery, items])

  if (!open) return null

  const handleSelectItem = (item) => {
    setSelectedId(item.id)
    setSearchQuery(item.name)
    setShowDropdown(false)
  }

  const handleSubmit = async () => {
    // Prevent double submission
    if (submittingRef.current) return
    
    if (!selectedId || !selectedItem) {
      toast.error('Please select an item')
      return
    }
    const qtyNum = Number(addQty)
    if (!addQty || isNaN(qtyNum) || qtyNum <= 0) {
      toast.error('Please enter a valid quantity to add')
      return
    }
    const priceNum = Number(pricePerUnit)
    if (isNaN(priceNum) || priceNum < 0) {
      toast.error('Please enter a valid price per unit')
      return
    }

    submittingRef.current = true
    
    try {
      const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }

      // 1. Get FRESH current quantity from server (not from stale state)
      const freshRes = await fetch(`${API}/api/ingredients/${selectedId}`, { headers })
      if (!freshRes.ok) throw new Error('Failed to fetch current stock')
      const freshItem = await freshRes.json()
      const currentQty = Number(freshItem.qty) || 0
      const newTotalQty = currentQty + qtyNum

      // 2. Update inventory - PATCH to update quantity
      const updateRes = await fetch(`${API}/api/ingredients/${selectedId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          qty: newTotalQty,
          price: priceNum, // Update with new price
          expiry: expiry || freshItem.expiry,
        })
      })
      if (!updateRes.ok) throw new Error('Failed to update inventory')

      // 3. Create supply/purchase record
      const supplier = suppliers.find(s => s.id === supplierId)
      const supplyPayload = {
        date: new Date().toISOString().slice(0, 10),
        supplierId: supplierId || '',
        supplier: supplier?.name || supplier?.company || 'Stock Update',
        items: [{
          ingredientId: selectedId,
          name: selectedItem.name,
          qty: qtyNum,
          unit: selectedItem.unit || 'unit',
          price: priceNum,
        }],
        cost: qtyNum * priceNum,
        skipInventoryUpdate: true, // Don't double-update inventory
      }

      const supplyRes = await fetch(`${API}/api/supplies`, {
        method: 'POST',
        headers,
        body: JSON.stringify(supplyPayload)
      })
      if (!supplyRes.ok) throw new Error('Failed to create supply record')

      toast.success(`Added ${qtyNum} ${selectedItem.unit || 'units'} of ${selectedItem.name}`)
      onClose()
      // Call refresh callback instead of reload
      if (onUpdated) onUpdated()
    } catch (err) {
      toast.error(err.message || 'Failed to update stock')
    } finally {
      submittingRef.current = false
    }
  }

  const currentQty = Number(selectedItem?.qty) || 0
  const addedQty = Number(addQty) || 0
  const newTotalQty = currentQty + addedQty

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-xl">
              📦
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Update Stock</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-500 transition-colors">
            ✕
          </button>
        </div>

        <div className="space-y-5">
          {/* Searchable Item Selection */}
          <div className="relative" ref={dropdownRef}>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select Item <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setShowDropdown(true)
                  if (selectedId && e.target.value !== selectedItem?.name) {
                    setSelectedId('')
                  }
                }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Search for an item..."
                className="w-full px-4 py-3 pl-10 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            </div>

            {/* Dropdown */}
            {showDropdown && (
              <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-xl max-h-60 overflow-auto">
                {filteredItems.length === 0 ? (
                  <div className="px-4 py-3 text-gray-500 text-sm">No items found</div>
                ) : (
                  filteredItems.map(item => (
                    <button
                      key={item.id}
                      onClick={() => handleSelectItem(item)}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between transition-colors border-b border-gray-100 dark:border-gray-700 last:border-0"
                    >
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">{item.name}</div>
                        <div className="text-xs text-gray-500">{item.category} • Current: {item.qty} {item.unit}</div>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        {item.unit}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Selected Item Info Card */}
          {selectedItem && (
            <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Current Stock</div>
                  <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                    {currentQty} <span className="text-sm font-normal">{selectedItem.unit || 'units'}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-600 dark:text-gray-400">Current Price</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                    PKR {Number(selectedItem.price || 0).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Add Quantity */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Quantity to Add <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={addQty}
                  onChange={(e) => setAddQty(e.target.value)}
                  placeholder="0"
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                  {selectedItem?.unit || 'units'}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Price per Unit <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">PKR</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={pricePerUnit}
                  onChange={(e) => setPricePerUnit(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-3 pl-12 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                />
              </div>
            </div>
          </div>

          {/* Expiry & Supplier */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Expiry Date
              </label>
              <input
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Supplier (Optional)
              </label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
              >
                <option value="">Select supplier...</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name || s.company}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Summary */}
          {selectedItem && addedQty > 0 && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Stock Update Summary</div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-900 dark:text-white">{currentQty}</span>
                <span className="text-emerald-600 font-bold">+ {addedQty}</span>
                <span className="text-gray-400">=</span>
                <span className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{newTotalQty}</span>
                <span className="text-gray-500">{selectedItem.unit || 'units'}</span>
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                Total Cost: <span className="font-semibold text-gray-900 dark:text-white">PKR {(addedQty * Number(pricePerUnit || 0)).toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedId || !addQty || Number(addQty) <= 0}
            className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-medium shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            Update Stock & Add Purchase
          </button>
        </div>
      </div>
    </div>
  )
}
