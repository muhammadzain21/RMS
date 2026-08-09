import React from 'react'

export default function CategoryBar({
  categories = [],
  selectedCategory,
  onSelectCategory,
  tilesPerRow = 4,
}) {
  const gridStyle = { gridTemplateColumns: `repeat(${tilesPerRow}, minmax(0, 1fr))` }
  return (
    <div className="space-y-3">
      <div className="grid gap-2 overflow-y-auto h-52 md:h-64 lg:h-72 py-2 px-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-950 shadow-sm" style={gridStyle}>
        {(categories || []).map((cat, i) => {
          const isObj = cat && typeof cat === 'object'
          const name = String(isObj ? cat.name || '' : cat)
          const imageUrl = isObj ? cat.imageUrl || '' : ''
          const isActive = String(selectedCategory || '') === name
          return (
            <div key={i} className="flex flex-col items-center gap-0.5">
              <button
                type="button"
                onClick={() => onSelectCategory(name)}
                className={`w-full h-[72px] sm:h-[84px] md:h-[96px] rounded-lg border-2 overflow-hidden select-none transition-all duration-200 p-1 ${isActive ? 'border-blue-500 shadow-md shadow-blue-500/20 scale-105' : 'border-gray-200 dark:border-gray-600 shadow-sm hover:border-blue-300 hover:shadow-md'}`}
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
                  <div className={`w-full h-full flex items-center justify-center font-bold text-xs sm:text-sm md:text-base uppercase leading-tight text-center break-words ${isActive ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-100 hover:bg-blue-50 dark:hover:bg-gray-700'}`}>
                    {name}
                  </div>
                )}
              </button>
              {imageUrl && (
                <span className="font-bold text-xs sm:text-sm md:text-base uppercase leading-tight break-words text-center text-gray-700 dark:text-gray-200 w-full">{name}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
