import { ResponsiveContainer } from 'recharts'

export default function ChartCard({ title, children, height = 260, variant = 'blue' }) {
  const variants = {
    blue: {
      border: 'border-blue-200 dark:border-blue-900',
      bg: 'bg-gradient-to-br from-blue-50 to-white dark:from-blue-900/30 dark:to-gray-900',
      dot: 'bg-blue-500',
      shadow: 'shadow-blue-500/10 dark:shadow-blue-500/20',
    },
    green: {
      border: 'border-emerald-200 dark:border-emerald-900',
      bg: 'bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/30 dark:to-gray-900',
      dot: 'bg-emerald-500',
      shadow: 'shadow-emerald-500/10 dark:shadow-emerald-500/20',
    },
    red: {
      border: 'border-rose-200 dark:border-rose-900',
      bg: 'bg-gradient-to-br from-rose-50 to-white dark:from-rose-900/30 dark:to-gray-900',
      dot: 'bg-rose-500',
      shadow: 'shadow-rose-500/10 dark:shadow-rose-500/20',
    },
    slate: {
      border: 'border-gray-200 dark:border-gray-700',
      bg: 'bg-gradient-to-br from-gray-50 to-white dark:from-gray-800/40 dark:to-gray-900',
      dot: 'bg-gray-500',
      shadow: 'shadow-gray-500/10 dark:shadow-gray-500/20',
    },
  }
  const v = variants[variant] || variants.blue
  return (
    <div className={`p-4 rounded-xl border ${v.border} ${v.bg} shadow-sm ${v.shadow}`}>
      <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${v.dot}`}></span>
        {title}
      </div>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  )
}
