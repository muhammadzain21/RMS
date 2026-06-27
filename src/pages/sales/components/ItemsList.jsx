import React from 'react'

export default function ItemsList({
  selectedCategory,
  itemsInCategory = [],
  onAdd, // legacy
  addToCart, // preferred
}) {
  return (
    <div className="h-52 md:h-64 lg:h-72 border rounded-lg bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/20 dark:to-gray-900 dark:border-gray-600 p-2 overflow-y-auto shadow-sm">
      {selectedCategory ? (
        itemsInCategory.length > 0 ? (
          <div className="grid gap-2 grid-cols-4">
            {itemsInCategory.map(m => {
              const imageUrl = m.imageUrl || ''
              return (
                <div key={m.id} className="flex flex-col items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof addToCart==='function') addToCart(m.id)
                      else if (typeof onAdd==='function') onAdd(m.id)
                    }}
                    className={`w-full rounded-lg border-2 border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50 dark:bg-gray-800 dark:border-emerald-700 dark:hover:bg-emerald-900/40 shadow-sm transition-all duration-150 hover:shadow-md hover:scale-105 active:scale-95 overflow-hidden p-0 ${imageUrl ? 'aspect-square' : 'min-h-[56px] sm:min-h-[60px]'}`}
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
                      <div className="w-full h-full flex items-center justify-center font-bold text-[10px] sm:text-xs leading-tight px-1 text-emerald-900 dark:text-emerald-100">
                        {m.name}
                      </div>
                    )}
                  </button>
                  {imageUrl && (
                    <span className="font-bold text-[10px] sm:text-[11px] leading-tight break-words text-center text-emerald-900 dark:text-emerald-100 w-full">{m.name}</span>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
            <span className="text-4xl mb-2 block text-center">📭</span>
            <p>No items in this category</p>
          </div>
        )
      ) : (
        <div className="h-full flex flex-col items-center justify-center text-sm text-gray-500 dark:text-gray-400">
          <span className="text-5xl mb-3">👆</span>
          <p>Please select a category above</p>
        </div>
      )}
    </div>
  )
}
