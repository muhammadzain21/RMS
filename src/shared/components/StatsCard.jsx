const variants = {
  blue: {
    ring: 'ring-blue-600/30 dark:ring-blue-500/30',
    bg: 'bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/40 dark:to-gray-900',
    title: 'text-blue-800 dark:text-blue-300',
    value: 'text-blue-700 dark:text-blue-100',
    iconBg: 'bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/30 dark:shadow-blue-500/20',
  },
  green: {
    ring: 'ring-emerald-600/30 dark:ring-emerald-500/30',
    bg: 'bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-900/40 dark:to-gray-900',
    title: 'text-emerald-800 dark:text-emerald-300',
    value: 'text-emerald-700 dark:text-emerald-100',
    iconBg: 'bg-gradient-to-br from-emerald-600 to-emerald-700 text-white shadow-lg shadow-emerald-600/30 dark:shadow-emerald-500/20',
  },
  red: {
    ring: 'ring-rose-600/30 dark:ring-rose-500/30',
    bg: 'bg-gradient-to-br from-rose-100 to-rose-50 dark:from-rose-900/40 dark:to-gray-900',
    title: 'text-rose-800 dark:text-rose-300',
    value: 'text-rose-700 dark:text-rose-100',
    iconBg: 'bg-gradient-to-br from-rose-600 to-rose-700 text-white shadow-lg shadow-rose-600/30 dark:shadow-rose-500/20',
  },
  slate: {
    ring: 'ring-gray-300 dark:ring-gray-700',
    bg: 'bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800/50 dark:to-gray-900',
    title: 'text-gray-700 dark:text-gray-300',
    value: 'text-gray-800 dark:text-gray-100',
    iconBg: 'bg-gradient-to-br from-gray-600 to-gray-700 text-white shadow-lg shadow-gray-600/30 dark:shadow-gray-500/20',
  },
  orange: {
    ring: 'ring-orange-600/30 dark:ring-orange-500/30',
    bg: 'bg-gradient-to-br from-orange-100 to-orange-50 dark:from-orange-900/40 dark:to-gray-900',
    title: 'text-orange-800 dark:text-orange-300',
    value: 'text-orange-700 dark:text-orange-100',
    iconBg: 'bg-gradient-to-br from-orange-600 to-orange-700 text-white shadow-lg shadow-orange-600/30 dark:shadow-orange-500/20',
  },
}

export default function StatsCard({ title, value, sub, icon = null, variant = 'slate' }) {
  const v = variants[variant] || variants.slate
  return (
    <div className={`p-4 rounded-xl border border-transparent ring-1 ${v.ring} ${v.bg} shadow-sm`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={`text-xs font-bold uppercase tracking-wider ${v.title}`}>{title}</div>
          <div className={`text-2xl font-extrabold mt-1 ${v.value}`}>{value}</div>
          {sub && <div className="text-xs font-medium text-[var(--color-text-body)] mt-1">{sub}</div>}
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
