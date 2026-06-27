import React from 'react'

export default function CategoryBar({
  categories = [],
  selectedCategory,
  onSelectCategory,
  search,
  setSearch,
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap content-start gap-2 overflow-y-auto max-h-36 md:max-h-48 lg:max-h-44 py-2 px-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-950 shadow-sm">
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
                className={`w-[72px] h-[72px] sm:w-[84px] sm:h-[84px] md:w-[96px] md:h-[96px] rounded-lg border-2 overflow-hidden select-none transition-all duration-200 p-0 ${isActive ? 'border-blue-500 shadow-md shadow-blue-500/20 scale-105' : 'border-gray-200 dark:border-gray-600 shadow-sm hover:border-blue-300 hover:shadow-md'}`}
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
                  <div className={`w-full h-full flex items-center justify-center font-bold text-[10px] sm:text-xs uppercase leading-tight px-1 ${isActive ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-100 hover:bg-blue-50 dark:hover:bg-gray-700'}`}>
                    {name}
                  </div>
                )}
              </button>
              {imageUrl && (
                <span className="font-bold text-[10px] sm:text-[11px] uppercase leading-tight break-words text-center text-gray-700 dark:text-gray-200 w-[72px] sm:w-[84px] md:w-[96px]">{name}</span>
              )}
            </div>
          )
        })}
      </div>
      <div className="relative">
        <span className="absolute left-3 top-2.5 text-gray-400 dark:text-gray-500">🔍</span>
        <input 
          className="w-full pl-9 pr-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm text-sm" 
          placeholder="Search items..." 
          value={search} 
          onChange={e=>setSearch(e.target.value)} 
        />
      </div>
    </div>
  )
}
