import React from 'react'

export default function ItemsGrid({
  categories = [],
  selectedCategory,
  setSelectedCategory,
  itemsInCategory = [],
  search,
  setSearch,
  itemView = 'grid',
  gridCols = 4,
  addToCart,
}) {
  return (
    <>
      {/* Categories area */}
      <div className="flex flex-wrap content-start gap-1.5 overflow-y-auto max-h-[20vh] min-h-[120px] py-2 border rounded px-2 pr-2 bg-white dark:bg-gray-800 dark:border-gray-600">
        {(categories || []).map((cat, i) => {
          const label = String(cat)
          const isActive = String(selectedCategory || '') === label
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelectedCategory(label)}
              className={`min-w-[80px] min-h-[40px] px-2 py-1 rounded border text-center select-none ${isActive ? 'bg-blue-600 text-white border-blue-600 shadow' : 'bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600'}`}
            >
              <div className="font-bold text-[11px] sm:text-xs uppercase leading-tight break-words">{label}</div>
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div className="grid grid-cols-12 gap-2 items-center">
        <input className="col-span-12 px-3 py-1.5 text-sm border rounded bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600" placeholder="search" value={search} onChange={e=>setSearch(e.target.value)} />
      </div>

      <div className="h-[40vh] min-h-[208px] border rounded bg-white dark:bg-gray-800 dark:border-gray-600 p-2 overflow-y-auto">
        {selectedCategory ? (
          itemView === 'list' ? (
            <div className="divide-y">
              {itemsInCategory.map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => addToCart(m.id)}
                  className="w-full text-left py-2 px-2 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between"
                  title="Click to add to cart"
                >
                  <span className="text-sm font-bold text-gray-900 dark:text-gray-100 break-words">{m.name}</span>
                </button>
              ))}
              {itemsInCategory.length === 0 && (
                <div className="py-6 text-sm text-gray-500 dark:text-gray-400">No items in this category</div>
              )}
            </div>
          ) : (
            <div className={`grid gap-2 ${gridCols===3 ? 'grid-cols-3 sm:grid-cols-4' : gridCols===4 ? 'grid-cols-4 sm:grid-cols-4 lg:grid-cols-5' : 'grid-cols-4 sm:grid-cols-5 lg:grid-cols-6'}`}>
              {itemsInCategory.map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => addToCart(m.id)}
                  className="p-2 rounded border hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-600 text-center min-h-[56px] sm:min-h-[60px] flex flex-col justify-center shadow-sm"
                  title="Click to add to cart"
                >
                  <div className="font-bold text-xs sm:text-sm leading-tight break-words px-0.5">{m.name}</div>
                </button>
              ))}
              {itemsInCategory.length === 0 && (
                <div className="col-span-full text-sm text-gray-500 dark:text-gray-400">No items in this category</div>
              )}
            </div>
          )
        ) : (
          <div className="text-sm text-gray-500 dark:text-gray-400">Please select a category above.</div>
        )}
      </div>
    </>
  )
}
