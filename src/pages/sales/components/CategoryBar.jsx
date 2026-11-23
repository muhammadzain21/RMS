import React from 'react'

export default function CategoryBar({
  categories = [],
  selectedCategory,
  onSelectCategory,
  tilesPerRow = 4,
}) {
  const gridStyle = { gridTemplateColumns: `repeat(${tilesPerRow}, minmax(0, 1fr))` }
  return (
    <div
      className="grid gap-0 content-start auto-rows-auto overflow-y-auto h-[26vh] min-h-[180px] lg:h-[28vh] lg:min-h-[200px] lg:shrink-0 p-0 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 shadow-sm"
      style={gridStyle}
    >
      {(categories || []).map((cat, i) => {
        const isObj = cat && typeof cat === 'object'
        const name = String(isObj ? cat.name || '' : cat)
        const imageUrl = isObj ? cat.imageUrl || '' : ''
        const isActive = String(selectedCategory || '') === name
        return (
          <button
            key={isObj ? (cat.id || cat._id || i) : i}
            type="button"
            onClick={() => onSelectCategory(isObj ? cat : name)}
            className={`w-full h-[56px] sm:h-[64px] md:h-[72px] -mb-px -mr-px rounded-none border overflow-hidden select-none transition-colors duration-150 p-0.5 flex flex-col ${isActive ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 z-[1]' : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 hover:bg-blue-50/60 dark:hover:bg-gray-800'}`}
            title={name}
          >
            {imageUrl ? (
              <>
                <img
                  src={imageUrl}
                  alt={name}
                  className="w-full flex-1 min-h-0 object-cover"
                  onError={(e) => { e.target.style.display = 'none' }}
                />
                <span className="font-bold text-[10px] sm:text-xs uppercase leading-tight break-words text-center text-gray-700 dark:text-gray-200 w-full shrink-0 px-0.5 py-0.5 truncate">
                  {name}
                </span>
              </>
            ) : (
              <div className={`w-full h-full flex items-center justify-center font-bold text-xs sm:text-sm uppercase leading-tight text-center break-words px-1 ${isActive ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-100'}`}>
                {name}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}
