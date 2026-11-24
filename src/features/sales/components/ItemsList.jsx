import React from 'react'

export default function ItemsList({
  selectedCategory,
  itemsInCategory = [],
  onAdd, // legacy
  addToCart, // preferred
  tilesPerRow = 4,
  subcategories = [],
  onSelectSubcategory,
}) {
  const gridStyle = { gridTemplateColumns: `repeat(${tilesPerRow}, minmax(0, 1fr))` }
  const showingSubs = !selectedCategory && Array.isArray(subcategories) && subcategories.length > 0

  return (
    <div className="h-full min-h-0 border rounded-lg bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/20 dark:to-gray-900 dark:border-gray-600 p-2 overflow-y-auto shadow-sm">
      {showingSubs ? (
        <div className="grid gap-2" style={gridStyle}>
          {subcategories.map((cat, i) => {
            const name = String(cat?.name || '')
            const imageUrl = cat?.imageUrl || ''
            return (
              <div key={cat.id || cat._id || i} className="flex flex-col items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => onSelectSubcategory?.(cat)}
                  className="w-full h-[80px] sm:h-[92px] md:h-[104px] rounded-lg border-2 border-sky-200 hover:border-sky-400 hover:bg-sky-50 dark:bg-gray-800 dark:border-sky-700 dark:hover:bg-sky-900/40 shadow-sm transition-all duration-150 hover:shadow-md hover:scale-105 active:scale-95 overflow-hidden p-1"
                  title={name}
                >
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={name}
                      className="w-full h-full object-cover"
                      onError={(e) => { e.target.style.display = 'none' }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-bold text-xs sm:text-sm md:text-base leading-tight text-center break-words text-sky-900 dark:text-sky-100">
                      {name}
                    </div>
                  )}
                </button>
                {imageUrl && (
                  <span className="font-bold text-xs sm:text-sm md:text-base leading-tight break-words text-center text-sky-900 dark:text-sky-100 w-full">{name}</span>
                )}
              </div>
            )
          })}
        </div>
      ) : selectedCategory ? (
        itemsInCategory.length > 0 ? (
          <div className="grid gap-2" style={gridStyle}>
            {itemsInCategory.map(m => {
              const imageUrl = m.imageUrl || ''
              return (
                <div key={m.id} className="flex flex-col items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof addToCart === 'function') addToCart(m.id)
                      else if (typeof onAdd === 'function') onAdd(m.id)
                    }}
                    className="w-full h-[80px] sm:h-[92px] md:h-[104px] rounded-lg border-2 border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50 dark:bg-gray-800 dark:border-emerald-700 dark:hover:bg-emerald-900/40 shadow-sm transition-all duration-150 hover:shadow-md hover:scale-105 active:scale-95 overflow-hidden p-1"
                    title="Click to add to cart"
                  >
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={m.name}
                        className="w-full h-full object-cover"
                        onError={(e) => { e.target.style.display = 'none' }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-bold text-xs sm:text-sm md:text-base leading-tight text-center break-words text-emerald-900 dark:text-emerald-100">
                        {m.name}
                      </div>
                    )}
                  </button>
                  {imageUrl && (
                    <span className="font-bold text-xs sm:text-sm md:text-base leading-tight break-words text-center text-emerald-900 dark:text-emerald-100 w-full">{m.name}</span>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
            <p>No items in this category</p>
          </div>
        )
      ) : (
        <div className="h-full flex flex-col items-center justify-center text-sm text-gray-500 dark:text-gray-400">
          <p>Please select a category above</p>
        </div>
      )}
    </div>
  )
}
