const variants = {
  blue: {
    ring: 'ring-blue-500/20 dark:ring-blue-500/30',
    bg: 'bg-gradient-to-br from-blue-50 to-white dark:from-blue-900/30 dark:to-gray-900',
    title: 'text-blue-700 dark:text-blue-300',
    value: 'text-blue-600 dark:text-blue-100',
    iconBg: 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30 dark:shadow-blue-500/20',
  },
  green: {
    ring: 'ring-emerald-500/20 dark:ring-emerald-500/30',
    bg: 'bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/30 dark:to-gray-900',
    title: 'text-emerald-700 dark:text-emerald-300',
    value: 'text-emerald-600 dark:text-emerald-100',
    iconBg: 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30 dark:shadow-emerald-500/20',
  },
  red: {
    ring: 'ring-rose-500/20 dark:ring-rose-500/30',
    bg: 'bg-gradient-to-br from-rose-50 to-white dark:from-rose-900/30 dark:to-gray-900',
    title: 'text-rose-700 dark:text-rose-300',
    value: 'text-rose-600 dark:text-rose-100',
    iconBg: 'bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-lg shadow-rose-500/30 dark:shadow-rose-500/20',
  },
  slate: {
    ring: 'ring-gray-200 dark:ring-gray-700',
    bg: 'bg-gradient-to-br from-gray-50 to-white dark:from-gray-800/40 dark:to-gray-900',
    title: 'text-gray-600 dark:text-gray-300',
    value: 'text-gray-900 dark:text-gray-100',
    iconBg: 'bg-gradient-to-br from-gray-500 to-gray-600 text-white shadow-lg shadow-gray-500/30 dark:shadow-gray-500/20',
  },
  orange: {
    ring: 'ring-orange-500/20 dark:ring-orange-500/30',
    bg: 'bg-gradient-to-br from-orange-50 to-white dark:from-orange-900/30 dark:to-gray-900',
    title: 'text-orange-700 dark:text-orange-300',
    value: 'text-orange-600 dark:text-orange-100',
    iconBg: 'bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/30 dark:shadow-orange-500/20',
  },
}

export default function StatsCard({ title, value, sub, icon = null, variant = 'slate' }) {
  const v = variants[variant] || variants.slate
  return (
    <div className={`p-4 rounded-xl border border-transparent ring-1 ${v.ring} ${v.bg} shadow-sm`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={`text-xs font-medium uppercase tracking-wide ${v.title}`}>{title}</div>
          <div className={`text-2xl font-extrabold mt-1 ${v.value}`}>{value}</div>
          {sub && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{sub}</div>}
        </div>
        {icon && (
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${v.iconBg}`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}
