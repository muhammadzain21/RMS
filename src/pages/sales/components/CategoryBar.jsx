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
      <div className="flex flex-wrap content-start gap-1.5 overflow-y-auto max-h-36 md:max-h-48 lg:max-h-44 py-2 px-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-950 shadow-sm">
        {(categories || []).map((cat, i) => {
          const label = String(cat)
          const isActive = String(selectedCategory || '') === label
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelectCategory(label)}
              className={`min-w-[72px] min-h-[40px] sm:min-w-[84px] sm:min-h-[44px] md:min-w-[96px] md:min-h-[48px] px-2 py-1 rounded-lg border-2 text-center select-none transition-all duration-200 ${isActive ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white border-blue-500 shadow-md shadow-blue-500/20 scale-105' : 'bg-white dark:bg-gray-800 dark:text-gray-100 border-gray-200 dark:border-gray-600 shadow-sm hover:bg-blue-50 hover:border-blue-300 hover:shadow-md dark:hover:bg-gray-700'}`}
            >
              <div className="flex items-center justify-center gap-1">
                {isActive && <span className="text-blue-200 text-xs">✓</span>}
                <span className="font-bold text-[11px] sm:text-xs uppercase leading-tight break-words">{label}</span>
              </div>
              <div className={`${isActive ? 'text-blue-100' : 'text-gray-400 dark:text-gray-500'} text-[9px] mt-0.5`}>Category</div>
            </button>
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
