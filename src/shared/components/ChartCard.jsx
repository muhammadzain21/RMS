import { ResponsiveContainer } from 'recharts'

export default function ChartCard({ title, children, height = 260, variant = 'blue' }) {
  const variants = {
    blue: {
      border: 'border-blue-300 dark:border-blue-900',
      bg: 'bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/40 dark:to-gray-900',
      dot: 'bg-blue-600',
      shadow: 'shadow-blue-600/10 dark:shadow-blue-500/20',
    },
    green: {
      border: 'border-emerald-300 dark:border-emerald-900',
      bg: 'bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-900/40 dark:to-gray-900',
      dot: 'bg-emerald-600',
      shadow: 'shadow-emerald-600/10 dark:shadow-emerald-500/20',
    },
    red: {
      border: 'border-rose-300 dark:border-rose-900',
      bg: 'bg-gradient-to-br from-rose-100 to-rose-50 dark:from-rose-900/40 dark:to-gray-900',
      dot: 'bg-rose-600',
      shadow: 'shadow-rose-600/10 dark:shadow-rose-500/20',
    },
    slate: {
      border: 'border-gray-300 dark:border-gray-700',
      bg: 'bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800/50 dark:to-gray-900',
      dot: 'bg-gray-600',
      shadow: 'shadow-gray-600/10 dark:shadow-gray-500/20',
    },
    amber: {
      border: 'border-amber-300 dark:border-amber-900',
      bg: 'bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-900/40 dark:to-gray-900',
      dot: 'bg-amber-600',
      shadow: 'shadow-amber-600/10 dark:shadow-amber-500/20',
    },
    purple: {
      border: 'border-purple-300 dark:border-purple-900',
      bg: 'bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-900/40 dark:to-gray-900',
      dot: 'bg-purple-600',
      shadow: 'shadow-purple-600/10 dark:shadow-purple-500/20',
    },
    indigo: {
      border: 'border-indigo-300 dark:border-indigo-900',
      bg: 'bg-gradient-to-br from-indigo-100 to-indigo-50 dark:from-indigo-900/40 dark:to-gray-900',
      dot: 'bg-indigo-600',
      shadow: 'shadow-indigo-600/10 dark:shadow-indigo-500/20',
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
